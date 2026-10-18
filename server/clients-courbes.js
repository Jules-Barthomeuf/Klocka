// Les courbes des clients, page Utilisateurs (18 oct. 2026, Jules : « voir si le
// nombre de clients augmente ou pas, et la durée de connexion de ces clients,
// en courbes, comme dans le Suivi »).
//
// Un client : un compte qui n'est ni de l'équipe (admin) ni mandataire.
// La croissance : les comptes clients cumulés à leur date de création, et ceux
// qui se sont déjà connectés au moins une fois (leur première page ouverte).
// La durée : la plateforme ne mesure pas le temps passé, elle note chaque page
// ouverte (VisitePage). Les pages d'une même personne à moins de 30 minutes
// d'intervalle font une session ; une session dure de sa première à sa
// dernière page, plus une minute pour lire la dernière. C'est une estimation,
// dite comme telle à l'écran.

import { Records } from './db.js';

export const PAUSE_MS = 30 * 60 * 1000;
export const LECTURE_MS = 60 * 1000;

const estClient = (role) => role !== 'admin' && role !== 'mandataire';
/** Le jour d'une date, à Paris (AAAA-MM-JJ). */
export const jourDe = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

/** Pure : les sessions d'une personne à partir de ses pages ouvertes (dates ISO, dans n'importe quel ordre). */
export function sessions(dates) {
  const t = dates.map((d) => Date.parse(d)).filter(Number.isFinite).sort((a, b) => a - b);
  const out = [];
  for (const x of t) {
    const s = out.at(-1);
    if (s && x - s.fin <= PAUSE_MS) s.fin = x;
    else out.push({ debut: x, fin: x });
  }
  return out.map((s) => ({ debut: s.debut, duree_ms: s.fin - s.debut + LECTURE_MS }));
}

/**
 * Pure : jour par jour sur la période, les comptes clients (cumulés), les clients déjà connectés (cumulés),
 * les minutes de connexion du jour, les clients connectés ce jour-là et la moyenne par client connecté.
 */
export function courbesClients({ users = [], visites = [], jours = 90, maintenant = new Date() } = {}) {
  const clients = users.filter((u) => estClient(u.role) && !u.essai);
  const emails = new Set(clients.map((u) => String(u.email || '').toLowerCase()));
  const parPersonne = new Map();
  for (const v of visites) {
    const qui = String(v.par || '').toLowerCase();
    if (!qui || !emails.has(qui) || !v.le) continue;
    if (!parPersonne.has(qui)) parPersonne.set(qui, []);
    parPersonne.get(qui).push(v.le);
  }

  // Première connexion, sessions par jour.
  const premiere = new Map();
  const parJour = new Map();
  for (const [qui, dates] of parPersonne) {
    for (const s of sessions(dates)) {
      const j = jourDe(s.debut);
      if (!premiere.has(qui) || j < premiere.get(qui)) premiere.set(qui, j);
      if (!parJour.has(j)) parJour.set(j, { ms: 0, qui: new Set() });
      parJour.get(j).ms += s.duree_ms;
      parJour.get(j).qui.add(qui);
    }
  }
  const creeLe = clients.map((u) => jourDe(u.cree_le || u.created_date || maintenant));
  const premieres = [...premiere.values()];

  const serie = [];
  const fin = new Date(maintenant);
  for (let i = jours - 1; i >= 0; i -= 1) {
    const j = jourDe(fin.getTime() - i * 86400000);
    const jour = parJour.get(j);
    const connectes = jour ? jour.qui.size : 0;
    const minutes = jour ? Math.round(jour.ms / 60000) : 0;
    serie.push({
      jour: j,
      comptes: creeLe.filter((c) => c <= j).length,
      deja_connectes: premieres.filter((c) => c <= j).length,
      minutes,
      connectes,
      moyenne: connectes ? Math.round(minutes / connectes) : null,
    });
  }

  const debut = serie[0]?.jour;
  const surPeriode = [...parJour.entries()].filter(([j]) => j >= debut);
  const connectesPeriode = new Set(surPeriode.flatMap(([, x]) => [...x.qui]));
  const minutesPeriode = Math.round(surPeriode.reduce((s, [, x]) => s + x.ms, 0) / 60000);
  return {
    jours,
    serie,
    totaux: {
      comptes: clients.length,
      nouveaux: creeLe.filter((c) => c >= debut).length,
      deja_connectes: premiere.size,
      connectes: connectesPeriode.size,
      minutes: minutesPeriode,
      moyenne: connectesPeriode.size ? Math.round(minutesPeriode / connectesPeriode.size) : null,
    },
  };
}

export function courbesDesClients({ jours = 90 } = {}) {
  const j = [30, 90, 365].includes(Number(jours)) ? Number(jours) : 90;
  return courbesClients({ users: Records.list('User'), visites: Records.list('VisitePage'), jours: j });
}
