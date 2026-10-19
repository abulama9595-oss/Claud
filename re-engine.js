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
  overrunPct: 0,                           // cost overrun on construction (build + soft + contingency + finishing): adds cost, not value
  landBrokerPct: 2.5,                      // broker fee on the land purchase (REGA default 2.5%); not part of the home's value
  buildMonths: 18, devMarginPct: 10,       // construction duration; market value uplift of a self-built home over its cost
  buildDeprPct: 2,                         // the building loses this % of its value at move-in each year (straight-line); the land keeps growing
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
  incomeGrowth: 0, livingGrowth: 0, // optional yearly growth of income and living costs (%/yr, in yearly steps); the bank's limits follow your income
  // optional, all off by default (home mode): part of the new home let while you live in it, the home you live in today,
  // and zakat on the cash you keep invested
  partRentAnnual: 0,       // annex / floor let while you live in the new home: SAR a year from the month after move-in, growing with rent growth
  ownHomePlan: "keep",     // the home you own and live in today (no rent today), from move-in: "keep" | "let" | "sell"
  ownHomeYield: 3,         // …"let": net rent, % of its value a year (the home appreciates with the market)
  ownHomeSellCostPct: 2.5, // …"sell": selling costs, % of its value (broker; add the 5% RETT if you will pay it)
  cashZakatPct: 0,         // zakat on invested cash, %/yr: the return on cash becomes (1 + return) × (1 − zakat) − 1 (a home you live in is exempt)
  // existing debt (home mode) — EXAMPLES: replace with your real loans (or import from Qist)
  existingLoans: [
    { id: 1, name: "Personal loan (example)", balance: 350000, installment: 7900, monthsLeft: 54, rate: 6.5 },
    { id: 2, name: "Car finance (example)",   balance: 95000,  installment: 2950, monthsLeft: 36, rate: 5.0 },
  ],
  settleFeeMonths: 3,      // SAMA: early-settlement cost capped at the next 3 months' term cost
  rateQuote: "apr",        // how NEW-facility rates are entered: "apr" (reducing balance) or "flat" (KSA "hamish" per year on the original principal)
  // bank terms: ONE set per loan type, used by every strategy and by the optimizer (rates as quoted, see rateQuote)
  lmRate: 4.5, lmTenure: 18, lmFeesPct: 1, // mortgage that buys the new land (or the ready home), paid to the seller
  eqRate: 4.5, eqTenure: 18, eqFeesPct: 1, // mortgage on the property you already own
  plRate: 4.0, plTenure: 5,                // personal loans (at build start and at completion)
  coRate: 4.5, coTenure: 18, coFeesPct: 1, // cash-out mortgage on the finished home
  plCap: 3000000,          // bank product ceiling on a single personal loan (the 33%-of-income rule usually binds first)
  perLoanCap: 33,          // one PERSONAL LOAN's instalment may not exceed this % of income (a second personal loan may use what is left of the bucket)
  mortgageCap: 55,         // a MORTGAGE's instalments (land purchase, existing property, cash-out) may not exceed this % of income
  landLtv: 90,             // max LTV when the bank finances the land purchase (cash-raising mortgages: 70%)
  recoveryMonths: 24,      // your rule: cash must be back at the buffer within this many months after move-in
  refiMinMonths: 12,
  rentOutPct: 0,           // let the new home out: annual rent as % of the all-in project cost (0 = you live in it)
  rentOutFixed: 0,         // …or a fixed annual rent in SAR (overrides the % when above zero)       // a personal loan can only be refinanced (bought out) once it has run this many months; mortgages never are
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
   Every facility is taken at the bank's MAXIMUM that month (your rule; the engine still accepts "need"/"fixed" internally,
   but mergeRE and the simulation always use "max"). Think of dbrCap × income as ONE
   BUCKET of instalment capacity: every amount is capped by the smaller of LTV, the product cap, what is left of the
   bucket that month (dbrCap × income − every instalment still running) and the facility's own ceiling inside the
   bucket (mortgageCap for any mortgage; perLoanCap per personal loan, ×2 when plSplit allows a second personal loan). Timing words: start = month 0,
   land = month the land is bought, build = month construction starts, completion = move-in, month = a month you choose.
   settlePolicy: "none" | "asNeeded" (settle existing loans, best relief per riyal, only when the funding gap exceeds
   what the bank allows — ONLY for a mortgage; a personal loan never triggers a cash payoff). Legacy "all" = "asNeeded". */
const RE_PLAN_DEFAULTS = {
  lmUse: false, lmMode: "max", lmAmount: 0,
  eqWhen: "none", eqMonth: 0, eqMode: "max", eqAmount: 0,
  plWhen: "none", plMonth: 0, plMode: "max", plAmount: 0,
  coUse: false, coMode: "max", coAmount: 0,
  settlePolicy: "asNeeded", extraMo: 0,
  plSplit: true, // the personal-loan maximum may be taken as two personal loans (each ≤ perLoanCap, together within the bucket)
  // REFINANCE (bank buy-out of personal loans): the bank lends its maximum as new personal loan(s) (≤ perLoanCap each, up to two),
  // pays off the old personal loans directly and pays you the rest. Mortgages are never refinanced. Rate & tenure = the personal loan's.
  rfWhen: "none", rfMonth: 0,
  // which old personal loans the bank buys out when a personal loan is taken: "auto" (best value, falling back to the most
  // cash when the value choice makes the plan fail), "value", "cash" (most cash in hand) or "pick" (refiPick: { pl: [ids], pl2: [ids] })
  refiMode: "auto", refiPick: null,
  prepayAfter: null, // pay off the mortgages early from your cash this many months after move-in (null = never)
  pl2Use: false, // a second personal-loan step at completion (bank max, refinancing older personal loans automatically)
};
// your rule: EVERY new loan (mortgage, personal loan, cash-out, refinance) is taken at the bank's maximum that month.
const RE_PLAN_PRESETS = {
  landMortgage: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) · cash for the build",
    lmUse: true },
  landPlusOwned: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) + mortgage my existing property (max) at build start",
    lmUse: true, eqWhen: "build" },
  ownedOnly: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property (max) at the start · no mortgage on the new land",
    eqWhen: "start" },
  ownedAtLand: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property (max) when the land is bought · land in cash",
    eqWhen: "land" },
  cashPlusPersonal: { ...RE_PLAN_DEFAULTS, name: "Cash + personal loan(s) (max) when the land is bought · no mortgage",
    plWhen: "land" },
  landPlusPersonal: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) + personal loan(s) (max) at build start",
    lmUse: true, plWhen: "build" },
  landThenCashOut: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) → cash-out (max) on the finished home",
    lmUse: true, coUse: true },
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

/* ---------- bank terms per loan type ----------
   Older scenarios kept rates per strategy. They are read once into the shared terms: each loan type takes the terms of the
   first ENABLED strategy that uses it (then any strategy that uses it, then Strategy 1); differences are reported so the
   page can say what changed. */
const RE_TERM_KEYS = { lm: ["lmRate", "lmTenure", "lmFeesPct"], eq: ["eqRate", "eqTenure", "eqFeesPct"], pl: ["plRate", "plTenure"], co: ["coRate", "coTenure", "coFeesPct"] };
const reLoanUsed = {
  lm: (o) => !!o.lmUse,
  eq: (o) => !!o.eqWhen && o.eqWhen !== "none",
  pl: (o) => (!!o.plWhen && o.plWhen !== "none") || !!o.pl2Use || (!!o.rfWhen && o.rfWhen !== "none"),
  co: (o) => !!o.coUse,
};
function reTermsFromPlans(plans) {
  // legacy (v1) plans carried one rate/tenure for "the mortgage"
  const norm = (plans || []).map((o) => { const q = { ...(o || {}) }; if (q.mortgageWhen && q.lmUse == null) { q.lmUse = q.mortgageWhen === "start"; q.coUse = q.mortgageWhen === "completion"; if (q.rate != null) q.lmRate = q.coRate = q.rate; if (q.tenure != null) q.lmTenure = q.coTenure = q.tenure; } return q; });
  const terms = {}, conflicts = [];
  for (const [loan, keys] of Object.entries(RE_TERM_KEYS)) {
    const has = (o) => keys.some((k) => o[k] != null);
    const users = norm.map((o, i) => ({ o, i })).filter(({ o }) => has(o) && reLoanUsed[loan](o));
    const src = users.find(({ o }) => o.enabled !== false) || users[0] || norm.map((o, i) => ({ o, i })).find(({ o }) => has(o)) || null;
    if (!src) continue;
    keys.forEach((k) => { if (src.o[k] != null) terms[k] = src.o[k]; });
    const differ = users.filter(({ o }) => o.enabled !== false && keys.some((k) => o[k] != null && o[k] !== src.o[k]));
    if (differ.length) conflicts.push({ loan, from: src.i, kept: Object.fromEntries(keys.map((k) => [k, src.o[k]])), others: differ.map(({ o, i }) => ({ plan: i, ...Object.fromEntries(keys.map((k) => [k, o[k]])) })) });
  }
  return { terms, conflicts };
}

