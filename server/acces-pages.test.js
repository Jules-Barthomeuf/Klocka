// Les accès de l'équipe, page par page : Jules seul les pose, et une page
// fermée ferme aussi son API.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-acces-'));
const A = await import('./acces-pages.js');
const { Records } = await import('./db.js');
const { retirerChampsProteges } = await import('./contexte.js');

test("Jules ferme une page à un admin : le menu le sait, l'API aussi", () => {
  const jules = Records.create('User', { email: 'jules.b@klocka.immo', role: 'admin' });
  const nora = Records.create('User', { email: 'nora.l@klocka.immo', role: 'admin', full_name: 'Nora Lorinquer' });
  assert.equal(A.poserAcces(nora, 'nora.l@klocka.immo', []).ok, false, "un autre admin ne gère pas les accès");
  // Tout est fermé par défaut, sauf le Dashboard et le Compte.
  assert.equal(A.pagesFermees(Records.get('User', nora.id)).length, A.PAGES_EQUIPE.length);
  assert.ok(!A.pagesFermees(Records.get('User', nora.id)).includes('Dashboard'));
  assert.equal(A.apiFermee(Records.get('User', nora.id), '/api/prospection/jour'), 'Prospection');
  const r = A.poserAcces(jules, 'nora.l@klocka.immo', ['Prospection', 'AdminProjets', 'Inventee']);
  assert.deepEqual(r.pages_ouvertes, ['Prospection', 'AdminProjets'], 'une page inconnue ne s\'ouvre pas');
  const n = Records.get('User', nora.id);
  assert.ok(A.pagesFermees(n).includes('Emailing'));
  assert.ok(!A.pagesFermees(n).includes('Prospection'));
  assert.equal(A.apiFermee(n, '/api/emailing/campagnes?x=1'), 'Emailing');
  assert.equal(A.apiFermee(n, '/api/prospection/jour'), null);
  assert.equal(A.apiFermee(Records.get('User', jules.id), '/api/emailing/campagnes'), null, 'Jules a tout');
  assert.equal(A.poserAcces(jules, 'jules.b@klocka.immo', ['Emailing']).ok, false, 'ses propres accès ne se ferment pas');
  assert.deepEqual(A.admins().map((x) => x.email), ['nora.l@klocka.immo']);
});

test("un admin ne peut pas se rouvrir une page en modifiant son compte", () => {
  assert.equal('pages_ouvertes' in retirerChampsProteges({ pages_ouvertes: ['Emailing'], full_name: 'x' }), false);
});
