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

// Les deux domaines (12 nov. 2026, Jules) : l'espace mandataire vit sur app.kpartners.immo, le reste sur app.klocka.immo
// (server/domaines.js). Sur le domaine K Partners, un admin est en vue mandataire ; un passage d'un domaine à l'autre
// porte la vue voulue dans l'adresse (?vue=), parce que le navigateur garde une vue par domaine.
export const surKpartners = () => {
  try { return /^(app\.)?kpartners\./.test(window.location.hostname); } catch { return false; }
};

/** La vue de départ d'un admin : celle portée par un passage, sinon mandataire sur K Partners, sinon la sienne. */
export function apercuInitial() {
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("vue");
    if (v === "admin" || v === "client" || v === "mandataire") {
      choisirApercu(v);
      p.delete("vue");
      window.history.replaceState(null, "", `${window.location.pathname}${p.toString() ? `?${p}` : ""}${window.location.hash}`);
    }
  } catch { /* sans adresse lisible, la vue gardée */ }
  return surKpartners() ? "mandataire" : apercuAdmin();
}

/** Pure : le domaine où une vue doit s'afficher. */
export const espaceDeVue = (vue) => (vue === "mandataire" ? "kpartners" : "klocka");

let enPassage = false;
/**
 * Emmène sur le domaine de la vue, connecté et sur la même page, si on n'y est pas (server/domaines.js). `demander` :
 * la requête POST de l'application. Rien tant que le domaine voulu n'est pas branché (adresse vide).
 */
export function allerAuBonDomaine(user, vue, demander) {
  const d = user?.domaines;
  const voulu = espaceDeVue(vue);
  if (!d || d.ici === voulu || !d[voulu] || enPassage) return false;
  enPassage = true;
  const p = new URLSearchParams(window.location.search);
  p.set("vue", vue);
  demander("POST", "/api/auth/passage", { body: { vers: voulu, suite: `${window.location.pathname}?${p}` } })
    .then((r) => window.location.replace(r.url))
    .catch(() => { enPassage = false; });
  return true;
}
