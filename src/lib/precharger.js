// Les pages se chargent avant qu'on clique (21 oct. 2026, Jules : « sur la version live, naviguer entre les pages est
// super lent »). Chaque page est un morceau à part (React.lazy) : le premier passage le téléchargeait au clic, derrière
// un écran d'attente. On les charge en fond après l'ouverture (celles du menu), et une page au survol de son lien.
// Rien sur une connexion lente ou en mode économie de données : la page se chargera au clic, comme avant.

const chargeurs = import.meta.glob("../pages/*.jsx");
const faits = new Set();
// Les entrées du menu dont la clé n'est pas le nom de la page (15 nov. 2026) : sans elles, le CRM et les Outils ne se
// téléchargeaient ni en fond ni au survol, et le premier clic attendait leur morceau.
const PAGE_DE = { CRM: "CrmTwenty", KData: "Outils" };
const nomDePage = (cle) => PAGE_DE[cle] || cle;
// Au survol, ce que la page lira d'abord part aussi : la barre du CRM (src/lib/crm-barre.js).
const DONNEES = {
  CrmTwenty: () => Promise.all([import("@/lib/crm-barre"), import("@/lib/query-client")]).then(([b, q]) => b.prechargerBarreCrm(q.queryClientInstance)),
};
const donneesLues = new Map();

const connexionLente = () => {
  const c = typeof navigator !== "undefined" ? navigator.connection : null;
  return !!c && (c.saveData || /(^|-)2g|3g/.test(String(c.effectiveType || "")));
};

/** Télécharge le morceau d'une page (une fois), sans l'afficher. */
export function precharger(cle) {
  const page = nomDePage(cle);
  const f = chargeurs[`../pages/${page}.jsx`];
  if (!f) return;
  if (!faits.has(page)) {
    faits.add(page);
    f().catch(() => faits.delete(page));
  }
}

/** Au survol d'un lien : le morceau de la page, et ses premières données (au plus une fois toutes les 30 s). */
export function prechargerAuSurvol(cle) {
  precharger(cle);
  const page = nomDePage(cle);
  if (!DONNEES[page] || Date.now() - (donneesLues.get(page) || 0) < 30_000) return;
  donneesLues.set(page, Date.now());
  DONNEES[page]().catch(() => {});
}

/** Les pages données, une à une quand le navigateur est libre, quelques secondes après l'ouverture. */
export function prechargerEnFond(pages, { apres = 2500 } = {}) {
  if (connexionLente()) return () => {};
  const file = [...new Set(pages.map(nomDePage))].filter((p) => chargeurs[`../pages/${p}.jsx`]);
  let arrete = false;
  const libre = (cb) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 200));
  const suivant = () => { if (arrete || !file.length) return; precharger(file.shift()); libre(suivant); };
  const t = setTimeout(suivant, apres);
  return () => { arrete = true; clearTimeout(t); };
}
