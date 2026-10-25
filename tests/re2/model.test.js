// The v2 data model: mergeRE derives the project from `kind`, normalises the properties you own and a plan's mortgages on them,
// and brings an old-tool scenario across once (re2Import) so that the NEW engine gives the OLD engine's numbers. The new
// settings: propertyValueBasis (what a mortgage on a property you own is sized on) and samaBands (SAMA's bands for a single
// borrower). Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, scenarios2, jointScenarios, randomScenario, FAMILY } = require('./helpers.js');
const E = loadEngine(), OLD = loadEngine(true);
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
// JSON with sorted keys, so two objects that mean the same compare equal whatever the order their keys were written in
const stable = (v) => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x);
// what a scenario's answer is made of (the parity test's key, plus the home you live in and the household's room)
// (a mortgage on a property you own is eq:<id> in the new engine; the old engine's eq is the same loan, compared by the old name)
const fk = (k) => String(k).replace(/^eq:.*$/, 'eq');
const key = (m) => JSON.stringify({ v: m.verdict, t: Math.round(m.prj.total), d: m.household.dbrRoom, h: m.household.capTimeline.map((c) => [c.t, c.room, c.maxMortgage, c.maxTwoPl]),
  r: m.results.map((r) => r && { f: r.feasible, b: !!r.bridged, e: r.econAdv, a: r.advantage, mc: r.minCash, oh: r.onHandAtMoveIn, pk: r.peakInst, nd: r.newDebtTotal, ni: r.newDebtInterest, ok: r.dbrOk, op: r.ownPlan, os: r.ownSale ? [r.ownSale.t, r.ownSale.net, r.ownSale.payoff] : null,
    cov: r.covered ? [fk(r.covered.key), r.covered.at, r.covered.amount] : null, fac: r.facilities.filter((f) => f.amount > 0).map((f) => [fk(f.key), f.amount, f.startedAt, f.pmt, f.settledAt]), ev: r.events.filter((e) => e.kind !== 'milestone').length, fl: r.flags.length,
    m: r.months.map((x) => [x.cash, x.avail, x.debt, x.econAdv, x.netWorth, x.plPay, x.eqPay, x.ownIn, x.ownGone]) }) });

test('mergeRE: idempotent; mode and acquire follow the kind; properties and a plan\'s mortgages are normalised', () => {
  for (const { label, inp } of scenarios(E, 30).concat(scenarios2(E, 40), jointScenarios(E, 8))) {
    const a = E.mergeRE(inp), b = E.mergeRE(a);
    assert.equal(stable(b), stable(a), `${label}: merging again changes nothing`);
    assert.ok(E.RE_KINDS[a.kind], label); assert.equal(a.mode, 'home', label); assert.equal(a.acquire, E.RE_KINDS[a.kind].acquire, label);
    assert.ok(['liveLet', 'let'].includes(a.occupancy), label);
    assert.ok(Array.isArray(a.properties) && a.properties.filter((x) => x.isHome).length <= 1, `${label}: one home at most`);
    a.properties.forEach((x) => { assert.equal(typeof x.id, 'string'); assert.ok(x.value >= 0 && x.ltv >= 0 && ['keep', 'sell'].includes(x.plan) && (x.sellAt === 'moveIn' || Number.isInteger(x.sellAt))); if (x.isHome) assert.equal(x.rentNow, 0); });
    a.existingLoans.concat(a.joint.loans).forEach((l) => { assert.ok(l.securedOn === null || typeof l.securedOn !== 'undefined'); if (l.securedOn != null) assert.equal(l.type, 'mortgage'); });
    a.plans.forEach((o) => { assert.equal(o.eqWhen, undefined, `${label}: no eqWhen after the merge`); assert.ok(Object.values(o.mortgages).every((m) => m.when !== 'none' && Number.isInteger(m.month))); });
  }
  // the five kinds and how each is acquired; an unknown kind falls back to the villa
  assert.equal(stable(['landVilla', 'readyVilla', 'land', 'landBuilding', 'readyBuilding', 'nonsense'].map((kind) => { const p = E.mergeRE({ kind }); return [p.kind, p.acquire]; })),
    stable([['landVilla', 'build'], ['readyVilla', 'buy'], ['land', 'build'], ['landBuilding', 'build'], ['readyBuilding', 'buy'], ['landVilla', 'build']]));
  // plans: a fresh mortgages object per plan (no shared reference with the presets), "none" steps dropped, a list accepted
  const p = E.mergeRE({ kind: 'landVilla', plans: [{ mortgages: { p1: { when: 'none' }, p2: { when: 'build', month: '3' } } }, { mortgages: [{ id: 'p1', when: 'month', month: 7 }] }, {}] });
  assert.equal(stable(p.plans[0].mortgages), stable({ p2: { when: 'build', month: 3 } })); assert.equal(stable(p.plans[1].mortgages), stable({ p1: { when: 'month', month: 7 } }));
  assert.notStrictEqual(p.plans[2].mortgages, E.RE_PLAN_DEFAULTS.mortgages);
  // a loan secured on a property is a mortgage; the property's defaults
  const q = E.mergeRE({ kind: 'landVilla', ownedLtv: 60, properties: [{ value: '2000000' }, { id: 'home', value: 1500000, isHome: true, rentNow: 5000, sellAt: '18' }], existingLoans: [{ balance: 100000, installment: 2000, monthsLeft: 60, rate: 4, securedOn: 'p1' }] });
  assert.equal(stable(q.properties[0]), stable({ id: 'p1', name: 'Property 1', value: 2000000, ltv: 60, canMortgage: true, rentNow: 0, isHome: false, plan: 'keep', sellAt: 'moveIn', letAfterMove: false, letYield: 3, sellCostPct: 2.5, existingLoanId: null }));
  assert.equal(q.properties[1].id, 'home'); assert.equal(q.properties[1].rentNow, 0, 'the home you live in earns no rent'); assert.equal(q.properties[1].sellAt, 18);
  assert.equal(q.existingLoans[0].type, 'mortgage'); assert.equal(q.existingLoans[0].securedOn, 'p1');
});

