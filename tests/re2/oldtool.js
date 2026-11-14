// The previous version of the tool (re-engine.js) is deleted; its answers on the synthetic parity scenarios are frozen in
// fixtures/old-tool.json, so the new engine is still held to them: a scenario imported from the previous version (re2Import)
// must keep giving the previous version's numbers. Each answer is stored as a hash of its key (numbers rounded to 1e-4, so a
// last-digit difference between Node versions does not count) or, for the optimizer, as the small object itself.
// RECORD_OLD_TOOL=1 with the old engine present re-records them (only possible from a commit that still has re-engine.js).
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, 'fixtures', 'old-tool.json');
const RECORD = !!process.env.RECORD_OLD_TOOL;
const data = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const round = (k, v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);
const hash = (s) => crypto.createHash('sha1').update(JSON.stringify(JSON.parse(s), round)).digest('hex');
if (RECORD) process.on('exit', () => fs.writeFileSync(FILE, JSON.stringify(data, null, 1) + '\n'));
// [the new answer's hash, the previous version's]: from the old engine when it is there (oldKey), else the frozen one
function expectOld(id, newKey, oldKey) {
  if (oldKey) { const h = hash(oldKey()); if (RECORD) data[id] = h; return [hash(newKey), h]; }
  if (!(id in data)) throw new Error(`no frozen answer of the previous version for ${id}`);
  return [hash(newKey), data[id]];
}
// a small value of the previous version (the optimizer's answer): computed when the old engine is there, else the frozen one
function frozenOld(id, compute) {
  if (compute) { const v = compute(); if (RECORD) data[id] = v; return v; }
  if (!(id in data)) throw new Error(`no frozen answer of the previous version for ${id}`);
  return data[id];
}
module.exports = { expectOld, frozenOld };
