// The three lenses (reLenses) and the figures they read: peak debt, wealth at year X, cash and borrowing power at move-in;
// the borrowing room recorded at month end exactly as the bank test reads it next month (audit F8); the optimizer's lenses
// from its own summaries (F9). Synthetic scenarios only.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadEngine, scenarios2, FAMILY2, FAMILY3 } = require('./helpers.js');
const E = loadEngine();
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const within2 = (v, best) => Math.abs(v - best) <= 0.02 * Math.max(1, Math.abs(best));
const st = (r) => E.reStanding(r);
const SC = () => scenarios2(E, 117).concat([{ label: 'family3', inp: FAMILY3 }]);   // 120 new-shape scenarios + the three-property family

test('each lens pick satisfies its definition: least liability on every measure, richest at 5 / 10 / 15 years and the horizon, most cash and borrowing power at move-in and the end, the recommendation', () => {
  const n = { scen: 0, distinct: 0, bridged: 0, none: 0 };
  for (const { label, inp } of SC()) {
    const m = E.computeRE(inp, { noNeed: true }), res = m.results, live = res.filter(Boolean);
    const L = E.reLenses(res);
    const top = Math.max(...live.map(st)), cands = top >= 1 ? live.filter((r) => st(r) === top) : [];
    n.scen++;
    if (!cands.length) { assert.ok(!L.recommended && !L.leastLiability && !L.richest && !L.mostCash && !m.bestFeasible, `${label}: nothing works`); n.none++; continue; }
    if (top === 1) n.bridged++;
    // candidates = the plans of the best standing, in order
    assert.deepEqual(L.candidates, cands.map((r) => res.indexOf(r)), `${label}: candidates`);
    assert.equal(L.recommended.idx, res.indexOf(m.bestFeasible), `${label}: the recommendation is computeRE's`);
    // least liability: the lowest figure on the chosen measure, or within 2% of it (then the next measure decided)
    const measures = { peakDebt: (r) => r.peakDebt, borrowed: (r) => r.newDebtTotal, peakInst: (r) => r.peakInst, profit: (r) => r.profitPaid };
    for (const [k, get] of Object.entries(measures)) {
      const X = E.reLenses(res, { liabilityBy: k }).leastLiability, best = Math.min(...cands.map(get));
      assert.ok(cands.includes(res[X.idx]) && X.measure === k && near(X.value, get(res[X.idx])) && within2(X.value, best), `${label} ${k}: ${X.value} vs best ${best}`);
      if (!cands.some((r) => r !== res[X.idx] && within2(get(r), best))) assert.ok(near(X.value, best), `${label} ${k}: a clear winner is the winner`);
      assert.ok(typeof X.why === 'string' && X.why.includes(k === 'peakInst' ? E.fSAR(X.value) : E.fS(X.value)), `${label} ${k}: the sentence carries the figure (${X.why})`);
      if (k === 'peakDebt') assert.ok(X.why.includes(`in month ${res[X.idx].peakDebtT}`), `${label}: the month`);
    }
    assert.equal(E.reLenses(res).leastLiability.measure, 'peakDebt', 'peak debt is the default measure');
    // richest in X years: the furthest ahead of not building at month 12X (the horizon when X is past it)
    for (const y of [5, 10, 15, null]) {
      const X = E.reLenses(res, { years: y }).richest, at = (r) => E.reWealthAt(r, y).econAdv, best = Math.max(...cands.map(at));
      assert.ok(cands.includes(res[X.idx]) && near(X.value, at(res[X.idx])) && within2(X.value, best), `${label} richest ${y}: ${X.value} vs ${best}`);
      if (!cands.some((r) => r !== res[X.idx] && within2(at(r), best))) assert.ok(near(X.value, best), `${label} richest ${y}: a clear winner`);
      assert.ok(X.why.includes(E.fS(Math.abs(X.value))) && X.robust === null, `${label} richest ${y}: ${X.why}`);
    }
    // most cash and borrowing power: cash you can spend + what the bank would still lend, at move-in (default) or the end
    for (const at of ['moveIn', 'horizon']) {
      const X = E.reLenses(res, { atMonth: at }).mostCash, H = live[0].months.length - 1;
      const val = (r) => { const mo = r.months[at === 'horizon' ? H : Math.min(H, r.occupy)]; return mo.avail + mo.leverage.borrowable; }, best = Math.max(...cands.map(val));
      assert.ok(cands.includes(res[X.idx]) && near(X.value, val(res[X.idx])) && near(X.cash + X.borrowable, X.value) && within2(X.value, best), `${label} most cash ${at}: ${X.value} vs ${best}`);
      assert.ok(X.why.includes(E.fS(X.borrowable)) && X.at === at, `${label} most cash ${at}: ${X.why}`);
    }
    // when two lenses point to the same plan the result says so
    for (const [i, ks] of Object.entries(L.byPlan)) for (const k of ks) assert.equal(L[k].idx, +i, `${label}: byPlan`);
    if (new Set(['leastLiability', 'richest', 'mostCash'].map((k) => L[k].idx)).size > 1) n.distinct++;
  }
  assert.ok(n.scen >= 120 && n.distinct > 20 && n.none > 0, JSON.stringify(n));
});