test('re2Import: an old scenario becomes the new model once; the new shape passes through as it is', () => {
  for (const { label, inp } of scenarios(E, 40).concat(jointScenarios(E, 8))) {
    const a = E.re2Import(inp), b = E.re2Import(a);
    assert.strictEqual(b, a, `${label}: importing again returns the same object`);
    assert.equal(a.kind, inp.acquire === 'buy' ? 'readyVilla' : 'landVilla', label); assert.equal(a.mode, undefined); assert.equal(a.acquire, undefined);
    assert.equal(a.ownedValue, undefined); assert.equal(a.ownHomePlan, undefined);
    assert.equal(a.propertyValueBasis, 'today'); assert.equal(a.samaBands, false); assert.equal(a.rentFreezeUntil, null); assert.equal(a.termsV, 1);
    assert.equal(a.lmRate, inp.lmRate == null ? 4.5 : inp.lmRate); assert.equal(a.plRate, inp.plRate == null ? 4.0 : inp.plRate);
    const ov = inp.ownedValue == null ? 7000000 : inp.ownedValue;
    const rn = inp.rentNow == null ? 8000 : inp.rentNow;   // the old default: you pay rent today
    if (ov > 0) { assert.equal(a.properties.length, 1); assert.equal(a.properties[0].id, 'p1'); assert.equal(a.properties[0].value, ov); assert.equal(a.properties[0].isHome, !(rn > 0)); } else assert.equal(a.properties.length, 0);
    assert.equal(a.plans.length, (inp.plans || [1, 2, 3, 4]).length);
    a.plans.forEach((o, i) => { assert.equal(o.eqWhen, undefined); const w = inp.plans ? inp.plans[i].eqWhen : ['none', 'build', 'start', 'none'][i]; assert.equal(stable(o.mortgages), stable(w === 'none' ? {} : { p1: { when: w, month: 0 } }), `${label} plan ${i + 1}`); });
    // old keys the scenario carried are otherwise kept (your figures, your loans, تضامن)
    assert.equal(a.income, inp.income); assert.strictEqual(a.existingLoans, inp.existingLoans); if (inp.joint) assert.strictEqual(a.joint, inp.joint);
  }
  for (const { label, inp } of scenarios2(E, 10)) assert.strictEqual(E.re2Import(inp), inp, label);
  // the home you live in today: keep / let / sell carried only where the old engine applied them (no rent today, the new home not let)
  const home = E.re2Import({ ownedValue: 3000000, rentNow: 0, ownHomePlan: 'sell', ownHomeSellCostPct: 4 }).properties[0];
  assert.equal(stable([home.isHome, home.plan, home.sellAt, home.letAfterMove, home.sellCostPct, home.ltv]), stable([true, 'sell', 'moveIn', false, 4, 70]));
  const let_ = E.re2Import({ ownedValue: 3000000, rentNow: 0, ownHomePlan: 'let', ownHomeYield: 3.5, ownedLtv: 60 }).properties[0];
  assert.equal(stable([let_.isHome, let_.plan, let_.letAfterMove, let_.letYield, let_.ltv]), stable([true, 'keep', true, 3.5, 60]));
  assert.equal(E.re2Import({ ownedValue: 3000000, rentNow: 9000, ownHomePlan: 'sell' }).properties[0].plan, 'keep', 'you rent today: the old engine ignored the plan');
  assert.equal(E.re2Import({ ownedValue: 3000000, rentNow: 0, rentOutPct: 5, ownHomePlan: 'let' }).properties[0].letAfterMove, false, 'the new home is let: you stay');
  assert.equal(E.re2Import({ ownedValue: 0 }).properties.length, 0);
  // the old rental mode: a building let out entirely, marked
  const rent = E.re2Import({ mode: 'rental', acquire: 'buy', propertyPrice: 4000000 });
  assert.equal(stable([rent.kind, rent.occupancy, rent.legacyRental, E.mergeRE(rent).acquire]), stable(['readyBuilding', 'let', true, 'buy']));
  assert.equal(E.re2Import({ mode: 'rental' }).kind, 'landBuilding');
  // the old per-strategy bank terms are read into the shared terms (the old mergeRE's migration), so a plan's own eqRate is not lost
  const terms = E.re2Import({ plans: [{ enabled: true, lmUse: true, lmRate: 6, lmTenure: 12 }, { enabled: true, eqWhen: 'build', eqRate: 7.5, eqTenure: 9 }] });
  assert.equal(stable([terms.lmRate, terms.lmTenure, terms.eqRate, terms.eqTenure, terms.plRate]), stable([6, 12, 7.5, 9, 4]));
  // a legacy v1 plan (mortgageWhen) keeps its legacy keys for mergeRE
  assert.equal(E.re2Import({ plans: [{ mortgageWhen: 'start', rate: 5 }] }).plans[0].mortgageWhen, 'start');
});

