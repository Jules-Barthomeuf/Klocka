// Valeur locative : les quatre classes des IRIS, par valeur connue ou par indice.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kvl-'));
const { colorerSecteurs, normaliser, listerRecherches, classerParValeur, classerParIndice, indiceDe, contient, aireKm2 } = await import('./kvaleurlocative.js');

const carre = (x, y, cote = 0.01) => ({ type: 'Polygon', coordinates: [[[x, y], [x + cote, y], [x + cote, y + cote], [x, y + cote], [x, y]]] });
const iris = (nom, code, geom) => ({ properties: { code_iris: code, nom_iris: nom, code_insee: '31555' }, geometry: geom });

test('un quartier lu par Data-B se classe contre la fourchette de la ville', () => {
  const ville = { basse: 200, haute: 300 };
  assert.equal(classerParValeur({ basse: 320, haute: 400 }, ville), 'tres_elevee');
  assert.equal(classerParValeur({ basse: 240, haute: 280 }, ville), 'elevee');
  assert.equal(classerParValeur({ basse: 200, haute: 240 }, ville), 'moyenne');
  assert.equal(classerParValeur({ basse: 120, haute: 180 }, ville), 'tres_faible');
  assert.equal(classerParValeur(null, ville), null);
});

test('l\'indice compte les commerces et le niveau de vie dans chaque IRIS, puis classe par quantiles', () => {
  const a = iris('Centre', 'a', carre(1.44, 43.60));
  const b = iris('Couronne', 'b', carre(1.45, 43.60));
  const c = iris('Faubourg', 'c', carre(1.46, 43.60));
  const d = iris('Périphérie', 'd', carre(1.47, 43.60));
  const dans = (x, y, n) => Array.from({ length: n }, (_, i) => [x + 0.001 + (i % 9) * 0.001, y + 0.005]);
  const commerces = [...dans(1.44, 43.60, 40), ...dans(1.45, 43.60, 12), ...dans(1.46, 43.60, 3)];
  const carreaux = [
    { geometry: carre(1.441, 43.601, 0.002), properties: { ind: 100, ind_snv: 3000000 } },
    { geometry: carre(1.471, 43.601, 0.002), properties: { ind: 100, ind_snv: 1500000 } },
  ];
  const ind = indiceDe([a, b, c, d], commerces, carreaux);

  assert.deepEqual(ind.map((x) => x.commerces), [40, 12, 3, 0]);
  assert.equal(ind[0].niveau_de_vie, 30000);
  assert.equal(ind[1].niveau_de_vie, null, 'aucun carreau : pas de niveau de vie, l\'indice ne tient que sur les commerces');
  assert.ok(ind[0].score > ind[1].score && ind[1].score > ind[2].score && ind[2].score > ind[3].score);
  assert.ok(contient(a.geometry, 1.445, 43.605) && !contient(a.geometry, 1.455, 43.605));
  assert.ok(Math.abs(aireKm2(a.geometry) - 0.8) < 0.15, 'un carré d\'un centième de degré à Toulouse fait un peu moins d\'un km²');

  const classes = classerParIndice(ind);
  assert.equal(classes.d, 'tres_faible', 'le dernier est en périphérie');
  assert.equal(classes.a, ['tres_elevee', 'elevee'].includes(classes.a) ? classes.a : 'raté', 'le premier est en haut');

  // Les secteurs colorés : un quartier lu par Data-B garde sa vraie fourchette.
  const recherches = [{ quartier: { nom: 'Couronne', basse: 400, haute: 600 }, ville: { nom: 'Toulouse', basse: 208, haute: 312 } }];
  const s = colorerSecteurs([a, b, c, d], recherches, 'Couronne', { secteurs: ind });
  assert.equal(s[1].origine, 'quartier'); assert.equal(s[1].niveau, 'tres_elevee'); assert.equal(s[1].ici, true); assert.equal(s[1].basse, 400);
  assert.equal(s[0].origine, 'indice'); assert.equal(s[0].basse, null, 'aucun euro inventé pour un quartier non lu');
  assert.equal(s[3].niveau, 'tres_faible');
  // Sans indice ni recherche : rien n'est coloré.
  assert.equal(colorerSecteurs([a], [])[0].niveau, null);
});

test('les noms se normalisent, et la liste des recherches part vide', () => {
  assert.equal(normaliser('  Saint-Étienne / Ozenne '), 'saint etienne ozenne');
  assert.deepEqual(listerRecherches(), []);
});
