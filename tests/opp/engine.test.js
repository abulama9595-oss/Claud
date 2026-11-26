// The land-opportunity engine: geometry, areas, units, money identities, break-evens, residual land value. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadOpp, near } = require('./helpers.js');
const O = loadOpp();
const apt = { type: 'apartments', frontage: 30, depth: 40, streets: [{ side: 'front', width: 20 }], landPrice: 3500, priceBasis: 'sqm', priceSqm: 6500, buildCost: 2000 };

test('the land: any two of frontage, depth and area give the third; the area alone is area-only mode', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(O.oppLand({ frontage: 30, depth: 40 }))), { frontage: 30, depth: 40, area: 1200, hasDims: true, derived: 'area' });
  const d = O.oppLand({ frontage: 30, area: 1500 }); assert.equal(d.derived, 'depth'); assert.ok(near(d.depth, 50));
  const f = O.oppLand({ depth: 25, area: 1000 }); assert.equal(f.derived, 'frontage'); assert.ok(near(f.frontage, 40));
  const a = O.oppLand({ area: 900 }); assert.equal(a.hasDims, false); assert.equal(a.area, 900);
  const r = O.computeOpp({ ...apt, frontage: null, depth: null, area: 1200 });
  assert.equal(r.geometry.rect, null); assert.ok(near(r.areas.footprint, 0.6 * 1200));
  assert.ok(r.warnings.some((w) => /setbacks cannot be checked/.test(w)));
});

test('setbacks: a street side takes a fifth of the street width within its limits; a corner plot takes it on both streets', () => {
  const x = O.oppMerge({ ...apt, streets: [{ side: 'front', width: 20 }] });
  assert.deepEqual([...[O.oppSetbacks(x).front, O.oppSetbacks(x).left, O.oppSetbacks(x).rear]], [4, 2, 2]);
  assert.equal(O.oppSetbacks(O.oppMerge({ ...apt, streets: [{ side: 'front', width: 10 }] })).front, 3);    // the minimum
  assert.equal(O.oppSetbacks(O.oppMerge({ ...apt, streets: [{ side: 'front', width: 40 }] })).front, 6);    // the maximum
  const c = O.oppSetbacks(O.oppMerge({ ...apt, streets: [{ side: 'front', width: 20 }, { side: 'left', width: 15 }] }));
  assert.deepEqual([c.front, c.left, c.right], [4, 3, 2]);
});

test('the footprint is the smaller of the coverage and the rectangle inside the setbacks; areas add up', () => {
  const r = O.computeOpp(apt), x = r.inp;
  const rect = (30 - 2 - 2) * (40 - 4 - 2);
  assert.ok(near(r.geometry.ground, Math.min(0.6 * 1200, rect)));
  const narrow = O.computeOpp({ ...apt, frontage: 12, depth: 40 }), rect2 = (12 - 4) * (40 - 6);
  assert.equal(narrow.geometry.groundBound, 'setbacks'); assert.ok(near(narrow.geometry.ground, rect2));
  assert.ok(near(r.areas.aboveGround, r.geometry.ground + (x.floors - 1) * r.geometry.upper + x.annexPct / 100 * r.geometry.upper));
  assert.ok(near(r.areas.sellable, r.areas.aboveGround * (1 - x.utilityPct / 100)));
  assert.equal(r.units.count, Math.floor(r.areas.sellable / x.unitSize));
  assert.ok(r.units.count * x.unitSize <= r.areas.sellable + 1e-9);
  // a parking ground floor is not sold; a basement is cost, never sellable
  const gp = O.computeOpp({ ...apt, groundParking: true });
  assert.ok(near(gp.areas.sellable, (r.areas.aboveGround - r.geometry.ground) * (1 - x.utilityPct / 100)));
  const bs = O.computeOpp({ ...apt, basement: true });
  assert.ok(near(bs.areas.basement, 1200)); assert.equal(bs.areas.sellable, r.areas.sellable);
  assert.ok(near(bs.costs.construction - r.costs.construction, 1200 * bs.inp.basementCost));
});

test('villas: plots along the frontage, each with its setbacks; attached townhouses share the side setbacks', () => {
  const v = O.computeOpp({ type: 'villas', frontage: 48, depth: 30, streets: [{ side: 'front', width: 15 }], priceBasis: 'unit', priceUnit: 2500000 });
  assert.equal(v.geometry.n, 4); assert.equal(v.units.count, 4); assert.ok(near(v.geometry.plotArea, 360));
  assert.ok(near(v.geometry.ground, Math.min(0.75 * 360, (12 - 4) * (30 - 3 - 2))));
  const t = O.computeOpp({ type: 'villas', frontage: 48, depth: 30, attached: true, streets: [{ side: 'front', width: 15 }] });
  assert.ok(t.geometry.ground >= v.geometry.ground);
  assert.ok(near(t.geometry.sideTotal, 4 / 4));
  assert.ok(O.computeOpp({ type: 'villas', villaCount: 6, frontage: 48, depth: 30 }).warnings.some((w) => /villa plot/.test(w)));
});

