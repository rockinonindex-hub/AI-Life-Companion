(function (root) {
  'use strict';
  const L = root.Life;
  const snack = (name, taste, texture, methods, emoji, roles = 'sweetness starch') => ({ name, type: 'snack', taste: taste.split(' '), texture: texture.split(' '), methods: methods.split(' '), substitutes: roles.split(' '), emoji });
  L.snacks = {
    kouignAmann: snack('クイニーアマン','sweet buttery','crisp','bake fry','🥮'),
    cookie: snack('クッキー','sweet','crisp crumbly','mix bake','🍪'),
    chocolate: snack('チョコレート','sweet bitter','smooth','mix simmer','🍫','sweetness'),
    castella: snack('カステラ','sweet','soft porous','mix','🍰'),
    biscuit: snack('ビスケット','mild sweet','crisp crumbly','mix bake','🍪'),
    marshmallow: snack('マシュマロ','sweet','soft','mix bake','☁️','sweetness'),
    senbei: snack('せんべい','savory','crisp','mix','🍘','starch'),
    yokan: snack('ようかん','sweet','smooth firm','mix','🫘','sweetness'),
    donut: snack('ドーナツ','sweet buttery','soft porous','mix fry','🍩'),
    pudding: snack('プリン','sweet creamy','smooth soft','mix','🍮','sweetness dairy')
  };
})(globalThis);
