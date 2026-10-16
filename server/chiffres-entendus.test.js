// La calculatrice du mode appel : les chiffres lus dans la transcription.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motsEnChiffres, chiffresEntendus, calculer } from '../src/lib/chiffres-entendus.js';
import { SCENARIOS_ESSAI } from '../src/components/prospection/scenarios-essai.js';

const SEUILS = { frais_acquisition_pct: 7.5, rendement_aem: { tourne: 7, dead: 5.5 } };

test('les nombres en lettres deviennent des chiffres', () => {
  assert.equal(motsEnChiffres('quatre cent cinquante mille euros'), '450000 euros');
  assert.equal(motsEnChiffres('vingt-huit mille par an'), '28000 par an');
  assert.equal(motsEnChiffres('quatre-vingts mètres carrés'), '80 mètres carrés');
  assert.equal(motsEnChiffres('quatre-vingt-dix-neuf'), '99');
  assert.equal(motsEnChiffres('soixante et onze'), '71');
  assert.equal(motsEnChiffres('un million deux cent mille'), '1200000');
  assert.equal(motsEnChiffres('mille deux cents'), '1200');
  // « un », « une » seuls restent des articles.
  assert.equal(motsEnChiffres('un local loué à une banque'), 'un local loué à une banque');
});

test('prix et loyer dits en lettres', () => {
  const c = chiffresEntendus(['Le prix est de quatre cent cinquante mille euros, le loyer vingt-huit mille par an, bail renouvelé en 2023.']);
  assert.equal(c.prix, 450000);
  assert.equal(c.loyer_an, 28000);
  assert.equal(c.surface, null);
});

test('chiffres écrits, loyer au mois, surface, k€', () => {
  const c = chiffresEntendus(['Les murs sont à 380 000 € net vendeur.', 'Loué 2 500 euros par mois hors charges, 95 m².']);
  assert.equal(c.prix, 380000);
  assert.equal(c.loyer_an, 30000);
  assert.equal(c.loyer_mensuel, true);
  assert.equal(c.surface, 95);
  assert.equal(chiffresEntendus('Prix 450k€').prix, 450000);
  assert.equal(chiffresEntendus('ils en demandent 1,2 million').prix, 1200000);
  assert.equal(chiffresEntendus('ils en demandent 450 mille').prix, 450000);
});

test('le dernier chiffre dit l’emporte', () => {
  const c = chiffresEntendus(['Le prix c’est 450 000 euros.', 'Non pardon, je me trompe, 420 000 euros.']);
  assert.equal(c.prix, 420000);
});

test('ni un téléphone, ni une année, ni une durée ne sont des montants', () => {
  const c = chiffresEntendus(['Rappelez-moi au 06 49 78 81 76.', 'Le bail date de 2019, il reste 6 ans.', 'Dans deux à trois semaines.']);
  assert.equal(c.prix, null);
  assert.equal(c.loyer_an, null);
  assert.deepEqual(c.trouves, []);
});

test('les comptes, aux seuils d’AK', () => {
  const r = calculer({ prix: 450000, loyer_an: 28000, surface: 80 }, SEUILS);
  assert.equal(r.rendement_brut, 6.22);
  assert.equal(r.rendement_aem, 5.79);
  assert.equal(r.verdict, 'limite');
  assert.equal(r.prix_qui_passe, 372000);
  assert.equal(r.prix_m2, 5625);
  assert.equal(r.loyer_m2_an, 350);
  assert.equal(calculer({ prix: 300000, loyer_an: 28000 }, SEUILS).verdict, 'tourne');
  assert.equal(calculer({ prix: 600000, loyer_an: 28000 }, SEUILS).verdict, 'dead');
  assert.equal(calculer({ prix: null, loyer_an: null }, SEUILS).rendement_aem, null);
});

test('les cas « Calculatrice » du mode Essai donnent ce qu’ils annoncent', () => {
  for (const sc of SCENARIOS_ESSAI.filter((s) => s.calcul)) {
    const c = chiffresEntendus(sc.phrases);
    for (const [k, v] of Object.entries(sc.calcul)) assert.equal(c[k], v, `${sc.cle} : ${k}`);
  }
});
