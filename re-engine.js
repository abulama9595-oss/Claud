/* ============================================================
   Real-Estate Investment & Home-Financing engine
   Pure JS (no React). Loaded as a classic <script> after
   engine.js (reuses palette C, computeIRR). All money in SAR
   (full riyals, NOT thousands). Monthly simulation, annual roll-up.

   Two modes share one project + financing model:
     "home"   — build or buy your own home; compare financing
                options against each other AND against renting.
     "rental" — buy/build to let; levered & unlevered returns.

   Financing option = a capital stack: own cash + an optional
   personal loan (unsecured, short, amortising from month 1) +
   a mortgage for the remainder. The mortgage is drawn
   progressively during construction, accrues profit during a
   grace period (interest-only or capitalised), then amortises
   as an annuity. A subsidy cap (REDF / Sakani style)
   makes the first N riyals of the facility bear
   rate × (1 − subsidyPct) instead of the full rate.
   ============================================================ */

/* Each option is a CAPITAL STACK: own cash (cashPct of project cost) + a personal loan
   (plAmount SAR, unsecured, short tenure, no grace) + a mortgage for whatever remains. */
const RE_OPTION_PRESETS = {
  cash:   { name: "All cash",                      cashPct: 100, plAmount: 0,      plRate: 7,   plTenure: 5, rate: 0,    tenure: 1,  graceMonths: 0,  graceMode: "capitalize",   subsidyCap: 0,      subsidyPct: 0,   feesPct: 0, extraMo: 0, maxLtvPct: 90 },
  bank:   { name: "10% cash + bank mortgage",      cashPct: 10,  plAmount: 0,      plRate: 7,   plTenure: 5, rate: 5.5,  tenure: 25, graceMonths: 18, graceMode: "capitalize",   subsidyCap: 0,      subsidyPct: 0,   feesPct: 1, extraMo: 0, maxLtvPct: 90 },
  redf:   { name: "10% cash + REDF-supported",     cashPct: 10,  plAmount: 0,      plRate: 7,   plTenure: 5, rate: 5.5,  tenure: 25, graceMonths: 18, graceMode: "capitalize",   subsidyCap: 500000, subsidyPct: 100, feesPct: 1, extraMo: 0, maxLtvPct: 90 },
  stack:  { name: "Cash + personal loan + mortgage", cashPct: 5, plAmount: 300000, plRate: 7.5, plTenure: 5, rate: 5.5,  tenure: 25, graceMonths: 18, graceMode: "capitalize",   subsidyCap: 500000, subsidyPct: 100, feesPct: 1, extraMo: 0, maxLtvPct: 90 },
  hybrid: { name: "40% cash · 15-yr mortgage",     cashPct: 40,  plAmount: 0,      plRate: 7,   plTenure: 5, rate: 5.25, tenure: 15, graceMonths: 18, graceMode: "interestOnly", subsidyCap: 0,      subsidyPct: 0,   feesPct: 1, extraMo: 0, maxLtvPct: 90 },
};

const RE_BASE = {
  mode: "home",            // "home" | "rental"
  acquire: "build",        // "build" (land + construction) | "buy" (ready property)
  // land & construction
  landArea: 400, landPrice: 3200,          // sqm, SAR/sqm
  builtArea: 520, buildCost: 2300,         // sqm built-up, SAR/sqm turnkey
  builtPct: 0, floors: 1,                  // if builtPct > 0, built-up area = landArea × builtPct % (footprint) × floors; builtArea is then ignored
  softPct: 8, contPct: 7, finishExtra: 150000, // design/permits/supervision %, contingency %, kitchen/AC/landscape SAR
  buildMonths: 18, devMarginPct: 10,       // construction duration; market value uplift of a self-built home over its cost
  landMonth: 0, buildStart: 0, costInflation: 3, // timing: month the land is bought, month construction starts (≥ landMonth), construction-cost inflation %/yr
  // ready property
  propertyPrice: 2800000, brokerPct: 2.5,
  // taxes & fees (KSA)
  vatPct: 15, rettPct: 5, firstHomeExempt: true, rettExemptCap: 1000000,
  // market & horizon
  appreciation: 4, horizon: 20, altReturn: 6, discountRate: 6, sellCostPct: 7.5,
  maintPct: 1.0, insurance: 3000,
  // own-home: you & the rent you'd otherwise pay
  rentNow: 8000, rentGrowth: 3, income: 45000, dbrCap: 55, cashAvailable: 1000000,
  // household cash engine (home mode): what you can save each month, and the floor you never want cash to fall below
  livingExpenses: 15000, cashBuffer: 100000,
  // existing debt (home mode) — EXAMPLES: replace with your real loans (or import from Qist)
  existingLoans: [
    { id: 1, name: "Personal loan (example)", balance: 350000, installment: 7900, monthsLeft: 54, rate: 6.5 },
    { id: 2, name: "Car finance (example)",   balance: 95000,  installment: 2950, monthsLeft: 36, rate: 5.0 },
  ],
  settleFeeMonths: 3,      // SAMA: early-settlement cost capped at the next 3 months' term cost
  rateQuote: "apr",        // how NEW-facility rates are entered: "apr" (reducing balance) or "flat" (KSA "hamish" per year on the original principal)
  plCap: 3000000,          // bank product ceiling on a single personal loan (the 33%-of-income rule usually binds first)
  perLoanCap: 33,          // no single facility's instalment may exceed this % of income
  landLtv: 90,             // max LTV when the bank finances the land purchase (cash-raising mortgages: 70%)
  recoveryMonths: 24,      // your rule: cash must be back at the buffer within this many months after move-in
  cashoutLtv: 70,          // max LTV for a mortgage raised against an owned, completed home ("cash-out")
  // a property you ALREADY own and could mortgage (equity release) to fund the build or refinance loans
  ownedValue: 7000000, ownedLtv: 70,
  // rental investment
  rentMo: 12000, vacancyPct: 8, mgmtPct: 5, exitYear: 10, zakatPct: 0,
  plans: null, // filled below from RE_PLAN_PRESETS
  options: [
    { enabled: true, ...RE_OPTION_PRESETS.cash },
    { enabled: true, ...RE_OPTION_PRESETS.bank },
    { enabled: true, ...RE_OPTION_PRESETS.redf },
    { enabled: true, ...RE_OPTION_PRESETS.stack },
  ],
};

