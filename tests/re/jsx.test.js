// Every in-browser Babel script of the real-estate pages must compile (catches a broken page before it ships).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT } = require('./helpers.js');

const ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'babel.js'), 'utf8'), ctx);
const pages = fs.readdirSync(ROOT).filter((f) => /^realestate.*\.html$/.test(f));

for (const page of pages) {
  test(`${page}: Babel scripts compile`, () => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const scripts = [...html.matchAll(/<script type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0, 'no Babel scripts found');
    for (const s of scripts) {
      const src = /src="([^"]+)"/.exec(s[1]);
      const code = src ? fs.readFileSync(path.join(ROOT, src[1]), 'utf8') : s[2];
      assert.doesNotThrow(() => ctx.Babel.transform(code, { presets: ['react'] }), `${src ? src[1] : 'inline script'} does not compile`);
    }
  });
}
