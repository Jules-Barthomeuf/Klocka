// Les critères d'acceptation de la compétence « Pré-analyse d'une fiche » (spec du 17 oct. 2026, § 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictPreanalyse, nettoyerRegles } from './regles-preanalyse.js';

const bon = { prix_fai: 1000000, loyer_annuel_ht_hc: 78400, occupe: true, activite: 'Boulangerie', enseigne: null, enseigne_connue: true };

test('ADG Bordeaux : à vérifier, premier point = loyer à +60 % du marché avec le rendement recalculé', () => {
  const r = verdictPreanalyse({ ...bon, loyer_marche: 49000 });
  assert.equal(r.verdict, 'a_verifier');
  assert.equal(r.points[0].code, 'loyer_marche');
  assert.equal(r.points[0].phrase, 'Loyer à +60 % du marché : à loyer de marché, le rendement tomberait à 4,9 %');
});

test('un kebab est écarté avec le motif « Activité exclue : kebab »', () => {
  const r = verdictPreanalyse({ ...bon, activite: 'Restauration rapide', enseigne: 'Istanbul Kebab' });
  assert.equal(r.verdict, 'ecarte');
  assert.equal(r.motif, 'Activité exclue : kebab');
});

test('4,8 % de rendement brut : écarté ; 5,5 % : passe sans signalement de rendement', () => {
  const bas = verdictPreanalyse({ prix_fai: 1000000, loyer_annuel_ht_hc: 48000, occupe: true, activite: 'Boulangerie' });
  assert.equal(bas.verdict, 'ecarte');
  assert.match(bas.motif, /Rendement brut de 4,8 %/);
  const haut = verdictPreanalyse({ prix_fai: 1000000, loyer_annuel_ht_hc: 55000, occupe: true, activite: 'Boulangerie' });
  assert.equal(haut.verdict, 'conforme');
  assert.ok(!haut.points.some((p) => /rendement/i.test(p.phrase)));
});

test('les autres critères éliminatoires : prix, vacant sans promesse', () => {
  assert.equal(verdictPreanalyse({ ...bon, prix_fai: 3500000, loyer_annuel_ht_hc: 300000 }).motifs[0].code, 'prix');
  assert.equal(verdictPreanalyse({ ...bon, occupe: false }).motifs[0].code, 'vacant');
  assert.equal(verdictPreanalyse({ ...bon, occupe: false, promesse_bail: true }).verdict, 'conforme');
});

test('les points à vérifier : vacance, enseigne inconnue, restauration rapide, valeurs absentes ; triés par impact', () => {
  const r = verdictPreanalyse({ ...bon, vacance_pct: 22, enseigne: 'Chez Lulu', enseigne_connue: false, activite: 'Tacos', non_renseignees: ['Surface'] });
  assert.equal(r.verdict, 'a_verifier');
  assert.deepEqual(r.points.map((p) => p.code), ['vacance', 'activite', 'enseigne', 'non_renseigne:Surface']);
});

test('les règles viennent de l\'en-tête : un autre seuil change le verdict', () => {
  const v = { prix_fai: 1000000, loyer_annuel_ht_hc: 48000, occupe: true, activite: 'Boulangerie' };
  assert.equal(verdictPreanalyse(v, { rendement_brut_min: 4 }).verdict, 'conforme');
  assert.equal(verdictPreanalyse(v, { rendement_brut_min: 6 }).verdict, 'ecarte');
});

test('nettoyerRegles : nombres, listes, booléens ; noms invalides écartés', () => {
  assert.deepEqual(nettoyerRegles({ rendement_brut_min: '5,5', activites_exclues: ['a', ' b ', ''], actif: true, 'Mauvais nom': 1, vide: '' }), { rendement_brut_min: 5.5, activites_exclues: ['a', 'b'], actif: true });
});
