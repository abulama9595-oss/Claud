// تضامن — a joint mortgage with your spouse: off changes nothing; SAMA's band per person; a joint mortgage uses both of your
// room and splits its instalment in proportion; personal loans stay yours; your spouse's loans are theirs. Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, jointScenarios } = require('./helpers.js');
const E = loadEngine();

const key = (m) => JSON.stringify(m.results.map((r) => r && [r.feasible, !!r.bridged, r.econAdv, r.advantage, r.minCash, r.onHandAtMoveIn, r.facilities.map((f) => [f.key, f.amount, f.startedAt])]).concat([m.verdict]));

test('تضامن off changes nothing; on with a spouse of no income and no loans (your income 25,000 or more) gives the same numbers', () => {
  let n = 0;
  for (const { label, inp } of scenarios(E, 40)) {
    const base = key(E.computeRE(inp, { noNeed: true }));
    const off = { ...inp, joint: { on: false, income: 20000, redf: true, loans: [{ name: 'x', balance: 50000, installment: 2000, monthsLeft: 30, rate: 5 }] } };
    assert.equal(key(E.computeRE(off, { noNeed: true })), base, `${label}: off`);
    if ((inp.income || 45000) >= 25000) { assert.equal(key(E.computeRE({ ...inp, joint: { on: true, income: 0, loans: [] } }, { noNeed: true })), base, `${label}: on, nobody`); n++; }
  }
  assert.ok(n > 20);
});

test('your spouse\'s loans are merged like yours: flat rate converted once, ids of their own, merging again changes nothing', () => {
  const inp = { joint: { on: true, income: 9000, loans: [{ name: 'Car', balance: 60000, installment: 2400, monthsLeft: 30, rate: 3, rateType: 'flat', ageMonths: 6 }, { balance: 20000, installment: 900, monthsLeft: 24, rate: 5 }] } };
  const p = E.mergeRE(inp), q = E.mergeRE(p);
  assert.equal(p.joint.loans[0].rateType, 'apr');
  assert.equal(p.joint.loans[0].flatRate, 3);
  assert.ok(Math.abs(p.joint.loans[0].rate - E.reFlatToApr(3, 36)) < 1e-12);
  assert.deepEqual([p.joint.loans[0].id, p.joint.loans[1].id], ['s1', 's2']);
  assert.equal(JSON.stringify(q.joint), JSON.stringify(p.joint));
  assert.equal(JSON.stringify(E.mergeRE({}).joint), JSON.stringify({ on: false, income: 0, incomeGrowth: null, redf: false, loans: [] }));
});

test('SAMA band per person (Responsible Lending Principles ¶15–17), never above your bank\'s limit; it follows the income', () => {
  const c = E.reSamaCap;
  assert.equal(c(12000, 65, false), 55);
  assert.equal(c(12000, 65, true), 65);
  assert.equal(c(15000, 65, false), 55);
  assert.equal(c(12000, 50, true), 50);
  assert.equal(c(20000, 65, false), 65);
  assert.equal(c(20000, 60, false), 60);
  assert.equal(c(24999, 70, false), 65);
  assert.equal(c(25000, 70, false), 70);
  assert.equal(c(30000, 55, false), 55);
  // a spouse earning 14,500 with 5% a year crosses 15,000 in year 2: their limit goes from 55% to 65%
  const r = E.computeRE({ dbrCap: 65, joint: { on: true, income: 14500, incomeGrowth: 5, loans: [] } }, { noNeed: true }).results.find(Boolean);
  assert.equal(r.months[12].capB, 55);
  assert.equal(r.months[13].capB, 65);
});

// a household whose land mortgage is held back by your own room (synthetic)
const BASE = { mode: 'home', acquire: 'build', income: 30000, livingExpenses: 9000, rentNow: 0, cashAvailable: 4000000, dbrCap: 65, mortgageCap: 55, perLoanCap: 33, landArea: 900, landPrice: 4000, landLtv: 90, landMonth: 3, buildStart: 6, buildMonths: 18, horizon: 15, ownedValue: 0,
  existingLoans: [{ id: 1, name: 'Car', balance: 300000, installment: 9000, monthsLeft: 36, rate: 5 }],
  plans: [{ lmUse: true, plWhen: 'none', pl2Use: false, coUse: false, eqWhen: 'none', settlePolicy: 'none', enabled: true }] };

test('a joint mortgage uses both of your room: bigger than yours alone, its instalment split in proportion, and said so', () => {
  const off = E.computeRE(BASE, { noNeed: true }).results[0];
  const m = E.computeRE({ ...BASE, joint: { on: true, income: 12000, loans: [{ name: 'Phone', balance: 10000, installment: 1000, monthsLeft: 12, rate: 6 }] } }, { noNeed: true }), r = m.results[0];
  assert.ok(r.lm.amount > off.lm.amount + 1, `${r.lm.amount} vs ${off.lm.amount}`);
  const c = r.lm.capacity;
  // your room: 65% of 30,000 − 9,000; your spouse's: 55% of 12,000 (band up to 15,000) − 1,000; each within the mortgage limit
  assert.ok(Math.abs(c.roomA - Math.min(30000 * 0.65 - 9000, 30000 * 0.55)) < 1e-6 && Math.abs(c.roomB - Math.min(12000 * 0.55 - 1000, 12000 * 0.55)) < 1e-6);
  assert.ok(Math.abs(r.lm.shareA - c.roomA / (c.roomA + c.roomB)) < 1e-12);
  assert.ok(r.events.some((e) => e.kind === 'lm' && /jointly with your spouse \(تضامن\)/.test(e.text)));
  // the month after: you pay your share plus your loans, your spouse theirs
  const mo = r.months[r.lm.startedAt + 1];
  assert.ok(Math.abs(mo.payA - (9000 + r.lm.pmt * r.lm.shareA)) < 1e-6 && Math.abs(mo.payB - (1000 + r.lm.pmt * (1 - r.lm.shareA))) < 1e-6);
  assert.equal(m.household.joint.capPctB, 55);
  // REDF / MoH support: 65% up to 15,000 — more room for your spouse
  const redf = E.computeRE({ ...BASE, joint: { on: true, income: 12000, redf: true, loans: [] } }, { noNeed: true }).results[0];
  assert.ok(Math.abs(redf.lm.capacity.roomB - 12000 * 0.55) < 1e-6);   // still within the 55% mortgage limit
  assert.ok(redf.months[1].capB === 65);
});

