// L'usage de la plateforme, personne par personne et session par session
// (19 oct. 2026, Jules : « un grand tableau par personne […] et ensuite je peux
// cliquer dans chaque session : ce que Maxime a fait ce vendredi, quelle page
// il a consulté, combien de temps »). L'équipe y compte, admins compris.
//
// La matière : chaque page ouverte par une personne connectée (VisitePage), et
// le battement du navigateur (VisiteSession, toutes les 30 s tant que la page
// est visible, depuis le 14 oct.). Les pages à moins de 30 minutes d'intervalle
// font une session (la règle de clients-courbes.js). Le temps sur une page va
// jusqu'à la page suivante ; sur la dernière, jusqu'au dernier battement du
// navigateur (30 minutes au plus), ou une minute quand aucun battement ne la
// couvre : cette durée-là est estimée, et marquée comme telle.

import { Records } from './db.js';
import { PAUSE_MS, LECTURE_MS, jourDe } from './clients-courbes.js';

const JOUR_MS = 86400000;
// Un même écran consigné deux fois de suite en moins de deux secondes : un doublon du navigateur.
const DOUBLON_MS = 2000;
// Une page quittée en moins d'une seconde : une redirection, personne ne l'a vue.
const REDIRECTION_MS = 1000;
const minuscule = (e) => String(e || '').toLowerCase();
const evolution = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
/** L'heure (0-23) et le jour de la semaine (0 = lundi) d'un instant, à Paris. */
function heureEtJour(t) {
  const d = new Date(t);
  const heure = Number(d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) % 24;
  const jour = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }));
  return { heure, jour };
}

/**
 * Pure : les sessions d'une personne.
 * `pages` : [{ page, le, url }] dans n'importe quel ordre ; `battements` : [{ debut, fin }] de ses navigateurs.
 * Rend [{ debut, fin, duree_ms, pages: [{ page, url, le, duree_ms, estimee }] }], la plus ancienne d'abord.
 */
