import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Link2, RefreshCw } from "lucide-react";
import ExportExcelFullButton from "../components/simulator/ExportExcelFullButton";
import { calculerTVADeductible } from "../components/simulator";

import SimControlRail from "../components/simulator/layout/SimControlRail";
import SimKpiRow from "../components/simulator/layout/SimKpiRow";
import SimBudgetDonut from "../components/simulator/layout/SimBudgetDonut";
import SimChartCarousel from "../components/simulator/layout/SimChartCarousel";
import SimReventeSynthese from "../components/simulator/layout/SimReventeSynthese";
import SimDataTable from "../components/simulator/layout/SimDataTable";
import SimScenarios from "../components/simulator/layout/SimScenarios";
import SimParametresAvances from "../components/simulator/layout/SimParametresAvances";

function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

export default function SimulateurPublic() {
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("graphiques");
  const [scenarioNegoPct, setScenarioNegoPct] = useState(0);

  const [surface, setSurface] = useState(34);
  const [loyerInitialHTHC, setLoyerInitialHTHC] = useState(27840);
  const [loyerSoumisTVA, setLoyerSoumisTVA] = useState(false);
  const [tauxTVA, setTauxTVA] = useState(20);
  const [chargesCoproRefacturables, setChargesCoproRefacturables] = useState(true);
  const [chargesCopropriete, setChargesCopropriete] = useState(0);
  const [taxeFonciereRefacturable, setTaxeFonciereRefacturable] = useState(true);
  const [taxeFonciere, setTaxeFonciere] = useState(0);
  const [loyerRevalorise, setLoyerRevalorise] = useState(0);
  const [anneeRevalorisation, setAnneeRevalorisation] = useState(null);
  const [revalorisationActive, setRevalorisationActive] = useState(false);
  const [gestionLocative, setGestionLocative] = useState(0);
  const [comptabilite, setComptabilite] = useState(600);
  const [chargesDiverses, setChargesDiverses] = useState(0);
  const [assurancePNE, setAssurancePNE] = useState(400);
  const [fraisDossierBancaire, setFraisDossierBancaire] = useState(1000);
  const [fraisCourtage, setFraisCourtage] = useState(0);
  const [coutCreationSociete, setCoutCreationSociete] = useState(1000);
  const [vacancesLocatives, setVacancesLocatives] = useState(Array(25).fill(0));
  const [travauxBailleur, setTravauxBailleur] = useState(Array(25).fill(0));
  const [prixBienFAI, setPrixBienFAI] = useState(327000);
  const [prixBienNegocie, setPrixBienNegocie] = useState(327000);
  const [tauxCommissionAgent, setTauxCommissionAgent] = useState(5);
  const [commissionAgentType, setCommissionAgentType] = useState("pourcentage");
  const [commissionAgentInclusFAI, setCommissionAgentInclusFAI] = useState(true);
  const [tauxDroitsEnregistrement, setTauxDroitsEnregistrement] = useState(8);
  const [tauxFeesKlocka, setTauxFeesKlocka] = useState(8);
  const [feesKlockaType, setFeesKlockaType] = useState("pourcentage");
  const [tauxIncentiveKlocka, setTauxIncentiveKlocka] = useState(20);
  const [apport, setApport] = useState(70000);
  const [dureeCredit, setDureeCredit] = useState(20);
  const [tauxInteret, setTauxInteret] = useState(3.9);
  const [tauxAssuranceCredit, setTauxAssuranceCredit] = useState(0.25);
  const [pretInFine, setPretInFine] = useState(false);
  const [renegociationActive, setRenegociationActive] = useState(false);
  const [anneeRenegociation, setAnneeRenegociation] = useState(10);
  const [nouveauTauxRenegociation, setNouveauTauxRenegociation] = useState(2.5);
  const [iraRenegociation, setIraRenegociation] = useState(0);
  const [indexation, setIndexation] = useState(2);
  const [anneeRevente, setAnneeRevente] = useState(20);
  const [tauxCommissionAgentRevente, setTauxCommissionAgentRevente] = useState(5);
  const [rendementBrutAcheteur, setRendementBrutAcheteur] = useState(6.5);
  const [commissionAgentActive, setCommissionAgentActive] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load params from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dataParam = urlParams.get("data");
    if (dataParam) {
      try {
        const p = JSON.parse(decodeURIComponent(dataParam));
        if (p.surface !== undefined) setSurface(p.surface);
        if (p.loyerInitialHTHC !== undefined) setLoyerInitialHTHC(p.loyerInitialHTHC);
        if (p.loyerSoumisTVA !== undefined) setLoyerSoumisTVA(p.loyerSoumisTVA);
        if (p.tauxTVA !== undefined) setTauxTVA(p.tauxTVA);
        if (p.chargesCoproRefacturables !== undefined) setChargesCoproRefacturables(p.chargesCoproRefacturables);
        if (p.chargesCopropriete !== undefined) setChargesCopropriete(p.chargesCopropriete);
        if (p.taxeFonciereRefacturable !== undefined) setTaxeFonciereRefacturable(p.taxeFonciereRefacturable);
        if (p.taxeFonciere !== undefined) setTaxeFonciere(p.taxeFonciere);
        if (p.loyerRevalorise !== undefined) setLoyerRevalorise(p.loyerRevalorise);
        if (p.anneeRevalorisation !== undefined) setAnneeRevalorisation(p.anneeRevalorisation);
        if (p.revalorisationActive !== undefined) setRevalorisationActive(p.revalorisationActive);
        if (p.gestionLocative !== undefined) setGestionLocative(p.gestionLocative);
        if (p.comptabilite !== undefined) setComptabilite(p.comptabilite);
        if (p.chargesDiverses !== undefined) setChargesDiverses(p.chargesDiverses);
        if (p.assurancePNE !== undefined) setAssurancePNE(p.assurancePNE);
        if (p.fraisDossierBancaire !== undefined) setFraisDossierBancaire(p.fraisDossierBancaire);
        if (p.fraisCourtage !== undefined) setFraisCourtage(p.fraisCourtage);
        if (p.coutCreationSociete !== undefined) setCoutCreationSociete(p.coutCreationSociete);
        if (p.vacancesLocatives) setVacancesLocatives(p.vacancesLocatives);
        if (p.travauxBailleur) setTravauxBailleur(p.travauxBailleur);
        if (p.prixBienFAI !== undefined) setPrixBienFAI(p.prixBienFAI);
        if (p.prixBienNegocie !== undefined) setPrixBienNegocie(p.prixBienNegocie);
        if (p.tauxCommissionAgent !== undefined) setTauxCommissionAgent(p.tauxCommissionAgent);
        if (p.commissionAgentType !== undefined) setCommissionAgentType(p.commissionAgentType);
        if (p.commissionAgentInclusFAI !== undefined) setCommissionAgentInclusFAI(p.commissionAgentInclusFAI);
        if (p.tauxDroitsEnregistrement !== undefined) setTauxDroitsEnregistrement(p.tauxDroitsEnregistrement);
        if (p.tauxFeesKlocka !== undefined) setTauxFeesKlocka(p.tauxFeesKlocka);
        if (p.feesKlockaType !== undefined) setFeesKlockaType(p.feesKlockaType);
        if (p.tauxIncentiveKlocka !== undefined) setTauxIncentiveKlocka(p.tauxIncentiveKlocka);
        if (p.apport !== undefined) setApport(p.apport);
        if (p.dureeCredit !== undefined) setDureeCredit(p.dureeCredit);
        if (p.tauxInteret !== undefined) setTauxInteret(p.tauxInteret);
        if (p.tauxAssuranceCredit !== undefined) setTauxAssuranceCredit(p.tauxAssuranceCredit);
        if (p.pretInFine !== undefined) setPretInFine(p.pretInFine);
        if (p.renegociationActive !== undefined) setRenegociationActive(p.renegociationActive);
        if (p.anneeRenegociation !== undefined) setAnneeRenegociation(p.anneeRenegociation);
        if (p.nouveauTauxRenegociation !== undefined) setNouveauTauxRenegociation(p.nouveauTauxRenegociation);
        if (p.iraRenegociation !== undefined) setIraRenegociation(p.iraRenegociation);
        if (p.indexation !== undefined) setIndexation(p.indexation);
        if (p.anneeRevente !== undefined) setAnneeRevente(p.anneeRevente);
        if (p.tauxCommissionAgentRevente !== undefined) setTauxCommissionAgentRevente(p.tauxCommissionAgentRevente);
        if (p.rendementBrutAcheteur !== undefined) setRendementBrutAcheteur(p.rendementBrutAcheteur);
        if (p.commissionAgentActive !== undefined) setCommissionAgentActive(p.commissionAgentActive);
        setLoaded(true);
      } catch (e) { console.error("Invalid simulator data in URL"); setLoaded(true); }
    } else {
      setLoaded(true);
    }
  }, []);

  const negoActive = activeTab === "scenarios" && scenarioNegoPct > 0;
  const prixBienNegocieEffectif = negoActive ? Math.round(prixBienNegocie * (1 - scenarioNegoPct / 100)) : prixBienNegocie;

  const calculs = useMemo(() => {
    const prixBienNegocie = prixBienNegocieEffectif;
    const loyerParM2 = surface > 0 ? Math.round(loyerInitialHTHC / surface) : 0;
    const loyerRevaloriseParM2 = loyerRevalorise > 0 && surface > 0 ? Math.round(loyerRevalorise / surface) : 0;
    const honorairesCA = commissionAgentActive ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100)) : 0;
    const prixHorsDroits = commissionAgentInclusFAI ? (prixBienNegocie - honorairesCA) : prixBienNegocie;
    const droitsEnregistrement = prixHorsDroits * (tauxDroitsEnregistrement / 100);
    const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
    const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
    const totalFraisKlocka = feesKlocka + incentiveKlocka;
    const fraisDivers = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
    const travauxAnnee0 = travauxBailleur[0] || 0;
    const prixRevient = prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + travauxAnnee0 + (commissionAgentInclusFAI ? 0 : honorairesCA);
    const montantEmprunt = prixRevient - apport;
    const pourcentageEmprunt = prixRevient > 0 ? Math.round(montantEmprunt / prixRevient * 100) : 0;
    const pourcentageApport = prixRevient > 0 ? Math.round(apport / prixRevient * 100) : 0;
    const totalFinancement = apport + montantEmprunt;
    const amortissementAnnuel = prixHorsDroits * 0.8 / 25;

    const tableauAnnuel = [];
    let currentCapitalRestantDu = montantEmprunt;
    let currentTauxInteret = tauxInteret;
    let currentDureeCreditRestanteMois = dureeCredit * 12;
    const echeanceMensuelleInFine = montantEmprunt > 0 ? montantEmprunt * (tauxInteret / 100 / 12) : 0;
    let currentEcheanceMensuelle = pretInFine ? echeanceMensuelleInFine : (montantEmprunt > 0 ? Math.abs(PMT(tauxInteret / 100 / 12, dureeCredit * 12, montantEmprunt)) : 0);
    let capitalRembourseCumule = 0;
    let loyerAnnuelBrutHTPrevious = loyerInitialHTHC;

    for (let annee = 0; annee <= 25; annee++) {
      let loyerBrutAnnuel = 0;
      if (annee === 0) loyerBrutAnnuel = 0;
      else if (annee === 1) loyerBrutAnnuel = loyerInitialHTHC;
      else loyerBrutAnnuel = loyerAnnuelBrutHTPrevious * (1 + indexation / 100);
      if (revalorisationActive && anneeRevalorisation !== null && annee === anneeRevalorisation && loyerRevalorise > 0) loyerBrutAnnuel = loyerRevalorise;
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
          const tauxMensuel = currentTauxInteret / 100 / 12;
          const moisACalculer = Math.min(12, currentDureeCreditRestanteMois);
          for (let mois = 0; mois < moisACalculer; mois++) { interetsAnnuels += currentCapitalRestantDu * tauxMensuel; currentDureeCreditRestanteMois--; }
          if (annee === dureeCredit) { capitalRembourseAnnuel = montantEmprunt; currentCapitalRestantDu = 0; }
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
          if (currentDureeCreditRestanteMois > 0 && currentCapitalRestantDu > 0) currentEcheanceMensuelle = Math.abs(PMT(newTauxMensuel, currentDureeCreditRestanteMois, currentCapitalRestantDu));
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
        creditBancaireCashFlow, totalCreditBancaire: echeanceAnnuelleTotal + Math.abs(assuranceCreditAnnuel) + iraAnnuel, iraAnnuel
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
        const honCA = (commissionAgentActive && honorairesCA > 0) ? honorairesCA : 0;
        tvaDeductibleTotalAnnuel = calculerTVADeductible({ annee, totalFraisKlocka, tauxTVA, gestionLocativeCost, comptabiliteCost, assurancePNECost, chargesDiversesCost, travauxBailleurCost, honorairesChargeAcquereur: honCA });
        creditTVAAnnuel = Math.max(0, tvaDeductibleTotalAnnuel - tvaCollecteeAnnuel);
        const creditTVAPrecedent = annee > 1 ? tableauAnnuel[annee - 1]?.creditTVA || 0 : 0;
        tvaNetCashFlowAnnuel = tvaCollecteeAnnuel > tvaDeductibleTotalAnnuel ? tvaDeductibleTotalAnnuel + creditTVAPrecedent : tvaCollecteeAnnuel + creditTVAPrecedent;
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
    const rendementLocatifGlobalNet = filteredRendements.length > 0 ? filteredRendements.reduce((sum, row) => sum + parseFloat(row.rendementLocatifNet), 0) / filteredRendements.length : 0;
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
    let anneeRecuperationApport = null, cumulRecuperationApport = 0, anneeDoubleApport = null;
    for (let i = 1; i <= tableauAnnuel.length - 1; i++) {
      const r = tableauAnnuel[i];
      cumulRecuperationApport += Math.abs(r.capitalRembourse) + r.cashFlowAnnuel;
      if (anneeRecuperationApport === null && apport > 0 && cumulRecuperationApport >= apport) anneeRecuperationApport = i;
      if (anneeDoubleApport === null && apport > 0 && cumulRecuperationApport >= apport * 2) anneeDoubleApport = i;
    }

    return {
      loyerParM2, loyerRevaloriseParM2,
      honorairesChargeAcquereur: Math.round(honorairesCA), prixHorsDroits: Math.round(prixHorsDroits),
      droitsEnregistrement: Math.round(droitsEnregistrement), feesKlocka: Math.round(feesKlocka),
      incentiveKlocka: Math.round(incentiveKlocka), totalFraisKlocka: Math.round(totalFraisKlocka),
      fraisDivers: Math.round(fraisDivers), prixRevient: Math.round(prixRevient), montantEmprunt: Math.round(montantEmprunt),
      pourcentageEmprunt, pourcentageApport, totalFinancement: Math.round(totalFinancement),
      echeanceMensuelle: Math.round(currentEcheanceMensuelle), tableauAnnuel,
      revente: { loyerHTRevente: Math.round(loyerHTRevente), loyerHTParM2Revente, valeurNetComptable: Math.round(valeurNetComptable), vncParM2, prixVenteFAI: Math.round(prixVenteFAI), commissionAgentRevente: Math.round(commissionAgentRevente), prixVenteNet: Math.round(prixVenteNet), prixNetParM2, rendementNetAcheteur: rendementNetAcheteur.toFixed(1) },
      indicateurs: { nbAnnees: anneeRevente, rendementLocatifGlobalNet: rendementLocatifGlobalNet.toFixed(1), rendementEnCapital: rendementEnCapital.toFixed(1), triBrut: triBrut.toFixed(2), loyerAnnuelMoyen: Math.round(loyerAnnuelMoyen), capitalRembourseAnnuelMoyen: Math.round(capitalRembourseAnnuelMoyen), cashFlowCumule: Math.round(cashFlowCumule), cashFlowMoyenAn: Math.round(cashFlowMoyenAn), cashFlowMoyenMois: Math.round(cashFlowMoyenMois), margeBruteRevente: Math.round(margeBruteRevente), pourcentageMargeBrute: pourcentageMargeBrute.toFixed(2), capitalARemboursserRevente: Math.round(capitalARemboursserRevente), creationRichesseBrute: Math.round(creationRichesseBrute), impotPlusValue: Math.round(impotPlusValue), multipleNetFondsPropres: multipleNetFondsPropres.toFixed(2), apportInitial: apport, plusValue: Math.round(plusValue), anneeRecuperationApport, anneeDoubleApport, loyerNetMoyen: Math.round(loyerNetMoyen) }
    };
  }, [surface, loyerInitialHTHC, loyerRevalorise, anneeRevalorisation, prixBienFAI, prixBienNegocieEffectif, tauxCommissionAgent, commissionAgentType, commissionAgentInclusFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, fraisDossierBancaire, coutCreationSociete, fraisCourtage, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive, anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, vacancesLocatives, travauxBailleur, gestionLocative, comptabilite, assurancePNE, chargesDiverses, chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere, loyerSoumisTVA, tauxTVA, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, revalorisationActive, pretInFine, commissionAgentActive]);

  const formatCurrency = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value)).replace(/\u00A0/g, ' ');

  const setters = { prixBienFAI: setPrixBienFAI, surface: setSurface, prixBienNegocie: setPrixBienNegocie, loyerInitialHTHC: setLoyerInitialHTHC, indexation: setIndexation, chargesCopropriete: setChargesCopropriete, taxeFonciere: setTaxeFonciere, apport: setApport, dureeCredit: setDureeCredit, tauxInteret: setTauxInteret, tauxAssuranceCredit: setTauxAssuranceCredit, anneeRevente: setAnneeRevente, tauxCommissionAgentRevente: setTauxCommissionAgentRevente, rendementBrutAcheteur: setRendementBrutAcheteur, coutCreationSociete: setCoutCreationSociete, fraisDossierBancaire: setFraisDossierBancaire, fraisCourtage: setFraisCourtage, comptabilite: setComptabilite, assurancePNE: setAssurancePNE, gestionLocative: setGestionLocative, chargesDiverses: setChargesDiverses };
  const values = { prixBienFAI, surface, prixBienNegocie, loyerInitialHTHC, indexation, chargesCopropriete, taxeFonciere, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, coutCreationSociete, fraisDossierBancaire, fraisCourtage, comptabilite, assurancePNE, gestionLocative, chargesDiverses };
  const onChange = (key, val) => setters[key]?.(val);
  const advanced = { loyerSoumisTVA, setLoyerSoumisTVA, chargesCoproRefacturables, setChargesCoproRefacturables, taxeFonciereRefacturable, setTaxeFonciereRefacturable, pretInFine, setPretInFine, revalorisationActive, setRevalorisationActive, anneeRevalorisation, setAnneeRevalorisation, loyerRevalorise, setLoyerRevalorise, renegociationActive, setRenegociationActive, anneeRenegociation, setAnneeRenegociation, nouveauTauxRenegociation, setNouveauTauxRenegociation, iraRenegociation, setIraRenegociation, vacancesLocatives, setVacancesLocatives, travauxBailleur, setTravauxBailleur };

  const exportParams = { surface, loyerInitialHTHC, loyerSoumisTVA, tauxTVA, chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere, loyerRevalorise, anneeRevalorisation, revalorisationActive, gestionLocative, comptabilite, chargesDiverses, assurancePNE, fraisDossierBancaire, fraisCourtage, coutCreationSociete, vacancesLocatives, travauxBailleur, prixBienFAI, prixBienNegocie, tauxCommissionAgent, commissionAgentType, commissionAgentInclusFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive, anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, commissionAgentActive };

  const handleCopyShareLink = () => {
    const url = window.location.origin + '/SimulateurPublic?data=' + encodeURIComponent(JSON.stringify(exportParams));
    try { navigator.clipboard?.writeText(url).catch(() => {}); } catch (e) {}
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const tabs = [
    { id: "graphiques", label: "Graphiques" },
    { id: "revente", label: "Revente" },
    { id: "scenarios", label: "Négociation" },
    { id: "avance", label: "Paramètres avancés" },
  ];

  if (!loaded) return <div className="min-h-screen bg-[#000000] flex items-center justify-center"><div className="w-8 h-8 border-4 border-[#96c0b8]/30 border-t-[#96c0b8] rounded-full animate-spin" /></div>;

  return (
    <div className="bg-[#000000] min-h-screen relative w-full max-w-full overflow-x-hidden">
      <div className="flex flex-col min-h-screen">
        <div className="flex flex-1 min-h-0">
          {/* Left control rail */}
          <aside className="hidden md:block w-[260px] flex-shrink-0">
            <SimControlRail
              projects={[]}
              selectedProjectId={null}
              onSelectProject={() => {}}
              values={values}
              onChange={onChange}
              calculs={calculs}
              formatCurrency={formatCurrency}
              advanced={advanced}
              activeTab={activeTab}
            />
          </aside>

          {/* Main area */}
          <main className="flex-1 w-0 min-w-0 overflow-hidden">
            {/* Tab bar + actions */}
            <div className="flex items-center justify-between border-b border-[#1f2228] px-4 h-11 sticky top-0 bg-[#000000] z-10">
              <div className="flex items-center gap-0.5 p-0.5 rounded-full bg-[#0f1114] border border-[#1f2228] min-w-0 overflow-x-auto">
                {tabs.map((t) => {
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setActiveTab(t.id); if (t.id !== "scenarios") setScenarioNegoPct(0); }}
                      className={`relative px-3 h-7 rounded-full text-xs whitespace-nowrap transition-colors duration-200 ${active ? "text-[#f2f3f5]" : "text-[#9298a6] hover:text-[#c9cdd6]"}`}
                    >
                      {active && (
                        <motion.span
                          layoutId="sim-tab-pill"
                          className="absolute inset-0 rounded-full bg-[#96c0b8]/15 border border-[#96c0b8]/40"
                          transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        />
                      )}
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <ExportExcelFullButton params={exportParams} calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} />
                <button onClick={handleCopyShareLink} className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-[#22262d] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#f2f3f5]/[0.25] text-xs transition-colors">
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-[#c3ddd6]" /> : <Link2 className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copié' : 'Partager'}
                </button>
              </div>
            </div>

            <div key={activeTab} className="p-4 space-y-4 max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out">
              {negoActive && (
                <div className="flex items-center gap-2 text-xs text-[#96c0b8] bg-[#96c0b8]/10 border border-[#96c0b8]/25 rounded-lg px-3 py-2 animate-in fade-in slide-in-from-top-2 duration-500 ease-out">
                  Négociation -{scenarioNegoPct}% appliquée : le tableau détaillé ci-dessous reflète ce scénario.
                </div>
              )}
              {activeTab === "scenarios" ? (
                <SimScenarios
                  params={{ prixBienFAI, prixBienNegocieRef: prixBienNegocie, apport, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, fraisDossierBancaire, coutCreationSociete, fraisCourtage, dureeCredit, tauxInteret, loyerInitialHTHC, indexation, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur }}
                  formatCurrency={formatCurrency}
                  selectedNiveau={scenarioNegoPct}
                  onSelectNiveau={setScenarioNegoPct}
                />
              ) : activeTab === "avance" ? (
                <SimParametresAvances
                  values={values}
                  advanced={advanced}
                  calculs={calculs}
                  formatCurrency={formatCurrency}
                />
              ) : (
                <>
                  {activeTab !== "revente" && (
                    <SimBudgetDonut calculs={calculs} prixBienNegocie={prixBienNegocie} formatCurrency={formatCurrency} />
                  )}
                  <SimKpiRow calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} />
                  {activeTab === "revente" ? (
                    <SimReventeSynthese calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} />
                  ) : (
                    <SimChartCarousel calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} />
                  )}
                </>
              )}
              {activeTab !== "avance" && (
                <SimDataTable calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} dureeCredit={values.dureeCredit} />
              )}
              <p className="text-[10px] text-[#6a7180] italic px-1">Cet outil est utilisé dans une démarche de projection financière, il ne pourra être reproché à Klocka du non respect de ces projections en cas d'acquisition et d'exploitation.</p>
              <p className="text-center text-[#f2f3f5]/20 text-xs pt-4">Simulation générée par Klocka</p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}