// The optimizer's search (P6): the mortgage-on-a-property dimension (none, or one of the two properties with the most room
// left, now / when the land is bought / at build start), "only dearer loans" in the search when one of your old loans is
// dearer than the mortgages it grants, whose personal loans with تضامن; the locked counts (48 / 192 / 336, ×4/3, ×3); fewer
// runs than mixes with identical results; the tool's pick never beats the plan it equals written out; cleanPlan round-trips;
// a ready purchase moves like land in the sweep and the search; payoffs say why; the room timeline carries each property's
// room. Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios2 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// a synthetic household: two old loans (one dearer than the 5% mortgages, one cheaper), up to three properties, a spouse who earns
const HH = { kind: 'landVilla', asOf: '2026-10', income: 60000, livingExpenses: 18000, cashAvailable: 1500000, rentNow: 0, landMonth: 3, buildStart: 9, buildMonths: 18, horizon: 15, lmRate: 5, eqRate: 5, coRate: 5, rateQuote: 'apr', dearerMargin: 0.25,
  existingLoans: [{ id: 1, name: 'Car', balance: 150000, installment: 4200, monthsLeft: 40, rate: 9, ageMonths: 20 }, { id: 2, name: 'Cheap', balance: 300000, installment: 6500, monthsLeft: 50, rate: 3, ageMonths: 14 }] };
const PROPS = [{ id: 'p1', name: 'Our home', value: 3000000, ltv: 70, isHome: true }, { id: 'p2', name: 'Flat B', value: 2000000, ltv: 70, rentNow: 6000 }, { id: 'p3', name: 'Plot C', value: 900000, ltv: 60 }];
const CHEAP_ONLY = [HH.existingLoans[1]];
const SPOUSE = { on: true, income: 20000, loans: [{ name: 'S1', balance: 60000, installment: 2500, monthsLeft: 28, rate: 9, ageMonths: 18 }] };
const opt = (x, o) => E.optimizeRE({ ...HH, ...x }, { plannedOnly: true, ...(o || {}) });
const eqOf = (r) => (r.eqs || []).reduce((a, f) => a + f.amount, 0);

