// « Compléter les colonnes vides » de l'agent IA des agences : ce qui compte
// comme vide, et quand une fiche trouvée est bien la même agence.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-completer-'));
const { colonnesVides, memeNom } = await import('./agent-ia.js');

test('les colonnes vides sont celles que le tableau montre en tiret', () => {
  assert.deepEqual(colonnesVides({ nom: 'Agence du Centre' }), ['adresse', 'site', 'maps', 'telephone', 'gerants', 'agents']);
  const pleine = { adresse: '3 rue X', site: 'x.fr', maps_url: 'https://maps', telephone: '01 02', gerants: [{ nom: 'A' }], agents: [{ nom: 'B' }] };
  assert.deepEqual(colonnesVides(pleine), []);
  // Le numéro d'un agent suffit : le tableau l'affiche dans la colonne Téléphone.
  assert.deepEqual(colonnesVides({ ...pleine, telephone: null, agents: [{ telephone: '06' }] }), []);
});

test("une fiche trouvée n'est prise que si elle porte un mot du nom", () => {
  assert.equal(memeNom('Agence du Centre Immobilier', 'Centre Immobilier Mâcon'), true);
  assert.equal(memeNom('Laforêt Mâcon', 'Laforêt'), true);
  assert.equal(memeNom('Agence du Centre', 'Century 21 Saint-Pierre'), false);
});
