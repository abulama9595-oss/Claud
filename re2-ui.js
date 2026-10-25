// v2 page helpers (forked from re-ui.js; the old file is frozen). Loaded by realestate-v2.html after re2-engine.js.
/* Real-estate tool v2 — page helpers for realestate-v2.html (plain JS, no JSX).
   Load after engine.js and re2-engine.js (uses C, fS, fSAR, RE_KINDS, rePlanMorts, reSettleCost, rePmt). Presentation only:
   nothing here changes a number — every figure is read from the engine's results. */

/* ---------- calendar: month 0 is the scenario's "as of" month (YYYY-MM), so saved scenarios keep their dates ---------- */
let RE_T0 = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
const reMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function reSetAsOf(asOf) {
  const m = /^(\d{4})-(\d{2})$/.exec(asOf || "");
  const d = m ? new Date(+m[1], +m[2] - 1, 1) : new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0); RE_T0 = d;
}
// the as-of month of a saved scenario: its own, else the month it was saved, else this month
const reAsOfOf = (inp, savedAt) => (inp && inp.asOf) || (savedAt ? reMonthKey(new Date(savedAt)) : reMonthKey(new Date()));
const fCal = (t) => { const d = new Date(RE_T0.getFullYear(), RE_T0.getMonth() + Math.round(t || 0), 1); return d.toLocaleString("en-US", { month: "short", year: "numeric" }); };
const fMon = (t) => t == null ? "—" : `M${t} · ${fCal(t)}`;
const fYr = (m) => m == null ? "—" : m < 12 ? `${m} mo` : `${(m / 12).toFixed(1)} yrs`;
const pct1 = (v) => v == null ? "—" : `${v.toFixed(1)}%`;
// effective yearly rate of an APR (monthly compounding)
const reEffYear = (apr) => (Math.pow(1 + apr / 1200, 12) - 1) * 100;
// a difference in words, for sentences: "9.75M behind" / "91K ahead of"
const fDiff = (v) => `${fS(Math.abs(v))} ${v >= 0 ? "ahead of" : "behind"}`;

