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

test('cash at move-in: left from your cash and the loans + saved from your salary, no growth — tested against your line', () => {
  let below = 0;
  for (const { label, inp } of scenarios(E, 40)) {
    const q = { ...inp, minCashMoveIn: 500000 }, m = E.computeRE(q), p = E.mergeRE(q);
    m.results.forEach((r, i) => {
      if (!r) return;
      const occ = Math.min(r.months.length - 1, r.occupy), rc = E.cashReconcile(r, occ, p, m.prj), at = `${label} S${i + 1}`;
      assert.ok(near(r.loansLeftAtMoveIn, E.fundingBridgeRows(r, occ, p, m.prj).total), `${at}: left from your cash and the loans`);
      assert.ok(near(r.salaryToMoveIn, rc.salary), `${at}: saved from your salary`);
      assert.ok(near(rc.salaryRows.reduce((a, x) => a + x.v, 0), rc.salary), `${at}: the salary lines add up`);
      assert.ok(near(r.onHandAtMoveIn, r.loansLeftAtMoveIn + r.salaryToMoveIn) && near(r.onHandAtMoveIn, rc.total), `${at}: the two parts`);
      const growth = r.months.filter((x) => x.t <= occ).reduce((a, x) => a + x.ret, 0);
      assert.ok(near(r.onHandAtMoveIn, r.months[occ].cash - growth), `${at}: the bank balance less the return earned on it`);
      assert.strictEqual(r.moveInOk, r.onHandAtMoveIn >= 500000 - 0.5, `${at}: the line`);
      if (!r.moveInOk) below++;
    });
  }
  assert.ok(below > 0, 'some plans fall below the line');
});

test('the recommendation meets the most of your rules (recovery, cash at move-in); with the line off, the earlier choice returns', () => {
  const met = (r) => (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0);
  // works every month (2) before works with bridge money (1) before runs out (0)
  const st = (r) => r.feasible ? 2 : r.bridged ? 1 : 0;
  let bites = 0;
  for (const { label, inp } of scenarios(E, 120)) {
    const q = { ...inp, minCashMoveIn: 2000000 }, m = E.computeRE(q), live = m.results.filter(Boolean), b = m.bestFeasible;
    if (!b) { assert.ok(!live.some((r) => st(r) > 0), label); continue; }
    for (const r of live.filter((x) => st(x) > 0)) assert.ok(st(r) < st(b) || (st(r) === st(b) && (met(r) < met(b) || (met(r) === met(b) && r.econAdv <= b.econAdv))), `${label}: ${r.plan.name} outranks the recommendation`);
    // the line far below anything: the earlier rule (recovers in time first, then the best result)
    const off = E.computeRE({ ...inp, minCashMoveIn: -1e12 }), old = off.results.filter(Boolean), by = (a, c) => c.econAdv - a.econAdv;
    const top = Math.max(0, ...old.map(st)), tier = top > 0 ? old.filter((r) => st(r) === top) : [];
    const exp = tier.filter((r) => r.recoveryOk).sort(by)[0] || tier.sort(by)[0] || null;
    assert.strictEqual(off.bestFeasible, exp, label + ': line off');
    if (m.results.indexOf(b) !== off.results.indexOf(off.bestFeasible)) bites++;
  }
  assert.ok(bites > 0, 'the rule changes some recommendations');
});

