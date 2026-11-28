// La liste épinglée « À faire » garde barrées les tâches cochées du jour (28 nov. 2026, Jules : « 1 tâche faite aujourd'hui »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-faites-du-jour-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const M = await import('./modele.js');

const jules = { email: 'jules.b@klocka.immo', role: 'admin' };
const nora = { email: 'nora@klocka.immo', role: 'admin' };

test("les tâches cochées aujourd'hui par la personne, pas celles d'hier ni celles des autres ; rouvrir les retire", () => {
  const creer = (titre) => Records.create('ActionDossier', { titre, statut: 'ouverte', responsable: jules.email, fiches: [], genre: 'tache' });
  const a = creer('Rappeler l\'Agence du Port');
  const b = creer('Envoyer le teaser');
  const c = creer('Préparer la LOI Cannes');
  M.changerAction(a.id, { statut: 'faite', journal: false }, jules);
  M.changerAction(b.id, { statut: 'faite', journal: false }, nora);
  M.changerAction(c.id, { statut: 'faite', journal: false }, jules, { maintenant: () => new Date(Date.now() - 2 * 86400000) });
  assert.deepEqual(M.faitesDuJour(jules).map((x) => x.titre), ['Rappeler l\'Agence du Port']);
  assert.equal(M.mesActions(jules).length, 0);
  M.changerAction(a.id, { statut: 'ouverte' }, jules);
  assert.deepEqual(M.faitesDuJour(jules), []);
  assert.deepEqual(M.mesActions(jules).map((x) => x.titre), ['Rappeler l\'Agence du Port']);
});
