// Identities to the riyal, every month of every strategy: no money is created or lost.
//   household cash · rule-7 cash (ccash) · baseline · rule-7 ledgers · net worth · debt · each facility's instalments
//   — with the properties you own (v2): the rent they earn on both sides, a mortgage on each (eq:<id>), their sales (at
//   move-in on the strategy side; in a month you set on both sides, the loan secured on one repaid then on both sides)
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, scenarios2, jointScenarios, FAMILY3 } = require('./helpers.js');
const E = loadEngine();
const TOL = 1e-3;

// a property sold in a month you set is sold on both sides (never the home you live in, never one sold at move-in)
const datedSales = (p) => p.properties.filter((P) => !P.isHome && P.plan === 'sell' && P.sellAt !== 'moveIn' && P.value > 0).map((P) => ({ P, t: Math.max(1, P.sellAt) }));

// existing loans on their own schedule (what the not-building side pays), instalment floored at the clearing annuity;
// the not-building side also makes the planned settlements (balance + next 3 months' profit on the declining balance) — and
// repays a loan secured on a property in the month that property is sold on both sides
function renterSchedule(p, H) {
  const inst = new Array(H + 1).fill(0), debt = new Array(H + 1).fill(0), settle = new Array(H + 1).fill(0), sale = new Array(H + 1).fill(0);
  const dated = datedSales(p);
  for (const l of p.existingLoans.concat(p.joint && p.joint.on ? p.joint.loans : []).filter((l) => l.balance > 0 && l.installment > 0)) {   // تضامن: your spouse's loans too
    const left0 = Math.max(1, Math.round(l.monthsLeft)), pay0 = Math.max(l.installment, E.rePmt(l.balance, l.rate, left0));
    const own = l.settleAt != null && l.settleAt > 0 ? Math.round(l.settleAt) : null, bySale = dated.filter((d) => E.reSecuredOn(l, d.P)).map((d) => d.t);
    const s = bySale.length ? Math.min(own == null ? Infinity : own, ...bySale) : own;
    let bal = l.balance;
    for (let t = 0; t <= H; t++) {
      if (t >= 1 && bal > 0.5) {
        if (t === s) {
          const left = Math.max(0, left0 - (t - 1)); let b = bal, fee = 0;
          for (let k = 0; k < Math.min(Math.max(0, p.settleFeeMonths), left) && b > 0.5; k++) { const i = b * l.rate / 1200; fee += i; b -= Math.min(b + i, pay0) - i; }
          settle[t] += bal + fee; bal = 0;
        } else { const i = bal * l.rate / 1200; const pm = Math.min(bal + i, pay0); bal -= pm - i; inst[t] += pm; }
      }
      debt[t] += Math.max(0, bal);
    }
  }
  dated.forEach((d) => { if (d.t <= H) sale[d.t] += d.P.value * Math.pow(1 + p.appreciation / 100, d.t / 12) * (1 - (d.P.sellCostPct || 0) / 100); });
  return { inst, debt, settle, sale };
}

// each new facility's instalments rebuilt from its amount, rate and instalment (every mortgage on a property you own → eq)
function facilityPays(r, H) {
  const pays = { lm: [], eq: [], pl: [], co: [] };
  for (const k of Object.keys(pays)) pays[k] = new Array(H + 1).fill(0);
  for (const f of r.facilities) {
    if (f.startedAt == null || !(f.amount > 0)) continue;
    const key = f.key === 'pl2' || f.key === 'spl' || f.key === 'spl2' ? 'pl' : /^eq(:|$)/.test(f.key) ? 'eq' : f.key, rr = f.rate / 1200;   // every personal loan, yours and your spouse's
    if (!pays[key]) throw new Error(`unknown facility key ${f.key}`);
    let bal = f.amount;
    for (let t = f.startedAt + 1; t <= H; t++) {
      if (f.settledAt != null && t >= f.settledAt) break;
      if (bal <= 0.5) break;
      const i = bal * rr, pm = Math.min(f.pmt + (f.key === 'lm' ? Math.max(0, r.plan.extraMo || 0) : 0), bal + i);
      bal -= pm - i; pays[key][t] += pm;
    }
  }
  return pays;
}

