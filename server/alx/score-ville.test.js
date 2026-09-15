// Le score appris dans l'application : le rang dans la ville, la tranche
// mesurée, les raisons en clair, et la pile qui en découle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-score-ville-'));
const { tranchesDe, trancheDe, rangDans, groupeProprietaire, phraseVariable, raisonsDe, FIABILITE } = await import('./score-ville.js');
const { classer } = await import('./classement.js');

const METRICS = {
  holdout_final: {
    n: 6166, positifs: 208, prevalence: 0.0337,
    lift_en_tete: { top_5: { n: 308, taux_vente: 0.1429, lift: 4.23 }, top_10: { n: 616, taux_vente: 0.1088, lift: 3.22 }, top_20: { n: 1233, taux_vente: 0.0787, lift: 2.33 } },
  },
};

test('les tranches portent le taux mesuré, et le reste se déduit du total', () => {
  const t = tranchesDe(METRICS);
  assert.deepEqual(t.map((x) => x.cle), ['top_5', 'top_10', 'top_20', 'reste']);
  assert.equal(t[0].taux, 0.1429);
  // 208 ventes, dont 97 dans le top 20 % : 111 sur les 4 933 adresses restantes.
  assert.ok(Math.abs(t[3].taux - 111 / 4933) < 1e-9);
  assert.equal(tranchesDe({}), null);
});

test('le rang est la part des parcelles au moins aussi probables', () => {
  const probas = [0.4, 0.3, 0.2, 0.1, 0.05, 0.04, 0.03, 0.02, 0.01, 0.005];
  assert.equal(rangDans(probas, 0.4), 0.1, 'la première parcelle est dans les 10 % de tête');
  assert.equal(rangDans(probas, 0.25), 0.2);
  assert.equal(rangDans(probas, 0.9), 0.1, 'plus probable que toutes : on ne descend pas sous une parcelle');
  assert.equal(rangDans(probas, 0.001), 1);
  assert.equal(rangDans([], 0.2), null);
  const t = tranchesDe(METRICS);
  assert.equal(trancheDe(t, 0.049).cle, 'top_5');
  assert.equal(trancheDe(t, 0.08).cle, 'top_10');
  assert.equal(trancheDe(t, 0.6).cle, 'reste');
});

test('la fiabilité suit ce que le fichier des sociétés sait du propriétaire', () => {
  assert.equal(groupeProprietaire({ multi_proprietaires_pm: 1 }), 'plusieurs_societes');
  assert.equal(groupeProprietaire({ multi_proprietaires_pm: 0 }), 'une_societe');
  assert.equal(groupeProprietaire({ multi_proprietaires_pm: null }), 'inconnu');
  assert.equal(FIABILITE.inconnu.mot, 'très faible');
});

test('les raisons : les plus fortes d\'abord, en phrases, avec leur nature', () => {
  const r = raisonsDe(
    { multi_proprietaires_pm: 0.67, dernier_prix: 0.42, nb_vitrines_parcelle: -0.24, vitrines_rue: 0.01 },
    { multi_proprietaires_pm: 1, dernier_prix: 195000, nb_vitrines_parcelle: 1, vitrines_rue: 12 },
  );
  assert.deepEqual(r.map((x) => x.variable), ['multi_proprietaires_pm', 'dernier_prix', 'nb_vitrines_parcelle'], 'une contribution minuscule ne fait pas une raison');
  assert.equal(r[0].phrase, 'Plusieurs sociétés possèdent des lots sur la parcelle');
  assert.equal(r[0].force, 'fort');
  assert.equal(r[0].nature, 'immeuble');
  assert.equal(r[2].sens, -1);
  assert.equal(r[2].force, 'net');
  assert.equal(phraseVariable('rang_rue_part', 0.02), 'Rue dans les 2 % les plus commerçantes de la ville');
  assert.equal(phraseVariable('procedures_rue_18m', 0), 'Aucune procédure collective dans la rue en 18 mois');
});

test('la pile suit la tranche du modèle ; les exclusions restent au-dessus', () => {
  const ml = (cle, fiabilite = 'plusieurs_societes') => ({
    tranche: { cle, libelle: cle === 'reste' ? 'Au-delà du top 20 %' : `Top ${cle.slice(4)} % de la ville`, taux: cle === 'top_5' ? 0.1429 : 0.02 },
    fiabilite: { cle: fiabilite },
    raisons: [{ sens: 1, phrase: 'Plusieurs sociétés possèdent des lots sur la parcelle' }],
  });
  const cible = { occupe: true, proprietaire: { nom: 'SCI Rivage' } };
  const appel = classer({ ...cible, score_ml: ml('top_5') });
  assert.equal(appel.pile, 'appeler');
  assert.match(appel.motif, /Top 5 % de la ville : 14 % des adresses de ce niveau/);
  assert.match(appel.motif, /plusieurs sociétés possèdent des lots/);
  assert.equal(classer({ ...cible, score_ml: ml('top_20') }).pile, 'ecrire');
  assert.equal(classer({ ...cible, score_ml: ml('reste') }).pile, 'surveiller');
  // Propriétaire inconnu du fichier : le modèle voit mal, on écrit plutôt qu'appeler.
  const aveugle = classer({ ...cible, score_ml: ml('top_5', 'inconnu') });
  assert.equal(aveugle.pile, 'ecrire');
  assert.match(aveugle.motif, /le modèle voit mal/);
  // Un local vide reste écarté, quelle que soit la tranche.
  assert.equal(classer({ ...cible, occupe: false, score_ml: ml('top_5') }).pile, 'ecartee');
});
