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

test("le nom de Paul aussi : « de Zulveta », « de Silueta » deviennent « de Zulueta »", () => {
  assert.equal(corrigerKlocka("Oui, bonjour, Paul de Zulveta, l'appareil."), "Oui, bonjour, Paul de Zulueta, l'appareil.");
  assert.equal(corrigerKlocka('Enchanté, Paul de Silueta. Je suis le cofondateur de la société Cloaca'), 'Enchanté, Paul de Zulueta. Je suis le cofondateur de la société Klocka');
  assert.equal(corrigerKlocka("qui s'appelle CloCA"), "qui s'appelle Klocka");
  for (const mot of ['petites cloques', 'Sultan', 'statue', 'la suite']) assert.equal(corrigerKlocka(mot), mot);
});
