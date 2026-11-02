/* Node.js is needed only for development tests, never to run the app. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
for (const file of ['presets/recipes.js', 'presets/ingredients.js', 'presets/snacks.js', 'data.js', 'cooking.js', 'events.js', 'simulation.js', 'storage.js']) vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
const L = globalThis.Life;
const start = new Date('2026-11-01T00:00:00+09:00').getTime();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function create(seed = 20261101, edit) {
  const world = L.createWorld(start, seed); if (edit) edit(world);
  const manager = new L.WorldStateManager(world); return { manager, sim: new L.Simulation(manager) };
}
function sevenDays(seed = 20261101) {
  const c = create(seed);
  // Daily checkpoints intentionally use the full-resolution path.
  for (let day = 1; day <= 7; day++) c.sim.advance(start + day * L.DAY - 1);
  return c.manager.state;
}
function auditInventory(world) {
  let inventory = L.createWorld(start).inventory;
  for (const event of world.eventLog) {
    if (!event.effects.inventory) continue;
    assert.deepEqual(event.inventoryBefore, inventory, `before ${event.id}`);
    const delta = { ...event.effects.inventory };
    for (const [id, quantity] of Object.entries(delta)) inventory[id] += quantity;
    assert.deepEqual(event.inventoryAfter, inventory, `after ${event.id}`);
    for (const n of Object.values(inventory)) assert(n >= 0 && Number.isInteger(n));
    if (event.type === 'cooking') {
      const usage = {};
      for (const item of event.ingredientsUsed) usage[item.id] = (usage[item.id] || 0) - item.quantity;
      assert.deepEqual(usage, delta, `consumption ${event.id}`);
      assert.equal(event.ingredientsUsed.reduce((n, item) => n + item.quantity, 0), L.recipes[event.recipeId].slots.reduce((n, slot) => n + slot.quantity, 0));
    }
  }
  assert.deepEqual(world.inventory, inventory);
}
const sample = sevenDays();
test('食材不足 → 買い物 → 調理可能', () => {
  const c = create(7, world => { for (const id of Object.keys(world.inventory)) world.inventory[id] = 0; });
  const weights = L.ActionSelector.weights(c.manager.state, start + 10 * 3600000);
  assert(weights.find(w => w.id === 'shopping').weight > weights.find(w => w.id === 'reading').weight);
  c.sim.advance(start + 2 * L.DAY);
  assert(c.manager.state.eventLog.some(e => e.type === 'shopping' && Object.keys(e.itemsBought).length));
  assert(c.manager.state.eventLog.some(e => e.type === 'cooking'));
});
test('7日分の在庫・食材消費を全イベントから再計算', () => { auditInventory(sample); assert(sample.eventLog.some(e => e.type === 'cooking')); });
test('失敗した料理も食材を消費し、経験に反映', () => {
  const c = create(7, w => {
    w.knownRecipes = ['pork_saute']; w.pendingMeal = 'pork_saute';
    for (const id of Object.keys(w.inventory)) w.inventory[id] = 0;
    w.inventory.cookie = 1; w.inventory.tofu = 1;
  });
  // Role-mismatched low-compatibility substitutes, choose substitution explicitly.
  const rolls = [.9, 0];
  const e = L.EventResolver.resolve(c.manager.state, { id: 'cooking' }, start, () => rolls.shift() ?? 0);
  assert.equal(e.result, 'failure'); assert(Object.values(e.effects.inventory).every(v => v < 0));
  c.manager.process(e);
  assert.equal(c.manager.state.outcomes.failure, 1);
  assert.equal(c.manager.state.experience.cooking, 1);
  assert.equal(c.manager.state.inventory.cookie, 0);
});
test('不足する同じ食材を複数スロットで二重使用しない', () => {
  const previous = L.recipes.pork_saute.slots;
  try {
    L.recipes.pork_saute.slots = [{ id: 'pork', role: 'protein', quantity: 1 }, { id: 'pork', role: 'protein', quantity: 1 }];
    const world = L.createWorld(start); world.inventory.pork = 1;
    assert.equal(L.planRecipe(world, 'pork_saute').missing.length, 1);
  } finally { L.recipes.pork_saute.slots = previous; }
});
test('負の在庫を作る処理はログも含め全体をロールバック', () => {
  const c = create(), before = c.manager.state;
  assert.throws(() => c.manager.process(L.makeEvent(start, 'test', 'invalid', '不正な調理', 1, { inventory: { pork: -3 } })));
  assert.deepEqual(c.manager.state, before);
});
test('固定シードは再現可能・別シードでは行動列が変わる', () => {
  assert.deepEqual(sevenDays(), sample);
  assert.notDeepEqual(sevenDays(123).eventLog.map(e => e.action), sample.eventLog.map(e => e.action));
  assert(new Set(sample.eventLog.map(e => e.type)).size >= 5);
});
test('読書イベントが興味を更新し、その後の重みを変える', () => {
  const c = create(), before = c.manager.state;
  const rng = L.random(before.rngState);
  const e = L.EventResolver.resolve(before, { id: 'reading' }, start, rng);
  c.manager.process(e); const after = c.manager.state;
  assert(after.character.interests[e.topic] > before.character.interests[e.topic]);
  assert.notDeepEqual(L.ActionSelector.weights(before, start + 12 * 3600000), L.ActionSelector.weights(after, start + 12 * 3600000));
});
test('直近の繰り返し抑制、料理の成功失敗が選択に影響', () => {
  const w = L.createWorld(start), at = start + 12 * 3600000;
  const weight = (world, id) => L.ActionSelector.weights(world, at).find(c => c.id === id).weight;
  const baseReading = weight(w, 'reading'), baseCooking = weight(w, 'cooking');
  w.recentActions = [{ action: 'reading' }]; assert(weight(w, 'reading') < baseReading);
  w.outcomes.success = 4; assert(weight(w, 'cooking') > baseCooking);
  w.outcomes.success = 0; w.outcomes.failure = 4; assert(weight(w, 'cooking') < baseCooking);
});
test('代用は属性から探索・普通の代用と異種の代用を区別', () => {
  const w = L.createWorld(start);
  assert.equal(L.planRecipe(w, 'sweet_sour_pork', false).missing[0], 'pineapple');
  const adventurous = L.planRecipe(w, 'sweet_sour_pork', true);
  assert.equal(adventurous.substitutions[0].replacement, 'onion'); assert(adventurous.unusual);
  w.inventory.apple = 1;
  assert.equal(L.planRecipe(w, 'sweet_sour_pork', true).substitutions[0].replacement, 'apple');
  w.inventory.pork = 0; w.inventory.chicken = 1;
  assert.equal(L.planRecipe(w, 'pork_saute').substitutions[0].replacement, 'chicken');
});
test('日記は最大3件、全て実ログを参照し、その文章から生成', () => {
  assert(sample.diary.length >= 7);
  for (const diary of sample.diary) {
    assert(diary.eventIds.length >= 1 && diary.eventIds.length <= 3);
    const events = diary.eventIds.map(id => sample.eventLog.find(e => e.id === id));
    assert(events.every(Boolean));
    assert(events.every(e => L.dayKey(e.timestamp) === diary.day));
    assert.equal(diary.text, events.map(e => e.diaryText || e.text).join(' '));
  }
});
test('会話は今日・昨日・食事・興味・日記の実記録を使う', () => {
  for (const q of ['今日何してた？', '昨日何してた？', '何食べた？', '最近何に興味がある？', '日記を見せて']) {
    const text = L.respond(q, sample);
    assert(sample.eventLog.some(e => text.includes(e.text)), q);
  }
  assert.match(L.respond('昨日何してた？', L.createWorld(start), start), /記録は残っていない/);
  assert.match(L.respond('何食べた？', L.createWorld(start), start), /まだない/);
});
test('localStorage往復と再起動後の追いつきが連続実行と一致', () => {
  const map = new Map(), store = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const a = create(); a.sim.advance(start + L.DAY);
  L.Storage.save(store, a.manager.state);
  const b = new L.WorldStateManager(L.Storage.load(store));
  a.sim.advance(start + 2 * L.DAY); new L.Simulation(b).advance(start + 2 * L.DAY);
  assert.deepEqual(a.manager.state, b.state);
});
test('壊れた保存データを拒否・例外時に元の保存を保持', () => {
  const raw = '{broken', store = { getItem: () => raw, setItem: () => assert.fail('must not overwrite') };
  assert.throws(() => L.Storage.load(store));
  const world = L.createWorld(start); world.rngState = 0;
  assert.throws(() => new L.WorldStateManager(world));
});
test('時計確認の頻度によって生活行動や興味の減衰が変わらない', () => {
  const a = create(), b = create();
  a.sim.advance(start + 2 * L.DAY);
  for (let at = start; at <= start + 2 * L.DAY; at += 30 * 60000) b.sim.advance(at);
  const wa = a.manager.state, wb = b.manager.state;
  assert.deepEqual(wa.character, wb.character);
  assert.deepEqual(wa.inventory, wb.inventory);
  assert.equal(wa.rngState, wb.rngState);
  assert.deepEqual(wa.eventLog.map(e => [e.timestamp, e.action]), wb.eventLog.map(e => [e.timestamp, e.action]));
});
test('おやつは3種類の扱い・付与と消費が保存と一致', () => {
  const dispositions = new Set();
  for (let seed = 1; seed < 400 && dispositions.size < 3; seed++) {
    const w = L.createWorld(start, seed * 111111);
    const event = L.EventResolver.gift(w, 'cookie', start);
    dispositions.add(event.disposition);
    const manager = new L.WorldStateManager(w); manager.process(event);
    assert.equal(manager.state.inventory.cookie, event.disposition === 'eat' ? 0 : 1);
    if (event.disposition === 'reserve') assert(manager.state.reservedSnacks.includes('cookie'));
    assert.equal(manager.state.experience.cooking, 0);
  }
  assert.equal(dispositions.size, 3);
});
test('興味は休息・時間経過で基準へ戻り、単調増加しない', () => {
  const c = create(20261101, w => { w.character.interests.cooking = 0.9; });
  c.sim.advance(start); // Seed chooses rest at midnight.
  const before = c.manager.state.character.interests.cooking;
  c.sim.advance(start + 3 * 3600000);
  assert(c.manager.state.character.interests.cooking < before);
});
test('7日一括の圧縮経路も在庫整合・既存日記も代表記録と表示', () => {
  const c = create(); c.sim.advance(start + 21 * 3600000);
  c.sim.advance(start + 7 * L.DAY);
  auditInventory(c.manager.state);
  const w = c.manager.state;
  for (const diary of w.diary) {
    if (w.coverage.some(cov => diary.day >= L.dayKey(cov.from) && diary.day <= L.dayKey(cov.to))) assert(diary.partial);
  }
});
test('長期不在100年も上限内・圧縮日記を明示・時計逆行を無視', () => {
  const c = create(), begin = performance.now();
  const target = start + 36525 * L.DAY;
  const result = c.sim.advance(target), elapsed = performance.now() - begin;
  assert(result.compressed && result.actions <= L.LIMITS.actions);
  assert(elapsed < 5000, `${elapsed}ms`);
  assert.equal(c.manager.state.lastSimulatedAt, target);
  assert(c.manager.state.eventLog.some(e => e.type === 'summary'));
  for (const diary of c.manager.state.diary) {
    if (c.manager.state.coverage.some(cov => diary.day >= L.dayKey(cov.from) && diary.day <= L.dayKey(cov.to))) assert(diary.partial);
  }
  const before = c.manager.state;
  assert(c.sim.advance(start).clockSkew); assert.deepEqual(c.manager.state, before);
  console.log(`  100年の追いつき: ${result.actions}行動 / ${elapsed.toFixed(1)}ms`);
});
test('長時間の連続利用でもログと日記のサイズ上限を維持', () => {
  const c = create();
  // Test retention directly with real reducer events (avoids simulating 1800 actions).
  for (let i = 0; i < L.LIMITS.logs + 5; i++) c.manager.process(L.makeEvent(start + i, 'rest', 'retention_test', '休憩した。', 0.1));
  assert.equal(c.manager.state.eventLog.length, L.LIMITS.logs);
  assert.equal(c.manager.state.archivedEvents, 5);
});
// Real, reproducible deliverables; no hand-written example events.
fs.mkdirSync(path.join(root, 'samples'), { recursive: true });
fs.writeFileSync(path.join(root, 'samples', 'seven-days.json'), JSON.stringify(sample, null, 2) + '\n');
const formatTime = e => new Date(e.timestamp).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
const lines = ['# 7日間の生活シミュレーション（実行結果）', '', '固定シード：20261101 / 2026-11-01〜2026-11-07 / Asia/Tokyo。1日ごとに進めた通常精度の記録（90分刻み）。', '', `生活イベント：${sample.eventLog.length}件 / 料理：${sample.experience.cooking}回 / 成功：${sample.outcomes.success}回 / 変わった料理：${sample.outcomes.unusual}回 / 失敗：${sample.outcomes.failure}回`, '', '## 日記', ''];
for (const d of sample.diary) lines.push(`### ${d.day}`, '', d.text, '', `参照：${d.eventIds.join(', ')}`, '');
lines.push('## 全生活ログ', '', '| 日時（日本時間） | ID | 行動 | 出来事 |', '| --- | --- | --- | --- |');
for (const e of sample.eventLog) lines.push(`| ${L.dayKey(e.timestamp)} ${formatTime(e)} | ${e.id} | ${e.action} | ${e.text} |`);
lines.push('', '## 最終在庫', '', '| 食材 | 数量 |', '| --- | --- |');
for (const [id, quantity] of Object.entries(sample.inventory)) lines.push(`| ${L.items[id].name} | ${quantity} |`);
lines.push('', '## 興味の変化', '', '| 興味 | 初期値 | 7日後 |', '| --- | --- | --- |');
for (const [id, value] of Object.entries(sample.character.interests)) lines.push(`| ${L.topics[id]} | ${L.createWorld(start).character.interests[id].toFixed(3)} | ${value.toFixed(3)} |`);
fs.writeFileSync(path.join(root, 'samples', 'seven-days.md'), lines.join('\n') + '\n');
console.log(`\n${passed} tests passed. Samples written to samples/.`);

