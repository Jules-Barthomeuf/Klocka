// La carte de Klocka (22 oct. 2026, Jules : « une carte de France interactive avec tous les points : où on a des
// projets, où on a prospecté, où sont nos clients, où on a fait des deals ; tu peux tout trouver dans Monday »).
// Quatre couches, chacune avec sa source :
//   - projets     : les projets de la plateforme (leurs coordonnées, sinon leur ville) ;
//   - prospection : les agents immobiliers du tableau Monday « Agent immobilier », regroupés par ville, avec leur statut ;
//   - clients     : les investisseurs du tableau Monday « Investisseurs » (leur localisation, en France ou ailleurs) ;
//   - deals       : les biens « Vendu » du tableau « Propriétés », et les clients « Projet Signé ».
// Les colonnes « location » de Monday portent déjà leurs coordonnées ; une ville seule se géolocalise
// (geo.api.gouv.fr en France, Nominatim ailleurs), une fois, gardée en mémoire. La carte entière se garde 30 minutes.

import { Records, Meta } from './db.js';
import { lienMonday } from './monday.js';

const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const GARDE_MS = 30 * 60 * 1000;
const STATUTS_DEAL_BIEN = new Set(['Vendu']);
const STATUTS_DEAL_CLIENT = new Set(['Projet Signé']);

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Pure : la ville d'une adresse française (« 10 Place Abel Surchamp, 33500 Libourne » → « Libourne »). */
export function villeDeLAdresse(adresse) {
  const t = String(adresse || '');
  const m = t.match(/\b\d{5}\s+([^,]+?)(?:,|$)/);
  if (m) return m[1].trim();
  // « …, Saint-Brieuc, 22000, France » : ni le pays ni le code postal seul ne sont une ville.
  const morceaux = t.split(',').map((x) => x.trim()).filter((x) => x && !/^france$/i.test(x) && !/^\d{5}$/.test(x));
  return morceaux.length > 1 ? morceaux[morceaux.length - 1] : null;
}

/** Pure : une ville saisie à la main, nettoyée (« Paris et ses environs » → « Paris », « fréjus » → « fréjus »). */
export const villePropre = (v) => String(v || '').replace(/\s+et\s+(ses\s+)?environs.*$/i, '').replace(/\(.*?\)/g, '').split(/[/,;]/)[0].trim();

let derniereNominatim = 0;
/**
 * Les coordonnées d'un lieu (une ville, ou « Londres, Royaume-Uni ») : en France d'abord, ailleurs sinon. Gardées.
 * `monde` : un client peut être à New York ; un projet ou un agent est en France (DOM compris), et un nom
 * qui n'y est pas ne doit pas finir en Inde (« Huriya ») ou à Los Angeles (« Alsace »).
 */
export async function geolocaliser(lieu, { monde = false } = {}) {
  const q = String(lieu || '').trim();
  if (!q) return null;
  const cle = `carte:geo:${monde ? '' : 'fr:'}${norm(q)}`;
  try { const g = JSON.parse(Meta.get(cle) || 'null'); if (g !== null) return g.lat == null ? null : g; } catch { /* relire */ }
  let point = null;
  const etranger = monde && /,\s*(?!france\b)[^,]+$/i.test(q);
  if (!etranger) {
    try {
      const r = await fetch(`https://geo.api.gouv.fr/communes?${new URLSearchParams({ nom: villePropre(q), fields: 'centre,nom', boost: 'population', limit: '1' })}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
      const c = (await r.json())?.[0];
      if (c?.centre?.coordinates) point = { lat: c.centre.coordinates[1], lon: c.centre.coordinates[0], nom: c.nom };
    } catch { /* on essaie ailleurs */ }
  }
  if (!point) {
    // Nominatim : une requête par seconde au plus, comme le demande sa politique d'usage.
    const attente = 1100 - (Date.now() - derniereNominatim);
    if (attente > 0) await new Promise((ok) => setTimeout(ok, attente));
    derniereNominatim = Date.now();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', limit: '1', ...(monde ? {} : { countrycodes: 'fr' }) })}`, { headers: { 'user-agent': UA, 'accept-language': 'fr' }, signal: AbortSignal.timeout(10000) });
      const x = (await r.json())?.[0];
      if (x) point = { lat: Number(x.lat), lon: Number(x.lon), nom: String(x.display_name || q).split(',')[0] };
    } catch { /* inconnu */ }
  }
  try { Meta.set(cle, JSON.stringify(point || { lat: null })); } catch { /* cache facultatif */ }
  return point;
}