// the rent your properties earn today, as the engine books it: from month 1, growing with rent growth under the rent freeze
// (the same clock as the rent you pay), until the property is sold — on this side; the not-building side keeps one sold at move-in
function propRent(p, r, t, side) {
  if (t < 1) return 0;
  const F = E.reMonthIndex(p, p.rentFreezeUntil), b = F != null && F > 1 ? F : 1, yrs = t < b ? 0 : Math.floor((t - b) / 12);
  return p.properties.reduce((a, P) => {
    if (!(P.rentNow > 0)) return a;
    const s = (r.sales || []).find((x) => x.id === P.id);
    const sold = s && t > s.t && (side === 'strategy' || s.side === 'both');
    return a + (sold ? 0 : P.rentNow * Math.pow(1 + p.rentGrowth / 100, yrs));
  }, 0);
}

function audit(label, m, r, bad) {
  const p = m.p, prj = m.prj, H = r.months.length - 1, occ = prj.occupy, alt = Math.pow((1 + p.altReturn / 100) * (1 - (p.cashZakatPct || 0) / 100), 1 / 12) - 1;
  const ren = renterSchedule(p, H), fp = facilityPays(r, H), sales = r.sales || [];
  const near = (a, b) => Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b) / 1e6);
  const flag = (k, msg) => { if (!bad[k]) bad[k] = `${label} ${msg}`; };
  const grow = (x) => (x > 0 ? x * (1 + alt) : x);
  let cash, cc, bc, rc, prGap = 0, newC = 0, oldC = 0, rsC = 0, riC = 0, upC = 0, cRetCum = 0, retC = 0;
  for (let t = 0; t <= H; t++) {
    const mo = r.months[t];
    const proceeds = r.facilities.filter((f) => f.startedAt === t && f.amount > 0).reduce((a, f) => a + f.amount - f.fees - (f.refi ? f.refi.payoff : 0), 0);
    const payoffs = r.payoffs.concat(r.prepaid || []).filter((x) => x.t === t).reduce((a, x) => a + x.cost, 0);   // old-loan payoffs and early mortgage payoffs
    const saleNet = sales.filter((s) => s.t === t).reduce((a, s) => a + s.net, 0) + (r.landSale && r.landSale.t === t ? r.landSale.net : 0);   // a sale lands net of the loans it repays
    const flows = proceeds - payoffs - mo.spend + saleNet;
    for (const k of ['lm', 'eq', 'pl', 'co']) if (!near(mo[k + 'Pay'], fp[k][t])) flag('instalments:' + k, `M${t}: engine ${mo[k + 'Pay']} vs rebuilt ${fp[k][t]}`);
    const newPay = mo.lmPay + mo.eqPay + mo.plPay + mo.coPay;
    // the rent your properties earn, on both sides
    const pr = propRent(p, r, t, 'strategy'), prB = propRent(p, r, t, 'base');
    if (!near(mo.propRentIn || 0, pr) || !near(mo.propRentBase || 0, prB)) flag('rent your properties earn', `M${t}: engine ${mo.propRentIn} / ${mo.propRentBase} vs rebuilt ${pr} / ${prB}`);
    if (!near(mo.renterSale || 0, ren.sale[t])) flag('sale on the not-building side', `M${t}: engine ${mo.renterSale} vs rebuilt ${ren.sale[t]}`);
    if (t === 0) { cash = p.cashAvailable + flows; cc = p.cashAvailable + flows; bc = p.cashAvailable + ren.sale[0]; rc = p.cashAvailable + ren.sale[0]; }
    else {
      // a plan that needs bridge money pays the bridge rate on a short balance, in both cash ledgers
      // …on the cash you can spend (no growth): the household cash less every return earned so far
      const spendable = cash - retC, bi = r.bridged && spendable < -0.5 ? -spendable * r.bridgeRate / 1200 : 0;
      if (!near(mo.bridgeInt || 0, bi)) flag('bridge money', `M${t}: engine ${mo.bridgeInt} vs rebuilt ${bi}`);
      retC += cash > 0 ? cash * alt : 0;
      cash = grow(cash) - bi + mo.inc - mo.liv - mo.rentPaid + mo.rentIn + pr + flows - mo.existInst - newPay - mo.ownerCost - (mo.holding || 0);
      const cRet = cc > 0 ? cc * alt : 0;                         // both sides grow from today, only while positive
      cc = cc + cRet + flows - bi - (mo.holding || 0); cRetCum += cRet;
      bc += bc > 0 ? bc * alt : 0; bc += ren.sale[t] - ren.settle[t];   // the not-building side makes the planned settlements too, and sells what you sell on a date
      rc = grow(rc) + mo.inc - mo.liv - mo.rentEq + prB + ren.sale[t] - ren.inst[t] - ren.settle[t];
    }
    if (!near(mo.cash, cash)) flag('household cash', `M${t}: engine ${mo.cash} vs rebuilt ${cash}`);
    // the cash you can spend = household cash less every return earned so far (no growth counted)
    if (!near(mo.avail, cash - retC)) flag('cash you can spend', `M${t}: engine ${mo.avail} vs rebuilt ${cash - retC}`);
    if (!near(mo.ccash, cc)) flag('rule-7 cash', `M${t}: engine ${mo.ccash} vs rebuilt ${cc}`);
    if (!near(mo.bcash, bc)) flag('baseline cash', `M${t}: engine ${mo.bcash} vs rebuilt ${bc}`);
    if (!near(mo.rCash, rc)) flag('not-building household cash', `M${t}: engine ${mo.rCash} vs rebuilt ${rc}`);
    cash = mo.cash; cc = mo.ccash; bc = mo.bcash; rc = mo.rCash;   // re-anchor: report one slip once
    newC += newPay; upC += mo.ownerCost; riC += mo.rentIn; oldC += ren.inst[t] - mo.existInst; rsC += t >= 1 ? mo.rentEq - mo.rentPaid : 0;
    for (const [k, v] of [['newInstCum', newC], ['upkeepCum', upC], ['rentInCum', riC], ['oldSavedCum', oldC], ['rentSavedCum', rsC]]) if (!near(mo[k], v)) flag('ledger ' + k, `M${t}: engine ${mo[k]} vs ${v}`);
    if (!near(mo.cRetCum, cRetCum)) flag('growth total', `M${t}: engine ${mo.cRetCum} vs ${cRetCum}`);
    if (!near(mo.oldDebtGap, ren.debt[t] - mo.debtExisting)) flag('old-loan balance gap', `M${t}: engine ${mo.oldDebtGap} vs ${ren.debt[t] - mo.debtExisting}`);
    // what only this side sold is no longer yours while the other side still owns it
    const gone = sales.filter((s) => s.side === 'strategy' && s.t <= t).reduce((a, s) => { const P = p.properties.find((x) => x.id === s.id); return a + P.value * Math.pow(1 + p.appreciation / 100, t / 12); }, 0);
    if (!near(mo.ownGone, gone)) flag('property sold on this side only', `M${t}: engine ${mo.ownGone} vs ${gone}`);
    // (+ your properties' rent this side earns less what the other side earns — rule 7 counts it; imported scenarios keep the old rule)
    if (p.coverAny !== false) prGap += (mo.propRentIn || 0) - (mo.propRentBase || 0);
    const nw = mo.ccash - mo.newInstCum + mo.oldSavedCum + mo.rentSavedCum + mo.rentInCum + prGap - mo.upkeepCum + mo.value - mo.debtNew + (ren.debt[t] - mo.debtExisting) - mo.ownGone;
    if (!near(mo.netWorth, nw)) flag('net worth', `M${t}: engine ${mo.netWorth} vs ${nw}`);
    if (!near(mo.renterNW, mo.bcash) || !near(mo.advantage, mo.netWorth - mo.renterNW)) flag('baseline / advantage', `M${t}`);
    if (!near(mo.debt, mo.debtNew + mo.debtExisting)) flag('debt = new + existing', `M${t}`);
    // every mortgage on a property you own: its balance in debtEq; a sold property's is 0
    const eqBal = (r.eqs || []).reduce((a, f) => { const s = f.startedAt; if (s == null || !(f.amount > 0) || t < s || (f.settledAt != null && t >= f.settledAt) || (f.prepaidAt != null && t >= f.prepaidAt)) return a; let b = f.amount, rr = f.rate / 1200; for (let k = s + 1; k <= t; k++) { const i = b * rr; b -= Math.min(f.pmt, b + i) - i; } return a + Math.max(0, b); }, 0);
    if (!near(mo.debtEq, eqBal)) flag('mortgages on your properties', `M${t}: engine ${mo.debtEq} vs rebuilt ${eqBal}`);
    // "everything grows": household cash + home value − all debt − what only this side sold, against the not-building cash − old-loan debt it still owes
    if (!near(mo.econNW, mo.cash + mo.value - mo.debt - mo.ownGone) || !near(mo.econBase, mo.rCash - ren.debt[t]) || !near(mo.econAdv, mo.econNW - mo.econBase)) flag('everything grows', `M${t}: ${mo.econNW} / ${mo.econBase} / ${mo.econAdv}`);
  }
  // a sale: the property's value then less its selling costs, less the plan's mortgage on it and the loan secured on it (each with its fee)
  sales.forEach((s) => {
    const P = p.properties.find((x) => x.id === s.id), v = P.value * Math.pow(1 + p.appreciation / 100, s.t / 12);
    if (!near(s.value, v) || !near(s.costs, v * (P.sellCostPct || 0) / 100) || !near(s.net, s.value - s.costs - s.payoff - s.oldPayoff)) flag('sale', `${s.name} M${s.t}: ${JSON.stringify(s)}`);
    const f = (r.eqs || []).find((x) => x.propId === s.id);
    if (f && f.amount > 0 && f.startedAt < s.t && (f.settledAt == null || f.settledAt !== s.t) && s.payoff <= 0) flag('sale repays the mortgage on it', `${s.name} M${s.t}`);
    // …a loan secured on it that still had a balance then is repaid by the sale (one that ran out before, or was settled earlier, is not)
    p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0 && E.reSecuredOn(l, P)).forEach((l) => {
      const pay0 = Math.max(l.installment, E.rePmt(l.balance, l.rate, Math.max(1, Math.round(l.monthsLeft)))); let b = l.balance;
      for (let k = 1; k < s.t && b > 0.5; k++) { const i = b * l.rate / 1200; b -= Math.min(b + i, pay0) - i; }
      const e = r.loansEnd.find((x) => String(x.id) === String(l.id));
      if (b > 0.5 && (e.settledAt == null || e.settledAt > s.t)) flag('sale repays the loan secured on it', `${s.name} M${s.t}: ${l.name} settled ${e.settledAt}`);
    });
    if (s.side === 'both' && !(ren.sale[s.t] > 0)) flag('dated sale on both sides', `${s.name} M${s.t}`);
    if (s.side === 'strategy' && ren.sale[s.t] > 0 && !datedSales(p).some((d) => d.t === s.t)) flag('move-in sale on this side only', `${s.name} M${s.t}`);
  });
  if (r.ownSale && !(sales.find((s) => s.isHome) === r.ownSale)) flag('ownSale is the home\'s sale', label);
}