/* ---------- short "how it is calculated" notes; the numbers follow your settings ---------- */
function reExpl(inp) {
  const dbr = inp.dbrCap, mc = inp.mortgageCap, pc = inp.perLoanCap, age = inp.refiMinMonths == null ? 12 : inp.refiMinMonths, fee = inp.settleFeeMonths, ret = inp.altReturn;
  return {
    executable: "The cash you can spend — your own cash, the loans and what your salary saves, with NO return on cash counted — never goes below zero in any month. If it would run short before one of the plan's own loans lands, the tool takes that loan in the month the cash runs short (a personal loan or the mortgage on the property you own, at the bank's maximum then, buying out the old loans it may refinance then — or, when that is not enough, its personal loans in two parts: one loan then and the rest later) and the plan works every month: the deficit is covered by a loan. If no loan can cover it in time, the plan needs bridge money (see 'Bridge money'). If no loan of the plan ever closes the gap, it runs out of cash and the tool shows how much more cash you would need (see 'More cash needed').",
    bridge: `Bridge money: when your cash runs short until one of the plan's loans lands and no loan can cover the gap in time — the bank's room isn't there yet, an old loan can't be refinanced yet, or the gap is closed by the cash-out, which needs the finished home. You would have to arrange it yourself (a short-term loan, or paying the builder later). Its profit, at ${inp.bridgeRate != null && inp.bridgeRate !== "" ? `${inp.bridgeRate}%` : "the personal-loan rate (APR)"} a year on the short balance, is counted until the loan lands and repays it. A plan that needs bridge money ranks after every plan that works without it.`,
    covered: "Your cash would have run short before this loan's planned month, so the tool takes it in the month the cash runs short instead — the bank's maximum then, buying out the old loans it may refinance then — and the plan works every month. If the step is two personal loans and the bank can't lend enough then to cover it whole, it is taken in two parts: one loan when the cash runs short and the rest at its planned month (or earlier, when the cash runs short again), each the bank's maximum when it is taken. The deficit is covered by a loan.",
    recovery: `Months after move-in until the cash you can spend (no growth) is back at or above your safety cushion. Your rule: within ${inp.recoveryMonths} months.`,
    moveIn: `Your rule: your cash at move-in — your own cash, the loans and what your salary saved, less everything the project, fees and payoffs cost, with no return on cash counted — must be at least ${fS(inp.minCashMoveIn == null ? 0 : inp.minCashMoveIn)}. A plan below it ranks after plans that meet the rule, and the tool's search does the same. 0 = never short; raise it to keep a reserve.`,
    payoff: `What it would cost to pay a loan off in a given month: the balance still owed after that month's instalment plus the bank's early-settlement fee — at most the next ${inp.settleFeeMonths} months of profit on the declining balance (SAMA cap). The same fee the tool charges when a plan pays a loan off early.`,
    loansLeft: "Money in from your own cash and every loan taken by the month you move in (a land mortgage counts as paid to the seller for you).",
    salaryLeft: "What your salary saved from month 1 to the month you move in: salary less living costs, rent, every instalment (old and new loans) and upkeep, plus any rent received. No return on cash. If it is below zero your salary did not cover everything and the gap came out of your cash.",
    bankMoveIn: "Your bank balance in the month you move in if the return on your cash is counted too. The tool never spends that return: whether a plan works is judged on your cash without it.",
    needMore: "For a plan that runs out of cash: the least extra cash to start with that lets you carry the plan out as it says, every month, with no return on cash counted (found by trying amounts, to within 0.25% or 1,000 SAR). It is usually well below the most you are short: with the extra cash you keep going until a loan of the plan can be taken (early, when your cash runs short), and that loan pays for the rest. A smaller amount in brackets works only with bridge money until a loan lands. Money that arrives later than the start would have to be there before your cash runs out.",
    cashLow: "The lowest the cash you can spend gets (month end, no return on cash counted): your own cash, the loans and your salary in; living costs, rent, every instalment, the project and payoffs out. Below zero = you would be short by that much — the tool then takes a loan early, needs bridge money, or the plan runs out of cash.",
    cashMoveIn: `The cash you have in the month you move in, with no return on cash counted: money in (your own cash and the loans) + what your salary saved (after living costs, rent and every instalment, month 1 to move-in) − what the land, construction, fees and payoffs cost. Your rule: at least ${fS(inp.minCashMoveIn == null ? 0 : inp.minCashMoveIn)}.`,
    cashAfter: `The cash you can spend ${inp.recoveryMonths} months after move-in (no growth) — your recovery window.`,
    peakInst: `Highest total monthly instalments (existing loans + all new loans) in any month, as % of that month's income, against the bank's ${dbr}% cap. A voluntary extra payment is not an instalment and is left out.`,
    newDebt: "Sum of all new loans actually drawn (land mortgage, mortgages on properties you own, personal loans, cash-out), after the share of the property's value the bank lends against, its per-loan ceiling and the limit on instalments.",
    capacity: `What the bank could lend that month. Your instalment capacity is ONE bucket: ${dbr}% of income. What is left of it (${dbr}% × income − every instalment running that month) is the room; inside the bucket all mortgages together may use up to ${mc}% of income and one personal loan up to ${pc}% (a second personal loan may take what is left; never more than two personal loans at once, old personal loans included — an existing mortgage is not one of them and counts in the mortgage limit instead). The room is converted to a principal at the loan's rate and years (Bank terms), then capped by the share of the property's value the bank lends against and the bank's ceiling per loan.`,
    bucket: `Instalments running each month as % of that month's income, stacked: existing loans, then each new loan. The dashed lines are the bank's limits: ${dbr}% for everything together and ${mc}% for all mortgages together. Free space under the top line is borrowing room you are not using.`,
    optimizer: `For the chosen start the tool tries every mix of: a mortgage on the land (or the purchase) yes/no, personal loan(s) at build start (at the purchase, when there is nothing to build) yes/no, a mortgage on a property you own — none, or one of the two properties with the most room left (the bank lends up to a share of its value, less the loan secured on it), taken now / when the land is bought / at build start —, a cash-out mortgage on the new home at move-in yes/no, personal loan(s) at move-in yes/no, and how far to pay off old personal loans for a mortgage (just enough / for the largest mortgage / only loans dearer than the mortgage, when you have one / never) — 48 mixes with no property, 192 with one, 336 with two or more (a third more when an old loan is dearer than the mortgage; three times as many with a spouse who earns, since the personal loans may be yours, theirs or both of yours), every loan at the bank's maximum and priced with your Bank terms; old personal loans are bought out automatically when a personal loan is taken, by the 'Auto' rule. It keeps the mix that never runs out of cash (a mix that needs bridge money comes after every mix that doesn't), gets cash back to your cushion within ${inp.recoveryMonths} months and keeps your cash at move-in at or above ${fS(inp.minCashMoveIn == null ? 0 : inp.minCashMoveIn)} (your rules), then the highest 'everything grows' result, then the lowest instalments at their highest. A mortgage on another property, or at another time, is yours to set in a plan.`,
    newDebtCost: "All profit paid on the new loans over the comparison plus bank fees and early-settlement fees (including mortgages you pay off early), and the profit on any bridge money.",
    totalInterest: "Profit on new loans + profit still paid on the existing loans + settlement fees.",
    econ: `How strategies are ranked. Everything grows at ${ret}% a year from the month it moves, on both sides: your household cash (salary in; living costs, rent, every instalment and payoff out; growth while it is positive) + the home's value − all debt, against the same household not building: its cash − the old-loan debt it still owes. The difference is shown in riyals of the last month of the comparison and in today's money (discounted at ${ret}%).`,
    econIrr: "The yearly return the money you put into building earns, compared with not building (the extra money building takes and gives back each month, and the home minus debt at the end). Compare it with your return on cash.",
    netWorth: `Your rule-7 measure. Your own cash and the loans, less land, construction, early payoffs and fees, grow at ${ret}% a year from today while positive (instalments never touch it — your salary pays them). Then: − instalments on the new loans (a plain cost) + old-loan instalments you no longer pay + rent received if you let the home out + rent you no longer pay − upkeep + the home's value (no selling costs) − new-loan debt still owed (+ any old-loan balance you no longer owe while the not-building side still does). Salary and living costs are left out.`,
    baseline: `If you don't build: your own cash, invested at ${ret}% a year from today to the end of the comparison. Your old loans run the same whether you build or not; a settlement date you set happens on this side too, so it is not counted as an effect of building. Only what a strategy changes about your old loans (paying one off early, a bank buy-out) is counted, on the strategy's side.`,
    rentOut: "If you let the new home out instead of living in it: annual rent = the % of the all-in project cost, or the fixed annual rent if that is above zero. It starts the month after completion, grows with the rent-growth setting, is added to your monthly cash, and is counted in your rule-7 net worth at face value. No empty months and no management fee are taken off.",
    advantage: `Your rule-7 net worth with this strategy − your own cash grown at ${ret}% a year. Negative means building leaves you poorer than keeping the cash invested.`,
    breakEven: "Time from today until the strategy first catches up with not building (checked only from move-in on).",
    debtFree: "First month with no debt outstanding (existing loans and all new loans).",
    settled: "Principal of old loans you pay off early from your own cash (planned settlements, and payoffs that free room for a mortgage in the bank's debt-burden test) plus the early-settlement fees. A payoff for a mortgage is made just before the mortgage is granted. Loans the bank buys out with a new personal loan are not included here — they are cleared from the new loan.",
    refi: `Personal loans and the bank's buy-out of old loans are one step. When a personal loan is taken, the bank lends its MAXIMUM as one or two loans (each instalment up to ${pc}% of income, together within what is left of your ${dbr}% bucket; never more than two personal loans running at once). The bank can also buy out old personal loans (at least ${age} months old, allowed in step 1): it clears them from the new loan — no cash from you — and pays you the rest. Which ones: 'Auto' (recommended) picks what leaves you richest on the 'everything grows' measure and switches to the choice that puts the most cash in your hands if the plan would otherwise run out of cash, miss your recovery window or leave your cash at move-in below your line; 'Best value' and 'Most cash' always use that rule; 'Choose loans' buys out exactly the loans you tick. Early-settlement fees (${fee} months' profit) apply. Mortgages are never bought out.`,
    settlePolicy: `Your rule: a personal loan is paid off early with your own cash only to free room a MORTGAGE needs in the bank's ${dbr}% test — never to make room for another personal loan. 'Just enough' pays off personal loans one at a time (the one freeing the most instalment per riyal first) until the mortgage covers the funding gap. 'For the largest mortgage' keeps paying them off until the mortgage reaches the most the property allows (the share of its value the bank lends against). 'Only dearer loans' does the same but touches only old loans whose rate is more than ${inp.dearerMargin == null ? 0.25 : inp.dearerMargin} points above the mortgage's — a cheaper old loan is kept even if the mortgage then stays below that share. 'Never' keeps them. The payoff comes from your own cash, before the bank grants the mortgage (a land-purchase mortgage is paid straight to the seller and never reaches you); a loan your cash can't cover is skipped and the next one is tried. Loans with 'Settle from cash?' unticked are never touched; a 'Settle in month' date you set always happens. The optimizer tries the first three.`,
    lenses: "Three ways to choose among the plans that work every month (plans that need bridge money only when none works without). Least liability: the plan with the lowest figure on the measure you pick — the most you owe at once (in any month, old loans included), borrowed in total, instalments at their highest, or profit paid to banks (profit, fees and bridge money). Richest in X years: the plan furthest ahead of not building at that year on the 'everything grows' measure. Most cash and borrowing power: the plan that leaves you the most cash you can spend plus what the bank would still lend you at that moment. When two lenses point to the same plan, the cards merge. Within 2% the next measure decides.",
    leverage: `Cash you have + cash the bank would still lend you, at that month, at your income then. What the bank would lend is what is left of your ${dbr}% bucket: priced as a mortgage first — on the room left under the share of their value the bank lends against on the properties you own (and ${inp.cashoutLtv}% of the new home once it is complete), at the terms of a mortgage on a property you own —, then as personal loans on the room left (two at most, ${pc}% of income each, old personal loans counted). A capacity, not wealth — and a plan that draws every loan at move-in has the cash but no room left.`,
    settleAdvice: `Each old loan against the new money that would replace it and against what your cash earns (${ret}% a year, net of zakat). Its rate is the APR — a hamish rate converted over the whole term, both shown. Keep it when it is cheaper than new money and than your cash earns, or when paying it off saves less than max(1% of the balance, 2,000) in today's money after the early-settlement fee (${fee} months' profit). Settle from cash when the saving is material and your cash above the cushion and three months' outgoings covers it. Let the bank buy it out when a new personal loan over the same remaining months is more than 0.5 point cheaper and the saving is material (a buy-out over a longer term lowers the instalment but costs more — relief, not a saving). A cheap loan may still block a mortgage: clearing its instalment frees about 110–170 riyals of mortgage per riyal of instalment. Mortgages are never bought out.`,
    prepay: `Your option: pay the mortgages off early from your own cash this many months after move-in (after that month's instalments), most expensive first, as long as the cash above your safety cushion covers the payoff plus the early-settlement fee (${fee} months' profit). Leave it empty and mortgages run to their end.`,
    dbrRoom: `Bank total cap (${dbr}% of income) minus the instalments running today — the free part of your bucket. Inside it all mortgages together may use up to ${mc}% of income and one personal loan up to ${pc}%.`,
    savings: inp.joint && inp.joint.on ? "Your income + your spouse's − living expenses − rent − both of your existing instalments, per month, today." : "Income − living expenses − rent − existing instalments, per month, today.",
    plBy: "تضامن: a personal loan is in one person's name. Me — yours, sized on your income and your room under your limit. My spouse — your spouse's, sized on their income and their room (their own two-loan rule; it can buy out their own old loans). Both of us — each of you takes the bank's maximum in your own name, in the same month. The money goes into the household's cash either way; each person's instalments count against their own income. More loans means more cash in hand but more profit paid — the plan's result shows which is better.",
    joint: "تضامن (joint finance): you and your spouse take the new mortgages together — the land or purchase mortgage and the cash-out at move-in. The bank tests each of you on your own income (SAMA Responsible Lending Principles for Individual Customers, Chapter IV ¶15–17): all of a person's monthly credit obligations may take at most 55% of their income up to 15,000 SAR (65% for a Ministry of Housing / REDF-supported mortgage), 65% above 15,000 and below 25,000, and from 25,000 the bank's own policy (your limit). The tool uses the stricter of that and your bank's limit, and the mortgage limit for each of you on your own income. A joint mortgage may use both of your rooms; its instalment counts against each of you in proportion to your room when it is taken (fixed for the life of the loan). A mortgage on a property you own stays yours. Personal loans are taken in one person's name and sized on that person's own income and room (one loan's instalment at most the per-loan limit of their income, two loans at most, buying out only their own old loans): each plan says who takes them — you, your spouse or both of you — and the tool's pick tries all three. Your spouse's salary and their existing loans run through the household's money whether you build or not, so the comparison stays like for like. Income the bank recognises: gross salary (after GOSI) with fixed allowances, plus half of other regular income you can show for two years; Citizen Account and social security don't count. SAMA also limits salary-deducted personal finance to 33.33% of salary (25% retired) and debts other than mortgages to 45% below 25,000 — the tool warns when your spouse's existing loans pass them.",
    earliest: `Earliest start (every 3 months from today, plus your planned start) that never runs out of cash (with no bridge money if any start manages that), gets cash back to your cushion within your recovery window and keeps your cash at move-in at or above your line; if no start meets all of your rules, the earliest that meets the most of them. ${inp.kind === "land" || inp.kind === "readyVilla" || inp.kind === "readyBuilding" ? "There is nothing to build, so a start date is the month you buy." : "A start date is the month construction starts; the land purchase stays where you set it unless the start comes first, in which case it moves to the start (or moves with the start, if you say so)."}`,
    startDate: inp.kind === "land" ? "A start date is the month the land is bought: everything that follows — the holding costs, the planned sale — moves with it." : inp.kind === "readyVilla" || inp.kind === "readyBuilding" ? "There is nothing to build, so a start date is the month of the purchase: you pay for it then (at that month's price, grown with the market) and move in — or let it — the month after." : "A start date is the month construction starts. The land purchase stays where you set it unless the start comes first, in which case it moves to the start; 'bought when you start building' moves it with the start.",
    landWithBuild: "Where the land purchase goes when a start date is tried: left where you set it (bought first, construction later), or moved to the start date (bought when you start building).",
    cost: "Land (grown at the appreciation rate to the purchase month) + RETT + the broker's fee on the land + construction (built-up m² × SAR/m², inflated to the start month) + soft costs + contingency + extras + any cost overrun + VAT.",
    value: `The home's market value = land + building. The land grows at the appreciation rate (${inp.appreciation}% a year) from the month it is bought. The building is worth what it costs to build (construction + soft costs + extras) × (1 + self-build uplift ${inp.devMarginPct}%) — the uplift is on what you build, not on the land — added as it is built, then it loses ${inp.buildDeprPct == null ? 2 : inp.buildDeprPct}% of that value a year from move-in (straight-line, never below zero). VAT, RETT, fees, contingency and overruns add no value. A ready home you buy keeps its price + finishing growing with the market.`,
    buildDepr: "Wear and age: each year from move-in the building loses this % of what it was worth when finished (straight-line, so 2% means it is worth nothing after 50 years). The land is not affected — it keeps growing at the appreciation rate. 0 keeps the building's value flat.",
    letting: `A building's units. Let out entirely: every unit is let from the month after completion and you do not move in (you keep paying the rent you pay today). You live in one: the other units are let like an annex of your home. Rent per unit a month as entered — or a rent per m² a year on ${inp.netLettablePct}% of the built area, spread over the units. Net of the ${inp.vacancyPct}% of the year the units stand empty and a ${inp.mgmtPct}% management fee (+ VAT). The rent goes into your cash; the bank does not count it as income.`,
    rentFreeze: inp.rentFreezeUntil ? `Riyadh rent freeze: no rent increase — on the rent you receive or the rent you pay — until ${inp.rentFreezeUntil}; from then on rents take their yearly steps (${inp.rentGrowth}% a year, the first a year after the freeze ends). Blank for a city without the freeze.` : `No rent freeze: rents grow ${inp.rentGrowth}% a year in yearly steps.`,
    whiteLand: `White-land fee (رسوم الأراضي البيضاء): a yearly % of the land's market value on undeveloped land inside the city, charged monthly from the first January after the purchase while your undeveloped plots there (this one plus the others you own) add up to ${fSAR(RE_WHITE_LAND_MIN_AREA)} m² or more. Riyadh charges by zone (10 / 7.5 / 5 / 2.5%); 0 outside those zones. A villa plot is below the threshold and pays nothing.`,
    landZakat: `Land held to sell is trade goods: zakat of ${RE_LAND_ZAKAT_PCT}% of its market value a year (ZATCA), charged monthly here. Land you hold for yourself: none.`,
    landSale: `Selling the land in that year: its market value then less ${inp.landSellCostPct}% selling costs (broker and RETT) lands in your cash; the mortgage on the land is repaid first, with the early-settlement fee; from then on the land is no longer counted as yours.`,
    properties: "The properties you already own. A plan may mortgage one (the bank lends up to a share of its value — 70% as a rule — on today's value or the market value at the time, see Bank terms, less what you still owe on a loan secured on it; nothing once it is sold). The rent a property earns today goes into your cash whether you build or not (the bank does not count it as income). A property sold at move-in pays for the project — only the building side sells it, and its value leaves the comparison; one sold in a month you set is sold whether you build or not, so both sides get the proceeds. Any mortgage on it, and any loan secured on it, is repaid from the sale with the early-settlement fee. The home you live in today can be let after you move (a yearly % of its value) or sold at move-in; the not-building side keeps it as it is.",
    terms: "One set of terms per loan type, used by every strategy and by the optimizer. Rates are entered as your bank quotes them (flat \"hamish\" or APR — the switch on this card); the tool converts a flat rate to the APR it amortises with, and shows the effective yearly rate (monthly compounding) next to it.",
    // the project (step 0) and the settings the new tool added
    kind: "What you are deciding on. Buy land and build a villa: the land now, construction when you say, you move in when it is finished. Buy a ready villa: one purchase, move in the month after. Buy land only: hold it (a sale year is optional; the white-land fee and zakat on land held to sell are counted) or build later. Buy land and build a residential building, or buy a ready one: priced and valued like the villa, with its units let out — you live in one or let it out entirely. Every project runs through the same household simulation: your cash, your salary, your loans and your properties, month by month.",
    occupancy: "A building: 'I live in one unit' lets the other units like an annex of your home (you move in when it is finished and stop paying rent). 'Let out entirely' lets every unit from the month after completion and you do not move in — you keep paying the rent you pay today. Rent received goes into your cash; the bank never counts it as income.",
    readyAsset: `A ready home or building is land plus a building that ages. The land share is the part of the price that is land — it grows with the market (${inp.appreciation}% a year) — and the rest, with the finishing, is the building, already ${inp.readyAge || 0} years old, which loses ${inp.buildDeprPct == null ? 2 : inp.buildDeprPct}% of its as-new value a year. Leave the land share blank and the whole price grows with the market, as a market price does.`,
    valueBasis: "What a mortgage on a property you own is sized on: its market value at the time (grown with the market from today) or today's value. The bank lends up to the property's share of that, less what is still owed on a loan secured on it.",
    samaBands: `SAMA's debt-burden bands for a single borrower (Responsible Lending Principles ¶15–17): all instalments together at most 55% of income up to 15,000 a month (65% with a Ministry of Housing / REDF-supported mortgage), 65% from 15,000 to 25,000, and your bank's own limit (${dbr}%) from 25,000. On: the stricter of the band and your bank's limit, month by month as your income grows. Off: your bank's limit alone.`,
    landFinance: `Land only is financed differently from a home: the bank lends up to ${inp.landOnlyLtv}% of the land (not ${inp.landLtv}%), over ${inp.landTenure} years, at ${inp.landRateAdd} points above the mortgage rate. These terms size the mortgage on the land and the room table for a land project.`,
    dearerMargin: `'Only dearer loans': an old loan is paid off for a mortgage's room only when its yearly rate (APR) is more than ${inp.dearerMargin == null ? 0.25 : inp.dearerMargin} points above the mortgage's. The tool's search tries this policy when one of your old loans is that much dearer than the mortgages it grants.`,
    cashout: `Cash-out mortgage on the new home: once the home is finished the bank lends up to ${inp.cashoutLtv}% of its value, less what is still owed on the land (or purchase) mortgage secured on the same home, paid to you. Taken at move-in, within your mortgage limit.`,
    // the three strategy cards, one by one
    recommended: "The plan the tool recommends: among the plans that work every month (with bridge money only when none works without), the one that meets the most of your two rules — cash back at your cushion in time, cash at move-in at or above your line — and then leaves you furthest ahead of not building when everything grows.",
    leastLiability: "The plan that takes on the least, on the measure you pick: the most you owe at once (in any month, old loans included), borrowed in total (every new loan added up), instalments at their highest (your heaviest month, as a share of income) or profit paid to banks (profit, fees and bridge money over the comparison). Within 2% the next measure decides. Only plans that work are compared.",
    richest: "The plan that leaves you furthest ahead of not building at the year you pick, when everything grows: your cash (salary in, every payment out, growth while positive) + the property − all debt, against the same household not building. A year past the end of the comparison reads at the end. Only plans that work are compared.",
    mostCash: "The plan that leaves you the most cash you can spend plus what the bank would still lend you, at the moment you pick (after moving in, or at the end). The cash is yours without any return counted; the loan is a capacity — priced as a mortgage on the room left on the properties you own and the new home first, then as personal loans on the room left in your bucket. Only plans that work are compared.",
    toolLenses: "The tool's search also keeps its best mix on each of the three strategies — least liability, richest, most cash and borrowing power — from the same runs. Any of them can be copied into a new plan.",
    // the room table's property columns, and why a loan was paid off
    propertyRoom: "For each property you own and may mortgage: the room left on it that month — the bank lends up to a share of its value (today's, or the market's then), less what is still owed on the loan secured on it as that loan runs down — and the mortgage it would carry, which is also limited by the room left in your mortgage limit. A property sold in a month you set has no room from then on. A plan may use one property or several.",
    payoffWhy: "Why an old loan was paid off from your cash: a settlement date you set (it happens whether or not you build), or room for a mortgage — the bank wants the instalment cleared before it grants the mortgage named; 'dearer' means it was chosen because its rate is above the mortgage's (the 'only dearer loans' policy).",
  };
}