/* ---------- home-mode STRATEGIES: time-phased financing plans (v2) ----------
   Four facilities, each sized at the month it is taken from what the BANK allows that month:
     lm  mortgage on the NEW LAND, taken when the land is bought (landLtv × land price), amortises at once
     eq  mortgage on the property you ALREADY own (ownedLtv × ownedValue)
     pl  personal loan (plCap)
     co  cash-out on the FINISHED home at completion (cashoutLtv × value)
   Sizing mode per facility: "max" = the bank's maximum · "need" = just enough to close the funding gap
   (remaining project spend − cash above your buffer) · "fixed" = an amount you type. Every amount is capped by
   the smaller of: LTV, the per-loan cap (perLoanCap % of income), the total debt-burden cap (dbrCap % of income
   after every instalment still running that month) and the product cap. Timing words: start = month 0,
   land = month the land is bought, build = month construction starts, completion = move-in, month = a month you choose.
   settlePolicy: "none" | "asNeeded" (settle existing loans, best relief per riyal, only when the funding gap exceeds
   what the bank allows) | "all" (clear every settleable loan at the first facility). */
const RE_PLAN_DEFAULTS = {
  lmUse: false, lmMode: "max", lmAmount: 0, lmRate: 4.5, lmTenure: 18, lmFeesPct: 1,
  eqWhen: "none", eqMonth: 0, eqMode: "max", eqAmount: 0, eqRate: 4.5, eqTenure: 18, eqFeesPct: 1,
  plWhen: "none", plMonth: 0, plMode: "need", plAmount: 0, plRate: 4.0, plTenure: 5,
  coUse: false, coMode: "need", coAmount: 0, coRate: 4.5, coTenure: 18, coFeesPct: 1,
  settlePolicy: "asNeeded", extraMo: 0,
};
const RE_PLAN_PRESETS = {
  landMortgage: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) · cash for the build · personal loan only for any shortfall",
    lmUse: true, lmMode: "max", plWhen: "build", plMode: "need" },
  landPlusOwned: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) + mortgage my existing property for the shortfall at build start",
    lmUse: true, lmMode: "max", eqWhen: "build", eqMode: "need" },
  ownedOnly: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property (max) at the start · no mortgage on the new land",
    eqWhen: "start", eqMode: "max" },
  ownedForNeed: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property for just the shortfall when the land is bought",
    eqWhen: "land", eqMode: "need" },
  cashPlusPersonal: { ...RE_PLAN_DEFAULTS, name: "Cash + a personal loan for the shortfall · no mortgage",
    plWhen: "land", plMode: "need" },
  landThenCashOut: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) → cash-out on the finished home to refill cash",
    lmUse: true, lmMode: "max", coUse: true, coMode: "need" },
  clearAllFirst: { ...RE_PLAN_DEFAULTS, name: "Clear every old loan from the existing-property mortgage, then mortgage the land (max)",
    eqWhen: "start", eqMode: "need", lmUse: true, lmMode: "max", settlePolicy: "all" },
  allCash: { ...RE_PLAN_DEFAULTS, name: "All cash · no new borrowing", settlePolicy: "none" },
};
RE_BASE.plans = [
  { enabled: true, ...RE_PLAN_PRESETS.landMortgage },
  { enabled: true, ...RE_PLAN_PRESETS.landPlusOwned },
  { enabled: true, ...RE_PLAN_PRESETS.ownedOnly },
  { enabled: true, ...RE_PLAN_PRESETS.cashPlusPersonal },
];

/* ---------- formatting (SAR) ---------- */
const fS = (n) => { // compact SAR: 1.25M / 850K / 420
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n); let s;
  if (a >= 1e6) s = (a / 1e6).toFixed(2) + "M"; else if (a >= 1e3) s = Math.round(a / 1e3).toLocaleString("en-US") + "K"; else s = Math.round(a).toString();
  return n < 0 ? `(${s})` : s;
};
const fSAR = (n) => { if (n == null || isNaN(n)) return "—"; const r = Math.round(n); const s = Math.abs(r).toLocaleString("en-US"); return r < 0 ? `(${s})` : s; };

function mergeRE(inp) {
  const p = { ...RE_BASE, ...inp };
  p.options = (inp && inp.options ? inp.options : RE_BASE.options).map((o, i) => ({ ...RE_BASE.options[i] || RE_OPTION_PRESETS.bank, ...o }));
  p.plans = (inp && inp.plans ? inp.plans : RE_BASE.plans).map((o, i) => {
    const q = { ...RE_PLAN_DEFAULTS, ...(RE_BASE.plans[i] || RE_PLAN_PRESETS.landMortgage), ...o };
    // legacy (v1) plan fields → v2 facilities
    if (o && o.mortgageWhen && o.lmUse == null) { q.lmUse = o.mortgageWhen === "start"; q.coUse = o.mortgageWhen === "completion"; if (o.rate != null) { q.lmRate = o.rate; q.coRate = o.rate; } if (o.tenure != null) { q.lmTenure = o.tenure; q.coTenure = o.tenure; } }
    if (o && o.eqWhen && o.eqMode == null) q.eqMode = (o.eqAmount || 0) > 0 ? "fixed" : "max";
    if (o && o.plWhen && o.plMode == null) q.plMode = (o.plAmount || 0) > 0 ? "fixed" : "need";
    return q;
  });
  p.existingLoans = (inp && inp.existingLoans ? inp.existingLoans : RE_BASE.existingLoans).map((l, i) => ({ id: i + 1, name: `Loan ${i + 1}`, balance: 0, installment: 0, monthsLeft: 0, rate: 6, canSettle: true, ...l }));
  return p;
}
// principal an annuity of `pmt` per month supports at rAnnual over n months
function rePrincipalFor(pmt, rAnnual, n) {
  if (pmt <= 0 || n <= 0) return 0;
  const r = rAnnual / 100 / 12;
  return r === 0 ? pmt * n : pmt * (1 - Math.pow(1 + r, -n)) / r;
}

