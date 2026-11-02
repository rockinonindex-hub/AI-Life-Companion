(function () {
  'use strict';
  const L = window.Life, $ = id => document.getElementById(id);
  let manager, simulation, storage, saveAllowed = true, warning = '';
  try {
    storage = window.localStorage;
    const world = L.Storage.load(storage);
    manager = new L.WorldStateManager(world || L.createWorld());
  } catch (error) {
    saveAllowed = false;
    warning = '保存データを読み込めませんでした。元のデータは上書きせず、今回は一時的な部屋を開いています。開発モードの「状態JSONを保存」で現在の状態を書き出せます。永続保存を再開するには、元のデータを確認してから初期化してください。';
    manager = new L.WorldStateManager(L.createWorld());
  }
  simulation = new L.Simulation(manager);
  const now = () => Math.max(Date.now(), manager.state.lastSimulatedAt ?? 0);
  function save() {
    if (!saveAllowed) return;
    try { L.Storage.save(storage, manager.state); $('save-status').textContent = '✓ 保存済み'; }
    catch (error) {
      warning = 'このブラウザーでは保存できませんでした。開発モードから状態JSONを書き出して保管できます。';
      $('save-status').textContent = '保存できません';
    }
  }
  function notify(text) {
    $('notice').textContent = text; $('notice').hidden = !text;
  }
  function renderDiary(world) {
    const entries = $('diary-entries'); entries.replaceChildren();
    if (!world.diary.length) { const p = document.createElement('p'); p.textContent = 'まだ日記に残せる出来事がありません。'; entries.append(p); }
    for (const diary of [...world.diary].reverse()) {
      const article = document.createElement('article'); article.className = 'diary-entry';
      const h = document.createElement('h3'); h.textContent = diary.day;
      const p = document.createElement('p'); p.textContent = diary.text;
      const small = document.createElement('small'); small.textContent = `${diary.partial ? '代表記録を含む日 · ' : ''}参照：${diary.eventIds.join(' / ')}`;
      article.append(h, p, small); entries.append(article);
    }
  }
  function renderDebug(world) {
    if ($('debug').hidden) return;
    $('world-state').textContent = JSON.stringify(world, null, 2);
    $('event-log').textContent = JSON.stringify([...world.eventLog].reverse().slice(0, 100), null, 2);
    const weights = $('weights'); weights.replaceChildren();
    for (const choice of L.ActionSelector.weights(world, world.nextActionAt)) {
      const tr = document.createElement('tr');
      for (const value of [L.activities[choice.id].name, choice.weight.toFixed(3), `× ${choice.recentMultiplier.toFixed(3)}`, choice.reason]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      weights.append(tr);
    }
    if (document.activeElement !== $('name-input')) $('name-input').value = world.character.name;
  }
  function render() {
    const world = manager.state, activity = L.activities[world.character.currentActivity], time = new Date(world.lastSimulatedAt ?? Date.now());
    const name = world.character.name;
    $('title').textContent = `${name === 'フミ' ? 'ふみ' : name}の暮らし`;
    $('room-title').textContent = `${name}の部屋`; $('character-name').textContent = name;
    $('gift-description').textContent = `あとは${name}におまかせ。`;
    document.title = `${name === 'フミ' ? 'ふみ' : name}の暮らし | AI Life Companion`;
    $('chat-heading').textContent = `${name}とおしゃべり`;
    $('room').setAttribute('aria-label', `小さな部屋。${name}は${activity.name}。`);
    $('activity-badge').textContent = `${activity.emoji} ${activity.name}`;
    $('activity-icon').textContent = activity.emoji; $('current-detail').textContent = world.character.currentDetail;
    $('character').className = `character at-${activity.place}`; $('thought').textContent = activity.emoji;
    $('date-label').textContent = time.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
    $('clock-label').textContent = time.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
    $('clock-mode').textContent = time.getTime() > Date.now() + 60000 ? '検証用の生活時計' : '部屋の時計';
    $('sky').classList.toggle('night', time.getHours() < 7 || time.getHours() >= 19);
    document.querySelector('.sun').textContent = time.getHours() < 7 || time.getHours() >= 19 ? '☾' : '☀';
    $('shelf-snacks').textContent = Object.keys(L.items).filter(id => L.items[id].type === 'snack' && world.inventory[id] > 0).map(id => L.items[id].emoji).join('') || '· · ·';
    $('diary-preview').textContent = world.diary.slice(-1)[0]?.text || '印象に残ったことを、少しずつ。';
    if (!saveAllowed) $('save-status').textContent = '一時的な部屋';
    notify(warning); renderDebug(world);
    if ($('diary-dialog').open) renderDiary(world);
  }
  function run(fn) {
    try { fn(); save(); render(); }
    catch (error) { notify(error.message); }
  }
  function addMessage(text, type) {
    const div = document.createElement('div'); div.className = `message ${type}`;
    if (type === 'companion') { const icon = document.createElement('span'); icon.textContent = '✿'; div.append(icon); }
    const p = document.createElement('p'); p.textContent = text; div.append(p); $('chat-log').append(div);
    while ($('chat-log').children.length > 40) $('chat-log').firstElementChild.remove();
    $('chat-log').scrollTop = $('chat-log').scrollHeight;
  }
  function ask(question) {
    const q = question.trim(); if (!q) return;
    run(() => {
      simulation.advance(now()); addMessage(q, 'user');
      addMessage(L.respond(q, manager.state), 'companion'); $('chat-input').value = '';
    });
  }
  $('chat-form').addEventListener('submit', event => { event.preventDefault(); ask($('chat-input').value); });
  document.querySelectorAll('.quick-questions button').forEach(button => button.addEventListener('click', () => ask(button.textContent)));
  $('give-snack').addEventListener('click', () => run(() => {
    simulation.gift($('snack-choice').value, now());
    const reply = manager.state.eventLog.slice(-1)[0].text;
    $('gift-reply').textContent = reply;
    addMessage(reply, 'companion');
  }));
  $('open-diary').addEventListener('click', () => { renderDiary(manager.state); $('diary-dialog').showModal(); });
  $('close-diary').addEventListener('click', () => $('diary-dialog').close());
  $('diary-dialog').addEventListener('click', e => { if (e.target === $('diary-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
  $('debug-toggle').addEventListener('click', () => { $('debug').hidden = !$('debug').hidden; $('debug-toggle').setAttribute('aria-expanded', String(!$('debug').hidden)); renderDebug(manager.state); if (!$('debug').hidden) $('debug').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  function forward(days) {
    run(() => {
      const begin = performance.now(), result = simulation.advance(now() + days * L.DAY);
      $('debug-result').textContent = `${days}日進めました：${result.actions}件の生活行動 / ${(performance.now() - begin).toFixed(0)}ms${result.compressed ? ' / 古い期間は代表記録に圧縮' : ''}`;
    });
  }
  $('advance-day').addEventListener('click', () => forward(1)); $('advance-week').addEventListener('click', () => forward(7));
  $('name-form').addEventListener('submit', event => { event.preventDefault(); run(() => simulation.rename($('name-input').value, now())); });
  $('reset-world').addEventListener('click', () => {
    if (!window.confirm('生活の記録と日記を初期化します。必要なら先に状態JSONを保存してください。')) return;
    manager = new L.WorldStateManager(L.createWorld()); simulation = new L.Simulation(manager);
    saveAllowed = true; warning = ''; $('gift-reply').textContent = ''; $('chat-log').replaceChildren();
    $('debug-result').textContent = '初期状態に戻しました。';
    run(() => { storage = window.localStorage; simulation.advance(now()); });
  });
  $('export-state').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(manager.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `life-state-${L.dayKey(now())}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  // Multiple tabs can otherwise overwrite each other's local world.
  let otherTab = false;
  window.addEventListener('storage', event => {
    if (event.key !== L.STORAGE_KEY) return;
    otherTab = true; saveAllowed = false;
    warning = '別のタブで生活データが変更されました。このタブの操作は停止しました。再読み込みすると最新の部屋を開きます。';
    document.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
    render();
  });
  const tick = () => { if (!otherTab) run(() => simulation.advance(now())); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  window.addEventListener('pagehide', () => { if (!otherTab) save(); });
  run(() => {
    const result = simulation.advance(now());
    if (result.compressed && !warning) warning = 'おかえりなさい。離れていた期間は代表的な出来事を記録し、直近3日間は通常の刻みで暮らしを進めました。';
  });
  setInterval(tick, 30000);
})();
