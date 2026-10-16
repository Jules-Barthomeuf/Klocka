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

test('les noms de l\'équipe (16 oct. 2026) : les formes rares partout, les mots courants seulement après le prénom ou « Madame »', () => {
  assert.equal(corrigerKlocka('Bonjour, ici Coralie Guillot et Nora Lorinquet, de chez Cloaca.'), 'Bonjour, ici Coralie Guillaud et Nora Lorinquer, de chez Klocka.');
  assert.equal(corrigerKlocka('Je vous passe Maxime Palma, Jules Barthomieu ou Paul de Zuluta. Madame Guillaume vous rappellera.'), 'Je vous passe Maxime Pama, Jules Barthomeuf ou Paul de Zulueta. Madame Guillaume vous rappellera.'.replace('Madame Guillaume', 'Madame Guillaud'));
  assert.equal(corrigerKlocka('Coraly Guyot, Norah Laurinquer, M. Pamma, Paul de Zoulouéta'), 'Coralie Guillaud, Nora Lorinquer, M. Pama, Paul de Zulueta');
  // Ce qui peut être quelqu'un d'autre reste tel quel.
  for (const t of ['Guillaume Dupont', 'Saint-Guillaume', 'le Panama', 'la Palma', 'Monsieur Palma', 'Monsieur Barthélémy', 'Madame Guilbert']) assert.equal(corrigerKlocka(t), t);
});

test('le vocabulaire donné à Voxtral : un mot par entrée, sans espace ni virgule', async () => {
  const { VOCABULAIRE, EQUIPE } = await import('./klocka-nom.js');
  assert.ok(VOCABULAIRE.includes('Klocka') && VOCABULAIRE.includes('Guillaud'));
  for (const m of VOCABULAIRE) assert.doesNotMatch(m, /[\s,]/);
  assert.equal(EQUIPE.length, 5);
});
