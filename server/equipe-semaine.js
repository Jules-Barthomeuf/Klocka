// L'Agenda de l'équipe (16 oct. 2026, Jules) : qui est là, et les briefings
// entre ceux qui partent, ceux qui restent et ceux qui reviennent.
//
// Jules dit qui est là (un jour à la fois, avec un motif : école, congés,
// autre) ; les agendas Google s'y ajoutent quand ils sont lisibles. Un clic
// sur un jour ouvre un briefing guidé par quelques questions : pour la
// personne qui revient ce jour-là (Maxime clique sur le lundi 19 : son
// briefing à Nora, de retour de congés), ou, avant de partir, pour ceux qui
// restent (Maxime, la veille de sa semaine d'école : son brief à Nora). La
// question sur la réunion se remplit d'elle-même avec les décisions et les
// engagements des réunions enregistrées. Le destinataire reçoit une
// notification le jour dit et lit tout dans son Agenda : les briefings, et
// le résumé court que Jules relit et valide (ce que chacun a fait, réunions
// et décisions, nouveautés de la plateforme). Aucun mail.
//
// Décisions de Jules (16 oct. 2026) : rempli par tous, relu par lui, court,
// sur la plateforme et pas par mail ; « Semaine » devient « Agenda ».

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Meta } from './db.js';
import { ANALYSTES } from './fil-dossier.js';

const ABSENCE = 'AbsenceEquipe';
const BRIEFING = 'BriefingEquipe';
const RETOUR = 'RetourEquipe';
export const MOTIFS = { ecole: 'École', conges: 'Congés', autre: 'Absent' };
const bas = (e) => String(e || '').trim().toLowerCase();
const ici = path.dirname(fileURLToPath(import.meta.url));

export const EQUIPE = ANALYSTES;
export const nomDe = (email) => EQUIPE.find((p) => p.email === bas(email))?.nom || String(email || '').split('@')[0];

// --- Les jours ------------------------------------------------------------------------------

/** Pure : le jour à Paris, AAAA-MM-JJ. */
export const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(d));
/** Pure : `n` jours après `jour`. */
export const plusJours = (jour, n) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Pure : un jour de semaine (lundi à vendredi). */
export const estOuvre = (jour) => { const j = new Date(`${jour}T12:00:00Z`).getUTCDay(); return j >= 1 && j <= 5; };
const ouvreSuivant = (jour, sens = 1) => { let j = plusJours(jour, sens); while (!estOuvre(j)) j = plusJours(j, sens); return j; };
/** Pure : le lundi de la semaine de `jour`. */
export const lundiDe = (jour) => { const j = new Date(`${jour}T12:00:00Z`).getUTCDay(); return plusJours(jour, -((j + 6) % 7)); };
const debutParis = (jour) => new Date(`${jour}T00:00:00+02:00`).toISOString();

// --- Les absences ---------------------------------------------------------------------------

/** Les absences déclarées par Jules, un jour par ligne. */
export const absencesDeclarees = () => Records.list(ABSENCE);

