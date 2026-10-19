// Optional features (annex rent, the home you live in today, zakat on cash, liquidity) and the one-strategy what-ifs
// (stress, break-evens, ready villa, loan worth). Synthetic figures only.
const test = require('node:test'), assert = require('node:assert');
const { loadEngine, scenarios, FAMILY } = require('./helpers');
const E = loadEngine();
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const key = (m) => m.results.map((r) => r && [r.feasible, r.recoveryOk, Math.round(r.econAdv), Math.round(r.netWorthEnd), Math.round(r.minCash)].join('|')).join(' / ');

test('the new settings change nothing while they are off', () => {
  const off = { partRentAnnual: 0, ownHomePlan: 'keep', ownHomeYield: 5, ownHomeSellCostPct: 4, cashZakatPct: 0 };
  for (const { label, inp } of scenarios(E, 40)) {
    assert.strictEqual(key(E.computeRE({ ...inp, ...off })), key(E.computeRE(inp)), label);
    // the current-home options only apply when you live in a home you own (no rent today)
    if (inp.rentNow > 0) assert.strictEqual(key(E.computeRE({ ...inp, ownHomePlan: 'sell' })), key(E.computeRE(inp)), label + ' renting');
  }
});

test('annex rent: received from the month after move-in, growing with rent growth, and added at face value to net worth', () => {
  const base = { ...FAMILY, rentGrowth: 3, horizon: 15 };
  const a = E.computeRE(base), b = E.computeRE({ ...base, partRentAnnual: 60000 });
  b.results.forEach((r, i) => {
    if (!r) return;
    const exp = r.months.filter((m) => m.t > r.occupy).reduce((s, m) => s + 60000 / 12 * Math.pow(1.03, Math.floor((m.t - r.occupy - 1) / 12)), 0);
    assert.ok(near(r.partRentTotal, exp), `S${i + 1} rent ${r.partRentTotal} vs ${exp}`);
    if (r.plan.prepayAfter == null) assert.ok(near(r.netWorthEnd - a.results[i].netWorthEnd, exp), `S${i + 1} rule-7 gain`);
    assert.ok(r.econAdv > a.results[i].econAdv, `S${i + 1} everything grows rises`);
  });
  // not when the whole new home is let
  assert.strictEqual(key(E.computeRE({ ...base, rentOutPct: 5, partRentAnnual: 60000 })), key(E.computeRE({ ...base, rentOutPct: 5 })));
});

test('the home you live in today: let from move-in, or sold at move-in (mortgage on it repaid; its value leaves both measures)', () => {
  const base = { ...FAMILY, appreciation: 3, horizon: 15 };
  const keep = E.computeRE(base), let_ = E.computeRE({ ...base, ownHomePlan: 'let', ownHomeYield: 3.5 });
  let_.results.forEach((r, i) => {
    if (!r) return;
    const exp = r.months.filter((m) => m.t > r.occupy).reduce((s, m) => s + 3500000 * Math.pow(1.03, m.t / 12) * 0.035 / 12, 0);
    assert.ok(near(r.ownRentTotal, exp), `S${i + 1} own rent`);
    if (r.plan.prepayAfter == null) assert.ok(near(r.netWorthEnd - keep.results[i].netWorthEnd, exp), `S${i + 1} rule-7 gain from letting`);
  });
  // sell, with a mortgage taken on that home at build start
  const plans = [{ ...E.RE_PLAN_DEFAULTS, enabled: true, name: 'eq', eqWhen: 'build' }, { ...E.RE_PLAN_DEFAULTS, enabled: true, name: 'eq late', eqWhen: 'completion' }, { enabled: false }, { enabled: false }];
  const sell = E.computeRE({ ...base, plans, ownHomePlan: 'sell', ownHomeSellCostPct: 2.5 });
  const r = sell.results[0], occ = r.occupy, H = r.months.length - 1, v = 3500000 * Math.pow(1.03, occ / 12);
  assert.ok(r.ownSale && r.ownSale.t === occ && near(r.ownSale.value, v));
  assert.ok(near(r.ownSale.net, v * 0.975 - r.ownSale.payoff));
  assert.ok(r.eq.amount > 0 && r.ownSale.payoff > r.eq.amount * 0.5, 'the mortgage on it was repaid from the sale');
  assert.ok(r.months.filter((m) => m.t > occ).every((m) => m.eqPay === 0 && m.debtEq === 0));
  const end = r.months[H];
  assert.ok(near(end.ownGone, 3500000 * Math.pow(1.03, H / 12)));
  assert.ok(near(end.econNW, end.cash + end.value - end.debt - end.ownGone));
  assert.strictEqual(sell.results[1].eq.amount, 0, 'no mortgage on a home already sold');
});

test('zakat on invested cash lowers the growth rate on both sides', () => {
  const a = E.computeRE(FAMILY), b = E.computeRE({ ...FAMILY, cashZakatPct: 2.5 });
  const r = b.results.find(Boolean);
  assert.ok(near(r.netReturn, (1.06 * 0.975 - 1) * 100, 1e-9));
  assert.ok(r.months[r.months.length - 1].rCash < a.results.find(Boolean).months[r.months.length - 1].rCash);
});

