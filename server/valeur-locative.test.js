// La valeur locative : trois échelles constatées chez Equimmox, et le loyer
// déduit des ventes à côté.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-vl-'));
const { composer, ECHELLES, UNITE } = await import('./valeur-locative.js');
const { loyerDerive, TAUX_DEFAUT } = await import('./loyer-dvf.js');

const ADRESSE = { label: '49 Rue Dabray 06000 Nice', rue: 'Rue Dabray', ville: 'Nice' };
const eq = (bas, moyenne, haut, rayon) => ({ bas, moyenne, haut, rayon, source: 'Equimmox · Analyse de loyer' });
const DVF = { basse: 96, moyenne: 181, haute: 296, rayon: '500 m', n: 155, prix_m2: { bas: 1476, median: 2500, haut: 3698 }, taux: { bas: 6.5, moyen: 7.25, haut: 8 }, lien: 'x' };

test('les trois échelles se lisent aux trois rayons, et gardent la forme que les écrans lisaient', () => {
  assert.deepEqual(ECHELLES.map((e) => [e.cle, e.rayon]), [['rue', 200], ['quartier', 500], ['ville', 1000]]);
  const r = composer(ADRESSE, { 200: eq(300, 350, 400, '200m'), 500: eq(250, 300, 350, '500m'), 1000: eq(150, 220, 300, '1000m') }, DVF);
  assert.equal(r.unite, UNITE);
  assert.equal(r.constate, true);
  assert.match(r.source, /Equimmox/);
  assert.deepEqual([r.rue.nom, r.rue.basse, r.rue.haute, r.rue.source], ['Rue Dabray', 300, 400, 'Equimmox']);
  assert.deepEqual([r.quartier.basse, r.quartier.haute], [250, 350]);
  assert.deepEqual([r.ville.nom, r.ville.basse, r.ville.haute], ['Nice', 150, 300]);
  // Le loyer déduit reste à part : c'est le second regard, jamais mélangé au constat.
  assert.equal(r.dvf.n, 155);
  assert.equal(r.dvf.basse, 96);
});

test("sans Equimmox, la déduction DVF prend le quartier et se dit comme telle", () => {
  const r = composer(ADRESSE, {}, DVF);
  assert.equal(r.constate, false);
  assert.match(r.source, /DVF/);
  assert.equal(r.rue, null, 'aucune rue inventée');
  assert.equal(r.ville, null);
  assert.equal(r.quartier.derive, true);
  assert.deepEqual([r.quartier.basse, r.quartier.haute], [96, 296]);
  // Rien du tout : la forme tient, vide, et l'appelant refusera.
  const vide = composer(ADRESSE, {}, null);
  assert.equal(vide.rue, null);
  assert.equal(vide.quartier, null);
  assert.match(vide.source, /aucune/);
});

test('une lecture Equimmox partielle ne perd pas les autres', () => {
  const r = composer(ADRESSE, { 500: eq(250, 300, 350, '500m') }, null);
  assert.equal(r.rue, null);
  assert.equal(r.quartier.basse, 250);
  assert.equal(r.ville, null);
  assert.equal(r.constate, true);
  assert.equal(r.dvf, null);
});

test('le loyer se déduit du prix des murs au taux de la grille, bas au taux bas, haut au taux haut', () => {
  assert.deepEqual(TAUX_DEFAUT, { bas: 6.5, haut: 8 });
  const l = loyerDerive({ bas: 2000, median: 3000, haut: 4000 });
  assert.equal(l.basse, 130);
  assert.equal(l.moyenne, Math.round(3000 * 7.25 / 100));
  assert.equal(l.haute, 320);
  // Une bande d'emplacement plus chère rend moins : c'est le taux qui baisse.
  assert.equal(loyerDerive({ bas: 2000, median: 3000, haut: 4000 }, { bas: 4.5, haut: 5.5 }).haute, 220);
  // Un prix seul se tient ; aucun prix, rien.
  assert.equal(loyerDerive({ median: 3000 }).basse, 195);
  assert.equal(loyerDerive(null), null);
  assert.equal(loyerDerive({}), null);
});
