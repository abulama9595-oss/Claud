// The settle-or-keep advisor (reSettleAdvice), the PV maths it shares with the refinance step (rePvPayments), the "dearer"
// settle policy and the liability picture (reLiability). Synthetic figures only — the worked examples are the spec's.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, scenarios2, FAMILY2, FAMILY3 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// the spec's household: cash earns 6% less 2.5% zakat = 3.35%; a new personal loan costs 4.25% flat over 60 months = 7.86% APR
const BASE = { income: 60000, livingExpenses: 15000, rentNow: 0, cashAvailable: 1500000, cashBuffer: 100000, altReturn: 6, cashZakatPct: 2.5, rateQuote: 'flat', plRate: 4.25, plTenure: 5, properties: [] };
const advice = (loan, more) => E.reSettleAdvice({ ...BASE, ...(more || {}), existingLoans: [loan] })[0];

test('the spec\'s worked examples give the spec\'s verdicts', () => {
  const a = advice({ id: 1, name: 'Car', balance: 58421, installment: 1686.25, monthsLeft: 36, ageMonths: 24, rate: 1.3, rateType: 'flat' });
  assert.ok(near(a.cashReturn, 3.35, 1e-3) && near(a.newApr, 7.86, 1e-3) && near(a.apr, 2.51, 1e-2), JSON.stringify([a.cashReturn, a.newApr, a.apr]));
  // Ex 1: a cheap car loan — keep (settling costs more than it saves; a buy-out even more)
  assert.equal(a.verdict, 'keep'); assert.ok(a.saveSettle < 0 && a.saveBuyout < 0 && near(a.fee, 356, 2e-3) && /cheaper than your cash earns/.test(a.why), a.why);
  assert.ok(a.flatRate === 1.3 && near(a.flatEquiv, 1.3, 1e-6), 'the hamish rate is shown as entered, and matches the APR over the whole term');
  // Ex 2: 7.5% APR, 15 months left — keep: the 3-month fee eats the saving (+1K < 2,000); the room figure says what clearing its 7,000/mo would free
  const b = advice({ id: 2, name: 'Ex2', balance: 99931, installment: 7000, monthsLeft: 15, ageMonths: 20, rate: 7.5 });
  assert.equal(b.verdict, 'keep'); assert.ok(b.saveSettle > 0 && b.saveSettle < b.eps && b.eps === 2000 && near(b.fee, 1754, 2e-3), JSON.stringify([b.saveSettle, b.eps, b.fee]));
  assert.ok(near(b.roomValue, b.inst * b.roomPerRiyal) && near(b.inst, 7000, 1e-4) && /frees ≈/.test(b.why) && /save only/.test(b.why), b.why);
  // Ex 3: the same loan with 48 months left — settle from cash (+19K ≥ ε); without the cash, keep and say why
  const c = advice({ id: 3, name: 'Ex3', balance: 289509, installment: 7000, monthsLeft: 48, ageMonths: 20, rate: 7.5 });
  assert.equal(c.verdict, 'settleCash'); assert.ok(c.saveSettle >= c.eps && c.saveBuyout < 0 && near(c.fee, 5331, 2e-3) && c.why.includes(E.fS(c.saveSettle)) && c.why.includes(E.fSAR(c.fee)), c.why);
  const c2 = advice({ id: 3, name: 'Ex3', balance: 289509, installment: 7000, monthsLeft: 48, ageMonths: 20, rate: 7.5 }, { cashAvailable: 300000 });
  assert.equal(c2.verdict, 'keep'); assert.ok(!c2.cashOk && /does not cover/.test(c2.why), c2.why);
  const c3 = advice({ id: 3, name: 'Ex3', balance: 289509, installment: 7000, monthsLeft: 48, ageMonths: 20, rate: 7.5, canSettle: false });
  assert.equal(c3.verdict, 'keep'); assert.ok(/not to be settled/.test(c3.why), c3.why);
  // Ex 4: 300,000 at 9.5% APR, 18 of 60 paid — settle from cash; a like-for-like buy-out saves too little; one over 60 months is relief, not a saving
  const d = advice({ id: 4, name: 'Ex4', balance: 224378, installment: 6300.5, monthsLeft: 42, ageMonths: 18, rate: 9.5 });
  assert.equal(d.verdict, 'settleCash'); assert.ok(d.saveSettle >= d.eps && d.saveBuyout > 0 && d.saveBuyout < d.eps && near(d.fee, 5221, 2e-3) && near(d.pmtBuyout, 6271, 2e-3), JSON.stringify([d.saveSettle, d.saveBuyout, d.eps, d.pmtBuyout]));
  assert.ok(d.stretch && d.stretch.months === 60 && near(d.stretch.inst, 4640, 2e-3) && d.stretch.saving < 0 && d.stretch.isSaving === false && near(d.stretch.relief, d.inst - d.stretch.inst), JSON.stringify(d.stretch));
  assert.ok(/instalment relief, not a saving/.test(d.why) && d.why.includes(E.fSAR(d.stretch.inst)), d.why);
  // the rule-7 view (no discounting) sits alongside: the profit still to pay against the fee
  for (const x of [a, b, c, d]) { let bal = x.balance, prof = 0; while (bal > 0.5) { const i = bal * x.apr / 1200; prof += i; bal -= Math.min(bal + i, x.inst) - i; } assert.ok(near(x.rule7.profitLeft, prof) && near(x.rule7.settleSaves, prof - x.fee), `${x.name}: rule-7 view`); }
});

