#!/usr/bin/env node
/**
 * Superviseur de développement : lance le backend et Vite, et relance
 * automatiquement celui qui tombe.
 *
 * Pourquoi : le backend ne recharge pas à chaud et l'environnement de
 * développement supprime périodiquement les processus. Sans surveillance, on
 * s'en aperçoit par une erreur réseau dans l'interface, et il faut tout
 * relancer à la main. Ici, un seul `npm run dev` suffit.
 *
 * Contrairement à `concurrently -k`, la mort de l'un n'emporte pas l'autre :
 * chacun est redémarré séparément, avec une temporisation progressive pour
 * éviter la boucle folle si le démarrage échoue vraiment (port occupé,
 * erreur de syntaxe).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const RACINE = new URL('..', import.meta.url).pathname;

// Tout ce qui passe ici s'écrit aussi dans un fichier. Sans lui, les journaux
// vivent dans le terminal qui a lancé `npm run dev` : refermé, lancé en tâche
// de fond ou par un autre outil, ils n'existent plus — et une erreur dans
// l'interface reste sans explication. Le fichier est toujours au même endroit :
//     tail -f server/data/dev.log
const FICHIER = path.join(RACINE, 'server', 'data', 'dev.log');
// Au-delà, on repart d'un fichier neuf : quelques heures de journaux suffisent,
// et un fichier de cent mégaoctets ne se lit pas.
const TAILLE_MAX = 8 * 1024 * 1024;
// Les codes de couleur du terminal n'ont rien à faire dans un fichier.
// eslint-disable-next-line no-control-regex -- c'est précisément un caractère de contrôle qu'on retire
const SANS_COULEUR = /\x1b\[[0-9;]*m/g;

let sortie = null;
function ecrire(texte) {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    if (!sortie) {
      if (fs.existsSync(FICHIER) && fs.statSync(FICHIER).size > TAILLE_MAX) fs.renameSync(FICHIER, `${FICHIER}.1`);
      sortie = fs.createWriteStream(FICHIER, { flags: 'a' });
      sortie.write(`\n--- ${new Date().toISOString()} · npm run dev ---\n`);
    }
    sortie.write(texte.replace(SANS_COULEUR, ''));
  } catch {
    /* un journal qu'on ne peut pas écrire ne doit pas arrêter le serveur */
  }
}
const ATTENTE_MIN = 1000;
const ATTENTE_MAX = 15000;
// Au-delà de ce délai, un processus est considéré comme « parti sainement » :
// son compteur de tentatives repart de zéro.
const DUREE_SAINE = 20000;

const SERVICES = [
  { nom: 'back ', couleur: '\x1b[34m', commande: 'node', args: ['server/index.js'] },
  { nom: 'front', couleur: '\x1b[32m', commande: 'npx', args: ['vite', '--port', '5173'] },
];

const RESET = '\x1b[0m';
const GRIS = '\x1b[90m';
let onArrete = false;

function journal(service, texte, canal = 'log') {
  const lignes = String(texte).split('\n').filter((l) => l.trim());
  const heure = new Date().toTimeString().slice(0, 8);
  for (const ligne of lignes) {
    console[canal === 'err' ? 'error' : 'log'](`${service.couleur}${service.nom}${RESET} ${GRIS}│${RESET} ${ligne}`);
    ecrire(`${heure} ${service.nom.trim().padEnd(5)} │ ${ligne}\n`);
  }
}

function demarrer(service) {
  service.demarreLe = Date.now();
  const enfant = spawn(service.commande, service.args, {
    cwd: RACINE,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  service.processus = enfant;

  enfant.stdout.on('data', (d) => journal(service, d.toString()));
  enfant.stderr.on('data', (d) => journal(service, d.toString(), 'err'));

  enfant.on('exit', (code, signal) => {
    service.processus = null;
    if (onArrete) return;

    // Un démarrage qui a tenu assez longtemps remet le compteur à zéro.
    if (Date.now() - service.demarreLe > DUREE_SAINE) service.tentatives = 0;
    service.tentatives = (service.tentatives || 0) + 1;
    const attente = Math.min(ATTENTE_MIN * 2 ** (service.tentatives - 1), ATTENTE_MAX);

    const cause = signal ? `signal ${signal}` : `code ${code}`;
    journal(service, `arrêté (${cause}) — redémarrage dans ${Math.round(attente / 1000)} s`, 'err');
    service.minuterie = setTimeout(() => demarrer(service), attente);
  });
}

function arreter() {
  if (onArrete) return;
  onArrete = true;
  console.log(`\n${GRIS}Arrêt des services…${RESET}`);
  for (const s of SERVICES) {
    clearTimeout(s.minuterie);
    s.processus?.kill('SIGTERM');
  }
  // Laisse une seconde pour un arrêt propre, puis on force.
  setTimeout(() => {
    for (const s of SERVICES) s.processus?.kill('SIGKILL');
    process.exit(0);
  }, 1000).unref();
}

process.on('SIGINT', arreter);
process.on('SIGTERM', arreter);

console.log(`${GRIS}Backend et front sous surveillance — ils redémarrent seuls s'ils tombent.${RESET}`);
console.log(`${GRIS}  API      http://localhost:3001${RESET}`);
console.log(`${GRIS}  App      http://localhost:5173${RESET}`);
console.log(`${GRIS}  Journaux tail -f server/data/dev.log${RESET}\n`);
SERVICES.forEach(demarrer);
