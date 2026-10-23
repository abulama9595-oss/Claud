// Bank limits in every month, every strategy: the 65% bucket, the mortgage cap, 33% per personal loan,
// never more than two personal loans running, and every new loan at the bank's maximum.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios, jointScenarios } = require('./helpers.js');
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

test('تضامن: each of you stays within your own limit when a loan is taken; personal loans fit only your room', () => {
  const bad = {};
  const flag = (k, msg) => { if (!bad[k]) bad[k] = msg; };
  let nJoint = 0;
  for (const sc of jointScenarios(E, 60)) {
    const m = E.computeRE(sc.inp, { noNeed: true }), p = m.p, mortPct = p.mortgageCap == null ? p.dbrCap : p.mortgageCap;
    m.results.forEach((r, i) => {
      if (!r) return;
      const label = `${sc.label} S${i + 1}`, H = r.months.length - 1;
      const facs = r.facilities.filter((f) => f.startedAt != null && f.amount > 0);
      const at = (t, k) => (t >= 1 ? r.months[t][k] : r.months[1] ? r.months[1][k] : 0);   // salaries are booked from month 1
      const share = (f) => (f.key === 'lm' || f.key === 'co') ? f.shareA : 1;
      for (const f of facs) {
        if (f.capacity && Math.abs(f.amount - f.capacity.cap) > 1) flag('bank maximum', `${label} ${f.key}: took ${f.amount}, bank max ${f.capacity.cap}`);
        if (f.key === 'lm' || f.key === 'co') {
          nJoint++;
          const c = f.capacity;
          if (!(f.shareA >= 0 && f.shareA <= 1) || Math.abs(f.shareA - (c.room > 0 ? c.roomA / c.room : 1)) > 1e-9) flag('split in proportion to the rooms', `${label} ${f.key}: ${f.shareA} vs ${c.roomA}/${c.room}`);
          if (f.pmt * f.shareA > c.roomA + 1e-6 || f.pmt * (1 - f.shareA) > c.roomB + 1e-6) flag('each share within its room', `${label} ${f.key}`);
        }
        if (f.key === 'pl' || f.key === 'pl2') for (const a of (f.split || [f.amount])) if (E.rePmt(a, f.rate, f.n) > at(f.startedAt, 'incA') * p.perLoanCap / 100 + TOL) flag('personal loan on your income only', `${label} ${f.key} M${f.startedAt}`);
      }
      // the month after a loan is taken: what each of you pays fits the limit the bank tested you against
      for (const t0 of new Set(facs.map((f) => f.startedAt))) {
        const t = t0 + 1; if (t > H) continue;
        const mo = r.months[t], incA = at(t0, 'incA'), incB = at(t0, 'incB'), capA = r.months[t0].capA, capB = r.months[t0].capB;
        if (mo.payA > incA * capA / 100 + 1e-6) flag('your limit', `${label} M${t}: ${mo.payA} > ${incA * capA / 100}`);
        const jointWithB = facs.some((f) => (f.key === 'lm' || f.key === 'co') && f.startedAt === t0 && f.shareA < 1 - 1e-9);
        if (jointWithB && mo.payB > incB * capB / 100 + 1e-6) flag("your spouse's limit", `${label} M${t}: ${mo.payB} > ${incB * capB / 100}`);
        const mortA = facs.filter((f) => ['lm', 'eq', 'co'].includes(f.key) && f.startedAt < t && (f.settledAt == null || f.settledAt > t)).reduce((a, f) => a + (mo[f.key + 'Pay'] - (f.key === 'lm' ? mo.extraPay : 0)) * share(f), 0);
        if (mortA > incA * mortPct / 100 + 1e-6) flag('your mortgage limit', `${label} M${t}: ${mortA} > ${incA * mortPct / 100}`);
      }
    });
  }
  assert.ok(nJoint > 20, `only ${nJoint} joint mortgages checked`);
  assert.deepEqual(bad, {});
});