function mergeRE(inp) {
  const p = { ...RE_BASE, ...inp };
  // one set of bank terms per loan type: migrate an older scenario once, from its raw strategies; shared terms you already
  // have are never overwritten, and merging again changes nothing
  if (inp && inp.plans && inp.termsV == null) { const { terms } = reTermsFromPlans(inp.plans); for (const [k, v] of Object.entries(terms)) if (inp[k] == null) p[k] = v; }
  p.termsV = 1;
  p.options = (inp && inp.options ? inp.options : RE_BASE.options).map((o, i) => ({ ...RE_BASE.options[i] || RE_OPTION_PRESETS.bank, ...o }));
  p.plans = (inp && inp.plans ? inp.plans : RE_BASE.plans).map((o, i) => {
    const q = { ...RE_PLAN_DEFAULTS, ...(RE_BASE.plans[i] || RE_PLAN_PRESETS.landMortgage), ...o };
    // legacy (v1) plan fields → v2 facilities
    if (o && o.mortgageWhen && o.lmUse == null) { q.lmUse = o.mortgageWhen === "start"; q.coUse = o.mortgageWhen === "completion"; if (o.rate != null) { q.lmRate = o.rate; q.coRate = o.rate; } if (o.tenure != null) { q.lmTenure = o.tenure; q.coTenure = o.tenure; } }
    // your rule: every new loan is taken at the bank's maximum — older "shortfall" / "fixed" settings are read as "max"
    q.lmMode = q.eqMode = q.plMode = q.coMode = "max";
    // refinancing is part of the personal loan now: an old separate "refinance" step becomes the personal loan at that time
    if (q.rfWhen && q.rfWhen !== "none") { if (!q.plWhen || q.plWhen === "none") { q.plWhen = q.rfWhen; q.plMonth = q.rfMonth; } q.rfWhen = "none"; }
    return q;
  });
  p.existingLoans = (inp && inp.existingLoans ? inp.existingLoans : RE_BASE.existingLoans).map((l, i) => {
    const q = { id: i + 1, name: `Loan ${i + 1}`, balance: 0, installment: 0, monthsLeft: 0, rate: 6, canSettle: true, canRefi: true, ageMonths: null, ...l };
    // a rate quoted flat ("hamish": on the original amount, over the whole term) becomes the APR the loan amortises at;
    // the whole term is the months already paid + the months left. Marked "apr" afterwards, so merging again changes nothing.
    if (q.rateType === "flat") { q.flatRate = q.rate; q.rate = reFlatToApr(q.rate, Math.max(1, Math.round((q.ageMonths || 0) + (q.monthsLeft || 0)))); q.rateType = "apr"; }
    return q;
  });
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
  const landBroker = build ? land * (p.landBrokerPct || 0) / 100 : 0;          // paid with the land; not in value, RETT or the LTV
  const overrun = build ? (hard + soft + cont + finish) * (p.overrunPct || 0) / 100 : 0;   // extra cost only — the home is not worth more
  const vatOverrun = overrun * p.vatPct / 100;
  const rettBase = build ? land : price;
  const exempt = p.mode === "home" && p.firstHomeExempt ? Math.min(rettBase, p.rettExemptCap) : 0;
  const rett = (rettBase - exempt) * p.rettPct / 100;
  const total = land + price + rett + broker + landBroker + hard + soft + cont + finish + overrun + vatConstr + vatFinish + vatOverrun;
  const bm = build ? Math.max(1, Math.round(p.buildMonths)) : 0;
  const occupy = start + bm + 1; // first month of living in / letting
  // monthly spend schedule, index = month
  const schedule = new Array(occupy).fill(0);
  if (build) {
    schedule[landMonth] += land + rett + landBroker;
    const perMo = (hard + soft + cont + vatConstr + overrun + vatOverrun) / bm;
    for (let t = start + 1; t <= start + bm; t++) schedule[t] += perMo;
    schedule[start + bm] += finish + vatFinish;
  } else {
    schedule[landMonth] += price + rett + broker + finish + vatFinish;
  }
  // market value: nothing before the land is bought. The LAND grows with the market from the month it is bought. The
  // BUILDING is worth what it cost (construction + design + extras) × (1 + self-build uplift) — the uplift is on what you
  // build, not the land — accruing with progress during construction, then losing buildDeprPct % of that value a year from
  // completion (straight-line, never below 0). VAT, RETT, fees, contingency and overruns add no value. A ready home bought
  // as such keeps price + finishing growing with the market (its land/building split is unknown); readyParts (internal)
  // values a ready villa like the home you would build: the same land, and a building that already stands.
  const dep = Math.max(0, p.buildDeprPct == null ? 0 : p.buildDeprPct) / 100;
  const done = build ? start + bm : landMonth;                    // the month the building is complete
  const buildValue = build ? (hard + soft + finish) * (1 + p.devMarginPct / 100) : 0;
  const ready = !build && p.readyParts ? p.readyParts : null;
  const valueAt = (t) => {
    if (t < landMonth) return 0;
    const yrs = (t - landMonth) / 12;
    if (build) return land * Math.pow(1 + g, yrs) + buildValue * Math.min(1, Math.max(0, (t - start) / bm)) * Math.max(0, 1 - dep * Math.max(0, t - done) / 12);
    if (ready) return ready.land * Math.pow(1 + g, yrs) + ready.building * Math.max(0, 1 - dep * yrs);
    return (price + finish) * Math.pow(1 + g, yrs);
  };
  return { build, land, landToday, price, hard, soft, cont, finish, overrun, vat: vatConstr + vatFinish + vatOverrun, broker, landBroker, rett, rettExempt: exempt, total, value0: valueAt(occupy - 1), buildValue, landValueAt: (t) => t < landMonth ? 0 : (ready ? ready.land : build ? land : price + finish) * Math.pow(1 + g, (t - landMonth) / 12), bm, occupy, start, landMonth, inflate, schedule, valueAt,
    builtArea, costPerSqm: build && builtArea > 0 ? (total - land - rett - landBroker) / builtArea : 0 };
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
    // spend paid from the personal loan is inside eq and its repayments are inside cf, so its proceeds count as an inflow at month 0
    let lev = -(eq + upfront) + cf + (t === 0 ? pl : 0), unlev = -spend + noi - zakat;
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
    const fullYears = years.filter((y) => y.year >= 1 && y.year * 12 >= prj.occupy + 11 && y.year < nY); // stabilised full years (a year counts once its first month is at or after move-in), excl. exit year
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
// early-settlement cost (SAMA cap): the balance plus the next min(feeMonths, months left) months' profit on the DECLINING balance
function reSettleCost(bal, rateApr, inst, left, feeMonths) {
  const r = rateApr / 100 / 12;
  let b = bal, fee = 0;
  for (let k = 0; k < Math.min(feeMonths, left) && b > 0.5; k++) { const i = b * r; fee += i; b -= Math.min(b + i, inst) - i; }
  return bal + fee;
}

// "everything grows": the extra money building takes and gives back each month compared with not building (household cash
// flows net of growth on both sides), plus home value − all debt + the old-loan debt the not-building side still owes at the end
function reEconFlows(r) {
  const ms = r.months, H = ms.length - 1, f = new Array(H + 1).fill(0);
  for (let t = 0; t <= H; t++) {
    const prevC = t === 0 ? r.cashStart : ms[t - 1].cash, prevR = t === 0 ? r.cashStart : ms[t - 1].rCash;
    f[t] = (ms[t].cash - prevC - ms[t].ret) - (ms[t].rCash - prevR - ms[t].rRet);
  }
  f[H] += (ms[H].econNW - ms[H].cash) - (ms[H].econBase - ms[H].rCash);
  return f;
}
// return on building: the yearly rate at which those flows are worth zero; null when it is not defined (no sign change)
function reEconIRR(r) {
  const f = reEconFlows(r), H = f.length - 1;
  const npv = (R) => { const m = Math.pow(1 + R, 1 / 12); let s = 0, d = 1; for (let t = 0; t <= H; t++) { s += f[t] / d; d *= m; } return s; };
  let lo = -0.5, hi = 1, flo = npv(lo), fhi = npv(hi);
  if (!(flo * fhi < 0)) return null;
  for (let k = 0; k < 100; k++) { const mid = (lo + hi) / 2, fm = npv(mid); if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid; }
  return (lo + hi) / 2;
}

function rePlanSimulate(p, prj, plan) {
  const H = Math.round(p.horizon * 12);
  // monthly return on cash, net of any zakat on invested cash (both sides, and the today's-money discount)
  const alt = Math.pow((1 + p.altReturn / 100) * (1 - (p.cashZakatPct || 0) / 100), 1 / 12) - 1;
  // this month's income and living costs (optional yearly growth) and the bank's limits, which follow your current income
  let inc = p.income, liv = p.livingExpenses, dbrTarget = 0, perLoanTarget = 0, mortgageTarget = 0;
  const setMonth = (t) => {
    const y = Math.floor(Math.max(0, t - 1) / 12);
    inc = p.income * Math.pow(1 + (p.incomeGrowth || 0) / 100, y); liv = p.livingExpenses * Math.pow(1 + (p.livingGrowth || 0) / 100, y);
    dbrTarget = inc * p.dbrCap / 100;                                            // all instalments together must stay under this
    perLoanTarget = inc * p.perLoanCap / 100;                                    // one personal loan's instalment may not exceed this
    mortgageTarget = inc * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100; // all mortgages together may not exceed this
  };
  setMonth(0);
  const feeMonths = Math.max(0, p.settleFeeMonths);
  const events = [], flags = [];
  // existing loans (instalment floored at the annuity that clears the balance in the stated months)
  const loans = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { ...l, bal: l.balance, left, installment: Math.max(l.installment, rePmt(l.balance, l.rate, left)), settledAt: null, interestPaid: 0, kind: "existing" }; });
  const loanPay = (bal, i, inst) => Math.min(bal + i, inst);
  // the not-building side pays the existing loans on schedule and makes the same planned settlements you set
  // (a settlement you plan anyway is not an effect of building)
  const renterInst = new Array(H + 1).fill(0), renterDebt = new Array(H + 1).fill(0), renterSettle = new Array(H + 1).fill(0);
  loans.forEach((l) => {
    let bal = l.bal; const s = l.settleAt != null && l.settleAt > 0 ? Math.round(l.settleAt) : null;
    for (let t = 0; t <= H; t++) {
      if (t >= 1 && bal > 0.5) {
        if (t === s) { renterSettle[t] += reSettleCost(bal, l.rate, l.installment, Math.max(0, l.left - (t - 1)), feeMonths); bal = 0; }
        else { const i = bal * l.rate / 100 / 12; const pay = loanPay(bal, i, l.installment); bal -= pay - i; renterInst[t] += pay; }
      }
      renterDebt[t] += Math.max(0, bal);
    }
  });

  // the four new facilities
  const mk = (key, label, rate, tenure, fees) => ({ key, label, bal: 0, pmt: 0, amount: 0, rate: reEffRate(p, rate, Math.max(1, Math.round(tenure * 12))) + (p.rateShock || 0), quoted: rate, tenure, n: Math.max(1, Math.round(tenure * 12)), fees: 0, feesPct: fees, startedAt: null, settledAt: null, interestPaid: 0, monthsPaid: 0, capacity: null, kind: key, name: label });
  // bank terms are shared by every strategy (one set per loan type)
  const lm = mk("lm", prj.build ? "Mortgage on the new land" : "Mortgage on the purchase", p.lmRate, p.lmTenure, p.lmFeesPct);
  const eq = mk("eq", "Mortgage on your existing property", p.eqRate, p.eqTenure, p.eqFeesPct);
  const pl = mk("pl", "Personal loan", p.plRate, p.plTenure, 0);
  const pl2 = mk("pl2", "Personal loan at completion", p.plRate, p.plTenure, 0);
  const co = mk("co", "Cash-out on the finished home", p.coRate, p.coTenure, p.coFeesPct);
  const rf = mk("rf", "Refinance (new personal loans)", p.plRate, p.plTenure, 0); // bank buy-out of personal loans, at the personal-loan rate & tenure
  const facs = [lm, eq, pl, co, pl2, rf];
  const activeExisting = () => loans.filter((l) => l.settledAt === null && l.bal > 0.5);
  const instOf = (f) => f.bal > 0.5 && f.settledAt === null ? f.pmt : 0;
  const allInst = () => activeExisting().reduce((a, l) => a + l.installment, 0) + facs.reduce((a, f) => a + instOf(f), 0);
  // early-settlement cost (SAMA cap): the balance plus the next min(feeMonths, months left) months' profit on the DECLINING balance
  const settleCost = (l) => reSettleCost(l.bal, l.rate, l.kind === "existing" ? l.installment : l.pmt, l.kind === "existing" ? Math.max(0, l.left) : Math.max(0, l.n - l.monthsPaid), feeMonths);
  const instOfAny = (l) => l.kind === "existing" ? l.installment : l.pmt;

  let cash = p.cashAvailable, rCash = p.cashAvailable;
  // NET-WORTH basis (your rule 7):
  //   ccash  = your own cash + every loan − land, construction, early payoffs and fees; it GROWS at the return-on-cash rate
  //            from today (while positive) and is never touched by instalments. Without the growth it is the rule-6
  //            "cash on hand" (ccash − cRetCum).
  //   net worth = ccash − instalments on the new loans (a plain cost, no growth) + old-loan instalments you no longer pay
  //            (loans paid off / refinanced) + rent received + rent you no longer pay − upkeep + home value (no selling
  //            costs) − new-loan debt still owed + old-loan balance you no longer owe while the not-building side does.
  //   if you don't build = your own cash growing at the same rate from today, less the settlements you planned anyway.
  let bcash = p.cashAvailable, ccash = p.cashAvailable;
  let newInstCum = 0, oldSavedCum = 0, rentInCum = 0, rentSavedCum = 0, upkeepCum = 0, cRetCum = 0;
  const annualRentOut = (p.rentOutFixed || 0) > 0 ? p.rentOutFixed : (p.rentOutPct || 0) > 0 ? prj.total * p.rentOutPct / 100 : 0;
  const lettingOut = annualRentOut > 0;
  // part of the new home let while you live in it (annex / floor) — not when the whole home is let
  const partRent = !lettingOut && (p.partRentAnnual || 0) > 0 ? p.partRentAnnual : 0;
  // the home you own and live in today (no rent today): keep it, let it or sell it when you move into the new one —
  // not when the whole new home is let (you would stay where you are). It appreciates with the market.
  const ownPlan = !lettingOut && !(p.rentNow > 0) && p.ownedValue > 0 && (p.ownHomePlan === "let" || p.ownHomePlan === "sell") ? p.ownHomePlan : "keep";
  const ownedAt = (t) => p.ownedValue * Math.pow(1 + p.appreciation / 100, t / 12);
  let soldAt = null, ownSale = null, partRentCum = 0, ownRentCum = 0;
  let minCash = Infinity, minCashT = 0, belowBufferMonths = 0, shortfall = 0, fundingGap = 0;
  const payoffs = [];   // early payoffs from your own cash: { t, name, cost, fee }
  const prepaid = [];   // mortgages paid off early from your cash (your option): { t, name, key, cost, fee, inst }
  let prepaidTotal = 0, prepayFees = 0, refiDiffers = false;
  let settledTotal = 0, settleFees = 0, refiTotal = 0, roomSettled = 0, debtFreeT = null, breakEvenMonth = null, econBreakEven = null, cashRestoredT = null;
  const months = [];
  const yearOf = (t) => Math.max(0, Math.ceil(t / 12));
  const remainingSpend = (t) => { let s = 0; for (let k = t; k < prj.schedule.length; k++) s += prj.schedule[k] || 0; return s; };
  const when = (w, m) => w === "start" ? 0 : w === "land" ? prj.landMonth : w === "build" ? prj.start : w === "completion" ? prj.occupy : w === "month" ? Math.max(0, Math.round(m || 0)) : -1;

  // what the bank would lend on facility f this month: min(LTV cap, per-loan cap, total debt-burden room, product cap)
  function capacityOf(f, ltvCap, productCap) {
    const totalRoom = dbrTarget - allInst();                                   // what is left of the bucket this month
    const mortRunning = [lm, eq, co].filter((x) => x !== f).reduce((a, x) => a + instOf(x), 0);   // the mortgage cap is for all mortgages together
    const facCap = f.key === "pl" ? perLoanTarget * (plan.plSplit ? 2 : 1) : Math.max(0, mortgageTarget - mortRunning); // this facility's own ceiling inside the bucket
    const room = Math.max(0, Math.min(totalRoom, facCap));
    const byDbr = rePrincipalFor(room, f.rate, f.n);
    const cap = Math.max(0, Math.min(byDbr, ltvCap, productCap));
    const capName = totalRoom <= facCap ? `${p.dbrCap}% total debt-burden cap` : f.key === "pl" ? `${p.perLoanCap}% per personal loan${plan.plSplit ? " (two loans)" : ""}` : `${p.mortgageCap}% mortgage cap${mortRunning > 0 ? " (all mortgages together)" : ""}`;
    return { cap, byDbr, byLtv: ltvCap, byProduct: productCap, room, totalRoom, facCap, limitedBy: cap <= 0 ? (ltvCap <= 0 ? "nothing to mortgage (value 0)" : "no debt-burden room") : cap === byDbr && byDbr < Math.min(ltvCap, productCap) ? capName : cap === ltvCap ? "LTV" : "bank cap" };
  }
  function doSettle(l, t, reason) {
    const cost = settleCost(l), fee = cost - l.bal, inst = instOfAny(l);
    cash -= cost; ccash -= cost; settledTotal += l.bal; settleFees += fee; l.settledAt = t; l.bal = 0; payoffs.push({ t, name: l.name, cost, fee, old: l.kind === "existing" });
    events.push({ t, kind: "settle", text: `Settle ${l.name}: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — frees ${fSAR(inst)}/mo — ${reason}.` });
  }
  // only PERSONAL loans may be paid off early: existing loans you allow, the strategy's personal loan, a refinance taken as a personal loan.
  // Mortgages (land, existing property, cash-out, refinance into a mortgage) run to their end.
  const isPersonalFac = (f) => f.key === "pl" || f.key === "pl2" || f.key === "rf";
  const pool = () => activeExisting().filter((l) => l.canSettle !== false).concat(facs.filter((f) => isPersonalFac(f) && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null));
  // your rule: a personal loan is paid off with your own cash ONLY to clear room for a MORTGAGE (never for a personal loan).
  //   "asNeeded" — just enough personal loans that the mortgage covers the funding gap
  //   "forMax"   — as many personal loans as it takes for the mortgage to reach the most the property allows (LTV / product cap),
  //                when the mortgage is sized "max" (otherwise it behaves like asNeeded)
  //   "none"     — never. Legacy "all" behaves like "asNeeded".
  function settleFor(t, f, ltvCap, productCap, gapFn, mode) {
    if (isPersonalFac(f)) return;
    if (plan.settlePolicy === "none") return;
    const forMax = plan.settlePolicy === "forMax" && mode === "max";
    const dbrBound = () => { const c = capacityOf(f, ltvCap, productCap); return c.byDbr < Math.min(ltvCap, productCap) - 1; };
    // paying off a loan only helps while the instalment test (not LTV or the product cap) limits the mortgage
    const more = () => dbrBound() && (forMax || gapFn() > capacityOf(f, ltvCap, productCap).cap + 1);
    let guard = 0;
    const skipped = new Set();   // loans your own cash can't cover: skip them and try the next one
    while (more() && guard++ < 20) {
      const cands = pool().filter((l) => !skipped.has(l));
      if (!cands.length) break;
      const pick = cands.sort((a, b) => instOfAny(b) / settleCost(b) - instOfAny(a) / settleCost(a))[0];
      // the bank wants the old loan cleared BEFORE it grants the mortgage, so the payoff must come from cash you already have
      // (a land mortgage drawn this month is owed to the seller — it is not your cash)
      const own = cash - (lm.startedAt === t ? lm.amount : 0);
      if (own - settleCost(pick) < 0) {
        skipped.add(pick);
        events.push({ t, kind: "settle", text: `Cannot pay off ${pick.name} (${fSAR(settleCost(pick))}) before the ${f.label.toLowerCase()}: only ${fSAR(Math.max(0, own))} of your own cash on hand.` });
        continue;
      }
      roomSettled += pick.bal; doSettle(pick, t, `from your own cash, before the bank grants the ${forMax ? "largest " : ""}${f.label.toLowerCase()} — it frees instalment room in the bank's debt-burden test so the bank can lend more`);
    }
    if (skipped.size && more()) flags.push(`Not enough cash of your own to pay off ${[...skipped].map((l) => l.name).join(" + ")} before the ${f.label.toLowerCase()} — the mortgage is limited to what fits without ${skipped.size > 1 ? "those payoffs" : "that payoff"}.`);
  }
  function originate(t, f, mode, fixedAmt, ltvCap, productCap, proceedsFirst) {
    const cashBefore = cash;
    const gap = Math.max(0, remainingSpend(t) - (cash - p.cashBuffer));
    // old loans are paid off from your own cash first (the bank requires it before granting the loan);
    // that lowers cash, so the gap is re-measured after each payoff
    const gapNow = () => Math.max(0, remainingSpend(t) - (cash - p.cashBuffer));
    settleFor(t, f, ltvCap, productCap, () => mode === "fixed" ? Math.min(fixedAmt, gapNow()) : gapNow(), mode);
    const gapAfter = gapNow();
    const c = capacityOf(f, ltvCap, productCap);
    const want = mode === "max" ? c.cap : mode === "need" ? gapAfter : fixedAmt;
    const amount = Math.max(0, Math.min(want, c.cap));
    f.capacity = { t, ...c, want, mode, taken: amount, gap };
    if (amount < 1) {
      events.push({ t, kind: f.key, text: `${f.label}: nothing available (${c.limitedBy}${gap > 0 ? `; funding gap ${fS(gap)}` : ""}).` });
      if (gap > 0) flags.push(`${f.label} at ${fMonText(t)} not possible: ${c.limitedBy}.`);
      return;
    }
    f.bal = amount; f.amount = amount; f.pmt = rePmt(amount, f.rate, f.n); f.startedAt = t; f.fees = amount * f.feesPct / 100;
    cash += amount - f.fees; ccash += amount - f.fees;
    const onePl = f.key === "pl" ? rePrincipalFor(perLoanTarget, f.rate, f.n) : Infinity;
    f.split = f.key === "pl" && plan.plSplit && amount > onePl + 1 ? [onePl, amount - onePl] : null;
    const dbr = allInst() / inc * 100;
    const basis = mode === "max" ? "the bank's maximum" : mode === "need" ? `the shortfall${gap > amount + 1 ? ` (${fS(gap)} needed)` : ""}` : "the amount you set";
    events.push({ t, kind: f.key, text: `${f.label}: ${fS(amount)}${f.split ? ` as two loans (${fS(f.split[0])} + ${fS(f.split[1])})` : ""} at ${f.quoted}%${p.rateQuote === "flat" ? ` flat (≈${f.rate.toFixed(2)}% APR)` : ""} over ${f.tenure} yrs — ${basis}; bank could lend up to ${fS(c.cap)} (limited by ${c.limitedBy}); instalment ${fSAR(f.pmt)}/mo; debt burden now ${dbr.toFixed(0)}% of income. ${f.key === "lm" ? `The bank pays it directly to the seller; you pay the other ${fS(Math.max(0, (prj.build ? prj.land : prj.price) - amount))} of the price plus ${fS(prj.rett)} transfer tax${prj.landBroker > 0 ? ` and ${fS(prj.landBroker)} broker's fee` : ""}${f.fees > 1 ? ` and ${fS(f.fees)} bank fees` : ""} from your own cash.` : `Net to your cash ${fS(amount - f.fees)}.`}` });
    if (mode === "need" && gap > amount + 1) flags.push(`${f.label} covers ${fS(amount)} of a ${fS(gap)} shortfall (${c.limitedBy}).`);
  }
  // PERSONAL LOAN (refinance included): the bank lends its MAXIMUM as one or two new personal loans (each instalment ≤ perLoanCap,
  // together within what is left of the bucket; never more than two personal loans running at once). If buying out old personal
  // loans releases more cash, the bank does it automatically: it clears them directly from the new loan (no cash from you) and
  // pays you the rest. Only old personal loans at least refiMinMonths old (and not marked "may not refinance") qualify.
  // Every subset of eligible loans — including none — is tried; the one that puts the most cash in your hands is kept.
  function takePersonal(t, f) {
    const minAge = p.refiMinMonths == null ? 12 : p.refiMinMonths;
    // personal loans already running: your existing loans + this strategy's other personal-loan step (two loans if it was split)
    const others = [pl, pl2].filter((x) => x !== f && x.bal > 0.5 && x.settledAt === null && x.startedAt !== null);
    const old = activeExisting().concat(others);
    const loansOf = (l) => l.kind === "existing" ? 1 : (l.split ? 2 : 1);
    const oldCount = old.reduce((a, l) => a + loansOf(l), 0);
    const ageOf = (l) => l.kind === "existing" ? (l.ageMonths == null ? Infinity : l.ageMonths + t) : t - l.startedAt;
    const mayRefi = (l) => l.kind !== "existing" || l.canRefi !== false;
    const eligible = old.filter((l) => mayRefi(l) && ageOf(l) >= minAge).slice(0, 8);
    const tooYoung = old.filter((l) => mayRefi(l) && ageOf(l) < minAge).map((l) => l.name);
    const instNow = allInst();
    const maxNew = plan.plSplit === false ? 1 : 2;
    const onePl = (inst) => Math.min(rePrincipalFor(inst, f.rate, f.n), p.plCap);
    // value of a loan's remaining payments (from month t + firstK) up to the horizon plus the balance still owed then,
    // discounted at the return-on-cash rate — the everything-grows measure, seen from this month
    const pvPayments = (bal, rateApr, inst, firstK) => {
      const r = rateApr / 1200; let b = bal, pv = 0, k = firstK;
      while (b > 0.5 && t + k <= H) { const i = b * r, pay = Math.min(b + i, inst); b -= pay - i; pv += pay / Math.pow(1 + alt, k); k++; }
      return pv + (b > 0.5 ? b / Math.pow(1 + alt, Math.max(0, H - t)) : 0);
    };
    const refiMode = plan.refiMode || "auto";
    const idOf = (l) => l.kind === "existing" ? String(l.id) : l.key;
    const picks = refiMode === "pick" ? ((plan.refiPick || {})[f.key] || []).map(String) : null;
    const pickSet = picks ? eligible.filter((l) => picks.includes(idOf(l))) : null;
    const droppedPicks = picks ? picks.filter((id) => !eligible.some((l) => idOf(l) === id)) : [];
    let best = null, bestCash = null, bestValue = null, pickBest = null, noneBest = null, why = "";
    const cands = [];   // every buy-out that could be done this month (kept so the page can explain the choice)
    const better = (c, b, k) => !b || c[k] > b[k] + 1 || (Math.abs(c[k] - b[k]) <= 1 && c.S.length < b.S.length);
    for (let mask = 0; mask < (1 << eligible.length); mask++) {
      const S = eligible.filter((_, k) => mask & (1 << k));
      if (picks && S.length && !(S.length === pickSet.length && S.every((l) => pickSet.includes(l)))) continue;   // your pick, or no buy-out
      const freed = S.reduce((a, l) => a + instOfAny(l), 0), payoff = S.reduce((a, l) => a + settleCost(l), 0);
      const nNew = Math.min(maxNew, 2 - (oldCount - S.reduce((a, l) => a + loansOf(l), 0)));   // never more than two personal loans at once
      if (nNew < 1) { why = why || "two personal loans already running"; continue; }
      const totalRoom = Math.max(0, dbrTarget - (instNow - freed));
      const capInst = Math.min(perLoanTarget, rePmt(p.plCap, f.rate, f.n));   // a loan's instalment stops at the 33% cap or where the bank's ceiling per loan binds
      const room = Math.min(totalRoom, nNew * capInst);
      const i1 = Math.min(room, capInst), i2 = nNew > 1 ? Math.max(0, room - i1) : 0;
      const p1 = i1 > 1 ? onePl(i1) : 0, p2 = i2 > 1 ? onePl(i2) : 0;
      const amount = p1 + p2;
      if (amount < 1) { why = why || "no room left in the bank's debt-burden test"; continue; }
      if (amount < payoff + 1) continue;                                 // the bank must clear the old loans in full
      const net = amount - payoff;
      const limitedBy = room < nNew * capInst - 1 ? `${p.dbrCap}% total debt-burden cap${capInst < perLoanTarget - 1 && p1 >= p.plCap - 1 ? ` (the first loan is at the bank's ceiling of ${fS(p.plCap)})` : ""}` : capInst < perLoanTarget - 1 ? `bank ceiling of ${fS(p.plCap)} per personal loan` : `${p.perLoanCap}% cap per personal loan${nNew > 1 ? " (two loans)" : ""}`;
      const value = net - pvPayments(p1, f.rate, rePmt(p1, f.rate, f.n), 1) - (p2 > 1 ? pvPayments(p2, f.rate, rePmt(p2, f.rate, f.n), 1) : 0) + S.reduce((a, l) => a + pvPayments(l.bal, l.rate, instOfAny(l), 0), 0);
      const c = { S, freed, payoff, amount, net, value, split: p2 > 1 ? [p1, p2] : null, limitedBy, room };
      cands.push(c);
      if (better(c, bestCash, "net")) bestCash = c;
      if (better(c, bestValue, "value")) bestValue = c;
      if (picks && S.length) pickBest = c;
      if (!S.length) noneBest = c;
    }
    best = refiMode === "cash" ? bestCash : refiMode === "pick" ? (pickBest || noneBest) : bestValue;
    const sameS = (a, b) => a && b && a.S.length === b.S.length && a.S.every((l) => b.S.includes(l));
    if (bestCash && bestValue && !sameS(bestCash, bestValue)) refiDiffers = true;
    // what was weighed: each option (which old loans the bank clears, the new loans, cash to you, worth in today's money),
    // the old loans' rates against the new loan's, and which rule chose
    f.refiBasis = refiMode === "pick" ? "pick" : refiMode === "cash" ? "cash" : "value";
    f.refiOld = eligible.map((l) => ({ id: idOf(l), name: l.name, apr: l.rate, bal: l.bal, inst: instOfAny(l) }));
    f.refiTooYoung = tooYoung;
    const kept = cands.slice().sort((a, b) => b.value - a.value).slice(0, 16);
    [best, bestCash, bestValue].forEach((c) => { if (c && !kept.includes(c)) kept.push(c); });
    f.refiOptions = kept.map((c) => ({ ids: c.S.map(idOf), names: c.S.map((l) => l.name), amount: c.amount, payoff: c.payoff, net: c.net, value: c.value, split: c.split, chosen: c === best, bestValue: c === bestValue, bestCash: c === bestCash }));
    if (!best || best.net < 1) {
      const reason = best ? "would not release any cash" : (why || "no room left in the bank's debt-burden test") + (tooYoung.length ? `; ${tooYoung.join(" + ")} not yet ${minAge} months old, so not refinanceable` : "");
      f.capacity = { t, cap: 0, limitedBy: reason, want: 0, mode: "max", taken: 0, gap: 0 };
      events.push({ t, kind: "pl", text: `${f.label}: nothing available — ${reason}.` });
      return;
    }
    const before = instNow;
    const cleared = best.S.map((l) => { const cost = settleCost(l), it = { id: idOf(l), name: l.name, cost, fee: cost - l.bal, old: l.kind === "existing" }; settleFees += it.fee; refiTotal += l.bal; l.settledAt = t; l.refinancedAt = t; l.bal = 0; return it; });
    f.bal = best.amount; f.amount = best.amount; f.split = best.split; f.startedAt = t; f.fees = 0;
    f.pmt = best.split ? rePmt(best.split[0], f.rate, f.n) + rePmt(best.split[1], f.rate, f.n) : rePmt(best.amount, f.rate, f.n);
    cash += best.amount - best.payoff; ccash += best.amount - best.payoff;
    f.capacity = { t, cap: best.amount, room: best.room, limitedBy: best.limitedBy, want: best.amount, mode: "max", taken: best.amount, gap: 0 };
    f.refi = best.S.length ? { names: best.S.map((l) => l.name), payoff: best.payoff, net: best.net, freed: best.freed, items: cleared } : null;
    const loans = best.split ? `two personal loans, ${fS(best.split[0])} + ${fS(best.split[1])}` : `a personal loan of ${fS(best.amount)}`;
    const basis = refiMode === "pick" ? "the loans you chose" : refiMode === "cash" ? "the most cash in hand" : "the best value";
    let note = "";
    if (picks && droppedPicks.length) note += ` Not bought out: ${droppedPicks.length} of the loans you chose (not running, not yet ${minAge} months old, or not allowed).`;
    if (picks && pickSet.length && !pickBest) note += " The loans you chose can't be cleared in full by this loan, so none is bought out.";
    if (refiMode !== "pick" && refiMode !== "cash" && bestCash && !sameS(bestCash, best) && bestCash.net > best.net + 1) note += ` Buying out ${bestCash.S.length ? bestCash.S.map((l) => l.name).join(" + ") : "no loan"} instead would put ${fS(bestCash.net - best.net)} more in your hands now but leave you ${fS(best.value - bestCash.value)} poorer in today's money, so it is not done.`;
    events.push({ t, kind: "pl", text: `${f.label}: the bank lends its maximum — ${loans} at ${f.quoted}%${p.rateQuote === "flat" ? ` flat (≈${f.rate.toFixed(2)}% APR)` : ""} over ${f.tenure} yrs (limited by the ${best.limitedBy}).${f.refi ? ` It refinances ${f.refi.names.join(" + ")} (chosen for ${basis}): the bank clears ${fS(best.payoff)} (incl. early-settlement fees) directly — no cash from you — and ${fS(best.net)} lands in your cash.` : ` ${fS(best.amount)} lands in your cash.`} Instalments ${fSAR(before)} → ${fSAR(allInst())}/mo (${(allInst() / inc * 100).toFixed(0)}% of income).${note}` });
  }
  const fMonText = (t) => `month ${t}`;

  const lmT = plan.lmUse ? prj.landMonth : -1;
  const eqT = when(plan.eqWhen, plan.eqMonth), plT = when(plan.plWhen, plan.plMonth), coT = plan.coUse ? prj.occupy : -1;
  for (let t = 0; t <= H; t++) {
    setMonth(t);
    const yrIdx = Math.floor(Math.max(0, t - 1) / 12);
    const occupied = t >= prj.occupy;
    const rentEq = t >= 1 ? p.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx) : 0;
    const rentPaid = t >= 1 && (!occupied || lettingOut) ? rentEq : 0;   // if the new home is let out you don't move in
    const ret = t >= 1 && cash > 0 ? cash * alt : 0;   // return earned on the cash balance this month (kept for the cash breakdown)
    const rRet = t >= 1 && rCash > 0 ? rCash * alt : 0;   // …and on the not-building household's cash
    // the return-on-cash rate is GROWTH: it applies only while a balance is positive, never as a charge on a shortfall.
    // Both sides grow from today; the rule-6 "cash on hand at completion" is the same cash WITHOUT growth (ccash − cRetCum).
    const growNow = t >= 1;
    const bRet = growNow && bcash > 0 ? bcash * alt : 0, cRet = growNow && ccash > 0 ? ccash * alt : 0;
    bcash += bRet; ccash += cRet; cRetCum += cRet;
    bcash -= renterSettle[t];   // the not-building side makes your planned settlements too
    // rent from letting the new home out: from the month after completion, growing with the rent-growth setting
    const letIn = lettingOut && t > prj.occupy ? annualRentOut / 12 * Math.pow(1 + p.rentGrowth / 100, Math.floor((t - prj.occupy - 1) / 12)) : 0;
    // …or part of it (annex), and the home you lived in before, let from the month after move-in
    const partIn = partRent > 0 && t > prj.occupy ? partRent / 12 * Math.pow(1 + p.rentGrowth / 100, Math.floor((t - prj.occupy - 1) / 12)) : 0;
    const ownIn = ownPlan === "let" && t > prj.occupy ? ownedAt(t) * (p.ownHomeYield || 0) / 100 / 12 : 0;
    const rentIn = letIn + partIn + ownIn;
    partRentCum += partIn; ownRentCum += ownIn;
    // household cash grows only while it is positive (growth is never a charge on a shortfall); this month's salary and rent arrive after it
    if (t >= 1) { cash = (cash > 0 ? cash * (1 + alt) : cash) + inc - liv - rentPaid + rentIn; rCash = (rCash > 0 ? rCash * (1 + alt) : rCash) + inc - liv - rentEq; }
    // planned settlements first (e.g. a loan you intend to clear on a known date)
    loans.forEach((l) => { if (l.settledAt === null && l.bal > 0.5 && l.settleAt != null && l.settleAt > 0 && t === Math.round(l.settleAt)) doSettle(l, t, "planned settlement from your cash"); });
    // milestones
    if (t === prj.landMonth && prj.build) events.push({ t, kind: "milestone", text: `Land bought for ${fS(prj.land + prj.rett + prj.landBroker)} incl. RETT${prj.landBroker > 0 ? " and the broker's fee" : ""}${prj.landMonth > 0 ? ` (today's price grown at ${p.appreciation}%/yr)` : ""}.` });
    if (t === prj.start && prj.build) events.push({ t, kind: "milestone", text: `Construction starts${prj.inflate > 1 ? ` (priced ${((prj.inflate - 1) * 100).toFixed(0)}% above today)` : ""} — ${fS(prj.total - prj.land - prj.rett - prj.landBroker)} over ${prj.bm} months.` });
    // the home you lived in is sold when you move in (your option): its value less selling costs, after repaying any
    // mortgage this strategy took on it (with the early-settlement fee), lands in your cash
    if (ownPlan === "sell" && t === prj.occupy) {
      const value = ownedAt(t), costs = value * (p.ownHomeSellCostPct || 0) / 100;
      let payoff = 0, fee = 0;
      if (eq.bal > 0.5 && eq.settledAt === null && eq.startedAt !== null) { payoff = settleCost(eq); fee = payoff - eq.bal; eq.bal = 0; eq.settledAt = t; eq.soldAt = t; }
      const net = value - costs - payoff;
      cash += net; ccash += net; soldAt = t; ownSale = { t, value, costs, payoff, fee, net };
      events.push({ t, kind: "cash", text: `Sell the home you lived in: ${fSAR(value)} less ${fSAR(costs)} selling costs${payoff > 0 ? ` and ${fSAR(payoff)} to repay its mortgage (incl. ${fSAR(fee)} early-settlement fee)` : ""} — ${fSAR(net)} lands in your cash.` });
    }
    // facilities, in order: land mortgage → existing property → personal loan → cash-out
    const landValue = prj.build ? prj.land : prj.price;   // buying ready: the purchase mortgage is sized on the purchase price
    // every new loan at the bank's maximum that month (your rule)
    if (t === lmT) originate(t, lm, "max", 0, landValue * p.landLtv / 100, Infinity);
    if (t === eqT && soldAt !== null) { eq.capacity = { t, cap: 0, limitedBy: "the property was sold at move-in", want: 0, mode: "max", taken: 0, gap: 0 }; events.push({ t, kind: "eq", text: `${eq.label}: not possible — the property was sold at move-in.` }); }
    else if (t === eqT) originate(t, eq, "max", 0, p.ownedValue * p.ownedLtv / 100, Infinity);
    if (t === plT) takePersonal(t, pl);
    // the land mortgage is still secured on the same home, so the cash-out may only lend up to the LTV less what is still owed on it
    if (t === coT) originate(t, co, "max", 0, Math.max(0, prj.valueAt(t) * p.cashoutLtv / 100 - (lm.settledAt === null ? lm.bal : 0)), Infinity);
    if (plan.pl2Use && t === prj.occupy) takePersonal(t, pl2);          // after the cash-out: personal loan(s) fill what is left
    if (t === prj.occupy && prj.build) events.push({ t, kind: "milestone", text: `Construction complete — move in. Upkeep starts.` });
    // project spend, all from cash (facility proceeds are already in cash)
    const spend = prj.schedule[t] || 0;
    cash -= spend; ccash -= spend;
    // debt service
    let existInst = 0, existInterest = 0;
    if (t >= 1) loans.forEach((l) => { if (l.settledAt !== null || l.bal <= 0.5) return; const i = l.bal * l.rate / 100 / 12; const pay = loanPay(l.bal, i, l.installment); l.bal -= pay - i; l.left -= 1; l.interestPaid += i; existInst += pay; existInterest += i; });
    const pays = {};
    facs.forEach((f) => {
      let pay = 0, int = 0, extra = 0;
      if (t >= 1 && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null && t > f.startedAt) {
        int = f.bal * f.rate / 100 / 12; pay = Math.min(f.pmt + (f.key === "lm" ? Math.max(0, plan.extraMo) : 0), f.bal + int); f.bal -= pay - int; f.interestPaid += int; f.monthsPaid++;
        extra = Math.max(0, pay - f.pmt);   // a voluntary extra payment is yours, not an instalment the bank tests
      }
      pays[f.key] = pay; pays[f.key + "Int"] = int; pays[f.key + "Extra"] = extra;
    });
    const value = prj.valueAt(t);
    const ownerCost = occupied ? value * p.maintPct / 100 / 12 + p.insurance / 12 : 0;
    const newPay = pays.lm + pays.eq + pays.pl + pays.pl2 + pays.co + pays.rf;
    const extraPay = pays.lmExtra + pays.eqExtra + pays.plExtra + pays.pl2Extra + pays.coExtra + pays.rfExtra;
    cash -= existInst + newPay + ownerCost;
    // your option: pay off the mortgages early from your own cash N months after move-in (after that month's instalments),
    // most expensive first, while the cash above your safety cushion covers the payoff and the early-settlement fee
    if (plan.prepayAfter != null && plan.prepayAfter !== "" && t === prj.occupy + Math.max(0, Math.round(plan.prepayAfter))) {
      [lm, eq, co].filter((f) => f.bal > 0.5 && f.settledAt === null && f.startedAt !== null && f.startedAt < t).sort((a, b) => b.rate - a.rate).forEach((f) => {
        const cost = settleCost(f), fee = cost - f.bal;
        if (cash - cost < p.cashBuffer) { events.push({ t, kind: "settle", text: `Not enough cash above your ${fS(p.cashBuffer)} safety cushion to pay off the ${f.label.toLowerCase()} early (${fSAR(cost)} needed).` }); return; }
        cash -= cost; ccash -= cost; prepaidTotal += f.bal; prepayFees += fee;
        prepaid.push({ t, name: f.label, key: f.key, cost, fee, inst: f.pmt });
        events.push({ t, kind: "settle", text: `Pay off the ${f.label.toLowerCase()} early from your cash: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — instalments drop by ${fSAR(f.pmt)}/mo.` });
        f.bal = 0; f.settledAt = t + 1; f.prepaidAt = t;   // this month's instalment was paid; none after
      });
    }
    rCash -= renterInst[t] + renterSettle[t];
    // net-worth basis: new-loan instalments and upkeep are plain costs; old-loan instalments you no longer pay and rent you no
    // longer pay are savings; rent from letting the new home is income — none of them touch the growing cash
    newInstCum += newPay; upkeepCum += ownerCost; rentInCum += rentIn;
    oldSavedCum += renterInst[t] - existInst; rentSavedCum += t >= 1 ? rentEq - rentPaid : 0;
    const debtExisting = loans.reduce((a, l) => a + (l.settledAt === null ? l.bal : 0), 0);
    const debtNew = facs.reduce((a, f) => a + (f.settledAt === null ? f.bal : 0), 0);
    const debt = debtExisting + debtNew;
    const liqValue = value;   // no selling costs: the seller pays no tax or broker fee
    // old-loan balance the not-building side still owes but this strategy no longer does (matters only when the horizon ends
    // before your old loans would)
    const oldDebtGap = renterDebt[t] - debtExisting;
    // after a sale, the home you lived in is no longer yours while the not-building side still owns it (both measures)
    const ownGone = soldAt !== null ? ownedAt(t) : 0;
    const netWorth = ccash - newInstCum + oldSavedCum + rentSavedCum + rentInCum - upkeepCum + value - debtNew + oldDebtGap - ownGone, renterNW = bcash, advantage = netWorth - renterNW;
    if (cash < minCash) { minCash = cash; minCashT = t; }
    if (cash < p.cashBuffer) belowBufferMonths++;
    if (cash < 0) shortfall = Math.max(shortfall, -cash);
    if (occupied && cashRestoredT === null && cash >= p.cashBuffer) cashRestoredT = t;
    if (occupied && breakEvenMonth === null && advantage >= 0) breakEvenMonth = t;
    // "everything grows" (how strategies are ranked): household cash (salary in, every payment out, growth on positive
    // balances) + home value − all debt, against the not-building household's cash − the old-loan debt it still owes
    const econNW = cash + value - debt - ownGone, econBase = rCash - renterDebt[t], econAdv = econNW - econBase;
    if (occupied && econBreakEven === null && econAdv >= 0) econBreakEven = t;
    if (debtFreeT === null && t > 0 && debt < 0.5) debtFreeT = t;
    months.push({ t, year: yearOf(t), cash, rCash, rRet, econNW, econBase, econAdv, bcash, ccash, bRet, cRet, cRetCum, renterSettle: renterSettle[t], oldDebtGap, rentIn, partIn, ownIn, ownGone, newInstCum, oldSavedCum, rentSavedCum, rentInCum, upkeepCum, debtNew, ret, inc: t >= 1 ? inc : 0, liv: t >= 1 ? liv : 0, spend, rentPaid, rentEq, existInst, existInterest, lmPay: pays.lm, eqPay: pays.eq, plPay: pays.pl + pays.pl2, coPay: pays.co, rfPay: pays.rf, newInt: pays.lmInt + pays.eqInt + pays.plInt + pays.pl2Int + pays.coInt + pays.rfInt, ownerCost, value, liqValue, debt, debtExisting, debtLm: lm.bal, debtEq: eq.bal, debtPl: (pl.settledAt === null ? pl.bal : 0) + (pl2.settledAt === null ? pl2.bal : 0), debtCo: co.bal, debtRf: rf.bal, netWorth, renterNW, advantage, extraPay, dbr: (existInst + newPay - extraPay) / inc * 100 });
  }
  const nY = yearOf(H), years = [];
  for (let y = 0; y <= nY; y++) {
    const ms = months.filter((m) => m.year === y); const sum = (k) => ms.reduce((a, m) => a + m[k], 0); const last = ms[ms.length - 1];
    years.push({ year: y, label: y === 0 ? "Y0" : `Y${y}`, spend: sum("spend"), rentPaid: sum("rentPaid"), rentEq: sum("rentEq"), existInst: sum("existInst"), lmPay: sum("lmPay"), eqPay: sum("eqPay"), plPay: sum("plPay"), coPay: sum("coPay"), rfPay: sum("rfPay"), interest: sum("existInterest") + sum("newInt"), ownerCost: sum("ownerCost"),
      cash: last.cash, rCash: last.rCash, debt: last.debt, debtExisting: last.debtExisting, debtLm: last.debtLm, debtEq: last.debtEq, debtPl: last.debtPl, debtCo: last.debtCo, debtRf: last.debtRf, value: last.value, netWorth: last.netWorth, renterNW: last.renterNW, advantage: last.advantage,
      econNW: last.econNW, econBase: last.econBase, econAdv: last.econAdv, inc: ms.filter((m) => m.t >= 1).reduce((a, m, k, arr) => a + m.inc / arr.length, 0) || p.income,
      instMo: (sum("existInst") + sum("lmPay") + sum("eqPay") + sum("plPay") + sum("coPay") + sum("rfPay")) / (y === 0 ? 1 : 12) });
  }
  const end = months[H];
  const newDebtInterest = facs.reduce((a, f) => a + f.interestPaid + f.fees, 0) + settleFees + prepayFees + (ownSale ? ownSale.fee : 0);   // profit + bank fees + early-settlement fees
  const totalInterest = newDebtInterest + loans.reduce((a, l) => a + l.interestPaid, 0);
  const peakDbr = Math.max(...months.map((m) => m.dbr));
  const peakInst = Math.max(...months.map((m) => m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - m.extraPay));
  const feasible = shortfall <= 0;
  const recoveryMonths = cashRestoredT != null ? cashRestoredT - prj.occupy : null;
  const recoveryOk = feasible && recoveryMonths != null && recoveryMonths <= p.recoveryMonths;
  const after = Math.min(H, prj.occupy + p.recoveryMonths);
  // liquidity: what the low point covers, and how thin the monthly surplus gets (salary − living − rent − instalments − upkeep + rent received)
  const outgo = (m) => m.liv + m.rentPaid + m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - m.extraPay + m.ownerCost;
  const lowM = months[Math.max(1, Math.min(H, minCashT))];
  const reserveMonths = lowM && outgo(lowM) > 0 ? Math.max(0, minCash) / outgo(lowM) : null;
  let thinMonths = 0, tightest = null;
  months.forEach((m) => { if (m.t < 1) return; const surplus = m.inc - outgo(m) + m.rentIn; if (surplus < 0.05 * m.inc) thinMonths++; if (!tightest || surplus < tightest.surplus) tightest = { t: m.t, surplus }; });
  if (prj.occupy > H) flags.push(`The home is not finished before the end of the comparison (move-in month ${prj.occupy}, horizon month ${H}) — lengthen the horizon to judge it.`);
  if (shortfall > 0) flags.unshift(`Cash goes NEGATIVE by ${fS(shortfall)} (lowest at month ${minCashT}) — the project cannot be fully funded this way.`);
  else if (!recoveryOk) flags.push(cashRestoredT == null ? `Cash never gets back to your ${fS(p.cashBuffer)} buffer after move-in within the horizon.` : `Cash gets back to your ${fS(p.cashBuffer)} buffer ${recoveryMonths} months after move-in (you asked for ${p.recoveryMonths}).`);
  events.sort((a, b) => a.t - b.t);
  const facOut = (f) => ({ ...f });
  return { plan, months, years, events, flags, feasible, recoveryOk, end,
    lm: facOut(lm), eq: facOut(eq), pl: facOut(pl), pl2: facOut(pl2), co: facOut(co), rf: facOut(rf), refiTotal, roomSettled, annualRentOut, rentInTotal: rentInCum, facilities: facs.map(facOut), loansEnd: loans.map((l) => ({ id: l.id, name: l.name, settledAt: l.settledAt, refinancedAt: l.refinancedAt == null ? null : l.refinancedAt, bal: l.bal })),
    cashStart: p.cashAvailable, minCash, minCashT, belowBufferMonths, shortfall, cashAtCompletion: months[Math.min(H, prj.occupy)].cash, cashEnd: end.cash,
    cashRestoredT, recoveryMonths, cashAfterWindow: months[after].cash, payoffs, newDebtTotal: facs.reduce((a, f) => a + f.amount, 0),
    settledTotal, settleFees, prepaid, prepaidTotal, prepayFees, refiDiffers, totalInterest, newDebtInterest, peakDbr, peakInst, debtFreeT, breakEvenMonth,
    netWorthEnd: end.netWorth, renterEnd: end.renterNW, advantage: end.advantage,
    econEnd: end.econNW, econBaseEnd: end.econBase, econAdv: end.econAdv, econPV: end.econAdv / Math.pow(1 + alt, H), econBreakEven, endDebt: end.debt, endValue: end.value, start: prj.start, landMonth: prj.landMonth, occupy: prj.occupy,
    netReturn: (Math.pow(1 + alt, 12) - 1) * 100, reserveMonths, thinMonths, tightest, partRentTotal: partRentCum, ownRentTotal: ownRentCum, ownPlan, ownSale,
    dbrOk: peakDbr <= p.dbrCap + 0.5 };
}

// one strategy, with the "auto" refinance rule: best value first; if that plan fails (runs out of cash or misses your
// recovery window) while the most-cash choice passes, use the most-cash choice and say so
function reRunPlan(p, prj, plan) {
  const r = rePlanSimulate(p, prj, plan);
  if ((plan.refiMode || "auto") !== "auto" || !r.refiDiffers || (r.feasible && r.recoveryOk)) return r;
  const r2 = rePlanSimulate(p, prj, { ...plan, refiMode: "cash" });
  const score = (x) => (x.feasible && x.recoveryOk ? 2 : 0) + (x.feasible ? 1 : 0);
  if (score(r2) <= score(r)) return r;
  r2.plan = plan; r2.refiFallback = true;
  r2.refiFallbackWhy = { feasible: r.feasible, recoveryOk: r.recoveryOk, minCash: r.minCash, minCashT: r.minCashT, recoveryMonths: r.recoveryMonths, econAdv: r.econAdv, econPV: r.econPV };
  r2.events.unshift({ t: 0, kind: "pl", text: `Refinancing: buying out the old loans that give the best value would ${r.feasible ? "miss your cash-recovery window" : "run your cash out"}, so this strategy buys out the ones that put the most cash in your hands.` });
  return r2;
}

/* ---------- top-level ---------- */
function computeRE(inp, opts) {
  const p = mergeRE(inp);
  const prj = reProject(p);
  const home = p.mode === "home";
  // extra plans (the tool's pick) run after yours, are marked r.tool, and compete in the ranking and the verdict
  const extra = home && opts && opts.extraPlans ? opts.extraPlans.filter(Boolean).map((o) => ({ ...RE_PLAN_DEFAULTS, ...o, enabled: true, lmMode: "max", eqMode: "max", plMode: "max", coMode: "max" })) : [];
  const results = home ? p.plans.map((o) => o.enabled ? reRunPlan(p, prj, o) : null).concat(extra.map((o) => { const r = reRunPlan(p, prj, o); r.tool = true; return r; }))
    : p.options.map((o) => o.enabled ? reSimulate(p, prj, o) : null);
  const live = results.filter(Boolean);
  const score = (r) => home ? r.econAdv : (r.irr == null ? -Infinity : r.irr);   // home: ranked by "everything grows"
  const ranked = live.slice().sort((a, b) => score(b) - score(a));
  const best = ranked[0] || null;
  if (home) ranked.sort((a, b) => (b.feasible && b.recoveryOk) - (a.feasible && a.recoveryOk) || b.feasible - a.feasible || b.econAdv - a.econAdv);
  const bestFeasible = home ? (ranked.find((r) => r.feasible && r.recoveryOk) || ranked.find((r) => r.feasible) || null) : (ranked.find((r) => r.affordable && r.cashOk && r.ltvOk) || null);
  const existingInst = p.existingLoans.reduce((a, l) => a + (l.balance > 0 ? l.installment : 0), 0);
  const existingDbr = p.income > 0 ? existingInst / p.income * 100 : 0;
  // existing loans whose instalment doesn't fit their balance, rate and months left (the simulation raises a too-low
  // instalment to the one that clears the loan on time; a higher one ends the loan early)
  const warnings = [];
  p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).forEach((l) => {
    const left = Math.max(1, Math.round(l.monthsLeft)), need = rePmt(l.balance, l.rate, left);
    if (l.installment < need - 1) warnings.push(`${l.name}: an instalment of ${fSAR(l.installment)} does not clear ${fS(l.balance)} in ${left} months at ${l.rate}% a year (APR) — the tool uses ${fSAR(need)}. Check the rate or the months left.`);
    else if (l.installment > need * 1.02 + 1) { let b = l.balance, k = 0; const r = l.rate / 1200; while (b > 0.5 && k < 1200) { const i = b * r; b -= Math.min(b + i, l.installment) - i; k++; } warnings.push(`${l.name}: an instalment of ${fSAR(l.installment)} clears ${fS(l.balance)} in about ${k} months, not ${left}. Check the rate (APR) or the months left.`); }
  });
  // borrowing-capacity timeline from the existing loans alone (planned settlements honoured): when does room open up?
  const capTimeline = (() => {
    const H = Math.round(p.horizon * 12), n = Math.max(1, Math.round(p.lmTenure * 12)), r = reEffRate(p, p.lmRate, n), nPl = Math.max(1, Math.round(p.plTenure * 12)), rPl = reEffRate(p, p.plRate, nPl);
    const ls = p.existingLoans.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { bal: l.balance, inst: Math.max(l.installment, rePmt(l.balance, l.rate, left)), rate: l.rate, settleAt: l.settleAt }; });
    const rows = []; let prev = null;
    for (let t = 0; t <= Math.min(H, 120); t++) {
      if (t >= 1) ls.forEach((l) => { if (l.bal <= 0.5) return; if (l.settleAt && t === Math.round(l.settleAt)) { l.bal = 0; return; } const i = l.bal * l.rate / 100 / 12; const pay = Math.min(l.bal + i, l.inst); l.bal -= pay - i; });
      const inst = ls.reduce((a, l) => a + (l.bal > 0.5 ? l.inst : 0), 0);
      const incT = p.income * Math.pow(1 + (p.incomeGrowth || 0) / 100, Math.floor(Math.max(0, t - 1) / 12));   // the bank's limits follow your income
      const room = Math.max(0, incT * p.dbrCap / 100 - inst);
      // personal loans: never more than two running at once (your existing loans count) and each stops at the bank's ceiling per loan
      const slots = Math.max(0, 2 - ls.filter((l) => l.bal > 0.5).length), capInst = Math.min(incT * p.perLoanCap / 100, rePmt(p.plCap, rPl, nPl));
      const mortRoom = Math.min(room, incT * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100), pl1 = slots >= 1 ? Math.min(room, capInst) : 0, pl2 = Math.min(room, Math.min(slots, 2) * capInst);
      const key = Math.round(inst) + "|" + Math.round(incT);
      if (key !== prev) { rows.push({ t, inst, income: incT, room, mortRoom, pl1Room: pl1, pl2Room: pl2, maxMortgage: rePrincipalFor(mortRoom, r, n), maxOnePl: Math.min(p.plCap, rePrincipalFor(pl1, rPl, nPl)), maxTwoPl: Math.min(p.plCap, rePrincipalFor(Math.min(pl2, capInst), rPl, nPl)) + Math.min(p.plCap, rePrincipalFor(Math.max(0, pl2 - capInst), rPl, nPl)), maxOneLoan: rePrincipalFor(pl1, r, n), maxAllLoans: rePrincipalFor(room, r, n) }); prev = key; }
    }
    return rows;
  })();
  const household = { warnings, existingInst, existingDbr, dbrRoom: Math.max(0, p.income * p.dbrCap / 100 - existingInst), perLoanRoom: p.income * p.perLoanCap / 100, mortgageRoom: p.income * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100, savings: p.income - p.livingExpenses - p.rentNow - existingInst, capTimeline };
  // renter path is common to all options (same rent, same alt return) — take it from any live option
  const renter = live[0] ? live[0].months.map((m) => ({ t: m.t, rentEq: m.rentEq })) : [];
  let verdict, vColor;
  if (!best) { verdict = "NO OPTION"; vColor = C.sub; }
  else if (home) {
    // judged on the strategy you can actually carry out (the recommendation), not on one that runs out of cash;
    // the baseline is renting only if you pay rent today, otherwise it is not building (or not buying) and keeping the cash invested
    const lead = bestFeasible, renting = p.rentNow > 0, act = prj.build ? "BUILDING" : "BUYING";
    if (!lead) { verdict = "NO EXECUTABLE STRATEGY"; vColor = C.neg; }
    else if (lead.econAdv > 0) { verdict = renting ? "OWNING WINS" : `${act} WINS`; vColor = C.pos; } else { verdict = renting ? "RENTING WINS" : `NOT ${act} WINS`; vColor = C.neg; }
  } else {
    const i = best.irr == null ? -1 : best.irr * 100;
    if (i >= 12) { verdict = "ATTRACTIVE"; vColor = C.pos; } else if (i >= p.discountRate) { verdict = "ACCEPTABLE"; vColor = C.brass; } else { verdict = "WEAK"; vColor = C.neg; }
  }
  return { p, prj, results, live, ranked, best, bestFeasible, renter, verdict, vColor, household };
}

