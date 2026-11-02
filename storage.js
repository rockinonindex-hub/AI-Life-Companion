/* Storage boundary: codec/migration have no browser dependency. */
(function (root) {
  'use strict';
  const L = root.Life;
  const legacyItems = ['pork','chicken','onion','carrot','pineapple','apple','lemon','kouignAmann','cookie','chocolate'];
  L.StateCodec = {
    migrate(input) {
      const world = L.clone(input);
      if (world?.schemaVersion === 1) {
        // Validate required old inventory before adding new catalogue entries.
        for (const id of legacyItems) if (!Number.isInteger(world.inventory?.[id]) || world.inventory[id] < 0) throw new Error('旧在庫が不正です。');
        if (!Array.isArray(world.knownRecipes) || !world.knownRecipes.length || world.knownRecipes.some(id => !L.recipes[id])) throw new Error('旧レシピが不正です。');
        world.schemaVersion = L.VERSION;
        world.catalogItems = Object.keys(L.items); world.catalogRecipes = Object.keys(L.recipes);
        for (const id of Object.keys(L.items)) if (!(id in world.inventory)) world.inventory[id] = 0;
        world.knownRecipes = [...new Set([...world.knownRecipes, ...Object.keys(L.recipes)])];
        world.outcomes.unusual = 0;
        for (const stat of Object.values(world.recipeStats)) stat.unusual = 0;
        world.menuPreference = { inventory: .7, desire: .3 };
        world.substitutionMemory = {}; world.pendingMeal = null; world.recentMeals = [];
        world.shoppingQuantities = Object.fromEntries(world.pendingShopping.map(id => [id, 1]));
      }
      if (world?.schemaVersion === L.VERSION && Array.isArray(world.catalogItems) && Array.isArray(world.catalogRecipes)) {
        // A new definition is distinguishable from a missing/corrupt saved quantity.
        for (const id of Object.keys(L.items)) if (!world.catalogItems.includes(id)) {
          world.inventory[id] = 0; world.catalogItems.push(id);
        }
        for (const id of Object.keys(L.recipes)) if (!world.catalogRecipes.includes(id)) {
          world.knownRecipes.push(id); world.catalogRecipes.push(id);
        }
      }
      L.validateWorld(world); return world;
    },
    decode(raw) { return this.migrate(JSON.parse(raw)); },
    encode(world) { L.validateWorld(world); return JSON.stringify(world); }
  };
  L.Storage = {
    load(storage) {
      const raw = storage.getItem(L.STORAGE_KEY);
      return raw === null ? null : L.StateCodec.decode(raw);
    },
    save(storage, world) {
      const encoded = L.StateCodec.encode(world), raw = storage.getItem(L.STORAGE_KEY);
      if (raw !== null) {
        // Never replace unreadable data; callers must explicitly reset first.
        const previous = JSON.parse(raw);
        L.StateCodec.migrate(previous);
        if (previous.schemaVersion === 1) {
          const key = L.STORAGE_KEY + '.backup-v1';
          if (storage.getItem(key) === null) storage.setItem(key, raw);
        }
      }
      storage.setItem(L.STORAGE_KEY, encoded);
    },
    reset(storage, world) {
      const encoded = L.StateCodec.encode(world), raw = storage.getItem(L.STORAGE_KEY);
      if (raw !== null) storage.setItem(L.STORAGE_KEY + '.backup-reset', raw);
      storage.setItem(L.STORAGE_KEY, encoded);
    }
  };
})(globalThis);
