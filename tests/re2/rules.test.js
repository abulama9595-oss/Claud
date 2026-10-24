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

test('home value: the self-build uplift applies to construction only; overruns add cost, not value; land broker fee is a cost', () => {
  const base = { appreciation: 0, costInflation: 0, landMonth: 0, buildStart: 0, devMarginPct: 10, vatPct: 15, landBrokerPct: 2.5 };
  const a = E.computeRE(base).prj;
  assert.ok(Math.abs(a.value0 - (a.land + (a.hard + a.soft + a.finish) * 1.1)) < 1e-6, 'value at completion');
  assert.ok(Math.abs(a.landBroker - a.land * 0.025) < 1e-6 && Math.abs(a.schedule[0] - (a.land + a.rett + a.landBroker)) < 1e-6, 'broker fee paid with the land');
  const b = E.computeRE({ ...base, overrunPct: 20 }).prj;
  assert.ok(Math.abs(b.total - a.total - (a.hard + a.soft + a.cont + a.finish) * 0.2 * 1.15) < 1e-6, 'overrun + VAT added to the cost');
  assert.equal(b.value0, a.value0, 'overrun does not raise the value');
  const spend = (prj) => prj.schedule.reduce((x, y) => x + (y || 0), 0);
  assert.ok(Math.abs(spend(b) - b.total) < 1e-6, 'every riyal of cost is in the spend schedule');
});

test('home value: the land grows with the market; the building is worth cost × uplift at completion, then loses 2% of that a year', () => {
  const base = { appreciation: 3, costInflation: 0, landMonth: 6, buildStart: 12, buildMonths: 18, devMarginPct: 20, buildDeprPct: 2 };
  const prj = E.computeRE(base).prj, done = prj.start + prj.bm, bv = (prj.hard + prj.soft + prj.finish) * 1.2, landAt = (t) => prj.land * Math.pow(1.03, (t - 6) / 12);
  const near = (x, y) => Math.abs(x - y) < 1e-6;
  assert.equal(prj.valueAt(5), 0, 'nothing before the land is bought');
  assert.ok(near(prj.valueAt(prj.start), landAt(prj.start)), 'only the land before construction');
  assert.ok(near(prj.valueAt(prj.start + 9), landAt(prj.start + 9) + bv * 0.5), 'the building accrues with progress, no growth while it is built');
  assert.ok(near(prj.value0, landAt(done) + bv), 'at completion: land grown + building at cost × uplift');
  assert.ok(near(prj.valueAt(done + 12), landAt(done + 12) + bv * 0.98) && near(prj.valueAt(done + 60), landAt(done + 60) + bv * 0.9), 'straight-line: 2% of the completion value a year');
  assert.ok(near(prj.valueAt(done + 12 * 60), landAt(done + 12 * 60)), 'the building never goes below zero');
  const flat = E.computeRE({ ...base, buildDeprPct: 0 }).prj;
  assert.ok(near(flat.valueAt(done + 120), landAt(done + 120) + bv), 'no depreciation: the building keeps its value');
  const buy = E.computeRE({ acquire: 'buy', propertyPrice: 2000000, finishExtra: 0, appreciation: 3, landMonth: 0 }).prj;
  assert.ok(near(buy.valueAt(24), 2000000 * Math.pow(1.03, 2)), 'a ready home keeps growing with the market');
});

test('all mortgages together stay within the mortgage cap', () => {
  const plan = { ...E.RE_PLAN_PRESETS.landPlusOwned, enabled: true, settlePolicy: 'none' };
  const m = E.computeRE({ income: 80000, existingLoans: [], ownedValue: 9000000, landArea: 800, landPrice: 5000, plans: [plan, { ...plan, enabled: false }, { ...plan, enabled: false }, { ...plan, enabled: false }] });
  const r = m.results[0], peak = Math.max(...r.months.map((x) => x.lmPay + x.eqPay + x.coPay - x.extraPay));
  assert.ok(r.lm.amount > 0 && r.eq.amount > 0, 'both mortgages were taken');
  assert.ok(peak <= 80000 * m.p.mortgageCap / 100 + 1e-6, `mortgages ${peak} > ${80000 * m.p.mortgageCap / 100}`);
});

