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
  softPct: 8, contPct: 7, finishExtra: 150000, // design/permits/supervision %, contingency %, kitchen/AC/landscape SAR
  buildMonths: 18, devMarginPct: 10,       // construction duration; market value uplift of a self-built home over its cost
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
  plCap: 1500000,          // bank ceiling on a single personal loan
  cashoutLtv: 70,          // max LTV for a mortgage raised against an owned, completed home ("cash-out")
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

/* ---------- home-mode STRATEGIES: time-phased financing plans ----------
   A plan sequences three kinds of debt action over the build:
     mortgageWhen  "start"      construction mortgage at month 0, drawn after your cash share (cashInPct of cost) is spent
                   "completion" cash-out mortgage against the finished home (cashoutLtv × value), proceeds go to your cash
                   "none"
     plWhen        "start" | "completion" | "month" (plMonth) | "none"   — a personal loan whose proceeds go to your cash
     settlePolicy  "none"      never settle existing loans
                   "asNeeded"  before each new facility, settle existing loans (and an earlier personal loan) just enough to pass the bank's DBR test
                   "all"       settle every existing loan before the first new facility
   Every facility is sized down to what the bank's debt-burden ratio (dbrCap × income) and LTV allow, and the plan reports it. */
const RE_PLAN_PRESETS = {
  mortgageFirst: { name: "Mortgage now → personal loan later to recover cash",
    mortgageWhen: "start", cashInPct: 20, rate: 5.5, tenure: 25, graceMode: "capitalize", subsidyCap: 500000, subsidyPct: 100, feesPct: 1, maxLtvPct: 90,
    cashOutTarget: 0, plWhen: "completion", plMonth: 24, plAmount: 400000, plRate: 7.5, plTenure: 5, settlePolicy: "asNeeded", extraMo: 0 },
  cashThenMortgage: { name: "Cash + personal loan now → mortgage the finished home to recover cash",
    mortgageWhen: "completion", cashInPct: 100, rate: 6.0, tenure: 20, graceMode: "capitalize", subsidyCap: 0, subsidyPct: 0, feesPct: 1, maxLtvPct: 90,
    cashOutTarget: 0, plWhen: "start", plMonth: 0, plAmount: 400000, plRate: 7.5, plTenure: 5, settlePolicy: "asNeeded", extraMo: 0 },
  mortgageOnly: { name: "Mortgage now · no personal loan",
    mortgageWhen: "start", cashInPct: 10, rate: 5.5, tenure: 25, graceMode: "capitalize", subsidyCap: 500000, subsidyPct: 100, feesPct: 1, maxLtvPct: 90,
    cashOutTarget: 0, plWhen: "none", plMonth: 24, plAmount: 0, plRate: 7.5, plTenure: 5, settlePolicy: "asNeeded", extraMo: 0 },
  settleAllFirst: { name: "Clear all existing loans, then mortgage",
    mortgageWhen: "start", cashInPct: 10, rate: 5.5, tenure: 25, graceMode: "capitalize", subsidyCap: 500000, subsidyPct: 100, feesPct: 1, maxLtvPct: 90,
    cashOutTarget: 0, plWhen: "none", plMonth: 24, plAmount: 0, plRate: 7.5, plTenure: 5, settlePolicy: "all", extraMo: 0 },
  allCash: { name: "All cash · no new borrowing",
    mortgageWhen: "none", cashInPct: 100, rate: 5.5, tenure: 25, graceMode: "capitalize", subsidyCap: 0, subsidyPct: 0, feesPct: 0, maxLtvPct: 90,
    cashOutTarget: 0, plWhen: "none", plMonth: 24, plAmount: 0, plRate: 7.5, plTenure: 5, settlePolicy: "none", extraMo: 0 },
};
RE_BASE.plans = [
  { enabled: true, ...RE_PLAN_PRESETS.mortgageFirst },
  { enabled: true, ...RE_PLAN_PRESETS.cashThenMortgage },
  { enabled: true, ...RE_PLAN_PRESETS.mortgageOnly },
  { enabled: true, ...RE_PLAN_PRESETS.settleAllFirst },
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
  p.plans = (inp && inp.plans ? inp.plans : RE_BASE.plans).map((o, i) => ({ ...RE_BASE.plans[i] || RE_PLAN_PRESETS.mortgageOnly, ...o }));
  p.existingLoans = (inp && inp.existingLoans ? inp.existingLoans : RE_BASE.existingLoans).map((l, i) => ({ id: i + 1, name: `Loan ${i + 1}`, balance: 0, installment: 0, monthsLeft: 0, rate: 6, ...l }));
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
  const land = build ? p.landArea * p.landPrice : 0;
  const price = build ? 0 : p.propertyPrice;
  const hard = build ? p.builtArea * p.buildCost : 0;
  const soft = hard * p.softPct / 100;
  const cont = (hard + soft) * p.contPct / 100;
  const finish = p.finishExtra;
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
  const occupy = bm + 1; // first month of living in / letting
  // monthly spend schedule, index = month
  const schedule = new Array(bm + 1).fill(0);
  if (build) {
    schedule[0] = land + rett;
    const perMo = (hard + soft + cont + vatConstr) / bm;
    for (let t = 1; t <= bm; t++) schedule[t] += perMo;
    schedule[bm] += finish + vatFinish;
  } else {
    schedule[0] = price + rett + broker + finish + vatFinish;
  }
  return { build, land, price, hard, soft, cont, finish, vat: vatConstr + vatFinish, broker, rett, rettExempt: exempt, total, value0, bm, occupy, schedule,
    costPerSqm: build && p.builtArea > 0 ? (total - land - rett) / p.builtArea : 0 };
}

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
  const gm = prj.build ? Math.max(opt.graceMonths, prj.bm) : Math.max(0, opt.graceMonths);
  const rateS = opt.rate * (1 - Math.min(100, opt.subsidyPct) / 100), rateU = opt.rate;
  const n = Math.max(1, Math.round(opt.tenure * 12));
  const plN = Math.max(1, Math.round(opt.plTenure * 12));
  const plPmt = pl > 0 ? rePmt(pl, opt.plRate, plN) : 0;
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
    if (t === 0) {
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
      plInterest = balPL * opt.plRate / 100 / 12;
      plPayment = Math.min(plPmt, balPL + plInterest);
      balPL -= plPayment - plInterest;
    }
    const mortgagePayment = payment;
    payment += plPayment; interest += plInterest; principal += plPayment - plInterest;
    const bal = balS + balU + balPL;
    // property value path (continuous through construction)
    const built = prj.build ? Math.min(1, t / prj.bm) : 1;
    const value = (prj.land + (prj.value0 - prj.land) * built) * Math.pow(1 + g, t / 12);
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

