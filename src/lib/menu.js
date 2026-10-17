// Les entrées du menu, par nom : ce que la barre latérale dessine et ce que la
// page Personnalisation laisse masquer et réordonner. Le lien, l'icône et la
// pastille de chaque entrée restent dans Layout ; ici seulement la liste et
// son ordre d'origine (celui de la maquette).

export const ENTREES_ADMIN = [
  { cle: "Dashboard", label: "Dashboard" },
  // L'Agenda de l'équipe (16 oct. 2026) : qui est là, les briefings d'un jour, le résumé du retour.
  { cle: "Semaine", label: "Agenda" },
  { cle: "AdminProjets", label: "Projets" },
  { cle: "Analyse", label: "Dossiers" },
  // Haka (17 oct. 2026) : la file À valider ; visible quand HAKA_FILE est allumé.
  { cle: "AValider", label: "À valider" },
  { cle: "Offres", label: "Offres" },
  { cle: "Prospection", label: "Prospection" },
  // Agents (16 oct. 2026, Jules) : tous les agents immobiliers, et tout ce qui s'est dit avec chacun.
  { cle: "Agents", label: "Agents" },
  { cle: "OffMarket", label: "Off-market" },
  { cle: "Emailing", label: "Emailing" },
  { cle: "ALX", label: "ALX" },
  { cle: "Monitoring", label: "Suivi" },
  // L'Intelligence (14 oct. 2026) : ce qui a été dit, décidé, promis ; les faits à valider.
  { cle: "Cerveau", label: "Intelligence" },
  { cle: "AdminSuggestions", label: "Feedback" },
  { cle: "SimulateurRentabilite", label: "Simulateur" },
  { cle: "Vision", label: "Vision" },
  // Clients (16 oct. 2026, Jules) : les fiches clients nourries par les appels ; les comptes de la plateforme passent dans Utilisateurs.
  { cle: "AdminClients", label: "Clients" },
  { cle: "AdminUtilisateurs", label: "Utilisateurs" },
];

export const ENTREES_AUTRE = [
  { cle: "AdminPresentations", label: "Présentations" },
  { cle: "AdminLeadMagnets", label: "Lead magnets" },
  { cle: "AdminRessources", label: "Ressources" },
  { cle: "AdminPortail", label: "Portails" },
  { cle: "AdminEquipe", label: "Équipe" },
  { cle: "AdminMandataires", label: "Mandataires" },
  // Par défaut en bas de « Autre » ; déplaçable comme toutes les autres.
  { cle: "Personnalisation", label: "Paramètres" },
];

export const ENTREES_CLIENT = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "MesProjets", label: "Mes projets" },
  { cle: "MesPresentations", label: "Présentations" },
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
  { cle: "MandataireOffMarket", label: "Off-market" },
  { cle: "MandataireProjets", label: "Projets" },
  { cle: "SimulateurRentabilite", label: "Simulateur" },
  { cle: "Feedback", label: "Feedback" },
  { cle: "Personnalisation", label: "Compte" },
];

/**
 * Le menu de l'équipe (17 oct. 2026, Jules) : Dashboard, Projets, Dossiers,
 * Appels ; « Relations » (Clients, Agents) ; « Administration » (Intelligence,
 * Utilisateurs) ; Paramètres en bas de la barre, avec le Suivi dedans. L'Agenda
 * quitte le menu (la pastille du Dashboard y mène). Le reste passe dans « Autre ».
 * ENTREES_ADMIN reste la liste des pages de l'équipe (les accès en dépendent).
 */
export const MENU_ADMIN = [
  { cle: "Dashboard", label: "Dashboard" },
  { cle: "AdminProjets", label: "Projets" },
  { cle: "Analyse", label: "Dossiers" },
  { cle: "AValider", label: "À valider" },
  { cle: "Prospection", label: "Appels" },
  // Un groupe est une seule entrée du menu (17 oct. 2026, Jules : « pas un truc déroulant ») : un clic ouvre sa
  // première page, et des onglets en tête de page passent de l'une à l'autre.
  { groupe: "Relations", cle: "Relations", label: "Relations", entrees: [{ cle: "AdminClients", label: "Clients" }, { cle: "Agents", label: "Agents" }] },
  { groupe: "Administration", cle: "Administration", label: "Administration", entrees: [{ cle: "Cerveau", label: "Intelligence" }, { cle: "AdminUtilisateurs", label: "Utilisateurs" }] },
];
/** Pure : le groupe du menu de l'équipe auquel une page appartient, ou null. */
export const groupeDe = (page) => MENU_ADMIN.find((x) => x.groupe && x.entrees.some((e) => e.cle === page)) || null;

/** Hors du menu : l'Agenda (pastille du Dashboard), le Suivi (dans Paramètres), Paramètres (en bas de la barre). */
const HORS_MENU_ADMIN = ["Semaine", "Monitoring", "Personnalisation"];

/**
 * Pure : le menu de l'équipe, ses groupes, et « Autre » (tout ce qui n'y est pas).
 * Les pages masquées dans Paramètres disparaissent, un groupe vide aussi.
 */
export function menuAdmin(masques = []) {
  const garde = (e) => !masques.includes(e.cle);
  const places = new Set(HORS_MENU_ADMIN);
  const principal = MENU_ADMIN.map((x) => {
    if (x.groupe) { x.entrees.forEach((e) => places.add(e.cle)); return { ...x, entrees: x.entrees.filter(garde) }; }
    places.add(x.cle);
    return x;
  }).filter((x) => (x.groupe ? x.entrees.length : garde(x)));
  const autre = [...ENTREES_ADMIN, ...ENTREES_AUTRE].filter((e) => !places.has(e.cle) && garde(e));
  return { principal, autre };
}

/** Les pages qu'on peut choisir comme page d'ouverture : [nom de page, libellé]. */
export const PAGES_OUVERTURE_ADMIN = [
  ["Dashboard", "Dashboard"], ["AdminProjets", "Projets"], ["Analyse", "Dossiers"],
  ["Prospection", "Prospection"], ["OffMarket", "Off-market"], ["ALX", "ALX"], ["Monitoring", "Suivi"], ["AdminClients", "Clients"], ["AdminUtilisateurs", "Utilisateurs"], ["SimulateurRentabilite", "Simulateur"],
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
