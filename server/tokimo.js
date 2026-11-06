// Tokimo (6 nov. 2026, Jules) : le module d'analyse des opérations présentées à Tokimo, page à part de tout le
// reste (ni projet, ni dossier, ni bien). Une analyse est une saisie (src/lib/tokimo-bilan.js en fait le bilan)
// et ce qu'on a lu à partir de son adresse : le point, la parcelle cadastrale, les ventes DVF alentour.
//
// DVF, ici, parle de résidentiel : Tokimo finance des marchands de biens, et leur grille compare la maison à
// celles qui se sont vendues dans le même code postal. Les fichiers sont ceux du module commerce (server/dvf.js),
// lus autrement.

import { Records } from './db.js';
import { resoudreAdresse } from './adresse-ban.js';
import { departementDe, distanceM, lireCsv, telechargerFichiers } from './dvf.js';
import { parcellesAutour } from './kfoncier.js';
import { bilan, completer, saisieVide } from '../src/lib/tokimo-bilan.js';

const ENTITE = 'AnalyseTokimo';
const SANS_DVF = { 57: 'la Moselle', 67: 'le Bas-Rhin', 68: 'le Haut-Rhin', 976: 'Mayotte' };
const PRIX_PLANCHER = 1000;
const DVF_MAX = 12;
// Le 54610 en compte une vingtaine (Nomeny, Raucourt, Thézey…) : des villages, des fichiers légers.
const COMMUNES_MAX = 25;
// Sous 40 % de la médiane, ce n'est pas le marché : vente en famille, ruine, part indivise.
const PART_MEDIANE_MIN = 0.4;

const nombre = (v) => {
  const x = Number(String(v ?? '').trim());
  return Number.isFinite(x) ? x : 0;
};

/**
 * Pure : les ventes d'un seul logement du type demandé (« Maison » ou « Appartement »), garage et terrain compris,
 * à un vrai prix et avec une surface. DVF écrit une ligne par local et par parcelle : un même logement revient
 * autant de fois que la vente compte de parcelles, d'où le dédoublonnage.
 */
export function ventesResidentielles(lignes, type) {
  const parMutation = new Map();
  for (const l of lignes) {
    if (!l.id_mutation) continue;
    if (!parMutation.has(l.id_mutation)) parMutation.set(l.id_mutation, []);
    parMutation.get(l.id_mutation).push(l);
  }
  const ventes = [];
  for (const [id, lot] of parMutation) {
    if (lot[0].nature_mutation !== 'Vente') continue;
    if (lot.some((l) => l.type_local && l.type_local !== type && l.type_local !== 'Dépendance')) continue;
    const logements = new Map();
    for (const l of lot.filter((x) => x.type_local === type)) logements.set(`${l.surface_reelle_bati}|${l.nombre_pieces_principales || ''}`, l);
    if (logements.size !== 1) continue;
    const [logement] = logements.values();
    const prix = nombre(lot[0].valeur_fonciere);
    const surface = nombre(logement.surface_reelle_bati);
    if (prix < PRIX_PLANCHER || !surface) continue;
    const parcelles = new Map(lot.map((l) => [l.id_parcelle, nombre(l.surface_terrain)]));
    const voie = [logement.adresse_numero, logement.adresse_suffixe, logement.adresse_nom_voie].filter(Boolean).join(' ').trim();
    ventes.push({
      id,
      date: lot[0].date_mutation,
      adresse: [voie, logement.nom_commune].filter(Boolean).join(', '),
      typologie: type,
      surface,
      terrain: [...parcelles.values()].reduce((t, x) => t + x, 0) || null,
      prix,
      lat: Number(logement.latitude) || null,
      lon: Number(logement.longitude) || null,
    });
  }
  return ventes;
}

