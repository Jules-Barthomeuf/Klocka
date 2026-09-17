// Le prix FAI d'un lot, quand la fiche ne l'affiche pas tel quel.
//
// Une fiche commerciale annonce souvent un prix « hors honoraires » : le
// chiffre affiché est alors le net vendeur, et « honoraires inclus » le dit.
// Le prix FAI, celui sur lequel tout se calcule ici (verdict, AEM, simulateur),
// est ce prix plus les honoraires. Sans cette addition, un dossier hors
// honoraires se jugeait sur un prix trop bas d'un montant d'honoraires, et
// l'analyste devait taper le FAI à la main dans la fiche.
//
// Quand les honoraires sont inclus, ou qu'on ne connaît pas leur montant, le
// prix affiché est déjà le FAI : on le rend inchangé.

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

/** @param {object} lot - un lot extrait @returns {number|null} */
export function prixFai(lot) {
  const prix = val(lot?.prix_fai);
  if (prix == null) return null;
  const honoraires = val(lot?.montant_honoraires);
  return val(lot?.honoraires_inclus) === false && honoraires > 0 ? prix + honoraires : prix;
}

/** Le prix affiché sur la fiche est-il un net vendeur ? */
export function horsHonoraires(lot) {
  return val(lot?.honoraires_inclus) === false && (val(lot?.montant_honoraires) || 0) > 0;
}
