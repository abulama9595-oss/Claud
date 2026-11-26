// Land opportunity engine (opportunity.html): is this plot worth developing? A pure, synchronous model — no DOM.
// Loaded as a classic <script>; tests load it in a vm context (tests/opp/). Synthetic test figures only.
//
// THE MODEL (one function, computeOpp(inp) → result)
//   inp = { ...OPP_BASE, ...your inputs }, the rules filled from OPP_CODES[inp.type] where you left them blank (oppMerge).
//   1 · The land. A rectangle (frontage × depth; any two of frontage, depth, area give the third) or the area only. Streets:
//       [{ side: "front"|"left"|"right"|"rear", width }]. A side on a street takes the street setback
//       (clamp(width × frontSetbackPct%, frontSetbackMin, frontSetbackMax)); the others take sideSetback / rearSetback.
//   2 · What you may build (apartments): footprint per floor = min(coverage % × land area, the rectangle left inside the
//       setbacks) — area only: coverage alone (setbacks not checked, said in warnings). Building area above ground = ground +
//       (floors − 1) × upper floor + roof annex % × upper floor. A basement (levels × basementCoverPct % of the land) is cost
//       and parking, never sellable. groundParking: the ground floor is parking (not sellable).
//       Villas / townhouses: the land split along the frontage into `villaCount` plots (or as many `villaWidth`-wide plots as
//       fit; area only: area ÷ villaPlot); each plot takes the street setback and the rear setback, and side setbacks
//       (attached townhouses: only the two end plots, shared over all); per villa the same floors / coverage / annex rule.
//   3 · What you sell: sellable = building area (sellable floors) × (1 − utilityPct %); units = unitsOverride or
//       ⌊sellable ÷ unitSize⌋ (villas: one unit per villa). Sales value (GDV) = units × priceUnit, or sellable × priceSqm.
//   4 · Costs: land × (1 + rettPct % + brokerPct %); construction = above-ground area × buildCost + basement × basementCost;
//       design/permits/supervision softPct % of construction; contingency contPct % of construction + design (as the
//       real-estate tool counts it); finishExtra (lump); VAT vatPct % on
//       construction + soft + contingency + extras (a residential sale carries no VAT, so it is not recovered); permitFees;
//       selling costs saleCostPct % of each sale; an optional land loan (loanLtv % of the land price, loanRate % a year,
//       interest monthly, repaid at completion).
//   5 · Time (months from the purchase, month 0): design & permits 1..designMonths; construction evenly over the next
//       buildMonths (contingency, VAT with it; extras in its last month); design fees half over design, half over
//       construction. Off-plan (Wafi) sales: offPlanPct % of the units, collected evenly over construction (offPlanDiscountPct
//       % below the price); the rest sold evenly over saleMonths from the month after completion.
//   Results: geometry, areas, units, costs (each line), revenue, kpis (profit, margins, per m², IRR, NPV, peak cash, payback,
//   equity multiple), breakEven (price per m² / per unit, build cost, units), residualLand (the most per m² of land for your
//   target margin, and for break-even), sensitivity (price × build cost grid), tornado, cases, warnings, verdict.
//   Every break-even is exact: each is linear in its input, so it is solved from two runs.

