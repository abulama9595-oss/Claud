// Fork parity: the new engine (re2) gives the old, frozen engine's numbers for any scenario the old tool could express,
// once the scenario is brought into the new model by re2Import (identity until the new model exists). The new engine may
// add results, but on these scenarios it may not change one. Skipped once the old files are deleted. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, jointScenarios } = require('./helpers.js');
const NEW = loadEngine(), OLD = loadEngine(true);

const toNew = (inp) => (NEW.re2Import ? NEW.re2Import(inp) : inp);
const key = (m) => JSON.stringify({ v: m.verdict, t: Math.round(m.prj.total), r: m.results.map((r) => r && (m.p.mode === 'home'
  ? { f: r.feasible, b: !!r.bridged, e: r.econAdv, a: r.advantage, mc: r.minCash, oh: r.onHandAtMoveIn, pk: r.peakInst, nd: r.newDebtTotal, ni: r.newDebtInterest, cov: r.covered ? [r.covered.key, r.covered.at, r.covered.amount] : null,
      fac: r.facilities.filter((f) => f.amount > 0).map((f) => [f.key, f.amount, f.startedAt, f.pmt, f.settledAt]), ev: r.events.length, fl: r.flags.length, m: r.months.map((x) => [x.cash, x.avail, x.debt, x.econAdv, x.netWorth, x.plPay, x.eqPay]) }
  : { irr: r.irr, npv: r.npv, pay: r.monthlyPayment })), h: m.household.capTimeline.map((c) => [c.t, c.room, c.maxMortgage, c.maxTwoPl]) });

test('fork parity: every synthetic scenario gives the old engine\'s numbers (imported into the new model)', { skip: !OLD && 'old engine deleted' }, () => {
  let n = 0;
  for (const { label, inp } of scenarios(NEW, 80).concat(jointScenarios(NEW, 20))) {
    const a = OLD.computeRE(inp, { noNeed: true }), b = NEW.computeRE(toNew(inp), { noNeed: true });
    assert.equal(key(b), key(a), label);
    n++;
  }
  assert.ok(n > 90);
});

test('fork parity: the tool\'s pick (optimizer) agrees too', { skip: !OLD && 'old engine deleted' }, () => {
  for (const { label, inp } of scenarios(NEW, 12)) {
    const a = OLD.optimizeRE(inp, { plannedOnly: true }), b = NEW.optimizeRE(toNew(inp), { plannedOnly: true });
    assert.equal(b.combos, a.combos, `${label}: combos`);
    assert.equal(JSON.stringify([b.planned.best.econAdv, b.planned.best.name, b.planned.nOk]), JSON.stringify([a.planned.best.econAdv, a.planned.best.name, a.planned.nOk]), label);
  }
});