export function decouperSessions(pages, battements = []) {
  const vues = pages
    .map((p) => ({ page: p.page, url: p.url || null, t: Date.parse(p.le) }))
    .filter((p) => p.page && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
    .filter((p, i, l) => !(i && l[i - 1].page === p.page && p.t - l[i - 1].t < DOUBLON_MS))
    .filter((p, i, l) => !(l[i + 1] && l[i + 1].t - p.t < REDIRECTION_MS));
  const groupes = [];
  for (const v of vues) {
    const g = groupes.at(-1);
    if (g && v.t - g.at(-1).t <= PAUSE_MS) g.push(v);
    else groupes.push([v]);
  }
  const bornes = battements.map((b) => ({ debut: Date.parse(b.debut), fin: Date.parse(b.fin) })).filter((b) => Number.isFinite(b.debut) && Number.isFinite(b.fin));
  return groupes.map((g, i) => {
    const derniere = g.at(-1).t;
    const suivante = groupes[i + 1]?.[0].t ?? Infinity;
    // Le dernier battement qui couvre la dernière page, sans déborder sur la session suivante.
    const fins = bornes.filter((b) => b.debut <= derniere + 60000 && b.fin > derniere).map((b) => b.fin);
    const battue = fins.length ? Math.min(Math.max(...fins), derniere + PAUSE_MS, suivante) : null;
    const lignes = g.map((v, k) => {
      const apres = g[k + 1]?.t;
      const fin = apres ?? battue;
      return { page: v.page, url: v.url, le: new Date(v.t).toISOString(), duree_ms: fin ? fin - v.t : LECTURE_MS, estimee: !apres && !battue };
    });
    const fin = derniere + lignes.at(-1).duree_ms;
    return { debut: new Date(g[0].t).toISOString(), fin: new Date(fin).toISOString(), duree_ms: fin - g[0].t, pages: lignes };
  });
}

/** Pure : la vue d'ensemble et le tableau par personne, sur `jours`, comparés aux `jours` d'avant. */
export function syntheseUsage({ visites = [], battements = [], users = [], jours = 30, maintenant = new Date() } = {}) {
  const fin = maintenant.getTime();
  const depuis = fin - jours * JOUR_MS;
  const avant = fin - 2 * jours * JOUR_MS;
  const comptes = new Map(users.map((u) => [minuscule(u.email), u]));

  // Les sessions de chacun, sur toute l'histoire gardée : « 7 jours » et « 30 jours » ne dépendent pas de la période choisie.
  const parQui = new Map();
  for (const v of visites) {
    const qui = minuscule(v.par);
    if (!qui) continue;
    if (!parQui.has(qui)) parQui.set(qui, { pages: [], battements: [], role: null });
    const e = parQui.get(qui);
    e.pages.push(v);
    e.role = e.role || v.role;
  }
  for (const b of battements) {
    const e = parQui.get(minuscule(b.par));
    if (e) e.battements.push(b);
  }

  const toutes = [];
  const personnes = [];
  for (const [qui, e] of parQui) {
    const siennes = decouperSessions(e.pages, e.battements).map((s) => ({ ...s, qui, t: Date.parse(s.debut) }));
    toutes.push(...siennes);
    const periode = siennes.filter((s) => s.t >= depuis);
    if (!periode.length) continue;
    const derniere = siennes.at(-1);
    const temps = periode.reduce((n, s) => n + s.duree_ms, 0);
    const parPage = new Map();
    for (const s of periode) for (const p of s.pages) parPage.set(p.page, (parPage.get(p.page) || 0) + p.duree_ms);
    // Les minutes de chacun des 14 derniers jours : la petite courbe de sa ligne.
    const activite = [];
    for (let i = 13; i >= 0; i -= 1) {
      const j = jourDe(fin - i * JOUR_MS);
      activite.push({ jour: j, minutes: Math.round(siennes.filter((s) => jourDe(s.t) === j).reduce((n, s) => n + s.duree_ms, 0) / 60000) });
    }
    const u = comptes.get(qui);
    personnes.push({
      email: qui,
      nom: u?.full_name || u?.nom || null,
      role: u?.role || e.role || null,
      essai: !!u?.essai,
      pages: periode.reduce((n, s) => n + s.pages.length, 0),
      sessions: periode.length,
      sessions_7j: siennes.filter((s) => s.t >= fin - 7 * JOUR_MS).length,
      sessions_30j: siennes.filter((s) => s.t >= fin - 30 * JOUR_MS).length,
      pages_derniere: derniere.pages.length,
      duree_derniere_ms: derniere.duree_ms,
      duree_moyenne_ms: Math.round(temps / periode.length),
      temps_ms: temps,
      derniere: derniere.fin,
      page_favorite: [...parPage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      activite,
    });
  }
  personnes.sort((a, b) => String(b.derniere).localeCompare(String(a.derniere)));

  const periode = toutes.filter((s) => s.t >= depuis);
  const precedente = toutes.filter((s) => s.t >= avant && s.t < depuis);
  const resume = (l) => {
    const temps = l.reduce((n, s) => n + s.duree_ms, 0);
    return { personnes: new Set(l.map((s) => s.qui)).size, sessions: l.length, pages: l.reduce((n, s) => n + s.pages.length, 0), temps_ms: temps, duree_moyenne_ms: l.length ? Math.round(temps / l.length) : 0 };
  };
  const ici = resume(periode);
  const la = resume(precedente);

  const serie = [];
  for (let i = jours - 1; i >= 0; i -= 1) {
    const j = jourDe(fin - i * JOUR_MS);
    const du = periode.filter((s) => jourDe(s.t) === j);
    const r = resume(du);
    serie.push({ jour: j, personnes: r.personnes, sessions: r.sessions, pages: r.pages, minutes: Math.round(r.temps_ms / 60000), duree_moyenne: Math.round(r.duree_moyenne_ms / 60000) });
  }

  // Les pages : vues, temps passé, combien de personnes. Le temps classe : une page ouverte en passant pèse peu.
  const pages = new Map();
  // Jour × heure : les minutes passées sur la plateforme, à Paris.
  const semaine = Array.from({ length: 7 }, (_, jour) => ({ jour, heures: Array(24).fill(0) }));
  for (const s of periode) {
    for (const p of s.pages) {
      const e = pages.get(p.page) || { page: p.page, vues: 0, temps_ms: 0, qui: new Set() };
      e.vues += 1;
      e.temps_ms += p.duree_ms;
      e.qui.add(s.qui);
      pages.set(p.page, e);
      const { heure, jour } = heureEtJour(Date.parse(p.le));
      if (jour >= 0) semaine[jour].heures[heure] += p.duree_ms / 60000;
    }
  }
  for (const j of semaine) j.heures = j.heures.map((m) => Math.round(m));

  return {
    jours,
    totaux: {
      ...ici,
      personnes_evolution: evolution(ici.personnes, la.personnes),
      sessions_evolution: evolution(ici.sessions, la.sessions),
      pages_evolution: evolution(ici.pages, la.pages),
      duree_evolution: evolution(ici.duree_moyenne_ms, la.duree_moyenne_ms),
      temps_evolution: evolution(ici.temps_ms, la.temps_ms),
    },
    serie,
    semaine,
    pages: [...pages.values()].map((p) => ({ page: p.page, vues: p.vues, temps_ms: p.temps_ms, personnes: p.qui.size })).sort((a, b) => b.temps_ms - a.temps_ms),
    personnes,
  };
}

/** Pure : les sessions d'une personne, la plus récente d'abord. */
export function sessionsDePersonne({ email, visites = [], battements = [], limite = 60 }) {
  const qui = minuscule(email);
  const siennes = decouperSessions(visites.filter((v) => minuscule(v.par) === qui), battements.filter((b) => minuscule(b.par) === qui));
  return { email: qui, total: siennes.length, sessions: siennes.reverse().slice(0, limite) };
}

const lire = () => ({ visites: Records.list('VisitePage'), battements: Records.list('VisiteSession').filter((s) => s.par) });

export const usage = ({ jours = 30 } = {}) => syntheseUsage({ ...lire(), users: Records.list('User'), jours });
export const sessionsDe = ({ email, limite }) => sessionsDePersonne({ email, ...lire(), limite });
