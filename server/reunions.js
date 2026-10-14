// Les réunions enregistrées (14 oct. 2026, Jules : « une page dans Suivi pour
// enregistrer une réunion, qui va durer longtemps ; ça va nourrir le Cerveau »).
//
// Une réunion dure une heure ou deux : rien ne doit tenir dans la mémoire du
// navigateur seul. Le micro coupe des morceaux de trente secondes, chacun est
// transcrit à son arrivée et son texte est gardé ici, à son rang. Une page
// fermée, un onglet qui plante, un réseau qui tombe : la réunion reprend où
// elle en était, rien de ce qui a été transcrit n'est perdu. L'audio n'est
// jamais gardé (comme pour les appels), seul le texte.
//
// À la fin, la transcription entre dans le Cerveau comme un compte rendu
// (cerveau.js, ajouterSource), l'extraction des faits tourne en fond, et Jules
// les valide comme les autres. Une réunion très longue entre en plusieurs
// parties : une source du Cerveau garde au plus 120 000 signes.

import { Records } from './db.js';

export const REUNION = 'Reunion';
// Une partie de compte rendu : sous le plafond d'une source du Cerveau, coupée entre deux morceaux.
export const SIGNES_PAR_PARTIE = 100000;
const maintenant = () => new Date().toISOString();
const bas = (e) => String(e || '').trim().toLowerCase();

/** Pure : le texte d'une réunion, ses morceaux dans l'ordre, les vides écartés. */
export function texteDe(morceaux = []) {
  return [...morceaux].filter((m) => m && String(m.texte || '').trim()).sort((a, b) => a.i - b.i).map((m) => String(m.texte).trim()).join('\n');
}

/** Pure : le texte coupé en parties de `max` signes au plus, toujours entre deux morceaux (un morceau trop long est coupé net). */
export function parties(morceaux = [], max = SIGNES_PAR_PARTIE) {
  const sortie = [];
  let cur = '';
  for (const t of texteDe(morceaux).split('\n')) {
    for (let k = 0; k < t.length; k += max) {
      const bout = t.slice(k, k + max);
      if (cur && cur.length + 1 + bout.length > max) { sortie.push(cur); cur = ''; }
      cur = cur ? `${cur}\n${bout}` : bout;
    }
  }
  if (cur) sortie.push(cur);
  return sortie;
}

/** Ce que l'écran lit d'une réunion. */
export function vue(r) {
  if (!r) return null;
  const morceaux = [...(r.morceaux || [])].sort((a, b) => a.i - b.i);
  return {
    id: r.id, titre: r.titre || null, par: r.par, etat: r.etat, debut: r.debut, fin: r.fin || null,
    duree_s: r.duree_s ?? (r.fin ? Math.round((Date.parse(r.fin) - Date.parse(r.debut)) / 1000) : null),
    participants: r.participants || '', notes: r.notes || '',
    morceaux: morceaux.map((m) => ({ i: m.i, texte: m.texte || '' })),
    prochain: morceaux.length ? Math.max(...morceaux.map((m) => m.i)) + 1 : 0,
    signes: texteDe(morceaux).length,
    sources: r.sources || [], envoyee_le: r.envoyee_le || null,
  };
}

/** La réunion qu'on est en train d'enregistrer, s'il y en a une (pour la reprendre après une coupure). */
export const enCoursDe = (user) => Records.list(REUNION).filter((r) => r.par === bas(user?.email) && r.etat === 'enregistrement').sort((a, b) => String(b.debut).localeCompare(String(a.debut)))[0] || null;

export function demarrer(user, { titre = null } = {}) {
  const deja = enCoursDe(user);
  if (deja) return { ok: true, reunion: vue(deja), reprise: true };
  const r = Records.create(REUNION, { par: bas(user?.email), titre: String(titre || '').trim().slice(0, 160) || null, etat: 'enregistrement', debut: maintenant(), morceaux: [] });
  return { ok: true, reunion: vue(r) };
}

/** Le texte d'un morceau, à son rang. Un morceau renvoyé (une reprise) remplace le précédent du même rang. */
export function ajouterMorceau(id, i, texte, user) {
  const r = Records.get(REUNION, id);
  if (!r || r.par !== bas(user?.email)) return { ok: false, error: 'Réunion introuvable.' };
  if (r.etat !== 'enregistrement') return { ok: false, error: 'Cette réunion est terminée.' };
  const rang = Number.parseInt(i, 10);
  if (!Number.isInteger(rang) || rang < 0) return { ok: false, error: 'Morceau sans rang.' };
  const morceaux = (r.morceaux || []).filter((m) => m.i !== rang).concat({ i: rang, texte: String(texte || '').trim(), le: maintenant() });
  Records.update(REUNION, id, { morceaux, maj_le: maintenant() });
  return { ok: true, i: rang };
}

