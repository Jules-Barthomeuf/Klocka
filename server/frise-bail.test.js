// La frise du bail (src/lib/frise-bail.js) : toujours un début et une fin,
// pour placer aujourd'hui entre les deux.

import test from 'node:test';
import assert from 'node:assert/strict';
import { friseDuProjet, friseBornee, arriveeDuLocataire } from '../src/lib/frise-bail.js';

test('sans prise d\'effet : un début estimé neuf ans avant l\'échéance', () => {
  const f = friseBornee(friseDuProjet({ bail_date_echeance: '2030-03-01' }));
  assert.deepEqual([f.debut, f.fin, f.estime], ['2021-03-01', '2030-03-01', 'debut']);
});

test('sans échéance : une fin estimée neuf ans après la prise d\'effet', () => {
  const f = friseBornee(friseDuProjet({ bail_date_debut: '2022-06-15' }));
  assert.deepEqual([f.debut, f.fin, f.estime], ['2022-06-15', '2031-06-15', 'fin']);
});

test('l\'arrivée du locataire tient lieu de prise d\'effet, si elle date ce bail', () => {
  const f = friseDuProjet({ locataire_depuis: '2022-01-10', bail_date_echeance: '2030-03-01' });
  assert.deepEqual([f.debut, f.debutVient], ['2022-01-10', 'arrivee']);
  assert.equal(friseBornee(f).estime, null);
  // Arrivé vingt ans avant l'échéance : le bail a été renouvelé depuis.
  const ancien = friseBornee(friseDuProjet({ locataire_depuis: '2010-01-10', bail_date_echeance: '2030-03-01' }));
  assert.deepEqual([ancien.debut, ancien.estime], ['2021-03-01', 'debut']);
});

test('la prise d\'effet saisie l\'emporte sur l\'arrivée, et l\'arrivée sur le début du bail', () => {
  const p = { locataire_depuis: '2019-05-01', bail_date_debut: '2021-03-01', bail_date_echeance: '2030-03-01' };
  assert.equal(friseDuProjet(p).debut, '2021-03-01');
  assert.equal(arriveeDuLocataire(p), '2019-05-01');
  assert.equal(arriveeDuLocataire({ bail_date_debut: '2021-03-01' }), '2021-03-01');
  assert.equal(arriveeDuLocataire({}, { debut: '2020-01-01' }), '2020-01-01');
});
