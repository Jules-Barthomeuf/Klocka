// Import de projets depuis un export Base44 : création, mise à jour, accents réparés.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-import-'));
const { Records } = await import('./db.js');
const { importerProjets } = await import('./projets-import.js');

test('import de projets : crée, met à jour par id, répare les accents, ignore le reste', () => {
  const r1 = importerProjets([{ id: 'p-1', titre: 'CafÃ© Lacoste', statut: 'prospect' }, 'pas un projet', null], { par: 'jules.b@klocka.immo' });
  assert.deepEqual(r1, { crees: 1, maj: 0, invalides: 2 });
  assert.equal(Records.get('Project', 'p-1').titre, 'Café Lacoste');
  const r2 = importerProjets([{ id: 'p-1', statut: 'analyse' }]);
  assert.deepEqual(r2, { crees: 0, maj: 1, invalides: 0 });
  const p = Records.get('Project', 'p-1');
  assert.equal(p.statut, 'analyse');
  assert.equal(p.titre, 'Café Lacoste');
  assert.ok(importerProjets({ pas: 'un tableau' }).error);
});