// a result's property sales (r.sales; an older result's ownSale alone)
const reSalesOf = (r) => (r && r.sales) || (r && r.ownSale ? [{ isHome: true, ...r.ownSale }] : []);
/* ---------- "how did you get this number": project money only (presentation; adds up exactly to the engine) ----------
   Your own cash + every loan, minus what the project and the payoffs cost — no salary, living costs, instalments or
   investment return. `total` is the rule-6 cash on hand WITHOUT growth; `ret` is the growth on it up to `upto`. */
function fundingBridgeRows(r, upto, inp, prj) {
  // each line carries the month it happens (t) so a page can list them in date order; rows stay in a fixed order here
  const rows = [], add = (label, v, note, t) => { if (Math.abs(v) >= 0.5) rows.push({ label, v, note, t: t == null ? 0 : t }); };
  const inRange = (t) => t !== null && t !== undefined && t <= upto;
  add("Your own cash", r.cashStart, "the cash you have, set in step 1", 0);
  r.payoffs.filter((x) => inRange(x.t)).forEach((x) => add(`Old loan paid off early: ${x.name}`, -x.cost, `${fCal(x.t)} · incl. ${fSAR(x.fee)} early-settlement fee`, x.t));
  const build = inp.acquire === "build";
  const landPart = inRange(prj.landMonth) ? (build ? prj.land + prj.rett + (prj.landBroker || 0) : prj.total) : 0;
  const spend = r.months.filter((x) => x.t <= upto).reduce((a, x) => a + x.spend, 0);
  add(build ? `Land price + ${inp.rettPct}% transfer tax${prj.landBroker > 0 ? ` + ${inp.landBrokerPct}% broker` : ""}` : "Purchase price, tax, broker and finishing", -landPart, fCal(prj.landMonth), prj.landMonth + 0.5);
  r.facilities.filter((f) => inRange(f.startedAt) && f.amount > 0 && f.key !== "rf").forEach((f) => {
    add(f.key === "lm" ? (build ? "Land mortgage, paid to the seller" : "Purchase mortgage, paid to the seller") : f.refi ? `${f.owner === "B" ? "Your spouse's new" : "New"} personal loan(s), bank's maximum` : `Loan paid to you: ${f.labelLc || f.label.toLowerCase()}`, f.amount, f.key === "lm" ? `${fCal(f.startedAt)} · never passes through your hands` : fCal(f.startedAt), f.startedAt);
    if (f.refi) add(`The bank clears ${f.refi.names.join(" + ")} with it (buy-out)`, -f.refi.payoff, `${fCal(f.startedAt)} · paid by the bank directly, incl. early-settlement fees`, f.startedAt);
  });
  add("Construction and finishing", -(spend - landPart), `${fCal(prj.start + 1)} → ${fCal(Math.min(upto, prj.start + prj.bm))}`, prj.start + 1);
  const feeFacs = r.facilities.filter((f) => inRange(f.startedAt) && f.key !== "rf" && f.fees > 0.5);
  add("Bank fees on new loans", -feeFacs.reduce((a, f) => a + f.fees, 0), null, feeFacs.length ? Math.min(...feeFacs.map((f) => f.startedAt)) : 0);
  (r.prepaid || []).filter((x) => inRange(x.t)).forEach((x) => add(`Mortgage paid off early: ${x.nameLc || x.name.toLowerCase()}`, -x.cost, `${fCal(x.t)} · incl. ${fSAR(x.fee)} early-settlement fee`, x.t));
  // the properties you sold (the home you lived in, or another one), net of selling costs and of the loans repaid from the sale
  reSalesOf(r).filter((s) => inRange(s.t)).forEach((s) => add(s.isHome ? "Sale of the home you lived in, net" : `Sale of ${s.name}, net`, s.net, `${fCal(s.t)} · after selling costs${s.payoff > 0 ? " and repaying its mortgage" : ""}${s.oldPayoff > 0 ? ` and ${(s.oldNames || []).join(" + ")}` : ""}${s.side === "both" ? " · sold whether or not you build" : ""}`, s.t));
  if (r.landSale && inRange(r.landSale.t)) add("Sale of the land, net", r.landSale.net, `${fCal(r.landSale.t)} · after selling costs${r.landSale.payoff > 0 ? " and repaying the land mortgage" : ""}`, r.landSale.t);
  const holdMs = r.months.filter((x) => x.t <= upto && x.holding > 0);
  add("Holding the land (white-land fee, zakat)", -holdMs.reduce((a, x) => a + x.holding, 0), holdMs.length ? `${fCal(holdMs[0].t)} → ${fCal(holdMs[holdMs.length - 1].t)}` : null, holdMs.length ? holdMs[0].t : 0);
  const bridgeMs = r.months.filter((x) => x.t <= upto && x.bridgeInt > 0);
  add("Bridge money while your cash was short (profit)", -bridgeMs.reduce((a, x) => a + x.bridgeInt, 0), "until the loan that closes the gap lands", bridgeMs.length ? bridgeMs[0].t : 0);
  const total = rows.reduce((a, x) => a + x.v, 0);
  const ret = r.months.filter((x) => x.t <= upto).reduce((a, x) => a + (x.cRet || 0), 0);
  // does the salary really carry living costs + every instalment each month?
  let worst = Infinity, worstT = 0, short = 0;
  r.months.filter((x) => x.t >= 1 && x.t <= upto).forEach((x) => { const s = x.inc - x.liv - x.rentPaid - x.existInst - x.lmPay - x.eqPay - x.plPay - x.coPay - x.rfPay - x.ownerCost; if (s < worst) { worst = s; worstT = x.t; } if (s < 0) short -= s; });
  return { rows, total, ret, worst: worst === Infinity ? 0 : worst, worstT, short };
}

