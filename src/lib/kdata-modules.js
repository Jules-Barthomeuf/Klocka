import { Map, Gauge, Calculator, TrendingUp, LandPlot, Banknote, Store, DoorClosed } from "lucide-react";

// Les six applications de K-Data, décrites une seule fois : le tableau de
// bord en fait des cartes, la barre du haut de K-Data en fait un menu.
// `pageName` sert à la route (createPageUrl) et à isActivePage ; `chemin`
// reste nul tant que la page n'existe pas — une carte ou un lien qui n'ouvre
// rien le dit, plutôt que de mener à une page absente.
//
// `image` habille la carte du tableau de bord ; `icone` reste utilisée là où
// une photo ne tiendrait pas — le menu des outils, une ligne de la file.
export const MODULES_KDATA = [
  {
    cle: "kzoning",
    pageName: "KZoning",
    nom: "K-Zoning",
    icone: Map,
    image: "/img/kdata/kzoning.jpg",
    phrase: "Délimiter une zone de chalandise et lire le flux commercial d'un emplacement.",
    chemin: "/kzoning",
    etat: "Ouvert",
  },
  {
    cle: "kexpertise",
    pageName: "KExpertise",
    nom: "K-Expertise",
    icone: Gauge,
    image: "/img/kdata/kexpertise.jpg",
    phrase: "L'étude d'implantation d'une adresse : flux, rue, tronçon, zones de chalandise.",
    chemin: "/kexpertise",
    etat: "Ouvert",
  },
  {
    cle: "kestimation",
    pageName: "KEstimation",
    nom: "Estimation",
    icone: Calculator,
    image: "/img/kdata/kestimation.jpg",
    phrase: "Estimer des murs commerciaux par le rendement attendu d'un investisseur.",
    chemin: "/kestimation",
    etat: "Ouvert",
  },
  {
    cle: "kprospective",
    pageName: "KProspective",
    nom: "K-Prospective",
    icone: TrendingUp,
    image: "/img/kdata/kprospective.jpg",
    phrase: "Trouver les commerces d'une zone qui répondent à vos critères, et savoir à qui l'on parle.",
    chemin: "/kprospective",
    etat: "Ouvert",
  },
  {
    cle: "kvacance",
    pageName: "KVacance",
    nom: "K-Vacance",
    icone: DoorClosed,
    image: "/img/kdata/kvacance.jpg",
    phrase: "Les locaux vides d'un quartier, et le rythme auquel ses commerces tournent.",
    chemin: "/kvacance",
    etat: "Ouvert",
  },
  {
    cle: "kfoncier",
    pageName: "KFoncier",
    nom: "K-Foncier",
    icone: LandPlot,
    image: "/img/kdata/kfoncier.jpg",
    phrase: "Les parcelles autour d'une adresse, leur contenance, et les sociétés qui les possèdent.",
    chemin: "/kfoncier",
    etat: "Ouvert",
  },
  {
    cle: "valeur-locative",
    pageName: "ValeurLocative",
    nom: "Valeur locative",
    icone: Banknote,
    image: "/img/kdata/valeur-locative.jpg",
    phrase: "La fourchette de loyer au m² d'une adresse : la rue, le quartier, la ville.",
    chemin: "/valeurlocative",
    etat: "Ouvert",
  },
  {
    cle: "ktransactions",
    pageName: "KTransactions",
    nom: "K-Transactions",
    icone: Store,
    image: "/img/kdata/ktransactions.jpg",
    phrase: "Ce que les murs et les fonds se sont vraiment vendus, autour d'une adresse.",
    chemin: "/ktransactions",
    etat: "Ouvert",
  },
];

// Les pages du côté K-Data, tableau de bord compris : sert à savoir si l'on
// s'y trouve, dans Layout, pour échanger la barre latérale contre la barre
// du haut.
export const PAGES_KDATA = ["KData", ...MODULES_KDATA.map((m) => m.pageName)];
