// An existing loan has a type: a personal loan (the default) is one of the two personal loans a person may run, may be bought out
// by a new personal loan and may be paid off to make room for a mortgage; a mortgage never is any of those — it counts in the
// mortgage limit with the new mortgages. Untyped loans are personal, so older scenarios are unchanged. Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios } = require('./helpers.js');
const E = loadEngine();

const key = (m) => JSON.stringify(m.results.map((r) => r && [r.feasible, !!r.bridged, r.econAdv, r.advantage, r.minCash, r.onHandAtMoveIn, r.facilities.map((f) => [f.key, f.amount, f.startedAt])]).concat([m.verdict, m.household.capTimeline.map((c) => [c.t, c.room, c.mortRoom, c.pl2Room, c.maxMortgage])]));
const typed = (inp, type) => { const p = E.mergeRE(inp); return { ...p, existingLoans: p.existingLoans.map((l) => ({ ...l, type })) }; };

test('untyped loans are personal loans: the same numbers as typing every loan "personal"', () => {
  for (const { label, inp } of scenarios(E, 40)) assert.equal(key(E.computeRE(typed(inp, 'personal'), { noNeed: true })), key(E.computeRE(inp, { noNeed: true })), label);
  assert.equal(E.mergeRE({ existingLoans: [{ balance: 1000, installment: 100, monthsLeft: 12, rate: 5 }] }).existingLoans[0].type, 'personal');
  assert.equal(E.mergeRE({ existingLoans: [{ balance: 1000, installment: 100, monthsLeft: 12, rate: 5, type: 'mortgage' }] }).existingLoans[0].type, 'mortgage');
});

// a household with an existing home mortgage and a car loan, buying a large plot (the land mortgage is held back by the limits)
const BASE = { mode: 'home', acquire: 'build', income: 60000, livingExpenses: 15000, rentNow: 0, cashAvailable: 6000000, dbrCap: 65, mortgageCap: 55, perLoanCap: 33, landArea: 2000, landPrice: 3000, landLtv: 90, lmRate: 4.5, lmTenure: 25, landMonth: 2, buildStart: 4, buildMonths: 18, horizon: 15, ownedValue: 0,
  existingLoans: [{ id: 1, name: 'Home mortgage', balance: 1500000, installment: 12000, monthsLeft: 180, rate: 4.5, type: 'mortgage', ageMonths: 24 }, { id: 2, name: 'Car', balance: 120000, installment: 3500, monthsLeft: 40, rate: 6, ageMonths: 20 }],
  plans: [{ lmUse: true, plWhen: 'build', plSplit: true, pl2Use: false, coUse: false, eqWhen: 'none', settlePolicy: 'forMax', refiMode: 'cash', enabled: true }] };

test('an existing mortgage counts in the mortgage limit with the new mortgage; typed personal it did not', () => {
  // old loans kept, so only the limits size the land mortgage
  const keep = { ...BASE, plans: [{ ...BASE.plans[0], settlePolicy: 'none' }] };
  const r = E.computeRE(keep, { noNeed: true }).results[0], r0 = E.computeRE(typed(keep, 'personal'), { noNeed: true }).results[0];
  // the land mortgage: 55% × 60,000 = 33,000 for all mortgages, less the 12,000 already paid → 21,000/mo; typed personal, only the
  // 65% bucket held it: 39,000 − 15,500 = 23,500
  assert.ok(Math.abs(r.lm.pmt - 21000) < 1, `${r.lm.pmt}`);
  assert.ok(Math.abs(r0.lm.pmt - 23500) < 1, `${r0.lm.pmt}`);
  // with "pay off old loans for the largest mortgage", typed personal the old logic even paid off the 1.5M "mortgage" from cash
  const rf0 = E.computeRE(typed(BASE, 'personal'), { noNeed: true }).results[0], rf = E.computeRE(BASE, { noNeed: true }).results[0];
  assert.ok(rf0.payoffs.some((x) => x.name === 'Home mortgage') && !rf.payoffs.some((x) => x.name === 'Home mortgage'));
  assert.match(r.lm.capacity.limitedBy, /mortgage cap/);
  const mo = r.months[r.lm.startedAt + 1];
  assert.ok(mo.lmPay + 12000 <= 0.55 * 60000 + 1e-6);
  // the room table says the same today
  const c = E.computeRE(BASE, { noNeed: true }).household, c0 = E.computeRE(typed(BASE, 'personal'), { noNeed: true }).household;
  assert.ok(Math.abs(c.capTimeline[0].mortRoom - 21000) < 1e-6 && Math.abs(c0.capTimeline[0].mortRoom - 23500) < 1e-6);
  assert.ok(Math.abs(c.mortgageRoom - 21000) < 1e-6);
  // …and when the existing mortgage alone passes the limit, the household is warned
  const over = E.computeRE({ ...BASE, existingLoans: [{ ...BASE.existingLoans[0], installment: 33800, balance: 3900000 }] }, { noNeed: true });
  assert.ok(over.household.warnings.some((w) => /existing mortgage already takes/.test(w)));
});

