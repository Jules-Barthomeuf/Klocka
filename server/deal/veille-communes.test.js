// Le coup d'oeil de chaque minute sur sourcing@ (19 nov. 2026, Jules : « ça prend trop longtemps quand un mail avec une
// fiche est transféré vers sourcing@ ») : un mail inconnu sur la boîte commune fait partir la relève, une fois.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-veille-communes-'));
const { Records } = await import('../db.js');
const { regarderCommunes } = await import('./veille-mails.js');

for (const email of ['sourcing@klocka.immo', 'jules@klocka.immo']) {
  Records.create('User', { email, role: 'admin' });
  Records.create('MailAccount', { email, owner_email: email, provider: 'google', peut_lire: true, connected_at: new Date().toISOString() });
}

test('seule la boîte commune est regardée, et un mail inconnu fait partir la relève une seule fois', async () => {
  const lues = [];
  let releves = 0;
  let boite = [];
  const inconnus = async (email) => { lues.push(email); return boite; };
  const releve = async () => { releves += 1; };

  assert.deepEqual(await regarderCommunes({ inconnus, releve }), []);
  assert.equal(releves, 0, 'rien de neuf : pas de relève');
  assert.deepEqual(lues, ['sourcing@klocka.immo'], 'les boîtes personnelles attendent la relève des quinze minutes');

  boite = ['m1'];
  assert.deepEqual(await regarderCommunes({ inconnus, releve }), ['m1']);
  assert.equal(releves, 1);

  // Le mail est resté inconnu (sa lecture a échoué) : la relève ne repart pas chaque minute pour lui.
  assert.deepEqual(await regarderCommunes({ inconnus, releve }), []);
  assert.equal(releves, 1);

  boite = ['m1', 'm2'];
  assert.deepEqual(await regarderCommunes({ inconnus, releve }), ['m2']);
  assert.equal(releves, 2);
});

test('une boîte illisible ne fait rien partir', async () => {
  let releves = 0;
  const r = await regarderCommunes({ inconnus: async () => { throw new Error('jeton expiré'); }, releve: async () => { releves += 1; } });
  assert.deepEqual(r, []);
  assert.equal(releves, 0);
});
