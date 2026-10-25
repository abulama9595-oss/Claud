// تضامن — a joint mortgage with your spouse: off changes nothing; SAMA's band per person; a joint mortgage uses both of your
// room and splits its instalment in proportion; personal loans are in one person's name (yours, your spouse's or both, each on
// their own income and room); your spouse's loans are theirs. Synthetic figures only.
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
  assert.equal(JSON.stringify(E.mergeRE({}).joint), JSON.stringify({ on: false, income: 0, incomeGrowth: null, redf: false, loans: [], myShare: null }));
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

test('personal loans in your name (the default): sized on your income, two at most counting only your loans; your spouse\'s loans are never bought out', () => {
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

// personal loans for your spouse, or for both of you (synthetic)
const PL = { ...BASE, existingLoans: [{ id: 1, name: 'Car', balance: 300000, installment: 9000, monthsLeft: 36, rate: 5, ageMonths: 20 }],
  plans: [{ lmUse: false, plWhen: 'build', plSplit: true, pl2Use: false, coUse: false, eqWhen: 'none', settlePolicy: 'none', refiMode: 'cash', enabled: true }],
  joint: { on: true, income: 15000, loans: [{ name: 'S1', balance: 100000, installment: 3000, monthsLeft: 40, rate: 9, ageMonths: 24 }] } };
const withBy = (plBy, x = PL) => ({ ...x, plans: x.plans.map((o) => ({ ...o, plBy })) });

test("your spouse's personal loans: on their income and room, their own two-loan rule, only their old loans bought out", () => {
  const r = E.computeRE(withBy('spouse'), { noNeed: true }).results[0], f = r.spl;
  assert.ok(f && f.amount > 0 && r.pl.amount === 0 && r.pl.capacity == null, 'only your spouse borrows');
  const t = f.startedAt, s1 = r.loansEnd.find((l) => l.name === 'S1'), keepS1 = s1.refinancedAt == null;
  // 55% of 15,000 (SAMA's band up to 15,000) = 8,250 a month for all of their debts; one loan's instalment at most 33% = 4,950
  for (const a of (f.split || [f.amount])) assert.ok(E.rePmt(a, f.rate, f.n) <= 15000 * 0.33 + 1e-6);
  assert.ok(f.pmt + (keepS1 ? 3000 : 0) <= 15000 * 0.55 + 1e-6);
  assert.ok(!f.refi || f.refi.names.every((n) => n === 'S1'), "only your spouse's own loans");
  assert.equal(r.loansEnd.find((l) => l.name === 'Car').refinancedAt, null);
  if (f.split) assert.ok(!keepS1, "two new loans only once your spouse's own loan is bought out");
  // whose loan it is, on whose income
  assert.ok(r.events.some((e) => e.kind === 'spl' && e.t === t && /^Your spouse's personal loan — on your spouse's income of 15,000\/mo/.test(e.text)));
  // it counts against your spouse, and in the household's personal-loan payments
  const next = r.months[t + 1];
  assert.ok(Math.abs(next.payB - (f.pmt + (keepS1 ? 3000 : 0))) < 1e-6 && Math.abs(next.payA - 9000) < 1e-6);
  assert.ok(Math.abs(next.plPay - f.pmt) < 1e-6);
});

test('both of you: each takes the bank\'s maximum in your own name, in the same month', () => {
  const me = E.computeRE(withBy('me'), { noNeed: true }).results[0], sp = E.computeRE(withBy('spouse'), { noNeed: true }).results[0];
  const r = E.computeRE(withBy('both'), { noNeed: true }).results[0];
  assert.ok(r.pl.amount > 0 && r.spl.amount > 0 && r.pl.startedAt === r.spl.startedAt);
  // separate rooms: each the same as alone
  assert.ok(Math.abs(r.pl.amount - me.pl.amount) < 1e-6 && Math.abs(r.spl.amount - sp.spl.amount) < 1e-6);
  assert.ok(!r.pl.refi || r.pl.refi.names.every((n) => n === 'Car'));
  assert.ok(r.events.some((e) => e.kind === 'pl' && /^Your personal loan — on your income of 30,000\/mo/.test(e.text)));
  const steps = E.planSteps(r, true);
  assert.ok(steps.some((x) => /^Your spouse's/.test(x.label)) && steps.some((x) => /^Your (two new )?personal loan/.test(x.label)));
  assert.ok(/personal loans for both of you/.test(E.planTitle(r.plan, true, r)));
  // "is this loan worth it?": each person's loan left out on its own
  const w = E.loanWorthRE(withBy('both'), 0), wb = w.find((x) => x.key === 'spl');
  assert.ok(wb && w.some((x) => x.key === 'pl'));
  assert.equal(wb.without.econAdv, me.econAdv);
});

test('without تضامن the choice changes nothing', () => {
  const off = { ...PL, joint: { ...PL.joint, on: false } };
  const base = key(E.computeRE(withBy('me', off), { noNeed: true }));
  for (const by of ['spouse', 'both']) assert.equal(key(E.computeRE(withBy(by, off), { noNeed: true })), base, by);
  assert.equal(E.mergeRE({}).plans[0].plBy, 'me');
});

test("a cash gap closed by both of your personal loans: they are taken together when the cash runs short, and the row says how much", () => {
  let n = 0;
  for (const { label, inp } of jointScenarios(E, 80)) {
    E.computeRE(inp, { noNeed: true }).results.forEach((r, i) => {
      if (!r || !r.covered || r.covered.split) return;
      const c = r.covered, ks = c.keys || [c.key];
      for (const k of ks) assert.equal(E.reFacOf(r, k).startedAt, c.at, `${label} S${i + 1}: ${k} taken when the cash runs short`);   // (a mortgage on a property is eq:<id>)
      assert.ok(Math.abs(c.amount - ks.reduce((a, k) => a + E.reFacOf(r, k).amount, 0)) < 1e-6);
      assert.ok(r.events.some((e) => e.kind === 'cover' && e.t === c.at && e.text.includes(`lends ${E.fS(c.amount)}`) && e.text.includes(`${E.fS(c.gap.peak)} deficit`)), `${label} S${i + 1}: the row`);
      n++;
    });
  }
  // synthetic: personal loans for both of you planned for move-in; the cash runs short months before
  const inp = { mode: 'home', acquire: 'build', income: 40000, livingExpenses: 15000, rentNow: 0, cashAvailable: 2200000, landArea: 900, landPrice: 3000, buildCost: 2500, builtPct: 60, floors: 2,
    landMonth: 6, buildStart: 9, buildMonths: 18, dbrCap: 65, perLoanCap: 33, mortgageCap: 55, plCap: 2000000, plRate: 4.25, plTenure: 5, rateQuote: 'flat', cashBuffer: 0, horizon: 15,
    existingLoans: [], plans: [{ lmUse: true, plWhen: 'none', pl2Use: true, plSplit: true, settlePolicy: 'none', refiMode: 'cash', enabled: true, plBy: 'both' }], joint: { on: true, income: 30000, loans: [] } };
  const r = E.computeRE(inp, { noNeed: true }).results[0], c = r.covered;
  assert.ok(r.feasible && c && !c.split && JSON.stringify(c.keys) === '["pl2","spl2"]' && r.pl2.startedAt === c.at && r.spl2.startedAt === c.at && c.at < r.occupy);
  assert.ok(r.pl2.takenEarly === r.occupy && r.spl2.takenEarly === r.occupy);
  assert.ok(r.events.some((e) => e.kind === 'cover' && e.text.includes(`yours ${E.fS(r.pl2.amount)} + your spouse's ${E.fS(r.spl2.amount)}`) && /in your and your spouse's names/.test(e.text)));
  // in your name alone the same plan runs out
  assert.ok(!E.computeRE({ ...inp, plans: [{ ...inp.plans[0], plBy: 'me' }] }, { noNeed: true }).results[0].feasible);
  assert.ok(n > 0);
});

test("the tool's pick tries personal loans in your name, your spouse's and both of yours", () => {
  // synthetic: your own old loan fills your limit, so only your spouse can take a personal loan
  const inp = { mode: 'home', acquire: 'build', income: 40000, livingExpenses: 15000, rentNow: 0, cashAvailable: 5400000, landArea: 900, landPrice: 3000, buildCost: 2500, builtPct: 60, floors: 2, ownedValue: 0,
    landMonth: 6, buildStart: 9, buildMonths: 18, dbrCap: 65, perLoanCap: 33, mortgageCap: 55, plCap: 2000000, plRate: 4.25, plTenure: 5, rateQuote: 'flat', cashBuffer: 0, horizon: 15,
    existingLoans: [{ id: 1, name: 'Big', balance: 1500000, installment: 26000, monthsLeft: 72, rate: 6, canRefi: false, canSettle: false }],
    plans: [{ lmUse: true, plWhen: 'none', pl2Use: true, enabled: true }], joint: { on: true, income: 30000, loans: [] } };
  const o = E.optimizeRE(inp, { plannedOnly: true }), b = o.planned.best;
  // 48 mixes; the 36 with a personal-loan step are tried three ways
  assert.equal(o.combos, 36 * 3 + 12);
  assert.equal(E.optimizeRE({ ...inp, joint: { on: false } }, { plannedOnly: true }).combos, 48);
  assert.equal(E.optimizeRE({ ...inp, joint: { on: true, income: 0 } }, { plannedOnly: true }).combos, 48);
  assert.ok(b.ok && b.cleanPlan.plBy === 'spouse' && b.spl2 > 0 && /your spouse's two personal loans/.test(b.name), b.name);
  // the pick, run as a plan, gives the same result
  const m = E.computeRE(inp, { extraPlans: [b.cleanPlan], noNeed: true }), r = m.results[m.results.length - 1];
  assert.ok(r.tool && Math.abs(r.econAdv - b.econAdv) < 1e-6 && r.spl2.amount === b.spl2);
});

// your share of a joint mortgage (joint.myShare): null = in proportion to your rooms (as before); a share you set splits the
// instalment that way and the bank lends only what each of you can carry at it. Synthetic.
test('joint mortgage share: proportional by default, a set share splits the instalment and caps the loan at what each can carry', () => {
  const base = { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 6000000, finishExtra: 0, income: 30000, livingExpenses: 10000, cashAvailable: 900000, existingLoans: [],
    joint: { on: true, income: 20000, loans: [] }, plans: [{ ...E.RE_PLAN_PRESETS.landMortgage, enabled: true }] };
  const lm = (s) => E.computeRE({ ...base, joint: { ...base.joint, myShare: s } }).results[0].lm;
  const auto = lm(null), same = lm(undefined);
  assert.equal(auto.amount, same.amount, 'not set = proportional');
  const c = auto.capacity, prop = c.roomA / (c.roomA + c.roomB);
  assert.ok(Math.abs(auto.shareA - prop) < 1e-9, 'default split in proportion to the rooms');
  for (const s of [100, 80, 50, 20, 0]) {
    const f = lm(s), x = s / 100;
    assert.ok(Math.abs(f.shareA - x) < 1e-9, `share ${s}`);
    // each of you within your own room at that split
    assert.ok(f.pmt * x <= c.roomA + 1 && f.pmt * (1 - x) <= c.roomB + 1, `share ${s}: ${f.pmt * x} ≤ ${c.roomA}, ${f.pmt * (1 - x)} ≤ ${c.roomB}`);
    // never more than the proportional split allows
    assert.ok(f.amount <= auto.amount + 1);
  }
  assert.ok(lm(100).amount < auto.amount && lm(0).amount < auto.amount, 'a lopsided split lowers the mortgage');
});
