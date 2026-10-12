// Off-market : les filtres de la recherche, partagés par l'écran et le serveur
// (les listes dynamiques se rejouent avec les mêmes règles). Tout est pur et
// travaille sur la forme compacte d'un local (voir server/off-market/locaux.js).
//
// L'organisation reprend celle de PropStream (10 oct. 2026) : un bandeau de
// listes rapides, puis des familles de critères, chacune avec le nombre de
// critères actifs ; le compteur se recalcule pendant qu'on filtre.

export const FILTRES_VIDES = Object.freeze({
  cherche: "",
  rapides: [],
  // Le local
  emplacements: [], activite: "", occupe: "any", surface_min: null, surface_max: null,
  // Scores
  motivation_min: 0, fit_min: 0, familles_min: 0,
  // Propriétaire et occupation
  profils: [], confiance: "any", detention_min: null, detention_max: null, siege_loin: "any", murs_min: null, murs_max: null, gerants: [], demembrement: "any",
  // Événements BODACC
  evenements: [],
  // Valeur et détention
  mutation_depuis: null, mutation_avant: null, prix_min: null, prix_max: null, valeur_min: null, valeur_max: null, rendement_min: null, rendement_max: null, seuils: [],
  // Suivi
  jamais_contacte: false, statuts: [],
  // La zone tracée sur la carte : [[lat, lon], …]
  polygone: null,
});

/** Les listes rapides du bandeau : une clé, un libellé, et la règle sur un local compact. */
export const RAPIDES = [
  { cle: "sci_ancienne", nom: "SCI anciennes", aide: "SCI qui détient ces murs depuis 15 ans ou plus", test: (l) => /^sci/.test(l.profil?.cle || "") && (l.detention_annees ?? 0) >= 15 },
  { cle: "gerant_70", nom: "Gérant 70+", aide: "Gérant de 70 ans ou plus au registre", test: (l) => l.gerant_tranche === "70+" },
  { cle: "succession", nom: "Succession probable", aide: "Décès d'un dirigeant annoncé au BODACC", test: (l) => l.signaux.includes("deces_dirigeant") },
  { cle: "liquidation", nom: "SCI en liquidation", aide: "Société propriétaire dissoute, radiée ou en procédure", test: (l) => l.signaux.includes("dissolution") || l.signaux.includes("proprietaire_procedure") },
  { cle: "locataire_procedure", nom: "Locataire en procédure", aide: "L'occupant est en sauvegarde, redressement ou liquidation", test: (l) => l.signaux.includes("locataire_procedure") },
  { cle: "vacant", nom: "Murs vacants", aide: "Vitrine vide ou commerce fermé", test: (l) => l.occupe === false || l.signaux.includes("occupant_ferme") },
  { cle: "marchand_recent", nom: "Marchand de biens récent", aide: "Acheté par un marchand de biens il y a moins de deux ans", test: (l) => l.signaux.includes("marchand_recent") },
  { cle: "plus_value", nom: "Plus-value exonérée", aide: "Détenu depuis 22 ans (impôt) ou 30 ans (prélèvements sociaux)", test: (l) => (l.detention_annees ?? 0) >= 22 },
  { cle: "demande", nom: "Demande cliente", aide: "Au moins un mandat investisseur correspond", test: (l) => (l.demande_n || 0) > 0 },
];

/** Pure : les listes rapides auxquelles un local appartient. */
export const rapidesDe = (l) => RAPIDES.filter((r) => r.test(l)).map((r) => r.cle);

/** Pure : l'effectif de chaque liste rapide sur un territoire. */
export function compterRapides(locaux) {
  const n = Object.fromEntries(RAPIDES.map((r) => [r.cle, 0]));
  for (const l of locaux) for (const c of l.rapides || rapidesDe(l)) n[c] += 1;
  return n;
}

/** Les familles de critères, dans l'ordre du panneau, avec les champs qu'elles portent. */
export const FAMILLES_FILTRES = [
  { cle: "rapides", nom: "Listes rapides", aide: "Les mêmes que le bandeau, cumulables", champs: ["rapides"] },
  { cle: "local", nom: "Les murs", aide: "Emplacement, activité, occupation, surface", champs: ["emplacements", "activite", "occupe", "surface_min", "surface_max"] },
  { cle: "scores", nom: "Scores", aide: "Motivation, Fit, familles de signaux", champs: ["motivation_min", "fit_min", "familles_min"] },
  { cle: "proprietaire", nom: "Propriétaire et occupation", aide: "Profil, détention, siège, portefeuille, gérant, démembrement", champs: ["profils", "confiance", "detention_min", "detention_max", "siege_loin", "murs_min", "murs_max", "gerants", "demembrement"] },
  { cle: "evenements", nom: "Événements BODACC", aide: "Dissolution, procédure, changement de gérant, cession du fonds", champs: ["evenements"] },
  { cle: "valeur", nom: "Valeur et détention", aide: "Dernière mutation DVF, valeur estimée, rendement, seuils 22 et 30 ans", champs: ["mutation_depuis", "mutation_avant", "prix_min", "prix_max", "valeur_min", "valeur_max", "rendement_min", "rendement_max", "seuils"] },
  { cle: "suivi", nom: "Suivi", aide: "Jamais contacté, statut du pipeline", champs: ["jamais_contacte", "statuts"] },
];

