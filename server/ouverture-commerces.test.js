// La date d'ouverture des commerces (3 nov. 2026) : lire le SIRET d'une ligne du stock, écarter les dates inconnues.
// Rien ici n'écrit dans la base : celle des tests est la vraie (server/data).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_TEST_CONTEXT ||= '1';
const { dateValable, siretDeLigne } = await import('./ouverture-commerces.js');

test('le SIRET d’une ligne du stock, sans la découper', () => {
  assert.equal(siretDeLigne('123456789,00012,12345678900012,O,2014-03-01,,,,'), '12345678900012');
  assert.equal(siretDeLigne('siren,nic,siret,statutDiffusionEtablissement'), null, 'l’en-tête');
  assert.equal(siretDeLigne('123456789,00012,1234567890001,O'), null, 'treize chiffres');
});

test('une date d’ouverture valable, jamais le 1900-01-01 des dates inconnues', () => {
  assert.equal(dateValable('2014-03-01'), '2014-03-01');
  assert.equal(dateValable('1900-01-01'), null);
  assert.equal(dateValable(''), null);
  assert.equal(dateValable('2014'), null);
});
