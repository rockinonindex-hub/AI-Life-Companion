/* Full-resolution runs collect committed events before the app's retention limit. */
'use strict';
const { L, start, root } = require('./helpers.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
function run(days, compressed, seed = 20261101) {
  const manager = new L.WorldStateManager(L.createWorld(start, seed)), sim = new L.Simulation(manager), events = [];
  const process = manager.process.bind(manager);
  manager.process = event => { const e = process(event); if (!['clock','diary'].includes(e.type)) events.push(e); return e; };
  const begin = performance.now();
  if (compressed) sim.advance(start + days * L.DAY - 1);
  else for (let day = 1; day <= days; day++) sim.advance(start + day * L.DAY - 1);
  const ms = performance.now() - begin, world = manager.state, inventory = L.createWorld(start, seed).inventory;
  const results = { success: 0, unusual: 0, failure: 0 }, stats = {}, ids = new Set();
  for (const e of events) {
    assert(!ids.has(e.id)); ids.add(e.id);
    if (e.effects.inventory) {
      assert.deepEqual(e.inventoryBefore, inventory);
      for (const [id, delta] of Object.entries(e.effects.inventory)) inventory[id] += delta;
      assert.deepEqual(e.inventoryAfter, inventory);
      assert(Object.values(inventory).every(n => Number.isInteger(n) && n >= 0));
    }
    if (e.type === 'cooking') {
      const consumed = {};
      for (const { id, quantity } of e.ingredientsUsed) consumed[id] = (consumed[id] || 0) - quantity;
      assert.deepEqual(e.effects.inventory, consumed);
      assert.equal(e.ingredientsUsed.reduce((n, i) => n + i.quantity, 0), L.recipes[e.recipeId].slots.reduce((n, s) => n + s.quantity, 0));
      results[e.result]++;
      stats[e.recipeId] = (stats[e.recipeId] || 0) + 1;
    }
  }
  assert.deepEqual(inventory, world.inventory); assert.deepEqual(results, world.outcomes);
  assert.equal(world.experience.cooking, Object.values(results).reduce((a,b) => a+b,0));
  assert.equal(world.eventLog.length + world.archivedEvents, events.length);
  for (const d of world.diary) {
    const selected = d.eventIds.map(id => events.find(e => e.id === id));
    assert(selected.every(Boolean)); assert.equal(d.text, selected.map(e => e.diaryText || e.text).join(' '));
  }
  assert(world.eventLog.length <= 1800 && world.diary.length <= 180);
  const report = { days, mode: compressed ? 'compressed' : 'full', seed, ms: Math.round(ms), events: events.length, retainedEvents: world.eventLog.length,
    cooking: world.experience.cooking, recipes: Object.keys(stats).length, results, substitutions: events.filter(e => e.substitutions?.length).length,
    shopping: events.filter(e => e.type === 'shopping').length, recipeCounts: stats };
  if (compressed) { assert(events.length <= 161); assert(ms < 5000); }
  else { assert(Object.keys(stats).length >= ({7:3,30:8,180:15})[days]); if (days === 180) assert(ms < 30000, `180 days: ${ms}ms`); }
  return { report, world, events };
}
if (require.main === module) {
  const reports = [];
  for (const days of [7,30,180]) for (const compressed of [false,true]) { const r = run(days, compressed), replay = run(days, compressed); assert.deepEqual(replay.world, r.world); assert.deepEqual(replay.events, r.events); r.report.reproducible = true; reports.push(r.report); console.log(JSON.stringify(r.report)); }
  fs.writeFileSync(path.join(root,'samples/simulation-report.json'), JSON.stringify({ timezone: process.env.TZ, node: process.version, reports }, null, 2) + '\n');
}
module.exports = { run };
