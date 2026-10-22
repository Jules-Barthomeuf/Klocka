// La passe des scores appris, dans un processus à part (22 oct. 2026, Jules : « 502 Bad Gateway tout le temps »).
// Recalculer toutes les villes lit DVF, le cadastre et le fichier des sociétés de chaque département : jusqu'à près
// d'un gigaoctet de mémoire, que Node ne rend pas ensuite. Lancée trente secondes après chaque démarrage, elle
// poussait le serveur de Render vers sa limite de 2 Go, et chaque redémarrage la relançait. Elle tourne désormais la
// nuit, dans un processus enfant : sa mémoire part avec lui. Au démarrage, seulement si la dernière a plus de 36 h.

import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Meta } from '../db.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CLE = 'alx_scores_passe_le';
let enfant = null;

/** Lance la passe dans un processus enfant ; une seule à la fois. */
export function lancerPasseScores({ raison = 'nuit' } = {}) {
  if (enfant) return false;
  console.log(`[alx] passe des scores appris (${raison}) dans un processus à part`);
  enfant = fork(path.join(ICI, 'passe-scores-enfant.js'), [], { execArgv: ['--max-old-space-size=1024'], stdio: 'inherit' });
  enfant.on('exit', (code) => {
    if (code === 0) Meta.set(CLE, new Date().toISOString());
    else console.error(`[alx] passe des scores appris arrêtée (code ${code})`);
    enfant = null;
  });
  return true;
}

/** Les millisecondes jusqu'au prochain `heureUtc`:`minute` (UTC). */
export function delaiJusqua(heureUtc, minute = 0, maintenant = new Date()) {
  const cible = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate(), heureUtc, minute));
  if (cible <= maintenant) cible.setUTCDate(cible.getUTCDate() + 1);
  return cible - maintenant;
}

/** La passe chaque nuit à 1 h 30 UTC (3 h 30 à Paris l'été, 2 h 30 l'hiver) ; au démarrage si la dernière date de plus de 36 h. */
export function planifierPassesScores() {
  const derniere = Date.parse(Meta.get(CLE) || '') || 0;
  if (Date.now() - derniere > 36 * 3600 * 1000) setTimeout(() => lancerPasseScores({ raison: 'en retard' }), 10 * 60 * 1000).unref();
  const nuit = () => { lancerPasseScores(); setTimeout(nuit, delaiJusqua(1, 30)).unref(); };
  setTimeout(nuit, delaiJusqua(1, 30)).unref();
}
