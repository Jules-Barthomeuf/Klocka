// Les libellés des profils investisseurs, accents compris. Écrits ici une
// fois : « equilibriste » brut ne doit s'afficher nulle part.
export const LIBELLES_PROFIL = {
  equilibriste: "Équilibriste",
  risk_taker: "Risk taker",
  collectionneur: "Collectionneur",
  visionnaire: "Visionnaire",
};
export const libelleProfil = (code) => (code ? LIBELLES_PROFIL[code] || String(code).replace(/_/g, " ") : "");
