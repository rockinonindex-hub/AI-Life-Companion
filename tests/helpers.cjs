'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
for (const file of ['presets/recipes.js','presets/ingredients.js','presets/snacks.js','data.js','cooking.js','events.js','simulation.js','storage.js']) vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file });
module.exports = { L: globalThis.Life, start: Date.parse('2026-11-01T00:00:00+09:00'), root };
