// La carte des transactions autour d'un commerce (17 nov. 2026) : ce que chaque point garde.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pointMurs, pointFonds, RAYON_M } from './carte-transactions.js';

test('une vente de murs garde son prix, sa surface, son prix au m² et sa distance', () => {
  assert.deepEqual(pointMurs({ lat: 45.7, lon: 4.8, date: '2025-07-03', prix: 175000, surface: 34, prix_m2: 5147, adresse: '28 RUE NEUVE', distance_m: 50, parcelle: 'x' }),
    { lat: 45.7, lon: 4.8, date: '2025-07-03', prix: 175000, surface: 34, prix_m2: 5147, adresse: '28 RUE NEUVE', distance_m: 50 });
});

test('une cession sans prix publié reste sans prix, jamais estimée', () => {
  const p = pointFonds({ lat: 45.7, lon: 4.8, date: '2026-02-20', prix: null, activite: 'Restauration', enseigne: 'X', adresse: 'a', distance_m: 248 });
  assert.equal(p.prix, null);
  assert.equal(p.sur_place, false);
  assert.equal(RAYON_M, 500);
});
