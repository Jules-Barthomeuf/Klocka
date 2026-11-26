import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adresseAvatar, photoVersTwenty } from './photo-membre.js';

test("l'avatar Twenty : sans jeton, sur l'adresse publique", () => {
  assert.equal(adresseAvatar('http://twenty-server-fra:3000/file/core-picture/abc?token=xyz', 'https://twenty.example.com/'), 'https://twenty.example.com/file/core-picture/abc');
  assert.equal(adresseAvatar('https://twenty.example.com/file/core-picture/abc?token=xyz', ''), 'https://twenty.example.com/file/core-picture/abc');
});

test("pendant les tests, la photo ne part jamais dans le vrai Twenty", async () => {
  const r = await photoVersTwenty('quelquun@test.local', '/nulle/part.jpg');
  assert.deepEqual(r, { ok: false, raison: 'hors de Render' });
});