test('counts: 48 / 192 / 336 mixes for 0 / 1 / 2 or more properties (the two with the most room left), ×4/3 with a dearer loan, ×3 with a spouse who earns; land 24; the policies may be set', () => {
  // no dearer loan: the three old policies
  const n0 = opt({ existingLoans: CHEAP_ONLY, properties: [] }), n1 = opt({ existingLoans: CHEAP_ONLY, properties: PROPS.slice(0, 1) }), n2 = opt({ existingLoans: CHEAP_ONLY, properties: PROPS.slice(0, 2) }), n3 = opt({ existingLoans: CHEAP_ONLY, properties: PROPS });
  assert.equal([n0.combos, n1.combos, n2.combos, n3.combos].join(), '48,192,336,336');
  assert.equal(n0.policies.join(), 'asNeeded,forMax,none'); assert.equal(n0.dearer.length, 0);
  // the two with the most room: Our home (2.1M) and Flat B (1.4M); Plot C (540K) is left to the plan editor
  assert.equal(n3.searchProps.map((x) => x.id).join(), 'p1,p2');
  assert.equal(E.reSearchProps(E.mergeRE({ ...HH, properties: PROPS })).map((P) => P.id).join(), 'p1,p2');
  // a loan secured on a property takes from its room: Flat B with 1.5M owed on it has 0.5M left, below Plot C
  const sec = opt({ existingLoans: CHEAP_ONLY.concat([{ id: 9, name: 'Flat mortgage', balance: 1500000, installment: 9000, monthsLeft: 200, rate: 4, securedOn: 'p2' }]), properties: PROPS });
  assert.equal(sec.searchProps.map((x) => x.id).join(), 'p1,p3');
  // a property you may not mortgage is never searched; one property gives today's four options in today's order
  assert.equal(opt({ existingLoans: CHEAP_ONLY, properties: [{ ...PROPS[0], canMortgage: false }] }).combos, 48);
  // a dearer loan (Car 9% vs the 5% mortgages + 0.25): "only dearer loans" joins — a third more
  const d0 = opt({ properties: [] }), d2 = opt({ properties: PROPS.slice(0, 2) });
  assert.equal([d0.combos, d2.combos].join(), '64,448');
  assert.equal(d0.policies.join(), 'asNeeded,forMax,dearer,none'); assert.equal(d0.dearer.join(), 'Car');
  assert.equal(E.reDearerLoans(E.mergeRE(HH), E.reProject(E.mergeRE(HH)), false).map((l) => l.name).join(), 'Car');
  // …not when it may not be settled, is a mortgage, or is dearer by less than the margin
  assert.equal(opt({ properties: [], existingLoans: [{ ...HH.existingLoans[0], canSettle: false }] }).combos, 48);
  assert.equal(opt({ properties: [], existingLoans: [{ ...HH.existingLoans[0], type: 'mortgage' }] }).combos, 48);
  assert.equal(opt({ properties: [], existingLoans: [{ ...HH.existingLoans[0], rate: 5.2 }] }).combos, 48);
  assert.equal(opt({ properties: [], existingLoans: [{ ...HH.existingLoans[0], rate: 5.2 }], dearerMargin: 0.1 }).combos, 64);
  // a spouse who earns: three times the mixes with a personal-loan step (36 of 48; 48 of 64)
  const j = opt({ existingLoans: CHEAP_ONLY, properties: [], joint: { on: true, income: 20000, loans: [] } }), jd = opt({ properties: PROPS.slice(0, 2), joint: SPOUSE });
  assert.equal([j.combos, jd.combos].join(), [36 * 3 + 12, 7 * (48 * 3 + 16)].join());
  assert.equal(jd.combos, 1120);
  // your spouse's dearer loan counts too
  assert.equal(opt({ existingLoans: CHEAP_ONLY, properties: [], joint: SPOUSE }).dearer.join(), 'S1');
  // land: no cash-out (24; 96 with a property); the policies may be set; fewer properties may be asked for
  assert.equal(opt({ kind: 'land', existingLoans: CHEAP_ONLY, properties: [], landArea: 800, landPrice: 1500 }).combos, 24);
  assert.equal(opt({ kind: 'land', existingLoans: CHEAP_ONLY, properties: PROPS.slice(0, 1), landArea: 800, landPrice: 1500 }).combos, 96);
  assert.equal(opt({ existingLoans: CHEAP_ONLY, properties: [] }, { policies: ['none'] }).combos, 16);
  assert.equal(opt({ existingLoans: CHEAP_ONLY, properties: PROPS }, { props: 1 }).combos, 192);
});

