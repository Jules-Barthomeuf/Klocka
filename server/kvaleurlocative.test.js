// Valeur locative : la coloration des IRIS d'après les recherches en base.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kvl-'));
const { colorerSecteurs, normaliser, listerRecherches } = await import('./kvaleurlocative.js');

const iris = (nom, code = '1') => ({ properties: { code_iris: code, nom_iris: nom, code_insee: '31555' }, geometry: { type: 'Polygon', coordinates: [] } });

test('un IRIS prend la fourchette du quartier déjà recherché, les autres celle de la ville', () => {
  const recherches = [
    { quartier: { nom: 'Roguet', basse: 220, haute: 331 }, ville: { nom: 'Toulouse', basse: 208, haute: 312 } },
    { quartier: { nom: 'Saint-Rome', basse: 400, haute: 600 }, ville: { nom: 'Toulouse', basse: 208, haute: 312 } },
  ];
  const s = colorerSecteurs([iris('Roguet', 'a'), iris('SAINT ROME', 'b'), iris('Capitole', 'c')], recherches, 'Roguet');

  assert.equal(s[0].source, 'quartier'); assert.equal(s[0].basse, 220); assert.equal(s[0].ici, true);
  assert.equal(s[1].source, 'quartier', 'la casse, les accents et les tirets ne comptent pas'); assert.equal(s[1].haute, 600); assert.equal(s[1].ici, false);
  assert.equal(s[2].source, 'ville'); assert.equal(s[2].basse, 208);
  // Sans aucune recherche, rien n'est coloré : pas de valeur inventée.
  assert.equal(colorerSecteurs([iris('Roguet')], [])[0].source, null);
});

test('les noms se normalisent, et la liste des recherches part vide', () => {
  assert.equal(normaliser('  Saint-Étienne / Ozenne '), 'saint etienne ozenne');
  assert.deepEqual(listerRecherches(), []);
});
