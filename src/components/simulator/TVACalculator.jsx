/**
 * Calcul de la TVA déductible corrigé
 * Les honoraires Klocka sont TTC, donc il faut extraire la TVA contenue
 * Formule: HT = TTC / 1.2, TVA = TTC - HT
 */

export function calculerTVADeductible(params) {
  const {
    annee,
    totalFraisKlocka,
    tauxTVA,
    gestionLocativeCost,
    comptabiliteCost,
    assurancePNECost,
    chargesDiversesCost,
    travauxBailleurCost,
    honorairesChargeAcquereur = 0
  } = params;

  // TVA sur frais d'acquisition (année 1 uniquement)
  const fraisAcquisitionTTC = annee === 1 ? totalFraisKlocka : 0;
  const fraisAcquisitionHT = fraisAcquisitionTTC / (1 + tauxTVA / 100);
  const tvaFraisAcquisition = fraisAcquisitionTTC - fraisAcquisitionHT;

  // TVA sur honoraires à la charge de l'acquéreur (année 1 uniquement)
  const honorairesTTC = annee === 1 ? honorairesChargeAcquereur : 0;
  const honorairesHT = honorairesTTC / (1 + tauxTVA / 100);
  const tvaHonorairesAcquereur = honorairesTTC - honorairesHT;

  // TVA sur charges d'exploitation (toutes les années)
  // ATTENTION: Pas de TVA sur l'assurance PNE
  // Les charges sont TTC, on extrait la TVA contenue: TVA = TTC - TTC / (1 + taux)
  const chargesExploitationTTC = Math.abs(
    gestionLocativeCost +
    comptabiliteCost +
    chargesDiversesCost +
    travauxBailleurCost
  );
  const chargesExploitationHT = chargesExploitationTTC / (1 + tauxTVA / 100);
  const tvaChargesExploitation = chargesExploitationTTC - chargesExploitationHT;

  return Math.round(tvaFraisAcquisition + tvaChargesExploitation + tvaHonorairesAcquereur);
}