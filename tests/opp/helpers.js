// Shared helpers for the land-opportunity tests (node --test tests/opp/). Synthetic figures only — never anyone's real plots.
const fs = require('fs'), path = require('path'), vm = require('vm');
// the model files sit at the repository root (Claud) or under web/ (the studio mirror)
const REPO = path.resolve(__dirname, '..', '..');
const ROOT = fs.existsSync(path.join(REPO, 'opp-engine.js')) ? REPO : path.join(REPO, 'web');
function loadOpp() {
  const ctx = { console, Math, JSON, Array, Object, Number, String, Infinity, NaN, isNaN, isFinite, parseFloat, Error };
  ctx.globalThis = ctx; vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'opp-engine.js'), 'utf8'), names = new Set();
  for (const m of src.matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  vm.runInContext(src + '\n;globalThis.__api = {' + [...names].map((n) => `${n}: ${n}`).join(', ') + '};', ctx, { filename: 'opp-engine.js' });
  return ctx.__api;
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) * Math.max(1, Math.abs(b));
module.exports = { ROOT, loadOpp, near };
