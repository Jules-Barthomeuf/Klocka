import { Map, Gauge, Calculator, TrendingUp, LandPlot, Banknote, Store } from "lucide-react";

// Les six applications de K-Data, décrites une seule fois : le tableau de
// bord en fait des cartes, la barre du haut de K-Data en fait un menu.
// `pageName` sert à la route (createPageUrl) et à isActivePage ; `chemin`
// reste nul tant que la page n'existe pas — une carte ou un lien qui n'ouvre
// rien le dit, plutôt que de mener à une page absente.
export const MODULES_KDATA = [
  {
    cle: "kzoning",
    pageName: "KZoning",
    nom: "K-Zoning",
    icone: Map,
    phrase: "Délimiter une zone de chalandise et lire le flux commercial d'un emplacement.",
    chemin: "/kzoning",
    etat: "Ouvert",
  },
  {
    cle: "kexpertise",
    pageName: "KExpertise",
    nom: "K-Expertise",
    icone: Gauge,
    phrase: "L'étude d'implantation d'une adresse : flux, rue, tronçon, zones de chalandise.",
    chemin: "/kexpertise",
    etat: "Ouvert",
  },
  {
    cle: "kestimation",
    pageName: "KEstimation",
    nom: "Estimation",
    icone: Calculator,
    phrase: "Estimer des murs commerciaux par le rendement attendu d'un investisseur.",
    chemin: "/kestimation",
    etat: "Ouvert",
  },
  {
    cle: "kprospective",
    pageName: "KProspective",
    nom: "K-Prospective",
    icone: TrendingUp,
    phrase: "Projeter un secteur : population, pouvoir d'achat, concurrence à venir.",
    chemin: null,
    etat: "Bientôt",
  },
  {
    cle: "kfoncier",
    pageName: "KFoncier",
    nom: "K-Foncier",
    icone: LandPlot,
    phrase: "Repérer le foncier disponible et les mutations autour d'une adresse.",
    chemin: null,
    etat: "Bientôt",
  },
  {
    cle: "valeur-locative",
    pageName: "ValeurLocative",
    nom: "Valeur locative",
    icone: Banknote,
    phrase: "Calculer la valeur locative de marché d'un local, loyer et droit au bail.",
    chemin: null,
    etat: "Bientôt",
  },
  {
    cle: "transaction-fonds",
    pageName: "TransactionFonds",
    nom: "Transaction de fonds",
    icone: Store,
    phrase: "Suivre les cessions de fonds de commerce et les prix pratiqués.",
    chemin: null,
    etat: "Bientôt",
  },
];

// Les pages du côté K-Data, tableau de bord compris : sert à savoir si l'on
// s'y trouve, dans Layout, pour échanger la barre latérale contre la barre
// du haut.
export const PAGES_KDATA = ["KData", ...MODULES_KDATA.map((m) => m.pageName)];
