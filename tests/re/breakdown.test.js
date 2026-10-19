// The page's "how this adds up" breakdowns (re-ui.js fundingBridgeRows + the rows the page adds) must add up to the
// engine's figures to the riyal, in every strategy of every synthetic scenario.
const test = require('node:test'), assert = require('node:assert');
const { loadEngine, scenarios, rng } = require('./helpers');
const E = loadEngine();
const near = (a, b) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 1e-9);

test('breakdowns add up: rule-6 cash is growth-free, rule-7 rows sum to net worth, both baselines and everything grows', () => {
  const bad = [];
  const r0 = rng(7);
  const all = scenarios(E, 120).map((s, k) => {
    // some strategies pay their mortgages off early and some scenarios carry an overrun, so those rows are exercised too
    if (!s.inp.plans) return s;
    const plans = s.inp.plans.map((o, j) => (j === 1 || r0() < 0.2) ? { ...o, lmUse: true, coUse: o.coUse || r0() < 0.5, prepayAfter: [0, 12, 24, 60][(k + j) % 4] } : o);
    // and some use the optional features: annex rent, letting or selling the home you live in, zakat on cash
    const extra = k % 5 === 1 ? { partRentAnnual: 40000 } : k % 5 === 2 ? { ownHomePlan: 'let', ownHomeYield: 3 } : k % 5 === 3 ? { ownHomePlan: 'sell' } : k % 5 === 4 ? { cashZakatPct: 2.5 } : {};
    return { ...s, inp: { ...s.inp, plans, overrunPct: k % 3 === 0 ? 10 : 0, landBrokerPct: k % 2 ? 2.5 : 0, ...extra } };
  });
  for (const { label, inp } of all) {
    const m = E.computeRE(inp);
    m.results.forEach((r, i) => {
      if (!r) return;
      const ms = r.months, H = ms.length - 1, end = ms[H], occ = Math.min(H, r.occupy);
      const fbC = E.fundingBridgeRows(r, occ, m.p, m.prj), fbH = E.fundingBridgeRows(r, H, m.p, m.prj);
      const chk = (what, a, b) => { if (!near(a, b)) bad.push(`${label} S${i + 1} ${what}: ${a} vs ${b}`); };
      chk('rule-6 cash at completion = cash on hand without growth', fbC.total, ms[occ].ccash - ms[occ].cRetCum);
      chk('growth before completion', fbC.ret, ms[occ].cRetCum);
      chk('cash on hand at the horizon', fbH.total + fbH.ret, end.ccash);
      const nw = fbC.total + fbC.ret + (fbH.total - fbC.total) + (fbH.ret - fbC.ret) - end.newInstCum + end.oldSavedCum + end.rentInCum + end.rentSavedCum - end.upkeepCum + end.value - end.debtNew + end.oldDebtGap - end.ownGone;
      chk('rule-7 rows sum to net worth', nw, end.netWorth);
      const settle = ms.reduce((a, x) => a + x.renterSettle, 0), bGrow = ms.reduce((a, x) => a + x.bRet, 0);
      chk('rule-7 baseline rows', r.cashStart - settle + bGrow, end.renterNW);
      chk('everything grows: cash + home − debt', end.cash + end.value - end.debt - end.ownGone, end.econNW);
      chk('everything grows: difference', end.econNW - end.econBase, r.econAdv);
      const rc = E.cashReconcile(r, occ, m.p, m.prj);
      chk('bank balance at move-in = cash on hand + salary left + return', rc.onHand + rc.salary + rc.growth, rc.bank);
    });
  }
  assert.deepStrictEqual(bad.slice(0, 10), []);
});
