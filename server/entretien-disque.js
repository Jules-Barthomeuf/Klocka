// L'entretien du disque (22 oct. 2026, Jules : « libère au maximum sans toucher à nos fonctionnalités, je veux que ça
// marche comme actuellement »). Ne touche à aucune donnée que l'application relit ; seulement ce qui est jetable :
//   1. les copies du bac à sable restées sur le disque (bac.fermer() les efface ; un essai interrompu les laisse) ;
//   2. les recherches DVF que le cache ne relit plus (au-delà de 120 jours, et les doublons plus anciens d'une adresse) ;
//   3. les journaux texte trop gros : on garde leur fin ;
//   4. le journal d'écriture de SQLite (le fichier -wal), ramené à zéro une fois reporté dans la base.
// Tourne au démarrage du serveur (après quelques minutes) puis une fois par jour. Rend ce qu'il a libéré.

import fs from 'fs';
import path from 'path';
import db, { DATA_DIR, Records } from './db.js';

const SIX_HEURES = 6 * 3600 * 1000;
const DVF_JOURS = 120; // la durée du cache DVF (server/dvf.js, CACHE_JOURS)
const JOURNAL_MAX = 5 * 1024 * 1024;
const JOURNAL_GARDE = 1024 * 1024;
const JOURNAUX = ['dev.log', 'serveur-relance.log', 'incidents.log', 'recap.log'];

/** La taille d'un fichier ou d'un dossier, en octets (0 s'il n'existe pas). */
export function taille(p) {
  try {
    const s = fs.statSync(p);
    // La place réellement occupée (les blocs) : une copie clonée par le système de fichiers ne compte pas deux fois.
    if (!s.isDirectory()) return s.blocks != null ? Math.min(s.size, s.blocks * 512) : s.size;
    return fs.readdirSync(p).reduce((n, f) => n + taille(path.join(p, f)), 0);
  } catch { return 0; }
}

/**
 * Pure : les recherches DVF que le cache ne relit plus. Il ne relit que la plus récente d'une adresse, et seulement si
 * elle a moins de 120 jours : les autres sont jetables.
 */
export function rechercheDvfJetables(lignes, maintenant = Date.now()) {
  const garde = new Map();
  for (const x of lignes) {
    if (maintenant - Date.parse(x.le) >= DVF_JOURS * 86400000) continue;
    const a = garde.get(x.cle);
    if (!a || String(x.le) > String(a.le)) garde.set(x.cle, x);
  }
  const gardees = new Set([...garde.values()].map((x) => x.id));
  return lignes.filter((x) => !gardees.has(x.id)).map((x) => x.id);
}

/** Un passage d'entretien. `dossier` : le dossier des données (celui de la base par défaut). */
export function entretenir({ dossier = DATA_DIR, maintenant = Date.now() } = {}) {
  const bilan = { libere: 0, lignes: [] };
  const noter = (quoi, octets) => { if (octets > 0) { bilan.libere += octets; bilan.lignes.push(`${quoi} : ${(octets / 1e6).toFixed(1)} Mo`); } };

  // 1. Les copies du bac à sable de plus de six heures : aucun essai ne dure si longtemps.
  const testeur = path.join(dossier, 'testeur');
  try {
    for (const f of fs.readdirSync(testeur).filter((x) => x.startsWith('bac-'))) {
      const p = path.join(testeur, f);
      if (maintenant - fs.statSync(p).mtimeMs < SIX_HEURES) continue;
      const o = taille(p);
      fs.rmSync(p, { recursive: true, force: true });
      noter(`copie du bac à sable ${f}`, o);
    }
  } catch { /* pas de dossier testeur */ }

  // 2. Les recherches DVF que le cache ne relit plus.
  try {
    const ids = rechercheDvfJetables(Records.list('DvfRecherche'), maintenant);
    for (const id of ids) Records.delete('DvfRecherche', id);
    if (ids.length) bilan.lignes.push(`${ids.length} recherche(s) DVF périmée(s)`);
  } catch { /* table absente */ }

  // 3. Les journaux texte de plus de 5 Mo : on garde le dernier Mo.
  for (const nom of JOURNAUX) {
    const p = path.join(dossier, nom);
    const o = taille(p);
    if (o <= JOURNAL_MAX) continue;
    try {
      const fd = fs.openSync(p, 'r');
      const fin = Buffer.alloc(JOURNAL_GARDE);
      fs.readSync(fd, fin, 0, JOURNAL_GARDE, o - JOURNAL_GARDE);
      fs.closeSync(fd);
      fs.writeFileSync(p, fin);
      noter(`journal ${nom}`, o - JOURNAL_GARDE);
    } catch { /* journal occupé : la prochaine fois */ }
  }

  // 4. Le journal d'écriture de SQLite : reporté dans la base, puis ramené à zéro.
  if (dossier === DATA_DIR) {
    const wal = path.join(dossier, 'klocka.db-wal');
    const avant = taille(wal);
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* base occupée : la prochaine fois */ }
    noter('journal d\'écriture de la base', avant - taille(wal));
  }
  return bilan;
}
