// La mesure DVF, sur des actes fabriqués : ce qu'elle compte, ce qu'elle
// refuse de savoir avant l'heure. Pur : rien n'est téléchargé.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mesure-'));
const { inventorier, mesurer, cleLocal, referencesPour } = await import('./mesure-dvf.js');

const COMMERCE = 'Local industriel. commercial ou assimilé';
let n = 0;
/** Une ligne DVF, comme le fichier les écrit. */
const ligne = ({ mutation, date, prix, parcelle, lot = null, type = COMMERCE, numero = '12', surface = '80', lots = '1', nature = 'Vente' }) => ({
  id_mutation: mutation || `m${++n}`,
  date_mutation: date,
  nature_mutation: nature,
  valeur_fonciere: String(prix),
  adresse_numero: numero,
  adresse_suffixe: '',
  id_parcelle: parcelle,
  lot1_numero: lot,
  nombre_lots: lots,
  type_local: type,
  surface_reelle_bati: surface,
});

// A : acheté en 2015, revendu 22 mois après le 1er janvier 2017 (fenêtre 18-48 à T).
// B : acheté en 2014, jamais revendu.
// C : acheté en 2015 ; un appartement de la même parcelle vendu en juin 2018 ; C revendu en mars 2019.
// D : acheté en bloc avec un appartement en 2016, jamais revendu.
// E : « vendu » un euro en 2016 : pas une vente.
// F : acheté en mai 2020, revendu en février 2021 : inconnu avant 2020.
const LIGNES = [
  ligne({ mutation: 'a1', date: '2015-03-01', prix: 300000, parcelle: 'P1', lot: '1' }),
  ligne({ mutation: 'a2', date: '2017-06-01', prix: 350000, parcelle: 'P1', lot: '1' }),
  ligne({ mutation: 'b1', date: '2014-05-01', prix: 250000, parcelle: 'P2', lot: '3' }),
  ligne({ mutation: 'c1', date: '2015-01-01', prix: 400000, parcelle: 'P3', lot: '2' }),
  ligne({ mutation: 'c2', date: '2018-06-01', prix: 210000, parcelle: 'P3', lot: '7', type: 'Appartement' }),
  ligne({ mutation: 'c3', date: '2019-03-01', prix: 480000, parcelle: 'P3', lot: '2' }),
  ligne({ mutation: 'd1', date: '2016-01-01', prix: 900000, parcelle: 'P4', lot: '1', lots: '2' }),
  ligne({ mutation: 'd1', date: '2016-01-01', prix: 900000, parcelle: 'P4', lot: '2', lots: '2', type: 'Appartement' }),
  ligne({ mutation: 'e1', date: '2016-04-01', prix: 1, parcelle: 'P5', lot: '1' }),
  ligne({ mutation: 'f1', date: '2020-05-01', prix: 500000, parcelle: 'P6', lot: '1' }),
  ligne({ mutation: 'f2', date: '2021-02-01', prix: 650000, parcelle: 'P6', lot: '1' }),
];

test('un local a une clé stable : la parcelle et le lot, sinon le numéro et la surface', () => {
  assert.equal(cleLocal({ id_parcelle: 'P1', lot1_numero: '0012' }), 'P1|lot 12');
  assert.equal(cleLocal({ id_parcelle: 'P1', lot1_numero: '', adresse_numero: '12', adresse_suffixe: 'B', surface_reelle_bati: '80' }), 'P1|12b|80');
});

test("l'inventaire reconstitue les actes : un local, ses ventes, le bloc, l'euro symbolique", () => {
  const { locaux, parcelles } = inventorier(LIGNES);
  assert.equal(locaux.get('P1|lot 1').mutations.length, 2);
  assert.equal(locaux.get('P4|lot 1').mutations[0].en_bloc, true, 'deux lots dont un appartement : en bloc');
  assert.equal(locaux.get('P4|lot 1').mutations[0].commercial_pur, false);
  assert.equal(locaux.get('P5|lot 1').mutations[0].vente, false, 'un euro n’est pas une vente');
  assert.equal(parcelles.get('P3').length, 3, 'la parcelle voit aussi l’appartement');
  assert.ok(!locaux.has('P3|lot 7'), 'un appartement n’est pas un local commercial');
});

test('les dates de référence tiennent dans les fichiers, horizon compris', () => {
  assert.deepEqual(referencesPour([2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021], 24), ['2015-01-01', '2016-01-01', '2017-01-01', '2018-01-01', '2019-01-01', '2020-01-01']);
  assert.deepEqual(referencesPour([], 24), []);
});

test('à une date de référence, on ne sait que le passé', () => {
  const r = mesurer([{ insee: '00000', nom: 'Test', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 24, references: ['2017-01-01'] });
  // Connus au 1er janvier 2017 : A, B, C, D. Pas E (un euro), pas F (acheté en 2020).
  assert.equal(r.base.n, 4);
  // A se revend en juin 2017 : une vente dans l'horizon. Les autres non.
  assert.equal(r.base.ventes, 1);
  assert.equal(r.base.taux, 25);
  // Dans la fenêtre 18-48 au 1er janvier 2017 : A (22 mois), B (32), C (24). D, acheté 12 mois avant, est en 0-18.
  const f18 = r.par_fenetre.find((f) => f.cle === '18-48');
  assert.equal(f18.n, 3);
  assert.equal(f18.ventes, 1, 'seul A se revend dans les vingt-quatre mois');
  assert.equal(f18.lift, 1.33, 'un sur trois, contre un sur quatre');
  assert.equal(r.par_fenetre.find((f) => f.cle === '0-18').n, 1, 'D');
  assert.equal(r.bloc.avec.n, 1, 'D');
  assert.equal(r.bloc.avec.ventes, 0);
});

test('un lot voisin vendu avant la date compte, vendu après ne compte pas', () => {
  const r = mesurer([{ insee: '00000', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 24, references: ['2019-01-01'] });
  // Au 1er janvier 2019, C a un voisin vendu en juin 2018, et C se vend en mars 2019.
  assert.equal(r.voisin.avec.n, 1);
  assert.equal(r.voisin.avec.ventes, 1);
  // Au 1er janvier 2017, ce même voisin est dans le futur : personne ne le sait.
  const avant = mesurer([{ insee: '00000', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 24, references: ['2017-01-01'] });
  assert.equal(avant.voisin.avec.n, 0);
});

test('le local acheté après la référence n’existe pas encore', () => {
  const r = mesurer([{ insee: '00000', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 24, references: ['2019-01-01'] });
  // F est acheté en 2020 : absent de la population de 2019, même si on sait qu'il se revend en 2021.
  const f2021 = mesurer([{ insee: '00000', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 12, references: ['2021-01-01'] });
  assert.equal(r.base.n, 4, 'A, B, C, D : F n’est pas encore acheté, E n’a jamais été vendu à un prix');
  assert.equal(f2021.par_fenetre.find((f) => f.cle === '0-18').ventes, 1, 'F, acheté 8 mois avant, revendu dans l’année');
});

test('le rapport dit ses limites', () => {
  const r = mesurer([{ insee: '00000', annees: [2014, 2021], lignes: LIGNES }], { horizon_mois: 24, references: ['2017-01-01'] });
  assert.ok(r.limites.some((l) => /2014/.test(l)));
  assert.ok(r.limites.some((l) => /pas encore vendus/.test(l)));
  assert.equal(r.base.taux_annuel_approx, 12.5);
});
