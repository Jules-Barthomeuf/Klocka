import test from 'node:test';
import assert from 'node:assert/strict';
import { dateDuFait } from './date-du-fait.js';

// Jeudi 26 novembre 2026, à midi à Paris.
const JEUDI = new Date('2026-11-26T11:00:00Z');

test('un jour de la semaine : le dernier passé, aujourd\'hui compris', () => {
  assert.equal(dateDuFait('mardi', JEUDI), '2026-11-24');
  assert.equal(dateDuFait('Mardi', JEUDI), '2026-11-24');
  assert.equal(dateDuFait('vendredi', JEUDI), '2026-11-20');
  assert.equal(dateDuFait('jeudi', JEUDI), '2026-11-26');
  assert.equal(dateDuFait('jeudi dernier', JEUDI), '2026-11-19');
});

test('hier, avant-hier, ce matin, il y a', () => {
  assert.equal(dateDuFait('hier', JEUDI), '2026-11-25');
  assert.equal(dateDuFait('avant-hier', JEUDI), '2026-11-24');
  assert.equal(dateDuFait('ce matin', JEUDI), '2026-11-26');
  assert.equal(dateDuFait('il y a 3 jours', JEUDI), '2026-11-23');
  assert.equal(dateDuFait('il y a deux semaines', JEUDI), '2026-11-12');
});

test('une date : jamais dans l\'avenir', () => {
  assert.equal(dateDuFait('le 12 novembre', JEUDI), '2026-11-12');
  assert.equal(dateDuFait('le 3 décembre', JEUDI), '2025-12-03');
  assert.equal(dateDuFait('le 12', JEUDI), '2026-11-12');
  assert.equal(dateDuFait('le 28', JEUDI), '2026-10-28');
  assert.equal(dateDuFait('12/11', JEUDI), '2026-11-12');
  assert.equal(dateDuFait('le 1er octobre', JEUDI), '2026-10-01');
});

test('ce qu\'on ne sait pas lire : rien', () => {
  assert.equal(dateDuFait('', JEUDI), null);
  assert.equal(dateDuFait(null, JEUDI), null);
  assert.equal(dateDuFait('la semaine dernière', JEUDI), null);
  assert.equal(dateDuFait('récemment', JEUDI), null);
});
