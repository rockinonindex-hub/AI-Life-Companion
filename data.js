/* Data and new-world factory. Classic scripts support file:// without a server. */
(function (root) {
  'use strict';
  const L = root.Life = root.Life || {};
  L.VERSION = 2;
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
  L.items = { ...L.ingredients, ...L.snacks };
  Object.entries(L.items).forEach(([id, item]) => { item.id = id; });
  L.validateCatalog = () => {
    const uses = {};
    if (Object.keys(L.ingredients).some(id => Object.hasOwn(L.snacks, id))) throw new Error('食材とおやつのIDが重複しています。');
    for (const [id, recipe] of Object.entries(L.recipes)) {
      if (!recipe.slots.length || !Number.isFinite(recipe.difficulty) || recipe.difficulty < 0 || recipe.difficulty > 1) throw new Error(`レシピ定義が不正です: ${id}`);
      for (const slot of recipe.slots) {
        if (!L.items[slot.id] || !slot.role || !Number.isInteger(slot.quantity) || slot.quantity < 1 || slot.quantity > 1000) throw new Error(`材料枠が不正です: ${id}`);
        for (const tags of Object.values(slot.requires || {})) if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string' || !tag)) throw new Error(`要求属性が不正です: ${id}`);
        uses[slot.id] = (uses[slot.id] || 0) + 1;
      }
    }
    for (const item of Object.values(L.items)) {
      for (const key of ['taste', 'texture', 'methods', 'substitutes']) if (!Array.isArray(item[key]) || !item[key].length) throw new Error(`食材属性が不正です: ${item.name}`);
    }
    return uses;
  };
  L.commonIngredients = () => Object.entries(L.validateCatalog()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  L.validateCatalog();
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
    schemaVersion: L.VERSION, catalogItems: Object.keys(L.items), catalogRecipes: Object.keys(L.recipes),
    character: {
      name: 'フミ', interests: { cooking: 0.5, reading: 0.6, music: 0.4, gardening: 0.2 },
      personality: { curiosity: 0.7, adventurousness: 0.5 },
      currentActivity: 'reading', currentDetail: '部屋で本を開いたところ。'
    },
    inventory: Object.fromEntries(Object.keys(L.items).map(id => [id, ({ pork: 2, onion: 3, kouignAmann: 1 })[id] || 0])),
    knownRecipes: Object.keys(L.recipes),
    experience: { cooking: 0 }, outcomes: { success: 0, unusual: 0, failure: 0 },
    menuPreference: { inventory: 0.7, desire: 0.3 }, substitutionMemory: {}, pendingMeal: null, shoppingQuantities: {}, recentMeals: [],
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

