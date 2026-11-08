import test from 'node:test';
import assert from 'node:assert/strict';
import { memeContact } from './acquereurs-du-bien.js';

test("le même contact se retrouve sans doublon (8 nov. 2026)", () => {
  const lignes = [{ id: 'a', nom: '(test) Sophie Martin' }, { id: 'b', nom: '(test) Joël et Marie Bertrand' }, { id: 'c', nom: 'Karim Benali' }];
  assert.equal(memeContact(lignes, 'Sophie Martin').ligne?.id, 'a');
  assert.equal(memeContact(lignes, 'Joël et Marie Bertrand').ligne?.id, 'b');
  assert.equal(memeContact(lignes, 'les Bertrand').ligne?.id, 'b');
  assert.equal(memeContact(lignes, 'Mme Martin').ligne?.id, 'a');
  assert.equal(memeContact(lignes, 'Paul Durand').ligne, null, 'une personne nouvelle : une nouvelle ligne');
  const deux = [{ id: 'x', nom: 'Paul Martin' }, { id: 'y', nom: 'Sophie Martin' }];
  assert.equal(memeContact(deux, 'Martin').ambigu?.length, 2, 'deux Martin : on demande');
  assert.equal(memeContact(deux, 'Sophie Martin').ligne?.id, 'y');
});
