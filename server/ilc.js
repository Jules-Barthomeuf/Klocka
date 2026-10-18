// L'indice des loyers commerciaux (ILC), pour ramener un loyer d'hier à aujourd'hui (18 oct. 2026, valeur
// locative par comparables). Source : INSEE, Banque de données macro-économiques, série 001532540
// « Indice des loyers commerciaux (ILC) - Base 100 au 1er trimestre 2008 », service SDMX public
// (www.bdm.insee.fr/series/sdmx, sans clé). Trimestriel ; gardé trente jours dans `meta`.

import { Meta } from './db.js';

export const SERIE_ILC = '001532540';
const URL_ILC = `https://www.bdm.insee.fr/series/sdmx/data/SERIES_BDM/${SERIE_ILC}`;
const CLE = 'ilc.indices';
const JOURS_GARDE = 30;

/** Pure : les observations d'une réponse SDMX, triées : [{ periode: '2026-Q2', valeur, publie_le }]. */
export function parserIlc(xml) {
  const obs = [];
  for (const m of String(xml || '').matchAll(/<Obs\b([^>]*)\/?>/g)) {
    const attr = (k) => (m[1].match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
    const periode = attr('TIME_PERIOD');
    const valeur = Number(attr('OBS_VALUE'));
    if (/^\d{4}-Q[1-4]$/.test(periode || '') && Number.isFinite(valeur)) obs.push({ periode, valeur, publie_le: attr('DATE_JO') || null });
  }
  return obs.sort((a, b) => a.periode.localeCompare(b.periode));
}

/** Pure : le trimestre d'une date (« 2026-Q2 »), ou null. */
export function trimestreDe(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * Pure : le facteur qui ramène un loyer daté au dernier indice publié. Le trimestre du loyer, ou le
 * dernier publié avant lui. Sans date ou sans indice : facteur 1, `actualise: false`.
 */
export function facteurIlc(date, indices = []) {
  const dernier = indices[indices.length - 1];
  const t = trimestreDe(date);
  if (!dernier || !t) return { facteur: 1, actualise: false };
  const depart = [...indices].reverse().find((x) => x.periode <= t) || indices[0];
  if (!depart || depart.periode >= dernier.periode) return { facteur: 1, actualise: false, de: depart?.periode || null, a: dernier.periode };
  return { facteur: Math.round((dernier.valeur / depart.valeur) * 10000) / 10000, actualise: true, de: depart.periode, a: dernier.periode };
}

/** Pure : les références Klocka ramenées à aujourd'hui ; le loyer d'origine reste à côté. */
export function actualiserReferences(refs, indices) {
  return refs.map((r) => {
    const f = facteurIlc(r.le, indices);
    if (!f.actualise) return { ...r, ilc: f };
    return { ...r, loyer_m2_brut: r.loyer_m2, loyer_m2: Math.round(r.loyer_m2 * f.facteur * 10) / 10, ilc: f };
  });
}

/** Les indices ILC, de la mémoire s'ils ont moins de trente jours, sinon de l'INSEE. Vide en cas de panne. */
export async function indicesIlc({ fetcher = fetch } = {}) {
  let garde = null;
  try { garde = JSON.parse(Meta.get(CLE) || 'null'); } catch { garde = null; }
  if (garde?.indices?.length && Date.now() - Date.parse(garde.le) < JOURS_GARDE * 86400000) return garde.indices;
  try {
    const r = await fetcher(URL_ILC, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`INSEE ${r.status}`);
    const indices = parserIlc(await r.text());
    if (!indices.length) throw new Error('aucune observation');
    Meta.set(CLE, JSON.stringify({ le: new Date().toISOString(), indices }));
    return indices;
  } catch (e) {
    console.warn(`[ilc] lecture impossible : ${e?.message || e}`);
    return garde?.indices || [];
  }
}
