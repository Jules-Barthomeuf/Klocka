// « Quoi de neuf » : les journées à montrer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { journeesAVoir, NOUVEAUTES } from '../src/lib/nouveautes.js';

const J = [
  { jour: '2026-10-16', items: [{ titre: 'a' }] },
  { jour: '2026-10-14', items: [{ titre: 'b' }] },
  { jour: '2026-10-01', items: [{ titre: 'vieux' }] },
  { jour: '2026-10-20', items: [{ titre: 'à venir' }] },
];

test('les journées pas encore vues, des sept derniers jours, la plus récente d’abord', () => {
  assert.deepEqual(journeesAVoir(null, '2026-10-16', J).map((j) => j.jour), ['2026-10-16', '2026-10-14']);
  assert.deepEqual(journeesAVoir('2026-10-14', '2026-10-16', J).map((j) => j.jour), ['2026-10-16']);
  assert.deepEqual(journeesAVoir('2026-10-16', '2026-10-16', J), []);
  assert.deepEqual(journeesAVoir(null, '2026-10-30', J), [], 'plus rien de récent');
  assert.deepEqual(journeesAVoir(null, '2026-10-16', J).some((j) => j.jour === '2026-10-20'), false, 'pas avant son jour');
});

test('chaque nouveauté a un titre et une phrase', () => {
  for (const j of NOUVEAUTES) {
    assert.match(j.jour, /^\d{4}-\d{2}-\d{2}$/);
    for (const x of j.items) { assert.ok(x.titre); assert.ok(x.texte?.length > 20); }
  }
});
