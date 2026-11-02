(function (root) {
  'use strict';
  const L = root.Life;
  const foodName = id => L.items[id].name;
  L.foodName = foodName;
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
    if (!Array.isArray(world.catalogItems) || !Array.isArray(world.catalogRecipes) || Object.keys(L.items).some(id => !world.catalogItems.includes(id)) || Object.keys(L.recipes).some(id => !world.catalogRecipes.includes(id))) throw new Error('カタログ情報が不正です。');
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
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const counter = value => Number.isSafeInteger(value) && value >= 0;
    if (!record(world.menuPreference) || !Number.isFinite(world.menuPreference.inventory) || !Number.isFinite(world.menuPreference.desire) ||
        world.menuPreference.inventory < 0 || world.menuPreference.desire < 0 || Math.abs(world.menuPreference.inventory + world.menuPreference.desire - 1) > 1e-9) throw new Error('献立設定が不正です。');
    if (world.pendingMeal !== null && !L.recipes[world.pendingMeal]) throw new Error('保留中の献立が不正です。');
    if (!Array.isArray(world.recentMeals) || world.recentMeals.length > 4 || world.recentMeals.some(id => !L.recipes[id])) throw new Error('献立履歴が不正です。');
    if (!record(world.shoppingQuantities) || Object.entries(world.shoppingQuantities).some(([id, n]) => !L.items[id] || !Number.isInteger(n) || n < 1 || n > 1000)) throw new Error('買い物数量が不正です。');
    if (!counter(world.experience.cooking) || !record(world.outcomes) || ['success','unusual','failure'].some(key => !counter(world.outcomes[key])) ||
        !record(world.recipeStats) || Object.entries(world.recipeStats).some(([id, stat]) => !L.recipes[id] || !record(stat) || ['success','unusual','failure'].some(key => !counter(stat[key])))) throw new Error('料理経験が不正です。');
    if (!record(world.substitutionMemory)) throw new Error('代用履歴が不正です。');
    for (const [key, stat] of Object.entries(world.substitutionMemory)) {
      const [recipeId, index, replacement] = JSON.parse(key);
      if (!L.recipes[recipeId]?.slots[index] || !Number.isInteger(index) || !L.items[replacement] || !record(stat) ||
          ['attempts','success','unusual','failure','otherFailure'].some(k => !counter(stat[k])) ||
          stat.attempts !== stat.success + stat.unusual + stat.failure + stat.otherFailure) throw new Error('代用履歴が不正です。');
    }
    const ids = new Set();
    for (const e of world.eventLog) {
      if (!e || typeof e.id !== 'string' || ids.has(e.id) || !Number.isFinite(Date.parse(e.timestamp)) || typeof e.text !== 'string' || typeof e.type !== 'string' || !Number.isFinite(e.importance)) throw new Error('生活ログが不正です。');
      ids.add(e.id);
    }
    for (const d of world.diary) if (typeof d.day !== 'string' || typeof d.text !== 'string' || !Array.isArray(d.eventIds)) throw new Error('日記が不正です。');
    return true;
  };
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  // The only write path. Resolve → validate private draft → atomically replace world.
  L.WorldStateManager = class {
    constructor(world) { L.validateWorld(world); this._world = freeze(L.clone(world)); }
    get state() { return L.clone(this._world); }
    // Frozen read view for the engine. Public state remains an independent copy.
    get snapshot() { return this._world; }
    process(event) {
      const { eventLog, diary, ...mutable } = this._world;
      const world = { ...L.clone(mutable), eventLog: eventLog.slice(), diary: diary.slice() }, at = Date.parse(event.timestamp);
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
        const result = fx.cooking.result || (fx.cooking.success ? 'success' : 'failure');
        if (!['success', 'unusual', 'failure'].includes(result) || !L.recipes[fx.cooking.recipeId]) throw new Error('調理結果が不正です。');
        world.outcomes[result] += 1;
        const stat = world.recipeStats[fx.cooking.recipeId] || { success: 0, unusual: 0, failure: 0 };
        stat[result] = (stat[result] || 0) + 1; world.recipeStats[fx.cooking.recipeId] = stat;
        world.recentMeals = [...world.recentMeals, fx.cooking.recipeId].slice(-4);
      }
      if (fx.learning) for (const change of fx.learning) {
        if (!['success', 'unusual', 'failure'].includes(change.result)) throw new Error('学習結果が不正です。');
        const stat = world.substitutionMemory[change.key] || { attempts: 0, success: 0, unusual: 0, failure: 0, otherFailure: 0 };
        stat.attempts++;
        stat[change.result === 'failure' && !change.penalize ? 'otherFailure' : change.result]++;
        world.substitutionMemory[change.key] = stat;
      }
      if (fx.pendingMeal !== undefined) world.pendingMeal = fx.pendingMeal;
      if (fx.shoppingQuantities) world.shoppingQuantities = L.clone(fx.shoppingQuantities);
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
      this._world = freeze(world);
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
        const topic = topicChoice(), unknown = Object.keys(L.recipes).filter(id => !world.knownRecipes.includes(id));
        const learn = topic === 'cooking' && unknown.length && rng() < 0.45 ? unknown[Math.floor(rng() * unknown.length)] : null;
        const book = { reading: '小説', cooking: '料理の本', music: '音楽の本', gardening: '植物の本' }[topic];
        const text = `${book}を読んだ。${learn ? `${L.recipes[learn].name}の作り方を覚えた。` : '気になるページにしおりを挟んだ。'}`;
        return event(at, action, `read_${topic}`, text, learn ? 0.72 : 0.4,
          { activity: action, topic, interests: { [topic]: 0.035, reading: topic === 'reading' ? 0.035 : 0.008 }, learnRecipe: learn }, { topic });
      }
      if (action === 'hobby') {
        const topic = topicChoice();
        const texts = { cooking: '料理ノートを広げて、次に試したい味を考えた。', reading: 'お気に入りの小説を読み返した。', music: 'ソファで音楽を聴き、好きな旋律を口ずさんだ。', gardening: '窓辺の鉢を観察して、葉のお手入れをした。' };
        return event(at, action, `enjoy_${topic}`, texts[topic], 0.4,
          { activity: action, topic, interests: { [topic]: 0.028 } }, { topic });
      }
      if (action === 'cooking') return L.resolveCooking(world, at, rng);
      if (action === 'shopping') return L.resolveShopping(world, at, rng);
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

