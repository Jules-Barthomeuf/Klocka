// Haka : les automatismes (17 oct. 2026, spec de Jules, § 11). Un automatisme n'a pas de
// configuration à part : c'est une compétence publiée et active dont les déclencheurs
// contiennent autre chose que `demande_chat` et `bouton`. La vue lit les compétences et
// leurs exécutions. Jules seul met en pause, reprend, lance, relance.
//
// Pause : posée sur la compétence (automatisme_pause, pause_par, pause_le). Un événement
// reçu pendant la pause n'est jamais perdu : il est noté comme exécution « ignoree », avec
// de quoi le relancer (`relance`), et « Traiter les ignorés » les lance un par un.

import db, { Records, Meta } from '../db.js';
import { randomUUID } from 'node:crypto';
import * as C from './competences.js';
import { EUR_PAR_USD } from './executions.js';
import { installer } from './schema.js';

installer();

export const DECLENCHEURS_AUTO = ['mail_fiche_recue', 'fiche_deposee', 'documents_recus', 'planifie'];
export const PHRASES = {
  mail_fiche_recue: 'Quand une fiche arrive dans une boîte d\'analyste',
  fiche_deposee: 'Quand une fiche est déposée dans l\'application',
  documents_recus: 'Quand des documents arrivent pour un dossier',
  planifie: 'Chaque jour ouvré à 8 h',
};
/** La tâche du moteur que lance chaque automatisme planifié (« Lancer maintenant »). */
const PLANIFIES = { 'mails-agents': 'relances_matin' };
const maintenant = () => new Date().toISOString();
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const json = (v, r) => { try { return JSON.parse(v); } catch { return r; } };

export const estAutomatisme = (c) => Number(c?.version) > 0 && !c.desactivee && (c.declencheurs || []).some((d) => DECLENCHEURS_AUTO.includes(d));
export const enPause = (slug) => !!C.lire(slug)?.automatisme_pause;

/** Pure : un message lisible pour une erreur technique ; le détail reste à côté, replié. */
export function erreurLisible(texte) {
  const t = String(texte || '');
  if (!t) return null;
  if (/credit balance|crédit/i.test(t)) return 'Plus de crédits sur l\'API Anthropic';
  if (/equimmox/i.test(t)) return 'Equimmox ne répond pas';
  if (/gmail|google/i.test(t)) return 'Gmail ne répond pas';
  if (/monday/i.test(t)) return 'Twenty CRM ne répond pas';
  if (/dvf/i.test(t)) return 'DVF ne répond pas';
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|503|502/i.test(t)) return 'Un service extérieur ne répond pas';
  if (/introuvable/i.test(t)) return t.slice(0, 120);
  return 'Une étape a échoué';
}

/** Pure : l'état d'un automatisme depuis ses dernières exécutions (les ignorées ne comptent pas). */
export function etatDe(c, dernieres = []) {
  if (c.automatisme_pause) return 'en_pause';
  const vraies = dernieres.filter((e) => e.statut !== 'ignoree' && e.statut !== 'en_attente' && e.statut !== 'en_cours');
  return vraies.length >= 3 && vraies.slice(0, 3).every((e) => e.statut === 'echec') ? 'en_erreur' : 'actif';
}

/** Pure : la prochaine exécution d'un automatisme planifié (jour ouvré, 8 h à Paris). */
export function prochaine(maintenantD = new Date(), dernierJour = null) {
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(maintenantD.getTime() + i * 86400000);
    const js = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(d);
    if (['Sat', 'Sun'].includes(js)) continue;
    const jour = jourParis(d);
    if (i === 0 && dernierJour === jour) continue;
    return `${jour}T08:00:00+02:00`;
  }
  return null;
}

const MOTS_VERDICT = { 'NO-GO': 'Écarté', 'GO SOUS RÉSERVE': 'À vérifier', INSUFFISANT: 'À vérifier', GO: 'Conforme' };
/** Le résultat court d'une exécution : le verdict du dossier quand il y en a un, sinon son statut. */
function resultatCourt(e) {
  if (e.statut === 'ignoree') return 'Ignoré (en pause)';
  if (e.statut === 'echec') return 'Erreur';
  if (e.statut === 'en_cours' || e.statut === 'en_attente') return 'En cours';
  const deal = e.dossier ? Records.findBy('Deal', 'deal_id', e.dossier) : null;
  const v = deal?.lots?.[0]?.evaluation?.verdict;
  if (v && MOTS_VERDICT[v]) return MOTS_VERDICT[v];
  return e.statut === 'a_valider' ? 'À valider' : e.statut === 'faite' ? 'Fait' : e.statut === 'en_pause' ? 'En pause' : e.statut;
}