/* ---------- project cost build-up ---------- */
function reProject(p) {
  const build = p.acquire === "build";
  const g = p.appreciation / 100;
  const landMonth = Math.max(0, Math.round(p.landMonth || 0));
  const start = build ? Math.max(landMonth, Math.round(p.buildStart || 0)) : landMonth;
  const inflate = Math.pow(1 + (p.costInflation || 0) / 100, start / 12);   // construction priced at the month it starts
  const landToday = build ? p.landArea * p.landPrice : 0;
  const land = landToday * Math.pow(1 + g, landMonth / 12);                 // land priced at the month it is bought
  const price = build ? 0 : p.propertyPrice * Math.pow(1 + g, landMonth / 12);
  const builtArea = p.builtPct > 0 ? p.landArea * p.builtPct / 100 * (p.floors || 1) : p.builtArea;
  const hard = build ? builtArea * p.buildCost * inflate : 0;
  const soft = hard * p.softPct / 100;
  const cont = (hard + soft) * p.contPct / 100;
  const finish = p.finishExtra * inflate;
  const vatConstr = (hard + soft + cont) * p.vatPct / 100;
  const vatFinish = finish * p.vatPct / 100;
  const broker = price * p.brokerPct / 100;
  const rettBase = build ? land : price;
  const exempt = p.mode === "home" && p.firstHomeExempt ? Math.min(rettBase, p.rettExemptCap) : 0;
  const rett = (rettBase - exempt) * p.rettPct / 100;
  const total = land + price + rett + broker + hard + soft + cont + finish + vatConstr + vatFinish;
  // market value at completion: what the finished home is worth (VAT, RETT, fees, contingency are sunk)
  const value0 = build ? (land + hard + soft + finish) * (1 + p.devMarginPct / 100) : price + finish;
  const bm = build ? Math.max(1, Math.round(p.buildMonths)) : 0;
  const occupy = start + bm + 1; // first month of living in / letting
  // monthly spend schedule, index = month
  const schedule = new Array(occupy).fill(0);
  if (build) {
    schedule[landMonth] += land + rett;
    const perMo = (hard + soft + cont + vatConstr) / bm;
    for (let t = start + 1; t <= start + bm; t++) schedule[t] += perMo;
    schedule[start + bm] += finish + vatFinish;
  } else {
    schedule[landMonth] += price + rett + broker + finish + vatFinish;
  }
  // market value path: nothing before the land is bought; land appreciates from purchase; the finished home is worth
  // (land + construction) × (1 + uplift) at completion, with the construction share accruing in proportion to progress.
  // With landMonth = buildStart = 0 this is identical to the original formula.
  const compValue = build ? (land + hard + soft + finish) * (1 + p.devMarginPct / 100) : price + finish; // value at completion in purchase-month prices
  const valueAt = (t) => {
    if (t < landMonth) return 0;
    const prog = build ? Math.min(1, Math.max(0, (t - start) / bm)) : 1;
    return (land + (compValue - land) * prog) * Math.pow(1 + g, (t - landMonth) / 12);
  };
  return { build, land, landToday, price, hard, soft, cont, finish, vat: vatConstr + vatFinish, broker, rett, rettExempt: exempt, total, value0: valueAt(occupy - 1), bm, occupy, start, landMonth, inflate, schedule, valueAt,
    builtArea, costPerSqm: build && builtArea > 0 ? (total - land - rett) / builtArea : 0 };
}

/* ---------- rate quoting ---------- */
// flat ("hamish") rate per year on the original principal over n months → equivalent reducing-balance APR
function reFlatToApr(flat, n) {
  if (flat <= 0 || n <= 0) return 0;
  const pmt = (1 + flat / 100 * n / 12) / n;
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (rePmt(1, mid * 100, n) > pmt) hi = mid; else lo = mid; }
  return lo * 100;
}
const reEffRate = (p, rate, n) => p.rateQuote === "flat" ? reFlatToApr(rate, n) : rate;

/* ---------- annuity ---------- */
function rePmt(B, rAnnual, n) {
  if (n <= 0) return B;
  const r = rAnnual / 100 / 12;
  if (r === 0) return B / n;
  return B * r / (1 - Math.pow(1 + r, -n));
}

