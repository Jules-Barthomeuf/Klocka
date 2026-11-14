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
  // Tout est fermé par défaut, sauf les Paramètres et l'Agenda ; l'Assistant se règle depuis le 14 nov. 2026 (un pilier).
  assert.equal(A.pagesFermees(Records.get('User', nora.id)).length, A.PAGES_EQUIPE.length);
  assert.ok(A.pagesFermees(Records.get('User', nora.id)).includes('Dashboard'));
  assert.ok(!A.pagesFermees(Records.get('User', nora.id)).includes('Personnalisation'));
  assert.equal(A.apiFermee(Records.get('User', nora.id), '/api/prospection/jour'), 'Prospection');
  const r = A.poserAcces(jules, 'nora.l@klocka.immo', ['Prospection', 'AdminProjets', 'Inventee']);
  assert.deepEqual(r.pages_ouvertes, ['Prospection', 'AdminProjets'], 'une page inconnue ne s\'ouvre pas');
  const n = Records.get('User', nora.id);
  assert.ok(A.pagesFermees(n).includes('Emailing'));
  assert.ok(!A.pagesFermees(n).includes('Prospection'));
  assert.equal(A.apiFermee(n, '/api/emailing/campagnes?x=1'), 'Emailing');
  assert.equal(A.apiFermee(n, '/api/prospection/jour'), null);
  assert.equal(A.apiFermee(Records.get('User', jules.id), '/api/emailing/campagnes'), null, 'Jules a tout');
  assert.deepEqual(A.admins().map((x) => x.email), ['nora.l@klocka.immo'], 'sans personne pour regarder, les autres seulement');
});

// 14 nov. 2026, Jules : « avoir mon compte dans les accès pour voir comment ça fait, tester par moi-même ».
test('Jules se cache des pages pour essayer : son menu et ses API les ferment, Tout ouvrir les lui rend', () => {
  const jules = Records.list('User').find((u) => u.email === 'jules.b@klocka.immo');
  const liste = A.admins(jules);
  assert.equal(liste[0].email, 'jules.b@klocka.immo');
  assert.equal(liste[0].vous, true);
  assert.deepEqual(liste[0].pages_bloquees, [], 'par défaut, Jules a tout');
  const r = A.poserAcces(jules, 'jules.b@klocka.immo', A.PAGES_EQUIPE.filter((p) => p !== 'Emailing'));
  assert.equal(r.ok, true);
  const lui = Records.get('User', jules.id);
  assert.deepEqual(A.pagesFermees(lui), ['Emailing']);
  assert.equal(A.apiFermee(lui, '/api/emailing/campagnes'), 'Emailing');
  assert.ok(!A.pagesFermees(lui).includes('AccesPages'), "l'onglet Accès ne se ferme jamais");
  A.poserAcces(jules, 'jules.b@klocka.immo', A.PAGES_EQUIPE);
  assert.deepEqual(A.pagesFermees(Records.get('User', jules.id)), [], 'Tout ouvrir rend tout');
  const autre = Records.create('User', { email: 'jules.btmf@gmail.com', role: 'admin' });
  assert.equal(A.poserAcces(jules, autre.email, []).ok, false, "l'autre compte de Jules ne se change pas d'ici");
});

test("un admin ne peut pas se rouvrir une page en modifiant son compte", () => {
  assert.equal('pages_ouvertes' in retirerChampsProteges({ pages_ouvertes: ['Emailing'], full_name: 'x' }), false);
});

test("Relances a rejoint la Prospection (16 oct. 2026) : ouvrir la Prospection ouvre les relances et le mode appel", () => {
  const jules = Records.list('User').find((u) => u.email === 'jules.b@klocka.immo');
  const maxime = Records.create('User', { email: 'maxime.p@klocka.immo', role: 'admin' });
  A.poserAcces(jules, 'maxime.p@klocka.immo', ['Prospection']);
  const m = Records.get('User', maxime.id);
  assert.equal(A.apiFermee(m, '/api/prospection/relances'), null);
  assert.equal(A.apiFermee(m, '/api/prospection/mode-appel/file?liste=x&relances=1'), null);
  assert.equal(A.apiFermee(m, '/api/prospection/agent-ia/listes'), null);
  // Prospection fermée : les relances et le mode appel le sont aussi.
  A.poserAcces(jules, 'maxime.p@klocka.immo', []);
  assert.ok(A.apiFermee(Records.get('User', maxime.id), '/api/prospection/mode-appel/file'));
  assert.ok(A.apiFermee(Records.get('User', maxime.id), '/api/prospection/relances'));
});

// 14 nov. 2026, Jules : les piliers (Assistant, Présentations, Outils, CRM) deviennent réglables ; rien ne doit disparaître
// de la barre d'un collègue tant que Jules ne le lui cache pas.
test('les piliers devenus réglables restent ouverts une fois à chaque admin', () => {
  const maxime = Records.create('User', { email: 'maxime.essai@klocka.immo', role: 'admin', pages_ouvertes: ['AdminProjets'] });
  for (const p of ['Dashboard', 'AdminPresentations', 'KData', 'CRM']) assert.ok(A.PAGES_EQUIPE.includes(p), p);
  A.migrerPiliers();
  const m = Records.get('User', maxime.id);
  for (const p of ['AdminProjets', 'Dashboard', 'AdminPresentations', 'KData', 'CRM']) assert.ok(!A.pagesFermees(m).includes(p), p);
  // Une fois seulement : une page que Jules lui cache ensuite ne revient pas au prochain démarrage.
  const jules = Records.list('User').find((u) => u.email === 'jules.b@klocka.immo');
  A.poserAcces(jules, m.email, ['AdminProjets', 'Dashboard']);
  A.migrerPiliers();
  assert.ok(A.pagesFermees(Records.get('User', maxime.id)).includes('CRM'));
});
