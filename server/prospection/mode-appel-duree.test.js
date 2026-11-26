import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureePlausible } from './mode-appel.js';

// 26 nov. 2026, Jules : des « répondeur, message laissé » de 2 secondes ; une durée impossible ne s'enregistre pas.
test("la durée d'un appel : sans durée plutôt qu'une durée impossible", () => {
  assert.equal(dureePlausible('repondeur', 2), null);
  assert.equal(dureePlausible('repondeur', 25), 25);
  assert.equal(dureePlausible('pas_de_reponse', 12.4), 12);
  assert.equal(dureePlausible('pas_de_reponse', 0), null);
  assert.equal(dureePlausible('auto', null), null);
});
