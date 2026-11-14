// Les repères de la vacance commerciale (13 nov. 2026, Jules, variante B de la planche « La vacance » : « la B de
// loin ») : la rue rangée parmi des taux nationaux publics, une barre chacun. Seuils de Jules : sous 10 % ça va, à partir
// de 10 % ça commence à faire beaucoup, à partir de 20 % c'est trop (les mêmes que le statut du point, pointVacance).
// Le taux ville par ville n'est pas public (Codata Digest, payant) : pas de ligne pour la ville tant qu'on ne le mesure pas.

export const SEUILS_VACANCE = { beaucoup: 10, trop: 20 };

export const REPERES_VACANCE = [
  { nom: "Zones commerciales", taux: 8.4, source: "Codata, baromètre 2026 (vacance 2025)" },
  { nom: "Centres-villes de France", taux: 11.7, source: "Codata, baromètre 2026 (vacance 2025, pieds d'immeubles)", reference: true },
  { nom: "Villes moyennes", taux: 13.4, source: "FACT-Codata, 2024 (villes Action Cœur de Ville)" },
  { nom: "Centres commerciaux", taux: 16.8, source: "Codata, baromètre 2026 (vacance 2025)" },
];

export const SOURCE_REPERES = "Repères : Codata, baromètre 2026 (vacance 2025 : 11,7 % en centres-villes, 16,8 % en centres commerciaux, 8,4 % en zones commerciales) ; FACT-Codata 2024 (13,4 % dans les villes moyennes Action Cœur de Ville).";

const virgule = (v) => String(v).replace(".", ",");

/** Pure : le mot des seuils de Jules. */
export const motVacance = (t) => (t < SEUILS_VACANCE.beaucoup ? "ça va" : t < SEUILS_VACANCE.trop ? "ça commence à faire beaucoup" : "c'est trop");

/** Pure : la phrase de la rue face aux centres-villes de France (« ça va, un peu sous la moyenne … (11,7 %) »). */
export function phraseVacance(taux) {
  if (taux == null || !Number.isFinite(Number(taux))) return null;
  const ref = REPERES_VACANCE.find((r) => r.reference);
  const ecart = Number(taux) - ref.taux;
  const face = Math.abs(ecart) < 0.5 ? "dans la moyenne" : `${Math.abs(ecart) < 3 ? "un peu " : ""}${ecart < 0 ? "sous" : "au-dessus de"} la moyenne`;
  return `${motVacance(Number(taux))}, ${face} des centres-villes de France (${virgule(ref.taux)} %)`;
}

/** Pure : les lignes du classement, la rue rangée parmi les repères, du plus bas au plus haut. */
export function lignesVacance(taux) {
  const rue = taux != null && Number.isFinite(Number(taux)) ? [{ nom: "La rue", taux: Number(taux), rue: true }] : [];
  return [...REPERES_VACANCE, ...rue].sort((a, b) => a.taux - b.taux || (a.rue ? -1 : 1));
}
