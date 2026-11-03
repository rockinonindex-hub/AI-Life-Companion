/* Pure planners and resolvers: only WorldStateManager commits their effects. */
(function (root) {
  'use strict';
  const L = root.Life;
  L.substitutionKey = (recipeId, slotIndex, replacement) => JSON.stringify([recipeId, slotIndex, replacement]);
  L.compatibility = (slot, id) => {
    if (id === slot.id) return { score: 1, components: { exact: 1 } };
    const item = L.items[id], req = slot.requires || {};
    const components = { role: item.substitutes.includes(slot.role) ? 1 : 0 };
    let sum = components.role * .35, total = .35;
    for (const [key, weight] of [['taste', .25], ['texture', .20], ['methods', .20]]) {
      if (!req[key]?.length) continue;
      components[key] = req[key].filter(tag => item[key].includes(tag)).length / req[key].length;
      sum += weight * components[key]; total += weight;
    }
    return { score: sum / total, components };
  };
  L.learningFactor = (world, key) => {
    const stat = world.substitutionMemory[key];
    return stat ? 1 / (1 + Math.max(0, stat.failure - stat.success * .5) * .7) : 1;
  };
  // exactOnly is used for inventory preference and the initial shortage decision.
  L.planRecipe = (world, recipeId, adventurous = false, exactOnly = false) => {
    const recipe = L.recipes[recipeId], available = { ...world.inventory };
    const used = [], substitutions = [], missing = [], shortages = {}, scores = [];
    recipe.slots.forEach((slot, index) => {
      let id = slot.id, evaluation = { score: 1, components: { exact: 1 } }, factor = 1;
      if ((available[id] || 0) < slot.quantity) {
        const candidates = exactOnly ? [] : Object.keys(L.items).filter(key => key !== slot.id && (available[key] || 0) >= slot.quantity)
          .map(key => ({ id: key, evaluation: L.compatibility(slot, key), factor: L.learningFactor(world, L.substitutionKey(recipeId, index, key)) }))
          .filter(c => c.evaluation.score >= .25 && (adventurous || L.items[c.id].substitutes.includes(slot.role)))
          .sort((a, b) => b.evaluation.score * b.factor - a.evaluation.score * a.factor || a.id.localeCompare(b.id));
        if (!candidates.length) {
          missing.push(slot.id); shortages[slot.id] = (shortages[slot.id] || 0) + slot.quantity - (available[slot.id] || 0);
          available[slot.id] = 0; return;
        }
        ({ id, evaluation, factor } = candidates[0]);
        substitutions.push({ slotIndex: index, original: slot.id, replacement: id, quantity: slot.quantity, unusual: evaluation.score < .7,
          compatibility: evaluation.score, components: evaluation.components, learningFactor: factor, key: L.substitutionKey(recipeId, index, id) });
      }
      available[id] -= slot.quantity;
      used.push({ id, quantity: slot.quantity }); scores.push(evaluation.score);
    });
    return { recipeId, used, substitutions, missing, shortages, unusual: substitutions.some(s => s.unusual),
      compatibility: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0 };
  };
  // Apply the same variety rule to initial menus and shortage fallbacks.
  L.menuVariety = (world, id) => {
    const recent = world.recentMeals.slice(-4);
    if (world.knownRecipes.length > 1 && recent.slice(-2).length === 2 && recent.slice(-2).every(x => x === id)) return 0;
    return Math.pow(.25, recent.filter(x => x === id).length) * (recent[recent.length - 1] === id ? .1 : 1);
  };
  L.selectMenu = (world, rng) => {
    if (world.pendingMeal) return { recipeId: world.pendingMeal, mode: 'pending', weights: [{ id: world.pendingMeal, weight: 1 }] };
    const mode = rng() < world.menuPreference.inventory ? 'inventory' : 'desire';
    const weights = world.knownRecipes.map(id => {
      const plan = L.planRecipe(world, id, false, true), count = L.recipes[id].slots.length;
      const stat = world.recipeStats[id] || { success: 0, failure: 0 };
      const preference = mode === 'inventory' ? .05 + Math.pow((count - plan.missing.length) / count, 3) * 5 :
        (1 + Math.min(stat.success, 5) * .08) / (1 + Math.min(stat.failure, 5) * .12);
      return { id, weight: preference * L.menuVariety(world, id) };
    });
    return { recipeId: L.pick(weights, rng).id, mode, weights };
  };
  L.shortageOptions = (world, recipeId) => {
    const substitute = L.planRecipe(world, recipeId, true);
    const alternatives = world.knownRecipes.filter(id => id !== recipeId).map(id => L.planRecipe(world, id, false, true)).filter(p => !p.missing.length && L.menuVariety(world, p.recipeId) > 0);
    const options = [{ id: 'shopping', weight: 3 }];
    if (!substitute.missing.length) {
      const factor = Math.min(1, ...substitute.substitutions.map(s => s.learningFactor));
      options.push({ id: 'substitute', weight: 4 * substitute.compatibility * factor });
    }
    if (alternatives.length) options.push({ id: 'change', weight: 2 });
    return { options, substitute, alternatives };
  };
  L.evaluateCooking = (world, plan, rng) => {
    const experience = Math.min(world.experience.cooking / 30, 1), difficulty = L.recipes[plan.recipeId].difficulty, noise = rng() * .1 - .05;
    const score = .8 * plan.compatibility + .2 * experience - .2 * difficulty + noise;
    return { compatibility: plan.compatibility, experience, difficulty, noise, score, result: score >= .70 ? 'success' : score >= .45 ? 'unusual' : 'failure' };
  };
  L.resolveCooking = (world, at, rng) => {
    const menu = L.selectMenu(world, rng), original = L.planRecipe(world, menu.recipeId, false, true);
    let plan = original, shortage = null;
    if (original.missing.length) {
      const choices = L.shortageOptions(world, menu.recipeId), chosen = L.pick(choices.options, rng).id;
      shortage = { chosen, weights: choices.options, missing: original.shortages, requestedRecipe: menu.recipeId };
      if (chosen === 'shopping') {
        return L.makeEvent(at, 'planning', 'plan_shopping', `${L.recipes[menu.recipeId].name}を作りたいので、足りない食材を買い物メモに書いた。`, .46,
          { activity: 'rest', shopping: Object.keys(original.shortages), shoppingQuantities: original.shortages, pendingMeal: menu.recipeId },
          { menu, shortage, missingIngredients: original.missing });
      }
      plan = chosen === 'substitute' ? choices.substitute : L.pick(choices.alternatives.map(p => ({ ...p, weight: L.menuVariety(world, p.recipeId) })), rng);
    }
    const recipe = L.recipes[plan.recipeId], evaluation = L.evaluateCooking(world, plan, rng), result = evaluation.result;
    const inventory = {};
    for (const item of plan.used) inventory[item.id] = (inventory[item.id] || 0) - item.quantity;
    const first = !world.recipeStats[plan.recipeId];
    const substitutions = plan.substitutions.map(s => `${L.foodName(s.original)}の代わりに${L.foodName(s.replacement)}`).join('、');
    const ending = { success: `${recipe.result}になって、おいしく食べた。`, unusual: 'いつもと違う味の料理になった。変わった味を楽しんだ。', failure: '味がまとまらず、次は作り方や代用を見直そうと思った。' }[result];
    const text = `${shortage?.chosen === 'change' ? `${L.recipes[menu.recipeId].name}の材料が足りず、別の献立に変更した。` : ''}${first ? '初めて' : ''}${recipe.name}を作った。${substitutions ? substitutions + 'を使った。' : ''}${ending}`;
    const learning = plan.substitutions.map(s => ({ key: s.key, result, penalize: result === 'failure' && s.compatibility < .7 }));
    return L.makeEvent(at, 'cooking', `make_${plan.recipeId}`, text, result === 'unusual' ? .95 : first ? .85 : result === 'failure' ? .76 : .58,
      { activity: 'cooking', inventory, cooking: { recipeId: plan.recipeId, result, success: result !== 'failure' }, learning,
        interests: { cooking: result === 'failure' ? -.035 : .045 }, shopping: [], shoppingQuantities: {}, pendingMeal: null },
      { recipeId: plan.recipeId, ingredientsUsed: plan.used, substitutions: plan.substitutions, result, evaluation, firstAttempt: first, menu, shortage });
  };
  L.resolveShopping = (world, at, rng) => {
    let needs = { ...world.shoppingQuantities }, recipeId = world.pendingMeal, menu = null;
    if (!Object.keys(needs).length && world.pendingShopping.length) needs = Object.fromEntries(world.pendingShopping.map(id => [id, 1]));
    if (!Object.keys(needs).length) {
      menu = L.selectMenu(world, rng); recipeId = menu.recipeId;
      needs = L.planRecipe(world, recipeId, false, true).shortages;
      if (!Object.keys(needs).length) {
        needs = Object.fromEntries(L.commonIngredients().filter(([id, count]) => count >= 2 && world.inventory[id] < 2).slice(0, 4).map(([id]) => [id, 1]));
      }
    }
    const inventory = {};
    for (const [id, amount] of Object.entries(needs)) {
      const delta = Math.max(amount, 4 - world.inventory[id]);
      if (world.inventory[id] + delta > 1000) throw new Error('食材の保管上限を超えます。');
      inventory[id] = delta;
    }
    const names = Object.keys(inventory).map(L.foodName).join('、');
    return L.makeEvent(at, 'shopping', 'buy_ingredients', names ? `${names}を買って、冷蔵庫にしまった。` : '買い物メモを確認した。食材はまだ十分あった。', .38,
      { activity: 'shopping', inventory, shopping: [], shoppingQuantities: {}, pendingMeal: recipeId },
      { itemsBought: inventory, requestedQuantities: needs, recipeId, reason: world.pendingShopping.length ? 'shopping_list' : 'menu_and_common_ingredients', menu });
  };
})(globalThis);
