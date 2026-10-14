// L'adresse des liens envoyés (14 oct. 2026, Jules) : app.klocka.immo, jamais l'adresse de Render.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.RENDER_EXTERNAL_URL = 'https://klocka-unus.onrender.com';
delete process.env.APP_URL;
const { APP_URL_PROD, URL_CANONIQUE, urlPublique } = await import('./contexte.js');

test('l\'adresse de Render devient app.klocka.immo ; une autre adresse reste la sienne', () => {
  assert.equal(URL_CANONIQUE, 'https://app.klocka.immo');
  assert.equal(APP_URL_PROD, 'https://app.klocka.immo');
  const req = (host) => ({ headers: { host, 'x-forwarded-proto': 'https' }, protocol: 'https' });
  assert.equal(urlPublique(req('klocka-unus.onrender.com')), 'https://app.klocka.immo');
  assert.equal(urlPublique(req('app.klocka.immo')), 'https://app.klocka.immo');
  assert.equal(urlPublique({ headers: { host: 'localhost:5173' }, protocol: 'http' }), 'http://localhost:5173');
});
