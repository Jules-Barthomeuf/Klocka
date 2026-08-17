import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, MapPin, Calculator, X, ChevronLeft, ChevronRight, FileText, ExternalLink } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ReferenceDot, Legend } from 'recharts';
import moment from "moment";
import "moment/locale/fr";
moment.locale("fr");
import { motion } from "framer-motion";
import SecteurIndicateurs from "./SecteurIndicateurs";
import BailTabs from "./BailTabs";
import AssembleesGeneralesSection from "./AssembleesGeneralesSection";
import LocataireLiensSociaux from "./LocataireLiensSociaux";
import EnvironnementIndicateurs from "./EnvironnementIndicateurs";
import { NeonButton } from "@/components/ui/neon-button";

// Shared project display used by the client detail page and the public share page.
// `isAdmin` / `showAsClient` control admin-only bits; `isPublic` disables navigation to
// internal tools (simulator/comparator) for anonymous visitors.
export default function ProjetContent({ project, isAdmin = false, showAsClient = true, isPublic = false }) {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);
  const [currentSlide] = useState(1);
  const photosContainerRef = useRef(null);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(value || 0));
  };

  // Calcul du prix de revient à partir des données du simulateur
  const prixBienNegocie = project.sim_prix_bien_negocie || 0;
  const tauxDroitsEnregistrement = project.sim_droits_enregistrement || 8;
  const tauxFeesKlocka = project.sim_fees_klocka || 8;
  const feesKlockaType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentiveKlocka = project.sim_incentive_klocka || 20;
  const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
  const commissionAgentActive = project.sim_commission_agent_active || false;
  const commissionAgentInclusFAI = project.sim_commission_agent_inclus_fai ?? true;
  const tauxCommissionAgent = project.sim_commission_agent || 5;
  const commissionAgentType = project.sim_commission_agent_type || "pourcentage";
  const honorairesCA = commissionAgentActive ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100)) : 0;
  const prixHorsDroits = commissionAgentInclusFAI ? (prixBienNegocie - honorairesCA) : prixBienNegocie;
  const droitsEnregistrement = prixHorsDroits * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevientCalcule = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + (commissionAgentInclusFAI ? 0 : honorairesCA)
    : project.sim_prix_revient && project.sim_prix_revient > 0 ? project.sim_prix_revient : project.prix_acquisition || 0;

  const loyerAnnuel = project.sim_loyer_initial_ht || project.loyer_annuel_ht || 0;
  const anneeRevente = project.sim_annee_revente || 20;
  const apport = project.sim_apport || (prixRevientCalcule > 0 ? Math.round(prixRevientCalcule * 0.15) : 0);
  const rendementBrutAcheteur = project.sim_rendement_capital || 6.5;
  const tauxCommissionAgentRevente = project.sim_commission_agent_revente || 5;
  const indexation = project.sim_indexation_loyers || 2;
  const dureeCredit = project.sim_duree_credit || 20;
  const tauxInteret = project.sim_taux_interet || 3.7;
  const tauxAssuranceCredit = project.sim_taux_assurance || 0.25;

  const rendementLocatifNetCalcule = prixRevientCalcule > 0 && loyerAnnuel > 0
    ? (loyerAnnuel / prixRevientCalcule) * 100
    : project.sim_rendement_locatif_global_net || 0;

  function PMT(rate, nper, pv) {
    if (rate === 0) return -pv / nper;
    const pvif = Math.pow(1 + rate, nper);
    return -(rate * pv * pvif) / (pvif - 1);
  }

  const montantEmprunt = prixRevientCalcule - apport;
  const echeanceMensuelle = montantEmprunt > 0 ? Math.abs(PMT((tauxInteret / 100) / 12, dureeCredit * 12, montantEmprunt)) : 0;

  let cashFlowCumule = 0;
  let capitalRestantDu = montantEmprunt;
  let loyerAnnuelCourant = loyerAnnuel;
  let loyerNetRevente = 0;
  let totalLoyersNets = 0;

  const comptabilite = project.sim_comptabilite || 600;
  const assurancePNE = project.sim_assurance_pne || 400;
  const chargesDiverses = project.sim_charges_diverses || 0;
  const gestionLocative = project.sim_gestion_locative || 0;

  const chargesCopropriete = project.sim_charges_copropriete || 0;
  const chargesCoproRefacturables = project.sim_charges_refacturable !== false;
  const taxeFonciere = project.sim_taxe_fonciere || 0;
  const taxeFonciereRefacturable = project.sim_taxe_refacturable !== false;

  for (let annee = 1; annee <= anneeRevente; annee++) {
    if (annee > 1) {
      loyerAnnuelCourant = loyerAnnuelCourant * (1 + indexation / 100);
    }
    const chargesCoproNonRefact = !chargesCoproRefacturables ? -chargesCopropriete : 0;
    const taxeFonciereNonRefact = !taxeFonciereRefacturable ? -taxeFonciere : 0;
    const loyersNetsCashFlow = loyerAnnuelCourant + chargesCoproNonRefact + taxeFonciereNonRefact;
    totalLoyersNets += loyersNetsCashFlow;
    if (annee === anneeRevente) {
      loyerNetRevente = loyersNetsCashFlow;
    }
    let interetsAnnuels = 0;
    let capitalRembourseAnnuel = 0;
    let capitalTemp = capitalRestantDu;
    if (capitalTemp > 0 && annee <= dureeCredit) {
      const tauxMensuel = (tauxInteret / 100) / 12;
      for (let mois = 0; mois < 12; mois++) {
        if (capitalTemp <= 0) break;
        const interetMois = capitalTemp * tauxMensuel;
        interetsAnnuels += interetMois;
        const capitalMois = echeanceMensuelle - interetMois;
        capitalRembourseAnnuel += capitalMois;
        capitalTemp -= capitalMois;
      }
      capitalRestantDu = Math.max(0, capitalRestantDu - capitalRembourseAnnuel);
    }
    const assuranceCreditAnnuel = annee <= dureeCredit ? -(montantEmprunt * (tauxAssuranceCredit / 100)) : 0;
    const creditBancaireCashFlow = -(interetsAnnuels + capitalRembourseAnnuel + Math.abs(assuranceCreditAnnuel));
    const gestionLocativeCost = -(loyersNetsCashFlow * (gestionLocative / 100));
    const totalCharges = gestionLocativeCost - comptabilite - assurancePNE - chargesDiverses;
    const cashFlowAnnuel = loyersNetsCashFlow + creditBancaireCashFlow + totalCharges;
    cashFlowCumule += cashFlowAnnuel;
  }

  const prixVenteFAICalcule = rendementBrutAcheteur > 0 ? loyerNetRevente / (rendementBrutAcheteur / 100) : 0;
  const commissionAgentReventeCalcule = prixVenteFAICalcule * (tauxCommissionAgentRevente / 100);
  const prixVenteNetCalcule = prixVenteFAICalcule - commissionAgentReventeCalcule;

  const loyerMoyenNet = anneeRevente > 0 ? totalLoyersNets / anneeRevente : 0;

  let anneeRecuperationApport = null;
  let cumulRecuperationApport = 0;
  let capitalRestantTemp2 = montantEmprunt;
  let loyerCourantTemp2 = loyerAnnuel;

  for (let annee = 1; annee <= anneeRevente; annee++) {
    if (annee > 1) {
      loyerCourantTemp2 = loyerCourantTemp2 * (1 + indexation / 100);
    }
    const chargesCoproNonRefactTemp2 = !chargesCoproRefacturables ? -chargesCopropriete : 0;
    const taxeFonciereNonRefactTemp2 = !taxeFonciereRefacturable ? -taxeFonciere : 0;
    const loyersNetsCFTemp2 = loyerCourantTemp2 + chargesCoproNonRefactTemp2 + taxeFonciereNonRefactTemp2;
    let interetsAnnuelsTemp2 = 0;
    let capitalRembourseTemp2 = 0;
    let capitalTempLoop2 = capitalRestantTemp2;
    if (capitalTempLoop2 > 0 && annee <= dureeCredit) {
      const tauxMensuelTemp2 = (tauxInteret / 100) / 12;
      for (let mois = 0; mois < 12; mois++) {
        if (capitalTempLoop2 <= 0) break;
        const interetMoisTemp2 = capitalTempLoop2 * tauxMensuelTemp2;
        interetsAnnuelsTemp2 += interetMoisTemp2;
        const capitalMoisTemp2 = echeanceMensuelle - interetMoisTemp2;
        capitalRembourseTemp2 += capitalMoisTemp2;
        capitalTempLoop2 -= capitalMoisTemp2;
      }
      capitalRestantTemp2 = Math.max(0, capitalRestantTemp2 - capitalRembourseTemp2);
    }
    const assuranceCreditTemp2 = annee <= dureeCredit ? -(montantEmprunt * (tauxAssuranceCredit / 100)) : 0;
    const creditBancaireCFTemp2 = -(interetsAnnuelsTemp2 + capitalRembourseTemp2 + Math.abs(assuranceCreditTemp2));
    const gestionLocativeCostTemp2 = -(loyersNetsCFTemp2 * (gestionLocative / 100));
    const totalChargesTemp2 = gestionLocativeCostTemp2 - comptabilite - assurancePNE - chargesDiverses;
    const cashFlowAnnuelTemp2 = loyersNetsCFTemp2 + creditBancaireCFTemp2 + totalChargesTemp2;
    cumulRecuperationApport += cashFlowAnnuelTemp2 + Math.abs(capitalRembourseTemp2);
    if (cumulRecuperationApport >= apport && !anneeRecuperationApport) {
      anneeRecuperationApport = annee;
      break;
    }
  }

  const pieDataBudget = [
    { name: 'Prix négocié', value: prixBienNegocie, fill: '#33d6c0' },
    { name: "Droits enreg.", value: droitsEnregistrement, fill: '#5ee7d4' },
    { name: 'Honoraires', value: totalFraisKlocka, fill: '#F59E0B' },
    { name: 'Frais divers', value: fraisDivers, fill: '#EF4444' }
  ];

  // Clé Embed API extraite en variable d'environnement (VITE_GOOGLE_MAPS_API_KEY).
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  const mapUrl = !mapsKey ? null :
    project.latitude && project.longitude ?
    `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${project.latitude},${project.longitude}&zoom=15` :
    project.adresse_complete ?
    `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(project.adresse_complete)}&zoom=15` :
    null;

  const googleMapsLink = project.latitude && project.longitude ?
    `https://www.google.com/maps?q=${project.latitude},${project.longitude}` :
    project.adresse_complete ?
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.adresse_complete)}` :
    null;

  // Lien vers le simulateur public (accessible sans compte) — reprend les paramètres du projet
  const openPublicSimulator = () => {
    const simParams = {
      surface: project.sim_surface || 0,
      loyerInitialHTHC: project.sim_loyer_initial_ht || 0,
      loyerSoumisTVA: project.sim_loyer_soumis_tva || false,
      tauxTVA: project.sim_taux_tva || 20,
      chargesCoproRefacturables: project.sim_charges_refacturable !== false,
      chargesCopropriete: project.sim_charges_copropriete || 0,
      taxeFonciereRefacturable: project.sim_taxe_refacturable !== false,
      taxeFonciere: project.sim_taxe_fonciere || 0,
      gestionLocative: project.sim_gestion_locative || 0,
      comptabilite: project.sim_comptabilite || 600,
      chargesDiverses: project.sim_charges_diverses || 0,
      assurancePNE: project.sim_assurance_pne || 400,
      fraisDossierBancaire: project.sim_frais_dossier_bancaire || 1000,
      fraisCourtage: project.sim_frais_courtage || 0,
      coutCreationSociete: project.sim_cout_creation_societe || 1000,
      prixBienFAI: project.sim_prix_bien_fai || 0,
      prixBienNegocie: project.sim_prix_bien_negocie || 0,
      tauxCommissionAgent: project.sim_commission_agent || 5,
      commissionAgentType: project.sim_commission_agent_type || "pourcentage",
      commissionAgentInclusFAI: project.sim_commission_agent_inclus_fai ?? true,
      commissionAgentActive: project.sim_commission_agent_active || false,
      tauxDroitsEnregistrement: project.sim_droits_enregistrement || 8,
      tauxFeesKlocka: project.sim_fees_klocka || 8,
      feesKlockaType: project.sim_fees_klocka_type || "pourcentage",
      tauxIncentiveKlocka: project.sim_incentive_klocka || 20,
      apport: project.sim_apport || 0,
      dureeCredit: project.sim_duree_credit || 20,
      tauxInteret: project.sim_taux_interet || 3.7,
      tauxAssuranceCredit: project.sim_taux_assurance || 0.25,
      indexation: project.sim_indexation_loyers || 2,
      anneeRevente: project.sim_annee_revente || 20,
      tauxCommissionAgentRevente: project.sim_commission_agent_revente || 5,
      rendementBrutAcheteur: project.sim_rendement_capital || 6.5,
    };
    window.open(`${createPageUrl("SimulateurPublic")}?data=${encodeURIComponent(JSON.stringify(simParams))}`, '_blank');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-[#050807] overflow-x-hidden">

      {/* Image Lightbox */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-[#050807] border-none [&>button]:hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            <Button variant="ghost" size="icon" onClick={() => setSelectedImage(null)} className="absolute top-6 right-6 text-white hover:bg-white/20 z-10 w-14 h-14">
              <X className="w-8 h-8" />
            </Button>
            {project?.photos && project.photos.length > 1 && (
              <>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const prevIndex = (currentIndex - 1 + project.photos.length) % project.photos.length;
                  setSelectedImage(project.photos[prevIndex]);
                }} className="absolute left-6 top-1/2 -translate-y-1/2 bg-[#050807]/50 hover:bg-[#050807]/70 text-white rounded-full w-16 h-16 z-10">
                  <ChevronLeft className="w-10 h-10" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const nextIndex = (currentIndex + 1) % project.photos.length;
                  setSelectedImage(project.photos[nextIndex]);
                }} className="absolute right-6 top-1/2 -translate-y-1/2 bg-[#050807]/50 hover:bg-[#050807]/70 text-white rounded-full w-16 h-16 z-10">
                  <ChevronRight className="w-10 h-10" />
                </Button>
              </>
            )}
            {selectedImage && <img src={selectedImage} alt="Photo agrandie" className="max-w-[95vw] max-h-[95vh] object-contain" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Banner */}
      <div className="w-full bg-[#050807] h-48 md:h-72 lg:h-96 overflow-hidden px-2 md:px-6">
        <div className="flex h-full gap-2 md:gap-3 overflow-hidden py-2 md:py-3">
          <div className="flex-1 min-w-0">
            <div className="w-full h-full rounded-lg overflow-hidden relative">
              {googleMapsLink && mapUrl ? (
                <iframe src={mapUrl} width="100%" height="100%" style={{ border: 0, display: 'block' }} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte du projet" />
              ) : (
                <div className="w-full h-full bg-white/[0.03] flex items-center justify-center">
                  <p className="text-white/30 text-sm">Aucune adresse renseignée</p>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-[#050807]/60 text-white text-xs px-2 py-0.5 rounded pointer-events-none">Carte</div>
            </div>
          </div>
          {project.photos && project.photos.length > 0 && (
            <div ref={photosContainerRef} className="hidden md:flex w-36 lg:w-56 flex-col gap-2 overflow-y-auto flex-shrink-0">
              {project.photos.map((photo, idx) => (
                <img key={idx} src={photo} alt={`Photo ${idx + 1}`} onClick={() => setSelectedImage(photo)}
                  className="w-full h-28 lg:h-36 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity flex-shrink-0" />
              ))}
            </div>
          )}
        </div>
      </div>

      {project.photos && project.photos.length > 0 && (
        <div className="md:hidden flex gap-2 overflow-x-auto px-3 py-2 bg-[#050807]" style={{ scrollbarWidth: 'none' }}>
          {project.photos.map((photo, idx) => (
            <img key={idx} src={photo} alt={`Photo ${idx + 1}`} onClick={() => setSelectedImage(photo)}
              className="h-20 w-32 object-cover rounded-lg flex-shrink-0 cursor-pointer" />
          ))}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="mb-6 md:mb-8">
            <div className="flex flex-col md:flex-row items-start justify-between mb-4 md:mb-6 gap-3">
              <div className="flex-1">
                <h1 className="text-4xl max-md:text-2xl font-light tracking-tight text-white mb-2">{project.titre}</h1>
                {project.surface_m2 > 0 && (
                  <p className="text-white/30 text-lg max-md:text-base mb-6 max-md:mb-4">{project.surface_m2} m²</p>
                )}
                {!isPublic && (
                  <div className="flex flex-col md:flex-row gap-2 max-md:w-full">
                    <NeonButton variant="solid" className="md:min-w-[280px] max-md:w-full" onClick={() => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}>
                      Voir le simulateur complet
                    </NeonButton>
                    <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.02] hover:bg-white/[0.05] border border-[#131c1b] rounded-full text-white text-sm transition-all max-md:w-full max-md:justify-center"
                      onClick={() => navigate(`${createPageUrl("Comparateur")}?preselect=${project.id}`)}>
                      <Calculator className="w-4 h-4" />
                      Comparer
                    </button>
                    <button className="inline-flex items-center justify-center w-9 h-9 bg-white/[0.02] hover:bg-white/[0.05] border border-[#131c1b] rounded-full text-white transition-all max-md:hidden"
                      onClick={() => window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`, '_blank')}>
                      <ExternalLink className="w-4 h-4" />
                    </button>
                    {project.documents && project.documents.length > 0 && (
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.02] hover:bg-white/[0.05] border border-[#131c1b] rounded-full text-[#33d6c0] text-sm transition-all max-md:w-full max-md:justify-center"
                        onClick={() => window.open(project.documents[0], '_blank')}>
                        <Download className="w-4 h-4" />
                        Documents ({project.documents.length})
                      </button>
                    )}
                  </div>
                )}
                {isPublic && (
                  <div className="flex flex-col md:flex-row gap-2 max-md:w-full">
                    <NeonButton variant="solid" className="md:min-w-[280px] max-md:w-full" onClick={openPublicSimulator}>
                      Voir le simulateur complet
                    </NeonButton>
                    {project.documents && project.documents.length > 0 && (
                      <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/[0.02] hover:bg-white/[0.05] border border-[#131c1b] rounded-full text-[#33d6c0] text-sm transition-all max-md:w-full max-md:justify-center"
                        onClick={() => window.open(project.documents[0], '_blank')}>
                        <Download className="w-4 h-4" />
                        Documents ({project.documents.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="text-left md:text-right w-full md:w-auto">
                <p className="text-white/30 text-[10px] uppercase tracking-[0.15em]">Prix de revient</p>
                <p className="text-3xl max-md:text-2xl font-light text-white">{formatCurrency(prixRevientCalcule)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="secteur" className="w-full mt-8 max-md:mt-6">
          <TabsList className="w-full flex justify-start gap-4 max-md:gap-2 bg-transparent border-b border-[#131c1b] mb-8 max-md:mb-4 rounded-none px-0 h-auto pb-0 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {[
              { v: "secteur", l: "Secteur" },
              { v: "marche", l: "Marché" },
              { v: "bien", l: "Bien" },
              { v: "locataire", l: "Locataire" },
              { v: "bail", l: "Analyse du bail" },
              { v: "copropriete", l: "Copropriété" },
              { v: "diagnostique", l: "Diagnostique" },
              { v: "documents_projet", l: "Documents" },
            ].map(({ v, l }) => (
              <TabsTrigger key={v} value={v} className="relative bg-transparent border-0 text-white/30 hover:text-white data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:shadow-none transition-all duration-300 pb-3 max-md:text-xs max-md:pb-2 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#33d6c0] after:scale-x-0 data-[state=active]:after:scale-x-100 after:transition-transform after:duration-300 after:origin-center">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="secteur" className="space-y-6 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              {(project.description_ville || project.description_secteur || project.ville_secteur_champ1) && (
                <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8 mb-6">
                  {(project.ville_secteur_champ1 || project.ville_secteur_champ2 || project.ville_secteur_champ3) && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                      {project.ville_secteur_champ1 && <Badge className="bg-[#33d6c0] text-white py-1 px-4">{project.ville_secteur_champ1}</Badge>}
                      {project.ville_secteur_champ2 && <Badge className="bg-[#5ee7d4] text-white py-1 px-4">{project.ville_secteur_champ2}</Badge>}
                      {project.ville_secteur_champ3 && <Badge className="bg-white/10 text-white py-1 px-4">{project.ville_secteur_champ3}</Badge>}
                    </div>
                  )}
                  {project.description_ville && (
                    <div className="mb-5">
                      <h3 className="text-white font-medium mb-2 text-sm uppercase tracking-wider text-white/50">La ville</h3>
                      <p className="text-sm text-white/60 leading-relaxed text-justify whitespace-pre-wrap">{project.description_ville}</p>
                    </div>
                  )}
                  {project.description_secteur && (
                    <div>
                      <h3 className="text-white font-medium mb-2 text-sm uppercase tracking-wider text-white/50">Le secteur</h3>
                      <p className="text-sm text-white/60 leading-relaxed text-justify whitespace-pre-wrap">{project.description_secteur}</p>
                    </div>
                  )}
                </div>
              )}
              <SecteurIndicateurs project={project} />
              <div className="mt-6">
                <EnvironnementIndicateurs project={project} />
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="marche" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                {project.marche_quartier_nom && (
                  <div className="mb-8">
                    <p className="text-xs text-white/30 uppercase tracking-wider mb-1">Quartier / Secteur</p>
                    <p className="text-lg text-white font-medium">{project.marche_quartier_nom}</p>
                  </div>
                )}
                {!project.marche_masquer_secteurs && project.marche_secteurs && project.marche_secteurs.length > 0 && (
                  <div className="mb-10">
                    <h3 className="text-xl max-md:text-lg text-white mb-4 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-[#33d6c0]" />
                      Secteurs & Localisation
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {project.marche_secteurs.map((secteur, idx) => (
                        <div key={idx} className="p-5 bg-white/[0.03]/50 rounded-md border border-[#131c1b]">
                          <p className="text-white font-medium mb-3">{secteur.nom || `Secteur ${idx + 1}`}</p>
                          <div className="flex items-center gap-4">
                            <div className="flex-1">
                              <p className="text-xs text-[#5ee7d4] mb-1">Estimation basse</p>
                              <p className="text-lg text-white font-semibold">{secteur.estimation_basse?.toLocaleString() || '-'} €/m²</p>
                            </div>
                            <div className="h-8 w-px bg-gray-700" />
                            <div className="flex-1">
                              <p className="text-xs text-red-400 mb-1">Estimation haute</p>
                              <p className="text-lg text-white font-semibold">{secteur.estimation_haute?.toLocaleString() || '-'} €/m²</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!project.marche_masquer_residentiel && (
                  <div className="mb-12 max-md:mb-8">
                    <h3 className="text-xl max-md:text-lg text-white mb-6 max-md:mb-4">Marché immobilier résidentiel</h3>
                    {project.marche_prix_m2_median > 0 && (
                      <div className="mb-6">
                        <div className="mb-3"><span className="text-sm text-white">Prix au m²</span></div>
                        <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-[#33d6c0] via-yellow-500 to-red-500">
                          {(() => {
                            const bas = project.marche_prix_m2_bas || 0;
                            const haut = project.marche_prix_m2_haut || project.marche_prix_m2_median * 2;
                            const range = haut - bas;
                            const position = range > 0 ? ((project.marche_prix_m2_median - bas) / range) * 100 : 50;
                            return (
                              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-black" style={{ left: `${Math.max(0, Math.min(100, position))}%`, transform: 'translate(-50%, -50%)' }} title={`${project.marche_prix_m2_median.toLocaleString()} €`} />
                            );
                          })()}
                        </div>
                        <div className="flex flex-col md:flex-row justify-between gap-2 md:gap-0 mt-3">
                          <span className="text-sm max-md:text-xs text-[#5ee7d4] font-semibold">Prix bas: {project.marche_prix_m2_bas?.toLocaleString() || '0'} €</span>
                          <span className="text-sm max-md:text-xs text-yellow-400 font-semibold">Prix médian: {project.marche_prix_m2_median.toLocaleString()} €</span>
                          <span className="text-sm max-md:text-xs text-red-400 font-semibold">Prix haut: {project.marche_prix_m2_haut?.toLocaleString() || '-'} €</span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 max-md:gap-3">
                      {project.marche_evolution_1an != null && project.marche_evolution_1an !== 0 && (
                        <div className="p-4 bg-white/[0.03]/50 rounded-md">
                          <p className="text-xs text-white/30 mb-1">Évolution 1 an</p>
                          <p className={`text-2xl font-semibold ${project.marche_evolution_1an >= 0 ? 'text-[#5ee7d4]' : 'text-red-400'}`}>{project.marche_evolution_1an >= 0 ? '+' : ''}{project.marche_evolution_1an}%</p>
                        </div>
                      )}
                      {project.marche_evolution_5ans != null && project.marche_evolution_5ans !== 0 && (
                        <div className="p-4 bg-white/[0.03]/50 rounded-md">
                          <p className="text-xs text-white/30 mb-1">Évolution 5 ans</p>
                          <p className={`text-2xl font-semibold ${project.marche_evolution_5ans >= 0 ? 'text-[#5ee7d4]' : 'text-red-400'}`}>{project.marche_evolution_5ans >= 0 ? '+' : ''}{project.marche_evolution_5ans}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!project.marche_masquer_commercial && (
                  <div>
                    <h3 className="text-xl max-md:text-lg font-light text-white mb-6 max-md:mb-4">Marché immobilier commercial</h3>
                    {(project.marche_offre_bas > 0 || project.marche_offre_moyenne > 0 || project.marche_offre_haut > 0) && (
                      <div className="mb-6">
                        <div className="mb-3"><span className="text-sm text-white">Valeur locative (offre)</span></div>
                        <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
                          {(() => {
                            const bas = project.marche_offre_bas || 0;
                            const haut = project.marche_offre_haut || project.marche_offre_moyenne * 2;
                            const moyenne = project.marche_offre_moyenne || 0;
                            const range = haut - bas;
                            const position = range > 0 && moyenne > 0 ? ((moyenne - bas) / range) * 100 : 50;
                            return moyenne > 0 ? (
                              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-black" style={{ left: `${Math.max(0, Math.min(100, position))}%`, transform: 'translate(-50%, -50%)' }} title={`${moyenne.toLocaleString()} €/m²`} />
                            ) : null;
                          })()}
                        </div>
                        <div className="flex flex-col md:flex-row justify-between gap-2 md:gap-0 mt-3">
                          <span className="text-sm max-md:text-xs text-blue-400 font-semibold">Prix bas: {project.marche_offre_bas?.toLocaleString() || '0'} €</span>
                          <span className="text-sm max-md:text-xs text-purple-400 font-semibold">Prix médian: {project.marche_offre_moyenne?.toLocaleString() || '-'} €</span>
                          <span className="text-sm max-md:text-xs text-pink-400 font-semibold">Prix haut: {project.marche_offre_haut?.toLocaleString() || '-'} €</span>
                        </div>
                      </div>
                    )}
                    {(project.marche_baux_bas > 0 || project.marche_baux_moyenne > 0 || project.marche_baux_haut > 0) && (
                      <div className="mb-6">
                        <div className="mb-3"><span className="text-sm text-white">Valeur locative (baux existants)</span></div>
                        <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500">
                          {(() => {
                            const bas = project.marche_baux_bas || 0;
                            const haut = project.marche_baux_haut || project.marche_baux_moyenne * 2;
                            const moyenne = project.marche_baux_moyenne || 0;
                            const range = haut - bas;
                            const position = range > 0 && moyenne > 0 ? ((moyenne - bas) / range) * 100 : 50;
                            return moyenne > 0 ? (
                              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-black" style={{ left: `${Math.max(0, Math.min(100, position))}%`, transform: 'translate(-50%, -50%)' }} title={`${moyenne.toLocaleString()} €/m²/an`} />
                            ) : null;
                          })()}
                        </div>
                        <div className="flex flex-col md:flex-row justify-between gap-2 md:gap-0 mt-3">
                          <span className="text-sm max-md:text-xs text-orange-400 font-semibold">Prix bas: {project.marche_baux_bas?.toLocaleString() || '0'} €</span>
                          <span className="text-sm max-md:text-xs text-amber-400 font-semibold">Prix médian: {project.marche_baux_moyenne?.toLocaleString() || '-'} €</span>
                          <span className="text-sm max-md:text-xs text-yellow-400 font-semibold">Prix haut: {project.marche_baux_haut?.toLocaleString() || '-'} €</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {project.notes_marche && project.notes_marche.length > 0 && (
                  <div className="mt-8 max-md:mt-6 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 text-lg">Notes</h3>
                    <div className="space-y-3">
                      {project.notes_marche.map((note, idx) => (
                        <div key={idx} className="p-4 bg-white/[0.02] rounded-md border border-[#131c1b]">
                          {note.titre && <h4 className="text-white font-semibold mb-2">{note.titre}</h4>}
                          <p className="text-sm text-white/60 whitespace-pre-wrap">{note.contenu}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="bien" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">Le bien</h2>
                {(project.bien_champ1 || project.bien_champ2 || project.bien_champ3) &&
                  <div className="flex gap-3 max-md:gap-2 mb-6 max-md:mb-4 flex-wrap">
                    {project.bien_champ1 && <Badge className="bg-[#33d6c0] text-white py-1 px-4 max-md:text-xs max-md:px-3">{project.bien_champ1}</Badge>}
                    {project.bien_champ2 && <Badge className="bg-[#5ee7d4] text-white py-1 px-4 max-md:text-xs max-md:px-3">{project.bien_champ2}</Badge>}
                    {project.bien_champ3 && <Badge className="bg-gray-700 text-white py-1 px-4 max-md:text-xs max-md:px-3">{project.bien_champ3}</Badge>}
                  </div>
                }
                {project.description_bien && <p className="text-sm max-md:text-xs text-white/60 leading-relaxed text-justify">{project.description_bien}</p>}
                {!project.description_bien && (!project.bien_champ1 && !project.bien_champ2 && !project.bien_champ3) && (!project.notes_bien || project.notes_bien.length === 0) &&
                  <div className="text-center py-12 max-md:py-6"><p className="text-white/30 max-md:text-sm">Aucune information dans cette partie</p></div>
                }
                {project.notes_bien && project.notes_bien.length > 0 &&
                  <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 max-md:text-lg">Notes</h3>
                    <div className="space-y-4">
                      {project.notes_bien.map((note, idx) => (
                        <div key={idx} className="p-4 bg-white/[0.02] rounded-md border border-[#131c1b]">
                          {note.titre && <h4 className="text-white font-semibold mb-2">{note.titre}</h4>}
                          <p className="text-sm text-white/60 whitespace-pre-wrap">{note.contenu}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="locataire" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">Le locataire</h2>
                <div className="grid md:grid-cols-2 gap-6 max-md:gap-4 mb-6 max-md:mb-4">
                  {project.nom_locataire && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Nom</p><p className="text-lg max-md:text-base font-semibold text-white">{project.nom_locataire}</p></div>}
                  {project.activite_locataire && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Activité</p><p className="text-lg max-md:text-base font-semibold text-white">{project.activite_locataire}</p></div>}
                  {(project.sim_loyer_initial_ht > 0 || project.loyer_annuel_ht > 0) && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Loyer annuel</p><p className="text-lg max-md:text-base font-semibold text-[#33d6c0]">{(project.sim_loyer_initial_ht || project.loyer_annuel_ht)?.toLocaleString()}€ HT HC</p></div>}
                  {project.echeance_bail && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Échéance du bail</p><p className="text-lg max-md:text-base font-semibold text-white">{moment(project.echeance_bail).format('DD MMMM YYYY')}</p></div>}
                  {(project.sim_surface > 0 || project.loyer_m2_an > 0) && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Loyer par m²</p><p className="text-lg max-md:text-base font-semibold text-white">{project.sim_surface > 0 && project.sim_loyer_initial_ht > 0 ? Math.round(project.sim_loyer_initial_ht / project.sim_surface) : project.loyer_m2_an} €/m²/an</p></div>}
                  {!project.nom_locataire && !project.activite_locataire && (project.sim_loyer_initial_ht <= 0 && project.loyer_annuel_ht <= 0) && !project.echeance_bail && (project.sim_surface <= 0 && !project.loyer_m2_an) &&
                    <div className="text-center py-12 max-md:py-6 col-span-2"><p className="text-white/30 max-md:text-sm">Aucune information dans cette partie</p></div>
                  }
                </div>
                <LocataireLiensSociaux liens={project.liens_locataire} />
                {project.bilans_locataire && project.bilans_locataire.length > 0 && (
                  <div className="mt-6 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 max-md:text-lg">Bilans financiers</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      {project.bilans_locataire.sort((a, b) => (b.annee || "").localeCompare(a.annee || "")).map((bilan, idx) => (
                        <a key={idx} href={bilan.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-md border border-[#131c1b] hover:border-[#33d6c0]/50 hover:bg-white/[0.03] transition-all duration-300 group">
                          <div className="w-10 h-10 bg-[#33d6c0]/20 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-[#33d6c0]/30 transition-colors"><FileText className="w-5 h-5 text-[#33d6c0]" /></div>
                          <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{bilan.nom}</p>{bilan.annee && <p className="text-white/20 text-xs">Année {bilan.annee}</p>}</div>
                          <Download className="w-4 h-4 text-white/20 group-hover:text-[#33d6c0] transition-colors flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {project.notes_locataire && project.notes_locataire.length > 0 &&
                  <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 max-md:text-lg">Notes</h3>
                    <div className="space-y-4">
                      {project.notes_locataire.map((note, idx) => (
                        <div key={idx} className="p-4 bg-white/[0.02] rounded-md border border-[#131c1b]">
                          {note.titre && <h4 className="text-white font-semibold mb-2">{note.titre}</h4>}
                          <p className="text-sm text-white/60 whitespace-pre-wrap">{note.contenu}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="bail" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">Analyse du bail</h2>
                <BailTabs project={project} />
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="copropriete" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">La copropriété</h2>
                <div className="grid md:grid-cols-2 gap-6 max-md:gap-4">
                  {project.charges_copropriete > 0 && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Charges de la copro</p><p className="text-lg max-md:text-base font-semibold text-white">{project.charges_copropriete} €</p></div>}
                  {project.type_construction && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Type de construction</p><p className="text-lg max-md:text-base font-semibold text-white">{project.type_construction}</p></div>}
                  {project.taxe_fonciere_an > 0 && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Taxe foncière</p><p className="text-lg max-md:text-base font-semibold text-white">{project.taxe_fonciere_an} €/an</p></div>}
                  {project.provision_charges > 0 && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Provision pour charges</p><p className="text-lg max-md:text-base font-semibold text-white">{project.provision_charges} €/an</p></div>}
                  {project.quote_part_lot > 0 && <div><p className="text-sm max-md:text-xs text-white/30 mb-1">Quote part du lot</p><p className="text-lg max-md:text-base font-semibold text-white">{project.quote_part_lot}%</p></div>}
                  {project.charges_copropriete <= 0 && !project.type_construction && project.taxe_fonciere_an <= 0 && project.provision_charges <= 0 && project.quote_part_lot <= 0 &&
                    <div className="text-center py-12 max-md:py-6 col-span-2"><p className="text-white/30 max-md:text-sm">Aucune information dans cette partie</p></div>
                  }
                </div>
                {(project.activites_autorisees || project.activites_interdites) &&
                  <div className="grid md:grid-cols-2 gap-6 max-md:gap-4 mt-6">
                    {project.activites_autorisees &&
                      <div className="p-4 bg-[#33d6c0]/10 rounded-md border border-[#33d6c0]/30">
                        <p className="text-sm max-md:text-xs text-[#5ee7d4] mb-3 font-semibold">✓ Activités autorisées</p>
                        <ul className="space-y-1">{project.activites_autorisees.split(',').map((activite, idx) => (<li key={idx} className="text-sm text-white/60">• {activite.trim()}</li>))}</ul>
                      </div>
                    }
                    {project.activites_interdites &&
                      <div className="p-4 bg-red-900/20 rounded-md border border-red-500/30">
                        <p className="text-sm max-md:text-xs text-red-400 mb-3 font-semibold">✗ Activités interdites</p>
                        <ul className="space-y-1">{project.activites_interdites.split(',').map((activite, idx) => (<li key={idx} className="text-sm text-white/60">• {activite.trim()}</li>))}</ul>
                      </div>
                    }
                  </div>
                }
                {project.synthese_assemblee_generale && project.synthese_assemblee_generale.trim() && (
                  <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-3 max-md:mb-2 max-md:text-lg">Synthèse de l'assemblée générale</h3>
                    <div className="text-white/60 leading-relaxed whitespace-pre-wrap max-md:text-sm">{project.synthese_assemblee_generale}</div>
                  </div>
                )}
                {(project.resolutions_votees || project.resolutions_refusees) &&
                  <div className="grid md:grid-cols-2 gap-6 max-md:gap-4 mt-6">
                    {project.resolutions_votees &&
                      <div className="p-4 bg-[#33d6c0]/10 rounded-md border border-[#33d6c0]/30">
                        <p className="text-sm max-md:text-xs text-[#5ee7d4] mb-3 font-semibold">✓ Résolutions votées</p>
                        <div className="text-sm text-white/60 whitespace-pre-wrap">{project.resolutions_votees}</div>
                      </div>
                    }
                    {project.resolutions_refusees &&
                      <div className="p-4 bg-red-900/20 rounded-md border border-red-500/30">
                        <p className="text-sm max-md:text-xs text-red-400 mb-3 font-semibold">✗ Résolutions non acceptées</p>
                        <div className="text-sm text-white/60 whitespace-pre-wrap">{project.resolutions_refusees}</div>
                      </div>
                    }
                  </div>
                }
                <AssembleesGeneralesSection project={project} isAdmin={isAdmin && !showAsClient} showAsClient={showAsClient} />
                {project.notes_libres && project.notes_libres.length > 0 &&
                  <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 max-md:text-lg">Notes</h3>
                    <div className="space-y-4">
                      {project.notes_libres.map((note, idx) => (
                        <div key={idx} className="p-4 bg-white/[0.02] rounded-md border border-[#131c1b]">
                          {note.titre && <h4 className="text-white font-semibold mb-2">{note.titre}</h4>}
                          <p className="text-sm text-white/60 whitespace-pre-wrap">{note.contenu}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="diagnostique" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">Diagnostiques énergétiques</h2>
                <div className="grid md:grid-cols-2 gap-8 max-md:gap-6">
                  {project.dpe_note && (
                    <div>
                      <h3 className="text-lg max-md:text-base font-semibold text-white mb-4 max-md:mb-3">DPE - Diagnostic de Performance Énergétique</h3>
                      <div className="space-y-1">
                        {["A", "B", "C", "D", "E", "F", "G"].map((note, idx) => {
                          const colors = ["#319834", "#34CC0C", "#C3D301", "#FDEE03", "#FDB814", "#EF8023", "#E5001E"];
                          const widths = ["60%", "70%", "80%", "90%", "100%", "90%", "80%"];
                          const isActive = project.dpe_note === note;
                          return (
                            <div key={note} className={`flex items-center gap-2 transition-all ${isActive ? 'scale-105' : 'opacity-60'}`} style={{ width: widths[idx] }}>
                              <div className="flex-1 h-8 max-md:h-7 flex items-center justify-between px-3 max-md:px-2 rounded-r-lg text-white text-sm max-md:text-xs" style={{ backgroundColor: colors[idx] }}>
                                <span>{note}</span>
                                {isActive && project.dpe_consommation > 0 && <span className="text-xs max-md:text-[10px]">{project.dpe_consommation} kWh/m²/an</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {project.ges_note && (
                    <div>
                      <h3 className="text-lg max-md:text-base font-semibold text-white mb-4 max-md:mb-3">GES - Émissions de gaz à effet de serre</h3>
                      <div className="space-y-1">
                        {["A", "B", "C", "D", "E", "F", "G"].map((note, idx) => {
                          const colors = ["#F1EEF6", "#E3D5EC", "#C7AED7", "#A777BE", "#8B50A2", "#6A3285", "#4E1F67"];
                          const widths = ["60%", "70%", "80%", "90%", "100%", "90%", "80%"];
                          const isActive = project.ges_note === note;
                          return (
                            <div key={note} className={`flex items-center gap-2 transition-all ${isActive ? 'scale-105' : 'opacity-60'}`} style={{ width: widths[idx] }}>
                              <div className="flex-1 h-8 max-md:h-7 flex items-center justify-between px-3 max-md:px-2 rounded-r-lg text-white text-sm max-md:text-xs" style={{ backgroundColor: colors[idx] }}>
                                <span>{note}</span>
                                {isActive && project.ges_emission > 0 && <span className="text-xs max-md:text-[10px]">{project.ges_emission} kg CO₂/m²/an</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {project.notes_diagnostique && project.notes_diagnostique.length > 0 && (
                  <div className="mt-8 max-md:mt-4 pt-6 max-md:pt-4 border-t border-[#131c1b]">
                    <h3 className="font-light text-white mb-4 max-md:mb-2 max-md:text-lg">Notes</h3>
                    <div className="space-y-4">
                      {project.notes_diagnostique.map((note, idx) => (
                        <div key={idx} className="p-4 bg-white/[0.02] rounded-md border border-[#131c1b]">
                          {note.titre && <h4 className="text-white font-semibold mb-2">{note.titre}</h4>}
                          <p className="text-sm text-white/60 whitespace-pre-wrap">{note.contenu}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!project.dpe_note && !project.ges_note && (!project.notes_diagnostique || project.notes_diagnostique.length === 0) && (
                  <div className="text-center py-12 max-md:py-6"><p className="text-white/30 max-md:text-sm">Aucune donnée de diagnostic disponible pour ce projet.</p></div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="documents_projet" className="space-y-8 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
                <h2 className="text-2xl max-md:text-xl font-light text-white mb-6 max-md:mb-4">Documents du projet</h2>
                {project.fichiers_projet && project.fichiers_projet.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {project.fichiers_projet.map((fichier, idx) => (
                      <a key={idx} href={fichier.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-4 bg-white/[0.02] rounded-md border border-[#131c1b] hover:border-[#33d6c0]/50 hover:bg-white/[0.03] transition-all duration-300 group">
                        <div className="w-12 h-12 bg-[#33d6c0]/20 rounded-md flex items-center justify-center flex-shrink-0 group-hover:bg-[#33d6c0]/30 transition-colors"><FileText className="w-6 h-6 text-[#33d6c0]" /></div>
                        <div className="flex-1 min-w-0"><p className="text-white font-medium truncate">{fichier.nom}</p><p className="text-white/20 text-xs">Cliquez pour télécharger</p></div>
                        <Download className="w-5 h-5 text-white/20 group-hover:text-[#33d6c0] transition-colors flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 max-md:py-6">
                    <FileText className="w-12 h-12 text-white/15 mx-auto mb-4" />
                    <p className="text-white/30 max-md:text-sm">Aucun document disponible pour ce projet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Synthèse financière */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-12 max-md:mt-6 pt-10 max-md:pt-6">
          <div className="mb-8">
            <p className="text-[#33d6c0] uppercase tracking-[0.3em] text-[10px] font-medium mb-2">Finances</p>
            <h2 className="text-2xl md:text-3xl font-light text-white tracking-tight">Synthèse financière</h2>
            <div className="h-px w-12 bg-[#33d6c0] mt-3" />
          </div>
          <div className="grid lg:grid-cols-2 gap-6 max-md:grid-cols-1 max-md:gap-4 mb-8 max-md:mb-4">
            <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
              <h3 className="text-white text-lg mb-4 font-light">Budget total</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-md:gap-4 max-w-full">
                <div className="relative flex items-center justify-center w-full order-2 md:order-1">
                  <ResponsiveContainer width="100%" height={200} className="max-w-full">
                    <PieChart>
                      <Pie data={prixBienNegocie > 0 ? pieDataBudget : [{ name: 'Prix de revient', value: prixRevientCalcule, fill: '#33d6c0' }]} cx="50%" cy="50%" innerRadius={70} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                        {(prixBienNegocie > 0 ? pieDataBudget : [{ name: 'Prix de revient', value: prixRevientCalcule, fill: '#33d6c0' }]).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} wrapperStyle={{ zIndex: 100 }} contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #fff', borderRadius: '8px', color: '#fff' }} labelStyle={{ color: '#fff' }} position={{ y: -20 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xl text-white">{formatCurrency(prixRevientCalcule)}</p>
                      <p className="text-xs text-gray-200">Prix de revient</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 min-w-0 flex-shrink order-1 md:order-2">
                  {prixBienNegocie > 0 ? (
                    <>
                      <div><p className="text-xs text-white/30">Prix du bien négocié FAI</p><p className="text-lg text-white">{formatCurrency(prixBienNegocie)}</p></div>
                      <div><p className="text-xs text-white/30">Droits d'enregistrement estimés</p><p className="text-lg text-white">{formatCurrency(droitsEnregistrement)}</p></div>
                      <div><p className="text-xs text-white/30">Honoraires Klocka</p><p className="text-lg text-white">{formatCurrency(totalFraisKlocka)}</p></div>
                      <div><p className="text-xs text-white/30">Frais divers à l'acquisition</p><p className="text-lg text-white">{formatCurrency(fraisDivers)}</p></div>
                    </>
                  ) : (
                    <>
                      <div><p className="text-xs text-white/30">Prix de revient</p><p className="text-lg text-white">{formatCurrency(prixRevientCalcule)}</p></div>
                      <div><p className="text-xs text-white/30">Loyer annuel HT</p><p className="text-lg text-white">{formatCurrency(loyerAnnuel)}</p></div>
                      <div><p className="text-xs text-white/30">Apport estimé</p><p className="text-lg text-white">{formatCurrency(apport)}</p></div>
                    </>
                  )}
                </div>
              </div>
              {!isPublic ? (
                <button onClick={() => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)} className="w-full mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#33d6c0]/10 border border-[#33d6c0]/30 hover:bg-[#33d6c0]/20 text-white text-sm rounded-full transition-all">
                  Accéder au simulateur complet
                </button>
              ) : (
                <button onClick={openPublicSimulator} className="w-full mt-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#33d6c0]/10 border border-[#33d6c0]/30 hover:bg-[#33d6c0]/20 text-white text-sm rounded-full transition-all">
                  Accéder au simulateur complet
                </button>
              )}
            </div>

            <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
              <h3 className="text-white text-lg mb-6 font-light">Indicateurs clés</h3>
              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
                <div className="p-5 bg-white/[0.02] rounded-md border border-[#131c1b]">
                  <p className="text-white/30 text-[10px] uppercase tracking-[0.15em] mb-2">Rendement locatif net</p>
                  <p className="text-2xl font-light text-[#33d6c0]">{rendementLocatifNetCalcule.toFixed(2)}%</p>
                </div>
                <div className="p-5 bg-white/[0.02] rounded-md border border-[#131c1b]">
                  <p className="text-white/30 text-[10px] uppercase tracking-[0.15em] mb-2">Apport initial</p>
                  <p className="text-2xl font-light text-white">{formatCurrency(apport)}</p>
                </div>
                <div className="p-5 bg-white/[0.02] rounded-md border border-[#131c1b]">
                  <p className="text-white/30 text-[10px] uppercase tracking-[0.15em] mb-2">Récupération apport</p>
                  <p className="text-2xl font-light text-white">{anneeRecuperationApport ? `Année ${anneeRecuperationApport}` : 'N/A'}</p>
                </div>
                <div className="p-5 bg-white/[0.02] rounded-md border border-[#131c1b]">
                  <p className="text-white/30 text-[10px] uppercase tracking-[0.15em] mb-2">Loyer moyen net</p>
                  <p className="text-2xl font-light text-white">{formatCurrency(loyerMoyenNet)}/an</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Graphique Création de richesse */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mt-8 max-md:mt-6">
          <div className="bg-white/[0.015] rounded-md border border-[#131c1b] p-6 md:p-8">
            <h3 className="text-white text-lg mb-6 font-light">Création de richesse cumulée</h3>
            <div className="h-80 max-md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(() => {
                  const data = [];
                  let cashFlowCumulTemp = 0;
                  let capitalCumulTemp = 0;
                  let capitalRestantTemp = montantEmprunt;
                  let loyerCourantTemp = loyerAnnuel;
                  let anneeDoubleApport = null;
                  for (let annee = 1; annee <= Math.min(anneeRevente, 20); annee++) {
                    if (annee > 1) loyerCourantTemp = loyerCourantTemp * (1 + indexation / 100);
                    const chargesCoproNonRefactTemp = !chargesCoproRefacturables ? -chargesCopropriete : 0;
                    const taxeFonciereNonRefactTemp = !taxeFonciereRefacturable ? -taxeFonciere : 0;
                    const loyersNetsCFTemp = loyerCourantTemp + chargesCoproNonRefactTemp + taxeFonciereNonRefactTemp;
                    let interetsAnnuelsTemp = 0;
                    let capitalRembourseTemp = 0;
                    let capitalTempLoop = capitalRestantTemp;
                    if (capitalTempLoop > 0 && annee <= dureeCredit) {
                      const tauxMensuelTemp = (tauxInteret / 100) / 12;
                      for (let mois = 0; mois < 12; mois++) {
                        if (capitalTempLoop <= 0) break;
                        const interetMoisTemp = capitalTempLoop * tauxMensuelTemp;
                        interetsAnnuelsTemp += interetMoisTemp;
                        const capitalMoisTemp = echeanceMensuelle - interetMoisTemp;
                        capitalRembourseTemp += capitalMoisTemp;
                        capitalTempLoop -= capitalMoisTemp;
                      }
                      capitalRestantTemp = Math.max(0, capitalRestantTemp - capitalRembourseTemp);
                    }
                    const assuranceCreditTemp = annee <= dureeCredit ? -(montantEmprunt * (tauxAssuranceCredit / 100)) : 0;
                    const creditBancaireCFTemp = -(interetsAnnuelsTemp + capitalRembourseTemp + Math.abs(assuranceCreditTemp));
                    const gestionLocativeCostTemp = -(loyersNetsCFTemp * (gestionLocative / 100));
                    const totalChargesTemp = gestionLocativeCostTemp - comptabilite - assurancePNE - chargesDiverses;
                    const cashFlowAnnuelTemp = loyersNetsCFTemp + creditBancaireCFTemp + totalChargesTemp;
                    cashFlowCumulTemp += cashFlowAnnuelTemp;
                    capitalCumulTemp += Math.abs(capitalRembourseTemp);
                    const totalCumule = cashFlowCumulTemp + capitalCumulTemp;
                    if (!anneeDoubleApport && totalCumule >= apport * 2) anneeDoubleApport = annee;
                    data.push({ annee, totalCumule: Math.round(totalCumule), isRecuperationApport: annee === anneeRecuperationApport, isDoubleApport: annee === anneeDoubleApport });
                  }
                  return data;
                })()} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="colorTotalShared" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#33d6c0" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#33d6c0" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="annee" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 12 }} label={{ value: '(année)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }} height={50} />
                  <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} label={{ value: '(en milliers d\'euros)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11, dy: -20 }} />
                  <Tooltip content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', padding: '12px', color: '#fff' }}>
                          <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>Année {d.annee} : {formatCurrency(d.totalCumule)}</p>
                          {d.isRecuperationApport && <p style={{ color: '#F59E0B', marginBottom: '8px', fontWeight: 'bold' }}>🎯 Vous récupérez votre apport</p>}
                          {d.isDoubleApport && <p style={{ color: '#8B5CF6', fontWeight: 'bold' }}>🚀 Vous doublez votre apport</p>}
                        </div>
                      );
                    }
                    return null;
                  }} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />
                  <Area type="monotone" dataKey="totalCumule" stroke="#33d6c0" strokeWidth={3} fill="url(#colorTotalShared)" name="Richesse cumulée" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}