test('while your own debts are over your limit no joint mortgage is lent; your spouse over theirs adds no room', () => {
  const over = { ...BASE, existingLoans: [{ id: 1, name: 'Big', balance: 2000000, installment: 22000, monthsLeft: 120, rate: 6 }] };
  const r = E.computeRE({ ...over, joint: { on: true, income: 20000, loans: [] } }, { noNeed: true }).results[0];
  assert.equal(r.lm.amount, 0);
  assert.ok(/more than your 65% limit/.test(r.lm.capacity.limitedBy));
  const s = E.computeRE({ ...BASE, joint: { on: true, income: 8000, loans: [{ name: 'Loan', balance: 200000, installment: 5000, monthsLeft: 48, rate: 6 }] } }, { noNeed: true });
  assert.equal(s.results[0].lm.capacity.roomB, 0);
  assert.equal(s.results[0].lm.shareA, 1);
  // SAMA's other limits warn about your spouse's loans: over their limit, over 45% below 25,000
  const w = s.household.warnings.join(' | ');
  assert.ok(/above their 55% limit/.test(w) && /SAMA allows 45%/.test(w), w);
  assert.ok(/salary-deducted personal finance, SAMA allows 33.33%/.test(E.computeRE({ ...BASE, joint: { on: true, income: 10000, loans: [{ name: 'L', balance: 150000, installment: 4000, monthsLeft: 48, rate: 6 }] } }, { noNeed: true }).household.warnings.join(' ')));
  assert.ok(/income is 0/.test(E.computeRE({ ...BASE, joint: { on: true, income: 0, loans: [] } }, { noNeed: true }).household.warnings.join(' ')));
});

test('personal loans stay yours: sized on your income, two at most counting only your loans; your spouse\'s loans are never bought out', () => {
  const inp = { ...BASE, income: 60000, existingLoans: [], plans: [{ lmUse: false, plWhen: 'build', plSplit: true, pl2Use: false, coUse: false, eqWhen: 'none', settlePolicy: 'none', refiMode: 'cash', enabled: true }],
    joint: { on: true, income: 15000, loans: [{ name: 'S1', balance: 100000, installment: 3000, monthsLeft: 40, rate: 4 }, { name: 'S2', balance: 80000, installment: 2500, monthsLeft: 40, rate: 4 }] } };
  const r = E.computeRE(inp, { noNeed: true }).results[0];
  assert.ok(r.pl.amount > 0 && r.pl.split, 'two new personal loans despite your spouse\'s two');
  assert.ok(!r.pl.refi, 'no buy-out of your spouse\'s loans');
  for (const a of r.pl.split) assert.ok(E.rePmt(a, r.pl.rate, r.pl.n) <= 60000 * 0.33 + 1e-6);
});

test('your spouse\'s loans are paid off from your cash only to make room for a joint mortgage', () => {
  let n = 0;
  for (const { label, inp } of jointScenarios(E, 60)) {
    const names = new Set((inp.joint.loans || []).map((l) => l.name));
    E.computeRE(inp, { noNeed: true }).results.forEach((r, i) => {
      if (!r) return;
      for (const x of r.payoffs.filter((x) => names.has(x.name))) {
        const l = inp.joint.loans.find((y) => y.name === x.name);
        if (l.settleAt != null && Math.round(l.settleAt) === x.t) continue;   // a settlement you planned
        // in the month a joint mortgage is asked for, while your own debts are within your limit
        assert.ok([r.lm, r.co].some((f) => f.capacity && f.capacity.t === x.t), `${label} S${i + 1}: ${x.name} paid off in month ${x.t}`);
        n++;
      }
    });
  }
  assert.ok(n > 0, 'no spouse loan was paid off in any scenario');
});

test('stress and sensitivity move both incomes', () => {
  const inp = { ...BASE, joint: { on: true, income: 12000, loans: [] } };
  const st = E.stressRE(inp, 0), row = st.find((x) => x.key === 'income');
  assert.equal(row.label, 'Both incomes 20% lower');
  const p = E.mergeRE(inp), want = E.reRunOne({ ...p, income: p.income * 0.8, joint: { ...p.joint, income: p.joint.income * 0.8 } }, 0).r;
  assert.equal(row.econAdv, want.econAdv);
  assert.ok(E.tornadoRE(inp, 0).some((d) => d.label === 'Your incomes (both of you)'));
});
