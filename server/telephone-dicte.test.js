import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recollerTelephones } from '../src/lib/telephone-dicte.js';

test('un numéro dicté se recolle par paires, quelle que soit la façon dont la reconnaissance l\'a écrit', () => {
  assert.equal(recollerTelephones('son numéro 0631 24 5836 merci'), 'son numéro 06 31 24 58 36 merci');
  assert.equal(recollerTelephones('Son numéro : 06, 31, 24, 58, 36.'), 'Son numéro : 06 31 24 58 36.');
  assert.equal(recollerTelephones('appelle-le au zéro 6 31 24 58 36'), 'appelle-le au 06 31 24 58 36');
  assert.equal(recollerTelephones('+33 6 31 24 58 36'), '06 31 24 58 36');
  assert.equal(recollerTelephones('fixe 04-93-12-34-56'), 'fixe 04 93 12 34 56');
});

test('le zéro mangé se rajoute seulement après « numéro », « téléphone »…', () => {
  assert.equal(recollerTelephones('son portable c\'est le 6 31 24 58 36'), 'son portable c\'est le 06 31 24 58 36');
  assert.equal(recollerTelephones('il a 6 31 24 58 36'), 'il a 6 31 24 58 36');
});

test('les autres nombres ne bougent pas', () => {
  const t = 'Loyer 45 000 € par an, 120 m², prix 1 200 000 €, bail du 12 03 2021.';
  assert.equal(recollerTelephones(t), t);
  assert.equal(recollerTelephones('3 lots. 06 31 24 58 36'), '3 lots. 06 31 24 58 36');
});
