/* ============================================================
   Dental Clinic — shared financial engine
   Single source of truth for both original.html and
   redesign.html. Pure JS (no React/JSX): palette, formatting,
   ramp schedules, base inputs, CapEx helpers, compute(), IRR.
   Loaded as a classic <script> before the Babel app script,
   so these top-level bindings are visible to the app.
   ============================================================ */

/* ---------- palette & type ---------- */
const C = {
  ink: "#0E1A2B", ink2: "#15263B", bone: "#F1EDE4", paper: "#FBFAF6",
  brass: "#B0823A", brassLt: "#D9B36A", line: "#DBD4C5", lineDk: "#27384E",
  pos: "#2E7D63", neg: "#B4452F", amber: "#B0823A",
  text: "#1B2733", sub: "#64707C", inv: "#ECE4D3", invSub: "#9DAEC0",
};
const MONO = "'SF Mono','SFMono-Regular',ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace";
const SANS = "Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

/* ---------- format ---------- */
const f0 = (n) => { const r = Math.round(n); const s = Math.abs(r).toLocaleString("en-US"); return r < 0 ? `(${s})` : s; };
const pctf = (n, d = 0) => `${n.toFixed(d)}%`;

/* ---------- ramps & schedules ---------- */
const RAMPS = {
  cautious: [0.30, 0.50, 0.70, 0.85, 1.00],
  standard: [0.40, 0.62, 0.80, 0.92, 1.00],
  fast:     [0.50, 0.72, 0.88, 0.96, 1.00],
};
const STAFF_RAMP = [0.65, 0.86, 1.00, 1.03, 1.07];
// marketing is front-loaded: new clinics spend most at opening (launch campaign, brand build), tapering to the mature run-rate
const MKT_RAMP   = [1.60, 1.30, 1.10, 1.00, 1.00];
const OTHER_RAMP = [0.60, 0.70, 0.825, 0.913, 1.00];
const LEASE_ESC  = [1.0, 1.018, 1.035, 1.059, 1.082];

