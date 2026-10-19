// Golden values: the clinic engine must stay bit-identical; the real-estate defaults are documented in CLAUDE.md.
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

test('real-estate defaults match CLAUDE.md', () => {
  const m = E.computeRE({});
  assert.equal(m.verdict, 'OWNING WINS');
  assert.equal(Math.round(m.prj.total), 3055912);
});