// one strategy (or rental option) on its own: what the sensitivity chart and the start-date sweep need, without the others
function reRunOne(q, idx) {
  const pq = mergeRE(q), prj = reProject(pq), home = pq.mode === "home";
  const o = home ? pq.plans[idx] : pq.options[idx];
  return { prj, r: !o || !o.enabled ? null : home ? reRunPlan(pq, prj, o) : reSimulate(pq, prj, o) };
}
// one-way sensitivity (±20%) on the headline metric of one option
function tornadoRE(inp, idx) {
  const p = mergeRE(inp);
  const home = p.mode === "home";
  const metric = (q) => { const { r } = reRunOne(q, idx); if (!r) return 0; return home ? r.econAdv : (r.irr == null ? 0 : r.irr * 100); };
  const base = metric(p);
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
    if (k === "__rate") return { ...p, options: p.options.map((o) => ({ ...o, rate: o.rate * f })), lmRate: p.lmRate * f, plRate: p.plRate * f, eqRate: p.eqRate * f, coRate: p.coRate * f };
    return { ...p, [k]: p[k] * f };
  };
  return drivers.map(([label, k]) => {
    const a = metric(vary(k, 0.8)) - base, b = metric(vary(k, 1.2)) - base;
    return { label, lo: Math.min(a, b), hi: Math.max(a, b), swing: Math.abs(b - a) };
  }).sort((x, y) => y.swing - x.swing);
}
/* ---------- what-ifs on ONE strategy (the page computes these only when their panel is opened) ---------- */
const reBrief = (r) => r && { feasible: r.feasible, recoveryOk: r.recoveryOk, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, econAdv: r.econAdv, econPV: r.econPV, advantage: r.advantage, netWorth: r.netWorthEnd, peakDbr: r.peakDbr };
// stress tests: each shock on its own, then a combined one; "passes" = the cash never goes below zero
function stressRE(inp, idx) {
  const p = mergeRE(inp), build = p.acquire === "build";
  const tests = [
    ["base", "As you entered it", (q) => q],
    ["rates", "Loan rates +2 points (APR)", (q) => ({ ...q, rateShock: 2 })],
    ["appreciation", "No appreciation", (q) => ({ ...q, appreciation: 0 })],
    build ? ["overrun", "Construction costs +20% (no extra value)", (q) => ({ ...q, overrunPct: (q.overrunPct || 0) + 20 })] : null,
    build ? ["delay", "Construction takes 6 months longer", (q) => ({ ...q, buildMonths: q.buildMonths + 6 })] : null,
    ["income", "Income 20% lower", (q) => ({ ...q, income: q.income * 0.8 })],
    p.vatPct < 15 ? ["vat", "VAT 15% on construction and finishing", (q) => ({ ...q, vatPct: 15 })] : null,
    ["combined", `Rates +2 points, no appreciation${build ? ", costs +20%" : ""}`, (q) => ({ ...q, rateShock: 2, appreciation: 0, overrunPct: build ? (q.overrunPct || 0) + 20 : q.overrunPct })],
  ].filter(Boolean);
  return tests.map(([key, label, f]) => { const { r } = reRunOne(f({ ...p }), idx); return { key, label, ...reBrief(r), passes: !!(r && r.feasible) }; });
}
// break-evens: the value of one assumption at which building draws level with not building, on each measure
// (null = not reached inside the range searched)
function breakEvenRE(inp, idx, keys) {
  const p = mergeRE(inp), base = reRunOne(p, idx);
  if (!base.r || p.mode !== "home") return null;
  const lettingOut = (p.rentOutFixed || 0) > 0 || (p.rentOutPct || 0) > 0;
  const solve = (set, lo, hi, metric) => {
    const f = (x) => { const { r } = reRunOne(set(x), idx); return r ? r[metric] : NaN; };
    let flo = f(lo), fhi = f(hi);
    if (!(flo * fhi <= 0)) return null;
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm * flo > 0) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; } }
    return (lo + hi) / 2;
  };
  const drivers = [
    // a rent you receive from move-in (an annex let, or the whole home if you let it) — the "rent equivalent" of living there
    ["rent", lettingOut ? "Rent for the whole home (SAR a year)" : "Rent you would need to receive from move-in, e.g. an annex (SAR a year)", lettingOut ? (p.rentOutFixed > 0 ? p.rentOutFixed : base.prj.total * p.rentOutPct / 100) : (p.partRentAnnual || 0), (x) => lettingOut ? { ...p, rentOutFixed: x } : { ...p, partRentAnnual: x }, 0, Math.max(3000000, base.prj.value0 * 0.3)],
    ["appreciation", "Property appreciation (% a year)", p.appreciation, (x) => ({ ...p, appreciation: x }), -10, 30],
    ["return", "Return on cash (% a year)", p.altReturn, (x) => ({ ...p, altReturn: x }), 0, 40],
    p.acquire === "build" ? ["uplift", "Value uplift of self-build (%)", p.devMarginPct, (x) => ({ ...p, devMarginPct: x }), -100, 500] : null,
  ].filter(Boolean).filter(([key]) => !keys || keys.includes(key));   // keys: only these drivers (the page fills the panel one at a time)
  return drivers.map(([key, label, current, set, lo, hi]) => ({ key, label, current, econ: solve(set, lo, hi, "econAdv"), rule7: solve(set, lo, hi, "advantage") }));
}
// a ready villa instead: bought in the month you would buy the land, worth what your finished home would be worth by then,
// financed with the same strategy. The most you could pay for it and still do as well as building (on each measure).
function readyBreakEvenRE(inp, idx) {
  const p = mergeRE(inp);
  if (p.mode !== "home" || p.acquire !== "build") return null;
  const { prj, r } = reRunOne(p, idx);
  if (!r) return null;
  const g = p.appreciation / 100, buyAt = prj.landMonth;
  // the villa: the same land, and a building worth what yours would be at move-in — it already stands, so it starts losing
  // value from the purchase
  const parts = { land: prj.land, building: prj.buildValue }, value = parts.land + parts.building;   // its value when you buy it
  const run = (price) => reRunOne({ ...p, acquire: "buy", propertyPrice: price / Math.pow(1 + g, buyAt / 12), finishExtra: 0, readyParts: parts }, idx).r;
  const solve = (metric) => {
    const target = r[metric]; let lo = value * 0.1, hi = value * 3;
    if (run(lo)[metric] < target) return null;          // even a very cheap villa would not do as well
    if (run(hi)[metric] >= target) return hi;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (run(mid)[metric] >= target) lo = mid; else hi = mid; }
    return lo;
  };
  const price = solve("econAdv"), price7 = solve("advantage");
  return { value, buyAt, moveIn: buyAt + 1, buildMoveIn: prj.occupy, price, price7, atPrice: price != null ? reBrief(run(price)) : null, build: reBrief(r) };
}
// "is this loan worth it?": each loan the strategy takes, against the same strategy without it
function loanWorthRE(inp, idx) {
  const p = mergeRE(inp);
  if (p.mode !== "home") return [];
  const { r } = reRunOne(p, idx);
  if (!r) return [];
  const off = { lm: { lmUse: false }, eq: { eqWhen: "none" }, pl: { plWhen: "none" }, pl2: { pl2Use: false }, co: { coUse: false } };
  return r.facilities.filter((f) => f.amount > 0 && off[f.key]).map((f) => {
    const w = reRunOne({ ...p, plans: p.plans.map((o, j) => j === idx ? { ...o, ...off[f.key] } : o) }, idx).r;
    return { key: f.key, label: f.label, amount: f.amount, quoted: f.quoted, apr: f.rate, effYear: (Math.pow(1 + f.rate / 1200, 12) - 1) * 100, netReturn: r.netReturn,
      without: reBrief(w), gain: r.econAdv - w.econAdv, gainPV: r.econPV - w.econPV, perMillionPV: (r.econPV - w.econPV) / f.amount * 1e6, gain7: r.advantage - w.advantage };
  });
}
function timingSweepRE(inp, idx, maxDelay, step, landWithBuild) {
  const p = mergeRE(inp);
  maxDelay = maxDelay == null ? 48 : maxDelay; step = step || 3;
  const rows = [];
  // every step from today, plus your planned start so "start as planned" is always tested
  const ds = []; for (let d = 0; d <= maxDelay; d += step) ds.push(d);
  const cur = Math.max(p.buildStart || 0, p.landMonth || 0); if (!ds.includes(cur)) { ds.push(cur); ds.sort((a, b) => a - b); }
  for (const d of ds) {
    const q = { ...p, buildStart: d, landMonth: landWithBuild ? d : Math.min(p.landMonth || 0, d) };
    const { r, prj: m } = reRunOne(q, idx);
    if (!r) continue;
    rows.push({ delay: d, feasible: r.feasible, recoveryOk: r.recoveryOk, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, peakDbr: r.peakDbr, peakInst: r.peakInst, mortgage: r.lm.amount, eq: r.eq.amount, pl: r.pl.amount, co: r.co.amount, rf: r.rf.amount, newDebt: r.newDebtTotal, settled: r.settledTotal, newDebtInterest: r.newDebtInterest, netWorth: r.netWorthEnd, advantage: r.advantage, econAdv: r.econAdv, econPV: r.econPV, total: m.total, occupy: m.occupy, bufferOk: r.minCash >= p.cashBuffer });
  }
  // "best" = the EARLIEST start that is executable AND gets cash back to the buffer within your recovery window (fallback: earliest executable)
  const ok = rows.filter((r) => r.feasible);
  const best = ok.find((r) => r.recoveryOk) || ok[0] || null;
  return { rows, best };
}

