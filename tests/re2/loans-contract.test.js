// Loans that keep themselves up to date (page helpers, no engine change): a loan entered from its contract, and every
// scenario rolled forward to this month — loans paid down as the engine pays them, the project kept on its calendar dates,
// cash as entered. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b));

test('a loan from its contract: months left, age, APR from the instalment, balance = what is left of the annuity', () => {
  const amount = 500000, apr = 7, n = 60, inst = E.rePmt(amount, apr, n);
  const l = E.reLoanFromContract({ name: 'K', installment: inst, contract: { amount, first: '2025-01', last: '2029-12' } }, '2026-10');
  assert.equal(l.contract.n, 60);
  assert.equal(l.monthsLeft, E.reYmDiff('2026-10', '2029-12'));   // 38
  assert.equal(l.ageMonths, 22);
  assert.ok(near(l.rate, apr, 1e-6), String(l.rate));
  assert.ok(near(l.balance, E.rePrincipalFor(inst, apr, 38), 1e-6));
  // hamish only: the APR is reFlatToApr's and the instalment the hamish one
  const h = E.reLoanFromContract({ name: 'H', installment: 0, contract: { amount: 300000, first: '2026-01', last: '2030-12', flat: 4 } }, '2026-10');
  assert.ok(near(h.rate, E.reFlatToApr(4, 60)) && near(h.installment, 300000 * (1 + 0.04 * 5) / 60));
  assert.ok(near(h.contract.impliedFlat, 4, 1e-9));
  // ended
  assert.equal(E.reLoanFromContract({ installment: 1000, contract: { amount: 10000, first: '2020-01', last: '2020-12' } }, '2026-10').balance, 0);
  // incomplete contract
  assert.equal(E.reLoanFromContract({ installment: 1000, contract: { amount: 10000, first: null, last: '2028-01' } }, '2026-10'), null);
});

test('the contract a "balance today" loan implies gives the same loan back', () => {
  const apr = 6.5, n = 72, age = 20, left = n - age, inst = E.rePmt(400000, apr, n), bal = E.rePrincipalFor(inst, apr, left);
  const l = { name: 'B', balance: bal, installment: inst, monthsLeft: left, ageMonths: age, rate: apr };
  const c = E.reContractOf(l, '2026-10');
  assert.ok(near(c.amount, 400000, 1e-5) && c.last === E.reYmAdd('2026-10', left) && c.first === E.reYmAdd('2026-10', 1 - age));
  const back = E.reLoanFromContract({ ...l, contract: c }, '2026-10');
  assert.equal(back.monthsLeft, left); assert.equal(back.ageMonths, age);
  assert.ok(near(back.balance, bal, 1e-5) && near(back.rate, apr, 1e-5));
  // age not known: no first month, no amount
  const u = E.reContractOf({ ...l, ageMonths: null }, '2026-10');
  assert.equal(u.first, null); assert.equal(u.amount, null);
});

test('rolling a scenario forward: loans paid down exactly as the engine pays them, dates kept, cash as entered', () => {
  const inp = { asOf: '2026-10', kind: 'landVilla', cashAvailable: 1234567, landMonth: 5, buildStart: 8,
    existingLoans: [{ id: 1, name: 'A', balance: 300000, installment: 9000, monthsLeft: 40, rate: 6, ageMonths: null },
      { id: 2, name: 'F', balance: 150000, installment: 4000, monthsLeft: 50, rate: 4, rateType: 'flat', ageMonths: 10 },
      { id: 3, name: 'Short', balance: 5000, installment: 2600, monthsLeft: 2, rate: 5 }],
    plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true, name: 'x', plWhen: 'month', plMonth: 6, plMore: [{ when: 'month', month: 1 }] }] };
  const R = E.reRollForward(inp, '2026-12');
  assert.equal(R.months, 2); assert.equal(R.inp.asOf, '2026-12');
  assert.equal(R.inp.cashAvailable, inp.cashAvailable);
  assert.equal(R.inp.landMonth, 3); assert.equal(R.inp.buildStart, 6);
  assert.equal(R.inp.plans[0].plMonth, 4); assert.equal(R.inp.plans[0].plMore[0].month, 0);
  assert.ok(R.notes.some((x) => /plan step/.test(x)));
  // the engine's own month-2 balances
  const r = E.computeRE({ ...inp, plans: [{ ...E.RE_PLAN_DEFAULTS, enabled: true, name: 'cash', lmUse: false, plWhen: 'none' }] }, { noNeed: true }).results[0];
  const [a, f, s] = R.inp.existingLoans;
  assert.ok(near(a.balance + f.balance + s.balance, r.months[2].debtExisting, 1e-9), `${a.balance + f.balance + s.balance} vs ${r.months[2].debtExisting}`);
  assert.equal(a.monthsLeft, 38); assert.equal(a.ageMonths, null); assert.equal(f.ageMonths, 12); assert.equal(f.rateType, 'flat');
  assert.equal(s.monthsLeft, 0); assert.equal(s.balance, 0);
  // the same month again: nothing to do; never backwards
  assert.equal(E.reRollForward(R.inp, '2026-12'), null);
  assert.equal(E.reRollForward(inp, '2026-09'), null);
  // a loan with a contract is recomputed from it
  const c = { id: 9, name: 'C', installment: E.rePmt(200000, 8, 48), contract: { amount: 200000, first: '2026-01', last: '2029-12' } };
  const R2 = E.reRollForward({ ...inp, existingLoans: [E.reLoanFromContract(c, '2026-10')] }, '2027-03');
  assert.ok(near(R2.inp.existingLoans[0].balance, E.reLoanFromContract(c, '2027-03').balance) && R2.inp.existingLoans[0].monthsLeft === 33);
});

test('loans without a contract give exactly the old numbers until time passes', () => {
  const inp = { asOf: '2026-10', existingLoans: [{ id: 1, name: 'A', balance: 300000, installment: 9000, monthsLeft: 40, rate: 6 }] };
  assert.equal(E.reRollForward(inp, '2026-10'), null);
  const a = E.computeRE(inp, { noNeed: true }), b = E.computeRE(JSON.parse(JSON.stringify(inp)), { noNeed: true });
  assert.equal(a.results[0].econAdv, b.results[0].econAdv);
});
