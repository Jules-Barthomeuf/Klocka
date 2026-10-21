// Les pages se chargent avant qu'on clique (21 oct. 2026, Jules : « sur la version live, naviguer entre les pages est
// super lent »). Chaque page est un morceau à part (React.lazy) : le premier passage le téléchargeait au clic, derrière
// un écran d'attente. On les charge en fond après l'ouverture (celles du menu), et une page au survol de son lien.
// Rien sur une connexion lente ou en mode économie de données : la page se chargera au clic, comme avant.

const chargeurs = import.meta.glob("../pages/*.jsx");
const faits = new Set();

const connexionLente = () => {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  return !!c && (c.saveData || /(^|-)2g|3g/.test(String(c.effectiveType || "")));
};

/** Télécharge le morceau d'une page (une fois), sans l'afficher. */
export function precharger(page) {
  const f = chargeurs[`../pages/${page}.jsx`];
  if (!f || faits.has(page)) return;
  faits.add(page);
  f().catch(() => faits.delete(page));
}

/** Les pages données, une à une quand le navigateur est libre, quelques secondes après l'ouverture. */
export function prechargerEnFond(pages, { apres = 2500 } = {}) {
  if (connexionLente()) return () => {};
  const file = [...new Set(pages)].filter((p) => chargeurs[`../pages/${p}.jsx`]);
  let arrete = false;
  const libre = (cb) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 200));
  const suivant = () => { if (arrete || !file.length) return; precharger(file.shift()); libre(suivant); };
  const t = setTimeout(suivant, apres);
  return () => { arrete = true; clearTimeout(t); };
}