test('mergeRE brings an old-shape scenario across by itself (no kind, an old key or a plan with eqWhen), never a new one', () => {
  for (const { label, inp } of scenarios(E, 20)) {
    if (!E.re2IsOld(inp)) continue;   // the bare defaults are the new tool's defaults
    assert.equal(key(E.computeRE(inp, { noNeed: true })), key(E.computeRE(E.re2Import(inp), { noNeed: true })), label);
  }
  assert.equal(E.mergeRE({ ownedValue: 3000000 }).properties[0].value, 3000000);
  assert.equal(stable(E.mergeRE({ plans: [{ eqWhen: 'start' }] }).plans[0].mortgages), stable({ p1: { when: 'start', month: 0 } }));
  assert.equal(E.mergeRE({ plans: [{ eqWhen: 'start' }] }).properties[0].value, 7000000, 'an old scenario without ownedValue owned the old default property');
  assert.equal(E.mergeRE({}).properties.length, 0, 'the bare defaults are the new tool\'s');
  assert.equal(E.mergeRE({}).lmRate, 5); assert.equal(E.mergeRE({ mode: 'home' }).lmRate, 4.5);
  assert.equal(stable(E.mergeRE({ properties: [{ value: 1 }], ownedValue: 5 }).properties.map((x) => x.value)), '[1]', 'a scenario with properties is the new model whatever else it carries');
  assert.equal(E.re2IsOld({ kind: 'landVilla', mode: 'home' }), false);
});

