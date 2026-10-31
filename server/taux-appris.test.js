// Un taux de base validé se garde (31 oct. 2026, Jules) : dans une base à part, ouverte avant tout import.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-taux-'));
const { Records } = await import('./db.js');
const A = await import('./mandataire-avis.js');

test('noter un taux validé le garde une fois par avis, avec le taux proposé', async () => {
  const moi = { email: 'taux@kpartners.fr', role: 'mandataire' };
  A.commencer({ type_bien: 'murs_commerce', adresse: '3 rue Thuret, 06600 Antibes' }, moi);
  A.noter({ taux_base: '6,4 %', taux_base_propose: 5.5 }, moi);
  A.noter({ taux_base: 6.3 }, moi);
  const gardes = Records.list('TauxBaseValide').filter((l) => l.par === moi.email);
  assert.equal(gardes.length, 1);
  assert.equal(gardes[0].valide, 6.3);
  assert.equal(gardes[0].propose, 5.5);
  assert.equal(gardes[0].ville, 'Antibes');
});
