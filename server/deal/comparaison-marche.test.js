import test from 'node:test';
import assert from 'node:assert/strict';
import { jugement, prixFaiDuLot, adresseDuLot, quartiles, appliquerMarcheManuel } from './comparaison-marche.js';

const champ = (valeur) => ({ valeur, absent: false });

test('le prix FAI ajoute les honoraires quand la fiche les exclut', () => {
  assert.equal(prixFaiDuLot({ prix_fai: champ(200000), honoraires_inclus: champ(false), montant_honoraires: champ(12000) }), 212000);
  assert.equal(prixFaiDuLot({ prix_fai: champ(200000), honoraires_inclus: champ(true), montant_honoraires: champ(12000) }), 200000);
  assert.equal(prixFaiDuLot({}), null);
});

test('au-delà de 15 % de la médiane, le bien sort du marché', () => {
  assert.deepEqual(jugement(3000, { median: 2500 }), { mot: 'au-dessus du marché', sens: 'haut', ecart: 20 });
  assert.equal(jugement(2700, { median: 2500 }).sens, 'juste');
  assert.equal(jugement(2000, { median: 2500 }).sens, 'bas');
  assert.equal(jugement(null, { median: 2500 }), null);
});

test('face à une fourchette sans médiane, on juge sur ses bornes', () => {
  assert.equal(jugement(400, { bas: 130, haut: 330 }).sens, 'haut');
  assert.equal(jugement(200, { bas: 130, haut: 330 }).sens, 'juste');
});

test("l'adresse : la rue, sinon le repère de la fiche", () => {
  assert.equal(adresseDuLot({ lot: { adresse: champ({ rue: '1 avenue Mirabeau', code_postal: '06000', ville: 'Nice' }) } }), '1 avenue Mirabeau, 06000 Nice');
  assert.equal(adresseDuLot({ lot: { adresse: champ({ ville: 'Paris' }) }, lieu: { repere: 'métro Rambuteau' } }), 'Rambuteau, Paris');
  assert.equal(adresseDuLot({ lot: {} }), null);
});

test('les quartiles', () => {
  assert.deepEqual(quartiles([1000, 2000, 3000, 4000, 5000]), { bas: 2000, median: 3000, haut: 4000 });
  assert.equal(quartiles([]), null);
});

test('le marché saisi à la main l\'emporte sur la lecture et se juge contre le bien', () => {
  const lu = { ok: true, bien: { prix_m2: 1400, loyer_m2: 136 }, prix: { median: 860, bas: 700, haut: 1000, source: 'DVF' }, loyer: { median: 120, source: 'Equimmox' } };
  const r = appliquerMarcheManuel(lu, { prix_m2: 1350, loyer_m2: null, par: 'jules.b@klocka.immo' });
  assert.equal(r.prix.median, 1350);
  assert.equal(r.prix.manuel, true);
  assert.equal(r.prix.jugement.sens, 'juste');
  assert.equal(r.prix.lu.median, 860);
  assert.match(r.prix.source, /jules\.b/);
  // Le loyer non saisi reste celui lu.
  assert.equal(r.loyer.median, 120);
  assert.equal(r.loyer.manuel, undefined);
  // Sans saisie, rien ne change.
  assert.equal(appliquerMarcheManuel(lu, null), lu);
});
