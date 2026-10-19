/* Real-estate tool — page helpers shared by realestate.html and the preview page (plain JS, no JSX).
   Load after engine.js and re-engine.js (uses C, fS, fSAR, reTermsFromPlans). Presentation only: nothing here changes a number. */

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
    executable: "Cash never goes below zero in any month: income − living − rent − all instalments − project spend + loan proceeds, with cash earning the return on cash while it is positive.",
    recovery: `Months after move-in until your cash balance is back at or above your safety cushion. Your rule: within ${inp.recoveryMonths} months.`,
    cashLow: "Lowest month-end cash balance (salary included) over the comparison, and when it happens.",
    cashMoveIn: "Your bank balance in the month you move in: your own cash and the loans after all costs, PLUS what your salary saved after living costs and instalments, PLUS the return earned on the balance until then. 'Cash on hand at completion' in the step-by-step leaves the salary and the return out, so it is lower.",
    cashAfter: `Cash balance ${inp.recoveryMonths} months after move-in (your recovery window).`,
    peakInst: `Highest total monthly instalments (existing loans + all new loans) in any month, as % of that month's income, against the bank's ${dbr}% cap. A voluntary extra payment is not an instalment and is left out.`,
    newDebt: "Sum of all new loans actually drawn (land mortgage, owned-property mortgage, personal loans, cash-out), after the bank's LTV, per-loan and total debt-burden limits.",
    capacity: `What the bank could lend that month. Your instalment capacity is ONE bucket: ${dbr}% of income. What is left of it (${dbr}% × income − every instalment running that month) is the room; inside the bucket all mortgages together may use up to ${mc}% of income and one personal loan up to ${pc}% (a second personal loan may take what is left; never more than two personal loans at once, old ones included). The room is converted to a principal at the loan's rate and tenure (Bank terms), then capped by LTV × the property's value and the bank's ceiling per loan.`,
    bucket: `Instalments running each month as % of that month's income, stacked: existing loans, then each new loan. The dashed lines are the bank's limits: ${dbr}% for everything together and ${mc}% for all mortgages together. Free space under the top line is borrowing room you are not using.`,
    optimizer: `For the chosen start the tool tries every mix of: land mortgage yes/no, personal loan(s) at build start yes/no, owned-property mortgage (none / at build start / now / at land purchase), cash-out at completion yes/no, personal loan(s) at completion yes/no, and how far to pay off old personal loans for a mortgage (just enough / for the largest mortgage / never) — up to 192 mixes, every loan at the bank's maximum and priced with your Bank terms; old personal loans are bought out automatically when a personal loan is taken, by the 'Auto' rule. It keeps the mix that never runs out of cash and gets cash back to your cushion within ${inp.recoveryMonths} months, then the highest 'everything grows' result, then the lowest peak instalment.`,
    newDebtCost: "All profit paid on the new loans over the comparison plus bank fees and early-settlement fees (including mortgages you pay off early).",
    totalInterest: "Profit on new loans + profit still paid on the existing loans + settlement fees.",
    econ: `How strategies are ranked. Everything grows at ${ret}% a year from the month it moves, on both sides: your household cash (salary in; living costs, rent, every instalment and payoff out; growth while it is positive) + the home's value − all debt, against the same household not building: its cash − the old-loan debt it still owes. The difference is shown in Oct-of-the-horizon riyals and in today's money (discounted at ${ret}%).`,
    econIrr: "The yearly return the money you put into building earns, compared with not building (the extra money building takes and gives back each month, and the home minus debt at the end). Compare it with your return on cash.",
    netWorth: `Your rule-7 measure. Your own cash and the loans, less land, construction, early payoffs and fees, grow at ${ret}% a year from today while positive (instalments never touch it — your salary pays them). Then: − instalments on the new loans (a plain cost) + old-loan instalments you no longer pay + rent received if you let the home out + rent you no longer pay − upkeep + the home's value (no selling costs) − new-loan debt still owed (+ any old-loan balance you no longer owe while the not-building side still does). Salary and living costs are left out.`,
    baseline: `If you don't build: your own cash, invested at ${ret}% a year from today to the end of the comparison. Your old loans run the same whether you build or not; a settlement date you set happens on this side too, so it is not counted as an effect of building. Only what a strategy changes about your old loans (paying one off early, a refinance) is counted, on the strategy's side.`,
    rentOut: "If you let the new home out instead of living in it: annual rent = the % of the all-in project cost, or the fixed annual rent if that is above zero. It starts the month after completion, grows with the rent-growth setting, is added to your monthly cash, and is counted in your rule-7 net worth at face value. No vacancy or management fee.",
    advantage: `Your rule-7 net worth with this strategy − your own cash grown at ${ret}% a year. Negative means building leaves you poorer than keeping the cash invested.`,
    breakEven: "Time from today until the strategy first catches up with not building (checked only from move-in on).",
    debtFree: "First month with no debt outstanding (existing loans and all new loans).",
    settled: "Principal of old loans you pay off early from your own cash (planned settlements, and payoffs that free room for a mortgage in the bank's debt-burden test) plus the early-settlement fees. A payoff for a mortgage is made just before the mortgage is granted. Loans the bank buys out in a refinance are not included here — they are cleared from the new loan.",
    refi: `Personal loans and refinancing are one step. When a personal loan is taken, the bank lends its MAXIMUM as one or two loans (each instalment up to ${pc}% of income, together within what is left of your ${dbr}% bucket; never more than two personal loans running at once). The bank can also buy out old personal loans (at least ${age} months old, allowed in step 1): it clears them from the new loan — no cash from you — and pays you the rest. Which ones: 'Auto' (recommended) picks what leaves you richest on the 'everything grows' measure and switches to the choice that puts the most cash in your hands if the plan would otherwise run out of cash or miss your recovery window; 'Best value' and 'Most cash' always use that rule; 'Choose loans' buys out exactly the loans you tick. Early-settlement fees (${fee} months' profit) apply. Mortgages are never refinanced.`,
    settlePolicy: `Your rule: a personal loan is paid off early with your own cash only to free room a MORTGAGE needs in the bank's ${dbr}% test — never to make room for another personal loan. 'Just enough' pays off personal loans one at a time (the one freeing the most instalment per riyal first) until the mortgage covers the funding gap. 'For the largest mortgage' keeps paying them off until the mortgage reaches the most the property allows (its LTV). 'Never' keeps them. The payoff comes from your own cash, before the bank grants the mortgage (a land-purchase mortgage is paid straight to the seller and never reaches you); a loan your cash can't cover is skipped and the next one is tried. Loans with 'Settle from cash?' unticked are never touched; a 'Settle in month' date you set always happens. The optimizer tries all three.`,
    prepay: `Your option: pay the mortgages off early from your own cash this many months after move-in (after that month's instalments), most expensive first, as long as the cash above your safety cushion covers the payoff plus the early-settlement fee (${fee} months' profit). Leave it empty and mortgages run to their end.`,
    dbrRoom: `Bank total cap (${dbr}% of income) minus the instalments running today — the free part of your bucket. Inside it all mortgages together may use up to ${mc}% of income and one personal loan up to ${pc}%.`,
    savings: "Income − living expenses − rent − existing instalments, per month, today.",
    earliest: "Earliest construction start (every 3 months from today, plus your planned start) that never runs out of cash and gets cash back to your cushion within your recovery window; if no start passes both, the earliest that never runs out of cash is shown. The land purchase stays where you set it unless the start comes first, in which case it moves to the start.",
    cost: "Land (grown at the appreciation rate to the purchase month) + RETT + the broker's fee on the land + construction (built-up m² × SAR/m², inflated to the start month) + soft costs + contingency + extras + any cost overrun + VAT.",
    value: "Finished home's market value at completion: land + (construction + soft + extras) × (1 + self-build uplift), grown at the appreciation rate. The uplift is on what you build, not on the land; VAT, RETT, fees, contingency and overruns add no value.",
    terms: "One set of terms per loan type, used by every strategy and by the optimizer. Rates are entered as your bank quotes them (flat \"hamish\" or APR — the switch on this card); the tool converts a flat rate to the APR it amortises with, and shows the effective yearly rate (monthly compounding) next to it.",
  };
}

