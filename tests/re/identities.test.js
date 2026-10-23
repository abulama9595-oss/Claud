// Identities to the riyal, every month of every strategy: no money is created or lost.
//   household cash · rule-7 cash (ccash) · baseline · rule-7 ledgers · net worth · debt · each facility's instalments
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, jointScenarios } = require('./helpers.js');
const E = loadEngine();
const TOL = 1e-3;

// existing loans on their own schedule (what the not-building side pays), instalment floored at the clearing annuity;
// the not-building side also makes the planned settlements (balance + next 3 months' profit on the declining balance)
function renterSchedule(p, H) {
  const inst = new Array(H + 1).fill(0), debt = new Array(H + 1).fill(0), settle = new Array(H + 1).fill(0);
  for (const l of p.existingLoans.concat(p.joint && p.joint.on ? p.joint.loans : []).filter((l) => l.balance > 0 && l.installment > 0)) {   // تضامن: your spouse's loans too
    const left0 = Math.max(1, Math.round(l.monthsLeft)), pay0 = Math.max(l.installment, E.rePmt(l.balance, l.rate, left0));
    const s = l.settleAt != null && l.settleAt > 0 ? Math.round(l.settleAt) : null;
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
  return { inst, debt, settle };
}

// each new facility's instalments rebuilt from its amount, rate and instalment
function facilityPays(r, H) {
  const pays = { lm: [], eq: [], pl: [], co: [], rf: [] };
  for (const k of Object.keys(pays)) pays[k] = new Array(H + 1).fill(0);
  for (const f of r.facilities) {
    if (f.startedAt == null || !(f.amount > 0)) continue;
    const key = f.key === 'pl2' || f.key === 'spl' || f.key === 'spl2' ? 'pl' : f.key, rr = f.rate / 1200;   // every personal loan, yours and your spouse's
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

function audit(label, m, r, bad) {
  const p = m.p, prj = m.prj, H = r.months.length - 1, occ = prj.occupy, alt = Math.pow(1 + p.altReturn / 100, 1 / 12) - 1;
  const ren = renterSchedule(p, H), fp = facilityPays(r, H);
  const near = (a, b) => Math.abs(a - b) <= TOL * Math.max(1, Math.abs(b) / 1e6);
  const flag = (k, msg) => { if (!bad[k]) bad[k] = `${label} ${msg}`; };
  const grow = (x) => (x > 0 ? x * (1 + alt) : x);
  let cash, cc, bc, rc, newC = 0, oldC = 0, rsC = 0, riC = 0, upC = 0, cRetCum = 0, retC = 0;
  for (let t = 0; t <= H; t++) {
    const mo = r.months[t];
    const proceeds = r.facilities.filter((f) => f.startedAt === t && f.amount > 0).reduce((a, f) => a + f.amount - f.fees - (f.refi ? f.refi.payoff : 0), 0);
    const payoffs = r.payoffs.concat(r.prepaid || []).filter((x) => x.t === t).reduce((a, x) => a + x.cost, 0);   // old-loan payoffs and early mortgage payoffs
    const flows = proceeds - payoffs - mo.spend;
    for (const k of ['lm', 'eq', 'pl', 'co', 'rf']) if (!near(mo[k + 'Pay'], fp[k][t])) flag('instalments:' + k, `M${t}: engine ${mo[k + 'Pay']} vs rebuilt ${fp[k][t]}`);
    const newPay = mo.lmPay + mo.eqPay + mo.plPay + mo.coPay + mo.rfPay;
    if (t === 0) { cash = p.cashAvailable + flows; cc = p.cashAvailable + flows; bc = p.cashAvailable; rc = p.cashAvailable; }
    else {
      // a plan that needs bridge money pays the bridge rate on a short balance, in both cash ledgers
      // …on the cash you can spend (no growth): the household cash less every return earned so far
      const spendable = cash - retC, bi = r.bridged && spendable < -0.5 ? -spendable * r.bridgeRate / 1200 : 0;
      if (!near(mo.bridgeInt || 0, bi)) flag('bridge money', `M${t}: engine ${mo.bridgeInt} vs rebuilt ${bi}`);
      retC += cash > 0 ? cash * alt : 0;
      cash = grow(cash) - bi + mo.inc - mo.liv - mo.rentPaid + mo.rentIn + flows - mo.existInst - newPay - mo.ownerCost;
      const cRet = cc > 0 ? cc * alt : 0;                         // both sides grow from today, only while positive
      cc = cc + cRet + flows - bi; cRetCum += cRet;
      bc += bc > 0 ? bc * alt : 0; bc -= ren.settle[t];            // the not-building side makes the planned settlements too
      rc = grow(rc) + mo.inc - mo.liv - mo.rentEq - ren.inst[t] - ren.settle[t];
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
    const nw = mo.ccash - mo.newInstCum + mo.oldSavedCum + mo.rentSavedCum + mo.rentInCum - mo.upkeepCum + mo.value - mo.debtNew + (ren.debt[t] - mo.debtExisting);
    if (!near(mo.netWorth, nw)) flag('net worth', `M${t}: engine ${mo.netWorth} vs ${nw}`);
    if (!near(mo.renterNW, mo.bcash) || !near(mo.advantage, mo.netWorth - mo.renterNW)) flag('baseline / advantage', `M${t}`);
    if (!near(mo.debt, mo.debtNew + mo.debtExisting)) flag('debt = new + existing', `M${t}`);
    // "everything grows": household cash + home value − all debt, against the not-building cash − old-loan debt it still owes
    if (!near(mo.econNW, mo.cash + mo.value - mo.debt) || !near(mo.econBase, mo.rCash - ren.debt[t]) || !near(mo.econAdv, mo.econNW - mo.econBase)) flag('everything grows', `M${t}: ${mo.econNW} / ${mo.econBase} / ${mo.econAdv}`);
  }
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
