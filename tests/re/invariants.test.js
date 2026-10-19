// Bank limits in every month, every strategy: the 65% bucket, the mortgage cap, 33% per personal loan,
// never more than two personal loans running, and every new loan at the bank's maximum.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios } = require('./helpers.js');
const E = loadEngine();
const TOL = 1e-6;

test('bank limits hold and every loan is taken at the bank maximum', () => {
  const bad = {};
  const flag = (k, msg) => { if (!bad[k]) bad[k] = msg; };
  for (const sc of scenarios(E)) {
    const m = E.computeRE(sc.inp), p = m.p;
    m.results.forEach((r, i) => {
      if (!r) return;
      const label = `${sc.label} S${i + 1}`, H = r.months.length - 1;
      const facs = r.facilities.filter((f) => f.startedAt != null && f.amount > 0);
      const incAt = (t) => (t >= 1 ? r.months[t].inc : r.months[1] ? r.months[1].inc : p.income);   // salary is booked from month 1
      for (const f of facs) {
        if (f.capacity && Math.abs(f.amount - f.capacity.cap) > 1) flag('bank maximum', `${label} ${f.key}: took ${f.amount}, bank max ${f.capacity.cap}`);
        const parts = f.split ? f.split : [f.amount];
        if (f.key === 'pl' || f.key === 'pl2') for (const a of parts) if (E.rePmt(a, f.rate, f.n) > incAt(f.startedAt) * p.perLoanCap / 100 + TOL) flag('33% per personal loan', `${label} ${f.key} M${f.startedAt}: ${E.rePmt(a, f.rate, f.n)}`);
      }
      for (let t = 1; t <= H; t++) {
        const mo = r.months[t];
        const running = facs.filter((f) => f.startedAt < t && (f.settledAt == null || f.settledAt > t));
        if (!running.length) continue;
        // the bank tests scheduled instalments (a voluntary extra payment is not one)
        const inst = mo.existInst + mo.lmPay + mo.eqPay + mo.plPay + mo.coPay + mo.rfPay - mo.extraPay;
        if (inst > mo.inc * p.dbrCap / 100 + TOL) flag('65% bucket', `${label} M${t}: ${inst} > ${mo.inc * p.dbrCap / 100}`);
        const mort = mo.lmPay + mo.eqPay + mo.coPay - mo.extraPay;   // all mortgages together
        if (mort > mo.inc * p.mortgageCap / 100 + TOL) flag('mortgage cap (all mortgages together)', `${label} M${t}: ${mort} > ${mo.inc * p.mortgageCap / 100}`);
      }
    });
  }
  assert.deepEqual(bad, {});
});
