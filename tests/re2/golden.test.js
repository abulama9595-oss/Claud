// Golden values: the clinic engine must stay bit-identical; the v2 real-estate defaults were recorded in P1 (below).
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();

test('clinic default is unchanged (golden rule)', () => {
  const m = E.compute({});
  assert.equal(Math.round(m.totalRaise), 9033);
  assert.equal(m.irr.toFixed(4), '0.6717');
  assert.equal(Math.round(m.npv), 32980);
  assert.equal(m.verdict, 'STRONG');
  assert.equal(Math.round(m.years[4].ebitda), 6875);
});

// v2 golden (recorded in P1, re-recorded in P2 with the Riyadh rent freeze on by default — rentFreezeUntil 2030-09 holds the
// rent you pay today flat until then, so renting looks better than before): the new tool starts with no property of yours,
// lmRate 5.0 / plRate 6.5, SAMA bands on and market-value sizing; the four default plans use no property. The as-of month is
// fixed here because the freeze is counted from it (computeRE({}) takes this month). With rentFreezeUntil null the best plan
// gives the P1 figure again (−2,422,044).
test('real-estate v2 defaults (golden)', () => {
  const m = E.computeRE({ asOf: '2026-10' });
  assert.equal(m.p.kind, 'landVilla'); assert.equal(m.p.mode, 'home'); assert.equal(m.p.acquire, 'build');
  assert.equal(m.p.properties.length, 0); assert.equal(m.p.lmRate, 5); assert.equal(m.p.plRate, 6.5); assert.equal(m.p.samaBands, true); assert.equal(m.p.propertyValueBasis, 'market');
  assert.equal(Math.round(m.prj.total), 3087912);   // 3,055,912 + 2.5% broker's fee on the land (32,000); the land grows, the building ages 2%/yr
  assert.equal(m.verdict, 'RENTING WINS');   // 2,000,000 cash, no property: three of the four default plans work
  assert.equal(JSON.stringify(m.results.map((r) => [r.plan.name, r.feasible, Math.round(r.econAdv), r.needMore, r.needMoreBridge, Math.round(r.onHandAtMoveIn)])),
    JSON.stringify([['Mortgage the new land (max) · cash for the build', true, -3055669, null, null, 115833], ['Mortgage the new land (max) + personal loan(s) (max) at build start', true, -3085925, null, null, 356712],
      ['Mortgage the new land (max) → cash-out (max) on the finished home', true, -2836605, null, null, 964988], ['Cash + personal loan(s) (max) when the land is bought · no mortgage', false, -3077566, 324690, null, -599442]]));
  assert.equal(Math.round(m.bestFeasible.econAdv), -2836605);
  assert.equal(Math.round(E.computeRE({ asOf: '2026-10', rentFreezeUntil: null }).bestFeasible.econAdv), -2422044);   // the freeze off: the P1 golden
  assert.equal(JSON.stringify([m.household.capTimeline[0].inst, m.household.capTimeline[0].room, Math.round(m.household.capTimeline[0].maxMortgage), m.household.dbrRoom]), JSON.stringify([10850, 13900, 1977145, 13900]));
});

// the old tool's default scenario, imported, still gives the old tool's golden (CLAUDE.md: RENTING WINS, prj.total 3,087,912)
test('the old tool\'s defaults, imported, give the old golden', () => {
  const m = E.computeRE(E.re2Import({}));
  assert.equal(m.verdict, 'RENTING WINS');
  assert.equal(Math.round(m.prj.total), 3087912);
  assert.equal(m.bestFeasible.plan.name, 'Mortgage the new land (max) + mortgage my existing property (max) at build start');
  assert.equal(Math.round(m.bestFeasible.econAdv), -2141634);
});
