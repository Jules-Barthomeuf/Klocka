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

//
// Un prix écrit hors taxe (27 nov. 2026, Jules : « une fiche reçue, c'était FAI hors taxe ; il faut le signaler et
// recalculer ») : la TVA de 20 % s'y ajoute, et tout se calcule sur le prix TTC. La fiche le dit (champ prix_ht, lu par
// l'extraction ou posé à la main) ; pour les dossiers lus avant, la citation du prix suffit (« 450 000 € FAI HT »).
// Ce module est aussi lu par l'écran (DealResultat.jsx) : la même règle des deux côtés.

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);
export const TVA = 0.2;

/** Pure : un texte de prix dit-il « hors taxe » ? Un loyer HT ou un prix TTC ne comptent pas. */
export function mentionHorsTaxe(texte) {
  const t = String(texte || '');
  if (!t || /\bTTC\b|toutes\s+taxes/i.test(t) || /loyer/i.test(t)) return false;
  return /(^|[^A-Za-z])H\.?\s?T\.?(?![A-Za-z])|hors[\s-]+tax|TVA\s+en\s+sus/i.test(t);
}

/** Le prix de la fiche est-il hors taxe ? Ce que dit le champ prix_ht d'abord, sinon la citation du prix lu. */
export function prixHorsTaxe(lot) {
  const c = lot?.prix_ht;
  if (c && c.absent === false) return c.valeur === true;
  const p = lot?.prix_fai;
  if (!p || p.absent !== false || p.saisi_a_la_main) return false;
  return mentionHorsTaxe(p.citation);
}

/** Le prix avec ses honoraires, avant la TVA. */
function prixAvantTva(lot) {
  const prix = val(lot?.prix_fai);
  if (prix == null) return null;
  const honoraires = val(lot?.montant_honoraires);
  return val(lot?.honoraires_inclus) === false && honoraires > 0 ? prix + honoraires : prix;
}

/** @param {object} lot - un lot extrait @returns {number|null} le prix sur lequel tout se calcule (TTC si la fiche le dit HT) */
export function prixFai(lot) {
  const avant = prixAvantTva(lot);
  if (avant == null) return null;
  return prixHorsTaxe(lot) ? Math.round(avant * (1 + TVA)) : avant;
}

/** Pure : le chiffre à écrire sur la fiche pour un prix de calcul donné (l'inverse de prixFai). */
export function prixDeLaFiche(lot, fai) {
  let v = Number(fai);
  if (prixHorsTaxe(lot)) v /= 1 + TVA;
  const honoraires = val(lot?.montant_honoraires);
  if (val(lot?.honoraires_inclus) === false && honoraires > 0) v -= honoraires;
  return Math.round(v);
}

/** Le prix hors taxe et le prix TTC, quand la fiche donne un prix hors taxe ; null sinon. */
export function prixEtTva(lot) {
  const ht = prixAvantTva(lot);
  if (ht == null || !prixHorsTaxe(lot)) return null;
  return { ht, tva: Math.round(ht * TVA), ttc: Math.round(ht * (1 + TVA)) };
}

/** Le prix affiché sur la fiche est-il un net vendeur ? */
export function horsHonoraires(lot) {
  return val(lot?.honoraires_inclus) === false && (val(lot?.montant_honoraires) || 0) > 0;
}

/**
 * Les dossiers déjà lus dont le prix est écrit hors taxe et dont le calcul enregistré porte encore le prix HT
 * (27 nov. 2026) : ils se recalculent une fois sur le TTC. Un dossier déjà compté TTC n'est pas touché.
 */
export async function recalculerPrixHorsTaxe({ Records, reevaluerLot }) {
  let refaits = 0;
  for (const d of Records.list('Deal')) {
    if (d.archived || !d.deal_id) continue;
    for (const [i, l] of (d.lots || []).entries()) {
      if (!l?.lot || !prixHorsTaxe(l.lot)) continue;
      const compte = Number(l.evaluation?.contexte?.prix_fai ?? l.evaluation?.aem?.prix_fai) || null;
      const attendu = prixFai(l.lot);
      if (compte != null && Math.round(compte) === attendu) continue;
      try {
        const r = await reevaluerLot(d.deal_id, i, {});
        if (!r?.error) refaits += 1;
      } catch (e) { console.warn(`[prix HT] ${d.deal_id} lot ${i} : ${e?.message || e}`); }
    }
  }
  if (refaits) console.log(`[prix HT] ${refaits} lot(s) recalculé(s) sur le prix TTC`);
  return refaits;
}
