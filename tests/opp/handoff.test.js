// "Open in the real-estate tool": the scenario oppToRE2 writes gives the real-estate engine the same land, building, cost,
// units and sales. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadOpp, near } = require('./helpers.js');
const O = loadOpp();
const E = require('../re2/helpers.js').loadEngine();
const household = { asOf: '2026-11', cashAvailable: 20000000, income: 80000, livingExpenses: 20000, rentNow: 0, existingLoans: [], properties: [], joint: { on: false } };

test('the handoff: the same all-in cost, built area, units and sales total (no growth)', () => {
  for (const inp of [
    { type: 'apartments', frontage: 30, depth: 40, streets: [{ side: 'front', width: 20 }], landPrice: 3500, priceSqm: 6500, finishExtra: 100000 },
    { type: 'apartments', frontage: 25, depth: 36, basement: true, landPrice: 4200, priceBasis: 'unit', priceUnit: 880000, floors: 4 },
    { type: 'villas', frontage: 48, depth: 30, landPrice: 3000, priceBasis: 'unit', priceUnit: 2400000 },
  ]) {
    const r = O.computeOpp(inp), s = O.oppToRE2(inp, r);
    const p = E.mergeRE({ ...household, ...s }), prj = E.reProject(p);
    assert.equal(p.kind, 'landBuilding'); assert.equal(p.occupancy, 'sell');
    assert.ok(near(prj.total, r.costs.devCost, 1e-6), `${prj.total} vs ${r.costs.devCost}`);
    assert.ok(near(prj.builtArea, r.areas.aboveGround));
    assert.equal(prj.sale.units, r.units.count);
    assert.ok(near(prj.sale.units * prj.sale.price0, r.revenue.total, 1e-4));
    // the land in month 1 there (month 0 here): completion one month later, sales from the month after it
    assert.equal(prj.occupy, 1 + r.months.done + 1);
    // and it runs: a plan with plenty of cash sells every unit
    const m = E.computeRE({ ...household, ...s, plans: [{ enabled: true, name: 'cash', lmUse: false, plWhen: 'none' }] }, { noNeed: true });
    assert.equal(m.results[0].unitSales.reduce((a, u) => a + u.units, 0), r.units.count);
  }
});
