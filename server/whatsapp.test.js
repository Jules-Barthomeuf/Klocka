import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { lireNumeros, signatureValable, messagesDu, pourWhatsApp } from './whatsapp.js';

test('lireNumeros : chiffres seuls, sans + ni 00, adresse en minuscules', () => {
  const m = lireNumeros('33612345678:Jules.B@klocka.immo, +33 6 98 76 54 32:nora@klocka.immo, 0033611111111:x@y.fr, rien');
  assert.equal(m.get('33612345678'), 'jules.b@klocka.immo');
  assert.equal(m.get('33698765432'), 'nora@klocka.immo');
  assert.equal(m.get('33611111111'), 'x@y.fr');
  assert.equal(m.size, 3);
});

test('signatureValable : la signature de Meta sur le corps brut', () => {
  const corps = '{"entry":[]}';
  const bonne = `sha256=${crypto.createHmac('sha256', 's3cret').update(corps).digest('hex')}`;
  assert.equal(signatureValable({ corps, entete: bonne, secret: 's3cret' }), true);
  assert.equal(signatureValable({ corps, entete: bonne, secret: 'autre' }), false);
  assert.equal(signatureValable({ corps, entete: null, secret: 's3cret' }), false);
  assert.equal(signatureValable({ corps, entete: null, secret: '' }), true);
});

test('messagesDu : les messages, pas les statuts', () => {
  const corps = { entry: [{ changes: [{ value: { messages: [{ id: 'a', type: 'text' }] } }, { value: { statuses: [{ id: 's' }] } }] }] };
  assert.deepEqual(messagesDu(corps).map((m) => m.id), ['a']);
  assert.deepEqual(messagesDu({}), []);
});

test('pourWhatsApp : gras simple, pas de titres, coupé à 4 000 signes', () => {
  assert.deepEqual(pourWhatsApp('## Fiche\n**Loyer** : 24 k€'), ['Fiche\n*Loyer* : 24 k€']);
  const long = Array.from({ length: 300 }, (_, i) => `Ligne ${i} ${'x'.repeat(20)}`).join('\n');
  const morceaux = pourWhatsApp(long);
  assert.ok(morceaux.length >= 2 && morceaux.every((x) => x.length <= 4000));
});
