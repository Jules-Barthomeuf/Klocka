// La valeur d'un fonds de commerce : barème, rentabilité, comparables (3 nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Une base jetable avant tout import de db.js : un test n'écrit jamais dans la base locale.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fonds-valeur-'));
process.env.NODE_TEST_CONTEXT ||= '1';
const { secteurDe, moyenne, fourchetteDite, evaluerFonds, parComparables } = await import('./fonds-valeur.js');
const { manquants, essentielsManquants, montantDit } = await import('./mandataire-avis.js');
const { deckDeLAvis } = await import('../src/lib/deck-avis.js');

const MAINTENANT = Date.parse('2026-11-03T12:00:00Z');
const cession = (activite, prix, date = '2024-05-01', distance_m = 100) => ({ activite, prix, date, distance_m });

test('le secteur se lit dans l\'activité, le plus précis d\'abord', () => {
  assert.equal(secteurDe('Snack, kebab')?.cle, 'restauration_rapide');
  assert.equal(secteurDe('Restaurant traditionnel')?.cle, 'restauration');
  assert.equal(secteurDe('Pharmacie')?.cle, 'pharmacie');
  assert.equal(secteurDe('Tabac presse loto')?.cle, 'tabac');
  assert.equal(secteurDe('Boulangerie-pâtisserie')?.cle, 'boulangerie');
  assert.equal(secteurDe('Salon de coiffure')?.cle, 'coiffure');
  assert.equal(secteurDe('Fleuriste'), null);
});

test('moyennes des exercices connus, fourchettes dites', () => {
  assert.equal(moyenne([300000, 280000, null]), 290000);
  assert.equal(moyenne([]), null);
  assert.deepEqual(fourchetteDite('60 à 90'), [60, 90]);
  assert.deepEqual(fourchetteDite('3,5'), [3.5, 3.5]);
  assert.equal(fourchetteDite(''), null);
  assert.equal(montantDit('320 k€'), 320000);
  assert.equal(montantDit('1,2 M€'), 1200000);
  assert.equal(montantDit('320 000 €'), 320000);
});

test('trois méthodes croisées, la rentabilité pèse double', () => {
  // Un tabac : CA 400 k€, EBE 100 k€, cinq cessions de tabacs autour.
  const transactions = [150000, 300000, 350000, 400000, 600000].map((p) => cession('Tabac presse', p));
  const v = evaluerFonds({ activite_fonds: 'Tabac-presse', ca_n: 400000, ebe_n: 100000 }, { transactions, source: 'Data-B', maintenantMs: MAINTENANT });
  assert.deepEqual(v.methodes.map((m) => m.cle), ['rentabilite', 'bareme', 'comparables']);
  const r = v.methodes[0]; const b = v.methodes[1]; const c = v.methodes[2];
  assert.deepEqual([r.bas, r.milieu, r.haut], [400000, 550000, 700000]);
  assert.deepEqual([b.bas, b.milieu, b.haut], [320000, 530000, 740000]);
  assert.deepEqual([c.bas, c.milieu, c.haut], [300000, 350000, 400000]);
  assert.equal(v.moyenne, Math.round((550000 * 2 + 530000 + 350000) / 4));
  assert.deepEqual(v.ecartees, []);
});

test('une méthode sans base est écartée, et dit pourquoi', () => {
  // Coiffure : pas de barème de CA ; aucune cession comparable.
  const v = evaluerFonds({ activite_fonds: 'Coiffure', ca_n: 200000, ebe_n: 40000 }, { transactions: [cession('Boulangerie', 200000)], maintenantMs: MAINTENANT });
  assert.deepEqual(v.methodes.map((m) => m.cle), ['rentabilite']);
  assert.equal(v.moyenne, 130000);
  assert.deepEqual(v.ecartees.map((x) => x.cle), ['bareme', 'comparables']);
  // Le coefficient dit par le mandataire remplace le barème absent.
  const dit = evaluerFonds({ activite_fonds: 'Fleuriste', ca_n: 200000, bareme_ca_pct: '40 à 60' }, { maintenantMs: MAINTENANT });
  assert.deepEqual(dit.methodes.map((m) => [m.cle, m.milieu]), [['bareme', 100000]]);
  // Rien : pas de valeur, elle se posera dans l'éditeur.
  assert.equal(evaluerFonds({ activite_fonds: 'Fleuriste' }, { maintenantMs: MAINTENANT }).moyenne, null);
});