const OPP_CODES = {
  // typical Riyadh rules — EDITABLE defaults, not authoritative: check the plot's building permit / planning certificate
  apartments: {
    label: "Apartment building", frontSetbackPct: 20, frontSetbackMin: 3, frontSetbackMax: 6, sideSetback: 2, rearSetback: 2,
    groundCoverPct: 60, upperCoverPct: 60, floors: 3, floorsUsual: 3, annexPct: 50, utilityPct: 18, unitSize: 150,
    parkingPerUnit: 1, buildCost: 2000, minUnitSize: 70,
    note: "Residential neighbourhood: ground + 2 floors + a roof annex; front setback a fifth of the street width (3–6 m), 2 m at the sides and rear; 60% coverage. Main streets and higher-density zones allow more floors — enter what your plot's permit allows.",
    checked: "2026-11",
  },
  villas: {
    label: "Villas / townhouses", frontSetbackPct: 20, frontSetbackMin: 2, frontSetbackMax: 6, sideSetback: 2, rearSetback: 2,
    groundCoverPct: 75, upperCoverPct: 75, floors: 2, floorsUsual: 2, annexPct: 70, utilityPct: 8, unitSize: 0,
    parkingPerUnit: 2, buildCost: 2200, villaWidth: 12, villaPlotMin: 250,
    note: "Villas: since July 2025 new permits allow 75% on the ground and first floors and a roof annex up to 70%; front setback a fifth of the street width (2–6 m), 2 m at the sides and rear. Splitting a plot needs the municipality's approval.",
    checked: "2026-11",
  },
};

const OPP_BASE = {
  name: "",
  type: "apartments",               // "apartments" | "villas"
  // the land
  frontage: 30, depth: 40, area: null,   // any two give the third; area alone = area-only mode
  streets: [{ side: "front", width: 20 }],
  landPrice: 3500, rettPct: 5, brokerPct: 2.5,
  // the rules (null = the type's code default)
  frontSetbackPct: null, frontSetbackMin: null, frontSetbackMax: null, sideSetback: null, rearSetback: null,
  groundCoverPct: null, upperCoverPct: null, floors: null, annexPct: null,
  basement: false, basementLevels: 1, basementCoverPct: 100, groundParking: false,
  parkingPerUnit: null, parkingSpaceArea: 30,      // m² of basement per space, ramps and aisles included
  // villas
  villaCount: null, villaWidth: null, villaPlot: 300, attached: false, villaPlotMin: null,
  // what you sell
  utilityPct: null, unitSize: null, unitsOverride: null,
  priceBasis: "sqm", priceSqm: 6500, priceUnit: 950000,
  saleCostPct: 2.5, saleMonths: 12, offPlanPct: 0, offPlanDiscountPct: 0,
  // costs
  buildCost: null, basementCost: 2600, softPct: 8, contPct: 5, vatPct: 15, finishExtra: 0, permitFees: 0,
  // time and money
  designMonths: 6, buildMonths: 24, loanLtv: 0, loanRate: 6.5,
  targetMarginPct: 20, discountRate: 10, askingPrice: null,   // askingPrice: the seller's price per m² (null = landPrice)
};

const oppNum = (v, d) => (v === null || v === undefined || v === "" || isNaN(+v) ? d : +v);

// your inputs over the defaults, the type's rules where you left them blank
function oppMerge(inp) {
  const x = { ...OPP_BASE, ...(inp || {}) }, type = OPP_CODES[x.type] ? x.type : "apartments", C = OPP_CODES[type];
  x.type = type;
  for (const k of ["frontSetbackPct", "frontSetbackMin", "frontSetbackMax", "sideSetback", "rearSetback", "groundCoverPct", "upperCoverPct", "floors", "annexPct", "utilityPct", "unitSize", "parkingPerUnit", "buildCost", "villaWidth", "villaPlotMin"])
    if (x[k] === null || x[k] === undefined || x[k] === "") x[k] = C[k] === undefined ? null : C[k];
  x.streets = Array.isArray(x.streets) && x.streets.length ? x.streets.map((s) => ({ side: s.side || "front", width: oppNum(s.width, 0) })) : [{ side: "front", width: 20 }];
  return x;
}

// the land: frontage, depth, area (any two give the third); hasDims = setbacks can be drawn
function oppLand(x) {
  let f = oppNum(x.frontage, 0), d = oppNum(x.depth, 0), a = oppNum(x.area, 0), derived = null;
  if (f > 0 && d > 0) { if (!(a > 0)) derived = "area"; a = f * d; }
  else if (a > 0 && f > 0) { d = a / f; derived = "depth"; }
  else if (a > 0 && d > 0) { f = a / d; derived = "frontage"; }
  const hasDims = f > 0 && d > 0;
  return { frontage: hasDims ? f : null, depth: hasDims ? d : null, area: a > 0 ? a : 0, hasDims, derived };
}

