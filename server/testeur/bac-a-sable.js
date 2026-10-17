// L'agent testeur : le bac à sable. Une copie de la base dans un second
// serveur, mails et Monday coupés, un compte testeur qui a le rôle de celui
// qui a appuyé. L'agent y clique sur tout ; à la fin, la copie est jetée.

import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import db, { CHEMIN_UPLOADS, DATA_DIR, Records } from '../db.js';
import { PAGES_EQUIPE } from '../acces-pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, '..', '..');
const SERVEUR = path.join(RACINE, 'server', 'index.js');

/** Un port libre à partir de `depuis`. */
export function portLibre(depuis = 3020) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', () => resolve(portLibre(depuis + 1)));
    s.listen(depuis, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    if (depuis > 3200) reject(new Error('Aucun port libre.'));
  });
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une copie cohérente de la base (sauvegarde SQLite, pas un cp de fichiers en cours d'écriture). */
export async function copierBase(dossier) {
  fs.mkdirSync(dossier, { recursive: true });
  await db.backup(path.join(dossier, 'klocka.db'));
  // Les uploads sont lus par les pages (photos, pièces) : un lien symbolique suffit, rien n'y sera écrit d'important.
  const uploads = CHEMIN_UPLOADS;
  if (fs.existsSync(uploads)) { try { fs.symlinkSync(uploads, path.join(dossier, 'uploads'), 'dir'); } catch { /* déjà là */ } }
}

/**
 * Ouvre le bac à sable : copie, serveur enfant, compte testeur et jeton.
 * `user` : celui qui a appuyé ; le testeur prend son rôle (admin, mandataire…)
 * et, pour un mandataire, son secteur (même email de secteur).
 */
export async function ouvrirBacASable({ user, vue = 'admin', id = randomBytes(4).toString('hex'), journal = () => {} }) {
  const dossier = path.join(DATA_DIR, 'testeur', `bac-${id}`);
  await copierBase(dossier);
  const port = await portLibre();
  const jeton = randomBytes(32).toString('hex');
  const role = vue === 'mandataire' ? 'mandataire' : vue === 'client' ? 'user' : (user?.role || 'admin');
  // Un mandataire a besoin d'un secteur : le testeur emprunte l'email d'un vrai mandataire (dans la copie seulement).
  const email = role === 'mandataire' ? (Records.list('SecteurMandataire').find((s) => s.mandataire_email)?.mandataire_email || user.email) : `testeur@klocka.local`;
  const amorce = JSON.stringify({ email, role, jeton, nom: 'Agent testeur', modele: user?.email || null });
  const enfant = spawn(process.execPath, [SERVEUR], {
    cwd: RACINE,
    env: {
      ...process.env,
      KLOCKA_DATA_DIR: dossier, PORT: String(port), NODE_ENV: 'production', NODE_TEST_CONTEXT: '1',
      KLOCKA_BAC_A_SABLE: amorce,
      // Rien ne sort du bac à sable : ni mail, ni Monday, ni veille, ni contrôles, ni récap.
      EMAILING_REEL: '', RESEND_API_KEY: '', MONDAY_TOKEN: '', MONDAY_API_TOKEN: '', OFF_MARKET_VEILLE: 'false', CONTROLES_AUTO: 'false', RENDER: '', MYNOTARY_AGENT: '',
      // Haka (17 oct. 2026) : la file tourne dans le bac, en simulation (ni Gmail, ni envoi) ; la veille des boîtes n'y lit rien.
      GOOGLE_GMAIL_READ: '', GOOGLE_CHAT: '', HAKA_FILE: '1', HAKA_FICHES: '1', HAKA_SIMULER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(dossier, 'serveur.log'));
  enfant.stdout.pipe(log); enfant.stderr.pipe(log);
  const base = `http://127.0.0.1:${port}`;
  const debut = Date.now();
  let pret = false;
  while (Date.now() - debut < 45000) {
    if (enfant.exitCode != null) break;
    try { const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) }); if (r.ok) { pret = true; break; } } catch { /* pas encore */ }
    await attendre(700);
  }
  if (!pret) { enfant.kill('SIGKILL'); throw new Error(`Le bac à sable n'a pas démarré (voir ${path.join(dossier, 'serveur.log')}).`); }
  journal(`Bac à sable prêt sur ${base} (${role}).`);
  return {
    id, base, port, dossier, jeton, email, role,
    fermer: async () => {
      try { enfant.kill('SIGTERM'); } catch { /* déjà fini */ }
      await attendre(800);
      if (enfant.exitCode == null) { try { enfant.kill('SIGKILL'); } catch { /* ignore */ } }
      try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* le disque le gardera */ }
    },
  };
}

/**
 * Dans le serveur enfant, au démarrage : le compte testeur et sa session,
 * d'après l'amorce passée en variable d'environnement. Ne fait rien ailleurs.
 */
export function amorcerBacASable() {
  const brut = (process.env.KLOCKA_BAC_A_SABLE || '').trim();
  if (!brut) return null;
  let a;
  try { a = JSON.parse(brut); } catch { return null; }
  const email = String(a.email || '').toLowerCase();
  let u = Records.findBy('User', 'email', email);
  // Un compte d'équipe neuf a toutes ses pages fermées (acces-pages) : le testeur reçoit celles du modèle, sinon toutes.
  const modele = a.modele ? Records.findBy('User', 'email', String(a.modele).toLowerCase()) : null;
  const pages = modele?.pages_ouvertes?.length ? modele.pages_ouvertes : PAGES_EQUIPE;
  if (!u) u = Records.create('User', { email, full_name: a.nom || 'Agent testeur', role: a.role || 'admin', pages_ouvertes: pages, cree_le: new Date().toISOString() });
  else Records.update('User', u.id, { role: a.role, pages_ouvertes: pages });
  Records.create('Session', { token: a.jeton, user_email: email, expires_at: new Date(Date.now() + 6 * 3600 * 1000).toISOString(), renouvelee_le: new Date().toISOString(), fenetre: false });
  console.log(`[testeur] bac à sable amorcé : ${email} (${a.role})`);
  return { email, role: a.role };
}