test('liquidity: months of reserve at the low point and thin-surplus months', () => {
  for (const { label, inp } of scenarios(E, 30)) {
    const m = E.computeRE(inp);
    m.results.forEach((r) => {
      if (!r) return;
      const lm = r.months[Math.max(1, Math.min(r.months.length - 1, r.minCashT))];
      const out = lm.liv + lm.rentPaid + lm.existInst + lm.lmPay + lm.eqPay + lm.plPay + lm.coPay + lm.rfPay - lm.extraPay + lm.ownerCost;
      if (out > 0) assert.ok(near(r.reserveMonths, Math.max(0, r.minCash) / out, 1e-9), label);
      assert.ok(r.thinMonths >= 0 && r.thinMonths <= r.months.length - 1, label);
    });
  }
});

test('stress tests, break-evens, ready villa and loan worth agree with direct reruns', () => {
  const inp = { ...FAMILY, horizon: 15 };
  const m = E.computeRE(inp), idx = m.results.findIndex(Boolean), r = m.results[idx];
  const st = E.stressRE(inp, idx);
  assert.ok(near(st[0].econAdv, r.econAdv, 1e-6), 'base row = the strategy as entered');
  const ov = st.find((x) => x.key === 'overrun'), direct = E.reRunOne({ ...E.mergeRE(inp), overrunPct: 20 }, idx).r;
  assert.ok(near(ov.econAdv, direct.econAdv, 1e-6) && ov.passes === direct.feasible);
  const be = E.breakEvenRE(inp, idx);
  for (const d of be) for (const [k, metric] of [['econ', 'econAdv'], ['rule7', 'advantage']]) {
    if (d[k] == null) continue;
    const set = { rent: 'partRentAnnual', appreciation: 'appreciation', return: 'altReturn', uplift: 'devMarginPct' }[d.key];
    const at = E.reRunOne({ ...E.mergeRE(inp), [set]: d[k] }, idx).r[metric];
    assert.ok(Math.abs(at) < 2000, `${d.key} ${k}: ${at} at ${d[k]}`);
  }
  const rb = E.readyBreakEvenRE(inp, idx);
  if (rb.price != null) assert.ok(Math.abs(rb.atPrice.econAdv - rb.build.econAdv) < rb.value * 1e-4, 'the villa at that price does as well as building');
  for (const w of E.loanWorthRE(inp, idx)) {
    const off = { lm: { lmUse: false }, eq: { eqWhen: 'none' }, pl: { plWhen: 'none' }, pl2: { pl2Use: false }, co: { coUse: false } }[w.key];
    const p = E.mergeRE(inp), wo = E.reRunOne({ ...p, plans: p.plans.map((o, j) => j === idx ? { ...o, ...off } : o) }, idx).r;
    assert.ok(near(w.gain, r.econAdv - wo.econAdv, 1e-6) && near(w.perMillionPV, (r.econPV - wo.econPV) / w.amount * 1e6, 1e-6));
  }
});

test('an existing loan quoted flat is the same loan at its APR (term = months paid + months left)', () => {
  const flat = { id: 7, name: 'Flat loan', balance: 300000, installment: 6200, monthsLeft: 48, ageMonths: 12, rate: 3.5, rateType: 'flat' };
  const apr = { ...flat, rateType: undefined, rate: E.reFlatToApr(3.5, 60) };
  const a = E.computeRE({ ...FAMILY, existingLoans: [flat] }), b = E.computeRE({ ...FAMILY, existingLoans: [apr] });
  assert.strictEqual(key(a), key(b));
  const once = E.mergeRE({ existingLoans: [flat] }), twice = E.mergeRE(once);
  assert.strictEqual(twice.existingLoans[0].rate, once.existingLoans[0].rate, 'merging again does not convert twice');
});

test('extra plans (the tool\'s pick) run after yours, are marked, and compete in the ranking', () => {
  const inp = { ...FAMILY, horizon: 15 };
  const a = E.computeRE(inp);
  const pick = { ...E.RE_PLAN_DEFAULTS, name: 'tool', plWhen: 'build', pl2Use: true, eqWhen: 'build' };
  const b = E.computeRE(inp, { extraPlans: [pick] });
  assert.strictEqual(b.results.length, a.results.length + 1);
  const t = b.results[b.results.length - 1];
  assert.ok(t.tool && !a.results.some((r) => r && r.tool));
  a.results.forEach((r, i) => { if (r) assert.strictEqual(Math.round(b.results[i].econAdv), Math.round(r.econAdv)); });
  const ranked = b.results.filter(Boolean).sort((x, y) => (y.feasible && y.recoveryOk) - (x.feasible && x.recoveryOk) || y.feasible - x.feasible || y.econAdv - x.econAdv)[0];
  assert.strictEqual(b.bestFeasible === ranked || !ranked.feasible, true);
  assert.strictEqual(key(E.computeRE(inp, {})), key(a), 'no extra plans: unchanged');
});

