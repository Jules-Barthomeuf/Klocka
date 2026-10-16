// La semaine de l'équipe (16 oct. 2026, Jules) : qui est là, et ce qu'on a
// manqué quand on ne l'était pas.
//
// Maxime part à l'école une semaine sur deux ; Nora et Coralie s'absentent
// aussi. Jules dit qui est là et qui ne l'est pas (un jour à la fois, avec un
// motif : école, congés, autre) ; les agendas Google s'y ajoutent quand ils
// sont lisibles. Trois moments en découlent :
//
//   avant de partir   la veille d'une absence, la personne est invitée à
//                     faire le point sur ses dossiers (la passation) ;
//   le premier jour   ceux qui restent reçoivent « Pendant l'absence de … » :
//                     ses dossiers, où il en est, ce qu'il faut surveiller ;
//   au retour         le premier jour ouvré après l'absence (le lundi
//                     d'après), un résumé très détaillé de ce qui s'est
//                     passé : ses dossiers, les autres, la réunion
//                     hebdomadaire, la prospection, ce qui a changé dans la
//                     plateforme, ce qui l'attend, qui est là cette semaine.
//
// Les résumés s'écrivent avec le modèle principal, une fois par période, et
// se gardent (ResumeEquipe). Rien ne part par mail : une notification de
// l'application, et la page Semaine.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Meta } from './db.js';
import { ANALYSTES } from './fil-dossier.js';

const ABSENCE = 'AbsenceEquipe';
const PASSATION = 'PassationEquipe';
const RESUME = 'ResumeEquipe';
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

// --- Les dossiers d'une personne -----------------------------------------------------------

const FERMES = new Set(['abandonne', 'refuse', 'archive', 'archived', 'non', 'perdu']);
const dernierSuivi = (d) => (d.suivi || []).map((s) => s.le).sort().pop() || d.cree_le || d.created_date || null;

/** Ses dossiers ouverts : créés par lui, dont il est responsable, ou qu'il a touchés depuis deux mois. */
export function dossiersDe(email, { maintenant = new Date() } = {}) {
  const e = bas(email);
  const depuis = new Date(maintenant.getTime() - 60 * 86400000).toISOString();
  return Records.list('Deal')
    .filter((d) => !d.supprime && !d.archived && !d.test && !FERMES.has(String(d.statut || '')))
    .filter((d) => bas(d.cree_par) === e || (d.responsables || []).map(bas).includes(e) || (d.suivi || []).some((s) => bas(s.par) === e && String(s.le || '') >= depuis))
    .map((d) => ({ deal_id: d.deal_id, nom: d.nom || 'Dossier', statut: d.statut || null, derniere_activite: dernierSuivi(d) }))
    .sort((x, y) => String(y.derniere_activite || '').localeCompare(String(x.derniere_activite || '')))
    .slice(0, 25);
}

// --- La passation ---------------------------------------------------------------------------

export const passationDe = (email, du) => Records.list(PASSATION).find((p) => p.email === bas(email) && p.du === du) || null;

/** La personne laisse le point sur ses dossiers avant de partir. */
export function enregistrerPassation(user, { du, au, texte = '', dossiers = [] }) {
  const e = bas(user?.email);
  if (!EQUIPE.some((p) => p.email === e)) return { ok: false, error: 'Réservé à l\'équipe.' };
  if (!du || !au) return { ok: false, error: 'Période manquante.' };
  const propres = (dossiers || []).filter((d) => d?.deal_id && String(d.note || '').trim()).map((d) => ({ deal_id: String(d.deal_id), nom: String(d.nom || '').slice(0, 160), note: String(d.note).trim().slice(0, 2000) }));
  if (!String(texte).trim() && !propres.length) return { ok: false, error: 'Écrivez au moins une ligne.' };
  const champs = { email: e, du, au, texte: String(texte).trim().slice(0, 8000), dossiers: propres, ecrit_le: new Date().toISOString() };
  const deja = passationDe(e, du);
  const p = deja ? Records.update(PASSATION, deja.id, champs) : Records.create(PASSATION, champs);
  // La passation change : le résumé de ceux qui restent se réécrit.
  for (const r of Records.list(RESUME).filter((x) => x.genre === 'passation' && x.sur === e && x.du === du)) Records.delete(RESUME, r.id);
  return { ok: true, passation: p };
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
  return liste.filter((c) => { const j = jourParis(c.le); return j >= du && j <= au; }).map((c) => ({ le: c.le, sujet: String(c.sujet).slice(0, 700) }));
}