// the setback on each side: a street side the street rule, the others the side / rear rule
function oppSetbacks(x) {
  const street = (w) => Math.min(x.frontSetbackMax, Math.max(x.frontSetbackMin, w * x.frontSetbackPct / 100));
  const on = (side) => x.streets.filter((s) => s.side === side).reduce((m, s) => Math.max(m, street(s.width)), -1);
  const pick = (side, other) => { const v = on(side); return v >= 0 ? v : other; };
  return { front: pick("front", x.rearSetback), rear: pick("rear", x.rearSetback), left: pick("left", x.sideSetback), right: pick("right", x.sideSetback), streetSides: x.streets.map((s) => s.side) };
}

// the core run (no sensitivity, no break-evens): geometry → areas → units → costs → revenue → cash flow → KPIs
function oppCore(x) {
  const L = oppLand(x), sb = oppSetbacks(x), A = L.area, villas = x.type === "villas";
  const floors = Math.max(1, Math.round(oppNum(x.floors, 1))), g = x.groundCoverPct / 100, u = x.upperCoverPct / 100, annex = x.annexPct / 100;
  let geo, perUnitArea = null;
  if (!villas) {
    const inW = L.hasDims ? Math.max(0, L.frontage - sb.left - sb.right) : null, inD = L.hasDims ? Math.max(0, L.depth - sb.front - sb.rear) : null;
    const rect = L.hasDims ? inW * inD : Infinity;
    const ground = Math.min(g * A, rect), upper = Math.min(u * A, rect);
    geo = { inW, inD, rect: L.hasDims ? rect : null, ground, upper, groundBound: L.hasDims && rect < g * A ? "setbacks" : "coverage", upperBound: L.hasDims && rect < u * A ? "setbacks" : "coverage" };
  } else {
    // the plots along the frontage (or by area)
    const want = oppNum(x.villaCount, 0);
    const n = Math.max(1, want > 0 ? Math.round(want) : L.hasDims ? Math.floor(L.frontage / Math.max(1, x.villaWidth)) : Math.floor(A / Math.max(1, oppNum(x.villaPlot, 300))));
    const plotArea = A / n, plotW = L.hasDims ? L.frontage / n : null;
    const sideTotal = x.attached ? (sb.left + sb.right) / n : sb.left + sb.right;     // attached: only the two end plots keep a side setback
    const rect = L.hasDims ? Math.max(0, plotW - sideTotal) * Math.max(0, L.depth - sb.front - sb.rear) : Infinity;
    const ground = Math.min(g * plotArea, rect), upper = Math.min(u * plotArea, rect);
    geo = { n, plotArea, plotW, sideTotal, rect: L.hasDims ? rect : null, ground, upper, groundBound: L.hasDims && rect < g * plotArea ? "setbacks" : "coverage", upperBound: L.hasDims && rect < u * plotArea ? "setbacks" : "coverage" };
  }
  const annexArea = floors > 1 || annex > 0 ? annex * geo.upper : 0;
  const perBuilding = geo.ground + (floors - 1) * geo.upper + annexArea;            // above ground, one building (or one villa)
  const count = villas ? geo.n : 1;
  const aboveGround = perBuilding * count;
  const basementArea = !villas && x.basement ? A * x.basementCoverPct / 100 * Math.max(1, Math.round(oppNum(x.basementLevels, 1))) : 0;
  const sellableGross = villas ? aboveGround : aboveGround - (x.groundParking ? geo.ground : 0);
  const sellable = Math.max(0, sellableGross * (1 - x.utilityPct / 100));
  const unitsAuto = villas ? geo.n : x.unitSize > 0 ? Math.floor(sellable / x.unitSize) : 0;
  const units = Math.max(0, oppNum(x.unitsOverride, 0) > 0 ? Math.round(x.unitsOverride) : unitsAuto);
  perUnitArea = units > 0 ? sellable / units : 0;
  // parking: needed vs room (basement, a parking ground floor, the open part of the plot)
  const need = Math.ceil(units * oppNum(x.parkingPerUnit, 0));
  const openGround = Math.max(0, A - geo.ground * count);
  const room = { basement: Math.floor(basementArea / Math.max(1, x.parkingSpaceArea)), groundFloor: x.groundParking && !villas ? Math.floor(geo.ground / Math.max(1, x.parkingSpaceArea)) : 0, open: Math.floor(openGround * 0.5 / 25) };
  const parking = { need, room, total: room.basement + room.groundFloor + room.open, short: Math.max(0, need - (room.basement + room.groundFloor + room.open)) };

  // costs
  const land = A * x.landPrice, rett = land * x.rettPct / 100, broker = land * x.brokerPct / 100;
  const construction = aboveGround * x.buildCost + basementArea * x.basementCost;
  const soft = construction * x.softPct / 100, cont = (construction + soft) * x.contPct / 100, finish = oppNum(x.finishExtra, 0), permits = oppNum(x.permitFees, 0);
  const vat = (construction + soft + cont + finish) * x.vatPct / 100;
  // sales
  const price = x.priceBasis === "unit" ? (units > 0 ? x.priceUnit : 0) : (perUnitArea * x.priceSqm);     // one unit's price
  const gdv = x.priceBasis === "unit" ? units * x.priceUnit : sellable * x.priceSqm;
  const offShare = Math.min(1, Math.max(0, x.offPlanPct / 100)), offDisc = Math.max(0, x.offPlanDiscountPct / 100);
  const offRevenue = gdv * offShare * (1 - offDisc), restRevenue = gdv * (1 - offShare), revenue = offRevenue + restRevenue;
  const saleCosts = revenue * x.saleCostPct / 100;
  // the months
  const D = Math.max(0, Math.round(x.designMonths)), B = Math.max(1, Math.round(x.buildMonths)), S = Math.max(1, Math.round(x.saleMonths));
  const done = D + B, H = done + S;
  const out = new Array(H + 1).fill(0), inn = new Array(H + 1).fill(0);
  out[0] += land + rett + broker;
  if (permits) out[Math.min(1, H)] += permits;
  const softSpread = (k) => { if (D > 0) { for (let t = 1; t <= D; t++) out[t] += soft * 0.5 / D; for (let t = D + 1; t <= done; t++) out[t] += soft * 0.5 / B; } else for (let t = 1; t <= done; t++) out[t] += soft / B; };
  softSpread();
  const buildMonthly = (construction + cont) * (1 + x.vatPct / 100) / B, softVatMonthly = soft * x.vatPct / 100 / B;
  for (let t = D + 1; t <= done; t++) out[t] += buildMonthly + softVatMonthly;
  out[done] += finish * (1 + x.vatPct / 100);
  for (let t = D + 1; t <= done; t++) { const r = offRevenue / B; inn[t] += r; out[t] += r * x.saleCostPct / 100; }
  for (let t = done + 1; t <= H; t++) { const r = restRevenue / S; inn[t] += r; out[t] += r * x.saleCostPct / 100; }
  // the land loan: drawn at month 0, interest monthly, repaid at completion
  const loan = land * Math.max(0, x.loanLtv) / 100, interestMo = loan * x.loanRate / 100 / 12;
  const flow = [];
  let cum = 0, peak = 0, peakT = 0, interest = 0;
  for (let t = 0; t <= H; t++) {
    let net = inn[t] - out[t];
    if (t === 0) net += loan;
    if (loan > 0 && t >= 1 && t <= done) { net -= interestMo; interest += interestMo; }
    if (loan > 0 && t === done) net -= loan;
    cum += net; if (cum < peak) { peak = cum; peakT = t; }
    flow.push({ t, out: out[t], in: inn[t], net, cum });
  }
  const paybackT = (() => { for (let t = peakT; t <= H; t++) if (flow[t].cum >= -1e-6) return t; return null; })();
  const devCost = land + rett + broker + construction + soft + cont + finish + vat + permits;
  const totalCost = devCost + saleCosts + interest, profit = revenue - totalCost;
  const irrMo = oppIrr(flow.map((f) => f.net)), irr = irrMo == null ? null : Math.pow(1 + irrMo, 12) - 1;
  const dr = Math.pow(1 + x.discountRate / 100, 1 / 12) - 1, npv = flow.reduce((a, f) => a + f.net / Math.pow(1 + dr, f.t), 0);
  const ins = flow.reduce((a, f) => a + Math.max(0, f.net), 0), outs = flow.reduce((a, f) => a + Math.max(0, -f.net), 0);
  return {
    land: L, setbacks: sb, geometry: geo, villas, floors,
    areas: { land: A, footprint: geo.ground * count, upperFloor: geo.upper * count, annex: annexArea * count, perBuilding, aboveGround, basement: basementArea, sellableGross, sellable, utility: sellableGross - sellable, far: A > 0 ? aboveGround / A : 0 },
    units: { count: units, auto: unitsAuto, avgSize: perUnitArea, price },
    parking,
    costs: { land, rett, broker, landTotal: land + rett + broker, construction, soft, cont, finish, vat, permits, devCost, saleCosts, interest, total: totalCost, loan },
    revenue: { gdv, offRevenue, restRevenue, total: revenue },
    months: { design: D, build: B, sale: S, done, end: H },
    cashflow: flow,
    kpis: {
      profit, marginOnCost: totalCost > 0 ? profit / totalCost : 0, marginOnGdv: revenue > 0 ? profit / revenue : 0,
      profitPerLandM2: A > 0 ? profit / A : 0, profitPerUnit: units > 0 ? profit / units : 0,
      costPerSellable: sellable > 0 ? (totalCost - saleCosts) / sellable : 0, costPerUnit: units > 0 ? (totalCost - saleCosts) / units : 0,
      landPerSellable: sellable > 0 ? (land + rett + broker) / sellable : 0, buildPerSellable: sellable > 0 ? construction / sellable : 0,
      irr, npv, peakCash: -peak, peakT, paybackT, equityMultiple: outs > 0 ? ins / outs : null,
    },
  };
}

