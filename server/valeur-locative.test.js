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
  // Le loyer déduit des ventes n'entre plus, même offert (6 oct. 2026).
  assert.equal(r.dvf, null);
});

test("sans Equimmox ni Data-B, aucun loyer : la déduction DVF ne prend plus le quartier", () => {
  const r = composer(ADRESSE, {}, DVF);
  assert.equal(r.constate, false);
  assert.match(r.source, /aucune/);
  assert.equal(r.rue, null, 'aucune rue inventée');
  assert.equal(r.ville, null);
  assert.equal(r.quartier, null);
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

test('composer : Data-B remplit une échelle qu\'Equimmox n\'a pas lue, et reste visible à part', () => {
  const adresse = { label: '55 rue des Poteaux 75018 Paris', rue: 'Rue des Poteaux', ville: 'Paris' };
  const dataB = { rue: { nom: 'Rue des Poteaux', basse: 300, haute: 400 }, quartier: { nom: 'Clignancourt', basse: 250, haute: 350 }, lien: 'https://valeurlocative.data-b.com/search' };
  const r = composer(adresse, { 500: { bas: 280, moyenne: 310, haut: 340, rayon: '500 m' } }, null, dataB);
  assert.equal(r.quartier.source, 'Equimmox');
  assert.equal(r.rue.source, 'Data-B');
  assert.equal(r.rue.moyenne, 350);
  assert.equal(r.rue.estime, true);
  assert.equal(r.ville, null);
  assert.match(r.source, /Equimmox.*Data-B/);
  assert.deepEqual(r.data_b.quartier, dataB.quartier);
});

test('champsValeurLocative : la rue Data-B remplit l\'offre de marché du projet', async () => {
  const { champsValeurLocative } = await import('./data-b-assistant.js');
  assert.deepEqual(champsValeurLocative({ rue: { basse: 300, haute: 400 }, quartier: { nom: 'Clignancourt' } }), {
    marche_offre_bas: 300, marche_offre_haut: 400, marche_offre_moyenne: 350, marche_quartier_nom: 'Clignancourt',
  });
  assert.deepEqual(champsValeurLocative({ ville: { basse: 1, haute: 2 } }), {});
});
