// Installe le Chromium dont Equimmox a besoin, quand il manque.
//
// Klocka pilote un vrai navigateur pour l'analyse de loyer d'Equimmox. Sur un
// hébergeur, le paquet playwright-core arrive sans navigateur : il faut le
// télécharger pendant la construction, pas au premier clic d'un utilisateur.
//
// Ce script ne fait rien en local sauf demande explicite : personne n'a envie
// de voir 150 Mo se télécharger en installant les dépendances du projet.
// Il s'exécute quand KLOCKA_CHROMIUM=1, ou tout seul chez un hébergeur connu.

import { execFileSync } from 'child_process';
import { poserChemin } from '../server/chromium.js';

const demande = process.env.KLOCKA_CHROMIUM === '1';
const heberge = !!(process.env.RENDER || process.env.FLY_APP_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.DYNO);

if (!demande && !heberge) {
  process.exit(0);
}

// Un chemin déjà fourni : le navigateur est là, rien à télécharger.
if ((process.env.CHROMIUM_PATH || '').trim()) {
  console.log('[chromium] CHROMIUM_PATH est renseigné : rien à installer.');
  process.exit(0);
}

// Un navigateur distant : rien à installer non plus.
if ((process.env.EQUIMMOX_CDP_URL || '').trim()) {
  console.log('[chromium] EQUIMMOX_CDP_URL est renseigné : le navigateur est ailleurs.');
  process.exit(0);
}

const dossier = poserChemin();
if (dossier) console.log(`[chromium] dossier des navigateurs : ${dossier}`);

try {
  const { chromium } = await import('playwright-core');
  const chemin = chromium.executablePath();
  const { existsSync } = await import('fs');
  if (existsSync(chemin)) {
    console.log(`[chromium] déjà présent : ${chemin}`);
    process.exit(0);
  }
} catch { /* on tente l'installation */ }

console.log('[chromium] téléchargement du navigateur pour Equimmox…');
try {
  // `playwright` (le paquet complet) porte la commande d'installation ; on
  // l'appelle par npx pour ne pas l'ajouter aux dépendances de production.
  execFileSync('npx', ['--yes', 'playwright@1.62.1', 'install', 'chromium'], { stdio: 'inherit' });
  console.log('[chromium] installé.');
} catch (e) {
  // Un hébergeur sans navigateur possible n'est pas une raison d'échouer la
  // construction : seule l'analyse Equimmox sera indisponible, et elle le dira.
  console.warn(`[chromium] installation impossible (${e.message}). L'analyse Equimmox restera indisponible tant qu'un navigateur ne sera pas fourni (CHROMIUM_PATH ou EQUIMMOX_CDP_URL).`);
}
