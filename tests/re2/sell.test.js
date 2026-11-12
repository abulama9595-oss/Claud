// "Sell the apartments" (occupancy "sell", a building you build): sold evenly over saleMonths from completion at today's price
// grown with the market, selling costs off, the land mortgage repaid in proportion; the cash-out refused. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b));
const base = { asOf: '2026-10', kind: 'landBuilding', occupancy: 'sell', unitCount: 8, salePriceBasis: 'unit', salePriceUnit: 1200000, saleMonths: 6, saleCostPct: 2.5,
  landArea: 600, landPrice: 2500, builtPct: 60, floors: 3, buildCost: 1900, finishExtra: 100000, landMonth: 3, buildStart: 5, buildMonths: 18,
  cashAvailable: 4000000, income: 80000, livingExpenses: 25000, rentNow: 0, existingLoans: [], properties: [], joint: { on: false } };
const run = (extra, plan) => { const p = E.mergeRE({ ...base, ...(extra || {}) }), prj = E.reProject(p); return { p, prj, r: E.reRunPlan(p, prj, { ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true, plWhen: 'build', coUse: true, ...(plan || {}) }) }; };

test('the apartments sell evenly over the months set, at today\'s price grown with the market, less selling costs', () => {
  const { p, prj, r } = run();
  assert.ok(prj.sale && prj.sale.units === 8 && !prj.moveIn && prj.letting.grossAnnual === 0);
  assert.equal(r.unitSales.reduce((a, x) => a + x.units, 0), 8);
  assert.equal(r.unitSales[0].t, prj.occupy); assert.equal(r.soldOutT, prj.occupy + 5);
  r.unitSales.forEach((x) => { assert.ok(near(x.price, 1200000 * Math.pow(1 + p.appreciation / 100, x.t / 12))); assert.ok(near(x.costs, x.gross * 0.025)); });
  assert.ok(near(r.salesTotal, r.unitSales.reduce((a, x) => a + x.gross, 0)));
  // the building is not yours once it is sold; nothing left in value
  assert.equal(r.months[r.soldOutT].value, 0);
  assert.ok(r.months[r.soldOutT - 1].value > 0);
  assert.match(r.events.find((e) => e.kind === 'milestone' && /Sold out/.test(e.text)).text, /all 8 apartments/);
});

test('the land mortgage is repaid in proportion to the apartments sold, and in full at the last', () => {
  const { r } = run();
  assert.ok(r.lm.amount > 0);
  assert.equal(r.lm.settledAt, r.soldOutT);
  const mid = r.unitSales[1], before = r.months[mid.t - 1].debtLm;
  assert.ok(mid.payoff > 0 && r.months[mid.t].debtLm < before);
  assert.ok(r.unitSales.every((x) => x.payoff > 0));
  assert.ok(r.months.slice(r.soldOutT).every((m) => m.debtLm === 0));
});

test('cash adds up every month (identity A, with sales)', () => {
  const { p, r } = run();
  const alt = Math.pow((1 + p.altReturn / 100) * (1 - (p.cashZakatPct || 0) / 100), 1 / 12) - 1;
  for (let t = 1; t < r.months.length; t++) {
    const m = r.months[t], pm = r.months[t - 1];
    const sold = r.unitSales.filter((x) => x.t === t).reduce((a, x) => a + x.net, 0);
    const proceeds = r.facilities.filter((f) => f.startedAt === t && f.amount > 0).reduce((a, f) => a + f.amount - f.fees, 0);
    if (proceeds > 0 || r.payoffs.some((x) => x.t === t) || (r.prepaid || []).some((x) => x.t === t)) continue;   // (other flows checked elsewhere)
    const want = (pm.cash > 0 ? pm.cash * (1 + alt) : pm.cash) + m.inc - m.liv - m.rentPaid + m.rentIn + m.propRentIn + sold - m.spend - m.existInst - m.lmPay - m.eqPay - m.plPay - m.coPay - m.ownerCost - m.holding;
    assert.ok(near(m.cash, want, 1e-9), `M${t}: ${m.cash} vs ${want}`);
  }
});

test('the cash-out is refused when you sell; per m² equals per apartment at the same price; a let building is unchanged', () => {
  const { r } = run();
  assert.equal(r.co.amount, 0); assert.match(r.co.capacity.limitedBy, /you sell the apartments/);
  const { prj } = run();
  const sqm = run({ salePriceBasis: 'sqm', salePriceSqm: 1200000 / prj.sale.areaPerUnit }).r;
  assert.ok(near(sqm.salesTotal, r.salesTotal, 1e-9));
  // the optimizer's pick has no cash-out
  const st = E.optimizeRE({ ...base, plans: [] }, { plannedOnly: true }).planned;
  assert.ok(!(st.best.cleanPlan || st.best.plan).coUse || !(st.best.co > 0));
  // occupancy "sell" only for a building you build; a let building keeps its numbers
  assert.equal(E.mergeRE({ kind: 'readyBuilding', occupancy: 'sell' }).occupancy, 'let');
  const letA = E.computeRE({ ...base, occupancy: 'let' }, { noNeed: true }), letB = E.computeRE({ ...base, occupancy: 'let', salePriceUnit: 999 }, { noNeed: true });
  assert.equal(letA.results[0].econAdv, letB.results[0].econAdv);
  assert.equal(letA.results[0].unitSales.length, 0);
  assert.equal(E.computeRE(base, { noNeed: true }).verdict.endsWith('BUILDING TO SELL WINS'), true);
});
