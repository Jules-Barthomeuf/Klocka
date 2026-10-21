// La cloche : retirer une ligne, ou la remettre à une date (21 oct. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cloche-'));
const { clesActives, masquer, masquesDe } = await import('./cloche.js');

test('une ligne retirée ne compte plus ; remise à une date, elle revient ce jour-là', async () => {
  const maintenant = new Date('2026-10-21T10:00:00Z');
  const m = [{ cle: 'a', jusqua: null }, { cle: 'b', jusqua: '2026-10-22T07:00:00Z' }, { cle: 'c', jusqua: '2026-10-20T07:00:00Z' }];
  assert.deepEqual(clesActives(m, maintenant), ['a', 'b']);
  const jules = { email: 'Jules@test.local' };
  assert.equal((await masquer(jules, { cle: 'alerte:x' })).ok, true);
  assert.deepEqual(masquesDe('jules@test.local'), ['alerte:x']);
  assert.deepEqual(masquesDe('nora@test.local'), [], 'chacun ses lignes');
  assert.equal((await masquer(jules, { cle: '' })).ok, false);
});
