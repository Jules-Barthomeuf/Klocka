// La ligne Bail en texte libre (11 nov. 2026) : ce que l'IA tire du texte, sans date inventée. Le modèle est simulé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireBailLibre, nettoyerBail, dateOuNull } from './bail-libre.js';

test("« 12 ans ferme » : une durée et une période ferme, aucune date", async () => {
  const lu = await lireBailLibre('12 ans ferme', { lire: async () => ({ type_bail: 'Bail de 12 ans ferme', duree_ans: 12, duree_ferme_ans: 12, date_debut: null, date_echeance: null }) });
  assert.equal(lu.type_bail, 'Bail de 12 ans ferme');
  assert.equal(lu.duree_ferme_ans, 12);
  assert.equal(lu.date_debut, null);
  assert.equal(lu.date_echeance, null);
});

test("début et durée donnés : l'échéance se déduit ; une date inventée ou fausse ne passe pas", () => {
  const lu = nettoyerBail({ type_bail: 'Bail commercial 3-6-9', duree_ans: 9, date_debut: '2019-04-01', date_echeance: null }, '3/6/9 depuis avril 2019');
  assert.equal(lu.date_echeance, '2028-03-31');
  assert.equal(dateOuNull('2026-02-30'), null);
  assert.equal(nettoyerBail({ date_debut: 'avril 2019' }, 'x').date_debut, null);
});

test("sans modèle ou en échec : le texte seul, sans aucune date", async () => {
  const lu = await lireBailLibre('bail précaire', { lire: async () => { throw new Error('hors ligne'); } });
  assert.equal(lu.type_bail, 'bail précaire');
  assert.equal(lu.date_echeance, null);
  assert.equal(await lireBailLibre('  '), null);
});
