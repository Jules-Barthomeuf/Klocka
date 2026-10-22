// Le clip d'objection (16 oct. 2026, Jules) : quand un appel finit sur une
// objection que l'appelant n'a pas levée, l'écran d'appel en isole quinze
// secondes d'audio, autour de la phrase qu'AK a relevée, et l'envoie ici.
// L'équipe le trouve sur le Dashboard : elle l'écoute, propose la réponse,
// le marque résolu. L'audio s'efface après 30 jours ; la phrase et les
// réponses restent.

import fs from 'fs';
import path from 'path';
import { Records, DATA_DIR } from './db.js';

const ENTITE = 'ObjectionAppel';
const DOSSIER = path.join(DATA_DIR, 'objections');
const GARDE_JOURS = 30;
const TAILLE_MAX = 3 * 1024 * 1024; // 15 s à 16 kHz font moins d'un mégaoctet

const cheminDe = (id) => path.join(DOSSIER, `${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.wav`);

/** Le clip d'un appel : un WAV, une fois par appel. */
export function deposer({ appel_id, wav, par }) {
  const appel = Records.get('AppelAgent', appel_id);
  if (!appel) return { ok: false, error: 'Appel introuvable.' };
  if (!appel.objection?.phrase) return { ok: false, error: "Haka n'a relevé aucune objection sur cet appel." };
  if (!wav?.length || wav.length > TAILLE_MAX || wav.toString('ascii', 0, 4) !== 'RIFF') return { ok: false, error: 'Clip audio invalide.' };
  const deja = Records.list(ENTITE).find((o) => o.appel_id === appel_id);
  if (deja) return { ok: true, objection: deja, deja: true };
  fs.mkdirSync(DOSSIER, { recursive: true });
  const agence = appel.agence_id ? Records.get('AgenceProspect', appel.agence_id)?.nom : null;
  const o = Records.create(ENTITE, {
    appel_id, par: String(par || appel.par || '').toLowerCase() || null, le: new Date().toISOString(),
    agence: agence || appel.agent || null, phrase: appel.objection.phrase, sujet: appel.objection.sujet || null,
    etat: 'a_resoudre', reponses: [], taille: wav.length,
  });
  fs.writeFileSync(cheminDe(o.id), wav);
  purger();
  return { ok: true, objection: o };
}

/** Les objections, ouvertes d'abord puis les plus récentes ; `ouvertes` : celles à résoudre seulement. */
export function liste({ ouvertes = false } = {}) {
  return Records.list(ENTITE)
    .filter((o) => !ouvertes || o.etat === 'a_resoudre')
    .sort((a, b) => Number(b.etat === 'a_resoudre') - Number(a.etat === 'a_resoudre') || String(b.le).localeCompare(String(a.le)))
    .map((o) => ({ ...o, audio: !!fichier(o.id) }));
}

/** Le fichier du clip, s'il existe encore. */
export function fichier(id) {
  const o = Records.get(ENTITE, id);
  const p = o ? cheminDe(o.id) : null;
  return p && fs.existsSync(p) ? p : null;
}

/** Une réponse proposée par quelqu'un de l'équipe. */
export function repondre(id, texte, user) {
  const o = Records.get(ENTITE, id);
  if (!o) return { ok: false, error: 'Objection introuvable.' };
  const t = String(texte || '').trim().slice(0, 1500);
  if (!t) return { ok: false, error: 'La réponse est vide.' };
  return { ok: true, objection: Records.update(ENTITE, id, { reponses: [...(o.reponses || []), { par: user?.email || null, texte: t, le: new Date().toISOString() }] }) };
}

/** Résolue (ou rouverte). */
export function resoudre(id, resolue, user) {
  const o = Records.get(ENTITE, id);
  if (!o) return { ok: false, error: 'Objection introuvable.' };
  return { ok: true, objection: Records.update(ENTITE, id, resolue ? { etat: 'resolue', resolue_par: user?.email || null, resolue_le: new Date().toISOString() } : { etat: 'a_resoudre', resolue_par: null, resolue_le: null }) };
}

/** Au-delà de 30 jours, l'audio s'efface ; la phrase et les réponses restent. */
export function purger({ maintenant = new Date() } = {}) {
  const limite = new Date(maintenant.getTime() - GARDE_JOURS * 86400000).toISOString();
  let n = 0;
  for (const o of Records.list(ENTITE).filter((x) => String(x.le) < limite && !x.audio_efface)) {
    try { fs.rmSync(cheminDe(o.id), { force: true }); } catch { /* déjà parti */ }
    Records.update(ENTITE, o.id, { audio_efface: true });
    n += 1;
  }
  return n;
}
