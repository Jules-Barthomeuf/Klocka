import test from 'node:test';
import assert from 'node:assert/strict';
import { enveloppeDesVilles } from './villes-secteur.js';
import { dansPolygone } from './mandataire-espace.js';

const LYON = { lat: 45.764, lon: 4.8357 };
const NICE = { lat: 43.7102, lon: 7.262 };
const MARSEILLE = { lat: 43.2965, lon: 5.3698 };
const GRENOBLE = { lat: 45.1885, lon: 5.7245 };
const GRASSE = { lat: 43.6589, lon: 6.9237 };
const ANNECY = { lat: 45.8992, lon: 6.1294 };
const CANNES = { lat: 43.5528, lon: 7.0174 };
const TOULON = { lat: 43.1242, lon: 5.928 };

test("le secteur relie les villes : Lyon, Annecy, Nice, Marseille contiennent Grenoble ; Lyon, Nice, Cannes, Toulon, Marseille contiennent Grasse", () => {
  const a = enveloppeDesVilles([LYON, ANNECY, NICE, MARSEILLE]);
  for (const c of [LYON, ANNECY, NICE, MARSEILLE, GRENOBLE]) assert.ok(dansPolygone([c.lat, c.lon], a));
  assert.ok(!dansPolygone([48.8566, 2.3522], a), 'Paris est dehors');
  const b = enveloppeDesVilles([LYON, NICE, CANNES, TOULON, MARSEILLE]);
  assert.ok(dansPolygone([GRASSE.lat, GRASSE.lon], b));
});

test("une ville dans le secteur ne le change pas", () => {
  const sans = enveloppeDesVilles([LYON, ANNECY, NICE, MARSEILLE]);
  const avec = enveloppeDesVilles([LYON, ANNECY, NICE, MARSEILLE, GRENOBLE]);
  assert.deepEqual(avec, sans);
});

test("une ville seule fait un rond autour d'elle, aucune ville rien", () => {
  const a = enveloppeDesVilles([LYON]);
  assert.ok(a.length >= 8 && dansPolygone([LYON.lat, LYON.lon], a));
  assert.equal(enveloppeDesVilles([]), null);
  assert.equal(enveloppeDesVilles([{ lat: null, lon: null }]), null);
});
