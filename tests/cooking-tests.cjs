'use strict';
const { L, start, root } = require('./helpers.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
let passed = 0;
const test = (name, fn) => { fn(); console.log('PASS ' + name); passed++; };
const memoryStore = raw => { const map = new Map(raw ? [[L.STORAGE_KEY,raw]] : []); return { map, getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v) }; };
const poorWorld = () => { const w = L.createWorld(start); for (const id in w.inventory) w.inventory[id] = 0; w.inventory.tofu=1; w.inventory.cookie=1; w.knownRecipes=['pork_saute']; w.pendingMeal='pork_saute'; return w; };
const old = JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/v1-world.json'),'utf8'));
test('30食材・10おやつ・20レシピと共通食材の参照整合性', () => {
  assert.equal(Object.keys(L.ingredients).length,30); assert.equal(Object.keys(L.snacks).length,10); assert.equal(Object.keys(L.recipes).length,20);
  assert.deepEqual(Object.keys(L.validateCatalog()).sort(),Object.keys(L.ingredients).sort());
  assert(L.commonIngredients()[0][1] > 1);
});
test('v1移行は履歴・日記・在庫・乱数・既存集計を保持しバックアップする', () => {
  const raw=JSON.stringify(old), store=memoryStore(raw), w=L.Storage.load(store);
  assert.equal(store.getItem(L.STORAGE_KEY),raw); assert.equal(w.schemaVersion,2);
  for(const k of ['eventLog','diary','rngState','nextEventId','createdAt','lastSimulatedAt','experience','character']) assert.deepEqual(w[k],old[k]);
  for(const id in old.inventory) assert.equal(w.inventory[id],old.inventory[id]);
  assert.equal(w.inventory.rice,0); assert.equal(w.knownRecipes.length,20); assert.equal(w.outcomes.success,old.outcomes.success);
  L.Storage.save(store,w); assert.equal(store.getItem(L.STORAGE_KEY+'.backup-v1'),raw);
  assert.deepEqual(L.Storage.load(store),w); assert.equal(old.schemaVersion,1);
});
test('破損v1・不正v2・未来形式を拒否し元保存を保護する', () => {
  for(const edit of [w=>delete w.inventory.pork,w=>w.inventory.pork=-1,w=>w.knownRecipes=['missing'],w=>w.schemaVersion=99,w=>w.rngState=0]) {
    const w=L.clone(old); edit(w); const raw=JSON.stringify(w),store=memoryStore(raw); assert.throws(()=>L.Storage.load(store)); assert.equal(store.getItem(L.STORAGE_KEY),raw);
  }
  const w=L.createWorld(start); w.menuPreference.inventory=NaN; assert.throws(()=>L.StateCodec.encode(w));
  w.menuPreference.inventory=.7; w.substitutionMemory.bad={}; assert.throws(()=>L.StateCodec.encode(w));
});
test('バックアップ失敗・保存失敗でも旧保存を変更しない', () => {
  const raw=JSON.stringify(old), w=L.StateCodec.decode(raw);
  for(const failAt of [1,2]) {
    const store=memoryStore(raw), write=store.setItem; let writes=0;
    store.setItem=(k,v)=>{ if(++writes===failAt) throw Error('quota'); write(k,v); };
    assert.throws(()=>L.Storage.save(store,w)); assert.equal(store.getItem(L.STORAGE_KEY),raw);
  }
});
test('明示初期化は壊れた保存もバックアップして復旧できる', () => {
  const store=memoryStore('{broken'); L.Storage.reset(store,L.createWorld(start));
  assert.equal(store.getItem(L.STORAGE_KEY+'.backup-reset'),'{broken'); assert.equal(L.Storage.load(store).schemaVersion,2);
});
test('70/30の献立方式、在庫優先、繰り返し抑制', () => {
  const w=L.createWorld(start),rng=L.random(1234),counts={inventory:0,desire:0};
  for(let i=0;i<10000;i++) counts[L.selectMenu(w,rng).mode]++;
  assert(Math.abs(counts.inventory/10000-.7)<.02);
  const a=L.selectMenu(w,()=>0); assert.equal(a.mode,'inventory');
  assert(a.weights.find(x=>x.id==='pork_saute').weight > a.weights.find(x=>x.id==='pancake').weight);
  const before=a.weights.find(x=>x.id==='pork_saute').weight; w.recentMeals=['pork_saute'];
  assert(L.selectMenu(w,()=>0).weights.find(x=>x.id==='pork_saute').weight < before);
});
test('不足時の買い物・代用・献立変更と実在庫更新', () => {
  const w=L.createWorld(start); w.pendingMeal='sweet_sour_pork';
  const shopping=L.resolveCooking(w,start,()=>0); assert.equal(shopping.shortage.chosen,'shopping');
  const m=new L.WorldStateManager(w); m.process(shopping);
  const purchase=L.resolveShopping(m.state,start,()=>0); m.process(purchase);
  assert.equal(m.state.pendingMeal,'sweet_sour_pork'); assert.equal(m.state.inventory.pineapple,4);
  const cooked=L.resolveCooking(m.state,start,()=>.5); m.process(cooked);
  assert.equal(m.state.pendingMeal,null); assert.equal(m.state.inventory.pineapple,3);
  const substituted=L.resolveCooking(poorWorld(),start,()=>.9); assert.equal(substituted.shortage.chosen,'substitute');
  const change=L.resolveCooking(w,start,()=>.999); assert.equal(change.shortage.chosen,'change'); assert.notEqual(change.recipeId,'sweet_sour_pork');
});
test('味・食感・調理適性の一致率と三段階評価', () => {
  const slot=L.recipes.sweet_sour_pork.slots[2];
  assert(L.compatibility(slot,'apple').score > L.compatibility(slot,'cookie').score);
  const w=L.createWorld(start);
  for(const [compatibility,result] of [[1,'success'],[.7,'unusual'],[.3,'failure']]) {
    const e=L.evaluateCooking(w,{recipeId:'pork_saute',compatibility},()=>.5); assert.equal(e.result,result); assert.equal(e.noise,0);
  }
  assert.equal(L.evaluateCooking(w,{recipeId:'pork_saute',compatibility:.7},()=>0).noise,-.05);
});
test('不適合な失敗を学習し、成功により選択抑制が緩和する', () => {
  const w=poorWorld(),m=new L.WorldStateManager(w),e=L.resolveCooking(w,start,()=>.9);
  assert.equal(e.result,'failure'); const key=e.substitutions[0].key;
  m.process(e); assert.equal(m.state.substitutionMemory[key].attempts,1);
  assert(L.learningFactor(m.state,key)<L.learningFactor(w,key));
  const before=L.learningFactor(m.state,key);
  m.process(L.makeEvent(start,'test','learning_success','学習の検証',0,{learning:[{key,result:'success',penalize:false}]}));
  assert(L.learningFactor(m.state,key)>before);
  const store=memoryStore(); L.Storage.save(store,m.state); assert.deepEqual(L.Storage.load(store).substitutionMemory,m.state.substitutionMemory);
});
test('不適切な学習イベントは在庫・乱数・ログと一緒に巻き戻す', () => {
  const m=new L.WorldStateManager(L.createWorld(start)), before=m.state;
  assert.throws(()=>m.process(L.makeEvent(start,'test','invalid','不正',0,{inventory:{pork:-1},rngState:44,learning:[{key:'invalid',result:'success'}]})));
  assert.deepEqual(m.state,before);
  assert(Object.isFrozen(m.snapshot.eventLog)); assert.throws(()=>{m.snapshot.inventory.pork=99;});
});
test('データのみの料理・食材追加、数量不足と二重使用の防止', () => {
  const saved = L.StateCodec.encode(L.createWorld(start));
  try {
    L.items.testFood={...L.items.rice,name:'追加食材'};
    L.recipes.testRecipe={name:'追加料理',difficulty:.1,result:'追加料理',slots:[{id:'testFood',role:'starch',quantity:2},{id:'testFood',role:'starch',quantity:2}]};
    L.validateCatalog();
    const upgraded=L.StateCodec.decode(saved); assert.equal(upgraded.inventory.testFood,0); assert(upgraded.knownRecipes.includes('testRecipe'));
    const corrupt=L.createWorld(start); delete corrupt.inventory.pork; assert.throws(()=>L.StateCodec.decode(JSON.stringify(corrupt)));
    const w=L.createWorld(start); w.inventory.testFood=3; w.knownRecipes=['testRecipe']; w.pendingMeal='testRecipe';
    const plan=L.planRecipe(w,'testRecipe',false,true); assert.equal(plan.shortages.testFood,1);
    const e=L.resolveCooking(w,start,()=>0); const m=new L.WorldStateManager(w); m.process(e); m.process(L.resolveShopping(m.state,start,()=>0));
    const cooked=L.resolveCooking(m.state,start,()=>.5); m.process(cooked); assert.equal(m.state.inventory.testFood,0);
  } finally { delete L.items.testFood; delete L.recipes.testRecipe; }
});
test('全おやつが贈答・料理用保存に対応する', () => {
  for(const id in L.snacks) { const m=new L.WorldStateManager(L.createWorld(start)); const e=L.EventResolver.gift(m.state,id,start); m.process(e); assert.equal(m.state.inventory[id],L.createWorld(start).inventory[id]+(e.disposition==='eat'?0:1)); }
});
test('失敗・変わった料理・買い物の日記と会話は確定イベントを参照する', () => {
  const m=new L.WorldStateManager(poorWorld()); const e=L.resolveCooking(m.state,start,()=>.9); m.process(e);
  const sim=new L.Simulation(m); sim.updateDiary(L.dayKey(start),start);
  assert(m.state.diary[0].text.includes(e.text)); assert(L.respond('今日何してた？',m.state).includes(e.text));
  assert.match(L.respond('何食べた？',m.state),/まだない/);
  const w=L.createWorld(start); w.pendingMeal='pork_saute'; w.inventory.pork=0; w.inventory.tofu=1;
  const unusual=L.resolveCooking(w,start,()=>.9);
  assert.equal(unusual.result,'unusual');
  const um=new L.WorldStateManager(w); um.process(unusual); new L.Simulation(um).updateDiary(L.dayKey(start),start);
  assert.equal(um.state.outcomes.unusual,1); assert(L.respond('何食べた？',um.state).includes(unusual.text));
  assert(um.state.diary[0].text.includes(unusual.text));
  const buy=L.resolveShopping(um.state,start,()=>.5); um.process(buy);
  assert(L.respond('今日何してた？',um.state).includes(buy.text));
});
test('移行した保存の連続実行・途中復元が同じ状態になる', () => {
  const a=new L.WorldStateManager(L.StateCodec.migrate(old)), b=new L.WorldStateManager(L.StateCodec.migrate(old));
  new L.Simulation(a).advance(start+2*L.DAY);
  const sb=new L.Simulation(b); sb.advance(start+1.5*L.DAY);
  const c=new L.WorldStateManager(L.StateCodec.decode(L.StateCodec.encode(b.state))); new L.Simulation(c).advance(start+2*L.DAY);
  // Clock/diary transaction IDs can differ with polling; compare actual behavior and RNG.
  for(const k of ['inventory','character','rngState','experience','outcomes','recipeStats','substitutionMemory']) assert.deepEqual(a.state[k],c.state[k]);
});
console.log(`${passed} cooking tests passed.`);
