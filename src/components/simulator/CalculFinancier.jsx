import { calculerTVADeductible } from "./TVACalculator";

function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

export function calculerTableauAnnuel(params) {
  const {
    surface, loyerInitialHTHC, loyerRevalorise, anneeRevalorisation, prixBienFAI, prixBienNegocie,
    tauxCommissionAgent, commissionAgentType, commissionAgentActive, commissionAgentInclusFAI,
    tauxDroitsEnregistrement,
    tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, fraisDossierBancaire, coutCreationSociete,
    fraisCourtage, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive,
    anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, vacancesLocatives,
    travauxBailleur, gestionLocative, comptabilite, assurancePNE, chargesDiverses,
    chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere,
    loyerSoumisTVA, tauxTVA, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur,
    revalorisationActive, pretInFine
  } = params;

  const loyerParM2 = surface > 0 ? Math.round(loyerInitialHTHC / surface) : 0;
  const loyerRevaloriseParM2 = loyerRevalorise > 0 && surface > 0 ? Math.round(loyerRevalorise / surface) : 0;

  // Calcul honoraires charge acquéreur
  const honorairesChargeAcquereur = commissionAgentActive
    ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100))
    : 0;

  // Si inclus dans FAI: on déduit du prix pour obtenir le prix hors droits
  // Si en sus du FAI: le prix hors droits = prix négocié, et les honoraires s'ajoutent au prix de revient
  const inclusFAI = commissionAgentInclusFAI !== false; // default true
  const prixHorsDroits = inclusFAI ? (prixBienNegocie - honorairesChargeAcquereur) : prixBienNegocie;
  const droitsEnregistrement = prixHorsDroits * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
  const travauxAnnee0 = travauxBailleur[0] || 0;
  // Si en sus: on ajoute les honoraires au prix de revient
  const prixRevient = prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0
    + (inclusFAI ? 0 : honorairesChargeAcquereur);

  const montantEmprunt = prixRevient - apport;
  const pourcentageEmprunt = prixRevient > 0 ? Math.round(montantEmprunt / prixRevient * 100) : 0;
  const pourcentageApport = prixRevient > 0 ? Math.round(apport / prixRevient * 100) : 0;
  const totalFinancement = apport + montantEmprunt;
  const amortissementAnnuel = prixHorsDroits * 0.8 / 25;

  const tableauAnnuel = [];
  let currentCapitalRestantDu = montantEmprunt;
  let currentTauxInteret = tauxInteret;
  let currentDureeCreditRestanteMois = dureeCredit * 12;
  // Pour prêt in fine : mensualité = intérêts seulement (pas de PMT amortissable)
  const echeanceMensuelleInFine = montantEmprunt > 0 ? montantEmprunt * (tauxInteret / 100 / 12) : 0;
  let currentEcheanceMensuelle = pretInFine
    ? echeanceMensuelleInFine
    : (montantEmprunt > 0 ? Math.abs(PMT(tauxInteret / 100 / 12, dureeCredit * 12, montantEmprunt)) : 0);
  let capitalRembourseCumule = 0;
  let loyerAnnuelBrutHTPrevious = loyerInitialHTHC;

  for (let annee = 0; annee <= 25; annee++) {
    let loyerBrutAnnuel = 0;
    if (annee === 0) loyerBrutAnnuel = 0;
    else if (annee === 1) loyerBrutAnnuel = loyerInitialHTHC;
    else loyerBrutAnnuel = loyerAnnuelBrutHTPrevious * (1 + indexation / 100);

    if (revalorisationActive && anneeRevalorisation !== null && annee === anneeRevalorisation && loyerRevalorise > 0) {
      loyerBrutAnnuel = loyerRevalorise;
    }
    loyerAnnuelBrutHTPrevious = loyerBrutAnnuel;

    const nbMoisVacance = annee > 0 && annee <= 25 ? vacancesLocatives[annee - 1] || 0 : 0;
    const coutVacance = -(loyerBrutAnnuel / 12) * nbMoisVacance;
    const chargesCoproNonRefact = !chargesCoproRefacturables && annee >= 1 ? -chargesCopropriete : 0;
    const taxeFonciereNonRefact = !taxeFonciereRefacturable && annee >= 1 ? -taxeFonciere : 0;
    const loyersNetsCashFlow = loyerBrutAnnuel + coutVacance + chargesCoproNonRefact + taxeFonciereNonRefact;
    const rendementLocatifNet = prixRevient > 0 ? loyersNetsCashFlow / prixRevient * 100 : 0;

    let interetsAnnuels = 0, capitalRembourseAnnuel = 0, assuranceCreditAnnuel = 0, iraAnnuel = 0, echeanceAnnuelleTotal = 0;

    if (annee > 0 && currentCapitalRestantDu > 0 && currentDureeCreditRestanteMois > 0) {
      if (pretInFine) {
        // Prêt in fine : on ne rembourse que les intérêts chaque année
        const tauxMensuel = currentTauxInteret / 100 / 12;
        const moisACalculer = Math.min(12, currentDureeCreditRestanteMois);
        for (let mois = 0; mois < moisACalculer; mois++) {
          interetsAnnuels += currentCapitalRestantDu * tauxMensuel;
          currentDureeCreditRestanteMois--;
        }
        // Dernière année : on rembourse tout le capital d'un coup
        if (annee === dureeCredit) {
          capitalRembourseAnnuel = montantEmprunt;
          currentCapitalRestantDu = 0;
        }
        echeanceAnnuelleTotal = interetsAnnuels + capitalRembourseAnnuel;
      } else if (renegociationActive && annee === anneeRenegociation) {
        const tauxMensuelAvant = tauxInteret / 100 / 12;
        let capitalTemp = currentCapitalRestantDu;
        for (let mois = 0; mois < 12; mois++) {
          if (capitalTemp <= 0) break;
          const interetMois = capitalTemp * tauxMensuelAvant;
          interetsAnnuels += interetMois;
          const capitalMois = currentEcheanceMensuelle - interetMois;
          capitalRembourseAnnuel += capitalMois;
          capitalTemp -= capitalMois;
        }
        iraAnnuel = interetsAnnuels * iraRenegociation / 12;
        currentCapitalRestantDu = Math.max(0, currentCapitalRestantDu - capitalRembourseAnnuel);
        currentTauxInteret = nouveauTauxRenegociation;
        currentDureeCreditRestanteMois = Math.max(0, (dureeCredit - annee) * 12);
        const newTauxMensuel = currentTauxInteret / 100 / 12;
        if (currentDureeCreditRestanteMois > 0 && currentCapitalRestantDu > 0) {
          currentEcheanceMensuelle = Math.abs(PMT(newTauxMensuel, currentDureeCreditRestanteMois, currentCapitalRestantDu));
        }
        echeanceAnnuelleTotal = interetsAnnuels + capitalRembourseAnnuel;
      } else {
        const tauxMensuel = currentTauxInteret / 100 / 12;
        const moisACalculer = Math.min(12, currentDureeCreditRestanteMois);
        let capitalTemp = currentCapitalRestantDu;
        for (let mois = 0; mois < moisACalculer; mois++) {
          if (capitalTemp <= 0) break;
          const interetMois = capitalTemp * tauxMensuel;
          interetsAnnuels += interetMois;
          const capitalMois = currentEcheanceMensuelle - interetMois;
          capitalRembourseAnnuel += capitalMois;
          capitalTemp -= capitalMois;
          currentDureeCreditRestanteMois--;
        }
        currentCapitalRestantDu = Math.max(0, currentCapitalRestantDu - capitalRembourseAnnuel);
        echeanceAnnuelleTotal = interetsAnnuels + capitalRembourseAnnuel;
      }
      assuranceCreditAnnuel = annee >= 1 && annee <= dureeCredit ? -(montantEmprunt * (tauxAssuranceCredit / 100)) : 0;
    }

    const creditBancaireCashFlow = -(echeanceAnnuelleTotal + Math.abs(assuranceCreditAnnuel) + iraAnnuel);
    const basePourGestion = loyerBrutAnnuel + coutVacance;
    const baseGestion = basePourGestion - (chargesCoproRefacturables ? chargesCopropriete : 0) - (taxeFonciereRefacturable ? taxeFonciere : 0);
    const gestionLocativeCost = annee >= 1 ? -(baseGestion * (gestionLocative / 100)) : 0;
    const comptabiliteCost = annee >= 1 ? -comptabilite : 0;
    const assurancePNECost = annee >= 1 ? -assurancePNE : 0;
    const chargesDiversesCost = annee >= 1 ? -chargesDiverses : 0;
    const travauxBailleurCost = annee > 0 && annee <= 25 ? -(travauxBailleur[annee - 1] || 0) : 0;
    const totalOperatingChargesCashFlow = gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
    const chargesAcquisitionCashFlow = annee === 0 ? -(droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0) : 0;
    const amortissementDeductible = annee >= 1 ? amortissementAnnuel : 0;

    tableauAnnuel.push({
      annee, loyerBrutAnnuel, nbMoisVacance, coutVacance, chargesCopro: chargesCoproNonRefact,
      taxeFonciere: taxeFonciereNonRefact, loyersNets: loyersNetsCashFlow,
      rendementLocatifNet: rendementLocatifNet.toFixed(2), interetsAnnuels: -interetsAnnuels,
      capitalRembourse: -capitalRembourseAnnuel, echeanceAnnuelle: echeanceAnnuelleTotal,
      capitalRestantDu: currentCapitalRestantDu, ira: -iraAnnuel, assuranceCredit: assuranceCreditAnnuel,
      gestionLocativeCost, comptabiliteCost, assurancePNECost, chargesDiversesCost, travauxBailleurCost,
      chargesAcquisitionCashFlow, totalCharges: totalOperatingChargesCashFlow + chargesAcquisitionCashFlow,
      amortissement: -amortissementDeductible, amortissementDeductible, beneficeImposable: 0, impot: 0,
      tvaCollectee: 0, tvaDeductible: 0, creditTVA: 0, tresorerieTVACashFlow: 0,
      cashFlowAnnuel: 0, cashFlowMensuel: 0, capitalRembourseCumule: 0, patrimoineNet: 0, gainNetCumule: 0,
      creditBancaireCashFlow, totalCreditBancaire: echeanceAnnuelleTotal + Math.abs(assuranceCreditAnnuel) + iraAnnuel,
      iraAnnuel
    });

    let beneficeImposable = 0;
    if (annee >= 1) {
      const loyersNets = loyersNetsCashFlow;
      const chargesExploitationCourantes = gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
      const fraisAcquisitionDeduitsAnnee1 = droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0;

      if (annee === 1) {
        beneficeImposable = loyersNets - amortissementDeductible - interetsAnnuels + chargesExploitationCourantes - fraisAcquisitionDeduitsAnnee1;
      } else {
        let base = loyersNetsCashFlow - amortissementDeductible - interetsAnnuels + gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
        const deficitPrecedent = tableauAnnuel[annee - 1].beneficeImposable;
        if (deficitPrecedent < 0) base += deficitPrecedent;
        beneficeImposable = base;
      }
      beneficeImposable = Math.round(beneficeImposable);
    }

    let impotAnnuel = 0;
    if (annee >= 1 && beneficeImposable > 0) {
      impotAnnuel = beneficeImposable <= 42500 ? -(beneficeImposable * 0.15) : -(42500 * 0.15 + (beneficeImposable - 42500) * 0.25);
    }

    let tvaCollecteeAnnuel = 0, tvaDeductibleTotalAnnuel = 0, tvaNetCashFlowAnnuel = 0, creditTVAAnnuel = 0;
    if (loyerSoumisTVA && annee >= 1) {
      tvaCollecteeAnnuel = Math.round(loyerBrutAnnuel * (tauxTVA / 100));
      tvaDeductibleTotalAnnuel = calculerTVADeductible({
        annee, totalFraisKlocka, tauxTVA, gestionLocativeCost, comptabiliteCost, assurancePNECost,
        chargesDiversesCost, travauxBailleurCost, honorairesChargeAcquereur
      });
      creditTVAAnnuel = Math.max(0, tvaDeductibleTotalAnnuel - tvaCollecteeAnnuel);
      const creditTVAPrecedent = annee > 1 ? tableauAnnuel[annee - 1]?.creditTVA || 0 : 0;
      tvaNetCashFlowAnnuel = tvaCollecteeAnnuel > tvaDeductibleTotalAnnuel
        ? tvaDeductibleTotalAnnuel + creditTVAPrecedent
        : tvaCollecteeAnnuel + creditTVAPrecedent;
    }

    const row = tableauAnnuel[tableauAnnuel.length - 1];
    row.tvaCollectee = Math.round(tvaCollecteeAnnuel);
    row.tvaDeductible = Math.round(tvaDeductibleTotalAnnuel);
    row.creditTVA = Math.round(creditTVAAnnuel);
    row.tresorerieTVACashFlow = Math.round(tvaNetCashFlowAnnuel);

    const cashFlowAnnuel = loyersNetsCashFlow + creditBancaireCashFlow + totalOperatingChargesCashFlow + tvaNetCashFlowAnnuel + impotAnnuel;
    const cashFlowMensuel = cashFlowAnnuel / 12;
    capitalRembourseCumule += capitalRembourseAnnuel;

    const prixVenteFAITemp = rendementBrutAcheteur > 0 ? loyerBrutAnnuel / (rendementBrutAcheteur / 100) : 0;
    const commissionAgentReventeTemp = prixVenteFAITemp * (tauxCommissionAgentRevente / 100);
    const prixVenteNetTemp = prixVenteFAITemp - commissionAgentReventeTemp;
    const patrimoineNet = prixVenteNetTemp - currentCapitalRestantDu;
    const cashFlowCumuleJusquAnneePrecedente = tableauAnnuel.slice(0, -1).reduce((s, r) => s + r.cashFlowAnnuel, 0);
    const cashFlowCumuleForYear = cashFlowCumuleJusquAnneePrecedente + cashFlowAnnuel;
    const gainNetCumule = cashFlowCumuleForYear + patrimoineNet;

    row.beneficeImposable = beneficeImposable;
    row.impot = Math.round(impotAnnuel);
    row.cashFlowAnnuel = cashFlowAnnuel;
    row.cashFlowMensuel = cashFlowMensuel;
    row.capitalRembourseCumule = capitalRembourseCumule;
    row.patrimoineNet = patrimoineNet;
    row.gainNetCumule = gainNetCumule;
  }

  const loyerHTRevente = tableauAnnuel[anneeRevente]?.loyersNets || 0;
  const loyerHTParM2Revente = surface > 0 ? Math.round(loyerHTRevente / surface) : 0;
  const amortissementsCumules = tableauAnnuel.slice(1, anneeRevente + 1).reduce((sum, row) => sum + (row.amortissementDeductible || 0), 0);
  const valeurNetComptable = prixHorsDroits * 0.8 - amortissementsCumules;
  const vncParM2 = surface > 0 ? Math.round(valeurNetComptable / surface) : 0;
  const prixVenteFAI = rendementBrutAcheteur > 0 ? Math.round(loyerHTRevente / (rendementBrutAcheteur / 100)) : 0;
  const commissionAgentRevente = prixVenteFAI * (tauxCommissionAgentRevente / 100);
  const prixVenteNet = prixVenteFAI - commissionAgentRevente;
  const prixNetParM2 = surface > 0 ? Math.round(prixVenteNet / surface) : 0;
  const rendementNetAcheteur = prixVenteFAI > 0 ? loyerHTRevente / prixVenteFAI / 1.075 * 100 : 0;

  const filteredRendements = tableauAnnuel.slice(1, anneeRevente + 1).filter((row) => !isNaN(parseFloat(row.rendementLocatifNet)));
  const rendementLocatifGlobalNet = filteredRendements.length > 0
    ? filteredRendements.reduce((sum, row) => sum + parseFloat(row.rendementLocatifNet), 0) / filteredRendements.length
    : 0;

  const rendementEnCapital = prixRevient > 0 && anneeRevente > 0 ? (prixVenteNet - prixRevient) / prixRevient / anneeRevente * 100 : 0;
  const loyerAnnuelMoyen = tableauAnnuel.slice(1, anneeRevente + 1).reduce((sum, row) => sum + row.loyerBrutAnnuel, 0) / anneeRevente;
  const loyerNetMoyen = tableauAnnuel.slice(1, anneeRevente + 1).reduce((sum, row) => sum + row.loyersNets, 0) / anneeRevente;
  const capitalRembourseAnnuelMoyen = tableauAnnuel.slice(1, anneeRevente + 1).reduce((sum, row) => sum + Math.abs(row.capitalRembourse), 0) / anneeRevente;
  const cashFlowCumule = tableauAnnuel.slice(0, anneeRevente + 1).reduce((sum, row) => sum + row.cashFlowAnnuel, 0);
  const cashFlowMoyenAn = anneeRevente > 0 ? cashFlowCumule / anneeRevente : 0;
  const cashFlowMoyenMois = cashFlowMoyenAn / 12;
  const margeBruteRevente = prixVenteNet - prixRevient;
  const pourcentageMargeBrute = prixRevient > 0 ? margeBruteRevente / prixRevient * 100 : 0;
  const capitalARemboursserRevente = tableauAnnuel[anneeRevente]?.capitalRestantDu || 0;
  const creationRichesseBrute = cashFlowCumule + prixVenteNet - apport - capitalARemboursserRevente;
  const plusValue = prixVenteNet - valeurNetComptable;
  let impotPlusValue = 0;
  if (plusValue > 0) impotPlusValue = Math.min(plusValue, 42500) * 0.15 + Math.max(plusValue - 42500, 0) * 0.25;
  const multipleNetFondsPropres = apport > 0 ? creationRichesseBrute / apport : 0;
  const triBrut = apport > 0 && anneeRevente > 0 ? (Math.pow(1 + creationRichesseBrute / apport, 1 / anneeRevente) - 1) * 100 : 0;

  let anneeRecuperationApport = null, cumulRecuperationApport = 0;
  for (let i = 1; i <= tableauAnnuel.length - 1; i++) {
    const row = tableauAnnuel[i];
    cumulRecuperationApport += row.cashFlowAnnuel + Math.abs(row.capitalRembourse);
    if (cumulRecuperationApport >= apport) {
      anneeRecuperationApport = i;
      break;
    }
  }

  return {
    loyerParM2, loyerRevaloriseParM2,
    honorairesChargeAcquereur: Math.round(honorairesChargeAcquereur), prixHorsDroits: Math.round(prixHorsDroits),
    droitsEnregistrement: Math.round(droitsEnregistrement), feesKlocka: Math.round(feesKlocka),
    incentiveKlocka: Math.round(incentiveKlocka), totalFraisKlocka: Math.round(totalFraisKlocka),
    fraisDivers: Math.round(fraisDivers), prixRevient: Math.round(prixRevient), montantEmprunt: Math.round(montantEmprunt),
    pourcentageEmprunt, pourcentageApport, totalFinancement: Math.round(totalFinancement),
    echeanceMensuelle: Math.round(currentEcheanceMensuelle), tableauAnnuel,
    revente: {
      loyerHTRevente: Math.round(loyerHTRevente), loyerHTParM2Revente,
      valeurNetComptable: Math.round(valeurNetComptable), vncParM2, prixVenteFAI: Math.round(prixVenteFAI),
      commissionAgentRevente: Math.round(commissionAgentRevente), prixVenteNet: Math.round(prixVenteNet),
      prixNetParM2, rendementNetAcheteur: rendementNetAcheteur.toFixed(1)
    },
    indicateurs: {
      nbAnnees: anneeRevente, rendementLocatifGlobalNet: rendementLocatifGlobalNet.toFixed(1),
      rendementEnCapital: rendementEnCapital.toFixed(1), triBrut: triBrut.toFixed(2),
      loyerAnnuelMoyen: Math.round(loyerAnnuelMoyen), capitalRembourseAnnuelMoyen: Math.round(capitalRembourseAnnuelMoyen),
      cashFlowCumule: Math.round(cashFlowCumule), cashFlowMoyenAn: Math.round(cashFlowMoyenAn),
      cashFlowMoyenMois: Math.round(cashFlowMoyenMois), margeBruteRevente: Math.round(margeBruteRevente),
      pourcentageMargeBrute: pourcentageMargeBrute.toFixed(2), capitalARemboursserRevente: Math.round(capitalARemboursserRevente),
      creationRichesseBrute: Math.round(creationRichesseBrute), impotPlusValue: Math.round(impotPlusValue),
      multipleNetFondsPropres: multipleNetFondsPropres.toFixed(2), apportInitial: apport,
      plusValue: Math.round(plusValue), anneeRecuperationApport, loyerNetMoyen: Math.round(loyerNetMoyen)
    }
  };
}