const BASE_INPUTS = {
  revPerChair: 160, chairs: 10, rampStart: 50, rampGrowth: 50, revenueGrowth: 0,
  dentistCount: 10, dentistBase: 10000, profitShare: 35,
  // roster: a "day" is one full clinic shift (e.g. 2–10pm). Chairs offer clinicDays slots/week;
  // each salaried dentist covers dentistDays, each production-paid senior covers seniorDays.
  clinicDays: 6, dentistDays: 6,
  // senior tier: no salary — paid seniorProdPct % on the selected basis, optionally floored by a
  // monthly minimum guarantee per senior (SAR '000). 0 seniors = legacy model.
  // seniorRevPerChair: each senior's full monthly book (SAR'000) — earned regardless of days
  // worked (they bring their own caseload); independent of revPerChair (salaried production).
  // seniorPayBasis: "gross" = % of own collected production · "netmat" = % net of materials & lab
  //                 · "profit" = % of session profit after materials + allocated operating costs.
  seniorCount: 0, seniorDays: 3, seniorProdPct: 40, seniorMinMo: 0,
  seniorRevPerChair: 240, seniorPayBasis: "gross",
  nursesPerChair: 1.5, chairsideSalary: 6000,
  generalStaffCount: 4, generalStaffSalary: 5500, adminManagerSalary: 15000,
  medicalSupportCount: 2, medicalSupportSalary: 5000, janitorCount: 3, janitorSalary: 900, driverCount: 1, driverSalary: 1500,
  gosiPct: 11,
  materialsPct: 13, materialsY1Premium: 0,
  clinicRent: 1000, staffHousing: 200, marketing: 250, otherOpex: 500,
  insuranceCCHI: 200, malpracticePerDentist: 5000, utilitiesWaste: 150,
  levyPerMonth: 800, iqamaPerYear: 750,
  exitMultiple: 6, maintenanceCapexPct: 4, zakatPct: 2.5, wacc: 12, minCashMonths: 3,
  insuredPct: 30, rejectionPct: 0, insurerDelayMo: 4,
  rentTerms: "annual", // "annual" | "grace" | "semiannual"
  fitoutMonths: 6,
  // clinical-equipment asset finance (loan / hire-purchase); financePct 0 = all-equity (default, no change)
  financePct: 0, financeRate: 8, financeTermYears: 4,
  // CapEx breakdown (SAR'000)
  capexFitout: 1000, capexChairs: 800, capexImaging: 700, capexIT: 200,
  capexContingency: 700, capexFurniture: 300,
  capexRecruitment: 400, capexLicensing: 50, capexCivilDefence: 50,
  capexConsultants: 150, capexCSSD: 300, capexInventory: 250,
};
const CAPEX_KEYS = ["capexFitout","capexChairs","capexImaging","capexIT","capexContingency","capexFurniture","capexLicensing","capexCivilDefence","capexConsultants","capexCSSD","capexInventory"];
// expatriate headcount is derived: chairside staff (rounded up) + medical support + janitors + drivers — all typically expat roles in KSA
const expatCount = (inp) => Math.ceil(inp.chairs * inp.nursesPerChair) + (inp.medicalSupportCount || 0) + (inp.janitorCount || 0) + (inp.driverCount || 0);
// dentist-day roster: chairs are no longer 1:1 with dentists — several dentists can share a chair
// on different weekdays. Coverage caps achievable utilization; senior production pay is attributed
// by each tier's share of supplied dentist-days.
const dentistDaysSupplied = (inp) => inp.dentistCount * (inp.dentistDays ?? 6) + (inp.seniorCount || 0) * (inp.seniorDays || 0);
const chairDaysOpen = (inp) => inp.chairs * (inp.clinicDays ?? 6);
const rosterCoverage = (inp) => chairDaysOpen(inp) > 0 ? dentistDaysSupplied(inp) / chairDaysOpen(inp) : 0;
const seniorDayFrac = (inp) => { const t = dentistDaysSupplied(inp); return t > 0 ? ((inp.seniorCount || 0) * (inp.seniorDays || 0)) / t : 0; };
const totalDentists = (inp) => inp.dentistCount + (inp.seniorCount || 0);
const SENIOR_BASIS_LABEL = {
  gross: "of their own collected production",
  netmat: "of their production net of materials & lab",
  profit: "of the profit attributable to their sessions",
};
// annual cost (SAR'000) of the dedicated support roles, added to the fixed staff base
const supportStaffAnnual = (inp) => ((inp.medicalSupportCount * inp.medicalSupportSalary + inp.janitorCount * inp.janitorSalary + inp.driverCount * inp.driverSalary) * 12) / 1000;
// pre-opening expenses are derived from the same inputs the cash engine charges before opening day:
// first annual rent cheque + 2 months of Y1 staff onboarding (incl. GOSI & expat fees) + annual insurance premiums + foreign-staff recruitment
const preOpeningCost = (inp) => {
  const chairsideAnnual = (inp.chairs * inp.nursesPerChair * inp.chairsideSalary * 12) / 1000;
  const dentistBaseAnnual = (inp.dentistCount * inp.dentistBase * 12) / 1000;
  const generalStaffAnnual = ((inp.generalStaffCount * inp.generalStaffSalary + inp.adminManagerSalary) * 12) / 1000;
  const fixedBase = (chairsideAnnual + dentistBaseAnnual + generalStaffAnnual + supportStaffAnnual(inp)) * (1 + inp.gosiPct / 100);
  const perExpat = (inp.levyPerMonth * 12 + inp.iqamaPerYear) / 1000;
  const y1StaffAnnual = fixedBase * STAFF_RAMP[0] + Math.round(expatCount(inp) * STAFF_RAMP[0]) * perExpat;
  const prepaidIns = inp.insuranceCCHI * STAFF_RAMP[0] + (totalDentists(inp) * inp.malpracticePerDentist) / 1000;
  return (inp.clinicRent + inp.staffHousing) * LEASE_ESC[0] * rentUpfrontFactor(inp) + 2 * (y1StaffAnnual / 12) + prepaidIns + (inp.capexRecruitment || 0);
};
// share of the first lease year paid before opening, by payment terms and fit-out length
const rentUpfrontFactor = (inp) => inp.rentTerms === "grace" ? 0 : inp.rentTerms === "semiannual" ? Math.ceil(Math.round(inp.fitoutMonths) / 6) * 0.5 : 1;
// input VAT (15%) on vatable CapEx — paid with invoices during fit-out, recovered against output VAT over M1–M6
const VAT_RATE = 0.15;
const VAT_CAPEX_KEYS = ["capexFitout","capexChairs","capexImaging","capexIT","capexFurniture","capexCSSD","capexInventory","capexConsultants","capexRecruitment","capexCivilDefence"];
const vatOnCapex = (inp) => VAT_RATE * VAT_CAPEX_KEYS.reduce((s, k) => s + (inp[k] || 0), 0);
const totalCapex = (inp) => CAPEX_KEYS.reduce((s, k) => s + (inp[k] || 0), 0) + preOpeningCost(inp);
// hard (maintainable/depreciable) assets only — excludes working capital, contingency, soft costs, opening inventory
const HARD_CAPEX_KEYS = ["capexFitout","capexChairs","capexImaging","capexIT","capexFurniture","capexCSSD","capexCivilDefence"];
const hardCapex = (inp) => HARD_CAPEX_KEYS.reduce((s, k) => s + (inp[k] || 0), 0);
// straight-line useful lives (years): fit-out & fire systems 10, clinical equipment & furniture 7, IT 4
const DEP_LIVES = { capexFitout: 10, capexCivilDefence: 10, capexChairs: 7, capexImaging: 7, capexCSSD: 7, capexFurniture: 7, capexIT: 4 };
const annualDepreciation = (inp) => Object.entries(DEP_LIVES).reduce((s, [k, life]) => s + (inp[k] || 0) / life, 0);
// asset finance: the clinical/medical equipment that can be financed via a loan / hire-purchase
const FINANCE_KEYS = ["capexChairs","capexImaging","capexCSSD"];
const financeableBase = (inp) => FINANCE_KEYS.reduce((s, k) => s + (inp[k] || 0), 0);
const financedPrincipal = (inp) => financeableBase(inp) * (Math.max(0, Math.min(100, inp.financePct || 0)) / 100);
// level-payment amortization of the financed principal; returns the monthly payment, per-year interest/principal (5y) and any balance left at exit
function loanSchedule(inp) {
  const P = financedPrincipal(inp);
  const r = (inp.financeRate || 0) / 100 / 12, n = Math.round(Math.max(0, inp.financeTermYears || 0) * 12);
  const empty = { pmt: 0, n: 0, perYear: [0, 1, 2, 3, 4].map(() => ({ interest: 0, principal: 0 })), residual: 0, totalInterest: 0 };
  if (P <= 0 || n <= 0) return empty;
  const pmt = r > 0 ? P * r / (1 - Math.pow(1 + r, -n)) : P / n;
  let bal = P, totalInterest = 0;
  const perYear = [];
  for (let y = 0; y < 5; y++) {
    let yi = 0, yp = 0;
    for (let mo = 0; mo < 12; mo++) {
      if (y * 12 + mo >= n) break;
      const interest = bal * r, principal = Math.min(pmt - interest, bal);
      bal -= principal; yi += interest; yp += principal; totalInterest += interest;
    }
    perYear.push({ interest: yi, principal: yp });
  }
  return { pmt, n, perYear, residual: Math.max(0, bal), totalInterest };
}

