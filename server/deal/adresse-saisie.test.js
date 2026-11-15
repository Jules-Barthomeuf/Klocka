// Une adresse tapée à la main (14 nov. 2026) : sans code postal ni virgule, la BAN dit où finit la rue.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-adresse-saisie-'));
const { adresseSaisie } = await import('./index.js');

const ban = async () => ({ numero: '5', rue: 'Place de la Libération', code_postal: '56100', ville: 'Lorient' });

test('« 5 Place de la Libération Lorient » : la rue, le code postal et la ville, plus la phrase entière en ville', async () => {
  assert.deepEqual(await adresseSaisie('5 Place de la Libération Lorient', { resoudre: ban }), { rue: '5 Place de la Libération', code_postal: '56100', ville: 'Lorient' });
});

test('une adresse avec code postal ou virgule se lit sans la BAN', async () => {
  const jamais = async () => { throw new Error('appelée'); };
  assert.deepEqual(await adresseSaisie('8 rue Félix Poulat, 38000 Grenoble', { resoudre: jamais }), { rue: '8 rue Félix Poulat', code_postal: '38000', ville: 'Grenoble' });
  assert.deepEqual(await adresseSaisie('12 rue Neuve, Lyon', { resoudre: jamais }), { rue: '12 rue Neuve', code_postal: null, ville: 'Lyon' });
});

test('une ville seule, une BAN muette ou en panne : la lecture d\'avant', async () => {
  assert.deepEqual(await adresseSaisie('Lorient', { resoudre: ban }), { rue: null, code_postal: null, ville: 'Lorient' });
  assert.deepEqual(await adresseSaisie('5 Place Inconnue Nulle-Part', { resoudre: async () => null }), { rue: null, code_postal: null, ville: '5 Place Inconnue Nulle-Part' });
  assert.deepEqual(await adresseSaisie('5 Place Inconnue Nulle-Part', { resoudre: async () => { throw new Error('panne'); } }), { rue: null, code_postal: null, ville: '5 Place Inconnue Nulle-Part' });
});
