// Shared helpers for the real-estate engine tests (node --test tests/re/).
// Scenarios here are synthetic — never put anyone's real figures in this folder.
const fs = require('fs'), path = require('path'), vm = require('vm');
// the model files sit at the repository root (Claud) or under web/ (the studio mirror)
const REPO = path.resolve(__dirname, '..', '..');
const ROOT = fs.existsSync(path.join(REPO, 're-engine.js')) ? REPO : path.join(REPO, 'web');

// engine.js + re-engine.js (+ re-ui.js when present) in one isolated context, exactly as the page loads them
function loadEngine() {
  const files = ['engine.js', 're-engine.js', 're-ui.js'].filter((f) => fs.existsSync(path.join(ROOT, f)));
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

// a fixed synthetic household (made-up figures) with two old personal loans and a property it already owns
const FAMILY = {
  income: 60000, livingExpenses: 22000, cashAvailable: 1800000, rentNow: 0, ownedValue: 3500000,
  existingLoans: [{ id: 1, name: 'Car', balance: 120000, installment: 3900, monthsLeft: 34, rate: 6.5, ageMonths: 26 }, { id: 2, name: 'Personal', balance: 400000, installment: 9800, monthsLeft: 48, rate: 5.9, ageMonths: 20 }],
};

const scenarios = (E, n = 120) => [{ label: 'defaults', inp: {} }, { label: 'family', inp: FAMILY }, { label: 'buy', inp: { acquire: 'buy', propertyPrice: 2800000 } }]
  .concat(Array.from({ length: n }, (_, k) => ({ label: `random#${k + 1}`, inp: randomScenario(E, k + 1) })));

module.exports = { ROOT, loadEngine, rng, randomScenario, FAMILY, scenarios };