// monthly IRR by bisection on NPV (null when the flows do not change sign)
function oppIrr(flows) {
  const npv = (r) => flows.reduce((a, c, t) => a + c / Math.pow(1 + r, t), 0);
  if (!flows.some((c) => c > 0) || !flows.some((c) => c < 0)) return null;
  let lo = -0.99, hi = 1, fl = npv(lo), fh = npv(hi);
  if (fl * fh > 0) return null;
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (fl * fm < 0) { hi = mid; fh = fm; } else { lo = mid; fl = fm; } }
  return (lo + hi) / 2;
}

// solve f(v) = target for an input that enters linearly (two runs)
function oppSolveLinear(x, set, measure, target, v0, dv) {
  const a = measure(oppCore(set(x, v0))), b = measure(oppCore(set(x, v0 + dv)));
  const slope = (b - a) / dv;
  return Math.abs(slope) < 1e-12 ? null : v0 + (target - a) / slope;
}

function computeOpp(inp) {
  const x = oppMerge(inp), r = oppCore(x), K = r.kpis, m = x.targetMarginPct / 100;
  const profit = (q) => q.kpis.profit, marginGap = (q) => q.kpis.profit - m * q.costs.total;
  // break-evens (each linear in its input)
  const scalePrice = (y, f) => ({ ...y, priceSqm: x.priceSqm * f, priceUnit: x.priceUnit * f });
  const fPrice = oppSolveLinear(x, scalePrice, profit, 0, 1, 0.1);
  const buildCostBE = oppSolveLinear(x, (y, v) => ({ ...y, buildCost: v }), profit, 0, x.buildCost, 100);
  const landBE = oppSolveLinear(x, (y, v) => ({ ...y, landPrice: v }), profit, 0, x.landPrice, 100);
  const landTarget = oppSolveLinear(x, (y, v) => ({ ...y, landPrice: v }), marginGap, 0, x.landPrice, 100);
  const priceTarget = oppSolveLinear(x, scalePrice, marginGap, 0, 1, 0.1);
  // the units you must sell to cover every cost but the selling costs of the unsold ones
  const netPerUnit = r.units.count > 0 ? r.revenue.total / r.units.count * (1 - x.saleCostPct / 100) : 0;
  const unitsBE = netPerUnit > 0 ? Math.ceil((r.costs.total - r.costs.saleCosts) / netPerUnit) : null;
  const unitPrice = x.priceBasis === "unit" ? x.priceUnit : r.units.price, sqmPrice = x.priceBasis === "unit" ? (r.areas.sellable > 0 ? r.revenue.gdv / r.areas.sellable : 0) : x.priceSqm;
  const breakEven = {
    priceFactor: fPrice, priceSqm: fPrice == null ? null : sqmPrice * fPrice, priceUnit: fPrice == null ? null : unitPrice * fPrice,
    priceDropPct: fPrice == null ? null : (1 - fPrice) * 100,
    buildCost: buildCostBE, buildCostRisePct: buildCostBE == null ? null : (buildCostBE / x.buildCost - 1) * 100,
    units: unitsBE, unitsShare: unitsBE != null && r.units.count > 0 ? unitsBE / r.units.count : null,
    targetPriceSqm: priceTarget == null ? null : sqmPrice * priceTarget, targetPriceUnit: priceTarget == null ? null : unitPrice * priceTarget,
  };
  const asking = oppNum(x.askingPrice, x.landPrice);
  const residualLand = { atTarget: landTarget, atBreakEven: landBE, asking, headroom: landTarget == null ? null : landTarget - asking, headroomPct: landTarget == null || !(asking > 0) ? null : (landTarget / asking - 1) * 100 };
  // sensitivity: price × build cost (profit and margin on cost)
  const steps = [-20, -10, 0, 10, 20];
  const sensitivity = { price: steps, cost: steps, cells: steps.map((dp) => steps.map((dc) => { const q = oppCore({ ...scalePrice(x, 1 + dp / 100), buildCost: x.buildCost * (1 + dc / 100) }); return { profit: q.kpis.profit, margin: q.kpis.marginOnCost }; })) };
  // tornado: what moves the profit most
  const tor = (label, lo, hi) => { const a = oppCore(lo).kpis.profit, b = oppCore(hi).kpis.profit; return { label, low: a - K.profit, high: b - K.profit }; };
  const tornado = [
    tor("Sale price ±10%", scalePrice(x, 0.9), scalePrice(x, 1.1)),
    tor("Building cost ±10%", { ...x, buildCost: x.buildCost * 1.1 }, { ...x, buildCost: x.buildCost * 0.9 }),
    tor("Land price ±10%", { ...x, landPrice: x.landPrice * 1.1 }, { ...x, landPrice: x.landPrice * 0.9 }),
    tor("Utility share ±5 points", { ...x, utilityPct: x.utilityPct + 5 }, { ...x, utilityPct: Math.max(0, x.utilityPct - 5) }),
    tor("Construction ±6 months", { ...x, buildMonths: x.buildMonths + 6 }, { ...x, buildMonths: Math.max(1, x.buildMonths - 6) }),
  ].map((t) => ({ ...t, span: Math.abs(t.high - t.low) })).sort((a, b) => b.span - a.span);
  // three cases
  const caseOf = (label, y) => { const q = oppCore(y); return { label, profit: q.kpis.profit, margin: q.kpis.marginOnCost, irr: q.kpis.irr, peakCash: q.kpis.peakCash }; };
  const cases = [
    caseOf("Worst: price −10%, cost +10%, 6 months late", { ...scalePrice(x, 0.9), buildCost: x.buildCost * 1.1, buildMonths: x.buildMonths + 6 }),
    caseOf("Base", x),
    caseOf("Best: price +10%, cost −5%", { ...scalePrice(x, 1.1), buildCost: x.buildCost * 0.95 }),
  ];
  // what to watch
  const C = OPP_CODES[x.type], warnings = [];
  if (!r.land.hasDims) warnings.push("Only the area is known: the setbacks cannot be checked, so the footprint uses the coverage % alone. Enter the frontage or the depth to check them.");
  if (r.floors > C.floorsUsual) warnings.push(`${r.floors} floors is above the usual ${C.floorsUsual} for this kind of plot — only if your plot's permit allows it (main street, higher-density zone).`);
  if (!r.villas && r.units.count > 0 && r.units.avgSize < C.minUnitSize) warnings.push(`The apartments average ${Math.round(r.units.avgSize)} m² — small for the market; fewer, larger units may sell better.`);
  if (r.villas && r.geometry.plotArea < x.villaPlotMin) warnings.push(`Each villa plot is ${Math.round(r.geometry.plotArea)} m², below ${x.villaPlotMin} m² — check the minimum plot size for subdivision.`);
  if (r.parking.short > 0) warnings.push(`Parking: ${r.parking.need} spaces needed, room for about ${r.parking.total}${!x.basement && !r.villas ? " — a basement (or a parking ground floor) is likely needed" : ""}.`);
  if (r.units.count === 0) warnings.push("No units fit: check the areas, the unit size or the unit count.");
  if (residualLand.headroom != null && residualLand.headroom < 0) warnings.push(`At your ${x.targetMarginPct}% target the land is worth at most ${Math.round(landTarget).toLocaleString("en-US")} per m² — ${Math.round(-residualLand.headroom).toLocaleString("en-US")} below the price.`);
  const mc = K.marginOnCost;
  const verdict = r.units.count === 0 || K.profit <= 0 ? "NO-GO" : mc >= m ? "GO" : mc >= m / 2 ? "BORDERLINE" : "NO-GO";
  return { inp: x, code: C, ...r, breakEven, residualLand, sensitivity, tornado, cases, warnings, verdict };
}

