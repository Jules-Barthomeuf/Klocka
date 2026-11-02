// Lance ce dont le test du parcours a besoin, et le range à la fin.
//
//   - le faux modèle (faux-modele.mjs) ;
//   - le serveur Klocka, sur une base vierge dans un dossier temporaire, toutes
//     les clés du .env vidées : ni Apollo, ni Equimmox, ni Data-B, ni Monday,
//     ni mail, ni MyNotary, ni vraie IA ;
//   - l'écran, construit pour la production et servi par Vite, branché sur ce serveur.
//
// Playwright le démarre (webServer) et l'arrête d'un SIGTERM : les enfants
// s'arrêtent et le dossier temporaire est effacé.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { DOSSIER, PORTS, ADMIN } from './donnees.mjs';
import { demarrerFauxModele } from './faux-modele.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Les clés qu'on vide même si le .env ne les nomme pas.
const A_VIDER = [
  'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'MISTRAL_API_KEY', 'LLM_PROVIDER', 'AK_MODELE',
  'APOLLO_API_KEY', 'EQUIMMOX_EMAIL', 'EQUIMMOX_MOT_DE_PASSE', 'EQUIMMOX_CDP_URL', 'DATAB_EMAIL', 'DATAB_MOT_DE_PASSE',
  'MONDAY_TOKEN', 'MONDAY_API_TOKEN', 'TWENTY_URL', 'TWENTY_API_KEY', 'CRM', 'RESEND_API_KEY', 'EMAILING_REEL', 'RENDER',
  'MYNOTARY_EMAIL', 'MYNOTARY_MOT_DE_PASSE', 'MYNOTARY_CLE_API', 'MYNOTARY_AGENT', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GOOGLE_GMAIL_READ', 'GOOGLE_GMAIL_SEND', 'GOOGLE_CHAT', 'GOOGLE_MAPS_SERVEUR', 'INSEE_SIRENE_CLE', 'KLOCKA_SEED_KEY', 'APP_URL',
];

function environnement() {
  const env = { ...process.env };
  const fichier = path.join(RACINE, '.env');
  const noms = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z_0-9]+)\s*=/)?.[1]).filter(Boolean) : [];
  // dotenv ne remplace pas une variable déjà posée, même vide : vider suffit.
  for (const n of [...noms, ...A_VIDER]) env[n] = '';
  return env;
}

const enfants = [];
function lancer(nom, commande, args, env) {
  const p = spawn(commande, args, { cwd: RACINE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const journal = fs.createWriteStream(path.join(DOSSIER, `${nom}.log`), { flags: 'a' });
  p.stdout.pipe(journal);
  p.stderr.pipe(journal);
  p.on('exit', (code) => { if (!arret && (nom !== 'construction' || code !== 0)) console.error(`[parcours] ${nom} s'est arrêté (code ${code}) : voir ${path.join(DOSSIER, `${nom}.log`)}`); });
  enfants.push(p);
  return p;
}

let arret = false;
function ranger() {
  if (arret) return;
  arret = true;
  for (const p of enfants) { try { p.kill('SIGTERM'); } catch { /* déjà parti */ } }
  // Le serveur lâche la base, puis le dossier part. PARCOURS_GARDER=1 le garde pour comprendre un échec.
  setTimeout(() => {
    if (process.env.PARCOURS_GARDER !== '1') fs.rmSync(DOSSIER, { recursive: true, force: true });
    process.exit(0);
  }, 1500);
}
process.on('SIGTERM', ranger);
process.on('SIGINT', ranger);

fs.rmSync(DOSSIER, { recursive: true, force: true });
fs.mkdirSync(DOSSIER, { recursive: true });

await demarrerFauxModele({ port: PORTS.modele, dossier: DOSSIER });

const base = environnement();
lancer('serveur', process.execPath, ['server/index.js'], {
  ...base,
  PORT: String(PORTS.serveur),
  KLOCKA_DATA_DIR: path.join(DOSSIER, 'data'),
  KLOCKA_ADMIN_EMAIL: ADMIN.email,
  SUPER_ADMIN_EMAILS: ADMIN.email,
  // Le faux modèle : une clé factice, l'adresse locale.
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'cle-factice-du-test-parcours',
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${PORTS.modele}`,
  // Les tâches de fond et les lectures réseau éteintes (comme le bac à sable du testeur).
  NODE_TEST_CONTEXT: '1',
  VILLES_SECTEUR: '0',
  OFF_MARKET_VEILLE: 'false',
  CONTROLES_AUTO: 'false',
  RELAIS_ANALYSTES: '0',
  HAKA_SIMULER: '1',
});

// La carte Google est facturée au chargement : sans PARCOURS_CARTE=1, l'écran tourne sans clé.
const ecran = { ...base, VITE_BACKEND_URL: `http://localhost:${PORTS.serveur}` };
if (process.env.PARCOURS_CARTE === '1') delete ecran.VITE_GOOGLE_MAPS_API_KEY; // Vite la relit alors dans le .env
// L'écran de production (construit puis servi), pour que le temps d'ouverture d'une fiche soit celui des mandataires ;
// PARCOURS_DEV=1 garde Vite en développement, plus rapide à relancer pendant une mise au point.
const VITE = path.join(RACINE, 'node_modules', 'vite', 'bin', 'vite.js');
const SORTIE = path.join(DOSSIER, 'ecran');
if (process.env.PARCOURS_DEV === '1') {
  lancer('ecran', process.execPath, [VITE, '--port', String(PORTS.ecran), '--strictPort'], ecran);
} else {
  const construction = lancer('construction', process.execPath, [VITE, 'build', '--outDir', SORTIE, '--emptyOutDir'], ecran);
  construction.on('exit', (code) => {
    if (code !== 0 || arret) return;
    lancer('ecran', process.execPath, [VITE, 'preview', '--outDir', SORTIE, '--port', String(PORTS.ecran), '--strictPort'], ecran);
  });
}
