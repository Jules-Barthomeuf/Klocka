// Découverte ou client : le niveau d'accès d'un compte, absence comprise.
// Un admin en « Vue Découverte » voit ce qu'un inscrit voit.

export const accesDe = (user) => (user?.acces === "decouverte" ? "decouverte" : "client");

export function accesEffectif(user) {
  try {
    if (user?.role === "admin" && localStorage.getItem("previewClientMode") === "true") {
      return localStorage.getItem("previewAcces") === "decouverte" ? "decouverte" : "client";
    }
  } catch {
    /* stockage indisponible : le compte fait foi */
  }
  return accesDe(user);
}

export const estDecouverte = (user) => accesEffectif(user) === "decouverte";