/** Garde le titre, les participants et les notes en cours de route (rien ne part). */
export function noter(id, { titre, participants, notes } = {}, user) {
  const r = Records.get(REUNION, id);
  if (!r || r.par !== bas(user?.email)) return { ok: false, error: 'Réunion introuvable.' };
  const champs = {};
  if (titre !== undefined) champs.titre = String(titre || '').trim().slice(0, 160) || null;
  if (participants !== undefined) champs.participants = String(participants || '').slice(0, 1000);
  if (notes !== undefined) champs.notes = String(notes || '').slice(0, 20000);
  Records.update(REUNION, id, champs);
  return { ok: true, reunion: vue(Records.get(REUNION, id)) };
}

/**
 * Termine la réunion et l'envoie au Cerveau : une source par partie, de type
 * compte rendu, puis l'extraction en fond. Rejouable : une partie déjà
 * envoyée n'entre pas deux fois (clé « reunion-<id>-<partie> »).
 */
export async function terminer(id, { titre, participants, notes } = {}, user, { C = null } = {}) {
  const r = Records.get(REUNION, id);
  if (!r || r.par !== bas(user?.email)) return { ok: false, error: 'Réunion introuvable.' };
  noter(id, { titre, participants, notes }, user);
  const a = Records.get(REUNION, id);
  const fin = a.fin || maintenant();
  const decoupe = parties(a.morceaux);
  const entete = [a.participants && `Participants : ${a.participants}`, a.notes && `Notes prises pendant la réunion : ${a.notes}`].filter(Boolean).join('\n');
  if (!decoupe.length && !entete) {
    Records.update(REUNION, id, { etat: 'vide', fin, duree_s: Math.round((Date.parse(fin) - Date.parse(a.debut)) / 1000) });
    return { ok: false, error: "Rien n'a été transcrit : la réunion n'entre pas dans le Cerveau." };
  }
  const cerveau = C || (await import('./cerveau.js'));
  const nom = a.titre || `Réunion du ${new Date(a.debut).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' })}`;
  const morceauxTexte = decoupe.length ? decoupe : [''];
  const sources = [];
  for (let k = 0; k < morceauxTexte.length; k += 1) {
    const partie = morceauxTexte.length > 1 ? ` (partie ${k + 1} sur ${morceauxTexte.length})` : '';
    const contenu = [k === 0 ? entete : '', morceauxTexte[k]].filter(Boolean).join('\n\n');
    const s = cerveau.ajouterSource({ type: 'compte_rendu', auteur: a.par, date: a.debut, titre: `Réunion : ${nom}${partie}`, contenu, lien_original: '/SuiviReunion', cle: `reunion-${a.id}-${k + 1}` });
    if (!s.ok) return { ok: false, error: s.error };
    sources.push(s.source.id);
    if (!s.deja) cerveau.extraire(s.source.id).catch(() => {});
  }
  Records.update(REUNION, id, { etat: 'envoyee', fin, duree_s: Math.round((Date.parse(fin) - Date.parse(a.debut)) / 1000), sources, envoyee_le: maintenant() });
  return { ok: true, reunion: vue(Records.get(REUNION, id)) };
}

/** Abandonner : la réunion reste dans la liste, marquée, et n'entre pas dans le Cerveau. */
export function abandonner(id, user) {
  const r = Records.get(REUNION, id);
  if (!r || r.par !== bas(user?.email)) return { ok: false, error: 'Réunion introuvable.' };
  Records.update(REUNION, id, { etat: 'abandonnee', fin: r.fin || maintenant() });
  return { ok: true };
}

/** Les réunions de l'équipe, les plus récentes d'abord, avec ce que le Cerveau en a tiré. */
export function lister({ limite = 40 } = {}) {
  const faits = Records.list('CerveauFait');
  return Records.list(REUNION).sort((a, b) => String(b.debut).localeCompare(String(a.debut))).slice(0, limite).map((r) => {
    const v = vue(r);
    const fs = faits.filter((f) => (r.sources || []).includes(f.source_id));
    return { ...v, morceaux: undefined, nb_morceaux: v.morceaux.length, faits: fs.length, faits_valides: fs.filter((f) => f.statut === 'valide').length };
  });
}
