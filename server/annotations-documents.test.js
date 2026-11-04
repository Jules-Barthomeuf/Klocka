import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-annotations-'));
const A = await import('./annotations-documents.js');

test("une pièce se nomme et reçoit son contexte, par son adresse ; vidé, le nom d'origine revient", () => {
  const user = { email: 'm@kpartners.fr' };
  assert.equal(A.annoter('https://ailleurs.fr/x.pdf', { nom: 'X' }, user).ok, false);
  assert.ok(A.annoter('/uploads/bail.pdf', { nom: 'Bail 2019 signé', note: 'Avenant de 2022 à part' }, user).ok);
  const [f] = A.annoterFichiers([{ nom: 'scan001.pdf', url: '/uploads/bail.pdf' }]);
  assert.deepEqual(f, { nom: 'Bail 2019 signé', url: '/uploads/bail.pdf', nom_origine: 'scan001.pdf', note: 'Avenant de 2022 à part' });
  A.annoter('/uploads/bail.pdf', { nom: '' }, user);
  assert.equal(A.annoterFichiers([{ nom: 'scan001.pdf', url: '/uploads/bail.pdf' }])[0].nom, 'scan001.pdf');
  assert.deepEqual(A.annoterFichiers([{ nom: 'a.pdf', url: '/uploads/a.pdf' }]), [{ nom: 'a.pdf', url: '/uploads/a.pdf' }]);
});
