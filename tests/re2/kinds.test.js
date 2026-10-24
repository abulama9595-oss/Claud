// The five project kinds (P2): land only (no construction, holding costs, a planned sale, land finance, no cash-out), buildings
// you live in or let out entirely (units and their rent through the annex / whole-home channels), ready assets split into land
// and an ageing building, RETT first-home relief per kind, the Riyadh rent freeze, the verdict's words, and the what-ifs on
// every kind. The villa kinds give the old tool's numbers (parity.test.js). Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, randomScenario2, kindScenarios, FAMILY2 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const KINDS = ['landVilla', 'readyVilla', 'land', 'landBuilding', 'readyBuilding'];
// a comfortable synthetic household with a fixed as-of month, on any kind
const HH = { income: 90000, livingExpenses: 20000, cashAvailable: 2500000, rentNow: 9000, existingLoans: [], asOf: '2026-03', rentFreezeUntil: null, horizon: 15 };
const run = (x, opts) => E.computeRE({ ...HH, ...x }, { noNeed: true, ...(opts || {}) });
// what a plan's answer is made of (month by month), to compare two scenarios that must give the same numbers
const key = (m) => JSON.stringify({ v: m.verdict, r: m.results.map((r) => r && [r.feasible, !!r.bridged, r.econAdv, r.advantage, r.minCash, r.onHandAtMoveIn, r.newDebtInterest, r.events.length, r.flags.length,
  r.months.map((x) => [x.cash, x.avail, x.rentIn, x.rentPaid, x.value, x.debt])]) });

test('every kind: the spend schedule adds up to the total; the value has no jump at completion; the project says what it is', () => {
  for (const { label, inp } of kindScenarios(E, 48).concat(KINDS.map((kind) => ({ label: kind, inp: { ...HH, kind, unitCount: 6, unitRent: 3000, landSellYear: 6 } })))) {
    const m = E.computeRE(inp, { noNeed: true }), prj = m.prj, K = E.RE_KINDS[prj.kind];
    const spend = prj.schedule.reduce((a, b) => a + (b || 0), 0);
    assert.ok(Math.abs(spend - prj.total) < 1e-6, `${label}: schedule ${spend} vs total ${prj.total}`);
    assert.equal(prj.schedule.length, prj.occupy, `${label}: nothing is spent after the project is paid for`);
    assert.equal(prj.build, K.acquire === 'build'); assert.equal(prj.isLand, !!K.land); assert.equal(prj.isBuilding, !!K.building);
    assert.equal(prj.construct, prj.build && !prj.isLand); assert.equal(prj.bm > 0, prj.construct, `${label}: construction months only where there is a construction`);
    assert.equal(prj.moveIn, !!K.home || (prj.isBuilding && m.p.occupancy !== 'let'), label);
    assert.ok(prj.letting && typeof prj.letting.netAnnual === 'number' && prj.units === prj.letting.units);
    assert.equal(prj.saleAt == null || prj.isLand, true); assert.equal(prj.holding == null, !prj.isLand);
    // the value: 0 before the land is bought; at completion land + building at cost × uplift, and the month before and after differ
    // only by the land's growth and one month of progress / ageing (no jump where the formula changes)
    const g = m.p.appreciation / 100, landAt = (t) => prj.landValueAt(t);
    assert.equal(prj.valueAt(prj.landMonth - 1), 0);
    if (prj.construct) {
      const done = prj.start + prj.bm, dep = (m.p.buildDeprPct == null ? 0 : m.p.buildDeprPct) / 100;
      assert.ok(near(prj.valueAt(done), landAt(done) + prj.buildValue, 1e-6), `${label}: value at completion`);
      assert.ok(near(prj.valueAt(done) - prj.valueAt(done - 1), landAt(done) - landAt(done - 1) + prj.buildValue / prj.bm, 1e-6), `${label}: the last month of construction adds one month of progress`);
      assert.ok(near(prj.valueAt(done + 1) - prj.valueAt(done), landAt(done + 1) - landAt(done) - prj.buildValue * dep / 12, 1e-6), `${label}: the first month after completion takes one month of ageing`);
    } else if (prj.isLand) {
      for (const t of [prj.landMonth, prj.landMonth + 7, prj.landMonth + 40]) assert.ok(near(prj.valueAt(t), prj.land * Math.pow(1 + g, (t - prj.landMonth) / 12), 1e-6), `${label}: land path`);
    } else {
      assert.ok(near(prj.valueAt(prj.landMonth), m.p.readyLandShare == null ? prj.price + prj.finish : prj.price + prj.finish, 1e-6), `${label}: a ready asset is worth its price + finishing when bought`);
    }
  }
});