/* ---------- plain-English description of a strategy, generated from its settings ---------- */
const whenTxt = (w, mo, prj) => w === "start" ? "at the start" : w === "land" ? `when the land is bought (${fCal(prj.landMonth)})` : w === "build" ? `when construction starts (${fCal(prj.start)})` : w === "completion" ? `at completion (${fCal(prj.occupy)})` : `in ${fCal(mo)}`;
const refiTxt = (o) => (o.refiMode === "cash" ? "buying out the old personal loans that put the most cash in your hands" : o.refiMode === "value" ? "buying out old personal loans only where that leaves you richer" : o.refiMode === "pick" ? "buying out only the old loans you chose" : "buying out old personal loans where that leaves you richer (or puts more cash in hand if needed)");
function describePlan(o, inp, prj, build) {
  // each step with the month it happens; listed in that order (a payoff before the mortgage it makes room for, the loans
  // before what they pay for, the finished home before the loans that need it)
  const s = [], add = (t, k, text) => s.push({ t, k, text });
  const tw = (w, m) => w === "start" ? 0 : w === "land" ? prj.landMonth : w === "build" ? prj.start : w === "completion" ? prj.occupy : Math.max(0, Math.round(m || 0));
  (inp.existingLoans || []).filter((l) => l.balance > 0 && l.settleAt != null && l.settleAt > 0).forEach((l) => add(l.settleAt, 0, `settle ${l.name} in ${fCal(l.settleAt)} from your cash`));
  const eqs = rePlanMorts(o);   // mortgages on properties you own (v2: plan.mortgages)
  const mortT = [o.lmUse ? prj.landMonth : null, ...eqs.map((m) => tw(m.when, m.month)), o.coUse ? prj.occupy : null].filter((x) => x != null);
  if (mortT.length && o.settlePolicy !== "none") add(Math.min(...mortT), 1, o.settlePolicy === "forMax" ? "first pay off as many old personal loans as it takes for the mortgage to reach the most the property allows (from your own cash, before the bank grants it)" : o.settlePolicy === "dearer" ? `first pay off only old loans dearer than the new mortgage (more than ${inp.dearerMargin == null ? 0.25 : inp.dearerMargin} points above its rate), as many as it takes for the mortgage to reach the most the property allows (from your own cash, before the bank grants it); cheaper old loans are kept` : "first pay off old personal loans only if a mortgage would not fit in the bank's test otherwise (from your own cash, before the bank grants it)");
  if (o.lmUse) add(prj.landMonth, 2, `mortgage the ${build ? "land" : "purchase"} when it is bought (${fCal(prj.landMonth)}) for the maximum the bank allows — paid to the seller`);
  const props = inp.properties || [], nameOf = (id) => { const P = props.find((x) => String(x.id) === String(id)); return P ? P.name : eqs.length === 1 ? "the property you already own" : `property ${id}`; };
  eqs.forEach((m) => add(tw(m.when, m.month), 2.1, `mortgage ${nameOf(m.id)} ${whenTxt(m.when, m.month, prj)} for the maximum the bank allows`));
  // the properties you sell (the home you live in at move-in on this side; another at move-in on this side, or in a month you set on both)
  const livesIn = prj.moveIn !== false && !((+inp.rentOutFixed || 0) > 0 || (+inp.rentOutPct || 0) > 0);
  props.filter((P) => P.plan === "sell" && P.value > 0 && (!P.isHome || (livesIn && !(inp.rentNow > 0)))).forEach((P) => {
    const t = P.isHome ? (P.sellAt === "moveIn" ? prj.occupy : Math.max(prj.occupy, P.sellAt)) : P.sellAt === "moveIn" ? prj.occupy : Math.max(1, P.sellAt), both = !P.isHome && P.sellAt !== "moveIn";
    add(t, 8.1, `sell ${P.isHome ? "the home you live in" : P.name} ${t === prj.occupy ? `at move-in (${fCal(t)})` : `in ${fCal(t)}`} — its value then less ${P.sellCostPct}% selling costs, any mortgage on it repaid${both ? "; you would sell it whether or not you build, so the comparison does too" : ""}`);
  });
  // تضامن: whose name the personal loans are in
  const plWho = !(inp.joint && inp.joint.on) ? "take personal loan(s)" : o.plBy === "spouse" ? "your spouse takes personal loan(s) in their name" : o.plBy === "both" ? "each of you takes personal loan(s) in your own name" : "take personal loan(s) in your name";
  if (o.plWhen !== "none") add(tw(o.plWhen, o.plMonth), 2.2, `${plWho} ${whenTxt(o.plWhen, o.plMonth, prj)} for the maximum the bank allows, ${refiTxt(o)}`);
  add(prj.landMonth, 3, build ? `buy the land (${fCal(prj.landMonth)})${o.lmUse ? " with that mortgage and your cash" : " in cash — no mortgage on it"}` : `buy the home (${fCal(prj.landMonth)})${o.lmUse ? " with that mortgage and your cash" : " in cash — no mortgage on it"}`);
  if (o.extraMo > 0) add(prj.landMonth, 3.1, `pay ${fSAR(o.extraMo)} a month extra on the land mortgage`);
  const isLand = !!prj.isLand, done = isLand ? "when the land is paid for" : prj.moveIn === false ? "at completion" : "at move-in";   // (v2 kinds: land has no build and no move-in; a building let out entirely has no move-in)
  if (build && prj.bm > 0) add(prj.start, 4, `build (${fCal(prj.start + 1)} → ${fCal(prj.start + prj.bm)}), paid from your cash, your salary and those loans`);
  if (o.coUse && !isLand) add(prj.occupy, 5, `when the ${prj.isBuilding ? "building" : "home"} is finished (${fCal(prj.occupy)}), take a cash-out mortgage on it for the maximum the bank allows`);
  if (o.pl2Use) add(prj.occupy, 6, `${plWho} ${done} (${fCal(prj.occupy)}) for the maximum the bank allows, ${refiTxt(o)}`);
  if (o.prepayAfter != null && o.prepayAfter !== "") add(prj.occupy + Math.round(o.prepayAfter), 7, `pay the mortgages off early from your cash ${o.prepayAfter} months after ${isLand ? "the land is paid for" : prj.moveIn === false ? "completion" : "move-in"} (${fCal(prj.occupy + Math.round(o.prepayAfter))}) if the cash above your cushion covers it`);
  if (prj.saleAt != null) add(prj.saleAt, 8, `sell the land in ${fCal(prj.saleAt)} (its value then less ${inp.landSellCostPct}% selling costs; the land mortgage is repaid from it)`);
  const steps = s.sort((a, b) => a.t - b.t || a.k - b.k).map((x) => x.text);
  if (o.settlePolicy === "none" || !mortT.length) steps.push("keep your other old loans running");
  steps.push("if your cash would run short before a planned loan, that loan is taken when the cash runs short (if the bank can lend enough then)");
  const t = steps.join("; ") + ".";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const newDebtOf = (r) => r.newDebtTotal || 0;
const facTxt = (f) => f.startedAt !== null && f.amount > 0 ? `${fS(f.amount)} ${fMon(f.startedAt)} · ${fSAR(f.pmt)}/mo (bank max ${fS(f.capacity ? f.capacity.cap : 0)})${f.split ? ` as two new loans (${fS(f.split[0])} + ${fS(f.split[1])})` : ""}${f.refi ? ` · buys out ${f.refi.names.join(" + ")} · ${fS(f.refi.net)} to you` : ""}${f.prepaidAt != null ? ` · paid off early ${fCal(f.prepaidAt)}` : ""}${f.soldAt != null ? ` · repaid ${fCal(f.soldAt)} when ${f.propName || "the property"} was sold` : ""}${f.part ? ` · ${f.part === 1 ? "first" : "second"} part of the step` : ""}${f.takenEarly != null ? ` · taken when your cash ran short (planned ${fCal(f.takenEarly)})` : ""}` : f.capacity ? (f.key === "rf" ? `not taken — ${f.capacity.limitedBy}` : `refused — ${f.capacity.limitedBy}`) : "not used";

/* ---------- existing-loan import: JSON array (any sensible keys) or CSV "name, balance, instalment, months, rate" ---------- */
function parseLoans(text) {
  const pick = (o, keys, d) => { for (const k of keys) { const hit = Object.keys(o).find((x) => x.toLowerCase().replace(/[^a-z]/g, "") === k); if (hit != null && o[hit] !== "" && o[hit] != null) return o[hit]; } return d; };
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const yes = (v) => !(v === false || /^(false|no|n|0)$/i.test(String(v).trim()));   // "false" / "no" / 0 in a JSON file mean no
  let arr = null;
  try { const j = JSON.parse(text); arr = Array.isArray(j) ? j : (j.loans || j.items || j.data || null); } catch (e) {}
  if (arr) return arr.map((o, i) => ({ id: Date.now() + i, name: String(pick(o, ["name", "lender", "bank", "title", "loan"], `Loan ${i + 1}`)), type: /mortg|عقار|home|house|villa|property/i.test(String(pick(o, ["type", "kind", "category", "product"], ""))) ? "mortgage" : "personal", balance: num(pick(o, ["balance", "remaining", "remainingbalance", "outstanding", "principal", "amount"], 0)), installment: num(pick(o, ["installment", "instalment", "monthly", "monthlypayment", "payment", "emi"], 0)), monthsLeft: Math.round(num(pick(o, ["monthsleft", "months", "remainingmonths", "term", "tenure"], 0))), rate: num(pick(o, ["rate", "apr", "interest", "profitrate"], 6)), settleAt: (() => { const v = pick(o, ["settleat", "settlemonth", "settlein"], null); return v == null ? null : Math.round(num(v)); })(), canSettle: yes(pick(o, ["cansettle", "maysettle"], true)), canRefi: yes(pick(o, ["canrefi", "mayrefinance", "canrefinance"], true)), ageMonths: (() => { const v = pick(o, ["agemonths", "age", "monthssincestart", "elapsed", "monthspaid"], null); return v == null ? null : Math.round(num(v)); })() }));
  // tabs or semicolons win, so "95,000" survives when columns are tab- or semicolon-separated
  return text.split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^name/i.test(l)).map((l, i) => { const c = l.split(/[;\t]/.test(l) ? /[;\t]/ : /,/).map((s) => s.trim()); return { id: Date.now() + i, name: c[0] || `Loan ${i + 1}`, balance: num(c[1]), installment: num(c[2]), monthsLeft: Math.round(num(c[3])), rate: c[4] != null && c[4] !== "" ? num(c[4]) : 6 }; }).filter((l) => l.balance > 0 || l.installment > 0);
}

