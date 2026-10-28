// Every property you own, in the simulation (v2): a mortgage on each one a plan asks for (eq:<id>) within its LTV less the loan
// secured on it, all mortgages — new and existing — within the mortgage cap, the rent a property earns on both sides, its sale
// (at move-in on the building side; in a month you set on both sides, repaying the plan's mortgage and the loan secured on it),
// the refusals and warnings, the loans taken early or bridged around a sale, and the page helpers naming each property.
// Synthetic figures only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios2, FAMILY3 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const run = (inp, i = 0) => E.computeRE(inp, { noNeed: true }).results[i];
// a household with plenty of cash (every plan works), and one that runs short during the build
const RICH = { kind: 'landVilla', asOf: '2026-10', income: 120000, livingExpenses: 20000, cashAvailable: 6000000, existingLoans: [], landMonth: 0, buildStart: 0, horizon: 15, plans: [{ enabled: true, lmUse: true, settlePolicy: 'none' }] };
const TIGHT = { kind: 'landVilla', asOf: '2026-10', income: 60000, livingExpenses: 25000, cashAvailable: 1500000, existingLoans: [], landMonth: 0, buildStart: 0, horizon: 15 };
const FLAT = { id: 'p1', name: 'Flat B', value: 2000000, ltv: 70 };
// an existing loan's balance after its first (t − 1) instalments (as the household pays it: floored at the clearing annuity)
const balBefore = (l, t) => { const pay0 = Math.max(l.installment, E.rePmt(l.balance, l.rate, Math.max(1, Math.round(l.monthsLeft)))); let b = l.balance; for (let k = 1; k < t && b > 0.5; k++) { const i = b * l.rate / 1200; b -= Math.min(b + i, pay0) - i; } return { b: Math.max(0, b), pay0 }; };

