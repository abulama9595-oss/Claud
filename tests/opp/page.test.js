// opportunity.html: its Babel script compiles, and it loads the engine it was released with (version tag).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { ROOT } = require('./helpers.js');
const html = fs.readFileSync(path.join(ROOT, 'opportunity.html'), 'utf8');

test('opportunity.html: the Babel script compiles', () => {
  const ctx = { console }; ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'vendor', 'babel.js'), 'utf8'), ctx);
  const scripts = [...html.matchAll(/<script type="text\/babel"([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length >= 1);
  for (const s of scripts) assert.doesNotThrow(() => ctx.Babel.transform(s[2], { presets: ['react'] }));
});

// After changing opp-engine.js, set the tag on its script tag to the first 10 hex of sha1(opp-engine.js) — this prints it.
test('opportunity.html loads the engine it was released with (version tag)', () => {
  const v = crypto.createHash('sha1').update(fs.readFileSync(path.join(ROOT, 'opp-engine.js'))).digest('hex').slice(0, 10);
  console.log(`opp-engine version tag: ${v}`);
  assert.match(html, new RegExp(`opp-engine\\.js\\?v=${v}"`));
  assert.ok(!/cdn|unpkg|jsdelivr/i.test(html), 'self-hosted libraries only');
});

test('the landing page links the tool', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), /href="opportunity\.html"/);
});
