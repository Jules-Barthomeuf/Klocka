// L'environnement d'un bien pour l'avis (1er nov. 2026) : les commerces voisins résumés, la vacance réduite à ce
// que l'avis peut dire, l'environnement gardé qui sert encore.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-avis-env-'));
const { voisinage, vacanceLisible, environnementFrais } = await import('./avis-environnement.js');

test('les commerces voisins : le bien exclu, au-delà du rayon ignorés, activités et enseignes', () => {
  const p = { lat: 43.5774, lon: 7.1185 };
  const c = [
    { id: 'bien', lat: 43.5774, lon: 7.1185, activite: 'Courtier', enseigne: 'Ba & Co' },
    { id: 'a', lat: 43.5775, lon: 7.1186, activite: 'Coiffure', enseigne: 'Salon Léa' },
    { id: 'b', lat: 43.5776, lon: 7.1184, activite: 'Coiffure', enseigne: 'Coiffure Bis' },
    { id: 'c', lat: 43.5778, lon: 7.1187, activite: 'Restauration rapide', enseigne: 'Quick' },
    { id: 'loin', lat: 43.59, lon: 7.13, activite: 'Banque', enseigne: 'BNP' },
    { id: 'siege', lat: 43.5775, lon: 7.1185, activite: 'Messagerie', classe: 'entrepot' },
    { id: 'conseil', lat: 43.5775, lon: 7.1185, activite: 'Conseil en entreprise', classe: 'bureau' },
  ];
  const v = voisinage(p, c, { exclure: 'bien', marque: (n) => (n === 'Quick' ? { n: 'Quick' } : null) });
  assert.equal(v.commerces, 3);
  assert.deepEqual(v.activites[0], { activite: 'Coiffure', n: 2 });
  assert.deepEqual(v.enseignes_nationales.map((x) => x.marque), ['Quick']);
  assert.equal(voisinage(p, [], {}), null);
});

test('la vacance lisible : le taux et les rues, pas les locaux un à un', () => {
  const v = vacanceLisible({ ok: true, rayon_m: 300, nb_locaux_vides: 12, signaux: { total: 314, repartition: { fermeture: 289 } },
    taux: { locaux: 129, vacants: 12, taux: 9.4, fiable: true, rues: [{ voie: 'BOULEVARD PRESIDENT WILSON', locaux: 53, vacants: 1, taux: 1.9, occupes: 51 }] } });
  assert.equal(v.taux.taux, 9.4);
  assert.equal(v.taux.rues, undefined);
  assert.deepEqual(v.rues[0], { voie: 'BOULEVARD PRESIDENT WILSON', locaux: 53, vacants: 1, taux: 1.9 });
  assert.equal(vacanceLisible({ ok: false }), null);
});

test("l'environnement gardé sert pour la même adresse, sept jours", () => {
  const le = new Date('2026-11-04T10:00:00Z').toISOString();
  const e = { environnement: { adresse: '35 bd Wilson', le } };
  assert.equal(environnementFrais(e, '35 bd Wilson', Date.parse('2026-11-06T10:00:00Z')), true);
  assert.equal(environnementFrais(e, '12 rue Sade', Date.parse('2026-11-06T10:00:00Z')), false);
  assert.equal(environnementFrais(e, '35 bd Wilson', Date.parse('2026-11-12T10:00:00Z')), false);
  const avant = { environnement: { adresse: '35 bd Wilson', le: '2026-11-02T10:00:00.000Z' } };
  assert.equal(environnementFrais(avant, '35 bd Wilson', Date.parse('2026-11-03T15:00:00Z')), false, 'lu quand les bureaux comptaient : relu');
});
