// Le Drive partagé : le compte qui le voit (16 oct. 2026, Jules : « il doit bien être connecté au drive Klocka »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-drive-'));
process.env.GOOGLE_DRIVE_NOM = 'KLOCKA';
process.env.SUPER_ADMIN_EMAILS = 'jules.b@klocka.immo';
delete process.env.GOOGLE_DRIVE_ID;
delete process.env.GOOGLE_DRIVE_COMPTE;
const { Records } = await import('./db.js');
const D = await import('./google-drive.js');

const futur = new Date(Date.now() + 3600 * 1000).toISOString();
const compte = (email, jeton, extra = {}) => Records.create('MailAccount', { email, access_token: jeton, expires_at: futur, refresh_token: 'r', peut_drive: true, ...extra });
compte('sourcing@klocka.immo', 'tok-sourcing');
compte('jules.b@klocka.immo', 'tok-jules');
compte('nora.l@klocka.immo', 'tok-nora');

// Les drives que chaque jeton voit : seul celui de Jules est membre de KLOCKA.
let appels = [];
const vrai = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const jeton = String(options.headers?.Authorization || '').replace('Bearer ', '');
  appels.push(jeton);
  const drives = jeton === 'tok-jules' ? [{ id: 'D1', name: 'KLOCKA' }] : [];
  return { ok: true, status: 200, json: async () => ({ drives }) };
};
test.after(() => { globalThis.fetch = vrai; });

test('un compte membre du Drive partagé sert pour lui-même', async () => {
  D.oublierComptesDrive();
  const a = await D.compteDriveEffectif('jules.b@klocka.immo');
  assert.equal(a.email, 'jules.b@klocka.immo');
});

test('un compte qui n\'est pas membre passe par un compte de Jules qui voit le Drive, et le dit', async () => {
  D.oublierComptesDrive();
  const a = await D.compteDriveEffectif('sourcing@klocka.immo');
  assert.equal(a.email, 'jules.b@klocka.immo');
  assert.ok(appels.includes('tok-sourcing'), 'le compte demandé est essayé d\'abord');
});

test('le compte retenu n\'est pas redemandé à Google à chaque appel', async () => {
  D.oublierComptesDrive();
  await D.compteDriveEffectif('sourcing@klocka.immo');
  appels = [];
  await D.compteDriveEffectif('sourcing@klocka.immo');
  assert.deepEqual(appels, []);
});

test('personne ne voit le Drive : l\'erreur dit qui ajouter, au lieu de « introuvable »', async () => {
  D.oublierComptesDrive();
  Records.list('MailAccount').filter((x) => x.email === 'jules.b@klocka.immo').forEach((x) => Records.update('MailAccount', x.id, { peut_drive: false }));
  await assert.rejects(() => D.compteDriveEffectif('nora.l@klocka.immo'), /introuvable depuis nora\.l@klocka\.immo.*Ajoutez nora\.l@klocka\.immo comme membre/s);
});
