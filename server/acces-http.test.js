// Le contrôle d'accès, vérifié sur le vrai serveur.
//
// acces-entites.test.js vérifie les règles ; celui-ci vérifie qu'elles sont
// bien branchées — que la garde globale couvre les familles de routes, que
// l'ordre des middlewares est le bon, qu'aucune route ne répond avant d'avoir
// demandé qui parle. Ce sont deux choses différentes : les règles étaient
// justes pour `Contact` et la route `/api/projets/...` répondait quand même
// sans connexion, parce que son préfixe manquait à la garde.
//
// Il sert aussi de filet pour découper index.js : tant que ces réponses ne
// bougent pas, aucune route n'a été perdue en chemin.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const ici = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

let serveur;
let dossier;

/** Un compte et sa session, posés directement en base avant le démarrage. */
function semer(chemin) {
  const db = new Database(path.join(chemin, 'klocka.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY, entity TEXT, data TEXT,
    created_date TEXT, updated_date TEXT, created_by TEXT)`);
  const maintenant = new Date().toISOString();
  const demain = new Date(Date.now() + 86400000).toISOString();
  const poser = (id, entite, data) =>
    db.prepare('INSERT INTO records (id, entity, data, created_date, updated_date) VALUES (?,?,?,?,?)')
      .run(id, entite, JSON.stringify(data), maintenant, maintenant);

  poser('u-admin', 'User', { email: 'equipe@test.local', role: 'admin', full_name: 'Équipe' });
  poser('u-client', 'User', { email: 'client@test.local', role: 'user', full_name: 'Client' });
  poser('s-admin', 'Session', { token: 'JETON_ADMIN', user_email: 'equipe@test.local', expires_at: demain });
  poser('s-client', 'Session', { token: 'JETON_CLIENT', user_email: 'client@test.local', expires_at: demain });
  // Un dossier d'équipe et sa pièce : ce qu'un client ne doit jamais voir.
  poser('d-1', 'DossierDoc', {
    dossier_id: 'deal-1', titre: 'Local à Lyon — Verdict : INSUFFISANT',
    documents: [{ doc_id: 'p1', nom_fichier: 'bail.pdf', url: '/uploads/bail.pdf' }],
  });
  poser('c-1', 'Contact', { nom: 'Agent test', email: 'agent@test.local', patrimoine: '1 200 000 €' });
  db.close();
}

test.before(async () => {
  dossier = mkdtempSync(path.join(tmpdir(), 'klocka-test-'));
  semer(dossier);
  serveur = spawn(process.execPath, [path.join(ici, 'index.js')], {
    env: {
      ...process.env,
      KLOCKA_DATA_DIR: dossier,
      PORT: String(PORT),
      APP_URL: BASE,
      AUTH_DESACTIVEE: 'false',
      // Rien ne doit partir vers l'extérieur pendant un test.
      ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '',
      GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', MONDAY_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // On attend que le port réponde plutôt qu'un délai fixe.
  for (let essai = 0; essai < 100; essai += 1) {
    try {
      await fetch(`${BASE}/api/health`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('le serveur de test n’a pas démarré');
});

test.after(() => {
  serveur?.kill();
  if (dossier) rmSync(dossier, { recursive: true, force: true });
});

const appel = (chemin, jeton = null, options = {}) =>
  fetch(BASE + chemin, {
    ...options,
    headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...(options.headers || {}) },
  });

test('sans connexion, l’API métier ne répond pas', async () => {
  // Chaque famille de routes, une par une : c'est le préfixe manquant qui a
  // laissé /api/projets ouvert.
  const familles = [
    '/api/entities/Project', '/api/preanalyse/dossiers', '/api/assistant/fil',
    '/api/monitoring', '/api/marche/journal', '/api/alexis/dossiers',
    '/api/projets/nimporte/analyse-bail', '/api/monday/tableaux',
  ];
  for (const chemin of familles) {
    const r = await appel(chemin);
    assert.equal(r.status, 401, `${chemin} doit exiger une connexion`);
  }
});

test('ce qui reste ouvert sans connexion est délibéré', async () => {
  // L'état du service et l'amorçage de la page de connexion, rien d'autre.
  assert.equal((await appel('/api/health')).status, 200);
  assert.equal((await appel('/api/apps/public/prod/public-settings/by-id/x')).status, 200);
});

test('un compte client ne voit pas les dossiers de l’équipe', async () => {
  for (const entite of ['DossierDoc', 'Contact', 'Deal', 'MarcheJournal', 'DataBImplantation', 'BodaccRecherche', 'DvfRecherche']) {
    const r = await appel(`/api/entities/${entite}`, 'JETON_CLIENT');
    assert.equal(r.status, 403, `${entite} ne doit pas être lisible par un client`);
  }
});

test('un compte client ne modifie pas ce qui est commun', async () => {
  const creer = (entite) =>
    appel(`/api/entities/${entite}`, 'JETON_CLIENT', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titre: 'écrit par un client' }),
    });
  assert.equal((await creer('Resource')).status, 403);
  assert.equal((await creer('AppSettings')).status, 403);
  assert.equal((await creer('Contact')).status, 403);
});

test('l’équipe accède à ses outils', async () => {
  for (const entite of ['DossierDoc', 'Contact', 'Deal']) {
    const r = await appel(`/api/entities/${entite}`, 'JETON_ADMIN');
    assert.equal(r.status, 200, `${entite} doit rester lisible par l'équipe`);
  }
  // Une base neuve se remplit de données de démonstration : on cherche le
  // dossier semé ici, pas un total.
  const dossiers = await (await appel('/api/entities/DossierDoc', 'JETON_ADMIN')).json();
  const notre = dossiers.find((d) => d.dossier_id === 'deal-1');
  assert.ok(notre, 'le dossier semé doit être lisible par l’équipe');
  assert.match(notre.titre, /INSUFFISANT/);
});