// the handoff to the real-estate tool: a build-and-sell scenario with the same land, building, units and prices
function oppToRE2(inp, r) {
  const x = oppMerge(inp), q = r || computeOpp(x), A = q.areas.land;
  const units = Math.max(1, q.units.count);
  return {
    kind: "landBuilding", occupancy: "sell",
    landArea: Math.round(A * 100) / 100, landPrice: x.landPrice, landBrokerPct: x.brokerPct, rettPct: x.rettPct, firstHomeExempt: false,
    builtPct: A > 0 ? q.areas.aboveGround / A * 100 : 0, floors: 1,     // the above-ground area as one figure (builtArea = land × builtPct% × floors)
    buildCost: q.areas.aboveGround > 0 ? q.costs.construction / q.areas.aboveGround : x.buildCost,
    softPct: x.softPct, contPct: x.contPct, vatPct: x.vatPct, finishExtra: x.finishExtra, overrunPct: 0,
    unitCount: units, netLettablePct: q.areas.aboveGround > 0 ? q.areas.sellable / q.areas.aboveGround * 100 : 80,
    salePriceBasis: "unit", salePriceUnit: Math.round(q.revenue.total / units), saleMonths: x.saleMonths, saleCostPct: x.saleCostPct,
    landMonth: 1, buildStart: 1 + x.designMonths, buildMonths: x.buildMonths, appreciation: 0, costInflation: 0,
    oppName: x.name || "",
  };
}