test('land only: no construction, paid for the month after purchase, the land path as its value, full RETT, land finance, no cash-out', () => {
  const m = run({ kind: 'land', landArea: 1000, landPrice: 2000, landMonth: 4, buildStart: 20, buildMonths: 18, finishExtra: 150000, overrunPct: 10, rentNow: 9000 }), prj = m.prj, p = m.p;
  assert.equal(JSON.stringify([prj.hard, prj.soft, prj.cont, prj.finish, prj.overrun, prj.vat, prj.bm, prj.buildValue]), '[0,0,0,0,0,0,0,0]');
  assert.equal(prj.occupy, 5); assert.equal(prj.start, 4, 'buildStart means nothing for land');
  assert.ok(near(prj.land, 2000000 * Math.pow(1.04, 4 / 12), 1e-6) && near(prj.rett, prj.land * 0.05, 1e-6) && prj.rettExempt === 0, 'RETT in full: land is not a first home');
  assert.ok(near(prj.schedule[4], prj.land + prj.rett + prj.landBroker, 1e-6) && prj.schedule.slice(0, 4).every((x) => x === 0) && near(prj.total, prj.schedule[4], 1e-6));
  assert.equal(prj.saleAt, null); assert.equal(prj.holding.whitePct, 0, 'a 1,000 m² plot pays no white-land fee'); assert.equal(prj.holding.zakatPct, 0);
  m.results.forEach((r, i) => {
    assert.equal(r.kind, 'land'); assert.equal(r.livesIn, false); assert.equal(r.lettingOut, false); assert.equal(r.landSale, null); assert.equal(r.holdingCost, 0);
    r.months.forEach((x) => {
      if (x.t >= 1) assert.ok(near(x.rentPaid, x.rentEq, 1e-9), `S${i + 1} M${x.t}: you keep paying rent — there is no move-in`);
      assert.equal(x.ownerCost, 0, 'no upkeep on land'); assert.equal(x.holding, 0); assert.equal(x.partIn, 0);
      assert.ok(near(x.value, prj.valueAt(x.t), 1e-6));
    });
    assert.ok(!r.events.some((e) => /Construction|move in/.test(e.text)), `S${i + 1}: no construction and no move-in milestones`);
    assert.ok(r.events.some((e) => e.kind === 'milestone' && /^Land bought/.test(e.text)), `S${i + 1}: "Land bought"`);
    assert.equal(r.co.amount, 0, 'no cash-out on land');
    if (r.plan.coUse) assert.ok(r.events.some((e) => e.kind === 'co' && /not available on land/.test(e.text)));
    if (r.lm.amount > 0) {
      assert.equal(r.lm.label, 'Mortgage on the land'); assert.equal(r.lm.tenure, p.landTenure); assert.equal(r.lm.quoted, p.lmRate + p.landRateAdd);
      assert.ok(near(r.lm.capacity.byLtv, prj.land * p.landOnlyLtv / 100, 1e-6), 'land finance: landOnlyLtv on the land');
    }
  });
  assert.ok(m.results[0].lm.amount > 0 && m.results[0].lm.amount <= m.prj.land * p.landOnlyLtv / 100 + 1);
  assert.ok(['BUYING LAND WINS', 'NOT BUYING LAND WINS'].includes(m.verdict));
  // the room timeline prices the mortgage at the land terms
  const n = p.landTenure * 12, row = m.household.capTimeline[0];
  assert.ok(near(row.maxMortgage, E.rePrincipalFor(row.mortRoom, p.lmRate + p.landRateAdd, n), 1e-6));
});

test('land only: holding costs month by month — the white-land fee from the first January after the purchase while the plots reach 5,000 m², zakat on land held to sell', () => {
  // as-of March 2026, land bought in month 2 (May 2026): the first January after is month 10 (January 2027)
  const base = { kind: 'land', landArea: 6000, landPrice: 500, landMonth: 2, asOf: '2026-03', whiteLandPct: 2.5, landZakat: 'none', plans: [{ enabled: true, lmUse: false, plWhen: 'none', coUse: false, settlePolicy: 'none' }] };
  const chk = (x, pct, from) => {
    const m = run(x), r = m.results[0], prj = m.prj, H = r.months.length - 1;
    assert.equal(prj.holding.whitePct, x.expectWhite == null ? x.whiteLandPct : x.expectWhite);
    for (let t = 0; t <= H; t++) {
      const exp = t > prj.landMonth && pct(t) > 0 ? prj.landValueAt(t) * pct(t) / 100 / 12 : 0;
      assert.ok(near(r.months[t].holding, exp, 1e-6), `M${t}: holding ${r.months[t].holding} vs ${exp}`);
      assert.ok(near(r.months[t].holding, prj.holdingAt(t), 1e-9));
    }
    assert.ok(near(r.holdingCost, r.months.reduce((a, x) => a + x.holding, 0), 1e-6));
    return { m, r, prj };
  };
  const a = chk(base, (t) => (t >= 10 ? 2.5 : 0));
  assert.equal(a.prj.holding.whiteFrom, 10); assert.equal(E.reCalMonth(a.m.p, 10), 1, 'month 10 is a January');
  chk({ ...base, whiteLandPct: 0 }, () => 0);
  chk({ ...base, landArea: 4000, expectWhite: 0 }, () => 0);                                    // under the threshold
  chk({ ...base, landArea: 4000, whiteLandOtherArea: 1000, expectWhite: 2.5 }, (t) => (t >= 10 ? 2.5 : 0));   // your plots add up
  chk({ ...base, landZakat: 'trade', expectWhite: 2.5 }, (t) => 2.5 + (t >= 10 ? 2.5 : 0));
  chk({ ...base, whiteLandPct: 0, landZakat: 'trade', expectWhite: 0 }, () => 2.5);
  // a land bought in January: the first January after is a year later
  const jan = run({ ...base, asOf: '2026-01', landMonth: 0 });
  assert.equal(jan.prj.holding.whiteFrom, 12);
  // the fee comes out of your cash in both measures and nowhere else
  const w = run(base).results[0], z = run({ ...base, whiteLandPct: 0 }).results[0], H = w.months.length - 1;
  const paid = w.months.reduce((a, x) => a + x.holding, 0);
  assert.ok(paid > 0 && w.months[H].ccash < z.months[H].ccash && w.months[H].cash < z.months[H].cash);
  assert.ok(near(w.months[10].ccash - z.months[10].ccash, -w.months[10].holding, 1e-6), 'the first fee month: the rule-7 cash is lower by exactly the fee');
  assert.ok(w.econAdv < z.econAdv && w.advantage < z.advantage);
});

