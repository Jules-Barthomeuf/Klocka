// K-Vacance, une adresse (19 oct. 2026, Jules : « remplace K-Vacance par les Signaux de vacance, mais garde le nom »).
//
// K-Vacance est désormais la carte des signaux publics (BODACC, SIRENE) et le taux de vacance (recensement des
// locaux à vitrine, état de chacun). Cette fonction rend, pour une adresse, ce que la page montre : les signaux
// autour, le taux de la zone, les locaux vides avec la raison écrite de chacun. Elle sert au composeur du tableau
// de bord, à l'assistant et au format commun ; la page lit les mêmes routes.
//
// Chaque local porte sa raison (« le dernier occupant X a fermé le … ; aucun commerce n'y est ouvert depuis, ni
// au registre ni sur Google Maps ») : c'est ce qui permet de vérifier à la main (voir scripts/vacance-verifier.mjs).

import { resoudreLocal } from '../socle/local.js';
import { rechercher } from '../outils/vacance.js';
import { tauxDeVacance } from '../outils/vacance-taux.js';

const ATTENTE_MAX_MS = 8 * 60 * 1000;
const SONDAGE_MS = 4000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Appelle `lire` jusqu'à ce qu'il ne réponde plus « en chargement » (202), ou jusqu'au délai. */
async function attendre(lire) {
  const debut = Date.now();
  let r = await lire();
  while (r?.statut === 202 && Date.now() - debut < ATTENTE_MAX_MS) { await pause(SONDAGE_MS); r = await lire(); }
  return r;
}

/** Pure : ce qu'il faut garder des signaux d'une recherche : le total, la répartition, les plus forts. */
export function resumerSignaux(s) {
  const features = Array.isArray(s?.features) ? s.features : [];
  const FORCE = { liquidation: 0, redressement: 1, sauvegarde: 1, radiation: 2, cession: 2, fermeture: 3 };
  const forts = [...features]
    .sort((a, b) => (FORCE[a.signal_principal?.type] ?? 9) - (FORCE[b.signal_principal?.type] ?? 9) || String(b.signal_principal?.date || '').localeCompare(String(a.signal_principal?.date || '')))
    .slice(0, 8)
    .map((f) => ({ denomination: f.enseigne || f.denomination || null, adresse: f.adresse || null, distance_m: f.distance_m ?? null, signal: f.signal_principal?.type || null, date: f.signal_principal?.date || null, siret: f.siret || null, signaux: (f.signaux || []).length }));
  return { total: s?.total ?? features.length, tronque: !!s?.tronque, repartition: s?.repartition || null, plus_forts: forts };
}

/** Pure : les locaux vides d'un taux, avec leur raison, les plus proches d'abord. */
export function locauxVides(taux, max = 12) {
  return (taux?.locaux || []).filter((l) => l.etat === 'vacant').sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9)).slice(0, max)
    .map((l) => ({ adresse: l.adresse, distance_m: l.distance_m ?? null, confiance: l.confiance, raison: l.raison, dernier: l.dernier || null, lat: l.lat, lon: l.lon }));
}

/**
 * K-Vacance pour une adresse : les signaux et le taux, autour d'elle.
 * @returns {Promise<{ok: true, ...} | {ok: false, error: string}>}
 */
export async function vacanceDeLAdresse(texte, { rayon = 300, user = null } = {}) {
  const l = await resoudreLocal(texte);
  if (!l.ok) return { ok: false, error: l.error };
  const { id_local, point, adresse } = l.local;
  if (!adresse.code_insee) return { ok: false, error: "Commune inconnue : l'adresse n'a pas de code INSEE." };
  const base = { commune: adresse.code_insee, cp: adresse.code_postal || undefined, nom: adresse.ville || undefined, lat: point.lat, lon: point.lon, rayon_m: Math.round(Number(rayon) || 300) };

  const s = await attendre(() => rechercher({ ...base, rayon_m: Math.max(base.rayon_m, 250) }, { par: user?.email || null }));
  if (!s?.ok) return { ok: false, error: s?.error || 'Les signaux de la commune ne se sont pas chargés.' };
  const t = await attendre(() => tauxDeVacance(base));
  // Un taux qui ne se calcule pas (OpenStreetMap injoignable) n'efface pas les signaux : on les rend, le taux dit pourquoi il manque.
  const taux = t?.ok ? t : null;
  return {
    ok: true,
    id_local,
    point: { lat: point.lat, lon: point.lon, label: adresse.label, code_insee: adresse.code_insee },
    rayon_m: base.rayon_m,
    commune: s.zone ? { nom: s.zone.nom || adresse.ville, chargee_le: s.zone.chargee_le || null } : null,
    signaux: resumerSignaux(s),
    taux: taux ? { ...taux.taux, rues: (taux.rues || []).slice(0, 6), recense_le: taux.recense_le || null, osm: taux.osm || null, google: taux.google || null, parametres: taux.parametres || null } : null,
    taux_erreur: taux ? null : t?.error || 'Le taux de vacance ne s\'est pas calculé.',
    locaux_vides: locauxVides(taux),
    nb_locaux_vides: taux ? (taux.locaux || []).filter((x) => x.etat === 'vacant').length : null,
    le: new Date().toISOString(),
  };
}
