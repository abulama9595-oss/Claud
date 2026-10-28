// Bridge money is a short gap (bridgeMaxMonths), plans that run out rank by how short they are, and reFindDate finds the
// earliest later dates at which a plan works. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine } = require('./helpers.js');
const E = loadEngine();
// a building bought in month 3 and built from month 6: far too little cash today; a cash-out at completion closes the gap
const base = { asOf: '2026-10', kind: 'landBuilding', occupancy: 'let', landArea: 700, landPrice: 2500, builtPct: 60, floors: 3, buildCost: 1800, finishExtra: 100000, landMonth: 3, buildStart: 6, buildMonths: 18,
  unitCount: 8, income: 95000, livingExpenses: 30000, cashAvailable: 1500000, cashBuffer: 0, rentNow: 0, properties: [], joint: { on: false }, existingLoans: [] };
const coPlan = { ...E.RE_PLAN_DEFAULTS, enabled: true, coUse: true };

test('no bridge money: a long gap runs out (or the construction runs late); imported scenarios keep the old rule', () => {
  const p = E.mergeRE(base), prj = E.reProject(p);
  const longGap = E.reRunPlan(p, prj, coPlan);
  assert.ok(!longGap.bridged, 'a gap until the cash-out lands is never bridged');
  const p2 = E.mergeRE({ ...base, coverAny: false, bridgeMaxMonths: null }), noLimit = E.reRunPlan(p2, E.reProject(p2), coPlan);
  assert.ok(noLimit.bridged && noLimit.bridges.some((g) => g.to - g.from > 6), 'imported (the old rule, no limit): the same plan is bridged');
  assert.equal(E.re2Import({}).bridgeMaxMonths, null, 'imported scenarios keep the old rule');
  assert.equal(E.re2Import({}).coverAny, false);
});

test('construction runs late: payments wait for your savings, the project ends later, within your limit', () => {
  const short = { kind: 'landVilla', asOf: '2026-10', income: 60000, livingExpenses: 15000, rentNow: 6000, cashAvailable: 900000, existingLoans: [], landArea: 400, landPrice: 1500, buildMonths: 12, buildStart: 3, landMonth: 1 };
  const plan = { ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: false, plWhen: 'none' };
  const at = (late) => { const p = E.mergeRE({ ...short, lateMaxMonths: late }), prj = E.reProject(p); return { r: E.reRunPlan(p, prj, plan), prj }; };
  const no = at(0), six = at(6), long = at(36);
  assert.ok(!no.r.feasible && !six.r.feasible, 'too late for 0 or 6 months: runs out');
  const r = long.r, L = r.late;
  assert.ok(r.feasible && L && L.months > 6 && L.months <= 36 && r.occupy === long.prj.occupy + L.months && E.reStanding(r) === 1, JSON.stringify(L));
  assert.ok(r.minCash >= 0 && r.months.every((m) => m.bridgeInt === 0), 'never short, no bridge');
  assert.ok(r.flags[0].startsWith('Construction runs') && r.events.some((e) => e.kind === 'late'));
  // every riyal of the project is paid, the land on its date
  const paid = r.months.reduce((a, m) => a + m.spend, 0);
  assert.ok(Math.abs(paid - long.prj.total) < 1, `${paid} vs ${long.prj.total}`);
  assert.ok(Math.abs(r.months[long.prj.landMonth].spend - long.prj.schedule[long.prj.landMonth]) < 1e-6);
  // rent is paid until the later move-in, and the home is complete only then
  assert.ok(r.months[r.occupy - 1].rentPaid > 0 && r.months[r.occupy].rentPaid === 0);
  assert.ok(r.events.some((e) => e.t === r.occupy && e.kind === 'milestone' && /move in/.test(e.text)));
  // a plan that works on time ranks above one that runs late
  assert.ok(E.reStanding({ feasible: true }) > E.reStanding(r));
});

test('when no mix works, the tool picks the one with the smallest shortfall', () => {
  const st = E.optimizeRE({ ...base, cashAvailable: 600000, income: 60000, plans: [] }, { plannedOnly: true, prepay: false, auto: false }).planned;
  assert.equal(E.reStanding(st.best), 0);
  const all = [st.best, ...(st.alts || [])].filter((x) => E.reStanding(x) === 0);
  assert.ok(all.every((x) => x.minCash <= st.best.minCash + 1), 'the best has the highest lowest cash');
});

test('reFindDate: the earliest later start at which a plan works, or none and how much more it needs', () => {
  const rich = { ...base, cashAvailable: 700000 };   // about 116K short with the dates set
  const plan = { ...E.RE_PLAN_DEFAULTS, enabled: true, lmUse: true, plWhen: 'build' };
  const p = E.mergeRE(rich), prj = E.reProject(p), now = E.reRunPlan(p, prj, plan);
  assert.ok(!now.feasible, 'short at the dates set');
  const x = E.reFindDate(rich, plan);
  assert.ok(x.found && x.found.wait >= 1 && x.found.wait <= 48, JSON.stringify(x.found));
  const q = E.mergeRE(E.reAtStart(p, x.found.delay, x.found.landWithBuild));
  assert.ok(E.reRunPlan(q, E.reProject(q), plan).feasible, 'it works at the dates found');
  if (x.found.wait > 1) { const q1 = E.mergeRE(E.reAtStart(p, x.found.delay - 1, x.found.landWithBuild)); assert.ok(!E.reRunPlan(q1, E.reProject(q1), plan).feasible, 'and not a month earlier (same way of moving)'); }
  const poor = E.reFindDate({ ...base, cashAvailable: 400000, income: 50000 }, plan, { maxWait: 12, need: true });
  assert.ok(!poor.found && poor.need > 0, 'none within the wait: how much more it needs');
});