test('a dear personal loan the bank may buy out: "buyout" when new money is clearly cheaper and your cash cannot settle it; a mortgage is never bought out; a loan too young or marked not refinanceable is not', () => {
  const dear = { id: 5, name: 'Dear', balance: 300000, installment: 7900, monthsLeft: 48, ageMonths: 24, rate: 12 };
  const a = advice(dear, { cashAvailable: 200000 });
  assert.equal(a.verdict, 'buyout'); assert.ok(a.saveBuyout >= a.eps && a.apr > a.newApr + 0.5 && a.fits && !a.cashOk && /no cash from you/.test(a.why), a.why);
  // with the cash, settling saves more than the buy-out, so settle from cash
  assert.equal(advice(dear).verdict, 'settleCash');
  // the same loan secured on a property: a mortgage — never bought out (new money = the owned-property mortgage terms)
  const mort = advice({ ...dear, type: 'mortgage' }, { cashAvailable: 200000, eqRate: 5, eqTenure: 18 });   // (BASE quotes rates flat: 5% flat over 18 years is the APR reFlatToApr gives)
  assert.ok(mort.verdict !== 'buyout' && mort.type === 'mortgage' && near(mort.newApr, E.reFlatToApr(5, 216)) && mort.newTenure === 216 && mort.stretch === null, JSON.stringify([mort.verdict, mort.newApr, mort.newTenure]));
  assert.ok(advice({ ...dear, ageMonths: 6 }, { cashAvailable: 200000 }).verdict !== 'buyout', 'too young to refinance');
  assert.ok(advice({ ...dear, canRefi: false }, { cashAvailable: 200000 }).verdict !== 'buyout', 'marked not refinanceable');
  // a cheap loan whose instalment blocks the purchase mortgage today: "settle only to make room"
  const room = E.reSettleAdvice({ ...BASE, income: 20000, cashAvailable: 3000000, landArea: 800, landPrice: 6000, existingLoans: [{ id: 6, name: 'Cheap', balance: 200000, installment: 6000, monthsLeft: 36, ageMonths: 12, rate: 2 }] })[0];
  assert.equal(room.verdict, 'room'); assert.ok(room.cheap && room.mortgageBound && /unless a mortgage needs the room/.test(room.why) && room.why.includes(E.fS(room.roomValue)), room.why);
  // computeRE carries the rows; تضامن adds your spouse's loans with their owner
  const m = E.computeRE({ ...FAMILY2, joint: { on: true, income: 20000, loans: [{ id: 's1', name: 'Spouse car', balance: 60000, installment: 2000, monthsLeft: 36, rate: 5 }] } }, { noNeed: true });
  assert.deepEqual(m.household.settleAdvice.map((x) => [x.name, x.owner]), [['Car', 'A'], ['Personal', 'A'], ['Spouse car', 'B']]);
  assert.ok(m.household.settleAdvice.every((x) => ['keep', 'buyout', 'settleCash', 'room'].includes(x.verdict) && typeof x.why === 'string' && x.why.length > 20));
});

