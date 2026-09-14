// Les incidents du serveur, écrits pour être relus.
//
// Quand le processus tombe, il emporte sa console : le superviseur de
// développement écrit dans un terminal qu'on referme, et chez un hébergeur
// les journaux tournent. Résultat, une erreur 502 dans l'interface — le temps
// que le serveur redémarre — n'a jamais d'explication le lendemain.
//
// Ici, chaque incident est ajouté à un fichier, à côté de la base : la date,
// ce qui est tombé, le message, la pile. Le fichier est borné ; au-delà, les
// plus anciens partent. Le démarrage en écrit un aussi, parce que « le
// serveur a redémarré à 15 h 42 » est précisément ce qu'on cherche quand
// quelqu'un dit « ça a planté vers 15 h 40 ».

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './db.js';

export const CHEMIN = path.join(DATA_DIR, 'incidents.log');
/** Au-delà, le fichier est retaillé à la moitié : on garde les plus récents. */
const PLAFOND = 500;

/**
 * Note un incident. Ne jette jamais : c'est appelé depuis les gestionnaires de
 * dernier recours, où une erreur de plus n'aiderait personne.
 * @param {'rejet'|'exception'|'demarrage'|string} type
 * @param {unknown} quoi - une erreur, ou de quoi la décrire
 */
export function noterIncident(type, quoi) {
  try {
    const e = quoi instanceof Error ? quoi : null;
    const ligne = JSON.stringify({
      le: new Date().toISOString(),
      type,
      message: e ? e.message : typeof quoi === 'string' ? quoi : JSON.stringify(quoi ?? null),
      pile: e?.stack ? e.stack.split('\n').slice(0, 12).join('\n') : null,
      pid: process.pid,
    });
    fs.appendFileSync(CHEMIN, `${ligne}\n`);
    elaguer();
  } catch {
    /* un incident qu'on ne peut pas écrire ne doit pas en provoquer un autre */
  }
}

function elaguer() {
  try {
    const lignes = fs.readFileSync(CHEMIN, 'utf-8').split('\n').filter(Boolean);
    if (lignes.length <= PLAFOND) return;
    fs.writeFileSync(CHEMIN, `${lignes.slice(-Math.floor(PLAFOND / 2)).join('\n')}\n`);
  } catch {
    /* fichier illisible : on le laisse tel quel */
  }
}

/**
 * Les derniers incidents, du plus récent au plus ancien.
 * @param {{limite?: number}} [opts]
 */
export function derniersIncidents({ limite = 50 } = {}) {
  try {
    return fs
      .readFileSync(CHEMIN, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .reverse()
      .slice(0, limite);
  } catch {
    return [];
  }
}
