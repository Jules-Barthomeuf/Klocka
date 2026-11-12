// La fiabilité du loyer de marché (12 nov. 2026, Jules : « que la partie Loyer soit vraiment très fiable »).
// Du texte de la page Equimmox jusqu'à l'écart affiché : la lecture des chiffres, la lecture qui fait foi, la référence,
// et le même écart dans l'onglet Marché et dans la préanalyse.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-loyer-'));
const { Records } = await import('./db.js');
const { lireFourchetteLoyer, saisieAdresse, rayonConforme } = await import('./equimmox.js');
const { loyerDeReference, derniereLecture, composer, sansLuiMeme } = await import('./valeur-locative.js');
const { pointLoyer, pointLoyerAncien, jugerLoyer } = await import('./outils/lancements.js');
const { jugerTemoin } = await import('./equimmox-temoin.js');
const { jugement } = await import('./deal/comparaison-marche.js');

// Le texte lu sur la page Equimmox pour KFC Lyon, 500 m, le 12 nov. 2026 à 8 h 36.
const PAGE_KFC = ['© Mapbox © OpenStreetMap Improve this map', 'Baux existants', 'Modifier filtres', 'Exporter', 'Bas : 211€/an/m²', 'Moyenne : 343€/an/m²', 'Haut : 351€/an/m²', 'Recherche', 'Alertes', 'Commerces'];

test('la page Equimmox de KFC Lyon se lit : 211, 343, 351', () => {
  assert.deepEqual(lireFourchetteLoyer(PAGE_KFC), { bas: 211, moyenne: 343, haut: 351 });
});

test('les écritures de chiffres de la page se lisent toutes', () => {
  const page = (bas, moy, haut) => ['Baux existants', `Bas : ${bas}`, `Moyenne : ${moy}`, `Haut : ${haut}`];
  assert.deepEqual(lireFourchetteLoyer(page('1 050€/an/m²', '1 200 €/an/m²', '1 400€/an/m²')), { bas: 1050, moyenne: 1200, haut: 1400 });
  assert.deepEqual(lireFourchetteLoyer(page('180,5€/an/m²', '220€/an/m²', '260€/an/m²')), { bas: 180.5, moyenne: 220, haut: 260 });
  // Un chiffre manquant reste vide, les autres comptent.
  assert.deepEqual(lireFourchetteLoyer(['Baux existants', 'Moyenne : 300€/an/m²']), { bas: null, moyenne: 300, haut: null });
});

test("une page fausse n'est jamais prise pour un loyer", () => {
  // Les offres (annonces) et pas les baux signés.
  assert.match(lireFourchetteLoyer(['Offres', 'Bas : 200€/an/m²', 'Moyenne : 250€/an/m²', 'Haut : 300€/an/m²']).erreur, /baux existants/);
  // Rien d'affiché.
  assert.match(lireFourchetteLoyer(['Baux existants', 'Exporter']).erreur, /aucune fourchette/);
  // Bas au-dessus du haut : la page a été mal lue.
  assert.match(lireFourchetteLoyer(['Baux existants', 'Bas : 400€/an/m²', 'Haut : 200€/an/m²']).erreur, /dépasse le haut/);
  // Hors de toute échelle d'un loyer de commerce.
  assert.match(lireFourchetteLoyer(['Baux existants', 'Bas : 2€/an/m²', 'Haut : 9€/an/m²']).erreur, /illisibles/);
  assert.match(lireFourchetteLoyer(['Baux existants', 'Moyenne : 25000€/an/m²']).erreur, /illisibles/);
});

test("la moyenne au-dessus du haut reste une lecture valable (KFC Lyon, 200 m, 11 nov.)", () => {
  assert.deepEqual(lireFourchetteLoyer(['Baux existants', 'Bas : 211€/an/m²', 'Moyenne : 304€/an/m²', 'Haut : 260€/an/m²']), { bas: 211, moyenne: 304, haut: 260 });
});

const ADRESSE = { label: '12 Rue de la République 69002 Lyon', rue: 'Rue de la République', ville: 'Lyon' };
const eq = (bas, moyenne, haut, rayon) => ({ bas, moyenne, haut, rayon });