test('les comparables : même activité, moins de cinq ans, avec un prix, trois au moins', () => {
  const s = secteurDe('pharmacie');
  const ts = [cession('Pharmacie', 900000), cession('Pharmacie', 1000000, '2018-01-01'), cession('Pharmacie', 0), cession('Boulangerie', 300000), cession('Pharmacie', 1100000)];
  const c = parComparables(ts, { secteur: s, maintenantMs: MAINTENANT });
  assert.equal(c.insuffisant, true);
  assert.equal(c.nombre, 2);
});

test('le questionnaire d\'un fonds : ni surface ni « loué ou libre »', () => {
  const q = { type_bien: 'fonds_commerce', adresse: '1 rue X, Lyon' };
  assert.deepEqual(essentielsManquants(q), ['activite_fonds', 'ca_n']);
  assert.ok(!manquants(q).includes('surface_utile'));
  assert.ok(!manquants(q).includes('occupe'));
  assert.ok(manquants(q).includes('ebe_n'));
});

test('le deck d\'un fonds n\'a ni page Taux ni page Calcul', () => {
  const avis = { type_bien: 'fonds_commerce', type_libelle: 'Fonds de commerce', chiffres: { valeur: 500000, bas: 400000, haut: 600000 }, methodes: {}, description: {}, emplacement: {}, bien: { ville: '69003 Lyon' } };
  const d = deckDeLAvis({ avis });
  const cles = d.pages.map((p) => p.cle);
  assert.ok(!cles.includes('taux') && !cles.includes('calcul'));
  assert.match(d.pages.find((p) => p.cle === 'valeur').phrase[0], /Votre fonds vaut/);
});

test('la page Biens dit ce qu\'on vend : le type de l\'avis, sinon celui de la fiche', async () => {
  const { typeDuBien } = await import('../src/lib/biens-mandataire.js');
  assert.equal(typeDuBien({ estimation: { questionnaire: { type_bien: 'fonds_commerce' } } })?.mot, 'Fonds de commerce');
  assert.equal(typeDuBien({ proprietaire: { type_bien: 'fonds_commerce' } })?.mot, 'Fonds de commerce');
  assert.equal(typeDuBien({ proprietaire: {} })?.mot, 'Murs commerciaux', 'la Prospection cherche les murs par défaut');
  assert.equal(typeDuBien({ dossier: {} }), null, 'rien ne le dit : pas de pastille');
});

test('le type prospecté suit le bien jusqu\'à l\'avis (3 nov. 2026, Jules)', async () => {
  const { typeDeLaFiche, reponsesDeLaVisite } = await import('./mandataire-avis.js');
  assert.equal(typeDeLaFiche({ type_bien: 'fonds_commerce' }), 'fonds_commerce');
  assert.equal(typeDeLaFiche({ type_bien: 'bureaux' }), 'bureaux');
  assert.equal(typeDeLaFiche({}), 'murs_commerce', 'une fiche sans type : des murs');
  const r = reponsesDeLaVisite({ type_bien: 'fonds_commerce', commerce: 'Boulangerie Martin', nom: 'SCI DU PORT', activite: 'Boulangerie', adresse: '1 rue X', ville: 'Lyon' });
  assert.equal(r.type_bien, 'fonds_commerce');
  assert.equal(r.demandeur, 'Boulangerie Martin', 'le fonds se vend par son exploitant');
  assert.equal(r.activite_fonds, 'Boulangerie');
});
