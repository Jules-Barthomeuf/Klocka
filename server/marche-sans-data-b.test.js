// Data-B filtré : l'assistant le dit simplement et passe à Equimmox ; une ville seule ne part pas se chercher.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-marche-'));
const { adresseAvecRue } = await import('./adresse-ban.js');
const { dataBBloque, DATA_B_BLOQUE } = await import('./data-b-assistant.js');

test('une ville seule, même avec son code postal, ne vaut pas une adresse', () => {
  assert.equal(adresseAvecRue('Toulouse'), false);
  assert.equal(adresseAvecRue('31000 Toulouse'), false);
  assert.equal(adresseAvecRue("28 Boulevard d'Arcole, Toulouse"), true);
  assert.equal(adresseAvecRue('rue du Taur, Toulouse'), true);
  assert.equal(adresseAvecRue(''), false);
});

test('le filtre devant Data-B se reconnaît, une adresse sans résultat non', () => {
  assert.equal(dataBBloque({ error: 'Data-B ne répond pas comme attendu (pas de session). ; navigateur : Data-B a répondu 403.' }), true);
  assert.equal(dataBBloque({ statut: 403, error: 'x' }), true);
  assert.equal(dataBBloque({ error: "Data-B n'a pas rendu d'estimation pour cette adresse." }), false);
  assert.match(DATA_B_BLOQUE, /Equimmox/);
  assert.doesNotMatch(DATA_B_BLOQUE, /403/);
});
