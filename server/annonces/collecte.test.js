import test from 'node:test';
import assert from 'node:assert/strict';
import { loyerAnnuel, memeAnnonce, serveurDisponible } from './collecte.js';

test('le loyer annuel : un loyer mensuel ×12', () => {
  assert.equal(loyerAnnuel({ loyer: 2000, periode: 'mois' }), 24000);
  assert.equal(loyerAnnuel({ loyer: 24000, periode: 'an' }), 24000);
  assert.equal(loyerAnnuel({ loyer: 0 }), null);
});

test('la même annonce chez deux agences donne la même clé ; un autre local, non', () => {
  const a = { id_local: 'L-06088_3372_00020', surface: 61, loyer_annuel: 24000 };
  assert.equal(memeAnnonce(a, { id_local: 'L-06088_3372_00020', surface: 60, loyer_annuel: 24300 }), true);
  assert.equal(memeAnnonce(a, { id_local: 'L-06088_3372_00022', surface: 60, loyer_annuel: 24000 }), false);
  assert.equal(memeAnnonce(a, { id_local: 'L-06088_3372_00020', surface: 60, loyer_annuel: 30000 }), false);
});

test('le budget par serveur : écart étalé sur la journée, plafond du jour, coupure de 7 jours', () => {
  const now = Date.parse('2026-10-19T10:00:00Z');
  assert.equal(serveurDisponible({}, now, 120), true);
  assert.equal(serveurDisponible({ derniere: '2026-10-19T09:59:00Z' }, now, 120), false);
  assert.equal(serveurDisponible({ derniere: '2026-10-19T09:40:00Z', jour: '2026-10-19', requetes: 5 }, now, 120), true);
  assert.equal(serveurDisponible({ jour: '2026-10-19', requetes: 120 }, now, 120), false);
  assert.equal(serveurDisponible({ coupe_jusqua: '2026-10-25T00:00:00Z' }, now, 120), false);
});