/** L'événement concret d'une exécution : « Fiche de Claire Martin · 5 rue Hoche ». */
function evenementDe(e) {
  const t = e.tache_id ? db.prepare('SELECT charge, dossier FROM haka_taches WHERE id = ?').get(e.tache_id) : null;
  const charge = { ...(json(t?.charge, {}) || {}), ...(e.resultat?.relance?.charge || {}) };
  const mail = charge.mail_id ? Records.get('MailRecu', charge.mail_id) : null;
  const deal = (e.dossier || t?.dossier) ? Records.findBy('Deal', 'deal_id', e.dossier || t?.dossier) : null;
  const titre = deal?.nom || deal?.lots?.[0]?.synthese?.titre || null;
  if (mail) return [`Fiche de ${String(mail.de || mail.de_email || '?').replace(/<.*>/, '').trim() || mail.de_email}`, titre || mail.objet].filter(Boolean).join(' · ');
  if (charge.jour) return `Tour du matin du ${charge.jour}`;
  return titre || e.declencheur || 'Exécution';
}

const execsDe = (slug, { depuis = null, jour = null, limite = 200 } = {}) => {
  const cond = ['competence = ?']; const args = [slug];
  if (jour) { cond.push('substr(cree_le, 1, 10) = ?'); args.push(jour); }
  if (depuis) { cond.push('cree_le >= ?'); args.push(depuis); }
  return db.prepare(`SELECT * FROM haka_executions WHERE ${cond.join(' AND ')} ORDER BY cree_le DESC LIMIT ?`).all(...args, limite)
    .map((e) => ({ ...e, resultat: json(e.resultat, null), entrees: json(e.entrees, {}) }));
};

/** La liste, le résumé du jour et la jauge du plafond. */
export async function vue({ jour = new Date().toISOString().slice(0, 10) } = {}) {
  migrer();
  const { PLAFOND_JOUR } = await import('./drapeaux.js');
  const { tachesDuJour } = await import('./taches.js');
  const liste = C.lister().filter(estAutomatisme).map((c) => {
    const dernieres = execsDe(c.cle, { limite: 10 });
    const auj = execsDe(c.cle, { jour });
    const derniere = dernieres[0] || null;
    const planifie = (c.declencheurs || []).includes('planifie');
    return {
      cle: c.cle, nom: c.nom, format: c.format || null,
      quand: (c.declencheurs || []).filter((d) => DECLENCHEURS_AUTO.includes(d)).map((d) => PHRASES[d]).join(' ; '),
      etat: etatDe(c, dernieres),
      pause: c.automatisme_pause ? { par: c.pause_par || null, le: c.pause_le || null } : null,
      derniere: derniere ? { le: derniere.cree_le, resultat: resultatCourt(derniere) } : null,
      aujourdhui: { executions: auj.filter((e) => e.statut !== 'ignoree').length, a_valider: auj.filter((e) => e.statut === 'a_valider').length, erreurs: auj.filter((e) => e.statut === 'echec').length, ignorees: auj.filter((e) => e.statut === 'ignoree').length },
      ignorees_en_attente: db.prepare("SELECT COUNT(*) AS n FROM haka_executions WHERE competence = ? AND statut = 'ignoree'").get(c.cle).n,
      prochaine: planifie ? prochaine(new Date(), Meta.get('haka.matin.dernier')) : null,
      planifie, lancable: planifie && !!PLANIFIES[c.cle],
      cout_jour_eur: Math.round(auj.reduce((n, e) => n + (e.cout_usd || 0), 0) * EUR_PAR_USD * 100) / 100,
    };
  });
  const resume = liste.reduce((r, a) => ({ executions: r.executions + a.aujourdhui.executions, a_valider: r.a_valider + a.aujourdhui.a_valider, erreurs: r.erreurs + a.aujourdhui.erreurs }), { executions: 0, a_valider: 0, erreurs: 0 });
  const crees = tachesDuJour('fiche_recue', jour);
  return { automatismes: liste, resume, plafond: { crees, max: PLAFOND_JOUR, part: Math.round((crees / PLAFOND_JOUR) * 100) } };
}

