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

/** L'ordre du modèle : celui des seize diapositives, la couverture d'abord. */
export const ORDRE = Object.keys(NOMS);

/** Pure : les diapositives remises dans l'ordre du modèle ; une diapositive inconnue du modèle reste à la fin, dans son ordre. */
export function ordreDuModele(diapos = []) {
  const rang = (d) => { const i = ORDRE.indexOf(d.type || d.id); return i < 0 ? ORDRE.length : i; };
  return [...diapos].map((d, i) => ({ d, i })).sort((a, b) => rang(a.d) - rang(b.d) || a.i - b.i).map((x) => x.d);
}

/** Pure : la présentation est-elle dans l'ordre du modèle ? */
export const dansLOrdreDuModele = (diapos = []) => ordreDuModele(diapos).every((d, i) => d.id === diapos[i]?.id);

/** Les chapitres du sommaire, dans l'ordre : la diapositive où chacun commence. */
export const CIBLES_SOMMAIRE = ["ville", "emplacement", "quartier", "local", "bail", "projection", "conditions", "porteur"];

/**
 * Les parties qu'on peut masquer d'un coup, par diapositive (13 oct. 2026, Jules :
 * « masquer toute une partie, pas seulement les chiffres ») : la partie
 * disparaît avec son cadre, ses libellés et ses filets, et ce qui reste prend
 * la place. Un élément d'une liste (« chiffres.2 ») se masque de la même façon.
 * Masquer, c'est poser diapo.styles[chemin].masque ; rien n'est effacé.
 */
export const PARTIES = {
  couverture: [["photo", "La photo"], ["stats", "Les trois chiffres"]],
  sommaire: [["items", "Les chapitres"]],
  ville: [["photo", "La photo"], ["chiffres", "Les chiffres"], ["atouts", "Les atouts"]],
  emplacement: [["carte", "La carte"], ["flux", "Les flux"], ["flux.pieton", "Le flux piéton"], ["flux.voiture", "Le flux voiture"]],
  quartier: [["photo", "La photo"], ["chiffres", "Les indicateurs"], ["atouts", "Les atouts"]],
  local: [["stats", "Les trois chiffres"], ["identite", "L'identité"], ["economie", "L'économie de la signature"]],
  photos: [["photos.0", "La grande photo"], ["photos.1", "La photo 2"], ["photos.2", "La photo 3"]],
  bail: [["points", "Les points du bail"]],
  enseignes: [["enseignes", "Les enseignes"]],
  marche: [["marche.murs", "Le prix des murs"], ["marche.loyer", "Le loyer"], ["legende", "La légende"]],
  projection: [["lignes", "Les chiffres"], ["barres", "Le graphique"]],
  revenus: [["lignes", "Le tableau"]],
  conditions: [["blocs", "Les conditions"]],
  porteur: [["experiences", "Les expériences"], ["situation", "La situation professionnelle"], ["revenus", "Les revenus et l'épargne"]],
  structuration: [["associes", "Les associés"], ["structure", "La structure"], ["detient", "Le bien détenu"]],
  merci: [["photo", "La photo"], ["porteur", "Le contact"], ["coordonnees", "Le téléphone et l'e-mail"]],
};

/** Pure : ce chemin est-il masqué, lui ou une partie qui le contient (« flux » masque « flux.voiture.densite ») ? */
export function estMasque(styles, chemin) {
  if (!styles || !chemin) return false;
  const m = String(chemin).split(".");
  for (let k = 1; k <= m.length; k++) if (styles[m.slice(0, k).join(".")]?.masque) return true;
  return false;
}

/** Pure : les parties d'une diapositive qui contiennent ce chemin, de la plus large à la plus fine, avec un élément de liste (nom null : à nommer par son chemin). */
export function partiesDe(type, chemin) {
  const m = String(chemin || "").split(".");
  const connues = new Map(PARTIES[type] || []);
  const r = [];
  for (let k = 1; k <= m.length; k++) {
    const c = m.slice(0, k).join(".");
    if (connues.has(c)) r.push([c, connues.get(c)]);
    // Un élément de liste (« chiffres.2 ») : le chiffre entier, libellé compris.
    else if (/^\d+$/.test(m[k - 1]) && k < m.length) r.push([c, null]);
  }
  return r;
}