test('re2Import parity: the home you live in (keep / let / sell) × every eqWhen × the slot presets, old engine vs new', { skip: !OLD && 'old engine deleted' }, () => {
  let n = 0;
  for (let k = 0; k < 96; k++) {
    const base = randomScenario(E, k + 3001);
    const inp = { ...base, rentNow: k % 5 === 4 ? 9000 : 0, ownedValue: k % 4 === 3 ? 0 : [2500000, 4000000, 7000000][k % 3], ownHomePlan: ['keep', 'let', 'sell'][k % 3], ownHomeYield: [3, 4.5][k % 2], ownHomeSellCostPct: [2.5, 7.5][k % 2],
      plans: base.plans.map((o, j) => ({ ...o, eqWhen: ['none', 'start', 'land', 'build', 'completion', 'month'][(k + j) % 6], eqMonth: 7 + j * 5 })),
      ...(k % 7 === 0 ? { partRentAnnual: 36000 } : k % 7 === 1 ? { cashZakatPct: 2.5 } : {}) };
    if (k % 11 === 0) delete inp.plans;                       // the old default plans (slot presets)
    if (k % 13 === 0) delete inp.ownedValue;                  // the old default property
    if (k % 9 === 0) { delete inp.eqRate; delete inp.eqTenure; inp.plans = inp.plans && inp.plans.map((o, j) => j === 1 ? { ...o, eqRate: 6.25, eqTenure: 11 } : o); }   // per-plan terms
    if (k % 17 === 0 && inp.plans) inp.plans[0] = { mortgageWhen: 'start', rate: 5, tenure: 20 };   // a legacy v1 plan
    if (k % 19 === 0 && inp.plans) inp.plans[2] = null;        // an empty slot takes the slot preset
    const a = OLD.computeRE(inp, { noNeed: true }), b = E.computeRE(E.re2Import(inp), { noNeed: true });
    assert.equal(key(b), key(a), `random#${k + 3001} (${inp.ownHomePlan}, ownedValue ${inp.ownedValue})`);
    n++;
  }
  assert.ok(n >= 96);
});