const actif = (v) => (Array.isArray(v) ? v.length > 0 : typeof v === "boolean" ? v : typeof v === "number" ? v > 0 : v != null && v !== "" && v !== "any");

/** Pure : le nombre de critères actifs d'une famille, ou de toutes. */
export function nbCriteres(f, famille = null) {
  const familles = famille ? FAMILLES_FILTRES.filter((x) => x.cle === famille) : FAMILLES_FILTRES;
  let n = 0;
  for (const fam of familles) for (const c of fam.champs) if (actif(f?.[c])) n += 1;
  if (!famille && f?.polygone?.length) n += 1;
  return n;
}

/** Pure : un point [lat, lon] est-il dans le polygone ? (règle du rayon) */
export function dansPolygone(p, poly) {
  if (!Array.isArray(poly) || poly.length < 3) return true;
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const entre = (v, min, max) => !((min != null && (v == null || v < min)) || (max != null && (v == null || v > max)));

/** Pure : un local compact passe-t-il les filtres ? */
export function passeFiltres(l, f = {}) {
  if (!l || l.exclu) return false;
  const t = String(f.cherche || "").trim().toLowerCase();
  if (t && !`${l.adresse} ${l.enseigne || ""} ${l.activite || ""} ${l.proprietaire?.nom || ""} ${l.rue || ""} ${l.parcelle || ""}`.toLowerCase().includes(t)) return false;
  if (f.rapides?.length) { const r = l.rapides || rapidesDe(l); if (!f.rapides.every((c) => r.includes(c))) return false; }
  // Le local
  if (f.emplacements?.length && !f.emplacements.includes(String(l.emplacement))) return false;
  if (f.activite && !String(l.activite || "").toLowerCase().includes(String(f.activite).toLowerCase())) return false;
  if (f.occupe === "oui" && l.occupe === false) return false;
  if (f.occupe === "non" && l.occupe !== false) return false;
  if ((f.surface_min != null || f.surface_max != null) && !entre(l.surface, f.surface_min, f.surface_max)) return false;
  // Scores
  if (f.motivation_min && l.motivation < f.motivation_min) return false;
  if (f.fit_min && l.fit < f.fit_min) return false;
  if (f.familles_min && l.familles < f.familles_min) return false;
  // Propriétaire
  if (f.profils?.length && !f.profils.includes(l.profil?.cle)) return false;
  if (f.confiance === "exacte" && l.confiance !== "exacte") return false;
  if (f.confiance === "resolu" && !l.proprietaire) return false;
  if ((f.detention_min != null || f.detention_max != null) && !entre(l.detention_annees, f.detention_min, f.detention_max)) return false;
  if (f.siege_loin === "oui" && !l.signaux.includes("siege_loin")) return false;
  if (f.siege_loin === "non" && l.signaux.includes("siege_loin")) return false;
  if ((f.murs_min != null || f.murs_max != null) && !entre(l.murs, f.murs_min, f.murs_max)) return false;
  if (f.gerants?.length && !f.gerants.includes(l.gerant_tranche)) return false;
  if (f.demembrement === "oui" && !l.signaux.includes("demembrement")) return false;
  if (f.demembrement === "non" && l.signaux.includes("demembrement")) return false;
  // Événements
  if (f.evenements?.length && !f.evenements.some((s) => l.signaux.includes(s))) return false;
  // Valeur et détention
  if (f.mutation_depuis && !(l.mutation?.date && l.mutation.date >= f.mutation_depuis)) return false;
  if (f.mutation_avant && !(l.mutation?.date && l.mutation.date <= f.mutation_avant)) return false;
  if ((f.prix_min != null || f.prix_max != null) && !entre(l.mutation?.prix, f.prix_min, f.prix_max)) return false;
  if ((f.valeur_min != null || f.valeur_max != null) && !entre(l.valeur, f.valeur_min, f.valeur_max)) return false;
  if ((f.rendement_min != null || f.rendement_max != null) && !entre(l.rendement, f.rendement_min, f.rendement_max)) return false;
  if (f.seuils?.length && !f.seuils.some((s) => (l.detention_annees ?? 0) >= Number(s))) return false;
  // Suivi
  if (f.jamais_contacte && l.suivi && l.suivi.statut !== "a_contacter") return false;
  if (f.statuts?.length && !f.statuts.includes(l.suivi?.statut || "a_contacter")) return false;
  // La zone
  if (f.polygone?.length >= 3 && !(Number.isFinite(l.lat) && dansPolygone([l.lat, l.lon], f.polygone))) return false;
  return true;
}

export const filtrer = (locaux, f) => locaux.filter((l) => passeFiltres(l, f));
