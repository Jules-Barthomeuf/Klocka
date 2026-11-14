import test from 'node:test';
import assert from 'node:assert/strict';
import { lignesVacance, motVacance, phraseVacance } from '../../src/lib/vacance-reperes.js';

test('les seuils de Jules : 10 % beaucoup, 20 % trop', () => {
  assert.equal(motVacance(9.9), 'ça va');
  assert.equal(motVacance(10), 'ça commence à faire beaucoup');
  assert.equal(motVacance(20), "c'est trop");
});

test('la rue face aux centres-villes de France', () => {
  assert.equal(phraseVacance(9.3), 'ça va, un peu sous la moyenne des centres-villes de France (11,7 %)');
  assert.equal(phraseVacance(11.5), 'ça commence à faire beaucoup, dans la moyenne des centres-villes de France (11,7 %)');
  assert.equal(phraseVacance(22), "c'est trop, au-dessus de la moyenne des centres-villes de France (11,7 %)");
  assert.equal(phraseVacance(null), null);
});

test('la rue rangée parmi les repères', () => {
  const l = lignesVacance(9.3);
  assert.deepEqual(l.map((x) => x.nom), ['Zones commerciales', 'La rue', 'Centres-villes de France', 'Villes moyennes', 'Centres commerciaux']);
  assert.equal(lignesVacance(undefined).length, 4);
});