/* ---------- monthly simulation of one financing option ---------- */
function reSimulate(p, prj, opt) {
  const home = p.mode === "home";
  const H = Math.round((home ? p.horizon : p.exitYear) * 12);
  const g = p.appreciation / 100, alt = Math.pow(1 + p.altReturn / 100, 1 / 12) - 1;
  const cash = prj.total * Math.min(100, Math.max(0, opt.cashPct)) / 100;
  const pl = Math.max(0, Math.min(opt.plAmount, prj.total - cash));      // personal loan, drawn in full at month 0
  const loanCommit = Math.max(0, prj.total - cash - pl);                   // mortgage covers the remainder
  const maxLoan = prj.total * opt.maxLtvPct / 100;
  const fundingGap = Math.max(0, loanCommit - maxLoan);                    // mortgage needed beyond the bank's LTV ceiling
  const fees = loanCommit * opt.feesPct / 100;
  const gm = prj.build ? prj.start + Math.max(opt.graceMonths, prj.bm) : prj.landMonth + Math.max(0, opt.graceMonths);
  const n = Math.max(1, Math.round(opt.tenure * 12));
  const mRate = reEffRate(p, opt.rate, n);
  const rateS = mRate * (1 - Math.min(100, opt.subsidyPct) / 100), rateU = mRate;
  const plN = Math.max(1, Math.round(opt.plTenure * 12));
  const plRate = reEffRate(p, opt.plRate, plN);
  const plPmt = pl > 0 ? rePmt(pl, plRate, plN) : 0;
  let balS = 0, balU = 0, balPL = pl, cumEquity = 0, pmtS = 0, pmtU = 0, amortStarted = false;
  const equityPool = cash + pl;                                            // funds spend before the mortgage is drawn
  let portfolio = 0, cumOut = 0, cumLev = 0, peakEquityNeed = 0, fvOut = 0;
  let breakEvenMonth = null, payoffMonth = null;
  const months = [];
  const yearOf = (t) => Math.max(0, Math.ceil(t / 12)); // month 0 -> year 0 bucket, months 1..12 -> year 1
  for (let t = 0; t <= H; t++) {
    const spend = prj.schedule[t] || 0;
    const eq = Math.min(spend, Math.max(0, equityPool - cumEquity)); cumEquity += eq;
    const draw = spend - eq;
    // profit accrues on the opening balance
    const iS = balS * rateS / 100 / 12, iU = balU * rateU / 100 / 12;
    let interest = iS + iU;
    let payment = 0, principal = 0, plPayment = 0, plInterest = 0;
    if (t <= prj.landMonth) {
      // draws land in the subsidised bucket first
      const toS = Math.max(0, Math.min(draw, opt.subsidyCap - balS)); balS += toS; balU += draw - toS;
    } else if (t <= gm) {
      if (opt.graceMode === "interestOnly") { payment = interest; }
      else { balS += iS; balU += iU; } // capitalised
      const toS = Math.max(0, Math.min(draw, opt.subsidyCap - balS)); balS += toS; balU += draw - toS;
    } else {
      if (!amortStarted) { amortStarted = true; pmtS = rePmt(balS, rateS, n); pmtU = rePmt(balU, rateU, n); }
      // scheduled annuity per bucket, capped at what is owed
      let payS = Math.min(pmtS, balS + iS), payU = Math.min(pmtU, balU + iU);
      let prS = payS - iS, prU = payU - iU;
      // voluntary extra goes to the dearest (unsubsidised) bucket first
      let extra = Math.max(0, opt.extraMo);
      const xU = Math.min(extra, balU - prU); prU += xU; extra -= xU;
      const xS = Math.min(extra, balS - prS); prS += xS;
      balS -= prS; balU -= prU;
      principal = prS + prU; payment = interest + principal;
      if (balS + balU < 0.5 && payoffMonth === null) payoffMonth = t;
    }
    // personal loan: straight annuity from month 1, no grace
    if (t >= 1 && balPL > 0.5) {
      plInterest = balPL * plRate / 100 / 12;
      plPayment = Math.min(plPmt, balPL + plInterest);
      balPL -= plPayment - plInterest;
    }
    const mortgagePayment = payment;
    payment += plPayment; interest += plInterest; principal += plPayment - plInterest;
    const bal = balS + balU + balPL;
    // property value path (continuous through construction)
    const value = prj.valueAt(t);
    const occupied = t >= prj.occupy;
    const ownerCost = occupied ? value * p.maintPct / 100 / 12 + p.insurance / 12 : 0;
    const yrIdx = Math.floor(Math.max(0, t - 1) / 12);
    // ---- own-home: outflows vs renting the equivalent home ----
    const rentEq = t >= 1 ? p.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx) : 0; // what a renter pays this month
    const rentPaid = home && t >= 1 && !occupied ? rentEq : 0;                       // owner still rents while building
    const upfront = t === 0 ? fees : 0;
    const outflow = eq + upfront + payment + ownerCost + rentPaid;
    cumOut += outflow;
    fvOut = fvOut * (1 + alt) + outflow;
    // renter invests whatever the owner spends over and above rent
    portfolio = portfolio * (1 + alt) + (outflow - rentEq);
    const liqValue = value * (1 - p.sellCostPct / 100);
    const ownerEquity = liqValue - bal;
    const advantage = ownerEquity - portfolio;
    if (home && occupied && breakEvenMonth === null && advantage >= 0) breakEvenMonth = t;
    // ---- rental ----
    let rentIn = 0, opex = 0, noi = 0, cf = 0, zakat = 0;
    if (!home && occupied) {
      rentIn = p.rentMo * Math.pow(1 + p.rentGrowth / 100, Math.floor((t - prj.occupy) / 12)) * (1 - p.vacancyPct / 100) * (1 - p.mgmtPct / 100);
      opex = ownerCost; noi = rentIn - opex;
      zakat = Math.max(0, noi) * p.zakatPct / 100;
      cf = noi - zakat - payment;
    }
    let lev = -(eq + upfront) + cf, unlev = -spend + noi - zakat;
    if (!home && t === H) { lev += liqValue - bal; unlev += liqValue; }
    cumLev += lev; peakEquityNeed = Math.min(peakEquityNeed, cumLev);
    months.push({ t, year: yearOf(t), spend, eq, draw, bal, balS, balU, balPL, balMortgage: balS + balU, interest, principal, payment, mortgagePayment, plPayment, plInterest, ownerCost, rentPaid, rentEq, outflow, cumOut, value, liqValue, ownerEquity, portfolio, advantage, rentIn, opex, noi, zakat, cf, lev, unlev, dscr: payment > 1 ? noi / payment : null });
  }
  // ---- annual roll-up ----
  const nY = yearOf(H);
  const years = [];
  for (let y = 0; y <= nY; y++) {
    const ms = months.filter((m) => m.year === y);
    const sum = (k) => ms.reduce((a, m) => a + m[k], 0);
    const last = ms[ms.length - 1];
    years.push({ year: y, label: y === 0 ? "Y0" : `Y${y}`, spend: sum("spend"), eq: sum("eq"), interest: sum("interest"), principal: sum("principal"), payment: sum("payment"), mortgagePayment: sum("mortgagePayment"), plPayment: sum("plPayment"),
      ownerCost: sum("ownerCost"), rentPaid: sum("rentPaid"), rentEq: sum("rentEq"), outflow: sum("outflow"), rentIn: sum("rentIn"), opex: sum("opex"), noi: sum("noi"), zakat: sum("zakat"), cf: sum("cf"), lev: sum("lev"), unlev: sum("unlev"),
      bal: last.bal, balPL: last.balPL, balMortgage: last.balMortgage, value: last.value, ownerEquity: last.ownerEquity, portfolio: last.portfolio, advantage: last.advantage,
      dscr: sum("payment") > 1 ? sum("noi") / sum("payment") : null });
  }
  const end = months[H];
  const totalInterest = months.reduce((a, m) => a + m.interest, 0);
  const plInterestTotal = months.reduce((a, m) => a + m.plInterest, 0);
  const totalPaidBank = months.reduce((a, m) => a + m.payment, 0) + fees;
  const maxPayment = Math.max(...months.map((m) => m.payment));
  const maxBurden = Math.max(...months.map((m) => m.payment + m.rentPaid + m.ownerCost));
  const firstPmt = months.find((m) => m.t > gm && m.payment > 0);
  const res = { opt, cash, pl, loanCommit, maxLoan, fundingGap, fees, gm, cashNeeded: cash + fees, months, years, end,
    totalInterest, plInterestTotal, mortgageInterest: totalInterest - plInterestTotal, totalPaidBank, totalOutflow: cumOut, fvOutflow: fvOut, maxPayment, maxBurden,
    monthlyPayment: firstPmt ? firstPmt.payment : 0, graceInterest: months.filter((m) => m.t <= gm).reduce((a, m) => a + m.interest, 0),
    payoffMonth, endBalance: end.bal, endValue: end.value, ownerEquityEnd: end.ownerEquity, portfolioEnd: end.portfolio, advantage: end.advantage, breakEvenMonth,
    dbr: p.income > 0 ? maxPayment / p.income * 100 : 0, burdenPct: p.income > 0 ? maxBurden / p.income * 100 : 0,
    affordable: (p.income > 0 ? maxPayment / p.income * 100 : 0) <= p.dbrCap, cashOk: cash + fees <= p.cashAvailable, ltvOk: fundingGap < 1 };
  if (!home) {
    const levCf = years.map((y) => y.lev), unlevCf = years.map((y) => y.unlev);
    const d = p.discountRate / 100;
    const npv = (cfs) => cfs.reduce((a, c, i) => a + c / Math.pow(1 + d, i), 0);
    const dist = levCf.filter((c) => c > 0).reduce((a, c) => a + c, 0);
    const invested = Math.max(0, -peakEquityNeed);
    const fullYears = years.filter((y) => y.year >= 1 && y.year * 12 > prj.occupy + 11 && y.year < nY); // stabilised full years, excl. exit year
    const firstFull = fullYears[0];
    const dscrs = fullYears.map((y) => y.dscr).filter((x) => x != null);
    let cum = 0, payback = null;
    years.forEach((y) => { cum += y.lev; if (payback === null && cum >= 0 && y.year > 0) payback = y.year; });
    Object.assign(res, {
      irr: computeIRR(levCf), irrUnlev: computeIRR(unlevCf), npv: npv(levCf), npvUnlev: npv(unlevCf),
      moic: invested > 0 ? dist / invested : null, invested, cashOnCash: firstFull && invested > 0 ? firstFull.cf / invested * 100 : null,
      dscrMin: dscrs.length ? Math.min(...dscrs) : null, payback,
      grossYield: firstFull ? (firstFull.rentIn / ((1 - p.vacancyPct / 100) * (1 - p.mgmtPct / 100))) / prj.total * 100 : null,
      netYield: firstFull ? firstFull.noi / prj.total * 100 : null,
      exitProceeds: end.liqValue - end.bal, exitValue: end.value,
      totalNoi: years.reduce((a, y) => a + y.noi, 0), totalCf: years.reduce((a, y) => a + y.cf, 0),
    });
  }
  return res;
}