test('money: costs, revenue and profit add up; the cash flow carries every riyal', () => {
  for (const extra of [{}, { offPlanPct: 40, offPlanDiscountPct: 5 }, { loanLtv: 50 }, { priceBasis: 'unit', priceUnit: 1000000 }]) {
    const r = O.computeOpp({ ...apt, ...extra }), c = r.costs;
    assert.ok(near(c.devCost, c.land + c.rett + c.broker + c.construction + c.soft + c.cont + c.finish + c.vat + c.permits));
    assert.ok(near(c.total, c.devCost + c.saleCosts + c.interest));
    assert.ok(near(r.kpis.profit, r.revenue.total - c.total));
    assert.ok(near(r.kpis.marginOnCost, r.kpis.profit / c.total));
    const ins = r.cashflow.reduce((a, f) => a + f.in, 0), outs = r.cashflow.reduce((a, f) => a + f.out, 0), net = r.cashflow.reduce((a, f) => a + f.net, 0);
    assert.ok(near(ins, r.revenue.total)); assert.ok(near(outs, c.devCost + c.saleCosts)); assert.ok(near(net, r.kpis.profit, 1e-6));
  }
  // off-plan sales bring money in during construction, so less cash is needed at the peak
  assert.ok(O.computeOpp({ ...apt, offPlanPct: 50 }).kpis.peakCash < O.computeOpp(apt).kpis.peakCash);
});

test('break-evens bring the profit to zero; the residual land value gives exactly the target margin', () => {
  const r = O.computeOpp(apt), b = r.breakEven, x = r.inp;
  const f = b.priceFactor;
  assert.ok(near(O.computeOpp({ ...apt, priceSqm: apt.priceSqm * f }).kpis.profit, 0, 1e-6));
  assert.ok(near(O.computeOpp({ ...apt, buildCost: b.buildCost }).kpis.profit, 0, 1e-6));
  assert.ok(near(O.computeOpp({ ...apt, landPrice: r.residualLand.atBreakEven }).kpis.profit, 0, 1e-6));
  const t = O.computeOpp({ ...apt, landPrice: r.residualLand.atTarget });
  assert.ok(near(t.kpis.marginOnCost, x.targetMarginPct / 100, 1e-9));
  assert.ok(near(O.computeOpp({ ...apt, priceSqm: b.targetPriceSqm }).kpis.marginOnCost, x.targetMarginPct / 100, 1e-9));
  // the units to sell: that many cover every cost, one fewer does not
  const net = r.revenue.total / r.units.count * (1 - x.saleCostPct / 100), need = r.costs.total - r.costs.saleCosts;
  assert.ok(b.units * net >= need && (b.units - 1) * net < need);
  // with a land loan the residual land still hits the target (interest moves with the land price)
  const L = { ...apt, loanLtv: 60 }, rl = O.computeOpp(L);
  assert.ok(near(O.computeOpp({ ...L, landPrice: rl.residualLand.atTarget }).kpis.marginOnCost, 0.2, 1e-9));
});

test('sensitivity, tornado, cases and the verdict', () => {
  const r = O.computeOpp(apt);
  assert.ok(near(r.sensitivity.cells[2][2].profit, r.kpis.profit));
  assert.ok(r.sensitivity.cells[4][0].profit > r.sensitivity.cells[0][4].profit);
  assert.equal(r.tornado.length, 5); assert.ok(r.tornado.every((t, i) => i === 0 || t.span <= r.tornado[i - 1].span));
  assert.ok(near(r.cases[1].profit, r.kpis.profit)); assert.ok(r.cases[0].profit < r.cases[1].profit && r.cases[1].profit < r.cases[2].profit);
  assert.equal(O.computeOpp({ ...apt, priceSqm: 9000 }).verdict, 'GO');
  assert.equal(O.computeOpp({ ...apt, priceSqm: 4000 }).verdict, 'NO-GO');
  const m = r.kpis.marginOnCost; assert.equal(r.verdict, m >= 0.2 ? 'GO' : m >= 0.1 ? 'BORDERLINE' : 'NO-GO');
  // IRR: the monthly flows discounted at it sum to zero
  const mo = Math.pow(1 + r.kpis.irr, 1 / 12) - 1;
  assert.ok(Math.abs(r.cashflow.reduce((a, f) => a + f.net / Math.pow(1 + mo, f.t), 0)) < 1);
});