/** Jules pose ou retire un jour d'absence. `motif` null retire. */
export function poserAbsence({ email, jour, motif = 'ecole', note = null }, par = null) {
  const e = bas(email);
  if (!EQUIPE.some((p) => p.email === e)) return { ok: false, error: 'Personne inconnue.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return { ok: false, error: 'Jour invalide.' };
  const deja = Records.list(ABSENCE).filter((a) => a.email === e && a.jour === jour);
  for (const a of deja) Records.delete(ABSENCE, a.id);
  if (!motif) return { ok: true, retire: deja.length > 0 };
  if (!MOTIFS[motif]) return { ok: false, error: 'Motif inconnu.' };
  return { ok: true, absence: Records.create(ABSENCE, { email: e, jour, motif, note: note ? String(note).slice(0, 200) : null, par: bas(par) || null, le: new Date().toISOString() }) };
}

/** Pure : un événement d'agenda Google qui dit une absence (journée entière, ou « Absent du bureau »). */
export function estAbsenceAgenda(ev) {
  if (!ev || ev.status === 'cancelled') return false;
  return ev.eventType === 'outOfOffice' || (!!ev.start?.date && /cong|absen|vacanc|\bo+o+\b|\boff\b|\brtt\b|repos|maladie|école|ecole|cours|formation|partiel/i.test(String(ev.summary || '')));
}

/** Pure : les jours couverts par des événements d'absence, avec leur motif. */
export function joursDAgenda(evs) {
  const jours = new Map();
  for (const ev of evs || []) {
    if (!estAbsenceAgenda(ev)) continue;
    const debut = jourParis(ev.start?.dateTime || `${ev.start?.date}T12:00:00Z`);
    // La fin d'un événement d'une journée entière est exclue (le lendemain).
    const fin = ev.start?.date ? plusJours(String(ev.end?.date || ev.start.date), -1) : jourParis(ev.end?.dateTime || ev.start?.dateTime);
    const motif = /école|ecole|cours|formation|partiel/i.test(String(ev.summary || '')) ? 'ecole' : /cong|vacanc|rtt|repos/i.test(String(ev.summary || '')) ? 'conges' : 'autre';
    for (let j = debut; j <= fin; j = plusJours(j, 1)) jours.set(j, { motif, titre: String(ev.summary || '') });
  }
  return jours;
}

/**
 * Les agendas Google de l'équipe, lus avec un agenda connecté (celui de la
 * personne, sinon celui de Jules : même domaine). Rend l'état, pour le dire
 * à Jules quand Google refuse (API Calendar non activée, agenda non partagé).
 */
export async function lireAgendas(du, au, { lire = null } = {}) {
  const cle = `equipe-agendas:${du}:${au}`;
  try { const c = JSON.parse(Meta.get(cle) || 'null'); if (c && Date.now() - c.lu < 30 * 60000) return { ...c, jours: new Map(c.jours.map(([e, l]) => [e, new Map(l)])) }; } catch { /* relire */ }
  const comptes = Records.list('AgendaAnalyste');
  const jours = new Map();
  let etat = comptes.length ? 'ok' : 'non_connecte';
  let detail = null;
  if (comptes.length) {
    const { accessTokenFor } = await import('./google-oauth.js');
    for (const p of EQUIPE) {
      const compte = comptes.find((c) => bas(c.owner_email) === p.email) || comptes.find((c) => bas(c.owner_email) === 'jules.b@klocka.immo') || comptes[0];
      try {
        const jeton = lire ? null : await accessTokenFor(compte, 'AgendaAnalyste');
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.email)}/events?singleEvents=true&timeMin=${encodeURIComponent(debutParis(du))}&timeMax=${encodeURIComponent(debutParis(plusJours(au, 1)))}&maxResults=250`;
        const r = lire ? await lire(url, p.email) : await fetch(url, { headers: { Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(10000) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const m = String(j?.error?.message || r.status);
          if (/has not been used|is disabled/i.test(m)) { etat = 'api_desactivee'; detail = 'Activez l\'API Google Calendar dans la console Google Cloud du projet Klocka.'; break; }
          etat = 'partiel'; detail = `${p.nom} : ${m.slice(0, 120)}`;
          continue;
        }
        jours.set(p.email, joursDAgenda(j.items || []));
      } catch (e) { etat = 'partiel'; detail = `${p.nom} : ${String(e?.message || e).slice(0, 120)}`; }
    }
  }
  const garde = { lu: Date.now(), etat, detail, jours: [...jours].map(([e, m]) => [e, [...m]]) };
  try { Meta.set(cle, JSON.stringify(garde)); } catch { /* cache facultatif */ }
  return { etat, detail, jours };
}

/** Pure : le calendrier d'une personne, jour par jour : déclaré par Jules d'abord, puis l'agenda. */
export function statutDuJour(email, jour, { declarees = [], agenda = new Map() } = {}) {
  if (!estOuvre(jour)) return { present: false, weekend: true };
  const d = declarees.find((a) => a.email === bas(email) && a.jour === jour);
  if (d) return { present: false, motif: d.motif, source: 'jules', note: d.note || null };
  const g = agenda.get(bas(email))?.get(jour);
  if (g) return { present: false, motif: g.motif, source: 'agenda', note: g.titre || null };
  return { present: true };
}

const absentLe = (email, jour, ctx) => !statutDuJour(email, jour, ctx).present && estOuvre(jour);

/** Pure : la période d'absence (jours ouvrés contigus) qui contient `jour`. */
export function periodeAutour(email, jour, ctx) {
  if (!absentLe(email, jour, ctx)) return null;
  let du = jour; let au = jour;
  for (let j = ouvreSuivant(jour, -1); absentLe(email, j, ctx); j = ouvreSuivant(j, -1)) du = j;
  for (let j = ouvreSuivant(jour, 1); absentLe(email, j, ctx); j = ouvreSuivant(j, 1)) au = j;
  return { du, au, motif: statutDuJour(email, du, ctx).motif };
}

/** Pure : `jour` est-il le premier jour de retour ? Rend la période d'absence qui vient de finir. */
export function retourLe(email, jour, ctx) {
  if (!estOuvre(jour) || absentLe(email, jour, ctx)) return null;
  return periodeAutour(email, ouvreSuivant(jour, -1), ctx);
}

/** Pure : `jour` est-il la veille (ouvrée) d'une absence ? Rend la période qui commence. */
export function departApres(email, jour, ctx) {
  if (!estOuvre(jour) || absentLe(email, jour, ctx)) return null;
  return periodeAutour(email, ouvreSuivant(jour, 1), ctx);
}

/**
 * Le premier jour ouvré, à partir de `jour`, où la personne est là (22 oct. 2026, Jules : « la relance tombe pendant
 * que Maxime n'est pas là : mets-la le premier jour de son retour »). Lit les absences posées par Jules et, s'il répond
 * en moins de `attente` ms, l'agenda Google ; sinon les absences posées seules : l'analyse d'un appel n'attend pas.
 * Rend `{ jour, absence }` : `absence` (du, au, motif, libelle) quand il a fallu décaler, sinon null.
 */
export async function premierJourPresent(email, jour, { ctx = null, attente = 4000 } = {}) {
  let c = ctx;
  if (!c) {
    const agenda = await Promise.race([
      lireAgendas(jourParis(), plusJours(jour, 60)).catch(() => null),
      new Promise((ok) => { setTimeout(() => ok(null), attente).unref?.(); }),
    ]);
    c = { declarees: absencesDeclarees(), agenda: agenda?.jours || new Map() };
  }
  const debut = estOuvre(jour) ? jour : ouvreSuivant(jour, 1);
  if (!absentLe(email, debut, c)) return { jour: debut, absence: null };
  let k = debut;
  let au = debut;
  for (let n = 0; absentLe(email, k, c) && n < 120; n += 1) { au = k; k = ouvreSuivant(k, 1); }
  const motif = statutDuJour(email, debut, c).motif;
  return { jour: k, absence: { du: periodeAutour(email, debut, c)?.du || debut, au, motif, libelle: MOTIFS[motif] || 'Absent' } };
}

async function contexte(du, au) {
  const agenda = await lireAgendas(du, au).catch(() => ({ etat: 'partiel', jours: new Map() }));
  return { declarees: absencesDeclarees(), agenda: agenda.jours, etatAgenda: agenda.etat, detailAgenda: agenda.detail || null };
}

/** Les présences de l'équipe sur `semaines` semaines à partir de celle de `jour`. */
export async function presences(jour = jourParis(), { semaines = 6 } = {}) {
  const lundi = lundiDe(jour);
  const fin = plusJours(lundi, semaines * 7 - 1);
  const ctx = await contexte(plusJours(lundi, -14), plusJours(fin, 14));
  const jours = [];
  for (let j = lundi; j <= fin; j = plusJours(j, 1)) if (estOuvre(j)) jours.push(j);
  return {
    aujourdhui: jour, jours, agenda: { etat: ctx.etatAgenda, detail: ctx.detailAgenda },
    equipe: EQUIPE.map((p) => ({ ...p, jours: Object.fromEntries(jours.map((j) => [j, statutDuJour(p.email, j, ctx)])) })),
  };
}

/** Qui est là le jour `jour`, qui ne l'est pas. */
export function quiEstLa(jour, ctx) {
  return { la: EQUIPE.filter((p) => !absentLe(p.email, jour, ctx)).map((p) => p.nom), absents: EQUIPE.filter((p) => absentLe(p.email, jour, ctx)).map((p) => ({ nom: p.nom, ...periodeAutour(p.email, jour, ctx) })) };
}


// --- Les nouveautés de la plateforme -------------------------------------------------------

/** Les commits de la période : `server/nouveautes.json` (écrit au build), sinon git en local. */
export function nouveautes(du, au) {
  let liste = [];
  try { liste = JSON.parse(fs.readFileSync(path.join(ici, 'nouveautes.json'), 'utf8')); } catch { liste = []; }
  if (!liste.length) {
    try {
      const sortie = execFileSync('git', ['log', '--since=120 days ago', '--format=%cI%x09%s', '--no-merges'], { cwd: path.join(ici, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
      liste = sortie.split('\n').filter(Boolean).map((l) => { const [le, ...s] = l.split('\t'); return { le, sujet: s.join('\t') }; });
    } catch { liste = []; }
  }
  return liste.filter((c) => { const j = jourParis(c.le); return j >= du && j <= au; }).map((c) => ({ le: c.le, sujet: String(c.sujet).slice(0, 500) }));
}

const court = (s, n = 300) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const dansPeriode = (le, du, au) => { if (!le) return false; const j = jourParis(le); return j >= du && j <= au; };
const dateFr = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Pure : le nombre de jours ouvrés d'une période. */
export const joursOuvres = (du, au) => { let n = 0; for (let j = du; j <= au; j = plusJours(j, 1)) if (estOuvre(j)) n += 1; return n; };
// Un jour d'absence ne demande ni briefing ni résumé : à partir de deux jours ouvrés.
export const MIN_JOURS = 2;
const assezLongue = (p) => !!p && joursOuvres(p.du, p.au) >= MIN_JOURS;

/** Les réunions de la période : les comptes rendus entrés dans l'Intelligence, et leurs faits. */
export function reunionsDe(du, au) {
  const faits = Records.list('CerveauFait').filter((f) => f.statut !== 'rejete');
  return Records.list('CerveauSource').filter((s) => s.type === 'compte_rendu' && dansPeriode(s.date, du, au)).map((s) => ({
    titre: String(s.titre || 'Réunion').replace(/^Réunion : /, ''), date: jourParis(s.date),
    faits: faits.filter((f) => f.source_id === s.id && ['decision', 'engagement', 'information'].includes(f.type)).map((f) => ({ type: f.type, resume: f.resume, personne: f.personne || null, echeance: f.echeance || null })).slice(0, 40),
  }));
}

/** Pure : la réponse pré-remplie de la question sur la réunion. */
export function texteReunions(reunions) {
  if (!reunions.length) return '';
  const ordre = { decision: 0, engagement: 1, information: 2 };
  return reunions.map((r) => {
    const lignes = [...r.faits].sort((x, y) => ordre[x.type] - ordre[y.type]).slice(0, 12)
      .map((f) => `- ${f.type === 'decision' ? 'Décidé' : f.type === 'engagement' ? 'Engagement' : 'Info'} : ${f.resume}${f.echeance ? ` (pour le ${f.echeance})` : ''}`);
    return `${r.titre} (${dateFr(r.date)}) :\n${lignes.join('\n') || '- rien de retenu'}`;
  }).join('\n\n');
}

// --- Les dossiers d'une personne -----------------------------------------------------------

const FERMES = new Set(['abandonne', 'refuse', 'archive', 'archived', 'non', 'perdu']);
const dernierSuivi = (d) => (d.suivi || []).map((x) => x.le).sort().pop() || d.cree_le || d.created_date || null;

/** Ses dossiers ouverts : créés par lui, dont il est responsable, ou qu'il a touchés depuis deux mois. */
export function dossiersDe(email, { maintenant = new Date() } = {}) {
  const e = bas(email);
  const depuis = new Date(maintenant.getTime() - 60 * 86400000).toISOString();
  return Records.list('Deal')
    .filter((d) => !d.supprime && !d.archived && !d.test && !FERMES.has(String(d.statut || '')))
    .filter((d) => bas(d.cree_par) === e || (d.responsables || []).map(bas).includes(e) || (d.suivi || []).some((x) => bas(x.par) === e && String(x.le || '') >= depuis))
    .map((d) => ({ deal_id: d.deal_id, nom: d.nom || 'Dossier', statut: d.statut || null, derniere_activite: dernierSuivi(d) }))
    .sort((x, y) => String(y.derniere_activite || '').localeCompare(String(x.derniere_activite || '')))
    .slice(0, 25);
}

// --- Les briefings --------------------------------------------------------------------------

/** Les questions d'un briefing. `retour` : pour qui revient ; `depart` : pour ceux qui restent. */
export const QUESTIONS = {
  retour: [
    { cle: 'avance', question: 'Qu\'est-ce qui a avancé pendant son absence ?', aide: 'Dossiers, appels, rendez-vous, clients.' },
    { cle: 'reunion', question: 'Qu\'a-t-on décidé en réunion ?', aide: 'Rempli avec les réunions enregistrées : corrigez ou complétez.' },
    { cle: 'premier', question: 'Que doit-on faire en premier en rentrant ?', aide: 'Ce qui presse, qui attend une réponse.' },
    { cle: 'savoir', question: 'Autre chose à savoir ?', aide: 'Facultatif.' },
  ],
  depart: [
    { cle: 'dossiers', question: 'Où en sont tes dossiers ?', aide: 'Une ligne par dossier : où il en est, ce qu\'on attend.' },
    { cle: 'surveiller', question: 'Que faut-il surveiller ou relancer pendant ton absence ?', aide: 'Échéances, rappels promis, pièces attendues.' },
    { cle: 'reprend', question: 'Qui reprend quoi ?', aide: 'Facultatif.' },
    { cle: 'reunion', question: 'Ce qu\'on a décidé en réunion et qui compte pendant ton absence', aide: 'Rempli avec les réunions enregistrées : corrigez ou complétez.' },
  ],
};

/** Pure : la période d'absence que vise un briefing posé le `jour` par `moi`. */
function cibleDuJour(moi, jour, ctx) {
  // Quelqu'un revient ce jour-là : le briefing est pour lui.
  const reviennent = EQUIPE.filter((p) => p.email !== moi && assezLongue(retourLe(p.email, jour, ctx)));
  if (reviennent.length) return { genre: 'retour', pour: reviennent.map((p) => p.email), periode: retourLe(reviennent[0].email, jour, ctx), jour };
  // Je pars : ce jour est la veille de mon absence, ou son premier jour.
  const depart = departApres(moi, jour, ctx) || (absentLe(moi, jour, ctx) && !absentLe(moi, ouvreSuivant(jour, -1), ctx) ? periodeAutour(moi, jour, ctx) : null);
  if (assezLongue(depart)) {
    const restent = EQUIPE.filter((p) => p.email !== moi && !absentLe(p.email, depart.du, ctx)).map((p) => p.email);
    return { genre: 'depart', pour: restent, periode: depart, jour: depart.du };
  }
  return { genre: 'retour', pour: [], periode: null, jour };
}

export const briefingDe = (de, jour) => Records.list(BRIEFING).find((b) => b.de === bas(de) && b.jour === jour) || null;

/**
 * Ce qu'il faut pour ouvrir le briefing du `jour` : pour qui (pré-coché), les
 * questions, les réponses pré-remplies (la réunion, ses dossiers), ou le
 * briefing déjà écrit.
 */
export async function preparerBriefing(user, jour, { ctx = null } = {}) {
  const moi = bas(user?.email);
  if (!EQUIPE.some((p) => p.email === moi)) return { ok: false, error: 'Réservé à l\'équipe.' };
  const cx = ctx || await contexte(plusJours(jour, -40), plusJours(jour, 40));
  const cible = cibleDuJour(moi, jour, cx);
  const deja = briefingDe(moi, cible.jour);
  const questions = QUESTIONS[deja?.genre || cible.genre];
  const p = cible.periode;
  const reunions = p ? reunionsDe(cible.genre === 'retour' ? p.du : plusJours(p.du, -7), cible.genre === 'retour' ? p.au : plusJours(p.du, -1)) : reunionsDe(plusJours(jour, -7), jour);
  const prerempli = {
    reunion: texteReunions(reunions),
    dossiers: cible.genre === 'depart' ? dossiersDe(moi).map((d) => `- ${d.nom} : `).join('\n') : '',
  };
  return {
    ok: true, jour: cible.jour, genre: deja?.genre || cible.genre, periode: p, pour: deja?.pour || cible.pour,
    equipe: EQUIPE.filter((x) => x.email !== moi).map((x) => ({ email: x.email, nom: x.nom })),
    questions: questions.map((q) => ({ ...q, reponse: deja?.reponses?.find((r) => r.cle === q.cle)?.reponse ?? prerempli[q.cle] ?? '' })),
    deja: !!deja, ecrit_le: deja?.ecrit_le || null,
  };
}

/** Le briefing s'enregistre ; il est lu le `jour` (notification ce jour-là, tout de suite si c'est aujourd'hui ou passé). */
export async function enregistrerBriefing(user, { jour, genre = 'retour', pour = [], reponses = [], du = null, au = null }, { aujourdhui = jourParis() } = {}) {
  const de = bas(user?.email);
  if (!EQUIPE.some((p) => p.email === de)) return { ok: false, error: 'Réservé à l\'équipe.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return { ok: false, error: 'Jour invalide.' };
  const dest = [...new Set([].concat(pour).map(bas))].filter((e) => e !== de && EQUIPE.some((p) => p.email === e));
  if (!dest.length) return { ok: false, error: 'Choisissez au moins une personne.' };
  const questions = QUESTIONS[genre] || QUESTIONS.retour;
  const propres = questions.map((q) => ({ cle: q.cle, question: q.question, reponse: String(reponses.find((r) => r.cle === q.cle)?.reponse || '').trim().slice(0, 4000) })).filter((r) => r.reponse);
  if (!propres.length) return { ok: false, error: 'Répondez au moins à une question.' };
  const deja = briefingDe(de, jour);
  const champs = { de, pour: dest, jour, genre, du, au, reponses: propres, ecrit_le: new Date().toISOString(), notifie: deja?.notifie || [] };
  const b = deja ? Records.update(BRIEFING, deja.id, champs) : Records.create(BRIEFING, champs);
  if (jour <= aujourdhui) await notifierBriefing(b);
  return { ok: true, briefing: Records.get(BRIEFING, b.id), lu_le: jour };
}

async function notifierBriefing(b) {
  const { notifier } = await import('./notifications.js');
  const deja = new Set(b.notifie || []);
  for (const q of (b.pour || []).filter((e) => !deja.has(e))) {
    notifier({ pour: q, titre: `Briefing de ${nomDe(b.de)}`, texte: b.genre === 'depart' ? `${nomDe(b.de)} part : ses dossiers, ce qu'il faut surveiller.` : `Ce qui s'est passé pendant ton absence, ce qui presse.`, lien: '/Agenda', cle: `agenda:briefing:${b.id}:${q}` });
    deja.add(q);
  }
  Records.update(BRIEFING, b.id, { notifie: [...deja] });
}

/** Les briefings que `email` peut lire : reçus, leur jour venu, des trois dernières semaines. */
export const briefingsPour = (email, aujourdhui = jourParis()) => Records.list(BRIEFING)
  .filter((b) => (b.pour || []).includes(bas(email)) && b.jour <= aujourdhui && b.jour >= plusJours(aujourdhui, -21))
  .sort((x, y) => String(y.jour).localeCompare(String(x.jour)) || String(y.ecrit_le).localeCompare(String(x.ecrit_le)));

// --- Le résumé : brouillon, relecture de Jules, publication ---------------------------------

/**
 * La matière du résumé : les briefings écrits pour la personne, l'activité de
 * chacun (appels, dossiers, appels clients, réunions enregistrées), les
 * réunions et décisions de l'Intelligence, les nouveautés.
 */
export function collecte({ du, au, pour }) {
  const absent = bas(pour);
  const presents = EQUIPE.filter((p) => p.email !== absent);
  const activite = {};
  for (const p of presents) activite[p.nom] = { appels_agents: 0, conversations: [], dossiers: new Set(), appels_clients: 0, reunions: 0 };
  const qui = (email) => presents.find((p) => p.email === bas(email))?.nom || null;
  for (const a of Records.list('AppelAgent').filter((x) => !x.essai && !x.faux && x.etat !== 'remplace' && dansPeriode(x.le, du, au))) {
    const n = qui(a.par); if (!n) continue;
    activite[n].appels_agents += 1;
    if (!['repondeur', 'pas_de_reponse'].includes(a.issue) && a.resume) activite[n].conversations.push(court(a.resume, 160));
  }
  for (const d of Records.list('Deal').filter((x) => !x.supprime && !x.test)) {
    for (const s of (d.suivi || []).filter((x) => dansPeriode(x.le, du, au))) { const n = qui(s.par); if (n) activite[n].dossiers.add(d.nom || 'Dossier'); }
  }
  for (const a of Records.list('AppelClient').filter((x) => !x.annule_le && !x.essai && dansPeriode(x.le, du, au))) { const n = qui(a.par); if (n) activite[n].appels_clients += 1; }
  for (const r of Records.list('Reunion').filter((x) => x.etat === 'envoyee' && dansPeriode(x.debut, du, au))) { const n = qui(r.par); if (n) activite[n].reunions += 1; }
  const jourRetour = ouvreSuivant(au, 1);
  const briefings = Records.list(BRIEFING).filter((b) => (b.pour || []).includes(absent) && b.genre === 'retour' && b.jour === jourRetour);
  const parPersonne = presents.map((p) => {
    const a = activite[p.nom];
    const b = briefings.find((x) => x.de === p.email);
    return { nom: p.nom, son_briefing: b ? b.reponses.map((r) => `${r.question} ${r.reponse}`).join('\n') : null, appels_agents: a.appels_agents, conversations: a.conversations.slice(0, 6), dossiers: [...a.dossiers].slice(0, 10), appels_clients: a.appels_clients, reunions_enregistrees: a.reunions };
  });
  const comptesRendus = new Set(Records.list('CerveauSource').filter((s) => s.type === 'compte_rendu').map((s) => s.id));
  const decisions = Records.list('CerveauFait').filter((f) => f.type === 'decision' && f.statut === 'valide' && !comptesRendus.has(f.source_id) && dansPeriode(f.date || f.cree_le, du, au)).map((f) => f.resume).slice(0, 20);
  return { du, au, pour: absent, nom: nomDe(absent), par_personne: parPersonne, reunions: reunionsDe(du, au), decisions, nouveautes: nouveautes(du, au) };
}

const SCHEMA = {
  type: 'object',
  properties: {
    objet: { type: 'string', description: 'un titre court (« Ta semaine du 12 au 16 octobre »)' },
    texte: { type: 'string', description: 'le résumé, en texte simple, avec les trois titres de section chacun sur sa ligne' },
  },
  required: ['objet', 'texte'],
};
export const SECTIONS = ['Ce que chacun a fait', 'Réunions et décisions', 'Nouveautés de la plateforme'];

/** Pure : la consigne du brouillon. */
export function consigne(c) {
  return `Tu écris pour ${c.nom}, de l'équipe Klocka (achat et vente de murs commerciaux), qui revient après une absence du ${dateFr(c.du)} au ${dateFr(c.au)}. Un résumé COURT de ce qui s'est passé (250 mots au plus), qu'elle lit en deux minutes le matin de son retour. Tutoie ${c.nom}. N'invente rien : tout vient des données ci-dessous. Français simple, phrases courtes, sans tiret long, sans gras, sans markdown.

Trois sections, dans cet ordre, chaque titre seul sur sa ligne, puis des lignes qui commencent par « - » :
${SECTIONS.join('\n')}
- Ce que chacun a fait : une ligne ou deux par personne, d'abord ce qu'elle a écrit dans son briefing, puis son activité si elle apporte quelque chose (appels, dossiers, appels clients). Une personne sans briefing ni activité : « rien de noté ».
- Réunions et décisions : les décisions et les engagements qui la concernent ou qui changent le travail de l'équipe ; si aucune réunion n'a été enregistrée, dis-le en une ligne.
- Nouveautés de la plateforme : trois à cinq lignes, ce qui change pour son travail, en mots simples, sans détail technique.
Commence par une phrase d'accueil d'une ligne. Pas de formule de fin.

DONNÉES (JSON) :
${JSON.stringify({ par_personne: c.par_personne, reunions: c.reunions, autres_decisions: c.decisions, nouveautes: c.nouveautes })}`;
}

export const retourDe = (email, du) => Records.list(RETOUR).find((r) => r.pour === bas(email) && r.du === du) || null;

/** Le brouillon (ou sa réécriture, avec les derniers briefings) : jamais sur un résumé déjà publié. */
export async function ecrireBrouillon(email, { du, au }, { invoke = null } = {}) {
  const deja = retourDe(email, du);
  if (deja?.etat === 'publie') return { ok: false, error: 'Déjà publié.' };
  const c = collecte({ du, au, pour: email });
  let resultat; let cout = 0;
  if (invoke) resultat = await invoke(consigne(c));
  else {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    const m = await mesurer({ operation: 'semaine equipe', sur: `retour:${email}:${du}` }, () => invokeLLM({ prompt: consigne(c), response_json_schema: SCHEMA, max_tokens: 2500 }));
    resultat = m.resultat; cout = m.consommation?.cout || 0;
  }
  const champs = {
    pour: bas(email), du, au, etat: 'brouillon', objet: court(resultat?.objet || `Ta semaine du ${dateFr(du)} au ${dateFr(au)}`, 160), texte: String(resultat?.texte || '').trim().slice(0, 8000),
    briefings: c.par_personne.filter((p) => p.son_briefing).map((p) => p.nom), genere_le: new Date().toISOString(), cout_usd: (deja?.cout_usd || 0) + cout, valide_par: null, valide_le: null,
  };
  return { ok: true, retour: deja ? Records.update(RETOUR, deja.id, champs) : Records.create(RETOUR, champs) };
}

/** Jules corrige le titre ou le texte. */
export function corriger(id, { objet, texte }) {
  const r = Records.get(RETOUR, id);
  if (!r) return { ok: false, error: 'Résumé introuvable.' };
  if (r.etat === 'publie') return { ok: false, error: 'Déjà publié.' };
  return { ok: true, retour: Records.update(RETOUR, id, { ...(objet !== undefined ? { objet: court(objet, 160) } : {}), ...(texte !== undefined ? { texte: String(texte).slice(0, 8000) } : {}), corrige_le: new Date().toISOString() }) };
}

/** Jules valide : le résumé paraît dans l'Agenda de la personne le matin du retour (tout de suite si le retour est là). */
export async function valider(id, user, { aujourdhui = jourParis() } = {}) {
  const r = Records.get(RETOUR, id);
  if (!r) return { ok: false, error: 'Résumé introuvable.' };
  if (r.etat === 'publie') return { ok: false, error: 'Déjà publié.' };
  if (!String(r.texte || '').trim()) return { ok: false, error: 'Le résumé est vide.' };
  Records.update(RETOUR, id, { etat: 'valide', valide_par: bas(user?.email), valide_le: new Date().toISOString() });
  const jourRetour = ouvreSuivant(r.au, 1);
  if (aujourdhui >= jourRetour) return publier(id);
  return { ok: true, retour: Records.get(RETOUR, id), parait_le: jourRetour };
}

/** La publication : dans l'Agenda de la personne, avec une notification. Pas de mail (Jules, 16 oct. 2026). */
export async function publier(id) {
  const r = Records.get(RETOUR, id);
  if (!r || r.etat !== 'valide') return { ok: false, error: 'Pas validé.' };
  Records.update(RETOUR, id, { etat: 'publie', publie_le: new Date().toISOString() });
  const { notifier } = await import('./notifications.js');
  notifier({ pour: r.pour, titre: `Bon retour, ${nomDe(r.pour)} : ta semaine en bref`, texte: r.objet, lien: '/Agenda', cle: `agenda:retour:${r.pour}:${r.du}` });
  return { ok: true, retour: Records.get(RETOUR, id) };
}

// --- Ce que la page montre ------------------------------------------------------------------

/** Les absences en cours ou qui viennent de finir, dont le résumé n'est pas publié. */
function absencesASuivre(aujourdhui, ctx) {
  const vues = [];
  for (const p of EQUIPE) {
    const periode = periodeAutour(p.email, aujourdhui, ctx) || retourLe(p.email, aujourdhui, ctx);
    if (!assezLongue(periode)) continue;
    const r = retourDe(p.email, periode.du);
    if (r?.etat === 'publie') continue;
    vues.push({ ...p, ...periode, jour_retour: ouvreSuivant(periode.au, 1), retour: r });
  }
  return vues;
}

/** Ce que l'Agenda montre à `user` aujourd'hui. */
export async function monAgenda(user, { aujourdhui = jourParis(), estJules = false } = {}) {
  const e = bas(user?.email);
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const moi = EQUIPE.find((p) => p.email === e) || null;
  const retour = moi ? Records.list(RETOUR).filter((r) => r.pour === e && r.etat === 'publie' && r.au >= plusJours(aujourdhui, -14)).sort((x, y) => String(y.publie_le).localeCompare(String(x.publie_le)))[0] || null : null;
  const suivies = absencesASuivre(aujourdhui, ctx).filter((a) => a.email !== e);
  // Les briefings à faire : pour qui revient (pendant son absence), et le mien si je pars bientôt.
  const aFaire = [];
  if (moi) {
    for (const a of suivies) {
      if (a.jour_retour <= aujourdhui && a.jour_retour !== aujourdhui) continue;
      aFaire.push({ genre: 'retour', jour: a.jour_retour, pour: [a.email], noms: [a.nom], periode: { du: a.du, au: a.au }, fait: !!briefingDe(e, a.jour_retour) });
    }
    const depart = departApres(e, aujourdhui, ctx) || (assezLongue(periodeAutour(e, ouvreSuivant(aujourdhui, 1), ctx)) ? periodeAutour(e, ouvreSuivant(aujourdhui, 1), ctx) : null);
    if (assezLongue(depart)) {
      const restent = EQUIPE.filter((p) => p.email !== e && !absentLe(p.email, depart.du, ctx));
      aFaire.push({ genre: 'depart', jour: depart.du, pour: restent.map((p) => p.email), noms: restent.map((p) => p.nom), periode: depart, fait: !!briefingDe(e, depart.du) });
    }
  }
  return {
    aujourdhui, moi: moi ? moi.nom : null, retour,
    briefings: moi ? briefingsPour(e, aujourdhui).map((b) => ({ ...b, de_nom: nomDe(b.de) })) : [],
    a_faire: aFaire,
    a_relire: estJules ? suivies.map((a) => {
      const jr = a.jour_retour;
      const bs = Records.list(BRIEFING).filter((b) => (b.pour || []).includes(a.email) && b.genre === 'retour' && b.jour === jr);
      return { pour: a.email, nom: a.nom, du: a.du, au: a.au, jour_retour: jr, briefings: bs.map((b) => ({ nom: nomDe(b.de), ecrit_le: b.ecrit_le, reponses: b.reponses })), manquent: EQUIPE.filter((p) => p.email !== a.email && !bs.some((b) => b.de === p.email)).map((p) => p.nom), retour: a.retour || null };
    }) : [],
    semaine: quiEstLa(aujourdhui, ctx),
  };
}

// --- Le tour du matin -----------------------------------------------------------------------

const JULES = ['jules.b@klocka.immo'];

/**
 * Chaque jour ouvré à partir de 7 h :
 * - les briefings dont le jour est venu sont annoncés à leurs destinataires ;
 * - le dernier jour d'une absence, ceux qui sont là sont invités à faire leur briefing ;
 * - la veille d'une absence, celui qui part est invité à faire le brief à ceux qui restent ;
 * - le matin du retour, le résumé validé paraît ; sinon le brouillon s'écrit et Jules est prévenu.
 */
export async function tourDuMatin({ aujourdhui = jourParis(), invoke = null } = {}) {
  if (!estOuvre(aujourdhui)) return { ok: true, fait: [] };
  const { notifier } = await import('./notifications.js');
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const fait = [];
  for (const b of Records.list(BRIEFING).filter((x) => x.jour <= aujourdhui && x.jour >= plusJours(aujourdhui, -7) && (x.pour || []).some((q) => !(x.notifie || []).includes(q)))) {
    await notifierBriefing(b);
    fait.push(`briefing de ${nomDe(b.de)}`);
  }
  for (const p of EQUIPE) {
    const absence = periodeAutour(p.email, aujourdhui, ctx);
    if (assezLongue(absence) && absence.au === aujourdhui) {
      const jr = ouvreSuivant(absence.au, 1);
      for (const q of EQUIPE.filter((x) => x.email !== p.email && !absentLe(x.email, aujourdhui, ctx) && !briefingDe(x.email, jr))) {
        notifier({ pour: q.email, titre: `${p.nom} revient ${dateFr(jr)} : fais-lui ton briefing`, texte: 'Un clic sur ce jour dans l\'Agenda : quelques questions, et il le lira à son retour.', lien: '/Agenda', cle: `agenda:a-briefer:${p.email}:${absence.du}:${q.email}` });
      }
      fait.push(`briefings pour ${p.nom}`);
    }
    const depart = departApres(p.email, aujourdhui, ctx);
    if (assezLongue(depart) && !briefingDe(p.email, depart.du)) {
      const restent = EQUIPE.filter((x) => x.email !== p.email && !absentLe(x.email, depart.du, ctx)).map((x) => x.nom);
      notifier({ pour: p.email, titre: `Tu pars ${dateFr(depart.du)} : fais le brief à ${restent.filter((n) => n !== 'Jules').join(', ') || restent.join(', ') || 'l\'équipe'}`, texte: 'Où en sont tes dossiers, ce qu\'il faut surveiller. Un clic sur ce jour dans l\'Agenda.', lien: '/Agenda', cle: `agenda:depart:${p.email}:${depart.du}` });
      fait.push(`départ ${p.nom}`);
    }
    const retour = retourLe(p.email, aujourdhui, ctx);
    if (assezLongue(retour)) {
      let r = retourDe(p.email, retour.du);
      if (r?.etat === 'valide') { await publier(r.id); fait.push(`publié pour ${p.nom}`); continue; }
      if (r?.etat === 'publie') continue;
      if (!r) r = (await ecrireBrouillon(p.email, retour, { invoke })).retour;
      for (const j of JULES) notifier({ pour: j, titre: `Le résumé pour ${p.nom} attend ta relecture`, texte: `${p.nom} revient aujourd'hui. Relis, corrige, valide : il paraît aussitôt dans son Agenda.`, lien: '/Agenda', cle: `agenda:relire:${p.email}:${retour.du}` });
      fait.push(`à relire pour ${p.nom}`);
    }
  }
  return { ok: true, fait };
}

/** Sur Render (ou avec EQUIPE_SEMAINE=true) : le tour, une fois par jour ouvré, à partir de 7 h. */
export function planifier() {
  if (!process.env.RENDER && process.env.EQUIPE_SEMAINE !== 'true') return null;
  let dernier = null;
  const tour = () => {
    const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date())) % 24;
    const j = jourParis();
    if (heure < 7 || dernier === j) return;
    dernier = j;
    tourDuMatin().then((r) => console.log(`[agenda] ${j} : ${(r.fait || []).join(', ') || 'rien'}`)).catch((e) => console.warn('[agenda]', e?.message || e));
  };
  const t = setInterval(tour, 20 * 60000);
  t.unref?.();
  setTimeout(tour, 60000).unref?.();
  return t;
}