/* ---------- home mode: month-by-month household cash simulation of one strategy (v2) ---------- */
function rePlanSimulate(p, prj, plan) {
  const H = Math.round(p.horizon * 12);
  const alt = Math.pow(1 + p.altReturn / 100, 1 / 12) - 1;
  const dbrTarget = p.income * p.dbrCap / 100;          // all instalments together must stay under this
  const perLoanTarget = p.income * p.perLoanCap / 100;  // no single facility's instalment may exceed this
  const feeMonths = Math.max(0, p.settleFeeMonths);
  const events = [], flags = [];
  // existing loans (instalment floored at the annuity that clears the balance in the stated months)
  const loans = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { ...l, bal: l.balance, left, installment: Math.max(l.installment, rePmt(l.balance, l.rate, left)), settledAt: null, interestPaid: 0, kind: "existing" }; });
  const loanPay = (bal, i, inst) => Math.min(bal + i, inst);
  // renter/not-building baseline keeps paying the existing loans untouched
  const renterInst = new Array(H + 1).fill(0);
  loans.forEach((l) => { let bal = l.bal; for (let t = 1; t <= H && bal > 0.5; t++) { const i = bal * l.rate / 100 / 12; const pay = loanPay(bal, i, l.installment); bal -= pay - i; renterInst[t] += pay; } });

  // the four new facilities
  const mk = (key, label, rate, tenure, fees) => ({ key, label, bal: 0, pmt: 0, amount: 0, rate: reEffRate(p, rate, Math.max(1, Math.round(tenure * 12))), quoted: rate, tenure, n: Math.max(1, Math.round(tenure * 12)), fees: 0, feesPct: fees, startedAt: null, settledAt: null, interestPaid: 0, monthsPaid: 0, capacity: null, kind: key, name: label });
  const lm = mk("lm", "Mortgage on the new land", plan.lmRate, plan.lmTenure, plan.lmFeesPct);
  const eq = mk("eq", "Mortgage on your existing property", plan.eqRate, plan.eqTenure, plan.eqFeesPct);
  const pl = mk("pl", "Personal loan", plan.plRate, plan.plTenure, 0);
  const co = mk("co", "Cash-out on the finished home", plan.coRate, plan.coTenure, plan.coFeesPct);
  const facs = [lm, eq, pl, co];
  const activeExisting = () => loans.filter((l) => l.settledAt === null && l.bal > 0.5);
  const instOf = (f) => f.bal > 0.5 && f.settledAt === null ? f.pmt : 0;
  const allInst = () => activeExisting().reduce((a, l) => a + l.installment, 0) + facs.reduce((a, f) => a + instOf(f), 0);
  const settleCost = (l) => { const r = l.rate / 100 / 12; const left = l.kind === "existing" ? Math.max(0, l.left) : Math.max(0, l.n - l.monthsPaid); return l.bal + l.bal * r * Math.min(feeMonths, left); };
  const instOfAny = (l) => l.kind === "existing" ? l.installment : l.pmt;

  let cash = p.cashAvailable, rCash = p.cashAvailable;
  let minCash = Infinity, minCashT = 0, belowBufferMonths = 0, shortfall = 0, fundingGap = 0;
  let settledTotal = 0, settleFees = 0, debtFreeT = null, breakEvenMonth = null, cashRestoredT = null;
  const months = [];
  const yearOf = (t) => Math.max(0, Math.ceil(t / 12));
  const remainingSpend = (t) => { let s = 0; for (let k = t; k < prj.schedule.length; k++) s += prj.schedule[k] || 0; return s; };
  const when = (w, m) => w === "start" ? 0 : w === "land" ? prj.landMonth : w === "build" ? prj.start : w === "completion" ? prj.occupy : w === "month" ? Math.max(0, Math.round(m || 0)) : -1;

  // what the bank would lend on facility f this month: min(LTV cap, per-loan cap, total debt-burden room, product cap)
  function capacityOf(f, ltvCap, productCap) {
    const room = Math.max(0, Math.min(dbrTarget - allInst(), perLoanTarget));
    const byDbr = rePrincipalFor(room, f.rate, f.n);
    const cap = Math.max(0, Math.min(byDbr, ltvCap, productCap));
    return { cap, byDbr, byLtv: ltvCap, byProduct: productCap, room, limitedBy: cap <= 0 ? "no debt-burden room" : cap === byDbr && byDbr < Math.min(ltvCap, productCap) ? `debt-burden cap (${(dbrTarget - allInst() <= perLoanTarget ? p.dbrCap + "% total" : p.perLoanCap + "% per loan")})` : cap === ltvCap ? "LTV" : "bank cap" };
  }
  function doSettle(l, t, reason) {
    const cost = settleCost(l), fee = cost - l.bal, inst = instOfAny(l);
    cash -= cost; settledTotal += l.bal; settleFees += fee; l.settledAt = t; l.bal = 0;
    events.push({ t, kind: "settle", text: `Settle ${l.name}: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — frees ${fSAR(inst)}/mo — ${reason}.` });
  }
  const pool = () => activeExisting().filter((l) => l.canSettle !== false).concat(facs.filter((f) => f.key !== "lm" && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null));
  // settle just enough that the bank's capacity covers the funding gap (or everything, under "all")
  function settleFor(t, f, ltvCap, productCap, gap) {
    if (plan.settlePolicy === "all") { pool().forEach((l) => doSettle(l, t, "clear old debt before the new facility")); return; }
    if (plan.settlePolicy !== "asNeeded") return;
    let guard = 0;
    while (gap > capacityOf(f, ltvCap, productCap).cap + 1 && pool().length && guard++ < 20) {
      const pick = pool().slice().sort((a, b) => instOfAny(b) / settleCost(b) - instOfAny(a) / settleCost(a))[0];
      doSettle(pick, t, `to pass the bank's debt-burden test for the ${f.label.toLowerCase()}`);
    }
  }
  function originate(t, f, mode, fixedAmt, ltvCap, productCap, proceedsFirst) {
    const cashBefore = cash;
    const gap = Math.max(0, remainingSpend(t) - (cash - p.cashBuffer));
    // proceeds of a secured facility can pay settlements the same day: let the sizing see the gap, then settle
    settleFor(t, f, ltvCap, productCap, mode === "fixed" ? Math.min(fixedAmt, gap) : gap);
    const c = capacityOf(f, ltvCap, productCap);
    const want = mode === "max" ? c.cap : mode === "need" ? gap : fixedAmt;
    const amount = Math.max(0, Math.min(want, c.cap));
    f.capacity = { t, ...c, want, mode, taken: amount, gap };
    if (amount < 1) {
      events.push({ t, kind: f.key, text: `${f.label}: nothing available (${c.limitedBy}${gap > 0 ? `; funding gap ${fS(gap)}` : ""}).` });
      if (gap > 0) flags.push(`${f.label} at ${fMonText(t)} not possible: ${c.limitedBy}.`);
      return;
    }
    f.bal = amount; f.amount = amount; f.pmt = rePmt(amount, f.rate, f.n); f.startedAt = t; f.fees = amount * f.feesPct / 100;
    cash += amount - f.fees;
    const dbr = allInst() / p.income * 100;
    const basis = mode === "max" ? "the bank's maximum" : mode === "need" ? `the shortfall${gap > amount + 1 ? ` (${fS(gap)} needed)` : ""}` : "the amount you set";
    events.push({ t, kind: f.key, text: `${f.label}: ${fS(amount)} at ${f.quoted}%${p.rateQuote === "flat" ? ` flat (≈${f.rate.toFixed(2)}% APR)` : ""} over ${f.tenure} yrs — ${basis}; bank could lend up to ${fS(c.cap)} (limited by ${c.limitedBy}); instalment ${fSAR(f.pmt)}/mo; debt burden now ${dbr.toFixed(0)}% of income. Net to cash ${fS(cash - cashBefore)}.` });
    if (mode === "need" && gap > amount + 1) flags.push(`${f.label} covers ${fS(amount)} of a ${fS(gap)} shortfall (${c.limitedBy}).`);
  }
  const fMonText = (t) => `month ${t}`;

  const lmT = plan.lmUse ? prj.landMonth : -1;
  const eqT = when(plan.eqWhen, plan.eqMonth), plT = when(plan.plWhen, plan.plMonth), coT = plan.coUse ? prj.occupy : -1;
  for (let t = 0; t <= H; t++) {
    const yrIdx = Math.floor(Math.max(0, t - 1) / 12);
    const occupied = t >= prj.occupy;
    const rentEq = t >= 1 ? p.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx) : 0;
    const rentPaid = t >= 1 && !occupied ? rentEq : 0;
    if (t >= 1) { cash = cash * (1 + alt) + p.income - p.livingExpenses - rentPaid; rCash = rCash * (1 + alt) + p.income - p.livingExpenses - rentEq; }
    // planned settlements first (e.g. a loan you intend to clear on a known date)
    loans.forEach((l) => { if (l.settledAt === null && l.bal > 0.5 && l.settleAt != null && l.settleAt > 0 && t === Math.round(l.settleAt)) doSettle(l, t, "planned settlement"); });
    // milestones
    if (t === prj.landMonth && prj.build) events.push({ t, kind: "milestone", text: `Land bought for ${fS(prj.land + prj.rett)} incl. RETT${prj.landMonth > 0 ? ` (today's price grown at ${p.appreciation}%/yr)` : ""}.` });
    if (t === prj.start && prj.build) events.push({ t, kind: "milestone", text: `Construction starts${prj.inflate > 1 ? ` (priced ${((prj.inflate - 1) * 100).toFixed(0)}% above today)` : ""} — ${fS(prj.total - prj.land - prj.rett)} over ${prj.bm} months.` });
    // facilities, in order: land mortgage → existing property → personal loan → cash-out
    const landValue = prj.land;
    if (t === lmT) originate(t, lm, plan.lmMode, plan.lmAmount, landValue * p.landLtv / 100, Infinity);
    if (t === eqT) originate(t, eq, plan.eqMode, plan.eqAmount, p.ownedValue * p.ownedLtv / 100, Infinity);
    if (t === plT) originate(t, pl, plan.plMode, plan.plAmount, Infinity, p.plCap);
    if (t === coT) originate(t, co, plan.coMode, plan.coAmount, prj.valueAt(t) * p.cashoutLtv / 100, Infinity);
    if (t === prj.occupy && prj.build) events.push({ t, kind: "milestone", text: `Construction complete — move in. Upkeep starts.` });
    // project spend, all from cash (facility proceeds are already in cash)
    const spend = prj.schedule[t] || 0;
    cash -= spend;
    // debt service
    let existInst = 0, existInterest = 0;
    if (t >= 1) loans.forEach((l) => { if (l.settledAt !== null || l.bal <= 0.5) return; const i = l.bal * l.rate / 100 / 12; const pay = loanPay(l.bal, i, l.installment); l.bal -= pay - i; l.left -= 1; l.interestPaid += i; existInst += pay; existInterest += i; });
    const pays = {};
    facs.forEach((f) => {
      let pay = 0, int = 0;
      if (t >= 1 && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null && t > f.startedAt) {
        int = f.bal * f.rate / 100 / 12; pay = Math.min(f.pmt + (f.key === "lm" ? Math.max(0, plan.extraMo) : 0), f.bal + int); f.bal -= pay - int; f.interestPaid += int; f.monthsPaid++;
      }
      pays[f.key] = pay; pays[f.key + "Int"] = int;
    });
    const value = prj.valueAt(t);
    const ownerCost = occupied ? value * p.maintPct / 100 / 12 + p.insurance / 12 : 0;
    const newPay = pays.lm + pays.eq + pays.pl + pays.co;
    cash -= existInst + newPay + ownerCost;
    rCash -= renterInst[t];
    const debtExisting = loans.reduce((a, l) => a + (l.settledAt === null ? l.bal : 0), 0);
    const debtNew = facs.reduce((a, f) => a + (f.settledAt === null ? f.bal : 0), 0);
    const debt = debtExisting + debtNew;
    const liqValue = value * (1 - p.sellCostPct / 100);
    const netWorth = cash + liqValue - debt, renterNW = rCash, advantage = netWorth - renterNW;
    if (cash < minCash) { minCash = cash; minCashT = t; }
    if (cash < p.cashBuffer) belowBufferMonths++;
    if (cash < 0) shortfall = Math.max(shortfall, -cash);
    if (occupied && cashRestoredT === null && cash >= p.cashBuffer) cashRestoredT = t;
    if (occupied && breakEvenMonth === null && advantage >= 0) breakEvenMonth = t;
    if (debtFreeT === null && t > 0 && debt < 0.5) debtFreeT = t;
    months.push({ t, year: yearOf(t), cash, rCash, spend, rentPaid, rentEq, existInst, existInterest, lmPay: pays.lm, eqPay: pays.eq, plPay: pays.pl, coPay: pays.co, newInt: pays.lmInt + pays.eqInt + pays.plInt + pays.coInt, ownerCost, value, liqValue, debt, debtExisting, debtLm: lm.bal, debtEq: eq.bal, debtPl: pl.settledAt === null ? pl.bal : 0, debtCo: co.bal, netWorth, renterNW, advantage, dbr: (existInst + newPay) / p.income * 100 });
  }
  const nY = yearOf(H), years = [];
  for (let y = 0; y <= nY; y++) {
    const ms = months.filter((m) => m.year === y); const sum = (k) => ms.reduce((a, m) => a + m[k], 0); const last = ms[ms.length - 1];
    years.push({ year: y, label: y === 0 ? "Y0" : `Y${y}`, spend: sum("spend"), rentPaid: sum("rentPaid"), rentEq: sum("rentEq"), existInst: sum("existInst"), lmPay: sum("lmPay"), eqPay: sum("eqPay"), plPay: sum("plPay"), coPay: sum("coPay"), interest: sum("existInterest") + sum("newInt"), ownerCost: sum("ownerCost"),
      cash: last.cash, rCash: last.rCash, debt: last.debt, debtExisting: last.debtExisting, debtLm: last.debtLm, debtEq: last.debtEq, debtPl: last.debtPl, debtCo: last.debtCo, value: last.value, netWorth: last.netWorth, renterNW: last.renterNW, advantage: last.advantage,
      instMo: (sum("existInst") + sum("lmPay") + sum("eqPay") + sum("plPay") + sum("coPay")) / (y === 0 ? 1 : 12) });
  }
  const end = months[H];
  const newDebtInterest = facs.reduce((a, f) => a + f.interestPaid, 0) + settleFees;
  const totalInterest = newDebtInterest + loans.reduce((a, l) => a + l.interestPaid, 0);
  const peakDbr = Math.max(...months.map((m) => m.dbr));
  const peakInst = Math.max(...months.map((m) => m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay));
  const feasible = shortfall <= 0;
  const recoveryMonths = cashRestoredT != null ? cashRestoredT - prj.occupy : null;
  const recoveryOk = feasible && recoveryMonths != null && recoveryMonths <= p.recoveryMonths;
  const after = Math.min(H, prj.occupy + p.recoveryMonths);
  if (shortfall > 0) flags.unshift(`Cash goes NEGATIVE by ${fS(shortfall)} (lowest at month ${minCashT}) — the project cannot be fully funded this way.`);
  else if (!recoveryOk) flags.push(cashRestoredT == null ? `Cash never gets back to your ${fS(p.cashBuffer)} buffer after move-in within the horizon.` : `Cash gets back to your ${fS(p.cashBuffer)} buffer ${recoveryMonths} months after move-in (you asked for ${p.recoveryMonths}).`);
  events.sort((a, b) => a.t - b.t);
  const facOut = (f) => ({ ...f });
  return { plan, months, years, events, flags, feasible, recoveryOk, end,
    lm: facOut(lm), eq: facOut(eq), pl: facOut(pl), co: facOut(co), facilities: facs.map(facOut), loansEnd: loans.map((l) => ({ name: l.name, settledAt: l.settledAt, bal: l.bal })),
    cashStart: p.cashAvailable, minCash, minCashT, belowBufferMonths, shortfall, cashAtCompletion: months[Math.min(H, prj.occupy)].cash, cashEnd: end.cash,
    cashRestoredT, recoveryMonths, cashAfterWindow: months[after].cash, newDebtTotal: facs.reduce((a, f) => a + f.amount, 0),
    settledTotal, settleFees, totalInterest, newDebtInterest, peakDbr, peakInst, debtFreeT, breakEvenMonth,
    netWorthEnd: end.netWorth, renterEnd: end.renterNW, advantage: end.advantage, endDebt: end.debt, endValue: end.value, start: prj.start, landMonth: prj.landMonth, occupy: prj.occupy,
    dbrOk: peakDbr <= p.dbrCap + 0.5 };
}

/* ---------- top-level ---------- */
function computeRE(inp) {
  const p = mergeRE(inp);
  const prj = reProject(p);
  const home = p.mode === "home";
  const results = home ? p.plans.map((o) => o.enabled ? rePlanSimulate(p, prj, o) : null) : p.options.map((o) => o.enabled ? reSimulate(p, prj, o) : null);
  const live = results.filter(Boolean);
  const score = (r) => home ? r.advantage : (r.irr == null ? -Infinity : r.irr);
  const ranked = live.slice().sort((a, b) => score(b) - score(a));
  const best = ranked[0] || null;
  if (home) ranked.sort((a, b) => (b.feasible && b.recoveryOk) - (a.feasible && a.recoveryOk) || b.feasible - a.feasible || b.netWorthEnd - a.netWorthEnd);
  const bestFeasible = home ? (ranked.find((r) => r.feasible && r.recoveryOk) || ranked.find((r) => r.feasible) || null) : (ranked.find((r) => r.affordable && r.cashOk && r.ltvOk) || null);
  const existingInst = p.existingLoans.reduce((a, l) => a + (l.balance > 0 ? l.installment : 0), 0);
  const existingDbr = p.income > 0 ? existingInst / p.income * 100 : 0;
  // borrowing-capacity timeline from the existing loans alone (planned settlements honoured): when does room open up?
  const capTimeline = (() => {
    const H = Math.round(p.horizon * 12), ref = p.plans[0] || RE_PLAN_DEFAULTS, n = Math.max(1, Math.round(ref.lmTenure * 12)), r = reEffRate(p, ref.lmRate, n);
    const ls = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { bal: l.balance, inst: Math.max(l.installment, rePmt(l.balance, l.rate, left)), rate: l.rate, settleAt: l.settleAt }; });
    const rows = []; let prev = null;
    for (let t = 0; t <= Math.min(H, 120); t++) {
      if (t >= 1) ls.forEach((l) => { if (l.bal <= 0.5) return; if (l.settleAt && t === Math.round(l.settleAt)) { l.bal = 0; return; } const i = l.bal * l.rate / 100 / 12; const pay = Math.min(l.bal + i, l.inst); l.bal -= pay - i; });
      const inst = ls.reduce((a, l) => a + (l.bal > 0.5 ? l.inst : 0), 0);
      const room = Math.max(0, p.income * p.dbrCap / 100 - inst), single = Math.min(room, p.income * p.perLoanCap / 100);
      const key = Math.round(inst);
      if (key !== prev) { rows.push({ t, inst, room, maxOneLoan: rePrincipalFor(single, r, n), maxAllLoans: rePrincipalFor(room, r, n) }); prev = key; }
    }
    return rows;
  })();
  const household = { existingInst, existingDbr, dbrRoom: Math.max(0, p.income * p.dbrCap / 100 - existingInst), perLoanRoom: p.income * p.perLoanCap / 100, savings: p.income - p.livingExpenses - p.rentNow - existingInst, capTimeline };
  // renter path is common to all options (same rent, same alt return) — take it from any live option
  const renter = live[0] ? live[0].months.map((m) => ({ t: m.t, rentEq: m.rentEq })) : [];
  let verdict, vColor;
  if (!best) { verdict = "NO OPTION"; vColor = C.sub; }
  else if (home) {
    if (best.advantage > 0) { verdict = "OWNING WINS"; vColor = C.pos; } else { verdict = "RENTING WINS"; vColor = C.neg; }
  } else {
    const i = best.irr == null ? -1 : best.irr * 100;
    if (i >= 12) { verdict = "ATTRACTIVE"; vColor = C.pos; } else if (i >= p.discountRate) { verdict = "ACCEPTABLE"; vColor = C.brass; } else { verdict = "WEAK"; vColor = C.neg; }
  }
  return { p, prj, results, live, ranked, best, bestFeasible, renter, verdict, vColor, household };
}

