// Personal loans at several moments (the plan editor's ticks): extra steps, before or after the purchase mortgage, and
// "automatically, whenever my cash would run short". Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
// a building on land bought in month 6: cash runs short during the build; one old personal loan that ends in month 24
const base = { asOf: '2026-10', kind: 'landBuilding', occupancy: 'let', landArea: 600, landPrice: 2500, builtPct: 60, floors: 3, buildCost: 1900, finishExtra: 100000, landMonth: 6, buildStart: 8, buildMonths: 20,
  unitCount: 8, income: 90000, livingExpenses: 30000, cashAvailable: 2000000, cashBuffer: 100000, rentNow: 0, properties: [], joint: { on: false },
  existingLoans: [{ id: 1, name: 'Loan K', balance: 420000, installment: 18000, monthsLeft: 24, rate: 5.5, type: 'personal', canSettle: true, canRefi: true, ageMonths: 30 }] };
const run = (plan, extra) => { const inp = { ...base, ...(extra || {}) }, p = E.mergeRE(inp), prj = E.reProject(p); return { r: E.reRunPlan(p, prj, { ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true, ...plan }), p, prj }; };
const pls = (r) => r.facilities.filter((f) => /^pl\d*$/.test(f.key) && f.amount > 0);

test('ticks: the options follow the kind of project; reading and writing them round-trips', () => {
  const keys = (kind, x) => { const p = E.mergeRE({ ...base, kind, ...(x || {}) }), prj = E.reProject(p); return E.rePlTicks(p, prj, {}).map(([k]) => k).join(','); };
  assert.equal(keys('landBuilding'), ['start', 'preLand', 'land', 'build', 'done', 'month', 'auto'].join(','));
  assert.equal(keys('readyVilla', { propertyPrice: 2000000 }), ['start', 'preLand', 'land', 'month', 'auto'].join(','));
  assert.equal(keys('readyBuilding', { propertyPrice: 5000000 }), ['start', 'preLand', 'land', 'month', 'auto'].join(','));
  assert.equal(keys('land'), ['start', 'preLand', 'land', 'month', 'auto'].join(','));
  assert.equal(keys('readyVilla', { propertyPrice: 2000000, landMonth: 0 }), ['preLand', 'land', 'month', 'auto'].join(','));
  const p = E.mergeRE(base), prj = E.reProject(p);
  const o = E.rePlTicksApply(new Set(['build', 'preLand', 'month', 'done', 'auto']), 30, prj);
  assert.equal(o.plWhen, 'preLand'); assert.equal(JSON.stringify(o.plMore), JSON.stringify([{ when: 'build', month: 0 }, { when: 'month', month: 30 }])); assert.ok(o.pl2Use && o.plAuto);
  const back = E.rePlTicksOf({ ...E.RE_PLAN_DEFAULTS, ...o });
  assert.equal([...back.sel].sort().join(','), 'auto,build,done,month,preLand'); assert.equal(back.month, 30);
  // the old single choices read back as ticks
  assert.equal([...E.rePlTicksOf({ plWhen: 'land', pl2Use: true }).sel].sort().join(','), 'done,land');
});

test('several steps: each is the bank maximum in its month, a later one tops up or buys out the earlier once old enough', () => {
  const one = run({ plWhen: 'land' }).r, three = run({ plWhen: 'land', plMore: [{ when: 'build' }, { when: 'month', month: 20 }] }).r;
  const ks = pls(three).map((f) => f.startedAt);
  assert.ok(ks.length >= 2 && ks.every((t, k) => k === 0 || t >= ks[k - 1]), `steps in month order: ${ks}`);
  assert.ok(three.events.some((e) => e.fac === 'pl3'), 'the extra step is in the step-by-step');
  assert.ok(three.minCash >= one.minCash - 1, 'more steps never leave less cash at the lowest point');
  // the extra steps count in the personal-loan debt: every month the parts add up to the new debt
  for (const m of three.months) assert.ok(Math.abs(m.debtPl + m.debtLm + m.debtEq + m.debtCo - m.debtNew) < 1, `month ${m.t}`);
});

test('before the purchase mortgage takes the room first; after it fills what is left', () => {
  const before = run({ plWhen: 'preLand' }).r, after = run({ plWhen: 'land' }).r;
  assert.equal(before.pl.startedAt, after.pl.startedAt);
  assert.ok(before.pl.amount > after.pl.amount + 1 || before.lm.amount < after.lm.amount - 1, `before ${Math.round(before.pl.amount)} / ${Math.round(before.lm.amount)} vs after ${Math.round(after.pl.amount)} / ${Math.round(after.lm.amount)}`);
  const iB = before.events.findIndex((e) => e.fac === 'pl'), iL = before.events.findIndex((e) => e.fac === 'lm');
  assert.ok(iB >= 0 && iL >= 0 && iB < iL, 'the personal loan comes before the mortgage');
});

test('automatically: a plan that runs out takes the bank maximum where the cash runs short and stands better', () => {
  // (construction may not run late here: this test is about the automatic loans)
  const off = run({}, { lateMaxMonths: 0 }).r, on = run({ plAuto: true }, { lateMaxMonths: 0 }).r;
  assert.ok(!off.feasible, 'the mortgage alone runs out');
  assert.ok(E.reStanding(on) > E.reStanding(off) || on.minCash > off.minCash + 1, 'auto helps');
  assert.ok(on.plan._plAuto.length >= 1 && pls(on).some((f) => f.label.includes('when your cash runs short')));
  // a plan that works is left alone
  const ok = run({ plWhen: 'land', plMore: [{ when: 'build' }], plAuto: true }, { cashAvailable: 6000000 }).r;
  assert.ok(ok.feasible && !ok.plan._plAuto);
  // the tool's search can use it, and names it
  const st = E.optimizeRE({ ...base, plans: [] }, { plannedOnly: true }).planned;
  assert.ok(st.best && st.best.name);
});

test('old plans run exactly as before (no extra steps, no auto)', () => {
  const a = run({ plWhen: 'build', pl2Use: true }).r, b = run({ plWhen: 'build', pl2Use: true, plMore: [], plAuto: false }).r;
  assert.equal(a.econAdv, b.econAdv); assert.equal(a.minCash, b.minCash);
});
