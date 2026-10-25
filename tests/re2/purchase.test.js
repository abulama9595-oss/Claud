// The purchase item by item (price, transfer tax with the first-home relief worked out, broker's fee) and the early payoff's
// "where the cash comes from": both add up exactly to the engine. Synthetic only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios2 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

test('purchase parts add up to what the purchase month costs; the relief taxes only the part above the cap', () => {
  const cases = scenarios2(E, 40).map((x) => x.inp).concat([
    { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 2500000, firstHomeExempt: true, rettExemptCap: 1000000, landMonth: 0 },
    { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 800000, firstHomeExempt: true, rettExemptCap: 1000000, landMonth: 0 },
    { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 2500000, firstHomeExempt: false, landMonth: 0 },
  ]);
  for (const inp of cases) {
    const p = E.mergeRE(inp), prj = E.reProject(p), parts = E.rePurchaseParts(p, prj);
    const want = prj.build ? prj.land + prj.rett + (prj.landBroker || 0) : prj.total;
    assert.ok(near(parts.reduce((a, x) => a + x.v, 0), want), `${p.kind}: parts ${parts.map((x) => x.label)}`);
  }
  const at = (inp) => { const p = E.mergeRE(inp), prj = E.reProject(p); return { p, prj, note: E.reRettNote(p, prj) }; };
  const a = at(cases[cases.length - 3]);
  assert.ok(near(a.prj.rett, 75000) && near(a.prj.broker, 62500), `relief: ${a.prj.rett}`);
  assert.match(a.note, /5% of 1,500,000/);
  const b = at(cases[cases.length - 2]);
  assert.ok(near(b.prj.rett, 0) && /^none/.test(b.note));
  const c = at(cases[cases.length - 1]);
  assert.ok(near(c.prj.rett, 125000) && /5% of the price, 2,500,000/.test(c.note));
  assert.ok(E.computeRE({ ...cases[cases.length - 3], plans: [{ ...E.RE_PLAN_PRESETS.landMortgage, enabled: true }] }, { noNeed: true }).results[0].events.some((e) => /^Home bought: .* \+ transfer tax 75K \(5% of the 1\.50M above the first 1\.00M/.test(e.text)));
});

test('early payoff: where the cash comes from adds up, and the cash test holds (not a month earlier)', () => {
  const inp = { asOf: '2026-10', kind: 'readyVilla', propertyPrice: 3000000, finishExtra: 0, income: 150000, livingExpenses: 40000, rentNow: 0, cashAvailable: 2500000, cashBuffer: 200000, altReturn: 4, lmRate: 7, lmTenure: 20, existingLoans: [],
    plans: [{ ...E.RE_PLAN_PRESETS.landMortgage, enabled: true, prepayAfter: 'asap' }] };
  const p = E.mergeRE(inp), prj = E.reProject(p), r = E.computeRE(inp, { noNeed: true }).results[0];
  assert.ok(r.prepaid && r.prepaid.length, 'the plan pays the mortgage off early');
  const d = E.rePrepayDetail(r, r.prepaid[0].key, p, prj);
  assert.ok(near(d.start + d.flows.reduce((a, x) => a + x.v, 0), d.before, 0.5), 'flows add up to the cash before the payoff');
  assert.ok(near(d.before - d.cost, d.after) && near(d.balance + d.fee, d.cost));
  assert.ok(near(d.after, r.months[d.t].avail, 0.5), 'cash after = the run');
  assert.ok(d.after >= d.need - 0.01, 'passes the test');
  if (d.earlier) assert.ok(d.earlier.left < d.earlier.need, 'a month earlier it fails');
  assert.equal(E.rePrepayDetail(r, 'nope', p, prj), null);
});
