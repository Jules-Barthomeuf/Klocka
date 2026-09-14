// Le socle visuel, pour le JavaScript.
//
// Les classes Tailwind couvrent l'immense majorité des cas ; restent les
// styles posés en ligne (un dégradé calculé, la teinte d'une pile ALX, la
// couleur d'une barre de graphique). Ceux-là lisent la palette ici, jamais
// un hexadécimal écrit sur place.

import jetons from "./jetons.json";

/** La palette, par rôle. `J.menthe`, `J.ardoise`, `J["emplacement-1"]`. */
export const J = jetons.couleurs;

/** L'échelle de texte, en pixels. */
export const TEXTE = jetons.texte;

/** Les trois rayons. */
export const RAYONS = jetons.rayons;

/** Une teinte diluée : `alpha("menthe", 0.12)`. */
export const alpha = (nom, part) => {
  const hex = J[nom] || nom;
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${part})`;
};

export default J;
