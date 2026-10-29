import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-deck-avis-'));
const { deckDeLAvis, dateDe, A_RENSEIGNER, CHAPITRES } = await import('../src/lib/deck-avis.js');
const { chiffrer } = await import('./mandataire-avis.js');

// La boulangerie de la maquette de Jules : 42 000 € de loyer, 95 m² de boutique et 40 m² de laboratoire.
const q = { type_bien: 'murs_commerce', occupe: true, surface_utile: 95, loyer_annuel_hc: 42000, date_effet: '01/01/2023', echeance: '31/12/2031', activite_locataire: 'Boulangerie' };
const chiffres = chiffrer(q, { taux: 6, prix_m2: 7000, loyer_marche_m2: 370 });
const avis = {
  type_libelle: 'Murs de commerce', occupe: true,
  bien: { rue: '12 rue Exemple', ville: '69003 Lyon' },
  demandeur: 'M. Dupont',
  signataire: { nom: 'Lucie Martin', telephone: '06 11 22 33 44', email: 'lucie@kpartners.fr', ville_signature: 'Lyon' },
  description: { resume: 'Une boutique sur rue, avec son laboratoire.', lignes: [{ mot: 'État', texte: 'Bon' }], surfaces: [{ zone: 'Boutique', utile: 95, coef: 1, ponderee: 95 }, { zone: 'Laboratoire', utile: 40, coef: 0.5, ponderee: 20 }] },
  emplacement: { synthese: 'Une rue de passage. Entre métro et marché.', lignes: [{ mot: 'Flux', texte: 'Continu' }] },
  locatif: { synthese: 'Un locataire installé.', lignes: [{ mot: 'Locataire', texte: 'Boulangerie, depuis 2012' }, { mot: 'Loyer', texte: '42 000 € HT HC par an' }, { mot: 'Paiements', texte: 'Aucun impayé' }] },
  juridique: { lignes: [{ mot: 'Urbanisme', texte: 'Linéaire commercial protégé' }] },
  marche: { references: [{ bien: 'Local commercial', adresse: '3 rue A, Lyon 6e', surface: 110, prix: 820000, prix_m2: 7455, date: '2025' }, { bien: 'Local commercial', surface: 85, prix: 540000, prix_m2: 6353 }], loyers: { basse: 340, haute: 400, source: 'Equimmox' }, source: 'DVF' },
  methodes: { taux: 6, loyer: 42000, surface: 95, justification_taux: 'Pied d’immeuble à Lyon.' },
  chiffres,
};

test('le deck a douze pages, dans l’ordre de la maquette, et un sommaire qui pointe juste', () => {
  const d = deckDeLAvis({ avis, estimation: { questionnaire: q } }, { aujourdhui: new Date(Date.UTC(2026, 9, 26)) });
  assert.equal(d.pages.length, 12);
  assert.deepEqual(d.pages.map((p) => p.cle), ['couverture', 'sommaire', ...CHAPITRES.map(([k]) => k)]);
  assert.equal(d.pages[1].chapitres[0].page, 3);
  assert.equal(d.titre, 'Murs de commerce à Lyon');
});

test('les chiffres sont ceux de l’avis, jamais recalculés à part', () => {
  const d = deckDeLAvis({ avis, estimation: { questionnaire: q } }, { aujourdhui: new Date(Date.UTC(2026, 9, 26)) });
  const [couv] = d.pages;
  assert.equal(couv.valeur, chiffres.valeur);
  assert.equal(couv.bas, chiffres.bas);
  assert.equal(couv.haut, chiffres.haut);
  assert.equal(couv.loyer, 42000);
  assert.equal(couv.taux, 6);
  assert.ok(Math.abs(couv.restant - 5.18) < 0.05, `bail restant ${couv.restant}`);
  const calcul = d.pages.find((p) => p.cle === 'calcul');
  assert.equal(calcul.capitalisation, chiffres.capitalisation);
  assert.equal(calcul.sensibilite.find((s) => s.retenu).taux, 6);
  assert.equal(calcul.sensibilite.length, 3);
  const valeur = d.pages.find((p) => p.cle === 'valeur');
  assert.equal(valeur.prix_acquereur, chiffres.cout_total);
  assert.equal(valeur.m2, Math.round(chiffres.valeur / 95));
  const usages = d.pages.find((p) => p.cle === 'usages');
  assert.equal(usages.loyer_m2, 442, '42 000 € sur 95 m²');
  assert.equal(usages.au_marche, 'Au-dessus du marché');
});