/** Le détail d'un automatisme pour un jour : chaque exécution, son événement, son résultat, ses liens. */
export function detail(slug, { jour = new Date().toISOString().slice(0, 10) } = {}) {
  return execsDe(slug, { jour }).map((e) => {
    const prop = Records.list('HakaProposition').find((p) => p.execution_id === e.id || (e.tache_id && p.tache_id === e.tache_id)) || null;
    const erreur = e.statut === 'echec' && e.tache_id ? db.prepare('SELECT erreur FROM haka_taches WHERE id = ?').get(e.tache_id)?.erreur : null;
    return {
      id: e.id, le: e.cree_le, evenement: evenementDe(e), resultat: resultatCourt(e), statut: e.statut,
      duree_s: e.duree_s, cout_eur: Math.round((e.cout_usd || 0) * EUR_PAR_USD * 100) / 100,
      dossier: e.dossier || null, proposition: prop ? { id: prop.id, etat: prop.etat } : null,
      erreur: erreur ? { lisible: erreurLisible(erreur), technique: String(erreur).slice(0, 600) } : null,
      relancable: e.statut === 'echec',
    };
  });
}

/** Historique des actions sur l'automatisme, gardé sur la compétence. */
function tracer(c, action, user) {
  const journal = [...(c.automatisme_journal || []), { action, par: String(user?.email || '').toLowerCase() || null, le: maintenant() }].slice(-50);
  Records.update('HakaCompetence', c.id, { automatisme_journal: journal });
}

export function pause(slug, user) {
  const c = C.lire(slug);
  if (!c || !estAutomatisme(c)) return { ok: false, statut: 404, error: 'Automatisme introuvable.' };
  Records.update('HakaCompetence', c.id, { automatisme_pause: true, pause_par: String(user?.email || '').toLowerCase() || null, pause_le: maintenant() });
  tracer(C.lire(slug), 'pause', user);
  return { ok: true };
}

export function reprendre(slug, user) {
  const c = C.lire(slug);
  if (!c) return { ok: false, statut: 404, error: 'Automatisme introuvable.' };
  Records.update('HakaCompetence', c.id, { automatisme_pause: false, pause_par: null, pause_le: null });
  tracer(C.lire(slug), 'reprise', user);
  return { ok: true, ignorees: db.prepare("SELECT COUNT(*) AS n FROM haka_executions WHERE competence = ? AND statut = 'ignoree'").get(slug).n };
}

/**
 * Un événement reçu pendant la pause : noté « ignoré (en pause) », jamais perdu.
 * `relance` = de quoi le relancer plus tard : { type, charge, cle, pour }.
 */
