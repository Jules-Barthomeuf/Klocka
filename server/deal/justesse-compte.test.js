// La justesse du compte des fiches reçues (23 nov. 2026) : le geste de vérification et sa mesure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { corrigerCompte, justesseDuCompte } from './justesse-compte.js';

test('le geste : « Juste » retient le compte de la machine, un nombre le corrige, le compte de la machine ne bouge plus', () => {
  const juste = corrigerCompte({}, { valide: true }, { auto: 4, par: 'jules@klocka.immo', le: 'x' });
  assert.deepEqual(juste, { auto: 4, valide: true, pas_fiche: false, biens: 4, par: 'jules@klocka.immo', le: 'x' });
  const deux = corrigerCompte({}, { biens: 2 }, { auto: 1, par: 'jules@klocka.immo', le: 'x' });
  assert.deepEqual([deux.auto, deux.biens, deux.valide], [1, 2, true]);
  // Recorrigé ensuite : la machine avait dit 1, ça reste 1.
  assert.equal(corrigerCompte(deux, { biens: 3 }, { auto: 2 }).auto, 1);
  // Corrigé avant la mesure (sans `auto`) : le compte de la machine est inconnu.
  assert.equal(corrigerCompte({ biens: 2 }, { biens: 3 }, { auto: 2 }).auto, null);
  // Changer la personne seule ne vérifie pas le compte.
  assert.equal(corrigerCompte({}, { analyste: 'nora.l@klocka.immo' }, { auto: 1 }).valide, undefined);
});

test('la mesure : la part des envois vérifiés bien comptés, semaine par semaine ; les fiches ajoutées à la main étaient manquées', () => {
  const r = justesseDuCompte([
    { le: '2026-11-17T09:00:00Z', biens: 4, compte: { auto: 4, valide: true, biens: 4 } },
    { le: '2026-11-18T09:00:00Z', biens: 2, compte: { auto: 1, valide: true, biens: 2 } },
    { le: '2026-11-18T10:00:00Z', biens: 0, compte: { auto: 1, pas_fiche: true } },
    { le: '2026-11-19T10:00:00Z', biens: 1, compte: null },
    { le: '2026-11-24T10:00:00Z', biens: 1, compte: { auto: 1, valide: true, biens: 1 } },
    { le: '2026-11-25T10:00:00Z', biens: 6, canal: 'main', compte: {} },
  ]);
  assert.deepEqual([r.verifies, r.justes, r.taux, r.fiches_auto, r.fiches_vraies], [5, 2, 40, 7, 13]);
  assert.deepEqual(r.semaines.map((s) => [s.semaine, s.verifies, s.justes, s.taux]), [['2026-11-16', 3, 1, 33], ['2026-11-23', 2, 1, 50]]);
});
