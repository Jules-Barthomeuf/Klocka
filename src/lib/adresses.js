// Les adresses des pages, en français : /Connexion plutôt que /Home.
//
// Le nom interne d'une page (Home, Dashboard, AdminProjets…) ne change pas :
// le code, le menu, les réglages enregistrés et le suivi d'usage le lisent.
// Seule l'adresse affichée dans le navigateur est traduite, ici et nulle part
// ailleurs. L'ancienne adresse reste ouverte et renvoie vers la nouvelle :
// un favori, un lien déjà envoyé par mail ou par AK continue de marcher.

export const ADRESSES = {
  Home: "Connexion",
  Dashboard: "TableauDeBord",
  AdminProjets: "Projets",
  MesProjets: "MesProjets",
  ProjetDetail: "Projet",
  ProjetPublic: "ProjetPublic",
  Analyse: "Dossiers",
  FichesCommerciales: "Fiches",
  Prospection: "Prospection",
  Relances: "Relances",
  ALX: "ALX",
  ALXAtelier: "ALXAtelier",
  ALXVilles: "ALXVilles",
  ALXCible: "ALXCible",
  ALXBilan: "ALXBilan",
  ALXEntrainement: "ALXEntrainement",
  Monitoring: "Suivi",
  CoutsIA: "CoutsIA",
  SuiviAppels: "SuiviAppels",
  AdminSuggestions: "Feedback",
  Feedback: "MonFeedback",
  SimulateurRentabilite: "Simulateur",
  SimulateurPublic: "SimulateurPublic",
  TableauProjection: "Projection",
  Comparateur: "Comparateur",
  AdminClients: "Clients",
  Offres: "Offres",
  Emailing: "Emailing",
  AdminPresentations: "Presentations",
  AdminLeadMagnets: "LeadMagnets",
  AdminRessources: "GestionRessources",
  Ressources: "Ressources",
  AdminPortail: "Portails",
  AdminMandataires: "Mandataires",
  MandataireProspection: "MandataireProspection",
  MandataireClients: "MandataireClients",
  MandataireEstimation: "EstimationMandataire",
  MandataireMandat: "MandatMandataire",
  MandataireDossier: "DossierMandataire",
  MandataireMarche: "MiseEnMarche",
  MandataireProjets: "ProjetsMandataire",
  ConversationsMandataires: "Conversations",
  AdminValidations: "Validations",
  Portail: "Portail",
  Portail2Fois: "PortailDeuxFois",
  AdminBrouillons: "Verification",
  AdminBanque: "GestionBancaire",
  Banque: "DossierBancaire",
  AdminSignup: "Inscription",
  ImportProjets: "ImportProjets",
  Personnalisation: "Personnalisation",
  BaseDonneesMarche: "DonneesMarche",
  Famille: "Famille",
  Familles: "Familles",
  MonAssistant: "MonAssistant",
  MonCompte: "MonCompte",
  Questionnaire: "Questionnaire",
  Vision: "Vision",
  FeuilleDeRoute: "FeuilleDeRoute",
  Alexis: "Alexis",
  Bienvenue: "Bienvenue",
  Installer: "Installer",
  KData: "KData",
  KZoning: "KZoning",
  KExpertise: "KExpertise",
  KEstimation: "Estimation",
  ValeurLocative: "ValeurLocative",
  KFoncier: "KFoncier",
  KProspective: "KProspective",
  KTransactions: "KTransactions",
  KVacance: "KVacance",
};

/** L'adresse française d'une page, sans la barre : « Dashboard » → « TableauDeBord ». */
export const adresseDe = (page) => ADRESSES[page] || String(page || "").replace(/ /g, "-");

// L'adresse, ou l'ancien nom, en minuscules → le nom interne.
const PAR_ADRESSE = new Map();
// Les adresses d'abord, les anciens noms ensuite et seulement s'ils sont
// libres : « Feedback » est l'adresse de la page admin (AdminSuggestions),
// l'ancien nom de la page client ne doit pas la recouvrir.
for (const [page, adresse] of Object.entries(ADRESSES)) {
  PAR_ADRESSE.set(adresse.toLowerCase(), page);
}
for (const page of Object.keys(ADRESSES)) {
  if (!PAR_ADRESSE.has(page.toLowerCase())) PAR_ADRESSE.set(page.toLowerCase(), page);
}
// L'ancienne préanalyse est devenue les dossiers.
PAR_ADRESSE.set("preanalyse", "Analyse");

/**
 * Le nom interne de la page d'un chemin : « /TableauDeBord » et « /Dashboard »
 * rendent tous deux « Dashboard ». La racine rend « » ; un segment inconnu est
 * rendu tel quel.
 */
export function pageDeChemin(chemin) {
  const segment = String(chemin || "").replace(/^\/+/, "").split(/[/?#]/)[0];
  if (!segment) return "";
  return PAR_ADRESSE.get(segment.toLowerCase()) || segment;
}