/** Pure : les coordonnées d'une valeur de colonne Monday « location » ({ lat, lng, address }), ou null. */
export function pointMonday(valeur) {
  try {
    const v = typeof valeur === 'string' ? JSON.parse(valeur) : valeur;
    const lat = Number(v?.lat);
    const lon = Number(v?.lng);
    return Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? { lat, lon } : null;
  } catch { return null; }
}

/** Un tableau Monday lu avec la valeur brute de ses colonnes (les coordonnées des colonnes « location »). */
async function lireAvecValeurs(boardId) {
  const { requeteMonday, colonnesDuTableau, crmTwenty, lireTableau } = await import('./monday.js');
  const colonnes = await colonnesDuTableau(boardId);
  const par = (titre) => colonnes.find((c) => c.title === titre)?.id || null;
  // Twenty (27 oct. 2026) : les lignes et leurs coordonnées viennent de l'adaptateur, sans requête brute.
  if (crmTwenty()) {
    const lu = await lireTableau(boardId, 5000);
    return { lignes: lu.map((l) => ({ id: l.id, nom: l.nom, cols: Object.fromEntries(Object.entries(l.colonnes).map(([k, text]) => [k, { id: k, text, value: l.valeurs?.[k] || null }])) })), par };
  }
  const lignes = [];
  let curseur = null;
  for (let page = 0; page < 10; page += 1) {
    const d = curseur
      ? await requeteMonday('query ($c: String!) { next_items_page(cursor: $c, limit: 500) { cursor items { id name column_values { id text value type } } } }', { c: curseur })
      : await requeteMonday('query ($b: ID!) { boards(ids: [$b]) { items_page(limit: 500) { cursor items { id name column_values { id text value type } } } } }', { b: String(boardId) });
    const p = curseur ? d?.next_items_page : d?.boards?.[0]?.items_page;
    for (const it of p?.items || []) lignes.push({ id: it.id, nom: it.name, cols: Object.fromEntries((it.column_values || []).map((c) => [c.id, c])) });
    curseur = p?.cursor || null;
    if (!curseur) break;
  }
  return { lignes, par };
}

const lien = (tableau, id) => lienMonday(tableau, id);

async function coucheProjets() {
  const points = [];
  for (const p of Records.list('Project').filter((x) => !x.archived)) {
    let pos = Number(p.latitude) && Number(p.longitude) ? { lat: Number(p.latitude), lon: Number(p.longitude) } : null;
    // La ville de l'adresse d'abord (code postal à l'appui), le champ « ville / secteur » ensuite.
    const villes = [...new Set([villeDeLAdresse(p.adresse_complete), p.ville_secteur_champ1].filter(Boolean))];
    for (const v of villes) { if (pos) break; pos = await geolocaliser(v); }
    const ville = villes[0] || null;
    if (pos) points.push({ id: p.id, lat: pos.lat, lon: pos.lon, titre: p.titre || 'Projet', sous: [ville, p.statut === 'signe' ? 'signé' : null].filter(Boolean).join(' · '), lien: `/Projets?id=${p.id}` });
  }
  return points;
}

