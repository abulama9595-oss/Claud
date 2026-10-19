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