/* ---------- "how did you get this number": project money only (presentation; adds up exactly to the engine) ----------
   Your own cash + every loan, minus what the project and the payoffs cost — no salary, living costs, instalments or
   investment return. `total` is the rule-6 cash on hand WITHOUT growth; `ret` is the growth on it up to `upto`. */
function fundingBridgeRows(r, upto, inp, prj) {
  const rows = [], add = (label, v, note) => { if (Math.abs(v) >= 0.5) rows.push({ label, v, note }); };
  const inRange = (t) => t !== null && t !== undefined && t <= upto;
  add("Your own cash", r.cashStart, "the cash you have, set in step 1");
  r.payoffs.filter((x) => inRange(x.t)).forEach((x) => add(`Old loan paid off early: ${x.name}`, -x.cost, `${fCal(x.t)} · incl. ${fSAR(x.fee)} early-settlement fee`));
  const build = inp.acquire === "build";
  const landPart = inRange(prj.landMonth) ? (build ? prj.land + prj.rett + (prj.landBroker || 0) : prj.total) : 0;
  const spend = r.months.filter((x) => x.t <= upto).reduce((a, x) => a + x.spend, 0);
  add(build ? `Land price + ${inp.rettPct}% transfer tax${prj.landBroker > 0 ? ` + ${inp.landBrokerPct}% broker` : ""}` : "Purchase price, tax, broker and finishing", -landPart, fCal(prj.landMonth));
  r.facilities.filter((f) => inRange(f.startedAt) && f.amount > 0 && f.key !== "rf").forEach((f) => { add(f.key === "lm" ? "  …of which the bank paid the seller (land mortgage)" : f.refi ? "New personal loan(s), bank's maximum" : `Loan paid to you: ${f.label.toLowerCase()}`, f.amount, f.key === "lm" ? "never passes through your hands" : fCal(f.startedAt)); if (f.refi) add(`  …of which the bank used to clear ${f.refi.names.join(" + ")} (refinance)`, -f.refi.payoff, "paid by the bank directly, incl. early-settlement fees"); });
  add("Construction and finishing", -(spend - landPart), `${fCal(prj.start + 1)} → ${fCal(Math.min(upto, prj.start + prj.bm))}`);
  add("Bank fees on new loans", -r.facilities.filter((f) => inRange(f.startedAt) && f.key !== "rf").reduce((a, f) => a + f.fees, 0));
  (r.prepaid || []).filter((x) => inRange(x.t)).forEach((x) => add(`Mortgage paid off early: ${x.name.toLowerCase()}`, -x.cost, `${fCal(x.t)} · incl. ${fSAR(x.fee)} early-settlement fee`));
  const total = rows.reduce((a, x) => a + x.v, 0);
  const ret = r.months.filter((x) => x.t <= upto).reduce((a, x) => a + (x.cRet || 0), 0);
  // does the salary really carry living costs + every instalment each month?
  let worst = Infinity, worstT = 0, short = 0;
  r.months.filter((x) => x.t >= 1 && x.t <= upto).forEach((x) => { const s = x.inc - x.liv - x.rentPaid - x.existInst - x.lmPay - x.eqPay - x.plPay - x.coPay - x.rfPay - x.ownerCost; if (s < worst) { worst = s; worstT = x.t; } if (s < 0) short -= s; });
  return { rows, total, ret, worst: worst === Infinity ? 0 : worst, worstT, short };
}

