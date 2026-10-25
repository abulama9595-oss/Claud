// Refinancing each old personal loan with its own bank (refiStyle "topup", the default for a scenario made in this tool):
// the loan count stays the same, each bank clears its own loan and pays you the rest; old loans are combined into a new loan
// only when the new loan is cheaper; "consolidate" (the old tool's way, set by re2Import) gives the previous numbers.
// Synthetic scenarios only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const OLD3 = [
  { id: 1, name: 'Loan A', balance: 900000, installment: 22000, monthsLeft: 44, rate: 2.5, canSettle: true, canRefi: true, type: 'personal' },
  { id: 2, name: 'Loan B', balance: 700000, installment: 17000, monthsLeft: 46, rate: 6.4, canSettle: true, canRefi: true, type: 'personal' },
  { id: 3, name: 'Loan C', balance: 300000, installment: 7000, monthsLeft: 47, rate: 6.6, canSettle: true, canRefi: true, type: 'personal' },
];
const base = { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 2400000, finishExtra: 0, income: 110000, livingExpenses: 30000, rentNow: 0, cashAvailable: 1800000, cashBuffer: 100000, dbrCap: 70, plRate: 4.5, rateQuote: 'flat', existingLoans: OLD3 };
const plan = { lmUse: false, plWhen: 'land', plMode: 'max', plSplit: true, refiMode: 'cash', mortgages: {}, coUse: false, pl2Use: false, settlePolicy: 'asNeeded', enabled: true, name: 'Personal loans' };

test('top-ups: each old loan is refinanced by its own bank, nothing is combined when new money is dearer, and the old style still consolidates', () => {
  const r = E.computeRE({ ...base, plans: [plan] }).results[0];
  assert.ok(r.pl.topups && r.pl.topups.length >= 1, 'the step tops loans up');
  // every part clears its own loan in full and pays the rest to you; the parts add up to the step
  for (const x of r.pl.topups) assert.ok(x.amount >= x.payoff - 1 && Math.abs(x.net - (x.amount - x.payoff)) < 1);
  // each part says why its instalment is what it is
  for (const x of r.pl.topups) assert.match(x.why, /instalment/);
  assert.ok(Math.abs(r.pl.topups.reduce((a, x) => a + x.amount, 0) - r.pl.amount) < 1);
  // the same rate and tenure: the parts' instalments add up to the step's one instalment
  assert.ok(Math.abs(r.pl.topups.reduce((a, x) => a + x.inst, 0) - r.pl.pmt) < 1);
  // no slot is used: the loan count is the same as before (three personal loans, none combined)
  const ended = r.loansEnd.filter((l) => l.toppedUpAt != null).length;
  assert.equal(ended, r.pl.topups.length);
  assert.ok(r.events.some((e) => e.kind === 'pl' && /each with its own bank|with its own bank/.test(e.text)));
  // the previous tool's way combines old loans into new ones
  const c = E.computeRE({ ...base, refiStyle: 'consolidate', plans: [plan] }).results[0];
  assert.ok(!c.pl.topups && c.pl.refi && c.pl.refi.names.length >= 2, 'consolidate buys several out into the new loans');
  // a new loan cheaper than the old ones may still combine them (here: new money at 2% flat, dearer old loans)
  const dear = OLD3.map((l) => ({ ...l, rate: 9 }));
  const k = E.computeRE({ ...base, existingLoans: dear, plRate: 1, plans: [plan] }).results[0];
  assert.ok(k.pl.amount > 0);
  // an imported old scenario keeps the old style
  assert.equal(E.re2Import({ mode: 'home' }).refiStyle, 'consolidate');
  assert.equal(E.mergeRE({}).refiStyle, 'topup');
});