// --- La collecte d'une période --------------------------------------------------------------

const court = (s, n = 300) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const dansPeriode = (le, du, au) => { if (!le) return false; const j = jourParis(le); return j >= du && j <= au; };

/** Tout ce qui s'est passé entre `du` et `au` (inclus), vu pour `sur` (la personne absente). */
export async function collecte({ du, au, sur }) {
  const e = bas(sur);
  const siens = new Set(dossiersDe(e, { maintenant: new Date(`${au}T23:00:00Z`) }).map((d) => d.deal_id));
  const nom = (x) => nomDe(x) || 'quelqu\'un';
  // Les dossiers : leur suivi dans la période, et les messages des mandataires.
  const messages = Records.list('MessageDossier').filter((m) => dansPeriode(m.le, du, au));
  const dossierMandataire = new Map(Records.list('DossierMandataire').map((d) => [d.id, d]));
  const dossiers = [];
  for (const d of Records.list('Deal').filter((x) => !x.supprime && !x.test)) {
    const evs = (d.suivi || []).filter((s) => dansPeriode(s.le, du, au)).map((s) => ({ le: s.le, par: nom(s.par), quoi: court(s.detail || s.type, 220) }));
    const msgs = messages.filter((m) => dossierMandataire.get(m.dossier_id)?.deal_id === d.deal_id && m.genre !== 'evenement').map((m) => ({ le: m.le, par: m.cote === 'mandataire' ? 'le mandataire' : nom(m.auteur_email), quoi: court(m.texte, 200), interne: !!m.interne }));
    if (!evs.length && !msgs.length) continue;
    dossiers.push({ deal_id: d.deal_id, nom: d.nom || 'Dossier', statut: d.statut || null, a_lui: siens.has(d.deal_id), evenements: evs.slice(-15), messages: msgs.slice(-8) });
  }
  dossiers.sort((x, y) => Number(y.a_lui) - Number(x.a_lui) || y.evenements.length - x.evenements.length);
  // Ses dossiers sans mouvement : à dire aussi (« rien n'a bougé »).
  const immobiles = [...siens].filter((id) => !dossiers.some((d) => d.deal_id === id)).map((id) => Records.findBy('Deal', 'deal_id', id)).filter(Boolean).map((d) => ({ deal_id: d.deal_id, nom: d.nom || 'Dossier', statut: d.statut || null }));
  // Les projets créés ou changés.
  const projets = Records.list('Project').filter((p) => dansPeriode(p.created_date, du, au) || dansPeriode(p.updated_date, du, au))
    .map((p) => ({ id: p.id, titre: p.titre || 'Projet', statut: p.statut || null, changement: dansPeriode(p.created_date, du, au) ? 'créé pendant la période' : 'modifié pendant la période' })).slice(0, 30);
  // Les réunions : les comptes rendus entrés dans l'Intelligence, et leurs faits.
  const faits = Records.list('CerveauFait').filter((f) => f.statut !== 'rejete');
  const reunions = Records.list('CerveauSource').filter((s) => s.type === 'compte_rendu' && dansPeriode(s.date, du, au)).map((s) => ({
    titre: s.titre, date: s.date,
    faits: faits.filter((f) => f.source_id === s.id).map((f) => ({ type: f.type, resume: f.resume, personne: f.personne || null, echeance: f.echeance || null, statut: f.statut })).slice(0, 60),
  }));
  const sourcesReunion = new Set(Records.list('CerveauSource').filter((s) => s.type === 'compte_rendu').map((s) => s.id));
  // Les autres faits validés de la période (appels, débriefs, mails, Monday).
  const autresFaits = faits.filter((f) => f.statut === 'valide' && !sourcesReunion.has(f.source_id) && dansPeriode(f.date || f.cree_le, du, au) && ['decision', 'engagement', 'information'].includes(f.type))
    .map((f) => ({ type: f.type, resume: f.resume, personne: f.personne || null })).slice(0, 40);
  const prenom = nomDe(e).toLowerCase();
  const pourLui = faits.filter((f) => f.type === 'engagement' && ['ouvert', 'echu'].includes(f.statut_engagement || 'ouvert') && f.statut === 'valide' && (String(f.responsable || f.personne || '').toLowerCase().includes(prenom)))
    .map((f) => ({ resume: f.resume, echeance: f.echeance || null })).slice(0, 15);
  // La prospection : les appels par personne, les fiches reçues et leurs décisions.
  const appels = Records.list('AppelAgent').filter((x) => !x.essai && !x.faux && x.etat !== 'remplace' && dansPeriode(x.le, du, au));
  const parPersonne = {};
  for (const a of appels) { const n = nom(a.par); parPersonne[n] = (parPersonne[n] || 0) + 1; }
  let fiches = [];
  try {
    const { listerFiches } = await import('./deal/fiches-stats.js');
    fiches = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project') }, { depuis: null })
      .filter((f) => dansPeriode(f.le, du, au)).map((f) => ({ titre: f.titre, agent: f.agent, ville: f.ville, etape: f.etape }));
  } catch { fiches = []; }
  const marquants = appels.filter((a) => !['repondeur', 'pas_de_reponse'].includes(a.issue) && a.resume).map((a) => ({ par: nom(a.par), agent: a.agent || null, issue: a.issue, resume: court(a.resume, 200) })).slice(0, 20);
  return {
    du, au, sur: e, nom: nomDe(e),
    passation: passationDe(e, du),
    dossiers: dossiers.slice(0, 30), immobiles: immobiles.slice(0, 15), projets, reunions, faits: autresFaits, engagements: pourLui,
    prospection: { appels: appels.length, par_personne: parPersonne, conversations: marquants, fiches },
    produit: nouveautes(du, au),
  };
}

