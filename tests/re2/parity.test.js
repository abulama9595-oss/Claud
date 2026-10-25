// Fork parity: the new engine (re2) gives the old, frozen engine's numbers for any scenario the old tool could express,
// once the scenario is brought into the new model by re2Import (identity until the new model exists). The new engine may
// add results, but on these scenarios it may not change one. Skipped once the old files are deleted. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, jointScenarios } = require('./helpers.js');
const NEW = loadEngine(), OLD = loadEngine(true);

const toNew = (inp) => (NEW.re2Import ? NEW.re2Import(inp) : inp);
// a mortgage on a property you own is eq:<id> in the new engine (one property: the old engine's eq) — the same loan, compared by the old name
const fk = (k) => String(k).replace(/^eq:.*$/, 'eq');
const key = (m) => JSON.stringify({ v: m.verdict, t: Math.round(m.prj.total), r: m.results.map((r) => r && (m.p.mode === 'home'
  ? { f: r.feasible, b: !!r.bridged, e: r.econAdv, a: r.advantage, mc: r.minCash, oh: r.onHandAtMoveIn, pk: r.peakInst, nd: r.newDebtTotal, ni: r.newDebtInterest, cov: r.covered ? [fk(r.covered.key), r.covered.at, r.covered.amount] : null,
      fac: r.facilities.filter((f) => f.amount > 0).map((f) => [fk(f.key), f.amount, f.startedAt, f.pmt, f.settledAt]), ev: r.events.filter((e) => e.kind !== 'milestone').length, fl: r.flags.length, m: r.months.map((x) => [x.cash, x.avail, x.debt, x.econAdv, x.netWorth, x.plPay, x.eqPay]),
      // what the refinance step weighed, to the bit (its PV maths moved into rePvPayments in P4)
      rv: [r.pl, r.pl2].map((f) => (f && f.refiOptions ? f.refiOptions.map((o) => [o.ids.join(','), o.amount, o.net, o.value]) : null)) }
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

// a mix is compared by what it draws and what it gives (the new engine names the property and uses the kind's words, so not by name)
// (the next-best list is compared only where the old scenario builds: for a ready home the new engine knows that "at build
// start" and "when the land is bought" are one and the same mix and lists another in its place)
const mixKey = (o, alts) => { const b = o.planned.best; return JSON.stringify([b.econAdv, o.planned.nOk, b.feasible, !!b.bridged, b.recoveryOk, b.moveInOk, b.lm, b.eq, b.pl, b.co, b.pl2, b.settled, b.roomSettled, b.plan.settlePolicy, alts ? o.planned.alts.map((x) => [x.econAdv, x.lm, x.eq, x.pl, x.co, x.pl2, x.settled]) : null]); };
test('fork parity: the tool\'s pick (optimizer) agrees too — on the old tool\'s three settle policies; the new search adds "only dearer loans" when an old loan is dearer than the mortgage, and then ranks no lower', { skip: !OLD && 'old engine deleted' }, () => {
  let withDearer = 0;
  for (const { label, inp } of scenarios(NEW, 12)) {
    const a = OLD.optimizeRE(inp, { plannedOnly: true }), q = toNew(inp), b = NEW.optimizeRE(q, { plannedOnly: true, policies: ['asNeeded', 'forMax', 'none'] });
    assert.equal(b.combos, a.combos, `${label}: combos`);
    const alts = (inp.acquire || 'build') !== 'buy';
    assert.equal(mixKey(b, alts), mixKey(a, alts), label);
    // the default search: the same mixes, plus the "dearer" policy when one of the old loans is dearer than the mortgages (a
    // superset of the old search), so its best never ranks below the old best — standing, then your rules, then everything grows
    const c = NEW.optimizeRE(q, { plannedOnly: true });
    assert.equal(c.combos, c.dearer.length ? a.combos * 4 / 3 : a.combos, `${label}: default combos`);
    if (!c.dearer.length) { assert.equal(mixKey(c, alts), mixKey(a, alts), `${label}: no dearer loan, the same search`); continue; }
    withDearer++;
    const rk = (x) => [NEW.reStanding(x), NEW.reStanding(x) > 0 ? (x.recoveryOk ? 1 : 0) + (x.moveInOk ? 1 : 0) : 0, x.econAdv], ra = rk(a.planned.best), rc = rk(c.planned.best);
    assert.ok(rc[0] > ra[0] || (rc[0] === ra[0] && (rc[1] > ra[1] || (rc[1] === ra[1] && rc[2] >= ra[2] - 1e-6))), `${label}: the default search ranks no lower (${rc} vs ${ra})`);
    assert.ok(c.planned.nOk >= a.planned.nOk, `${label}: at least as many mixes meet your rules`);
  }
  assert.ok(withDearer > 0, 'some synthetic households have a dearer loan');
});
