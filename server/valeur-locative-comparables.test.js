import test from 'node:test';
import assert from 'node:assert/strict';
import { nombreDe, loyerDuLot, referencesKlocka, departementDe, adresseGeocodable } from './loyers-klocka.js';
import { valeurParComparables, quantilePondere, cleRue, confiance, ecartDataB, POIDS } from './valeur-locative-comparables.js';

const champ = (valeur, extra = {}) => ({ valeur, absent: false, ...extra });
const deal = (id, { loyer = 24000, surface = 80, rue = '12 rue d\'Antibes', cp = '06400', ville = 'Cannes', bail = null, le = '2026-06-01T00:00:00Z', origine = null, saisi = false } = {}) => ({
  deal_id: id, nom: id, created_date: le,
  lots: [{ lot: { loyer_annuel_ht_hc: champ(loyer, saisi ? { saisi_a_la_main: true } : {}), surface_m2: champ(surface), adresse: champ({ rue, code_postal: cp, ville }), ...(origine ? { origine_loyer: origine } : {}) }, enrichissement: { commune: { code_insee: '06029', nom: ville } } }],
  matrice: bail ? { lignes: [{ categorie: 'Bail', document_nom: 'Bail 2021.pdf', cellules: { loyer: { reponse: bail } } }] } : null,
});

test('les nombres se lisent dans un texte de bail', () => {
  assert.equal(nombreDe('26 400 € HT/an'), 26400);
  assert.equal(nombreDe('24\u202f000,50 €'), 24000.5);
  assert.equal(nombreDe('rien'), null);
});

test("l'origine du loyer : bail lu, saisi à la main, annoncé, ou posée sur le lot", () => {
  assert.equal(loyerDuLot(deal('a', { bail: '26 400 € HT/an' })).origine, 'reel');
  assert.equal(loyerDuLot(deal('a', { bail: '26 400 € HT/an' })).loyer, 26400);
  assert.equal(loyerDuLot(deal('b', { saisi: true })).origine, 'saisi');
  assert.equal(loyerDuLot(deal('c')).origine, 'annonce');
  assert.equal(loyerDuLot(deal('d', { origine: 'reel' })).origine, 'reel');
  // Un loyer mensuel recopié du bail ne se prend pas pour un loyer annuel.
  assert.equal(loyerDuLot(deal('e', { bail: '2 000 €' })).origine, 'reel');
  assert.equal(loyerDuLot(deal('f', { bail: '900 €' })).origine, 'annonce');
  assert.equal(loyerDuLot(deal('g', { surface: 0 })), null);
});

test('les références : une par lot, sans les dossiers de test ni le dossier lui-même', () => {
  const refs = referencesKlocka([deal('a'), { ...deal('t'), test: true }, deal('z')], { exclure: 'z' });
  assert.deepEqual(refs.map((r) => r.deal_id), ['a']);
  assert.equal(refs[0].departement, '06');
  assert.equal(refs[0].loyer_m2, 300);
  assert.equal(departementDe('20100'), '2A');
  assert.equal(adresseGeocodable({ rue: '1 rue X', ville: 'Nice' }), true);
  assert.equal(adresseGeocodable({ ville: 'Nice' }), false);
});

test('le quantile pondéré penche vers les références lourdes', () => {
  assert.equal(quantilePondere([100, 200, 300], [1, 1, 1], 0.5), 200);
  assert.equal(quantilePondere([100, 200, 300], [1, 1, 5], 0.5), 300);
  assert.equal(cleRue("12 bis rue d'Antibes"), cleRue('Rue d’Antibes'.replace('’', "'")));
});

test('la confiance suit le nombre, la dispersion et l\'âge', () => {
  assert.equal(confiance({ klocka: 6, dispersion: 0.2, age_ans: 1 }), 'haute');
  assert.equal(confiance({ klocka: 3, dispersion: 0.5, age_ans: 4 }), 'moyenne');
  assert.equal(confiance({ klocka: 1 }), 'faible');
});

test('assez de loyers Klocka dans la rue : Klocka est affiché, Equimmox reste en contrôle', () => {
  const cible = { lat: 43.551, lon: 7.017, rue: "20 rue d'Antibes", code_postal: '06400', code_insee: '06029', ville: 'Cannes' };
  const refs = [280, 300, 310, 320, 330].map((m2, i) => ({ ...referencesKlocka([deal(`d${i}`, { loyer: m2 * 80, bail: `${m2 * 80} €` })])[0], point: { lat: 43.5512, lon: 7.0172 } }));
  const r = valeurParComparables(cible, refs, [{ loyer_m2: 250, niveau: 'rue', libelle: 'Equimmox 200 m' }], { maintenant: Date.parse('2026-10-18') });
  assert.equal(r.niveau, 'troncon');
  assert.equal(r.affichee, 'klocka');
  assert.equal(r.confiance, 'haute');
  assert.equal(r.klocka.n, 5);
  assert.ok(r.comparables.some((c) => c.source === 'equimmox'));
  assert.equal(r.comparables.find((c) => c.source === 'klocka_bail').poids, POIDS.klocka_bail);
  assert.equal(r.controle.equimmox, 250);
});

test('trop peu de loyers Klocka : Equimmox est affiché, Klocka sert de contrôle', () => {
  const cible = { lat: 43.7, lon: 7.26, rue: '5 avenue Jean Médecin', code_postal: '06000', code_insee: '06088', ville: 'Nice' };
  const refs = [{ ...referencesKlocka([deal('n1', { rue: '9 avenue Jean Médecin', cp: '06000', ville: 'Nice' })])[0], point: { lat: 43.7001, lon: 7.2601 } }];
  const r = valeurParComparables(cible, refs, [{ loyer_m2: 420, bas: 380, haut: 460, niveau: 'rue' }]);
  assert.equal(r.confiance, 'faible');
  assert.equal(r.affichee, 'equimmox');
  assert.deepEqual(r.valeur, { bas: 380, central: 420, haut: 460 });
  assert.equal(r.klocka.n, 1);
});

test("l'écart à Data-B se calcule par échelle, pour être gardé", () => {
  const e = ecartDataB({ central: 330 }, { rue: { basse: 280, haute: 320 }, ville: { basse: 200, haute: 240 } });
  assert.deepEqual(e.map((x) => x.niveau), ['rue', 'ville']);
  assert.equal(e[0].ecart_pct, 10);
});

test('Equimmox affiché : son échelle la plus fine, même quand les loyers Klocka sont à la commune', () => {
  const cible = { lat: 43.7, lon: 7.26, rue: '20 avenue Jean Médecin', code_postal: '06000', code_insee: '06088', ville: 'Nice' };
  const loin = { ...referencesKlocka([deal('n2', { rue: '1 boulevard Gambetta', cp: '06000', ville: 'Nice' })])[0], point: { lat: 43.71, lon: 7.25 } };
  loin.adresse.code_insee = '06088';
  const r = valeurParComparables(cible, [loin], [{ loyer_m2: 434, niveau: 'rue' }, { loyer_m2: 364, niveau: 'commune' }]);
  assert.equal(r.niveau, 'commune');
  assert.equal(r.affichee, 'equimmox');
  assert.equal(r.valeur.central, 434);
  assert.equal(r.controle.equimmox, 364);
});
