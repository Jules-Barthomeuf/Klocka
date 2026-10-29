// La carte de Klocka (22 oct. 2026) : les villes et les coordonnées lues dans Monday.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-carte-'));
const { villeDeLAdresse, villePropre, pointMonday } = await import('./carte.js');

test('la ville d\'une adresse, une ville saisie à la main, les coordonnées d\'une colonne Sunday CRM', () => {
  assert.equal(villeDeLAdresse('10 Place Abel Surchamp, 33500 Libourne'), 'Libourne');
  assert.equal(villeDeLAdresse('300 Rue de Vaugirard, Paris, France'), 'Paris');
  assert.equal(villeDeLAdresse('2 Rue aux Toiles, Saint-Brieuc, 22000, France'), 'Saint-Brieuc');
  assert.equal(villeDeLAdresse('56 Avenue Robert Schuman, Ajaccio, France'), 'Ajaccio');
  assert.equal(villeDeLAdresse('97 Rue de la République'), null);
  assert.equal(villePropre('Paris et ses environs'), 'Paris');
  assert.equal(villePropre('Cannes / Antibes'), 'Cannes');
  assert.deepEqual(pointMonday('{"lat":"40.7127753","lng":"-74.0059728","address":"New York"}'), { lat: 40.7127753, lon: -74.0059728 });
  assert.equal(pointMonday('{}'), null);
  assert.equal(pointMonday(null), null);
});
