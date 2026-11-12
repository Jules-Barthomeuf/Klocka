import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centile, statsPages } from './temps-chargement.js';

test('le centile : la médiane et le temps des 10 % les plus lents', () => {
  const v = [100, 200, 300, 400, 500, 600, 700, 800, 900, 5000];
  assert.equal(centile(v, 50), 500);
  assert.equal(centile(v, 90), 900);
  assert.equal(centile([], 50), null);
});

test('les pages : la période, la précédente pour comparer, la plus lente en tête', () => {
  const maintenant = Date.parse('2026-11-11T12:00:00Z');
  const il = (j) => new Date(maintenant - j * 86400000).toISOString();
  const lignes = [
    { page: 'Prospection', ms: 900, le: il(1) }, { page: 'Prospection', ms: 1100, le: il(2) },
    { page: 'Prospection', ms: 2000, le: il(10) },
    { page: 'CRM', ms: 3000, le: il(3) },
    { page: 'Vieille', ms: 100, le: il(40) },
  ];
  const r = statsPages(lignes, { jours: 7, maintenant });
  assert.deepEqual(r.map((x) => x.page), ['CRM', 'Prospection']);
  const p = r.find((x) => x.page === 'Prospection');
  assert.equal(p.n, 2);
  assert.equal(p.mediane, 900);
  assert.equal(p.mediane_avant, 2000);
});
