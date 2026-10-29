// Plus de crédit chez Anthropic : une phrase à la place du JSON de l'API (16 oct. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_SANS_CREDIT, estSansCredit, messagePourLaPersonne } from './credit-ia.js';
import { ouvrirFlux } from './flux.js';
import { wrap } from './contexte.js';

const BRUT = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_x"}';

test('le message de Jules, et seulement pour le crédit', () => {
  assert.equal(MESSAGE_SANS_CREDIT, "Désolé je n'ai plus de crédits ! :(");
  assert.equal(estSansCredit(new Error(BRUT)), true);
  assert.equal(messagePourLaPersonne(new Error(BRUT)), MESSAGE_SANS_CREDIT);
  assert.equal(messagePourLaPersonne(new Error('Sunday CRM ne répond pas')), 'Sunday CRM ne répond pas');
  assert.equal(estSansCredit(null), false);
});

test('le flux du chat envoie la phrase, pas le JSON', () => {
  const lignes = [];
  const res = { status() {}, setHeader() {}, write: (l) => lignes.push(JSON.parse(l)), end() {}, writableEnded: false };
  ouvrirFlux(res).erreur(new Error(BRUT));
  assert.deepEqual(lignes, [{ erreur: MESSAGE_SANS_CREDIT }]);
  const autres = [];
  ouvrirFlux({ ...res, write: (l) => autres.push(JSON.parse(l)) }).erreur(new Error('Autre'));
  assert.deepEqual(autres, [{ erreur: 'Autre' }]);
});

test('une route qui échoue sur le crédit répond 402 avec la phrase ; une autre erreur reste une 500', async () => {
  const reponse = () => { const r = { code: null, corps: null, status(c) { r.code = c; return r; }, json(b) { r.corps = b; return r; } }; return r; };
  const a = reponse();
  await wrap(async () => { throw new Error(BRUT); })({}, a);
  assert.deepEqual([a.code, a.corps], [402, { error: MESSAGE_SANS_CREDIT }]);
  const b = reponse();
  await wrap(async () => { throw new Error('boum'); })({}, b);
  assert.deepEqual([b.code, b.corps], [500, { error: 'boum' }]);
});
