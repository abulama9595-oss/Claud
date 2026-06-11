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
  nursesPerChair: 1.5, chairsideSalary: 6000,
  generalStaffCount: 4, generalStaffSalary: 5500, adminManagerSalary: 15000,
  medicalSupportCount: 2, medicalSupportSalary: 5000, janitorCount: 3, janitorSalary: 900, driverCount: 1, driverSalary: 1500,
  gosiPct: 11,
  materialsPct: 13, materialsY1Premium: 0,
  clinicRent: 1000, staffHousing: 200, marketing: 250, otherOpex: 500,
  insuranceCCHI: 200, malpracticePerDentist: 5000, utilitiesWaste: 150,
  levyPerMonth: 800, iqamaPerYear: 750,
  exitMultiple: 6, maintenanceCapexPct: 4, zakatPct: 2.5, wacc: 12,
  insuredPct: 30, rejectionPct: 0, insurerDelayMo: 4,
  rentTerms: "annual", // "annual" | "grace" | "semiannual"
  fitoutMonths: 6,
  // CapEx breakdown (SAR'000)
  capexFitout: 1000, capexChairs: 800, capexImaging: 700, capexIT: 200,
  capexWorkingCapital: 2000, capexContingency: 700, capexFurniture: 300,
  capexRecruitment: 400, capexLicensing: 50, capexCivilDefence: 50,
  capexConsultants: 150, capexCSSD: 300, capexInventory: 250,
};
const CAPEX_KEYS = ["capexFitout","capexChairs","capexImaging","capexIT","capexWorkingCapital","capexContingency","capexFurniture","capexRecruitment","capexLicensing","capexCivilDefence","capexConsultants","capexCSSD","capexInventory"];
// expatriate headcount is derived: chairside staff (rounded up) + medical support + janitors + drivers — all typically expat roles in KSA
const expatCount = (inp) => Math.ceil(inp.chairs * inp.nursesPerChair) + (inp.medicalSupportCount || 0) + (inp.janitorCount || 0) + (inp.driverCount || 0);
// annual cost (SAR'000) of the dedicated support roles, added to the fixed staff base
const supportStaffAnnual = (inp) => ((inp.medicalSupportCount * inp.medicalSupportSalary + inp.janitorCount * inp.janitorSalary + inp.driverCount * inp.driverSalary) * 12) / 1000;
// pre-opening expenses are derived from the same inputs the cash engine charges before opening day:
// first annual rent cheque + 2 months of Y1 staff onboarding (incl. GOSI & expat fees) + annual insurance premiums
const preOpeningCost = (inp) => {
  const chairsideAnnual = (inp.chairs * inp.nursesPerChair * inp.chairsideSalary * 12) / 1000;
  const dentistBaseAnnual = (inp.dentistCount * inp.dentistBase * 12) / 1000;
  const generalStaffAnnual = ((inp.generalStaffCount * inp.generalStaffSalary + inp.adminManagerSalary) * 12) / 1000;
  const fixedBase = (chairsideAnnual + dentistBaseAnnual + generalStaffAnnual + supportStaffAnnual(inp)) * (1 + inp.gosiPct / 100);
  const perExpat = (inp.levyPerMonth * 12 + inp.iqamaPerYear) / 1000;
  const y1StaffAnnual = fixedBase * STAFF_RAMP[0] + Math.round(expatCount(inp) * STAFF_RAMP[0]) * perExpat;
  const prepaidIns = inp.insuranceCCHI * STAFF_RAMP[0] + (inp.dentistCount * inp.malpracticePerDentist) / 1000;
  return (inp.clinicRent + inp.staffHousing) * LEASE_ESC[0] * rentUpfrontFactor(inp) + 2 * (y1StaffAnnual / 12) + prepaidIns;
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

/* ---------- engine ---------- */
function compute(inp) {
  inp = { ...BASE_INPUTS, ...inp }; // saved scenarios may predate newer inputs
  const rev = Array.from({length: 5}, (_, i) => Math.min(1.0, (inp.rampStart / 100) * Math.pow(1 + inp.rampGrowth / 100, i)));
  // materials % steps down linearly from (mature + Y1 premium) in Y1 to mature in Y5
  const matSched = Array.from({length: 5}, (_, i) => inp.materialsPct + inp.materialsY1Premium * (1 - i / 4));
  const chairsideAnnual = (inp.chairs * inp.nursesPerChair * inp.chairsideSalary * 12) / 1000;
  const dentistBaseAnnual = (inp.dentistCount * inp.dentistBase * 12) / 1000;
  const generalStaffAnnual = ((inp.generalStaffCount * inp.generalStaffSalary + inp.adminManagerSalary) * 12) / 1000;
  const fixedBase = (chairsideAnnual + dentistBaseAnnual + generalStaffAnnual + supportStaffAnnual(inp)) * (1 + inp.gosiPct / 100);
  const perExpat = (inp.levyPerMonth * 12 + inp.iqamaPerYear) / 1000;

  const years = [];
  for (let i = 0; i < 5; i++) {
    const revenue = inp.revPerChair * Math.pow(1 + inp.revenueGrowth / 100, i) * 12 * inp.chairs * rev[i];
    const denials = revenue * (inp.insuredPct / 100) * (inp.rejectionPct / 100);
    const materials = (revenue * matSched[i]) / 100;
    const gp = revenue - denials - materials;
    const fixedStaff = fixedBase * STAFF_RAMP[i];
    const lease = (inp.clinicRent + inp.staffHousing) * LEASE_ESC[i];
    const mkt = inp.marketing * MKT_RAMP[i];
    const other = inp.otherOpex * OTHER_RAMP[i];
    // CCHI scales with headcount, malpractice with dentist count, utilities/waste with activity
    const insUtil = inp.insuranceCCHI * STAFF_RAMP[i] + (inp.dentistCount * inp.malpracticePerDentist) / 1000 + inp.utilitiesWaste * OTHER_RAMP[i];
    const expatsY = Math.round(expatCount(inp) * STAFF_RAMP[i]);
    const foreign = expatsY * perExpat;
    const preshare = gp - fixedStaff - lease - mkt - other - insUtil - foreign;
    const share = preshare > 0 ? (preshare * inp.profitShare) / 100 : 0;
    const ebitda = preshare - share;
    const dep = annualDepreciation(inp);
    const nibz = ebitda - dep;
    const zakat = Math.max(0, nibz) * (inp.zakatPct / 100);
    const ni = nibz - zakat;
    const maintCapex = hardCapex(inp) * (inp.maintenanceCapexPct / 100);
    const fcf = ni + dep - maintCapex;
    // guard margins against a zero-revenue year (revPerChair / chairs / rampStart can all be 0) so the UI never shows NaN%/Infinity%
    const pct = (x) => revenue > 0 ? x / revenue * 100 : 0;
    years.push({ year: `Y${i + 1}`, revenue, denials, materials, gp, gpPct: pct(gp), fixedStaff, lease, mkt, other, insUtil, foreign, preshare, share, ebitda, ebitdaPct: pct(ebitda), dep, zakat, ni, niPct: pct(ni), fcf });
  }
  const y5 = years[4];
  const cumNI = years.reduce((a, y) => a + y.ni, 0);
  const initialInvestment = totalCapex(inp);
  let cum = 0, payback = null;
  for (let i = 0; i < 5; i++) { const prev = cum; cum += years[i].fcf; if (cum >= initialInvestment && years[i].fcf > 0) { payback = i + (initialInvestment - prev) / years[i].fcf; break; } }
  if (payback === null && y5.fcf > 0) payback = 5 + (initialInvestment - cum) / y5.fcf;
  const cfs = [-initialInvestment];
  for (let i = 0; i < 5; i++) { let cf = years[i].fcf; if (i === 4) cf += inp.exitMultiple * y5.ebitda; cfs.push(cf); }
  const irr = computeIRR(cfs);
  const npv = cfs.reduce((a, cf, i) => a + cf / Math.pow(1 + inp.wacc / 100, i), 0);
  const perDentistMo = inp.dentistCount > 0 ? (dentistBaseAnnual + y5.share) / inp.dentistCount / 12 : 0;
  const saudization = inp.dentistBase < 9000;
  let verdict, vColor;
  if (cumNI > 0 && y5.ebitdaPct >= 25 && payback && payback <= 4.5) { verdict = "STRONG"; vColor = C.pos; }
  else if (cumNI > 0 && y5.ebitda > 0) { verdict = "VIABLE"; vColor = C.brass; }
  else { verdict = "MARGINAL"; vColor = C.neg; }
  const exitValue = inp.exitMultiple * y5.ebitda;

  // Pre-opening (fit-out, F months) + 24 operating months (Y1–Y2) cash engine.
  // Rent cheques follow the selected payment terms; the lease year runs from fit-out start (grace: from opening).
  // Staff onboard 2 months before opening; annual insurance premiums paid upfront at P1, renewed at M12.
  // Input VAT on CapEx is paid with invoices during fit-out and recovered against output VAT over M1–M6.
  // Utilization ramps linearly inside each year so the 12-month average matches the annual ramp.
  // Insured billings are collected with a payment delay, net of rejections; cash patients pay at visit.
  const F = Math.max(1, Math.round(inp.fitoutMonths));
  const vatCapex = vatOnCapex(inp);
  const uEnd = Math.min(100, inp.rampStart * 1.5);
  const uOpen = Math.max(0, 2 * inp.rampStart - uEnd);
  const u2End = Math.max(0, Math.min(100, 2 * rev[1] * 100 - uEnd));
  const y1 = years[0];
  const sIns = inp.insuredPct / 100, rRej = inp.rejectionPct / 100, dLag = inp.insurerDelayMo;
  const prepaid = (yi) => inp.insuranceCCHI * STAFF_RAMP[yi] + (inp.dentistCount * inp.malpracticePerDentist) / 1000;
  const mStaff = (y1.fixedStaff + y1.foreign) / 12;
  // gross billings per operating month (j = 0..23)
  const Bop = Array.from({ length: 24 }, (_, j) => {
    const util = j < 12 ? uOpen + (uEnd - uOpen) * j / 11 : uEnd + (u2End - uEnd) * (j - 12) / 11;
    const yi = j < 12 ? 0 : 1;
    return inp.revPerChair * Math.pow(1 + inp.revenueGrowth / 100, yi) * inp.chairs * util / 100;
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
  const win = { coll: [0, 0], share: [0, 0], rent: [0, 0], mat: [0, 0] }; // per-operating-year cash sums for the statement
  const opCf = Array.from({ length: 24 }, (_, j) => {
    const yi = j < 12 ? 0 : 1;
    const yr = years[yi];
    const B = Bop[j];
    const fixedAcc = (yr.fixedStaff + yr.lease + yr.mkt + yr.other + yr.insUtil + yr.foreign) / 12;
    const mPre = B * (1 - sIns * rRej) - (B * matSched[yi]) / 100 - fixedAcc;
    const mShare = mPre > 0 ? mPre * inp.profitShare / 100 : 0;
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
  const fundingBudget = inp.capexWorkingCapital + preOpeningCost(inp); // derived pre-opening expenses + WC reserve fund the trough
  const fundingOk = fundingBudget >= peakNeed;

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
    ["Dentist profit share", [null, -win.share[0], -win.share[1]], "row"],
    ["Materials & lab", [null, -win.mat[0], -win.mat[1]], "row"],
    ["Insurance premiums (CCHI & malpractice)", [-prepaid(0), -prepaid(1), null], "row"],
    ["VAT on CapEx (15%, paid with invoices)", [-vatCapex, null, null], "row"],
    ["Marketing", [null, -years[0].mkt, -years[1].mkt], "row"],
    ["Utilities & medical waste", [null, -utilCash(0), -utilCash(1)], "row"],
    ["Other OpEx", [null, -years[0].other, -years[1].other], "row"],
    ["Foreign-labour fees (levy & iqama)", [-preForeign, -years[0].foreign, -years[1].foreign], "row"],
    ["Net operating cash flow", [-cfPreOpen - vatCapex, net1, net2], "subtotal"],
    ["Cumulative cash position", [-cfPreOpen - vatCapex, -cfPreOpen - vatCapex + net1, -cfPreOpen - vatCapex + net1 + net2], "total"],
    ["Lowest cash point in period", winMin, "total"],
  ];

  return { years, y5, cumNI, payback, irr, npv, perDentistMo, saudization, verdict, vColor, exitValue, monthly, monthlyOp, peakNeed, troughLabel, fundingBudget, fundingOk, uOpen, uEnd, cashflow };
}
function computeIRR(cfs) {
  let lo = -0.95, hi = 5.0;
  const npv = (r) => cfs.reduce((a, cf, i) => a + cf / Math.pow(1 + r, i), 0);
  if (npv(lo) * npv(hi) > 0) return null;
  let mid = 0;
  for (let k = 0; k < 200; k++) { mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return mid;
}
