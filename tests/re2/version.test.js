// The page asks for its engine files with a version tag (?v=…) taken from their contents, so a browser never pairs a new
// page with an old engine from its cache. After changing engine.js, re2-engine.js or re2-ui.js, update the tag in
// realestate-v2.html to the value this test prints.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { ROOT } = require('./helpers');

test('realestate-v2.html loads the engine files it was released with (version tag)', () => {
  const h = crypto.createHash('sha1');
  for (const f of ['engine.js', 're2-engine.js', 're2-ui.js']) h.update(fs.readFileSync(path.join(ROOT, f)));
  const v = h.digest('hex').slice(0, 10), html = fs.readFileSync(path.join(ROOT, 'realestate-v2.html'), 'utf8');
  for (const f of ['engine.js', 're2-engine.js', 're2-ui.js']) assert.ok(html.includes(`<script src="${f}?v=${v}"></script>`), `realestate-v2.html should load ${f}?v=${v}`);
});
