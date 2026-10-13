// L'analyse de prix d'Equimmox : la page de résultat, lue ligne à ligne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { lirePrix } from './equimmox.js';

test('Bas, Moyenne, Haut, le nombre d\'offres et l\'étendue', () => {
  assert.deepEqual(lirePrix(['7 offres', '1 792 – 6 682 €/m²', 'Offres', 'Modifier filtres', 'Bas : 1 710€/m²', 'Moyenne : 2 816€/m²', 'Haut : 6 866€/m²', '202 jours']),
    { bas: 1710, moyenne: 2816, haut: 6866, offres: 7, min: 1792, max: 6682, delai_jours: 202 });
});

test('l\'histogramme pas encore là : les prix sans le nombre d\'offres ; rien du tout : null', () => {
  const r = lirePrix(['Offres', 'Bas : 871€/m²', 'Moyenne : 2 381€/m²', 'Haut : 3 960€/m²']);
  assert.equal(r.moyenne, 2381);
  assert.equal(r.offres, null);
  assert.equal(lirePrix(['Offres', 'Modifier filtres']), null);
});