/** Les communes d'un code postal (Mailly-sur-Seille, Nomeny, Abaucourt… partagent le 54610). */
async function communesDuCodePostal(cp) {
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(cp)}&fields=code,nom`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    return (await r.json()).map((c) => ({ code: c.code, nom: c.nom }));
  } catch { return []; }
}

/** Pure : le polygone contient-il le point ? (lancer de rayon, sur le premier anneau) */
export function contient(geometry, lat, lon) {
  const polygones = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  return polygones.some((p) => {
    const a = p[0] || [];
    let dedans = false;
    for (let i = 0, j = a.length - 1; i < a.length; j = i++) {
      const [xi, yi] = a[i];
      const [xj, yj] = a[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
    }
    return dedans;
  });
}

/**
 * Ce que l'adresse apprend : le point, la parcelle qui le porte et ses voisines (pour la carte), puis les ventes
 * DVF du même type dans les communes du code postal, les plus proches en surface d'abord.
 */
export async function lireAdresse(texte, { typologie = 'Maison', surface = 0 } = {}) {
  const adresse = await resoudreAdresse(texte).catch(() => null);
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const point = { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, code_postal: adresse.code_postal, ville: adresse.ville };

  const [parcelles, dvf] = await Promise.all([
    parcellesAutour(adresse.lat, adresse.lon, 80).catch((e) => ({ erreur: e?.message || String(e) })),
    ventesDuSecteur(adresse, typologie, surface),
  ]);
  const liste = Array.isArray(parcelles) ? parcelles : [];
  const ici = liste.find((p) => contient(p.geometry, adresse.lat, adresse.lon)) || null;
  return {
    ok: true,
    point,
    parcelles: liste,
    parcelle: ici ? { idu: ici.idu, section: ici.section, numero: ici.numero, contenance: ici.contenance } : null,
    erreur_parcelles: Array.isArray(parcelles) ? null : parcelles.erreur,
    dvf,
  };
}

async function ventesDuSecteur(adresse, typologie, surface) {
  const dep = departementDe(adresse.code_insee);
  if (SANS_DVF[dep]) return { ok: false, error: `DVF ne couvre pas ${SANS_DVF[dep]} : la publicité foncière y relève du Livre foncier.` };
  const communes = (await communesDuCodePostal(adresse.code_postal)).slice(0, COMMUNES_MAX);
  if (!communes.some((c) => c.code === adresse.code_insee)) communes.unshift({ code: adresse.code_insee, nom: adresse.ville });
  const lots = await Promise.all(communes.map((c) => telechargerFichiers(departementDe(c.code), c.code).catch(() => [])));
  // Les trois derniers millésimes publiés : au-delà, le prix d'une maison de village ne dit plus le marché.
  const annees = [...new Set(lots.flat().map((m) => m.annee))].sort((a, b) => b - a).slice(0, 3);
  const lignes = lots.flat().filter((m) => annees.includes(m.annee)).flatMap((m) => lireCsv(m.texte));
  const s = Number(surface) || 0;
  const toutes = ventesResidentielles(lignes, typologie);
  const parM2 = toutes.map((v) => v.prix / v.surface).sort((a, b) => a - b);
  const mediane = parM2.length ? parM2[Math.floor(parM2.length / 2)] : 0;
  const ventes = toutes
    .filter((v) => v.prix / v.surface >= mediane * PART_MEDIANE_MIN)
    .map((v) => ({ ...v, distance_m: v.lat ? Math.round(distanceM(adresse.lat, adresse.lon, v.lat, v.lon)) : null }))
    .filter((v) => !s || (v.surface >= s * 0.5 && v.surface <= s * 1.5))
    .sort((a, b) => (s ? Math.abs(a.surface - s) - Math.abs(b.surface - s) : 0) || String(b.date).localeCompare(String(a.date)))
    .slice(0, DVF_MAX)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { ok: true, communes: communes.map((c) => c.nom), annees, ventes };
}

/** Une ligne de la liste : de quoi reconnaître l'analyse et juger d'un coup d'œil. */
function resume(a) {
  const b = bilan(a.saisie);
  return {
    id: a.id,
    nom: a.nom,
    adresse: a.saisie?.adresse || '',
    collecte: b.collecte,
    marge: b.performance.cible.marge,
    marge_pr: b.performance.cible.sur_pr,
    ltv: b.exposition.ltv,
    updated_date: a.updated_date,
    created_by: a.created_by,
  };
}

export const lister = () => Records.list(ENTITE, { sort: '-updated_date' }).map(resume);
export const lire = (id) => Records.get(ENTITE, id);

export function creer(user, { nom = '', saisie = null } = {}) {
  return Records.create(ENTITE, { nom: String(nom || '').trim() || 'Nouvelle analyse', saisie: completer(saisie || saisieVide()), lu: null }, user?.email);
}

export function enregistrer(id, { nom, saisie, lu }) {
  const patch = {};
  if (nom != null) patch.nom = String(nom).trim() || 'Sans nom';
  if (saisie) patch.saisie = completer(saisie);
  if (lu !== undefined) patch.lu = lu;
  return Records.update(ENTITE, id, patch);
}

export const supprimer = (id) => Records.delete(ENTITE, id);
