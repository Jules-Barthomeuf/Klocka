// La transcription en temps réel pendant l'appel (15 nov. 2026, Jules : « la transcription avec un délai très faible,
// sur tous les navigateurs »). Le navigateur se connecte par WebSocket à /api/prospection/ecoute ; ce module vérifie la
// session (l'équipe seule), puis confie la connexion brute à un processus à part (server/ecoute-processus.js), qui la
// relaie à Voxtral temps réel. Le même soir, le serveur local engorgé (des requêtes de 30 à 50 s, des traitements de fond
// à 46 % du processeur) retenait les mots revenus de Mistral : le relais ne partage plus la boucle du serveur.
// Mesuré le 15 nov. : les mots arrivent environ une seconde après avoir été dits.

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { currentUser } from './contexte.js';

const CHEMIN = '/api/prospection/ecoute';
export { reglageSession } from './ecoute-relais.js';

let processus = null;
function processusEcoute() {
  if (processus && processus.connected) return processus;
  processus = fork(fileURLToPath(new URL('./ecoute-processus.js', import.meta.url)), [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  processus.on('exit', () => { processus = null; });
  return processus;
}

/** Branche le relais sur le serveur HTTP : l'équipe seule (session Klocka, rôle admin). */
export function brancherEcoute(serveur) {
  processusEcoute();
  serveur.on('upgrade', (req, socket, tete) => {
    if (!String(req.url || '').startsWith(CHEMIN)) return;
    const user = currentUser(req);
    if (user?.role !== 'admin') { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
    const p = processusEcoute();
    p.send({ type: 'client', url: req.url, headers: req.headers, tete: Buffer.from(tete || []).toString('base64'), qui: user.email }, socket);
  });
}
