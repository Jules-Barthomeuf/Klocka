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

import { choisirPoint, candidatDansLeTexte, rueEcrite, rueCorrespond } from './streetview.js';

test('le point d’une adresse : la BAN quand Google est d’accord ou que sa ville est écrite, sinon Google', () => {
  const nord = { lat: 50.646706, lon: 3.054499, rue: 'Rue du Nord', ville: 'Lille', code_postal: '59800', score: 0.97, adresse: '1 Rue du Nord 59800 Lille' };
  const colmar = { lat: 48.0796, lon: 7.3621, rue: 'Rue du Nord', ville: 'Colmar', code_postal: '68000', score: 0.8, adresse: '1 Rue du Nord 68000 Colmar' };
  const google = { lat: 50.6466795, lon: 3.054416, adresse: '1 Rue du N, 59800 Lille, France' };
  // D'accord à 6 m : la BAN, précise au numéro, avec sa rue.
  assert.deepEqual(choisirPoint('1 rue du Nord, Bisou Volé', [colmar, nord], google), { lat: nord.lat, lon: nord.lon, rue: 'Rue du Nord', adresse: nord.adresse, source: 'ban+google' });
  // Sans Google (pas de clé serveur) : la BAN dont la ville est écrite dans l'adresse.
  assert.equal(choisirPoint('1 rue du Nord, 59800 Lille', [colmar, nord], null).source, 'ban');
  assert.equal(choisirPoint('1 rue du Nord, 59800 Lille', [colmar, nord], null).lat, nord.lat);
  // Google seul contre une BAN égarée à Colmar : Google.
  assert.equal(choisirPoint('1 rue du Nord, Bisou Volé', [colmar], google).source, 'google');
  // Sans ville écrite ni Google d'accord : la BAN près de la commune du dossier passe avant Google.
  const pourrieres = { lat: 43.5071, lon: 5.7345, adresse: '1 Rue du N, 83910 Pourrières, France' };
  const lille = { lat: 50.6311, lon: 3.0468 };
  assert.equal(choisirPoint('1 rue du Nord', [colmar, nord], pourrieres, lille).source, 'ban-pres-du-dossier');
  assert.equal(choisirPoint('1 rue du Nord', [colmar, nord], pourrieres, lille).lat, nord.lat);
  // Google à 800 km du dossier et aucune BAN près de lui : rien, plutôt qu'un autre endroit.
  assert.equal(choisirPoint('1 rue du Nord', [colmar], pourrieres, lille), null);
  assert.equal(choisirPoint('1 rue du Nord', [], pourrieres, lille), null);
  // Une rue de ce nom n'importe où en France, sans ville ni commune connue : rien non plus,
  // et Google seul ne compte pas pour une rue nue (il l'envoyait dans le Var).
  assert.equal(choisirPoint('1 rue du Nord', [colmar], null), null);
  assert.equal(choisirPoint('1 rue du Nord', [colmar], pourrieres, null), null);
  // Avec une enseigne ou une ville dans le texte, Google seul suffit.
  assert.equal(choisirPoint('1 rue du Nord, Bisou Volé', [colmar], google, null).source, 'google');
  assert.equal(candidatDansLeTexte('1 rue du Nord, 59800 Lille', nord), true);
  assert.equal(candidatDansLeTexte('1 rue du Nord, Bisou Volé', nord), false);
});

test('la rue se lit dans l’adresse écrite, sans réseau', () => {
  assert.equal(rueEcrite('1 rue du Nord, Bisou Volé'), 'rue du Nord');
  assert.equal(rueEcrite('12 bis avenue Jean Médecin 06000 Nice'), 'avenue Jean Médecin');
  assert.equal(rueEcrite('Place Pierre Puget, 83000 Toulon'), 'Place Pierre Puget');
  assert.equal(rueEcrite('Bisou Volé'), null);
  assert.equal(rueEcrite(''), null);
  assert.equal(choisirPoint('1 rue du Nord', [], null), null);
});

test('la rue d’un résultat doit être celle écrite dans l’adresse', () => {
  assert.equal(rueCorrespond('rue du Nord', 'Rue du Nord'), true);
  assert.equal(rueCorrespond('rue du Nord Lille', 'Rue du Nord'), true);
  // « 1 rue du Nord, 59000 Lille » : la BAN proposait la rue du Havre, en 59000.
  assert.equal(rueCorrespond('rue du Nord', 'Rue du Havre'), false);
  assert.equal(rueCorrespond('rue du Nordet', 'Rue du Nord'), false);
});