test('identities hold to the riyal in every month of every strategy', () => {
  const bad = {};
  let n = 0;
  for (const sc of scenarios(E)) {
    const m = E.computeRE(sc.inp);
    m.results.forEach((r, i) => { if (r) { audit(`${sc.label} S${i + 1}`, m, r, bad); n++; } });
  }
  assert.ok(n > 300, `only ${n} strategy results checked`);
  assert.deepEqual(bad, {});
});

test('identities hold with تضامن: your spouse\'s salary and loans run through the household on both sides', () => {
  const bad = {};
  let n = 0;
  for (const sc of jointScenarios(E, 40)) {
    const m = E.computeRE(sc.inp, { noNeed: true });
    m.results.forEach((r, i) => { if (r) { audit(`${sc.label} S${i + 1}`, m, r, bad); n++; } });
    // the household's salary is both of yours, every month
    const r0 = m.results.find(Boolean);
    if (r0) r0.months.forEach((mo) => { if (mo.t >= 1 && Math.abs(mo.inc - mo.incA - mo.incB) > 1e-6) bad.salary = bad.salary || `${sc.label} M${mo.t}`; });
  }
  assert.ok(n > 100, `only ${n} strategy results checked`);
  assert.deepEqual(bad, {});
});

test('identities hold with the properties you own: rent on both sides, a mortgage on each, sales at move-in or in a month you set', () => {
  const bad = {}, n = { results: 0, eqs: 0, sales: 0, both: 0, rent: 0 };
  for (const sc of scenarios2(E, 70).concat([{ label: 'family3', inp: FAMILY3 }])) {
    const m = E.computeRE(sc.inp, { noNeed: true });
    m.results.forEach((r, i) => {
      if (!r) return;
      audit(`${sc.label} S${i + 1}`, m, r, bad); n.results++;
      n.eqs += r.eqs.filter((f) => f.amount > 0).length; n.sales += (r.sales || []).length; n.both += (r.sales || []).filter((s) => s.side === 'both').length;
      if (r.propRentTotal > 0) n.rent++;
    });
  }
  assert.ok(n.results > 200 && n.eqs > 30 && n.sales > 20 && n.both > 5 && n.rent > 20, JSON.stringify(n));
  assert.deepEqual(bad, {});
});
