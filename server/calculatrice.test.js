import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatrice } from '../src/lib/calculatrice.js';

test('rendements brut et net (acte en main)', () => {
  const c = calculatrice({ loyer: 28000, prixFai: 450000 }, 7.5);
  assert.equal(c.brut, 6.22);
  assert.equal(c.net, 5.79);
});

test('les paliers : les quatre demi-points au-dessus du brut au prix demandé, avec prix et négociation', () => {
  const c = calculatrice({ loyer: 31050, prixFai: 450000 }, 7.5);
  assert.equal(c.brut, 6.9);
  assert.deepEqual(c.paliers.map((x) => x.taux), [7, 7.5, 8, 8.5]);
  const sept = c.paliers[0];
  assert.equal(sept.prix, 443571);
  assert.equal(sept.nego, 1.43);
  assert.deepEqual(calculatrice({ loyer: 28000, prixFai: 400000 }).paliers.map((x) => x.taux), [7.5, 8, 8.5, 9], 'pile 7 % : on part de 7,5');
  assert.deepEqual(calculatrice({ loyer: 28000 }).paliers.map((x) => x.taux), [5, 5.5, 6, 6.5], 'sans prix, à partir de 5 %');
});

test('la négociation s\'applique au prix ; les paliers partent du brut négocié, la négociation à obtenir se compte sur le prix demandé', () => {
  const c = calculatrice({ loyer: 30000, prixFai: 500000, nego: 10 }, 7.5);
  assert.equal(c.prixNegocie, 450000);
  assert.equal(c.brut, 6.67);
  assert.deepEqual(c.paliers.map((x) => x.taux), [7, 7.5, 8, 8.5]);
  assert.equal(c.paliers.find((x) => x.taux === 7.5).nego, 20);
});

test('sans FAI, le net vendeur sert de prix ; sans loyer, rien ne se calcule', () => {
  assert.equal(calculatrice({ loyer: 20000, netVendeur: 400000 }).brut, 5);
  const vide = calculatrice({});
  assert.equal(vide.brut, null);
  assert.ok(vide.paliers.every((x) => x.prix == null && x.nego == null));
});

test('un seul prix : dit net vendeur, le FAI s\'en déduit ; dit FAI, le net vendeur ; sinon rien', async () => {
  const { prixDesDeux } = await import('../src/lib/calculatrice.js');
  assert.deepEqual(prixDesDeux({ prix: 400000, base: 'net_vendeur' }), { fai: 420000, net: 400000, honorairesPct: 5 });
  assert.equal(prixDesDeux({ prix: 400000, base: 'net_vendeur', honorairesPct: 6 }).fai, 424000);
  assert.equal(prixDesDeux({ prix: 500000, base: 'net_vendeur', honoraires: 25000 }).fai, 525000);
  assert.equal(prixDesDeux({ prix: 420000, base: 'fai' }).net, 400000);
  assert.deepEqual(prixDesDeux({ prix: 420000 }), { fai: 420000, net: null, honorairesPct: null });
  assert.equal(prixDesDeux({}).fai, null);
});
