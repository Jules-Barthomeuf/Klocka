// Les montants en toutes lettres du mandat (module partagé avec le front).

import test from 'node:test';
import assert from 'node:assert/strict';
const { entierEnLettres, eurosEnLettres, eurosChiffres } = await import('../src/lib/nombre-en-lettres.js');

test('les nombres en lettres, règles françaises comprises', () => {
  assert.equal(entierEnLettres(0), 'zéro');
  assert.equal(entierEnLettres(21), 'vingt et un');
  assert.equal(entierEnLettres(71), 'soixante et onze');
  assert.equal(entierEnLettres(80), 'quatre-vingts');
  assert.equal(entierEnLettres(81), 'quatre-vingt-un');
  assert.equal(entierEnLettres(91), 'quatre-vingt-onze');
  assert.equal(entierEnLettres(200), 'deux cents');
  assert.equal(entierEnLettres(201), 'deux cent un');
  assert.equal(entierEnLettres(1000), 'mille');
  assert.equal(entierEnLettres(80000), 'quatre-vingt mille', 'pas de s devant mille');
  assert.equal(entierEnLettres(200000), 'deux cent mille', 'pas de s devant mille');
  assert.equal(entierEnLettres(450000), 'quatre cent cinquante mille');
  assert.equal(entierEnLettres(22500), 'vingt-deux mille cinq cents');
  assert.equal(entierEnLettres(1000000), 'un million');
  assert.equal(entierEnLettres(2000000), 'deux millions');
  assert.equal(entierEnLettres(200000000), 'deux cents millions', 'million est un nom : cents garde son s');
  assert.equal(entierEnLettres(1250000), 'un million deux cent cinquante mille');
});

test('les euros comme MyNotary les écrit', () => {
  assert.equal(eurosEnLettres(0), 'ZÉRO EURO (0,00 €)');
  assert.equal(eurosEnLettres(1), 'UN EURO (1,00 €)');
  assert.equal(eurosEnLettres(450000).replace(/\u202f|\u00a0/g, ' '), 'QUATRE CENT CINQUANTE MILLE EUROS (450 000,00 €)');
  assert.equal(eurosEnLettres(18750.5).replace(/\u202f|\u00a0/g, ' '), 'DIX-HUIT MILLE SEPT CENT CINQUANTE EUROS ET CINQUANTE CENTIMES (18 750,50 €)');
  assert.equal(eurosChiffres(1000).replace(/\u202f|\u00a0/g, ' '), '1 000,00 €');
});
