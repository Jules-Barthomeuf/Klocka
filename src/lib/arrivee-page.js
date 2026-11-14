// L'arrivée sur une page (14 nov. 2026, Jules : « quand on arrive sur le CRM, je veux voir le chargement Klocka ; quand
// le tableau charge, juste un spinner simple ») : l'heure du dernier changement de page, notée par le cadre de l'app.
// Un chargement qui commence dans les deux secondes qui suivent est celui de la page ; plus tard, c'est un bloc qui se
// recharge.

let derniere = Date.now();

/** Note un changement de page (App.jsx, à chaque nouveau chemin). */
export function noterArrivee() { derniere = Date.now(); }

/** Vrai si l'on vient d'arriver sur la page. */
export function vientDArriver(fenetre = 2000) { return Date.now() - derniere < fenetre; }