test('propertyValueBasis: "market" sizes the mortgage on a property you own on its value at the time, "today" on today\'s; a loan secured on it takes room', () => {
  const V = 3000000, g = 4, buildStart = 24;
  const base = { kind: 'landVilla', income: 150000, livingExpenses: 20000, cashAvailable: 4000000, existingLoans: [], landMonth: 0, buildStart, appreciation: g, properties: [{ id: 'p1', name: 'Flat', value: V, ltv: 70 }],
    plans: [{ enabled: true, lmUse: false, plWhen: 'none', coUse: false, settlePolicy: 'none', mortgages: { p1: { when: 'build', month: 0 } } }] };
  const run = (x) => E.computeRE({ ...base, ...x }, { noNeed: true }).results[0];
  const mk = run({ propertyValueBasis: 'market' }), td = run({ propertyValueBasis: 'today' });
  assert.equal(mk.eq.startedAt, buildStart); assert.equal(mk.eq.propId, 'p1');
  assert.ok(near(mk.eq.capacity.byLtv, V * Math.pow(1 + g / 100, buildStart / 12) * 0.7, 0.01), `market: ${mk.eq.capacity.byLtv}`);
  assert.ok(near(td.eq.capacity.byLtv, V * 0.7, 0.01), `today: ${td.eq.capacity.byLtv}`);
  assert.ok(near(mk.eq.amount, mk.eq.capacity.byLtv) && near(td.eq.amount, td.eq.capacity.byLtv), 'with this income the LTV binds');
  // an existing loan secured on it (rate 0, so its balance is exact): the bank lends the LTV less what is still owed when the mortgage is taken
  const sec = run({ propertyValueBasis: 'market', existingLoans: [{ id: 9, name: 'Old mortgage', balance: 600000, installment: 5000, monthsLeft: 120, rate: 0, securedOn: 'p1' }] });
  assert.ok(near(sec.eq.capacity.byLtv, V * Math.pow(1 + g / 100, buildStart / 12) * 0.7 - (600000 - 23 * 5000), 0.01), `secured: ${sec.eq.capacity.byLtv}`);
  // the first property you may mortgage is the collateral; one you may not is skipped
  const two = run({ properties: [{ id: 'p1', value: V, canMortgage: false }, { id: 'p2', value: 2000000, ltv: 60 }], plans: [{ ...base.plans[0], mortgages: { p2: { when: 'build', month: 0 } } }] });
  assert.equal(two.eq.propId, 'p2'); assert.ok(near(two.eq.capacity.byLtv, 2000000 * Math.pow(1 + g / 100, 2) * 0.6, 0.01));
  const none = run({ properties: [{ id: 'p1', name: 'Flat', value: V, canMortgage: false }] });
  assert.equal(none.eq.startedAt, null); assert.equal(none.eq.amount, 0); assert.equal(none.eq.propId, 'p1'); assert.equal(none.eq.key, 'eq:p1');
  assert.match(none.eq.capacity.limitedBy, /^Flat cannot be mortgaged$/);
  assert.ok(none.events.some((e) => e.kind === 'eq' && /nothing available \(Flat cannot be mortgaged/.test(e.text)), 'a step on a property you may not mortgage lends nothing, and says why');
  assert.ok(!run({ properties: [{ id: 'p1', value: V }], plans: [{ ...base.plans[0], mortgages: {} }] }).events.some((e) => e.kind === 'eq'), 'no step, no row');
  // across the random suite: every such mortgage (eq:<id>, one per property the plan mortgages) stays within its property's
  // LTV on the basis chosen, and is on a property you own and may mortgage
  let nEq = 0;
  for (const { label, inp } of scenarios2(E, 40)) {
    const m = E.computeRE(inp, { noNeed: true });
    m.results.forEach((r, i) => {
      if (!r) return;
      assert.equal(r.eq.key, r.eqs.length ? r.eqs[0].key : 'eq', `${label} S${i + 1}: r.eq is the first mortgage on a property, or a blank eq`);
      r.eqs.filter((f) => f.amount > 0).forEach((f) => {
        const P = m.p.properties.find((x) => x.id === f.propId);
        assert.ok(P && P.canMortgage && P.value > 0 && f.key === `eq:${P.id}`, `${label} S${i + 1}: ${f.key} on a property you own and may mortgage`);
        const basis = m.p.propertyValueBasis === 'today' ? P.value : P.value * Math.pow(1 + m.p.appreciation / 100, f.startedAt / 12);
        assert.ok(f.amount <= basis * P.ltv / 100 + 1, `${label} S${i + 1}: ${f.amount} > ${basis * P.ltv / 100}`);
        nEq++;
      });
    });
  }
  assert.ok(nEq > 20, `${nEq} mortgages on properties checked`);
});

test('samaBands: SAMA\'s bands cap a single borrower too (55% up to 15,000 — 65% with REDF support —, 65% below 25,000, then your bank\'s cap)', () => {
  const base = { kind: 'landVilla', dbrCap: 65, existingLoans: [], livingExpenses: 3000, cashAvailable: 500000, properties: [{ id: 'p1', value: 5000000 }],
    plans: [{ enabled: true, lmUse: false, plWhen: 'none', coUse: false, settlePolicy: 'none', mortgages: { p1: { when: 'start', month: 0 } } }] };
  const room = (x) => { const m = E.computeRE({ ...base, ...x }, { noNeed: true }); return [m.household.dbrRoom, m.household.capTimeline[0].room, m.results[0].eq.capacity.totalRoom].map(Math.round); };
  assert.equal(stable(room({ income: 12000, samaBands: true })), '[6600,6600,6600]');
  assert.equal(stable(room({ income: 12000, samaBands: true, joint: { on: false, redf: true } })), '[7800,7800,7800]');
  assert.equal(stable(room({ income: 12000, samaBands: false })), '[7800,7800,7800]', 'off: the bank\'s 65%');
  assert.equal(stable(room({ income: 20000, samaBands: true, dbrCap: 70 })), '[13000,13000,13000]');
  assert.equal(stable(room({ income: 30000, samaBands: true, dbrCap: 70 })), '[21000,21000,21000]');
  // dbrOk is judged against the band: 7,000/mo on 12,000 is over 55% but under 65%
  const over = (x) => E.computeRE({ ...base, income: 12000, existingLoans: [{ id: 1, name: 'L', balance: 300000, installment: 7000, monthsLeft: 60, rate: 5 }], ...x }, { noNeed: true }).results[0].dbrOk;
  assert.equal(over({ samaBands: true }), false); assert.equal(over({ samaBands: false }), true);
  // the band follows the income of the month (income growth)
  const g = E.computeRE({ ...base, income: 14000, incomeGrowth: 10, samaBands: true, plans: [{ ...base.plans[0], mortgages: { p1: { when: 'month', month: 13 } } }] }, { noNeed: true }).results[0];
  assert.ok(near(g.eq.capacity.totalRoom, 14000 * 1.1 * 0.65), `month 13: ${g.eq.capacity.totalRoom}`);
  // off = the old single-borrower limit everywhere
  for (const { label, inp } of scenarios(E, 12)) assert.equal(key(E.computeRE({ ...E.re2Import(inp), samaBands: false }, { noNeed: true })), key(E.computeRE(E.re2Import(inp), { noNeed: true })), label);
});

test('the old family, in both shapes, agrees', () => {
  const a = E.computeRE(FAMILY, { noNeed: true }), b = E.computeRE({ ...E.re2Import(FAMILY), propertyValueBasis: 'today' }, { noNeed: true });
  assert.equal(key(a), key(b));
  assert.ok(a.results.some((r) => r && r.eq.amount > 0), 'the family\'s property is mortgaged in one plan');
});
