/* Data and new-world factory. Classic scripts support file:// without a server. */
(function (root) {
  'use strict';
  const L = root.Life = root.Life || {};
  L.VERSION = 1;
  L.STORAGE_KEY = 'ai-life-companion.v1';
  L.LIMITS = { logs: 1800, diaries: 180, actions: 160 };
  L.STEP = 90 * 60 * 1000;
  L.DAY = 24 * 60 * 60 * 1000;
  L.clone = value => JSON.parse(JSON.stringify(value));
  L.clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  L.dayKey = value => {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  L.items = {
    pork: { name: '豚肉', type: 'protein', taste: ['savory'], substitutes: ['protein'], emoji: '🥩' },
    chicken: { name: '鶏肉', type: 'protein', taste: ['savory'], substitutes: ['protein'], emoji: '🍗' },
    onion: { name: '玉ねぎ', type: 'vegetable', taste: ['sweet'], substitutes: ['vegetable'], emoji: '🧅' },
    carrot: { name: 'にんじん', type: 'vegetable', taste: ['sweet'], substitutes: ['vegetable'], emoji: '🥕' },
    pineapple: { name: 'パイナップル', type: 'fruit', taste: ['sweet', 'sour'], substitutes: ['fruit', 'sweetness', 'acidity'], emoji: '🍍' },
    apple: { name: 'りんご', type: 'fruit', taste: ['sweet', 'sour'], substitutes: ['fruit', 'sweetness', 'acidity'], emoji: '🍎' },
    lemon: { name: 'レモン', type: 'fruit', taste: ['sour'], substitutes: ['fruit', 'acidity'], emoji: '🍋' },
    kouignAmann: { name: 'クイニーアマン', type: 'snack', taste: ['sweet', 'buttery'], substitutes: ['sweetness', 'starch'], emoji: '🥮' },
    cookie: { name: 'クッキー', type: 'snack', taste: ['sweet'], substitutes: ['sweetness', 'starch'], emoji: '🍪' },
    chocolate: { name: 'チョコレート', type: 'snack', taste: ['sweet', 'bitter'], substitutes: ['sweetness'], emoji: '🍫' }
  };
  Object.entries(L.items).forEach(([id, item]) => { item.id = id; });
  L.recipes = {
    sweet_sour_pork: { name: '酢豚', slots: [
      { id: 'pork', role: 'protein', quantity: 1 }, { id: 'onion', role: 'vegetable', quantity: 1 },
      { id: 'pineapple', role: 'fruit', quantity: 1 }
    ], result: '甘酸っぱい酢豚', difficulty: 0.24 },
    pork_saute: { name: 'ポークソテー', slots: [
      { id: 'pork', role: 'protein', quantity: 1 }, { id: 'onion', role: 'vegetable', quantity: 1 }
    ], result: '香ばしいソテー', difficulty: 0.14 },
    fruit_compote: { name: 'フルーツコンポート', slots: [
      { id: 'apple', role: 'fruit', quantity: 1 }, { id: 'lemon', role: 'acidity', quantity: 1 }
    ], result: '果物のコンポート', difficulty: 0.17 }
  };
  L.topics = { cooking: '料理研究', reading: '読書', music: '音楽', gardening: '植物' };
  L.activities = {
    reading: { name: '本を読んでいる', place: 'desk', emoji: '📖' },
    cooking: { name: '料理をしている', place: 'kitchen', emoji: '🍳' },
    snack: { name: 'おやつの時間', place: 'shelf', emoji: '🍪' },
    hobby: { name: '好きなことを楽しんでいる', place: 'sofa', emoji: '🎵' },
    shopping: { name: '食材を買いにお出かけ', place: 'door', emoji: '🛍️' },
    rest: { name: 'ひと休みしている', place: 'sofa', emoji: '☕' },
    sleeping: { name: 'すやすや眠っている', place: 'sofa', emoji: '💤' }
  };
  L.createWorld = (at = Date.now(), seed = 20261101) => ({
    schemaVersion: L.VERSION,
    character: {
      name: 'フミ', interests: { cooking: 0.5, reading: 0.6, music: 0.4, gardening: 0.2 },
      personality: { curiosity: 0.7, adventurousness: 0.5 },
      currentActivity: 'reading', currentDetail: '部屋で本を開いたところ。'
    },
    inventory: Object.fromEntries(Object.keys(L.items).map(id => [id, ({ pork: 2, onion: 3, kouignAmann: 1 })[id] || 0])),
    knownRecipes: ['sweet_sour_pork', 'pork_saute'],
    experience: { cooking: 0 }, outcomes: { success: 0, failure: 0 },
    recipeStats: {}, recentActions: [], pendingShopping: [], reservedSnacks: [],
    eventLog: [], diary: [], lastSimulatedAt: null, lastActionAt: null, nextActionAt: at,
    createdAt: at, rngState: (seed >>> 0) || 1, nextEventId: 1,
    coverage: [], archivedEvents: 0, interactionCount: 0
  });
  // Local, serializable PRNG. A transaction commits its resulting seed with the event.
  L.random = seed => {
    let state = seed >>> 0;
    const next = () => {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      state >>>= 0;
      return state / 4294967296;
    };
    next.state = () => state;
    return next;
  };
  L.pick = (choices, rng) => {
    const total = choices.reduce((n, c) => n + c.weight, 0);
    let cursor = rng() * total;
    for (const choice of choices) { cursor -= choice.weight; if (cursor < 0) return choice; }
    return choices[choices.length - 1];
  };
})(globalThis);
