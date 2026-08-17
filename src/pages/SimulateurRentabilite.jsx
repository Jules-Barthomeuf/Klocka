import React, { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Link2, Download, RefreshCw, ArrowRight } from "lucide-react";
import ExportExcelFullButton from "../components/simulator/ExportExcelFullButton";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import FeedbackWidget from "../components/FeedbackWidget";
import { NeonButton } from "@/components/ui/neon-button";
import { useNavigate } from "react-router-dom";

import SimControlRail from "../components/simulator/layout/SimControlRail";
import SimKpiRow from "../components/simulator/layout/SimKpiRow";
import SimBudgetDonut from "../components/simulator/layout/SimBudgetDonut";
import SimChartCarousel from "../components/simulator/layout/SimChartCarousel";
import SimReventeSynthese from "../components/simulator/layout/SimReventeSynthese";
import SimDataTable from "../components/simulator/layout/SimDataTable";
import SimScenarios from "../components/simulator/layout/SimScenarios";
import SimParametresAvances from "../components/simulator/layout/SimParametresAvances";
import SimWhatsNewDialog from "../components/simulator/SimWhatsNewDialog";
import { AnimatePresence } from "framer-motion";
import { calculerTVADeductible } from "../components/simulator";

function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

export default function SimulateurRentabilite() {
  const navigate = useNavigate();
  const user = useUser();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState("graphiques");
  const [linkCopied, setLinkCopied] = useState(false);
  const [scenarioNegoPct, setScenarioNegoPct] = useState(0);
  const [showWhatsNew, setShowWhatsNew] = useState(() => localStorage.getItem('simWhatsNewSeenV1') !== 'true');
  const [animKey, setAnimKey] = useState(0);
  const closeWhatsNew = () => { localStorage.setItem('simWhatsNewSeenV1', 'true'); setShowWhatsNew(false); setAnimKey((k) => k + 1); };

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', user?.email, user?.compte_maitre_email],
    queryFn: async () => {
      if (!user) return [];
      const emailToCheck = user.est_compte_shadow && user.compte_maitre_email ? user.compte_maitre_email : user.email;
      const allProjects = await base44.entities.Project.list();
      return allProjects.filter((p) =>
        p.client_email === emailToCheck ||
        (p.client_emails && p.client_emails.includes(emailToCheck)) ||
        p.client_email === user.email ||
        (p.client_emails && p.client_emails.includes(user.email))
      );
    },
    enabled: !!user && user.role !== "admin",
    initialData: []
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => base44.entities.Project.list(),
    enabled: !!user && user.role === "admin",
    initialData: []
  });

  const availableProjects = user?.role === "admin" ? allProjects : projects;
  const selectedProject = availableProjects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectIdFromUrl = urlParams.get('projectId');
    if (projectIdFromUrl && availableProjects.length > 0) {
      const projectExists = availableProjects.find((p) => p.id === projectIdFromUrl);
      if (projectExists) { setSelectedProjectId(projectIdFromUrl); return; }
    }
    if (availableProjects.length > 0 && !selectedProjectId && !projectIdFromUrl) {
      setSelectedProjectId(availableProjects[0].id);
    }
  }, [availableProjects, window.location.search]);

  const [surface, setSurface] = useState(34);
  const [loyerInitialHTHC, setLoyerInitialHTHC] = useState(27840);
  const [loyerSoumisTVA, setLoyerSoumisTVA] = useState(false);
  const [tauxTVA, setTauxTVA] = useState(20);
  const [chargesCoproRefacturables, setChargesCoproRefacturables] = useState(true);
  const [chargesCopropriete, setChargesCopropriete] = useState(0);
  const [taxeFonciereRefacturable, setTaxeFonciereRefacturable] = useState(true);
  const [taxeFonciere, setTaxeFonciere] = useState(0);
  const [etage, setEtage] = useState(0);
  const [typeDetention, setTypeDetention] = useState("Copropriété");
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
  const [tauxInteret, setTauxInteret] = useState(3.7);
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

  useEffect(() => {
    if (selectedProject && selectedProject.sim_apport) return;
    const droitsEnreg = prixBienNegocie * (tauxDroitsEnregistrement / 100);
    const feesK = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
    const incentiveK = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
    const totalFeesK = feesK + incentiveK;
    const fraisDiv = fraisDossierBancaire + coutCreationSociete + fraisCourtage;
    const prixRevientAuto = prixBienNegocie + droitsEnreg + totalFeesK + fraisDiv;
    setApport(Math.round(prixRevientAuto * 0.15));
  }, [prixBienNegocie, prixBienFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, fraisDossierBancaire, coutCreationSociete, fraisCourtage, selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      setPrixBienFAI(selectedProject.sim_prix_bien_fai || 327000);
      setSurface(selectedProject.sim_surface || 34);
      setPrixBienNegocie(selectedProject.sim_prix_bien_negocie || 327000);
      setLoyerInitialHTHC(selectedProject.sim_loyer_initial_ht || 27840);
      setIndexation(selectedProject.sim_indexation_loyers || 2);
      setLoyerSoumisTVA(selectedProject.sim_loyer_soumis_tva || false);
      setChargesCopropriete(selectedProject.sim_charges_copropriete || 0);
      setChargesCoproRefacturables(selectedProject.sim_charges_refacturable !== false);
      setTaxeFonciere(selectedProject.sim_taxe_fonciere || 0);
      setTaxeFonciereRefacturable(selectedProject.sim_taxe_refacturable !== false);
      setTauxTVA(selectedProject.sim_taux_tva || 20);
      setEtage(selectedProject.sim_etage || 0);
      setTypeDetention(selectedProject.sim_type_detention || "Copropriété");
      if (selectedProject.sim_annee_revalorisation && selectedProject.sim_annee_revalorisation > 0) {
        setRevalorisationActive(true);
        setAnneeRevalorisation(selectedProject.sim_annee_revalorisation);
        setLoyerRevalorise(selectedProject.sim_loyer_revalorise || 0);
      } else { setRevalorisationActive(false); setAnneeRevalorisation(null); setLoyerRevalorise(0); }
      setApport(selectedProject.sim_apport || 70000);
      setDureeCredit(selectedProject.sim_duree_credit || 20);
      setTauxInteret(selectedProject.sim_taux_interet || 3.7);
      setTauxAssuranceCredit(selectedProject.sim_taux_assurance || 0.25);
      if (selectedProject.sim_annee_renegociation && selectedProject.sim_annee_renegociation > 0) {
        setRenegociationActive(true);
        setAnneeRenegociation(selectedProject.sim_annee_renegociation);
        setNouveauTauxRenegociation(selectedProject.sim_taux_renegocie || 2.5);
        setIraRenegociation(selectedProject.sim_ira_mois || 0);
      } else { setRenegociationActive(false); }
      setPretInFine(selectedProject.sim_pret_in_fine ?? false);
      setCoutCreationSociete(selectedProject.sim_cout_creation_societe || 1000);
      setFraisDossierBancaire(selectedProject.sim_frais_dossier_bancaire || 1000);
      setFraisCourtage(selectedProject.sim_frais_courtage || 0);
      setComptabilite(selectedProject.sim_comptabilite || 600);
      setAssurancePNE(selectedProject.sim_assurance_pne || 400);
      setGestionLocative(selectedProject.sim_gestion_locative || 0);
      setChargesDiverses(selectedProject.sim_charges_diverses || 0);
      const newTravaux = Array(25).fill(0);
      for (let i = 1; i <= 20; i++) {
        const annee = selectedProject[`sim_travaux_annee${i}`];
        const montant = selectedProject[`sim_travaux_montant${i}`];
        if (annee && montant) newTravaux[annee - 1] = montant;
      }
      setTravauxBailleur(newTravaux);
      setAnneeRevente(selectedProject.sim_annee_revente || 20);
      setTauxCommissionAgentRevente(selectedProject.sim_commission_agent_revente || 5);
      setRendementBrutAcheteur(selectedProject.sim_rendement_capital || 6.5);
      setTauxCommissionAgent(selectedProject.sim_commission_agent !== undefined ? selectedProject.sim_commission_agent : 5);
      setCommissionAgentType(selectedProject.sim_commission_agent_type || "pourcentage");
      setCommissionAgentInclusFAI(selectedProject.sim_commission_agent_inclus_fai ?? true);
      setTauxDroitsEnregistrement(selectedProject.sim_droits_enregistrement !== undefined ? selectedProject.sim_droits_enregistrement : 8);
      setTauxFeesKlocka(selectedProject.sim_no_fees_klocka ? 0 : (selectedProject.sim_fees_klocka !== undefined ? selectedProject.sim_fees_klocka : 8));
      setFeesKlockaType(selectedProject.sim_fees_klocka_type || "pourcentage");
      setTauxIncentiveKlocka(selectedProject.sim_no_fees_klocka ? 0 : (selectedProject.sim_incentive_klocka !== undefined ? selectedProject.sim_incentive_klocka : 20));
    }
  }, [selectedProject]);

  const negoActive = activeTab === "scenarios" && scenarioNegoPct > 0;
  const prixBienNegocieEffectif = negoActive ? Math.round(prixBienNegocie * (1 - scenarioNegoPct / 100)) : prixBienNegocie;

  const calculs = useMemo(() => {
    const prixBienNegocie = prixBienNegocieEffectif;
    const loyerParM2 = surface > 0 ? Math.round(loyerInitialHTHC / surface) : 0;
    const loyerRevaloriseParM2 = loyerRevalorise > 0 && surface > 0 ? Math.round(loyerRevalorise / surface) : 0;
    const isCAActive = selectedProject?.sim_commission_agent_active || false;
    const honorairesCA = isCAActive ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100)) : 0;
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
        const honCA = (selectedProject?.sim_commission_agent_active && honorairesCA > 0) ? honorairesCA : 0;
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
    // Récupération de l'apport : cumul annuel de (capital remboursé + cash-flow).
    // On repère l'année où ce cumul dépasse l'apport initial.
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
  }, [surface, loyerInitialHTHC, loyerRevalorise, anneeRevalorisation, prixBienFAI, prixBienNegocieEffectif, tauxCommissionAgent, commissionAgentType, commissionAgentInclusFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, fraisDossierBancaire, coutCreationSociete, fraisCourtage, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive, anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, vacancesLocatives, travauxBailleur, gestionLocative, comptabilite, assurancePNE, chargesDiverses, chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere, loyerSoumisTVA, tauxTVA, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, revalorisationActive, pretInFine]);

  const formatCurrency = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value)).replace(/\u00A0/g, ' ');

  const handleReset = () => {
    setSelectedProjectId(null);
    setSurface(34); setLoyerInitialHTHC(27840); setLoyerSoumisTVA(false); setTauxTVA(20);
    setChargesCoproRefacturables(true); setChargesCopropriete(0); setTaxeFonciereRefacturable(true);
    setTaxeFonciere(0); setPrixBienFAI(327000); setPrixBienNegocie(327000); setApport(70000);
    setDureeCredit(20); setTauxInteret(3.7); setTauxAssuranceCredit(0.25); setIndexation(2);
    setAnneeRevente(20); setRendementBrutAcheteur(6.5); setTauxCommissionAgentRevente(5);
    setRevalorisationActive(false); setRenegociationActive(false); setPretInFine(false);
    setTravauxBailleur(Array(25).fill(0)); setVacancesLocatives(Array(25).fill(0));
  };

  const handleCopyShareLink = () => {
    const paramsToShare = { surface, loyerInitialHTHC, loyerSoumisTVA, tauxTVA, chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere, loyerRevalorise, anneeRevalorisation, revalorisationActive, gestionLocative, comptabilite, chargesDiverses, assurancePNE, fraisDossierBancaire, fraisCourtage, coutCreationSociete, vacancesLocatives, travauxBailleur, prixBienFAI, prixBienNegocie, tauxCommissionAgent, commissionAgentType, commissionAgentInclusFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive, anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, commissionAgentActive: selectedProject?.sim_commission_agent_active || false };
    const url = window.location.origin + '/SimulateurPublic?data=' + encodeURIComponent(JSON.stringify(paramsToShare));
    try { navigator.clipboard?.writeText(url).catch(() => {}); } catch (e) {}
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const userEtape = user?.etape_actuelle || 1;
  const isAdmin = user?.role === "admin";
  const isEtape1 = user && userEtape === 1 && !isAdmin;
  const isEtape2 = user && userEtape === 2 && !isAdmin;

  const setters = { prixBienFAI: setPrixBienFAI, surface: setSurface, prixBienNegocie: setPrixBienNegocie, loyerInitialHTHC: setLoyerInitialHTHC, indexation: setIndexation, chargesCopropriete: setChargesCopropriete, taxeFonciere: setTaxeFonciere, apport: setApport, dureeCredit: setDureeCredit, tauxInteret: setTauxInteret, tauxAssuranceCredit: setTauxAssuranceCredit, anneeRevente: setAnneeRevente, tauxCommissionAgentRevente: setTauxCommissionAgentRevente, rendementBrutAcheteur: setRendementBrutAcheteur, coutCreationSociete: setCoutCreationSociete, fraisDossierBancaire: setFraisDossierBancaire, fraisCourtage: setFraisCourtage, comptabilite: setComptabilite, assurancePNE: setAssurancePNE, gestionLocative: setGestionLocative, chargesDiverses: setChargesDiverses };
  const values = { prixBienFAI, surface, prixBienNegocie, loyerInitialHTHC, indexation, chargesCopropriete, taxeFonciere, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, coutCreationSociete, fraisDossierBancaire, fraisCourtage, comptabilite, assurancePNE, gestionLocative, chargesDiverses };
  const onChange = (key, val) => setters[key]?.(val);
  const advanced = { loyerSoumisTVA, setLoyerSoumisTVA, chargesCoproRefacturables, setChargesCoproRefacturables, taxeFonciereRefacturable, setTaxeFonciereRefacturable, pretInFine, setPretInFine, revalorisationActive, setRevalorisationActive, anneeRevalorisation, setAnneeRevalorisation, loyerRevalorise, setLoyerRevalorise, renegociationActive, setRenegociationActive, anneeRenegociation, setAnneeRenegociation, nouveauTauxRenegociation, setNouveauTauxRenegociation, iraRenegociation, setIraRenegociation, vacancesLocatives, setVacancesLocatives, travauxBailleur, setTravauxBailleur };

  const tabs = [
    { id: "graphiques", label: "Graphiques" },
    { id: "revente", label: "Revente" },
    { id: "scenarios", label: "Négociation" },
    { id: "avance", label: "Paramètres avancés" },
  ];

  return (
    <div className="bg-[#050807] min-h-screen relative w-full max-w-full overflow-x-hidden">
      <FeedbackWidget />

      <AnimatePresence>
        {showWhatsNew && !isEtape1 && !isEtape2 && <SimWhatsNewDialog onClose={closeWhatsNew} />}
      </AnimatePresence>

      {isEtape2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050807]/50 backdrop-blur-sm">
          <div className="max-w-md w-full bg-[#101715] rounded-md border border-white/[0.1] p-8 text-center mx-4">
            <h3 className="text-xl font-light text-white mb-3">Définissez votre stratégie d'investissement</h3>
            <p className="text-white/30 text-sm mb-6">Avant d'accéder au simulateur, prenons rendez-vous pour définir ensemble votre stratégie personnalisée.</p>
            <NeonButton onClick={() => window.open("https://dpe3smipjxh.typeform.com/to/GD7sREFs", "_blank")} variant="default" className="inline-flex items-center justify-center">
              Prendre rendez-vous <ArrowRight className="w-4 h-4 ml-2" />
            </NeonButton>
          </div>
        </div>
      )}

      <div className={`flex flex-col min-h-screen pt-10 md:pt-14 ${isEtape2 ? 'blur-md' : ''}`}>
        <div className="flex flex-1 min-h-0">
          {/* Left control rail */}
          <aside className="hidden md:block w-[260px] flex-shrink-0">
            <SimControlRail
              projects={availableProjects}
              selectedProjectId={selectedProjectId}
              onSelectProject={(v) => {
                if (v === "default") { handleReset(); setSelectedProjectId(null); }
                else setSelectedProjectId(v);
              }}
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
            <div className="flex items-center justify-between border-b border-[#1c2725] px-4 h-11 sticky top-0 bg-[#050807] z-10">
              <div className="flex items-center gap-5 h-full">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setActiveTab(t.id); if (t.id !== "scenarios") setScenarioNegoPct(0); }}
                    className={`text-xs h-full flex items-center border-b-2 transition-all duration-500 ease-out ${activeTab === t.id ? "border-[#33d6c0] text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <ExportExcelFullButton params={{ surface, loyerInitialHTHC, loyerSoumisTVA, tauxTVA, chargesCoproRefacturables, chargesCopropriete, taxeFonciereRefacturable, taxeFonciere, loyerRevalorise, anneeRevalorisation, revalorisationActive, gestionLocative, comptabilite, chargesDiverses, assurancePNE, fraisDossierBancaire, fraisCourtage, coutCreationSociete, vacancesLocatives, travauxBailleur, prixBienFAI, prixBienNegocie, tauxCommissionAgent, commissionAgentType, commissionAgentInclusFAI, tauxDroitsEnregistrement, tauxFeesKlocka, feesKlockaType, tauxIncentiveKlocka, apport, dureeCredit, tauxInteret, tauxAssuranceCredit, renegociationActive, anneeRenegociation, nouveauTauxRenegociation, iraRenegociation, indexation, anneeRevente, tauxCommissionAgentRevente, rendementBrutAcheteur, commissionAgentActive: selectedProject?.sim_commission_agent_active || false }} calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} />
                {isAdmin && (
                  <button onClick={handleCopyShareLink} className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-[#24312f] text-gray-300 hover:text-white hover:border-white/[0.25] text-xs transition-colors">
                    {linkCopied ? <Check className="w-3.5 h-3.5 text-[#5ee7d4]" /> : <Link2 className="w-3.5 h-3.5" />}
                    {linkCopied ? 'Copié' : 'Partager'}
                  </button>
                )}
                <button onClick={handleReset} className="flex items-center gap-1.5 px-3 h-8 rounded-full border border-[#24312f] text-gray-300 hover:text-white hover:border-white/[0.25] text-xs transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>

            <div key={`${activeTab}-${animKey}`} className={`p-4 space-y-4 max-w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out ${isEtape1 ? 'blur-md' : ''}`}>
              {negoActive && (
                <div className="flex items-center gap-2 text-xs text-[#33d6c0] bg-[#33d6c0]/10 border border-[#33d6c0]/25 rounded-lg px-3 py-2 animate-in fade-in slide-in-from-top-2 duration-500 ease-out">
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
              <p className="text-[10px] text-gray-600 italic px-1">Cet outil est utilisé dans une démarche de projection financière, il ne pourra être reproché à Klocka du non respect de ces projections en cas d'acquisition et d'exploitation.</p>
            </div>
          </main>
        </div>

        {/* Etape 1 overlay */}
        {isEtape1 && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto p-8 rounded-md bg-gradient-to-br from-gray-900/95 to-black/95 border-2 border-[#33d6c0]/50 text-center max-w-md backdrop-blur-sm">
              <h3 className="text-2xl text-white mb-3">Devenez client pour accéder au simulateur complet</h3>
              <p className="text-gray-300 mb-6">Débloquez tous les indicateurs, graphiques détaillés et paramètres avancés.</p>
              <NeonButton onClick={() => window.open("https://dpe3smipjxh.typeform.com/to/GD7sREFs", "_blank")} variant="default" className="inline-flex items-center justify-center">
                Prendre rendez-vous <ArrowRight className="w-4 h-4 ml-2" />
              </NeonButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}