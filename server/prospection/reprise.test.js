// La liste de prospection (12 oct. 2026) : un ordre fixe que les appels ne bougent pas,
// et le mode appel qui reprend juste après mon dernier appel.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-reprise-'));
const MA = await import('./mode-appel.js');

const ligne = (id, nom, score, etat = 'jamais') => ({ id, nom, genre: 'agence', pertinence: { score }, annonces: 0, statut: { etat } });

test('l\'ordre fixe ne dépend pas des appels', () => {
  const avant = MA.ordreStable([ligne('a', 'Alpha', 5), ligne('b', 'Beta', 9), ligne('c', 'Gamma', 1)]).map((x) => x.id);
  const apres = MA.ordreStable([ligne('a', 'Alpha', 5, 'contact'), ligne('b', 'Beta', 9, 'morte'), ligne('c', 'Gamma', 1, 'relance')]).map((x) => x.id);
  assert.deepEqual(avant, ['b', 'a', 'c']);
  assert.deepEqual(apres, avant);
});

test('la file reprend juste après le dernier appel, et fait le tour', () => {
  const ordre = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const file = ['a', 'c', 'd', 'e'].map((id) => ({ id }));
  assert.deepEqual(MA.reprendreApres(file, ordre, 'c').map((x) => x.id), ['d', 'e', 'a', 'c']);
  assert.deepEqual(MA.reprendreApres(file, ordre, 'b').map((x) => x.id), ['c', 'd', 'e', 'a'], 'b n\'est plus à appeler : on prend la suivante');
  assert.deepEqual(MA.reprendreApres(file, ordre, null).map((x) => x.id), ['a', 'c', 'd', 'e']);
});