// --- Les résumés ----------------------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    chapeau: { type: 'string', description: 'deux ou trois phrases : l\'essentiel de la période' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                texte: { type: 'string', description: 'un fait précis : qui, quoi, quand, avec les chiffres et les noms' },
                deal_id: { type: 'string', description: 'l\'identifiant du dossier concerné, s\'il y en a un, sinon vide' },
              },
              required: ['texte'],
            },
          },
        },
        required: ['titre', 'points'],
      },
    },
  },
  required: ['chapeau', 'sections'],
};

const SECTIONS_RETOUR = ['Tes dossiers', 'Les autres dossiers', 'La réunion hebdomadaire', 'La prospection', 'Ce qui a changé dans la plateforme', 'Ce qui t\'attend', 'Qui est là cette semaine'];
const SECTIONS_PASSATION = ['Où il en est, dossier par dossier', 'À surveiller pendant son absence', 'Qui reprend quoi'];

const dateFr = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Pure : la consigne du résumé de retour. */
export function consigneRetour(c, equipe) {
  return `Tu écris pour ${c.nom}, de l'équipe Klocka (achat et vente de murs commerciaux), qui revient aujourd'hui après une absence du ${dateFr(c.du)} au ${dateFr(c.au)}. ${c.nom} doit pouvoir reprendre son travail sans rien demander à personne : sois TRÈS détaillé, précis et concret (noms des dossiers, des agents, des personnes, dates, chiffres, décisions et leur motif). Tutoie ${c.nom}. N'invente rien : tout vient des données ci-dessous ; si une partie est vide, dis-le en une phrase (« rien n'a bougé sur … »).

Sections, dans cet ordre, chacune avec autant de points qu'il faut :
${SECTIONS_RETOUR.map((s, i) => `${i + 1}. ${s}`).join('\n')}
- Tes dossiers : pour chacun de ses dossiers, ce qui s'est passé (étapes, pièces, messages du mandataire, décisions), qui l'a fait, et ce qui reste à faire ; puis ceux qui n'ont pas bougé. Mets deal_id.
- Les autres dossiers : ce qui a avancé chez les autres.
- La réunion hebdomadaire : les décisions, les informations et les engagements de chaque réunion de la période (qui s'est engagé à quoi, pour quand). Si aucune réunion, dis-le.
- La prospection : le nombre d'appels et par qui, les conversations marquantes, les fiches reçues et leur sort.
- Ce qui a changé dans la plateforme : à partir des nouveautés, ce qui change pour SON travail, en mots simples, une ligne par changement utile (pas de détail technique, pas de nom de fichier).
- Ce qui t'attend : ses engagements, ses dossiers à reprendre, les décisions qui l'attendent, dans l'ordre d'urgence.
- Qui est là cette semaine : ${equipe}.
Écris en français simple, phrases courtes, sans tiret long.

${c.passation ? `CE QUE ${c.nom.toUpperCase()} AVAIT LAISSÉ EN PARTANT :\n${c.passation.texte || ''}\n${(c.passation.dossiers || []).map((d) => `- ${d.nom} (${d.deal_id}) : ${d.note}`).join('\n')}\n\n` : ''}DONNÉES DE LA PÉRIODE (JSON) :
${JSON.stringify({ dossiers: c.dossiers, dossiers_sans_mouvement: c.immobiles, projets: c.projets, reunions: c.reunions, autres_faits: c.faits, ses_engagements: c.engagements, prospection: c.prospection, nouveautes: c.produit })}`;
}

