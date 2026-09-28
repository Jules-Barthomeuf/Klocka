// Le menu en deux groupes (src/lib/menu.js) : origine, choix de la personne, entrées nouvelles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { repartir } from '../src/lib/menu.js';

const P = [{ cle: 'A', label: 'A' }, { cle: 'B', label: 'B' }];
const X = [{ cle: 'C', label: 'C' }, { cle: 'D', label: 'D' }];
const cles = (l) => l.map((e) => e.cle);

test('menu : sans choix, chaque entrée reste dans son groupe d\'origine', () => {
  const r = repartir(P, X);
  assert.deepEqual(cles(r.principal), ['A', 'B']);
  assert.deepEqual(cles(r.autre), ['C', 'D']);
});

test('menu : les entrées vont où la personne les a posées, dans son ordre, masques retirés', () => {
  const r = repartir(P, X, { ordre: ['C', 'A', 'B', 'D'], menuAutre: ['B', 'D'], masques: ['D'] });
  assert.deepEqual(cles(r.principal), ['C', 'A']);
  assert.deepEqual(cles(r.autre), ['B']);
});

test('menu : tout peut aller dans un seul groupe, et une entrée nouvelle garde son origine', () => {
  const r = repartir([...P, { cle: 'N', label: 'N' }], X, { ordre: ['A', 'B', 'C', 'D'], menuAutre: [] });
  assert.deepEqual(cles(r.principal), ['A', 'B', 'C', 'D', 'N']);
  assert.deepEqual(cles(r.autre), []);
});