// one-way sensitivity (±20%) on the headline metric of one option
function tornadoRE(inp, idx) {
  const p = mergeRE(inp);
  const home = p.mode === "home";
  const metric = (m) => { const r = m.results[idx]; if (!r) return 0; return home ? r.advantage : (r.irr == null ? 0 : r.irr * 100); };
  const base = metric(computeRE(p));
  const build = p.acquire === "build";
  const drivers = [
    build ? ["Construction cost / m²", "buildCost"] : ["Property price", "propertyPrice"],
    build ? ["Land price / m²", "landPrice"] : null,
    ["Financing rates (all)", "__rate"],
    ["Appreciation", "appreciation"],
    home ? ["Rent of equivalent home", "rentNow"] : ["Rent achieved", "rentMo"],
    home ? ["Alternative return on cash", "altReturn"] : ["Vacancy", "vacancyPct"],
    home ? ["Your income", "income"] : null,
    build ? ["Construction duration", "buildMonths"] : null,
  ].filter(Boolean);
  const vary = (k, f) => {
    if (k === "__rate") return { ...p, options: p.options.map((o) => ({ ...o, rate: o.rate * f })), plans: p.plans.map((o) => ({ ...o, lmRate: o.lmRate * f, plRate: o.plRate * f, eqRate: o.eqRate * f, coRate: o.coRate * f })) };
    return { ...p, [k]: p[k] * f };
  };
  return drivers.map(([label, k]) => {
    const a = metric(computeRE(vary(k, 0.8))) - base, b = metric(computeRE(vary(k, 1.2))) - base;
    return { label, lo: Math.min(a, b), hi: Math.max(a, b), swing: Math.abs(b - a) };
  }).sort((x, y) => y.swing - x.swing);
}