/** Pure : la consigne du résumé laissé à ceux qui restent. */
export function consignePassation(c, dossiers, equipe) {
  return `Tu écris pour l'équipe Klocka (achat et vente de murs commerciaux) qui reste pendant l'absence de ${c.nom}, du ${dateFr(c.du)} au ${dateFr(c.au)}. Présents : ${equipe}. À partir de ce que ${c.nom} a laissé et de l'état de ses dossiers, dis à ceux qui restent où en est chaque dossier, ce qu'il faut surveiller ou faire pendant son absence, et qui reprend quoi si ${c.nom} l'a dit (sinon, propose sans imposer). Sois précis (noms, dates, chiffres). N'invente rien. Vouvoie l'équipe, ou écris à la troisième personne. Français simple, sans tiret long.

Sections, dans cet ordre :
${SECTIONS_PASSATION.map((s, i) => `${i + 1}. ${s}`).join('\n')}

CE QUE ${c.nom.toUpperCase()} A LAISSÉ :
${c.passation ? `${c.passation.texte || ''}\n${(c.passation.dossiers || []).map((d) => `- ${d.nom} (${d.deal_id}) : ${d.note}`).join('\n')}` : `(${c.nom} n'a rien laissé : appuie-toi sur l'état des dossiers, et dis-le.)`}

SES DOSSIERS OUVERTS (JSON) :
${JSON.stringify(dossiers)}`;
}

function nettoyer(r, sections) {
  const propres = (r?.sections || []).filter((s) => s?.titre).map((s) => ({ titre: court(s.titre, 80), points: (s.points || []).filter((p) => p?.texte).map((p) => ({ texte: court(p.texte, 900), deal_id: p.deal_id ? String(p.deal_id).trim() || null : null })) }));
  // L'ordre prescrit d'abord, puis le reste.
  propres.sort((x, y) => { const a = sections.indexOf(x.titre); const b = sections.indexOf(y.titre); return (a < 0 ? 99 : a) - (b < 0 ? 99 : b); });
  return { chapeau: court(r?.chapeau, 900), sections: propres };
}

