// L'adresse qu'on croit d'une connexion Microsoft : jamais le champ « mail »
// d'un annuaire d'entreprise, que son administrateur écrit librement.

import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseFiable, lireJeton } from './microsoft-oauth.js';

const PERSONNEL = '9188040d-6c67-4c5b-b112-36a304b66dad';

test('compte personnel : l\'adresse du compte', () => {
  assert.equal(adresseFiable({ tid: PERSONNEL, email: 'Jules@Outlook.fr' }, {}), 'jules@outlook.fr');
});

test('compte professionnel : le nom de connexion, pas le champ mail', () => {
  assert.equal(adresseFiable({ tid: 'autre' }, { userPrincipalName: 'paul@klocka.immo', mail: 'quelquun@ailleurs.fr' }), 'paul@klocka.immo');
});

test('invité d\'un autre annuaire : refusé', () => {
  assert.equal(adresseFiable({ tid: 'autre' }, { userPrincipalName: 'paul_gmail.com#EXT#@contoso.onmicrosoft.com' }), null);
  assert.equal(adresseFiable({ tid: 'autre' }, {}), null);
});

test('lireJeton : le contenu d\'un jeton, ou rien', () => {
  const corps = Buffer.from(JSON.stringify({ tid: 'x', name: 'Paul' })).toString('base64url');
  assert.deepEqual(lireJeton(`a.${corps}.b`), { tid: 'x', name: 'Paul' });
  assert.deepEqual(lireJeton('illisible'), {});
});
