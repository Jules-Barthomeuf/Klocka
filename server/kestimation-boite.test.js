import test from 'node:test';
import assert from 'node:assert/strict';
import { troisValeurs, prixM2SelonTaille, rendementKlocka, confianceEcart } from './kestimation-boite.js';

const ventes = (n, prix, surface) => Array.from({ length: n }, (_, i) => ({ prix_m2: prix + i * 100, surface }));

test('la taille : les ventes de surface proche quand il y en a 5, sinon toutes', () => {
  const v = [...ventes(5, 6000, 40), ...ventes(6, 3000, 400)];
  assert.equal(prixM2SelonTaille(v, 50).median, 6200);
  assert.equal(prixM2SelonTaille(v, 50).ajuste_taille, true);
  assert.equal(prixM2SelonTaille(v, 1000).ajuste_taille, false);
  assert.equal(prixM2SelonTaille(ventes(3, 1000, 50), 50), null);
});

test('le rendement des projets Klocka signés : au moins 3, dans la commune, entre 2 et 20 %', () => {
  const p = (loyer, prix, o = {}) => ({ statut: 'signe', ville: 'Nice', sim_loyer_initial_ht: loyer, sim_prix_bien_negocie: prix, ...o });
  assert.deepEqual(rendementKlocka([p(14000, 200000), p(16000, 200000), p(12000, 200000)], { ville: 'Nice' }), { taux: 7, n: 3 });
  assert.equal(rendementKlocka([p(14000, 200000), p(16000, 200000)], { ville: 'Nice' }).taux, null);
  assert.equal(rendementKlocka([p(14000, 200000, { statut: 'analyse' }), p(1, 200000), p(16000, 200000, { ville: 'Cannes' })], { ville: 'Nice' }).n, 0);
});

test('la confiance suit l’écart entre les méthodes', () => {
  assert.equal(confianceEcart([100, 110, 105]).niveau, 'haute');
  assert.equal(confianceEcart([100, 125]).niveau, 'moyenne');
  assert.equal(confianceEcart([100, 200]).niveau, 'faible');
  assert.equal(confianceEcart([100]).niveau, 'faible');
});

test('les trois valeurs : comparaison, capitalisation au rendement implicite, Equimmox ; médiane retenue', () => {
  const r = troisValeurs({
    marche: { murs: { prix_m2: { bas: 5000, median: 6000, haut: 7000 }, n: 8, cercle_libelle: 'la même rue', ventes: ventes(6, 5800, 60) }, vlm_equimmox: { bas: 350, moyenne: 420, haut: 500 }, prix_equimmox: { bas: 5500, moyenne: 6500, haut: 7500, offres: 12 } },
    surfaces: { totale: 60, ponderee: 60 }, loyer: null,
  });
  assert.deepEqual(Object.keys(r.methodes).sort(), ['capitalisation', 'comparaison', 'equimmox']);
  assert.match(r.methodes.capitalisation.taux_origine, /implicite/);
  assert.equal(r.methodes.capitalisation.taux, 6.94); // 420 € / m² / an ÷ 6 050 € / m² (médiane des ventes de surface proche)
  assert.equal(r.methodes.capitalisation.redondante, true);
  assert.equal(r.valeurs.moyenne, 377000); // comparaison 363 000 et Equimmox 390 000 ; la capitalisation au rendement implicite ne compte pas
  assert.equal(r.manques.length, 0);
});

test('jamais vide sans raison : un loyer en place seul suffit, et ce qui manque est dit', () => {
  const r = troisValeurs({ marche: { taux_grille: 7.5 }, surfaces: {}, loyer: 30000 });
  assert.equal(r.valeurs.moyenne, 400000);
  assert.match(r.methodes.capitalisation.taux_origine, /grille/);
  assert.ok(r.manques.some((m) => /surface/.test(m)));
  const vide = troisValeurs({ marche: {}, surfaces: {}, loyer: null });
  assert.equal(vide.valeurs, null);
  assert.ok(vide.manques.length >= 2);
});

test('vacant, au rendement implicite : la capitalisation refait la comparaison et ne compte pas', () => {
  const r = troisValeurs({
    marche: { murs: { prix_m2: { bas: 5000, median: 6000, haut: 7000 }, n: 8, ventes: ventes(6, 5800, 60) }, vlm_equimmox: { bas: 350, moyenne: 420, haut: 500 }, prix_equimmox: { bas: 3000, moyenne: 4000, haut: 5000 } },
    surfaces: { totale: 60, ponderee: 60 }, loyer: null,
  });
  assert.equal(r.methodes.capitalisation.redondante, true);
  assert.equal(r.valeurs.moyenne, Math.round(((363000 + 240000) / 2) / 1000) * 1000);
  assert.match(r.confiance.raison, /^2 méthodes/);
  const enPlace = troisValeurs({ marche: { murs: { prix_m2: { bas: 5000, median: 6000, haut: 7000 }, n: 8, ventes: ventes(6, 5800, 60) }, vlm_equimmox: { moyenne: 420 } }, surfaces: { totale: 60 }, loyer: 30000 });
  assert.equal(enPlace.methodes.capitalisation.redondante, undefined);
});
