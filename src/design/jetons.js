// Le socle visuel, pour le JavaScript.
//
// Les classes Tailwind couvrent l'immense majorité des cas ; restent les
// styles posés en ligne (un dégradé calculé, la teinte d'une pile ALX, la
// couleur d'une barre de graphique). Ceux-là lisent la palette ici, jamais
// un hexadécimal écrit sur place.
//
// Deux sorties, et il faut choisir la bonne :
//
//   J   — la palette en variables CSS. C'est le défaut, et ce qu'il faut pour
//         tout style posé sur un élément du DOM : la couleur suit alors le
//         thème, clair ou sombre, sans que le composant ait à le savoir.
//
//   JL  — la même palette en valeurs littérales, figée sur le thème sombre.
//         Réservée à ce qui ne sait pas lire une variable CSS : les attributs
//         de présentation SVG (Leaflet écrit fill et stroke en attributs, où
//         var() ne se résout pas) et les dessins sur canvas.
//
// Se tromper de sortie ne casse rien bruyamment : la couleur devient
// simplement transparente sur une carte, ou cesse de suivre le thème dans une
// page. D'où ces lignes.

import jetons from "./jetons.json";

/** La palette littérale, thème sombre. Pour le SVG et le canvas seulement. */
export const JL = jetons.couleurs;

const estPlein = (valeur) => typeof valeur === "string" && valeur.startsWith("#");

/**
 * La palette, par rôle, en variables CSS : `J.menthe`, `J["emplacement-1"]`.
 * Un jeton plein rend `rgb(var(--k-nom-rgb))`, un jeton déjà translucide rend
 * sa variable entière — son opacité lui appartient.
 */
export const J = Object.fromEntries(
  Object.entries(jetons.couleurs).map(([nom, valeur]) => [
    nom,
    estPlein(valeur) ? `rgb(var(--k-${nom}-rgb))` : `var(--k-${nom})`,
  ])
);

/** L'échelle de texte, en pixels. */
export const TEXTE = jetons.texte;

/** Les trois rayons. */
export const RAYONS = jetons.rayons;

/**
 * Une teinte diluée : `alpha("menthe", 0.12)`.
 *
 * Elle suit le thème, comme `J`. Elle ne vaut que pour un jeton plein : un
 * jeton déjà translucide n'a pas de triplet à diluer, et aucun appel n'en
 * demande — les six jetons dilués dans l'application sont menthe, menthe-clair,
 * menthe-fonce, ambre, craie et alerte.
 */
export const alpha = (nom, part) => {
  const valeur = jetons.couleurs[nom];
  if (!estPlein(valeur)) {
    // Un nom inconnu ou déjà translucide : on rend ce qu'on nous a donné
    // plutôt qu'une couleur fausse.
    return valeur || nom;
  }
  return `rgb(var(--k-${nom}-rgb) / ${part})`;
};

export default J;
