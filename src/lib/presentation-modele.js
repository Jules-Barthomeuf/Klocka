// Le modèle de la présentation bancaire (12 oct. 2026, le « Deck complet » de
// Jules, artefact « Présentation bancaire Klocka ») : seize diapositives de
// 1280 × 720, un panneau sauge à gauche (le chiffre ou le titre qui porte la
// diapositive), une carte sombre à droite (le détail), une barre noire en bas
// (le logo, l'étape, la frise). Partagé par le serveur (le PPTX) et l'écran
// (l'éditeur) : les deux dessinent la même chose avec les mêmes tailles.

export const LARGEUR = 1280;
export const HAUTEUR = 720;
export const BARRE = 72; // la barre noire du bas
export const CARTE = { x: 536, y: 40, w: 700, h: 568 };
export const HEROS = { x: 48, w: 408, bas: 56 }; // le panneau de gauche : marges, bas aligné

/**
 * Les tailles du panneau de gauche, en pixels de la diapositive, par
 * diapositive : `grand` (un chiffre), `titre` (un titre), `accroche`, `note`.
 */
export const TAILLES = {
  couverture: { titre: 80, accroche: 20 },
  sommaire: { titre: 96, accroche: 28 },
  ville: { grand: 60, accroche: 28 },
  emplacement: { titre: 60, accroche: 24 },
  quartier: { grand: 58, accroche: 28 },
  local: { grand: 100, accroche: 28 },
  photos: { titre: 72, accroche: 22 },
  bail: { grand: 116, accroche: 28 },
  enseignes: { titre: 62, accroche: 24 },
  marche: { grand: 86, accroche: 28 },
  projection: { grand: 72, accroche: 28 },
  revenus: { titre: 60, accroche: 17 },
  conditions: { titre: 66, accroche: 22 },
  porteur: { titre: 60, accroche: 22 },
  structuration: { grand: 100, accroche: 28 },
  merci: { titre: 150, accroche: 26 },
};

/** Le nom de chaque diapositive dans l'éditeur. */
export const NOMS = {
  couverture: "Couverture", sommaire: "Sommaire", ville: "La ville", emplacement: "Emplacement", quartier: "Quartier",
  local: "Le local", photos: "Le local en images", bail: "Le bail", enseignes: "Enseignes", marche: "Prix et marché",
  projection: "Projection", revenus: "Revenus fonciers", conditions: "Conditions", porteur: "Porteur du projet",
  structuration: "Structuration", merci: "Merci",
};
