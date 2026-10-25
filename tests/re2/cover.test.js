// The cover when no planned loan closes the gap (coverAny, the default for a scenario made in this tool): the plan's later loan
// is tried in the month the cash runs short; a move that makes the plan work covers it, otherwise the move that shrinks the
// shortfall is kept (coveredPart); imported old scenarios keep the old cover (coverAny off). Synthetic scenarios only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const OLD = [{ id: 1, name: 'Loan A', balance: 900000, installment: 21000, monthsLeft: 46, rate: 2.7, canSettle: true, canRefi: true, type: 'personal' }];
const base = { asOf: '2026-10', kind: 'landBuilding', occupancy: 'let', unitCount: 8, unitRentBasis: 'unit', unitRent: 4000, landArea: 700, landPrice: 3000, builtPct: 60, floors: 3, buildCost: 2000, buildMonths: 24,
  landMonth: 6, buildStart: 9, income: 90000, dbrCap: 65, livingExpenses: 30000, cashBuffer: 150000, rentNow: 0, plRate: 4.5, rateQuote: 'flat', existingLoans: OLD, properties: [] };
const plan0 = { lmUse: true, lmMode: 'max', plWhen: 'build', plMode: 'max', plSplit: true, pl2Use: true, coUse: false, mortgages: {}, settlePolicy: 'asNeeded', refiMode: 'auto', enabled: true, name: 'Land mortgage + personal loans' };
const plan = { ...E.RE_PLAN_DEFAULTS, ...plan0 };

test('cover with no closing loan: the later loan is taken early when it shrinks the shortfall, and imports keep the old cover', () => {
  let partial = 0, works = 0;
  for (const cash of [2650000, 3050000, 3450000, 3850000, 4250000]) {
    const inp = { ...base, cashAvailable: cash, plans: [plan] };
    const p = E.mergeRE(inp), prj = E.reProject(p);
    const raw = E.rePlanSimulate(p, prj, plan), r = E.reRunPlan(p, prj, plan);
    const old = E.reRunPlan(E.mergeRE({ ...inp, coverAny: false }), prj, plan);
    // never worse than the plan as written, and never worse than the old cover
    assert.ok(E.reStanding(r) >= E.reStanding(old));
    if (E.reStanding(r) === E.reStanding(old) && E.reStanding(r) === 0) assert.ok(r.minCash >= old.minCash - 1, `${cash}: ${r.minCash} vs ${old.minCash}`);
    if (r.coveredPart) {
      partial++;
      assert.ok(!r.feasible && r.minCash > raw.minCash + 1, 'a partial cover shrinks the shortfall');
      assert.ok(r.coveredPart.at < r.coveredPart.plannedAt, 'the loan is taken earlier than planned');
      assert.ok(r.events.some((e) => e.kind === 'cover' && /Not enough on its own/.test(e.text)));
    }
    if (r.covered && r.feasible && !raw.feasible) works++;
  }
  assert.ok(partial + works >= 1, 'at least one case takes the later loan early');
  // an imported old scenario keeps the old cover
  assert.equal(E.re2Import({ mode: 'home' }).coverAny, false);
  assert.equal(E.mergeRE({}).coverAny, true);
});
