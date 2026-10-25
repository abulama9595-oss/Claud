// v2 of the real-estate engine (forked from re-engine.js; the old file is frozen). Loaded by realestate-v2.html.
/* ============================================================
   v2 DATA MODEL (re2Import converts the old tool's scenarios; mergeRE applies it)
   inp.kind        "landVilla" | "readyVilla" | "land" | "landBuilding" | "readyBuilding" — the project (RE_KINDS; reProject
                   builds each one, see its comment). mode ("home" — the household simulation is the one engine) and acquire
                   ("build" for landVilla / land / landBuilding, "buy" for the ready kinds) are DERIVED in mergeRE and never
                   stored by the new tool. The villa kinds give the old tool's numbers. A building is costed and valued like the
                   villa (floors × builtPct drive the area; the cost approach) and its units are let (reLetting). Land only is
                   the land, RETT and the broker's fee at landMonth and nothing else: no construction and no move-in (occupy =
                   landMonth + 1 = "the project is paid for"; you keep paying the rent you pay today; no upkeep), the land path
                   as its value, holding costs (whiteLandPct — the white-land fee, %/yr of the land's market value, monthly from
                   the first January after the purchase while landArea + whiteLandOtherArea ≥ 5,000 m² — and landZakat "trade"
                   = 2.5%/yr, both out of cash in both measures: r.holdingCost, months.holding), an optional sale in year
                   landSellYear (prj.saleAt: value × (1 − landSellCostPct) into cash, the land mortgage repaid with the
                   early-settlement fee, the value 0 after — r.landSale), land finance for its purchase mortgage (landOnlyLtv,
                   landTenure, lmRate + landRateAdd) and no cash-out. RETT first-home relief (firstHomeExempt) applies to the
                   villa kinds only. A ready asset with readyLandShare set is land + a building readyAge years old that ages.
   inp.occupancy   buildings: "liveLet" (you live in one unit, the rest is let — their rent joins the annex channel, partIn) |
                   "let" (let out entirely — the whole-home channel, letIn; you do not move in and keep paying your rent);
                   unitCount, unitRentBasis "pct" (default: the building's rent a year = unitRentPct % of the all-in cost, spread over the
                   units) or "unit" (unitRent SAR/mo per unit); "sqm" (SAR/m²/yr on builtArea × netLettablePct) is read for older saved
                   scenarios only — the page converts them to "pct". The villa annex: partRentPct (% of the all-in cost) or partRentAnnual (fixed, overrides),
                   vacancyPct, mgmtPct (+ VAT): reLetting(p, prj) → { units, letUnits, perUnit, grossAnnual, netAnnual }. Rent
                   received never joins the bank's income test (cash only).
   rentFreezeUntil YYYY-MM (Riyadh rent freeze; blank / null = none): no rent growth — received (letIn, partIn, ownIn) or paid
                   (rentEq) — until that month, counted from the scenario's month 0 (inp.asOf, YYYY-MM; this month when it is
                   missing); a rent set before it stays flat until then and takes its yearly steps from then on.
   inp.properties  every property you already own (reNormProps): { id "p1"…, name, value, ltv (default ownedLtv), canMortgage,
                   rentNow (what it earns today), isHome (the home you live in today — at most one), plan "keep" | "sell",
                   sellAt "moveIn" | month, letAfterMove, letYield (%/yr of its value), sellCostPct, existingLoanId }.
                   Up to RE_MAX_PROPS (6). Each one is in the simulation (P3): a plan may mortgage it (a facility eq:<id> per
                   step, label "Mortgage on {name}", propId / propName, the shared eqRate / eqTenure / eqFeesPct, yours; r.eqs[]
                   in property order, r.eq = the first one — or a blank "eq" when the plan has none — so one property reads as
                   the old tool's eq; months.eqPay / debtEq sum them), sized on its value × ltv (propertyValueBasis) less the
                   balance of a loan securedOn it, nothing once it is sold; a step on a property that cannot be mortgaged, was
                   sold, or that you do not own is refused and says why. rentNow (what it earns today) goes into the household's
                   cash on BOTH sides from month 1 (months.propRentIn / propRentBase, r.propRentTotal; held by the rent freeze
                   like the rent you pay; never the bank's income) until it is sold. plan "sell": sellAt "moveIn" sells it at
                   prj.occupy on the strategy side only (money for the project — the old ownSale); a month sells it then on BOTH
                   sides (you would sell it anyway: the not-building side gets the same proceeds, months.renterSale, and repays
                   the loan secured on it, renterSettle). Proceeds = value × (1 − sellCostPct) − the plan's mortgage on it −
                   the loan secured on it (each with the early-settlement fee; the old loan's payoff is credited only through
                   oldDebtGap / oldSavedCum): r.sales[] { id, name, isHome, t, value, costs, payoff, fee, oldPayoff, oldFee,
                   oldNames, net, side }, r.ownSale = the home's sale, months.ownGone = Σ value of what only this side sold (the
                   other side still owns it). The home you live in today (isHome; at most one) is kept, let after you move
                   (letAfterMove, letYield — the ownIn channel) or sold at project end (or a later month you set) on the strategy side,
                   only when you move into the new home and pay no rent today; the not-building side keeps it as it is. A sale
                   closes a cash gap (reGaps "sale:<id>"); a mortgage on a property may be taken early to cover one (reCarryOut).
   existingLoans   gain securedOn (a property id, null = unsecured); a loan secured on a property — it says so (securedOn), or the
                   property names it (existingLoanId; mergeRE then fills securedOn in) — is type "mortgage" (never a personal-loan
                   slot, never bought out or settled for room) and its balance reduces that property's LTV room.
   plan.mortgages  { [propertyId]: { when: "start" | "land" | "build" | "completion" | "month", month } } replaces eqWhen / eqMonth
                   (rePlanMorts lists a plan's steps, one per property; a step on a property you do not own lends nothing and
                   says so, as the old engine did with ownedValue 0).
   propertyValueBasis "market" = a mortgage on a property you own is sized on its value at the time (grown at appreciation);
                   "today" = on today's value (the old sizing; what re2Import sets).
   samaBands       true = SAMA's debt-burden bands (reSamaCap: 55% up to 15,000 — 65% REDF-supported, joint.redf —, 65% below
                   25,000, then dbrCap) apply to a single borrower too, in the simulation, the household figures and the room
                   timeline; false = the bank's dbrCap alone (the old behaviour; what re2Import sets).
   LENSES (P4)     reLenses(results, { liabilityBy, years, atMonth, robust, inp }) picks, among the plans that work every month
                   (with bridge money only when none works without), the recommendation (computeRE's ranking), the least
                   liability — by peakDebt (the most owed in any month, ALL debt, with peakDebtT; default), borrowed
                   (newDebtTotal), peakInst (with peakInstT, peakInstPct) or profit (profitPaid = newDebtInterest: profit, fees,
                   early-settlement fees and bridge money) —, the richest in X years (reWealthAt(r, years): econAdv at month 12X,
                   the horizon when X is null or beyond it; robust = the same plan wins with no appreciation, one rerun, only on
                   request) and the most cash and borrowing power (availAtMoveIn + leverageAtMoveIn.borrowable, or at the
                   horizon). Each pick carries idx, value and a plain sentence (why). months.room / roomB / leverage (recorded at
                   month end, see rePlanSimulate) are the borrowing power: room exactly as the bank test reads it next month,
                   leverage = { personal, mortgage, borrowable (mortgage first, personal loans on the room left) }. The optimizer's
                   summaries carry the same figures and finishStart adds start.lenses from them (reLensPick, default options).
   ADVISOR (P4)    reSettleAdvice(inp) → one row per old loan (household.settleAdvice): keep · buyout · settleCash · room, with
                   the PV comparison at the net return on cash (rePvPayments, the refinance step's maths) and the rule-7 view.
                   settlePolicy "dearer" (RE_BASE.dearerMargin 0.25): forMax restricted to old loans dearer than the mortgage
                   being granted (in the optimizer's search when a dearer old loan exists, P6).
   SEARCH (P6)     optimizeRE: the mortgage-on-a-property dimension is none ∪ { the two mortgageable properties with the most
                   room left today (reSearchProps: value × ltv − the loan secured on it) × now / when the land is bought / at
                   build start } = 1 + 3k options (48 / 192 / 336 mixes for 0 / 1 / 2+ properties; a mortgage on any other
                   property is a plan-editor choice); the settle policies asNeeded / forMax / none gain "dearer" when
                   reDearerLoans(p, prj, withEq) finds an old personal loan (yours or your spouse's, settleable) more than
                   dearerMargin above the cheapest mortgage rate the search grants (×4/3; opts.policies overrides, opts.props
                   sets k); plBy me / spouse / both with a spouse who earns (×3 on the mixes with a personal-loan step). Fewer
                   runs than mixes, identical results: mixes whose steps fall in the same months are one run (a ready kind or
                   land: "when the land is bought" = "at build start" = the purchase; a build starting with the purchase), and
                   the four settle policies are the "forMax" run when that run attempted no payoff (plan._trace, tallied in
                   settleFor — only an attempt can make them differ). Results add runs, policies, dearer (names), searchProps;
                   summaries add eqId / eqName / eqWhen / payoffs; names say "mortgage on {name} (max) at build start" and use
                   the kind's words (reMixWords: "Purchase mortgage" / "at the purchase" for a ready kind); start.lenses[k].mix
                   carries cleanPlan. Start dates (reStartMonth, reAtStart): for land only AND the ready kinds a start date is
                   the purchase month, so timingSweepRE / optimizeRE move the purchase without landWithBuild (which applies to a
                   construction only). payoffs carry why ("planned" | "room"), forKey / forLabel (the mortgage the payoff made
                   room for), dearer, rate. household.capTimeline rows carry props[] { id, name, ltvRoom, maxMortgage, secured,
                   sold } (each property's room left that month and the mortgage it carries at the eq terms; 0 once sold in a
                   month you set — a row is added then) and propRoom; household.propertyRoom = today's row.
   Review fixes: the ready kinds write their own milestones ("Home/Building bought for …", "Move in" or "ready — let
                   from month …"). reSaveAndBuy(inp, {maxWait, landWithBuild}) runs the all-cash plan at every month from the
                   planned start up to maxWait (default 12) months later and returns the earliest start that works with no new
                   loan (found), or the cash still needed at the last start (need); the page stores the wait as saveWaitMax.
   Early payoff "asap": plan.prepayAfter "asap" pays each mortgage dearer than the net cash return off from the project end on,
                   once the cash above the cushion and three months' outgoings covers it; optimizeRE reruns its 8 leading
                   mortgage mixes that work with it (opts.prepay false skips that — the old tool's search, for parity).
   refiStyle "topup" (default; re2Import sets "consolidate"): a personal-loan step may refinance each old personal loan
                   one-for-one with its own bank (f.topups; old loans get toppedUpAt); combining old loans into a new loan is
                   allowed only when the new APR is below theirs. Lens ties go to the recommended plan, then the earlier one.
   coverAny (default on; re2Import off): when no planned loan closes a cash gap, the plan's later movable loans are still
                   tried in the gap's first month; if none makes the plan work, the one that shrinks the shortfall most is kept
                   (r.coveredPart, a "cover" event saying it is not enough on its own).
   joint.myShare (null = in proportion to your two rooms): your % of a joint mortgage's instalment; the bank then lends the
                   most that keeps each of you within your own room at that split (capacityJoint and the borrowing power alike).
   Keys with no engine effect yet (later phases): invLtv, invTenure, invRateAdd, dscrMin (income-property finance for a
                   building let out entirely), legacyRental (an imported old rental scenario: a building let out entirely whose
                   one unit earns the old rentMo).
   IMPORT (re2Import; mergeRE runs it on any scenario without `kind` that carries an old-only key — mode, acquire, ownedValue,
                   ownHomePlan, ownHomeYield, ownHomeSellCostPct, options — or a plan with eqWhen / eqMonth / mortgageWhen; a
                   scenario with `properties` or `kind` is never imported). mode + acquire → kind (rental → the building kinds
                   with occupancy "let" and legacyRental true); ownedValue (the old default property value when absent) → properties[0]
                   "p1" (isHome when no rent is paid today; plan / letAfterMove / letYield / sellCostPct from ownHomePlan /
                   ownHomeYield / ownHomeSellCostPct only where the old engine applied them); every plan is written out against
                   the old tool's slot presets and its eqWhen / eqMonth become mortgages.p1; the old per-plan bank terms are read
                   into the shared terms first (reTermsFromPlans); the old defaults the new tool changed are written in (lmRate 4.5,
                   plRate 4.0, propertyValueBasis "today", samaBands false, rentFreezeUntil null, the old default plans). The
                   imported scenario gives the old engine's numbers (tests/re2/parity.test.js, model.test.js); a scenario that
                   already has `kind` is returned as it is (idempotent).
   ============================================================ */
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
  // the project (v2): mode and acquire are derived from the kind in mergeRE (see the data model above)
  kind: "landVilla",       // "landVilla" | "readyVilla" | "land" | "landBuilding" | "readyBuilding"
  occupancy: "liveLet",    // buildings: "liveLet" (you live in one unit, the rest is let) | "let" (let out entirely)
  unitCount: 0, unitRentBasis: "pct", unitRentPct: 6, unitRent: 0, netLettablePct: 85, // buildings: units and their rent (SAR/mo per unit, or SAR/m²/yr on the net lettable share of the built area)
  landSellYear: null, landSellCostPct: 7.5, landZakat: "none",         // land only: sell in year … (null = hold); selling costs (2.5% broker + 5% RETT); zakat on land held to sell ("trade" = 2.5%/yr)
  whiteLandPct: 0, whiteLandOtherArea: 0,                                // white-land fee, %/yr of the land's value (Riyadh tiers; 0 outside) and your other undeveloped plots in the same city (m²)
  rentFreezeUntil: "2030-09",                                            // Riyadh rent freeze: no rent growth until this month (YYYY-MM; blank = none)
  readyLandShare: null, readyAge: 0,                                     // a ready asset: % of its price that is land (null = price + finishing grow with the market, as today) and the building's age (years)
  propertyValueBasis: "market",                                          // a mortgage on a property you own is sized on its value at the time ("market") or on today's value ("today")
  samaBands: true,                                                       // SAMA's debt-burden bands apply to a single borrower too (false = your bank's dbrCap alone)
  // land & construction
  landArea: 400, landPrice: 3200,          // sqm, SAR/sqm
  builtArea: 520, buildCost: 2300,         // sqm built-up, SAR/sqm turnkey
  builtPct: 0, floors: 1,                  // if builtPct > 0, built-up area = landArea × builtPct % (footprint) × floors; builtArea is then ignored
  softPct: 8, contPct: 7, finishExtra: 150000, // design/permits/supervision %, contingency %, kitchen/AC/landscape SAR
  overrunPct: 0,                           // cost overrun on construction (build + soft + contingency + finishing): adds cost, not value
  landBrokerPct: 2.5,                      // broker fee on the land purchase (REGA default 2.5%); not part of the home's value
  buildMonths: 18, devMarginPct: 10,       // construction duration; market value uplift of a self-built home over its cost
  buildDeprPct: 2,                         // the building loses this % of its value at project end each year (straight-line); the land keeps growing
  landMonth: 0, buildStart: 0, costInflation: 3, // timing: month the land is bought, month construction starts (≥ landMonth), construction-cost inflation %/yr
  // ready property
  propertyPrice: 2800000, brokerPct: 2.5,
  // taxes & fees (KSA)
  vatPct: 15, rettPct: 5, firstHomeExempt: true, rettExemptCap: 1000000,
  // market & horizon
  appreciation: 4, horizon: 20, altReturn: 6, discountRate: 6, sellCostPct: 7.5,
  maintPct: 1.0, insurance: 3000,
  // own-home: you & the rent you'd otherwise pay
  rentNow: 8000, rentGrowth: 3, income: 45000, dbrCap: 55, cashAvailable: 2000000,
  // household cash engine (home mode): what you can save each month, and the floor you never want cash to fall below
  livingExpenses: 15000, cashBuffer: 100000,
  incomeGrowth: 0, livingGrowth: 0, // optional yearly growth of income and living costs (%/yr, in yearly steps); the bank's limits follow your income
  // optional, all off by default: part of the new home let while you live in it, and zakat on the cash you keep invested
  // (the home you live in today is one of your `properties` below: isHome, with its keep / let / sell plan)
  partRentPct: 0,          // annex / floor let while you live in the new home: its rent a year as % of the all-in cost…
  partRentAnnual: 0,       // …or a fixed SAR a year (overrides the % when above zero); from the month after the project end, growing with rent growth
  cashZakatPct: 0,         // zakat on invested cash, %/yr: the return on cash becomes (1 + return) × (1 − zakat) − 1 (a home you live in is exempt)
  // existing debt (home mode) — EXAMPLES: replace with your real loans (or import from Qist)
  existingLoans: [
    { id: 1, name: "Personal loan (example)", balance: 350000, installment: 7900, monthsLeft: 54, rate: 6.5 },
    { id: 2, name: "Car finance (example)",   balance: 95000,  installment: 2950, monthsLeft: 36, rate: 5.0 },
  ],
  // تضامن (optional, off by default): the new mortgages taken jointly with your spouse (one household). Your spouse's salary
  // and loans run through the household cash on both sides; each of you is tested on your own income (SAMA, see reSamaCap);
  // the land / purchase mortgage and the cash-out use both of your room; personal loans stay yours.
  joint: { on: false, income: 0, incomeGrowth: null, redf: false, loans: [], myShare: null },   // incomeGrowth null = the same as yours; redf = MoH / REDF-supported mortgage; myShare = your % of a joint mortgage's instalment (null = in proportion to your rooms)
  coverAny: true,          // a gap no planned loan closes still tries the plan's later loans early (re2Import: off — the old tool's cover)
  refiStyle: "topup",      // a personal-loan step refinances each old personal loan with its own bank ("topup"), or buys several out into new loans ("consolidate", the old tool's way; a new loan buys loans out under "topup" only when it is cheaper than they are)
  settleFeeMonths: 3,      // SAMA: early-settlement cost capped at the next 3 months' term cost
  dearerMargin: 0.25,      // settlePolicy "dearer": an old loan is paid off for a mortgage's room only when its APR is more than this many points above the mortgage's
  bridgeRate: null,       // bridge money, % APR, when a plan's cash runs short until one of its loans lands and no loan can cover the gap then (null = the personal-loan APR)
  rateQuote: "apr",        // how NEW-facility rates are entered: "apr" (reducing balance) or "flat" (KSA "hamish" per year on the original principal)
  // bank terms: ONE set per loan type, used by every strategy and by the optimizer (rates as quoted, see rateQuote)
  lmRate: 5.0, lmTenure: 18, lmFeesPct: 1, // mortgage that buys the new land (or the ready home), paid to the seller
  eqRate: 4.5, eqTenure: 18, eqFeesPct: 1, // mortgage on the property you already own
  plRate: 6.5, plTenure: 5,                // personal loans (at build start and at completion)
  coRate: 4.5, coTenure: 18, coFeesPct: 1, // cash-out mortgage on the finished home
  landOnlyLtv: 70, landTenure: 20, landRateAdd: 0.5,          // land-only finance (the "land" kind): LTV, tenure (years), rate above lmRate — SAMA 70%, banks 20 years
  invLtv: 70, invTenure: 20, invRateAdd: 0.5, dscrMin: 1.25,  // income-property finance (a building let out entirely): LTV, tenure, rate above lmRate, debt-service cover the bank wants
  plCap: 3000000,          // bank product ceiling on a single personal loan (the 33%-of-income rule usually binds first)
  perLoanCap: 33,          // one PERSONAL LOAN's instalment may not exceed this % of income (a second personal loan may use what is left of the bucket)
  mortgageCap: 55,         // a MORTGAGE's instalments (land purchase, existing property, cash-out) may not exceed this % of income
  landLtv: 90,             // max LTV when the bank finances the land purchase (cash-raising mortgages: 70%)
  recoveryMonths: 24,      // your rule: cash must be back at the buffer within this many months after the project end
  minCashMoveIn: 0,        // your rule: cash at project end (left from own cash + every loan − costs, plus what the salary saved; no growth) must be at least this
  refiMinMonths: 12,
  rentOutPct: 0,           // let the new home out: annual rent as % of the all-in project cost (0 = you live in it)
  rentOutFixed: 0,         // …or a fixed annual rent in SAR (overrides the % when above zero)       // a personal loan can only be refinanced (bought out) once it has run this many months; mortgages never are
  cashoutLtv: 70,          // max LTV for a mortgage raised against an owned, completed home ("cash-out")
  // the properties you ALREADY own (none until you add one): each may be mortgaged (equity release), let or sold — see the
  // data model above and reNormProps. ownedLtv is the default LTV of a mortgage on one (SAMA: 70% on a property that is not
  // your first home)
  properties: [], ownedLtv: 70,
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
     eq  mortgage on a property you ALREADY own (its LTV × its value less the loan secured on it; plan.mortgages says which and
         when — one facility eq:<id> per property)
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
  mortgages: {}, eqMode: "max", eqAmount: 0, // mortgages on properties you own: { [propertyId]: { when: "start" | "land" | "build" | "completion" | "month", month } } — one step per property, a facility eq:<id> each
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
  prepayAfter: null, // pay off the mortgages early from your cash this many months after the project end (null = never)
  pl2Use: false, // a second personal-loan step at completion (bank max, refinancing older personal loans automatically)
  // تضامن only: who takes the personal loans at both steps — "me" (you), "spouse" (your spouse, on their own income and room)
  // or "both" (each of you the bank's maximum); ignored without تضامن
  plBy: "me",
};
// your rule: EVERY new loan (mortgage, personal loan, cash-out, refinance) is taken at the bank's maximum that month.
const RE_PLAN_PRESETS = {
  landMortgage: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) · cash for the build",
    lmUse: true },
  landPlusOwned: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) + mortgage my existing property (max) at build start",
    lmUse: true, mortgages: { p1: { when: "build", month: 0 } } },
  ownedOnly: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property (max) at the start · no mortgage on the new land",
    mortgages: { p1: { when: "start", month: 0 } } },
  ownedAtLand: { ...RE_PLAN_DEFAULTS, name: "Mortgage my existing property (max) when the land is bought · land in cash",
    mortgages: { p1: { when: "land", month: 0 } } },
  cashPlusPersonal: { ...RE_PLAN_DEFAULTS, name: "Cash + personal loan(s) (max) when the land is bought · no mortgage",
    plWhen: "land" },
  landPlusPersonal: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) + personal loan(s) (max) at build start",
    lmUse: true, plWhen: "build" },
  landThenCashOut: { ...RE_PLAN_DEFAULTS, name: "Mortgage the new land (max) → cash-out (max) on the finished home",
    lmUse: true, coUse: true },
  allCash: { ...RE_PLAN_DEFAULTS, name: "All cash · no new borrowing", settlePolicy: "none" },
};
// the new tool starts with no property of yours, so its default plans use none (the presets that mortgage one apply to the
// first property you add, "p1")
RE_BASE.plans = [
  { enabled: true, ...RE_PLAN_PRESETS.landMortgage },
  { enabled: true, ...RE_PLAN_PRESETS.landPlusPersonal },
  { enabled: true, ...RE_PLAN_PRESETS.landThenCashOut },
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
  eq: (o) => (!!o.eqWhen && o.eqWhen !== "none") || rePlanMorts(o).length > 0,
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
  // a scenario of the old tool (mode / acquire, ownedValue, ownHomePlan, plans with eqWhen…, no kind) is brought into the v2
  // model first — once: the result carries `kind`, so merging it again changes nothing
  if (re2IsOld(inp)) inp = re2Import(inp);
  const p = { ...RE_BASE, ...inp };
  // the project kind says how it is acquired; the household simulation is the one engine of v2 (mode "home")
  if (!RE_KINDS[p.kind]) p.kind = RE_BASE.kind;
  p.mode = "home"; p.acquire = RE_KINDS[p.kind].acquire;
  if (p.occupancy !== "let") p.occupancy = "liveLet";
  if (p.unitRentBasis !== "sqm" && p.unitRentBasis !== "pct") p.unitRentBasis = "unit";
  if (p.landZakat !== "trade") p.landZakat = "none";
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
    q.mortgages = reNormMorts(q.mortgages);   // its mortgages on properties you own (a fresh object per plan)
    return q;
  });
  p.existingLoans = reNormLoans(inp && inp.existingLoans ? inp.existingLoans : RE_BASE.existingLoans, "");
  // the properties you already own, with their defaults
  p.properties = reNormProps(inp && inp.properties ? inp.properties : RE_BASE.properties, p);
  // تضامن: your spouse's income and loans (their loan ids start with "s", so they never clash with yours)
  const j = { ...RE_BASE.joint, ...(inp && inp.joint ? inp.joint : {}) };
  p.joint = { ...j, loans: reNormLoans(j.loans || [], "s") };
  // a loan a property names (existingLoanId) is secured on it, like a loan that says so itself (securedOn): a mortgage either way
  p.properties.forEach((P) => { if (P.existingLoanId == null) return; const l = p.existingLoans.concat(p.joint.loans).find((x) => String(x.id) === String(P.existingLoanId)); if (l) { if (l.securedOn == null) l.securedOn = P.id; l.type = "mortgage"; } });
  return p;
}
// existing loans with their defaults; a rate quoted flat ("hamish": on the original amount, over the whole term) becomes the
// APR the loan amortises at — the whole term is the months already paid + the months left. Marked "apr" afterwards, so
// merging again changes nothing.
function reNormLoans(list, idPrefix) {
  return list.map((l, i) => {
    const q = { id: idPrefix ? `${idPrefix}${i + 1}` : i + 1, name: `${idPrefix ? "Spouse's loan" : "Loan"} ${i + 1}`, balance: 0, installment: 0, monthsLeft: 0, rate: 6, canSettle: true, canRefi: true, ageMonths: null, securedOn: null, ...l };
    // what kind of loan it is: a personal loan (the default) counts as one of the two personal loans a person may have and
    // may be bought out or paid off to make room; a mortgage never does, and it counts in the mortgage limit instead.
    // A loan secured on one of your properties (securedOn = its id) is a mortgage by definition
    if (q.securedOn === "" || q.securedOn === undefined) q.securedOn = null;
    q.type = q.type === "mortgage" || q.securedOn != null ? "mortgage" : "personal";
    if (q.rateType === "flat") { q.flatRate = q.rate; q.rate = reFlatToApr(q.rate, Math.max(1, Math.round((q.ageMonths || 0) + (q.monthsLeft || 0)))); q.rateType = "apr"; }
    return q;
  });
}
// SAMA Responsible Lending Principles for Individual Customers, Chapter IV ¶15–17: the most ALL of a person's monthly credit
// obligations may take of their total monthly income — 55% up to 15,000 SAR (65% for a MoH / REDF-supported mortgage), 65%
// above 15,000 and below 25,000, and from 25,000 the bank's own policy. Never above your bank's limit (dbrCap).
const reSamaCap = (income, dbrCap, redf) => income <= 15000 ? Math.min(dbrCap, redf ? 65 : 55) : income < 25000 ? Math.min(dbrCap, 65) : dbrCap;

