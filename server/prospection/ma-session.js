// « Ma session » sous la carte d'appel (17 nov. 2026, Jules) : une session d'appels se commence, se met en pause, se
// reprend et se termine ; pendant, les chiffres qui donnent envie d'en faire un de plus : les appels contre le record,
// le taux de décroché contre la moyenne et le record, la ville, les fiches reçues dans la semaine (par soi, par toute
// l'équipe). Terminée, un bilan.
//
// La session est la SessionAppel du mode appel : `demarree_le`, `pauses` [{ de, a }], `terminee_le` s'y ajoutent. Une
// session ouverte sans être commencée (la ville choisie) note ses appels comme avant ; elle ne compte ni pour le record
// ni pour la moyenne.
//
// Le calcul est pur (bilanDeSession, fichesDeLaSemaine), testé sans base ; maSession lit la base.

import { Records } from '../db.js';

const SESSION = 'SessionAppel';
const SANS_PERSONNE = new Set(['pas_de_reponse', 'repondeur']);
const JOUR = 86400000;

const jourParis = (d) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(d));
const heureParis = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(new Date(d)).replace(':', ' h ');
/** Le lundi (AAAA-MM-JJ, heure de Paris) de la semaine d'une date. */
export function lundiDe(d) {
  const j = jourParis(d);
  const t = Date.parse(`${j}T12:00:00Z`);
  const rang = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - rang * JOUR).toISOString().slice(0, 10);
}

const entreesDe = (s) => (s?.appels || []).filter((x) => !x.annule);
const decrochesDe = (s) => entreesDe(s).filter((x) => !SANS_PERSONNE.has(x.issue)).length;

/** Pure : le temps passé à appeler, pauses ôtées (ms). */
export function tempsActif(s, maintenant = new Date()) {
  if (!s?.demarree_le) return 0;
  const fin = Date.parse(s.terminee_le || '') || maintenant.getTime();
  const pauses = (s.pauses || []).reduce((t, p) => t + Math.max(0, (Date.parse(p.a || '') || fin) - Date.parse(p.de)), 0);
  return Math.max(0, fin - Date.parse(s.demarree_le) - pauses);
}

export const etatDe = (s) => (!s?.demarree_le ? 'pas_commencee' : s.terminee_le ? 'terminee' : (s.pauses || []).some((p) => !p.a) ? 'en_pause' : 'en_cours');

/**
 * Pure : les chiffres de la session contre les sessions passées de la même personne (commencées, hors essai).
 * @param {{ session, passees: Array, maintenant?: Date }} d
 */
export function bilanDeSession({ session: s, passees = [], maintenant = new Date() }) {
  const appels = entreesDe(s).length;
  const decroches = decrochesDe(s);
  const anciennes = passees.filter((p) => p.id !== s.id && p.demarree_le && !p.essai);
  const record = anciennes.reduce((m, p) => Math.max(m, entreesDe(p).length), 0);
  // Le taux record : sur une session d'au moins cinq appels, sinon deux appels décrochés sur deux feraient 100 %.
  const tauxRecord = anciennes.filter((p) => entreesDe(p).length >= 5).reduce((m, p) => Math.max(m, decrochesDe(p) / entreesDe(p).length), 0);
  const totAppels = anciennes.reduce((t, p) => t + entreesDe(p).length, 0);
  const moyenne = totAppels ? anciennes.reduce((t, p) => t + decrochesDe(p), 0) / totAppels : null;
  const taux = appels ? decroches / appels : null;
  const actif = tempsActif(s, maintenant);
  // À ce rythme : l'heure où le record tombe, dès deux appels, tant qu'il n'est pas battu.
  let recordVers = null;
  if (record > appels && appels >= 2 && actif > 0 && etatDe(s) === 'en_cours') {
    recordVers = heureParis(maintenant.getTime() + ((record - appels) * actif) / appels);
  }
  const pts = (x) => (x == null || taux == null ? null : Math.round((taux - x) * 100));
  return {
    etat: etatDe(s), demarree_le: s.demarree_le || null, terminee_le: s.terminee_le || null, pauses: s.pauses || [],
    actif_ms: actif,
    appels, record, record_battu: record > 0 && appels > record, reste_pour_record: Math.max(0, record - appels), record_vers: recordVers,
    decroches, taux: taux == null ? null : Math.round(taux * 100), taux_record: tauxRecord ? Math.round(tauxRecord * 100) : null,
    taux_moyen: moyenne == null ? null : Math.round(moyenne * 100),
    ecart_moyenne: pts(moyenne), ecart_record: tauxRecord ? pts(tauxRecord) : null,
    par_issue: entreesDe(s).reduce((o, x) => ({ ...o, [x.issue]: (o[x.issue] || 0) + 1 }), {}),
  };
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];

/**
 * Pure : les biens reçus dans la semaine, jour par jour (du lundi au vendredi), par moi et par toute l'équipe, et ma
 * meilleure semaine (cumul jour par jour) depuis le début des mesures. `fiches` : les lignes de fichesParAnalyste.
 */
