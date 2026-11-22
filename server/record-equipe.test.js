// La pop-up « Record de l'équipe » : une fois par semaine, aux admins seuls.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aMontrer, semaineDe } from './record-equipe.js';

test('la semaine commence le lundi, à l\'heure de Paris', () => {
  assert.equal(semaineDe(new Date('2026-11-23T08:00:00Z')), '2026-11-23'); // lundi matin
  assert.equal(semaineDe(new Date('2026-11-22T21:00:00Z')), '2026-11-16'); // dimanche soir
  assert.equal(semaineDe(new Date('2026-11-22T23:30:00Z')), '2026-11-23'); // déjà lundi à Paris
  assert.equal(semaineDe(new Date('2026-11-26T12:00:00Z')), '2026-11-23'); // jeudi
});

test('une fois par semaine, aux admins seuls', () => {
  const lundi = new Date('2026-11-23T08:00:00Z');
  assert.equal(aMontrer({ role: 'admin' }, lundi), true);
  assert.equal(aMontrer({ role: 'admin', record_vu_semaine: '2026-11-16' }, lundi), true);
  assert.equal(aMontrer({ role: 'admin', record_vu_semaine: '2026-11-23' }, lundi), false);
  assert.equal(aMontrer({ role: 'mandataire' }, lundi), false);
  assert.equal(aMontrer(null, lundi), false);
});
