// Trois vues d'un même moteur : admin, client, mandataire.
//
// Un client est toujours en vue client, un mandataire en vue mandataire. Un
// admin choisit la sienne dans la barre latérale pour voir ce que les autres
// voient. `previewClientMode` reste écrit tel quel : les pages client le
// lisent déjà pour savoir si un admin regarde « comme un client ».

const CLE = "apercuVue";

/** La vue qu'un admin a choisie, lue dans le navigateur. */
export function apercuAdmin() {
  try {
    const v = localStorage.getItem(CLE);
    if (v === "client" || v === "mandataire") return v;
    return localStorage.getItem("previewClientMode") === "true" ? "client" : "admin";
  } catch {
    return "admin";
  }
}

export function choisirApercu(vue) {
  try {
    localStorage.setItem(CLE, vue);
    localStorage.setItem("previewClientMode", String(vue === "client"));
  } catch { /* navigateur sans stockage : la vue revient à admin au rechargement */ }
}

/** @returns {"admin" | "client" | "mandataire"} */
export function vueDe(user) {
  if (user?.role === "admin") return apercuAdmin();
  if (user?.role === "mandataire") return "mandataire";
  return "client";
}
