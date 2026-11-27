// Quand un client est entré, sur sa fiche (27 nov. 2026, Jules : « ajoute dans les fiches quand ils ont été rentrés »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-clients-twenty-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const C = await import('./clients-twenty.js');

test("l'entrée : la date de Monday d'abord (Twenty a tout repris le 27 oct.), la source claire, qui le suit", () => {
  const e = C.entreeDuClient({ createdAt: '2026-10-27T18:36:43.617Z', mondayCreeLe: '2026-03-25T21:08:17.000Z', source: 'WEBI', personnes: 'Paul De Zulueta' });
  assert.equal(e.le, '2026-03-25T21:08:17.000Z');
  assert.equal(e.texte, 'Entré dans le CRM, venu par le webinaire ; suivi par Paul De Zulueta');
  assert.equal(C.entreeDuClient({ createdAt: '2026-11-06T10:00:00Z', source: 'PDZ' }).texte, 'Entré dans le CRM');
  assert.equal(C.entreeDuClient({ name: 'Sans date' }), null);
});

test("l'import des clients écrit la date sur la fiche et une ligne d'historique, une seule fois, sans toucher au résumé", () => {
  const c = { id: 'c-1', name: 'Kilian ZANCHI', createdAt: '2026-10-27T18:36:43.617Z', mondayCreeLe: '2026-03-25T21:08:17.000Z', source: 'WEBI' };
  Records.create('FicheDossier', { cle: 'twenty:clients:c-1', genre: 'client', nom: 'Kilian ZANCHI', resume: 'Écrit par Jules.' });
  const r1 = C.remplirClients([c]);
  const r2 = C.remplirClients([c]);
  assert.equal(r1.entrees, 1);
  assert.equal(r2.entrees, undefined);
  const f = Records.findBy('FicheDossier', 'cle', 'twenty:clients:c-1');
  assert.equal(f.entre_le, '2026-03-25T21:08:17.000Z');
  assert.equal(f.resume, 'Écrit par Jules.');
  const lignes = Records.filter('EntreeDossier', { fiche_cle: 'twenty:clients:c-1' });
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].le, '2026-03-25T21:08:17.000Z');
  assert.match(lignes[0].texte, /^Entré dans le CRM, venu par le webinaire/);
});