// run one strategy at every construction-start month to find the best time to build
function timingSweepRE(inp, idx, maxDelay, step, landWithBuild) {
  const p = mergeRE(inp);
  maxDelay = maxDelay == null ? 48 : maxDelay; step = step || 3;
  const rows = [];
  for (let d = 0; d <= maxDelay; d += step) {
    const q = { ...p, buildStart: d, landMonth: landWithBuild ? d : Math.min(p.landMonth || 0, d) };
    const m = computeRE(q); const r = m.results[idx];
    if (!r) continue;
    rows.push({ delay: d, feasible: r.feasible, recoveryOk: r.recoveryOk, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, peakDbr: r.peakDbr, peakInst: r.peakInst, mortgage: r.lm.amount, eq: r.eq.amount, pl: r.pl.amount, co: r.co.amount, newDebt: r.newDebtTotal, settled: r.settledTotal, newDebtInterest: r.newDebtInterest, netWorth: r.netWorthEnd, advantage: r.advantage, total: m.prj.total, occupy: m.prj.occupy, bufferOk: r.minCash >= p.cashBuffer });
  }
  // "best" = the EARLIEST start that is executable AND gets cash back to the buffer within your recovery window (fallback: earliest executable)
  const ok = rows.filter((r) => r.feasible);
  const best = ok.find((r) => r.recoveryOk) || ok[0] || null;
  return { rows, best };
}
