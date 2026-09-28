// Les entrées du menu, par nom : ce que la barre latérale dessine et ce que la
// page Personnalisation laisse masquer et réordonner. Le lien, l'icône et la
// pastille de chaque entrée restent dans Layout ; ici seulement la liste et
// son ordre d'origine.

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
  { cle: "AdminClients", label: "Clients" },
];

export const ENTREES_AUTRE = [
  { cle: "AdminPresentations", label: "Présentations" },
  { cle: "AdminLeadMagnets", label: "Lead magnets" },
  { cle: "AdminRessources", label: "Ressources" },
  { cle: "AdminPortail", label: "Portails" },
];

export const ENTREES_CLIENT = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "MesProjets", label: "Mes projets" },
  { cle: "SimulateurRentabilite", label: "Simulateur" },
  { cle: "Ressources", label: "Ressources" },
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
