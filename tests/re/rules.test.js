// Specific rules: early-settlement fee on the declining balance, extra payments outside the bank's test,
// the payoff search skipping a loan your cash can't cover, loan input warnings, shared bank terms.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();

test('early-settlement fee = next 3 months of profit on the declining balance', () => {
  const loan = { id: 1, name: 'Old', balance: 500000, installment: 12000, monthsLeft: 60, rate: 7, settleAt: 5 };
  const m = E.computeRE({ existingLoans: [loan], plans: [{ enabled: true, ...E.RE_PLAN_PRESETS.allCash }, null, null, null].map((o) => o || { ...E.RE_PLAN_PRESETS.allCash, enabled: false }) });
  const r = m.results[0], po = r.payoffs.find((x) => x.name === 'Old');
  assert.ok(po, 'planned settlement happened');
  // rebuild: balance after 4 instalments (months 1-4), then fee on the next 3 months
  let b = 500000; const i = 7 / 1200, inst = Math.max(12000, E.rePmt(500000, 7, 60));
  for (let t = 1; t <= 4; t++) b -= inst - b * i;
  let fee = 0, bb = b;
  for (let k = 0; k < 3; k++) { const x = bb * i; fee += x; bb -= inst - x; }
  assert.ok(Math.abs(po.fee - fee) < 1e-6, `fee ${po.fee} vs ${fee}`);
});

test('a voluntary extra payment is not counted in the debt-burden peak', () => {
  const plan = { ...E.RE_PLAN_PRESETS.landMortgage, enabled: true, extraMo: 20000 };
  const m = E.computeRE({ existingLoans: [], plans: [plan, { ...plan, enabled: false }, { ...plan, enabled: false }, { ...plan, enabled: false }] });
  const r = m.results[0];
  assert.ok(r.months.some((x) => x.extraPay > 0), 'extra payments were made');
  assert.ok(r.peakDbr <= m.p.dbrCap + 1e-9, `peak debt burden ${r.peakDbr}% > ${m.p.dbrCap}%`);
});

test('the payoff search skips a loan your cash cannot cover and tries the next one', () => {
  // Big frees the most instalment per riyal, so it is tried first, but your cash can't cover it; Small can be paid
  const inp = { income: 100000, dbrCap: 55, mortgageCap: 55, cashAvailable: 200000, cashBuffer: 0, landArea: 1000, landPrice: 3000, landMonth: 0, buildStart: 0,
    existingLoans: [{ id: 1, name: 'Big', balance: 400000, installment: 40000, monthsLeft: 11, rate: 6 }, { id: 2, name: 'Small', balance: 100000, installment: 3000, monthsLeft: 40, rate: 6 }],
    plans: [{ ...E.RE_PLAN_PRESETS.landMortgage, enabled: true, settlePolicy: 'forMax' }, null, null, null].map((o) => o || { ...E.RE_PLAN_PRESETS.allCash, enabled: false }) };
  const r = E.computeRE(inp).results[0];
  assert.ok(r.events.some((e) => e.kind === 'settle' && e.text.startsWith('Cannot pay off Big')), 'Big was skipped');
  assert.ok(r.payoffs.some((x) => x.name === 'Small'), 'Small was paid off instead');
});

test('loan input warnings: too-low instalment, and one that ends the loan early', () => {
  const low = E.computeRE({ existingLoans: [{ id: 1, name: 'Low', balance: 100000, installment: 1000, monthsLeft: 60, rate: 6 }] }).household.warnings;
  assert.equal(low.length, 1); assert.match(low[0], /does not clear/);
  const high = E.computeRE({ existingLoans: [{ id: 1, name: 'High', balance: 100000, installment: 5000, monthsLeft: 60, rate: 6 }] }).household.warnings;
  assert.equal(high.length, 1); assert.match(high[0], /clears .* in about \d+ months, not 60/);
  const ok = E.computeRE({ existingLoans: [{ id: 1, name: 'Fine', balance: 100000, installment: Math.round(E.rePmt(100000, 6, 60)), monthsLeft: 60, rate: 6 }] }).household.warnings;
  assert.equal(ok.length, 0);
});

test('bank terms: migrated once from the first enabled strategy that uses each loan, and merging again changes nothing', () => {
  const plans = [{ enabled: false, lmUse: true, lmRate: 9 }, { enabled: true, lmUse: true, lmRate: 5, plWhen: 'build', plRate: 3 }, { enabled: true, plWhen: 'land', plRate: 3.5 }, { enabled: true }];
  const p1 = E.mergeRE({ plans }), p2 = E.mergeRE(p1);
  assert.equal(p1.lmRate, 5); assert.equal(p1.plRate, 3);
  for (const k of ['lmRate', 'plRate', 'eqRate', 'coRate', 'termsV']) assert.equal(p2[k], p1[k]);
  assert.equal(E.mergeRE({ lmRate: 6, plans }).lmRate, 6, 'an explicit shared rate is kept');
  const { conflicts } = E.reTermsFromPlans(plans);
  assert.equal(conflicts.map((c) => c.loan).join(','), 'pl');
});
