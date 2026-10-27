// Les entrées du menu, par nom : ce que la barre latérale dessine et ce que la
// page Personnalisation laisse masquer et réordonner. Le lien, l'icône et la
// pastille de chaque entrée restent dans Layout ; ici seulement la liste et
// son ordre d'origine (celui de la maquette).

export const ENTREES_ADMIN = [
  { cle: "Dashboard", label: "Haka" },
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
  // Les automatismes de Haka (17 oct. 2026) : ce qu'il fait seul ; troisième onglet d'Administration.
  { cle: "Automatismes", label: "Automatismes" },
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
  { cle: "MandataireBiens", label: "Biens" },
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
 * Le menu de l'équipe (17 oct. 2026, Jules) : Haka (l'ancien Dashboard), Projets, Dossiers,
 * Appels ; « Relations » (Clients, Agents) ; « Administration » (Intelligence,
 * Utilisateurs, Automatismes, Suivi) ; Paramètres en bas de la barre. L'Agenda
 * quitte le menu (la pastille du Dashboard y mène). Le reste passe dans « Autre ».
 * ENTREES_ADMIN reste la liste des pages de l'équipe (les accès en dépendent).
 */
export const MENU_ADMIN = [
  { cle: "Dashboard", label: "Haka" },
  { cle: "AdminProjets", label: "Projets" },
  { cle: "Analyse", label: "Dossiers" },
  { cle: "AValider", label: "À valider" },
  { cle: "Prospection", label: "Appels" },
  // Le Simulateur dans le menu de gauche (18 oct. 2026, Jules) : toujours là, même masqué dans d'anciennes préférences.
  { cle: "SimulateurRentabilite", label: "Simulateur", fixe: true },
  // Un groupe est une seule entrée du menu (17 oct. 2026, Jules : « pas un truc déroulant ») : un clic ouvre sa
  // première page, et des onglets en tête de page passent de l'une à l'autre.
  { groupe: "Relations", cle: "Relations", label: "Relations", entrees: [{ cle: "AdminClients", label: "Clients" }, { cle: "Agents", label: "Agents" }] },
  // Le CRM (27 oct. 2026, Jules) : Twenty, hébergé à part, s'ouvre dans un nouvel onglet ; il remplace Monday.
  { cle: "CRM", label: "CRM", externe: true, fixe: true },
  { groupe: "Administration", cle: "Administration", label: "Administration", entrees: [{ cle: "Cerveau", label: "Intelligence" }, { cle: "AdminUtilisateurs", label: "Utilisateurs" }, { cle: "Automatismes", label: "Automatismes" },
    // Le Suivi quitte Paramètres pour Administration (18 oct. 2026, Jules) ; ses pages de détail gardent l'onglet.
    { cle: "Monitoring", label: "Suivi", aussi: ["SuiviHaka", "CoutsIA", "SuiviAppels", "SuiviAudience", "SuiviMandataires", "SuiviTesteur", "SuiviChat", "SuiviReunion"] }] },
];
/**
 * Le menu des mandataires, sur la structure de celui de l'équipe (18 oct. 2026, Jules) : des entrées simples et
 * des groupes (une entrée, des onglets en tête de page), « Autre » pour le reste, Paramètres en bas de la barre.
 * Un bien se suit au même endroit de l'estimation à la mise en marché ; la prospection et l'off-market se
 * rejoignent.
 */
export const MENU_MANDATAIRE = [
  // Haka, comme pour l'équipe (19 oct. 2026, Jules).
  { cle: "Dashboard", label: "Haka" },
  // La Prospection reprend l'Off-market (23 oct. 2026, Jules) : une seule entrée, Commerces et Rues dans la page.
  { cle: "MandataireProspection", label: "Prospection" },
  // Biens, une seule entrée (24 oct. 2026, Jules) : tous les biens en cartes, puis un bien suivi comme un dossier de
  // l'équipe, ses étapes à droite (Estimation, Mandat, Analyse, Mise en marché, Offre, Vente).
  { cle: "MandataireBiens", label: "Biens" },
  { cle: "MandataireClients", label: "Clients" },
  { cle: "MandataireProjets", label: "Projets" },
  { cle: "SimulateurRentabilite", label: "Simulateur", fixe: true },
];
// Off-market n'est plus une page à part pour un mandataire (23 oct. 2026) : son adresse mène à la Prospection.
// Les quatre pages d'étape restent ouvertes par leur adresse (notifications, liens) ; elles vivent dans Biens.
const HORS_MENU_MANDATAIRE = ["Personnalisation", "MandataireOffMarket", "MandataireEstimation", "MandataireMandat", "MandataireDossier", "MandataireMarche"];

/** Pure : le groupe du menu (équipe ou mandataires) auquel une page appartient, ou null. */
export const groupeDe = (page, vue = "admin") => (vue === "mandataire" ? MENU_MANDATAIRE : MENU_ADMIN)
  .find((x) => x.groupe && x.entrees.some((e) => e.cle === page || e.aussi?.includes(page))) || null;

/** Pure : le menu des mandataires, ses groupes, et « Autre » (ce qui reste de leurs pages). */
export function menuMandataire(masques = []) {
  const garde = (e) => e.fixe || !masques.includes(e.cle);
  const places = new Set(HORS_MENU_MANDATAIRE);
  const principal = MENU_MANDATAIRE.map((x) => {
    if (x.groupe) { x.entrees.forEach((e) => places.add(e.cle)); return { ...x, entrees: x.entrees.filter(garde) }; }
    places.add(x.cle);
    return x;
  }).filter((x) => (x.groupe ? x.entrees.length : garde(x)));
  const autre = ENTREES_MANDATAIRE.filter((e) => !places.has(e.cle) && garde(e));
  return { principal, autre };
}

/** Hors du menu : l'Agenda (pastille du Dashboard), Paramètres (en bas de la barre). Le Suivi est dans Administration depuis le 18 oct. 2026. */
const HORS_MENU_ADMIN = ["Semaine", "Personnalisation"];

/**
 * Ce que « Autre » montre à l'équipe (19 oct. 2026, Jules : « masque Offres, Emailing, Présentations… laisse
 * juste Feedback »). Les autres pages restent là, par leur adresse et leurs accès ; elles ne sont plus dans le menu.
 */
const AUTRE_VISIBLE_ADMIN = ["AdminSuggestions"];

/**
 * Pure : le menu de l'équipe, ses groupes, et « Autre » (Feedback seulement).
 * Les pages masquées dans Paramètres disparaissent, un groupe vide aussi.
 */
export function menuAdmin(masques = []) {
  const garde = (e) => e.fixe || !masques.includes(e.cle);
  const places = new Set(HORS_MENU_ADMIN);
  const principal = MENU_ADMIN.map((x) => {
    if (x.groupe) { x.entrees.forEach((e) => places.add(e.cle)); return { ...x, entrees: x.entrees.filter(garde) }; }
    places.add(x.cle);
    return x;
  }).filter((x) => (x.groupe ? x.entrees.length : garde(x)));
  const autre = [...ENTREES_ADMIN, ...ENTREES_AUTRE].filter((e) => AUTRE_VISIBLE_ADMIN.includes(e.cle) && !places.has(e.cle) && garde(e));
  return { principal, autre };
}

/** Les pages qu'on peut choisir comme page d'ouverture : [nom de page, libellé]. */
export const PAGES_OUVERTURE_ADMIN = [
  ["Dashboard", "Haka"], ["AdminProjets", "Projets"], ["Analyse", "Dossiers"],
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