/* ---------- number styles ---------- */
// one signed style for numbers: −2.15M / −12,306 (never brackets)
const fM = (n) => n == null || isNaN(n) ? "—" : (Math.round(n) < 0 ? "−" : "") + fS(Math.abs(n));
// cash is never shown below zero: a shortfall reads "short X" — the money you would need
const fCash = (n) => n == null || isNaN(n) ? "—" : Math.round(n) < 0 ? `short ${fS(-n)}` : fS(n);
const fSARm = (n) => n == null || isNaN(n) ? "—" : (Math.round(n) < 0 ? "−" : "") + fSAR(Math.abs(n));

// rule-6 cash on hand vs your bank balance the same month: the bank also holds what your salary left after living costs,
// rent, every instalment and upkeep (+ any rent received), and the return earned on the balance
function cashReconcile(r, upto, inp, prj) {
  const fb = fundingBridgeRows(r, upto, inp, prj);
  const ms = r.months.filter((x) => x.t >= 1 && x.t <= upto), sum = (f) => ms.reduce((a, x) => a + f(x), 0);
  const salary = sum((x) => x.inc - x.liv - x.rentPaid + x.rentIn + (x.propRentIn || 0) - x.existInst - x.lmPay - x.eqPay - x.plPay - x.coPay - x.rfPay - x.ownerCost);
  // what your salary did up to that month, line by line (no return on cash); the lines add up to `salary`
  const extra = sum((x) => x.extraPay || 0);
  const salaryRows = [
    ["Your salary", sum((x) => x.inc), null],
    ["Living costs", -sum((x) => x.liv), null],
    ["Rent you pay until you move in", -sum((x) => x.rentPaid), null],
    ["Rent received", sum((x) => x.rentIn), null],
    ["Rent your properties earn", sum((x) => x.propRentIn || 0), "what they earn today, until one is sold"],
    ["Old-loan instalments", -sum((x) => x.existInst), "while your old loans run"],
    ["New-loan instalments", -sum((x) => x.lmPay + x.eqPay + x.plPay + x.coPay + x.rfPay), extra > 0.5 ? `incl. ${fSAR(extra)} of extra payments` : null],
    ["Upkeep", -sum((x) => x.ownerCost), "maintenance and insurance from move-in"],
  ].filter(([, v]) => Math.abs(v) >= 0.5).map(([label, v, note]) => ({ label, v, note }));
  const growth = r.months.filter((x) => x.t <= upto).reduce((a, x) => a + x.ret, 0);
  // `total` = the cash you have that month with NO return counted = onHand + salary (= bank − growth)
  return { onHand: fb.total, salary, salaryRows, total: fb.total + salary, growth, bank: r.months[upto].cash, fb };
}