test('fewer runs than mixes, the same results: every mix\'s summary is what running its plan gives — two mixes whose steps fall in the same months are one run; the settle policies are one run when "for the largest mortgage" attempted no payoff', () => {
  let n = 0, saved = 0;
  const cases = [{ label: 'two properties + spouse', inp: { ...HH, properties: PROPS.slice(0, 2), joint: SPOUSE } }, { label: 'build with the purchase', inp: { ...HH, buildStart: 3, properties: PROPS.slice(0, 2) } }, { label: 'ready villa', inp: { ...HH, kind: 'readyVilla', propertyPrice: 3200000, properties: PROPS.slice(0, 1) } }].concat(scenarios2(E, 3));
  for (const { label, inp } of cases) {
    const p = E.mergeRE(inp), prj = E.reProject(p), cur = prj.start;
    const o = E.optimizeRE(inp, { delays: [cur], slice: [0, 100000], planned: true });
    assert.equal(o.part.length, o.combos, label);
    assert.ok(o.runs <= o.combos, `${label}: ${o.runs} runs for ${o.combos} mixes`); saved += o.combos - o.runs;
    for (const x of o.part) {
      const r = E.reRunPlan(p, prj, x.plan);
      assert.ok(near(x.econAdv, r.econAdv) && x.feasible === r.feasible && x.bridged === !!r.bridged && x.recoveryOk === r.recoveryOk && x.moveInOk === r.moveInOk && near(x.onHand, r.onHandAtMoveIn) && near(x.minCash, r.minCash)
        && near(x.lm, r.lm.amount) && near(x.eq, eqOf(r)) && near(x.pl, r.pl.amount) && near(x.co, r.co.amount) && near(x.pl2, r.pl2.amount) && near(x.spl || 0, r.spl ? r.spl.amount : 0) && near(x.settled, r.settledTotal) && near(x.roomSettled, r.roomSettled) && near(x.peakDebt, r.peakDebt) && near(x.peakInst, r.peakInst) && near(x.newDebtInterest, r.newDebtInterest)
        && JSON.stringify(x.payoffs.map((y) => [y.t, y.name, y.cost])) === JSON.stringify(r.payoffs.map((y) => [y.t, y.name, y.cost])) && x.flags.length === r.flags.length && JSON.stringify(x.covered) === JSON.stringify(r.covered || null), `${label}: ${x.name}`);
      n++;
    }
  }
  assert.ok(n > 1500 && saved > 500, `${n} mixes checked, ${saved} runs saved`);
  // a build that starts with the purchase: "when the land is bought" and "at build start" are one plan; land month 0: "now" too
  const a = E.optimizeRE({ ...HH, buildStart: 3, existingLoans: CHEAP_ONLY, properties: PROPS.slice(0, 1) }, { plannedOnly: true }), b = E.optimizeRE({ ...HH, landMonth: 0, buildStart: 0, existingLoans: CHEAP_ONLY, properties: PROPS.slice(0, 1) }, { plannedOnly: true });
  assert.ok(a.runs <= a.combos * 3 / 4 + 1 && b.runs <= b.combos / 2 + 1, `${a.runs} of ${a.combos}; ${b.runs} of ${b.combos}`);
});

test('the tool\'s pick, run as a plan, gives the same figures (cleanPlan round-trips, the best, the next-best and each lens\'s mix); written out as one of your plans it never ranks below that plan; the mortgage step names the property drawn', () => {
  const cases = [{ label: 'two properties', inp: { ...HH, properties: PROPS.slice(0, 2) } }, { label: 'joint', inp: { ...HH, properties: PROPS.slice(0, 2), joint: SPOUSE } }].concat(scenarios2(E, 4));
  let eqs = 0;
  for (const { label, inp } of cases) {
    const o = E.optimizeRE(inp, { plannedOnly: true }), st = o.planned;
    const mixes = [st.best].concat(st.alts, ['leastLiability', 'richest', 'mostCash'].map((k) => st.lenses[k] && st.lenses[k].mix).filter(Boolean));
    for (const x of mixes) {
      assert.ok(x.cleanPlan && !('_r' in x) && !('trace' in x), `${label}: a clean mix`);
      const m = E.computeRE(inp, { extraPlans: [x.cleanPlan], noNeed: true }), r = m.results[m.results.length - 1];
      assert.ok(r.tool && near(r.econAdv, x.econAdv) && r.feasible === x.feasible && near(r.lm.amount, x.lm) && near(eqOf(r), x.eq) && near(r.pl.amount, x.pl) && near(r.co.amount, x.co) && near(r.pl2.amount, x.pl2) && near(r.peakDebt, x.peakDebt) && near(r.onHandAtMoveIn, x.onHand), `${label}: ${x.name}`);
      // the same plan written out as yours, next to the tool's pick: the same figures, and yours ranks first (ties keep the earlier plan)
      const m2 = E.computeRE({ ...inp, plans: [x.cleanPlan] }, { extraPlans: [x.cleanPlan], noNeed: true }), [a, b] = m2.results;
      assert.ok(near(a.econAdv, b.econAdv) && a.feasible === b.feasible && near(a.onHandAtMoveIn, b.onHandAtMoveIn) && near(a.newDebtTotal, b.newDebtTotal), `${label}: written out`);
      assert.ok(m2.ranked.indexOf(a) < m2.ranked.indexOf(b) && (E.reStanding(a) === 0 || m2.bestFeasible === a), `${label}: the written plan ranks first`);
      const ms = E.rePlanMorts(x.cleanPlan);
      if (x.eq > 0) { eqs++; assert.ok(ms.length === 1 && ms[0].id === x.eqId && x.name.includes(`mortgage on ${x.eqName} (max)`) && o.searchProps.some((P) => P.id === ms[0].id), `${label}: ${x.name}`); }
      else assert.equal(ms.length, 0, `${label}: ${x.name}`);
    }
    // the lenses come with their mix, and the recommendation is the best (no lens when no mix works)
    if (st.lenses.recommended) assert.ok(st.lenses.recommended.idx === 0 && near(st.lenses.recommended.mix.econAdv, st.best.econAdv), label); else assert.ok(!st.best.feasible && !st.best.bridged, label);
  }
  assert.ok(eqs > 0, 'some picks mortgage a property');
});

