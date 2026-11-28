// Ce qu'il reste d'un bail, en clair (27 nov. 2026, Jules). Lu par la pré-analyse (DealResultat.jsx) : la ligne Bail
// disait « 3-6-9, échéance 30 juin 2023 » sans dire que le bail était échu, donc en tacite prolongation, et que le
// locataire pouvait partir avec six mois de préavis.

const MOIS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

/** Pure : la date d'échéance d'un bail telle que les fiches l'écrivent (« 30 juin 2023 », « 2033-04-22 », « 30/06/2023 », « 2031 »). */
export function dateEcheance(texte) {
  const t = String(texte || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = t.match(/(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})/);
  if (m && MOIS_FR.indexOf(m[2]) >= 0) return new Date(Date.UTC(+m[3], MOIS_FR.indexOf(m[2]), +m[1]));
  m = t.match(/([a-z]+)\s+(\d{4})/);
  if (m && MOIS_FR.indexOf(m[1]) >= 0) return new Date(Date.UTC(+m[2], MOIS_FR.indexOf(m[1]) + 1, 0));
  m = t.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? new Date(Date.UTC(+m[1], 11, 31)) : null;
}

/** Pure : ce qu'il reste avant l'échéance, ou depuis quand le bail est échu. */
export function resteDuBail(echeance, maintenant = new Date()) {
  const d = dateEcheance(echeance);
  if (!d) return null;
  // Les mois entiers de `a` à `b` (b après a).
  const entre = (a, b) => (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
  const duree = (n) => { const a = Math.floor(n / 12); const r = n % 12; return [a ? `${a} an${a > 1 ? "s" : ""}` : null, r ? `${r} mois` : null].filter(Boolean).join(" et ") || "moins d'un mois"; };
  if (d < maintenant) return { echu: true, texte: `Bail échu depuis ${duree(entre(d, maintenant))}, en tacite prolongation : le locataire peut partir à tout moment avec six mois de préavis.` };
  const mois = entre(maintenant, d);
  return { echu: false, court: mois < 36, texte: `${duree(mois)} avant l'échéance.` };
}

