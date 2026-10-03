// Les entrées du menu, par nom : ce que la barre latérale dessine et ce que la
// page Personnalisation laisse masquer et réordonner. Le lien, l'icône et la
// pastille de chaque entrée restent dans Layout ; ici seulement la liste et
// son ordre d'origine (celui de la maquette).

export const ENTREES_ADMIN = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "AdminProjets", label: "Projets" },
  { cle: "Analyse", label: "Dossiers" },
  { cle: "FichesCommerciales", label: "Fiches" },
  { cle: "Prospection", label: "Prospection" },
  { cle: "ALX", label: "ALX" },
  { cle: "Monitoring", label: "Suivi" },
  { cle: "AdminSuggestions", label: "Feedback" },
  { cle: "SimulateurRentabilite", label: "Simulateur" },
  { cle: "Vision", label: "Vision" },
  { cle: "AdminClients", label: "Clients" },
];

export const ENTREES_AUTRE = [
  { cle: "AdminPresentations", label: "Présentations" },
  { cle: "AdminLeadMagnets", label: "Lead magnets" },
  { cle: "AdminRessources", label: "Ressources" },
  { cle: "AdminPortail", label: "Portails" },
  { cle: "AdminMandataires", label: "Mandataires" },
  { cle: "AdminValidations", label: "Validations" },
  { cle: "ImportProjets", label: "Import de projets" },
  // Par défaut en bas de « Autre » ; déplaçable comme toutes les autres.
  { cle: "Personnalisation", label: "Compte" },
];

export const ENTREES_CLIENT = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "MesProjets", label: "Mes projets" },
  { cle: "SimulateurRentabilite", label: "Simulateur" },
  { cle: "Vision", label: "Vision" },
  { cle: "Ressources", label: "Ressources" },
  { cle: "Personnalisation", label: "Personnalisation" },
];

// L'espace mandataire K Partners. Les autres pages (Prospection, Clients,
// Estimation, Mandat, Dossier, Mise en marché) s'y ajoutent au fil de la
// spécification.
export const ENTREES_MANDATAIRE = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "MandataireProspection", label: "Prospection" },
  { cle: "MandataireClients", label: "Clients" },
  { cle: "MandataireEstimation", label: "Estimation" },
  { cle: "MandataireMandat", label: "Mandat" },
  { cle: "MandataireDossier", label: "Dossiers" },
  { cle: "MandataireMarche", label: "Mise en marché" },
  { cle: "MandataireProjets", label: "Projets" },
  { cle: "Feedback", label: "Feedback" },
  { cle: "Personnalisation", label: "Compte" },
];

/** Les pages qu'on peut choisir comme page d'ouverture : [nom de page, libellé]. */
export const PAGES_OUVERTURE_ADMIN = [
  ["Dashboard", "Dashboard"], ["AdminProjets", "Projets"], ["Analyse", "Dossiers"], ["FichesCommerciales", "Fiches"],
  ["Prospection", "Prospection"], ["ALX", "ALX"], ["Monitoring", "Suivi"], ["AdminClients", "Clients"], ["SimulateurRentabilite", "Simulateur"],
];
export const PAGES_OUVERTURE_CLIENT = [
  ["Dashboard", "Dashboard"], ["MesProjets", "Mes projets"], ["SimulateurRentabilite", "Simulateur"], ["Ressources", "Ressources"],
];

/**
 * Pure : les entrées visibles, dans l'ordre choisi. Une entrée absente de
 * l'ordre garde sa place d'origine, après celles qui ont été placées.
 */
export function ordonner(entrees, ordre = [], masques = []) {
  const rang = new Map(ordre.map((cle, i) => [cle, i]));
  const place = (e) => (rang.has(e.cle) ? rang.get(e.cle) : 1000 + entrees.indexOf(e));
  return entrees.filter((e) => !masques.includes(e.cle)).sort((a, b) => place(a) - place(b));
}

/**
 * Pure : le menu en deux groupes, le principal et « Autre ». Chaque entrée
 * part de son groupe d'origine ; `menuAutre` (les clés rangées dans Autre par
 * la personne) l'emporte dès qu'il existe. Une entrée apparue depuis (absente
 * de l'ordre enregistré) garde son groupe d'origine.
 *
 * @returns {{principal: Array, autre: Array}}
 */
export function repartir(principales, autres, { ordre = [], masques = [], menuAutre = null } = {}) {
  const connues = new Set(ordre);
  const toutes = [
    ...principales.map((e) => ({ ...e, origine: "principal" })),
    ...autres.map((e) => ({ ...e, origine: "autre" })),
  ];
  const dansAutre = (e) => (Array.isArray(menuAutre) && connues.has(e.cle) ? menuAutre.includes(e.cle) : e.origine === "autre");
  return {
    principal: ordonner(toutes.filter((e) => !dansAutre(e)), ordre, masques),
    autre: ordonner(toutes.filter(dansAutre), ordre, masques),
  };
}

/** La page qu'on ne peut pas masquer : sans elle, plus moyen de revenir en arrière. */
export const TOUJOURS_VISIBLE = "Personnalisation";
