(function (root) {
  'use strict';
  const L = root.Life;
  const foodName = id => L.items[id].name;
  L.foodName = foodName;
  // Plan with a private inventory copy: each slot reserves quantity immediately.
  // Cross-category replacements are derived from shared attributes, never a fixed gag.
  L.planRecipe = (world, recipeId, adventurous = false) => {
    const recipe = L.recipes[recipeId], available = { ...world.inventory };
    const used = [], substitutions = [], missing = [];
    for (const slot of recipe.slots) {
      let id = slot.id, unusual = false;
      if (available[id] < slot.quantity) {
        const original = L.items[slot.id];
        const candidates = Object.entries(L.items).filter(([key, item]) => {
          if (key === slot.id || available[key] < slot.quantity) return false;
          const sameRole = item.substitutes.includes(slot.role);
          const shared = original.substitutes.filter(tag => item.substitutes.includes(tag)).length;
          return sameRole || (adventurous && shared > 0);
        }).map(([key, item]) => ({ id: key, score:
          (item.substitutes.includes(slot.role) ? 10 : 0) +
          original.substitutes.filter(tag => item.substitutes.includes(tag)).length +
          original.taste.filter(tag => item.taste.includes(tag)).length
        })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        if (!candidates.length) { missing.push(slot.id); continue; }
        id = candidates[0].id;
        unusual = !L.items[id].substitutes.includes(slot.role);
        substitutions.push({ original: slot.id, replacement: id, quantity: slot.quantity, unusual });
      }
      available[id] -= slot.quantity;
      used.push({ id, quantity: slot.quantity });
    }
    return { recipeId, used, substitutions, missing, unusual: substitutions.some(s => s.unusual) };
  };
  L.MemoryLogger = {
    append(world, event) {
      world.eventLog.push(event);
      if (world.eventLog.length > L.LIMITS.logs) {
        world.archivedEvents += world.eventLog.length - L.LIMITS.logs;
        world.eventLog.splice(0, world.eventLog.length - L.LIMITS.logs);
      }
    },
    diary(world, day) {
      const events = world.eventLog.filter(e => L.dayKey(e.timestamp) === day && e.importance >= 0.35 && e.type !== 'diary');
      const ranked = [...events].sort((a, b) => b.importance - a.importance || b.timestamp.localeCompare(a.timestamp));
      const chosen = [], types = new Set();
      for (const event of ranked) {
        const category = event.type === 'cooking' ? event.action : event.type;
        if (!types.has(category)) { chosen.push(event); types.add(category); }
        if (chosen.length === 3) break;
      }
      if (!chosen.length) return null;
      chosen.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return {
        day, eventIds: chosen.map(e => e.id),
        text: chosen.map(e => e.diaryText || e.text).join(' '),
        partial: world.coverage.some(c => day >= L.dayKey(c.from) && day <= L.dayKey(c.to))
      };
    }
  };
  L.validateWorld = world => {
    if (!world || world.schemaVersion !== L.VERSION) throw new Error('対応していない保存形式です。');
    if (!world.character || typeof world.character.name !== 'string' || !world.character.name.trim() || world.character.name.length > 20) throw new Error('名前が不正です。');
    if (!L.activities[world.character.currentActivity] || typeof world.character.currentDetail !== 'string') throw new Error('活動が不正です。');
    for (const id of Object.keys(L.items)) {
      if (!Number.isInteger(world.inventory?.[id]) || world.inventory[id] < 0 || world.inventory[id] > 1000) throw new Error(`在庫が不正です: ${id}`);
    }
    for (const topic of Object.keys(L.topics)) {
      const value = world.character.interests?.[topic];
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('興味の値が不正です。');
    }
    for (const key of ['curiosity', 'adventurousness']) {
      const value = world.character.personality?.[key];
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('性格の値が不正です。');
    }
    if (!Number.isFinite(world.nextActionAt) || !Number.isFinite(world.createdAt) ||
        !(world.lastSimulatedAt === null || Number.isFinite(world.lastSimulatedAt)) ||
        !(world.lastActionAt === null || Number.isFinite(world.lastActionAt)) ||
        !Number.isInteger(world.rngState) || world.rngState < 1 ||
        !Number.isInteger(world.nextEventId) || world.nextEventId < 1) throw new Error('時刻・乱数の状態が不正です。');
    for (const name of ['eventLog', 'diary', 'coverage', 'knownRecipes', 'recentActions', 'pendingShopping', 'reservedSnacks']) {
      if (!Array.isArray(world[name])) throw new Error(`保存形式が不正です: ${name}`);
    }
    if (!world.knownRecipes.length || world.knownRecipes.some(id => !L.recipes[id]) || world.pendingShopping.some(id => !L.items[id]) || world.reservedSnacks.some(id => !L.items[id])) throw new Error('未知の食材またはレシピです。');
    if (!Number.isFinite(world.experience?.cooking) || world.experience.cooking < 0 ||
        !Number.isFinite(world.outcomes?.success) || !Number.isFinite(world.outcomes?.failure) ||
        !world.recipeStats || typeof world.recipeStats !== 'object') throw new Error('経験の値が不正です。');
    if (world.eventLog.length > L.LIMITS.logs || world.diary.length > L.LIMITS.diaries || world.coverage.length > 32 || world.recentActions.length > 8) throw new Error('記録上限を超えています。');
    const ids = new Set();
    for (const e of world.eventLog) {
      if (!e || typeof e.id !== 'string' || ids.has(e.id) || !Number.isFinite(Date.parse(e.timestamp)) || typeof e.text !== 'string' || typeof e.type !== 'string' || !Number.isFinite(e.importance)) throw new Error('生活ログが不正です。');
      ids.add(e.id);
    }
    for (const d of world.diary) if (typeof d.day !== 'string' || typeof d.text !== 'string' || !Array.isArray(d.eventIds)) throw new Error('日記が不正です。');
    return true;
  };
  // The only write path. Resolve → validate private draft → atomically replace world.
  L.WorldStateManager = class {
    constructor(world) { L.validateWorld(world); this._world = L.clone(world); }
    get state() { return L.clone(this._world); }
    process(event) {
      const world = L.clone(this._world), at = Date.parse(event.timestamp);
      if (!Number.isFinite(at) || at < (world.lastSimulatedAt ?? world.createdAt)) throw new Error('時刻が逆行しています。');
      const e = L.clone(event), fx = e.effects || {};
      e.id = `event_${String(world.nextEventId++).padStart(6, '0')}`;
      if (fx.inventory) {
        e.inventoryBefore = { ...world.inventory };
        for (const [id, delta] of Object.entries(fx.inventory)) {
          if (!L.items[id] || !Number.isInteger(delta)) throw new Error('在庫更新が不正です。');
          world.inventory[id] += delta;
        }
        e.inventoryAfter = { ...world.inventory };
        world.reservedSnacks = world.reservedSnacks.filter(id => world.inventory[id] > 0);
      }
      if (fx.interests) for (const [topic, delta] of Object.entries(fx.interests)) {
        if (!L.topics[topic] || !Number.isFinite(delta)) throw new Error('興味の更新が不正です。');
        world.character.interests[topic] = L.clamp(world.character.interests[topic] + delta, 0.08, 0.92);
      }
      if (fx.activity) { world.character.currentActivity = fx.activity; world.character.currentDetail = e.text; }
      if (fx.topic) {
        world.recentActions.push({ action: fx.activity, topic: fx.topic, timestamp: e.timestamp });
      } else if (fx.activity) world.recentActions.push({ action: fx.activity, timestamp: e.timestamp });
      world.recentActions = world.recentActions.slice(-8);
      if (fx.cooking) {
        world.experience.cooking += 1;
        const result = fx.cooking.success ? 'success' : 'failure';
        world.outcomes[result] += 1;
        const stat = world.recipeStats[fx.cooking.recipeId] || { success: 0, failure: 0 };
        stat[result] += 1; world.recipeStats[fx.cooking.recipeId] = stat;
      }
      if (fx.learnRecipe && !world.knownRecipes.includes(fx.learnRecipe)) world.knownRecipes.push(fx.learnRecipe);
      if (fx.shopping) world.pendingShopping = [...new Set(fx.shopping)];
      if (fx.reserve && !world.reservedSnacks.includes(fx.reserve)) world.reservedSnacks.push(fx.reserve);
      if (fx.name) world.character.name = fx.name;
      if (fx.interaction) world.interactionCount += 1;
      if (fx.rngState !== undefined) world.rngState = fx.rngState;
      if (fx.nextActionAt !== undefined) world.nextActionAt = fx.nextActionAt;
      if (fx.lastActionAt !== undefined) world.lastActionAt = fx.lastActionAt;
      if (fx.coverage) { world.coverage.push(fx.coverage); world.coverage = world.coverage.slice(-32); }
      if (fx.diary) {
        world.diary = world.diary.filter(d => d.day !== fx.diary.day);
        world.diary.push(fx.diary); world.diary.sort((a, b) => a.day.localeCompare(b.day));
        world.diary = world.diary.slice(-L.LIMITS.diaries);
      }
      world.lastSimulatedAt = at;
      // Clock and diary events use the same reducer but do not crowd the life log.
      if (!['clock', 'diary'].includes(e.type)) L.MemoryLogger.append(world, e);
      L.validateWorld(world);
      this._world = world;
      return L.clone(e);
    }
  };
  const event = (at, type, action, text, importance, effects = {}, extra = {}) => ({
    timestamp: new Date(at).toISOString(), type, action, text, importance, effects, ...extra
  });
  L.makeEvent = event;
  L.EventResolver = {
    resolve(world, choice, at, rng) {
      const action = choice.id;
      const interests = world.character.interests;
      const topicChoice = () => L.pick(Object.entries(interests).map(([id, weight]) => ({ id, weight:
        (0.15 + weight) * (world.recentActions.slice(-3).some(a => a.topic === id) ? 0.3 : 1)
      })), rng).id;
      if (action === 'reading') {
        const topic = topicChoice(), learn = topic === 'cooking' && !world.knownRecipes.includes('fruit_compote') && rng() < 0.45;
        const book = { reading: '小説', cooking: '料理の本', music: '音楽の本', gardening: '植物の本' }[topic];
        const text = `${book}を読んだ。${learn ? 'フルーツコンポートの作り方を覚えた。' : '気になるページにしおりを挟んだ。'}`;
        return event(at, action, `read_${topic}`, text, learn ? 0.72 : 0.4,
          { activity: action, topic, interests: { [topic]: 0.035, reading: topic === 'reading' ? 0.035 : 0.008 }, learnRecipe: learn ? 'fruit_compote' : null }, { topic });
      }
      if (action === 'hobby') {
        const topic = topicChoice();
        const texts = { cooking: '料理ノートを広げて、次に試したい味を考えた。', reading: 'お気に入りの小説を読み返した。', music: 'ソファで音楽を聴き、好きな旋律を口ずさんだ。', gardening: '窓辺の鉢を観察して、葉のお手入れをした。' };
        return event(at, action, `enjoy_${topic}`, texts[topic], 0.4,
          { activity: action, topic, interests: { [topic]: 0.028 } }, { topic });
      }
      if (action === 'cooking') {
        const adventure = rng() < world.character.personality.adventurousness * 0.16;
        const plans = world.knownRecipes.map(id => L.planRecipe(world, id, adventure));
        const usable = plans.filter(p => !p.missing.length);
        if (!usable.length) {
          const plan = plans.sort((a, b) => a.missing.length - b.missing.length)[0];
          return event(at, 'planning', 'plan_shopping', '料理を考えたけれど食材が足りない。買い物メモを書いた。', 0.46,
            { activity: 'rest', shopping: plan.missing }, { missingIngredients: plan.missing });
        }
        const plan = L.pick(usable.map(p => {
          const stat = world.recipeStats[p.recipeId] || { success: 0, failure: 0 };
          return { ...p, weight: (1 + Math.min(stat.success, 5) * 0.16) / (1 + stat.failure * 0.35) * (p.unusual ? 0.25 : 1) };
        }), rng);
        const recipe = L.recipes[plan.recipeId];
        const chance = L.clamp(0.93 - recipe.difficulty + Math.min(world.experience.cooking, 30) * 0.008 - (plan.unusual ? 0.23 : plan.substitutions.length * 0.035), 0.25, 0.96);
        const success = rng() < chance, result = success ? (plan.unusual ? 'unusual' : 'success') : 'failure';
        const inventory = {};
        plan.used.forEach(item => { inventory[item.id] = (inventory[item.id] || 0) - item.quantity; });
        const substitutionText = plan.substitutions.map(s => `${foodName(s.original)}の代わりに${foodName(s.replacement)}`).join('、');
        const first = !world.recipeStats[plan.recipeId];
        const text = `${first ? '初めて' : ''}${recipe.name}を作った。${substitutionText ? substitutionText + 'を使った。' : ''}${success ? (plan.unusual ? '不思議な味だけれど、意外と楽しめた。' : `${recipe.result}になって、おいしく食べた。`) : '味がまとまらず、次は作り方を見直そうと思った。'}`;
        return event(at, action, `make_${plan.recipeId}`, text, plan.unusual ? 0.95 : first ? 0.85 : success ? 0.58 : 0.76,
          { activity: action, inventory, cooking: { recipeId: plan.recipeId, success }, interests: { cooking: success ? 0.045 : -0.035 }, shopping: [] },
          { recipeId: plan.recipeId, ingredientsUsed: plan.used, substitutions: plan.substitutions, result, successProbability: chance, firstAttempt: first });
      }
      if (action === 'shopping') {
        let needs = world.pendingShopping;
        if (!needs.length) {
          const plan = world.knownRecipes.map(id => L.planRecipe(world, id)).sort((a, b) => a.missing.length - b.missing.length)[0];
          needs = plan.missing.length ? plan.missing : ['pork', 'onion', 'apple'].filter(id => world.inventory[id] < 2);
        }
        const inventory = {};
        for (const id of needs) if (world.inventory[id] < 4) inventory[id] = 4 - world.inventory[id];
        const names = Object.keys(inventory).map(foodName).join('、');
        return event(at, action, 'buy_ingredients', names ? `${names}を買って、冷蔵庫にしまった。` : '買い物メモを確認した。食材はまだ十分あった。', 0.38,
          { activity: action, inventory, shopping: [] }, { itemsBought: inventory });
      }
      if (action === 'snack') {
        const ids = Object.keys(L.items).filter(id => L.items[id].type === 'snack' && world.inventory[id] > 0 && !world.reservedSnacks.includes(id));
        if (!ids.length) return event(at, 'rest', 'tea_break', '温かいお茶をいれて、のんびりした。', 0.2, { activity: 'rest' });
        const id = ids[Math.floor(rng() * ids.length)];
        return event(at, action, 'eat_snack', `${foodName(id)}をお茶と一緒に食べた。`, 0.48,
          { activity: action, inventory: { [id]: -1 } }, { ingredientsUsed: [{ id, quantity: 1 }], result: 'eaten' });
      }
      const night = new Date(at).getHours() < 7 || new Date(at).getHours() >= 23;
      return event(at, 'rest', night ? 'sleep' : 'take_a_break', night ? 'ソファで毛布にくるまって、ゆっくり眠った。' : '窓の外を眺めながら、ひと休みした。', 0.18,
        { activity: night ? 'sleeping' : 'rest' });
    },
    gift(world, id, at) {
      if (!L.items[id] || L.items[id].type !== 'snack') throw new Error('このおやつは渡せません。');
      const rng = L.random(world.rngState), roll = rng();
      const disposition = roll < 0.3 ? 'eat' : roll < 0.8 ? 'store' : 'reserve';
      const text = `${foodName(id)}をもらった。` + ({ eat: 'さっそくお茶をいれて食べた。', store: 'おやつ棚にしまった。あとで食べるのが楽しみ。', reserve: '料理に使えそうなので、おやつ棚に取っておくことにした。' })[disposition];
      return event(at, 'gift', 'receive_snack', text, 0.88,
        { inventory: { [id]: disposition === 'eat' ? 0 : 1 }, reserve: disposition === 'reserve' ? id : null, interaction: true, rngState: rng.state() },
        { item: id, disposition, ingredientsUsed: disposition === 'eat' ? [{ id, quantity: 1 }] : [], receivedItems: [{ id, quantity: 1 }], result: disposition });
    }
  };
})(globalThis);
