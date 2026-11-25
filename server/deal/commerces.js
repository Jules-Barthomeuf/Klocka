// Les commerces d'un portefeuille (24 nov. 2026, Jules : « on a reçu un portefeuille, ça compte comme trois fiches car
// trois commerces ; ça devrait poser la question : préanalyse séparément ou en un seul lot ? »). Un lot loué à plusieurs
// locataires porte ses cellules dans `commerces` (deal/extract.js) ; une cellule vacante n'est pas un commerce. Pur.

/** Les commerces loués d'un lot ou d'un bien de la Mémoire. */
export const commercesLoues = (lot) => (Array.isArray(lot?.commerces) ? lot.commerces.filter((c) => c && !c.vacant && c.locataire) : []);

/** Les cellules vacantes d'un lot. */
export const cellulesVacantes = (lot) => (Array.isArray(lot?.commerces) ? lot.commerces.filter((c) => c?.vacant) : []);

/** Un portefeuille : au moins deux commerces loués. */
export const estPortefeuille = (lot) => commercesLoues(lot).length >= 2;
