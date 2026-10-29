// Une pièce importée dans la Data Room part aussi dans le Drive du dossier. Sans Google : un faux Drive.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-drive-dr-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const { copierAuDrive } = await import('./drive-data-room.js');

const uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-drive-dr-up-'));
fs.writeFileSync(path.join(uploads, 'bail.pdf'), 'bail');
fs.writeFileSync(path.join(uploads, 'dpe.pdf'), 'dpe');
Records.create('User', { email: 'jules@klocka.immo', role: 'admin' });
Records.create('MailAccount', { email: 'jules@klocka.immo', owner_email: 'jules@klocka.immo', provider: 'google', peut_drive: true });

function fauxDrive() {
  const appels = [];
  return {
    appels,
    async deposerDansDossier(compte, dossierId, f) { appels.push(['deposer', compte, dossierId, f.nom]); if (dossierId === 'perdu') throw new Error('404'); return { id: `f-${f.nom}`, webViewLink: `https://drive/${f.nom}` }; },
    async listerFichiers(compte, { dossierId }) { appels.push(['lister', dossierId]); return dossierId === 'dossier-4' ? [{ nom: 'bail.PDF' }] : []; },
    async classerDansDrive(compte, titre, fichiers) { appels.push(['classer', compte, titre, fichiers.map((x) => x.nom).join()]); return { folder_id: 'nouveau', folder_url: 'https://drive/dossier', envoyes: fichiers.map((x) => x.nom), erreurs: [] }; },
  };
}
const pieces = () => [
  { id: 'a', nom: 'Bail.pdf', url: '/uploads/bail.pdf', mime: 'application/pdf' },
  { id: 'b', nom: 'DPE.pdf', url: '/uploads/dpe.pdf', mime: 'application/pdf' },
];
const user = { email: 'jules@klocka.immo' };

test('le dossier Drive connu reçoit la pièce, qui garde son lien et ne repart pas', async () => {
  Records.create('Deal', { deal_id: 'd1', nom: 'Murs Lyon', drive_folder_id: 'dossier-1', documents_espace: pieces() });
  const drive = fauxDrive();
  const r = await copierAuDrive('d1', ['a'], { uploadDir: uploads, user, drive });
  assert.equal(r.copies, 1);
  assert.deepEqual(drive.appels, [['lister', 'dossier-1'], ['deposer', 'jules@klocka.immo', 'dossier-1', 'Bail.pdf']]);
  const doc = Records.findBy('Deal', 'deal_id', 'd1').documents_espace.find((d) => d.id === 'a');
  assert.equal(doc.drive_url, 'https://drive/Bail.pdf');
  assert.ok(doc.drive_copie_le);
  const encore = await copierAuDrive('d1', ['a'], { uploadDir: uploads, user, drive });
  assert.equal(encore.copies, 0);
  assert.equal(drive.appels.length, 2);
});

test('sans dossier Drive, ou s\'il a disparu, il est créé et retenu sur le dossier', async () => {
  Records.create('Deal', { deal_id: 'd2', nom: 'Murs Nice', drive_folder_id: 'perdu', documents_espace: pieces() });
  const drive = fauxDrive();
  const r = await copierAuDrive('d2', ['a', 'b'], { uploadDir: uploads, user, drive });
  assert.equal(r.copies, 2);
  assert.equal(drive.appels.filter((x) => x[0] === 'classer').length, 1);
  assert.deepEqual(drive.appels.at(-1), ['deposer', 'jules@klocka.immo', 'nouveau', 'DPE.pdf']);
  assert.equal(Records.findBy('Deal', 'deal_id', 'd2').drive_folder_id, 'nouveau');
});

test('un dossier de test ne touche pas Google', async () => {
  Records.create('Deal', { deal_id: 'd3', test: true, documents_espace: pieces() });
  const drive = fauxDrive();
  const r = await copierAuDrive('d3', ['a'], { uploadDir: uploads, user, drive });
  assert.equal(r.ignore, 'dossier de test');
  assert.equal(drive.appels.length, 0);
});

test('le chat demande toute la Data Room : ce qui est déjà dans le Drive sous le même nom ne repart pas', async () => {
  Records.create('Deal', { deal_id: 'd4', nom: 'MACSF - Lorient', drive_folder_id: 'dossier-4', drive_folder_url: 'https://drive/d4', documents_espace: pieces() });
  const drive = fauxDrive();
  const r = await copierAuDrive('d4', null, { uploadDir: uploads, user, drive });
  assert.equal(r.copies, 1);
  assert.equal(r.deja, 1);
  assert.equal(r.folder_url, 'https://drive/d4');
  assert.deepEqual(drive.appels.filter((x) => x[0] === 'deposer').map((x) => x[3]), ['DPE.pdf']);
  assert.ok(Records.findBy('Deal', 'deal_id', 'd4').documents_espace.every((d) => d.drive_copie_le));
});

test('une Data Room vide : le chat crée quand même le dossier Drive', async () => {
  Records.create('Deal', { deal_id: 'd5', nom: 'Vide', documents_espace: [] });
  const drive = fauxDrive();
  const r = await copierAuDrive('d5', null, { uploadDir: uploads, user, drive });
  assert.equal(r.folder_url, 'https://drive/dossier');
  assert.equal(Records.findBy('Deal', 'deal_id', 'd5').drive_folder_id, 'nouveau');
});