test('land only: the sale you planned — value × (1 − costs) into your cash, the land mortgage repaid with the fee, the land worth 0 after, holding costs stop', () => {
  const base = { kind: 'land', landArea: 6000, landPrice: 500, landMonth: 3, asOf: '2026-03', whiteLandPct: 2.5, landZakat: 'trade', landSellYear: 4, landSellCostPct: 7.5, plans: [{ enabled: true, lmUse: true, plWhen: 'none', coUse: false, settlePolicy: 'none' }] };
  const sale = run(base), hold = run({ ...base, landSellYear: null }), r = sale.results[0], h = hold.results[0], prj = sale.prj, T = 48, H = r.months.length - 1;
  assert.equal(prj.saleAt, T); assert.equal(hold.prj.saleAt, null);
  assert.ok(r.landSale && r.landSale.t === T);
  const value = hold.prj.valueAt(T);
  assert.ok(near(r.landSale.value, value, 1e-6) && near(r.landSale.costs, value * 0.075, 1e-6));
  // the land mortgage is repaid from the proceeds at the SAMA early-settlement cost (balance + the next 3 months' profit)
  const balBefore = h.months[T - 1].debtLm;
  assert.ok(balBefore > 0 && r.lm.amount > 0);
  assert.ok(near(r.landSale.payoff, E.reSettleCost(balBefore, r.lm.rate, r.lm.pmt, r.lm.n - (T - 1 - r.lm.startedAt), sale.p.settleFeeMonths), 1e-6), `payoff ${r.landSale.payoff}`);
  assert.ok(near(r.landSale.fee, r.landSale.payoff - balBefore, 1e-6) && r.landSale.fee > 0);
  assert.ok(near(r.landSale.net, value * (1 - 0.075) - r.landSale.payoff, 1e-6));
  // identical until the sale; in the sale month the cash is up by the net proceeds (and the instalment not paid that month); after it
  // the land is worth 0, no mortgage, no holding costs
  for (let t = 0; t < T; t++) assert.ok(near(r.months[t].cash, h.months[t].cash, 1e-6) && near(r.months[t].value, h.months[t].value, 1e-6) && near(r.months[t].holding, h.months[t].holding, 1e-9), `M${t} same before the sale`);
  assert.ok(near(r.months[T].cash - h.months[T].cash, r.landSale.net + h.months[T].lmPay + h.months[T].holding, 1e-6), 'the sale month: the net proceeds, no instalment and no holding cost');
  assert.ok(near(r.months[T].ccash - h.months[T].ccash, r.landSale.net + h.months[T].holding, 1e-6), 'rule-7 cash: the net proceeds (and no holding cost that month)');
  for (let t = T; t <= H; t++) { const x = r.months[t]; assert.equal(x.value, 0); assert.equal(x.holding, 0); assert.equal(x.lmPay, 0); assert.equal(x.debtLm, 0); assert.equal(x.ownGone, 0, 'the land is not deducted twice'); }
  assert.ok(near(r.months[H].econNW, r.months[H].cash - r.months[H].debt, 1e-6));
  assert.equal(r.lm.settledAt, T); assert.equal(r.lm.soldAt, T);
  assert.ok(near(r.newDebtInterest - h.newDebtInterest, r.landSale.fee - (h.lm.interestPaid - r.lm.interestPaid), 1e-6), 'the fee is in the cost of the new loans');
  assert.ok(r.events.some((e) => e.t === T && /^Land sold for .* after .* selling costs; the land mortgage of .* is repaid/.test(e.text)));
  assert.ok(E.planSteps(r, true).some((s) => s.t === T && s.label === 'Sell the land' && near(s.amount, r.landSale.net, 1e-6)));
  // the page's breakdowns still add up: the rule-6 cash rows (sale and holding costs included) and the "vs not buying" parts
  const fb = E.fundingBridgeRows(r, H, sale.p, prj);
  assert.ok(near(fb.total, r.months[H].ccash - r.months[H].cRetCum, 1e-6) && fb.rows.some((x) => /Sale of the land/.test(x.label)) && fb.rows.some((x) => /Holding the land/.test(x.label)));
  const w = E.reWealthParts(r);
  assert.ok(near(w.total, r.econAdv, 1e-6) && w.parts.some((x) => x.key === 'landSold' && near(x.v, value * 0.925, 1e-6)) && w.parts.some((x) => x.key === 'holding' && near(x.v, -r.holdingCost, 1e-6)));
  // a sale after the horizon or before the purchase: none
  assert.equal(run({ ...base, landSellYear: 30 }).results[0].landSale, null);
  assert.equal(run({ ...base, landMonth: 60, landSellYear: 4 }).prj.saleAt, null);
  // a sale that lands in a cash gap closes it (the gap test knows the land sale)
  const gaps = E.reGaps([{ t: 0, avail: 10 }, { t: 1, avail: -5000 }, { t: 2, avail: 100 }], [], null, { t: 2, net: 10000 });
  assert.equal(JSON.stringify(gaps.map((g) => g.closedBy)), '[["landSale"]]');
});

