import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

// Fonction PMT Excel
function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

export default function TableauProjection() {
  const [params, setParams] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    loyers: false,
    credit: false,
    charges_exploitation: false,
    fiscalite: false,
    tva: false,
    cashflow: false
  });

  useEffect(() => {
    // Récupérer les paramètres depuis l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const data = urlParams.get('data');
    if (data) {
      try {
        const parsedParams = JSON.parse(decodeURIComponent(data));
        setParams(parsedParams);
      } catch (error) {
        console.error('Erreur parsing params:', error);
      }
    }
  }, []);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(value)).replace(/\u00A0/g, ' ');
  };

  if (!params) {
    return (
      <div className="min-h-screen bg-[#0a0f0e] flex items-center justify-center">
        <p className="text-white">Chargement des données...</p>
      </div>
    );
  }

  // Recalculer le tableau avec les paramètres reçus
  const {
    surface, loyerInitialHTHC, loyerSoumisTVA, tauxTVA, chargesCoproRefacturables, chargesCopropriete,
    taxeFonciereRefacturable, taxeFonciere, loyerRevalorise, anneeRevalorisation, revalorisationActive,
    gestionLocative, comptabilite, chargesDiverses, assurancePNE, fraisDossierBancaire, fraisCourtage,
    coutCreationSociete, vacancesLocatives, travauxBailleur, prixBienFAI, prixBienNegocie,
    tauxCommissionAgent, commissionAgentType, commissionAgentActive, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType,
    tauxIncentiveKlocka, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive,
    anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, anneeRevente,
    tauxCommissionAgentRevente, rendementBrutAcheteur
  } = params;

  // Calculs (repris du simulateur)
  const honorairesChargeAcquereur = commissionAgentActive
    ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienFAI * (tauxCommissionAgent / 100))
    : 0;
  const commissionAgent = 0;
  const prixHorsDroits = prixBienNegocie - commissionAgent;
  const droitsEnregistrement = prixBienNegocie * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
  const travauxAnnee0 = travauxBailleur[0] || 0;
  const prixRevient = prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0;
  const montantEmprunt = prixRevient - apport;
  const amortissementAnnuel = (prixHorsDroits * 0.8) / 25;

  const tableauAnnuel = [];
  let currentCapitalRestantDu = montantEmprunt;
  let currentTauxInteret = tauxInteret;
  let currentDureeCreditRestanteMois = dureeCredit * 12;
  let currentEcheanceMensuelle = montantEmprunt > 0 ? Math.abs(PMT((tauxInteret / 100) / 12, dureeCredit * 12, montantEmprunt)) : 0;
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

    const nbMoisVacance = (annee > 0 && annee <= 25) ? (vacancesLocatives[annee - 1] || 0) : 0;
    const coutVacance = -(loyerBrutAnnuel / 12) * nbMoisVacance;
    const chargesCoproNonRefact = (!chargesCoproRefacturables && annee >= 1) ? -chargesCopropriete : 0;
    const taxeFonciereNonRefact = (!taxeFonciereRefacturable && annee >= 1) ? -taxeFonciere : 0;
    const loyersNetsCashFlow = loyerBrutAnnuel + coutVacance + chargesCoproNonRefact + taxeFonciereNonRefact;
    const rendementLocatifNet = prixRevient > 0 ? (loyersNetsCashFlow / prixRevient) * 100 : 0;

    let interetsAnnuels = 0;
    let capitalRembourseAnnuel = 0;
    let assuranceCreditAnnuel = 0;
    let iraAnnuel = 0;
    let echeanceAnnuelleTotal = 0;

    if (annee > 0 && currentCapitalRestantDu > 0 && currentDureeCreditRestanteMois > 0) {
      if (renegociationActive && annee === anneeRenegociation) {
        const tauxMensuelAvant = (tauxInteret / 100) / 12;
        let capitalTemp = currentCapitalRestantDu;

        for (let mois = 0; mois < 12; mois++) {
          if (capitalTemp <= 0) break;
          const interetMois = capitalTemp * tauxMensuelAvant;
          interetsAnnuels += interetMois;
          const capitalMois = currentEcheanceMensuelle - interetMois;
          capitalRembourseAnnuel += capitalMois;
          capitalTemp -= capitalMois;
        }

        iraAnnuel = (interetsAnnuels * iraRenegociation) / 12;
        currentCapitalRestantDu = Math.max(0, currentCapitalRestantDu - capitalRembourseAnnuel);
        currentTauxInteret = nouveauTauxRenegociation;
        currentDureeCreditRestanteMois = Math.max(0, (dureeCredit - annee) * 12);
        const newTauxMensuel = (currentTauxInteret / 100) / 12;
        if (currentDureeCreditRestanteMois > 0 && currentCapitalRestantDu > 0) {
          currentEcheanceMensuelle = Math.abs(PMT(newTauxMensuel, currentDureeCreditRestanteMois, currentCapitalRestantDu));
        }
        echeanceAnnuelleTotal = interetsAnnuels + capitalRembourseAnnuel;
      } else {
        const tauxMensuel = (currentTauxInteret / 100) / 12;
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

      assuranceCreditAnnuel = (annee >= 1 && annee <= dureeCredit)
        ? -(montantEmprunt * (tauxAssuranceCredit / 100))
        : 0;
    }

    const creditBancaireCashFlow = -(echeanceAnnuelleTotal + Math.abs(assuranceCreditAnnuel) + iraAnnuel);
    const basePourGestion = loyerBrutAnnuel + coutVacance;
    const baseGestion = basePourGestion
      - (chargesCoproRefacturables ? chargesCopropriete : 0)
      - (taxeFonciereRefacturable ? taxeFonciere : 0);

    const gestionLocativeCost = annee >= 1 ? -(baseGestion * (gestionLocative / 100)) : 0;
    const comptabiliteCost = annee >= 1 ? -comptabilite : 0;
    const assurancePNECost = annee >= 1 ? -assurancePNE : 0;
    const chargesDiversesCost = annee >= 1 ? -chargesDiverses : 0;
    const travauxBailleurCost = (annee > 0 && annee <= 25) ? -(travauxBailleur[annee - 1] || 0) : 0;
    const totalOperatingChargesCashFlow = gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
    const chargesAcquisitionCashFlow = annee === 0 ? -(droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0) : 0;
    const amortissementDeductible = annee >= 1 ? amortissementAnnuel : 0;

    tableauAnnuel.push({
      annee,
      loyerBrutAnnuel,
      nbMoisVacance,
      coutVacance,
      chargesCopro: chargesCoproNonRefact,
      taxeFonciere: taxeFonciereNonRefact,
      loyersNets: loyersNetsCashFlow,
      rendementLocatifNet: rendementLocatifNet.toFixed(2),
      interetsAnnuels: -interetsAnnuels,
      capitalRembourse: -capitalRembourseAnnuel,
      echeanceAnnuelle: echeanceAnnuelleTotal,
      capitalRestantDu: currentCapitalRestantDu,
      ira: -iraAnnuel,
      assuranceCredit: assuranceCreditAnnuel,
      gestionLocativeCost,
      comptabiliteCost,
      assurancePNECost,
      chargesDiversesCost,
      travauxBailleurCost,
      chargesAcquisitionCashFlow,
      totalCharges: totalOperatingChargesCashFlow + chargesAcquisitionCashFlow,
      amortissement: -amortissementDeductible,
      amortissementDeductible,
      beneficeImposable: 0,
      impot: 0,
      tvaCollectee: 0,
      tvaDeductible: 0,
      creditTVA: 0,
      tresorerieTVACashFlow: 0,
      cashFlowAnnuel: 0,
      cashFlowMensuel: 0,
      capitalRembourseCumule: 0,
      patrimoineNet: 0,
      gainNetCumule: 0,
      creditBancaireCashFlow,
      totalCreditBancaire: echeanceAnnuelleTotal + Math.abs(assuranceCreditAnnuel) + iraAnnuel,
      iraAnnuel: iraAnnuel,
    });

    let beneficeImposable = 0;

    if (annee >= 1) {
      const loyersNets = loyersNetsCashFlow;
      const chargesExploitationCourantes =
        gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
      const fraisAcquisitionDeduitsAnnee1 = droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0;

      if (annee === 1) {
        beneficeImposable = loyersNets - amortissementDeductible - interetsAnnuels + chargesExploitationCourantes - fraisAcquisitionDeduitsAnnee1;
      } else {
        let base = loyersNetsCashFlow - amortissementDeductible - interetsAnnuels + gestionLocativeCost + comptabiliteCost + assurancePNECost + chargesDiversesCost + travauxBailleurCost;
        const deficitPrecedent = tableauAnnuel[annee - 1].beneficeImposable;
        if (deficitPrecedent < 0) {
          base += deficitPrecedent;
        }
        beneficeImposable = base;
      }
      beneficeImposable = Math.round(beneficeImposable);
    }

    let impotAnnuel = 0;
    if (annee >= 1 && beneficeImposable > 0) {
      if (beneficeImposable <= 42500) {
        impotAnnuel = -(beneficeImposable * 0.15);
      } else {
        impotAnnuel = -(42500 * 0.15 + (beneficeImposable - 42500) * 0.25);
      }
    }

    let tvaCollecteeAnnuel = 0;
    let tvaDeductibleTotalAnnuel = 0;
    let tvaNetCashFlowAnnuel = 0;
    let creditTVAAnnuel = 0;

    if (loyerSoumisTVA && annee >= 1) {
      tvaCollecteeAnnuel = Math.round(loyerBrutAnnuel * (tauxTVA / 100));
      
      // Correction: déduire la TVA contenue dans les honoraires TTC
      const fraisAcquisitionTTC = (annee === 1) ? totalFraisKlocka : 0;
      const fraisAcquisitionHT = fraisAcquisitionTTC / (1 + tauxTVA / 100);
      const tvaFraisAcquisition = fraisAcquisitionTTC - fraisAcquisitionHT;
      
      const honorairesTTC = (annee === 1) ? honorairesChargeAcquereur : 0;
      const honorairesHT = honorairesTTC / (1 + tauxTVA / 100);
      const tvaHonorairesAcquereur = honorairesTTC - honorairesHT;
      
      const chargesExploitationHT = Math.abs(
        gestionLocativeCost + comptabiliteCost + chargesDiversesCost + travauxBailleurCost
      );
      const tvaChargesExploitation = chargesExploitationHT * (tauxTVA / 100);
      tvaDeductibleTotalAnnuel = Math.round(tvaFraisAcquisition + tvaChargesExploitation + tvaHonorairesAcquereur);
      creditTVAAnnuel = Math.max(0, tvaDeductibleTotalAnnuel - tvaCollecteeAnnuel);
      const creditTVAPrecedent = annee > 1 ? (tableauAnnuel[annee - 1]?.creditTVA || 0) : 0;

      if (tvaCollecteeAnnuel > tvaDeductibleTotalAnnuel) {
        tvaNetCashFlowAnnuel = tvaDeductibleTotalAnnuel + creditTVAPrecedent;
      } else {
        tvaNetCashFlowAnnuel = tvaCollecteeAnnuel + creditTVAPrecedent;
      }
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

  const textClass = 'text-white';
  const mutedClass = 'text-gray-400';

  return (
    <div className="min-h-screen bg-[#0a0f0e] p-2 md:p-6">
      <div className="w-full">
        <Card className="shadow-lg rounded-md bg-gradient-to-br from-gray-900/95 via-[#33d6c0]/5 to-gray-900/95 border-gray-700">
          <CardHeader>
            <CardTitle className={`${textClass} flex items-center gap-2 font-medium`}>
              <TrendingUp className="w-5 h-5 text-[#33d6c0]" />
              Tableau annuel détaillé
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[85vh]">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b-2 border-[#33d6c0] bg-gray-800 shadow-sm">
                    <th className={`sticky left-0 z-30 bg-gray-800 px-3 py-2 text-left font-semibold border-r border-[#33d6c0] text-white min-w-[200px]`}></th>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <th key={row.annee} className={`px-2 py-2 text-center ${textClass} min-w-[80px] bg-gray-800 ${row.annee > anneeRevente ? 'bg-gray-700/50' : ''}`}>
                        {row.annee > anneeRevente ? <span className="text-gray-500">An {row.annee}</span> : `Année ${row.annee}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700 bg-gray-800">
                  {/* LOYER BRUT */}
                  <tr className="bg-blue-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('loyers')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-blue-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.loyers ? '▼' : '▶'} LOYER BRUT</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-blue-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  {!expandedSections.loyers && (
                    <tr className="font-medium">
                      <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Total</td>
                      {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                        <td key={row.annee} className={`px-2 py-1.5 text-center ${textClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                          {formatCurrency(row.loyersNets)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {expandedSections.loyers && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Loyers annuels bruts HT HC</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${textClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(row.loyerBrutAnnuel)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Vacance locative (mois)</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.nbMoisVacance > 0 ? 'text-orange-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.nbMoisVacance > 0 ? row.nbMoisVacance : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Coût de la vacance locative</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.coutVacance < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(Math.abs(row.coutVacance))}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Charges de copropriété</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.chargesCopro < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(Math.abs(row.chargesCopro))}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Taxe Foncière</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.taxeFonciere < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(Math.abs(row.taxeFonciere))}
                          </td>
                        ))}
                      </tr>
                      <tr className="font-medium bg-gray-900">
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-900 border-r border-[#33d6c0] min-w-[200px]`}>Loyers annuels nets</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-[#33d6c0] ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(row.loyersNets)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Rendement Locatif net</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{row.rendementLocatifNet}%</td>
                        ))}
                      </tr>
                    </>
                  )}

                  {/* CRÉDIT BANCAIRE */}
                  <tr className="bg-purple-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('credit')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-purple-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.credit ? '▼' : '▶'} CRÉDIT BANCAIRE</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-purple-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  {!expandedSections.credit && (
                    <tr className="font-medium">
                      <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Total</td>
                      {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                        <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                          {formatCurrency(row.creditBancaireCashFlow)}
                        </td>
                      ))}
                    </tr>
                  )}
                  {expandedSections.credit && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Intérêts</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.interetsAnnuels))}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Capital remboursé</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.capitalRembourse))}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Échéance annuelle crédit</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(row.echeanceAnnuelle)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Capital restant dû</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(row.capitalRestantDu)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>IRA (Indemnité remb. anticipé)</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.ira < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.ira < 0 ? formatCurrency(Math.abs(row.ira)) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Assurance crédit</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.assuranceCredit))}</td>
                        ))}
                      </tr>
                    </>
                  )}

                  {/* CHARGES D'EXPLOITATION */}
                  <tr className="bg-yellow-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('charges_exploitation')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-yellow-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.charges_exploitation ? '▼' : '▶'} CHARGES D'EXPLOITATION</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-yellow-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  {!expandedSections.charges_exploitation && (
                    <tr className="font-medium">
                      <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Total</td>
                      {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                        <td key={row.annee} className={`px-2 py-1.5 text-center text-orange-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                          {formatCurrency(Math.abs(row.totalCharges))}
                        </td>
                      ))}
                    </tr>
                  )}
                  {expandedSections.charges_exploitation && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Gestion locative</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.gestionLocativeCost < 0 ? 'text-orange-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(Math.abs(row.gestionLocativeCost))}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Charges liées à l'acquisition</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.chargesAcquisitionCashFlow < 0 ? 'text-orange-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.chargesAcquisitionCashFlow < 0 ? formatCurrency(Math.abs(row.chargesAcquisitionCashFlow)) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Travaux bailleur</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.travauxBailleurCost < 0 ? 'text-orange-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.travauxBailleurCost < 0 ? formatCurrency(Math.abs(row.travauxBailleurCost)) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Comptabilité</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-orange-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.comptabiliteCost))}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Assurance PNE</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-orange-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.assurancePNECost))}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Charges diverses</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.chargesDiversesCost < 0 ? 'text-orange-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.chargesDiversesCost < 0 ? formatCurrency(Math.abs(row.chargesDiversesCost)) : '-'}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}

                  {/* FISCALITÉ */}
                  <tr className="bg-red-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('fiscalite')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-red-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.fiscalite ? '▼' : '▶'} FISCALITÉ</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-red-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  {!expandedSections.fiscalite && (
                    <tr className="font-medium">
                      <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Total</td>
                      {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                        <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                          {formatCurrency(Math.abs(row.impot))}
                        </td>
                      ))}
                    </tr>
                  )}
                  {expandedSections.fiscalite && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Amortissement</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.amortissement))}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Bénéfice imposable</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.beneficeImposable > 0 ? 'text-[#2bb8a5]' : 'text-red-600'} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(row.beneficeImposable)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Impôt 15% du bénéfice</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center text-red-600 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(Math.abs(row.impot))}</td>
                        ))}
                      </tr>
                    </>
                  )}

                  {/* TVA */}
                  <tr className="bg-indigo-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('tva')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-indigo-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.tva ? '▼' : '▶'} TVA</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-indigo-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  {!expandedSections.tva && (
                    <tr className="font-medium">
                      <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Total</td>
                      {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => {
                        const tresorerieTVAValue = row.tresorerieTVACashFlow;
                        return (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${tresorerieTVAValue > 0 ? 'text-[#2bb8a5]' : tresorerieTVAValue < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {tresorerieTVAValue !== 0 ? formatCurrency(tresorerieTVAValue) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  {expandedSections.tva && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>TVA collectée</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.tvaCollectee > 0 ? 'text-[#2bb8a5]' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.tvaCollectee > 0 ? formatCurrency(row.tvaCollectee) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>TVA déductible</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.tvaDeductible > 0 ? 'text-[#2bb8a5]' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.tvaDeductible > 0 ? formatCurrency(row.tvaDeductible) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Crédit de TVA</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.creditTVA > 0 ? 'text-[#2bb8a5]' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {row.creditTVA !== 0 ? formatCurrency(row.creditTVA) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Trésorerie de TVA</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => {
                          const tresorerieTVAValue = row.tresorerieTVACashFlow;
                          return (
                            <td key={row.annee} className={`px-2 py-1.5 text-center ${tresorerieTVAValue > 0 ? 'text-[#2bb8a5]' : tresorerieTVAValue < 0 ? 'text-red-600' : mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                              {tresorerieTVAValue !== 0 ? formatCurrency(tresorerieTVAValue) : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  )}

                  {/* CASH-FLOW & PATRIMOINE */}
                  <tr className="bg-teal-900/10 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => toggleSection('cashflow')}>
                    <td className={`px-3 py-1.5 font-medium ${textClass} text-xs sticky left-0 z-10 bg-teal-900/30 border-r border-[#33d6c0] min-w-[200px]`}>
                      <div className="flex items-center gap-2">{expandedSections.cashflow ? '▼' : '▶'} CASH-FLOW & PATRIMOINE</div>
                    </td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 bg-teal-900/10 ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}></td>
                    ))}
                  </tr>
                  <tr className="font-medium bg-gray-900">
                    <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-900 border-r border-[#33d6c0] min-w-[200px]`}>Cash flow / an</td>
                    {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                      <td key={row.annee} className={`px-2 py-1.5 text-center ${row.cashFlowAnnuel >= 0 ? 'text-[#2bb8a5]' : 'text-red-600'} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                        {formatCurrency(row.cashFlowAnnuel)}
                      </td>
                    ))}
                  </tr>
                  {expandedSections.cashflow && (
                    <>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Cash flow / mois</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${row.cashFlowMensuel >= 0 ? 'text-[#2bb8a5]' : 'text-red-600'} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>
                            {formatCurrency(row.cashFlowMensuel)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className={`px-3 py-1.5 ${textClass} sticky left-0 z-10 bg-gray-800 border-r border-[#33d6c0] min-w-[200px]`}>Capital remboursé cumulé</td>
                        {tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26)).map((row) => (
                          <td key={row.annee} className={`px-2 py-1.5 text-center ${mutedClass} ${row.annee > anneeRevente ? 'bg-gray-700/30' : ''}`}>{formatCurrency(row.capitalRembourseCumule)}</td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-6 p-4 rounded-lg bg-gray-800 border border-gray-700">
              <p className={`text-xs ${mutedClass} text-center italic`}>
                Cet outil est utilisé dans une démarche de projection financière, il ne pourra être reproché à Klocka du non respect de ces projections en cas d'acquisition et d'exploitation.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}