async function appelerModele(prompt, sur, invoke) {
  if (invoke) return { resultat: await invoke(prompt), cout: 0 };
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const m = await mesurer({ operation: 'semaine equipe', sur }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, max_tokens: 8000 }));
  return { resultat: m.resultat, cout: m.consommation?.cout || 0 };
}

export const resumeDe = (genre, sur, du) => Records.list(RESUME).find((r) => r.genre === genre && r.sur === bas(sur) && r.du === du) || null;

/** Le résumé de retour de `email` pour la période {du, au} : écrit une fois, gardé. */
export async function resumeRetour(email, { du, au }, { invoke = null, ctx = null, aujourdhui = jourParis() } = {}) {
  const deja = resumeDe('retour', email, du);
  if (deja) return deja;
  const c = await collecte({ du, au, sur: email });
  const cx = ctx || await contexte(plusJours(aujourdhui, -1), plusJours(aujourdhui, 7));
  const semaine = quiEstLa(aujourdhui, cx);
  const equipe = `${semaine.la.join(', ') || 'personne'}${semaine.absents.length ? ` ; absents : ${semaine.absents.map((a) => `${a.nom} (jusqu'au ${dateFr(a.au)})`).join(', ')}` : ''}`;
  const { resultat, cout } = await appelerModele(consigneRetour(c, equipe), `retour:${email}:${du}`, invoke);
  const contenu = nettoyer(resultat, SECTIONS_RETOUR);
  return Records.create(RESUME, { genre: 'retour', sur: bas(email), pour: [bas(email)], du, au, ...contenu, sources: { dossiers: c.dossiers.length, reunions: c.reunions.length, nouveautes: c.produit.length, appels: c.prospection.appels }, genere_le: new Date().toISOString(), cout_usd: cout, vu_par: [] });
}

/** Le résumé laissé à ceux qui restent pendant l'absence de `email`. */
export async function resumePassation(email, { du, au }, { invoke = null, ctx = null } = {}) {
  const deja = resumeDe('passation', email, du);
  if (deja) return deja;
  const cx = ctx || await contexte(plusJours(du, -1), plusJours(au, 1));
  const semaine = quiEstLa(du, cx);
  const c = { du, au, nom: nomDe(email), passation: passationDe(email, du) };
  const dossiers = dossiersDe(email).map((d) => { const deal = Records.findBy('Deal', 'deal_id', d.deal_id); return { ...d, derniers: (deal?.suivi || []).slice(-5).map((s) => ({ le: s.le, quoi: court(s.detail || s.type, 160) })) }; });
  const { resultat, cout } = await appelerModele(consignePassation(c, dossiers, semaine.la.join(', ') || 'personne'), `passation:${email}:${du}`, invoke);
  const contenu = nettoyer(resultat, SECTIONS_PASSATION);
  return Records.create(RESUME, { genre: 'passation', sur: bas(email), pour: semaine.la.map((n) => EQUIPE.find((p) => p.nom === n)?.email).filter(Boolean), du, au, ...contenu, avec_passation: !!c.passation, genere_le: new Date().toISOString(), cout_usd: cout, vu_par: [] });
}