test('income and living costs grow in yearly steps, and the bank limits follow income', () => {
  const m = E.computeRE({ incomeGrowth: 10, livingGrowth: 5 }), r = m.results.find(Boolean);
  assert.equal(r.months[12].inc, m.p.income);
  assert.ok(Math.abs(r.months[13].inc - m.p.income * 1.1) < 1e-6 && Math.abs(r.months[25].liv - m.p.livingExpenses * 1.05 ** 2) < 1e-6);
  const rows = m.household.capTimeline;
  assert.ok(rows.some((x) => x.income > m.p.income), 'the capacity timeline shows the higher income');
});

test('short horizon: the old-loan balance the not-building side still owes is credited to a strategy that paid it off', () => {
  const big = { id: 1, name: 'Long loan', balance: 2500000, installment: 36600, monthsLeft: 84, rate: 6 };
  const plan = { ...E.RE_PLAN_PRESETS.landPlusOwned, enabled: true, settlePolicy: 'forMax' };
  const m = E.computeRE({ horizon: 5, existingLoans: [big], cashAvailable: 4000000, plans: [plan, { ...plan, enabled: false }, { ...plan, enabled: false }, { ...plan, enabled: false }] });
  const r = m.results[0], end = r.months[r.months.length - 1];
  assert.ok(r.payoffs.some((x) => x.name === 'Long loan'), 'the loan was paid off');
  let bal = 2500000; const inst = Math.max(36600, E.rePmt(2500000, 6, 84));
  for (let t = 1; t <= 60; t++) bal -= inst - bal * 0.005;
  assert.ok(Math.abs(end.oldDebtGap - bal) < 1e-3, `credited ${end.oldDebtGap} vs still owed by the baseline ${bal}`);
});

test('a planned settlement happens on both sides, so it does not change the comparison', () => {
  const loan = { id: 1, name: 'Old', balance: 300000, installment: 9000, monthsLeft: 40, rate: 6.5 };
  const plans = [{ ...E.RE_PLAN_PRESETS.allCash, enabled: true }, null, null, null].map((o) => o || { ...E.RE_PLAN_PRESETS.allCash, enabled: false });
  const base = { cashAvailable: 10000000, existingLoans: [loan], plans };
  const a = E.computeRE(base).results[0], b = E.computeRE({ ...base, existingLoans: [{ ...loan, settleAt: 6 }] }).results[0];
  assert.ok(b.payoffs.length === 1 && b.months[6].renterSettle > 0, 'paid off on both sides');
  assert.ok(Math.abs(a.advantage - b.advantage) < 1e-3, `advantage ${a.advantage} vs ${b.advantage}`);
});

test('everything grows: value in today\'s money = the extra flows discounted at the return on cash (while cash stays positive)', () => {
  let checked = 0;
  for (const inp of [{ cashAvailable: 6000000 }, { cashAvailable: 9000000, rentNow: 0, altReturn: 4 }, { cashAvailable: 5000000, income: 120000 }]) {
    const m = E.computeRE(inp), alt = Math.pow(1 + m.p.altReturn / 100, 1 / 12) - 1;
    for (const r of m.results.filter(Boolean)) {
      if (r.months.some((x) => x.cash <= 0 || x.rCash <= 0)) continue;
      const f = E.reEconFlows(r), npv = f.reduce((a, c, t) => a + c / Math.pow(1 + alt, t), 0);
      assert.ok(Math.abs(npv - r.econPV) < 1e-3 * Math.max(1, Math.abs(r.econPV) / 1e6), `NPV ${npv} vs ${r.econPV}`);
      const irr = E.reEconIRR(r);
      if (irr != null) { const m12 = Math.pow(1 + irr, 1 / 12); const z = f.reduce((a, c, t) => a + c / Math.pow(m12, t), 0); assert.ok(Math.abs(z) < 1, `IRR does not zero the flows (${z})`); }
      checked++;
    }
  }
  assert.ok(checked >= 3, `only ${checked} strategies checked`);
});

