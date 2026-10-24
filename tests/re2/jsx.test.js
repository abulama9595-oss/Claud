// Every in-browser Babel script of the real-estate pages must compile (catches a broken page before it ships).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT } = require('./helpers.js');

const ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'babel.js'), 'utf8'), ctx);
const pages = fs.readdirSync(ROOT).filter((f) => /^realestate-v2\.html$/.test(f));

for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const scripts = [...html.matchAll(/<script type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g)];
  // a page without an app (the old preview address) may only send you on to the tool
  if (!scripts.length) { test(`${page}: sends you to realestate.html`, () => assert.match(html, /location\.replace\("realestate\.html"/)); continue; }
  test(`${page}: Babel scripts compile`, () => {
    for (const s of scripts) {
      const src = /src="([^"]+)"/.exec(s[1]);
      const code = src ? fs.readFileSync(path.join(ROOT, src[1]), 'utf8') : s[2];
      assert.doesNotThrow(() => ctx.Babel.transform(code, { presets: ['react'] }), `${src ? src[1] : 'inline script'} does not compile`);
    }
  });
}