test('reLetting: the units you let, the rent per unit (per unit or per m²), gross and net of vacancy and the management fee with VAT', () => {
  const p = E.mergeRE({ kind: 'landBuilding', occupancy: 'let', unitCount: 8, unitRent: 3000, vacancyPct: 8, mgmtPct: 5, vatPct: 15, landArea: 1000, builtPct: 60, floors: 3, netLettablePct: 85 });
  const prj = E.reProject(p), L = prj.letting;
  assert.equal(L.units, 8); assert.equal(L.letUnits, 8); assert.equal(L.perUnit, 3000); assert.equal(L.grossAnnual, 8 * 3000 * 12);
  assert.ok(near(L.netAnnual, 8 * 3000 * 12 * 0.92 * (1 - 0.05 * 1.15), 1e-6));
  const live = E.reLetting({ ...p, occupancy: 'liveLet' }, prj);
  assert.equal(live.letUnits, 7, 'you live in one'); assert.ok(near(live.netAnnual, L.netAnnual * 7 / 8, 1e-6));
  assert.equal(E.reLetting({ ...p, occupancy: 'liveLet', unitCount: 1 }, prj).letUnits, 0);
  const sqm = E.reLetting({ ...p, unitRentBasis: 'sqm', unitRent: 400 }, prj);
  assert.equal(prj.builtArea, 1800);
  assert.ok(near(sqm.perUnit, 1800 * 0.85 * 400 / 8 / 12, 1e-9) && near(sqm.grossAnnual, 1800 * 0.85 * 400, 1e-6), 'per m² a year on the net lettable area, spread over the units');
  assert.equal(E.reLetting({ ...p, unitCount: 0 }, prj).netAnnual, 0);
  assert.equal(E.reLetting(E.mergeRE({ kind: 'landVilla', unitCount: 8, unitRent: 3000 }), { builtArea: 500, isBuilding: false }).netAnnual, 0, 'a villa has no units');
  assert.equal(E.reProject(E.mergeRE({ kind: 'land', unitCount: 8, unitRent: 3000 })).letting.netAnnual, 0);
  // mergeRE normalises the choices
  assert.equal(E.mergeRE({ unitRentBasis: 'x' }).unitRentBasis, 'unit'); assert.equal(E.mergeRE({ landZakat: 'yes' }).landZakat, 'none'); assert.equal(E.mergeRE({ landZakat: 'trade' }).landZakat, 'trade');
});

test('a building you live in: the let units are an annex of your home — the same numbers as a villa-style annex rent of the net figure', () => {
  const units = { kind: 'landBuilding', occupancy: 'liveLet', unitCount: 6, unitRent: 3500, floors: 3, builtPct: 60, landArea: 900, rentNow: 9000 };
  const a = run(units), net = a.prj.letting.netAnnual;
  assert.ok(net > 0 && a.prj.letting.letUnits === 5);
  const b = run({ ...units, unitCount: 0, partRentAnnual: net });
  assert.equal(key(a), key(b));
  // …and both channels add up when you also let an annex
  const c = run({ ...units, partRentAnnual: 24000 }), d = run({ ...units, unitCount: 0, partRentAnnual: net + 24000 });
  assert.equal(key(c), key(d));
  a.results.forEach((r, i) => {
    assert.equal(r.livesIn, true); assert.equal(r.lettingOut, false);
    r.months.forEach((x) => { if (x.t >= 1 && x.t >= r.occupy) assert.equal(x.rentPaid, 0, `S${i + 1} M${x.t}: you moved in`); if (x.t > r.occupy) assert.ok(near(x.partIn, net / 12 * Math.pow(1.03, Math.floor((x.t - r.occupy - 1) / 12)), 1e-6)); else assert.equal(x.partIn, 0); });
    assert.ok(r.events.some((e) => e.kind === 'milestone' && /Construction complete — move in/.test(e.text)));
    assert.ok(r.months.every((x) => x.t < 1 || near(x.inc, a.p.income, 1e-9)), 'rent received never joins the bank income');
  });
  assert.ok(['OWNING WINS', 'RENTING WINS'].includes(a.verdict), 'you pay rent today and move in: owning vs renting');
  assert.ok(['BUILDING WINS', 'NOT BUILDING WINS'].includes(run({ ...units, rentNow: 0 }).verdict));
});

test('a building let out entirely: the whole-home channel, no move-in — the same numbers as a fixed annual rent of the net figure', () => {
  const units = { kind: 'readyBuilding', occupancy: 'let', unitCount: 6, unitRent: 3000, propertyPrice: 5000000, rentNow: 9000 };
  const a = run(units), net = a.prj.letting.netAnnual;
  assert.ok(net > 0 && a.prj.letting.letUnits === 6 && a.prj.moveIn === false);
  assert.equal(key(a), key(run({ ...units, unitCount: 0, rentOutFixed: net })));
  a.results.forEach((r, i) => {
    assert.equal(r.livesIn, false); assert.equal(r.lettingOut, true); assert.ok(near(r.annualRentOut, net, 1e-9));
    r.months.forEach((x) => { if (x.t >= 1) assert.ok(near(x.rentPaid, x.rentEq, 1e-9), `S${i + 1} M${x.t}: you keep renting`); if (x.t > r.occupy) assert.ok(near(x.rentIn, net / 12 * Math.pow(1.03, Math.floor((x.t - r.occupy - 1) / 12)), 1e-6)); else assert.equal(x.rentIn, 0); });
    assert.ok(r.events.some((e) => e.kind === 'milestone' && e.t === r.occupy && /^Building bought — let from month/.test(e.text)), `S${i + 1}: "let from" milestone`);
    assert.ok(!r.events.some((e) => /move in/.test(e.text)));
    assert.ok(near(r.rentInTotal, r.months.reduce((s, x) => s + x.rentIn, 0), 1e-6));
  });
  assert.ok(['BUYING WINS', 'NOT BUYING WINS'].includes(a.verdict), 'you keep renting either way: buying vs not buying');
  const built = run({ kind: 'landBuilding', occupancy: 'let', unitCount: 6, unitRent: 3000, rentNow: 9000 });
  assert.ok(['BUILDING WINS', 'NOT BUILDING WINS'].includes(built.verdict));
  assert.ok(built.results[0].events.some((e) => e.kind === 'milestone' && e.t === built.prj.occupy && /^Building complete — let from month/.test(e.text)));
  // let, with no units set: still no move-in (and no rent)
  const none = run({ ...units, unitCount: 0 }).results[0];
  assert.equal(none.lettingOut, true); assert.equal(none.rentInTotal, 0); assert.ok(none.months.every((x) => x.t < 1 || near(x.rentPaid, x.rentEq, 1e-9)));
  // the old rental mode, imported: one let unit earning the old monthly rent
  const old = E.re2Import({ mode: 'rental', acquire: 'buy', propertyPrice: 4000000, rentMo: 15000 });
  assert.equal(JSON.stringify([old.kind, old.occupancy, old.unitCount, old.unitRent, old.legacyRental]), '["readyBuilding","let",1,15000,true]');
  assert.equal(E.computeRE(old, { noNeed: true }).results[0].lettingOut, true);
});