/* ---------- OPTIMIZER: fill the debt-burden bucket the best way, for every start month ----------
   Treats dbrCap × income as one bucket; every loan is taken at the bank's maximum. Searches every combination of: land
   mortgage yes/no · personal loan(s) at build start yes/no · existing-property mortgage none / at build / now / at land ·
   cash-out at completion yes/no · how far to pay off old personal loans for a mortgage. Personal loans (at build start or at
   completion) buy out old ones by the strategy's refinance rule ("Auto"). Every loan is priced with your Bank terms. For
   each start: the mix that is executable AND recovers cash within the window, then the highest "everything grows"
   result, then the lowest peak instalment. */
function reAutoName(o) {
  const s = [];
  s.push(o.lmUse ? "Land mortgage (max)" : "Land in cash");
  if (o.eqWhen !== "none") s.push(`existing-property mortgage (max) ${o.eqWhen === "start" ? "now" : o.eqWhen === "land" ? "when the land is bought" : "at build start"}`);
  if (o.plWhen !== "none") s.push("personal loan(s) (max) at build start");
  if (o.coUse) s.push("cash-out (max) at completion");
  if (o.pl2Use) s.push("personal loan(s) (max) at completion");
  s.push(o.settlePolicy === "none" ? "old loans kept" : o.settlePolicy === "forMax" ? "old loans paid off to unlock the full mortgage" : "old loans paid off only to make room for a mortgage");
  return s.join(" · ");
}
function optimizeRE(inp, opts) {
  opts = opts || {};
  const p0 = mergeRE(inp);
  if (p0.mode !== "home") return null;
  const maxDelay = opts.maxDelay == null ? 48 : opts.maxDelay, step = opts.step || 3, landWithBuild = !!opts.landWithBuild;
  const base = { ...RE_PLAN_DEFAULTS };   // the shared bank terms apply; nothing else is borrowed from Strategy 1
  const eqOpts = p0.ownedValue > 0 ? ["none", "build", "start", "land"] : ["none"];
  // stage 1: every mix of land mortgage · personal loan(s) · existing-property mortgage · cash-out · settle policy
  const combos = [];
  // every loan at the bank's maximum; the choices are which loans, when, and how far to pay off old personal loans for a mortgage
  for (const lmUse of [true, false]) for (const plWhen of ["build", "none"]) for (const eqWhen of eqOpts) for (const coUse of [false, true]) for (const pl2Use of [false, true]) for (const settlePolicy of ["asNeeded", "forMax", "none"]) {
    const o = { ...base, enabled: true, lmUse, lmMode: "max", plWhen, plMode: "max", plSplit: true, eqWhen, eqMode: "max", coUse, coMode: "max", pl2Use, rfWhen: "none", settlePolicy };
    o.name = reAutoName(o); combos.push(o);
  }
  const summarize = (r, prj) => ({ name: r.plan.name, plan: r.plan, feasible: r.feasible, recoveryOk: r.recoveryOk, ok: r.feasible && r.recoveryOk, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, peakInst: r.peakInst, peakDbr: r.peakDbr,
    lm: r.lm.amount, lmCap: r.lm.capacity ? r.lm.capacity.cap : 0, eq: r.eq.amount, eqCap: r.eq.capacity ? r.eq.capacity.cap : 0, pl: r.pl.amount, plCap: r.pl.capacity ? r.pl.capacity.cap : 0, plSplit: r.pl.split, co: r.co.amount, coCap: r.co.capacity ? r.co.capacity.cap : 0,
    rf: 0, plNet: r.pl.refi ? r.pl.refi.net : r.pl.amount, plRefi: r.pl.refi ? r.pl.refi.names : [], refiTotal: r.refiTotal,
    pl2: r.pl2.amount, pl2Split: r.pl2.split, pl2Net: r.pl2.refi ? r.pl2.refi.net : r.pl2.amount, pl2Refi: r.pl2.refi ? r.pl2.refi.names : [],
    newDebt: r.newDebtTotal, newDebtInterest: r.newDebtInterest, settled: r.settledTotal, roomSettled: r.roomSettled, settleFees: r.settleFees, cashAfterWindow: r.cashAfterWindow, cashAtCompletion: r.cashAtCompletion,
    netWorth: r.netWorthEnd, advantage: r.advantage, econAdv: r.econAdv, econPV: r.econPV, total: prj.total, occupy: prj.occupy, start: prj.start, landMonth: prj.landMonth, flags: r.flags, _r: r });
  const rank = (a, b) => (b.ok - a.ok) || (b.feasible - a.feasible) || (b.econAdv - a.econAdv) || (a.peakInst - b.peakInst);
  let tried = 0;
  // evaluate a slice of the mixes for one start (the page fills the start-date table a slice at a time); only each slice's
  // leader keeps its full result, which is all the finish step needs
  const evalSlice = (q, from, to) => {
    const p = mergeRE(q), prj = reProject(p);
    const list = combos.slice(from, to).map((o) => summarize(reRunPlan(p, prj, o), prj)).sort(rank);
    list.forEach((x, k) => { if (k > 0) delete x._r; });
    return { list, prj, p };
  };
  const runStart = (q, delay, planned) => { const { list, prj, p } = evalSlice(q, 0, combos.length); tried = combos.length; return finishStart(list, delay, planned, prj, p); };
  const finishStart = (list, delay, planned, prj, p) => {
    list.sort(rank);
    // name each mix by what it actually drew, and offer a cleaned plan (unused facilities switched off) for copying into a strategy slot
    list.forEach((x) => {
      const o = x.plan, parts = [];
      parts.push(x.lm > 0 ? "Land mortgage (max)" : "Land in cash");
      if (x.eq > 0) parts.push(`existing-property mortgage (max) ${o.eqWhen === "start" ? "now" : o.eqWhen === "land" ? "at land purchase" : "at build start"}`);
      if (x.pl > 0) parts.push(`${x.plSplit ? "two personal loans" : "personal loan"} (max) ${o.plWhen === "completion" ? "at completion" : "at build start"}${x.plRefi.length ? ` refinancing ${x.plRefi.join(" + ")}` : ""}`);
      if (x.co > 0) parts.push("cash-out (max) at completion");
      if (x.pl2 > 0) parts.push(`${x.pl2Split ? "two personal loans" : "personal loan"} (max) at completion${x.pl2Refi.length ? ` refinancing ${x.pl2Refi.join(" + ")}` : ""}`);
      if (x.roomSettled > 0) parts.push(o.settlePolicy === "forMax" ? "old personal loans paid off to unlock the full mortgage" : "old loans paid off to make room for the mortgage");
      x.name = parts.join(" · ");
      x.cleanPlan = { ...o, name: x.name, lmUse: x.lm > 0, eqWhen: x.eq > 0 ? o.eqWhen : "none", plWhen: x.pl > 0 ? o.plWhen : "none", coUse: x.co > 0, pl2Use: x.pl2 > 0, rfWhen: x.rf > 0 ? o.rfWhen : "none" };
    });
    const best = { ...list[0] };
    const r = best._r; delete best._r;
    best.events = r.events; best.facilities = r.facilities;
    best.bucket = r.months.map((m) => ({ t: m.t, inc: m.t >= 1 ? m.inc : p.income, existing: m.existInst, lm: m.lmPay - m.extraPay, eq: m.eqPay, pl: m.plPay, co: m.coPay, rf: m.rfPay }));
    const lite = (x) => { const { _r, flags, ...rest } = x; return rest; };
    const sig = (x) => x.name + "|" + [x.lm, x.eq, x.pl, x.co, x.pl2, x.settled].map((v) => Math.round(v / 1000)).join("|");
    const seen = new Set([sig(best)]), alts = [];
    for (const x of list.slice(1)) { const k = sig(x); if (seen.has(k)) continue; seen.add(k); alts.push(lite(x)); if (alts.length >= 3) break; }
    // best mix that takes a personal loan at completion (refinancing old ones if that helps), for comparison
    const refiBest = list.find((x) => x.pl2 > 0 && x.feasible);
    return { delay, planned, occupy: prj.occupy, total: prj.total, landMonth: prj.landMonth, best, alts, refiBest: refiBest ? lite(refiBest) : null, nOk: list.filter((x) => x.ok).length, nFeasible: list.filter((x) => x.feasible).length, tried: list.length };
  };
  const curStart = Math.max(p0.buildStart || 0, p0.landMonth || 0);
  const at = (d) => ({ ...p0, buildStart: d, landMonth: landWithBuild ? d : Math.min(p0.landMonth || 0, d) });
  if (opts.slice) { const d = opts.delays[0], planned = opts.planned != null ? !!opts.planned : d === curStart && !landWithBuild; return { part: evalSlice(planned ? p0 : at(d), opts.slice[0], opts.slice[1]).list, combos: combos.length }; }
  if (opts.merge) { const { delay, planned, parts } = opts.merge, q = planned ? p0 : at(delay), p = mergeRE(q); return { start: finishStart([].concat(...parts), delay, planned, reProject(p), p), combos: combos.length }; }
  if (opts.plannedOnly) { const planned = runStart(p0, curStart, true); return { starts: null, planned, earliest: null, richest: null, combos: tried }; }
  if (opts.delays) { const starts = opts.delays.map((d) => (d === curStart && !landWithBuild) ? runStart(p0, d, true) : runStart(at(d), d, false)); return { starts, planned: null, earliest: null, richest: null, combos: tried }; }
  const starts = [];
  for (let d = 0; d <= maxDelay; d += step) starts.push(runStart(at(d), d, false));
  const planned = runStart(p0, curStart, true);
  const i = starts.findIndex((s) => s.delay === curStart);
  if (i >= 0 && !landWithBuild) starts[i] = planned; else if (i < 0) { starts.push(planned); starts.sort((a, b) => a.delay - b.delay); }
  const earliest = starts.find((s) => s.best.ok) || starts.find((s) => s.best.feasible) || null;
  const richest = starts.filter((s) => s.best.ok).sort((a, b) => b.best.econAdv - a.best.econAdv)[0] || null;
  return { starts, planned, earliest, richest, combos: tried };
}