test('robust: the richest plan is tagged when it also wins with no appreciation (one rerun of the candidates, only on request)', () => {
  let tagged = 0, not = 0;
  for (const { label, inp } of scenarios2(E, 12)) {
    const m = E.computeRE(inp, { noNeed: true }), L = E.reLenses(m.results, { robust: true, inp });
    if (!L.richest) continue;
    // the same candidates rerun with no appreciation: robust = this plan is (within 2%) the richest of those that still stand
    // best; not robust = another candidate is at least as rich there
    const m0 = E.computeRE({ ...inp, appreciation: 0 }, { noNeed: true }), cands0 = L.candidates.map((i) => m0.results[i]);
    const top0 = Math.max(...cands0.map(st)), c0 = cands0.filter((r) => st(r) === top0), me = m0.results[L.richest.idx];
    const best0 = Math.max(...c0.map((r) => r.econAdv));
    if (L.richest.robust) { assert.ok(c0.includes(me) && within2(me.econAdv, best0) && L.richest.robustIdx === L.richest.idx, `${label}: tagged robust`); tagged++; }
    else { assert.ok(!c0.includes(me) || c0.some((r) => r !== me && r.econAdv >= me.econAdv - 1e-6) || !within2(me.econAdv, best0), `${label}: not robust`); assert.ok(L.richest.robustIdx !== L.richest.idx, `${label}: another plan wins`); not++; }
    assert.ok(/appreciation/.test(L.richest.why), `${label}: the sentence says so`);
    assert.equal(E.reLenses(m.results).richest.robust, null, `${label}: not computed unless asked`);
  }
  assert.ok(tagged + not > 5, `${tagged} robust, ${not} not`);
});