test('a ready home or building: a start date is the purchase month — the sweep and the search move it, with or without landWithBuild, as for land; a construction start leaves the land where you set it unless told', () => {
  const ready = { ...HH, kind: 'readyVilla', propertyPrice: 3500000, landMonth: 6, buildStart: 30, existingLoans: CHEAP_ONLY, properties: [] };
  assert.equal(E.reStartMonth(ready), 6);
  assert.equal(E.reAtStart(E.mergeRE(ready), 12).landMonth, 12);
  const sw = E.timingSweepRE(ready, 0, 24, 6);
  assert.ok(sw.rows.some((x) => x.delay === 6) && new Set(sw.rows.map((x) => x.econAdv)).size > 1, 'the purchase moves, so the rows differ');
  for (const x of sw.rows) assert.equal(x.occupy, x.delay + 1, `delay ${x.delay}: bought then, moved in the month after`);
  assert.equal(JSON.stringify(E.timingSweepRE(ready, 0, 24, 6, true).rows), JSON.stringify(sw.rows), 'landWithBuild changes nothing when there is nothing to build');
  const o = E.optimizeRE(ready, { delays: [6, 18] });
  assert.equal(JSON.stringify(o.starts.map((s) => [s.delay, s.landMonth, s.occupy, s.planned])), JSON.stringify([[6, 6, 7, true], [18, 18, 19, false]]));
  assert.equal(E.optimizeRE(ready, { delays: [18], landWithBuild: true }).starts[0].best.econAdv, o.starts[1].best.econAdv);
  assert.equal(E.optimizeRE({ ...ready, kind: 'readyBuilding', occupancy: 'let', unitCount: 6, unitRentBasis: 'unit', unitRent: 3000 }, { delays: [18] }).starts[0].landMonth, 18);
  assert.equal(E.optimizeRE({ ...HH, kind: 'land', landArea: 800, landPrice: 1500, existingLoans: CHEAP_ONLY, properties: [] }, { delays: [12] }).starts[0].landMonth, 12);
  // a construction: the land stays where set unless the start comes first — or moves with the start when asked
  const villa = { ...HH, existingLoans: CHEAP_ONLY, properties: [] }, pv = E.mergeRE(villa);
  assert.equal([E.reAtStart(pv, 24).landMonth, E.reAtStart(pv, 24).buildStart, E.reAtStart(pv, 1).landMonth, E.reAtStart(pv, 24, true).landMonth].join(), '3,24,1,24');
  assert.equal(E.reStartMonth(villa), 9);
  // the words follow the kind
  const r = E.optimizeRE(ready, { plannedOnly: true }).planned;
  assert.ok(/^Purchase (mortgage \(max\)|in cash)/.test(r.best.name) && !/build start|Land/.test(r.best.name), r.best.name);
  assert.ok(/^Land (mortgage \(max\)|in cash)/.test(E.optimizeRE(villa, { plannedOnly: true }).planned.best.name));
});