/** Ce que la page Semaine montre à `user` aujourd'hui. */
export async function maSemaine(user, { aujourdhui = jourParis(), generer = true, invoke = null } = {}) {
  const e = bas(user?.email);
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const moi = EQUIPE.find((p) => p.email === e) || null;
  // Mon retour : aujourd'hui, ou un retour récent (dans les 7 derniers jours) déjà écrit.
  let retour = null;
  if (moi) {
    const p = retourLe(e, aujourdhui, ctx);
    if (p) retour = generer ? await resumeRetour(e, p, { ctx, aujourdhui, invoke }) : resumeDe('retour', e, p.du);
    if (!retour) retour = Records.list(RESUME).filter((r) => r.genre === 'retour' && r.sur === e && r.au >= plusJours(aujourdhui, -14)).sort((x, y) => String(y.genere_le).localeCompare(String(x.genere_le)))[0] || null;
  }
  // Mon départ : demain (ouvré) je ne suis pas là.
  const depart = moi ? departApres(e, aujourdhui, ctx) : null;
  // Pendant l'absence des autres : leur passation, pour ceux qui sont là.
  const absents = EQUIPE.filter((p) => p.email !== e).map((p) => ({ p, periode: periodeAutour(p.email, aujourdhui, ctx) })).filter((x) => x.periode);
  const passations = [];
  for (const { p, periode } of absents) {
    const r = generer ? await resumePassation(p.email, periode, { ctx, invoke }) : resumeDe('passation', p.email, periode.du);
    if (r) passations.push(r);
  }
  return {
    aujourdhui, moi: moi ? moi.nom : null,
    retour, depart: depart ? { ...depart, passation: passationDe(e, depart.du), dossiers: dossiersDe(e) } : null,
    passations, semaine: quiEstLa(aujourdhui, ctx),
  };
}

/** Marque un résumé lu par `user`. */
export function marquerVu(id, user) {
  const r = Records.get(RESUME, id);
  if (!r) return null;
  const e = bas(user?.email);
  if ((r.vu_par || []).includes(e)) return r;
  return Records.update(RESUME, id, { vu_par: [...(r.vu_par || []), e] });
}

// --- Le tour du matin -----------------------------------------------------------------------

/**
 * Chaque jour ouvré à partir de 7 h : les résumés de retour et de passation
 * s'écrivent, et chacun en est prévenu ; la veille d'un départ, la personne
 * est invitée à faire le point. Une notification par moment (clé).
 */
export async function tourDuMatin({ aujourdhui = jourParis(), invoke = null } = {}) {
  if (!estOuvre(aujourdhui)) return { ok: true, rien: true };
  const { notifier } = await import('./notifications.js');
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const fait = [];
  for (const p of EQUIPE) {
    const retour = retourLe(p.email, aujourdhui, ctx);
    if (retour) {
      await resumeRetour(p.email, retour, { ctx, aujourdhui, invoke });
      notifier({ pour: p.email, titre: `Bon retour, ${p.nom} : ce que tu as manqué`, texte: `Du ${dateFr(retour.du)} au ${dateFr(retour.au)} : tes dossiers, la réunion, la prospection, les nouveautés.`, lien: '/Semaine', cle: `semaine:retour:${p.email}:${retour.du}` });
      fait.push(`retour ${p.nom}`);
    }
    const depart = departApres(p.email, aujourdhui, ctx);
    if (depart && !passationDe(p.email, depart.du)) {
      notifier({ pour: p.email, titre: 'Avant de partir, fais le point sur tes dossiers', texte: `Absent du ${dateFr(depart.du)} au ${dateFr(depart.au)}. Quelques lignes par dossier : l'équipe les lira demain.`, lien: '/Semaine', cle: `semaine:depart:${p.email}:${depart.du}` });
      fait.push(`départ ${p.nom}`);
    }
    // Le premier jour de l'absence : ceux qui restent reçoivent la passation.
    const absence = periodeAutour(p.email, aujourdhui, ctx);
    if (absence && absence.du === aujourdhui) {
      const r = await resumePassation(p.email, absence, { ctx, invoke });
      for (const q of r.pour || []) notifier({ pour: q, titre: `Pendant l'absence de ${p.nom}`, texte: `Jusqu'au ${dateFr(absence.au)} : ses dossiers, où il en est, ce qu'il faut surveiller.`, lien: '/Semaine', cle: `semaine:passation:${p.email}:${absence.du}:${q}` });
      fait.push(`passation ${p.nom}`);
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
    tourDuMatin().then((r) => console.log(`[semaine] ${j} : ${(r.fait || []).join(', ') || 'rien'}`)).catch((e) => console.warn('[semaine]', e?.message || e));
  };
  const t = setInterval(tour, 20 * 60000);
  t.unref?.();
  setTimeout(tour, 60000).unref?.();
  return t;
}