// cash at move-in in three parts that are never shown as negative cash: money in (your own cash, the loans, a sale),
// what your salary saved (after living costs, rent and every instalment) and money out (land, construction, fees, payoffs,
// bridge profit). moneyIn + salary + moneyOut (a negative flow) = cash at move-in, with no return on cash counted
function reMoveInParts(r, upto, inp, prj) {
  const fb = fundingBridgeRows(r, upto, inp, prj), rc = cashReconcile(r, upto, inp, prj);
  const inRows = fb.rows.filter((x) => x.v > 0).sort((a, b) => a.t - b.t), outRows = fb.rows.filter((x) => x.v < 0).sort((a, b) => a.t - b.t);
  const moneyIn = inRows.reduce((a, x) => a + x.v, 0), moneyOut = outRows.reduce((a, x) => a + x.v, 0);
  return { inRows, outRows, moneyIn, moneyOut, salary: rc.salary, salaryRows: rc.salaryRows, total: moneyIn + rc.salary + moneyOut, rc };
}

/* ---------- a new loan, month by month, and what it costs to pay it off early in any year ---------- */
// the loan's months exactly as the engine runs them: from the month after it is taken, profit on the balance, then the
// instalment (plus any voluntary extra on the land mortgage), until it is repaid. `natural` = as if you kept it (ignores an
// early payoff or a bank buy-out); otherwise it stops where the plan stops it (settledAt)
function reLoanSchedule(f, extraMo, natural) {
  const out = [];
  if (!f || f.startedAt == null || !(f.amount > 0)) return out;
  const r = f.rate / 1200, extra = f.key === "lm" ? Math.max(0, extraMo || 0) : 0, stop = natural || f.settledAt == null ? Infinity : f.settledAt;
  let bal = f.amount;
  for (let t = f.startedAt + 1; bal > 0.5 && t < stop && t <= f.startedAt + 1200; t++) {
    const int = bal * r, pay = Math.min(f.pmt + extra, bal + int);
    bal -= pay - int;
    out.push({ t, bal, int, pay });
  }
  return out;
}
// what it costs to pay a new loan off early: one row per year of the loan (12, 24, … months after it was taken) and its last
// instalment — the balance after that month's instalment, the early-settlement fee the engine charges (the next feeMonths
// months' profit on the declining balance, the SAMA cap), the total, the profit you would still pay if you kept it, and
// what you have paid so far. at(t) gives the same for any month (at the start month: just taken, nothing paid yet).
// early = the plan's own payoff as the engine booked it: paid off early from your cash after that month's instalment
// (prepaid), or before that month's instalment — bought out by a new personal loan (refinanced), repaid when you sell the
// home it is secured on (sold), or paid from your cash to make room for a mortgage (settled)
function rePayoffRows(f, extraMo, feeMonths) {
  const s = reLoanSchedule(f, extraMo, true);
  if (!s.length) return null;
  let paid = 0, profit = 0;
  const cum = s.map((x) => { paid += x.pay; profit += x.int; return { paid, profit }; }), totalProfit = profit, n = s.length;
  const row = (k) => {
    const x = k < 0 ? { t: f.startedAt, bal: f.amount } : s[k], c = k < 0 ? { paid: 0, profit: 0 } : cum[k];
    const monthsPaid = x.t - f.startedAt, bal = x.bal > 0.5 ? x.bal : 0;
    const total = bal > 0 ? reSettleCost(bal, f.rate, f.pmt, Math.max(0, f.n - monthsPaid), feeMonths) : 0;
    return { t: x.t, year: Math.ceil(monthsPaid / 12), bal, fee: total - bal, total, profitLeft: totalProfit - c.profit, paid: c.paid, profitPaid: c.profit, monthsLeft: n - k - 1 };
  };
  const rows = [];
  for (let k = 11; k < n; k += 12) rows.push(row(k));
  if (!rows.length || rows[rows.length - 1].t !== s[n - 1].t) rows.push(row(n - 1));
  const at = (t) => { const k = Math.round(t) - f.startedAt - 1; return k >= -1 && k < n ? row(k) : null; };
  const early = f.prepaidAt != null ? { kind: "prepaid", t: f.prepaidAt, row: at(f.prepaidAt) }
    : f.settledAt != null ? { kind: f.refinancedAt != null ? "refinanced" : f.soldAt != null ? "sold" : "settled", t: f.settledAt, row: at(Math.max(f.startedAt, f.settledAt - 1)) } : null;
  return { rows, at, start: f.startedAt, end: s[n - 1].t, early, totalProfit, totalPaid: paid };
}

// a strategy's title in plain words, generated from its settings (your own name is kept as a subtitle)
// r (optional, a result or a tool summary): a loan the tool took early because your cash would run short (r.covered) is
// named "when your cash runs short". joint (optional): تضامن is on — the personal loans then say whose they are (taken from r
// when not given)
// props (optional): your properties (inp.properties), to name the one a mortgage step is on (else the result's facilities name it)
function planTitle(o, build, r, joint, props) {
  const when = { start: "now", land: "when the land is bought", build: "at build start", completion: "at move-in", month: "in a month you chose" };
  const cov = r && r.covered ? RE_PL_STEP[r.covered.key] || r.covered.key : null, short = r && r.covered && r.covered.split ? "in two parts, when your cash runs short" : "when your cash runs short";
  const pl = o.plWhen && o.plWhen !== "none", pl2 = !!o.pl2Use, parts = [];
  const plW = cov === "pl" ? short : when[o.plWhen], pl2W = cov === "pl2" ? short : "at move-in";
  const J = joint != null ? !!joint : !!(r && (r.spl != null || (r.months && r.months[0] && r.months[0].incB != null)));
  const pls = !J ? "personal loans" : o.plBy === "spouse" ? "your spouse's personal loans" : o.plBy === "both" ? "personal loans for both of you" : "your personal loans";
  if (o.lmUse) parts.push(build ? "mortgage the land" : "mortgage the purchase");
  // the plan's mortgages on properties you own (plan.mortgages), each named
  const eqs = rePlanMorts(o), eqW = eqs.length ? eqs[0].when : "none";
  const nameOf = (id) => { const P = props && props.find((x) => String(x.id) === String(id)); if (P) return P.name; const f = r && (r.eqs || []).find((x) => x.propId === id); if (f && f.propName) return f.propName; return eqs.length === 1 ? "the property you own" : `property ${id}`; };
  eqs.forEach((m) => parts.push(`mortgage ${nameOf(m.id)} ${cov === `eq:${m.id}` ? short : when[m.when] || ""}`.trim()));
  if (pl || pl2) parts.push(pl && pl2 ? `${pls} ${plW} and ${pl2W}` : pl ? `${pls} ${plW}` : `${pls} ${pl2W}`);
  if (o.coUse) parts.push("a cash-out mortgage on the new home at move-in");
  if (!parts.length) return "Pay from your cash — no new loans";
  const t = parts.join(", then ");
  return o.lmUse || eqW !== "none" || o.coUse ? t.charAt(0).toUpperCase() + t.slice(1) : "No mortgage: " + t;
}

