// Les temps de chargement (11 nov. 2026, Jules : « mesurer le temps de chargement au fur et à mesure »).
//
// Deux mesures, pour deux questions :
//   - ce que vit la personne : le navigateur chronomètre chaque page ouverte, de l'ouverture jusqu'à ce que ses données
//     soient toutes arrivées (src/lib/NavigationTracker.jsx), et l'envoie ici ; une ligne ChargementPage par page.
//   - pourquoi : chaque lecture de l'API (GET) est chronométrée par le serveur (server/index.js), route par route, et
//     gardée en mémoire depuis le dernier démarrage (les 300 dernières par route).
// Suivi > Usage les montre : le temps habituel (médiane), celui des 10 % les plus lents, et l'écart avec la semaine
// d'avant. Écritures en meilleur effort : une mesure ne fait jamais échouer la page qu'elle observe.

import { Records } from './db.js';

const PLAFOND = 20000;
const PAR_ROUTE = 300;
const JOUR_MS = 86400000;
let ecritures = 0;

/** Pure : le centile p (0 à 100) d'une liste de nombres ; null si elle est vide. */
export function centile(valeurs, p) {
  const v = valeurs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];
}

/** Consigne un chargement de page mesuré par le navigateur. */
export function consignerChargement({ page, ms, premier, user }) {
  const duree = Math.round(Number(ms));
  if (!page || !Number.isFinite(duree) || duree < 0 || duree > 120_000) return null;
  try {
    const l = Records.create('ChargementPage', { page: String(page).slice(0, 80), ms: duree, premier: !!premier, par: user?.email || null, role: user?.role || null, le: new Date().toISOString() });
    // Élaguer relit toute la table : une fois toutes les 200 écritures suffit.
    if (++ecritures % 200 === 0) {
      const tout = Records.list('ChargementPage', { sort: 'le' });
      for (const x of tout.slice(0, Math.max(0, tout.length - PLAFOND))) Records.delete('ChargementPage', x.id);
    }
    return l;
  } catch (e) {
    console.warn('[chargement] non consigné :', e?.message || e);
    return null;
  }
}

const routes = new Map();
const depuis = new Date().toISOString();

/** Note la durée d'une lecture de l'API (appelé par le serveur à chaque GET). */
export function noterRoute(route, ms) {
  if (!route) return;
  let l = routes.get(route);
  if (!l) routes.set(route, (l = []));
  l.push(ms);
  if (l.length > PAR_ROUTE) l.shift();
}

/** Pure : les pages, du plus lent au plus rapide (au temps des 10 % les plus lents), sur la période et la précédente. */
export function statsPages(lignes, { jours = 30, maintenant = Date.now() } = {}) {
  const debut = maintenant - jours * JOUR_MS;
  const avant = debut - jours * JOUR_MS;
  const parPage = new Map();
  for (const l of lignes) {
    const t = Date.parse(l.le);
    if (!(t >= avant)) continue;
    if (!parPage.has(l.page)) parPage.set(l.page, { maintenant: [], avant: [] });
    parPage.get(l.page)[t >= debut ? 'maintenant' : 'avant'].push(l.ms);
  }
  return [...parPage.entries()]
    .filter(([, v]) => v.maintenant.length)
    .map(([page, v]) => ({ page, n: v.maintenant.length, mediane: centile(v.maintenant, 50), p90: centile(v.maintenant, 90), mediane_avant: centile(v.avant, 50) }))
    .sort((a, b) => b.p90 - a.p90);
}

/** Ce que montre Suivi : les pages sur la période, les routes depuis le démarrage. */
export function chargements({ jours = 30 } = {}) {
  const pages = statsPages(Records.list('ChargementPage'), { jours });
  const lesRoutes = [...routes.entries()]
    .map(([route, l]) => ({ route, n: l.length, mediane: centile(l, 50), p90: centile(l, 90), max: Math.max(...l) }))
    .sort((a, b) => b.p90 - a.p90)
    .slice(0, 25);
  return { pages, routes: lesRoutes, routes_depuis: depuis };
}
