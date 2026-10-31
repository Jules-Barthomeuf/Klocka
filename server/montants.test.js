import test from 'node:test';
import assert from 'node:assert/strict';
import { montant, fourchette } from './montants.js';

test("à partir de 1 000 k€, en M€ ; dessous, en k€ (31 oct. 2026, Jules)", () => {
  assert.equal(montant(450000), '450 k€');
  assert.equal(montant(999000), '999 k€');
  assert.equal(montant(1000000), '1 M€');
  assert.equal(montant(1300000), '1,3 M€');
  assert.equal(montant(1700000), '1,7 M€');
  assert.equal(montant(0), null);
  assert.equal(montant(null), null);
});

test("une fourchette ne mélange jamais « 1 445 » et « M€ »", () => {
  assert.equal(fourchette(1445000, 1700000), '1,4 – 1,7 M€');
  assert.equal(fourchette(850000, 1200000), '850 k€ – 1,2 M€');
  assert.equal(fourchette(300000, 450000), '300 – 450 k€');
  assert.equal(fourchette(300000, 450000, { sep: ' à ' }), '300 à 450 k€');
  assert.equal(fourchette(null, 1700000), '1,7 M€');
});