test('payoffs say why: a settlement you planned, or room for a mortgage — which one, and whether its rate made it the choice', () => {
  // a household whose land mortgage is held by the instalment test, so old loans are paid off for its room
  const inp = { ...HH, income: 25000, livingExpenses: 8000, properties: [], existingLoans: HH.existingLoans.map((l) => l.id === 2 ? { ...l, settleAt: 4 } : l),
    plans: [{ enabled: true, lmUse: true, settlePolicy: 'dearer' }, { enabled: true, lmUse: true, settlePolicy: 'forMax' }, { enabled: true, lmUse: true, settlePolicy: 'none' }] };
  const m = E.computeRE(inp, { noNeed: true }), [d, f, none] = m.results;
  const planned = none.payoffs.find((x) => x.name === 'Cheap');
  assert.ok(planned && planned.why === 'planned' && planned.t === 4 && planned.forKey === null && planned.forLabel === null && planned.dearer === false && planned.rate === 3, JSON.stringify(planned));
  const room = d.payoffs.find((x) => x.name === 'Car');
  assert.ok(room && room.why === 'room' && room.forKey === 'lm' && /Mortgage on the new land/.test(room.forLabel) && room.dearer === true && room.rate === 9 && room.t === 3, JSON.stringify(room));
  const roomF = f.payoffs.find((x) => x.name === 'Car');
  assert.ok(roomF && roomF.why === 'room' && roomF.dearer === false, JSON.stringify(roomF));
  assert.ok(!d.payoffs.some((x) => x.name === 'Cheap' && x.why === 'room'), '"only dearer loans" never pays off the cheap one for room');
  for (const r of m.results) for (const x of r.payoffs) assert.ok(['planned', 'room'].includes(x.why) && typeof x.old === 'boolean' && typeof x.rate === 'number');
  // the optimizer's summaries carry them
  const o = E.optimizeRE({ ...inp, plans: undefined }, { plannedOnly: true });
  assert.ok([o.planned.best].concat(o.planned.alts).every((x) => Array.isArray(x.payoffs) && x.payoffs.every((y) => ['planned', 'room'].includes(y.why))));
});

test('the room timeline carries each property\'s room: value × the share the bank lends against, less the loan secured on it as it runs down; nothing once sold in a month you set (a row then); the mortgage it carries is within your mortgage room at the eq terms', () => {
  const inp = { ...HH, existingLoans: CHEAP_ONLY.concat([{ id: 9, name: 'Flat mortgage', balance: 900000, installment: 8200, monthsLeft: 150, rate: 4.5, securedOn: 'p2' }]), properties: [PROPS[0], PROPS[1], { ...PROPS[2], plan: 'sell', sellAt: 30 }], propertyValueBasis: 'today' };
  const m = E.computeRE(inp, { noNeed: true }), p = m.p, rows = m.household.capTimeline;
  assert.ok(rows.length >= 2 && rows.every((c) => Array.isArray(c.props) && c.props.length === 3));
  const eqN = p.eqTenure * 12, eqR = E.reEffRate(p, p.eqRate, eqN), inst = Math.max(8200, E.rePmt(900000, 4.5, 150));
  for (const c of rows) {
    const byId = Object.fromEntries(c.props.map((x) => [x.id, x]));
    assert.ok(near(byId.p1.ltvRoom, 3000000 * 0.7) && byId.p1.secured === 0 && !byId.p1.sold, `M${c.t}: Our home`);
    let bal = 900000; for (let t = 1; t <= c.t; t++) { const i = bal * 4.5 / 1200; bal -= Math.min(bal + i, inst) - i; }
    assert.ok(near(byId.p2.ltvRoom, Math.max(0, 2000000 * 0.7 - bal)) && near(byId.p2.secured, bal), `M${c.t}: Flat B ${byId.p2.ltvRoom} vs ${2000000 * 0.7 - bal}`);
    assert.ok(byId.p3.ltvRoom === (c.t >= 30 ? 0 : 900000 * 0.6) && byId.p3.sold === c.t >= 30, `M${c.t}: Plot C`);
    const carry = E.rePrincipalFor(c.mortRoom, eqR, eqN);
    for (const x of c.props) assert.ok(near(x.maxMortgage, Math.min(x.ltvRoom, carry)), `M${c.t} ${x.id}: maxMortgage ${x.maxMortgage}`);
    assert.ok(near(c.propRoom, c.props.reduce((a, x) => a + x.ltvRoom, 0)));
  }
  assert.ok(rows.some((c) => c.t === 30), 'a row when a property is sold');
  assert.equal(JSON.stringify(m.household.propertyRoom), JSON.stringify(rows[0].props));
  // market value: the room grows with the market; the home you live in is sold only at move-in (plan-dependent), so never "sold" here
  const mk = E.computeRE({ ...inp, propertyValueBasis: 'market', appreciation: 4, properties: [{ ...PROPS[0], plan: 'sell', sellAt: 20 }] }, { noNeed: true }).household.capTimeline;
  for (const c of mk) assert.ok(near(c.props[0].ltvRoom, 3000000 * Math.pow(1.04, c.t / 12) * 0.7) && !c.props[0].sold, `M${c.t}`);
  // no properties: an empty list, the rows as before
  assert.ok(E.computeRE({ ...HH, properties: [] }, { noNeed: true }).household.capTimeline.every((c) => c.props.length === 0 && c.propRoom === 0));
});