test('the figures the lenses read: peakDebt = max of all debt with its month, peakNewDebt, peakInst with its month and % of income, profitPaid = newDebtInterest, cash and borrowing power at move-in and the end, wealth at year X', () => {
  let n = 0;
  for (const { label, inp } of scenarios2(E, 40)) {
    const m = E.computeRE(inp, { noNeed: true });
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`, ms = r.months, H = ms.length - 1;
      assert.equal(r.peakDebt, Math.max(...ms.map((x) => x.debt)), `${at}: peakDebt`);
      assert.equal(ms[r.peakDebtT].debt, r.peakDebt, `${at}: peakDebtT`);
      assert.equal(r.peakNewDebt, Math.max(...ms.map((x) => x.debtNew)), `${at}: peakNewDebt`);
      const inst = (x) => x.existInst + x.lmPay + x.eqPay + x.plPay + x.coPay - x.extraPay;
      assert.equal(inst(ms[r.peakInstT]), r.peakInst, `${at}: peakInstT`);
      assert.ok(near(r.peakInstPct, ms[r.peakInstT].dbr), `${at}: peakInstPct`);
      assert.equal(r.profitPaid, r.newDebtInterest, `${at}: profitPaid`);
      const occ = Math.min(H, r.occupy);
      assert.equal(r.availAtMoveIn, ms[occ].avail); assert.equal(r.leverageAtMoveIn, ms[occ].leverage); assert.equal(r.availEnd, ms[H].avail); assert.equal(r.leverageEnd, ms[H].leverage);
      for (const y of [0, 5, 10, 15, 100, null]) { const w = E.reWealthAt(r, y), t = y == null ? H : Math.min(H, y * 12); assert.ok(w.t === t && w.econAdv === ms[t].econAdv && w.econNW === ms[t].econNW, `${at}: wealth at ${y}`); }
      n++;
    });
  }
  assert.ok(n > 100);
});

// the borrowing room recorded at the end of month t is what the bank test reads at the start of month t + 1: a facility taken
// then — with nothing else happening that month (no payoff, sale or other loan before it, no income step) — finds exactly that
// room; a mortgage on a property you own cannot exceed the mortgage headroom recorded; a personal loan with no buy-out is the
// two-loan maximum recorded
test('month-end room = next month\'s bank test (F8): capacity.totalRoom is room.dbr; a mortgage on a property is within the mortgage headroom; a personal loan without a buy-out is the recorded personal maximum', () => {
  const n = { room: 0, eq: 0, pl: 0 };
  for (const { label, inp } of SC()) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p;
    if (p.joint && p.joint.on) continue;
    m.results.forEach((r, i) => {
      if (!r) return;
      const at = `${label} S${i + 1}`;
      for (const f of r.facilities.filter((f) => f.startedAt != null && f.amount > 0 && f.startedAt >= 1)) {
        const t1 = f.startedAt, t = t1 - 1, mo = r.months[t];
        if (r.facilities.some((g) => g !== f && g.startedAt === t1 && g.amount > 0)) continue;   // another loan the same month
        if (r.payoffs.some((x) => x.t === t1) || (r.sales || []).some((s) => s.t === t1) || (r.landSale && r.landSale.t === t1)) continue;
        if (t1 % 12 === 1 && t1 > 1 && (p.incomeGrowth || 0) !== 0) continue;   // an income step moves the limits
        if (f.capacity && f.capacity.totalRoom != null) { assert.ok(near(f.capacity.totalRoom, mo.room.dbr), `${at} ${f.key} M${t1}: totalRoom ${f.capacity.totalRoom} vs room.dbr ${mo.room.dbr}`); n.room++; }
        // (the LTV part is priced at month t's value; with market-value sizing the bank reads one more month of appreciation on
        // value × LTV at t + 1 — exactly that much is allowed)
        if (/^eq:/.test(f.key)) {
          const g = p.appreciation / 100, grow = p.propertyValueBasis === 'market' ? p.properties.filter((P) => P.canMortgage).reduce((a, P) => a + P.value * P.ltv / 100 * (Math.pow(1 + g, t1 / 12) - Math.pow(1 + g, t / 12)), 0) : 0;
          assert.ok(f.capacity.cap <= mo.leverage.mortgage + grow + 1, `${at} ${f.key} M${t1}: cap ${f.capacity.cap} > mortgage headroom ${mo.leverage.mortgage} (+ ${grow} of appreciation)`); n.eq++;
        }
        if ((f.key === 'pl' || f.key === 'pl2') && !f.refi && !f.part && r.plan.plSplit !== false) { assert.ok(near(f.amount, mo.leverage.personal, 1e-6) || Math.abs(f.amount - mo.leverage.personal) <= 1, `${at} ${f.key} M${t1}: ${f.amount} vs personal ${mo.leverage.personal}`); n.pl++; }
      }
    });
  }
  assert.ok(n.room > 100 && n.eq > 20 && n.pl > 20, JSON.stringify(n));
});

test('borrowable is the greedy one-bucket sum: a mortgage on the LTV headroom and the mortgage room first, then personal loans on the room left — rebuilt from the recorded room', () => {
  let n = 0;
  for (const { label, inp } of scenarios2(E, 30).concat([{ label: 'family2', inp: FAMILY2 }, { label: 'family3', inp: FAMILY3 }])) {
    const m = E.computeRE(inp, { noNeed: true }), p = m.p;
    if (p.joint && p.joint.on) continue;
    const eqN = Math.max(1, Math.round(p.eqTenure * 12)), eqR = E.reEffRate(p, p.eqRate, eqN);
    m.results.forEach((r, i) => {
      const at = `${label} S${i + 1}`;
      if (!r) return;
      const twoPl = (room0, R) => { const nNew = Math.min(2, R.plSlots); if (nNew < 1) return 0; const room = Math.min(Math.max(0, room0), nNew * R.capInst), i1 = Math.min(room, R.capInst), i2 = nNew > 1 ? Math.max(0, room - i1) : 0; const one = (x) => x > 1 ? Math.min(E.rePrincipalFor(x, r.pl.rate, r.pl.n), p.plCap) : 0; return one(i1) + one(i2); };
      r.months.forEach((mo) => {
        const R = mo.room, L = mo.leverage;
        assert.ok(R.plSlots >= 0 && R.plSlots <= 2 && near(R.capInst, Math.min(mo.t >= 1 ? mo.inc * p.perLoanCap / 100 : r.months[1].inc * p.perLoanCap / 100, E.rePmt(p.plCap, r.pl.rate, r.pl.n))), `${at} M${mo.t}: slots / capInst`);
        const room = Math.max(0, Math.min(R.dbr, R.mort));
        assert.ok(near(L.room, room) && L.mortgage <= L.ltv + 1e-6 && near(L.mortgage, Math.min(L.ltv, E.rePrincipalFor(room, eqR, eqN))), `${at} M${mo.t}: mortgage ${L.mortgage} vs min(${L.ltv}, principal of ${room})`);
        assert.ok(near(L.personal, twoPl(R.dbr, R)), `${at} M${mo.t}: personal ${L.personal} vs ${twoPl(R.dbr, R)}`);
        const inst = L.mortgage > 0 ? E.rePmt(L.mortgage, eqR, eqN) : 0;
        assert.ok(near(L.inst, inst) && near(L.borrowable, L.mortgage + twoPl(R.dbr - inst, R)), `${at} M${mo.t}: borrowable ${L.borrowable} vs ${L.mortgage + twoPl(R.dbr - inst, R)}`);
        assert.ok(L.borrowable >= L.mortgage - 1e-6 && L.borrowable <= L.mortgage + L.personal + 1e-6, `${at} M${mo.t}: bounds`);
        n++;
      });
    });
  }
  assert.ok(n > 10000);
});

test('the optimizer\'s lenses come from its own summaries and agree with reLenses over the same mixes', () => {
  let n = 0;
  for (const { label, inp } of scenarios2(E, 3)) {
    const p = E.mergeRE(inp), cur = Math.max(p.buildStart || 0, p.landMonth || 0);
    const { part, combos } = E.optimizeRE(inp, { delays: [cur], slice: [0, 10000], planned: true });
    assert.equal(part.length, combos, label);
    const start = E.optimizeRE(inp, { merge: { delay: cur, planned: true, parts: [part] } }).start, L = start.lenses;
    // the same mixes as plans of the scenario: the same results, so the same picks
    const m = E.computeRE({ ...inp, plans: part.map((x) => x.plan) }, { noNeed: true }), R = E.reLenses(m.results);
    assert.equal(!!L.recommended, !!R.recommended, label);
    if (!L.recommended) continue;
    assert.equal(L.recommended.idx, 0, `${label}: the recommendation is the best mix`);
    assert.ok(near(L.recommended.econAdv, start.best.econAdv) && near(L.recommended.econAdv, R.recommended.econAdv), `${label}: recommended`);
    assert.ok(near(L.leastLiability.value, R.leastLiability.value) && near(L.leastLiability.mix.peakDebt, m.results[R.leastLiability.idx].peakDebt), `${label}: least liability ${L.leastLiability.value} vs ${R.leastLiability.value}`);
    assert.ok(near(L.richest.value, R.richest.value) && near(L.richest.mix.econAdv, m.results[R.richest.idx].econAdv), `${label}: richest ${L.richest.value} vs ${R.richest.value}`);
    assert.ok(near(L.mostCash.value, R.mostCash.value) && near(L.mostCash.cash, R.mostCash.cash), `${label}: most cash ${L.mostCash.value} vs ${R.mostCash.value}`);
    assert.ok(L.leastLiability.mix && L.leastLiability.mix.cleanPlan && !L.leastLiability.mix._r, `${label}: the pick carries its mix`);
    // the summaries carry the figures the lenses need
    for (const x of [start.best].concat(start.alts)) assert.ok(x.peakDebt >= 0 && x.peakDebtT >= 0 && 'wealthAt5' in x && 'wealthAt10' in x && 'wealthAt15' in x && near(x.wealthAtH, x.econAdv) && 'availAtMoveIn' in x && x.leverageAtMoveIn && 'borrowable' in x.leverageAtMoveIn, `${label}: summary fields`);
    n++;
  }
  assert.ok(n >= 5);
});
