// Le nom de Klocka, corrigé dans toute transcription (14 oct. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { corrigerKlocka, NOTE_KLOCKA } from './klocka-nom.js';

test('les formes écorchées deviennent Klocka, les mots voisins restent', () => {
  assert.equal(corrigerKlocka('Bonjour, ici Cloaca, je vous appelle'), 'Bonjour, ici Klocka, je vous appelle');
  assert.equal(corrigerKlocka('Cloaca, Kloka, Klokka, Cloaka et Clocka.'), 'Klocka, Klocka, Klocka, Klocka et Klocka.');
  assert.equal(corrigerKlocka('le cloaque'), 'le Klocka');
  assert.equal(corrigerKlocka('Klocka reste Klocka'), 'Klocka reste Klocka');
  for (const mot of ['Cloakroom', 'Clockwork', 'Claude', 'cloche', 'Cloacas']) assert.equal(corrigerKlocka(mot), mot);
  assert.equal(corrigerKlocka(null), null);
  assert.match(NOTE_KLOCKA, /Cloaca/);
});
