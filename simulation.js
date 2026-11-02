(function (root) {
  'use strict';
  const L = root.Life;
  L.ActionSelector = {
    weights(world, at) {
      const h = new Date(at).getHours(), interests = world.character.interests;
      const night = h < 7 || h >= 23, meal = [7, 8, 11, 12, 13, 18, 19, 20].includes(h);
      const canCook = world.knownRecipes.some(id => !L.planRecipe(world, id).missing.length);
      const snackCount = Object.keys(L.items).filter(id => L.items[id].type === 'snack' && !world.reservedSnacks.includes(id)).reduce((n, id) => n + world.inventory[id], 0);
      const previous = world.recentActions.slice(-4);
      const fatigue = action => Math.pow(0.42, previous.filter(a => a.action === action || (action === 'rest' && a.action === 'sleeping')).length);
      const cookingFeedback = (1 + Math.min(world.outcomes.success, 8) * 0.065) / (1 + Math.min(world.outcomes.failure, 8) * 0.09);
      const values = [
        { id: 'reading', weight: (0.5 + interests.reading + world.character.personality.curiosity * 0.35) * (night ? 0.05 : 1), reason: '読書への興味・好奇心' },
        { id: 'cooking', weight: (0.2 + interests.cooking * 1.5) * (meal ? 3.8 : 0.6) * cookingFeedback * (night ? 0.01 : 1), reason: `${meal ? '食事の時間' : '料理への興味'}・成功失敗の経験${canCook ? '' : '／食材不足なら買い物を計画'}` },
        { id: 'snack', weight: snackCount ? (h >= 14 && h <= 17 ? 1.7 : 0.3) * (night ? 0.02 : 1) : 0, reason: snackCount ? '棚におやつがある' : '食べられるおやつなし' },
        { id: 'hobby', weight: (0.45 + Math.max(...Object.values(interests))) * (night ? 0.03 : 1), reason: '興味・最近の趣味との変化' },
        { id: 'shopping', weight: night ? 0 : world.pendingShopping.length ? 15 : !canCook ? 7 : 0.08, reason: world.pendingShopping.length ? '前の行動で書いた買い物メモ' : canCook ? '冷蔵庫の在庫確認' : '調理できる食材が不足' },
        { id: 'rest', weight: night ? 35 : 0.65, reason: night ? '夜は休息を優先' : '生活の合間の休憩' }
      ];
      return values.map(c => {
        const multiplier = night && c.id === 'rest' ? 1 : fatigue(c.id);
        return { ...c, baseWeight: c.weight, recentMultiplier: multiplier, weight: c.weight * multiplier };
      });
    },
    choose(world, at, rng) { return L.pick(this.weights(world, at), rng); }
  };
  L.Simulation = class {
    constructor(manager) { this.manager = manager; }
    updateDiary(day, at) {
      const entry = L.MemoryLogger.diary(this.manager.snapshot, day);
      if (entry) this.manager.process(L.makeEvent(at, 'diary', 'write_diary', '日記を更新した。', 0, { diary: entry }));
    }
    step(at, representative = false, interval = L.STEP) {
      const world = this.manager.snapshot, rng = L.random(world.rngState);
      const choice = L.ActionSelector.choose(world, at, rng);
      const e = L.EventResolver.resolve(world, choice, at, rng);
      // Interests relax toward individual baselines; repeated topics add fatigue.
      const elapsed = Math.min(30 * L.DAY, Math.max(0, at - (world.lastActionAt ?? world.createdAt)));
      const defaults = { cooking: 0.5, reading: 0.6, music: 0.4, gardening: 0.2 };
      const effects = e.effects.interests = e.effects.interests || {};
      for (const [topic, baseline] of Object.entries(defaults)) {
        const relaxation = (baseline - world.character.interests[topic]) * (1 - Math.exp(-elapsed / (2 * L.DAY)));
        effects[topic] = (effects[topic] || 0) + relaxation;
        if (e.effects.topic === topic && world.recentActions.slice(-3).some(a => a.topic === topic)) effects[topic] -= 0.025;
      }
      e.effects.rngState = rng.state();
      e.effects.nextActionAt = at + interval;
      e.effects.lastActionAt = at;
      e.representative = representative;
      e.selection = { chosen: choice.id, weights: L.ActionSelector.weights(world, at).map(c => ({ id: c.id, weight: c.weight })) };
      this.manager.process(e);
      this.updateDiary(L.dayKey(at), at);
      return e;
    }
    advance(target) {
      if (!Number.isFinite(target) || Math.abs(target) > 8e15) throw new Error('時刻の指定が不正です。');
      const start = this.manager.snapshot.lastSimulatedAt ?? this.manager.snapshot.createdAt;
      if (target < start) return { actions: 0, compressed: false, clockSkew: true };
      const recentStart = Math.max(start, target - 3 * L.DAY);
      let actions = 0, compressed = false;
      if (recentStart > start) {
        compressed = true;
        const duration = recentStart - start;
        const count = Math.max(1, Math.min(duration <= 14 * L.DAY ? 56 : duration <= 56 * L.DAY ? 64 : 24, Math.ceil(duration / L.DAY) * (duration <= 14 * L.DAY ? 4 : 2)));
        // Bounded representatives, still ordinary state-changing transactions.
        // Samples are centered in each interval and retain their actual timestamp.
        for (let i = 0; i < count; i++) {
          const at = Math.floor(start + duration * (i + 0.5) / count);
          this.step(at, true); actions++;
        }
        const world = this.manager.snapshot;
        const samples = world.eventLog.filter(e => e.representative && Date.parse(e.timestamp) >= start && Date.parse(e.timestamp) <= recentStart);
        const cooking = samples.filter(e => e.type === 'cooking').length;
        const text = `${L.dayKey(start)}〜${L.dayKey(recentStart)}は代表記録${count}件にまとめた。記録した料理は${cooking}回。省略した時間の個々の行動は再現していない。`;
        this.manager.process(L.makeEvent(recentStart, 'summary', 'summarize_absence', text, 0.7,
          { coverage: { from: start, to: recentStart, count }, nextActionAt: recentStart },
          { representative: true, from: new Date(start).toISOString(), to: new Date(recentStart).toISOString(), representedEvents: samples.map(e => e.id) }));
        // Coverage is known only after the older interval is resolved. Refresh all
        // affected diary labels, including days sampled before the summary event.
        const days = new Set(samples.map(e => L.dayKey(e.timestamp)));
        for (const diary of this.manager.snapshot.diary) {
          if (diary.day >= L.dayKey(start) && diary.day <= L.dayKey(recentStart)) days.add(diary.day);
        }
        days.add(L.dayKey(recentStart));
        for (const day of days) this.updateDiary(day, recentStart);
      }
      let next = this.manager.snapshot.nextActionAt;
      while (next <= target && actions < L.LIMITS.actions) {
        this.step(Math.max(next, this.manager.snapshot.lastSimulatedAt ?? start)); actions++;
        next = this.manager.snapshot.nextActionAt;
      }
      this.manager.process(L.makeEvent(target, 'clock', 'advance_clock', '生活時計を更新した。', 0));
      return { actions, compressed, clockSkew: false };
    }
    gift(id, at) {
      this.advance(at);
      this.manager.process(L.EventResolver.gift(this.manager.snapshot, id, at));
      this.updateDiary(L.dayKey(at), at);
    }
    rename(name, at) {
      const value = name.trim();
      if (!value || value.length > 20) throw new Error('名前は1〜20文字で入力してください。');
      this.manager.process(L.makeEvent(at, 'settings', 'rename', `名前を「${value}」にした。`, 0.1, { name: value }));
    }
  };
  // Standalone boundary for a future conversation adapter. No fabricated memories.
  L.respond = (question, world, at = world.lastSimulatedAt ?? Date.now()) => {
    const q = question.trim(), name = world.character.name;
    const lifeEvents = world.eventLog.filter(e => !['settings', 'summary'].includes(e.type));
    const describe = events => events.slice(-3).map(e => e.text).join(' ');
    const date = new Date(at);
    const coverageNote = day => {
      const partial = world.coverage.some(c => day >= L.dayKey(c.from) && day <= L.dayKey(c.to));
      return partial ? ' この日は代表的な記録だけが残っているよ。' : '';
    };
    if (/日記/.test(q)) {
      const diary = world.diary.slice(-1)[0];
      return diary ? `${diary.day}の日記：${diary.text}${diary.partial ? '（代表記録を含む日）' : ''}` : 'まだ日記に残せる出来事がないよ。';
    }
    if (/興味|好き|関心/.test(q)) {
      const [topic] = Object.entries(world.character.interests).sort((a, b) => b[1] - a[1])[0];
      const cause = [...lifeEvents].reverse().find(e => e.topic === topic || (topic === 'cooking' && e.type === 'cooking'));
      return `今は${L.topics[topic]}にいちばん興味があるよ。${cause ? `最近の記録では、${cause.text}` : 'これは最初から持っている好みだよ。'}`;
    }
    if (/食べ|食事|何食/.test(q)) {
      const meals = lifeEvents.filter(e => (e.type === 'cooking' && e.result !== 'failure') || e.type === 'snack' || (e.type === 'gift' && e.disposition === 'eat'));
      if (!meals.length) return '食べたものの記録は、まだないよ。';
      const e = meals[meals.length - 1];
      return `いちばん新しい食事の記録は${L.dayKey(e.timestamp)}。${e.text}${e.representative ? ' これは代表記録だよ。' : ''}`;
    }
    if (/昨日|今日|何して|なにして/.test(q)) {
      const yesterday = /昨日/.test(q);
      if (yesterday) date.setDate(date.getDate() - 1);
      const day = L.dayKey(date), events = lifeEvents.filter(e => L.dayKey(e.timestamp) === day);
      return (events.length ? `${yesterday ? '昨日' : '今日'}の記録では、${describe(events)}` : `${day}の生活記録は残っていないよ。`) + coverageNote(day);
    }
    return `${name}の生活記録から答えるよ。「今日何してた？」「昨日何してた？」「何食べた？」「最近何に興味がある？」「日記を見せて」と話しかけてね。`;
  };
})(globalThis);
