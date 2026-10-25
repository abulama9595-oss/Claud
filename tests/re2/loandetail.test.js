// Loan details (the step-by-step's "Details" link): every new loan's schedule, rebuilt from its terms, matches the run month by
// month; its profit equals the engine's; every loan step and early payoff in the step-by-step names its loan. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios2 } = require('./helpers.js');
const E = loadEngine();

test('loan details: schedules match the run, profit matches, every loan event names its loan', () => {
  const cases = scenarios2(E, 40).map((x) => x.inp).concat([
    { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 3000000, finishExtra: 0, income: 150000, livingExpenses: 40000, rentNow: 0, cashAvailable: 2500000, cashBuffer: 200000, altReturn: 4, lmRate: 7, lmTenure: 20, existingLoans: [],
      plans: [{ ...E.RE_PLAN_PRESETS.landMortgage, enabled: true, prepayAfter: 'asap' }] },
  ]);
  let loans = 0;
  for (const inp of cases) {
    const p = E.mergeRE(inp), prj = E.reProject(p), m = E.computeRE(inp, { noNeed: true });
    for (const r of m.results) {
      if (!r) continue;
      const taken = r.facilities.filter((f) => f.amount > 0 && f.startedAt != null);
      // the sum of every loan's schedule balance equals the run's new debt, every month
      const sched = taken.map((f) => E.reFacSchedule(f, r, r.plan));
      for (let t = 1; t < r.months.length; t++) {
        const sum = taken.reduce((a, f, k) => { if (t <= f.startedAt) return a + (t === f.startedAt ? f.amount : 0); const row = sched[k].find((x) => x.t === t); return a + (row ? row.close : 0); }, 0);
        assert.ok(Math.abs(sum - r.months[t].debtNew) < 1, `month ${t}: schedules ${Math.round(sum)} vs debtNew ${Math.round(r.months[t].debtNew)}`);
      }
      for (const f of taken) {
        const d = E.reFacDetail(r, f.key, p, prj);
        assert.ok(d, f.key);
        assert.ok(Math.abs(d.profit - f.interestPaid) < 0.01, `${f.key}: profit ${d.profit} vs interestPaid ${f.interestPaid}`);
        assert.ok(d.events.length >= 1, `${f.key}: its step names it`);
        loans++;
      }
      for (const x of r.prepaid || []) assert.ok(r.events.some((e) => e.kind === 'settle' && e.fac === x.key && e.t === x.t), 'an early payoff names its loan');
    }
  }
  assert.ok(loans > 20, `checked ${loans} loans`);
});
