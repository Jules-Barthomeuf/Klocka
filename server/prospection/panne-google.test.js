// La panne de l'accès Google (12-16 nov. 2026) : aucun mail de la prospection ne part en double une fois l'accès revenu.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-panne-google-'));
const M = await import('./mails.js');
const { Records } = await import('../db.js');

test('les mails restés prêts pendant la panne sont écartés, pas ceux d\'avant ni d\'après', () => {
  const pendant = Records.create('ProspectionMail', { etat: 'pret', cree_le: '2026-11-14T09:00:00.000Z', a: 'x@agence.fr', objet: 'o', corps: 'c' });
  const differe = Records.create('ProspectionMail', { etat: 'differe', cree_le: '2026-11-15T09:00:00.000Z', a: 'y@agence.fr', objet: 'o', corps: 'c' });
  const avant = Records.create('ProspectionMail', { etat: 'pret', cree_le: '2026-11-10T09:00:00.000Z', a: 'z@agence.fr', objet: 'o', corps: 'c' });
  const apres = Records.create('ProspectionMail', { etat: 'pret', cree_le: '2026-11-17T09:00:00.000Z', a: 'w@agence.fr', objet: 'o', corps: 'c' });
  const prevu = Records.create('ProspectionMail', { etat: 'prevu', cree_le: '2026-11-14T09:00:00.000Z', pour_le: '2026-11-20', a: 'v@agence.fr', objet: 'o', corps: 'c' });
  assert.equal(M.ecarterMailsDeLaPanne(), 2);
  assert.equal(Records.get('ProspectionMail', pendant.id).etat, 'ecarte');
  assert.equal(Records.get('ProspectionMail', differe.id).etat, 'ecarte');
  assert.equal(Records.get('ProspectionMail', avant.id).etat, 'pret');
  assert.equal(Records.get('ProspectionMail', apres.id).etat, 'pret');
  assert.equal(Records.get('ProspectionMail', prevu.id).etat, 'prevu');
  assert.equal(M.ecarterMailsDeLaPanne(), 0);
  assert.ok(M.PANNE_GOOGLE.test('Error: The OAuth client was disabled.'));
  assert.ok(!M.PANNE_GOOGLE.test('Adresse invalide'));
});