export function fichesDeLaSemaine({ fiches = [], moi, maintenant = new Date() }) {
  const lundi = lundiDe(maintenant);
  const jourDe = (iso) => Math.round((Date.parse(`${jourParis(iso)}T12:00:00Z`) - Date.parse(`${lundi}T12:00:00Z`)) / JOUR);
  const aujourdhui = jourDe(maintenant);
  const comptees = fiches.filter((f) => !f.ecartee && f.analyste && (f.biens || 0) > 0);
  const semaine = comptees.filter((f) => lundiDe(f.le) === lundi);
  const moiJ = Array(5).fill(0);
  const equipeJ = Array(5).fill(0);
  for (const f of semaine) {
    const j = jourDe(f.le);
    // Le week-end compte avec le vendredi : la semaine affichée s'arrête là.
    const k = Math.min(4, Math.max(0, j));
    equipeJ[k] += f.biens;
    if (f.analyste === moi) moiJ[k] += f.biens;
  }
  // Ma meilleure semaine passée, en cumul jour par jour.
  const parSemaine = new Map();
  for (const f of comptees.filter((x) => x.analyste === moi && lundiDe(x.le) !== lundi)) {
    const l = lundiDe(f.le);
    const t = parSemaine.get(l) || Array(5).fill(0);
    const k = Math.min(4, Math.max(0, Math.round((Date.parse(`${jourParis(f.le)}T12:00:00Z`) - Date.parse(`${l}T12:00:00Z`)) / JOUR)));
    t[k] += f.biens;
    parSemaine.set(l, t);
  }
  const meilleure = [...parSemaine.values()].sort((a, b) => b.reduce((s, n) => s + n, 0) - a.reduce((s, n) => s + n, 0))[0] || null;
  const cumul = (t) => t.reduce((o, n, i) => [...o, (o[i - 1] || 0) + n], []);
  const somme = (t) => t.reduce((s, n) => s + n, 0);
  return {
    lundi, jours: JOURS, aujourdhui: Math.min(4, aujourdhui),
    moi: { total: somme(moiJ), par_jour: moiJ, cumul: cumul(moiJ) },
    equipe: { total: somme(equipeJ), par_jour: equipeJ },
    record: meilleure ? { total: somme(meilleure), cumul: cumul(meilleure) } : null,
  };
}

// --- La base ---------------------------------------------------------------------------------------------------------

let fichesCache = null;
async function lignesDesFiches() {
  if (fichesCache && Date.now() - fichesCache.le < 5 * 60000) return fichesCache.lignes;
  const { fiches } = await import('./index.js');
  const { fichesParAnalyste } = await import('./fiches-par-analyste.js');
  const { DEBUT_DES_MESURES } = await import('./suivi-appels.js');
  const { EQUIPE } = await import('./equipe.js');
  const appels = Records.list('AppelAgent').filter((x) => x.par && x.canal !== 'mail' && !x.essai && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat) && String(x.le) >= DEBUT_DES_MESURES);
  const r = fichesParAnalyste({
    fiches: await fiches(), appels, depuis: DEBUT_DES_MESURES, maintenant: new Date(), semaines: 1,
    agents: new Map(Records.list('AgentImmo').map((a) => [a.id, a])),
    agences: new Map(Records.list('AgenceProspect').map((a) => [a.id, a])),
    equipe: EQUIPE,
  });
  fichesCache = { le: Date.now(), lignes: r.fiches };
  return r.fiches;
}

/** Les chiffres de « Ma session » : la session, la ville, les fiches de la semaine. */
export async function maSession(sessionId, user, maintenant = new Date()) {
  const s = Records.get(SESSION, sessionId);
  if (!s) return { ok: false, error: 'Session introuvable.' };
  const moi = String(s.par || user?.email || '').toLowerCase();
  const passees = Records.list(SESSION).filter((p) => String(p.par || '').toLowerCase() === moi);
  const { recapSession } = await import('./mode-appel.js');
  const recap = recapSession(s.id);
  let fiches = null;
  try { fiches = fichesDeLaSemaine({ fiches: await lignesDesFiches(), moi, maintenant }); } catch (e) { console.warn(`[ma session] fiches : ${e?.message || e}`); }
  return { ok: true, ville: s.ville, ...bilanDeSession({ session: s, passees, maintenant }), progression: recap.ok ? recap.progression : null, fiches };
}

/** Commencer, mettre en pause, reprendre, terminer. */
export function changerEtat(sessionId, action, user, maintenant = new Date()) {
  const s = Records.get(SESSION, sessionId);
  if (!s) return { ok: false, error: 'Session introuvable.' };
  if (s.par && user?.email && String(s.par).toLowerCase() !== String(user.email).toLowerCase()) return { ok: false, error: "Ce n'est pas votre session." };
  const t = maintenant.toISOString();
  const pauses = [...(s.pauses || [])];
  const ouverte = pauses.findIndex((p) => !p.a);
  let champs = null;
  if (action === 'demarrer' && !s.demarree_le) champs = { demarree_le: t };
  else if (action === 'pause' && etatDe(s) === 'en_cours') champs = { pauses: [...pauses, { de: t }] };
  else if (action === 'reprendre' && ouverte >= 0) { pauses[ouverte] = { ...pauses[ouverte], a: t }; champs = { pauses }; }
  else if (action === 'terminer' && s.demarree_le && !s.terminee_le) {
    if (ouverte >= 0) pauses[ouverte] = { ...pauses[ouverte], a: t };
    champs = { terminee_le: t, pauses };
  }
  if (!champs) return { ok: true, session: s };
  return { ok: true, session: Records.update(SESSION, s.id, champs) };
}

/**
 * La session commencée et pas terminée de cette personne pour cette ville, du jour : reprise au rechargement de la page
 * au lieu d'en ouvrir une neuve.
 */
export function sessionEnCours(listeId, user, maintenant = new Date()) {
  const moi = String(user?.email || '').toLowerCase();
  const jour = jourParis(maintenant);
  return Records.list(SESSION)
    .filter((p) => p.liste_id === listeId && String(p.par || '').toLowerCase() === moi && p.demarree_le && !p.terminee_le && !p.essai && jourParis(p.demarree_le) === jour)
    .sort((a, b) => String(b.demarree_le).localeCompare(String(a.demarree_le)))[0] || null;
}