test('RETT first-home relief applies to the villa kinds only; a ready asset split into land and an ageing building', () => {
  const base = { ...HH, landArea: 500, landPrice: 4000, propertyPrice: 2800000, firstHomeExempt: true, rettPct: 5, rettExemptCap: 1000000, landMonth: 0 };
  for (const kind of KINDS) {
    const prj = E.computeRE({ ...base, kind }, { noNeed: true }).prj, home = kind === 'landVilla' || kind === 'readyVilla', basis = prj.build ? prj.land : prj.price;
    assert.ok(near(prj.rettExempt, home ? Math.min(basis, 1000000) : 0, 1e-6), `${kind}: relief ${prj.rettExempt}`);
    assert.ok(near(prj.rett, (basis - prj.rettExempt) * 0.05, 1e-6), kind);
    assert.ok(near(E.computeRE({ ...base, kind, firstHomeExempt: false }, { noNeed: true }).prj.rett, basis * 0.05, 1e-6), `${kind}: no relief when switched off`);
  }
  // a ready asset: price + finishing grow with the market (today's path) — or, with readyLandShare, the land grows and the building ages
  const g = 0.03, plain = E.computeRE({ kind: 'readyBuilding', propertyPrice: 4000000, finishExtra: 200000, appreciation: 3, landMonth: 0, buildDeprPct: 2 }, { noNeed: true }).prj;
  assert.ok(near(plain.valueAt(24), 4200000 * Math.pow(1 + g, 2), 1e-6));
  const split = E.computeRE({ kind: 'readyBuilding', propertyPrice: 4000000, finishExtra: 200000, appreciation: 3, landMonth: 0, buildDeprPct: 2, readyLandShare: 45, readyAge: 0 }, { noNeed: true }).prj;
  assert.ok(near(split.valueAt(0), 4200000, 1e-6), 'worth its price + finishing when bought');
  assert.ok(near(split.valueAt(24), 1800000 * Math.pow(1 + g, 2) + 2400000 * (1 - 0.02 * 2), 1e-6), 'land grows, the building loses 2% of its value a year');
  assert.ok(near(split.landValueAt(24), 1800000 * Math.pow(1 + g, 2), 1e-6));
  const aged = E.computeRE({ kind: 'readyVilla', propertyPrice: 4000000, finishExtra: 0, appreciation: 0, landMonth: 0, buildDeprPct: 2, readyLandShare: 50, readyAge: 10 }, { noNeed: true }).prj;
  // 10 years old at 2%/yr straight-line: 80% of its original value is left, so each year takes 2 / 80 = 2.5% of what you paid
  assert.ok(near(aged.valueAt(12), 2000000 + 2000000 * (1 - 0.02 / 0.8), 1e-6), `${aged.valueAt(12)}`);
  assert.ok(near(aged.valueAt(12 * 40), 2000000, 1e-6), 'the building never goes below zero');
  // the villa kinds with the split unset are the old path (parity.test.js); a mortgage on the purchase is still sized on the price
  const r = E.computeRE({ ...HH, kind: 'readyVilla', propertyPrice: 2800000, readyLandShare: 55, plans: [{ enabled: true, lmUse: true, settlePolicy: 'none' }] }, { noNeed: true }).results[0];
  assert.ok(near(r.lm.capacity.byLtv, 2800000 * 0.9, 1e-6));
});