// what a strategy actually does, in date order, as short steps (from its result)
function planSteps(r, build) {
  const s = [], J = !!(r.months && r.months[0] && r.months[0].incB != null);   // تضامن: say whose personal loan it is
  (r.payoffs || []).forEach((x) => s.push({ t: x.t, kind: "settle", label: `Pay off ${x.name}`, amount: x.cost, note: "from your cash" }));
  r.facilities.filter((f) => f.startedAt != null && f.amount > 0 && f.key !== "rf").forEach((f) => {
    const who = !J ? "" : f.owner === "B" ? "Your spouse's " : "Your ", P = who ? "personal loan" : "Personal loan";
    const label = f.key === "lm" ? (build ? "Land mortgage" : "Purchase mortgage") : /^eq/.test(f.key) ? `Mortgage on ${f.propName || "your property"}` : f.key === "co" ? "Cash-out mortgage" : f.split ? `${who}${who ? "two new personal loans" : "Two new personal loans"}` : f.part ? `${who}${P}, ${f.part === 1 ? "first" : "second"} part` : `${who}${P}`;
    const note = (f.key === "lm" ? "paid to the seller" : f.refi ? `the bank clears ${f.refi.names.join(" + ")}; ${fS(f.refi.net)} to you` : "paid to you") + (f.takenEarly != null ? " · taken when your cash runs short" : "");
    s.push({ t: f.startedAt, kind: f.key, label, amount: f.amount, note });
  });
  (r.prepaid || []).forEach((x) => s.push({ t: x.t, kind: "settle", label: `Pay off the ${x.nameLc || x.name.toLowerCase()} early`, amount: x.cost, note: "from your cash" }));
  reSalesOf(r).forEach((x) => s.push({ t: x.t, kind: "cash", label: x.isHome ? "Sell the home you lived in" : `Sell ${x.name}`, amount: x.net, note: `net, into your cash${x.payoff > 0 || x.oldPayoff > 0 ? `, after repaying ${[x.payoff > 0 ? "its mortgage" : null, x.oldPayoff > 0 ? (x.oldNames || []).join(" + ") : null].filter(Boolean).join(" and ")}` : ""}${x.side === "both" ? " · sold whether or not you build" : ""}` }));
  if (r.landSale) s.push({ t: r.landSale.t, kind: "cash", label: "Sell the land", amount: r.landSale.net, note: r.landSale.payoff > 0 ? "net, into your cash, after repaying the land mortgage" : "net, into your cash" });
  return s.sort((a, b) => a.t - b.t);
}

// one control for when personal loans are taken (it sets plWhen and pl2Use together)
const RE_PL_TIMING = [
  ["none", "No personal loans", { plWhen: "none", pl2Use: false }],
  ["build", "When construction starts", { plWhen: "build", pl2Use: false }],
  ["movein", "At move-in", { plWhen: "none", pl2Use: true }],
  ["build+movein", "When construction starts, and again at move-in", { plWhen: "build", pl2Use: true }],
  ["start", "Now", { plWhen: "start", pl2Use: false }],
  ["start+movein", "Now, and again at move-in", { plWhen: "start", pl2Use: true }],
  ["land", "When the land is bought", { plWhen: "land", pl2Use: false }],
  ["land+movein", "When the land is bought, and again at move-in", { plWhen: "land", pl2Use: true }],
  ["month", "In a month I choose", { plWhen: "month", pl2Use: false }],
  ["month+movein", "In a month I choose, and again at move-in", { plWhen: "month", pl2Use: true }],
  ["completion", "At move-in, before any cash-out (older setting)", { plWhen: "completion", pl2Use: false }],
];
const plTimingOf = (o) => { const w = o.plWhen || "none"; if (w === "completion") return "completion"; return w === "none" ? (o.pl2Use ? "movein" : "none") : w + (o.pl2Use ? "+movein" : ""); };

// instalments running each month by loan, for the borrowing-limit chart (a voluntary extra payment is left out)
const bucketOf = (r) => r.months.map((m) => ({ t: m.t, inc: m.t >= 1 ? m.inc : (r.months[1] ? r.months[1].inc : 0), existing: m.existInst, lm: m.lmPay - m.extraPay, eq: m.eqPay, pl: m.plPay, co: m.coPay, rf: m.rfPay }));

/* ---------- where a plan's "vs not building" comes from (adds up exactly to r.econAdv) ----------
   Salary and living costs are the same on both sides, so they drop out; principal you borrow and repay drops out against
   the debt still owed. What is left: */
function reWealthParts(r) {
  const ms = r.months, end = ms[ms.length - 1], sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
  const refi = [r.pl, r.pl2, r.spl, r.spl2].filter((f) => f && f.refi && f.refi.items).flatMap((f) => f.refi.items);
  const oldPaid = (r.payoffs || []).filter((x) => x.old !== false).reduce((a, x) => a + x.cost, 0) + refi.filter((x) => x.old).reduce((a, x) => a + x.cost, 0);
  // the properties you sold: a sale repays the plan's mortgage on it (its fee is a new-loan cost) and any old loan secured on it
  // (its payoff is an old-loan cost); what only this side sold counts against what it would be worth (ownGone); a property sold
  // on both sides drops out
  const sales = reSalesOf(r), oldSold = sales.reduce((a, s) => a + (s.oldPayoff || 0), 0);
  const newFees = r.facilities.reduce((a, f) => a + f.fees, 0) + (r.payoffs || []).filter((x) => x.old === false).reduce((a, x) => a + x.fee, 0) + refi.filter((x) => !x.old).reduce((a, x) => a + x.fee, 0) + (r.prepayFees || 0) + sales.reduce((a, s) => a + (s.fee || 0), 0) + (r.landSale ? r.landSale.fee : 0);
  const land = r.kind === "land";   // v2: land only — the land sold (its price after costs; its value is 0 after) and what holding it cost
  const parts = [
    { key: "value", label: land ? "The land's value at the end" : "The home's value at the end", v: end.value },
    ...(land ? [{ key: "landSold", label: "The land you sold (price after selling costs)", v: r.landSale ? r.landSale.value - r.landSale.costs : 0 }, { key: "holding", label: "Holding the land (white-land fee, zakat)", v: -sum("holding") }] : []),
    { key: "cost", label: "What the project cost (land, taxes, fees, construction)", v: -sum("spend") },
    { key: "newLoans", label: "Profit and fees on the new loans", v: -(sum("newInt") + newFees) },
    { key: "bridge", label: "Bridge money while your cash was short (profit)", v: -sum("bridgeInt") },
    { key: "oldLoans", label: "Old loans: profit and fees, compared with not building", v: end.oldSavedCum + sum("renterSettle") + end.oldDebtGap - oldPaid - oldSold },
    { key: "rent", label: "Rent you stop paying", v: end.rentSavedCum },
    { key: "rentIn", label: "Rent you receive", v: end.rentInCum },
    { key: "propRent", label: "Rent your properties earn, compared with not building", v: sum("propRentIn") - sum("propRentBase") },
    { key: "upkeep", label: "Upkeep of the new home", v: -end.upkeepCum },
    { key: "sold", label: sales.length > 1 || (sales.length === 1 && !sales[0].isHome) ? "Properties you sold (price after costs, less what they would be worth)" : "The home you sold (price after costs, less what it would be worth)", v: sales.filter((s) => s.side !== "both").reduce((a, s) => a + s.value - s.costs, 0) - end.ownGone },
    { key: "growth", label: "Growth on your cash, compared with not building", v: sum("ret") - sum("rRet") },
  ];
  return { parts, total: parts.reduce((a, x) => a + x.v, 0) };
}

/* ---------- the liability a plan carries (reLiability): every loan in one table, the peaks, debt by year, what is still owed ----------
   Presentation only: every figure is the engine's (facilities, loansEnd, months, years, peakDebt, peakInst, debtFreeT, profitPaid).
   rows = the new loans (label, what it is secured on, who borrows, amount, the rate as quoted / APR / effective yearly, the
   instalment, from–to), then the old loans with their state (kept, bought out, paid off, repaid from a sale). */
