// La pondération, éprouvée sur les VRAIES citations des dossiers en base.
//
// Ce ne sont pas des phrases inventées pour l'occasion : elles sortent des
// fiches que l'équipe reçoit, avec leurs abréviations, leurs décimales à la
// française et leurs tirets. Un parseur qui ne tient que sur des exemples
// propres se trompe le jour où il compte.

import test from 'node:test';
import assert from 'node:assert/strict';
import { decomposer, expliquer } from '../../src/lib/ponderation.js';

test('décompose les citations réelles des dossiers', () => {
  // 93 avenue Marceau : le cas qui a montré le problème.
  const marceau = decomposer('Surface : 91m2 RDC, environ 44m2 S.SOL', 91);
  assert.deepEqual(marceau.parties.map((p) => [p.cle, p.m2]), [['rdc', 91], ['sous_sol', 44]]);
  assert.equal(marceau.ponderee, 104.2);
  assert.equal(marceau.brute, 135);

  // Un bail qui nomme sa cave.
  const cave = decomposer('Surface : 41 m² (local commercial RDC) + 31 m² (cave)', 41);
  assert.equal(cave.ponderee, 50.3);

  // Trois niveaux, trois coefficients.
  const trois = decomposer('Surface 94 m² — 59 RDC + 15 1er étage + 20 sous-sol', 94);
  assert.deepEqual(trois.parties.map((p) => p.cle), ['rdc', 'etage', 'sous_sol']);
  assert.equal(trois.ponderee, 72.5);
});

test('une virgule entre deux chiffres est une décimale, pas un séparateur', () => {
  // « 121,8 m2 » découpé sur la virgule donnait 121 : un mètre carré perdu à
  // chaque décimale, sur toutes les fiches qui en portent.
  const d = decomposer('RDC 121,8 m2 /Sous sol 86,4 m2, Extraction 400', 121.8);
  assert.deepEqual(d.parties.map((p) => p.m2), [121.8, 86.4]);
  assert.equal(d.ponderee, 147.7);
});

test('un tiret dans un mot n’est pas un séparateur', () => {
  // « 20 sous-sol » découpé sur le tiret donnait « 20 sous » et « sol ».
  const d = decomposer('Surface 60 m² — 40 RDC + 20 sous-sol', 60);
  assert.equal(d.parties.length, 2);
  assert.equal(d.ponderee, 46);
});

test('sans décomposition claire, on ne pondère pas', () => {
  // La règle de la maison : une case vide vaut mieux qu'un chiffre fabriqué.
  assert.equal(decomposer('Surface de 99,55 m²', 99.55), null, 'une seule surface');
  assert.equal(decomposer('Surface | 43,5 m² — RDC', 43.5), null, 'une seule partie nommée');
  assert.equal(decomposer('Surface 60 m² plain-pied + terrasse aménageable', 60), null, 'une partie sans chiffre');
  assert.equal(decomposer('Surface (46 m² salle + annexes)', 46), null, 'aucune partie secondaire chiffrée');
  assert.equal(decomposer('', 80), null);
  assert.equal(decomposer(null, 80), null);
});

test('une décomposition invraisemblable est refusée', () => {
  // 600 m² de réserve derrière une boutique de 40 : c'est une phrase mal
  // découpée, pas un local. On préfère ne rien pondérer.
  assert.equal(decomposer('Boutique 40 m² + réserve 600 m²', 40), null);
  // En revanche la somme peut dépasser la surface du lot : beaucoup de fiches
  // ne déclarent que le rez-de-chaussée.
  assert.ok(decomposer('Boutique 40 m² + réserve 30 m²', 40));
});

test('l’explication dit le calcul, coefficients compris', () => {
  const d = decomposer('Surface : 91m2 RDC, environ 44m2 S.SOL', 91);
  assert.equal(expliquer(d), '91 m² rez-de-chaussée (×1) + 44 m² sous-sol (×0,3) = 104,2 m² pondérés');
  assert.equal(expliquer(null), null);
});