// early payoff "as soon as the cash allows" (prepayAfter "asap"): a long mortgage dearer than the cash return is paid off once the
// cash above the cushion and three months' outgoings covers it, and the optimizer tries it on its leading mortgage mixes. Synthetic.
test('early payoff as soon as the cash allows: pays a dear mortgage off when the cash test passes, keeps a cheap one, and the optimizer finds it', () => {
  const inp = { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 3000000, finishExtra: 0, income: 150000, livingExpenses: 40000, rentNow: 0, cashAvailable: 2500000, cashBuffer: 200000, altReturn: 4, lmRate: 7, lmTenure: 20, existingLoans: [] };
  const p = E.mergeRE(inp), prj = E.reProject(p), plan = { ...E.RE_PLAN_PRESETS.landMortgage, enabled: true };
  const hold = E.reRunPlan(p, prj, plan), asap = E.reRunPlan(p, prj, { ...plan, prepayAfter: 'asap' });
  assert.ok(hold.feasible && asap.feasible);
  assert.equal(hold.prepaidTotal, 0);
  assert.ok(asap.prepaidTotal > 0 && asap.prepaid[0].t >= prj.occupy, 'paid off after move-in');
  // the cash test: the month it pays off, the cash left covers the cushion and three months' outgoings
  const t = asap.prepaid[0].t, m = asap.months[t];
  assert.ok(m.avail >= p.cashBuffer - 1, 'never below the cushion');
  assert.ok(asap.econAdv > hold.econAdv, 'paying 7% debt off early beats holding it while cash earns 4%');
  // a mortgage cheaper than the cash return is kept
  const cheap = E.reRunPlan(E.mergeRE({ ...inp, lmRate: 2, altReturn: 6 }), E.reProject(E.mergeRE({ ...inp, lmRate: 2, altReturn: 6 })), { ...plan, prepayAfter: 'asap' });
  assert.equal(cheap.prepaidTotal, 0);
  // the optimizer's pick pays the mortgage off early here, and is at least as good as holding it
  const st = E.optimizeRE(inp, { planned: true }).planned;
  assert.equal(st.best.plan.prepayAfter, 'asap');
  assert.match(st.best.name, /pay the mortgage off early when your cash allows/);
  assert.equal(st.best.cleanPlan.prepayAfter, 'asap', 'copying the pick keeps the early payoff');
  assert.ok(st.best.econAdv >= asap.econAdv - 1);
  // the default scenario's own plans never pay off early (the goldens are unchanged)
  assert.ok(E.computeRE({ asOf: '2026-10' }).results.every((r) => !r || r.prepaidTotal === 0));
});