export function ignorer(slug, { declencheur, relance, dossier = null }) {
  const id = randomUUID();
  db.prepare('INSERT INTO haka_executions (id, tache_id, competence, version, declencheur, lance_par, dossier, entrees, statut, resultat, cree_le) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, slug, C.publiee(slug)?.version ?? null, declencheur, 'automatisme', dossier, JSON.stringify(relance?.charge || {}), 'ignoree', JSON.stringify({ relance }), maintenant());
  return id;
}

/** « Traiter les ignorés » : un par un, avec le plafond (la compétence le garde elle-même). */
export async function traiterIgnores(slug, user) {
  const c = C.lire(slug);
  if (!c) return { ok: false, statut: 404, error: 'Automatisme introuvable.' };
  if (c.automatisme_pause) return { ok: false, statut: 400, error: 'Reprenez d\'abord l\'automatisme.' };
  const taches = await import('./taches.js');
  const ignorees = db.prepare("SELECT * FROM haka_executions WHERE competence = ? AND statut = 'ignoree' ORDER BY cree_le").all(slug);
  let lancees = 0;
  for (const e of ignorees) {
    const r = json(e.resultat, {})?.relance;
    if (!r?.type) continue;
    const t = taches.enfiler(r.type, r.charge || {}, { cle: r.cle || null, pour: r.pour || null });
    if (r.charge?.mail_id) { try { Records.update('MailRecu', r.charge.mail_id, { haka_tache_id: t.id, haka_ignore: null }); } catch { /* le mail a disparu */ } }
    db.prepare("UPDATE haka_executions SET statut = 'traitee', resultat = ? WHERE id = ?").run(JSON.stringify({ relance: r, tache_id: t.id }), e.id);
    lancees += 1;
  }
  tracer(c, `ignorés traités (${lancees})`, user);
  return { ok: true, lancees };
}

/** « Lancer maintenant » : un automatisme planifié, hors horaire. */
export async function lancer(slug, user) {
  const c = C.lire(slug);
  const type = PLANIFIES[slug];
  if (!c || !type) return { ok: false, statut: 400, error: 'Cet automatisme ne se lance pas à la main.' };
  const taches = await import('./taches.js');
  const jour = jourParis();
  const t = taches.enfiler(type, { jour, manuel: true }, { cle: `${type}:manuel:${Date.now()}` });
  tracer(c, 'lancé à la main', user);
  return { ok: true, tache_id: t.id };
}

/** « Relancer » une exécution en erreur : reprend à l'étape qui a échoué, jamais une étape vers l'extérieur. */
export async function relancer(executionId, user) {
  const e = db.prepare('SELECT * FROM haka_executions WHERE id = ?').get(executionId);
  if (!e || !e.tache_id) return { ok: false, statut: 404, error: 'Exécution introuvable.' };
  const taches = await import('./taches.js');
  const r = taches.relancer(e.tache_id);
  if (r.ok) { const c = C.lire(e.competence); if (c) tracer(c, 'exécution relancée', user); }
  return r;
}

/** Les alertes de Jules (la cloche, jamais un mail) : un automatisme en erreur, le plafond atteint, un planifié qui n'a pas tourné. */
export async function alertes({ maintenantD = new Date() } = {}) {
  const v = await vue();
  const out = [];
  for (const a of v.automatismes) {
    if (a.etat === 'en_erreur') out.push({ cle: `erreur:${a.cle}`, phrase: `${a.nom} est en erreur`, lieu: 'Automatismes', lien: '/Automatismes', le: a.derniere?.le || null });
  }
  if (v.plafond.crees >= v.plafond.max) out.push({ cle: 'plafond', phrase: `Plafond atteint : ${v.plafond.crees} / ${v.plafond.max} dossiers aujourd'hui`, lieu: 'Automatismes', lien: '/Automatismes', le: null });
  const js = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(maintenantD);
  const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(maintenantD).replace(/\D/g, '')) % 24;
  const minutes = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', minute: 'numeric' }).format(maintenantD).replace(/\D/g, ''));
  const enRetard = !['Sat', 'Sun'].includes(js) && (heure > 8 || (heure === 8 && minutes >= 30));
  for (const a of v.automatismes.filter((x) => x.planifie && x.etat !== 'en_pause')) {
    const tourne = Meta.get('haka.matin.dernier') === jourParis(maintenantD);
    if (enRetard && !tourne) out.push({ cle: `retard:${a.cle}`, phrase: `${a.nom} n'a pas tourné à 8 h`, lieu: 'Automatismes', lien: '/Automatismes', le: null });
  }
  return out;
}

/**
 * Migration, une fois : les neuf fiches importées portaient « automatique ». Les relances du
 * matin tournent bien seules (planifié) ; la data room pas encore (palier 4) : elle le perd.
 */
export function migrer() {
  if (Meta.get('haka.automatismes.migres.v1')) return;
  const remplacer = { 'mails-agents': 'planifie', 'data-room': null };
  for (const [cle, par] of Object.entries(remplacer)) {
    const c = C.lire(cle);
    if (!c) continue;
    const d = (c.declencheurs || []).filter((x) => x !== 'automatique');
    if (par && !d.includes(par)) d.push(par);
    Records.update('HakaCompetence', c.id, { declencheurs: d });
  }
  Meta.set('haka.automatismes.migres.v1', maintenant());
}
