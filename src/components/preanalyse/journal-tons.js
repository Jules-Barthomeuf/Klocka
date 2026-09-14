/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
// Le vocabulaire visuel du journal d'analyste, partagé par tous ses morceaux.
import { J } from "@/design/jetons";
//
// Le code couleur porte l'essentiel du sens : on doit pouvoir lire l'état d'une
// recherche de loin, sans lire les phrases. Il vit ici pour qu'une couleur
// n'ait jamais deux définitions selon le fichier qui la dessine.

export const TONS = {
  // réussite, étape terminée, conclusion positive
  menthe: { pastille: J["menthe"], texte: J["craie"], etiquette: J["menthe"], bord: "rgba(150,192,184,.35)" },
  // action en cours
  gris: { pastille: J["brume"], texte: J["ardoise"], etiquette: J["ardoise"], bord: "rgba(146,152,166,.30)" },
  // lenteur, trop peu de résultats, écart entre sources
  ambre: { pastille: J["ambre"], texte: "#e4dcc9", etiquette: J["ambre"], bord: "rgba(217,164,65,.35)" },
  // échec de connexion, identifiants expirés
  rouge: { pastille: J["alerte"], texte: "#f0d6d4", etiquette: J["alerte"], bord: "rgba(224,101,95,.38)" },
  // synthèse finale
  bleu: { pastille: "#8fb3d9", texte: "#dce7f2", etiquette: "#8fb3d9", bord: "rgba(143,179,217,.35)" },
};

export const ton = (nom) => TONS[nom] || TONS.gris;

/** Une entrée reste « fraîche » ce temps-là : pastille animée, encart souligné. */
export const DUREE_FRAICHE = 1.6;

/**
 * Le temps écoulé depuis le lancement : « 00s », « 07s », « 72s ».
 *
 * Une heure du jour donnait un faux air de vérité à une séquence qui est
 * écrite, et n'apprenait rien : ce qui compte ici, c'est au bout de combien de
 * secondes une source a répondu, pas qu'il était 9 h 41.
 */
export const chrono = (t) => `${String(Math.max(0, Math.floor(t))).padStart(2, "0")}s`;

/** « 1:12 » — la durée annoncée avant de lancer. */
export function dureeLisible(secondes) {
  const s = Math.round(secondes);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
