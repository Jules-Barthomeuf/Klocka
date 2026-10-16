// La semaine de l'équipe (16 oct. 2026, Jules) : qui est là, et ce qu'on a
// manqué quand on ne l'était pas.
//
// Jules dit qui est là et qui ne l'est pas (un jour à la fois, avec un motif :
// école, congés, autre) ; les agendas Google s'y ajoutent quand ils sont
// lisibles. Pendant l'absence de quelqu'un (Nora en congés, Maxime à
// l'école), ceux qui sont là écrivent leur point de la semaine pour elle ; le
// dernier jour de l'absence, chacun y est invité. Un brouillon court s'écrit
// à partir de ces points, des réunions et décisions de l'Intelligence, de
// l'activité de chacun et des nouveautés de la plateforme : ce que chacun a
// fait, réunions et décisions, nouveautés. Jules le relit, le corrige et le
// valide ; il part par mail (depuis la boîte de Jules) le matin du retour, à
// partir de 7 h, et s'affiche dans la page Semaine de la personne.
//
// Décisions de Jules (16 oct. 2026) : rempli par tous, relu par lui, envoyé
// le lundi par mail, court ; pas de bloc « Pendant l'absence de … » pour ceux
// qui restent, pas de passation laissée par celui qui part.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Meta } from './db.js';
import { ANALYSTES } from './fil-dossier.js';

const ABSENCE = 'AbsenceEquipe';
const CONTRIBUTION = 'ContributionSemaine';
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


// --- Les points de la semaine, écrits par ceux qui sont là ---------------------------------

export const contributionsPour = (email, du) => Records.list(CONTRIBUTION).filter((c) => c.pour === bas(email) && c.du === du).sort((x, y) => String(x.ecrit_le).localeCompare(String(y.ecrit_le)));