test('les entités à jetons ne passent par l’API pour personne', async () => {
  for (const jeton of ['JETON_ADMIN', 'JETON_CLIENT']) {
    for (const entite of ['Session', 'MailAccount']) {
      assert.equal((await appel(`/api/entities/${entite}`, jeton)).status, 403);
    }
  }
});

test('les pièces déposées ne sont pas publiques', async () => {
  const r = await appel('/uploads/bail.pdf');
  assert.equal(r.status, 401, 'un document ne se lit pas sans connexion');
});

test('le mot de passe ne sort jamais du serveur', async () => {
  const moi = await (await appel('/api/auth/me', 'JETON_ADMIN')).json();
  assert.equal(moi.mot_de_passe, undefined);
  const comptes = await (await appel('/api/entities/User', 'JETON_ADMIN')).json();
  for (const u of comptes) assert.equal(u.mot_de_passe, undefined, `${u.email} expose son empreinte`);
});

test('la sauvegarde de la base existe et n’est ouverte qu’à l’équipe', async () => {
  // Elle était cassée : le module et l'écran existaient, aucune route ne les
  // reliait. « Télécharger » renvoyait la page d'accueil de l'application.
  const r = await appel('/api/admin/sauvegarde', 'JETON_ADMIN');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition') || '', /attachment; filename="klocka-\d{4}-\d{2}-\d{2}\.json"/);
  const dump = await r.json();
  assert.equal(dump.format, 'klocka-sauvegarde');
  assert.ok(Array.isArray(dump.records) && dump.records.length > 0);

  assert.equal((await appel('/api/admin/sauvegarde', 'JETON_CLIENT')).status, 403);
  assert.equal((await appel('/api/admin/sauvegarde')).status, 401);
});

test('les surfaces supprimées ne répondent plus', async () => {
  // Agents conversationnels (KlockAI, ProjectAssistant) et import d'un export
  // Base44 : retirés. Ces routes ne doivent pas revenir par mégarde.
  for (const chemin of ['/api/agents/conversations', '/api/admin/import-utilisateurs', '/api/admin/import-projets']) {
    const r = await appel(chemin, 'JETON_ADMIN');
    assert.notEqual(r.status, 200, `${chemin} ne devrait plus exister`);
  }
});

test('un client ne voit que son propre compte', async () => {
  const vus = await (await appel('/api/entities/User', 'JETON_CLIENT')).json();
  assert.deepEqual(vus.map((u) => u.email), ['client@test.local']);
});
