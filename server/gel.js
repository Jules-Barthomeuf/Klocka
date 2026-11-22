// Les gels du serveur, et ce qui les cause (22 nov. 2026, Jules : « baisse le plus possible le temps de chargement »).
//
// Le serveur n'a qu'un fil : une tâche qui calcule longtemps (relève des boîtes, prix de l'Off-market, lecture d'une
// ville entière) fait attendre toutes les requêtes, et le journal ne montre que les routes devenues lentes, jamais la
// coupable. Ici, un profil du processeur tourne en continu dans le processus (un échantillon toutes les 10 ms, une
// fenêtre d'une minute) ; quand la boucle est restée bloquée plus de SEUIL_MS, on lit dans la fenêtre les seuls
// échantillons du gel et le journal dit qui tenait le fil :
//   [gel] 9,2 s à 18:43:36 · relever server/deal/veille-mails.js:121 8,9 s · list server/db.js:214 6,1 s · …
// Sur Render, ou avec KLOCKA_GELS=1 ; jamais pendant les tests.

import { Session } from 'node:inspector/promises';

const SEUIL_MS = 1500;
const FENETRE_MS = 60_000;
const PAS_MS = 250;

/**
 * Pure : les fonctions du serveur les plus présentes pendant les intervalles `gels` ([début, fin] en ms, horloge de
 * performance.now()), dans un profil du processeur. `decalage` : performance.now() en µs moins l'horloge du profil.
 * Temps inclusif (une fonction comptée une fois par échantillon), le temps propre du haut de pile en secours.
 */
export function coupables(profil, gels, decalage, { max = 6 } = {}) {
  const noeuds = new Map(profil.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profil.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const nom = (n) => {
    const cf = n.callFrame;
    const fichier = String(cf.url || '').replace(/^.*?\/(server\/)/, '$1');
    return `${cf.functionName || '(anonyme)'}${fichier ? ` ${fichier}:${cf.lineNumber + 1}` : ''}`;
  };
  const inclus = new Map();
  const propre = new Map();
  let t = profil.startTime;
  let total = 0;
  profil.samples.forEach((id, i) => {
    const dt = profil.timeDeltas[i] || 0;
    t += dt;
    const ms = (t + decalage) / 1000;
    if (!gels.some(([a, b]) => ms >= a && ms <= b)) return;
    total += dt;
    const haut = noeuds.get(id);
    if (haut) propre.set(nom(haut), (propre.get(nom(haut)) || 0) + dt);
    const vus = new Set();
    for (let x = id; x != null; x = parent.get(x)) {
      const n = noeuds.get(x);
      if (!n || !/server\//.test(n.callFrame.url || '') || /node_modules/.test(n.callFrame.url || '')) continue;
      const k = nom(n);
      if (vus.has(k)) continue;
      vus.add(k);
      inclus.set(k, (inclus.get(k) || 0) + dt);
    }
  });
  const tri = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const serveur = tri(inclus).slice(0, max);
  const hauts = tri(propre).filter(([k]) => !/^\((idle|program)\)/.test(k)).slice(0, 3);
  return { total_ms: Math.round(total / 1000), serveur: serveur.map(([k, us]) => [k, Math.round(us / 1000)]), propre: hauts.map(([k, us]) => [k, Math.round(us / 1000)]) };
}

const secondes = (ms) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;

/** Pure : la ligne du journal d'une fenêtre qui a gelé. */
export function ligneGel(gels, c, maintenant = new Date()) {
  const plusLong = gels.reduce((a, g) => (g[1] - g[0] > a[1] - a[0] ? g : a));
  const heure = new Date(maintenant.getTime() - (performance.now() - plusLong[0])).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' });
  const qui = c.serveur.length ? c.serveur.map(([k, ms]) => `${k} ${secondes(ms)}`).join(' · ') : `hors du code du serveur : ${c.propre.map(([k, ms]) => `${k} ${secondes(ms)}`).join(' · ') || 'inconnu'}`;
  return `[gel] ${secondes(plusLong[1] - plusLong[0])} à ${heure}${gels.length > 1 ? ` (${gels.length} gels dans la minute)` : ''} · ${qui}`;
}

let session = null;
export async function demarrerGels() {
  if (session || process.env.NODE_TEST_CONTEXT) return false;
  if (!process.env.RENDER && process.env.KLOCKA_GELS !== '1') return false;
  session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.setSamplingInterval', { interval: 10_000 });
  await session.post('Profiler.start');
  let gels = [];
  let dernier = performance.now();
  const sonde = setInterval(() => {
    const n = performance.now();
    if (n - dernier > SEUIL_MS) gels.push([dernier, n]);
    dernier = n;
  }, PAS_MS);
  sonde.unref?.();
  const fenetre = setInterval(async () => {
    try {
      const { profile } = await session.post('Profiler.stop');
      const arret = performance.now();
      await session.post('Profiler.start');
      const lus = gels;
      gels = [];
      if (!lus.length) return;
      const c = coupables(profile, lus, arret * 1000 - profile.endTime);
      console.warn(ligneGel(lus, c));
    } catch (e) {
      console.warn('[gel] profil illisible :', e?.message || e);
    }
  }, FENETRE_MS);
  fenetre.unref?.();
  return true;
}
