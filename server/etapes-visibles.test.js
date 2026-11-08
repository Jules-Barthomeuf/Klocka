import test from 'node:test';
import assert from 'node:assert/strict';
import { etapesVisibles, rangVisible, versVisible, etapeFaite, libelleVisible, NB_ETAPES_VISIBLES } from '../src/lib/biens-mandataire.js';

test("six étapes à l'écran : la Data room et la Commercialisation font la Mise en vente (7 nov. 2026)", () => {
  assert.equal(NB_ETAPES_VISIBLES, 6);
  assert.deepEqual(etapesVisibles(null).map((e) => e.label), ['Visite', 'Avis de valeur', 'Mandat', 'Mise en vente', 'Offres', 'Vente']);
  assert.equal(etapesVisibles({ biens: { transaction: 'location' } })[3].label, 'Mise en location');
  // Les rangs internes (1 à 7) tombent sur les six : Data room et Commercialisation sont la quatrième.
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(rangVisible), [1, 2, 3, 4, 4, 5, 6]);
  assert.equal(versVisible('marche'), 'dataroom');
  assert.equal(libelleVisible(null, 'marche'), 'Mise en vente');
  // Faite quand la Commercialisation l'est, pas à la seule Data room.
  const mev = etapesVisibles(null)[3];
  assert.equal(etapeFaite(new Set(['dataroom']), mev), false);
  assert.equal(etapeFaite(new Set(['dataroom', 'marche']), mev), true);
});