/* ---------- plain-English description of a strategy, generated from its settings ---------- */
function rateTxt(inp, rate, yrs) { return `${rate}%${inp.rateQuote === "flat" ? " flat" : ""} over ${yrs} yrs`; }
const whenTxt = (w, mo, prj) => w === "start" ? "at the start" : w === "land" ? `when the land is bought (${fCal(prj.landMonth)})` : w === "build" ? `when construction starts (${fCal(prj.start)})` : w === "completion" ? `at completion (${fCal(prj.occupy)})` : `in ${fCal(mo)}`;
const refiTxt = (o) => (o.refiMode === "cash" ? "buying out the old personal loans that put the most cash in your hands" : o.refiMode === "value" ? "buying out old personal loans only where that leaves you richer" : o.refiMode === "pick" ? "buying out only the old loans you chose" : "buying out old personal loans where that leaves you richer (or puts more cash in hand if needed)");
function describePlan(o, inp, prj, build) {
  const s = [];
  if (o.lmUse) s.push(`Mortgage the ${build ? "land" : "purchase"} when it is bought (${fCal(prj.landMonth)}) for the maximum the bank allows`);
  else s.push(`${build ? "Buy the land" : "Buy"} in cash — no mortgage on it`);
  if (o.eqWhen !== "none") s.push(`mortgage the property you already own ${whenTxt(o.eqWhen, o.eqMonth, prj)} for the maximum the bank allows`);
  if (o.plWhen !== "none") s.push(`take personal loan(s) ${whenTxt(o.plWhen, o.plMonth, prj)} for the maximum the bank allows, ${refiTxt(o)}`);
  if (o.pl2Use) s.push(`take personal loan(s) at completion (${fCal(prj.occupy)}) for the maximum the bank allows, ${refiTxt(o)}`);
  if (o.coUse) s.push(`take a cash-out mortgage on the finished home at completion (${fCal(prj.occupy)}) for the maximum the bank allows`);
  if (build) s.push(`fund the construction (${fCal(prj.start + 1)} → ${fCal(prj.start + prj.bm)}) from cash and those proceeds`);
  const planned = (inp.existingLoans || []).filter((l) => l.balance > 0 && l.settleAt != null && l.settleAt > 0).map((l) => `settle ${l.name} in ${fCal(l.settleAt)} from your cash`);
  if (planned.length) s.push(planned.join(", "));
  s.push(o.settlePolicy === "none" ? "keep all other old loans running" : o.settlePolicy === "forMax" ? "pay off as many old personal loans as it takes for the mortgage to reach the most the property allows (from your own cash, before the mortgage is granted)" : "pay off other old personal loans only if a mortgage would not fit in the bank's test otherwise (from your own cash, before the mortgage is granted)");
  if (o.prepayAfter != null && o.prepayAfter !== "") s.push(`pay the mortgages off early from your cash ${o.prepayAfter} months after move-in (${fCal(prj.occupy + Math.round(o.prepayAfter))}) if the cash above your cushion covers it`);
  if (o.extraMo > 0) s.push(`pay ${fSAR(o.extraMo)} a month extra on the land mortgage`);
  return s.join("; ") + ".";
}
function describeOption(o, inp, prj) {
  const cash = prj.total * o.cashPct / 100, pl = Math.max(0, Math.min(o.plAmount, prj.total - cash)), mg = Math.max(0, prj.total - cash - pl);
  const s = [`${o.cashPct}% of the cost (${fS(cash)}) from your own cash`];
  if (pl > 0) s.push(`a ${fS(pl)} personal loan at ${rateTxt(inp, o.plRate, o.plTenure)}`);
  if (mg > 0) s.push(`a ${fS(mg)} mortgage at ${rateTxt(inp, o.rate, o.tenure)} with ${o.graceMonths} months' grace (${o.graceMode === "capitalize" ? "profit added to the loan" : "profit paid monthly"})${o.subsidyCap > 0 && o.subsidyPct > 0 ? `, REDF support on the first ${fS(o.subsidyCap)}` : ""}`);
  return s.join(", then ") + ".";
}
const newDebtOf = (r) => r.newDebtTotal || 0;
const facTxt = (f) => f.startedAt !== null && f.amount > 0 ? `${fS(f.amount)} ${fMon(f.startedAt)} · ${fSAR(f.pmt)}/mo (bank max ${fS(f.capacity ? f.capacity.cap : 0)})${f.split ? ` as two loans (${fS(f.split[0])} + ${fS(f.split[1])})` : ""}${f.refi ? ` · buys out ${f.refi.names.join(" + ")} · ${fS(f.refi.net)} to you` : ""}${f.prepaidAt != null ? ` · paid off early ${fCal(f.prepaidAt)}` : ""}` : f.capacity ? (f.key === "rf" ? `not taken — ${f.capacity.limitedBy}` : `refused — ${f.capacity.limitedBy}`) : "not used";

