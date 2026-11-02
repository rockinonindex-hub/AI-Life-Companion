(function (root) {
  'use strict';
  const L = root.Life;
  const item = (name, type, taste, texture, methods, emoji, roles = type) => ({ name, type, taste: taste.split(' '), texture: texture.split(' '), methods: methods.split(' '), substitutes: roles.split(' '), emoji });
  L.ingredients = {
    pork: item('豚肉','protein','savory','firm','fry simmer','🥩'),
    chicken: item('鶏肉','protein','savory','firm','fry simmer','🍗'),
    onion: item('玉ねぎ','vegetable','sweet','crisp soft','fry simmer boil','🧅'),
    carrot: item('にんじん','vegetable','sweet','crisp firm','fry simmer boil','🥕'),
    pineapple: item('パイナップル','fruit','sweet sour','juicy','mix simmer fry','🍍','fruit sweetness acidity'),
    apple: item('りんご','fruit','sweet sour','juicy crisp','mix simmer bake','🍎','fruit sweetness acidity'),
    lemon: item('レモン','fruit','sour','juicy','mix simmer','🍋','fruit acidity'),
    rice: item('米','starch','mild','soft','boil fry','🍚'),
    egg: item('卵','protein','savory mild','soft smooth','fry boil bake','🥚'),
    milk: item('牛乳','dairy','creamy mild','smooth liquid','mix simmer bake','🥛'),
    flour: item('小麦粉','starch','mild','powdery','bake fry','🌾'),
    butter: item('バター','dairy','creamy buttery','smooth','mix fry bake','🧈'),
    potato: item('じゃがいも','vegetable','mild sweet','soft firm','boil fry simmer','🥔','vegetable starch'),
    cabbage: item('キャベツ','vegetable','sweet mild','crisp','fry boil simmer','🥬'),
    pepper: item('ピーマン','vegetable','bitter mild','crisp','fry bake','🫑'),
    tomato: item('トマト','vegetable','sweet sour savory','juicy soft','mix simmer fry','🍅','vegetable acidity'),
    cucumber: item('きゅうり','vegetable','mild','crisp juicy','mix','🥒'),
    spinach: item('ほうれん草','vegetable','mild bitter','soft','boil fry','🥬'),
    shimeji: item('しめじ','vegetable','savory','firm','fry simmer boil','🍄'),
    tofu: item('豆腐','protein','mild','soft smooth','fry simmer boil','◻️'),
    salmon: item('鮭','protein','savory','firm soft','fry bake','🐟'),
    tuna: item('ツナ','protein','savory','soft','mix fry simmer','🐟'),
    pasta: item('パスタ','starch','mild','firm soft','boil fry','🍝'),
    bread: item('食パン','starch','mild','soft porous','mix fry bake','🍞'),
    cheese: item('チーズ','dairy','creamy savory','smooth firm','mix bake','🧀'),
    yogurt: item('ヨーグルト','dairy','creamy sour','smooth','mix','🥣'),
    banana: item('バナナ','fruit','sweet','soft','mix bake','🍌','fruit sweetness'),
    strawberry: item('いちご','fruit','sweet sour','juicy','mix simmer','🍓','fruit sweetness acidity'),
    pumpkin: item('かぼちゃ','vegetable','sweet','soft firm','boil simmer bake','🎃','vegetable starch'),
    broccoli: item('ブロッコリー','vegetable','mild','crisp firm','boil fry','🥦')
  };
})(globalThis);