test('rePvPayments reproduces every refinance option\'s value (the maths the refinance step uses, now shared with the advisor)', () => {
  let n = 0;
  for (const { label, inp } of scenarios(E, 40)) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p, alt = Math.pow((1 + p.altReturn / 100) * (1 - (p.cashZakatPct || 0) / 100), 1 / 12) - 1;
    m.results.forEach((r, i) => {
      if (!r) return;
      const H = r.months.length - 1;
      for (const f of [r.pl, r.pl2]) {
        if (!f || !f.refiOptions || !f.refiOptions.length) continue;
        const t = f.capacity ? f.capacity.t : f.startedAt;
        for (const o of f.refiOptions) {
          const parts = o.split ? o.split : [o.amount];
          const pvNew = parts.reduce((a, x) => a + (x > 1 ? E.rePvPayments(x, f.rate, E.rePmt(x, f.rate, f.n), 1, t, H, alt) : 0), 0);
          const pvOld = o.ids.reduce((a, id) => { const l = f.refiOld.find((x) => x.id === id); return a + E.rePvPayments(l.bal, l.apr, l.inst, 0, t, H, alt); }, 0);
          assert.ok(near(o.value, o.net - pvNew + pvOld, 1e-9), `${label} S${i + 1} ${f.key}: ${o.value} vs ${o.net - pvNew + pvOld}`);
          n++;
        }
      }
    });
  }
  assert.ok(n > 200, `${n} options checked`);
  // the function itself: payments from month t + firstK to H, the balance left at H discounted at H − t
  const v = E.rePvPayments(120000, 6, 2000, 1, 10, 40, 0.004);
  let b = 120000, pv = 0, k = 1; while (b > 0.5 && 10 + k <= 40) { const i = b * 0.005, pay = Math.min(b + i, 2000); b -= pay - i; pv += pay / Math.pow(1.004, k); k++; }
  assert.ok(near(v, pv + b / Math.pow(1.004, 30), 1e-12));
});

test('settlePolicy "dearer": only old loans dearer than the mortgage being granted are paid off for its room, never a mortgage; the other policies are unchanged', () => {
  // the land mortgage is held by the debt-burden test, so paying off old loans lets the bank lend more
  const inp = { income: 60000, livingExpenses: 15000, rentNow: 0, cashAvailable: 6000000, landArea: 1200, landPrice: 5000, lmRate: 5, lmTenure: 20, eqRate: 5, dbrCap: 65, mortgageCap: 55, properties: [],
    existingLoans: [{ id: 1, name: 'Cheap', balance: 400000, installment: 8000, monthsLeft: 60, rate: 3 }, { id: 2, name: 'Dear', balance: 300000, installment: 7000, monthsLeft: 50, rate: 8 }, { id: 3, name: 'Just above', balance: 200000, installment: 4000, monthsLeft: 55, rate: 5.2 }, { id: 4, name: 'Home mortgage', balance: 900000, installment: 6000, monthsLeft: 200, rate: 9, type: 'mortgage' }] };
  const run = (policy, more) => E.computeRE({ ...inp, ...(more || {}), plans: [{ enabled: true, lmUse: true, settlePolicy: policy }] }, { noNeed: true }).results[0];
  const d = run('dearer'), f = run('forMax'), a = run('asNeeded'), none = run('none');
  const paid = (r) => r.payoffs.map((x) => x.name).sort().join('+');
  assert.equal(paid(d), 'Dear', `dearer paid off ${paid(d)}`);
  assert.equal(paid(f), 'Cheap+Dear+Just above', `forMax paid off ${paid(f)}`);
  assert.ok(!paid(d).includes('Home mortgage') && !paid(f).includes('Home mortgage'), 'a mortgage is never settled for room');
  assert.ok(d.lm.amount > a.lm.amount || d.lm.amount >= f.lm.amount - 1 || d.lm.amount > none.lm.amount, 'the mortgage grows with the room freed');
  assert.ok(d.lm.amount <= f.lm.amount + 1 && d.lm.amount >= none.lm.amount - 1, 'between keeping every loan and paying off every loan');
  assert.ok(d.events.some((e) => e.kind === 'settle' && /dearer than the mortgage/.test(e.text)), 'the row says why');
  // the margin is a setting: at 2.5 points "Just above" (5.2% vs 5%) stays out, at 0.1 it goes
  assert.equal(paid(run('dearer', { dearerMargin: 0.1 })), 'Dear+Just above');
  assert.equal(paid(run('dearer', { dearerMargin: 3.5 })), '');
  // never for a personal loan step (the plan says no land mortgage: the default plan slot would add one)
  const pl = E.computeRE({ ...inp, plans: [{ enabled: true, lmUse: false, plWhen: 'start', settlePolicy: 'dearer' }] }, { noNeed: true }).results[0];
  assert.equal(pl.payoffs.length, 0);
  // the legacy value "all" is "asNeeded"; with every loan counted as dearer the policy is forMax, with none it is "none"
  const key = (r) => JSON.stringify([r.feasible, r.econAdv, r.minCash, r.facilities.map((x) => [x.key, x.amount, x.startedAt]), r.payoffs.map((x) => [x.t, x.name])]);
  for (const { inp: q } of scenarios2(E, 10)) {
    const with_ = (policy, more) => E.computeRE({ ...q, ...(more || {}), plans: E.mergeRE(q).plans.map((o) => ({ ...o, settlePolicy: policy })) }, { noNeed: true }).results.map((r) => r && key(r)).join('/');
    assert.equal(with_('all'), with_('asNeeded'));
    assert.equal(with_('dearer', { dearerMargin: -1e9 }), with_('forMax'));
    assert.equal(with_('dearer', { dearerMargin: 1e9 }), with_('none'));
  }
  // the plan's description says it
  const p = E.mergeRE({ ...inp, plans: [{ enabled: true, lmUse: true, settlePolicy: 'dearer' }] });
  assert.match(E.describePlan(p.plans[0], p, E.reProject(p), true), /only old loans dearer than the new mortgage/);
  assert.equal(E.RE_BASE.dearerMargin, 0.25);
});

