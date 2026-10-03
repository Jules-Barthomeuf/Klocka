// L'estimation des murs de Data-B, recopiée : mêmes ajustements, mêmes arrondis.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ajusterRendement, arrondirMilliers, dateDe, estimerMurs } from './data-b-murs.js';

const AUJOURDHUI = new Date(2026, 9, 1);

test('sans critère, le taux de base de Data-B reste tel quel', () => {
  assert.deepEqual(ajusterRendement(7.3, {}, AUJOURDHUI), { taux: 7.3, ajustements: [] });
});

test('chaque critère pèse ce que pèse le curseur de Data-B', () => {
  const r = ajusterRendement(7.3, { etat_immeuble: 'grosoeuvre', extraction: 'oui', angle: 'oui', parking: 'oui', franchise: 'oui', retards_paiement: 'oui' }, AUJOURDHUI);
  // +1 −0,5 −0,25 −0,25 −0,5 +0,5 = 0
  assert.equal(r.taux, 7.3);
  assert.equal(r.ajustements.length, 6);
  assert.equal(ajusterRendement(6, { etat_local: 'brut', pmr: 'travaux_a_realiser', licence_4: 'oui' }, AUJOURDHUI).taux, 7.5);
  assert.equal(ajusterRendement(6, { extraction: 'non', anciennete_locataire: 'plus9ans' }, AUJOURDHUI).taux, 6.3);
});

test("l'échéance du bail : moins d'un an alourdit, plus de trois ans rassure", () => {
  assert.equal(ajusterRendement(6, { date_renouvellement: '01/03/2027' }, AUJOURDHUI).taux, 6.5);
  assert.equal(ajusterRendement(6, { date_renouvellement: '2030-06-30' }, AUJOURDHUI).taux, 5.8);
  assert.equal(ajusterRendement(6, { date_renouvellement: '2028-06-30' }, AUJOURDHUI).taux, 6);
});

test("l'estimation : loyer ÷ taux, 80 % et 120 %, au millier inférieur", () => {
  const e = estimerMurs({ base: 7.3, loyer: 24000, aujourdhui: AUJOURDHUI });
  // 24 000 / 0,073 = 328 767
  assert.deepEqual([e.basse, e.moyenne, e.haute], [263000, 328000, 394000]);
  assert.equal(estimerMurs({ base: 7.3, loyer: 0 }), null);
  assert.equal(arrondirMilliers(328767.12), 328000);
});

test('les dates se lisent sous les écritures courantes', () => {
  assert.equal(dateDe('12/03/2029').getFullYear(), 2029);
  assert.equal(dateDe('31 mars 2029').getMonth(), 2);
  assert.equal(dateDe('2031').getFullYear(), 2031);
  assert.equal(dateDe('bientôt'), null);
});