test('la frise du bail : prise d’effet, aujourd’hui, la prochaine triennale, l’échéance', () => {
  const d = deckDeLAvis({ avis, estimation: { questionnaire: q } }, { aujourdhui: new Date(Date.UTC(2026, 9, 26)) });
  const frise = d.pages.find((p) => p.cle === 'locatif').frise;
  assert.deepEqual(frise.map((f) => f.annee), [2023, 2026, 2029, 2031]);
  assert.equal(frise[1].present, true);
});

test('ce qui manque se dit « à renseigner », sans rien inventer', () => {
  const d = deckDeLAvis({ avis: { chiffres: {}, methodes: {} }, estimation: {} });
  const [couv] = d.pages;
  assert.equal(couv.valeur, null);
  assert.equal(couv.mandataire, A_RENSEIGNER);
  assert.ok(d.pages.find((p) => p.cle === 'ville').tuiles.every((t) => t.vide));
  assert.ok(d.pages.find((p) => p.cle === 'locatif').lignes.every((l) => l.vide));
});

test('les dates des baux se lisent comme on les écrit', () => {
  assert.equal(dateDe('01/01/2023').toISOString().slice(0, 10), '2023-01-01');
  assert.equal(dateDe('2031-12-31').toISOString().slice(0, 10), '2031-12-31');
  assert.equal(dateDe('décembre 2031').getUTCFullYear(), 2031);
  assert.equal(dateDe(''), null);
});

test('la page « La ville » : les chiffres de la commune posés dans l’avis, chacun avec sa source', async () => {
  const { villeDepuisCommune } = await import('./mandataire-avis.js');
  const ville = villeDepuisCommune({ ok: true, commune: 'Lyon', population: 519127, source: 'API Géo', revenu_median_uc: { valeur_euros_an: 28290, source: 'INSEE, Filosofi 2021' }, chomage_zone_emploi: { taux_pct: 7.6, source: 'INSEE, chômage localisé' }, logement: { prix_median_m2: 5028, source: 'Le Figaro Immobilier' } });
  assert.equal(ville.population.valeur, 519127);
  const d = deckDeLAvis({ avis: { ...avis, ville }, estimation: { questionnaire: q } });
  const p = d.pages.find((x) => x.cle === 'ville');
  assert.deepEqual(p.tuiles.map((t) => t.valeur), ['519\u202f127', '28\u202f290 €', '7,6 %', '5\u202f028 €/m²']);
  assert.ok(p.tuiles.every((t) => !t.vide));
  assert.match(p.sources, /INSEE, Filosofi/);
  assert.equal(villeDepuisCommune({ ok: false }), null);
});

test('une page retirée : les suivantes prennent son numéro, le sommaire suit, la couverture reste', () => {
  const d = deckDeLAvis({ avis: { ...avis, deck: { masquees: ['local', 'couverture'] } }, estimation: { questionnaire: q } });
  assert.equal(d.pages.length, 11);
  assert.equal(d.pages[0].cle, 'couverture');
  assert.equal(d.pages[5].cle, 'usages', 'la 7 devient la 6');
  const s = d.pages.find((x) => x.cle === 'sommaire');
  assert.equal(s.chapitres.length, 9);
  assert.deepEqual(s.chapitres.find((c) => c.mot === 'Activités et valeur locative'), { n: 4, mot: 'Activités et valeur locative', page: 6 });
});
