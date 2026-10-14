// Les enregistrements d'écran des appels (14 oct. 2026, Jules : « une fois qu'ils
// ont raccroché, je vois comment ils interagissent avec l'app »). Pendant un
// appel du mode appel, le navigateur de l'analyste enregistre la page (rrweb :
// la page elle-même, rejouée, pas une vidéo filmée ; les mots de passe
// masqués) ; à la validation, l'enregistrement part ici, compressé. Seuls les
// super-admins le regardent, depuis Suivi > Appels. Effacé après 30 jours.
// L'analyste le sait : l'écran d'appel affiche « Écran enregistré ».

import fs from 'fs';
import path from 'path';
import { Records, DATA_DIR } from './db.js';

const ENTITE = 'EnregistrementEcran';
const DOSSIER = path.join(DATA_DIR, 'enregistrements');
const GARDE_JOURS = 30;
const TAILLE_MAX = 60 * 1024 * 1024;

const cheminDe = (id) => path.join(DOSSIER, `${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.json.gz`);

/** Garde un enregistrement (déjà compressé par le navigateur). */
export function deposer({ contenu, par, appel_id = null, agence_id = null, agent = null, debut = null, fin = null, evenements = null }) {
  if (!contenu?.length) return { ok: false, error: 'Enregistrement vide.' };
  if (contenu.length > TAILLE_MAX) return { ok: false, error: 'Enregistrement trop lourd.' };
  // Un fichier gzip commence par 1f 8b : rien d'autre n'est gardé.
  if (contenu[0] !== 0x1f || contenu[1] !== 0x8b) return { ok: false, error: 'Format inattendu.' };
  fs.mkdirSync(DOSSIER, { recursive: true });
  const e = Records.create(ENTITE, {
    par: String(par || '').toLowerCase() || null, appel_id, agence_id, agent: agent ? String(agent).slice(0, 120) : null,
    debut, fin, duree_s: debut && fin ? Math.max(0, Math.round((Date.parse(fin) - Date.parse(debut)) / 1000)) : null,
    taille: contenu.length, evenements: Number(evenements) || null, le: new Date().toISOString(),
  });
  fs.writeFileSync(cheminDe(e.id), contenu);
  purger();
  return { ok: true, id: e.id };
}

/** Les enregistrements, du plus récent au plus ancien (ou ceux d'un appel). */
export function liste({ appel_id = null } = {}) {
  return Records.list(ENTITE).filter((e) => !appel_id || e.appel_id === appel_id).sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

/** Le chemin du fichier compressé, s'il existe encore. */
export function fichier(id) {
  const e = Records.get(ENTITE, id);
  const p = e ? cheminDe(e.id) : null;
  return p && fs.existsSync(p) ? p : null;
}

/** Au-delà de 30 jours, l'enregistrement et sa fiche s'effacent. */
export function purger({ maintenant = new Date() } = {}) {
  const limite = new Date(maintenant.getTime() - GARDE_JOURS * 86400000).toISOString();
  let n = 0;
  for (const e of Records.list(ENTITE).filter((x) => String(x.le) < limite)) {
    try { fs.rmSync(cheminDe(e.id), { force: true }); } catch { /* déjà parti */ }
    Records.delete(ENTITE, e.id);
    n += 1;
  }
  return n;
}