test('the rent freeze: no rent growth — paid or received — until the month, yearly steps from then; blank = today\'s numbers', () => {
  const base = { ...HH, kind: 'landVilla', asOf: '2026-01', rentNow: 8000, rentGrowth: 3, partRentAnnual: 36000, properties: [{ id: 'p1', name: 'Flat', value: 2000000, isHome: true, letAfterMove: true, letYield: 4, canMortgage: false }], appreciation: 4, buildStart: 0, buildMonths: 12 };
  const F = 24;   // January 2028
  const a = run({ ...base, rentFreezeUntil: '2028-01' }).results[0], b = run({ ...base, rentFreezeUntil: null }).results[0], occ = a.occupy;
  const c = run({ ...base, rentNow: 0, rentFreezeUntil: '2028-01' }).results[0];   // the home you live in today (let after you move) exists only when you pay no rent
  assert.equal(c.occupy, occ); assert.equal(c.ownPlan, 'let');
  a.months.forEach((x, t) => {
    if (t < 1) return;
    // the rent you pay: flat until the freeze ends, then yearly steps from there (the first a year later)
    const exp = 8000 * Math.pow(1.03, t < F ? 0 : Math.floor((t - F) / 12));
    assert.ok(near(x.rentEq, exp, 1e-6), `M${t}: rent paid ${x.rentEq} vs ${exp}`);
    assert.ok(near(b.months[t].rentEq, 8000 * Math.pow(1.03, Math.floor((t - 1) / 12)), 1e-6), 'no freeze: today\'s steps');
    if (t > occ) {
      // rent received (the annex) — the letting starts during the freeze (occ + 1 < F): flat until F, then steps
      const s0 = occ + 1, bgn = Math.max(F, s0), e2 = 36000 / 12 * Math.pow(1.03, t < bgn ? 0 : Math.floor((t - bgn) / 12));
      assert.ok(near(x.partIn, e2, 1e-6), `M${t}: annex ${x.partIn} vs ${e2}`);
      // the home you let after moving: its rent follows its value, frozen at the first month until F, then on its own clock
      const tc = t < F ? s0 : s0 + (t - F), e3 = 2000000 * Math.pow(1.04, tc / 12) * 0.04 / 12;
      assert.ok(near(c.months[t].ownIn, e3, 1e-6), `M${t}: own home ${c.months[t].ownIn} vs ${e3}`);
    }
  });
  assert.ok(occ + 1 < F, 'the letting starts during the freeze in this scenario');
  assert.ok(a.months[F + 11].rentEq === 8000 && near(a.months[F + 12].rentEq, 8240, 1e-6));
  // blank, an invalid month, or a freeze already over: today's numbers
  const k0 = key(run({ ...base, rentFreezeUntil: null }));
  for (const v of ['', 'soon', '2020-01', '2026-01']) assert.equal(key(run({ ...base, rentFreezeUntil: v })), k0, `"${v}"`);
  // a freeze that ends after a letting has started takes the steps from then; one that ends before it leaves that channel alone
  const late = run({ ...base, rentFreezeUntil: '2027-01', partRentAnnual: 36000 }).results[0], F2 = 12;
  late.months.forEach((x, t) => { if (t > late.occupy) { const s0 = late.occupy + 1, bgn = Math.max(F2, s0); assert.ok(near(x.partIn, 3000 * Math.pow(1.03, t < bgn ? 0 : Math.floor((t - bgn) / 12)), 1e-6), `M${t}`); } });
  // the whole-home channel too; and the as-of month moves the freeze
  const let_ = run({ ...base, rentFreezeUntil: '2028-01', partRentAnnual: 0, rentOutFixed: 120000, properties: [] }).results[0];
  let_.months.forEach((x, t) => { if (t > let_.occupy) { const s0 = let_.occupy + 1, bgn = Math.max(F, s0); assert.ok(near(x.rentIn, 10000 * Math.pow(1.03, t < bgn ? 0 : Math.floor((t - bgn) / 12)), 1e-6), `M${t}`); } });
  assert.equal(E.reMonthIndex({ asOf: '2026-01' }, '2028-01'), 24); assert.equal(E.reMonthIndex({ asOf: '2026-11' }, '2028-01'), 14); assert.equal(E.reMonthIndex({ asOf: '2026-01' }, '2025-06'), -7); assert.equal(E.reMonthIndex({}, 'x'), null);
  assert.equal(E.reCalMonth({ asOf: '2026-11' }, 2), 1); assert.equal(E.reCalMonth({ asOf: '2026-11' }, 14), 1); assert.equal(E.reCalMonth({ asOf: '2026-03' }, 0), 3);
  // an imported old scenario carries rentFreezeUntil null — the parity suite holds (parity.test.js); the defaults carry the freeze
  assert.equal(E.re2Import({}).rentFreezeUntil, null); assert.equal(E.mergeRE({}).rentFreezeUntil, '2030-09');
});

test('the verdict\'s words per kind', () => {
  const words = (x) => run(x).verdict;
  const sets = { land: ['BUYING LAND WINS', 'NOT BUYING LAND WINS'], landBuilding: ['BUILDING WINS', 'NOT BUILDING WINS'], readyBuilding: ['BUYING WINS', 'NOT BUYING WINS'], landVilla: ['BUILDING WINS', 'NOT BUILDING WINS'], readyVilla: ['BUYING WINS', 'NOT BUYING WINS'] };
  for (const [kind, ok] of Object.entries(sets)) {
    const m = run({ kind, rentNow: 0, occupancy: 'let', unitCount: 6, unitRent: 3000 });
    assert.ok(ok.includes(m.verdict), `${kind}: ${m.verdict}`);
    assert.equal(m.verdict, m.bestFeasible.econAdv > 0 ? ok[0] : ok[1], `${kind}: judged on the recommendation`);
  }
  // paying rent today: owning vs renting only where you move in
  assert.ok(['OWNING WINS', 'RENTING WINS'].includes(words({ kind: 'landVilla', rentNow: 9000 })));
  assert.ok(['OWNING WINS', 'RENTING WINS'].includes(words({ kind: 'landBuilding', occupancy: 'liveLet', unitCount: 6, unitRent: 3000, rentNow: 9000 })));
  assert.ok(['BUILDING WINS', 'NOT BUILDING WINS'].includes(words({ kind: 'landBuilding', occupancy: 'let', unitCount: 6, unitRent: 3000, rentNow: 9000 })));
  assert.ok(['BUYING WINS', 'NOT BUYING WINS'].includes(words({ kind: 'readyBuilding', occupancy: 'let', unitCount: 6, unitRent: 3000, rentNow: 9000 })));
  assert.ok(['BUYING LAND WINS', 'NOT BUYING LAND WINS'].includes(words({ kind: 'land', rentNow: 9000, landArea: 800, landPrice: 1500 })));
  // land that cannot be paid for
  assert.equal(words({ kind: 'land', landArea: 20000, landPrice: 5000, cashAvailable: 100000 }), 'NO EXECUTABLE STRATEGY');
});

