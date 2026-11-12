// Les deux domaines : app.klocka.immo et app.kpartners.immo (12 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-dom-'));
const { espaceDeHote, adressesDesEspaces, suiteSure, creerPassage, consommerPassage } = await import('./domaines.js');

test("le domaine dit l'espace", () => {
  assert.equal(espaceDeHote('app.kpartners.immo'), 'kpartners');
  assert.equal(espaceDeHote('kpartners.localhost:5173'), 'kpartners');
  assert.equal(espaceDeHote('app.klocka.immo'), 'klocka');
  assert.equal(espaceDeHote('localhost:5173'), 'klocka');
});

test("en ligne, K Partners reste coupé tant que son adresse n'est pas posée", () => {
  assert.deepEqual(adressesDesEspaces('app.klocka.immo', 'https', { urlKpartners: '', urlKlocka: 'https://app.klocka.immo' }), { klocka: 'https://app.klocka.immo', kpartners: null });
  assert.equal(adressesDesEspaces('app.klocka.immo', 'https', { urlKpartners: 'https://app.kpartners.immo/', urlKlocka: 'https://app.klocka.immo' }).kpartners, 'https://app.kpartners.immo');
  assert.deepEqual(adressesDesEspaces('localhost:5173', 'http'), { klocka: 'http://localhost:5173', kpartners: 'http://kpartners.localhost:5173' });
});

test('un passage ne mène jamais hors de la plateforme', () => {
  assert.equal(suiteSure('/Biens?x=1'), '/Biens?x=1');
  for (const x of ['https://autre.site', '//autre.site', '/\\autre.site', null, '']) assert.equal(suiteSure(x), '/');
});

test("un jeton de passage sert une fois, et pas après soixante secondes", () => {
  const j = creerPassage('Jules.B@klocka.immo');
  assert.equal(consommerPassage(j), 'jules.b@klocka.immo');
  assert.equal(consommerPassage(j), null);
  assert.equal(consommerPassage('inconnu'), null);
});
