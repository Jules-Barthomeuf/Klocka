// Gmail prévient d'un mail arrivé (17 nov. 2026) : la notification Pub/Sub et le jeton de l'adresse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { jetonValide, lireNotification } from './gmail-push.js';

test('la notification Pub/Sub se décode, une illisible est ignorée', () => {
  const data = Buffer.from(JSON.stringify({ emailAddress: 'Sourcing@Klocka.immo', historyId: '123' })).toString('base64');
  assert.deepEqual(lireNotification({ message: { data, messageId: '1' }, subscription: 's' }), { emailAddress: 'sourcing@klocka.immo', historyId: '123' });
  assert.equal(lireNotification({ message: { data: 'pas du json' } }), null);
  assert.equal(lireNotification({}), null);
});

test("le jeton de l'adresse : le bon seulement, et jamais sans jeton attendu", () => {
  assert.equal(jetonValide('abc123', 'abc123'), true);
  assert.equal(jetonValide('abc124', 'abc123'), false);
  assert.equal(jetonValide('abc', 'abc123'), false);
  assert.equal(jetonValide('', ''), false);
});