test('what-ifs on every kind: stress (overrun and delay only where there is a construction), break-evens, loan worth, start dates, the tool\'s pick; the ready villa only against the villa you would build', () => {
  const inpOf = (kind) => ({ ...HH, kind, landArea: 800, landPrice: 1500, whiteLandPct: 2.5, landSellYear: 6, occupancy: 'liveLet', unitCount: 6, unitRent: 3000, floors: 2, builtPct: 60, propertyPrice: 4650000, readyLandShare: 50 });
  for (const kind of KINDS) {
    const inp = inpOf(kind), m = E.computeRE(inp, { noNeed: true }), idx = m.results.findIndex((r) => r && r.feasible), r = m.results[idx];
    assert.ok(r, `${kind}: a plan works`);
    const construct = m.prj.construct;
    const st = E.stressRE(inp, idx), keys = st.map((x) => x.key);
    assert.ok(near(st[0].econAdv, r.econAdv, 1e-6), `${kind}: base row`);
    assert.equal(keys.includes('overrun'), construct, `${kind}: overrun only with a construction`); assert.equal(keys.includes('delay'), construct);
    for (const x of st) assert.ok(typeof x.econAdv === 'number' && !isNaN(x.econAdv), `${kind}: ${x.key}`);
    const be = E.breakEvenRE(inp, idx);
    assert.ok(Array.isArray(be) && be.length >= 2, kind);
    assert.equal(be.some((d) => d.key === 'uplift'), construct); assert.equal(be.some((d) => d.key === 'rent'), kind !== 'land', `${kind}: a rent driver unless land`);
    for (const d of be) for (const [k, metric] of [['econ', 'econAdv'], ['rule7', 'advantage']]) {
      if (d[k] == null) continue;
      const set = { rent: m.prj.isBuilding ? 'unitRent' : 'partRentAnnual', appreciation: 'appreciation', return: 'altReturn', uplift: 'devMarginPct' }[d.key];
      const at = E.reRunOne({ ...E.mergeRE(inp), [set]: d[k] }, idx).r[metric];
      assert.ok(Math.abs(at) < 2000, `${kind} ${d.key} ${k}: ${at} at ${d[k]}`);
    }
    const rb = E.readyBreakEvenRE(inp, idx);
    if (kind === 'landVilla') assert.ok(rb && rb.value > 0); else assert.equal(rb, null, `${kind}: no ready-villa what-if`);
    for (const w of E.loanWorthRE(inp, idx)) assert.ok(typeof w.gain === 'number' && !isNaN(w.gain), kind);
    const sw = E.timingSweepRE(inp, idx, 12, 6);
    assert.ok(sw.rows.length >= 3 && sw.rows.every((x) => typeof x.econAdv === 'number'), kind);
    if (kind === 'land') { const rows = sw.rows; assert.ok(rows.some((x) => x.delay > 0) && new Set(rows.map((x) => x.econAdv)).size > 1, 'land: a later start moves the purchase, so the rows differ'); }
    const to = E.tornadoRE(inp, idx), labels = to.map((x) => x.label);
    assert.equal(labels.includes('Construction cost / m²'), construct, kind); assert.equal(labels.includes('Land price / m²'), m.prj.build, kind); assert.equal(labels.includes('Property price'), !m.prj.build, kind);
    const opt = E.optimizeRE(inp, { plannedOnly: true });
    assert.equal(opt.combos, kind === 'land' ? 24 : 48, `${kind}: mixes (no cash-out on land)`);
    assert.ok(opt.planned.best && typeof opt.planned.best.econAdv === 'number');
    if (kind === 'land') { assert.ok(opt.planned.best.co === 0 && /when the land is bought|Land/.test(opt.planned.best.name)); }
  }
  // the optimizer's start dates move the purchase for land
  const land = E.optimizeRE(inpOf('land'), { delays: [0, 12] });
  assert.equal(land.starts[1].landMonth, 12);
  // تضامن keeps its counts on a building (120 mixes with a spouse who earns)
  assert.equal(E.optimizeRE({ ...inpOf('landBuilding'), joint: { on: true, income: 20000 } }, { plannedOnly: true }).combos, 120);
});

