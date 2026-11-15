import { pageDeChemin } from "@/lib/adresses";
import { PAGES_KDATA } from "@/lib/kdata-modules";
// L'arrivée sur une page (14 nov. 2026, Jules : « quand on arrive sur le CRM, je veux voir le chargement Klocka ; quand
// le tableau charge, juste un spinner simple ») : l'heure du dernier changement de page, notée par le cadre de l'app.
// Un chargement qui commence dans les deux secondes qui suivent est celui de la page ; plus tard, c'est un bloc qui se
// recharge.

let derniere = Date.now();

/** Note un changement de page (App.jsx, à chaque nouveau chemin). */
export function noterArrivee() { derniere = Date.now(); }

/** Vrai si l'on vient d'arriver sur la page. */
export function vientDArriver(fenetre = 2000) { return Date.now() - derniere < fenetre; }

// Le nom de l'écran noir selon la partie où l'on arrive (15 nov. 2026, Jules : « je veux voir CRM Klocka avec le
// balayage, pareil pour les Outils ») : « CRM Klocka », « Outils Klocka » ; ailleurs, la marque seule.
const PARTIES = [
  [(page) => page === "CrmTwenty", "CRM"],
  [(page) => PAGES_KDATA.includes(page), "Outils"],
];

/** Pure : « CRM Klocka », « Outils K Partners »… ou la marque seule hors de ces parties. */
export function nomDuChargement(chemin, marque = "Klocka") {
  const page = pageDeChemin(chemin);
  const partie = PARTIES.find(([est]) => est(page))?.[1];
  return partie ? `${partie} ${marque}` : marque;
}
