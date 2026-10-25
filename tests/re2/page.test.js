// The page helpers the new answer page reads (re2-ui.js): the project in words per kind, the months at the instalment peak,
// the debt cover of a building that is let. Presentation only — every figure is checked against the engine's own numbers.
// Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, kindScenarios } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('reKindWords: one source of wording per kind — verbs, baseline and the project-end word', () => {
  const words = (inp) => { const p = E.mergeRE(inp), prj = E.reProject(p); return E.reKindWords(p, prj); };
  const villa = words({ kind: 'landVilla', rentNow: 8000 });
  assert.deepEqual([villa.doIt, villa.dont, villa.baseline, villa.doneShort, villa.renting], ['Own it', 'Keep renting', 'renting', 'project end', true]);
  const villa0 = words({ kind: 'landVilla', rentNow: 0 });
  assert.deepEqual([villa0.doIt, villa0.dont, villa0.baseline, villa0.baseIf], ['Build it', "Don't build", 'not building', "don't build"]);
  const ready = words({ kind: 'readyVilla', rentNow: 0 });
  assert.deepEqual([ready.doIt, ready.dont, ready.baseline, ready.build], ['Buy it', "Don't buy", 'not buying', false]);
  const land = words({ kind: 'land', rentNow: 8000 });   // you keep paying your rent either way: never "renting"
  assert.deepEqual([land.doIt, land.dont, land.baseline, land.doneLabel, land.doneShort, land.renting, land.isLand], ['Buy the land', "Don't buy the land", 'not buying the land', 'Land paid for', 'purchase', false, true]);
  const letB = words({ kind: 'landBuilding', occupancy: 'let', rentNow: 8000 });
  assert.deepEqual([letB.doIt, letB.dont, letB.baseline, letB.doneLabel, letB.letAll], ['Build the building', "Don't build the building", 'keeping your cash invested', 'Project end', true]);
  const liveB = words({ kind: 'readyBuilding', occupancy: 'liveLet', rentNow: 8000 });
  assert.deepEqual([liveB.doIt, liveB.baseline, liveB.letAll, liveB.isBuilding], ['Own it', 'renting', false, true]);
  for (const k of ['landVilla', 'readyVilla', 'land', 'landBuilding', 'readyBuilding']) { const w = words({ kind: k }); assert.ok(w.gerund && w.short && w.label === E.RE_KINDS[k].label, k); }
});

test('rePeakSpan: the months at the peak hold the plan\'s highest instalment (within 0.5%) and contain peakInstT', () => {
  let n = 0;
  for (const { label, inp } of kindScenarios(E, 24)) {
    const m = E.computeRE(inp, { noNeed: true });
    m.results.forEach((r, i) => {
      if (!r) return;
      const sp = E.rePeakSpan(r), inst = (x) => x.existInst + x.lmPay + x.eqPay + x.plPay + x.coPay + x.rfPay - (x.extraPay || 0);
      assert.ok(sp.from <= r.peakInstT && r.peakInstT <= sp.to, `${label} S${i + 1}: span holds the peak month`);
      for (let t = sp.from; t <= sp.to; t++) assert.ok(inst(r.months[t]) >= sp.peak * 0.995 - 1, `${label} S${i + 1}: month ${t} is at the peak`);
      if (sp.from > 1) assert.ok(inst(r.months[sp.from - 1]) < sp.peak * 0.995 - 1, `${label} S${i + 1}: the span starts where the peak starts`);
      n++;
    });
  }
  assert.ok(n > 40);
});

test('reDebtCover: rent received ÷ the new loans\' instalments per year, from the engine\'s months; the lowest year and the year it holds from', () => {
  const m = E.computeRE({ kind: 'landBuilding', occupancy: 'let', asOf: '2026-10', unitCount: 6, unitRentBasis: 'unit', unitRent: 4000, cashAvailable: 2500000, income: 60000 }, { noNeed: true });
  let seen = 0;
  m.results.forEach((r, i) => {
    if (!r) return;
    const dc = E.reDebtCover(r), H = r.months.length - 1;
    for (const row of dc.rows) {
      const part = r.months.filter((x) => x.t >= row.year * 12 - 11 && x.t <= Math.min(H, row.year * 12) && x.t > r.occupy);
      assert.ok(near(row.rent, part.reduce((a, x) => a + x.rentIn, 0)) && near(row.inst, part.reduce((a, x) => a + x.lmPay + x.eqPay + x.plPay + x.coPay + x.rfPay - (x.extraPay || 0), 0)), `S${i + 1} Y${row.year}: sums`);
      if (row.cover != null) assert.ok(near(row.cover, row.rent / row.inst) && row.inst > 0.5, `S${i + 1} Y${row.year}: cover`);
    }
    const withInst = dc.rows.filter((x) => x.cover != null);
    if (withInst.length) { assert.ok(withInst.every((x) => x.cover >= dc.lowest.cover - 1e-9), `S${i + 1}: lowest`); seen++; }
    if (dc.coversFrom != null) assert.ok(withInst.filter((x) => x.t >= dc.coversFrom).every((x) => x.cover >= 1) && (withInst.find((x) => x.t === dc.coversFrom) || {}).cover >= 1, `S${i + 1}: covers from`);
    else assert.ok(!withInst.length || withInst[withInst.length - 1].cover < 1, `S${i + 1}: never covers`);
  });
  assert.ok(seen > 0, 'a building let with a loan has cover rows');
  // a villa you live in receives no rent: cover is 0 wherever there are instalments
  const v = E.computeRE({ kind: 'landVilla', asOf: '2026-10' }, { noNeed: true }).results.find(Boolean);
  const dv = E.reDebtCover(v);
  assert.ok(dv.rows.filter((x) => x.cover != null).every((x) => x.cover === 0) && dv.coversFrom == null);
});
