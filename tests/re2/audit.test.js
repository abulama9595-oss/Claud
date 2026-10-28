// Fixes from the engine audit (synthetic scenarios only): the breakdown adds up with extra loan steps, rule 7 counts your
// properties' rent, the lending timeline follows the joint share, more cash never breaks an "as needed" plan, early payoff
// compares rates like for like, texts name loans by label and say "within 2%" when the pick is not the least.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();

test('the "vs not building" breakdown adds up with extra personal-loan steps (their profit is in newInt)', () => {
  const inp = { kind: 'landVilla', asOf: '2026-10', income: 60000, livingExpenses: 20000, cashAvailable: 1500000, landArea: 500, landPrice: 3000, builtArea: 400, buildCost: 2300, landMonth: 0, buildStart: 3, buildMonths: 18,
    plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true, plMore: [{ when: 'build' }] }] };
  const r = E.computeRE(inp, { noNeed: true }).results[0];
  const prof = r.facilities.reduce((a, f) => a + f.interestPaid, 0), newInt = r.months.reduce((a, m) => a + m.newInt, 0);
  assert.ok(Math.abs(prof - newInt) < 1, `${prof} vs ${newInt}`);
  assert.ok(Math.abs(E.reWealthParts(r).total - r.econAdv) < 1);
});

test('rule 7 counts the rent your properties earn (a rented property sold on this side only loses it)', () => {
  const base = { kind: 'landVilla', asOf: '2026-10', income: 60000, livingExpenses: 20000, cashAvailable: 4000000, landArea: 500, landPrice: 3000, builtArea: 400, buildCost: 2300, landMonth: 0, buildStart: 0, buildMonths: 12, plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true }] };
  const keep = E.computeRE({ ...base, properties: [{ id: 'p1', name: 'Flat', value: 1500000, rentNow: 10000, plan: 'keep' }] }, { noNeed: true }).results[0];
  const sell = E.computeRE({ ...base, properties: [{ id: 'p1', name: 'Flat', value: 1500000, rentNow: 10000, plan: 'sell', sellAt: 'moveIn' }] }, { noNeed: true }).results[0];
  const lost = sell.months.reduce((a, m) => a + (m.propRentBase - m.propRentIn), 0);
  assert.ok(lost > 0);
  assert.ok(sell.advantage - keep.advantage < -0.5 * lost, 'selling the rented flat costs its rent in rule 7 too');
});

test('the lending timeline follows the joint share and gives nothing jointly while you are over your own limit', () => {
  const j = (extra) => E.computeRE({ kind: 'readyVilla', asOf: '2026-10', propertyPrice: 4000000, income: 40000, cashAvailable: 1500000, joint: { on: true, income: 30000, loans: [], myShare: 50 }, plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true }], ...extra }, { noNeed: true });
  const m = j({}), r = m.results[0];
  assert.ok(Math.abs(m.household.capTimeline[0].maxMortgage - r.lm.amount) < r.lm.amount * 0.02 + 1, `${m.household.capTimeline[0].maxMortgage} vs ${r.lm.amount}`);
  const over = j({ existingLoans: [{ id: 1, name: 'Big', balance: 2000000, installment: 30000, monthsLeft: 80, rate: 6, canSettle: false }] });
  assert.equal(over.results[0].lm.amount, 0); assert.ok(over.household.capTimeline[0].maxMortgage < 1);
});

test('more starting cash never breaks an "as needed" plan that works with less', () => {
  const inp = (cash) => ({ kind: 'landVilla', asOf: '2026-10', samaBands: false, income: 40000, livingExpenses: 18000, rentNow: 9000, cashBuffer: 100000, cashAvailable: cash,
    landArea: 600, landPrice: 4000, builtArea: 450, buildCost: 2200, finishExtra: 100000, landMonth: 0, buildStart: 0, buildMonths: 12, horizon: 15, landLtv: 90, lmTenure: 20, lmRate: 5, dbrCap: 55, mortgageCap: 55,
    existingLoans: [{ id: 1, name: 'Old loan', balance: 600000, installment: 12500, monthsLeft: 60, rate: 9, ageMonths: 30 }],
    plans: [{ enabled: true, name: 'mortgage', lmUse: true, settlePolicy: 'asNeeded' }] });
  let worked = false;
  for (let c = 2400000; c <= 3000000; c += 100000) { const ok = E.reStanding(E.computeRE(inp(c), { noNeed: true }).results[0]) === 2; if (worked) assert.ok(ok, `breaks at ${c}`); worked = worked || ok; }
  assert.ok(worked);
});

test('early payoff compares the mortgage rate and the cash return like for like', () => {
  const inp = { kind: 'readyVilla', asOf: '2026-10', propertyPrice: 3000000, finishExtra: 0, income: 150000, livingExpenses: 30000, cashAvailable: 2000000, cashBuffer: 0, altReturn: 6, lmRate: 5.95, lmTenure: 20, rateQuote: 'apr',
    plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true, prepayAfter: 'asap' }] };
  const r = E.computeRE(inp, { noNeed: true }).results[0];
  assert.ok((r.prepaid || []).length >= 1, 'a 5.95% mortgage costs more than 6% cash earns month by month: paid off');
});

test('texts: a bridge names the loan, lens texts say "within 2%" when the pick is not the least', () => {
  const r = E.computeRE({ kind: 'landVilla', asOf: '2026-10', income: 40000, livingExpenses: 15000, rentNow: 6000, cashAvailable: 2300000, cashBuffer: 0, landArea: 500, landPrice: 3000, builtArea: 400, buildCost: 2300, landMonth: 0, buildStart: 0, buildMonths: 18, samaBands: false, dbrCap: 55,
    existingLoans: [{ id: 1, name: 'Old loan', balance: 280000, installment: 20000, monthsLeft: 15, rate: 6, ageMonths: 40, canSettle: false }], properties: [{ id: 'p1', name: 'Flat B', value: 3000000, ltv: 70 }],
    plans: [{ enabled: true, mortgages: { p1: { when: 'month', month: 16 } } }] }, { noNeed: true }).results[0];
  assert.ok(r.flags.concat(r.events.map((e) => e.text)).every((t) => !/\b(eq:|pl\d)/.test(t)));
  const row = (idx, econAdv, peakDebt) => ({ idx, name: 'P' + idx, standing: 2, rulesMet: 2, econAdv, peakDebt, peakDebtT: 5, borrowed: 900000, peakInst: 10000, peakInstT: 5, peakInstPct: 30, profit: 100000, H: 240, occupy: 12, wealthAt: () => econAdv, cashAt: () => 0, borrowableAt: () => 0 });
  const L = E.reLensPick([row(0, 2000000, 1015000), row(1, 1000000, 1000000)], {}).leastLiability;
  assert.match(L.why, /within 2% of the least/);
});
