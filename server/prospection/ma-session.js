// « Ma session » sous la carte d'appel (17 nov. 2026, Jules) : une session d'appels se commence, se met en pause, se
// reprend et se termine ; pendant, les chiffres qui donnent envie d'en faire un de plus : les appels contre le record,
// le taux de décroché contre la moyenne et le record, la ville, les fiches reçues dans la semaine (par soi, par toute
// l'équipe). Terminée, un bilan.
//
// La session est la SessionAppel du mode appel : `demarree_le`, `pauses` [{ de, a }], `terminee_le` s'y ajoutent. Une
// session ouverte sans être commencée (la ville choisie) note ses appels comme avant ; elle ne compte ni pour le record
// ni pour la moyenne.
//
// Le calcul est pur (bilanDeSession, chiffresDuJournal, fichesDeLaSemaine), testé sans base ; maSession lit la base.

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
export function bilanDeSession({ session: s, passees = [], journal = null, maintenant = new Date() }) {
  const appels = entreesDe(s).length;
  const decroches = decrochesDe(s);
  const anciennes = passees.filter((p) => p.id !== s.id && p.demarree_le && !p.essai);
  // Le record et la moyenne se lisent aussi au journal des appels (18 nov. 2026, Jules) : les sessions ne se comptent
  // que depuis le 17 nov., le journal depuis le début des mesures ; le meilleur des deux fait le record.
  const record = Math.max(anciennes.reduce((m, p) => Math.max(m, entreesDe(p).length), 0), journal?.record_jour?.appels || 0);
  // Le taux record : sur une session d'au moins cinq appels, sinon deux appels décrochés sur deux feraient 100 %.
  const tauxRecord = Math.max(anciennes.filter((p) => entreesDe(p).length >= 5).reduce((m, p) => Math.max(m, decrochesDe(p) / entreesDe(p).length), 0), (journal?.taux_record?.taux || 0) / 100);
  const totAppels = anciennes.reduce((t, p) => t + entreesDe(p).length, 0);
  // La moyenne : celle du journal quand il y en a un (il contient les appels des sessions), sinon celle des sessions.
  const moyenne = journal?.taux_moyen != null ? journal.taux_moyen / 100 : totAppels ? anciennes.reduce((t, p) => t + decrochesDe(p), 0) / totAppels : null;
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

const jourCourt = (j) => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${j}T12:00:00Z`));

/**
 * Pure : les chiffres du journal des appels (18 nov. 2026, Jules : « utiliser les logs d'appels pour déjà mettre des
 * stats, record »). Les mêmes appels que Suivi > Appels par analyste (ni mail, ni essai, ni appel remplacé), lus jour
 * par jour, heure de Paris : la meilleure journée, le taux de décroché moyen et record (journée d'au moins cinq appels),
 * les biens trouvés, la moyenne par jour d'appels ; les jours d'avant aujourd'hui seulement, pour que la session en
 * cours se mesure contre eux. Puis aujourd'hui, la semaine contre la meilleure semaine, et l'équipe cette semaine.
 * @param {{ appels: Array<{par, le, issue}>, moi: string, equipe?: Array<{prenom, email}>, maintenant?: Date }} d
 */
export function chiffresDuJournal({ appels = [], moi, equipe = [], maintenant = new Date() }) {
  const qui = String(moi || '').toLowerCase();
  const aujourdhui = jourParis(maintenant);
  const lundi = lundiDe(maintenant);
  const decroche = (x) => !SANS_PERSONNE.has(x.issue);
  const bien = (x) => x.issue === 'a_des_murs';
  const parJour = new Map();
  const parSemaine = new Map();
  const cetteSemaine = new Map();
  for (const x of appels) {
    const par = String(x.par || '').toLowerCase();
    if (!par || !x.le) continue;
    const j = jourParis(x.le);
    const l = lundiDe(x.le);
    if (l === lundi) {
      const t = cetteSemaine.get(par) || { appels: 0, decroches: 0, biens: 0 };
      t.appels += 1; t.decroches += decroche(x) ? 1 : 0; t.biens += bien(x) ? 1 : 0;
      cetteSemaine.set(par, t);
    }
    if (par !== qui) continue;
    const t = parJour.get(j) || { jour: j, appels: 0, decroches: 0, biens: 0 };
    t.appels += 1; t.decroches += decroche(x) ? 1 : 0; t.biens += bien(x) ? 1 : 0;
    parJour.set(j, t);
    if (l !== lundi) parSemaine.set(l, (parSemaine.get(l) || 0) + 1);
  }
  const passes = [...parJour.values()].filter((t) => t.jour < aujourdhui).sort((a, b) => a.jour.localeCompare(b.jour));
  const meilleur = (t, cle) => t.reduce((m, x) => (!m || x[cle] > m[cle] ? x : m), null);
  const recordJour = meilleur(passes, 'appels');
  const pleins = passes.filter((t) => t.appels >= 5).map((t) => ({ ...t, taux: Math.round((t.decroches / t.appels) * 100) }));
  const tauxRecord = meilleur(pleins, 'taux');
  const total = passes.reduce((n, t) => n + t.appels, 0);
  const decroches = passes.reduce((n, t) => n + t.decroches, 0);
  const biens = passes.reduce((n, t) => n + t.biens, 0);
  const recordBiens = meilleur(passes.filter((t) => t.biens > 0), 'biens');
  const auj = parJour.get(aujourdhui) || { appels: 0, decroches: 0, biens: 0 };
  const semaineMoi = cetteSemaine.get(qui) || { appels: 0, decroches: 0, biens: 0 };
  const meilleureSemaine = [...parSemaine.entries()].reduce((m, [l, n]) => (!m || n > m.appels ? { lundi: l, appels: n } : m), null);
  const membres = new Map(equipe.map((m) => [String(m.email).toLowerCase(), m.prenom]));
  for (const e of cetteSemaine.keys()) if (!membres.has(e)) membres.set(e, e.split('@')[0]);
  if (qui && !membres.has(qui)) membres.set(qui, qui.split('@')[0]);
  const equipeSemaine = [...membres.entries()].map(([email, prenom]) => {
    const t = cetteSemaine.get(email) || { appels: 0, decroches: 0, biens: 0 };
    return { prenom, moi: email === qui, appels: t.appels, taux: t.appels ? Math.round((t.decroches / t.appels) * 100) : null, biens: t.biens };
  }).filter((m) => m.appels > 0 || m.moi).sort((a, b) => b.appels - a.appels || (b.moi ? 1 : 0) - (a.moi ? 1 : 0));
  return {
    jours_actifs: passes.length,
    appels: total,
    moyenne_jour: passes.length ? Math.round((total / passes.length) * 10) / 10 : null,
    record_jour: recordJour ? { appels: recordJour.appels, jour: recordJour.jour, le: jourCourt(recordJour.jour) } : null,
    taux_moyen: total ? Math.round((decroches / total) * 100) : null,
    taux_record: tauxRecord ? { taux: tauxRecord.taux, jour: tauxRecord.jour, le: jourCourt(tauxRecord.jour) } : null,
    biens,
    record_biens: recordBiens ? { biens: recordBiens.biens, jour: recordBiens.jour, le: jourCourt(recordBiens.jour) } : null,
    aujourdhui: { appels: auj.appels, decroches: auj.decroches, biens: auj.biens },
    semaine: { appels: semaineMoi.appels, biens: semaineMoi.biens, meilleure: meilleureSemaine ? { appels: meilleureSemaine.appels, lundi: meilleureSemaine.lundi, le: jourCourt(meilleureSemaine.lundi) } : null },
    equipe_semaine: equipeSemaine,
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

/** Les appels comptés par Suivi > Appels : depuis le début des mesures, ni mail, ni essai, ni appel remplacé. */
async function appelsDuSuivi() {
  const { DEBUT_DES_MESURES, sourceDe } = await import('./suivi-appels.js');
  const sessions = new Map(Records.list(SESSION).map((s) => [s.id, s]));
  return Records.list('AppelAgent').filter((x) => x.par && x.canal !== 'mail' && !x.essai && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat) && String(x.le) >= DEBUT_DES_MESURES && sourceDe(x, sessions) !== 'essai');
}

let fichesCache = null;
async function lignesDesFiches() {
  if (fichesCache && Date.now() - fichesCache.le < 5 * 60000) return fichesCache.lignes;
  const { fiches } = await import('./index.js');
  const { fichesParAnalyste } = await import('./fiches-par-analyste.js');
  const { DEBUT_DES_MESURES } = await import('./suivi-appels.js');
  const { EQUIPE } = await import('./equipe.js');
  const appels = await appelsDuSuivi();
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
  let journal = null;
  try {
    const { EQUIPE } = await import('./equipe.js');
    journal = chiffresDuJournal({ appels: await appelsDuSuivi(), moi, equipe: EQUIPE, maintenant });
  } catch (e) { console.warn(`[ma session] journal : ${e?.message || e}`); }
  return { ok: true, ville: s.ville, ...bilanDeSession({ session: s, passees, journal, maintenant }), progression: recap.ok ? recap.progression : null, fiches, journal };
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