/* ---------- one-time notice when an older scenario's per-strategy bank terms were merged into one set ---------- */
const RE_LOAN_NAME = { lm: "land mortgage", eq: "owned-property mortgage", pl: "personal loan", co: "cash-out mortgage" };
function reTermsNotice(raw) {
  if (!raw || !raw.plans || raw.termsV != null) return null;
  const { conflicts } = reTermsFromPlans(raw.plans);
  if (!conflicts.length) return null;
  const rateKey = { lm: "lmRate", eq: "eqRate", pl: "plRate", co: "coRate" };
  return "Bank terms are now one set for all strategies. " + conflicts.map((c) => {
    const k = rateKey[c.loan], others = c.others.map((o) => `Strategy ${o.plan + 1}: ${o[k]}%`).join(", ");
    return `Your strategies had different ${RE_LOAN_NAME[c.loan]} terms (${others}); the tool now uses Strategy ${c.from + 1}'s ${c.kept[k]}% for all`;
  }).join(". ") + ". Change them in Financing → Bank terms if your bank's current quote is different.";
}

/* ---------- existing-loan import: JSON array (any sensible keys) or CSV "name, balance, instalment, months, rate" ---------- */
function parseLoans(text) {
  const pick = (o, keys, d) => { for (const k of keys) { const hit = Object.keys(o).find((x) => x.toLowerCase().replace(/[^a-z]/g, "") === k); if (hit != null && o[hit] !== "" && o[hit] != null) return o[hit]; } return d; };
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const yes = (v) => !(v === false || /^(false|no|n|0)$/i.test(String(v).trim()));   // "false" / "no" / 0 in a JSON file mean no
  let arr = null;
  try { const j = JSON.parse(text); arr = Array.isArray(j) ? j : (j.loans || j.items || j.data || null); } catch (e) {}
  if (arr) return arr.map((o, i) => ({ id: Date.now() + i, name: String(pick(o, ["name", "lender", "bank", "title", "loan"], `Loan ${i + 1}`)), balance: num(pick(o, ["balance", "remaining", "remainingbalance", "outstanding", "principal", "amount"], 0)), installment: num(pick(o, ["installment", "instalment", "monthly", "monthlypayment", "payment", "emi"], 0)), monthsLeft: Math.round(num(pick(o, ["monthsleft", "months", "remainingmonths", "term", "tenure"], 0))), rate: num(pick(o, ["rate", "apr", "interest", "profitrate"], 6)), settleAt: (() => { const v = pick(o, ["settleat", "settlemonth", "settlein"], null); return v == null ? null : Math.round(num(v)); })(), canSettle: yes(pick(o, ["cansettle", "maysettle"], true)), canRefi: yes(pick(o, ["canrefi", "mayrefinance", "canrefinance"], true)), ageMonths: (() => { const v = pick(o, ["agemonths", "age", "monthssincestart", "elapsed", "monthspaid"], null); return v == null ? null : Math.round(num(v)); })() }));
  // tabs or semicolons win, so "95,000" survives when columns are tab- or semicolon-separated
  return text.split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^name/i.test(l)).map((l, i) => { const c = l.split(/[;\t]/.test(l) ? /[;\t]/ : /,/).map((s) => s.trim()); return { id: Date.now() + i, name: c[0] || `Loan ${i + 1}`, balance: num(c[1]), installment: num(c[2]), monthsLeft: Math.round(num(c[3])), rate: c[4] != null && c[4] !== "" ? num(c[4]) : 6 }; }).filter((l) => l.balance > 0 || l.installment > 0);
}
