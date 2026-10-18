// L'opacité des cartes de la page Dossiers (18 oct. 2026, Jules) : un entier de 10 (presque transparentes) à 100 (pleines).
export const OPACITE_DEFAUT = 100;
export const opaciteCartes = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(10, n)) : OPACITE_DEFAUT;
};
