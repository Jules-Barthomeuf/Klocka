// Street View d'une adresse : le panorama de la bonne rue passe avant le plus
// proche, qui est parfois dans la rue d'à côté.

import test from 'node:test';
import assert from 'node:assert/strict';
import { memeRue, choisirPanorama } from './streetview.js';

test('deux noms désignent la même rue, sans le type de voie ni les articles', () => {
  assert.equal(memeRue('Rue du Nord', 'rue du nord'), true);
  assert.equal(memeRue("Rue de l'Église", 'Rue de l Eglise'), true);
  assert.equal(memeRue('Rue du Nord', 'Rue du Havre'), false);
  assert.equal(memeRue('', 'Rue du Nord'), false);
});

test('le panorama de la bonne rue passe avant le plus proche', () => {
  const point = { lat: 50.6467, lon: 3.0545 };
  const voisin = { pano: 'a', lat: 50.64672, lon: 3.05452, rue: 'Rue du Havre' };
  const bon = { pano: 'b', lat: 50.6468, lon: 3.0548, rue: 'Rue du Nord' };
  const r = choisirPanorama([voisin, bon], point, 'Rue du Nord');
  assert.equal(r.pano, 'b');
  assert.equal(r.meme_rue, true);
  assert.ok(r.cap >= 0 && r.cap < 360);
  assert.equal(choisirPanorama([voisin, bon], point, 'Rue Inconnue').pano, 'a', 'sinon le plus proche');
  assert.equal(choisirPanorama([], point, 'Rue du Nord'), null);
});