/** `user` écrit (ou réécrit) son point de la semaine pour `pour`, absent sur la période qui commence le `du`. */
export function contribuer(user, { pour, du, au = null, texte }) {
  const e = bas(user?.email);
  const p = bas(pour);
  if (!EQUIPE.some((x) => x.email === e)) return { ok: false, error: 'Réservé à l\'équipe.' };
  if (!EQUIPE.some((x) => x.email === p) || p === e) return { ok: false, error: 'Personne inconnue.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(du || ''))) return { ok: false, error: 'Période manquante.' };
  const t = String(texte || '').trim().slice(0, 6000);
  const deja = Records.list(CONTRIBUTION).find((c) => c.pour === p && c.du === du && c.par === e);
  if (!t) { if (deja) Records.delete(CONTRIBUTION, deja.id); return { ok: true, retire: !!deja }; }
  const champs = { pour: p, du, au, par: e, texte: t, ecrit_le: new Date().toISOString() };
  return { ok: true, contribution: deja ? Records.update(CONTRIBUTION, deja.id, champs) : Records.create(CONTRIBUTION, champs) };
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

// --- Ce qui s'est passé pendant la période --------------------------------------------------

const court = (s, n = 300) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const dansPeriode = (le, du, au) => { if (!le) return false; const j = jourParis(le); return j >= du && j <= au; };

/**
 * La matière du résumé : les points écrits par chacun, l'activité de chacun
 * (appels, dossiers, appels clients, réunions enregistrées), les réunions et
 * décisions de l'Intelligence, les nouveautés.
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
  const parPersonne = presents.map((p) => {
    const a = activite[p.nom];
    return { nom: p.nom, son_point: contributionsPour(absent, du).find((c) => c.par === p.email)?.texte || null, appels_agents: a.appels_agents, conversations: a.conversations.slice(0, 6), dossiers: [...a.dossiers].slice(0, 10), appels_clients: a.appels_clients, reunions_enregistrees: a.reunions };
  });
  // Les réunions et les décisions : les comptes rendus de la période et leurs faits ; les décisions validées d'ailleurs.
  const faits = Records.list('CerveauFait').filter((f) => f.statut !== 'rejete');
  const comptesRendus = Records.list('CerveauSource').filter((s) => s.type === 'compte_rendu');
  const reunions = comptesRendus.filter((s) => dansPeriode(s.date, du, au)).map((s) => ({
    titre: s.titre, date: jourParis(s.date),
    faits: faits.filter((f) => f.source_id === s.id && ['decision', 'engagement', 'information'].includes(f.type)).map((f) => ({ type: f.type, resume: f.resume, personne: f.personne || null, echeance: f.echeance || null })).slice(0, 40),
  }));
  const idsCR = new Set(comptesRendus.map((s) => s.id));
  const decisions = faits.filter((f) => f.type === 'decision' && f.statut === 'valide' && !idsCR.has(f.source_id) && dansPeriode(f.date || f.cree_le, du, au)).map((f) => f.resume).slice(0, 20);
  return { du, au, pour: absent, nom: nomDe(absent), par_personne: parPersonne, reunions, decisions, nouveautes: nouveautes(du, au) };
}

// --- Le résumé : brouillon, relecture de Jules, envoi --------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    objet: { type: 'string', description: 'l\'objet du mail, court (« Ta semaine du 12 au 16 octobre »)' },
    texte: { type: 'string', description: 'le résumé, en texte simple, avec les trois titres de section chacun sur sa ligne' },
  },
  required: ['objet', 'texte'],
};
export const SECTIONS = ['Ce que chacun a fait', 'Réunions et décisions', 'Nouveautés de la plateforme'];
const dateFr = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Pure : la consigne du brouillon. */
export function consigne(c) {
  return `Tu écris pour ${c.nom}, de l'équipe Klocka (achat et vente de murs commerciaux), qui revient après une absence du ${dateFr(c.du)} au ${dateFr(c.au)}. Un résumé COURT de ce qui s'est passé (250 mots au plus), qu'elle lit en deux minutes le matin de son retour. Tutoie ${c.nom}. N'invente rien : tout vient des données ci-dessous. Français simple, phrases courtes, sans tiret long, sans gras, sans markdown.

Trois sections, dans cet ordre, chaque titre seul sur sa ligne, puis des lignes qui commencent par « - » :
${SECTIONS.join('\n')}
- Ce que chacun a fait : une ligne ou deux par personne, d'abord ce qu'elle a écrit elle-même (son point), puis son activité si elle apporte quelque chose (appels, dossiers, appels clients). Une personne sans point ni activité : « rien de noté ».
- Réunions et décisions : les décisions et les engagements qui la concernent ou qui changent le travail de l'équipe ; si aucune réunion n'a été enregistrée, dis-le en une ligne.
- Nouveautés de la plateforme : trois à cinq lignes, ce qui change pour son travail, en mots simples, sans détail technique.
Commence par une phrase d'accueil d'une ligne. Pas de formule de fin.

DONNÉES (JSON) :
${JSON.stringify({ par_personne: c.par_personne, reunions: c.reunions, autres_decisions: c.decisions, nouveautes: c.nouveautes })}`;
}

export const retourDe = (email, du) => Records.list(RETOUR).find((r) => r.pour === bas(email) && r.du === du) || null;

/** Le brouillon (ou sa réécriture, avec les derniers points) : jamais sur un résumé déjà envoyé. */
export async function ecrireBrouillon(email, { du, au }, { invoke = null } = {}) {
  const deja = retourDe(email, du);
  if (deja?.etat === 'envoye') return { ok: false, error: 'Déjà envoyé.' };
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
    contributions: contributionsPour(email, du).map((x) => x.par), genere_le: new Date().toISOString(), cout_usd: (deja?.cout_usd || 0) + cout, valide_par: null, valide_le: null,
  };
  return { ok: true, retour: deja ? Records.update(RETOUR, deja.id, champs) : Records.create(RETOUR, champs) };
}

/** Jules corrige l'objet ou le texte. */
export function corriger(id, { objet, texte }) {
  const r = Records.get(RETOUR, id);
  if (!r) return { ok: false, error: 'Résumé introuvable.' };
  if (r.etat === 'envoye') return { ok: false, error: 'Déjà envoyé.' };
  return { ok: true, retour: Records.update(RETOUR, id, { ...(objet !== undefined ? { objet: court(objet, 160) } : {}), ...(texte !== undefined ? { texte: String(texte).slice(0, 8000) } : {}), corrige_le: new Date().toISOString() }) };
}

/** Jules valide : le résumé part le matin du retour (tout de suite si le retour est déjà là). */
export async function valider(id, user, { aujourdhui = jourParis(), envoyer = null } = {}) {
  const r = Records.get(RETOUR, id);
  if (!r) return { ok: false, error: 'Résumé introuvable.' };
  if (r.etat === 'envoye') return { ok: false, error: 'Déjà envoyé.' };
  if (!String(r.texte || '').trim()) return { ok: false, error: 'Le résumé est vide.' };
  Records.update(RETOUR, id, { etat: 'valide', valide_par: bas(user?.email), valide_le: new Date().toISOString() });
  const jourRetour = ouvreSuivant(r.au, 1);
  if (aujourdhui >= jourRetour) return envoyerRetour(id, { envoyer });
  return { ok: true, retour: Records.get(RETOUR, id), part_le: jourRetour };
}

/** L'envoi : un mail depuis la boîte de celui qui a validé, une notification, et la page Semaine de la personne. */
export async function envoyerRetour(id, { envoyer = null } = {}) {
  const r = Records.get(RETOUR, id);
  if (!r || r.etat !== 'valide') return { ok: false, error: 'Pas validé.' };
  const corps = `${r.texte}\n\nAussi dans la page Semaine : ${(await import('./contexte.js')).URL_CANONIQUE}/Semaine`;
  let res;
  try {
    res = envoyer ? await envoyer({ to: r.pour, subject: r.objet, body: corps, from: r.valide_par })
      : await (await import('./email.js')).sendEmail({ from: r.valide_par, owner: r.valide_par, to: r.pour, subject: r.objet, body: corps });
  } catch (e) { res = { success: false, error: e?.message || String(e) }; }
  const parti = !!res?.success;
  Records.update(RETOUR, id, { etat: 'envoye', envoye_le: new Date().toISOString(), mail: parti ? 'envoye' : `non parti : ${court(res?.error || 'raison inconnue', 160)}` });
  const { notifier } = await import('./notifications.js');
  notifier({ pour: r.pour, titre: `Bon retour, ${nomDe(r.pour)} : ta semaine en bref`, texte: r.objet, lien: '/Semaine', cle: `semaine:retour:${r.pour}:${r.du}` });
  return { ok: true, retour: Records.get(RETOUR, id), mail: parti };
}

// --- Ce que la page montre ------------------------------------------------------------------

/** Pure : le nombre de jours ouvrés d'une période. */
export const joursOuvres = (du, au) => { let n = 0; for (let j = du; j <= au; j = plusJours(j, 1)) if (estOuvre(j)) n += 1; return n; };
// Un jour d'absence ne demande pas de résumé : à partir de deux jours ouvrés.
export const MIN_JOURS = 2;
const assezLongue = (p) => !!p && joursOuvres(p.du, p.au) >= MIN_JOURS;

/** Les absences en cours ou qui viennent de finir (retour aujourd'hui ou plus tard), dont le résumé n'est pas parti. */
function absencesASuivre(aujourdhui, ctx) {
  const vues = [];
  for (const p of EQUIPE) {
    const periode = periodeAutour(p.email, aujourdhui, ctx) || retourLe(p.email, aujourdhui, ctx);
    if (!assezLongue(periode)) continue;
    const r = retourDe(p.email, periode.du);
    if (r?.etat === 'envoye') continue;
    vues.push({ ...p, ...periode, jour_retour: ouvreSuivant(periode.au, 1), retour: r });
  }
  return vues;
}

/** Ce que la page Semaine montre à `user` aujourd'hui. */
export async function maSemaine(user, { aujourdhui = jourParis(), estJules = false } = {}) {
  const e = bas(user?.email);
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const moi = EQUIPE.find((p) => p.email === e) || null;
  // Mon résumé : le dernier envoyé, des deux dernières semaines.
  const retour = moi ? Records.list(RETOUR).filter((r) => r.pour === e && r.etat === 'envoye' && r.au >= plusJours(aujourdhui, -14)).sort((x, y) => String(y.envoye_le).localeCompare(String(x.envoye_le)))[0] || null : null;
  const suivies = absencesASuivre(aujourdhui, ctx).filter((a) => a.email !== e);
  return {
    aujourdhui, moi: moi ? moi.nom : null, retour,
    // Mon point pour chaque absent : ce que j'ai déjà écrit.
    a_ecrire: moi ? suivies.map((a) => ({ pour: a.email, nom: a.nom, du: a.du, au: a.au, jour_retour: a.jour_retour, motif: a.motif, mon_point: contributionsPour(a.email, a.du).find((c) => c.par === e)?.texte || '' })) : [],
    // Pour Jules : la relecture, avec qui a écrit et qui manque.
    a_relire: estJules ? suivies.map((a) => {
      const pts = contributionsPour(a.email, a.du);
      return { pour: a.email, nom: a.nom, du: a.du, au: a.au, jour_retour: a.jour_retour, points: pts.map((c) => ({ nom: nomDe(c.par), texte: c.texte, ecrit_le: c.ecrit_le })), manquent: EQUIPE.filter((p) => p.email !== a.email && !pts.some((c) => c.par === p.email)).map((p) => p.nom), retour: a.retour || null };
    }) : [],
    semaine: quiEstLa(aujourdhui, ctx),
  };
}

// --- Le tour du matin -----------------------------------------------------------------------

/**
 * Chaque jour ouvré à partir de 7 h : le dernier jour d'une absence, ceux qui
 * sont là sont invités à écrire leur point ; le matin du retour, le résumé
 * validé part ; s'il ne l'est pas, le brouillon s'écrit et Jules est prévenu.
 */
export async function tourDuMatin({ aujourdhui = jourParis(), invoke = null, envoyer = null } = {}) {
  if (!estOuvre(aujourdhui)) return { ok: true, fait: [] };
  const { notifier } = await import('./notifications.js');
  const ctx = await contexte(plusJours(aujourdhui, -40), plusJours(aujourdhui, 40));
  const fait = [];
  for (const p of EQUIPE) {
    const absence = periodeAutour(p.email, aujourdhui, ctx);
    if (assezLongue(absence) && absence.au === aujourdhui) {
      const ecrits = new Set(contributionsPour(p.email, absence.du).map((c) => c.par));
      for (const q of EQUIPE.filter((x) => x.email !== p.email && !absentLe(x.email, aujourdhui, ctx) && !ecrits.has(x.email))) {
        notifier({ pour: q.email, titre: `${p.nom} revient ${dateFr(ouvreSuivant(absence.au, 1))} : ton point de la semaine`, texte: 'Quelques lignes : ce que tu as fait, ce qu\'elle doit savoir. Jules relit, et le résumé part par mail le matin de son retour.', lien: '/Semaine', cle: `semaine:point:${p.email}:${absence.du}:${q.email}` });
      }
      fait.push(`points pour ${p.nom}`);
    }
    const retour = retourLe(p.email, aujourdhui, ctx);
    if (assezLongue(retour)) {
      let r = retourDe(p.email, retour.du);
      if (r?.etat === 'valide') { await envoyerRetour(r.id, { envoyer }); fait.push(`envoyé à ${p.nom}`); continue; }
      if (r?.etat === 'envoye') continue;
      if (!r) r = (await ecrireBrouillon(p.email, retour, { invoke })).retour;
      for (const j of SUPER_JULES) notifier({ pour: j, titre: `Le résumé pour ${p.nom} attend ta relecture`, texte: `${p.nom} revient aujourd'hui. Relis, corrige, valide : il part aussitôt.`, lien: '/Semaine', cle: `semaine:relire:${p.email}:${retour.du}` });
      fait.push(`à relire pour ${p.nom}`);
    }
  }
  return { ok: true, fait };
}
const SUPER_JULES = ['jules.b@klocka.immo'];

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
