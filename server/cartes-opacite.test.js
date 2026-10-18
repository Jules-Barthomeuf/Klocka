import test from 'node:test';
import assert from 'node:assert/strict';
import { OPACITE_DEFAUT, opaciteCartes } from '../src/lib/opacite-cartes.js';

test("l'opacité des cartes : pleine par défaut, bornée entre 10 et 100", () => {
  assert.equal(OPACITE_DEFAUT, 100);
  assert.equal(opaciteCartes(undefined), 100);
  assert.equal(opaciteCartes(60), 60);
  assert.equal(opaciteCartes('45'), 45);
  assert.equal(opaciteCartes(0), 10);
  assert.equal(opaciteCartes(500), 100);
  assert.equal(opaciteCartes('abc'), 100);
});