test('Auto refinance falls back to the most cash only when that meets more of your rules', () => {
  const st = (x) => x.feasible ? 2 : x.bridged ? 1 : 0, score = (x) => st(x) * 3 + (st(x) > 0 ? (x.recoveryOk ? 1 : 0) + (x.moveInOk ? 1 : 0) : 0);
  let byMoveIn = 0;
  for (const { label, inp } of scenarios(E, 150)) {
    E.computeRE({ ...inp, minCashMoveIn: 2000000 }).results.forEach((r, i) => {
      if (!r || !r.refiFallback) return;
      const w = r.refiFallbackWhy;
      assert.ok(score(r) > score(w), `${label} S${i + 1}`);
      // the note sits in the month the personal loans are taken (when the old loans are bought out), just before that step
      r.events.filter((e) => e.kind === 'rf').forEach((e) => { const k = r.events.indexOf(e), next = r.events.slice(k + 1).find((x) => x.t === e.t && x.kind === 'pl'); assert.ok([r.pl, r.pl2].some((f) => f && f.startedAt === e.t) && next, `${label} S${i + 1}: refinance note in month ${e.t}`); });
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

test("paying a loan off early: each loan's schedule is the engine's, and so is the payoff it books", () => {
  const debtKey = { lm: 'debtLm', eq: 'debtEq', co: 'debtCo' };
  // a loan's balance at the end of month t, as the engine shows it (taken in its start month, gone once paid off or bought out)
  const balAt = (f, s, t) => { if (!f || !(f.amount > 0) || f.startedAt == null || t < f.startedAt) return 0; if (f.prepaidAt != null && t >= f.prepaidAt) return 0; if (t === f.startedAt) return f.amount; const x = s.find((y) => y.t === t); return x ? x.bal : 0; };
  let months = 0, prepays = 0, rows = 0;
  const kinds = {};
  for (const { label, inp } of scenarios(E, 50)) {
    // "pay the mortgages off early" in every other plan, so the engine books some payoffs
    const q = { ...inp, cashBuffer: 0, plans: E.mergeRE(inp).plans.map((o, k) => k % 2 ? { ...o, prepayAfter: 12 } : o) }, m = E.computeRE(q), p = E.mergeRE(q);
    m.results.forEach((r, i) => {
      if (!r) return;
      const H = r.months.length - 1, at = `${label} S${i + 1}`, sch = {};
      ['lm', 'eq', 'co', 'pl', 'pl2'].forEach((k) => { sch[k] = E.reLoanSchedule(r[k], r.plan.extraMo, false); });
      for (let t = 0; t <= H; t++) {
        for (const k of ['lm', 'eq', 'co']) assert.ok(near(balAt(r[k], sch[k], t), r.months[t][debtKey[k]], 0.01), `${at} ${k} month ${t}`);
        assert.ok(near(balAt(r.pl, sch.pl, t) + balAt(r.pl2, sch.pl2, t), r.months[t].debtPl, 0.01), `${at} personal loans month ${t}`);
        months++;
      }
      for (const k of ['lm', 'eq', 'co', 'pl', 'pl2']) {
        const pr = E.rePayoffRows(r[k], r.plan.extraMo, p.settleFeeMonths);
        if (!pr) continue;
        pr.rows.forEach((x) => { assert.ok(x.fee >= -1e-6 && near(x.total, x.bal + x.fee, 1e-6), `${at} ${k} row`); rows++; });
        assert.strictEqual(pr.rows[pr.rows.length - 1].bal, 0, `${at} ${k}: the last row is paid off`);
        (r.prepaid || []).filter((x) => x.key === k).forEach((x) => { const a = pr.at(x.t); assert.ok(a && near(a.total, x.cost, 0.01), `${at} ${k}: the engine's payoff ${x.cost} vs ${a && a.total}`); prepays++; });
        // the plan's own payoff, whatever ended the loan early, costs what the engine booked
        const e = pr.early;
        if (!e) { assert.ok(r[k].settledAt == null, `${at} ${k}: ended early without an early payoff`); continue; }
        const booked = e.kind === "prepaid" ? r.prepaid.find((x) => x.key === k && x.t === e.t).cost
          : e.kind === "refinanced" ? [r.pl, r.pl2].map((g) => g.refi && g.refi.items.find((x) => x.id === k && !x.old)).find(Boolean).cost
          : e.kind === "sold" ? r.ownSale.payoff
          : r.payoffs.find((x) => x.t === e.t && !x.old && x.name === r[k].label).cost;
        assert.ok(e.row && near(e.row.total, booked, 0.01), `${at} ${k} ${e.kind}: booked ${booked} vs ${e.row && e.row.total}`);
        kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      }
    });
  }
  assert.ok(months > 0 && rows > 0 && prepays > 0 && kinds.prepaid > 0, `checked ${months} months, ${rows} rows, ${prepays} early payoffs`);
  assert.ok(kinds.refinanced > 0 || kinds.settled > 0, `bought out or settled: ${JSON.stringify(kinds)}`);
  // selling the home you live in repays the mortgage taken on it, before that month's instalment
  const r = E.computeRE({ rentNow: 0, ownedValue: 2500000, ownHomePlan: 'sell', plans: [{ eqWhen: 'start', lmUse: true }] }).results[0];
  const e = E.rePayoffRows(r.eq, r.plan.extraMo, E.RE_BASE.settleFeeMonths).early;
  assert.ok(e && e.kind === 'sold' && e.t === r.ownSale.t && near(e.row.total, r.ownSale.payoff, 0.01), `sold: ${e && e.row.total} vs ${r.ownSale && r.ownSale.payoff}`);
});

test("a cash gap that one of the plan's loans closes: covered by taking that loan when the cash runs short, else bridge money (counted), else it runs out", () => {
  const n = { same: 0, covered: 0, split: 0, bridged: 0, runsOut: 0 };
  for (const { label, inp } of scenarios(E, 80)) {
    const m = E.computeRE(inp), p = E.mergeRE(inp), prj = E.reProject(p);
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`;
      // the plan as you set it, run straight through (with the refinance choice the result used)
      const d = E.rePlanSimulate(p, prj, r.refiFallback ? { ...r.plan, refiMode: 'cash' } : r.plan);
      const gaps = E.reGaps(d.months, d.facilities, d.ownSale);
      if (d.feasible || gaps.some((g) => !g.closedBy.length)) {
        // works as set, or a gap no loan closes: exactly the straight run
        assert.ok(!r.covered && !r.bridged && r.feasible === d.feasible && r.econAdv === d.econAdv && r.minCash === d.minCash, `${at}: unchanged`);
        if (d.feasible) n.same++; else n.runsOut++;
        return;
      }
      if (r.covered && r.covered.split) {
        // the personal-loan step was taken in two parts: one loan in the month the gap began, the rest later but by its
        // planned month; the plan then works every month, or needs less bridge money than with the step taken whole
        const c = r.covered, g = gaps.find((x) => x.from === c.at);
        assert.ok(g && g.closedBy.includes(c.key) && d[c.key].startedAt === g.to && c.plannedAt === g.to, `${at}: split gap`);
        assert.ok(r.pl.startedAt === c.at && r.pl.part === 1 && !r.pl.split && r.pl2.part === 2 && r.pl2.startedAt > c.at && r.pl2.startedAt <= c.plannedAt, `${at}: split parts`);
        const whole = E.rePlanSimulate(p, prj, { ...(r.refiFallback ? { ...r.plan, refiMode: 'cash' } : r.plan), _bridge: true });
        assert.ok(r.feasible || (r.bridged && c.partial && (!whole.bridged || r.bridgePeak < whole.bridgePeak)), `${at}: works, or less bridge money`);
        assert.ok(r.notes.length && r.events.some((e) => e.kind === 'cover' && e.t === c.at), `${at}: noted`);
        n.split++;
        if (r.feasible) return;
      }
      if (r.covered && !r.covered.split) {
        // the loan that closed a gap is taken in the month that gap began, and the plan then works every month
        const c = r.covered, g = gaps.find((x) => x.from === c.at);
        assert.ok(r.feasible && g && g.closedBy.includes(c.key) && d[c.key].startedAt === g.to && r[c.key].startedAt === c.at, `${at}: covered`);
        assert.ok(r.notes.length && r.events.some((e) => e.kind === 'cover' && e.t === c.at), `${at}: noted`);
        n.covered++;
        return;
      }
      if (r.bridged) {
        // no loan could cover it in time: the gaps are still closed by the plan's loans, and the short balance costs the bridge rate
        assert.ok(!r.feasible && E.reGaps(r.months, r.facilities, r.ownSale).every((g) => g.closedBy.length), `${at}: bridged gaps`);
        let prev = null, cost = 0;
        r.months.forEach((mo) => { const want = prev != null && prev < -0.5 ? -prev * r.bridgeRate / 1200 : 0; assert.ok(near(mo.bridgeInt, want, 1e-6), `${at} M${mo.t}: bridge profit`); cost += mo.bridgeInt; prev = mo.avail; });
        assert.ok(near(cost, r.bridgeCost, 1e-6) && r.bridgeCost > 0 && /^Needs bridge money/.test(r.flags[0]), `${at}: bridge cost and flag`);
        n.bridged++;
        return;
      }
      // a gap a loan closes, but neither covered nor bridged: the bridge rerun no longer closes it
      assert.ok(!r.feasible && r.econAdv === d.econAdv, `${at}: runs out`);
      n.runsOut++;
    });
    // a plan that needs bridge money is recommended only when no plan works every month
    if (m.bestFeasible && m.bestFeasible.bridged && !m.bestFeasible.feasible) assert.ok(!m.results.some((r) => r && r.feasible), `${label}: bridged recommendation`);
  }
  assert.ok(n.same > 0 && n.covered > 0 && n.bridged > 0 && n.runsOut > 0, JSON.stringify(n));
});

test('a personal-loan step the bank cannot lend whole when the cash runs short is taken in two parts', () => {
  // synthetic: land mortgage, personal loans planned for move-in only, one old personal loan the bank may buy out
  const inp = { mode: 'home', acquire: 'build', income: 100000, livingExpenses: 35000, rentNow: 0, cashAvailable: 2300000, landArea: 900, landPrice: 3000, buildCost: 2500, builtPct: 60, floors: 2,
    landMonth: 6, buildStart: 9, buildMonths: 18, dbrCap: 65, perLoanCap: 33, mortgageCap: 55, plCap: 2000000, plRate: 4.25, plTenure: 5, rateQuote: 'flat', cashBuffer: 0, horizon: 15,
    existingLoans: [{ id: 1, name: 'Loan A', balance: 900000, installment: 25000, monthsLeft: 40, rate: 3, canRefi: true, ageMonths: 24 }],
    plans: [{ lmUse: true, plWhen: 'none', pl2Use: true, plSplit: true, settlePolicy: 'none', refiMode: 'cash', enabled: true }] };
  const m = E.computeRE(inp, { noNeed: true }), r = m.results[0], p = E.mergeRE(inp), prj = E.reProject(p), c = r.covered;
  // as set, the cash runs short before the move-in loans; taken whole in that month they would not be enough
  const d = E.rePlanSimulate(p, prj, p.plans[0]), g = E.reGaps(d.months, d.facilities, d.ownSale)[0];
  assert.ok(!d.feasible && g.closedBy.includes('pl2') && !E.rePlanSimulate(p, prj, { ...p.plans[0], _at: { pl2: g.from } }).feasible);
  // carried out: one loan when the cash runs short, the rest later — each the bank's maximum then — and it works every month
  assert.ok(r.feasible && c && c.split && c.key === 'pl2' && c.at === g.from && c.plannedAt === r.occupy, JSON.stringify(c));
  assert.ok(r.pl.startedAt === g.from && !r.pl.split && r.pl2.startedAt > g.from && r.pl2.startedAt <= r.occupy && r.pl.takenEarly === r.occupy);
  assert.strictEqual(r.plan, m.p.plans[0]);   // your plan is unchanged; only the way it is carried out differs
  assert.ok(near(c.amount, r.pl.amount + r.pl2.amount, 1e-6) && c.parts.length === 2);
  assert.ok(/two parts/.test(r.notes[0]) && r.events.filter((e) => e.kind === 'cover').length >= 1 && /first part/.test(r.pl.label) && /second part/.test(r.pl2.label));
  assert.ok(E.planTitle(r.plan, true, r).includes('in two parts') && E.planSteps(r, true).some((x) => /first part/.test(x.label)));
  // not when the step may be one loan only
  const one = E.computeRE({ ...inp, plans: [{ ...inp.plans[0], plSplit: false }] }, { noNeed: true }).results[0];
  assert.ok(!(one.covered && one.covered.split));
});

test('cash is the money you can spend: no return on cash counted, never shown below zero as cash', () => {
  let works = 0, runsOut = 0;
  for (const { label, inp } of scenarios(E, 60)) {
    const m = E.computeRE(inp), p = E.mergeRE(inp), prj = E.reProject(p);
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`;
      // the cash you can spend = household cash less every return earned so far; the lowest of it decides whether a plan works
      let ret = 0, low = Infinity;
      r.months.forEach((mo) => { ret += mo.ret; assert.ok(near(mo.avail, mo.cash - ret, 1e-6), `${at} M${mo.t}: spendable cash`); low = Math.min(low, mo.avail); });
      assert.ok(near(r.minCash, low, 1e-6), `${at}: lowest cash`);
      assert.strictEqual(r.feasible, low >= -0.5 || r.shortfall <= 0, `${at}: works every month = never short`);
      const occ = Math.min(r.months.length - 1, r.occupy);
      if (r.feasible) { assert.ok(r.onHandAtMoveIn >= -0.5, `${at}: a plan that works never moves in short`); works++; }
      // money in + what the salary saved + money out = cash at move-in; money in is never negative, money out never positive
      const mp = E.reMoveInParts(r, occ, p, prj);
      assert.ok(mp.moneyIn >= 0 && mp.moneyOut <= 0 && near(mp.total, r.onHandAtMoveIn, 0.01), `${at}: move-in parts`);
      // a plan that runs out says so where it starts, with the most you would be short
      if (!r.feasible && !r.bridged) {
        assert.ok(/^Your cash runs out in month/.test(r.flags[0]) && r.flags[0].includes(`you would be ${E.fS(r.shortfall)} short`) && r.events.some((e) => e.kind === 'short' && e.t === r.shortFrom), `${at}: runs out`);
        runsOut++;
      }
    });
  }
  assert.ok(works > 0 && runsOut > 0, `${works} work, ${runsOut} run out`);
  // the formatter never shows cash below zero
  assert.strictEqual(E.fCash(-1250000), 'short 1.25M');
  assert.strictEqual(E.fCash(480000), E.fS(480000));
});

test('a plan that runs out says how much more cash it needs: the least extra cash with which it works (or works with bridge money)', () => {
  const n = { found: 0, belowPeak: 0, bridge: 0 };
  for (const { label, inp } of scenarios(E, 40)) {
    const m = E.computeRE(inp), m0 = E.computeRE(inp, { noNeed: true }), p = E.mergeRE(inp), prj = E.reProject(p);
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`, r0 = m0.results[i];
      // the search only adds information: every figure of the plan is the one without it
      assert.ok(r.econAdv === r0.econAdv && r.minCash === r0.minCash && r.onHandAtMoveIn === r0.onHandAtMoveIn, `${at}: unchanged`);
      if (E.reStanding(r) > 0) { assert.strictEqual(r.needMore, undefined, `${at}: a plan that works needs nothing more`); return; }
      assert.ok(r0.needMore === undefined && !/you need/.test(r0.flags[0]), `${at}: off = not worked out`);
      if (r.needMore == null) return;
      const run = (x) => E.reRunPlan({ ...p, cashAvailable: p.cashAvailable + x }, prj, r.plan);
      // with that much more cash to start with the plan works every month; with clearly less it does not
      assert.strictEqual(E.reStanding(run(r.needMore)), 2, `${at}: works with ${r.needMore} more`);
      const tol = Math.max(1000, r.needMore * 0.0025);
      if (r.needMore > tol + 1) assert.ok(E.reStanding(run(r.needMore - tol - 1)) < 2, `${at}: the least`);
      // the runs-out flag and row say it
      assert.ok(r.flags[0].includes(`you need ${E.fS(r.needMore)} more cash to start with`) && r.events.some((e) => e.kind === 'short' && e.text.includes(`you need ${E.fS(r.needMore)} more`)), `${at}: texts`);
      if (r.needMoreBridge != null) { const b = run(r.needMoreBridge); assert.ok(r.needMoreBridge < r.needMore && b.bridged && !b.feasible && r.needMoreBridgePeak === b.bridgePeak, `${at}: works with bridge money`); n.bridge++; }
      if (r.needMore < r.shortfall - 1000) n.belowPeak++;
      n.found++;
    });
  }
  // a loan of the plan taken early can carry part of the shortfall, so the need is often below the most you are short
  assert.ok(n.found > 0 && n.belowPeak > 0, JSON.stringify(n));
});
