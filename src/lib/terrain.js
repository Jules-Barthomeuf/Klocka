// Le mode terrain du mandataire (25 oct. 2026) : les calculs purs, partagés et testés.

/** Pure : la distance en mètres entre deux points (formule de haversine). */
export function distance(a, b) {
  const r = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
export const distanceLisible = (m) => (m == null ? null : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

/** Pure : passé aujourd'hui, si la fiche a bougé aujourd'hui (une note, un statut, une dictée). */
export const passeAujourdhui = (p, jour = new Date().toISOString().slice(0, 10)) => (p.historique || []).some((h) => h.type !== "creation" && String(h.le || "").slice(0, 10) === jour);