const RE_LENS_MEASURES = [["peakDebt", "The most you owe at once", "the most you owe in any month, old loans included"], ["borrowed", "Borrowed in total", "the sum of every new loan"], ["peakInst", "Instalments at their highest", "your heaviest month, as % of income"], ["profit", "Profit paid to banks", "profit, fees and bridge money over the comparison"]];
const RE_SETTLE_VERDICT = { keep: "Keep", buyout: "Let the bank buy it out", settleCash: "Settle from cash", room: "Settle only to make room" };
function reLiability(r, p, prj) {
  const J = !!(p && p.joint && p.joint.on), build = prj ? prj.build : true, H = r.months.length - 1, extraMo = r.plan ? r.plan.extraMo : 0;
  const propName = (id) => { const P = p && (p.properties || []).find((x) => String(x.id) === String(id)); return P ? P.name : "a property you own"; };
  const borrower = (f) => f.owner === "B" ? "your spouse" : J && (f.key === "lm" || f.key === "co") && f.shareA != null && f.shareA < 1 - 1e-9 ? (f.shareA > 1e-9 ? `you + spouse (${Math.round(f.shareA * 100)}% / ${Math.round((1 - f.shareA) * 100)}%)` : "your spouse") : "you";
  const securedOn = (f) => f.key === "lm" ? (prj && prj.isLand ? "the land" : build ? "the new home" : "the home you buy") : /^eq/.test(f.key) ? (f.propName || "the property you own") : f.key === "co" ? (prj && prj.isBuilding ? "the finished building" : "the finished home") : "— (unsecured)";
  const rows = r.facilities.filter((f) => f.startedAt != null && f.amount > 0 && f.key !== "rf").map((f) => {
    const s = reLoanSchedule(f, extraMo, false), to = s.length ? s[s.length - 1].t : f.startedAt;
    const ended = f.prepaidAt != null ? { how: "paid off early from your cash", t: f.prepaidAt } : f.settledAt != null ? { how: f.refinancedAt != null ? "bought out by a new personal loan" : f.soldAt != null ? `repaid from the sale of ${f.propName || "the property"}` : "paid off", t: f.settledAt } : null;
    return { key: f.key, kind: "new", label: f.label, securedOn: securedOn(f), borrower: borrower(f), amount: f.amount, quoted: f.quoted, apr: f.rate, effective: reEffYear(f.rate), inst: f.pmt, from: f.startedAt, to, tenure: f.tenure, split: f.split || null, refi: f.refi ? f.refi.names : [], ended, fees: f.fees, takenEarly: f.takenEarly == null ? null : f.takenEarly };
  });
  const oldLoans = (p ? p.existingLoans.map((l) => ({ ...l, owner: "A" })).concat(J ? (p.joint.loans || []).map((l) => ({ ...l, owner: "B" })) : []) : []).filter((l) => l.balance > 0 && l.installment > 0);
  const old = oldLoans.map((l) => {
    const e = (r.loansEnd || []).find((x) => String(x.id) === String(l.id)) || {}, left = Math.max(1, Math.round(l.monthsLeft));
    const state = e.refinancedAt != null ? { kind: "boughtOut", how: "bought out by the bank", t: e.refinancedAt } : e.soldAt != null ? { kind: "sold", how: "repaid from a sale", t: e.soldAt } : e.settledAt != null ? { kind: "settled", how: "paid off from your cash", t: e.settledAt } : left <= H ? { kind: "kept", how: "kept — runs to its end", t: left } : { kind: "kept", how: "kept — still running at the end", t: null };
    return { key: `old:${l.id}`, kind: "old", label: l.name, type: l.type, securedOn: l.securedOn != null ? propName(l.securedOn) : l.type === "mortgage" ? "a property you own" : "— (unsecured)", borrower: l.owner === "B" ? "your spouse" : "you", amount: l.balance, quoted: l.flatRate != null ? l.flatRate : l.rate, flat: l.flatRate != null, apr: l.rate, effective: reEffYear(l.rate), inst: Math.max(l.installment, rePmt(l.balance, l.rate, left)), from: 0, to: state.t != null ? state.t : Math.min(H, left), state };
  });
  const debtByYear = (r.years || []).map((y) => ({ year: y.year, label: y.label, existing: y.debtExisting, lm: y.debtLm, eq: y.debtEq, pl: y.debtPl, co: y.debtCo, total: y.debt }));
  const owedAt = (years) => { const t = years == null ? H : Math.min(H, Math.max(0, Math.round(years * 12))); const m = r.months[t]; return { t, total: m.debt, existing: m.debtExisting, newDebt: m.debtNew, lm: m.debtLm, eq: m.debtEq, pl: m.debtPl, co: m.debtCo }; };
  const peakT = r.peakInstT == null ? 0 : r.peakInstT;
  return { rows, old, newDebtTotal: r.newDebtTotal, peakDebt: r.peakDebt, peakDebtT: r.peakDebtT, peakNewDebt: r.peakNewDebt, peakInst: r.peakInst, peakInstT: peakT, peakInstPct: r.peakInstPct, incomeAtPeak: r.months[peakT].inc, debtFreeT: r.debtFreeT, debtByYear, owedAt, profitPaid: r.profitPaid == null ? r.newDebtInterest : r.profitPaid, endDebt: r.endDebt };
}

/* ---------- the project in words (v2 kinds): what you are doing, what you are compared with, the verbs of the answer ----------
   One source for the page's wording: prj.kind (reProject) and whether you move in. letAll = a building let out entirely (you stay
   where you are); renting = you pay rent today AND move in (the comparison is then with renting on). */
function reKindWords(inp, prj) {
  const kind = prj.kind, K = RE_KINDS[kind] || RE_KINDS.landVilla, build = !!prj.build, isLand = !!prj.isLand, isBuilding = !!prj.isBuilding;
  const letAll = isBuilding && !prj.moveIn, renting = (+inp.rentNow || 0) > 0 && !!prj.moveIn;
  const gerund = { landVilla: "buying land and building a villa", readyVilla: "buying a ready villa", land: "buying land only", landBuilding: "buying land and building a residential building", readyBuilding: "buying a ready residential building" }[kind];
  const short = { landVilla: "Build a villa", readyVilla: "Buy a ready villa", land: "Buy land", landBuilding: "Build a residential building", readyBuilding: "Buy a residential building" }[kind];
  return {
    kind, label: K.label, gerund, short, build, isLand, isBuilding, letAll, renting,
    // what you are compared with ("vs …"), and the same as a condition ("if you …")
    baseline: renting ? "renting" : isLand ? "not buying the land" : letAll ? "keeping your cash invested" : build ? "not building" : "not buying",
    baseIf: renting ? "keep renting" : isLand ? "don't buy the land" : letAll ? "keep your cash invested" : build ? "don't build" : "don't buy",
    // the answer's verbs
    doIt: isLand ? "Buy the land" : letAll ? (build ? "Build the building" : "Buy the building") : renting ? "Own it" : build ? "Build it" : "Buy it",
    dont: isLand ? "Don't buy the land" : letAll ? (build ? "Don't build the building" : "Don't buy the building") : renting ? "Keep renting" : build ? "Don't build" : "Don't buy",
    act: isLand ? "buying the land" : letAll ? (build ? "building it" : "buying it") : build ? "building" : "buying",   // inside a sentence
    // the moment the project is complete: you move in, the building is let, or the land is paid for
    done: isLand ? "the land is paid for" : letAll ? "completion" : "move-in",
    doneLabel: isLand ? "Land paid for" : letAll ? "Let from" : "Move in",
    doneShort: isLand ? "purchase" : letAll ? "completion" : "move-in",
    thing: isLand ? "the land" : isBuilding ? "the building" : "the home",
  };
}

/* ---------- a plan's instalments at their highest: the months at the peak (within 0.5% of it), around peakInstT ---------- */
function rePeakSpan(r) {
  const ms = r.months, inst = (m) => m.existInst + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - (m.extraPay || 0);
  const t0 = r.peakInstT == null ? 0 : r.peakInstT, peak = inst(ms[t0]);
  let a = t0, b = t0;
  while (a > 1 && inst(ms[a - 1]) >= peak * 0.995 - 1) a--;
  while (b < ms.length - 1 && inst(ms[b + 1]) >= peak * 0.995 - 1) b++;
  return { from: a, to: b, peak };
}

/* ---------- debt cover of a building that is let: the rent received each year ÷ the new loans' instalments that year (from months) ----------
   rows from the first year with instalments after completion; lowest = the year with the least cover; coversFrom = the first
   year from which the rent covers the instalments every year to the end (null = never) */
function reDebtCover(r) {
  const ms = r.months, H = ms.length - 1, rows = [];
  for (let y = 1; y * 12 - 11 <= H; y++) {
    const part = ms.filter((m) => m.t >= y * 12 - 11 && m.t <= Math.min(H, y * 12) && m.t > r.occupy);
    if (!part.length) continue;
    const rent = part.reduce((a, m) => a + (m.rentIn || 0), 0), inst = part.reduce((a, m) => a + m.lmPay + m.eqPay + m.plPay + m.coPay + m.rfPay - (m.extraPay || 0), 0);
    rows.push({ year: y, t: Math.min(H, y * 12), rent, inst, cover: inst > 0.5 ? rent / inst : null });
  }
  const withInst = rows.filter((x) => x.cover != null);
  const lowest = withInst.length ? withInst.reduce((a, x) => (x.cover < a.cover ? x : a)) : null;
  let coversFrom = null;
  for (let k = withInst.length - 1; k >= 0 && withInst[k].cover >= 1; k--) coversFrom = withInst[k].t;
  return { rows, lowest, coversFrom };
}
