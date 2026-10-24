// Shared helpers for the v2 real-estate engine tests (node --test tests/re2/).
// Scenarios here are synthetic — never put anyone's real figures in this folder.
const fs = require('fs'), path = require('path'), vm = require('vm');
// the model files sit at the repository root (Claud) or under web/ (the studio mirror)
const REPO = path.resolve(__dirname, '..', '..');
const ROOT = fs.existsSync(path.join(REPO, 're2-engine.js')) ? REPO : path.join(REPO, 'web');

// engine.js + re2-engine.js (+ re2-ui.js when present) in one isolated context, exactly as the page loads them
// loadEngine(true) loads the OLD, frozen engine (re-engine.js + re-ui.js) the same way — for the fork-parity test; null when
// the old files are gone
function loadEngine(old) {
  const want = old ? ['engine.js', 're-engine.js', 're-ui.js'] : ['engine.js', 're2-engine.js', 're2-ui.js'];
  if (old && !fs.existsSync(path.join(ROOT, 're-engine.js'))) return null;
  const files = want.filter((f) => fs.existsSync(path.join(ROOT, f)));
  const ctx = { console, Math, Date, JSON, Array, Object, Number, String, Infinity, NaN, isNaN, isFinite, parseFloat, parseInt, Set, Map, RegExp, Error };
  ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
  // top-level const/let are not properties of the context, so collect every top-level name and expose it
  const srcs = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')), names = new Set();
  for (const s of srcs) for (const m of s.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  vm.runInContext(srcs.join('\n;\n') + '\n;globalThis.__api = {' + [...names].map((n) => `${n}: typeof ${n} === "undefined" ? undefined : ${n}`).join(', ') + '};', ctx, { filename: 'engine-bundle.js' });
  return ctx.__api;
}

// deterministic PRNG so failures reproduce
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a random but plausible home-mode scenario (synthetic)
function randomScenario(E, seed) {
  const r = rng(seed), pick = (a) => a[Math.floor(r() * a.length)], between = (a, b, step = 1) => a + Math.round((r() * (b - a)) / step) * step;
  const loans = [];
  for (let k = 0, n = pick([0, 1, 2, 2, 3]); k < n; k++) {
    const months = between(6, 84), rate = between(2, 9, 0.25), bal = between(50000, 1500000, 1000);
    const inst = E.rePmt(bal, rate, months) * (1 + (r() < 0.3 ? r() * 0.05 : 0));
    loans.push({ id: 1000 + k, name: `L${k + 1}`, balance: bal, installment: Math.round(inst), monthsLeft: months, rate, canSettle: r() > 0.15, canRefi: r() > 0.15, ageMonths: r() < 0.5 ? null : between(0, 30), settleAt: r() < 0.12 ? between(1, 40) : null });
  }
  const land = between(0, 30), start = Math.max(land, land + (r() < 0.5 ? 0 : between(0, 18)));
  const planOf = () => ({ ...E.RE_PLAN_DEFAULTS, enabled: true, name: 'random', lmUse: r() < 0.5, eqWhen: pick(['none', 'none', 'start', 'land', 'build']), plWhen: pick(['none', 'none', 'start', 'land', 'build']), coUse: r() < 0.3, pl2Use: r() < 0.4, settlePolicy: pick(['asNeeded', 'forMax', 'none']), plSplit: r() < 0.8 });
  return {
    mode: 'home', acquire: r() < 0.85 ? 'build' : 'buy', landArea: between(300, 1200, 25), landPrice: between(1500, 9000, 100), builtPct: pick([0, 60, 70]), floors: pick([1, 2, 2.5, 3]), builtArea: between(250, 900, 10), buildCost: between(1500, 3500, 50), softPct: pick([0, 5, 8]), contPct: pick([0, 5, 7]), finishExtra: between(0, 300000, 10000), buildMonths: between(6, 30), devMarginPct: between(-5, 25), landMonth: land, buildStart: start, costInflation: pick([0, 3, 5]), propertyPrice: between(1500000, 6000000, 50000), vatPct: pick([0, 15]), rettPct: 5, firstHomeExempt: r() < 0.5, appreciation: between(0, 5, 0.5), horizon: between(5, 30), altReturn: pick([0, 3, 6, 8]), maintPct: pick([0, 1]), insurance: pick([0, 3000]), rentNow: pick([0, 0, 6000, 12000]), rentGrowth: pick([0, 3]), income: between(20000, 250000, 1000), livingExpenses: between(8000, 60000, 1000), cashAvailable: between(0, 8000000, 50000), cashBuffer: pick([0, 100000, 300000]), dbrCap: pick([55, 60, 65, 65]), mortgageCap: pick([45, 55, 55]), perLoanCap: pick([25, 33, 33]), landLtv: pick([70, 90]), ownedValue: pick([0, 0, 3000000, 7000000]), ownedLtv: 70, cashoutLtv: 70, plCap: pick([1000000, 3000000]), refiMinMonths: 12, settleFeeMonths: pick([0, 3]), rateQuote: pick(['apr', 'flat']), recoveryMonths: pick([12, 24]), rentOutPct: r() < 0.2 ? between(3, 7) : 0, rentOutFixed: r() < 0.1 ? between(100000, 400000, 5000) : 0,
    lmRate: between(3, 8, 0.25), eqRate: between(3, 8, 0.25), plRate: between(2.5, 8, 0.25), coRate: between(3, 8, 0.25), lmTenure: between(5, 25), eqTenure: between(5, 25), plTenure: between(1, 7), coTenure: between(5, 25), lmFeesPct: pick([0, 0.5, 1]), eqFeesPct: pick([0, 1]), coFeesPct: pick([0, 1]),
    existingLoans: loans, plans: [planOf(), planOf(), planOf(), planOf()],
    incomeGrowth: pick([0, 0, 0, 3]), livingGrowth: pick([0, 0, 2, 4]),
  };
}

// the same household in the NEW shape (v2): the project as a kind, 0–3 properties you own (one of them the home you live in
// when you pay no rent — kept, let after you move or sold; the others earning rent today or not, kept, sold at move-in or sold in a
// month you set), old loans secured on some of them (an existing mortgage), each plan's mortgages on 0–2 of them, the new
// settings. For the new tests — randomScenario keeps the OLD shape for the fork-parity tests.
function randomScenario2(E, seed) {
  const r = rng(seed + 90000), pick = (a) => a[Math.floor(r() * a.length)], between = (a, b, step = 1) => a + Math.round((r() * (b - a)) / step) * step;
  const { mode, acquire, ownedValue, ownedLtv, ...rest } = randomScenario(E, seed);
  const props = [], names = ['Villa A', 'Flat B', 'Plot C'];
  for (let k = 0, n = pick([0, 1, 1, 2, 3]); k < n; k++) {
    const home = k === 0 && rest.rentNow === 0 && r() < 0.7, plan = pick(['keep', 'keep', 'keep', 'sell']);
    props.push({ id: `p${k + 1}`, name: names[k], value: between(500000, 8000000, 50000), ltv: pick([50, 60, 70, 70]), canMortgage: r() > 0.15, rentNow: !home && r() < 0.35 ? between(2000, 12000, 500) : 0, isHome: home,
      plan, sellAt: plan === 'sell' && r() < 0.5 ? between(1, 60) : 'moveIn', letAfterMove: home && r() < 0.4, letYield: pick([3, 4]), sellCostPct: pick([2.5, 7.5]) });
  }
  // an existing mortgage secured on one of them: the loan names the property, or the property names the loan
  const loans = rest.existingLoans.map((l) => ({ ...l }));
  loans.forEach((l) => { if (props.length && r() < 0.25) { const P = pick(props); if (r() < 0.5) l.securedOn = P.id; else P.existingLoanId = l.id; } });
  const plans = rest.plans.map((o) => {
    const { eqWhen, eqMonth, ...q } = o, ids = props.map((P) => P.id), morts = {};
    for (let k = 0, n = ids.length ? pick([0, 0, 1, 1, 2]) : 0; k < n && ids.length; k++) { const id = ids.splice(Math.floor(r() * ids.length), 1)[0], when = pick(['start', 'land', 'build', 'completion', 'month']); morts[id] = { when, month: when === 'month' ? between(0, 36) : 0 }; }
    return { ...q, mortgages: morts, prepayAfter: r() < 0.15 ? pick([0, 12, 24]) : null };
  });
  return { ...rest, kind: acquire === 'buy' ? 'readyVilla' : 'landVilla', properties: props, existingLoans: loans, plans, propertyValueBasis: pick(['market', 'market', 'today']), samaBands: r() < 0.7,
    partRentAnnual: r() < 0.2 ? between(20000, 80000, 5000) : 0, cashZakatPct: r() < 0.2 ? 2.5 : 0, bridgeRate: r() < 0.2 ? between(5, 9, 0.5) : null, rentFreezeUntil: pick([null, '2030-09']) };
}

// a fixed synthetic household (made-up figures) with two old personal loans and a property it already owns
const FAMILY = {
  income: 60000, livingExpenses: 22000, cashAvailable: 1800000, rentNow: 0, ownedValue: 3500000,
  existingLoans: [{ id: 1, name: 'Car', balance: 120000, installment: 3900, monthsLeft: 34, rate: 6.5, ageMonths: 26 }, { id: 2, name: 'Personal', balance: 400000, installment: 9800, monthsLeft: 48, rate: 5.9, ageMonths: 20 }],
};

const scenarios = (E, n = 120) => [{ label: 'defaults', inp: {} }, { label: 'family', inp: FAMILY }, { label: 'buy', inp: { acquire: 'buy', propertyPrice: 2800000 } }]
  .concat(Array.from({ length: n }, (_, k) => ({ label: `random#${k + 1}`, inp: randomScenario(E, k + 1) })));

// تضامن: the same random households, with a spouse (synthetic) — income across SAMA's bands, 0–2 loans of their own
function randomJoint(E, seed) {
  const inp = randomScenario(E, seed), r = rng(seed + 50000), pick = (a) => a[Math.floor(r() * a.length)], between = (a, b, step = 1) => a + Math.round((r() * (b - a)) / step) * step;
  const loans = [];
  for (let k = 0, n = pick([0, 1, 1, 2]); k < n; k++) {
    const months = between(6, 72), rate = between(2, 9, 0.25), bal = between(20000, 400000, 1000);
    loans.push({ id: `s${k + 1}`, name: `S${k + 1}`, balance: bal, installment: Math.round(E.rePmt(bal, rate, months)), monthsLeft: months, rate, canSettle: r() > 0.3, ageMonths: r() < 0.5 ? null : between(0, 30), settleAt: r() < 0.1 ? between(1, 40) : null, ...(r() < 0.2 ? { rateType: 'flat', rate: between(1.5, 5, 0.25) } : {}) });
  }
  const joint = { on: true, income: pick([0, between(4000, 15000, 500), between(15500, 24500, 500), between(25000, 60000, 1000)]), incomeGrowth: pick([null, null, 0, 3]), redf: r() < 0.3, loans };
  // who takes each plan's personal loans: you, your spouse or both of you
  return { ...inp, joint, plans: inp.plans.map((o) => ({ ...o, plBy: pick(['me', 'spouse', 'both']) })) };
}
const jointScenarios = (E, n = 40) => Array.from({ length: n }, (_, k) => ({ label: `joint#${k + 1}`, inp: randomJoint(E, k + 1) }));

// the fixed household in the new shape: the home it lives in is one of its properties
const FAMILY2 = { kind: 'landVilla', income: FAMILY.income, livingExpenses: FAMILY.livingExpenses, cashAvailable: FAMILY.cashAvailable, rentNow: 0, existingLoans: FAMILY.existingLoans,
  properties: [{ id: 'p1', name: 'Our home', value: 3500000, ltv: 70, canMortgage: true, isHome: true }] };
// a synthetic household with three properties: the home it lives in (let after the move), a flat that earns rent today and carries an
// existing mortgage (a plan mortgages it too), and a plot sold in month 30 (on both sides — it would be sold anyway)
const FAMILY3 = { kind: 'landVilla', asOf: '2026-10', income: 90000, livingExpenses: 25000, cashAvailable: 1200000, rentNow: 0, landMonth: 3, buildStart: 6, buildMonths: 18, horizon: 15,
  existingLoans: [{ id: 1, name: 'Car', balance: 120000, installment: 3900, monthsLeft: 34, rate: 6.5, ageMonths: 26 }, { id: 2, name: 'Flat mortgage', balance: 900000, installment: 8200, monthsLeft: 150, rate: 4.5, ageMonths: 30, securedOn: 'p2' }],
  properties: [{ id: 'p1', name: 'Our home', value: 3000000, ltv: 70, isHome: true, letAfterMove: true, letYield: 3.5 }, { id: 'p2', name: 'Flat B', value: 2500000, ltv: 70, rentNow: 7000 }, { id: 'p3', name: 'Plot C', value: 1500000, ltv: 60, plan: 'sell', sellAt: 30, sellCostPct: 7.5 }],
  plans: [{ enabled: true, lmUse: true, mortgages: { p2: { when: 'build', month: 0 } } }, { enabled: true, lmUse: true, mortgages: { p3: { when: 'land', month: 0 }, p2: { when: 'build', month: 0 } }, plWhen: 'build' }, { enabled: true, mortgages: { p1: { when: 'start', month: 0 } }, pl2Use: true }, { enabled: true, lmUse: true, coUse: true, mortgages: { p3: { when: 'month', month: 36 } } }] };
const scenarios2 = (E, n = 60) => [{ label: 'defaults2', inp: { kind: 'landVilla' } }, { label: 'family2', inp: FAMILY2 }, { label: 'ready2', inp: { kind: 'readyVilla', propertyPrice: 2800000 } }]
  .concat(Array.from({ length: n }, (_, k) => ({ label: `random2#${k + 1}`, inp: randomScenario2(E, k + 1) })));

// the same households on EVERY project kind (synthetic, round-robin over the five kinds): land only with its holding costs and a
// planned sale, buildings you live in or let out entirely with their units (rent per unit or per m²), ready assets split into
// land and an ageing building, the rent freeze on or off, a fixed as-of month
const KINDS2 = ['landVilla', 'readyVilla', 'land', 'landBuilding', 'readyBuilding'];
function kindScenarios(E, n = 48) {
  return Array.from({ length: n }, (_, k) => {
    const r = rng(k + 1 + 70000), pick = (a) => a[Math.floor(r() * a.length)], between = (a, b, step = 1) => a + Math.round((r() * (b - a)) / step) * step;
    const kind = KINDS2[k % KINDS2.length], basis = pick(['unit', 'unit', 'sqm']);
    const inp = { ...randomScenario2(E, k + 1), kind, asOf: pick(['2026-01', '2026-03', '2026-11']), rentFreezeUntil: pick([null, '2030-09', '2028-06']),
      occupancy: pick(['liveLet', 'let']), unitCount: between(2, 12), unitRentBasis: basis, unitRent: basis === 'sqm' ? between(300, 900, 50) : between(1500, 8000, 250), netLettablePct: pick([80, 85]), vacancyPct: pick([0, 5, 10]), mgmtPct: pick([0, 5]),
      landSellYear: pick([null, null, 3, 5, 8]), landSellCostPct: pick([2.5, 7.5]), landZakat: pick(['none', 'trade']), whiteLandPct: pick([0, 2.5, 5]), whiteLandOtherArea: pick([0, 0, 4000]),
      readyLandShare: pick([null, 40, 60]), readyAge: pick([0, 5, 12]), floors: pick([1, 2, 3]) };
    if (kind === 'land') inp.landArea = between(300, 8000, 100);
    if (kind === 'readyBuilding') inp.propertyPrice = between(2000000, 12000000, 50000);
    return { label: `kind#${k + 1} ${kind}`, inp };
  });
}

module.exports = { ROOT, loadEngine, rng, randomScenario, randomScenario2, randomJoint, FAMILY, FAMILY2, FAMILY3, scenarios, scenarios2, jointScenarios, kindScenarios, KINDS2 };