test('reLiability: the new loans\' rows add up to newDebtTotal, the old loans carry their state, debt by year matches years[], what is owed at year X is that month\'s debt', () => {
  let n = 0, states = {};
  for (const { label, inp } of scenarios2(E, 30).concat([{ label: 'family3', inp: FAMILY3 }])) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p;
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`, L = E.reLiability(r, p, m.prj), H = r.months.length - 1;
      assert.ok(near(L.rows.reduce((a, x) => a + x.amount, 0), r.newDebtTotal), `${at}: rows sum to newDebtTotal`);
      assert.equal(L.rows.length, r.facilities.filter((f) => f.amount > 0).length, `${at}: one row per loan taken`);
      for (const x of L.rows) assert.ok(x.from === r.facilities.find((f) => f.key === x.key).startedAt && x.to >= x.from && x.inst > 0 && x.apr >= 0 && x.effective >= x.apr - 1e-9 && typeof x.securedOn === 'string' && (['you', 'your spouse'].includes(x.borrower) || /you \+ spouse/.test(x.borrower)), `${at} ${x.key}: row`);
      assert.equal(L.old.length, p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).length, `${at}: one row per old loan`);
      for (const o of L.old) { states[o.state.kind] = (states[o.state.kind] || 0) + 1; const e = r.loansEnd.find((x) => `old:${x.id}` === o.key); assert.ok(e && (o.state.kind !== 'kept') === (e.settledAt != null), `${at} ${o.label}: state ${o.state.kind}`); }
      assert.equal(L.debtByYear.length, r.years.length);
      L.debtByYear.forEach((y, k) => assert.ok(y.total === r.years[k].debt && y.existing === r.years[k].debtExisting && y.lm === r.years[k].debtLm && y.eq === r.years[k].debtEq && y.pl === r.years[k].debtPl && y.co === r.years[k].debtCo, `${at} Y${k}: debt by year`));
      for (const y of [0, 5, 10, null]) { const w = L.owedAt(y), t = y == null ? H : Math.min(H, y * 12); assert.ok(w.t === t && w.total === r.months[t].debt && near(w.total, w.existing + w.newDebt), `${at}: owed at ${y}`); }
      assert.ok(L.peakDebt === r.peakDebt && L.peakDebtT === r.peakDebtT && L.peakInst === r.peakInst && L.peakInstT === r.peakInstT && L.profitPaid === r.newDebtInterest && L.debtFreeT === r.debtFreeT && L.incomeAtPeak === r.months[r.peakInstT].inc, `${at}: the figures are the engine's`);
      n++;
    });
  }
  assert.ok(n > 100 && states.kept > 0 && (states.boughtOut > 0 || states.settled > 0), JSON.stringify(states));
  assert.equal(E.RE_LENS_MEASURES.map((x) => x[0]).join(','), 'peakDebt,borrowed,peakInst,profit');
  assert.equal(Object.keys(E.RE_SETTLE_VERDICT).join(','), 'keep,buyout,settleCash,room');
});