/* ---------- v2 model: project kinds, your properties, a plan's mortgages on them, the import of old scenarios ---------- */
// the five projects and how each is acquired (mode is always "home": one household simulation)
// (home = a home of yours — the villa kinds, where RETT first-home relief applies; building = units that are let; land = land only)
const RE_KINDS = {
  landVilla: { acquire: "build", home: true, building: false, land: false, label: "Buy land and build a villa" },
  readyVilla: { acquire: "buy", home: true, building: false, land: false, label: "Buy a ready villa" },
  land: { acquire: "build", home: false, building: false, land: true, label: "Buy land only" },
  landBuilding: { acquire: "build", home: false, building: true, land: false, label: "Buy land and build a residential building" },
  readyBuilding: { acquire: "buy", home: false, building: true, land: false, label: "Buy a ready residential building" },
};
// land only: the white-land fee applies while your undeveloped plots in the city (this one + whiteLandOtherArea) add up to
// 5,000 m² or more; zakat on land held to sell is 2.5% of its market value a year (ZATCA: trade goods)
const RE_WHITE_LAND_MIN_AREA = 5000, RE_LAND_ZAKAT_PCT = 2.5;
// calendar: month 0 is the scenario's as-of month (p.asOf, YYYY-MM; this month when it is missing)
const reYm = (v) => { const m = /^(\d{4})-(\d{1,2})$/.exec(String(v == null ? "" : v).trim()); return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], m: +m[2] } : null; };
const reAsOf = (p) => reYm(p && p.asOf) || (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; })();
// a month written YYYY-MM as a simulation month (negative = already past); null when it is not a month
function reMonthIndex(p, ym) { const a = reYm(ym); if (!a) return null; const z = reAsOf(p); return (a.y - z.y) * 12 + (a.m - z.m); }
// the calendar month (1 = January … 12 = December) of simulation month t
function reCalMonth(p, t) { const z = reAsOf(p); return ((z.m - 1 + Math.round(t || 0)) % 12 + 12) % 12 + 1; }
// a building's units and their rent: the units you let (all of them, or all but the one you live in), the rent per unit a
// month (as entered, or a rent per m² a year on the net lettable share of the built area, spread over the units), the gross
// rent a year and the net rent a year after vacancy and the management fee (VAT on the fee). Zeros for a villa or land.
function reLetting(p, prj) {
  const K = RE_KINDS[p.kind], isB = prj && prj.isBuilding != null ? !!prj.isBuilding : !!(K && K.building);
  const units = isB ? Math.max(0, Math.round(+p.unitCount || 0)) : 0;
  const letUnits = Math.max(0, units - (p.occupancy === "liveLet" ? 1 : 0));
  const rent = Math.max(0, +p.unitRent || 0);
  // "pct" (the default): the whole building's rent a year as a % of the all-in cost, spread over the units; "unit": SAR a month
  // per unit; "sqm" (older saved scenarios only — the page converts them to "pct"): SAR/m² a year on the net lettable area
  const perUnit = units <= 0 ? 0 : p.unitRentBasis === "pct" ? (+(prj && prj.total) || 0) * Math.max(0, +p.unitRentPct || 0) / 100 / units / 12
    : p.unitRentBasis === "sqm" ? (+(prj && prj.builtArea) || 0) * (+p.netLettablePct || 0) / 100 * rent / units / 12 : rent;
  const grossAnnual = letUnits * perUnit * 12;
  const netAnnual = grossAnnual * (1 - (+p.vacancyPct || 0) / 100) * (1 - (+p.mgmtPct || 0) / 100 * (1 + (+p.vatPct || 0) / 100));
  return { units, letUnits, perUnit, grossAnnual, netAnnual };
}
// the properties you already own, with their defaults (ids p1, p2, … when missing); at most one is the home you live in today;
// at most RE_MAX_PROPS of them
const RE_MAX_PROPS = 6;
function reNormProps(list, p) {
  const ltv0 = p && p.ownedLtv != null && p.ownedLtv !== "" ? +p.ownedLtv : 70;
  const num = (v, d) => v == null || v === "" || isNaN(+v) ? d : +v;
  let home = false;
  return (Array.isArray(list) ? list : []).filter(Boolean).slice(0, RE_MAX_PROPS).map((x, i) => {
    const q = { id: `p${i + 1}`, name: `Property ${i + 1}`, value: 0, ltv: ltv0, canMortgage: true, rentNow: 0, isHome: false, plan: "keep", sellAt: "moveIn", letAfterMove: false, letYield: 3, sellCostPct: 2.5, existingLoanId: null, ...x };
    q.id = q.id == null || q.id === "" ? `p${i + 1}` : String(q.id);
    q.name = q.name == null || q.name === "" ? `Property ${i + 1}` : String(q.name);
    q.value = Math.max(0, num(q.value, 0)); q.ltv = Math.max(0, num(q.ltv, ltv0)); q.letYield = num(q.letYield, 3); q.sellCostPct = num(q.sellCostPct, 2.5);
    q.canMortgage = q.canMortgage !== false; q.letAfterMove = !!q.letAfterMove;
    q.isHome = !!q.isHome && !home; if (q.isHome) home = true;
    q.rentNow = q.isHome ? 0 : Math.max(0, num(q.rentNow, 0));   // the home you live in earns no rent
    q.plan = q.plan === "sell" ? "sell" : "keep";
    q.sellAt = q.sellAt === "moveIn" || q.sellAt == null || q.sellAt === "" || isNaN(+q.sellAt) ? "moveIn" : Math.max(0, Math.round(+q.sellAt));
    q.existingLoanId = q.existingLoanId == null || q.existingLoanId === "" ? null : q.existingLoanId;
    return q;
  });
}
// is existing loan l secured on property P? (the loan says so with securedOn, or the property names it with existingLoanId)
const reSecuredOn = (l, P) => !!P && ((l.securedOn != null && String(l.securedOn) === String(P.id)) || (P.existingLoanId != null && String(P.existingLoanId) === String(l.id)));
// a plan's mortgages on properties you own, as a list of the steps that happen: [{ id, when, month }]
// (accepts the object form { [id]: { when, month } } and a list [{ id, when, month }]; "none" steps are left out)
function rePlanMorts(o) {
  const m = o && o.mortgages;
  if (!m || typeof m !== "object") return [];
  const list = Array.isArray(m) ? m.map((x) => x && { ...x }) : Object.entries(m).map(([id, x]) => x && typeof x === "object" ? { id, ...x } : null);
  return list.filter((x) => x && x.id != null && x.when && x.when !== "none").map((x) => ({ id: String(x.id), when: x.when, month: Math.max(0, Math.round(+x.month || 0)) }));
}
// the month a plan's step happens: start = 0, land = the land purchase, build = construction start, completion = move-in,
// month = the month set (−1 = never)
const reStepMonth = (prj, w, m) => w === "start" ? 0 : w === "land" ? prj.landMonth : w === "build" ? prj.start : w === "completion" ? prj.occupy : w === "month" ? Math.max(0, Math.round(m || 0)) : -1;
// …normalised back to the object form (a fresh object; merging again changes nothing)
function reNormMorts(m) { const out = {}; rePlanMorts({ mortgages: m }).forEach((x) => { out[x.id] = { when: x.when, month: x.month }; }); return out; }
// the timing word of a plan's (first) existing-property mortgage, "none" when it takes none — for titles and the search
const reEqWhen = (o) => { const m = rePlanMorts(o)[0]; return m ? m.when : "none"; };

/* ---------- the old tool's scenarios → the v2 model ---------- */
// the old tool's defaults that the new tool changed, and its default plan in each slot (frozen here, so an imported scenario
// keeps giving the old tool's answers whatever the new defaults become)
const RE2_OLD = {
  lmRate: 4.5, plRate: 4.0, cashAvailable: 1000000, ownedValue: 7000000, ownedLtv: 70, rentNow: 8000, ownHomeYield: 3, ownHomeSellCostPct: 2.5,
  slots: [
    { enabled: true, name: "Mortgage the new land (max) · cash for the build", lmUse: true },
    { enabled: true, name: "Mortgage the new land (max) + mortgage my existing property (max) at build start", lmUse: true, eqWhen: "build" },
    { enabled: true, name: "Mortgage my existing property (max) at the start · no mortgage on the new land", eqWhen: "start" },
    { enabled: true, name: "Cash + personal loan(s) (max) when the land is bought · no mortgage", plWhen: "land" },
  ],
  slotAfter: { name: "Mortgage the new land (max) · cash for the build", lmUse: true },   // slots 5+: the old fallback preset (not enabled by itself)
};
// is this a scenario of the old tool? (no kind; one of the keys only the old tool wrote, or a plan with eqWhen / eqMonth /
// mortgageWhen). A scenario that carries `properties` is the new model whatever else it holds.
function re2IsOld(inp) {
  if (!inp || inp.kind != null || inp.properties !== undefined) return false;
  if (["mode", "acquire", "ownedValue", "ownHomePlan", "ownHomeYield", "ownHomeSellCostPct", "options"].some((k) => inp[k] !== undefined)) return true;
  return Array.isArray(inp.plans) && inp.plans.some((o) => o && (o.eqWhen !== undefined || o.eqMonth !== undefined || o.mortgageWhen !== undefined));
}
// one plan of the old shape → the new: eqWhen / eqMonth become a mortgage step on property `eqId`; a plan that already says
// `mortgages` (and no eqWhen) keeps it; slot (optional) fills in the old tool's preset for that slot first, as the old mergeRE did
function re2ImportPlan(o, eqId, slot) {
  const base = slot == null ? {} : (RE2_OLD.slots[slot] || RE2_OLD.slotAfter);
  const q = slot == null ? { ...(o || {}) } : { ...RE_PLAN_DEFAULTS, ...base, ...(o || {}) };
  const hasOld = q.eqWhen !== undefined || q.eqMonth !== undefined;
  const when = q.eqWhen == null ? "none" : q.eqWhen, month = q.eqMonth == null ? 0 : q.eqMonth;
  delete q.eqWhen; delete q.eqMonth;
  if (hasOld || q.mortgages == null) q.mortgages = when === "none" ? {} : { [eqId || "p1"]: { when, month } };
  return q;
}
// an old-tool scenario → the v2 model, so that the new engine gives the old engine's numbers; a scenario that already has
// `kind` is returned as it is
function re2Import(old) {
  const o = old || {};
  if (o.kind != null) return o;
  const out = { ...o };
  const mode = o.mode === "rental" ? "rental" : "home", acquire = o.acquire === "buy" ? "buy" : "build";
  out.kind = mode === "rental" ? (acquire === "buy" ? "readyBuilding" : "landBuilding") : (acquire === "buy" ? "readyVilla" : "landVilla");
  // the old rental mode: a building let out entirely (its numbers differ by design); its monthly rent becomes one let unit
  if (mode === "rental") { out.occupancy = "let"; out.legacyRental = true; if (out.unitCount == null) { out.unitCount = 1; out.unitRentBasis = "unit"; out.unitRent = o.rentMo == null || o.rentMo === "" ? RE_BASE.rentMo : +o.rentMo || 0; } }
  delete out.mode; delete out.acquire;
  // the old per-strategy bank terms, read once into the shared terms (as the old mergeRE did, from the raw old plans)
  if (Array.isArray(o.plans) && o.termsV == null) { const { terms } = reTermsFromPlans(o.plans); for (const [k, v] of Object.entries(terms)) if (out[k] == null) out[k] = v; }
  out.termsV = 1;
  // the old tool's defaults where the new tool's differ
  if (out.refiStyle == null) out.refiStyle = "consolidate";
  if (out.coverAny == null) out.coverAny = false;   // the old tool tried only the loan that closes a gap   // the old tool bought old loans out into new ones
  if (out.lmRate == null) out.lmRate = RE2_OLD.lmRate;
  if (out.plRate == null) out.plRate = RE2_OLD.plRate;
  if (out.cashAvailable == null || out.cashAvailable === "") out.cashAvailable = RE2_OLD.cashAvailable;
  out.propertyValueBasis = "today"; out.samaBands = false; out.rentFreezeUntil = null;
  // the property you own → properties[0] ("p1"): the home you live in when you pay no rent today; its keep / let / sell plan
  // only where the old engine applied it (no rent today, the new home not let out)
  const ov = o.ownedValue == null || o.ownedValue === "" ? RE2_OLD.ownedValue : +o.ownedValue || 0;
  const rentNow = o.rentNow == null || o.rentNow === "" ? RE2_OLD.rentNow : +o.rentNow || 0;
  const lettingOut = (+o.rentOutFixed || 0) > 0 || (+o.rentOutPct || 0) > 0;
  const isHome = !(rentNow > 0), hp = isHome && !lettingOut && (o.ownHomePlan === "let" || o.ownHomePlan === "sell") ? o.ownHomePlan : "keep";
  out.properties = ov > 0 ? [{ id: "p1", name: isHome ? "your current home" : "your property", value: ov, ltv: o.ownedLtv == null || o.ownedLtv === "" ? RE2_OLD.ownedLtv : +o.ownedLtv, canMortgage: true, rentNow: 0, isHome,
    plan: hp === "sell" ? "sell" : "keep", sellAt: "moveIn", letAfterMove: hp === "let", letYield: o.ownHomeYield == null || o.ownHomeYield === "" ? RE2_OLD.ownHomeYield : +o.ownHomeYield, sellCostPct: o.ownHomeSellCostPct == null || o.ownHomeSellCostPct === "" ? RE2_OLD.ownHomeSellCostPct : +o.ownHomeSellCostPct, existingLoanId: null }] : [];
  ["ownedValue", "ownedLtv", "ownHomePlan", "ownHomeYield", "ownHomeSellCostPct"].forEach((k) => delete out[k]);
  // the plans: written out against the old tool's slot presets (the old mergeRE filled each slot from them), eqWhen → mortgages.p1
  out.plans = (Array.isArray(o.plans) ? o.plans : RE2_OLD.slots.map(() => ({}))).map((q, i) => re2ImportPlan(q, "p1", i));
  return out;
}
// principal an annuity of `pmt` per month supports at rAnnual over n months
function rePrincipalFor(pmt, rAnnual, n) {
  if (pmt <= 0 || n <= 0) return 0;
  const r = rAnnual / 100 / 12;
  return r === 0 ? pmt * n : pmt * (1 - Math.pow(1 + r, -n)) / r;
}

/* ---------- project cost build-up, per kind (RE_KINDS) ----------
   landVilla / readyVilla: as the old tool (bit-identical). landBuilding / readyBuilding: the same cost build-up (floors × builtPct
   drive the area, finishExtra) and the same value path (the cost approach: land grows, the building ages); the units' rent via
   reLetting. land: the land, RETT (no first-home relief) and the broker's fee at landMonth and nothing else — no construction
   (hard = soft = cont = finish = overrun = vat = 0, bm = 0), no move-in: occupy = landMonth + 1 means "the project is paid for";
   the value is the land path; saleAt = the month of the sale you planned (landSellYear × 12, null = hold); holding = the
   holding costs (white-land fee from the first January after the purchase while the plots add up to 5,000 m², zakat on land
   held to sell), charged in rePlanSimulate through holdingAt(t). RETT first-home relief (firstHomeExempt) applies to the villa
   kinds only — a building or land is not a first home. A ready asset with readyLandShare set is land (growing) + a building
   that already stands, readyAge years old, losing buildDeprPct of its original value a year (so steeper on what you paid). */
