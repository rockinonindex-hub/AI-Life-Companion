/* Recipe-first catalogue. All quantities are abstract simulation units. */
(function (root) {
  'use strict';
  const L = root.Life = root.Life || {};
  const slot = (id, role, taste, texture, methods) => ({ id, role, quantity: 1, requires: { taste: taste.split(' '), texture: texture.split(' '), methods: methods.split(' ') } });
  const protein = id => slot(id, 'protein', 'savory', 'firm', 'fry');
  const vegetable = id => slot(id, 'vegetable', 'sweet', 'crisp', 'fry');
  const starch = id => slot(id, 'starch', 'mild', 'soft', 'boil');
  const fruit = id => slot(id, 'fruit', 'sweet sour', 'juicy', 'simmer');
  const dairy = id => slot(id, 'dairy', 'creamy', 'smooth', 'mix');
  const recipe = (name, difficulty, slots) => ({ name, difficulty, slots, result: name });
  L.recipes = {
    sweet_sour_pork: recipe('酢豚', .24, [protein('pork'), vegetable('onion'), fruit('pineapple')]),
    pork_saute: recipe('ポークソテー', .14, [protein('pork'), vegetable('onion')]),
    fruit_compote: recipe('フルーツコンポート', .17, [fruit('apple'), slot('lemon', 'acidity', 'sour', 'juicy', 'simmer')]),
    chicken_saute: recipe('チキンソテー', .18, [protein('chicken'), vegetable('broccoli')]),
    oyakodon: recipe('親子丼', .22, [protein('chicken'), protein('egg'), vegetable('onion'), starch('rice')]),
    omurice: recipe('オムライス', .35, [starch('rice'), protein('egg'), protein('chicken'), vegetable('tomato')]),
    vegetable_stir_fry: recipe('野菜炒め', .12, [vegetable('cabbage'), vegetable('carrot'), vegetable('pepper')]),
    fried_rice: recipe('チャーハン', .20, [starch('rice'), protein('egg'), vegetable('onion')]),
    curry: recipe('カレーライス', .24, [starch('rice'), protein('chicken'), vegetable('carrot'), vegetable('potato')]),
    nikujaga: recipe('肉じゃが', .22, [protein('pork'), vegetable('potato'), vegetable('onion')]),
    potato_salad: recipe('ポテトサラダ', .16, [vegetable('potato'), vegetable('cucumber'), vegetable('carrot')]),
    tomato_pasta: recipe('トマトパスタ', .17, [starch('pasta'), vegetable('tomato'), protein('tuna')]),
    mushroom_pasta: recipe('きのこパスタ', .18, [starch('pasta'), vegetable('shimeji'), vegetable('spinach'), dairy('cheese')]),
    salmon_saute: recipe('鮭のソテー', .20, [protein('salmon'), dairy('butter'), slot('lemon', 'acidity', 'sour', 'juicy', 'mix')]),
    tofu_stir_fry: recipe('豆腐炒め', .16, [protein('tofu'), vegetable('pepper'), vegetable('cabbage')]),
    vegetable_soup: recipe('野菜スープ', .12, [vegetable('pumpkin'), vegetable('carrot'), vegetable('broccoli')]),
    egg_sandwich: recipe('卵サンド', .10, [starch('bread'), protein('egg'), vegetable('cucumber')]),
    french_toast: recipe('フレンチトースト', .15, [starch('bread'), protein('egg'), dairy('milk'), dairy('butter')]),
    pancake: recipe('パンケーキ', .20, [slot('flour', 'starch', 'mild', 'powdery', 'bake'), protein('egg'), dairy('milk')]),
    banana_yogurt: recipe('バナナヨーグルト', .05, [slot('banana', 'fruit', 'sweet', 'soft', 'mix'), dairy('yogurt'), fruit('strawberry')])
  };
})(globalThis);
