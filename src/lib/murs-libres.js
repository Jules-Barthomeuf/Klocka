// Les filtres des murs libres de la Prospection (3 nov. 2026, Jules), purs : l'écran (MursLibres.jsx) et les tests.

export const FILTRES_LIBRES = Object.freeze({ texte: "", depuis: null, emplacement: "partout", activite: null, proprietaire: null });

/** Pure : un local passe-t-il les filtres ? */
export function passeLibre(p, f) {
  if (f.depuis && !(p.mois_vide >= Number(f.depuis))) return false;
  if (f.emplacement === "centre" && p.centre === false) return false;
  if (f.activite && p.activite !== f.activite) return false;
  if (f.proprietaire === "connu" && !p.proprietaire) return false;
  if (f.proprietaire === "inconnu" && p.proprietaire) return false;
  const t = f.texte.trim().toLowerCase();
  return !t || `${p.titre || ""} ${p.ville || ""} ${p.dernier || ""} ${p.activite || ""} ${p.proprietaire || ""}`.toLowerCase().includes(t);
}
export const nbFiltresLibres = (f) => (f.depuis ? 1 : 0) + (f.emplacement === "centre" ? 1 : 0) + (f.activite ? 1 : 0) + (f.proprietaire ? 1 : 0);
/** Pure : « 8 mois », « 2 ans ». */
export const duree = (m) => (m == null ? "—" : m < 1 ? "moins d'un mois" : m < 24 ? `${m} mois` : `${Math.floor(m / 12)} ans`);
