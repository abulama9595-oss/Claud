// Rent as % of the all-in cost — the default for a building's units (unitRentBasis "pct", unitRentPct) and an option for the
// part of a villa you let (partRentPct; a fixed partRentAnnual overrides it). Per unit stays an option; per m² is read only for
// older saved scenarios. Synthetic scenarios only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('rent as % of the all-in cost: buildings by default, the villa annex as an option; per unit still works', () => {
  const bld = { asOf: '2026-10', kind: 'landBuilding', occupancy: 'let', unitCount: 8, unitRentPct: 7, landArea: 600, landPrice: 3000, builtPct: 60, floors: 3 };
  const p = E.mergeRE(bld), prj = E.reProject(p);
  assert.equal(p.unitRentBasis, 'pct', 'the default basis');
  assert.ok(near(prj.letting.grossAnnual, prj.total * 0.07, 1e-9), 'the whole building lets for 7% of its all-in cost a year');
  assert.ok(near(prj.letting.perUnit, prj.total * 0.07 / 8 / 12, 1e-9));
  // living in one unit: the other seven are let
  const live = E.reProject(E.mergeRE({ ...bld, occupancy: 'liveLet' })).letting;
  assert.equal(live.letUnits, 7); assert.ok(near(live.grossAnnual, prj.total * 0.07 * 7 / 8, 1e-9));
  // per unit still works
  const unit = E.reProject(E.mergeRE({ ...bld, unitRentBasis: 'unit', unitRent: 4000 })).letting;
  assert.ok(near(unit.grossAnnual, 8 * 4000 * 12, 1e-9));
  // the villa annex: % of the all-in cost, or a fixed amount that overrides it
  const villa = { asOf: '2026-10', kind: 'landVilla' }, vp = E.mergeRE(villa), vprj = E.reProject(vp);
  const base = E.computeRE(villa).results[0], pct = E.computeRE({ ...villa, partRentPct: 2 }).results[0], fixed = E.computeRE({ ...villa, partRentPct: 2, partRentAnnual: 50000 }).results[0];
  const rentAt = (r) => r.months[vprj.occupy + 2].partIn;
  assert.equal(rentAt(base), 0);
  assert.ok(near(rentAt(pct), vprj.total * 0.02 / 12, 1e-6), `annex rent ${rentAt(pct)} vs ${vprj.total * 0.02 / 12}`);
  assert.ok(near(rentAt(fixed), 50000 / 12, 1e-6), 'a fixed rent overrides the %');
  // the goldens hold (no annex, no building)
  assert.equal(Math.round(E.computeRE({ asOf: '2026-10' }).prj.total), 3087912);
});