test('random scenarios of every kind: cash you can spend, bank limits, the page\'s breakdowns, the ranking and the standing of every plan', () => {
  const bad = [];
  let n = 0;
  for (const { label, inp } of kindScenarios(E, 48)) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p, prj = m.prj;
    const chk = (what, ok) => { if (!ok) bad.push(`${label} (${p.kind}): ${what}`); };
    m.results.forEach((r, i) => {
      if (!r) return;
      n++;
      const H = r.months.length - 1, end = r.months[H], occ = Math.min(H, r.occupy);
      let ret = 0;
      r.months.forEach((x) => { ret += x.ret; chk(`S${i + 1} M${x.t} avail = cash − returns`, near(x.avail, x.cash - ret, 1e-6)); chk(`S${i + 1} M${x.t} income is salary only`, x.t < 1 || near(x.inc, p.income * Math.pow(1 + (p.incomeGrowth || 0) / 100, Math.floor((x.t - 1) / 12)) + (p.joint && p.joint.on ? +p.joint.income || 0 : 0), 1e-6)); });
      chk(`S${i + 1} feasible ⇔ never short`, r.feasible === r.months.every((x) => x.avail >= -0.5));
      chk(`S${i + 1} minCash`, near(r.minCash, Math.min(...r.months.map((x) => x.avail)), 1e-6));
      chk(`S${i + 1} rule-6 cash rows`, near(E.fundingBridgeRows(r, occ, p, prj).total, r.months[occ].ccash - r.months[occ].cRetCum, 1e-6));
      chk(`S${i + 1} cash at move-in = bank − growth`, near(E.cashReconcile(r, occ, p, prj).total, r.onHandAtMoveIn, 1e-6) && near(r.onHandAtMoveIn, r.months[occ].cash - r.months.slice(0, occ + 1).reduce((a, x) => a + x.ret, 0), 1e-6));
      chk(`S${i + 1} wealth parts add up`, near(E.reWealthParts(r).total, r.econAdv, 1e-6));
      chk(`S${i + 1} everything grows at the end`, near(end.econNW, end.cash + end.value - end.debt - end.ownGone, 1e-6));
      chk(`S${i + 1} new mortgages within their LTV`, (r.lm.amount <= (prj.build ? prj.land : prj.price) * (prj.isLand ? p.landOnlyLtv : p.landLtv) / 100 + 1) && (!prj.isLand || r.co.amount === 0));
      chk(`S${i + 1} holding only on land, only while owned`, r.months.every((x) => (prj.isLand ? x.holding >= 0 : x.holding === 0) && (!r.landSale || x.t < r.landSale.t || x.holding === 0)));
      chk(`S${i + 1} sale only for land`, !r.landSale || (prj.isLand && r.landSale.t === prj.saleAt && near(r.landSale.net, r.landSale.value - r.landSale.costs - r.landSale.payoff, 1e-6)));
      chk(`S${i + 1} rent paid until you move in`, r.months.every((x) => x.t < 1 || near(x.rentPaid, x.t >= r.occupy && r.livesIn ? 0 : x.rentEq, 1e-9)));
      chk(`S${i + 1} standing`, E.reStanding(r) === (r.feasible ? 2 : r.bridged ? 1 : 0));
    });
    // the ranking: standing, then your rules, then the result; the verdict's words fit the kind
    const live = m.results.filter(Boolean), st = (r) => E.reStanding(r), met = (r) => (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0);
    for (let i = 1; i < m.ranked.length; i++) { const a = m.ranked[i - 1], b = m.ranked[i]; chk(`ranking ${i}`, st(a) > st(b) || (st(a) === st(b) && (st(a) === 0 || met(a) > met(b) || (met(a) === met(b) && a.econAdv >= b.econAdv)))); }
    const act = prj.isLand ? 'BUYING LAND' : prj.build ? 'BUILDING' : 'BUYING';
    const ok = !live.length ? ['NO OPTION'] : !m.bestFeasible ? ['NO EXECUTABLE STRATEGY'] : p.rentNow > 0 && prj.moveIn ? ['OWNING WINS', 'RENTING WINS'] : [`${act} WINS`, `NOT ${act} WINS`];
    chk(`verdict ${m.verdict}`, ok.includes(m.verdict));
  }
  assert.ok(n > 150, `${n} results`);
  assert.deepEqual(bad.slice(0, 12), []);
});

test('the villa kinds are untouched by the new choices: units, land keys and the ready split do nothing to a villa; a building with no units is a villa you live in', () => {
  for (let k = 0; k < 12; k++) {
    const inp = { ...randomScenario2(E, 500 + k), rentFreezeUntil: null };
    const a = E.computeRE(inp, { noNeed: true });
    const b = E.computeRE({ ...inp, unitCount: 8, unitRent: 4000, landSellYear: 5, whiteLandPct: 10, landZakat: 'trade', ...(a.p.kind === 'readyVilla' ? {} : { readyLandShare: 50, readyAge: 7 }) }, { noNeed: true });
    assert.equal(key(b), key(a), `random2#${500 + k} (${a.p.kind})`);
  }
  const v = run({ kind: 'landVilla', firstHomeExempt: false }), bld = run({ kind: 'landBuilding', occupancy: 'liveLet', unitCount: 0 });
  assert.equal(key(bld), key(v), 'a building you live in with no units set costs and behaves like the villa of the same area (RETT first-home relief is for a villa only, so none on either side)');
  assert.notEqual(key(run({ kind: 'landVilla' })), key(bld), 'with the relief the villa pays less RETT');
  // FAMILY2 on a building you live in: its home plan and property mortgage still apply; on land they do not (no move-in)
  const fam = E.computeRE({ ...FAMILY2, asOf: '2026-03', properties: [{ ...FAMILY2.properties[0], plan: 'sell' }], kind: 'landBuilding', unitCount: 4, unitRent: 3000 }, { noNeed: true });
  assert.ok(fam.results.some((r) => r && r.ownSale));
  const landFam = E.computeRE({ ...FAMILY2, asOf: '2026-03', properties: [{ ...FAMILY2.properties[0], plan: 'sell' }], kind: 'land' }, { noNeed: true });
  assert.ok(landFam.results.every((r) => !r || (r.ownPlan === 'keep' && !r.ownSale)), 'land: you stay where you live');
});
