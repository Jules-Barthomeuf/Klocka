// K-Expertise : les générateurs de flux, classés et dédoublonnés.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kexpertise-'));
const { classerGenerateurs, ZONES, ETAPES, lancerExpertise } = await import('./kexpertise.js');

const CENTRE = { lat: 48.8565, lon: 2.3785 };

test('les générateurs se classent du plus proche, par bande, et un arrêt à deux quais compte une fois', () => {
  const g = classerGenerateurs([
    { type: 'node', id: 1, lat: 48.8569, lon: 2.3785, tags: { highway: 'bus_stop', name: 'Popincourt' } },
    { type: 'node', id: 2, lat: 48.8571, lon: 2.3786, tags: { highway: 'bus_stop', name: 'Popincourt' } },
    { type: 'node', id: 3, lat: 48.8572, lon: 2.3790, tags: { shop: 'supermarket', name: 'Monoprix', 'addr:housenumber': '166', 'addr:street': 'Avenue Ledru-Rollin' } },
    { type: 'node', id: 4, lat: 48.8580, lon: 2.3800, tags: { railway: 'subway_entrance', name: 'Voltaire' } },
    // Sans point : écarté. Un banc : pas un générateur.
    { type: 'node', id: 5, tags: { railway: 'station', name: 'Fantôme' } },
    { type: 'node', id: 6, lat: 48.8566, lon: 2.3786, tags: { amenity: 'bench' } },
  ], CENTRE);

  assert.equal(g.length, 3, 'deux quais du même arrêt ne font qu\'un, le banc et le fantôme sont écartés');
  assert.deepEqual(g.map((x) => x.rang), [1, 2, 3]);
  assert.equal(g[0].genre, 'Bus');
  assert.equal(g[0].nom, 'Popincourt');
  assert.ok(g[0].distance_m < g[1].distance_m && g[1].distance_m < g[2].distance_m);
  const mono = g.find((x) => x.nom === 'Monoprix');
  assert.equal(mono.famille, 'Distribution');
  assert.equal(mono.genre, 'Supermarché');
  assert.equal(mono.adresse, '166 Avenue Ledru-Rollin');
  // Les bandes sont celles du rapport.
  assert.ok(['Moins de 50 mètres', 'De 50 à 100 mètres', 'Plus de 100 mètres'].includes(g[0].bande));
  assert.equal(g.find((x) => x.genre === 'Métro').bande, 'Plus de 100 mètres');
});

test('trois zones à pied, cinq étapes, et un lancement qui refuse une adresse vague', () => {
  assert.deepEqual(ZONES.map((z) => z.rayon_m), [400, 800, 1200]);
  assert.equal(ETAPES.length, 5);
  assert.equal(ETAPES[1].cle, 'etude', 'l\'étude interne est la deuxième étape, juste après l\'adresse');
  assert.match(lancerExpertise({ adresse: 'Lyon' }).error, /adresse précise/);
});