test('a personal-loan step keeps the options it weighed, and the chosen one is the loan taken', () => {
  let checked = 0;
  for (const { label, inp } of scenarios(E, 60)) {
    const m = E.computeRE(inp);
    m.results.forEach((r, i) => {
      if (!r) return;
      for (const f of [r.pl, r.pl2]) {
        if (!f.refiOptions || !f.refiOptions.length) continue;
        const ch = f.refiOptions.filter((o) => o.chosen);
        if (f.amount > 0) {
          assert.strictEqual(ch.length, 1, `${label} S${i + 1} ${f.key}: one chosen option`);
          assert.ok(Math.abs(ch[0].amount - f.amount) < 1e-6, `${label} S${i + 1} ${f.key}: amount`);
          assert.ok(Math.abs(ch[0].payoff - (f.refi ? f.refi.payoff : 0)) < 1e-6, `${label} S${i + 1} ${f.key}: cleared`);
          assert.deepStrictEqual(ch[0].names.join('|'), f.refi ? f.refi.names.join('|') : '', `${label} S${i + 1} ${f.key}: which loans`);
          checked++;
        }
        assert.ok(['value', 'cash', 'pick'].includes(f.refiBasis));
      }
    });
  }
  assert.ok(checked > 10, `exercised ${checked} personal-loan steps`);
});

test('cash at move-in: the rule-6 figure, tested against your line', () => {
  let below = 0;
  for (const { label, inp } of scenarios(E, 40)) {
    const m = E.computeRE(inp), p = E.mergeRE(inp);
    m.results.forEach((r, i) => {
      if (!r) return;
      const occ = Math.min(r.months.length - 1, r.occupy);
      assert.ok(near(r.onHandAtMoveIn, E.fundingBridgeRows(r, occ, p, m.prj).total), `${label} S${i + 1}: the "cash at move-in" figure`);
      assert.strictEqual(r.moveInOk, r.onHandAtMoveIn >= (p.minCashMoveIn || 0) - 0.5, `${label} S${i + 1}`);
      if (!r.moveInOk) below++;
    });
  }
  assert.ok(below > 0, 'some plans fall below the line');
});

test('the recommendation meets the most of your rules (recovery, cash at move-in); with the line off, the earlier choice returns', () => {
  const met = (r) => (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0);
  let bites = 0;
  for (const { label, inp } of scenarios(E, 60)) {
    const m = E.computeRE(inp), live = m.results.filter(Boolean), b = m.bestFeasible;
    if (!b) { assert.ok(!live.some((r) => r.feasible), label); continue; }
    for (const r of live.filter((x) => x.feasible)) assert.ok(met(r) < met(b) || (met(r) === met(b) && r.econAdv <= b.econAdv), `${label}: ${r.plan.name} outranks the recommendation`);
    // the line far below anything: the earlier rule (recovers in time first, then the best result)
    const off = E.computeRE({ ...inp, minCashMoveIn: -1e12 }), old = off.results.filter(Boolean), by = (a, c) => c.econAdv - a.econAdv;
    const exp = old.filter((r) => r.feasible && r.recoveryOk).sort(by)[0] || old.filter((r) => r.feasible).sort(by)[0] || null;
    assert.strictEqual(off.bestFeasible, exp, label + ': line off');
    if (m.results.indexOf(b) !== off.results.indexOf(off.bestFeasible)) bites++;
  }
  assert.ok(bites > 0, 'the rule changes some recommendations');
});

test('Auto refinance falls back to the most cash only when that meets more of your rules', () => {
  const score = (x) => (x.feasible ? 1 : 0) + (x.feasible && x.recoveryOk ? 1 : 0) + (x.feasible && x.moveInOk ? 1 : 0);
  let byMoveIn = 0;
  for (const { label, inp } of scenarios(E, 120)) {
    E.computeRE(inp).results.forEach((r, i) => {
      if (!r || !r.refiFallback) return;
      const w = r.refiFallbackWhy;
      assert.ok(score(r) > score(w), `${label} S${i + 1}`);
      if (w.feasible && w.recoveryOk && !w.moveInOk) { byMoveIn++; assert.ok(r.moveInOk, `${label} S${i + 1}: the fallback meets the line`); }
    });
  }
  assert.ok(byMoveIn > 0, 'some fallbacks are for the move-in line');
});

test("the tool's pick meets your rules whenever some mix does", () => {
  for (const { label, inp } of scenarios(E, 10)) {
    const st = E.optimizeRE(inp, { plannedOnly: true }).planned, b = st.best;
    if (st.nOk > 0) assert.ok(b.ok && b.feasible && b.recoveryOk && b.moveInOk, label);
    assert.strictEqual(b.ok, b.feasible && b.recoveryOk && b.moveInOk, label);
    if (b.moveInOk) assert.ok(b.onHand >= (E.mergeRE(inp).minCashMoveIn || 0) - 0.5, label);
  }
});