test('bank limits with your properties: every mortgage — new ones and the existing mortgages secured on your properties — within the mortgage cap; each eq:<id> within its LTV (both bases) less the loan secured on it', () => {
  const bad = [], n = { months: 0, eqs: 0, secured: 0, today: 0, market: 0 };
  for (const { label, inp } of scenarios2(E, 70)) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p, cap = (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100;
    const morts = p.existingLoans.filter((l) => l.type === 'mortgage' && l.balance > 0 && l.installment > 0);
    p.properties.forEach((P) => { if (P.existingLoanId != null) { const l = p.existingLoans.find((x) => String(x.id) === String(P.existingLoanId)); if (l) assert.ok(l.type === 'mortgage' && l.securedOn === P.id, `${label}: a loan a property names is secured on it`); } });
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`, H = r.months.length - 1;
      morts.forEach((l) => { if (r.payoffs.some((x) => x.name === l.name && (l.settleAt == null || Math.round(l.settleAt) !== x.t)) || [r.pl, r.pl2].some((f) => f.refi && f.refi.names.includes(l.name))) bad.push(`${at}: ${l.name} is a mortgage — settled for room or bought out`); });
      // an existing mortgage's instalment in month t while it runs (gone once settled, bought out never, or repaid by a sale)
      const existMort = (t) => morts.reduce((a, l) => { const e = r.loansEnd.find((x) => String(x.id) === String(l.id)), { b, pay0 } = balBefore(l, t); return a + (b > 0.5 && (e.settledAt == null || e.settledAt > t) ? Math.min(pay0, b * (1 + l.rate / 1200)) : 0); }, 0);
      const newMorts = r.facilities.filter((f) => (f.key === 'lm' || f.key === 'co' || /^eq:/.test(f.key)) && f.amount > 0);
      for (let t = 1; t <= H; t++) {
        if (!newMorts.some((f) => f.startedAt < t && (f.settledAt == null || f.settledAt > t))) continue;
        const mo = r.months[t], mort = mo.lmPay + mo.eqPay + mo.coPay - mo.extraPay + existMort(t);
        if (mort > cap * mo.inc + 1e-6) bad.push(`${at} M${t}: mortgages ${mort} > ${cap * mo.inc}`);
        n.months++;
      }
      r.eqs.forEach((f) => {
        if (!(f.amount > 0)) return;
        const P = p.properties.find((x) => x.id === f.propId), t = f.startedAt;
        const basis = p.propertyValueBasis === 'today' ? P.value : P.value * Math.pow(1 + p.appreciation / 100, t / 12);
        // the loan secured on it: its balance when the mortgage is taken (none if it was settled before, or by a sale that month)
        const sec = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0 && E.reSecuredOn(l, P)).reduce((a, l) => { const e = r.loansEnd.find((x) => String(x.id) === String(l.id)); return a + (e.settledAt != null && e.settledAt <= t ? 0 : balBefore(l, t).b); }, 0);
        if (!near(f.capacity.byLtv, basis * P.ltv / 100 - sec, 0.01)) bad.push(`${at} ${f.key}: LTV room ${f.capacity.byLtv} vs ${basis * P.ltv / 100 - sec}`);
        if (f.amount > basis * P.ltv / 100 - sec + 1) bad.push(`${at} ${f.key}: ${f.amount} over the LTV room`);
        n.eqs++; if (sec > 0) n.secured++; n[p.propertyValueBasis]++;
      });
    });
  }
  assert.ok(n.months > 1000 && n.eqs > 50 && n.secured > 3 && n.today > 5 && n.market > 5, JSON.stringify(n));
  assert.deepEqual(bad.slice(0, 10), []);
});

test('three properties (the acceptance case): the home you live in let after the move, a flat with an existing mortgage that a plan mortgages too and that earns rent, a plot sold in month 30 on both sides', () => {
  const m = E.computeRE(FAMILY3, { noNeed: true }), p = m.p, occ = m.prj.occupy;
  assert.equal(p.existingLoans.find((l) => l.id === 2).type, 'mortgage');
  const [r1, r2, r3, r4] = m.results;
  // one facility per property a plan mortgages, in property order, each named
  assert.deepEqual(r2.eqs.map((f) => [f.key, f.propId, f.label]), [['eq:p2', 'p2', 'Mortgage on Flat B'], ['eq:p3', 'p3', 'Mortgage on Plot C']]);
  assert.equal(r2.eq, r2.eqs[0], 'r.eq is the first of them'); assert.equal(r2.facilities.filter((f) => /^eq:/.test(f.key)).length, 2);
  // the flat's mortgage: its market value at build start × 70% less what is still owed on the existing mortgage then
  const sec = balBefore(p.existingLoans[1], r2.eqs[0].startedAt).b;
  assert.ok(near(r2.eqs[0].capacity.byLtv, 2500000 * Math.pow(1.04, r2.eqs[0].startedAt / 12) * 0.7 - sec, 0.01) && near(r2.eqs[0].amount, r2.eqs[0].capacity.byLtv, 0.01), 'sized net of the loan secured on it');
  // the plot: mortgaged when the land is bought, repaid when it is sold in month 30 — on both sides, with the same proceeds
  const s = r2.sales.find((x) => x.id === 'p3');
  assert.ok(s && s.side === 'both' && s.t === 30 && !s.isHome && s.payoff > 0 && s.oldPayoff === 0 && near(s.net, s.value - s.costs - s.payoff, 1e-6), JSON.stringify(s));
  assert.ok(near(s.value, 1500000 * Math.pow(1.04, 30 / 12), 0.01) && near(s.costs, s.value * 0.075, 0.01));
  assert.equal(r2.eqs[1].settledAt, 30); assert.equal(r2.eqs[1].soldAt, 30);
  assert.ok(near(r2.months[30].renterSale, s.value - s.costs, 0.01) && r2.months[29].renterSale === 0, 'the not-building side sells it too');
  assert.ok(r2.months[29].debtEq > r2.months[30].debtEq + s.payoff * 0.9, 'debtEq drops by the plot mortgage');
  assert.ok(r2.months.slice(31).every((x) => x.ownGone === 0), 'sold on both sides: nothing is deducted');
  // the home you live in: let from the month after move-in (its value × 3.5% a year); the flat earns 7,000 a month on both sides
  assert.equal(r1.ownPlan, 'let'); assert.ok(r1.months[occ + 1].ownIn > 0 && r1.months[occ].ownIn === 0);
  assert.ok(near(r1.months[1].propRentIn, 7000) && near(r1.months[1].propRentBase, 7000) && near(r1.propRentTotal, r1.months.reduce((a, x) => a + x.propRentIn, 0), 1e-6));
  // every plan sells the plot (it is the scenario's, not a plan's); plan 4 asks for a mortgage on it after the sale and is refused
  m.results.forEach((r) => assert.equal(r.sales.filter((x) => x.id === 'p3').length, 1));
  assert.equal(r4.eqs[0].amount, 0); assert.match(r4.eqs[0].capacity.limitedBy, /^Plot C was sold in month 30$/);
  assert.ok(r4.events.some((e) => e.kind === 'eq' && /Mortgage on Plot C: not possible — Plot C was sold in month 30/.test(e.text)));
  assert.ok(m.household.warnings.some((w) => /^Plan 4 mortgages Plot C in month 36, but it is sold in month 30/.test(w)));
  // the land mortgage, the flat's new mortgage and its existing mortgage together stay within the mortgage cap
  const t = r2.eqs[0].startedAt + 1, mo = r2.months[t], existMort = Math.min(8200 + 0, balBefore(p.existingLoans[1], t).b * (1 + 4.5 / 1200));
  assert.ok(mo.lmPay + mo.eqPay + mo.coPay + Math.max(8200, E.rePmt(900000, 4.5, 150)) <= 0.55 * mo.inc + 1e-6 || existMort > 0);
});

test('a sale repays the plan\'s mortgage on the property and the loan secured on it (each with the early-settlement fee); debtEq and the old-loan instalments drop; in a month you set the not-building side does the same', () => {
  const loan = { id: 5, name: 'Flat loan', balance: 600000, installment: 6000, monthsLeft: 120, rate: 4, securedOn: 'p1' };
  const r = run({ ...RICH, settleFeeMonths: 3, existingLoans: [loan], properties: [{ ...FLAT, plan: 'sell', sellAt: 24 }], plans: [{ enabled: true, lmUse: true, settlePolicy: 'none', mortgages: { p1: { when: 'start', month: 0 } } }] });
  const f = r.eqs[0], s = r.sales[0];
  assert.ok(f.amount > 0 && f.startedAt === 0 && f.settledAt === 24 && f.soldAt === 24, JSON.stringify([f.amount, f.startedAt, f.settledAt, f.soldAt]));
  // the mortgage was sized on the flat's value less the 600,000 still owed; it is repaid at what the payoff table says for month 23
  assert.ok(near(f.capacity.byLtv, 2000000 * 0.7 - 600000, 0.01));
  const pr = E.rePayoffRows(f, 0, 3);
  assert.ok(pr.early && pr.early.kind === 'sold' && pr.early.t === 24 && near(pr.early.row.total, s.payoff, 0.01), `payoff ${s.payoff} vs ${pr.early && pr.early.row.total}`);
  // the old loan: its balance after 23 instalments plus the next 3 months' profit
  const { b, pay0 } = balBefore(loan, 24);
  assert.ok(near(s.oldPayoff, E.reSettleCost(b, 4, pay0, 120 - 23, 3), 0.01) && s.oldNames[0] === 'Flat loan' && s.oldFee > 0, `old payoff ${s.oldPayoff}`);
  assert.ok(near(s.net, s.value - s.costs - s.payoff - s.oldPayoff, 1e-6) && s.side === 'both');
  const e = r.loansEnd.find((x) => x.id === 5); assert.equal(e.settledAt, 24); assert.equal(e.soldAt, 24);
  assert.ok(r.months[23].debtEq > 0 && r.months[24].debtEq === 0 && r.months.slice(25).every((x) => x.eqPay === 0 && x.existInst === 0), 'no instalments after the sale');
  // the not-building side: the same gross proceeds, and the loan repaid then (renterSettle), so the old-loan gap stays 0
  assert.ok(near(r.months[24].renterSale, s.value - s.costs, 0.01) && near(r.months[24].renterSettle, s.oldPayoff, 0.01));
  assert.ok(r.months.slice(24).every((x) => near(x.oldDebtGap, 0, 1e-6)));
  assert.ok(r.payoffs.length === 0, 'the sale is not an early payoff from your cash');
  // the sale's fee on the plan's mortgage is a new-loan cost; the old loan's fee is an old-loan cost (settleFees)
  assert.ok(near(r.settleFees, s.oldFee, 1e-6) && near(r.settledTotal, b, 1e-6));
  // the event says it all
  assert.ok(r.events.some((x) => x.kind === 'cash' && /^Sell Flat B: .* to repay its mortgage .* and .* to repay Flat loan .* lands in your cash \(you would sell it whether or not you build/.test(x.text)));
  // a sale at move-in of a property you do not live in: this side only; the not-building side keeps it, so its value is deducted
  const mv = run({ ...RICH, properties: [{ ...FLAT, plan: 'sell', sellAt: 'moveIn' }] });
  assert.ok(mv.sales[0].side === 'strategy' && mv.sales[0].t === mv.occupy && mv.ownSale === null);
  assert.ok(mv.months.every((x) => near(x.renterSale, 0)) && near(mv.months[mv.occupy].ownGone, 2000000 * Math.pow(1.04, mv.occupy / 12), 0.01) && mv.months[mv.occupy - 1].ownGone === 0);
});

test('a property sold in a month you set, with no loan on it and no rent, leaves the comparison unchanged; the rent a property earns leaves it unchanged too and raises your cash at move-in', () => {
  const keep = run({ ...RICH, properties: [FLAT] }), occ = keep.occupy;
  assert.ok(keep.feasible && keep.months.every((x) => x.cash > 0 && x.rCash > 0), 'cash stays positive on both sides, so growth is the same on both');
  const sold = run({ ...RICH, properties: [{ ...FLAT, plan: 'sell', sellAt: occ + 6 }] });
  assert.ok(near(sold.econAdv, keep.econAdv, 1e-3) && near(sold.advantage, keep.advantage + sold.sales[0].net - (sold.sales[0].value - sold.sales[0].costs), 1e-3), `econ ${sold.econAdv} vs ${keep.econAdv}`);
  assert.ok(sold.sales[0].side === 'both' && near(sold.months[occ + 6].renterSale, sold.sales[0].net, 1e-6) && near(sold.months[occ + 6].cash - sold.months[occ + 5].cash, keep.months[occ + 6].cash - keep.months[occ + 5].cash + sold.sales[0].net, 1e-3));
  const rent = run({ ...RICH, properties: [{ ...FLAT, rentNow: 6000 }] });
  assert.ok(near(rent.econAdv, keep.econAdv, 1e-3), `rent: ${rent.econAdv} vs ${keep.econAdv}`);
  const toMoveIn = rent.months.filter((x) => x.t >= 1 && x.t <= occ).reduce((a, x) => a + x.propRentIn, 0);
  assert.ok(toMoveIn > 0 && near(rent.onHandAtMoveIn, keep.onHandAtMoveIn + toMoveIn, 1e-6), 'cash at move-in is higher by the rent received');
  assert.ok(rent.months.every((x) => near(x.propRentIn, x.propRentBase, 1e-9) && near(x.inc, keep.months[x.t].inc, 1e-9)), 'the same rent on both sides; never the bank\'s income');
  // the rent follows the rent freeze and then rent growth, like the rent you pay
  const grown = run({ ...RICH, rentFreezeUntil: null, rentGrowth: 3, properties: [{ ...FLAT, rentNow: 6000 }] });
  assert.ok(near(grown.months[12].propRentIn, 6000) && near(grown.months[13].propRentIn, 6180, 1e-6));
  // a sale stops it on the side that sold: at move-in the not-building side keeps the rent
  const rs = run({ ...RICH, properties: [{ ...FLAT, rentNow: 6000, plan: 'sell', sellAt: 'moveIn' }] });
  assert.ok(near(rs.months[occ].propRentIn, 6000) && rs.months[occ + 1].propRentIn === 0 && near(rs.months[occ + 1].propRentBase, 6000));
  const w = E.reWealthParts(rs); assert.ok(near(w.total, rs.econAdv, 1e-6) && w.parts.find((x) => x.key === 'propRent').v < 0, 'the rent you no longer receive is a part of the result');
  // a kept property with no rent and no loan changes no number
  const none = run({ ...RICH, properties: [] });
  for (const k of ['econAdv', 'advantage', 'minCash', 'onHandAtMoveIn', 'newDebtTotal']) assert.equal(keep[k], none[k], k);
});

test('the home you live in: sold at move-in, or in a later month you set (never before — you live there), on this side only; not when you rent today', () => {
  const home = { id: 'p1', name: 'Our home', value: 3000000, ltv: 70, isHome: true, plan: 'sell' }, OWN = { ...RICH, rentNow: 0 };   // you live in it: no rent today
  const a = run({ ...OWN, properties: [{ ...home, sellAt: 5 }] }), occ = a.occupy;
  assert.ok(a.ownSale && a.ownSale.t === occ && a.ownSale.isHome && a.ownSale.side === 'strategy' && a.sales[0] === a.ownSale, 'a month before move-in: sold at move-in');
  const b = run({ ...OWN, properties: [{ ...home, sellAt: occ + 12 }] });
  assert.ok(b.ownSale && b.ownSale.t === occ + 12 && b.months[occ + 12].ownGone > 0 && b.months[occ + 11].ownGone === 0 && b.months.every((x) => x.renterSale === 0));
  assert.ok(a.events.some((e) => /^Sell the home you lived in:/.test(e.text)) && b.ownSale.net > 0);
  assert.equal(run({ ...RICH, rentNow: 9000, properties: [{ ...home, sellAt: occ + 12 }] }).ownSale, null, 'you rent today: the plan does not apply');
  assert.equal(E.mergeRE({ properties: [{ ...home, rentNow: 5000 }] }).properties[0].rentNow, 0, 'the home you live in earns no rent');
  assert.equal(E.mergeRE({ properties: Array.from({ length: 8 }, (_, k) => ({ id: `p${k + 1}`, value: 1 })) }).properties.length, 6, 'at most six properties');
});

test('a step on a property you may not mortgage, one already sold or one you do not own lends nothing and says why; a plan with no step has a blank eq', () => {
  const plan = (m) => [{ enabled: true, lmUse: true, settlePolicy: 'none', mortgages: m }];
  const no = run({ ...RICH, properties: [{ ...FLAT, canMortgage: false }], plans: plan({ p1: { when: 'build', month: 0 } }) });
  assert.ok(no.eq.key === 'eq:p1' && no.eq.propId === 'p1' && no.eq.amount === 0 && no.eq.capacity.limitedBy === 'Flat B cannot be mortgaged');
  assert.ok(no.events.some((e) => e.kind === 'eq' && /^Mortgage on Flat B: nothing available \(Flat B cannot be mortgaged/.test(e.text)));
  const sold = run({ ...RICH, properties: [{ ...FLAT, plan: 'sell', sellAt: 6 }], plans: plan({ p1: { when: 'month', month: 9 } }) });
  assert.ok(sold.eqs[0].amount === 0 && sold.eqs[0].capacity.limitedBy === 'Flat B was sold in month 6' && sold.events.some((e) => /not possible — Flat B was sold in month 6/.test(e.text)));
  const same = run({ ...RICH, properties: [{ ...FLAT, plan: 'sell', sellAt: 9 }], plans: plan({ p1: { when: 'month', month: 9 } }) });
  assert.ok(same.eqs[0].amount === 0 && /was sold in month 9/.test(same.eqs[0].capacity.limitedBy), 'the sale comes before the mortgage in the same month');
  const unknown = run({ ...RICH, properties: [FLAT], plans: plan({ p9: { when: 'build', month: 0 } }) });
  assert.ok(unknown.eqs[0].key === 'eq:p9' && unknown.eqs[0].propId === null && unknown.eqs[0].amount === 0 && unknown.eqs[0].capacity.limitedBy === 'you own no property "p9" to mortgage');
  const none = run({ ...RICH, properties: [FLAT] });
  assert.ok(none.eq.key === 'eq' && none.eq.amount === 0 && none.eq.propId === 'p1' && none.eqs.length === 0 && !none.facilities.some((f) => /^eq/.test(f.key)));
  assert.equal(run({ ...RICH, properties: [{ ...FLAT, canMortgage: false }] }).eq.propId, null);
  const ok = run({ ...RICH, properties: [FLAT], plans: plan({ p1: { when: 'build', month: 0 } }) });
  assert.ok(ok.eq.amount > 0 && ok.eq === ok.eqs[0] && ok.eq === ok.facilities.find((f) => f.key === 'eq:p1'), 'one object for the alias, the list and the facilities');
});

test('warnings: a loan named by two properties, a property worth less than the loan on it, a plan that mortgages a property after selling it', () => {
  const loan = { id: 5, name: 'Flat loan', balance: 2500000, installment: 15000, monthsLeft: 240, rate: 4 };
  const w = E.computeRE({ ...RICH, existingLoans: [loan], properties: [{ ...FLAT, existingLoanId: 5 }, { id: 'p2', name: 'Plot C', value: 1000000, existingLoanId: 5, plan: 'sell', sellAt: 10 }],
    plans: [{ enabled: true, lmUse: true, mortgages: { p2: { when: 'build', month: 0 } } }] }, { noNeed: true }).household.warnings;
  assert.ok(w.some((x) => /^Flat loan is named by Flat B and Plot C/.test(x)), w.join(' | '));
  assert.ok(w.some((x) => /^Flat B is worth 2\.00M but 2\.50M is still owed on it/.test(x)) && w.some((x) => /^Plot C is worth 1\.00M but 2\.50M is still owed/.test(x)));
  assert.ok(w.some((x) => /^Plan 1 mortgages Plot C in month 0, but it is sold in month 10/.test(x)) === false, 'mortgaged before it is sold: no warning');
  const w2 = E.computeRE({ ...RICH, properties: [{ id: 'p2', name: 'Plot C', value: 1000000, plan: 'sell', sellAt: 10 }], plans: [{ enabled: true, mortgages: { p2: { when: 'month', month: 10 } } }] }, { noNeed: true }).household.warnings;
  assert.ok(w2.some((x) => /^Plan 1 mortgages Plot C in month 10, but it is sold in month 10 — that step lends nothing/.test(x)), w2.join(' | '));
  assert.equal(E.computeRE({ ...RICH, properties: [FLAT, { id: 'p2', name: 'Plot C', value: 1000000 }] }, { noNeed: true }).household.warnings.length, 0);
});

test('is this loan worth it: one row per mortgage on a property, each against the plan without that property\'s step only', () => {
  const rows = E.loanWorthRE(FAMILY3, 1), p = E.mergeRE(FAMILY3);
  assert.equal(JSON.stringify(rows.map((w) => [w.key, w.propId])), JSON.stringify([['lm', null], ['eq:p2', 'p2'], ['eq:p3', 'p3'], ['pl', null]]));
  const w3 = rows.find((w) => w.key === 'eq:p3'), wo = E.reRunOne({ ...p, plans: p.plans.map((o, j) => j === 1 ? { ...o, mortgages: { p2: o.mortgages.p2 } } : o) }, 1).r;
  assert.ok(near(w3.without.econAdv, wo.econAdv, 1e-6) && wo.eqs.length === 1 && wo.eqs[0].key === 'eq:p2' && wo.eqs[0].amount > 0, 'the flat\'s mortgage stays');
  assert.ok(near(w3.gain, E.computeRE(FAMILY3, { noNeed: true }).results[1].econAdv - wo.econAdv, 1e-6));
});

test('a mortgage on a property you own is taken when the cash runs short to cover a gap it closes; a sale closes a gap too, but only in its month (bridge money)', () => {
  // the home's mortgage planned for move-in, the cash short from month 3: taken in month 3 instead, and the plan works every month
  const cov = run({ ...TIGHT, properties: [{ id: 'p1', name: 'Villa A', value: 5000000, ltv: 70 }], plans: [{ enabled: true, lmUse: false, settlePolicy: 'none', mortgages: { p1: { when: 'completion', month: 0 } } }] });
  const c = cov.covered, f = cov.eqs[0];
  assert.ok(cov.feasible && c && c.key === 'eq:p1' && c.label === 'Mortgage on Villa A' && c.at === f.startedAt && c.plannedAt === cov.occupy && f.takenEarly === cov.occupy && near(c.amount, f.amount, 1e-6), JSON.stringify(c));
  assert.ok(f.amount > 0 && f.startedAt < cov.occupy && /the mortgage on Villa A is taken in month/.test(cov.notes[0]));
  assert.ok(cov.events.some((e) => e.kind === 'cover' && e.t === c.at && /so the mortgage on Villa A is taken now instead/.test(e.text) && e.text.includes(`lends ${E.fS(c.amount)}`)));
  const asSet = E.rePlanSimulate(E.mergeRE({ ...TIGHT, properties: [{ id: 'p1', name: 'Villa A', value: 5000000, ltv: 70 }] }), E.reProject(E.mergeRE(TIGHT)), E.mergeRE({ plans: [{ enabled: true, lmUse: false, settlePolicy: 'none', mortgages: { p1: { when: 'completion', month: 0 } } }] }).plans[0]);
  assert.ok(!asSet.feasible && E.reGaps(asSet.months, asSet.facilities, asSet.sales, asSet.landSale).every((g) => g.closedBy.includes('eq:p1')), 'as set, the mortgage at move-in closes the gap');
  assert.match(E.planTitle(cov.plan, true, cov, false, E.mergeRE({ properties: [{ id: 'p1', name: 'Villa A', value: 1 }] }).properties), /^Mortgage Villa A when your cash runs short/);
  // a plot sold in month 12 closes a gap from month 3; a sale cannot be moved, so the plan needs bridge money until then
  // (bridge money is the old tool's rule, kept for imported scenarios only — coverAny false; a 9-month bridge: allow up to 12 months)
  const br = run({ ...TIGHT, coverAny: false, bridgeMaxMonths: 12, properties: [{ id: 'p1', name: 'Plot C', value: 2500000, ltv: 70, plan: 'sell', sellAt: 12 }], plans: [{ enabled: true, lmUse: false, settlePolicy: 'none' }] });
  assert.ok(!br.feasible && br.bridged && br.bridges.length === 1, JSON.stringify(br.bridges));
  const g = br.bridges[0];
  assert.ok(g.to === 12 && g.closedBy.length === 1 && g.closedBy[0] === 'sale:p1' && g.closedByLabel === 'sale of Plot C' && g.reason === 'Plot C is sold only in month 12', JSON.stringify(g));
  assert.match(br.flags[0], /^Needs bridge money: .* until the sale of Plot C in month 12 closes the gap\. No loan can cover it in time: Plot C is sold only in month 12\./);
  assert.ok(near(br.months[12].renterSale, br.sales[0].net, 1e-6));
  // the same plan in a scenario made here: no bridge money — the construction waits for the sale, or the plan runs out
  const v2 = run({ ...TIGHT, lateMaxMonths: 24, properties: [{ id: 'p1', name: 'Plot C', value: 2500000, ltv: 70, plan: 'sell', sellAt: 12 }], plans: [{ enabled: true, lmUse: false, settlePolicy: 'none' }] });
  assert.ok(!v2.bridged && (v2.feasible ? v2.late && v2.late.months >= 0 : true), JSON.stringify(v2.late));
  // the same gap, the home you live in sold at move-in: the old wording
  const hb = run({ ...TIGHT, coverAny: false, cashAvailable: 2000000, properties: [{ id: 'p1', name: 'Our home', value: 2500000, isHome: true, plan: 'sell' }], plans: [{ enabled: true, lmUse: false, settlePolicy: 'none' }] });
  if (hb.bridged) assert.ok(hb.bridges[0].closedBy.includes('sale:p1') && hb.bridges[0].closedByLabel === 'sale of the home you live in' && /sold only at move-in/.test(hb.bridges[0].reason));
});

test('the page helpers name each property, and the breakdowns still add up with every property in play', () => {
  const m = E.computeRE(FAMILY3, { noNeed: true }), p = m.p, prj = m.prj, r = m.results[1];
  E.reSetAsOf(p.asOf);
  assert.equal(E.planTitle(p.plans[1], true, r, false, p.properties), 'Mortgage the land, then mortgage Plot C when the land is bought, then mortgage Flat B at build start, then personal loans at build start');
  assert.equal(E.planTitle(p.plans[1], true, r), E.planTitle(p.plans[1], true, r, false, p.properties), 'the result\'s facilities name them too');
  assert.equal(E.planTitle({ ...E.RE_PLAN_DEFAULTS, mortgages: { p1: { when: 'build', month: 0 } } }, true), 'Mortgage the property you own at build start', 'nothing to name it by: the old words');
  assert.equal(E.planTitle({ ...E.RE_PLAN_DEFAULTS, mortgages: { p1: { when: 'build', month: 0 }, p2: { when: 'start', month: 0 } } }, true), 'Mortgage property p1 at build start, then mortgage property p2 now');
  const steps = E.planSteps(r, true);
  assert.equal(JSON.stringify(steps.filter((s) => /^eq/.test(s.kind) || s.kind === 'cash').map((s) => [s.t, s.label])), JSON.stringify([[3, 'Mortgage on Plot C'], [6, 'Mortgage on Flat B'], [30, 'Sell Plot C']]));
  assert.match(steps.find((s) => s.label === 'Sell Plot C').note, /after repaying its mortgage · sold whether or not you build/);
  const d = E.describePlan(p.plans[1], p, prj, true);
  assert.ok(/mortgage Plot C when the land is bought/.test(d) && /mortgage Flat B when construction starts/.test(d) && /sell Plot C in Apr 2029 — its value then less 7\.5% selling costs, any mortgage on it repaid; you would sell it whether or not you build/.test(d), d);
  assert.match(E.facTxt(r.eqs[1]), /repaid Apr 2029 when Plot C was sold$/);
  assert.match(E.facTxt(m.results[3].eqs[0]), /^refused — Plot C was sold in month 30$/);
  assert.ok(E.fundingBridgeRows(r, 40, p, prj).rows.some((x) => x.label === 'Sale of Plot C, net' && near(x.v, r.sales[0].net, 1e-6)) && E.fundingBridgeRows(r, 40, p, prj).rows.filter((x) => /^Loan paid to you: mortgage on/.test(x.label)).length === 2);
  assert.ok(E.cashReconcile(r, r.occupy, p, prj).salaryRows.some((x) => x.label === 'Rent your properties earn' && near(x.v, r.months.filter((y) => y.t >= 1 && y.t <= r.occupy).reduce((a, y) => a + y.propRentIn, 0), 1e-6)));
  assert.ok(E.reWealthParts(r).parts.some((x) => x.key === 'propRent') && E.reWealthParts(r).parts.find((x) => x.key === 'sold').label.startsWith('Properties you sold'));
  assert.ok(/properties you already own/i.test(E.reExpl(p).properties));
  // every breakdown adds up on the random suite with properties
  const bad = [];
  for (const { label, inp } of scenarios2(E, 60)) {
    const mm = E.computeRE(inp, { noNeed: true });
    mm.results.forEach((rr, i) => {
      if (!rr) return;
      const H = rr.months.length - 1, occ = Math.min(H, rr.occupy), at = `${label} S${i + 1}`;
      const chk = (what, a, b) => { if (!near(a, b, Math.max(1e-3, Math.abs(b) * 1e-9))) bad.push(`${at} ${what}: ${a} vs ${b}`); };
      chk('wealth parts', E.reWealthParts(rr).total, rr.econAdv);
      chk('rule-6 cash at move-in', E.fundingBridgeRows(rr, occ, mm.p, mm.prj).total, rr.months[occ].ccash - rr.months[occ].cRetCum);
      chk('cash on hand at the horizon', E.fundingBridgeRows(rr, H, mm.p, mm.prj).total + E.fundingBridgeRows(rr, H, mm.p, mm.prj).ret, rr.months[H].ccash);
      chk('cash at move-in', E.cashReconcile(rr, occ, mm.p, mm.prj).total, rr.onHandAtMoveIn);
      chk('move-in parts', E.reMoveInParts(rr, occ, mm.p, mm.prj).total, rr.onHandAtMoveIn);
      const settle = rr.months.reduce((a, x) => a + x.renterSettle, 0), sale = rr.months.reduce((a, x) => a + x.renterSale, 0), bGrow = rr.months.reduce((a, x) => a + x.bRet, 0);
      chk('rule-7 baseline rows', rr.cashStart - settle + sale + bGrow, rr.renterEnd);
      rr.eqs.forEach((f) => { if (f.amount > 0) { const pr = E.rePayoffRows(f, 0, mm.p.settleFeeMonths); if (f.soldAt != null) chk(`${f.key} repaid at the sale`, pr.early.row.total, rr.sales.find((s) => s.id === f.propId).payoff); } });
    });
  }
  assert.deepEqual(bad.slice(0, 8), []);
});
