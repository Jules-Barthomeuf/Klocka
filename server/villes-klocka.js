// Les villes Klocka : celles où Klocka cherche pour ses investisseurs, dans
// toute la France, tenues par l'équipe (Mandataires, onglet Villes Klocka).
// L'agent IA de chaque mandataire les lit d'abord, dans son secteur, et le
// mandataire ne peut pas les décocher ; il y ajoute les autres communes de son
// secteur qu'il veut travailler pour son activité. Gardées par code INSEE.

import { Meta } from './db.js';

const CLE = 'villes-klocka';
const API_GEO = 'https://geo.api.gouv.fr';
export const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Tant que l'équipe n'a rien réglé, la liste part de Lyon (décision de Jules, 5 oct. 2026).
const DEPART = [{ nom: 'Lyon', code: '69123', departement: '69', population: 519127 }];

export function villesKlocka() {
  const brut = Meta.get(CLE);
  if (brut == null) return DEPART;
  try { return JSON.parse(brut); } catch { return []; }
}
const poser = (villes) => Meta.set(CLE, JSON.stringify(villes));

export function ajouterVilleKlocka({ nom, code, departement = null, population = null } = {}, user = null) {
  if (!nom || !/^[0-9AB]{5}$/i.test(String(code || ''))) return { ok: false, error: 'Choisissez une commune dans la liste.' };
  const villes = [...villesKlocka()];
  if (villes.some((v) => v.code === code)) return { ok: true, villes };
  villes.push({ nom: String(nom).slice(0, 80), code: String(code).toUpperCase(), departement: departement ? String(departement).slice(0, 4) : null, population: Number(population) || null, ajoutee_le: new Date().toISOString(), ajoutee_par: user?.email || null });
  villes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  poser(villes);
  return { ok: true, villes };
}

export function retirerVilleKlocka(code) {
  const villes = villesKlocka().filter((v) => v.code !== code);
  poser(villes);
  return { ok: true, villes };
}

/** Les communes de France dont le nom commence par `q` (API Géo), les plus peuplées d'abord. */
export async function chercherCommunes(q) {
  const t = String(q || '').trim();
  if (t.length < 2) return [];
  const r = await fetch(`${API_GEO}/communes?nom=${encodeURIComponent(t)}&fields=nom,code,codeDepartement,population&boost=population&limit=8`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("L'annuaire des communes ne répond pas.");
  return (await r.json()).map((c) => ({ nom: c.nom, code: c.code, departement: c.codeDepartement || null, population: c.population || null }));
}

/**
 * Pure : les communes d'un secteur rangées pour l'agent. Les villes Klocka
 * du secteur (toujours lues), puis les autres, cochées ou non par le
 * mandataire. Une commune se reconnaît à son code, ou à son nom faute de code.
 */
export function rangerCommunes(communes, klocka, choisies = []) {
  const codesK = new Set(klocka.map((v) => v.code));
  const nomsK = new Set(klocka.map((v) => norm(v.nom)));
  const estK = (c) => (c.code ? codesK.has(c.code) : nomsK.has(norm(c.nom)));
  const coche = new Set((choisies || []).map(String));
  const coch = (c) => coche.has(c.code || '') || coche.has(norm(c.nom));
  return {
    klocka: communes.filter(estK),
    autres: communes.filter((c) => !estK(c)).map((c) => ({ ...c, choisie: coch(c) })),
  };
}
