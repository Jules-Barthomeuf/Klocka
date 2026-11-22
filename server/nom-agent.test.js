// Le nom d'un agent, toujours « Prénom Nom ».

import test from 'node:test';
import assert from 'node:assert/strict';
import { nomAgent } from './nom-agent.js';

test('le nom d\'un agent, au même format d\'où qu\'il vienne', () => {
  assert.equal(nomAgent('M. Karl MONTIGNY'), 'Karl Montigny');
  assert.equal(nomAgent('Madame Marty'), 'Marty');
  assert.equal(nomAgent('karl.montigny@orpi.com'), 'Karl Montigny');
  assert.equal(nomAgent('apetit.agducentre@orpi.com'), 'Apetit Agducentre');
  assert.equal(nomAgent('contact@agence.fr'), null);
  assert.equal(nomAgent('JEAN-PIERRE DE LA FONTAINE'), 'Jean-Pierre de la Fontaine');
  assert.equal(nomAgent('sophie martin'), 'Sophie Martin');
  assert.equal(nomAgent('x', { prenom: 'Nora', nom_famille: "D'ALMEIDA" }), "Nora D'Almeida");
  assert.equal(nomAgent(''), null);
});
