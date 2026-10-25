// Save and buy (reSaveAndBuy): the all-cash plan at every month from the planned start up to the wait you accept.
// Synthetic scenarios only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
const ready = (cash) => ({ asOf: '2026-10', kind: 'readyVilla', propertyPrice: 1400000, finishExtra: 0, cashAvailable: cash });

test('save and buy finds the earliest start that works from cash and savings, matches the all-cash plan run at that start, and changes nothing else', () => {
  // enough cash today: no wait
  const now = E.reSaveAndBuy(ready(1700000));
  assert.equal(now.found.wait, 0);
  // a little short today: savings close the gap after some months, and every earlier month fails
  const later = E.reSaveAndBuy(ready(1450000));
  assert.ok(later.found && later.found.wait > 0, 'a wait is needed');
  assert.ok(later.rows.slice(0, -1).every((r) => !r.feasible), 'every earlier start fails');
  // the found start equals the all-cash plan run at that start
  const q = E.mergeRE(E.reAtStart(E.mergeRE(ready(1450000)), later.found.delay));
  const r = E.reRunPlan(q, E.reProject(q), { ...E.RE_PLAN_PRESETS.allCash, enabled: true });
  assert.ok(r.feasible && r.newDebtTotal === 0 && Math.abs(r.econAdv - later.found.econAdv) < 1e-6);
  // far short: nothing within the wait, and the cash still needed at the last start is reported
  const none = E.reSaveAndBuy(ready(1000000), { maxWait: 6 });
  assert.equal(none.found, null); assert.equal(none.rows.length, 7); assert.ok(none.need > 0);
  // a longer wait never finds a later month than a shorter one that already found it
  const w24 = E.reSaveAndBuy(ready(1450000), { maxWait: 24 });
  assert.equal(w24.found.delay, later.found.delay);
  // pure: the results of computeRE are unchanged by the search
  const inp = ready(1450000), before = JSON.stringify(E.computeRE(inp).results.map((x) => x && x.econAdv));
  E.reSaveAndBuy(inp);
  assert.equal(JSON.stringify(E.computeRE(inp).results.map((x) => x && x.econAdv)), before);
});
