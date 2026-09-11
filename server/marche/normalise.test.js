// La règle qui protège une note d'investissement : une case vide reste vide.

import test from 'node:test';
import assert from 'node:assert/strict';
import { valeur, poser, manquants, nombreOuRien, INDICATEURS } from './normalise.js';

const source = { connecteur: 'x', service: 'X', libelle: 'X · module', collecte_le: '2026-09-11T08:00:00.000Z' };

test('une valeur porte son unité, sa source et sa date', () => {
  const v = valeur({ cle: 'loyer_commercial_m2_an', bas: 150, median: 180, haut: 220, echelle: 'rue', source });
  assert.equal(v.unite, '€ / m² / an');
  assert.equal(v.service, 'X');
  assert.equal(v.source, 'X · module');
  assert.equal(v.collecte_le, '2026-09-11T08:00:00.000Z');
  assert.equal(v.echelle, 'rue');
});

test('un indicateur sans aucun chiffre n’existe pas', () => {
  assert.equal(valeur({ cle: 'loyer_commercial_m2_an', bas: null, median: null, haut: null, source }), null);
  assert.equal(valeur({ cle: 'prix_residentiel_m2', bas: undefined, source }), null);
});

test('un zéro est une absence, pas une valeur', () => {
  assert.equal(nombreOuRien(0), null);
  assert.equal(nombreOuRien('0'), null);
  assert.equal(nombreOuRien(150), 150);
  assert.equal(nombreOuRien('abc'), null);
  // Un seul chiffre suffit à faire exister l'indicateur ; les autres restent vides.
  const v = valeur({ cle: 'prix_residentiel_m2', bas: 0, median: 3200, haut: null, source });
  assert.equal(v.bas, null);
  assert.equal(v.median, 3200);
  assert.equal(v.haut, null);
});

test('la première source qui répond garde la main', () => {
  const indicateurs = {};
  poser(indicateurs, [valeur({ cle: 'loyer_commercial_m2_an', median: 180, source })]);
  poser(indicateurs, [valeur({ cle: 'loyer_commercial_m2_an', median: 999, source: { ...source, service: 'Y' } })]);
  assert.equal(indicateurs.loyer_commercial_m2_an.median, 180);
  assert.equal(indicateurs.loyer_commercial_m2_an.service, 'X');
});

test('une source de repli comble les cases vides sans corriger les autres', () => {
  const indicateurs = {};
  poser(indicateurs, [valeur({ cle: 'prix_residentiel_m2', median: 3200, source })]);
  poser(indicateurs, [
    valeur({ cle: 'prix_residentiel_m2', median: 9999, source }),
    valeur({ cle: 'loyer_residentiel_m2_mois', median: 14, source }),
  ]);
  assert.equal(indicateurs.prix_residentiel_m2.median, 3200);
  assert.equal(indicateurs.loyer_residentiel_m2_mois.median, 14);
});

test('on sait dire ce qui manque', () => {
  const indicateurs = {};
  poser(indicateurs, [valeur({ cle: 'loyer_commercial_m2_an', median: 180, source })]);
  assert.deepEqual(manquants(indicateurs, ['loyer_commercial_m2_an', 'prix_fonds_commerce']), ['prix_fonds_commerce']);
});

test('tout indicateur déclaré a un titre et une unité', () => {
  for (const [cle, def] of Object.entries(INDICATEURS)) {
    assert.ok(def.titre, cle);
    assert.ok(def.unite, cle);
  }
});