function reProject(p) {
  const kind = RE_KINDS[p.kind] ? p.kind : "landVilla", K = RE_KINDS[kind];
  const build = K.acquire === "build";                 // land is bought (and, except for land only, built on)
  const construct = build && !K.land;                  // there is a construction
  const isLand = !!K.land, isBuilding = !!K.building;
  const moveIn = !!K.home || (isBuilding && p.occupancy !== "let");   // you live in it (a building let out entirely, land: no)
  const g = p.appreciation / 100;
  const landMonth = Math.max(0, Math.round(p.landMonth || 0));
  const start = construct ? Math.max(landMonth, Math.round(p.buildStart || 0)) : landMonth;
  const inflate = Math.pow(1 + (p.costInflation || 0) / 100, start / 12);   // construction priced at the month it starts
  const landToday = build ? p.landArea * p.landPrice : 0;
  const land = landToday * Math.pow(1 + g, landMonth / 12);                 // land priced at the month it is bought
  const price = build ? 0 : p.propertyPrice * Math.pow(1 + g, landMonth / 12);
  const builtArea = p.builtPct > 0 ? p.landArea * p.builtPct / 100 * (p.floors || 1) : p.builtArea;
  const hard = construct ? builtArea * p.buildCost * inflate : 0;
  const soft = hard * p.softPct / 100;
  const cont = (hard + soft) * p.contPct / 100;
  const finish = isLand ? 0 : p.finishExtra * inflate;
  const vatConstr = (hard + soft + cont) * p.vatPct / 100;
  const vatFinish = finish * p.vatPct / 100;
  const broker = price * p.brokerPct / 100;
  const landBroker = build ? land * (p.landBrokerPct || 0) / 100 : 0;          // paid with the land; not in value, RETT or the LTV
  const overrun = construct ? (hard + soft + cont + finish) * (p.overrunPct || 0) / 100 : 0;   // extra cost only — the home is not worth more
  const vatOverrun = overrun * p.vatPct / 100;
  const rettBase = build ? land : price;
  // first-home relief (the state bears RETT on the first rettExemptCap of a citizen's first home): the villa kinds only
  const exempt = K.home && p.firstHomeExempt ? Math.min(rettBase, p.rettExemptCap) : 0;
  const rett = (rettBase - exempt) * p.rettPct / 100;
  const total = land + price + rett + broker + landBroker + hard + soft + cont + finish + overrun + vatConstr + vatFinish + vatOverrun;
  const bm = construct ? Math.max(1, Math.round(p.buildMonths)) : 0;
  const occupy = start + bm + 1; // first month of living in / letting — for land: the month after the land is paid for
  // monthly spend schedule, index = month
  const schedule = new Array(occupy).fill(0);
  if (construct) {
    schedule[landMonth] += land + rett + landBroker;
    const perMo = (hard + soft + cont + vatConstr + overrun + vatOverrun) / bm;
    for (let t = start + 1; t <= start + bm; t++) schedule[t] += perMo;
    schedule[start + bm] += finish + vatFinish;
  } else if (isLand) {
    schedule[landMonth] += land + rett + landBroker;
  } else {
    schedule[landMonth] += price + rett + broker + finish + vatFinish;
  }
  // market value: nothing before the land is bought. The LAND grows with the market from the month it is bought. The
  // BUILDING is worth what it cost (construction + design + extras) × (1 + self-build uplift) — the uplift is on what you
  // build, not the land — accruing with progress during construction, then losing buildDeprPct % of that value a year from
  // completion (straight-line, never below 0). VAT, RETT, fees, contingency and overruns add no value. A ready home bought
  // as such keeps price + finishing growing with the market (its land/building split is unknown) — unless readyLandShare
  // says what share of the price is land: then the land grows and the building (the rest + finishing), readyAge years old,
  // keeps ageing. readyParts (internal) values a ready villa like the home you would build: the same land, and a building
  // that already stands. Land only: the land path.
  const dep = Math.max(0, p.buildDeprPct == null ? 0 : p.buildDeprPct) / 100;
  const done = construct ? start + bm : landMonth;                // the month the building is complete
  const buildValue = construct ? (hard + soft + finish) * (1 + p.devMarginPct / 100) : 0;
  const ready = !build && p.readyParts ? p.readyParts : null;
  const shareIn = p.readyLandShare, share = shareIn == null || shareIn === "" || isNaN(+shareIn) ? null : Math.min(100, Math.max(0, +shareIn));
  const split = !build && !ready && share != null ? { land: price * share / 100, building: price * (1 - share / 100) + finish, age: Math.max(0, +p.readyAge || 0) } : null;
  const valueAt = (t) => {
    if (t < landMonth) return 0;
    const yrs = (t - landMonth) / 12;
    if (isLand) return land * Math.pow(1 + g, yrs);
    if (build) return land * Math.pow(1 + g, yrs) + buildValue * Math.min(1, Math.max(0, (t - start) / bm)) * Math.max(0, 1 - dep * Math.max(0, t - done) / 12);
    if (ready) return ready.land * Math.pow(1 + g, yrs) + ready.building * Math.max(0, 1 - dep * yrs);
    // a building bought `age` years old: straight-line on its original value, so each year takes dep / (1 − dep × age) of what you paid
    if (split) return split.land * Math.pow(1 + g, yrs) + split.building * Math.max(0, 1 - dep * yrs / Math.max(0.05, 1 - dep * split.age));
    return (price + finish) * Math.pow(1 + g, yrs);
  };
  const landValueAt = (t) => t < landMonth ? 0 : (ready ? ready.land : split ? split.land : build ? land : price + finish) * Math.pow(1 + g, (t - landMonth) / 12);
  // buildings: the units and their rent; land: the sale you planned and the holding costs (charged month by month in rePlanSimulate)
  const letting = reLetting(p, { kind, isBuilding, builtArea, total });
  const sellAt = isLand && +p.landSellYear > 0 ? Math.round(+p.landSellYear * 12) : null;
  const saleAt = sellAt != null && sellAt > landMonth ? sellAt : null;   // you cannot sell before you own it
  const area = (+p.landArea || 0) + (+p.whiteLandOtherArea || 0);
  const whitePct = isLand && area >= RE_WHITE_LAND_MIN_AREA && +p.whiteLandPct > 0 ? +p.whiteLandPct : 0;
  const holding = isLand ? { whitePct, whiteFrom: whitePct > 0 ? landMonth + 13 - reCalMonth(p, landMonth) : null, zakatPct: p.landZakat === "trade" ? RE_LAND_ZAKAT_PCT : 0, area, minArea: RE_WHITE_LAND_MIN_AREA } : null;
  // what holding the land costs in month t while you own it: the white-land fee (from the first January after the purchase) and
  // zakat on land held to sell, each a yearly % of the land's market value, charged monthly (÷ 12)
  const holdingAt = (t) => !holding || t <= landMonth ? 0 : landValueAt(t) * ((holding.whiteFrom != null && t >= holding.whiteFrom ? holding.whitePct : 0) + holding.zakatPct) / 100 / 12;
  return { kind, build, construct, isLand, isBuilding, moveIn, units: letting.units, letting, saleAt, holding, holdingAt,
    land, landToday, price, hard, soft, cont, finish, overrun, vat: vatConstr + vatFinish + vatOverrun, broker, landBroker, rett, rettExempt: exempt, total, value0: valueAt(occupy - 1), buildValue, landValueAt, bm, occupy, start, landMonth, inflate, schedule, valueAt,
    builtArea, costPerSqm: construct && builtArea > 0 ? (total - land - rett - landBroker) / builtArea : 0 };
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
    const fullYears = years.filter((y) => y.year >= 1 && y.year * 12 >= prj.occupy + 11 && y.year < nY); // stabilised full years (a year counts once its first month is at or after the project end), excl. exit year
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
// value, seen from month t, of a loan's remaining payments — from month t + firstK to the horizon H — plus the balance still
// owed at H (discounted at H − t), at the monthly return on cash alt (net of zakat): the everything-grows measure of a loan.
// The refinance step (takePersonal) weighs every buy-out with it; the settle-or-keep advisor (reSettleAdvice) compares keeping,
// settling and a bank buy-out with it. (Extracted from takePersonal unchanged, so refiOptions[].value is the same to the bit.)
function rePvPayments(bal, rateApr, inst, firstK, t, H, alt) {
  const r = rateApr / 1200; let b = bal, pv = 0, k = firstK;
  while (b > 0.5 && t + k <= H) { const i = b * r, pay = Math.min(b + i, inst); b -= pay - i; pv += pay / Math.pow(1 + alt, k); k++; }
  return pv + (b > 0.5 ? b / Math.pow(1 + alt, Math.max(0, H - t)) : 0);
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
  const prepayAsap = plan.prepayAfter === "asap", netReturnPct = (Math.pow(1 + alt, 12) - 1) * 100;   // early payoff "as soon as the cash allows"
  // this month's income and living costs (optional yearly growth) and the bank's limits, which follow your current income
  // تضامن (p.joint.on): your spouse's salary joins the household's (inc = yours + theirs); the bank tests each of you on your
  // own income — yours: dbrTarget / perLoanTarget / mortgageTarget, your spouse's: dbrTargetB / mortgageTargetB
  const J = p.joint && p.joint.on ? p.joint : null;
  const mortPct = p.mortgageCap == null ? p.dbrCap : p.mortgageCap;
  let inc = p.income, incA = p.income, incB = 0, liv = p.livingExpenses, dbrTarget = 0, perLoanTarget = 0, mortgageTarget = 0, dbrTargetB = 0, mortgageTargetB = 0, perLoanTargetB = 0, capPctA = p.dbrCap, capPctB = 0;
  const redf = !!(p.joint && p.joint.redf);   // a MoH / REDF-supported mortgage lifts SAMA's lowest band to 65%
  // (everything below depends on the year alone, so it is recomputed only when the year changes — the same values either way)
  let monthY = -1;
  const setMonth = (t) => {
    const y = Math.floor(Math.max(0, t - 1) / 12);
    if (y === monthY) return; monthY = y;
    incA = p.income * Math.pow(1 + (p.incomeGrowth || 0) / 100, y); liv = p.livingExpenses * Math.pow(1 + (p.livingGrowth || 0) / 100, y);
    // on your own: your bank's limit (dbrCap) — or, with samaBands, SAMA's band for your income that month (reSamaCap)
    if (!J) { inc = incA; capPctA = p.samaBands ? reSamaCap(incA, p.dbrCap, redf) : p.dbrCap; dbrTarget = inc * capPctA / 100; perLoanTarget = inc * p.perLoanCap / 100; mortgageTarget = inc * mortPct / 100; return; }
    // all instalments together under this; one personal loan's instalment under perLoanTarget; all mortgages under mortgageTarget
    const gB = J.incomeGrowth == null || J.incomeGrowth === "" ? (p.incomeGrowth || 0) : +J.incomeGrowth;
    incB = (+J.income || 0) * Math.pow(1 + gB / 100, y); inc = incA + incB;
    capPctA = reSamaCap(incA, p.dbrCap, J.redf); capPctB = reSamaCap(incB, p.dbrCap, J.redf);
    dbrTarget = incA * capPctA / 100; perLoanTarget = incA * p.perLoanCap / 100; mortgageTarget = incA * mortPct / 100;
    dbrTargetB = incB * capPctB / 100; mortgageTargetB = incB * mortPct / 100; perLoanTargetB = incB * p.perLoanCap / 100;
  };
  setMonth(0);
  const feeMonths = Math.max(0, p.settleFeeMonths);
  const events = [], flags = [];
  // existing loans (instalment floored at the annuity that clears the balance in the stated months)
  // (with تضامن your spouse's loans join them: owner "B" — the household pays them, the bank counts them against your spouse)
  const loans = p.existingLoans.map((l) => ({ ...l, owner: "A" })).concat(J ? (J.loans || []).map((l) => ({ ...l, owner: "B" })) : []).filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { ...l, bal: l.balance, left, installment: Math.max(l.installment, rePmt(l.balance, l.rate, left)), settledAt: null, interestPaid: 0, kind: "existing" }; });
  const loanPay = (bal, i, inst) => Math.min(bal + i, inst);

  // the new facilities
  // (pay / int / extra = this month's instalment, its profit part and the voluntary extra payment — working fields, stripped from the result)
  const mk = (key, label, rate, tenure, fees) => ({ key, label, bal: 0, pmt: 0, amount: 0, rate: reEffRate(p, rate, Math.max(1, Math.round(tenure * 12))) + (p.rateShock || 0), quoted: rate, tenure, n: Math.max(1, Math.round(tenure * 12)), fees: 0, feesPct: fees, startedAt: null, settledAt: null, interestPaid: 0, monthsPaid: 0, capacity: null, kind: key, name: label, pay: 0, int: 0, extra: 0 });
  const fLc = (f) => f.labelLc || f.label.toLowerCase();   // a facility's label inside a sentence ("the mortgage on Villa A")
  // bank terms are shared by every strategy (one set per loan type)
  // (land only: land finance — its own LTV (landOnlyLtv), tenure (landTenure) and a rate above the mortgage rate (landRateAdd))
  const lm = prj.isLand ? mk("lm", "Mortgage on the land", p.lmRate + (+p.landRateAdd || 0), p.landTenure, p.lmFeesPct) : mk("lm", prj.build ? "Mortgage on the new land" : "Mortgage on the purchase", p.lmRate, p.lmTenure, p.lmFeesPct);
  // mortgages on the properties you own: one facility per plan step (plan.mortgages), eq:<id>, in property order; a step on a
  // property you do not own gets a facility with no property, so the plan still says it lends nothing
  const props = p.properties || [];
  const eqSteps = rePlanMorts(plan);
  const mkEq = (key, P, step) => { const f = mk(key, P ? `Mortgage on ${P.name}` : "Mortgage on your existing property", p.eqRate, p.eqTenure, p.eqFeesPct); f.kind = "eq"; f.propId = P ? P.id : null; f.propName = P ? P.name : null; f.labelLc = P ? `mortgage on ${P.name}` : "mortgage on your existing property"; if (step) f.step = { id: step.id, when: step.when, month: step.month }; return f; };
  const eqs = props.filter((P) => eqSteps.some((m) => m.id === P.id)).map((P) => mkEq(`eq:${P.id}`, P, eqSteps.find((m) => m.id === P.id)))
    .concat(eqSteps.filter((m) => !props.some((P) => P.id === m.id)).map((m) => mkEq(`eq:${m.id}`, null, m)));
  // r.eq when the plan mortgages no property: a blank facility (its propId = the first property you may mortgage, as before)
  const eqBlank = () => { const P0 = props.find((x) => x.canMortgage && x.value > 0) || null; const f = mkEq("eq", null, null); f.propId = P0 ? P0.id : null; return f; };
  // تضامن: who takes the personal loans (plan.plBy) — you ("me", the default), your spouse or both of you; your spouse's are
  // spl (the first personal-loan step) and spl2 (at project end), on their own income and room
  const plBy = J && (plan.plBy === "spouse" || plan.plBy === "both") ? plan.plBy : "me", byA = plBy !== "spouse", byB = plBy !== "me";
  const P = J ? "Your personal loan" : "Personal loan";
  // a personal-loan step the tool takes in two parts (plan._split, see reCarryOut) runs as the first part on pl, the rest on pl2
  const sp = plan._split ? (plan._split.key === "pl2" ? `${P} planned for the project end` : P) : null;
  const pl = mk("pl", sp ? `${sp}, first part` : P, p.plRate, p.plTenure, 0);
  const pl2 = mk("pl2", sp ? `${sp}, second part` : `${P} at completion`, p.plRate, p.plTenure, 0);
  const co = mk("co", "Cash-out on the finished home", p.coRate, p.coTenure, p.coFeesPct);
  const rf = mk("rf", "Refinance (new personal loans)", p.plRate, p.plTenure, 0); // bank buy-out of personal loans, at the personal-loan rate & tenure
  const spl = mk("spl", "Your spouse's personal loan", p.plRate, p.plTenure, 0), spl2 = mk("spl2", "Your spouse's personal loan at completion", p.plRate, p.plTenure, 0);
  spl.owner = spl2.owner = "B";
  // (named in a sentence — "It buys out your personal loan" — so not capitalised)
  if (J) [pl, pl2, spl, spl2].forEach((f) => { f.name = f.label.charAt(0).toLowerCase() + f.label.slice(1); });
  const facs = byB ? [lm, ...eqs, pl, spl, co, pl2, spl2, rf] : [lm, ...eqs, pl, co, pl2, rf];
  const mortgages = [lm, ...eqs, co];   // every mortgage (the mortgage cap is for all of them together)
  // bridge money (only on a rerun, when no loan can cover a gap in time): a short balance costs this APR until the loan lands
  const bridging = !!plan._bridge, bridgeApr = p.bridgeRate != null && p.bridgeRate !== "" && !isNaN(+p.bridgeRate) ? +p.bridgeRate + (p.rateShock || 0) : pl.rate;
  let bridgeCum = 0;
  const activeExisting = () => loans.filter((l) => l.settledAt === null && l.bal > 0.5);
  const instOf = (f) => f.bal > 0.5 && f.settledAt === null ? f.pmt : 0;
  // (the bank-test sums below are plain loops in the same order as before — they run many times a month)
  const allInst = () => { let a = 0, b = 0; for (const l of loans) if (l.settledAt === null && l.bal > 0.5) a += l.installment; for (const f of facs) b += instOf(f); return a + b; };
  // تضامن: the land / purchase mortgage and the cash-out are joint; each one's instalment is split between you (shareA, fixed
  // when it is taken); every other loan is its owner's alone
  const isJoint = (f) => !!J && (f.key === "lm" || f.key === "co");
  const shareOf = (f, who) => { const a = isJoint(f) && f.shareA != null ? f.shareA : f.owner === "B" ? 0 : 1; return who === "A" ? a : 1 - a; };
  const instFor = (who) => { let a = 0, b = 0; for (const l of loans) if (l.settledAt === null && l.bal > 0.5 && l.owner === who) a += l.installment; for (const f of facs) b += instOf(f) * shareOf(f, who); return a + b; };
  // existing mortgages (loans typed "mortgage") count in the mortgage limit with the new ones, each against its owner
  const existMortFor = (who) => { let a = 0; for (const l of loans) if (l.settledAt === null && l.bal > 0.5 && l.type === "mortgage" && (who == null || l.owner === who)) a += l.installment; return a; };
  const mortFor = (who, except) => { let a = 0; for (const x of mortgages) if (x !== except) a += instOf(x) * shareOf(x, who); return a + existMortFor(who); };
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
  // a building's units (reLetting: net of vacancy and the management fee): let out entirely ("let") they are the whole-home
  // rent and you do not move in; with you living in one of them ("liveLet") they are let like an annex of your home
  const letB = prj.isBuilding && p.occupancy === "let", unitsNet = prj.letting ? prj.letting.netAnnual : 0;
  const annualRentOut = letB && unitsNet > 0 ? unitsNet : (p.rentOutFixed || 0) > 0 ? p.rentOutFixed : (p.rentOutPct || 0) > 0 ? prj.total * p.rentOutPct / 100 : 0;
  const lettingOut = annualRentOut > 0 || letB;
  // you move into the new home: a villa or a building you live in — not a home let out whole, never land (you keep paying the
  // rent you pay today, and the home you live in now stays as it is)
  const livesIn = prj.moveIn && !lettingOut;
  // part of the new home let while you live in it (annex / floor) — not when the whole home is let; a building's let units join it
  // (as % of the all-in cost a year — partRentPct — or a fixed SAR a year, which overrides the % when set)
  const partRent = !livesIn ? 0 : (p.partRentAnnual || 0) > 0 ? p.partRentAnnual : (p.partRentPct || 0) > 0 ? prj.total * p.partRentPct / 100 : 0;
  const annexRent = partRent + (livesIn && prj.isBuilding && unitsNet > 0 ? unitsNet : 0);
  // your properties (reNormProps): each appreciates with the market; each may be mortgaged by this plan (eqs above), earns the
  // rent it earns today on both sides, and is kept or sold. The home you own and live in today (isHome, no rent today) is
  // kept, let or sold when you move into the new one — not when the whole new home is let (you would stay where you are).
  let growT = -1, growV = 1;   // the market's growth factor to month t, computed once per month (the same product as before)
  const growAt = (t) => { if (t !== growT) { growT = t; growV = Math.pow(1 + p.appreciation / 100, t / 12); } return growV; };
  const propAt = (P, t) => P.value * growAt(t);
  const homeProp = props.find((x) => x.isHome && x.value > 0) || null;
  const ownPlan = livesIn && !(p.rentNow > 0) && homeProp && (homeProp.plan === "sell" || homeProp.letAfterMove) ? (homeProp.plan === "sell" ? "sell" : "let") : "keep";
  const ownedAt = (t) => (homeProp ? propAt(homeProp, t) : 0);
  // when each property is sold and on which side: the home you live in at project end (or a later month you set — never before:
  // you live there) on this side only; another property at project end on this side only (money for the project), or in a month
  // you set on BOTH sides (you would sell it whether or not you build) — never before month 1
  const saleOf = {};   // id → { t, side: "strategy" | "both" }
  props.forEach((P) => {
    if (P.plan !== "sell" || !(P.value > 0)) return;
    if (P.isHome) { if (ownPlan === "sell") saleOf[P.id] = { t: P.sellAt === "moveIn" ? prj.occupy : Math.max(prj.occupy, P.sellAt), side: "strategy" }; return; }
    saleOf[P.id] = P.sellAt === "moveIn" ? { t: prj.occupy, side: "strategy" } : { t: Math.max(1, P.sellAt), side: "both" };
  });
  const datedSale = (P) => (saleOf[P.id] && saleOf[P.id].side === "both" ? saleOf[P.id].t : null);
  const soldAt = {};   // id → the month it was sold, once it has been
  // what the bank lends on a property you mortgage: its value — today's, or the market value at the time (propertyValueBasis)
  // — times its LTV, less what you still owe on a loan already secured on it; nothing once it is sold
  const securedOn = (P) => loans.reduce((a, l) => a + (l.settledAt === null && l.bal > 0.5 && reSecuredOn(l, P) ? l.bal : 0), 0);
  const propLtvCap = (P, t) => soldAt[P.id] != null ? 0 : Math.max(0, (p.propertyValueBasis === "today" ? P.value : propAt(P, t)) * P.ltv / 100 - securedOn(P));
  let ownSale = null, partRentCum = 0, ownRentCum = 0, propRentCum = 0, dbrOverA = -Infinity;
  const sales = [];
  // the not-building side pays the existing loans on schedule and makes the same planned settlements you set (a settlement
  // you plan anyway is not an effect of building); when a property is sold in a month you set it gets the same proceeds
  // (renterSale) and repays the loan secured on it then (renterSettle)
  const settleEff = (l) => { const s = l.settleAt != null && l.settleAt > 0 ? Math.round(l.settleAt) : null; const d = props.map((P) => (reSecuredOn(l, P) ? datedSale(P) : null)).filter((x) => x != null); return d.length ? Math.min(s == null ? Infinity : s, ...d) : s; };
  const renterInst = new Array(H + 1).fill(0), renterDebt = new Array(H + 1).fill(0), renterSettle = new Array(H + 1).fill(0), renterSale = new Array(H + 1).fill(0);
  loans.forEach((l) => {
    let bal = l.bal; const s = settleEff(l);
    for (let t = 0; t <= H; t++) {
      if (t >= 1 && bal > 0.5) {
        if (t === s) { renterSettle[t] += reSettleCost(bal, l.rate, l.installment, Math.max(0, l.left - (t - 1)), feeMonths); bal = 0; }
        else { const i = bal * l.rate / 100 / 12; const pay = loanPay(bal, i, l.installment); bal -= pay - i; renterInst[t] += pay; }
      }
      renterDebt[t] += Math.max(0, bal);
    }
  });
  props.forEach((P) => { const d = datedSale(P); if (d != null && d <= H) renterSale[d] += propAt(P, d) * (1 - (P.sellCostPct || 0) / 100); });
  let landSale = null, holdingCum = 0;   // land only: the sale you planned (once), and what holding the land has cost so far
  // the Riyadh rent freeze (rentFreezeUntil, YYYY-MM, from the scenario's month 0): no rent growth — received or paid — until
  // that month; a rent set before it stays flat until then and takes its yearly steps from then on (the first one a year after
  // the freeze ends: rents are reviewed yearly). rentYears(t, s0) = the growth steps in month t of a rent first paid in month s0
  // (no freeze, or one already over by s0: steps from s0 — the old tool's numbers)
  const F = reMonthIndex(p, p.rentFreezeUntil);
  const rentYears = (t, s0) => { const b = F != null && F > s0 ? F : s0; return t < b ? 0 : Math.floor((t - b) / 12); };
  // …and a rent that follows a property's value (the home you let after moving): frozen at its first month until then, then on its own clock
  const rentClock = (t, s0) => F != null && F > s0 ? (t < F ? s0 : s0 + (t - F)) : t;
  let minCash = Infinity, minCashT = 0, belowBufferMonths = 0, shortfall = 0, fundingGap = 0, shortFrom = null;
  // the cash you actually have to spend: your household cash WITHOUT the return on cash (your rule — growth is never counted
  // as money you can spend). Whether a plan works, its lowest cash, the cash back at your cushion, the gaps a loan closes,
  // bridge money and the payoff checks all use it; the return still counts in the "everything grows" comparison
  let retCum = 0;
  const avail = () => cash - retCum;
  const payoffs = [];   // early payoffs from your own cash: { t, name, cost, fee }
  const prepaid = [];   // mortgages paid off early from your cash (your option): { t, name, key, cost, fee, inst }
  let prepaidTotal = 0, prepayFees = 0, refiDiffers = false;
  let settledTotal = 0, settleFees = 0, refiTotal = 0, roomSettled = 0, debtFreeT = null, breakEvenMonth = null, econBreakEven = null, cashRestoredT = null;
  const months = [];
  const yearOf = (t) => Math.max(0, Math.ceil(t / 12));
  const remainingSpend = (t) => { let s = 0; for (let k = t; k < prj.schedule.length; k++) s += prj.schedule[k] || 0; return s; };
  const when = (w, m) => reStepMonth(prj, w, m);

  // what the bank would lend on facility f this month: min(LTV cap, per-loan cap, total debt-burden room, product cap)
  function capacityOf(f, ltvCap, productCap) {
    if (J) return capacityJoint(f, ltvCap, productCap);
    const totalRoom = dbrTarget - allInst();                                   // what is left of the bucket this month
    let mortNew = 0; for (const x of mortgages) if (x !== f) mortNew += instOf(x);
    const mortRunning = mortNew + existMortFor(null);   // the mortgage cap is for all mortgages together, existing ones included
    const facCap = f.key === "pl" ? perLoanTarget * (plan.plSplit ? 2 : 1) : Math.max(0, mortgageTarget - mortRunning); // this facility's own ceiling inside the bucket
    const room = Math.max(0, Math.min(totalRoom, facCap));
    const byDbr = rePrincipalFor(room, f.rate, f.n);
    const cap = Math.max(0, Math.min(byDbr, ltvCap, productCap));
    const capName = totalRoom <= facCap ? `${capPctA}% total debt-burden cap` : f.key === "pl" ? `${p.perLoanCap}% per personal loan${plan.plSplit ? " (two loans)" : ""}` : `${p.mortgageCap}% mortgage cap${mortRunning > 0 ? " (all mortgages together)" : ""}`;
    return { cap, byDbr, byLtv: ltvCap, byProduct: productCap, room, totalRoom, facCap, limitedBy: cap <= 0 ? (ltvCap <= 0 ? "nothing to mortgage (value 0)" : "no debt-burden room") : cap === byDbr && byDbr < Math.min(ltvCap, productCap) ? capName : cap === ltvCap ? "LTV" : "bank cap" };
  }
  // تضامن: your share of a joint mortgage's instalment. Default (joint.myShare null): in proportion to your two rooms, so both
  // are used in full. A share you set (0–100%): the instalment the bank allows is the most that keeps each of you within your
  // own room at that split — min(your room ÷ your share, your spouse's room ÷ theirs)
  const myShare = J && J.myShare != null && J.myShare !== "" && isFinite(+J.myShare) ? Math.min(1, Math.max(0, +J.myShare / 100)) : null;
  const jointSplit = (roomA, roomB) => myShare == null ? { room: roomA + roomB, shareA: roomA + roomB > 0 ? roomA / (roomA + roomB) : 1 }
    : { room: myShare >= 1 ? roomA : myShare <= 0 ? roomB : Math.min(roomA / myShare, roomB / (1 - myShare)), shareA: myShare };
  // each of you has room under your own limit (all debts) and your own mortgage limit; a joint mortgage may use both rooms,
  // split as above; a mortgage on the property you own uses only yours
  function capacityJoint(f, ltvCap, productCap) {
    const roomOf = (who) => Math.max(0, Math.min((who === "A" ? dbrTarget : dbrTargetB) - instFor(who), (who === "A" ? mortgageTarget : mortgageTargetB) - mortFor(who, f)));
    // you are the borrower: while your own debts take more than your limit the bank lends you nothing, jointly or not (your
    // spouse over their limit simply adds no room)
    const overA = dbrTarget - instFor("A") < -0.5;
    const roomA = roomOf("A"), roomB = isJoint(f) && !overA ? roomOf("B") : 0, split = isJoint(f) && !overA ? jointSplit(roomA, roomB) : { room: roomA, shareA: 1 }, room = split.room;
    const byDbr = rePrincipalFor(room, f.rate, f.n);
    const cap = Math.max(0, Math.min(byDbr, ltvCap, productCap));
    const capName = overA ? `your debts already take more than your ${capPctA}% limit` : isJoint(f) ? `room left to you and your spouse (تضامن): ${fSAR(roomA)}/mo under your ${capPctA}% limit + ${fSAR(roomB)}/mo under your spouse's ${capPctB}%${myShare != null ? `, at the split you set (${Math.round(myShare * 100)}% yours)` : ""}` : `room left to you under your ${capPctA}% limit`;
    return { cap, byDbr, byLtv: ltvCap, byProduct: productCap, room, totalRoom: room, facCap: room, roomA, roomB, shareA: split.shareA, myShare, limitedBy: cap <= 0 ? (ltvCap <= 0 ? "nothing to mortgage (value 0)" : overA ? capName : "no debt-burden room") : cap === byDbr && byDbr < Math.min(ltvCap, productCap) ? capName : cap === ltvCap ? "LTV" : "bank cap" };
  }
  // a payoff from your cash carries why: "planned" (a settlement date you set) or "room" (before a mortgage, to free room in the
  // bank's test — forKey / forLabel name that mortgage; dearer = chosen because its rate is above the mortgage's)
  function doSettle(l, t, reason, why) {
    const cost = settleCost(l), fee = cost - l.bal, inst = instOfAny(l);
    cash -= cost; ccash -= cost; settledTotal += l.bal; settleFees += fee; l.settledAt = t; l.bal = 0; payoffs.push({ t, name: l.name, cost, fee, old: l.kind === "existing", why: why ? why.why : "room", forKey: why && why.forKey != null ? why.forKey : null, forLabel: why && why.forLabel != null ? why.forLabel : null, dearer: !!(why && why.dearer), rate: l.rate });
    events.push({ t, kind: "settle", text: `Settle ${l.name}: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — frees ${fSAR(inst)}/mo — ${reason}.` });
  }
  // only PERSONAL loans may be paid off early: existing loans you allow, the strategy's personal loan, a refinance taken as a personal loan.
  // Mortgages (land, existing property, cash-out, refinance into a mortgage) run to their end.
  const isPersonalFac = (f) => f.key === "pl" || f.key === "pl2" || f.key === "rf" || f.key === "spl" || f.key === "spl2";
  const pool = () => activeExisting().filter((l) => l.canSettle !== false && l.type !== "mortgage").concat(facs.filter((f) => isPersonalFac(f) && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null));
  // your rule: a personal loan is paid off with your own cash ONLY to clear room for a MORTGAGE (never for a personal loan).
  //   "asNeeded" — just enough personal loans that the mortgage covers the funding gap
  //   "forMax"   — as many personal loans as it takes for the mortgage to reach the most the property allows (LTV / product cap),
  //                when the mortgage is sized "max" (otherwise it behaves like asNeeded)
  //   "dearer"   — like forMax, but only old loans DEARER than the mortgage being granted (APR more than dearerMargin points above
  //                its rate) are paid off; a cheaper old loan is kept even if the mortgage then stays below its LTV
  //   "none"     — never. Legacy "all" behaves like "asNeeded".
  function settleFor(t, f, ltvCap, productCap, gapFn, mode) {
    if (isPersonalFac(f)) return;
    if (plan.settlePolicy === "none") return;
    const dearer = plan.settlePolicy === "dearer", margin = p.dearerMargin == null ? 0.25 : +p.dearerMargin;
    const forMax = (plan.settlePolicy === "forMax" || dearer) && mode === "max";
    const dbrBound = () => { const c = capacityOf(f, ltvCap, productCap); return c.byDbr < Math.min(ltvCap, productCap) - 1; };
    // paying off a loan only helps while the instalment test (not LTV or the product cap) limits the mortgage
    const more = () => dbrBound() && (forMax || gapFn() > capacityOf(f, ltvCap, productCap).cap + 1);
    let guard = 0;
    const skipped = new Set();   // loans your own cash can't cover: skip them and try the next one
    const tr = plan._trace || null;   // the optimizer's tally of what this step tried (see optimizeRE: when the settle policies are one run)
    while (more() && guard++ < 20) {
      // your spouse's loans: only to make room for a joint mortgage, and not while your own debts are over your limit (then only
      // paying off yours can help)
      const cands = pool().filter((l) => !skipped.has(l) && (l.owner !== "B" || (isJoint(f) && dbrTarget - instFor("A") >= -0.5)) && (!dearer || l.rate > f.rate + margin));
      if (!cands.length) break;
      const pick = cands.sort((a, b) => instOfAny(b) / settleCost(b) - instOfAny(a) / settleCost(a))[0];
      if (tr) { tr.n++; if (!(pick.rate > f.rate + margin)) tr.cheap = true; }
      // the bank wants the old loan cleared BEFORE it grants the mortgage, so the payoff must come from cash you already have
      // (a land mortgage drawn this month is owed to the seller — it is not your cash)
      const own = avail() - (lm.startedAt === t ? lm.amount : 0);
      if (own - settleCost(pick) < 0) {
        skipped.add(pick);
        events.push({ t, kind: "settle", text: `Cannot pay off ${pick.name} (${fSAR(settleCost(pick))}) before the ${fLc(f)}: only ${fSAR(Math.max(0, own))} of your own cash on hand.` });
        continue;
      }
      roomSettled += pick.bal; doSettle(pick, t, `from your own cash, before the bank grants the ${forMax ? "largest " : ""}${fLc(f)} — it frees instalment room in the bank's debt-burden test so the bank can lend more${dearer ? ` (at ${pick.rate.toFixed(2)}% it is dearer than the mortgage's ${f.rate.toFixed(2)}%)` : ""}`, { why: "room", forKey: f.key, forLabel: f.label, dearer });
    }
    if (skipped.size && more()) flags.push(`Not enough cash of your own to pay off ${[...skipped].map((l) => l.name).join(" + ")} before the ${fLc(f)} — the mortgage is limited to what fits without ${skipped.size > 1 ? "those payoffs" : "that payoff"}.`);
  }
  function originate(t, f, mode, fixedAmt, ltvCap, productCap, proceedsFirst, refuseWhy) {
    const cashBefore = cash;
    const gap = Math.max(0, remainingSpend(t) - (avail() - p.cashBuffer));
    // old loans are paid off from your own cash first (the bank requires it before granting the loan);
    // that lowers cash, so the gap is re-measured after each payoff
    const gapNow = () => Math.max(0, remainingSpend(t) - (avail() - p.cashBuffer));
    settleFor(t, f, ltvCap, productCap, () => mode === "fixed" ? Math.min(fixedAmt, gapNow()) : gapNow(), mode);
    const gapAfter = gapNow();
    const c = capacityOf(f, ltvCap, productCap);
    if (refuseWhy) { c.cap = 0; c.limitedBy = refuseWhy; }   // refused for a reason of its own (ltvCap is 0 then, so nothing was paid off for it)
    const want = mode === "max" ? c.cap : mode === "need" ? gapAfter : fixedAmt;
    const amount = Math.max(0, Math.min(want, c.cap));
    f.capacity = { t, ...c, want, mode, taken: amount, gap };
    if (amount < 1) {
      events.push({ t, kind: f.kind || f.key, text: `${f.label}: nothing available (${c.limitedBy}${gap > 0 ? `; funding gap ${fS(gap)}` : ""}).` });
      if (gap > 0) flags.push(`${f.label} at ${fMonText(t)} not possible: ${c.limitedBy}.`);
      return;
    }
    f.bal = amount; f.amount = amount; f.pmt = rePmt(amount, f.rate, f.n); f.startedAt = t; f.fees = amount * f.feesPct / 100;
    if (isJoint(f)) f.shareA = c.shareA;
    cash += amount - f.fees; ccash += amount - f.fees;
    const onePl = f.key === "pl" ? rePrincipalFor(perLoanTarget, f.rate, f.n) : Infinity;
    f.split = f.key === "pl" && plan.plSplit && amount > onePl + 1 ? [onePl, amount - onePl] : null;
    const dbr = allInst() / inc * 100;
    const basis = mode === "max" ? "the bank's maximum" : mode === "need" ? `the shortfall${gap > amount + 1 ? ` (${fS(gap)} needed)` : ""}` : "the amount you set";
    const debtTxt = J ? `debt burden now ${(instFor("A") / incA * 100).toFixed(0)}% of your income${incB > 0 ? ` and ${(instFor("B") / incB * 100).toFixed(0)}% of your spouse's` : ""}` : `debt burden now ${dbr.toFixed(0)}% of income`;
    const jointTxt = !isJoint(f) ? "" : f.shareA < 0.005 ? ` Taken jointly with your spouse (تضامن): all of the instalment counts against your spouse's income — your own room was already used.`
      : f.shareA > 0.995 ? ` Taken jointly with your spouse (تضامن): all of the instalment counts against your income — your spouse had no room left.`
      : ` Taken jointly with your spouse (تضامن): of the ${fSAR(f.pmt)}/mo instalment, ${fSAR(f.pmt * f.shareA)} counts against your income and ${fSAR(f.pmt * (1 - f.shareA))} against your spouse's (${Math.round(f.shareA * 100)}% / ${Math.round((1 - f.shareA) * 100)}%, in proportion to your room).`;
    events.push({ t, kind: f.kind || f.key, fac: f.key, text: `${f.label}: ${fS(amount)}${f.split ? ` as two new loans (${fS(f.split[0])} + ${fS(f.split[1])})` : ""} at ${f.quoted}%${p.rateQuote === "flat" ? ` flat (≈${f.rate.toFixed(2)}% APR)` : ""} over ${f.tenure} yrs — ${basis}; bank could lend up to ${fS(c.cap)} (limited by ${c.limitedBy}); instalment ${fSAR(f.pmt)}/mo; ${debtTxt}.${jointTxt} ${f.key === "lm" ? `The bank pays it directly to the seller; you pay the other ${fS(Math.max(0, (prj.build ? prj.land : prj.price) - amount))} of the price plus ${fS(prj.rett)} transfer tax${prj.landBroker > 0 ? ` and ${fS(prj.landBroker)} broker's fee` : ""}${f.fees > 1 ? ` and ${fS(f.fees)} bank fees` : ""} from your own cash.` : `Net to your cash ${fS(amount - f.fees)}.`}` });
    if (mode === "need" && gap > amount + 1) flags.push(`${f.label} covers ${fS(amount)} of a ${fS(gap)} shortfall (${c.limitedBy}).`);
  }
  // PERSONAL LOAN (refinance included): the bank lends its MAXIMUM as one or two new personal loans (each instalment ≤ perLoanCap,
  // together within what is left of the bucket; never more than two personal loans running at once). If buying out old personal
  // loans releases more cash, the bank does it automatically: it clears them directly from the new loan (no cash from you) and
  // pays you the rest. Only old personal loans at least refiMinMonths old (and not marked "may not refinance") qualify.
  // Every subset of eligible loans — including none — is tried; the one that puts the most cash in your hands is kept.
  // تضامن: a personal loan is its borrower's alone — yours (pl, pl2) on your income, room and loans, your spouse's (spl, spl2)
  // on theirs: the two-loan rule counts only that person's loans and only their own old loans can be bought out
  function takePersonal(t, f) {
    const minAge = p.refiMinMonths == null ? 12 : p.refiMinMonths;
    const who = f.owner === "B" ? "B" : "A", mine = who === "B" ? [spl, spl2] : [pl, pl2];
    const capTarget = who === "B" ? dbrTargetB : dbrTarget, perTarget = who === "B" ? perLoanTargetB : perLoanTarget, incW = who === "B" ? incB : incA;
    // the debt-burden limit as named in the texts (تضامن: each person's own SAMA band)
    const capTxt = !J ? `${capPctA}% total debt-burden cap` : `${who === "B" ? "your spouse's" : "your"} ${who === "B" ? capPctB : capPctA}% debt-burden limit`;
    const ofInc = !J ? "of income" : who === "B" ? "of your spouse's income" : "of your income";
    // personal loans already running: the borrower's existing loans + their other personal-loan step (two loans if it was split)
    const others = mine.filter((x) => x !== f && x.bal > 0.5 && x.settledAt === null && x.startedAt !== null);
    const old = activeExisting().filter((l) => (l.owner === "B") === (who === "B") && l.type !== "mortgage").concat(others);   // the borrower's personal loans only (a mortgage is neither a slot nor refinanceable)
    const loansOf = (l) => l.kind === "existing" ? 1 : (l.topups ? l.topups.length : l.split ? 2 : 1);
    const oldCount = old.reduce((a, l) => a + loansOf(l), 0);
    const ageOf = (l) => l.kind === "existing" ? (l.ageMonths == null ? Infinity : l.ageMonths + t) : t - l.startedAt;
    const mayRefi = (l) => l.kind !== "existing" || l.canRefi !== false;
    const eligible = old.filter((l) => mayRefi(l) && ageOf(l) >= minAge).slice(0, 8);
    const tooYoung = old.filter((l) => mayRefi(l) && ageOf(l) < minAge).map((l) => l.name);
    const instNow = J ? instFor(who) : allInst();
    const maxNew = plan.plSplit === false || plan._oneLoan === f.key ? 1 : 2;   // the first part of a step taken in two parts is one loan
    const onePl = (inst) => Math.min(rePrincipalFor(inst, f.rate, f.n), p.plCap);
    // value of a loan's remaining payments (from month t + firstK) up to the horizon plus the balance still owed then,
    // discounted at the return-on-cash rate — the everything-grows measure, seen from this month
    const pvPayments = (bal, rateApr, inst, firstK) => rePvPayments(bal, rateApr, inst, firstK, t, H, alt);
    const refiMode = plan.refiMode || "auto", topupStyle = p.refiStyle !== "consolidate";
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
      // refiStyle "topup": a new loan buys old ones out only when it is cheaper than they are (balance-weighted APR); otherwise
      // each old loan is refinanced by its own bank (the top-ups below)
      if (topupStyle && S.length && !picks && !(f.rate < S.reduce((a, l) => a + l.rate * l.bal, 0) / Math.max(1, S.reduce((a, l) => a + l.bal, 0)) - 1e-9)) continue;
      const freed = S.reduce((a, l) => a + instOfAny(l), 0), payoff = S.reduce((a, l) => a + settleCost(l), 0);
      const nNew = Math.min(maxNew, 2 - (oldCount - S.reduce((a, l) => a + loansOf(l), 0)));   // never more than two personal loans at once
      if (nNew < 1) { why = why || "two personal loans already running"; continue; }
      const totalRoom = Math.max(0, capTarget - (instNow - freed));
      const capInst = Math.min(perTarget, rePmt(p.plCap, f.rate, f.n));   // a loan's instalment stops at the 33% cap or where the bank's ceiling per loan binds
      const room = Math.min(totalRoom, nNew * capInst);
      const i1 = Math.min(room, capInst), i2 = nNew > 1 ? Math.max(0, room - i1) : 0;
      const p1 = i1 > 1 ? onePl(i1) : 0, p2 = i2 > 1 ? onePl(i2) : 0;
      const amount = p1 + p2;
      if (amount < 1) { why = why || "no room left in the bank's debt-burden test"; continue; }
      if (amount < payoff + 1) continue;                                 // the bank must clear the old loans in full
      const net = amount - payoff;
      const limitedBy = room < nNew * capInst - 1 ? `${capTxt}${capInst < perTarget - 1 && p1 >= p.plCap - 1 ? ` (the first loan is at the bank's ceiling of ${fS(p.plCap)})` : ""}` : capInst < perTarget - 1 ? `bank ceiling of ${fS(p.plCap)} per personal loan` : `${p.perLoanCap}% cap per personal loan${nNew > 1 ? " (two loans)" : ""}`;
      const value = net - pvPayments(p1, f.rate, rePmt(p1, f.rate, f.n), 1) - (p2 > 1 ? pvPayments(p2, f.rate, rePmt(p2, f.rate, f.n), 1) : 0) + S.reduce((a, l) => a + pvPayments(l.bal, l.rate, instOfAny(l), 0), 0);
      // why each new loan is the size it is: one loan stops at the per-loan limit (or the bank's ceiling per loan); the second
      // takes what is left of your room (or stops at the same limit)
      const oneWhy = capInst < perTarget - 1 ? `the bank's ceiling of ${fS(p.plCap)} per loan` : `the most one personal loan may take — instalment ≤ ${p.perLoanCap}% ${ofInc}`;
      const whys = [oneWhy, room < nNew * capInst - 1 ? (!J ? `what is left of your room under the ${capPctA}% limit` : who === "B" ? `what is left of your spouse's room under their ${capPctB}% limit` : `what is left of your room under your ${capPctA}% limit`) : oneWhy];
      const c = { S, freed, payoff, amount, net, value, split: p2 > 1 ? [p1, p2] : null, limitedBy, room, whys };
      cands.push(c);
      if (better(c, bestCash, "net")) bestCash = c;
      if (better(c, bestValue, "value")) bestValue = c;
      if (picks && S.length) pickBest = c;
      if (!S.length) noneBest = c;
    }
    // TOP-UPS (refiStyle "topup", the default for a scenario made in this tool): each old personal loan in T is refinanced
    // one-for-one by its own bank at this step's terms — the loan count does not change, so no slot is needed. Its new instalment
    // is its old one plus a share of the room still free (the dearest loan first), within the per-loan cap and the bank's
    // ceiling; the new loan clears the old one with its early-settlement fee and the rest lands in your cash. Loans on the same
    // rate and tenure add up to one exact annuity, so the step stays one facility (f.topups lists the parts).
    if (topupStyle) {
      const own = eligible.filter((l) => l.kind === "existing"), capInstT = Math.min(perTarget, rePmt(p.plCap, f.rate, f.n));
      for (let mask = 1; mask < (1 << own.length); mask++) {
        const T = own.filter((_, k) => mask & (1 << k)).sort((a, b) => b.rate - a.rate);
        if (picks && !(T.length === pickSet.length && T.every((l) => pickSet.includes(l)))) continue;
        let free = Math.max(0, capTarget - instNow), ok = true;
        const parts = [];
        for (const l of T) {
          const oldInst = instOfAny(l), payoff = settleCost(l), inst = Math.min(capInstT, oldInst + free), amount = inst > 1 ? onePl(inst) : 0;
          if (amount < payoff + 1) { ok = false; break; }
          const newInst = rePmt(amount, f.rate, f.n), freeBefore = free; free = Math.max(0, free - Math.max(0, newInst - oldInst));
          // why its instalment is what it is: the room still free, or the per-loan limit (the amount still grows: the term restarts)
          const pctTxt = who === "B" ? capPctB : capPctA;
          const why = newInst - oldInst < 1 ? (freeBefore < 1 ? `instalment kept at ${fSAR(newInst)}/mo — your ${pctTxt}% limit (${fSAR(capTarget)}/mo) is already full with your other instalments; the amount grows because the term restarts at ${f.tenure} years` : `instalment kept at ${fSAR(newInst)}/mo — the most one personal loan may take; the amount grows because the term restarts at ${f.tenure} years`)
            : `instalment ${fSAR(oldInst)} → ${fSAR(newInst)}/mo — ${newInst >= capInstT - 1 ? "the most one personal loan may take" : `all the room left under your ${pctTxt}% limit`}`;
          parts.push({ l, id: idOf(l), name: l.name, oldBal: l.bal, oldInst, payoff, amount, inst: newInst, net: amount - payoff, why });
        }
        if (!ok) continue;
        const amount = parts.reduce((a, x) => a + x.amount, 0), payoff = parts.reduce((a, x) => a + x.payoff, 0), freed = parts.reduce((a, x) => a + x.oldInst, 0), net = amount - payoff;
        const value = net - parts.reduce((a, x) => a + pvPayments(x.amount, f.rate, x.inst, 1) - pvPayments(x.l.bal, x.l.rate, x.oldInst, 0), 0);
        const c = { S: T, freed, payoff, amount, net, value, split: null, topups: parts, limitedBy: "each loan's own bank: its old instalment plus the room still free", room: Math.max(0, capTarget - instNow) + freed, whys: [] };
        cands.push(c);
        if (better(c, bestCash, "net")) bestCash = c;
        if (better(c, bestValue, "value")) bestValue = c;
        if (picks) pickBest = pickBest && pickBest.value >= c.value ? pickBest : c;
      }
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
    f.refiOptions = kept.map((c) => ({ ids: c.S.map(idOf), names: c.S.map((l) => l.name), amount: c.amount, payoff: c.payoff, net: c.net, value: c.value, split: c.split, topup: !!c.topups, chosen: c === best, bestValue: c === bestValue, bestCash: c === bestCash }));
    if (!best || best.net < 1) {
      const reason = best ? "would not release any cash" : (why || "no room left in the bank's debt-burden test") + (tooYoung.length ? `; ${tooYoung.join(" + ")} not yet ${minAge} months old, so not refinanceable` : "");
      f.capacity = { t, cap: 0, limitedBy: reason, want: 0, mode: "max", taken: 0, gap: 0 };
      events.push({ t, kind: f.key === "spl" || f.key === "spl2" ? "spl" : "pl", text: `${f.label}: nothing available — ${reason}.` });
      return;
    }
    const before = instNow;
    const cleared = best.S.map((l) => { const cost = settleCost(l), it = { id: idOf(l), name: l.name, cost, fee: cost - l.bal, old: l.kind === "existing" }; settleFees += it.fee; refiTotal += l.bal; l.settledAt = t; l.refinancedAt = t; l.bal = 0; return it; });
    f.bal = best.amount; f.amount = best.amount; f.split = best.split; f.startedAt = t; f.fees = 0;
    f.topups = best.topups ? best.topups.map(({ l, ...x }) => x) : null;
    if (best.topups) best.S.forEach((l) => { l.toppedUpAt = t; });
    f.pmt = best.split ? rePmt(best.split[0], f.rate, f.n) + rePmt(best.split[1], f.rate, f.n) : rePmt(best.amount, f.rate, f.n);
    cash += best.amount - best.payoff; ccash += best.amount - best.payoff;
    f.capacity = { t, cap: best.amount, room: best.room, limitedBy: best.limitedBy, want: best.amount, mode: "max", taken: best.amount, gap: 0 };
    f.refi = best.S.length ? { names: best.S.map((l) => l.name), payoff: best.payoff, net: best.net, freed: best.freed, items: cleared } : null;
    // the NEW loans (one or two) — not to be read as the old loans bought out, which are named after
    const loans = best.topups ? `${fS(best.amount)} by refinancing ${best.topups.length === 1 ? "an old loan with its own bank" : `${best.topups.length} old loans, each with its own bank`} (${best.topups.map((x) => `${x.name}: ${fS(x.payoff)} cleared, ${fS(x.amount)} new, ${fS(x.net)} to your cash — ${x.why}`).join("; ")})` : best.split ? `${fS(best.amount)} as two new personal loans: ${fS(best.split[0])} (${best.whys[0]}) + ${fS(best.split[1])} (${best.whys[1]})` : `one new personal loan of ${fS(best.amount)}`;
    const nOld = f.refi ? f.refi.names.length : 0;
    const basis = refiMode === "pick" ? "the loans you chose" : refiMode === "cash" ? "the most cash in hand" : "the best value";
    let note = "";
    if (picks && droppedPicks.length) note += ` Not bought out: ${droppedPicks.length} of the loans you chose (not running, not yet ${minAge} months old, or not allowed).`;
    if (picks && pickSet.length && !pickBest) note += " The loans you chose can't be cleared in full by this loan, so none is bought out.";
    if (refiMode !== "pick" && refiMode !== "cash" && bestCash && !sameS(bestCash, best) && bestCash.net > best.net + 1) note += ` Buying out ${bestCash.S.length ? bestCash.S.map((l) => l.name).join(" + ") : "no loan"} instead would put ${fS(bestCash.net - best.net)} more in your hands now but leave you ${fS((best.value - bestCash.value) / Math.pow(1 + alt, t))} poorer in today's money, so it is not done.`;
    // تضامن: whose loan it is, on whose income, and the two limits that size it
    const whoTxt = !J ? "" : ` — on ${who === "B" ? "your spouse's" : "your"} income of ${fSAR(incW)}/mo (one loan's instalment ≤ ${p.perLoanCap}% = ${fSAR(perTarget)}/mo; all ${who === "B" ? "their" : "your"} debts ≤ ${who === "B" ? capPctB : capPctA}% = ${fSAR(capTarget)}/mo)`;
    events.push({ t, kind: f.key === "spl" || f.key === "spl2" ? "spl" : "pl", fac: f.key, text: `${f.label}${whoTxt}: the bank lends its maximum — ${loans}${best.split ? ", both" : ""} at ${f.quoted}%${p.rateQuote === "flat" ? ` flat (≈${f.rate.toFixed(2)}% APR)` : ""} over ${f.tenure} yrs${best.split || best.topups ? "" : ` (limited by the ${best.limitedBy})`}.${f.topups ? ` Each bank clears its own old loan (incl. the early-settlement fee) from the new one — no cash from you — and pays you the rest: ${fS(best.net)} in all (chosen for ${basis}; no loans are combined, because a new loan here costs more than the old ones).` : f.refi ? ` It buys out ${nOld === 1 ? "1 old loan" : `${nOld} old loans`}, ${f.refi.names.join(" + ")} (chosen for ${basis}): the bank clears ${fS(best.payoff)} (incl. early-settlement fees) directly — no cash from you — and ${fS(best.net)} of the new loans lands in your cash.` : ` ${fS(best.amount)} lands in your cash; no old loan is bought out.`} ${J ? `${who === "B" ? "Your spouse's" : "Your"} instalments ${fSAR(before)} → ${fSAR(instFor(who))}/mo (${(instFor(who) / incW * 100).toFixed(0)}% of ${who === "B" ? "their" : "your"} income)` : `Instalments ${fSAR(before)} → ${fSAR(allInst())}/mo (${(allInst() / inc * 100).toFixed(0)}% of income)`}.${note}` });
  }
  const fMonText = (t) => `month ${t}`;

  const lmT = plan.lmUse ? prj.landMonth : -1;
  // plan._at moves a loan to the month your cash would run short (see reCarryOut)
  // (plan._off leaves one personal loan out — "is this loan worth it?" with تضامن)
  const at = plan._at || {}, off = plan._off || {};
  // each mortgage on a property you own: its plan step's month (or the month it is moved to when the cash runs short)
  const eqT = new Map(eqs.map((f) => [f, at[f.key] != null ? at[f.key] : when(f.step.when, f.step.month)]));
  const plT = !byA || off.pl ? -1 : at.pl != null ? at.pl : when(plan.plWhen, plan.plMonth), coT = plan.coUse && !prj.isLand ? prj.occupy : -1;   // (no cash-out on land: nothing finished to mortgage)
  const pl2T = plan.pl2Use && byA && !off.pl2 ? (at.pl2 != null ? at.pl2 : prj.occupy) : -1;
  // your spouse's personal loans: the same two steps (each may be moved on its own when the cash runs short)
  const splT = !byB || off.spl ? -1 : at.spl != null ? at.spl : when(plan.plWhen, plan.plMonth), spl2T = plan.pl2Use && byB && !off.spl2 ? (at.spl2 != null ? at.spl2 : prj.occupy) : -1;
  // BORROWING ROOM AT MONTH END (months.room / months.roomB / months.leverage — information only, no number depends on it):
  // recorded after the month's debt service and early payoffs, from the very functions the bank test reads at the start of
  // the next month (before its income step), so a facility taken next month with nothing else happening finds exactly this room
  // (capacity.totalRoom = room.dbr). room = { dbr: the person's limit − their instalments, mort: their mortgage limit − their
  // mortgages (existing ones included), plSlots: personal loans they may still take (two at most, a split step counts two),
  // capInst: the most one personal loan's instalment may be (per-loan cap, or the bank's ceiling per loan) }.
  // leverage = { personal: the two-loan personal-loan maximum (takePersonal's sizing with no buy-out), mortgage: min(LTV
  // headroom — each property you may mortgage: basis × ltv − the loan secured on it − this plan's mortgage on it; the new home
  // from the month it is complete: value × cashoutLtv − the land mortgage − the cash-out —, the principal min(room.dbr, room.mort)
  // carries at the owned-property mortgage terms), borrowable: the greedy one-bucket sum — the mortgage first, then personal
  // loans on the room left }. تضامن: a joint mortgage may use your spouse's room too (not while your own debts are over your
  // limit), its instalment split in proportion, and the personal part adds your spouse's own two-loan maximum.
  // (the terms are fixed for the whole run, so the annuity factors — principal per riyal of instalment — are computed once:
  // this record is made every month and must stay cheap)
  const eqN = Math.max(1, Math.round(p.eqTenure * 12)), eqR = reEffRate(p, p.eqRate, eqN) + (p.rateShock || 0);
  const eqPerInst = rePrincipalFor(1, eqR, eqN), plPerInst = rePrincipalFor(1, pl.rate, pl.n), plCapInst = p.plCap / plPerInst;
  const plsA = [pl, pl2], plsB = [spl, spl2];
  const plRunning = (who) => { let a = 0; for (const l of loans) if (l.settledAt === null && l.bal > 0.5 && l.owner === who && l.type !== "mortgage") a++; for (const f of (who === "B" ? plsB : plsA)) if (f.bal > 0.5 && f.settledAt === null && f.startedAt !== null) a += f.topups ? f.topups.length : f.split ? 2 : 1; return a; };
  const roomOf = (who) => ({ dbr: (who === "B" ? dbrTargetB : dbrTarget) - instFor(who), mort: (who === "B" ? mortgageTargetB : mortgageTarget) - mortFor(who), plSlots: Math.max(0, 2 - plRunning(who)), capInst: Math.min(who === "B" ? perLoanTargetB : perLoanTarget, plCapInst) });
  const onePlOf = (i) => i > 1 ? Math.min(i * plPerInst, p.plCap) : 0;
  const twoPl = (room0, R) => { const nNew = Math.min(2, R.plSlots); if (nNew < 1) return 0; const room = Math.min(Math.max(0, room0), nNew * R.capInst), i1 = Math.min(room, R.capInst), i2 = nNew > 1 ? Math.max(0, room - i1) : 0; return onePlOf(i1) + onePlOf(i2); };
  const leverageNow = (t, value, RA, RB) => {
    let ltv = 0;
    props.forEach((P) => { if (!P.canMortgage || !(P.value > 0)) return; const f = eqs.find((x) => x.propId === P.id); ltv += Math.max(0, propLtvCap(P, t) - (f && f.settledAt === null ? f.bal : 0)); });
    if (!prj.isLand && t >= prj.occupy - 1) ltv += Math.max(0, value * p.cashoutLtv / 100 - (lm.settledAt === null ? lm.bal : 0) - (co.settledAt === null ? co.bal : 0));
    const roomA = Math.max(0, Math.min(RA.dbr, RA.mort)), roomB = RB && RA.dbr >= -0.5 ? Math.max(0, Math.min(RB.dbr, RB.mort)) : 0;
    const split = RB && RA.dbr >= -0.5 ? jointSplit(roomA, roomB) : { room: roomA, shareA: 1 }, room = split.room;
    const mortgage = Math.max(0, Math.min(ltv, room * eqPerInst));
    const inst = mortgage > 0 ? mortgage / eqPerInst : 0, shareA = split.shareA;
    const personal = twoPl(RA.dbr, RA) + (RB ? twoPl(RB.dbr, RB) : 0);
    const left = twoPl(RA.dbr - inst * shareA, RA) + (RB ? twoPl(RB.dbr - inst * (1 - shareA), RB) : 0);
    return { personal, mortgage, borrowable: mortgage + left, ltv, room, inst };
  };
  for (let t = 0; t <= H; t++) {
    setMonth(t);
    const yrIdx = rentYears(t, 1);   // the rent you pay: set today, yearly steps from month 1 — held by the rent freeze
    const occupied = t >= prj.occupy;
    const rentEq = t >= 1 ? p.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx) : 0;
    const rentPaid = t >= 1 && !(occupied && livesIn) ? rentEq : 0;   // you pay rent until you move in — throughout if the new home is let out, or it is land
    const ret = t >= 1 && cash > 0 ? cash * alt : 0;   // return earned on the cash balance this month (kept for the cash breakdown)
    const rRet = t >= 1 && rCash > 0 ? rCash * alt : 0;   // …and on the not-building household's cash
    // the return-on-cash rate is GROWTH: it applies only while a balance is positive, never as a charge on a shortfall.
    // Both sides grow from today; the rule-6 "cash on hand at completion" is the same cash WITHOUT growth (ccash − cRetCum).
    const growNow = t >= 1;
    const bRet = growNow && bcash > 0 ? bcash * alt : 0, cRet = growNow && ccash > 0 ? ccash * alt : 0;
    bcash += bRet; ccash += cRet; cRetCum += cRet;
    bcash -= renterSettle[t];   // the not-building side makes your planned settlements too
    // rent from letting the new home out: from the month after completion, growing with the rent-growth setting
    const letIn = lettingOut && t > prj.occupy ? annualRentOut / 12 * Math.pow(1 + p.rentGrowth / 100, rentYears(t, prj.occupy + 1)) : 0;
    // …or part of it (annex, a building's let units), and the home you lived in before, let from the month after the project end
    const partIn = annexRent > 0 && t > prj.occupy ? annexRent / 12 * Math.pow(1 + p.rentGrowth / 100, rentYears(t, prj.occupy + 1)) : 0;
    const ownIn = ownPlan === "let" && t > prj.occupy ? ownedAt(rentClock(t, prj.occupy + 1)) * (homeProp.letYield || 0) / 100 / 12 : 0;
    const rentIn = letIn + partIn + ownIn;
    partRentCum += partIn; ownRentCum += ownIn;
    // the rent your properties earn today (held by the rent freeze like the rent you pay): into the household's cash on both
    // sides — never into the bank's income — until a property is sold (one sold at project end still earns it on the other side)
    let propRentIn = 0, propRentBase = 0;
    if (t >= 1) props.forEach((P) => { if (!(P.rentNow > 0)) return; const rn = P.rentNow * Math.pow(1 + p.rentGrowth / 100, yrIdx), s = saleOf[P.id]; if (!s || t <= s.t) propRentIn += rn; if (!s || s.side !== "both" || t <= s.t) propRentBase += rn; });
    propRentCum += propRentIn;
    // household cash grows only while it is positive (growth is never a charge on a shortfall); this month's salary and rent arrive after it
    // …and on a bridge rerun a short balance costs the bridge rate (a cost in both measures)
    // (the bridge is needed when the cash you can spend — without growth — is short)
    const a0 = avail(), bridgeInt = bridging && t >= 1 && a0 < -0.5 ? -a0 * bridgeApr / 1200 : 0;
    if (t >= 1) { cash = (cash > 0 ? cash * (1 + alt) : cash) - bridgeInt + inc - liv - rentPaid + rentIn + propRentIn; rCash = (rCash > 0 ? rCash * (1 + alt) : rCash) + inc - liv - rentEq + propRentBase; }
    rCash += renterSale[t]; bcash += renterSale[t];   // a property sold in a month you set: the not-building side sells it too
    retCum += ret;
    ccash -= bridgeInt; bridgeCum += bridgeInt;
    // planned settlements first (e.g. a loan you intend to clear on a known date)
    loans.forEach((l) => { if (l.settledAt === null && l.bal > 0.5 && l.settleAt != null && l.settleAt > 0 && t === Math.round(l.settleAt)) doSettle(l, t, "planned settlement from your cash", { why: "planned" }); });
    // the order of a month's steps as they really happen: the finished home first (what needs it comes after), then the land
    // mortgage, the sale of a property, each mortgage on a property you own, the personal loans, the cash-out, the personal
    // loans at project end — each loan with any payoff that makes room for it — then what that money pays for
    // (a building let out entirely: no move-in; land: no construction and no move-in — only "Land bought")
    if (t === prj.occupy && prj.construct) events.push({ t, kind: "milestone", text: letB ? `Building complete — let from month ${t + 1}. Upkeep starts.` : `Construction complete — move in. Upkeep starts.` });
    // a ready home or building (bought, not built): the month after the purchase you move in — or it is let
    else if (t === prj.occupy && !prj.build) events.push({ t, kind: "milestone", text: livesIn ? `Move in. Upkeep starts.` : `${prj.isBuilding ? "Building" : "Home"} ready — let from month ${t + 1}. Upkeep starts.` });
    // land only: the sale you planned — the land's market value then less selling costs; the mortgage on the land is repaid
    // from it first (with the early-settlement fee); from then on the land is not yours (its value counts 0 in both measures)
    if (prj.saleAt != null && t === prj.saleAt && landSale === null) {
      const value = prj.valueAt(t), costs = value * (+p.landSellCostPct || 0) / 100;
      let payoff = 0, fee = 0;
      if (lm.bal > 0.5 && lm.settledAt === null && lm.startedAt !== null) { payoff = settleCost(lm); fee = payoff - lm.bal; lm.bal = 0; lm.settledAt = t; lm.soldAt = t; }
      const net = value - costs - payoff;
      cash += net; ccash += net; landSale = { t, value, costs, payoff, fee, net };
      events.push({ t, kind: "cash", text: `Land sold for ${fSAR(value)} after ${fSAR(costs)} selling costs${payoff > 0 ? `; the land mortgage of ${fSAR(payoff)} (incl. ${fSAR(fee)} early-settlement fee) is repaid` : ""} — ${fSAR(net)} lands in your cash.` });
    }
    // facilities, in order: land mortgage → existing property → personal loan → cash-out
    const landValue = prj.build ? prj.land : prj.price;   // buying ready: the purchase mortgage is sized on the purchase price
    // every new loan at the bank's maximum that month (your rule)
    if (t === lmT) originate(t, lm, "max", 0, landValue * (prj.isLand ? p.landOnlyLtv : p.landLtv) / 100, Infinity);
    // a property you own is sold: its market value then less selling costs, after repaying any mortgage this plan took on it
    // and any loan already secured on it (each with the early-settlement fee), lands in your cash. The home you lived in, or a
    // property sold at project end to fund the project: this side only; a property sold in a month you set: both sides (renterSale)
    props.forEach((P) => {
      const s = saleOf[P.id];
      if (!s || s.t !== t || soldAt[P.id] != null) return;
      const value = propAt(P, t), costs = value * (P.sellCostPct || 0) / 100;
      let payoff = 0, fee = 0;
      const f = eqs.find((x) => x.propId === P.id);
      if (f && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null) { payoff = settleCost(f); fee = payoff - f.bal; f.bal = 0; f.settledAt = t; f.soldAt = t; }
      let oldPayoff = 0, oldFee = 0; const oldNames = [];
      activeExisting().filter((l) => reSecuredOn(l, P)).forEach((l) => { const cost = settleCost(l), fe = cost - l.bal; oldPayoff += cost; oldFee += fe; settledTotal += l.bal; settleFees += fe; l.settledAt = t; l.soldAt = t; l.bal = 0; oldNames.push(l.name); });
      const net = value - costs - payoff - oldPayoff;
      cash += net; ccash += net; soldAt[P.id] = t;
      const sale = { id: P.id, name: P.name, isHome: !!P.isHome, t, value, costs, payoff, fee, oldPayoff, oldFee, oldNames, net, side: s.side };
      sales.push(sale); if (P.isHome && !ownSale) ownSale = sale;
      events.push({ t, kind: "cash", text: `${P.isHome ? "Sell the home you lived in" : `Sell ${P.name}`}: ${fSAR(value)} less ${fSAR(costs)} selling costs${payoff > 0 ? ` and ${fSAR(payoff)} to repay its mortgage (incl. ${fSAR(fee)} early-settlement fee)` : ""}${oldPayoff > 0 ? ` and ${fSAR(oldPayoff)} to repay ${oldNames.join(" + ")} (incl. ${fSAR(oldFee)} early-settlement fee)` : ""} — ${fSAR(net)} lands in your cash${s.side === "both" ? " (you would sell it whether or not you build, so the not-building side sells it too)" : ""}.` });
    });
    // mortgages on the properties you own, in property order: a step on a property already sold, one you may not mortgage or
    // one you do not own lends nothing and says why
    eqs.forEach((f) => {
      if (t !== eqT.get(f)) return;
      const P = f.propId != null ? props.find((x) => x.id === f.propId) : null;
      if (P && soldAt[P.id] != null) { f.capacity = { t, cap: 0, limitedBy: `${P.name} was sold in month ${soldAt[P.id]}`, want: 0, mode: "max", taken: 0, gap: 0 }; events.push({ t, kind: "eq", text: `${f.label}: not possible — ${P.name} was sold in month ${soldAt[P.id]}.` }); return; }
      if (!P) originate(t, f, "max", 0, 0, Infinity, false, `you own no property "${f.step.id}" to mortgage`);
      else if (!P.canMortgage) originate(t, f, "max", 0, 0, Infinity, false, `${P.name} cannot be mortgaged`);
      else originate(t, f, "max", 0, propLtvCap(P, t), Infinity);
    });
    if (t === plT) takePersonal(t, pl);
    if (t === splT) takePersonal(t, spl);
    // the land mortgage is still secured on the same home, so the cash-out may only lend up to the LTV less what is still owed on it
    if (t === coT) originate(t, co, "max", 0, Math.max(0, prj.valueAt(t) * p.cashoutLtv / 100 - (lm.settledAt === null ? lm.bal : 0)), Infinity);
    if (plan.coUse && prj.isLand && t === prj.occupy) events.push({ t, kind: "co", text: `${co.label}: not available on land — there is no finished home to mortgage.` });
    if (t === pl2T) takePersonal(t, pl2);          // after the cash-out: personal loan(s) fill what is left
    if (t === spl2T) takePersonal(t, spl2);
    // what the money raised above pays for (the land, the start of construction)
    if (t === prj.landMonth && prj.build) events.push({ t, kind: "milestone", text: `Land bought for ${fS(prj.land + prj.rett + prj.landBroker)} incl. RETT${prj.landBroker > 0 ? " and the broker's fee" : ""}${prj.landMonth > 0 ? ` (today's price grown at ${p.appreciation}%/yr)` : ""}.` });
    // the purchase of a ready home or building: the price with RETT and the broker's fee (finishing, with VAT, paid the same month)
    else if (t === prj.landMonth && !prj.build) events.push({ t, kind: "milestone", text: `${prj.isBuilding ? "Building" : "Home"} bought for ${fS(prj.price + prj.rett + prj.broker)} incl. RETT${prj.broker > 0 ? " and the broker's fee" : ""}${prj.finish > 0 ? `; finishing ${fS(prj.finish * (1 + p.vatPct / 100))} incl. VAT` : ""}${prj.landMonth > 0 ? ` (today's price grown at ${p.appreciation}%/yr)` : ""}.` });
    if (t === prj.start && prj.construct) events.push({ t, kind: "milestone", text: `Construction starts${prj.inflate > 1 ? ` (priced ${((prj.inflate - 1) * 100).toFixed(0)}% above today)` : ""} — ${fS(prj.total - prj.land - prj.rett - prj.landBroker)} over ${prj.bm} months.` });
    // project spend, all from cash (facility proceeds are already in cash)
    const spend = prj.schedule[t] || 0;
    cash -= spend; ccash -= spend;
    // debt service
    let existInst = 0, existInterest = 0, existInstB = 0;
    if (t >= 1) loans.forEach((l) => { if (l.settledAt !== null || l.bal <= 0.5) return; const i = l.bal * l.rate / 100 / 12; const pay = loanPay(l.bal, i, l.installment); l.bal -= pay - i; l.left -= 1; l.interestPaid += i; existInst += pay; existInterest += i; if (l.owner === "B") existInstB += pay; });
    for (const f of facs) {
      let pay = 0, int = 0, extra = 0;
      if (t >= 1 && f.bal > 0.5 && f.settledAt === null && f.startedAt !== null && t > f.startedAt) {
        int = f.bal * f.rate / 100 / 12; pay = Math.min(f.pmt + (f.key === "lm" ? Math.max(0, plan.extraMo) : 0), f.bal + int); f.bal -= pay - int; f.interestPaid += int; f.monthsPaid++;
        extra = Math.max(0, pay - f.pmt);   // a voluntary extra payment is yours, not an instalment the bank tests
      }
      f.pay = pay; f.int = int; f.extra = extra;
    }
    const value = landSale !== null ? 0 : prj.valueAt(t);   // land sold: no longer yours
    const ownerCost = occupied && !prj.isLand ? value * p.maintPct / 100 / 12 + p.insurance / 12 : 0;   // (land: no upkeep — its holding costs are below)
    // land only: the white-land fee and zakat on land held to sell, while you own it (out of your cash in both measures)
    const holding = prj.isLand && landSale === null ? prj.holdingAt(t) : 0;
    // your spouse's personal loans (تضامن) count with yours in the household's personal-loan figures
    const splPay = byB ? spl.pay + spl2.pay : 0;
    let eqPay = 0, eqInt = 0, eqExtra = 0;   // every mortgage on a property you own
    for (const f of eqs) { eqPay += f.pay; eqInt += f.int; eqExtra += f.extra; }
    const newPay = lm.pay + eqPay + pl.pay + pl2.pay + co.pay + rf.pay + splPay;
    const extraPay = lm.extra + eqExtra + pl.extra + pl2.extra + co.extra + rf.extra;
    cash -= existInst + newPay + ownerCost + holding; ccash -= holding; holdingCum += holding;
    // your option: pay off the mortgages early from your own cash N months after the project end (after that month's instalments),
    // most expensive first, while the cash above your safety cushion covers the payoff and the early-settlement fee
    // "asap": every month from the project end, each mortgage dearer than your cash earns (net) is paid off once the cash above your
    // cushion AND three months' outgoings covers it (the settle advisor's cash test); one cheaper than your cash is kept
    if (prepayAsap ? t >= prj.occupy : plan.prepayAfter != null && plan.prepayAfter !== "" && t === prj.occupy + Math.max(0, Math.round(plan.prepayAfter))) {
      const reserve = prepayAsap ? 3 * (liv + rentPaid + existInst + newPay + ownerCost + holding) : 0;
      mortgages.filter((f) => f.bal > 0.5 && f.settledAt === null && f.startedAt !== null && f.startedAt < t && (!prepayAsap || f.rate > netReturnPct)).sort((a, b) => b.rate - a.rate).forEach((f) => {
        const cost = settleCost(f), fee = cost - f.bal;
        if (avail() - cost < p.cashBuffer + reserve) { if (!prepayAsap) events.push({ t, kind: "settle", text: `Not enough cash above your ${fS(p.cashBuffer)} safety cushion to pay off the ${fLc(f)} early (${fSAR(cost)} needed).` }); return; }
        cash -= cost; ccash -= cost; prepaidTotal += f.bal; prepayFees += fee;
        prepaid.push({ t, name: f.label, nameLc: fLc(f), key: f.key, cost, fee, inst: f.pmt });
        events.push({ t, kind: "settle", fac: f.key, text: `Pay off the ${fLc(f)} early from your cash${prepayAsap ? `, as soon as your cash above the cushion and three months' outgoings covers it (at ${f.rate.toFixed(2)}% APR it costs more than your cash earns, ${netReturnPct.toFixed(2)}%)` : ""}: ${fSAR(cost)} (incl. ${fSAR(fee)} early-settlement fee) — instalments drop by ${fSAR(f.pmt)}/mo.` });
        f.bal = 0; f.settledAt = t + 1; f.prepaidAt = t;   // this month's instalment was paid; none after
      });
    }
    rCash -= renterInst[t] + renterSettle[t];
    // net-worth basis: new-loan instalments and upkeep are plain costs; old-loan instalments you no longer pay and rent you no
    // longer pay are savings; rent from letting the new home is income — none of them touch the growing cash
    newInstCum += newPay; upkeepCum += ownerCost; rentInCum += rentIn;
    oldSavedCum += renterInst[t] - existInst; rentSavedCum += t >= 1 ? rentEq - rentPaid : 0;
    let debtExisting = 0, debtNew = 0, debtEqNow = 0;   // (after this month's debt service and any early payoff)
    for (const l of loans) if (l.settledAt === null) debtExisting += l.bal;
    for (const f of facs) if (f.settledAt === null) debtNew += f.bal;
    for (const f of eqs) if (f.settledAt === null) debtEqNow += f.bal;
    const debt = debtExisting + debtNew;
    const liqValue = value;   // no selling costs: the seller pays no tax or broker fee
    // old-loan balance the not-building side still owes but this strategy no longer does (matters only when the horizon ends
    // before your old loans would)
    const oldDebtGap = renterDebt[t] - debtExisting;
    // a property only this side sold (at project end) is no longer yours while the not-building side still owns it (both measures);
    // one sold in a month you set was sold on both sides, so nothing is deducted
    const ownGone = props.reduce((a, P) => a + (soldAt[P.id] != null && saleOf[P.id].side === "strategy" ? propAt(P, t) : 0), 0);
    const netWorth = ccash - newInstCum + oldSavedCum + rentSavedCum + rentInCum - upkeepCum + value - debtNew + oldDebtGap - ownGone, renterNW = bcash, advantage = netWorth - renterNW;
    const av = avail();   // the cash you can spend this month (no growth)
    if (av < minCash) { minCash = av; minCashT = t; }
    if (av < p.cashBuffer) belowBufferMonths++;
    if (av < 0) { shortfall = Math.max(shortfall, -av); if (shortFrom === null && av < -0.5) shortFrom = t; }
    if (occupied && cashRestoredT === null && av >= p.cashBuffer) cashRestoredT = t;
    if (occupied && breakEvenMonth === null && advantage >= 0) breakEvenMonth = t;
    // "everything grows" (how strategies are ranked): household cash (salary in, every payment out, growth on positive
    // balances) + home value − all debt, against the not-building household's cash − the old-loan debt it still owes
    const econNW = cash + value - debt - ownGone, econBase = rCash - renterDebt[t], econAdv = econNW - econBase;
    // تضامن: what each of you pays this month as the bank counts it (a joint mortgage by its share; extra payments left out)
    let jm = null;
    if (J) {
      const shareOfPays = (who) => { let a = 0; for (const f of facs) a += (f.pay - f.extra) * shareOf(f, who); return a; };
      const payA = existInst - existInstB + shareOfPays("A"), payB = existInstB + shareOfPays("B");
      jm = { incA: t >= 1 ? incA : 0, incB: t >= 1 ? incB : 0, payA, payB, dbrA: payA / incA * 100, dbrB: incB > 0 ? payB / incB * 100 : 0, capA: capPctA, capB: capPctB, bankCap: dbrTarget + dbrTargetB };
    }
    if (occupied && econBreakEven === null && econAdv >= 0) econBreakEven = t;
    if (debtFreeT === null && t > 0 && debt < 0.5) debtFreeT = t;
    dbrOverA = Math.max(dbrOverA, (existInst + newPay - extraPay) / inc * 100 - capPctA);   // how far over your limit that month (samaBands: the band of that month's income)
    // borrowing room at month end, as the bank will read it next month (see above)
    const roomA = roomOf("A"), roomB = J ? roomOf("B") : null, leverage = leverageNow(t, value, roomA, roomB);
    // (room and leverage sit before the only spread, so the record keeps one fixed shape — a spread in the middle of the literal
    // made every later property dynamic and the whole run slower; roomB rides with the other تضامن fields)
    months.push({ t, year: yearOf(t), cash, avail: av, room: roomA, leverage, rCash, rRet, econNW, econBase, econAdv, bcash, ccash, bRet, cRet, cRetCum, renterSettle: renterSettle[t], renterSale: renterSale[t], oldDebtGap, rentIn, partIn, ownIn, propRentIn, propRentBase, ownGone, newInstCum, oldSavedCum, rentSavedCum, rentInCum, upkeepCum, debtNew, ret, inc: t >= 1 ? inc : 0, liv: t >= 1 ? liv : 0, spend, rentPaid, rentEq, existInst, existInterest, lmPay: lm.pay, eqPay, plPay: pl.pay + pl2.pay + splPay, coPay: co.pay, rfPay: rf.pay, newInt: lm.int + eqInt + pl.int + pl2.int + co.int + rf.int + (byB ? spl.int + spl2.int : 0), bridgeInt, ownerCost, holding, value, liqValue, debt, debtExisting, debtLm: lm.bal, debtEq: debtEqNow, debtPl: (pl.settledAt === null ? pl.bal : 0) + (pl2.settledAt === null ? pl2.bal : 0) + (byB ? (spl.settledAt === null ? spl.bal : 0) + (spl2.settledAt === null ? spl2.bal : 0) : 0), debtCo: co.bal, debtRf: rf.bal, netWorth, renterNW, advantage, extraPay, dbr: (existInst + newPay - extraPay) / inc * 100, ...(jm ? { ...jm, roomB } : {}) });
  }
  const nY = yearOf(H), years = [];
  for (let y = 0; y <= nY; y++) {
    // the year's months are one run of the list (month 0 alone is year 0): a slice, summed in the same order as before
    const ms = months.slice(y === 0 ? 0 : 12 * (y - 1) + 1, y === 0 ? 1 : Math.min(H, 12 * y) + 1); const sum = (k) => { let a = 0; for (const m of ms) a += m[k]; return a; }; const last = ms[ms.length - 1];
    years.push({ year: y, label: y === 0 ? "Y0" : `Y${y}`, spend: sum("spend"), rentPaid: sum("rentPaid"), rentEq: sum("rentEq"), existInst: sum("existInst"), lmPay: sum("lmPay"), eqPay: sum("eqPay"), plPay: sum("plPay"), coPay: sum("coPay"), rfPay: sum("rfPay"), interest: sum("existInterest") + sum("newInt"), ownerCost: sum("ownerCost"),
      cash: last.cash, avail: last.avail, rCash: last.rCash, debt: last.debt, debtExisting: last.debtExisting, debtLm: last.debtLm, debtEq: last.debtEq, debtPl: last.debtPl, debtCo: last.debtCo, debtRf: last.debtRf, value: last.value, netWorth: last.netWorth, renterNW: last.renterNW, advantage: last.advantage,
      econNW: last.econNW, econBase: last.econBase, econAdv: last.econAdv, inc: ms.filter((m) => m.t >= 1).reduce((a, m, k, arr) => a + m.inc / arr.length, 0) || p.income,
      instMo: (sum("existInst") + sum("lmPay") + sum("eqPay") + sum("plPay") + sum("coPay") + sum("rfPay")) / (y === 0 ? 1 : 12) });
  }
  const end = months[H];
  const newDebtInterest = facs.reduce((a, f) => a + f.interestPaid + f.fees, 0) + settleFees + prepayFees + sales.reduce((a, s) => a + s.fee, 0) + (landSale ? landSale.fee : 0) + bridgeCum;   // profit + bank fees + early-settlement fees (a sale's, on the plan's mortgage; an old loan's are in settleFees) + bridge money
  const totalInterest = newDebtInterest + loans.reduce((a, l) => a + l.interestPaid, 0);
  const peakDbr = Math.max(...months.map((m) => m.dbr));
  // تضامن: each of you against your own limit
  const jointPeak = J ? { peakDbrA: Math.max(...months.map((m) => m.dbrA)), peakDbrB: Math.max(...months.map((m) => m.dbrB)) } : null;
  const peakInst = Math.max(...months.map((m) => m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - m.extraPay));
  const peakInstT = months.findIndex((m) => m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - m.extraPay === peakInst);
  // the liability lenses (reLenses): the most you owe in any month — ALL debt, old loans and new (peakDebt, and its month), the
  // most of new debt alone (peakNewDebt); profitPaid = newDebtInterest (profit on the new loans + bank fees + early-settlement
  // fees + bridge money — the whole cost of borrowing); cash you can spend and what the bank would still lend at project end (for
  // land: the month after the purchase; a building let out entirely: the month after completion — prj.occupy) and at the end
  const peakDebt = Math.max(...months.map((m) => m.debt)), peakDebtT = months.findIndex((m) => m.debt === peakDebt), peakNewDebt = Math.max(...months.map((m) => m.debtNew));
  const feasible = shortfall <= 0;
  // a bridge rerun works with bridge money when every gap is closed by one of the plan's loans (or the sale of your home)
  let bridged = false, bridges = null;
  if (bridging && !feasible) {
    const gs = reGaps(months, facs, sales, landSale);
    if (gs.length && gs.every((g) => g.closedBy.length)) { bridged = true; bridges = gs.map((g) => ({ ...g, cost: months.filter((m) => m.t > g.from && m.t <= g.to).reduce((a, m) => a + m.bridgeInt, 0) })); }
  }
  const recoveryMonths = cashRestoredT != null ? cashRestoredT - prj.occupy : null;
  const recoveryOk = (feasible || bridged) && recoveryMonths != null && recoveryMonths <= p.recoveryMonths;
  // "move-in" below is prj.occupy: the month you move into the new home — or, for land and for a building let out entirely, the
  // month the project is paid for (the land, or the finished building). onHandAtMoveIn, recoveryOk and moveInOk keep their
  // meaning at that month: the cash you have once the project is paid for, and whether it is back at your cushion in time.
  // your rule: the cash you have when you move in, with NO return on cash counted — what is left from your own cash and the
  // loans after every cost so far (the rule-6 figure, ccash − cRetCum) + what your salary saved after living costs, rent and
  // every instalment, month 1 to the project end — must be at least minCashMoveIn. A plan below it ranks after plans that meet the
  // rule (and the tool's search does the same). It equals the bank balance that month less the return earned on it.
  const occI = Math.min(H, prj.occupy), occM = months[occI], loansLeftAtMoveIn = occM.ccash - occM.cRetCum;
  let salaryToMoveIn = 0;
  for (let t = 1; t <= occI; t++) { const m = months[t]; salaryToMoveIn += m.inc - m.liv - m.rentPaid + m.rentIn + m.propRentIn - m.existInst - m.lmPay - m.eqPay - m.plPay - m.coPay - m.rfPay - m.ownerCost; }
  const onHandAtMoveIn = loansLeftAtMoveIn + salaryToMoveIn;
  const moveInLine = p.minCashMoveIn == null ? 0 : p.minCashMoveIn, moveInOk = onHandAtMoveIn >= moveInLine - 0.5;
  const after = Math.min(H, prj.occupy + p.recoveryMonths);
  // liquidity: what the low point covers, and how thin the monthly surplus gets (salary − living − rent − instalments − upkeep + rent received)
  const outgo = (m) => m.liv + m.rentPaid + m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - m.extraPay + m.ownerCost + m.holding;
  const lowM = months[Math.max(1, Math.min(H, minCashT))];
  const reserveMonths = lowM && outgo(lowM) > 0 ? Math.max(0, minCash) / outgo(lowM) : null;
  let thinMonths = 0, tightest = null;
  months.forEach((m) => { if (m.t < 1) return; const surplus = m.inc - outgo(m) + m.rentIn + m.propRentIn; if (surplus < 0.05 * m.inc) thinMonths++; if (!tightest || surplus < tightest.surplus) tightest = { t: m.t, surplus }; });
  if (prj.occupy > H) flags.push(prj.isLand ? `The land is not paid for before the end of the comparison (month ${prj.occupy}, horizon month ${H}) — lengthen the horizon to judge it.` : `The ${prj.isBuilding ? "building" : "home"} is not finished before the end of the comparison (${livesIn ? "move-in" : "completion"} month ${prj.occupy}, horizon month ${H}) — lengthen the horizon to judge it.`);
  if (shortfall > 0 && !bridged) {
    // computeRE adds how much more cash the plan needs (reAddNeed); the most you are short is not that figure
    flags.unshift(`Your cash runs out in month ${shortFrom} and no loan in this plan covers it in time. At the worst, in month ${minCashT}, you would be ${fS(shortfall)} short.`);
    events.push({ t: shortFrom, kind: "short", text: `Your cash runs out — no loan in this plan covers it in time. At the worst, in month ${minCashT}, you would be ${fS(shortfall)} short.` });
    events.sort((a, b) => a.t - b.t);
  }
  else if (!recoveryOk) flags.push(cashRestoredT == null ? `Cash never gets back to your ${fS(p.cashBuffer)} buffer after the project end within the horizon.` : `Cash gets back to your ${fS(p.cashBuffer)} buffer ${recoveryMonths} months after the project end (you asked for ${p.recoveryMonths}).`);
  if ((feasible || bridged) && !moveInOk) flags.push(`Cash at project end (left from your cash and the loans + saved from your salary, no growth) is ${fS(onHandAtMoveIn)} — below your line of ${fS(moveInLine)}.`);
  events.sort((a, b) => a.t - b.t);
  // (one copy per facility, so r.lm, r.eq / r.eqs[i] and the same entry of r.facilities are one object)
  const outs = new Map(), facOut = (f) => { if (!outs.has(f)) { const { pay, int, extra, ...rest } = f; outs.set(f, rest); } return outs.get(f); };
  return { plan, months, years, events, flags, notes: [], feasible, shortFrom, bridged, bridges, bridgeCost: bridgeCum, bridgePeak: bridged ? Math.max(...bridges.map((b) => b.peak)) : 0, bridgeRate: bridgeApr, recoveryOk, onHandAtMoveIn, loansLeftAtMoveIn, salaryToMoveIn, moveInOk, end,
    lm: facOut(lm), eq: facOut(eqs[0] || eqBlank()), eqs: eqs.map(facOut), pl: facOut(pl), pl2: facOut(pl2), co: facOut(co), rf: facOut(rf), ...(byB ? { spl: facOut(spl), spl2: facOut(spl2) } : {}), refiTotal, roomSettled, annualRentOut, rentInTotal: rentInCum, facilities: facs.map(facOut), loansEnd: loans.map((l) => ({ id: l.id, name: l.name, settledAt: l.settledAt, refinancedAt: l.refinancedAt == null ? null : l.refinancedAt, toppedUpAt: l.toppedUpAt == null ? null : l.toppedUpAt, soldAt: l.soldAt == null ? null : l.soldAt, bal: l.bal })),
    cashStart: p.cashAvailable, minCash, minCashT, belowBufferMonths, shortfall, cashAtCompletion: months[Math.min(H, prj.occupy)].cash, cashEnd: end.cash,
    cashRestoredT, recoveryMonths, cashAfterWindow: months[after].avail, payoffs, newDebtTotal: facs.reduce((a, f) => a + f.amount, 0),
    settledTotal, settleFees, prepaid, prepaidTotal, prepayFees, refiDiffers, totalInterest, newDebtInterest, peakDbr, peakInst, peakInstT, peakInstPct: months[peakInstT].dbr, debtFreeT, breakEvenMonth,
    peakDebt, peakDebtT, peakNewDebt, profitPaid: newDebtInterest, availAtMoveIn: occM.avail, leverageAtMoveIn: occM.leverage, availEnd: end.avail, leverageEnd: end.leverage,
    netWorthEnd: end.netWorth, renterEnd: end.renterNW, advantage: end.advantage,
    econEnd: end.econNW, econBaseEnd: end.econBase, econAdv: end.econAdv, econPV: end.econAdv / Math.pow(1 + alt, H), econBreakEven, endDebt: end.debt, endValue: end.value, start: prj.start, landMonth: prj.landMonth, occupy: prj.occupy,
    netReturn: (Math.pow(1 + alt, 12) - 1) * 100, reserveMonths, thinMonths, tightest, partRentTotal: partRentCum, ownRentTotal: ownRentCum, propRentTotal: propRentCum, ownPlan, ownSale, sales,
    kind: prj.kind, livesIn, lettingOut, landSale, holdingCost: holdingCum,   // the project kind; whether you move in; land: the sale and what holding it cost
    dbrOk: J ? months.every((m) => m.dbrA <= m.capA + 0.5 && m.dbrB <= m.capB + 0.5) : dbrOverA <= 0.5, ...(jointPeak || {}) };
}

// the months your cash is short, and what ends each gap: the new loans (or the sale of a property you own — "sale:<id>" —, or
// of the land) that land in the month the cash is back at zero or above. A gap nothing lands in to close, or one still open
// at the end, has closedBy []. sales = r.sales (a single sale object is accepted too: "sale")
function reGaps(months, facilities, sales, landSale) {
  const saleList = Array.isArray(sales) ? sales : sales ? [sales] : [];
  const out = [];
  let g = null;
  months.forEach((m) => {
    const a = m.avail == null ? m.cash : m.avail;   // the cash you can spend (no growth)
    if (a < -0.5) { if (!g) g = { from: m.t, to: null, peak: 0, peakT: m.t }; if (-a > g.peak) { g.peak = -a; g.peakT = m.t; } }
    else if (g) { g.to = m.t; out.push(g); g = null; }
  });
  if (g) out.push(g);
  out.forEach((x) => { x.closedBy = x.to == null ? [] : facilities.filter((f) => f.amount > 0 && f.startedAt === x.to && f.key !== "rf").map((f) => f.key).concat(saleList.filter((s) => s.t === x.to).map((s) => (s.id != null ? `sale:${s.id}` : "sale")), landSale && landSale.t === x.to ? ["landSale"] : []); });
  return out;
}
// how a plan stands: 2 = works every month, 1 = works with bridge money, 0 = runs out of cash
const reStanding = (r) => !r ? -1 : r.feasible ? 2 : r.bridged ? 1 : 0;

// a plan as you would carry it out. If your cash would run short before one of the plan's own loans lands and closes the
// gap, that loan is taken in the month the cash runs short — a personal loan, or the mortgage on the property you own — when
// the bank can lend enough then (its maximum then, buying out the old loans it may refinance then): the deficit is covered by
// a loan. If no loan can cover it then (the bank's room isn't there yet, an old loan can't be refinanced yet, or the gap is
// closed by the cash-out, which needs the finished home), the gap needs bridge money, which costs the bridge rate until the
// loan lands. A gap that no loan closes still runs out of cash.
const RE_MOVABLE = { pl: true, pl2: true, eq: true, spl: true, spl2: true };
const reIsEq = (k) => /^eq(:|$)/.test(k || "");   // a mortgage on a property you own (eq:<id>)
const reMovable = (k) => !!RE_MOVABLE[k] || reIsEq(k);
// a result's facility by key (r.lm, r.pl, …; a mortgage on a property by its eq:<id> key)
const reFacOf = (r, k) => (r && r[k]) || (r && r.facilities || []).find((f) => f.key === k) || null;
// تضامن: your personal loans and your spouse's at the same step (pl + spl, pl2 + spl2) move together
const RE_PL_STEP = { pl: "pl", spl: "pl", pl2: "pl2", spl2: "pl2" };
function reCarryOut(p, prj, plan) {
  const r = rePlanSimulate(p, prj, plan);
  if (r.feasible) return r;
  const gaps = reGaps(r.months, r.facilities, r.sales, r.landSale);
  if (!gaps.length) return r;
  // coverAny (default; re2Import sets it off): a gap that no loan closes — the plan's later loan is too small to bring the cash
  // back above zero, so only your savings do, later — still gets the plan's later loans to try: each movable loan step planned
  // after the gap starts is tried in the gap's first month. A move that makes the plan work covers it as usual; otherwise the
  // move that shrinks the shortfall the most is kept (coveredPart) when no bridge money can save the plan.
  if (gaps.some((g) => !g.closedBy.length)) {
    if (p.coverAny === false) return r;
    const later = (r.facilities || []).filter((f) => f.amount > 0 && f.startedAt != null && reMovable(f.key)).map((f) => f.key);
    gaps.forEach((g) => { if (!g.closedBy.length) { g.closedBy = later.filter((k) => reFacOf(r, k).startedAt > g.from); g.noClose = true; } });
    if (gaps.some((g) => !g.closedBy.length)) return r;
  }
  const J = !!(p.joint && p.joint.on);
  const saleOf = (k) => (r.sales || []).find((s) => `sale:${s.id}` === k) || null;
  // whose personal loans (named only with تضامن): "the personal loans in your spouse's name …"
  const whose = (ks) => !J ? "" : ks.length > 1 ? " in your and your spouse's names" : /^s/.test(ks[0]) ? " in your spouse's name" : " in your name";
  const tried = [];
  for (const g of gaps) {
    const done = new Set();
    for (const k0 of g.closedBy) {
      if (!reMovable(k0) || done.has(k0)) continue;
      const ks = RE_PL_STEP[k0] ? g.closedBy.filter((x) => RE_PL_STEP[x] === RE_PL_STEP[k0]) : [k0];
      ks.forEach((x) => done.add(x));
      const k = ks[0];
      // the move-in step can't come before the plan's first personal-loan step (the same person's)
      const first = (x) => x === "pl2" ? r.pl : x === "spl2" ? r.spl : null;
      if (ks.some((x) => first(x) && first(x).startedAt != null && first(x).startedAt > g.from)) { ks.forEach((x) => tried.push({ key: x, gap: g, later: true })); continue; }
      const _at = { ...(plan._at || {}) }; ks.forEach((x) => { _at[x] = g.from; });
      const r2 = rePlanSimulate(p, prj, { ...plan, _at });
      const fs = ks.map((x) => reFacOf(r2, x)), f = fs[0], f0 = reFacOf(r, k), amount = fs.reduce((a, x) => a + x.amount, 0);
      if (r2.feasible && amount > 0) {
        r2.plan = plan;
        ks.forEach((x) => [reFacOf(r2, x), r2.facilities.find((y) => y.key === x)].forEach((y) => { if (y && y.amount > 0) y.takenEarly = reFacOf(r, x).startedAt; }));   // planned month
        const refis = fs.filter((x) => x.refi), net = fs.reduce((a, x) => a + (x.refi ? x.refi.net : x.amount), 0), payoff = refis.reduce((a, x) => a + x.refi.payoff, 0), names = refis.flatMap((x) => x.refi.names);
        r2.covered = { key: k, ...(ks.length > 1 ? { keys: ks } : {}), label: ks.length > 1 ? "Your and your spouse's personal loans" : f.label, at: g.from, plannedAt: f0.startedAt, amount, net, refi: names, gap: { from: g.from, to: g.to, peak: g.peak, peakT: g.peakT } };
        // texts say "in month N" (the page turns that into a calendar month)
        const what = reIsEq(k) ? `${f.labelLc || f.label.toLowerCase()} is` : `personal loans${whose(ks)}${RE_PL_STEP[k] === "pl2" ? " planned for the project end" : ""} are`;
        const amt = fs.length > 1 ? `${fS(amount)} (${fs.map((x, i) => `${/^s/.test(ks[i]) ? "your spouse's" : "yours"} ${fS(x.amount)}`).join(" + ")})` : fS(amount);
        const refiTxt = refis.length ? `, of which ${fS(payoff)} buys out ${names.join(" + ")} and ${fS(net)} reaches you` : "";
        const note = `Your cash would run short in month ${g.from} (up to ${fS(g.peak)}, until the planned loan lands in month ${g.to}), so the ${what} taken in month ${g.from} instead: the bank's maximum then is ${amt}${refiTxt}. The deficit is covered by a loan.`;
        r2.notes = [note].concat(r2.notes || []);
        let i = r2.events.findIndex((e) => e.t === g.from && (reIsEq(k) ? e.kind === "eq" : e.kind === "pl" || e.kind === "spl"));   // just before its loan
        if (i < 0) i = r2.events.findIndex((e) => e.t >= g.from);
        r2.events.splice(i < 0 ? r2.events.length : i, 0, { t: g.from, kind: "cover", text: `Your cash would run short now — by up to ${fS(g.peak)} before the planned loan lands in month ${f0.startedAt} — so the ${what} taken now instead. The bank lends ${amt}${refiTxt}: the ${fS(g.peak)} deficit is covered by ${fs.length > 1 ? "these loans" : "a loan"}.` });
        return r2;
      }
      ks.forEach((x, j) => tried.push({ key: x, gap: g, f: fs[j], r2, ks }));
    }
  }
  // still short: a personal-loan step that may be two loans is taken in two parts — one loan in the month the cash runs short
  // (the bank's maximum for one loan then, on the plan's unused personal-loan step) and the rest at its planned month, itself
  // taken early if the cash runs short again (each part the bank's maximum when it is taken). Kept when the plan then works
  // every month, or when it needs less bridge money than taking the step whole.
  let split = null;
  const plFree = (!plan.plWhen || plan.plWhen === "none") && !(plan._at && plan._at.pl != null);
  for (const g of gaps) for (const k of g.closedBy) {
    // (only for personal loans in your own name: with تضامن and your spouse's loans in the plan the step is taken whole)
    if (split || plan._split || plan.plSplit === false || (J && plan.plBy && plan.plBy !== "me") || !(k === "pl2" ? plFree : k === "pl" && !plan.pl2Use)) continue;
    const plannedAt = r[k].startedAt, sp = { key: k, at: g.from, plannedAt };
    const q = k === "pl2" ? { ...plan, _at: { ...(plan._at || {}), pl: g.from }, _oneLoan: "pl", _split: sp }
      : { ...plan, pl2Use: true, _at: { ...(plan._at || {}), pl: g.from, pl2: plannedAt }, _oneLoan: "pl", _split: sp };
    const rs = reCarryOut(p, prj, q);
    // two parts, in two different months
    if (rs.pl.amount > 0 && rs.pl.startedAt === g.from && rs.pl2.amount > 0 && rs.pl2.startedAt > g.from && reStanding(rs) >= 1) {
      const w = tried.find((x) => x.key === k && x.gap === g);   // the step taken whole then: was there a buy-out choice?
      split = { r: rs, g, k, plannedAt, choice: (plan.refiMode || "auto") !== "cash" && !!(w && w.f && w.f.refiOptions && w.f.refiOptions.length > 1) };
    }
  }
  const rb = split && split.r.feasible ? null : rePlanSimulate(p, prj, { ...plan, _bridge: true });
  if (split && (split.r.feasible || !rb.bridged || split.r.bridgePeak < rb.bridgePeak - 1)) return reSplitNote(split, plan, J);
  if (!rb.bridged) return reCoverPart(r, tried, plan, p, J, whose);
  rb.plan = plan;
  const label = (k) => k === "sale" || (saleOf(k) && saleOf(k).isHome) ? "sale of the home you live in" : saleOf(k) ? `sale of ${saleOf(k).name}` : k === "landSale" ? "sale of the land" : k === "pl2" || k === "spl2" ? (plan._split && k === "pl2" ? `second part of the personal loans${whose([k])}` : `personal loans${whose([k])} at project end`) : k === "pl" || k === "spl" ? `personal loans${whose([k])}` : (rb[k] && rb[k].label ? rb[k].label.toLowerCase() : k);
  rb.bridges.forEach((b) => {
    const why = b.closedBy.map((k) => {
      const x = tried.find((y) => y.key === k && y.gap.from === b.from);
      if (k === "co") return "the cash-out needs the finished home";
      if (k === "lm") return "the land mortgage comes only with the land";
      if (k === "sale" || (saleOf(k) && saleOf(k).isHome && saleOf(k).t === prj.occupy)) return "the home you live in is sold only at project end";
      if (saleOf(k)) return `${saleOf(k).name} is sold only in month ${saleOf(k).t}`;
      if (k === "landSale") return "the land is sold only in the month you planned";
      if (x && x.later) return "your other personal loan is taken later";
      if (!x || !x.f) return null;
      const f = x.f, young = f.refiTooYoung && f.refiTooYoung.length ? `; ${f.refiTooYoung.join(" + ")} can't be refinanced yet (not ${p.refiMinMonths} months old)` : "";
      const nm = reIsEq(k) ? `the ${f.labelLc || "mortgage on your existing property"}` : k === "spl" || k === "spl2" ? "a personal loan to your spouse" : "a personal loan";
      return f.amount > 0 ? `in month ${b.from} the bank would lend only ${fS(f.amount)} as ${nm}${f.refi ? ` (${fS(f.refi.net)} to you after buying out ${f.refi.names.join(" + ")})` : ""} — ${f.capacity ? f.capacity.limitedBy : "its limit then"}${young} — not enough to keep your cash above zero`
        : `in month ${b.from} the bank would not lend ${nm} (${f.capacity ? f.capacity.limitedBy : "no room"})${young}`;
    }).filter(Boolean);
    b.reason = why.join("; ") || "no loan can be taken then";
    b.closedByLabel = b.closedBy.map(label).join(" + ");
  });
  const big = rb.bridges.slice().sort((a, b) => b.peak - a.peak)[0], n = rb.bridges.length;
  rb.flags.unshift(`Needs bridge money: your cash runs short in month ${big.from} and stays short for ${big.to - big.from} months — at most ${fS(big.peak)} in month ${big.peakT} — until the ${big.closedByLabel} in month ${big.to} close${/ \+ |loans/.test(big.closedByLabel) ? "" : "s"} the gap. No loan can cover it in time: ${big.reason}. You would have to arrange it (a short-term loan, or paying the builder later); its profit, about ${fS(rb.bridgeCost)} at ${rb.bridgeRate.toFixed(2)}% a year, is counted${n > 1 ? ` (${n} gaps in all)` : ""}.`);
  rb.bridges.forEach((b) => {
    rb.events.push({ t: b.from, kind: "bridge", text: `Your cash runs short (at most ${fS(b.peak)}, in month ${b.peakT}) — bridge money is needed until the ${b.closedByLabel} in month ${b.to}.` });
    rb.events.push({ t: b.to, kind: "bridge", text: `The ${b.closedByLabel} close${/ \+ |loans/.test(b.closedByLabel) ? "" : "s"} the gap: the bridge money and its ${fS(b.cost)} profit are repaid.` });
  });
  rb.events.sort((a, b) => a.t - b.t);
  return rb;
}

// still short, and no bridge money saves the plan: keep the earlier loan that shrinks the shortfall the most (coverAny only)
function reCoverPart(r, tried, plan, p, J, whose) {
  if (p.coverAny === false) return r;
  let best = null;
  for (const x of tried) if (x.r2 && x.ks && x.ks[0] === x.key && x.r2.minCash > r.minCash + 1 && (!best || x.r2.minCash > best.r2.minCash)) best = x;
  if (!best) return r;
  const { r2, ks, gap: g } = best, k = ks[0], fs = ks.map((y) => reFacOf(r2, y)), f = fs[0], f0 = reFacOf(r, k);
  const amount = fs.reduce((a, y) => a + y.amount, 0), refis = fs.filter((y) => y.refi), net = fs.reduce((a, y) => a + (y.refi ? y.refi.net : y.amount), 0);
  if (!(amount > 0)) return r;
  r2.plan = plan;
  ks.forEach((y) => [reFacOf(r2, y), r2.facilities.find((z) => z.key === y)].forEach((z) => { if (z && z.amount > 0) z.takenEarly = reFacOf(r, y).startedAt; }));
  const what = reIsEq(k) ? `${f.labelLc || f.label.toLowerCase()} is` : `personal loans${whose(ks)}${RE_PL_STEP[k] === "pl2" ? " planned for the project end" : ""} are`;
  const reach = refis.length ? `, of which ${fS(net)} reaches you after ${refis.flatMap((y) => y.refi.names).join(" + ")} ${refis.some((y) => y.topups) ? "is refinanced" : "is bought out"}` : "";
  r2.coveredPart = { key: k, ...(ks.length > 1 ? { keys: ks } : {}), label: f.label, at: g.from, plannedAt: f0.startedAt, amount, net, before: -r.minCash, after: -r2.minCash };
  const note = `Your cash would run short in month ${g.from} (up to ${fS(-r.minCash)}), so the ${what} taken in month ${g.from} instead of month ${f0.startedAt}: the bank lends ${fS(amount)} then${reach}. That is not enough on its own — your cash still runs short, by up to ${fS(-r2.minCash)} instead of ${fS(-r.minCash)}.`;
  r2.notes = [note].concat(r2.notes || []);
  let i = r2.events.findIndex((e) => e.t === g.from && (reIsEq(k) ? e.kind === "eq" : e.kind === "pl" || e.kind === "spl"));
  if (i < 0) i = r2.events.findIndex((e) => e.t >= g.from);
  r2.events.splice(i < 0 ? r2.events.length : i, 0, { t: g.from, kind: "cover", text: `Your cash would run short now, so the ${what} taken now instead of in month ${f0.startedAt}: the bank lends ${fS(amount)}${reach}. Not enough on its own — your cash still runs short, by up to ${fS(-r2.minCash)} instead of ${fS(-r.minCash)}.` });
  return r2;
}

// a personal-loan step taken in two parts (see reCarryOut): the parts, the note and the "covered by a loan" rows. The second
// part may itself have been taken early (the cover inside the rerun); its own note and row are replaced by these.
function reSplitNote({ r, g, k, plannedAt, choice }, plan, J) {
  const a = r.pl, b = r.pl2, what = `personal loans${J ? " in your name" : ""}${k === "pl2" ? " planned for the project end" : ""}`;
  const g2 = r.covered && !r.covered.split ? r.covered.gap : null;   // the second part taken early: how short the cash would be again
  const whole = `taken whole then${choice ? " (with the old loans this plan chooses to buy out)" : ""}`;
  r.plan = plan;
  [a, r.facilities.find((x) => x.key === "pl")].forEach((x) => { if (x) { x.takenEarly = plannedAt; x.part = 1; } });
  [b, r.facilities.find((x) => x.key === "pl2")].forEach((x) => { if (x) { x.part = 2; if (x.startedAt < plannedAt) x.takenEarly = plannedAt; else delete x.takenEarly; } });
  const part = (f) => `${fS(f.amount)} in month ${f.startedAt}${f.startedAt < plannedAt && f !== a ? " (when your cash runs short again)" : ""}${f.refi ? `, of which ${fS(f.refi.payoff)} buys out ${f.refi.names.join(" + ")} and ${fS(f.refi.net)} reaches you` : ""}`;
  r.covered = { key: k, split: true, label: what, at: g.from, plannedAt, amount: a.amount + b.amount, net: (a.refi ? a.refi.net : a.amount) + (b.refi ? b.refi.net : b.amount), refi: [a, b].flatMap((f) => f.refi ? f.refi.names : []),
    parts: [a, b].map((f) => ({ key: f.key, at: f.startedAt, amount: f.amount, net: f.refi ? f.refi.net : f.amount, refi: f.refi ? f.refi.names : [] })), gap: { from: g.from, to: g.to, peak: g.peak, peakT: g.peakT }, partial: !r.feasible };
  const note = `Your cash would run short in month ${g.from} (up to ${fS(g.peak)}, until the planned loans land in month ${g.to}). ${whole.charAt(0).toUpperCase() + whole.slice(1)}, the ${what} would not keep your cash above zero, so they are taken in two parts, each the bank's maximum when it is taken: ${part(a)}; then ${part(b)}. ${r.feasible ? "The deficit is covered by loans." : "Part of the deficit is covered by loans; the rest needs bridge money."}`;
  r.notes = [note].concat((r.notes || []).filter((x) => !/^Your cash would run short in month/.test(x)));
  r.events = r.events.filter((e) => e.kind !== "cover");
  const put = (t, text) => { let i = r.events.findIndex((e) => e.t === t && e.kind === "pl"); if (i < 0) i = r.events.findIndex((e) => e.t >= t); r.events.splice(i < 0 ? r.events.length : i, 0, { t, kind: "cover", text }); };
  const reach = (f) => f.refi ? `, of which ${fS(f.refi.net)} reaches you after the bank buys out ${f.refi.names.join(" + ")}` : "";
  const covers = r.feasible ? ` The ${fS(g.peak)} deficit is covered by loans.` : "";
  put(a.startedAt, `Your cash would run short now — by up to ${fS(g.peak)} before the planned loans land in month ${g.to} — and the ${what} taken whole now would not be enough, so they are taken in two parts. The first now, as one loan of ${fS(a.amount)}${reach(a)} (they were planned in month ${plannedAt}).${b.startedAt < plannedAt ? "" : ` The second, ${fS(b.amount)}, in month ${b.startedAt}.${covers}`}`);
  if (b.startedAt < plannedAt) put(b.startedAt, `Your cash would run short again${g2 ? ` — by up to ${fS(g2.peak)}` : ""} — so the second part of the ${what} is taken now instead of in month ${plannedAt}: ${fS(b.amount)}${reach(b)}.${covers}`);
  return r;
}

// one strategy, with the "auto" refinance rule: best value first; if that plan fails (runs out of cash or needs bridge money,
// misses your recovery window or leaves your cash at project end below your line) while the most-cash choice does better, use it
function reRunPlan(p, prj, plan) {
  const r = reCarryOut(p, prj, plan);
  if ((plan.refiMode || "auto") !== "auto" || !r.refiDiffers || (r.feasible && r.recoveryOk && r.moveInOk)) return r;
  const r2 = reCarryOut(p, prj, { ...plan, refiMode: "cash" });
  const score = (x) => reStanding(x) * 3 + (reStanding(x) > 0 ? (x.recoveryOk ? 1 : 0) + (x.moveInOk ? 1 : 0) : 0);
  if (score(r2) <= score(r)) return r;
  r2.plan = plan; r2.refiFallback = true;
  r2.refiFallbackWhy = { feasible: r.feasible, bridged: !!r.bridged, bridgePeak: r.bridgePeak || 0, recoveryOk: r.recoveryOk, moveInOk: r.moveInOk, onHandAtMoveIn: r.onHandAtMoveIn, minCash: r.minCash, minCashT: r.minCashT, recoveryMonths: r.recoveryMonths, econAdv: r.econAdv, econPV: r.econPV };
  // the note goes in the month the personal loans are taken (that is when the old loans are bought out), just before that step
  const pls = [r2.pl, r2.pl2, r2.spl, r2.spl2];
  const fRef = pls.find((x) => x && x.startedAt != null && x.amount > 0 && x.refiOptions && x.refiOptions.length > 1) || pls.find((x) => x && x.startedAt != null && x.amount > 0);
  const tRef = fRef ? fRef.startedAt : 0;
  let iRef = r2.events.findIndex((e) => e.t === tRef && (e.kind === "pl" || e.kind === "spl"));
  if (iRef < 0) iRef = r2.events.findIndex((e) => e.t >= tRef);
  r2.events.splice(iRef < 0 ? r2.events.length : iRef, 0, { t: tRef, kind: "rf", text: `Which old loans the bank buys out: buying out the ones that give the best value would ${!r.feasible ? (r.bridged ? `need ${fS(r.bridgePeak)} of bridge money` : "run your cash out") : !r.recoveryOk ? "miss your cash-recovery window" : `leave your cash at project end at ${fS(r.onHandAtMoveIn)}, below your line of ${fS(p.minCashMoveIn == null ? 0 : p.minCashMoveIn)}`}, so this strategy buys out the ones that put the most cash in your hands.` });
  return r2;
}

// a plan that runs out of cash: how much more money would let you carry it out. More cash to start with adds the same amount
// to the cash you can spend in every month (no growth is counted), and the plan is carried out as it says — with more cash a
// loan may cover a gap it could not cover before, so the answer can be well below the most you are short. needMore = the least
// extra cash with which the plan works every month; needMoreBridge = the least with which it works with bridge money (shown
// only when it is clearly less). One bisection over whole riyals narrows both (each run tells how the plan stands), to 0.25% or
// 1,000 SAR; each figure is an amount the plan was run with. null = not found (five doublings of the most you are short).
function reNeedMore(p, prj, plan, r) {
  const W = { lo: 0, hi: null, r: null }, B = { lo: 0, hi: null, r: null };
  const probe = (x0) => {
    const x = Math.ceil(x0), q = reRunPlan({ ...p, cashAvailable: p.cashAvailable + x }, prj, plan), s = reStanding(q);
    if (s >= 2) { if (W.hi == null || x < W.hi) { W.hi = x; W.r = q; } } else W.lo = Math.max(W.lo, x);
    if (s >= 1) { if (B.hi == null || x < B.hi) { B.hi = x; B.r = q; } } else B.lo = Math.max(B.lo, x);
  };
  let top = Math.max(1000, r.shortfall);
  for (let k = 0; k < 6 && W.hi == null; k++, top *= 2) probe(top);
  const none = { needMore: null, needMoreBridge: null, needMoreBridgePeak: 0 };
  if (W.hi == null) return none;
  const open = (S) => S.hi - S.lo > Math.max(1000, S.hi * 0.0025);
  for (let n = 0; n < 80 && (open(W) || open(B)); n++) {
    const S = open(W) && (!open(B) || W.hi - W.lo >= B.hi - B.lo) ? W : B;
    probe((S.lo + S.hi) / 2);
  }
  const out = { needMore: W.hi, needMoreBridge: null, needMoreBridgePeak: 0 };
  if (B.r && B.r.bridged && W.hi - B.hi >= Math.max(5000, 0.02 * W.hi)) { out.needMoreBridge = B.hi; out.needMoreBridgePeak = B.r.bridgePeak; }
  return out;
}
// the runs-out flag and event, with how much more you need (texts say "in month N"; the page turns that into a calendar month)
function reAddNeed(p, prj, r) {
  const n = reNeedMore(p, prj, r.plan, r);
  Object.assign(r, n);
  if (n.needMore == null) return r;
  const alt = n.needMoreBridge != null ? `; with ${fS(n.needMoreBridge)} more it works only with bridge money (up to ${fS(n.needMoreBridgePeak)} until a loan lands)` : "";
  const worst = `At the worst, in month ${r.minCashT}, you would be ${fS(r.shortfall)} short`;
  const i = r.flags.findIndex((f) => /^Your cash runs out in month/.test(f));
  if (i >= 0) r.flags[i] = `Your cash runs out in month ${r.shortFrom} and no loan in this plan covers it in time: to carry this plan out you need ${fS(n.needMore)} more cash to start with${alt}. ${worst}.`;
  r.events.forEach((e) => { if (e.kind === "short") e.text = `Your cash runs out — no loan in this plan covers it in time. To carry this plan out you need ${fS(n.needMore)} more cash to start with${alt}. ${worst}.`; });
  return r;
}

/* ---------- top-level ---------- */
function computeRE(inp, opts) {
  const p = mergeRE(inp);
  const prj = reProject(p);
  const home = p.mode === "home";
  // extra plans (the tool's pick) run after yours, are marked r.tool, and compete in the ranking and the verdict
  const eqId0 = (p.properties.find((x) => x.canMortgage && x.value > 0) || {}).id || null;
  const extra = home && opts && opts.extraPlans ? opts.extraPlans.filter(Boolean).map((o) => { const q = { ...RE_PLAN_DEFAULTS, ...re2ImportPlan(o, eqId0), enabled: true, lmMode: "max", eqMode: "max", plMode: "max", coMode: "max" }; q.mortgages = reNormMorts(q.mortgages); return q; }) : [];
  const results = home ? p.plans.map((o) => o.enabled ? reRunPlan(p, prj, o) : null).concat(extra.map((o) => { const r = reRunPlan(p, prj, o); r.tool = true; return r; }))
    : p.options.map((o) => o.enabled ? reSimulate(p, prj, o) : null);
  // a plan that runs out: how much more cash it needs to work (the plans you see, not the tool's searches)
  if (home && !(opts && opts.noNeed)) results.forEach((r) => { if (r && reStanding(r) === 0) reAddNeed(p, prj, r); });
  const live = results.filter(Boolean);
  const score = (r) => home ? r.econAdv : (r.irr == null ? -Infinity : r.irr);   // home: ranked by "everything grows"
  const ranked = live.slice().sort((a, b) => score(b) - score(a));
  const best = ranked[0] || null;
  // home: plans that work every month first, then plans that work with bridge money, then plans that run out of cash; among
  // plans that work, the more of your two rules a plan meets (cash back at the cushion in time, cash at project end at or above
  // your line) the higher it ranks; then the "everything grows" result
  const rulesMet = (r) => (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0);
  if (home) ranked.sort((a, b) => reStanding(b) - reStanding(a) || (reStanding(b) > 0 ? rulesMet(b) - rulesMet(a) : 0) || b.econAdv - a.econAdv);
  const bestFeasible = home ? (ranked.find((r) => reStanding(r) > 0) || null) : (ranked.find((r) => r.affordable && r.cashOk && r.ltvOk) || null);
  // تضامن: your spouse's income and loans join the household; the bank tests each of you on your own income (reSamaCap)
  const J = home && p.joint && p.joint.on ? p.joint : null, jLoans = J ? p.joint.loans || [] : [];
  const redf = !!(p.joint && p.joint.redf), bands = !!J || !!p.samaBands;   // samaBands: SAMA's bands for a single borrower too
  const incB0 = J ? +J.income || 0 : 0, capPctA = bands ? reSamaCap(p.income, p.dbrCap, redf) : p.dbrCap, capPctB = J ? reSamaCap(incB0, p.dbrCap, redf) : 0;
  const instOfList = (ls) => ls.reduce((a, l) => a + (l.balance > 0 ? l.installment : 0), 0);
  const existingInstA = instOfList(p.existingLoans), existingInstB = instOfList(jLoans);
  const existingInst = existingInstA + existingInstB;
  const existingDbr = p.income > 0 ? existingInstA / p.income * 100 : 0;
  // existing loans whose instalment doesn't fit their balance, rate and months left (the simulation raises a too-low
  // instalment to the one that clears the loan on time; a higher one ends the loan early)
  const warnings = [];
  p.existingLoans.concat(jLoans).filter((l) => l.balance > 0 && l.installment > 0).forEach((l) => {
    const left = Math.max(1, Math.round(l.monthsLeft)), need = rePmt(l.balance, l.rate, left);
    if (l.installment < need - 1) warnings.push(`${l.name}: an instalment of ${fSAR(l.installment)} does not clear ${fS(l.balance)} in ${left} months at ${l.rate}% a year (APR) — the tool uses ${fSAR(need)}. Check the rate or the months left.`);
    else if (l.installment > need * 1.02 + 1) { let b = l.balance, k = 0; const r = l.rate / 1200; while (b > 0.5 && k < 1200) { const i = b * r; b -= Math.min(b + i, l.installment) - i; k++; } warnings.push(`${l.name}: an instalment of ${fSAR(l.installment)} clears ${fS(l.balance)} in about ${k} months, not ${left}. Check the rate (APR) or the months left.`); }
  });
  // an existing mortgage already past the mortgage limit leaves no room for a new one
  const mortCapPct = p.mortgageCap == null ? p.dbrCap : p.mortgageCap, existMortA0 = p.existingLoans.reduce((a, l) => a + (l.type === "mortgage" && l.balance > 0 && l.installment > 0 ? l.installment : 0), 0);
  if (existMortA0 > p.income * mortCapPct / 100 + 0.5) warnings.push(`your existing mortgage${p.existingLoans.filter((l) => l.type === "mortgage").length > 1 ? "s" : ""} already take${p.existingLoans.filter((l) => l.type === "mortgage").length > 1 ? "" : "s"} ${(existMortA0 / p.income * 100).toFixed(0)}% of your income — above the ${mortCapPct}% mortgage limit, so no new mortgage fits until it runs down.`);
  // your properties: a loan named by two properties, a property worth less than the loan secured on it, a plan that mortgages
  // a property after it is sold
  p.existingLoans.forEach((l) => { const on = p.properties.filter((P) => reSecuredOn(l, P)); if (on.length > 1) warnings.push(`${l.name} is named by ${on.map((P) => P.name).join(" and ")} — a loan is secured on one property; the tool nets it from each of them.`); });
  p.properties.forEach((P) => { const owed = p.existingLoans.reduce((a, l) => a + (l.balance > 0 && reSecuredOn(l, P) ? l.balance : 0), 0); if (owed > P.value + 0.5) warnings.push(`${P.name} is worth ${fS(P.value)} but ${fS(owed)} is still owed on it — the bank lends nothing more on it.`); });
  const livesIn0 = prj.moveIn && !((+p.rentOutFixed || 0) > 0 || (+p.rentOutPct || 0) > 0);
  const saleMonth = (P) => P.plan !== "sell" || !(P.value > 0) ? null : P.isHome ? (livesIn0 && !(p.rentNow > 0) ? (P.sellAt === "moveIn" ? prj.occupy : Math.max(prj.occupy, P.sellAt)) : null) : P.sellAt === "moveIn" ? prj.occupy : Math.max(1, P.sellAt);
  p.plans.forEach((o, i) => { if (!o.enabled) return; rePlanMorts(o).forEach((m) => { const P = p.properties.find((x) => x.id === m.id), sT = P ? saleMonth(P) : null; if (sT == null) return; const mT = reStepMonth(prj, m.when, m.month); if (sT <= mT) warnings.push(`Plan ${i + 1} mortgages ${P.name} in month ${mT}, but it is sold in month ${sT} — that step lends nothing.`); }); });
  // تضامن, your spouse: SAMA's other limits (¶15–17 a, b) on the loans they already have
  if (J) {
    const pctB = incB0 > 0 ? existingInstB / incB0 * 100 : 0;
    if (incB0 <= 0) warnings.push("تضامن: your spouse's income is 0, so the joint mortgage uses only your room.");
    else {
      if (pctB > capPctB + 0.5) warnings.push(`تضامن: your spouse's loans already take ${pctB.toFixed(0)}% of their income, above their ${capPctB}% limit — they add no room to a joint mortgage until those loans run down.`);
      if (incB0 < 25000 && pctB > 45.5) warnings.push(`تضامن: your spouse's loans other than mortgages take ${pctB.toFixed(0)}% of their income — SAMA allows 45% below 25,000 SAR a month.`);
      else if (pctB > 33.83) warnings.push(`تضامن: your spouse's loans take ${pctB.toFixed(0)}% of their income — if they are salary-deducted personal finance, SAMA allows 33.33% (25% when retired).`);
    }
  }
  // borrowing-capacity timeline from the existing loans alone (planned settlements honoured): when does room open up?
  // (تضامن: your room and your spouse's; a joint mortgage may use both, personal loans only yours)
  const capTimeline = (() => {
    // (the mortgage room is priced at the purchase mortgage's terms — land finance for land only)
    const H = Math.round(p.horizon * 12), n = Math.max(1, Math.round((prj.isLand ? p.landTenure : p.lmTenure) * 12)), r = reEffRate(p, p.lmRate + (prj.isLand ? +p.landRateAdd || 0 : 0), n), nPl = Math.max(1, Math.round(p.plTenure * 12)), rPl = reEffRate(p, p.plRate, nPl);
    const run = (list) => list.filter((l) => l.balance > 0 && l.installment > 0).map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { bal: l.balance, inst: Math.max(l.installment, rePmt(l.balance, l.rate, left)), rate: l.rate, settleAt: l.settleAt, mort: l.type === "mortgage", on: p.properties.filter((P) => reSecuredOn(l, P)).map((P) => P.id) }; });
    const ls = run(p.existingLoans), lsB = run(jLoans);
    // each property you may mortgage, that month: the room left on it (its value — today's, or the market's then — × the share the
    // bank lends against, less what is still owed on the loan secured on it as it runs down; nothing once it is sold in a month
    // you set — a sale at project end depends on the plan) and the mortgage it would carry: that room, or what your mortgage room
    // carries at the owned-property mortgage terms, whichever is less
    const eqN = Math.max(1, Math.round(p.eqTenure * 12)), eqR = reEffRate(p, p.eqRate, eqN), gP = p.appreciation / 100;
    const propList = p.properties.filter((P) => P.canMortgage && P.value > 0);
    const propsAt = (t, mortRoom) => { const carry = rePrincipalFor(mortRoom, eqR, eqN); return propList.map((P) => {
      const sold = !P.isHome && P.plan === "sell" && P.sellAt !== "moveIn" && t >= Math.max(1, P.sellAt);
      let secured = 0; for (const l of ls.concat(lsB)) if (l.bal > 0.5 && l.on.includes(P.id)) secured += l.bal;
      const value = p.propertyValueBasis === "today" ? P.value : P.value * Math.pow(1 + gP, t / 12), ltvRoom = sold ? 0 : Math.max(0, value * P.ltv / 100 - secured);
      return { id: P.id, name: P.name, ltvRoom, maxMortgage: Math.min(ltvRoom, carry), secured, sold };
    }); };
    const mortInst = (list) => list.reduce((a, l) => a + (l.bal > 0.5 && l.mort ? l.inst : 0), 0);   // existing mortgages running
    const gB = J && J.incomeGrowth != null && J.incomeGrowth !== "" ? +J.incomeGrowth : (p.incomeGrowth || 0);
    const rows = []; let prev = null;
    for (let t = 0; t <= Math.min(H, 120); t++) {
      if (t >= 1) ls.concat(lsB).forEach((l) => { if (l.bal <= 0.5) return; if (l.settleAt && t === Math.round(l.settleAt)) { l.bal = 0; return; } const i = l.bal * l.rate / 100 / 12; const pay = Math.min(l.bal + i, l.inst); l.bal -= pay - i; });
      const inst = ls.reduce((a, l) => a + (l.bal > 0.5 ? l.inst : 0), 0);
      const yT = Math.floor(Math.max(0, t - 1) / 12);
      const incT = p.income * Math.pow(1 + (p.incomeGrowth || 0) / 100, yT);   // the bank's limits follow your income
      const room = Math.max(0, incT * (bands ? reSamaCap(incT, p.dbrCap, redf) : p.dbrCap) / 100 - inst);
      const instB = lsB.reduce((a, l) => a + (l.bal > 0.5 ? l.inst : 0), 0), incBT = incB0 * Math.pow(1 + gB / 100, yT);
      const roomB = J ? Math.max(0, incBT * reSamaCap(incBT, p.dbrCap, J.redf) / 100 - instB) : 0;
      const mortRoomB = J ? Math.max(0, Math.min(roomB, incBT * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100 - mortInst(lsB))) : 0;
      // …and what your spouse could take as personal loans in their own name (their two-loan rule, their per-loan limit)
      const slotsB = Math.max(0, 2 - lsB.filter((l) => l.bal > 0.5 && !l.mort).length), capInstB = Math.min(incBT * p.perLoanCap / 100, rePmt(p.plCap, rPl, nPl));
      const pl1B = J && slotsB >= 1 ? Math.min(roomB, capInstB) : 0, pl2B = J ? Math.min(roomB, Math.min(slotsB, 2) * capInstB) : 0;
      // personal loans: never more than two running at once (your existing personal loans count, a mortgage does not) and each
      // stops at the bank's ceiling per loan; the mortgage room is net of the mortgages you already pay
      const slots = Math.max(0, 2 - ls.filter((l) => l.bal > 0.5 && !l.mort).length), capInst = Math.min(incT * p.perLoanCap / 100, rePmt(p.plCap, rPl, nPl));
      const mortRoom = Math.max(0, Math.min(room, incT * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100 - mortInst(ls))), pl1 = slots >= 1 ? Math.min(room, capInst) : 0, pl2 = Math.min(room, Math.min(slots, 2) * capInst);
      const props = propsAt(t, mortRoom);
      // a row when a loan ends, income steps up — or a property is sold in a month you set (its room goes)
      const key = Math.round(inst) + "|" + Math.round(incT) + (J ? "|" + Math.round(instB) + "|" + Math.round(incBT) : "") + (props.some((x) => x.sold) ? "|sold:" + props.map((x) => (x.sold ? 1 : 0)).join("") : "");
      if (key !== prev) { rows.push({ t, inst, income: incT, room, mortRoom, pl1Room: pl1, pl2Room: pl2, maxMortgage: rePrincipalFor(mortRoom + mortRoomB, r, n), props, propRoom: props.reduce((a, x) => a + x.ltvRoom, 0), ...(J ? { instB, incomeB: incBT, roomB, mortRoomB, pl1RoomB: pl1B, pl2RoomB: pl2B, maxOnePlB: Math.min(p.plCap, rePrincipalFor(pl1B, rPl, nPl)), maxTwoPlB: Math.min(p.plCap, rePrincipalFor(Math.min(pl2B, capInstB), rPl, nPl)) + Math.min(p.plCap, rePrincipalFor(Math.max(0, pl2B - capInstB), rPl, nPl)) } : {}), maxOnePl: Math.min(p.plCap, rePrincipalFor(pl1, rPl, nPl)), maxTwoPl: Math.min(p.plCap, rePrincipalFor(Math.min(pl2, capInst), rPl, nPl)) + Math.min(p.plCap, rePrincipalFor(Math.max(0, pl2 - capInst), rPl, nPl)), maxOneLoan: rePrincipalFor(pl1, r, n), maxAllLoans: rePrincipalFor(room, r, n) }); prev = key; }
    }
    return rows;
  })();
  const household = { warnings, existingInst, existingDbr, dbrRoom: Math.max(0, p.income * capPctA / 100 - existingInstA), perLoanRoom: p.income * p.perLoanCap / 100, mortgageRoom: Math.max(0, p.income * (p.mortgageCap == null ? p.dbrCap : p.mortgageCap) / 100 - p.existingLoans.reduce((a, l) => a + (l.type === "mortgage" && l.balance > 0 ? l.installment : 0), 0)), savings: p.income + incB0 - p.livingExpenses - p.rentNow - existingInst, capTimeline, propertyRoom: capTimeline.length ? capTimeline[0].props : [],
    settleAdvice: home ? reSettleAdviceOf(p, prj) : [],   // settle-or-keep: each old loan against new money and your cash's return (reSettleAdvice)
    ...(J ? { joint: { income: incB0, existingInstA, existingInstB, existingDbrB: incB0 > 0 ? existingInstB / incB0 * 100 : 0, capPctA, capPctB, dbrRoomB: Math.max(0, incB0 * capPctB / 100 - existingInstB) } } : {}) };
  // renter path is common to all options (same rent, same alt return) — take it from any live option
  const renter = live[0] ? live[0].months.map((m) => ({ t: m.t, rentEq: m.rentEq })) : [];
  let verdict, vColor;
  if (!best) { verdict = "NO OPTION"; vColor = C.sub; }
  else if (home) {
    // judged on the strategy you can actually carry out (the recommendation), not on one that runs out of cash;
    // the baseline is renting only if you pay rent today, otherwise it is not building (or not buying) and keeping the cash invested
    // the words: land — BUYING LAND; a villa or a building — BUILDING (built) or BUYING (ready); OWNING / RENTING only when you
    // pay rent today AND move in (a building let out entirely or land: you keep renting either way, so it is BUYING vs NOT)
    const lead = bestFeasible, renting = p.rentNow > 0 && prj.moveIn, act = prj.isLand ? "BUYING LAND" : prj.build ? "BUILDING" : "BUYING";
    if (!lead) { verdict = "NO EXECUTABLE STRATEGY"; vColor = C.neg; }
    else if (lead.econAdv > 0) { verdict = renting ? "OWNING WINS" : `${act} WINS`; vColor = C.pos; } else { verdict = renting ? "RENTING WINS" : `NOT ${act} WINS`; vColor = C.neg; }
  } else {
    const i = best.irr == null ? -1 : best.irr * 100;
    if (i >= 12) { verdict = "ATTRACTIVE"; vColor = C.pos; } else if (i >= p.discountRate) { verdict = "ACCEPTABLE"; vColor = C.brass; } else { verdict = "WEAK"; vColor = C.neg; }
  }
  return { p, prj, results, live, ranked, best, bestFeasible, renter, verdict, vColor, household };
}

// one strategy (or rental option) on its own: what the sensitivity chart and the start-date sweep need, without the others
// (opts.need: a plan that runs out also gets how much more cash it needs, as in computeRE)
function reRunOne(q, idx, opts) {
  const pq = mergeRE(q), prj = reProject(pq), home = pq.mode === "home";
  const o = home ? pq.plans[idx] : pq.options[idx];
  const r = !o || !o.enabled ? null : home ? reRunPlan(pq, prj, o) : reSimulate(pq, prj, o);
  if (r && home && opts && opts.need && reStanding(r) === 0) reAddNeed(pq, prj, r);
  return { prj, r };
}
/* ---------- THE THREE LENSES (reLenses) — which plan carries the least liability, which makes you richest in X years, which
   leaves you the most cash and borrowing power. Pure arithmetic over results (the optimizer runs the same picker, reLensPick,
   over its summaries, so both agree). Candidates = the plans that work every month (plans that work with bridge money only
   when none works without); the recommendation is computeRE's bestFeasible, ranked the same way. Tie-breaks: within 2% the
   next measure decides — least liability: the other measures in the order peak debt → total borrowed → peak instalment →
   profit paid; richest and most cash: the lower peak debt; then the recommended plan, then the earlier plan. ---------- */
// your wealth at year X on the everything-grows measure: that month's econNW, and how far ahead of (or behind) not building
// (econAdv; the same month for every plan, so either ranks the plans alike). X past the horizon reads at the horizon.
function reWealthAt(r, years) {
  const ms = r.months, H = ms.length - 1, t = years == null ? H : Math.min(H, Math.max(0, Math.round(+years * 12)));
  const m = ms[t];
  return { t, years: t / 12, econNW: m.econNW, econBase: m.econBase, econAdv: m.econAdv };
}
const RE_LIABILITY_MEASURES = ["peakDebt", "borrowed", "peakInst", "profit"];   // the order the tie-breaks are tried in
// a result as one row of the figures the lenses read (idx = its place in the list it came from)
const reLensRowOf = (r, idx) => ({ idx, name: r.plan ? r.plan.name : "", tool: !!r.tool, standing: reStanding(r), rulesMet: (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0), econAdv: r.econAdv,
  peakDebt: r.peakDebt, peakDebtT: r.peakDebtT, borrowed: r.newDebtTotal, peakInst: r.peakInst, peakInstT: r.peakInstT, peakInstPct: r.peakInstPct, profit: r.profitPaid, H: r.months.length - 1, occupy: r.occupy,
  wealthAt: (years) => reWealthAt(r, years).econAdv, cashAt: (at) => (at === "horizon" ? r.availEnd : r.availAtMoveIn), borrowableAt: (at) => (at === "horizon" ? r.leverageEnd : r.leverageAtMoveIn).borrowable });
// …and an optimizer summary as one (it carries wealth at 5 / 10 / 15 years and the horizon only)
const reLensRowOfSummary = (x, idx) => ({ idx, name: x.name, tool: true, standing: reStanding(x), rulesMet: (x.recoveryOk ? 1 : 0) + (x.moveInOk ? 1 : 0), econAdv: x.econAdv,
  peakDebt: x.peakDebt, peakDebtT: x.peakDebtT, borrowed: x.newDebt, peakInst: x.peakInst, peakInstT: x.peakInstT, peakInstPct: x.peakInstPct, profit: x.newDebtInterest, H: x.H, occupy: x.occupy,
  wealthAt: (years) => years == null ? x.wealthAtH : years <= 5 ? x.wealthAt5 : years <= 10 ? x.wealthAt10 : years <= 15 ? x.wealthAt15 : x.wealthAtH, cashAt: (at) => (at === "horizon" ? x.availEnd : x.availAtMoveIn), borrowableAt: (at) => (at === "horizon" ? x.leverageEnd : x.leverageAtMoveIn).borrowable });
// opts: liabilityBy "peakDebt" (default) | "borrowed" | "peakInst" | "profit"; years (default the horizon); atMonth "moveIn" (default) | "horizon"
function reLensPick(rows, opts) {
  opts = opts || {};
  const by = RE_LIABILITY_MEASURES.includes(opts.liabilityBy) ? opts.liabilityBy : "peakDebt", at = opts.atMonth === "horizon" ? "horizon" : "moveIn";
  const live = (rows || []).filter(Boolean), none = (standing) => ({ recommended: null, leastLiability: null, richest: null, mostCash: null, candidates: [], standing, liabilityBy: by, atMonth: at, byPlan: {} });
  if (!live.length) return none(-1);
  const H = Math.max(...live.map((x) => x.H)), yearsH = H / 12;
  const years = opts.years == null || opts.years === "horizon" || +opts.years * 12 >= H ? null : +opts.years, yearsTxt = (y) => (Number.isInteger(y) ? String(y) : y.toFixed(1));
  // the recommendation, ranked as computeRE ranks (standing → your rules → everything grows): the first plan that works
  const ranked = live.slice().sort((a, b) => b.standing - a.standing || (b.standing > 0 ? b.rulesMet - a.rulesMet : 0) || b.econAdv - a.econAdv);
  const rec = ranked.find((x) => x.standing > 0) || null;
  const top = Math.max(...live.map((x) => x.standing)), cands = top >= 1 ? live.filter((x) => x.standing === top) : [];
  if (!rec || !cands.length) return none(top);
  const works = top === 2 ? "that works" : "that works with bridge money", only = cands.length === 1;
  const within = (v, best) => Math.abs(v - best) <= 0.02 * Math.max(1, Math.abs(best));
  const pick = (keys) => { let T = cands; for (const [get, max] of keys) { if (T.length <= 1) break; const vals = T.map(get), best = max ? Math.max(...vals) : Math.min(...vals); T = T.filter((x, i) => within(vals[i], best)); } return T.includes(rec) ? rec : T[0]; };   // a tie goes to the recommended plan, then the earlier one
  const liab = { peakDebt: (x) => x.peakDebt, borrowed: (x) => x.borrowed, peakInst: (x) => x.peakInst, profit: (x) => x.profit };
  const L = pick([by].concat(RE_LIABILITY_MEASURES.filter((k) => k !== by)).map((k) => [liab[k], false]));
  const nextL = cands.filter((x) => x !== L).map(liab[by]), next = nextL.length ? Math.min(...nextL) : null, v = liab[by](L);
  const liabWhy = by === "peakDebt" ? `At its worst, in month ${L.peakDebtT}, you would owe ${fS(v)} — ${only ? `the only plan ${works}` : `the least of any plan ${works}`}.`
    : by === "borrowed" ? `This plan borrows ${fS(v)} in total${only ? ` — the only plan ${works}` : next - v > 0.5 ? `, ${fS(next - v)} less than the next` : ", no more than the next"}.`
    : by === "peakInst" ? `Your heaviest month costs ${fSAR(v)} (${(L.peakInstPct || 0).toFixed(0)}% of income); ${only ? `it is the only plan ${works}` : `every other plan ${works} is heavier`}.`
    : `You pay the bank ${fS(v)} in profit and fees over ${yearsTxt(yearsH)} years — ${only ? `the only plan ${works}` : `the least of any plan ${works}`}.`;
  const W = pick([[(x) => x.wealthAt(years), true], [(x) => x.peakDebt, false]]), wv = W.wealthAt(years), wy = years == null ? yearsH : years;
  const C = pick([[(x) => x.cashAt(at) + x.borrowableAt(at), true], [(x) => x.peakDebt, false]]), cash = C.cashAt(at), borrowable = C.borrowableAt(at);
  const out = {
    recommended: { idx: rec.idx, standing: rec.standing, rulesMet: rec.rulesMet, econAdv: rec.econAdv, why: `It ${rec.standing === 2 ? "works every month" : "works with bridge money"}${rec.rulesMet === 2 ? ", meets both of your rules" : rec.rulesMet === 1 ? ", meets one of your two rules" : ""} and leaves you ${fS(Math.abs(rec.econAdv))} ${rec.econAdv >= 0 ? "ahead of" : "behind"} not building at the end — the best of the plans that work${top === 2 ? " every month" : " with bridge money"}.` },
    leastLiability: { idx: L.idx, value: v, measure: by, peakDebt: L.peakDebt, peakDebtT: L.peakDebtT, borrowed: L.borrowed, peakInst: L.peakInst, peakInstT: L.peakInstT, peakInstPct: L.peakInstPct, profit: L.profit, next, why: liabWhy },
    richest: { idx: W.idx, value: wv, years: wy, t: Math.min(H, Math.round(wy * 12)), robust: null, why: `In ${yearsTxt(wy)} years this plan leaves you ${fS(Math.abs(wv))} ${wv >= 0 ? "ahead of" : "behind"} not building — ${only ? `the only plan ${works}` : `the most of any plan ${works}`}.` },
    mostCash: { idx: C.idx, cash, borrowable, value: cash + borrowable, at, t: at === "horizon" ? H : C.occupy, why: `${at === "horizon" ? "At the end of the comparison" : "After moving in"} you would have ${cash >= -0.5 ? `${fS(Math.max(0, cash))} in hand` : `a shortfall of ${fS(-cash)}`} and the bank would still lend you about ${fS(borrowable)} — ${only ? `the only plan ${works}` : `more than any other plan ${works}`}.` },
    candidates: cands.map((x) => x.idx), standing: top, liabilityBy: by, years, atMonth: at, byPlan: {},
  };
  // when two lenses point to the same plan the cards say so
  for (const k of ["recommended", "leastLiability", "richest", "mostCash"]) { const i = out[k].idx; (out.byPlan[i] = out.byPlan[i] || []).push(k); }
  return out;
}
// the lenses over computeRE's results (idx = the plan's place in that list; the tool's pick included when it is there).
// opts.robust with opts.inp (the scenario): "richest" is tagged robust when the same plan is the richest with no appreciation
// (one rerun of the candidates with appreciation 0 — only when asked, so a page can defer it)
function reLenses(results, opts) {
  opts = opts || {};
  const out = reLensPick((results || []).map((r, i) => (r ? reLensRowOf(r, i) : null)), opts);
  if (out.richest && opts.robust && opts.inp) {
    const p0 = mergeRE({ ...opts.inp, appreciation: 0 }), prj0 = reProject(p0);
    const rows0 = out.candidates.map((i) => reLensRowOf(reRunPlan(p0, prj0, results[i].plan), i));
    const alt = reLensPick(rows0, { ...opts, robust: false });
    out.richest.robust = !!(alt.richest && alt.richest.idx === out.richest.idx);
    out.richest.robustIdx = alt.richest ? alt.richest.idx : null;
    out.richest.why += out.richest.robust ? " It stays the richest with no appreciation." : " With no appreciation another plan would be richer — this one leans on prices rising.";
  }
  return out;
}

/* ---------- SETTLE-OR-KEEP ADVISOR (reSettleAdvice): each old loan — yours and your spouse's — against the new money that would
   replace it and against your cash's return, at month 0 with no plan. Its APR (a hamish rate converted over the whole term; the
   hamish equivalent shown too) against the effective yearly cost of new money (the personal-loan terms; the owned-property
   mortgage terms, fee included, for a mortgage) and against the household's net return on cash (cashReturn, net of zakat).
   PV at that return (rePvPayments, payments from next month): keeping = its remaining instalments; settling = balance + the
   early-settlement fee (reSettleCost); a bank buy-out = a new loan of that cost over the SAME remaining months (like for like);
   one over the new product's full tenure is reported as instalment relief, not a saving (stretch). Materiality ε = max(1% of
   the balance, 2,000). Verdicts: "settleCash" — the saving is material, the loan may be settled and your cash above the
   cushion and three months' outgoings covers it; "buyout" — a personal loan the bank may buy out (canRefi, old enough), new
   money more than 0.5 pt cheaper, a material like-for-like saving, the new instalment within the per-loan cap and the two-loan
   rule; both → the larger saving (within ε the buy-out, which keeps your cash); "room" — a loan cheaper than your cash earns
   whose instalment blocks the purchase mortgage today (today's room, priced at the purchase mortgage's terms, carries less than
   the mortgage the project would take): keep it unless a mortgage needs the room (roomValue = its instalment × principal per
   riyal); otherwise "keep". The rule-7 view (no discounting: profit still to pay against the fee) is alongside (rule7). A
   mortgage is never bought out. computeRE puts the rows in household.settleAdvice. ---------- */
function reSettleAdviceOf(p, prj) {
  const J = p.joint && p.joint.on ? p.joint : null;
  const feeMonths = Math.max(0, p.settleFeeMonths), minAge = p.refiMinMonths == null ? 12 : p.refiMinMonths;
  const alt = Math.pow((1 + p.altReturn / 100) * (1 - (p.cashZakatPct || 0) / 100), 1 / 12) - 1, cashReturn = (Math.pow(1 + alt, 12) - 1) * 100;
  const eff = (apr) => (Math.pow(1 + apr / 1200, 12) - 1) * 100, pct = (x) => `${x.toFixed(2)}%`;
  const plN = Math.max(1, Math.round(p.plTenure * 12)), plR = reEffRate(p, p.plRate, plN);
  const eqN = Math.max(1, Math.round(p.eqTenure * 12)), eqR = reEffRate(p, p.eqRate, eqN), eqFee = Math.min(0.5, Math.max(0, (+p.eqFeesPct || 0) / 100));
  // the room a cleared instalment frees, priced at the purchase mortgage's terms (land finance for land only)
  const lmN = Math.max(1, Math.round((prj.isLand ? p.landTenure : p.lmTenure) * 12)), lmR = reEffRate(p, p.lmRate + (prj.isLand ? +p.landRateAdd || 0 : 0), lmN), roomPerRiyal = rePrincipalFor(1, lmR, lmN);
  const loans = p.existingLoans.map((l) => ({ ...l, owner: "A" })).concat(J ? (J.loans || []).map((l) => ({ ...l, owner: "B" })) : []).filter((l) => l.balance > 0 && l.installment > 0)
    .map((l) => { const left = Math.max(1, Math.round(l.monthsLeft)); return { ...l, left, inst: Math.max(l.installment, rePmt(l.balance, l.rate, left)) }; });
  const incA = p.income, incB = J ? +J.income || 0 : 0, redf = !!(p.joint && p.joint.redf), bands = !!J || !!p.samaBands;
  const capA = bands ? reSamaCap(incA, p.dbrCap, redf) : p.dbrCap, capB = J ? reSamaCap(incB, p.dbrCap, redf) : 0, mortPct = p.mortgageCap == null ? p.dbrCap : p.mortgageCap;
  const instOf = (who) => loans.reduce((a, l) => a + (l.owner === who ? l.inst : 0), 0), mortOf = (who) => loans.reduce((a, l) => a + (l.owner === who && l.type === "mortgage" ? l.inst : 0), 0);
  const instAll = instOf("A") + instOf("B");
  // the cash check: what is left today above your cushion and three months' outgoings (living costs, rent, every instalment)
  const spare = p.cashAvailable - p.cashBuffer - 3 * (p.livingExpenses + p.rentNow + instAll);
  // does an instalment block a mortgage? today's room (a joint mortgage: both of yours), at the purchase mortgage's terms, against the purchase mortgage the project would take
  const roomA = Math.max(0, Math.min(incA * capA / 100 - instOf("A"), incA * mortPct / 100 - mortOf("A"))), roomB = J && roomA > 0 ? Math.max(0, Math.min(incB * capB / 100 - instOf("B"), incB * mortPct / 100 - mortOf("B"))) : 0;
  const maxMortgage = rePrincipalFor(roomA + roomB, lmR, lmN), wantMortgage = (prj.build ? prj.land : prj.price) * (prj.isLand ? p.landOnlyLtv : p.landLtv) / 100, mortgageBound = maxMortgage < wantMortgage - 1;
  return loans.map((l) => {
    const mort = l.type === "mortgage", B = l.balance, n = l.left, m = l.inst, apr = l.rate;
    const settleCost = reSettleCost(B, apr, m, n, feeMonths), fee = settleCost - B, eps = Math.max(0.01 * B, 2000);
    const termMonths = Math.max(1, Math.round((l.ageMonths || 0) + n)), flatEquiv = apr > 0 ? (rePmt(1, apr, termMonths) * termMonths - 1) * 1200 / termMonths : 0;   // the hamish rate over the whole term that amortises at this APR
    // the money that would replace it: a personal loan — or, for a mortgage, a mortgage on the property at the shared terms (its fee borrowed too)
    const newApr = mort ? eqR : plR, newN = mort ? eqN : plN, newFeePct = mort ? eqFee : 0;
    const Hc = Math.max(n, newN), pv = (bal, rate, inst) => rePvPayments(bal, rate, inst, 1, 0, Hc, alt);   // the longer term compared; payments from next month, in today's money
    const pvKeep = pv(B, apr, m), costSettle = settleCost;
    const newAmount = settleCost / (1 - newFeePct), pmtBuyout = rePmt(newAmount, newApr, n), pmtStretched = rePmt(newAmount, newApr, newN);
    const pvBuyout = pv(newAmount, newApr, pmtBuyout), pvBuyoutStretched = pv(newAmount, newApr, pmtStretched);
    const saveSettle = pvKeep - costSettle, saveBuyout = pvKeep - pvBuyout, saveStretched = pvKeep - pvBuyoutStretched;
    // the rule-7 view (no discounting): the profit still to pay, against the fee — and against a like-for-like buy-out's profit and fee
    const profitOf = (bal, rate, inst, months) => { let b = bal, s = 0; const r = rate / 1200; for (let k = 0; k < months && b > 0.5; k++) { const i = b * r; s += i; b -= Math.min(b + i, inst) - i; } return s; };
    const profitLeft = profitOf(B, apr, m, 1200), profitBuyout = profitOf(newAmount, newApr, pmtBuyout, n);
    const rule7 = { profitLeft, fee, settleSaves: profitLeft - fee, profitBuyout, buyoutSaves: profitLeft - fee - profitBuyout - (newAmount - settleCost) };
    // the rules (spec §3)
    const canSettle = l.canSettle !== false, cashOk = spare >= costSettle;
    const inc = l.owner === "B" ? incB : incA, slots = 2 - loans.filter((x) => x !== l && x.owner === l.owner && x.type !== "mortgage").length;
    const ageOk = l.ageMonths == null || l.ageMonths >= minAge, refiOk = !mort && l.canRefi !== false && ageOk, fits = pmtBuyout <= inc * p.perLoanCap / 100 + 1e-6 && slots >= 1;
    const settleOk = saveSettle >= eps && canSettle && cashOk, buyoutOk = refiOk && apr > newApr + 0.5 && saveBuyout >= eps && fits, cheap = apr <= cashReturn + 1e-9;
    const verdict = settleOk && buyoutOk ? (saveBuyout >= saveSettle - eps ? "buyout" : "settleCash") : settleOk ? "settleCash" : buyoutOk ? "buyout" : cheap && mortgageBound && !mort && canSettle ? "room" : "keep";
    const roomValue = m * roomPerRiyal, whose = l.owner === "B" ? " (your spouse's loan)" : "";
    let why = verdict === "settleCash" ? `Paying it off now saves ${fS(saveSettle)} in today's money; the fee is ${fSAR(fee)}${whose}.`
      : verdict === "buyout" ? `New money is cheaper (${pct(newApr)} vs ${pct(apr)}): the bank clears it, no cash from you — ${fS(saveBuyout)} saved in today's money${whose}.`
      : verdict === "room" ? `Cheap, keep it — unless a mortgage needs the room: clearing it frees ≈ ${fS(roomValue)} of mortgage.`
      : cheap ? `At ${pct(apr)} this loan is cheaper than your cash earns (${pct(cashReturn)}) and than new money (${pct(newApr)}).`
      : saveSettle >= eps && !cashOk ? `Paying it off would save ${fS(saveSettle)} in today's money, but your cash above the cushion and three months' outgoings does not cover ${fS(costSettle)} — keep it for now.`
      : saveSettle >= eps && !canSettle ? `Paying it off would save ${fS(saveSettle)} in today's money, but you marked it not to be settled.`
      : `At ${pct(apr)} it is dearer than your cash earns (${pct(cashReturn)}), but ${saveSettle >= 0 ? `paying it off would save only ${fS(saveSettle)}` : `paying it off would cost ${fS(-saveSettle)}`} in today's money after the ${fSAR(fee)} early-settlement fee${refiOk ? (apr > newApr + 0.5 ? `, and a buy-out over the same ${n} months ${saveBuyout >= 0 ? `saves only ${fS(saveBuyout)}` : `costs ${fS(-saveBuyout)}`}` : `; new money at ${pct(newApr)} is not cheaper enough`) : ""} — keep it.`;
    // a personal loan kept may still block a mortgage; a stretched buy-out lowers the instalment but is not a saving
    if (verdict === "keep" && !mort && canSettle) why += ` If a mortgage needs the room, clearing its ${fSAR(m)}/mo frees ≈ ${fS(roomValue)} of mortgage.`;
    const stretch = refiOk && newN > n && pmtStretched < m - 1 ? { months: newN, inst: pmtStretched, relief: m - pmtStretched, pv: pvBuyoutStretched, saving: saveStretched, isSaving: saveStretched >= eps } : null;
    if (stretch && verdict !== "buyout") why += stretch.isSaving ? ` A buy-out over ${newN} months would cut the instalment to ${fSAR(pmtStretched)}/mo and save ${fS(saveStretched)} in today's money.` : ` A buy-out over ${newN} months would cut the instalment to ${fSAR(pmtStretched)}/mo (${fSAR(m - pmtStretched)}/mo less) but ${saveStretched < 0 ? `cost ${fS(-saveStretched)} more` : `save only ${fS(saveStretched)}`} in today's money — instalment relief, not a saving.`;
    return { id: l.id, name: l.name, owner: l.owner, type: l.type, apr, flatRate: l.flatRate == null ? null : l.flatRate, flatEquiv, termMonths, balance: B, inst: m, monthsLeft: n, fee, settleCost, newApr, newEff: eff(newApr), newTenure: newN, newFeePct: newFeePct * 100, cashReturn,
      pvKeep, costSettle, pvBuyout, pvBuyoutStretched, pmtBuyout, pmtStretched, saveSettle, saveBuyout, saveStretched, stretch, eps, rule7, roomPerRiyal, roomValue, canSettle, cashOk, spare, refiOk, fits, cheap, mortgageBound, maxMortgage, verdict, why };
  });
}
function reSettleAdvice(inp) { const p = mergeRE(inp); return reSettleAdviceOf(p, reProject(p)); }

// one-way sensitivity (±20%) on the headline metric of one option
function tornadoRE(inp, idx) {
  const p = mergeRE(inp);
  const home = p.mode === "home";
  const metric = (q) => { const { r } = reRunOne(q, idx); if (!r) return 0; return home ? r.econAdv : (r.irr == null ? 0 : r.irr * 100); };
  const base = metric(p);
  const prj0 = reProject(p), build = prj0.build, construct = prj0.construct;   // land only: the land price, no construction drivers
  const drivers = [
    construct ? ["Construction cost / m²", "buildCost"] : !build ? ["Property price", "propertyPrice"] : null,
    build ? ["Land price / m²", "landPrice"] : null,
    ["Financing rates (all)", "__rate"],
    ["Appreciation", "appreciation"],
    home ? ["Rent of equivalent home", "rentNow"] : ["Rent achieved", "rentMo"],
    home ? ["Alternative return on cash", "altReturn"] : ["Vacancy", "vacancyPct"],
    home ? [p.joint && p.joint.on ? "Your incomes (both of you)" : "Your income", "income"] : null,
    construct ? ["Construction duration", "buildMonths"] : null,
  ].filter(Boolean);
  const vary = (k, f) => {
    if (k === "__rate") return { ...p, options: p.options.map((o) => ({ ...o, rate: o.rate * f })), lmRate: p.lmRate * f, plRate: p.plRate * f, eqRate: p.eqRate * f, coRate: p.coRate * f };
    if (k === "income" && p.joint && p.joint.on) return { ...p, income: p.income * f, joint: { ...p.joint, income: (+p.joint.income || 0) * f } };   // تضامن: both salaries
    return { ...p, [k]: p[k] * f };
  };
  return drivers.map(([label, k]) => {
    const a = metric(vary(k, 0.8)) - base, b = metric(vary(k, 1.2)) - base;
    return { label, lo: Math.min(a, b), hi: Math.max(a, b), swing: Math.abs(b - a) };
  }).sort((x, y) => y.swing - x.swing);
}
/* ---------- what-ifs on ONE strategy (the page computes these only when their panel is opened) ---------- */
const reBrief = (r) => r && { feasible: r.feasible, bridged: !!r.bridged, bridgePeak: r.bridgePeak || 0, covered: r.covered || null, recoveryOk: r.recoveryOk, moveInOk: r.moveInOk, onHand: r.onHandAtMoveIn, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, econAdv: r.econAdv, econPV: r.econPV, advantage: r.advantage, netWorth: r.netWorthEnd, peakDbr: r.peakDbr };
// stress tests: each shock on its own, then a combined one; "passes" = the cash never goes below zero
function stressRE(inp, idx) {
  const p = mergeRE(inp), build = reProject(p).construct;   // overrun and delay only where there is a construction (not land, not a ready asset)
  const tests = [
    ["base", "As you entered it", (q) => q],
    ["rates", "Loan rates +2 points (APR)", (q) => ({ ...q, rateShock: 2 })],
    ["appreciation", "No appreciation", (q) => ({ ...q, appreciation: 0 })],
    build ? ["overrun", "Construction costs +20% (no extra value)", (q) => ({ ...q, overrunPct: (q.overrunPct || 0) + 20 })] : null,
    build ? ["delay", "Construction takes 6 months longer", (q) => ({ ...q, buildMonths: q.buildMonths + 6 })] : null,
    ["income", p.joint && p.joint.on ? "Both incomes 20% lower" : "Income 20% lower", (q) => ({ ...q, income: q.income * 0.8, ...(q.joint && q.joint.on ? { joint: { ...q.joint, income: (+q.joint.income || 0) * 0.8 } } : {}) })],
    p.vatPct < 15 ? ["vat", "VAT 15% on construction and finishing", (q) => ({ ...q, vatPct: 15 })] : null,
    ["combined", `Rates +2 points, no appreciation${build ? ", costs +20%" : ""}`, (q) => ({ ...q, rateShock: 2, appreciation: 0, overrunPct: build ? (q.overrunPct || 0) + 20 : q.overrunPct })],
  ].filter(Boolean);
  return tests.map(([key, label, f]) => { const { r } = reRunOne(f({ ...p }), idx); return { key, label, ...reBrief(r), passes: !!(r && r.feasible) }; });   // passes = works every month (with no bridge)
}
// break-evens: the value of one assumption at which building draws level with not building, on each measure
// (null = not reached inside the range searched)
function breakEvenRE(inp, idx, keys) {
  const p = mergeRE(inp), base = reRunOne(p, idx);
  if (!base.r || p.mode !== "home") return null;
  const prj = base.prj, units = prj.isBuilding && prj.letting.netAnnual > 0;   // a building with units: the rent driver is the unit rent
  const lettingOut = (p.rentOutFixed || 0) > 0 || (p.rentOutPct || 0) > 0 || (prj.isBuilding && p.occupancy === "let");
  const solve = (set, lo, hi, metric) => {
    const f = (x) => { const { r } = reRunOne(set(x), idx); return r ? r[metric] : NaN; };
    let flo = f(lo), fhi = f(hi);
    if (!(flo * fhi <= 0)) return null;
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm * flo > 0) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; } }
    return (lo + hi) / 2;
  };
  const drivers = [
    // a rent you receive from the project end (an annex let, or the whole home if you let it) — the "rent equivalent" of living there;
    // a building with units: the rent per unit; land: none
    prj.isLand ? null : units && p.unitRentBasis === "pct" ? ["rentPct", "Rent as % of the all-in cost (a year)", +p.unitRentPct || 0, (x) => ({ ...p, unitRentPct: x }), 0, 40] : units ? ["rent", p.unitRentBasis === "sqm" ? "Rent per m² a year (SAR)" : "Rent per unit (SAR a month)", p.unitRent, (x) => ({ ...p, unitRent: x }), 0, Math.max(50000, (+p.unitRent || 0) * 5)]
      : ["rent", lettingOut ? "Rent for the whole home (SAR a year)" : "Rent you would need to receive from the project end, e.g. an annex (SAR a year)", lettingOut ? (p.rentOutFixed > 0 ? p.rentOutFixed : base.prj.total * p.rentOutPct / 100) : ((p.partRentAnnual || 0) > 0 ? p.partRentAnnual : base.prj.total * (p.partRentPct || 0) / 100), (x) => lettingOut ? { ...p, rentOutFixed: x } : { ...p, partRentAnnual: x }, 0, Math.max(3000000, base.prj.value0 * 0.3)],
    ["appreciation", "Property appreciation (% a year)", p.appreciation, (x) => ({ ...p, appreciation: x }), -10, 30],
    ["return", "Return on cash (% a year)", p.altReturn, (x) => ({ ...p, altReturn: x }), 0, 40],
    prj.construct ? ["uplift", "Value uplift of self-build (%)", p.devMarginPct, (x) => ({ ...p, devMarginPct: x }), -100, 500] : null,
  ].filter(Boolean).filter(([key]) => !keys || keys.includes(key));   // keys: only these drivers (the page fills the panel one at a time)
  return drivers.map(([key, label, current, set, lo, hi]) => ({ key, label, current, econ: solve(set, lo, hi, "econAdv"), rule7: solve(set, lo, hi, "advantage") }));
}
// a ready villa instead: bought in the month you would buy the land, worth what your finished home would be worth by then,
// financed with the same strategy. The most you could pay for it and still do as well as building (on each measure).
function readyBreakEvenRE(inp, idx) {
  const p = mergeRE(inp);
  if (p.kind !== "landVilla") return null;   // only against the villa you would build
  const { prj, r } = reRunOne(p, idx);
  if (!r) return null;
  const g = p.appreciation / 100, buyAt = prj.landMonth;
  // the villa: the same land, and a building worth what yours would be at project end — it already stands, so it starts losing
  // value from the purchase
  const parts = { land: prj.land, building: prj.buildValue }, value = parts.land + parts.building;   // its value when you buy it
  // (v2: the project is its kind — acquire is derived from it in mergeRE, so the what-if switches the kind)
  const run = (price) => reRunOne({ ...p, kind: "readyVilla", acquire: "buy", propertyPrice: price / Math.pow(1 + g, buyAt / 12), finishExtra: 0, readyParts: parts }, idx).r;
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
  const off = { lm: { lmUse: false }, pl: { plWhen: "none" }, pl2: { pl2Use: false }, co: { coUse: false } };
  // تضامن with your spouse's personal loans: one person's loan is left out, the other's stays
  const both = p.joint && p.joint.on && (r.plan.plBy === "spouse" || r.plan.plBy === "both");
  // a mortgage on a property you own: that property's step is left out, the plan's other mortgages stay
  const offOf = (o, f) => both && RE_PL_STEP[f.key] ? { _off: { ...(o._off || {}), [f.key]: true } } : reIsEq(f.key) ? { mortgages: Object.fromEntries(Object.entries(o.mortgages || {}).filter(([id]) => id !== f.propId)) } : off[f.key];
  return r.facilities.filter((f) => f.amount > 0 && (off[f.key] || reIsEq(f.key) || (both && RE_PL_STEP[f.key]))).map((f) => {
    const w = reRunOne({ ...p, plans: p.plans.map((o, j) => j === idx ? { ...o, ...offOf(o, f) } : o) }, idx).r;
    return { key: f.key, label: f.label, propId: f.propId == null ? null : f.propId, amount: f.amount, quoted: f.quoted, apr: f.rate, effYear: (Math.pow(1 + f.rate / 1200, 12) - 1) * 100, netReturn: r.netReturn,
      without: reBrief(w), gain: r.econAdv - w.econAdv, gainPV: r.econPV - w.econPV, perMillionPV: (r.econPV - w.econPV) / f.amount * 1e6, gain7: r.advantage - w.advantage };
  });
}
// A START DATE: for the kinds with a construction it is the month construction starts (the land purchase stays where you set it
// unless the start comes first — or moves with the start when landWithBuild); for land only and the ready kinds there is
// nothing to build, so a start date is the month of the purchase itself. reStartMonth = the planned one (reProject's start);
// reAtStart(inp, d, landWithBuild) = the same scenario started in month d. The sweep and the optimizer use them for every kind.
function reStartMonth(inp) { return reProject(mergeRE(inp)).start; }
function reAtStart(inp, d, landWithBuild) {
  const K = RE_KINDS[inp.kind] || RE_KINDS[mergeRE(inp).kind] || RE_KINDS.landVilla, construct = K.acquire === "build" && !K.land;
  return construct ? { ...inp, buildStart: d, landMonth: landWithBuild ? d : Math.min(inp.landMonth || 0, d) } : { ...inp, landMonth: d };
}
function timingSweepRE(inp, idx, maxDelay, step, landWithBuild) {
  const p = mergeRE(inp);
  maxDelay = maxDelay == null ? 48 : maxDelay; step = step || 3;
  const rows = [];
  // every step from today, plus your planned start so "start as planned" is always tested
  const ds = []; for (let d = 0; d <= maxDelay; d += step) ds.push(d);
  const cur = reProject(p).start; if (!ds.includes(cur)) { ds.push(cur); ds.sort((a, b) => a - b); }   // (land only, a ready home: the purchase month)
  for (const d of ds) {
    const q = reAtStart(p, d, landWithBuild);
    const { r, prj: m } = reRunOne(q, idx);
    if (!r) continue;
    rows.push({ delay: d, feasible: r.feasible, bridged: !!r.bridged, bridgePeak: r.bridgePeak || 0, covered: r.covered || null, recoveryOk: r.recoveryOk, moveInOk: r.moveInOk, onHand: r.onHandAtMoveIn, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, peakDbr: r.peakDbr, peakInst: r.peakInst, mortgage: r.lm.amount, eq: (r.eqs || [r.eq]).reduce((a, f) => a + f.amount, 0), pl: r.pl.amount + (r.spl ? r.spl.amount : 0), co: r.co.amount, rf: r.rf.amount, newDebt: r.newDebtTotal, settled: r.settledTotal, newDebtInterest: r.newDebtInterest, netWorth: r.netWorthEnd, advantage: r.advantage, econAdv: r.econAdv, econPV: r.econPV, total: m.total, occupy: m.occupy, bufferOk: r.minCash >= p.cashBuffer });
  }
  // "best" = the EARLIEST start that works (every month if any start does; else with bridge money) AND meets the most of your
  // rules (cash back at the buffer within your recovery window, cash at project end at or above your line)
  const top = Math.max(0, ...rows.map(reStanding)), ok = top > 0 ? rows.filter((r) => reStanding(r) === top) : [], met = (r) => (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0);
  const best = ok.length ? ok.reduce((b, r) => met(r) > met(b) ? r : b) : null;
  return { rows, best };
}

/* ---------- SAVE AND BUY (reSaveAndBuy): wait, save, and buy with no new loan. The "all cash · no new borrowing" plan
   (RE_PLAN_PRESETS.allCash) run at every month from your planned start (reAtStart) up to opts.maxWait months later (default
   12): while you wait you keep renting and your salary savings build up, exactly as a later start on "When" counts them.
   found = the EARLIEST start at which it works every month without bridge money (null when none does within the wait); its
   figures (cash at project end, the rules, how far ahead of not doing it at the end) sit on found. At the last start tried, need
   = how much more cash it would still need (reNeedMore), so the page can say how far off waiting the full time leaves you.
   opts.scanTo: when nothing works within the wait, the first start up to that many months on that would (later); priceRise =
   how much the all-in cost grows a month while you wait.
   Pure: it changes nothing in the scenario and does not affect computeRE. ---------- */
function reSaveAndBuy(inp, opts) {
  opts = opts || {};
  const p = mergeRE(inp), cur = reProject(p).start, maxWait = Math.max(0, Math.round(opts.maxWait == null ? 12 : +opts.maxWait));
  const plan = { ...RE_PLAN_PRESETS.allCash, enabled: true };
  const rows = []; let found = null, last = null;
  for (let w = 0; w <= maxWait; w++) {
    const q = mergeRE(reAtStart(p, cur + w, opts.landWithBuild)), prj = reProject(q), r = reRunPlan(q, prj, plan);
    const row = { wait: w, delay: cur + w, feasible: !!r.feasible, minCash: r.minCash, minCashT: r.minCashT, occupy: prj.occupy, onHand: r.onHandAtMoveIn, recoveryOk: r.recoveryOk, moveInOk: r.moveInOk, econAdv: r.econAdv, total: prj.total };
    rows.push(row); last = { q, prj, r, row };
    if (r.feasible) { found = { ...row, newDebt: r.newDebtTotal, peakInst: r.peakInst, rulesMet: (r.recoveryOk ? 1 : 0) + (r.moveInOk ? 1 : 0) }; break; }
  }
  let need = null, later = null;
  if (!found && last) { const n = reNeedMore(last.q, last.prj, plan, last.r); need = n.needMore == null ? null : n.needMore; }
  // past the wait you accept: the first month it would work (opts.scanTo months from the planned start at most), so the page
  // can say how long it would really take
  if (!found && opts.scanTo > maxWait) for (let w = maxWait + 1; w <= Math.round(opts.scanTo); w++) {
    const q = mergeRE(reAtStart(p, cur + w, opts.landWithBuild)), prj = reProject(q), r = reRunPlan(q, prj, plan);
    if (r.feasible) { later = { wait: w, delay: cur + w, occupy: prj.occupy }; break; }
  }
  // why the gap moves: the all-in cost rises this much a month while you wait (price growth, cost inflation), against your savings
  const priceRise = rows.length > 1 ? (rows[rows.length - 1].total - rows[0].total) / (rows.length - 1) : 0;
  return { cur, maxWait, found, rows, need, later, priceRise, plan };
}

/* ---------- OPTIMIZER: fill the debt-burden bucket the best way, for every start month ----------
   Treats dbrCap × income as one bucket; every loan is taken at the bank's maximum. Searches every combination of: land (or
   purchase) mortgage yes/no · personal loan(s) at build start yes/no · a mortgage on a property you own — none, or one of the
   TWO properties you may mortgage with the most room left today (reSearchProps), now / when the land is bought / at build start
   (1 + 3k options, k ≤ 2: 48 / 192 / 336 mixes; a mortgage on any other property is a plan-editor choice) · cash-out at
   completion yes/no · how far to pay off old personal loans for a mortgage — just enough / for the largest mortgage / never, and
   "only dearer loans" (settlePolicy "dearer") when at least one of your old personal loans is dearer than the mortgages the
   search grants (reDearerLoans; ×4/3) — · with تضامن, whose the personal loans are (me / spouse / both, ×3 on the mixes with a
   personal-loan step). Personal loans (at build start or at completion) buy out old ones by the strategy's refinance rule
   ("Auto"). Every loan is priced with your Bank terms. For each start: the mix that is executable AND recovers cash within the
   window, then the highest "everything grows" result, then the lowest peak instalment. Fewer runs than mixes, same results:
   two mixes whose steps fall in the same months are one plan (one run — a ready home or land: "when the land is bought" and
   "at build start" are the purchase month; a build that starts with the purchase: the same); and the settle policies differ
   only where a mortgage's room asks for a payoff — the "for the largest mortgage" run tells (plan._trace): when it attempted
   none the four policies are one and the same run (`runs` counts the simulations). */
// the properties the search mortgages: the k (2) you may mortgage with the most room left today — value × the share the bank
// lends against, less the balance of the loan secured on it (yours or your spouse's) — in that order (ties: the earlier property)
function reSearchProps(p, k) {
  const J = p.joint && p.joint.on ? p.joint : null, loans = p.existingLoans.concat(J ? J.loans || [] : []);
  const room = (P) => P.value * P.ltv / 100 - loans.reduce((a, l) => a + (l.balance > 0 && reSecuredOn(l, P) ? l.balance : 0), 0);
  return p.properties.filter((P) => P.canMortgage && P.value > 0).map((P, i) => ({ P, room: room(P), i })).sort((a, b) => b.room - a.room || a.i - b.i).slice(0, k == null ? 2 : k).map((x) => x.P);
}
// the old personal loans "dearer" than the mortgages the search grants: yours and your spouse's, with a balance, that may be
// settled, whose APR is more than dearerMargin points above the cheapest of the mortgage rates the search uses — the purchase
// mortgage (land finance for land only), a mortgage on a property you own when one is searched, the cash-out (not on land).
// settlePolicy "dearer" is worth searching only when there is one (otherwise it is "never" or "for the largest mortgage").
function reDearerLoans(p, prj, withEq) {
  const margin = p.dearerMargin == null ? 0.25 : +p.dearerMargin, n = (y) => Math.max(1, Math.round(y * 12)), shock = p.rateShock || 0;
  const rates = [reEffRate(p, p.lmRate + (prj.isLand ? +p.landRateAdd || 0 : 0), n(prj.isLand ? p.landTenure : p.lmTenure)) + shock];
  if (withEq) rates.push(reEffRate(p, p.eqRate, n(p.eqTenure)) + shock);
  if (!prj.isLand) rates.push(reEffRate(p, p.coRate, n(p.coTenure)) + shock);
  const low = Math.min(...rates), J = p.joint && p.joint.on ? p.joint : null;
  return p.existingLoans.concat(J ? J.loans || [] : []).filter((l) => l.balance > 0 && l.installment > 0 && l.canSettle !== false && l.type !== "mortgage" && l.rate > low + margin);
}
// the words of a mix: what it draws and when, for this kind of project
function reMixWords(prj) {
  const build = prj.construct ? "at build start" : prj.isLand ? "when the land is bought" : "at the purchase";
  const when = (w, m) => w === "start" ? "now" : w === "land" ? (prj.construct ? "when the land is bought" : build) : w === "completion" ? "at completion" : w === "month" ? `in month ${m || 0}` : build;
  const policy = (s, drawn) => s === "none" ? "old loans kept" : s === "forMax" ? (drawn ? "old personal loans paid off to unlock the full mortgage" : "old loans paid off to unlock the full mortgage") : s === "dearer" ? "old loans dearer than the mortgage paid off for its room" : drawn ? "old loans paid off to make room for the mortgage" : "old loans paid off only to make room for a mortgage";
  return { lm: prj.build ? "Land mortgage (max)" : "Purchase mortgage (max)", noLm: prj.build ? "Land in cash" : "Purchase in cash", build, when, policy, eq: (name, w, m) => `mortgage on ${name || "your property"} (max) ${when(w, m)}` };
}
function reAutoName(o, prj, propName) {
  const W = reMixWords(prj), s = [];
  s.push(o.lmUse ? W.lm : W.noLm);
  const m = rePlanMorts(o)[0];
  if (m) s.push(W.eq(propName, m.when, m.month));
  const by = o.plBy === "spouse" ? "your spouse's " : o.plBy === "both" ? "your and your spouse's " : "";   // تضامن
  if (o.plWhen !== "none") s.push(`${by}personal loan(s) (max) ${W.build}`);
  if (o.coUse) s.push("cash-out (max) at completion");
  if (o.pl2Use) s.push(`${by}personal loan(s) (max) at completion`);
  s.push(W.policy(o.settlePolicy, false));
  return s.join(" · ");
}
// opts: maxDelay, step, landWithBuild (a construction start moves the land purchase with it), plannedOnly, delays, slice / merge
// (the page's path), policies (the settle policies to try — default: asNeeded / forMax / none, plus dearer when a dearer loan
// exists), props (how many of your properties the search mortgages, default 2), prepay (false: no early-payoff reruns — the
// old tool's search, for the parity test)
function optimizeRE(inp, opts) {
  opts = opts || {};
  const p0 = mergeRE(inp);
  if (p0.mode !== "home") return null;
  const prj0 = reProject(p0);
  const maxDelay = opts.maxDelay == null ? 48 : opts.maxDelay, step = opts.step || 3, landWithBuild = !!opts.landWithBuild && prj0.construct;
  const base = { ...RE_PLAN_DEFAULTS };   // the shared bank terms apply; nothing else is borrowed from Strategy 1
  // a mortgage on a property you own: none, or one of the (two) properties with the most room left, now / at land / at build
  const searchProps = reSearchProps(p0, opts.props == null ? 2 : Math.max(0, opts.props));
  const eqOpts = [null].concat(...searchProps.map((P) => ["build", "start", "land"].map((when) => ({ P, when }))));
  // تضامن with a spouse who earns: the personal loans may be yours, your spouse's or both of yours (no restriction)
  const J0 = !!(p0.joint && p0.joint.on), byOpts = J0 && (+p0.joint.income || 0) > 0 ? ["me", "spouse", "both"] : ["me"];
  const isLand = p0.kind === "land", coOpts = isLand ? [false] : [false, true];   // no cash-out on land (nothing finished to mortgage)
  // "only dearer loans" joins the settle policies when one of your old loans is dearer than the mortgages the search grants
  const dearerLoans = reDearerLoans(p0, prj0, searchProps.length > 0);
  const policies = Array.isArray(opts.policies) && opts.policies.length ? opts.policies : dearerLoans.length ? ["asNeeded", "forMax", "dearer", "none"] : ["asNeeded", "forMax", "none"];
  // stage 1: every mix of land mortgage · personal loan(s) · a mortgage on a property you own · cash-out · settle policy
  const combos = [];
  // every loan at the bank's maximum; the choices are which loans, when, and how far to pay off old personal loans for a mortgage
  // (the property and the settle policy innermost, so the mixes that are one run sit together in the page's slices)
  for (const lmUse of [true, false]) for (const plWhen of ["build", "none"]) for (const coUse of coOpts) for (const pl2Use of [false, true]) for (const plBy of plWhen !== "none" || pl2Use ? byOpts : ["me"]) for (const eq of eqOpts) for (const settlePolicy of policies) {
    const o = { ...base, enabled: true, lmUse, lmMode: "max", plWhen, plMode: "max", plSplit: true, mortgages: eq ? { [eq.P.id]: { when: eq.when, month: 0 } } : {}, eqMode: "max", coUse, coMode: "max", pl2Use, rfWhen: "none", settlePolicy, plBy };
    o.name = reAutoName(o, prj0, eq ? eq.P.name : null); combos.push(o);
  }
  const summarize = (r, prj, o) => {
    const eqF = (r.eqs || []).find((f) => f.amount > 0) || r.eq;   // the one mortgage step on a property this mix may have
    return { name: o.name, plan: o, feasible: r.feasible, bridged: !!r.bridged, bridgePeak: r.bridgePeak || 0, bridgeCost: r.bridgeCost || 0, covered: r.covered || null, notes: r.notes || [], recoveryOk: r.recoveryOk, moveInOk: r.moveInOk, onHand: r.onHandAtMoveIn, ok: r.feasible && r.recoveryOk && r.moveInOk, recoveryMonths: r.recoveryMonths, minCash: r.minCash, minCashT: r.minCashT, peakInst: r.peakInst, peakDbr: r.peakDbr,
    lm: r.lm.amount, lmCap: r.lm.capacity ? r.lm.capacity.cap : 0, eq: (r.eqs || []).reduce((a, f) => a + f.amount, 0), eqCap: eqF.capacity ? eqF.capacity.cap : 0, eqId: eqF.propId || null, eqName: eqF.propName || null, eqWhen: eqF.step ? eqF.step.when : "none", pl: r.pl.amount, plCap: r.pl.capacity ? r.pl.capacity.cap : 0, plSplit: r.pl.split, co: r.co.amount, coCap: r.co.capacity ? r.co.capacity.cap : 0,
    rf: 0, plNet: r.pl.refi ? r.pl.refi.net : r.pl.amount, plRefi: r.pl.refi ? r.pl.refi.names : [], plTopup: !!r.pl.topups, refiTotal: r.refiTotal,
    pl2: r.pl2.amount, pl2Split: r.pl2.split, pl2Net: r.pl2.refi ? r.pl2.refi.net : r.pl2.amount, pl2Refi: r.pl2.refi ? r.pl2.refi.names : [], pl2Topup: !!r.pl2.topups,
    // تضامن: your spouse's personal loans
    ...(r.spl ? { spl: r.spl.amount, splSplit: r.spl.split, splNet: r.spl.refi ? r.spl.refi.net : r.spl.amount, splRefi: r.spl.refi ? r.spl.refi.names : [], spl2: r.spl2.amount, spl2Split: r.spl2.split, spl2Net: r.spl2.refi ? r.spl2.refi.net : r.spl2.amount, spl2Refi: r.spl2.refi ? r.spl2.refi.names : [] } : {}),
    newDebt: r.newDebtTotal, newDebtInterest: r.newDebtInterest, prepaid: r.prepaidTotal || 0, prepaidAt: r.prepaid && r.prepaid.length ? r.prepaid[0].t : null, settled: r.settledTotal, roomSettled: r.roomSettled, settleFees: r.settleFees, payoffs: r.payoffs.map((x) => ({ t: x.t, name: x.name, cost: x.cost, why: x.why, forKey: x.forKey })), cashAfterWindow: r.cashAfterWindow, cashAtCompletion: r.cashAtCompletion,
    // the lens figures (reLensPick reads them, so the per-lens bests come from these runs — no extra run): the most you owe and
    // when, how far ahead of not building at 5 / 10 / 15 years and the horizon, cash and borrowing power at project end and the end
    peakDebt: r.peakDebt, peakDebtT: r.peakDebtT, peakNewDebt: r.peakNewDebt, peakInstT: r.peakInstT, peakInstPct: r.peakInstPct, wealthAt5: reWealthAt(r, 5).econAdv, wealthAt10: reWealthAt(r, 10).econAdv, wealthAt15: reWealthAt(r, 15).econAdv, wealthAtH: r.econAdv,
    availAtMoveIn: r.availAtMoveIn, leverageAtMoveIn: r.leverageAtMoveIn, availEnd: r.availEnd, leverageEnd: r.leverageEnd, H: r.months.length - 1,
    netWorth: r.netWorthEnd, advantage: r.advantage, econAdv: r.econAdv, econPV: r.econPV, total: prj.total, occupy: prj.occupy, start: prj.start, landMonth: prj.landMonth, flags: r.flags, _r: r };
  };
  // works every month → works with bridge money → runs out; then the more of your rules met (recovery, cash at project end) →
  // result → lowest peak instalment
  const met = (x) => (x.recoveryOk ? 1 : 0) + (x.moveInOk ? 1 : 0);
  const rank = (a, b) => (reStanding(b) - reStanding(a)) || (reStanding(b) > 0 ? met(b) - met(a) : 0) || (b.econAdv - a.econAdv) || (a.peakInst - b.peakInst);
  let tried = 0, runs = 0;
  // evaluate a slice of the mixes for one start (the page fills the start-date table a slice at a time); only each slice's
  // leader keeps its full result, which is all the finish step needs. Mixes that are one plan share one run (see the comment above).
  const evalSlice = (q, from, to) => {
    const p = mergeRE(q), prj = reProject(p);
    // a mix's steps, by the months they fall in (two mixes with the same signature are the same plan)
    const sigOf = (o) => { const m = rePlanMorts(o)[0]; return [o.lmUse ? 1 : 0, m ? m.id : "", m ? reStepMonth(prj, m.when, m.month) : -1, o.plWhen === "none" ? -1 : reStepMonth(prj, o.plWhen, o.plMonth), o.coUse ? 1 : 0, o.pl2Use ? 1 : 0, o.plBy || "me", o.settlePolicy].join("|"); };
    const done = new Map();
    const run = (o) => { const tr = { n: 0, cheap: false }; runs++; const s = summarize(reRunPlan(p, prj, { ...o, _trace: tr }), prj, o); s.trace = tr; return s; };
    const of = (o) => {
      const k = sigOf(o);
      if (done.has(k)) return done.get(k);
      // the settle policies differ only where a mortgage's room asks for a payoff: run "for the largest mortgage" first — when it
      // attempted no payoff, "just enough", "only dearer loans" and "never" are the very same run
      const kMax = sigOf({ ...o, settlePolicy: "forMax" });
      let sMax = done.get(kMax);
      if (!sMax) { sMax = run({ ...o, settlePolicy: "forMax" }); done.set(kMax, sMax); }
      const s = o.settlePolicy === "forMax" || sMax.trace.n === 0 ? sMax : run(o);
      done.set(k, s);
      return s;
    };
    const list = combos.slice(from, to).map((o) => ({ ...of(o), name: o.name, plan: o })).sort(rank);
    list.forEach((x, k) => { if (k > 0) delete x._r; });
    return { list, prj, p };
  };
  const runStart = (q, delay, planned) => { const { list, prj, p } = evalSlice(q, 0, combos.length); tried = combos.length; return finishStart(list, delay, planned, prj, p); };
  const finishStart = (list, delay, planned, prj, p) => {
    list.sort(rank);
    // early payoff: the leading mixes that hold a mortgage (at most 8, ones that work) run once more paying the mortgages off
    // "as soon as the cash allows" (plan.prepayAfter "asap") — holding a mortgage dearer than your cash earns to its term while
    // the cash piles up would otherwise favour short personal loans. Kept only when it paid something off.
    const holdsMortgage = (x) => x.lm > 0 || x.eq > 0 || x.co > 0;
    if (opts.prepay !== false) list.filter((x) => holdsMortgage(x) && reStanding(x) > 0 && x.plan.prepayAfter !== "asap").slice(0, 8).forEach((x) => {
      const o = { ...x.plan, prepayAfter: "asap" }; runs++;
      const s = summarize(reRunPlan(p, prj, o), prj, o);
      if (s.prepaid > 0) list.push({ ...s, name: o.name, plan: o });
    });
    list.sort(rank);
    list.forEach((x, k) => { if (k > 0) delete x._r; });
    const W = reMixWords(prj);
    // name each mix by what it actually drew, and offer a cleaned plan (unused facilities switched off) for copying into a strategy slot
    list.forEach((x) => {
      const o = x.plan, parts = [], m = rePlanMorts(o)[0];
      // a mortgage step that lent nothing but had old loans paid off for its room stays in the cleaned plan (and is named), so
      // the plan copied gives the mix's figures
      const tried = (k) => (x.payoffs || []).some((y) => y.why === "room" && y.forKey === k), none = (s) => s.replace(" (max)", " (nothing granted)");
      const lmKeep = x.lm > 0 || tried("lm"), eqKeep = x.eq > 0 || (!!m && tried(`eq:${m.id}`)), coKeep = x.co > 0 || tried("co");
      parts.push(x.lm > 0 ? W.lm : lmKeep ? none(W.lm) : W.noLm);
      if (eqKeep) parts.push(x.eq > 0 ? W.eq(x.eqName, m ? m.when : "none", m ? m.month : 0) : none(W.eq(x.eqName, m.when, m.month)));
      // تضامن: whose personal loans they are
      const pls = (a, aSplit, aRefi, b, bSplit, bRefi, at, topup) => {
        const one = (sp, rf, who) => `${who}${sp ? "two personal loans" : "personal loan"}${rf.length ? ` refinancing ${rf.join(" + ")}` : ""}`;
        if (topup) return `top-up of ${aRefi.length === 1 ? `${aRefi[0]} with its own bank` : `${aRefi.join(" + ")}, each with its own bank`} (max) ${at}`;
        if (!J0) return `${aSplit ? "two personal loans" : "personal loan"} (max) ${at}${aRefi.length ? ` refinancing ${aRefi.join(" + ")}` : ""}`;
        return `${[a > 0 && one(aSplit, aRefi, "your "), b > 0 && one(bSplit, bRefi, "your spouse's ")].filter(Boolean).join(" and ")} (max) ${at}`;
      };
      if (x.pl > 0 || x.spl > 0) parts.push(pls(x.pl, x.plSplit, x.plRefi, x.spl, x.splSplit, x.splRefi || [], o.plWhen === "completion" ? "at completion" : W.build, x.plTopup && !x.spl));
      if (coKeep) parts.push(x.co > 0 ? "cash-out (max) at completion" : "cash-out (nothing granted) at completion");
      if (x.pl2 > 0 || x.spl2 > 0) parts.push(pls(x.pl2, x.pl2Split, x.pl2Refi, x.spl2, x.spl2Split, x.spl2Refi || [], "at completion", x.pl2Topup && !x.spl2));
      if (x.roomSettled > 0) parts.push(W.policy(o.settlePolicy, true));
      if (o.prepayAfter === "asap") parts.push("pay the mortgage off early when your cash allows");
      x.name = parts.join(" · ");
      const aPl = x.pl > 0 || x.pl2 > 0, bPl = x.spl > 0 || x.spl2 > 0;
      x.cleanPlan = { ...o, name: x.name, lmUse: lmKeep, mortgages: eqKeep ? reNormMorts(o.mortgages) : {}, plWhen: x.pl > 0 || x.spl > 0 ? o.plWhen : "none", coUse: coKeep, pl2Use: x.pl2 > 0 || x.spl2 > 0, rfWhen: x.rf > 0 ? o.rfWhen : "none", plBy: J0 ? (aPl && bPl ? "both" : bPl ? "spouse" : "me") : o.plBy };
    });
    const best = { ...list[0] };
    const r = best._r; delete best._r;
    best.events = r.events; best.facilities = r.facilities;
    best.bucket = r.months.map((m) => ({ t: m.t, inc: m.t >= 1 ? m.inc : p.income, existing: m.existInst, lm: m.lmPay - m.extraPay, eq: m.eqPay, pl: m.plPay, co: m.coPay, rf: m.rfPay }));
    const lite = (x) => { const { _r, flags, trace, ...rest } = x; return rest; };
    const sig = (x) => x.name + "|" + [x.lm, x.eq, x.pl, x.co, x.pl2, x.settled, x.spl || 0, x.spl2 || 0].map((v) => Math.round(v / 1000)).join("|");
    const seen = new Set([sig(best)]), alts = [];
    for (const x of list.slice(1)) { const k = sig(x); if (seen.has(k)) continue; seen.add(k); alts.push(lite(x)); if (alts.length >= 3) break; }
    // best mix that takes a personal loan at completion (refinancing old ones if that helps), for comparison
    const refiBest = list.find((x) => (x.pl2 > 0 || x.spl2 > 0) && x.feasible);
    // the three lenses over the same runs (default measures: peak debt, the horizon, at project end — reLensPick), each with its mix
    // (the mixes carry cleanPlan, so a lens's mix can be copied into a plan like the best)
    const lenses = reLensPick(list.map(reLensRowOfSummary), {});
    for (const k of ["recommended", "leastLiability", "richest", "mostCash"]) if (lenses[k]) lenses[k].mix = lite(list[lenses[k].idx]);
    delete best.trace;
    return { delay, planned, occupy: prj.occupy, total: prj.total, landMonth: prj.landMonth, best, alts, refiBest: refiBest ? lite(refiBest) : null, lenses, nOk: list.filter((x) => x.ok).length, nFeasible: list.filter((x) => x.feasible).length, nBridged: list.filter((x) => x.bridged).length, nCovered: list.filter((x) => x.feasible && x.covered).length, tried: list.length };
  };
  // what the search covered (the page says so): the properties it may mortgage, the settle policies, the dearer loans
  const about = { policies, dearer: dearerLoans.map((l) => l.name), searchProps: searchProps.map((P) => ({ id: P.id, name: P.name })) };
  const curStart = prj0.start;   // the planned start: construction start — the purchase month for land only and the ready kinds
  const at = (d) => reAtStart(p0, d, landWithBuild);
  const isPlanned = (d) => d === curStart && !landWithBuild;
  if (opts.slice) { const d = opts.delays[0], planned = opts.planned != null ? !!opts.planned : isPlanned(d); return { part: evalSlice(planned ? p0 : at(d), opts.slice[0], opts.slice[1]).list, combos: combos.length, runs, ...about }; }
  if (opts.merge) { const { delay, planned, parts } = opts.merge, q = planned ? p0 : at(delay), p = mergeRE(q); return { start: finishStart([].concat(...parts), delay, planned, reProject(p), p), combos: combos.length, ...about }; }
  if (opts.plannedOnly) { const planned = runStart(p0, curStart, true); return { starts: null, planned, earliest: null, richest: null, combos: tried, runs, ...about }; }
  if (opts.delays) { const starts = opts.delays.map((d) => isPlanned(d) ? runStart(p0, d, true) : runStart(at(d), d, false)); return { starts, planned: null, earliest: null, richest: null, combos: tried, runs, ...about }; }
  const starts = [];
  for (let d = 0; d <= maxDelay; d += step) starts.push(runStart(at(d), d, false));
  const planned = runStart(p0, curStart, true);
  const i = starts.findIndex((s) => s.delay === curStart);
  if (i >= 0 && !landWithBuild) starts[i] = planned; else if (i < 0) { starts.push(planned); starts.sort((a, b) => a.delay - b.delay); }
  const earliest = starts.find((s) => s.best.ok) || starts.find((s) => s.best.feasible) || starts.find((s) => s.best.bridged) || null;
  const richest = starts.filter((s) => s.best.ok).sort((a, b) => b.best.econAdv - a.best.econAdv)[0] || null;
  return { starts, planned, earliest, richest, combos: tried, runs, ...about };
}