/* ---------- engine ---------- */
function compute(inp) {
  inp = { ...BASE_INPUTS, ...inp }; // saved scenarios may predate newer inputs
  // Revenue is DENTIST-driven. Salaried tier: revPerChair is the monthly production of a
  // full-time salaried dentist (working every clinic day); part-timers scale by days worked.
  // Senior tier: seniorRevPerChair is each senior's FULL monthly book, earned regardless of
  // how many days they attend — they bring their own caseload; their stated days are what the
  // book physically needs in chair-time.
  // Chair-capacity cap with SENIOR PRIORITY: seniors are rostered first (they bring their own
  // patients and cost nothing when idle), salaried dentists fill the remaining chair-days and
  // their production scales to the days they actually get. Each tier's shortfall is reported
  // (senior books that don't fit; salaried days displaced). Revenue per chair is a DERIVED
  // output (prodCapMo / chairs), not an input.
  const cov = rosterCoverage(inp), capU = Math.min(1, cov);
  const supplied = dentistDaysSupplied(inp);
  const senRate = inp.seniorRevPerChair ?? (inp.seniorRevMult != null ? inp.revPerChair * inp.seniorRevMult : inp.revPerChair); // legacy scenarios saved a multiplier
  const clinicDaysWk = inp.clinicDays ?? 6;
  const chairDaysWk = chairDaysOpen(inp);
  const senDaysWanted = (inp.seniorCount || 0) * (inp.seniorDays || 0);
  const salDaysWanted = inp.dentistCount * (inp.dentistDays ?? 6);
  const senGranted = Math.min(senDaysWanted, chairDaysWk);
  const salGranted = Math.min(salDaysWanted, Math.max(0, chairDaysWk - senGranted));
  const seniorRealization = senDaysWanted > 0 ? senGranted / senDaysWanted : 1;   // share of the senior books the chairs can host
  const salariedRealization = salDaysWanted > 0 ? salGranted / salDaysWanted : 1; // share of salaried days that get a chair
  const salariedDisplacedDays = salDaysWanted - salGranted;
  const salProdMo = clinicDaysWk > 0 ? inp.dentistCount * inp.revPerChair * ((inp.dentistDays ?? 6) / clinicDaysWk) * salariedRealization : 0;
  const senProdMo = (inp.seniorCount || 0) * senRate * seniorRealization; // full income regardless of days worked, if the chairs can host the book
  const prodPoolMo = salProdMo + senProdMo;
  const sFracW = prodPoolMo > 0 ? senProdMo / prodPoolMo : 0;
  const usedDays = senGranted + salGranted;
  const idleDentistDays = Math.max(0, supplied - usedDays);
  const usedFactor = supplied > 0 ? usedDays / supplied : 0;
  const sFracD = usedDays > 0 ? senGranted / usedDays : 0; // share of occupied chair-time, for cost allocation
  const prodCapMo = prodPoolMo; // SAR'000/month at 100% booking (already capacity-resolved)
  // demand ramp is expressed vs chair capacity; min(ramp, coverage) caps billing at what the
  // roster can produce. revScaler converts the chair-utilization path into billings so that
  // full staffed booking (util = coverage) yields exactly prodCapMo.
  const revScaler = capU > 0 ? prodCapMo / capU : 0;
  const rev = Array.from({length: 5}, (_, i) => Math.min(capU, (inp.rampStart / 100) * Math.pow(1 + inp.rampGrowth / 100, i)));
  // materials % steps down linearly from (mature + Y1 premium) in Y1 to mature in Y5
  const matSched = Array.from({length: 5}, (_, i) => inp.materialsPct + inp.materialsY1Premium * (1 - i / 4));
  const chairsideAnnual = (inp.chairs * inp.nursesPerChair * inp.chairsideSalary * 12) / 1000;
  const dentistBaseAnnual = (inp.dentistCount * inp.dentistBase * 12) / 1000;
  const generalStaffAnnual = ((inp.generalStaffCount * inp.generalStaffSalary + inp.adminManagerSalary) * 12) / 1000;
  const fixedBase = (chairsideAnnual + dentistBaseAnnual + generalStaffAnnual + supportStaffAnnual(inp)) * (1 + inp.gosiPct / 100);
  const perExpat = (inp.levyPerMonth * 12 + inp.iqamaPerYear) / 1000;
  const loan = loanSchedule(inp);            // clinical-equipment asset-finance schedule (all zeros when financePct = 0)
  const finPrincipal = financedPrincipal(inp);
  // operating costs allocatable to senior sessions under the "profit" pay basis — everything
  // except the salaried dentists' own compensation (materials are added separately on their revenue)
  const allocFixedBase = fixedBase - dentistBaseAnnual * (1 + inp.gosiPct / 100);

  const years = [];
  for (let i = 0; i < 5; i++) {
    const revenue = revScaler * Math.pow(1 + inp.revenueGrowth / 100, i) * 12 * rev[i];
    const denials = revenue * (inp.insuredPct / 100) * (inp.rejectionPct / 100);
    const materials = (revenue * matSched[i]) / 100;
    const gp = revenue - denials - materials;
    const fixedStaff = fixedBase * STAFF_RAMP[i];
    const lease = (inp.clinicRent + inp.staffHousing) * LEASE_ESC[i];
    const mkt = inp.marketing * MKT_RAMP[i];
    const other = inp.otherOpex * OTHER_RAMP[i];
    // CCHI scales with headcount, malpractice with dentist count, utilities/waste with activity
    const insUtil = inp.insuranceCCHI * STAFF_RAMP[i] + (totalDentists(inp) * inp.malpracticePerDentist) / 1000 + inp.utilitiesWaste * OTHER_RAMP[i];
    const expatsY = Math.round(expatCount(inp) * STAFF_RAMP[i]);
    const foreign = expatsY * perExpat;
    // senior tier: % on the selected basis, floored by the optional monthly guarantee.
    // seniorRev = collected production attributed to seniors (weighted by the case-mix multiplier);
    // seniorCost = the real cost of their sessions (their materials + operating costs per chair-day
    // occupied), tracked on every basis so the deal box can show the clinic's margin on them.
    const sharedOps = allocFixedBase * STAFF_RAMP[i] + lease + mkt + other + insUtil + foreign; // clinic operating costs excl. dentist salaries & senior pay
    const seniorRev = (revenue - denials) * sFracW;
    const seniorCost = materials * sFracW + sharedOps * sFracD; // their materials + share of operating costs by occupied chair-days
    const seniorBase = inp.seniorPayBasis === "profit" ? Math.max(0, seniorRev - seniorCost)
      : inp.seniorPayBasis === "netmat" ? Math.max(0, seniorRev - materials * sFracW)
      : seniorRev;
    const seniorPay = Math.max(seniorBase * (inp.seniorProdPct / 100), (inp.seniorCount || 0) * (inp.seniorMinMo || 0) * 12);
    // Salaried profit share is earned on the profit of the salaried dentists' OWN production:
    // their collected production, less their salary and their share of clinic costs (materials on
    // their production + operating costs by their occupied chair-days). The residual margin the
    // clinic keeps on senior books accrues to the owner (EBITDA), not this pool. With no seniors
    // this reduces exactly to 35% of whole-clinic operating profit (unchanged).
    const dentistSalaryY = dentistBaseAnnual * (1 + inp.gosiPct / 100) * STAFF_RAMP[i];
    const salariedProfit = (revenue - denials) * (1 - sFracW) - materials * (1 - sFracW) - dentistSalaryY - sharedOps * (1 - sFracD);
    const share = salariedProfit > 0 ? (salariedProfit * inp.profitShare) / 100 : 0;
    const preshare = gp - fixedStaff - lease - mkt - other - insUtil - foreign - seniorPay; // whole-clinic operating profit before the salaried share
    const ebitda = preshare - share;
    const dep = annualDepreciation(inp);
    const interest = loan.perYear[i].interest;      // clinical-equipment finance interest (below EBITDA)
    const principal = loan.perYear[i].principal;     // finance principal repayment (cash flow, not P&L)
    const nibz = ebitda - dep - interest;
    const zakat = Math.max(0, nibz) * (inp.zakatPct / 100);
    const ni = nibz - zakat;
    const maintCapex = hardCapex(inp) * (inp.maintenanceCapexPct / 100);
    const fcf = ni + dep - maintCapex - principal;   // levered (equity) FCF — interest is in ni, principal subtracted here
    // guard margins against a zero-revenue year (revPerChair / chairs / rampStart can all be 0) so the UI never shows NaN%/Infinity%
    const pct = (x) => revenue > 0 ? x / revenue * 100 : 0;
    years.push({ year: `Y${i + 1}`, revenue, denials, materials, gp, gpPct: pct(gp), fixedStaff, lease, mkt, other, insUtil, foreign, seniorRev, seniorCost, seniorPay, salariedProfit, dentistSalaryY, preshare, share, ebitda, ebitdaPct: pct(ebitda), dep, interest, principal, zakat, ni, niPct: pct(ni), fcf });
  }
  const y5 = years[4];
  const y1 = years[0];
  const cumNI = years.reduce((a, y) => a + y.ni, 0);
  // representative Year-1 monthly operating cost, used to size the minimum-cash policy
  const monthlyOpex = (y1.fixedStaff + y1.lease + y1.mkt + y1.other + y1.insUtil + y1.foreign + y1.materials + y1.seniorPay + y1.share) / 12;
  // operating break-even revenue per chair/month: the revPerChair at which mature (Y5) operating profit BEFORE the dentist
  // profit share = 0 — the clinic just covers its running costs (excl. share, capital, depreciation & finance). Above this a
  // profit pool exists and dentists earn their share; use it as the per-chair threshold each dentist must clear before sharing.
  // Senior production pay is variable with collections, so it lowers the margin rather than adding to fixed cost
  // (the optional minimum guarantee is ignored here — near break-even it is a second-order refinement).
  const collFrac = 1 - (inp.insuredPct / 100) * (inp.rejectionPct / 100); // collected share of billings
  const fcMature = y5.fixedStaff + y5.lease + y5.mkt + y5.other + y5.insUtil + y5.foreign;
  // senior pay drag on the contribution margin, by basis; under "profit" their pay vanishes at
  // break-even (their session profit is ~0 there), so the drag is 0 (guarantee ignored here)
  const seniorDrag = inp.seniorPayBasis === "profit" ? 0
    : inp.seniorPayBasis === "netmat" ? sFracW * (collFrac - matSched[4] / 100) * (inp.seniorProdPct / 100)
    : sFracW * collFrac * (inp.seniorProdPct / 100);
  const matMargin = collFrac - matSched[4] / 100 - seniorDrag; // revenue left after denials, materials & senior pay
  const opBreakEvenRev = (matMargin > 0 && inp.chairs > 0) ? (fcMature / matMargin) / (Math.pow(1 + inp.revenueGrowth / 100, 4) * 12 * inp.chairs) : null;

  // Pre-opening (fit-out, F months) + 24 operating months (Y1–Y2) cash engine.
  // Rent cheques follow the selected payment terms; the lease year runs from fit-out start (grace: from opening).
  // Staff onboard 2 months before opening; annual insurance premiums paid upfront at P1, renewed at M12.
  // Input VAT on CapEx is paid with invoices during fit-out and recovered against output VAT over M1–M6.
  // Utilization ramps linearly inside each year so the 12-month average matches the annual ramp.
  // Insured billings are collected with a payment delay, net of rejections; cash patients pay at visit.
  const F = Math.max(1, Math.round(inp.fitoutMonths));
  const vatCapex = vatOnCapex(inp);
  // monthly ramp derives from the coverage-capped annual utilizations so the 12-month averages still foot
  const r1 = rev[0] * 100;
  const uEnd = Math.min(capU * 100, r1 * 1.5);
  const uOpen = Math.max(0, 2 * r1 - uEnd);
  const u2End = Math.max(0, Math.min(capU * 100, 2 * rev[1] * 100 - uEnd));
  const sIns = inp.insuredPct / 100, rRej = inp.rejectionPct / 100, dLag = inp.insurerDelayMo;
  const prepaid = (yi) => inp.insuranceCCHI * STAFF_RAMP[yi] + (totalDentists(inp) * inp.malpracticePerDentist) / 1000;
  const mStaff = (y1.fixedStaff + y1.foreign) / 12;
  // gross billings per operating month (j = 0..23)
  const Bop = Array.from({ length: 24 }, (_, j) => {
    const util = j < 12 ? uOpen + (uEnd - uOpen) * j / 11 : uEnd + (u2End - uEnd) * (j - 12) / 11;
    const yi = j < 12 ? 0 : 1;
    return revScaler * Math.pow(1 + inp.revenueGrowth / 100, yi) * util / 100;
  });
  const Bat = (t) => { // billings interpolated at fractional month t (0 before operations)
    if (t <= -1) return 0;
    const f = Math.floor(t), fr = t - f;
    const b0 = f < 0 ? 0 : Bop[Math.min(f, 23)];
    const b1 = f + 1 < 0 ? 0 : Bop[Math.min(f + 1, 23)];
    return b0 * (1 - fr) + b1 * fr;
  };
  // rent cheques due during operations: lease year runs from fit-out start, except under the fit-out grace option it runs from opening
  const rentDue = (j) => {
    if (inp.rentTerms === "grace") return j === 0 ? years[0].lease : j === 12 ? years[1].lease : 0;
    if (inp.rentTerms === "semiannual") return (j + F) % 6 === 0 ? years[Math.min(2, Math.floor((j + F) / 12))].lease / 2 : 0;
    return j === 12 - F ? years[1].lease : j === 24 - F ? years[2].lease : 0; // annual, upfront from fit-out start
  };
  const win = { coll: [0, 0], share: [0, 0], senior: [0, 0], rent: [0, 0], mat: [0, 0], debt: [0, 0] }; // per-operating-year cash sums for the statement
  const opCf = Array.from({ length: 24 }, (_, j) => {
    const yi = j < 12 ? 0 : 1;
    const yr = years[yi];
    const B = Bop[j];
    const fixedAcc = (yr.fixedStaff + yr.lease + yr.mkt + yr.other + yr.insUtil + yr.foreign) / 12;
    // senior pay is settled monthly on that month's collected billings under the selected basis (or the guarantee)
    const mSeniorRev = B * (1 - sIns * rRej) * sFracW;
    const mSeniorBase = inp.seniorPayBasis === "profit"
      ? Math.max(0, mSeniorRev - (B * matSched[yi] / 100) * sFracW - (allocFixedBase * STAFF_RAMP[yi] / 12 + (yr.lease + yr.mkt + yr.other + yr.insUtil + yr.foreign) / 12) * sFracD)
      : inp.seniorPayBasis === "netmat" ? Math.max(0, mSeniorRev - (B * matSched[yi] / 100) * sFracW)
      : mSeniorRev;
    const mSenior = Math.max(mSeniorBase * (inp.seniorProdPct / 100), (inp.seniorCount || 0) * (inp.seniorMinMo || 0));
    const mPre = B * (1 - sIns * rRej) - (B * matSched[yi]) / 100 - fixedAcc - mSenior;
    // salaried share settles monthly on the salaried tier's own-production profit (mirrors the annual figure)
    const mDentSalary = dentistBaseAnnual * (1 + inp.gosiPct / 100) * STAFF_RAMP[yi] / 12;
    const mSharedOps = (allocFixedBase * STAFF_RAMP[yi] + yr.lease + yr.mkt + yr.other + yr.insUtil + yr.foreign) / 12;
    const mSalProfit = B * (1 - sIns * rRej) * (1 - sFracW) - (B * matSched[yi] / 100) * (1 - sFracW) - mDentSalary - mSharedOps * (1 - sFracD);
    const mShare = mSalProfit > 0 ? mSalProfit * inp.profitShare / 100 : 0;
    win.senior[yi] += mSenior;
    // share accrues on P&L profit; cash adds back accrued rent & insurance, shifts insured collections by the lag, pays cheques when due
    const collAdj = sIns * (1 - rRej) * (Bat(j - dLag) - B);
    const rDue = rentDue(j);
    win.coll[yi] += (1 - sIns) * B + sIns * (1 - rRej) * Bat(j - dLag); // cash actually received this month
    win.share[yi] += mShare;
    win.rent[yi] += rDue;
    win.mat[yi] += (B * matSched[yi]) / 100; // materials charged on the same monthly billings the cash engine uses, so the statement foots
    let cf = mPre - mShare + yr.lease / 12 + prepaid(yi) / 12 + collAdj;
    cf -= rDue;                          // rent cheques per payment terms
    if (j === 11) cf -= prepaid(1);      // insurance renewal (M12)
    if (j < 6) cf += vatCapex / 6;       // input VAT on CapEx recovered against output VAT
    if (loan.pmt > 0 && j < loan.n) { win.debt[yi] += loan.pmt; cf -= loan.pmt; } // clinical-equipment finance monthly debt service
    return cf;
  });
  const monthly = [], monthlyOp = [];
  const winMin = [0, 0, 0]; // lowest cumulative cash point within pre-opening, Y1, Y2
  let cumCash = 0, trough = 0, troughLabel = "", cumOp = 0;
  for (let mn = -F; mn < 24; mn++) {
    let mCf;
    if (mn < 0) {
      mCf = -vatCapex / F;                  // input VAT paid with fit-out & equipment invoices
      if (inp.rentTerms === "semiannual") { if ((mn + F) % 6 === 0) mCf -= years[0].lease / 2; } // half-year instalments from fit-out start
      else if (inp.rentTerms !== "grace") { if (mn === -F) mCf -= years[0].lease; }              // full first-year cheque at fit-out start
      if (mn >= -2) mCf -= mStaff;          // staff onboarding & training
      if (mn === -1) mCf -= prepaid(0);     // annual CCHI + malpractice premiums upfront
      if (mn === -F) mCf -= (inp.capexRecruitment || 0); // foreign-staff recruitment & mobilization (pre-opening)
    } else {
      mCf = opCf[mn];
    }
    const label = mn < 0 ? `P${-mn}` : `M${mn + 1}`;
    cumCash += mCf;
    const wIdx = mn < 0 ? 0 : mn < 12 ? 1 : 2;
    if (cumCash < winMin[wIdx]) winMin[wIdx] = cumCash;
    if (cumCash < trough) { trough = cumCash; troughLabel = label; }
    monthly.push({ month: label, "Net cash": Math.round(mCf), "Cumulative": Math.round(cumCash) });
    if (mn >= 0) { cumOp += mCf; monthlyOp.push({ month: label, "Net cash": Math.round(mCf), "Cumulative": Math.round(cumOp) }); }
  }
  const peakNeed = Math.max(0, -trough);
  // Funding requirement (sources & uses): launch liquidity = the deepest cumulative cash deficit
  // (pre-opening opex + VAT timing + the operating ramp); plus a deliberate minimum-cash reserve.
  const launchLiquidity = peakNeed;
  const minCashReserve = Math.max(0, inp.minCashMonths) * monthlyOpex;
  const fundingBudget = launchLiquidity + minCashReserve; // cash earmarked for the launch trough + policy cushion
  const fundingOk = fundingBudget >= peakNeed;            // true by construction — we size the raise to the need
  const investCapex = CAPEX_KEYS.reduce((s, k) => s + (inp[k] || 0), 0) - finPrincipal; // equity-funded CapEx (financed equipment is debt, not equity)
  const totalRaise = investCapex + launchLiquidity + minCashReserve;     // single headline capital to raise

  // Cash flow statement for launch + first two operating years (direct method, ties exactly to the funding-view curve)
  const cfPreOpen = preOpeningCost(inp);
  const utilCash = (yi) => inp.utilitiesWaste * OTHER_RAMP[yi]; // utilities are the monthly-paid slice of insUtil; premiums are paid annually upfront
  const net1 = opCf.slice(0, 12).reduce((a, v) => a + v, 0);
  const net2 = opCf.slice(12).reduce((a, v) => a + v, 0);
  const preStaff = 2 * (years[0].fixedStaff / 12);
  const preForeign = 2 * (years[0].foreign / 12);
  const preRent = years[0].lease * rentUpfrontFactor(inp);
  const cashflow = [
    ["Cash receipts", null, "section"],
    ["Patient & insurer collections", [null, win.coll[0], win.coll[1]], "row"],
    ["VAT recovered on CapEx (M1–M6)", [null, vatCapex, null], "row"],
    ["Cash payments", null, "section"],
    ["Rent cheques (per payment terms)", [-preRent, -win.rent[0], -win.rent[1]], "row"],
    ["Staff & payroll (incl. GOSI)", [-preStaff, -years[0].fixedStaff, -years[1].fixedStaff], "row"],
    ["Salaried dentist profit share", [null, -win.share[0], -win.share[1]], "row"],
    ...((inp.seniorCount || 0) > 0 ? [["Senior dentists (production pay)", [null, -win.senior[0], -win.senior[1]], "row"]] : []),
    ["Materials & lab", [null, -win.mat[0], -win.mat[1]], "row"],
    ["Insurance premiums (CCHI & malpractice)", [-prepaid(0), -prepaid(1), null], "row"],
    ["VAT on CapEx (15%, paid with invoices)", [-vatCapex, null, null], "row"],
    ["Marketing", [null, -years[0].mkt, -years[1].mkt], "row"],
    ["Utilities & medical waste", [null, -utilCash(0), -utilCash(1)], "row"],
    ["Other OpEx", [null, -years[0].other, -years[1].other], "row"],
    ["Foreign-labour fees (levy & iqama)", [-preForeign, -years[0].foreign, -years[1].foreign], "row"],
    ["Foreign-staff recruitment (pre-opening)", [-(inp.capexRecruitment || 0), null, null], "row"],
    ...(finPrincipal > 0 ? [["Equipment finance (interest + principal)", [null, -win.debt[0], -win.debt[1]], "row"]] : []),
    ["Net operating cash flow", [-cfPreOpen - vatCapex, net1, net2], "subtotal"],
    ["Cumulative cash position", [-cfPreOpen - vatCapex, -cfPreOpen - vatCapex + net1, -cfPreOpen - vatCapex + net1 + net2], "total"],
    ["Lowest cash point in period", winMin, "total"],
  ];

  // === Returns — capital base is the total capital actually deployed (totalRaise), not a guessed budget ===
  const initialInvestment = totalRaise;
  let cum = 0, payback = null;
  for (let i = 0; i < 5; i++) { const prev = cum; cum += years[i].fcf; if (cum >= initialInvestment && years[i].fcf > 0) { payback = i + (initialInvestment - prev) / years[i].fcf; break; } }
  if (payback === null && y5.fcf > 0) payback = 5 + (initialInvestment - cum) / y5.fcf;
  const cfs = [-initialInvestment];
  for (let i = 0; i < 5; i++) { let cf = years[i].fcf; if (i === 4) cf += inp.exitMultiple * y5.ebitda - loan.residual; cfs.push(cf); } // exit nets any residual equipment-finance balance
  const irr = computeIRR(cfs);
  const npv = cfs.reduce((a, cf, i) => a + cf / Math.pow(1 + inp.wacc / 100, i), 0);
  const perDentistMo = inp.dentistCount > 0 ? (dentistBaseAnnual + y5.share) / inp.dentistCount / 12 : 0;
  const perSeniorMo = (inp.seniorCount || 0) > 0 ? y5.seniorPay / inp.seniorCount / 12 : 0; // mature monthly take per senior — the recruiting test
  const saudization = inp.dentistBase < 9000;
  let verdict, vColor;
  if (cumNI > 0 && y5.ebitdaPct >= 25 && payback && payback <= 4.5) { verdict = "STRONG"; vColor = C.pos; }
  else if (cumNI > 0 && y5.ebitda > 0) { verdict = "VIABLE"; vColor = C.brass; }
  else { verdict = "MARGINAL"; vColor = C.neg; }
  const exitValue = inp.exitMultiple * y5.ebitda;
  const moic = totalRaise > 0 ? (years.reduce((a, y) => a + y.fcf, 0) + exitValue - loan.residual) / totalRaise : 0; // equity multiple: total cash returned ÷ capital invested

  return { years, y5, cumNI, payback, irr, npv, perDentistMo, perSeniorMo, coverage: cov, seniorFracDays: sFracD, seniorFracRev: sFracW, prodCapMo, seniorRealization, salariedRealization, salariedDisplacedDays, revPerChairFull: inp.chairs > 0 ? prodCapMo / inp.chairs : 0, usedDays, idleDentistDays, usedFactor, util: rev, dentistDays: dentistDaysSupplied(inp), chairDays: chairDaysOpen(inp), saudization, verdict, vColor, exitValue, monthly, monthlyOp, peakNeed, troughLabel, fundingBudget, fundingOk, uOpen, uEnd, cashflow, monthlyOpex, launchLiquidity, minCashReserve, totalRaise, investCapex, financeable: financeableBase(inp), financedPrincipal: finPrincipal, downPayment: financeableBase(inp) - finPrincipal, monthlyPayment: loan.pmt, financeInterest: loan.totalInterest, financeResidual: loan.residual, opBreakEvenRev, moic };
}
function computeIRR(cfs) {
  let lo = -0.95, hi = 5.0;
  const npv = (r) => cfs.reduce((a, cf, i) => a + cf / Math.pow(1 + r, i), 0);
  if (npv(lo) * npv(hi) > 0) return null;
  let mid = 0;
  for (let k = 0; k < 200; k++) { mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return mid;
}
// one-way NPV sensitivity (±20%) per key driver — data for a tornado chart
function tornadoData(inp) {
  inp = { ...BASE_INPUTS, ...inp };
  const base = compute(inp).npv;
  const drivers = [["Revenue / dentist (FTE)", "revPerChair"], ["Y1 utilization", "rampStart"], ["Materials %", "materialsPct"], ["Profit share", "profitShare"], ["Exit multiple", "exitMultiple"]];
  return drivers.map(([label, k]) => {
    const a = compute({ ...inp, [k]: inp[k] * 0.8 }).npv - base;
    const b = compute({ ...inp, [k]: inp[k] * 1.2 }).npv - base;
    return { label, lo: Math.round(Math.min(a, b)), hi: Math.round(Math.max(a, b)), swing: Math.abs(b - a) };
  }).sort((x, y) => y.swing - x.swing);
}
// Monte Carlo: triangular distributions on the few uncertain drivers -> P(NPV>0), IRR percentiles, NPV histogram
function monteCarlo(inp, N) {
  inp = { ...BASE_INPUTS, ...inp };
  N = N || 2000;
  const tri = (min, mode, max) => { if (max <= min) return mode; const u = Math.random(), c = (mode - min) / (max - min); return u < c ? min + Math.sqrt(u * (max - min) * (mode - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - mode)); };
  const npvs = [], irrs = []; let pos = 0;
  for (let i = 0; i < N; i++) {
    const t = compute({ ...inp,
      revPerChair: tri(inp.revPerChair * 0.8, inp.revPerChair, inp.revPerChair * 1.2),
      rampStart: tri(Math.max(0, inp.rampStart - 10), inp.rampStart, Math.min(100, inp.rampStart + 10)),
      materialsPct: tri(Math.max(0, inp.materialsPct - 2), inp.materialsPct, inp.materialsPct + 2) });
    npvs.push(t.npv); if (t.irr != null) irrs.push(t.irr * 100); if (t.npv > 0) pos++;
  }
  const lo = Math.min(...npvs), hi = Math.max(...npvs), bins = 22, w = (hi - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, b) => ({ x: Math.round(lo + b * w), n: 0, neg: lo + (b + 0.5) * w < 0 }));
  npvs.forEach(v => { const b = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / w))); hist[b].n++; });
  const pctl = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  return { N, pPos: pos / N, p10: pctl(irrs, 0.1), p50: pctl(irrs, 0.5), p90: pctl(irrs, 0.9), hist };
}