async function coucheProspection() {
  const tableau = (process.env.MONDAY_BOARD_AGENTS || '').trim();
  if (!tableau) return [];
  const { lignes, par } = await lireAvecValeurs(tableau);
  const cVille = par('Ville');
  const cStatut = par('Statut');
  const parVille = new Map();
  for (const l of lignes) {
    const ville = villePropre(l.cols[cVille]?.text);
    if (!ville) continue;
    const k = norm(ville);
    const g = parVille.get(k) || { ville, n: 0, statuts: {} };
    g.n += 1;
    const s = l.cols[cStatut]?.text || 'Sans statut';
    g.statuts[s] = (g.statuts[s] || 0) + 1;
    parVille.set(k, g);
  }
  const points = [];
  for (const g of parVille.values()) {
    const pos = await geolocaliser(g.ville);
    if (!pos) continue;
    const detail = Object.entries(g.statuts).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${n} ${s.toLowerCase()}`).join(', ');
    points.push({ id: `ville:${norm(g.ville)}`, lat: pos.lat, lon: pos.lon, titre: `${pos.nom || g.ville} · ${g.n} agent${g.n > 1 ? 's' : ''}`, sous: detail, poids: g.n, lien: '/Prospection' });
  }
  return points;
}

async function coucheClientsEtDeals() {
  const clients = [];
  const deals = [];
  const inv = (process.env.MONDAY_BOARD_INVESTISSEURS || '').trim();
  if (inv) {
    const { lignes, par } = await lireAvecValeurs(inv);
    const cLoc = par('Localisation');
    const cStatut = par('Statut Client');
    for (const l of lignes) {
      const loc = l.cols[cLoc];
      let pos = pointMonday(loc?.value);
      if (!pos && loc?.text) pos = await geolocaliser(loc.text, { monde: true });
      if (!pos) continue;
      const statut = l.cols[cStatut]?.text || null;
      const point = { id: `client:${l.id}`, lat: pos.lat, lon: pos.lon, titre: l.nom, sous: [loc?.text, statut].filter(Boolean).join(' · '), lien: lien(inv, l.id) };
      clients.push(point);
      if (STATUTS_DEAL_CLIENT.has(statut)) deals.push({ ...point, id: `deal-client:${l.id}`, sous: `Client · ${point.sous}` });
    }
  }
  const prop = (process.env.MONDAY_BOARD_PROPRIETES || '').trim();
  if (prop) {
    const { lignes, par } = await lireAvecValeurs(prop);
    const cAdr = par('Adresse');
    const cStatut = par('Statut');
    for (const l of lignes) {
      const statut = l.cols[cStatut]?.text || null;
      if (!STATUTS_DEAL_BIEN.has(statut)) continue;
      const adr = l.cols[cAdr];
      let pos = pointMonday(adr?.value);
      if (!pos) { const v = villeDeLAdresse(adr?.text); if (v) pos = await geolocaliser(v); }
      if (pos) deals.push({ id: `deal:${l.id}`, lat: pos.lat, lon: pos.lon, titre: l.nom, sous: [adr?.text, statut].filter(Boolean).join(' · '), lien: lien(prop, l.id) });
    }
  }
  return { clients, deals };
}

let enCours = null;
/** Les quatre couches de la carte, gardées 30 minutes (`frais` : relire tout). */
export async function carte({ frais = false } = {}) {
  const cle = 'carte:couches';
  if (!frais) { try { const c = JSON.parse(Meta.get(cle) || 'null'); if (c && Date.now() - c.le < GARDE_MS) return c; } catch { /* relire */ } }
  if (enCours) return enCours;
  enCours = (async () => {
    const erreurs = [];
    const sur = async (nom, f, vide) => { try { return await f(); } catch (e) { erreurs.push(`${nom} : ${String(e?.message || e).slice(0, 160)}`); return vide; } };
    const [projets, prospection, cd] = await Promise.all([
      sur('projets', coucheProjets, []),
      sur('prospection', coucheProspection, []),
      sur('clients et deals', coucheClientsEtDeals, { clients: [], deals: [] }),
    ]);
    const r = { le: Date.now(), projets, prospection, clients: cd.clients, deals: cd.deals, erreurs };
    try { Meta.set(cle, JSON.stringify(r)); } catch { /* cache facultatif */ }
    return r;
  })().finally(() => { enCours = null; });
  return enCours;
}