test("la référence : l'échelle la plus proche, et sa moyenne Equimmox", () => {
  const tout = composer(ADRESSE, { 200: eq(211, 304, 260, '200m'), 500: eq(211, 343, 351, '500m'), 1000: eq(188, 270, 274, '1000m') });
  const r = loyerDeReference(tout);
  assert.deepEqual([r.echelle, r.m2, r.reference, r.bas, r.haut], ['rue', 304, 'moyenne', 211, 260]);
  // La rue manque (KFC Lyon le 12 nov.) : le quartier.
  const sansRue = composer(ADRESSE, { 500: eq(211, 343, 351, '500m'), 1000: eq(188, 270, 274, '1000m') });
  assert.deepEqual([loyerDeReference(sansRue).echelle, loyerDeReference(sansRue).m2], ['quartier', 343]);
  // Seule la ville.
  assert.equal(loyerDeReference(composer(ADRESSE, { 1000: eq(188, 270, 274, '1000m') })).echelle, 'ville');
});

test("sans moyenne, le milieu de la fourchette, et dit comme tel", () => {
  const r = loyerDeReference(composer(ADRESSE, { 200: eq(200, null, 300, '200m') }));
  assert.deepEqual([r.m2, r.reference], [250, 'milieu']);
  const p = pointLoyer(r, 300).point;
  assert.match(p.resultat, /milieu de fourchette de 250/);
});

test('aucune échelle lue : pas de référence, jamais un chiffre inventé', () => {
  assert.equal(loyerDeReference(composer(ADRESSE, {})), null);
  assert.equal(loyerDeReference(null), null);
  assert.equal(loyerDeReference({ rue: { basse: null, moyenne: null, haute: null } }), null);
});

test("le Marché et la préanalyse donnent le même écart et le même sens, quel que soit le loyer", () => {
  const sens = { haut: 'alerte', juste: 'ok', bas: 'ok' };
  for (const m2 of [150, 281, 304, 343]) {
    for (let loyer = 50; loyer <= 1000; loyer += 7) {
      const marche = jugerLoyer(loyer, m2);
      const pre = jugement(loyer, { bas: 200, median: m2, haut: 400 });
      assert.equal(marche.ecart, pre.ecart, `écart pour ${loyer} face à ${m2}`);
      assert.equal(marche.statut, sens[pre.sens], `sens pour ${loyer} face à ${m2}`);
    }
  }
});

test('KFC Lyon : 528 €/m²/an face à la moyenne de la rue, le même écart partout', () => {
  const r = loyerDeReference(composer(ADRESSE, { 200: eq(211, 304, 260, '200m'), 500: eq(211, 343, 351, '500m') }));
  const { point, resume } = pointLoyer(r, Math.round(95000 / 180));
  assert.equal(point.statut, 'alerte');
  assert.equal(resume, '+74 % vs marché');
  assert.match(point.resultat, /^528 €\/m²\/an face à une moyenne de 304 €\/m²\/an dans la rue \(200m\), de 211 à 260 : 74 % au-dessus du marché/);
  assert.equal(jugement(528, { median: r.m2 }).ecart, 74);
});

test("la ligne Loyer ouvre la page Equimmox de l'échelle retenue", () => {
  const r = loyerDeReference({ rue: null, quartier: { basse: 211, moyenne: 343, haute: 351, rayon: '500m', source: 'Equimmox', capture: '/uploads/equimmox/q.png' } });
  assert.equal(pointLoyer(r, 528).point.lien, '/uploads/equimmox/q.png');
  assert.equal(pointLoyer({ ...r, niveau: { ...r.niveau, capture: null } }, 528).point.lien, null);
});