test('strategies are ranked and judged by the everything-grows measure', () => {
  const m = E.computeRE({});
  const ok = m.ranked.filter((r) => r.feasible && r.recoveryOk);
  for (let k = 1; k < ok.length; k++) assert.ok(ok[k - 1].econAdv >= ok[k].econAdv);
  assert.equal(m.bestFeasible.econAdv > 0, m.verdict === 'OWNING WINS' || m.verdict === 'BUILDING WINS');
});

// two old personal loans: one cheaper than a new personal loan, one dearer
const REFI = (mode, pick) => {
  const plan = { ...E.RE_PLAN_PRESETS.cashPlusPersonal, enabled: true, plWhen: 'build', refiMode: mode, refiPick: pick || null };
  return E.computeRE({ income: 90000, cashAvailable: 4000000, plRate: 6, rateQuote: 'apr', buildStart: 6, landMonth: 0,
    existingLoans: [{ id: 1, name: 'Cheap', balance: 400000, installment: 9000, monthsLeft: 50, rate: 2, ageMonths: 30 }, { id: 2, name: 'Dear', balance: 300000, installment: 9500, monthsLeft: 40, rate: 12, ageMonths: 30 }],
    plans: [plan, { ...plan, enabled: false }, { ...plan, enabled: false }, { ...plan, enabled: false }] }).results[0];
};
const bought = (r) => (r.pl.refi ? r.pl.refi.names : []).slice().sort().join('+');

test('refinance: best value keeps a loan cheaper than the new one; most cash takes what releases the most; your pick is followed', () => {
  const v = REFI('value'), c = REFI('cash');
  assert.ok(!bought(v).includes('Cheap'), `value mode bought out ${bought(v)}`);
  assert.ok(c.pl.refi && (c.pl.amount - c.pl.refi.payoff) >= (v.pl.amount - (v.pl.refi ? v.pl.refi.payoff : 0)) - 1, 'most cash releases at least as much cash');
  assert.equal(bought(REFI('pick', { pl: ['2'] })), 'Dear');
  assert.equal(bought(REFI('pick', { pl: [] })), '');
});

test('early mortgage payoff (your option): paid from cash after move-in, with the 3-month fee, and no instalments after', () => {
  const plan = { ...E.RE_PLAN_PRESETS.landMortgage, enabled: true, prepayAfter: 12 };
  const m = E.computeRE({ cashAvailable: 9000000, existingLoans: [], plans: [plan, { ...plan, enabled: false }, { ...plan, enabled: false }, { ...plan, enabled: false }] });
  const r = m.results[0], t = m.prj.occupy + 12, x = r.prepaid[0];
  assert.ok(x && x.t === t && x.key === 'lm', 'the land mortgage was paid off at move-in + 12');
  const prev = r.months[t - 1].debtLm, balBefore = prev - (r.months[t].lmPay - prev * r.lm.rate / 1200);   // balance after that month's instalment
  assert.ok(x.fee > 0 && Math.abs(x.cost - x.fee - balBefore) < 1e-3, `payoff ${x.cost - x.fee} vs balance ${balBefore}`);
  assert.equal(r.months[t].debtLm, 0);
  assert.ok(r.months.slice(t + 1).every((mo) => mo.lmPay === 0), 'no instalments after the payoff');
});

test('optimizer slices merge to exactly the full search', () => {
  const inp = { ownedValue: 3000000 };
  const full = E.optimizeRE(inp, { delays: [6] }).starts[0];
  const n = E.optimizeRE(inp, { delays: [6], slice: [0, 1] }).combos, parts = [];
  for (let a = 0; a < n; a += 48) parts.push(E.optimizeRE(inp, { delays: [6], slice: [a, Math.min(n, a + 48)] }).part);
  const merged = E.optimizeRE(inp, { merge: { delay: 6, planned: false, parts } }).start;
  assert.equal(merged.best.name, full.best.name);
  assert.ok(Math.abs(merged.best.econAdv - full.best.econAdv) < 1e-6);
  assert.equal(JSON.stringify(merged.alts.map((a) => a.name)), JSON.stringify(full.alts.map((a) => a.name)));
  assert.equal(merged.nOk, full.nOk);
});