test('an existing mortgage is not a personal-loan slot, is never bought out and never paid off to make room', () => {
  const keep = { ...BASE, plans: [{ ...BASE.plans[0], settlePolicy: 'none' }] };
  const rk = E.computeRE(keep, { noNeed: true }).results[0], rk0 = E.computeRE(typed(keep, 'personal'), { noNeed: true }).results[0];
  // the personal loan step never offers the mortgage for a buy-out; typed personal, it did
  assert.ok(rk.pl.amount > 0 && !rk.pl.refiOld.some((l) => l.name === 'Home mortgage') && rk0.pl.refiOld.some((l) => l.name === 'Home mortgage'));
  const r = E.computeRE(BASE, { noNeed: true }).results[0];
  assert.ok(!(r.pl.refi && r.pl.refi.names.includes('Home mortgage')));
  assert.ok(r.payoffs.every((x) => x.name !== 'Home mortgage'), 'forMax never settles the mortgage');
  assert.ok(!r.events.some((e) => /Cannot pay off Home mortgage|Settle Home mortgage/.test(e.text)));
  // the room table: the mortgage leaves both personal-loan slots free (two loans may use all the room); typed personal it took one
  const one = { ...BASE, existingLoans: [BASE.existingLoans[0]] };
  const c = E.computeRE(one, { noNeed: true }).household.capTimeline[0], c0 = E.computeRE(typed(one, 'personal'), { noNeed: true }).household.capTimeline[0];
  assert.ok(Math.abs(c.pl2Room - c.room) < 1e-6 && Math.abs(c0.pl2Room - Math.min(c0.room, 60000 * 0.33)) < 1e-6 && c0.pl2Room < c.pl2Room, JSON.stringify([c.room, c.pl2Room, c0.pl2Room]));
});

test('random scenarios with a typed mortgage: the mortgage limit holds every month and the mortgage is never touched', () => {
  let n = 0;
  for (const { label, inp } of scenarios(E, 60)) {
    if (!(inp.existingLoans || []).length) continue;
    const q = { ...inp, existingLoans: inp.existingLoans.map((l, i) => i === 0 ? { ...l, type: 'mortgage' } : l) }, mort = q.existingLoans[0];
    const m = E.computeRE(q, { noNeed: true }), p = m.p, cap = (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100;
    m.results.forEach((r, i) => {
      if (!r) return;
      const end = r.loansEnd.find((x) => String(x.id) === String(mort.id));
      const running = (t) => t <= Math.round(mort.monthsLeft) && (end.settledAt == null || end.settledAt > t) ? Math.max(mort.installment, E.rePmt(mort.balance, mort.rate, Math.max(1, Math.round(mort.monthsLeft)))) : 0;
      for (const f of r.facilities.filter((f) => ['lm', 'eq', 'co'].includes(f.key) && f.amount > 0)) {
        const t = f.startedAt + 1, mo = r.months[t]; if (!mo) continue;
        assert.ok(mo.lmPay + mo.eqPay + mo.coPay - mo.extraPay + running(t) <= cap * mo.inc + 1e-6, `${label} S${i + 1} ${f.key} M${t}`);
        n++;
      }
      for (const f of [r.pl, r.pl2, r.spl, r.spl2]) if (f && f.refi) assert.ok(!f.refi.names.includes(mort.name), `${label} S${i + 1}: bought out`);
      for (const x of r.payoffs) if (x.name === mort.name) assert.ok(mort.settleAt != null && Math.round(mort.settleAt) === x.t, `${label} S${i + 1}: settled for room`);
    });
  }
  assert.ok(n > 30, `${n}`);
});

test('loan import reads the type', () => {
  const a = E.parseLoans(JSON.stringify([{ name: 'Home', balance: 900000, installment: 7000, monthsLeft: 150, rate: 4, type: 'Mortgage' }, { name: 'Car', balance: 50000, installment: 1500, monthsLeft: 36, rate: 5 }]));
  assert.deepEqual(a.map((l) => l.type), ['mortgage', 'personal']);
});