test('la lecture qui fait foi : la plus récente valable, jamais une lecture mise de côté ni trop vieille', () => {
  const cle = '1 rue du test 06000 nice';
  const il_y_a = (jours) => new Date(Date.now() - jours * 86400000).toISOString();
  const avec = { constate: true, quartier: { basse: 200, moyenne: 250, haute: 300 } };
  Records.create('ValeurLocativeRecherche', { cle, version: 3, le: il_y_a(40), resultat: avec });
  assert.equal(derniereLecture(cle), null, 'plus de trente jours : ignorée');
  const bonne = Records.create('ValeurLocativeRecherche', { cle, version: 3, le: il_y_a(2), resultat: avec });
  assert.equal(derniereLecture(cle).id, bonne.id);
  // Une lecture ratée, mise de côté (version 0), ne passe jamais devant.
  Records.create('ValeurLocativeRecherche', { cle, version: 0, le: il_y_a(1), resultat: { constate: false } });
  assert.equal(derniereLecture(cle).id, bonne.id);
  // Une lecture plus récente sans Equimmox est la plus récente, mais pas quand on veut Equimmox.
  const sans = Records.create('ValeurLocativeRecherche', { cle, version: 3, le: il_y_a(0.5), resultat: { constate: false } });
  assert.equal(derniereLecture(cle).id, sans.id);
  assert.equal(derniereLecture(cle, { avecEquimmox: true }).id, bonne.id);
  // La clé ne dépend ni de la casse ni des espaces.
  assert.equal(derniereLecture('1  Rue du Test 06000 Nice', { avecEquimmox: true }).id, bonne.id);
});

test("ce qu'on tape dans Equimmox : l'adresse sans code postal, puis la rue seule au second essai", () => {
  const ban = { numero: '12', rue: 'Rue de la République', ville: 'Lyon' };
  assert.equal(saisieAdresse('x', ban), '12 Rue de la République, Lyon');
  assert.equal(saisieAdresse('x', ban, { sansNumero: true }), 'Rue de la République, Lyon');
  assert.equal(saisieAdresse('12 rue de la République, 69002 Lyon', null), '12 rue de la République, Lyon');
  assert.equal(saisieAdresse('12 bis rue de la République, 69002 Lyon', null, { sansNumero: true }), 'rue de la République, Lyon');
});

test("le rayon lu doit être celui demandé : jamais un 500 m pris pour la rue", () => {
  assert.equal(rayonConforme('+200m', 200), true);
  assert.equal(rayonConforme('+ 1km', 1000), true);
  assert.equal(rayonConforme('1,5 km', 1500), true);
  assert.equal(rayonConforme('+500m', 200), false);
  assert.equal(rayonConforme(null, 200), false);
});

test('le local jugé ne sert jamais de comparable à lui-même (KFC Lyon, 528 €/m²)', () => {
  const cible = { label: '12 Rue de la République 69002 Lyon', lat: 45.76511, lon: 4.835769 };
  const refs = [
    { adresse: { ligne: '12 rue de la République, 69002 Lyon' }, point: { lat: 45.76511, lon: 4.835769 }, loyer_m2: 528 },
    { adresse: { ligne: '12 Rue de la République 69002 Lyon' }, point: null, loyer_m2: 528 },
    { adresse: { ligne: '35 rue de la République, Lyon' }, point: { lat: 45.7633, lon: 4.8358 }, loyer_m2: 300 },
  ];
  assert.deepEqual(sansLuiMeme(refs, cible).map((r) => r.loyer_m2), [300]);
  assert.deepEqual(sansLuiMeme([], cible), []);
});

test("Equimmox muet aujourd'hui : la dernière lecture, datée et toujours « à voir »", () => {
  const ref = loyerDeReference(composer(ADRESSE, { 200: eq(211, 304, 260, '200m') }));
  const p = pointLoyerAncien(ref, 528, '2026-11-11T17:43:42.888Z', "Equimmox ne propose aucune adresse.");
  assert.equal(p.statut, 'a_voir');
  assert.match(p.resultat, /74 % au-dessus du marché/);
  assert.match(p.resultat, /lecture Equimmox du 11 novembre 2026 ; aujourd'hui : Equimmox ne propose aucune adresse\./);
});

test("le témoin du jour : un échec ou un saut de plus d'un quart prévient, la stabilité non", () => {
  const lu = (moyenne) => ({ ok: true, resultat: { moyenne } });
  assert.equal(jugerTemoin({ ok: false, error: 'menu introuvable' }, 304).statut, 'echec');
  assert.equal(jugerTemoin(lu(null), 304).statut, 'echec');
  assert.equal(jugerTemoin(lu(304), 304).statut, 'ok');
  assert.equal(jugerTemoin(lu(330), 304).statut, 'ok');
  assert.deepEqual([jugerTemoin(lu(400), 304).statut, jugerTemoin(lu(400), 304).ecart], ['ecart', 32]);
  assert.equal(jugerTemoin(lu(200), 304).statut, 'ecart');
  assert.equal(jugerTemoin(lu(304), null).statut, 'ok');
});