/* ---------- home mode: month-by-month household cash simulation of one strategy ---------- */
function rePlanSimulate(p, prj, plan) {
  const H = Math.round(p.horizon * 12);
  const g = p.appreciation / 100, alt = Math.pow(1 + p.altReturn / 100, 1 / 12) - 1;
  const dbrTarget = p.income * p.dbrCap / 100;           // max total monthly instalments the bank accepts
  const feeMonths = Math.max(0, p.settleFeeMonths);
  const events = [], flags = [];
  // existing loans (cloned, live state)
  // instalment is floored at the annuity that clears the balance within the stated months (guards inconsistent inputs)
  const loans = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { ...l, bal: l.balance, left, installment: Math.max(l.installment, rePmt(l.balance, l.rate, left)), settledAt: null, interestPaid: 0, kind: "existing" }; });
  // new personal loan
  const pl = { bal: 0, pmt: 0, rate: plan.plRate, n: Math.max(1, Math.round(plan.plTenure * 12)), startedAt: null, settledAt: null, amount: 0, requested: 0, interestPaid: 0, kind: "pl", name: "New personal loan" };
  // mortgage (two buckets: subsidised / unsubsidised)
  const n = Math.max(1, Math.round(plan.tenure * 12));
  const rateS = plan.rate * (1 - Math.min(100, plan.subsidyPct) / 100), rateU = plan.rate;
  const mg = { type: null, commit: 0, drawn: 0, balS: 0, balU: 0, pmtS: 0, pmtU: 0, amortFrom: null, startedAt: null, gm: 0, interestPaid: 0, graceInterest: 0, fees: 0, requested: 0, capped: null, dbrAt: null, ltv: 0 };
  const instOf = (B, rS, rU, nn) => rePmt(Math.min(B, plan.subsidyCap), rS, nn) + rePmt(Math.max(0, B - plan.subsidyCap), rU, nn);
  const mgInstFor = (B) => instOf(B, rateS, rateU, n);
  const settleCost = (l) => { const r = l.rate / 100 / 12; const left = l.kind === "pl" ? Math.max(0, l.n - (l.monthsPaid || 0)) : Math.max(0, l.left); return l.bal + l.bal * r * Math.min(feeMonths, left); };
  const activeExisting = () => loans.filter((l) => l.settledAt === null && l.bal > 0.5);
  const otherInst = (t) => activeExisting().reduce((a, l) => a + l.installment, 0) + (pl.bal > 0.5 && pl.settledAt === null ? pl.pmt : 0);
  const mgInstNow = () => mg.type ? (mg.amortFrom !== null && mg.pmtS + mg.pmtU > 0 ? mg.pmtS + mg.pmtU : mgInstFor(mg.commit)) : 0; // bank counts the future instalment during grace

  let cash = p.cashAvailable, rCash = p.cashAvailable;  // owner cash vs. renter cash (same income, same living costs)
  // renter keeps paying the existing loans untouched — precompute that schedule so owner-side settlements don't leak into the renter path
  const renterInst = new Array(H + 1).fill(0);
  // an existing loan pays its instalment until cleared
  const loanPay = (bal, i, inst, left) => Math.min(bal + i, inst);
  loans.forEach((l) => { let bal = l.bal, left = l.left; for (let t = 1; t <= H && bal > 0.5; t++) { const i = bal * l.rate / 100 / 12; const pay = loanPay(bal, i, l.installment, left); bal -= pay - i; left--; renterInst[t] += pay; } });
  let recoveredGross = null;
  let cumEquity = 0, equityRequired = prj.total;         // equity the owner must fund before mortgage draws
  let minCash = Infinity, minCashT = 0, belowBufferMonths = 0, shortfall = 0;
  let settledTotal = 0, settleFees = 0, recovered = null, recoveredT = null, debtFreeT = null, breakEvenMonth = null;
  const months = [];
  const yearOf = (t) => Math.max(0, Math.ceil(t / 12));

  // settle existing loans (and an earlier personal loan) until instalments fit under `room`; pays from cash
  function settleToFit(t, room, reason) {
    const pool = () => activeExisting().concat(pl.bal > 0.5 && pl.settledAt === null ? [pl] : []);
    if (plan.settlePolicy === "all") {
      pool().forEach((l) => doSettle(l, t, "clear all debt before the new facility"));
      return;
    }
    if (plan.settlePolicy !== "asNeeded") return;
    let guard = 0;
    while (otherInst(t) > room && pool().length && guard++ < 20) {
      // best DBR relief per riyal of cash
      const pick = pool().slice().sort((a, b) => (b.kind === "pl" ? b.pmt : b.installment) / settleCost(b) - (a.kind === "pl" ? a.pmt : a.installment) / settleCost(a))[0];
      doSettle(pick, t, reason);
    }
  }
  function doSettle(l, t, reason) {
    const cost = settleCost(l), fee = cost - l.bal;
    cash -= cost; settledTotal += l.bal; settleFees += fee;
    l.settledAt = t; const inst = l.kind === "pl" ? l.pmt : l.installment; l.bal = 0;
    events.push({ t, kind: "settle", text: `Settle ${l.name}: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — frees ${fSAR(inst)}/mo. ${reason}.` });
  }
  function originateMortgage(t, type) {
    const value = valueAt(t);
    let req, cap;
    if (type === "construction") { req = Math.max(0, prj.total * (1 - plan.cashInPct / 100)); cap = prj.total * plan.maxLtvPct / 100; }
    else { cap = value * p.cashoutLtv / 100; req = plan.cashOutTarget > 0 ? plan.cashOutTarget : cap; }
    let amount = Math.min(req, cap);
    const ltvCapped = amount < req - 1;
    const cashBefore = cash;
    // cash-out proceeds land first so settlements can be paid from them
    if (type === "cashout") { cash += amount; }
    settleToFit(t, dbrTarget - mgInstFor(amount), "to pass the bank's debt-burden test for the mortgage");
    const room = dbrTarget - otherInst(t);
    const dbrBefore = (otherInst(t) + mgInstFor(amount)) / p.income * 100;
    let dbrCapped = false;
    if (mgInstFor(amount) > room + 0.01) {
      // shrink to what DBR allows (binary search on amount)
      let lo = 0, hi = amount;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (mgInstFor(mid) <= room) lo = mid; else hi = mid; }
      if (type === "cashout") cash -= amount - lo;
      amount = Math.max(0, lo); dbrCapped = true;
    }
    const fees = amount * plan.feesPct / 100; cash -= fees;
    mg.type = type; mg.commit = amount; mg.requested = req; mg.fees = fees; mg.startedAt = t; mg.ltv = type === "construction" ? amount / prj.total * 100 : amount / value * 100;
    mg.capped = dbrCapped ? "dbr" : ltvCapped ? "ltv" : null;
    mg.dbrAt = (otherInst(t) + mgInstFor(amount)) / p.income * 100;
    if (type === "construction") {
      equityRequired = prj.total - amount;
      mg.gm = Math.max(0, prj.bm); mg.amortFrom = mg.gm + 1;
      events.push({ t, kind: "mortgage", text: `Construction mortgage approved: ${fS(amount)} at ${plan.rate}% over ${plan.tenure} yrs (${mg.ltv.toFixed(0)}% LTV, instalment ${fSAR(mgInstFor(amount))}/mo from month ${mg.amortFrom}; bank DBR ${mg.dbrAt.toFixed(0)}%)${dbrCapped ? ` — REDUCED from ${fS(req)} by the ${p.dbrCap}% debt-burden cap` : ltvCapped ? ` — capped by ${plan.maxLtvPct}% LTV` : ""}. Your cash funds the first ${fS(equityRequired)}.` });
    } else {
      mg.balS = Math.min(amount, plan.subsidyCap); mg.balU = amount - mg.balS; mg.drawn = amount;
      mg.pmtS = rePmt(mg.balS, rateS, n); mg.pmtU = rePmt(mg.balU, rateU, n); mg.amortFrom = t + 1; mg.gm = t;
      events.push({ t, kind: "mortgage", text: `Cash-out mortgage on the finished home: ${fS(amount)} at ${plan.rate}% over ${plan.tenure} yrs (${mg.ltv.toFixed(0)}% of its ${fS(value)} value; instalment ${fSAR(mg.pmtS + mg.pmtU)}/mo; bank DBR ${mg.dbrAt.toFixed(0)}%)${dbrCapped ? ` — REDUCED from ${fS(req)} by the ${p.dbrCap}% debt-burden cap` : ""}.` });
      if (recovered === null) { recovered = cash - cashBefore; recoveredGross = amount; recoveredT = t; }
    }
    if (amount <= 0) flags.push(`Mortgage impossible at month ${t}: no debt-burden room even after settlements.`);
    else if (dbrCapped) flags.push(`Mortgage cut to ${fS(amount)} (asked ${fS(req)}) by the ${p.dbrCap}% debt-burden cap.`);
  }
  function originatePL(t) {
    const req = Math.max(0, plan.plAmount);
    if (req <= 0) return;
    const cashBefore = cash;
    settleToFit(t, dbrTarget - mgInstNow() - rePmt(req, plan.plRate, pl.n), "to pass the bank's debt-burden test for the personal loan");
    const room = dbrTarget - otherInst(t) - mgInstNow();
    const byDbr = rePrincipalFor(room, plan.plRate, pl.n);
    const amount = Math.max(0, Math.min(req, p.plCap, byDbr));
    if (amount < 1) { events.push({ t, kind: "pl", text: `Personal loan of ${fS(req)} NOT possible: instalments already use ${((otherInst(t) + mgInstNow()) / p.income * 100).toFixed(0)}% of income (cap ${p.dbrCap}%).` }); flags.push(`Personal loan at month ${t} not possible under the debt-burden cap.`); pl.requested = req; return; }
    pl.bal = amount; pl.amount = amount; pl.requested = req; pl.pmt = rePmt(amount, plan.plRate, pl.n); pl.startedAt = t; pl.monthsPaid = 0; pl.settledAt = null;
    cash += amount;
    const dbr = (otherInst(t) + mgInstNow()) / p.income * 100;
    events.push({ t, kind: "pl", text: `Personal loan ${fS(amount)} at ${plan.plRate}% over ${plan.plTenure} yrs (instalment ${fSAR(pl.pmt)}/mo; bank DBR ${dbr.toFixed(0)}%)${amount < req - 1 ? ` — REDUCED from ${fS(req)}: that is all the ${p.dbrCap}% debt-burden cap allows` : ""}.` });
    if (amount < req - 1) flags.push(`Personal loan cut to ${fS(amount)} (asked ${fS(req)}) by the debt-burden cap.`);
    if (t > 0 && recovered === null) { recovered = cash - cashBefore; recoveredGross = amount; recoveredT = t; }
  }
  function valueAt(t) { const built = prj.build ? Math.min(1, t / prj.bm) : 1; return (prj.land + (prj.value0 - prj.land) * built) * Math.pow(1 + g, t / 12); }

  const plMonth = plan.plWhen === "start" ? 0 : plan.plWhen === "completion" ? prj.occupy : plan.plWhen === "month" ? Math.max(0, Math.round(plan.plMonth)) : -1;
  for (let t = 0; t <= H; t++) {
    const yrIdx = Math.floor(Math.max(0, t - 1) / 12);
    const occupied = t >= prj.occupy;
    const rentEq = t >= 1 ? p.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx) : 0;
    const rentPaid = t >= 1 && !occupied ? rentEq : 0;
    // household flows
    if (t >= 1) { cash = cash * (1 + alt) + p.income - p.livingExpenses - rentPaid; rCash = rCash * (1 + alt) + p.income - p.livingExpenses - rentEq; }
    // ---- events (order: personal loan first if both at the same month, so a cash-out mortgage can settle it) ----
    if (plan.plWhen !== "none" && t === plMonth && plan.mortgageWhen !== "start") originatePL(t);
    if (plan.mortgageWhen === "start" && t === 0) originateMortgage(t, "construction");
    if (plan.mortgageWhen === "completion" && t === prj.occupy) originateMortgage(t, "cashout");
    if (plan.plWhen !== "none" && t === plMonth && plan.mortgageWhen === "start") originatePL(t);
    if (t === prj.occupy && prj.build) events.push({ t, kind: "milestone", text: `Construction complete — move in. Rent stops; upkeep starts.` });
    // ---- project spend: owner cash first (up to equityRequired), then mortgage draws ----
    const spend = prj.schedule[t] || 0;
    const eq = Math.min(spend, Math.max(0, equityRequired - cumEquity)); cumEquity += eq;
    const draw = spend - eq;
    cash -= eq;
    if (draw > 0) { const toS = Math.max(0, Math.min(draw, plan.subsidyCap - mg.balS)); mg.balS += toS; mg.balU += draw - toS; mg.drawn += draw; }
    // ---- existing loans ----
    let existInst = 0, existInterest = 0;
    if (t >= 1) loans.forEach((l) => {
      if (l.settledAt !== null || l.bal <= 0.5) return;
      const i = l.bal * l.rate / 100 / 12;
      const pay = loanPay(l.bal, i, l.installment, l.left);
      l.bal -= pay - i; l.left -= 1; l.interestPaid += i; existInst += pay; existInterest += i;
    });
    // ---- new personal loan ----
    let plPay = 0, plInt = 0;
    if (t >= 1 && pl.bal > 0.5 && pl.settledAt === null && pl.startedAt !== null && t > pl.startedAt) {
      plInt = pl.bal * pl.rate / 100 / 12; plPay = Math.min(pl.pmt, pl.bal + plInt); pl.bal -= plPay - plInt; pl.interestPaid += plInt; pl.monthsPaid = (pl.monthsPaid || 0) + 1;
    }
    // ---- mortgage ----
    let mgPay = 0, mgInt = 0;
    if (mg.type && t >= 1 && t > mg.startedAt) {
      const iS = mg.balS * rateS / 100 / 12, iU = mg.balU * rateU / 100 / 12; mgInt = iS + iU;
      if (t < mg.amortFrom) { // grace (construction only)
        if (plan.graceMode === "interestOnly") mgPay = mgInt; else { mg.balS += iS; mg.balU += iU; }
        mg.graceInterest += mgInt;
      } else {
        if (mg.pmtS + mg.pmtU === 0 || (t === mg.amortFrom && mg.type === "construction")) { mg.pmtS = rePmt(mg.balS, rateS, n); mg.pmtU = rePmt(mg.balU, rateU, n); }
        let payS = Math.min(mg.pmtS, mg.balS + iS), payU = Math.min(mg.pmtU, mg.balU + iU);
        let prS = payS - iS, prU = payU - iU;
        let extra = Math.max(0, plan.extraMo);
        const xU = Math.min(extra, mg.balU - prU); prU += xU; extra -= xU;
        const xS = Math.min(extra, mg.balS - prS); prS += xS;
        mg.balS -= prS; mg.balU -= prU; mgPay = mgInt + prS + prU;
      }
      mg.interestPaid += mgInt;
    }
    const value = valueAt(t);
    const ownerCost = occupied ? value * p.maintPct / 100 / 12 + p.insurance / 12 : 0;
    cash -= existInst + plPay + mgPay + ownerCost;
    rCash -= renterInst[t];
    // ---- state ----
    const debtExisting = loans.reduce((a, l) => a + (l.settledAt === null ? l.bal : 0), 0);
    const debtMortgage = mg.balS + mg.balU, debtPL = pl.settledAt === null ? pl.bal : 0;
    const debt = debtExisting + debtMortgage + debtPL;
    const instTotal = existInst + plPay + (t >= (mg.amortFrom || Infinity) ? mgPay : (plan.graceMode === "interestOnly" ? mgPay : 0));
    const liqValue = value * (1 - p.sellCostPct / 100);
    const netWorth = cash + liqValue - debt, renterNW = rCash;
    const advantage = netWorth - renterNW;
    if (cash < minCash) { minCash = cash; minCashT = t; }
    if (cash < p.cashBuffer) belowBufferMonths++;
    if (cash < 0) shortfall = Math.max(shortfall, -cash);
    if (occupied && breakEvenMonth === null && advantage >= 0) breakEvenMonth = t;
    if (debtFreeT === null && t > 0 && debt < 0.5 && (mg.type || pl.startedAt !== null || loans.length)) debtFreeT = t;
    months.push({ t, year: yearOf(t), cash, rCash, spend, eq, draw, rentPaid, rentEq, existInst, existInterest, plPay, plInt, mgPay, mgInt, instTotal, ownerCost, value, liqValue, debt, debtExisting, debtMortgage, debtPL, netWorth, renterNW, advantage, dbr: (existInst + plPay + mgPay) / p.income * 100 });
  }
  // ---- annual roll-up ----
  const nY = yearOf(H), years = [];
  for (let y = 0; y <= nY; y++) {
    const ms = months.filter((m) => m.year === y); const sum = (k) => ms.reduce((a, m) => a + m[k], 0); const last = ms[ms.length - 1];
    years.push({ year: y, label: y === 0 ? "Y0" : `Y${y}`, spend: sum("spend"), eq: sum("eq"), rentPaid: sum("rentPaid"), rentEq: sum("rentEq"), existInst: sum("existInst"), plPay: sum("plPay"), mgPay: sum("mgPay"), interest: sum("existInterest") + sum("plInt") + sum("mgInt"), ownerCost: sum("ownerCost"),
      cash: last.cash, rCash: last.rCash, debt: last.debt, debtMortgage: last.debtMortgage, debtPL: last.debtPL, debtExisting: last.debtExisting, value: last.value, netWorth: last.netWorth, renterNW: last.renterNW, advantage: last.advantage,
      instMo: (sum("existInst") + sum("plPay") + sum("mgPay")) / (y === 0 ? 1 : 12) });
  }
  const end = months[H];
  const totalInterest = mg.interestPaid + pl.interestPaid + loans.reduce((a, l) => a + l.interestPaid, 0) + settleFees;
  const newDebtInterest = mg.interestPaid + pl.interestPaid + settleFees;
  const peakDbr = Math.max(...months.map((m) => m.dbr));
  const peakInst = Math.max(...months.map((m) => m.existInst + m.plPay + m.mgPay));
  const feasible = shortfall <= 0 && !flags.some((f) => f.startsWith("Mortgage impossible"));
  if (shortfall > 0) flags.unshift(`Cash goes NEGATIVE by ${fS(shortfall)} (lowest at month ${minCashT}) — this plan cannot be executed as set.`);
  else if (minCash < p.cashBuffer) flags.push(`Cash dips below your ${fS(p.cashBuffer)} buffer for ${belowBufferMonths} month(s) (low point ${fS(minCash)} at month ${minCashT}).`);
  events.sort((a, b) => a.t - b.t);
  return { plan, months, years, events, flags, feasible, end,
    mortgage: { ...mg, instalment: mg.pmtS + mg.pmtU || (mg.type ? mgInstFor(mg.commit) : 0) }, pl: { ...pl }, loansEnd: loans.map((l) => ({ name: l.name, settledAt: l.settledAt, bal: l.bal, interestPaid: l.interestPaid })),
    cashStart: p.cashAvailable, minCash, minCashT, belowBufferMonths, shortfall, cashAtCompletion: months[Math.min(H, prj.occupy)].cash, cashEnd: end.cash,
    recovered, recoveredGross, recoveredT, settledTotal, settleFees, totalInterest, newDebtInterest, peakDbr, peakInst, debtFreeT, breakEvenMonth,
    netWorthEnd: end.netWorth, renterEnd: end.renterNW, advantage: end.advantage, endDebt: end.debt, endValue: end.value,
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
  const bestFeasible = home ? (ranked.find((r) => r.feasible) || null) : (ranked.find((r) => r.affordable && r.cashOk && r.ltvOk) || null);
  const existingInst = p.existingLoans.reduce((a, l) => a + (l.balance > 0 ? l.installment : 0), 0);
  const existingDbr = p.income > 0 ? existingInst / p.income * 100 : 0;
  const household = { existingInst, existingDbr, dbrRoom: Math.max(0, p.income * p.dbrCap / 100 - existingInst), savings: p.income - p.livingExpenses - p.rentNow - existingInst };
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
    if (k === "__rate") return { ...p, options: p.options.map((o) => ({ ...o, rate: o.rate * f })), plans: p.plans.map((o) => ({ ...o, rate: o.rate * f, plRate: o.plRate * f })) };
    return { ...p, [k]: p[k] * f };
  };
  return drivers.map(([label, k]) => {
    const a = metric(computeRE(vary(k, 0.8))) - base, b = metric(computeRE(vary(k, 1.2))) - base;
    return { label, lo: Math.min(a, b), hi: Math.max(a, b), swing: Math.abs(b - a) };
  }).sort((x, y) => y.swing - x.swing);
}
