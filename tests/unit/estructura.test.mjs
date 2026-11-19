// Revisa que index.html cargue todos los módulos de js/ con su número de versión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');

test('cada archivo de js/ está en el importmap con ?v=', () => {
  const mods = fs.readdirSync(new URL('js/', root)).filter(f => f.endsWith('.js'));
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const m of mods) assert.match(map[`./js/${m}`] || '', /\?v=\d+$/, `falta ${m} en el importmap (corre: node tools/bump-version.mjs)`);
});

test('main.js y app.css usan la misma versión que el importmap', () => {
  const vs = new Set([...html.matchAll(/\?v=(\d+)/g)].map(m => m[1]));
  assert.equal(vs.size, 1, 'hay versiones mezcladas: corre node tools/bump-version.mjs');
});
