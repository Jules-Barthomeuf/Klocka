import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, X, ChevronLeft, ChevronRight, FileText, Play } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import moment from "moment";
import "moment/locale/fr";
moment.locale("fr");
import { motion } from "framer-motion";
import BailTabs from "./BailTabs";
import PlongeeCarte from "./PlongeeCarte";
import StreetViewRue from "./StreetViewRue";
import AssembleesGeneralesSection from "./AssembleesGeneralesSection";
import LocataireLiensSociaux from "./LocataireLiensSociaux";
import EnvironnementIndicateurs from "./EnvironnementIndicateurs";
import VilleSecteurIA, { AvisProjetIA, useAnalyseIA } from "./SecteurAnalyseIA";
import AllerPlusLoin from "./AllerPlusLoin";

// Primitives éditoriales partagées par les onglets (maquette "Page Projet Klocka")
function SectionLabel({ children, tone = "muted", className = "" }) {
  const color = tone === "teal" ? "text-[#7fd3c9]" : tone === "gold" ? "text-[#e0c9a0]" : tone === "red" ? "text-red-400" : "text-[#8b9391]";
  return <div className={`text-[10px] tracking-[0.2em] uppercase ${color} mb-3 ${className}`}>{children}</div>;
}

// Le chapô (`right`) passe sous le titre : titre → sous-titre → chapô → chiffres.
function TabHeader({ title, subtitle, left, right }) {
  return (
    <div className="mb-8 max-md:mb-5">
      <h2 className="font-cormorant text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5] mb-2">{title}</h2>
      {subtitle && <p className="text-[13.5px] leading-[1.7] text-[#8b9391] mb-0 max-w-[560px]">{subtitle}</p>}
      {left}
      {right && <div className="mt-5 max-md:mt-4 max-w-[880px]">{right}</div>}
    </div>
  );
}

function LeadText({ children }) {
  return <p className="text-[14px] max-md:text-[13px] leading-[1.75] text-[#d3d8d6] mb-0">{children}</p>;
}

function KpiStrip({ items, className = "" }) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap border-t border-[#edeae5]/[0.35] mb-10 max-md:mb-6 ${className}`}>
      {list.map((it, i) => (
        <div key={i} className={`flex-1 min-w-[150px] max-md:min-w-[46%] py-5 max-md:py-3.5 pr-5 ${i > 0 ? "md:border-l md:border-[#edeae5]/[0.12] md:pl-6" : ""}`}>
          <div className={`font-cormorant text-[26px] max-md:text-[20px] font-light ${it.accent || "text-[#edeae5]"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{it.value}</div>
          <div className="text-[12px] text-[#8b9391] mt-1">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

function KVRow({ label, value, accent }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm border-t border-[#edeae5]/[0.12]">
      <span className="text-[#8b9391] flex-shrink-0">{label}</span>
      <span className={`text-right ${accent || "text-[#edeae5]"}`}>{value}</span>
    </div>
  );
}

// Tableau éditorial : en-têtes lettrés, filets fins, chiffres alignés à droite
function DataTable({ label, head, rows, align }) {
  if (!rows || rows.length === 0) return null;
  const cellAlign = (i) => (align?.[i] === "left" || (!align && i === 0) ? "text-left" : "text-right");
  return (
    <div className="mt-10 max-md:mt-6">
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`text-[10px] tracking-[0.16em] uppercase text-[#8b9391] font-normal pb-3 whitespace-nowrap ${cellAlign(i)}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-[#edeae5]/[0.12]">
                {r.map((c, ci) => {
                  const isObj = c !== null && typeof c === "object" && !React.isValidElement(c);
                  return (
                    <td key={ci} className={`py-3.5 align-top ${cellAlign(ci)} ${isObj && c.accent ? c.accent : ci === 0 ? "text-[#edeae5]" : "text-[#d3d8d6]"}`}>
                      {isObj ? c.value : c}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptyTab({ text = "Aucune information dans cette partie" }) {
  return <p className="text-[#8b9391] text-sm border-t border-[#edeae5]/[0.12] pt-6 mb-0">{text}</p>;
}

function NotesBlock({ notes }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="mt-10 max-md:mt-6">
      <SectionLabel>Notes</SectionLabel>
      <div className="space-y-5">
        {notes.map((note, idx) => (
          <div key={idx} className="border-t border-[#edeae5]/[0.12] pt-4">
            {note.titre && <h4 className="text-[#edeae5] text-[15px] font-medium mb-1.5">{note.titre}</h4>}
            <p className="text-sm text-[#d3d8d6] leading-[1.8] whitespace-pre-wrap mb-0">{note.contenu}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Échelle A→G façon maquette : barres fines grises, classe active en teal
function GradeScale({ active, valueLabel }) {
  return (
    <div className="space-y-1.5">
      {["A", "B", "C", "D", "E", "F", "G"].map((g, idx) => {
        const isActive = active === g;
        return (
          <div key={g} className="flex items-center gap-3">
            <span className={`w-5 text-center flex-shrink-0 ${isActive ? "font-cormorant text-[17px] text-[#edeae5]" : "text-[12px] text-[#565b59]"}`}>{g}</span>
            <div className="h-[9px] flex-shrink-0" style={{ width: `${26 + idx * 10}%`, backgroundColor: isActive ? "#35a79b" : "#242726" }} />
            {isActive && valueLabel && <span className="text-[12px] text-[#7fd3c9] whitespace-nowrap">{valueLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Fourchette bas / médian / haut sur filet fin
function RangeScale({ bas, median, haut, unit = "€" }) {
  const b = bas || 0;
  const h = haut || (median ? median * 2 : 0);
  const m = median || 0;
  const range = h - b;
  const pos = range > 0 && m > 0 ? Math.max(0, Math.min(100, ((m - b) / range) * 100)) : 50;
  const fmtN = (v) => (v ? v.toLocaleString("fr-FR") : "—");
  return (
    <div>
      <div className="relative h-[3px] bg-[#242726]">
        {m > 0 && <div className="absolute w-[9px] h-[9px] rounded-full bg-[#7fd3c9]" style={{ left: `${pos}%`, top: "50%", transform: "translate(-50%, -50%)" }} />}
      </div>
      <div className="flex justify-between mt-2.5 text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="text-[#8b9391]">{fmtN(b)} {unit}</span>
        <span className="text-[#edeae5]">{fmtN(m)} {unit}</span>
        <span className="text-[#8b9391]">{fmtN(h)} {unit}</span>
      </div>
    </div>
  );
}

// Shared project display used by the client detail page and the public share page.
// `isAdmin` / `showAsClient` control admin-only bits; `isPublic` disables navigation to
// internal tools (simulator/comparator) for anonymous visitors.
export default function ProjetContent({ project, isAdmin = false, showAsClient = true, isPublic = false }) {
  const navigate = useNavigate();
  // Analyse IA (avis projet + chiffres ville/secteur), mutualisée en un appel.
  const { analyse, villeData, secteurData, loading: analyseLoading, error: analyseError, refresh: refreshAnalyse } = useAnalyseIA(project);
  const [selectedImage, setSelectedImage] = useState(null);
  const [plongee, setPlongee] = useState(false);
  const [streetView, setStreetView] = useState(false);
  const [ongletActif, setOngletActif] = useState("secteur");
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
    { name: 'Prix négocié', value: prixBienNegocie, fill: '#35a79b' },
    { name: "Droits enreg.", value: droitsEnregistrement, fill: '#7fd3c9' },
    { name: 'Honoraires', value: totalFraisKlocka, fill: '#e0c9a0' },
    { name: 'Frais divers', value: fraisDivers, fill: '#a8894f' }
  ];

  // Création de richesse annuelle : capital remboursé + cash-flow, année par année
  // (même lecture que le graphique du simulateur).
  const richesseRows = (() => {
    const rows = [];
    let capitalRestantTemp = montantEmprunt;
    let loyerCourantTemp = loyerAnnuel;
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
      rows.push({
        annee: `${annee}`,
        capital: Math.round(Math.abs(capitalRembourseTemp)),
        cashflow: Math.round(cashFlowAnnuelTemp),
      });
    }
    return rows;
  })();
  const richesseBrute = richesseRows.reduce((acc, r) => acc + r.capital + r.cashflow, 0);

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

  // Valeurs dérivées consommées par les onglets éditoriaux
  const fmtNum = (v) => (v || v === 0 ? Number(v).toLocaleString('fr-FR') : '—');
  const fmtPct = (v, digits = 2) => (v == null ? '—' : `${Number(v).toFixed(digits).replace('.', ',')} %`);
  const surfaceRef = project.sim_surface > 0 ? project.sim_surface : project.surface_m2 || 0;
  const loyerM2 = surfaceRef > 0 && loyerAnnuel > 0 ? Math.round(loyerAnnuel / surfaceRef) : project.loyer_m2_an || 0;
  const prixM2Revient = surfaceRef > 0 && prixRevientCalcule > 0 ? Math.round(prixRevientCalcule / surfaceRef) : 0;
  const valeurLocativeSecteur = project.marche_baux_moyenne || project.marche_offre_moyenne || 0;
  const ecartValeurLocative = valeurLocativeSecteur > 0 && loyerM2 > 0
    ? ((loyerM2 - valeurLocativeSecteur) / valeurLocativeSecteur) * 100
    : null;
  const marcheLead = ecartValeurLocative != null
    ? `Le loyer en place ressort à ${fmtNum(loyerM2)} €/m²/an, soit ${Math.abs(ecartValeurLocative).toFixed(0)} % ${ecartValeurLocative < 0 ? 'sous' : 'au-dessus de'} la valeur locative du secteur, estimée à ${fmtNum(valeurLocativeSecteur)} €/m²/an.`
    : project.marche_quartier_nom
      ? `Positionnement du deal sur le secteur ${project.marche_quartier_nom}.`
      : 'Comparables et fourchettes de valeurs relevés sur le secteur.';
  const anneesRestantesBail = project.echeance_bail && moment(project.echeance_bail).isValid()
    ? Math.max(0, moment(project.echeance_bail).diff(moment(), 'years', true))
    : null;
  const locataireLead = project.nom_locataire
    ? `${project.nom_locataire}${project.activite_locataire ? ` — ${project.activite_locataire}` : ''}${loyerAnnuel > 0 ? `, ${fmtNum(loyerAnnuel)} € HT HC de loyer annuel` : ''}${anneesRestantesBail != null ? `, bail courant sur ${anneesRestantesBail.toFixed(1).replace('.', ',')} an(s)` : ''}.`
    : 'Identité du preneur, économie du bail et garanties associées.';
  const bienLead = project.description_bien
    || [surfaceRef > 0 ? `${fmtNum(surfaceRef)} m² exploités` : null, loyerM2 > 0 ? `${fmtNum(loyerM2)} €/m²/an de loyer` : null].filter(Boolean).join(', ')
    || 'Surfaces, configuration et éléments marquants du lot.';
  const coproLead = [
    project.quote_part_lot > 0 ? `Quote-part du lot de ${project.quote_part_lot} %` : null,
    project.charges_copropriete > 0 ? `${fmtNum(project.charges_copropriete)} € de charges annuelles` : null,
    project.taxe_fonciere_an > 0 ? `${fmtNum(project.taxe_fonciere_an)} € de taxe foncière` : null,
  ].filter(Boolean).join(' · ') || "Règlement, charges et décisions d'assemblée générale.";
  const diagLead = project.dpe_note
    ? `DPE classe ${project.dpe_note}${project.dpe_consommation > 0 ? ` — ${fmtNum(project.dpe_consommation)} kWh/m²/an` : ''}${project.ges_note ? `, GES classe ${project.ges_note}` : ''}.`
    : 'Dossier de diagnostic technique du lot.';

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
      // `overflow-x-clip` et non `hidden` : `hidden` crée un conteneur de
      // défilement qui neutralise le `sticky` du rail d'analyse.
      className="projet-editorial min-h-screen bg-[#0a0c0c] text-[#edeae5] overflow-x-clip">

      {/* Image Lightbox */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-[#0a0c0c] border-none [&>button]:hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            <Button variant="ghost" size="icon" onClick={() => setSelectedImage(null)} className="absolute top-6 right-6 text-[#edeae5] hover:bg-[#edeae5]/20 z-10 w-14 h-14">
              <X className="w-8 h-8" />
            </Button>
            {project?.photos && project.photos.length > 1 && (
              <>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const prevIndex = (currentIndex - 1 + project.photos.length) % project.photos.length;
                  setSelectedImage(project.photos[prevIndex]);
                }} className="absolute left-6 top-1/2 -translate-y-1/2 bg-[#0a0c0c]/50 hover:bg-[#0a0c0c]/70 text-[#edeae5] rounded-full w-16 h-16 z-10">
                  <ChevronLeft className="w-10 h-10" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const nextIndex = (currentIndex + 1) % project.photos.length;
                  setSelectedImage(project.photos[nextIndex]);
                }} className="absolute right-6 top-1/2 -translate-y-1/2 bg-[#0a0c0c]/50 hover:bg-[#0a0c0c]/70 text-[#edeae5] rounded-full w-16 h-16 z-10">
                  <ChevronRight className="w-10 h-10" />
                </Button>
              </>
            )}
            {selectedImage && <img src={selectedImage} alt="Photo agrandie" className="max-w-[95vw] max-h-[95vh] object-contain" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hero pleine largeur */}
      <div className="relative w-full h-[560px] max-md:h-[440px] overflow-hidden">
        {streetView ? (
          <StreetViewRue project={project} />
        ) : plongee ? (
          <PlongeeCarte project={project} onClose={() => setPlongee(false)} />
        ) : project.photos && project.photos.length > 0 ? (
          <img src={project.photos[0]} alt={project.titre} onClick={() => setSelectedImage(project.photos[0])}
            className="absolute inset-0 w-full h-full object-cover cursor-pointer" />
        ) : mapUrl ? (
          <iframe src={mapUrl} className="absolute inset-0 w-full h-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte du projet" />
        ) : (
          <div className="absolute inset-0 bg-[#0e100f]" />
        )}
        {/* En Street View, ni voile ni habillage : le panorama se manipule. */}
        {!streetView && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(10,12,12,0.96) 8%, rgba(10,12,12,0.45) 55%, rgba(10,12,12,0.7) 100%)' }} />
        )}

        {/* Bouton play au centre : lance la vidéo du secteur (plongée 3D). */}
        {!plongee && !streetView && (project.adresse_complete || (project.latitude && project.longitude)) && (
          <button
            onClick={(e) => { e.stopPropagation(); setPlongee(true); }}
            title="Voir la vidéo du secteur"
            className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-[#0a0c0c]/55 border border-[#edeae5]/40 backdrop-blur-sm flex items-center justify-center text-[#edeae5] hover:border-[#35a79b] hover:text-[#7fd3c9] hover:scale-105 transition-all"
          >
            <Play className="w-6 h-6 ml-1 fill-current" />
          </button>
        )}

        <div className="absolute top-7 left-5 right-5 md:left-14 md:right-14 flex justify-end items-center gap-3">
          <div className="flex gap-2 flex-wrap justify-end items-center">
            {/* Fermeture de la vidéo du secteur (le lancement, lui, se fait
                par le bouton play au centre de l'image). */}
            {plongee && !streetView && (
              <button onClick={() => setPlongee(false)}
                className="font-cormorant text-[13.5px] px-3.5 py-1.5 rounded bg-[#0a0c0c]/50 border border-[#edeae5]/[0.28] text-[#edeae5] hover:border-[#edeae5] transition-colors">
                Arrêter la vidéo
              </button>
            )}
            {/* Street View : se déplacer dans la rue autour du local. */}
            {mapsKey && (project.adresse_complete || (project.latitude && project.longitude)) && (
              <button
                onClick={() => { setStreetView((v) => !v); setPlongee(false); }}
                className="font-cormorant text-[13.5px] px-3.5 py-1.5 rounded bg-[#0a0c0c]/50 border border-[#edeae5]/[0.28] text-[#edeae5] hover:border-[#edeae5] transition-colors"
              >
                {streetView ? "Fermer Street View" : "Street View"}
              </button>
            )}
            {/* Galerie : miniature empilée quand le dossier a plusieurs photos ;
                le clic ouvre la visionneuse (flèches pour naviguer). */}
            {project.photos && project.photos.length > 1 && (
              <button onClick={() => setSelectedImage(project.photos[0])}
                title={`Voir les ${project.photos.length} photos`}
                className="relative group mr-1">
                <span className="absolute -top-1 -right-1 w-full h-full border border-[#edeae5]/[0.28] bg-[#0a0c0c]/50" aria-hidden="true" />
                <img src={project.photos[1]} alt="Galerie du projet"
                  className="relative h-9 w-14 object-cover border border-[#edeae5]/[0.28] group-hover:border-[#edeae5] transition-colors" />
                <span className="absolute inset-0 flex items-center justify-center bg-[#0a0c0c]/45 text-[11px] tracking-[0.08em] text-[#edeae5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  +{project.photos.length - 1}
                </span>
              </button>
            )}
            {project.documents && project.documents.length > 0 && (
              <button onClick={() => window.open(project.documents[0], '_blank')}
                className="font-cormorant text-[13.5px] px-3.5 py-1.5 rounded bg-[#0a0c0c]/50 border border-[#edeae5]/[0.28] text-[#edeae5] hover:border-[#edeae5] transition-colors max-md:hidden">
                Documents ({project.documents.length})
              </button>
            )}
          </div>
        </div>

        {/* Habillage masqué en Street View pour laisser le panorama réactif. */}
        <div className={`absolute bottom-9 md:bottom-11 left-5 right-5 md:left-14 md:right-14 grid md:grid-cols-[minmax(0,1fr)_300px] gap-6 md:gap-12 items-end ${streetView ? "hidden" : ""}`}>
          <div>
            <h1 className="font-cormorant text-[34px] md:text-[48px] font-light tracking-[-0.03em] leading-[1.02] text-[#edeae5] mb-0">{project.titre}</h1>
            <div className="md:hidden mt-5">
              <div className="flex gap-8" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div>
                  <div className="text-[22px] font-light text-[#edeae5] leading-tight">{formatCurrency(prixRevientCalcule)}</div>
                  <div className="text-[10px] tracking-[0.16em] uppercase text-[#8b9391] mt-1">Prix de revient</div>
                </div>
                {rendementLocatifNetCalcule > 0 && (
                  <div>
                    <div className="text-[22px] font-light text-[#7fd3c9] leading-tight">{rendementLocatifNetCalcule.toFixed(2).replace('.', ',')} %</div>
                    <div className="text-[10px] tracking-[0.16em] uppercase text-[#8b9391] mt-1">Rendement net</div>
                  </div>
                )}
              </div>
              <button onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
                className="mt-4 inline-flex items-center gap-2 text-[11px] tracking-[0.16em] uppercase text-[#7fd3c9] hover:text-[#edeae5] transition-colors">
                Simulateur complet <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="max-md:hidden text-right">
            <div className="flex justify-end gap-10" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div>
                <div className="text-[30px] font-light text-[#edeae5] leading-tight">{formatCurrency(prixRevientCalcule)}</div>
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b9391] mt-1.5">Prix de revient</div>
              </div>
              <div>
                <div className="text-[30px] font-light text-[#7fd3c9] leading-tight">{rendementLocatifNetCalcule > 0 ? `${rendementLocatifNetCalcule.toFixed(2).replace('.', ',')} %` : '—'}</div>
                <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b9391] mt-1.5">Rendement net</div>
              </div>
            </div>
            <button onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
              className="mt-5 inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-[#7fd3c9] hover:text-[#edeae5] transition-colors">
              Simulateur complet <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>

      {project.photos && project.photos.length > 1 && (
        <div ref={photosContainerRef} className="flex gap-2 overflow-x-auto px-5 md:px-14 py-3 bg-[#0a0c0c] border-b border-[#edeae5]/[0.08]" style={{ scrollbarWidth: 'none' }}>
          {project.photos.slice(1).map((photo, idx) => (
            <img key={idx} src={photo} alt={`Photo ${idx + 2}`} onClick={() => setSelectedImage(photo)}
              className="h-20 w-32 object-cover flex-shrink-0 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" />
          ))}
        </div>
      )}

      {/* Pas de `items-start` ici : la colonne de droite doit s'étirer sur toute
          la hauteur de la ligne, sinon le rail `sticky` n'a aucune course et
          reste figé en haut de page. */}
      <div className="max-w-[1400px] mx-auto px-3 md:px-6 py-4 md:py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <div className="min-w-0">
        {/* Sur mobile l'analyse revient en tête de page, faute de colonne */}
        <div className="lg:hidden">
          <AvisProjetIA analyse={analyse} loading={analyseLoading} error={analyseError} section={ongletActif} />
        </div>
        <Tabs value={ongletActif} onValueChange={setOngletActif} className="w-full">
          <TabsList className="w-full flex justify-start flex-wrap max-md:flex-nowrap gap-x-7 gap-y-2 max-md:gap-x-5 bg-transparent border-0 mb-10 max-md:mb-6 rounded-none px-0 h-auto pt-1 pb-6 max-md:pb-4 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
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
              <TabsTrigger key={v} value={v} className="text-[11px] max-md:text-[10.5px] tracking-[0.16em] uppercase px-0 py-1 h-auto rounded-none whitespace-nowrap bg-transparent border-0 border-b border-transparent text-[#8b9391] hover:text-[#edeae5] data-[state=active]:bg-transparent data-[state=active]:border-[#35a79b] data-[state=active]:text-[#edeae5] data-[state=active]:shadow-none transition-colors duration-200">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="secteur" className="space-y-6 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="mb-8 max-md:mb-5">
                <h2 className="font-cormorant text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5] mb-2">Secteur</h2>
                <p className="text-[13.5px] leading-[1.7] text-[#8b9391] mb-0 max-w-[560px]">Du macro au micro : la ville, le quartier, puis l'emplacement.</p>
                {(project.ville_secteur_champ1 || project.ville_secteur_champ2 || project.ville_secteur_champ3) && (
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {project.ville_secteur_champ1 && <span className="text-[12px] px-3.5 py-1 rounded-full bg-[#35a79b]/[0.16] border border-[#35a79b] text-[#7fd3c9]">{project.ville_secteur_champ1}</span>}
                    {project.ville_secteur_champ2 && <span className="text-[12px] px-3.5 py-1 rounded-full border border-[#7fd3c9]/40 text-[#7fd3c9]">{project.ville_secteur_champ2}</span>}
                    {project.ville_secteur_champ3 && <span className="text-[12px] px-3.5 py-1 rounded-full border border-[#edeae5]/[0.18] text-[#d3d8d6]">{project.ville_secteur_champ3}</span>}
                  </div>
                )}
                <div className="mt-6 max-md:mt-5">
                  <VilleSecteurIA
                    analyse={analyse}
                    villeData={villeData}
                    secteurData={secteurData}
                    loading={analyseLoading}
                    error={analyseError}
                    refresh={refreshAnalyse}
                    project={project}
                    isPublic={isPublic}
                  />
                </div>
              </div>

              {mapUrl && (
                <div className="mb-10 max-md:mb-6">
                  <SectionLabel tone="teal">Localisation</SectionLabel>
                  <div className="relative h-[420px] max-md:h-[260px] overflow-hidden bg-[#0e100f]">
                    <iframe src={mapUrl} className="w-full h-full" style={{ border: 0, filter: 'saturate(0.85) contrast(1.04)' }} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte du secteur" />
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-[#edeae5]/[0.13]" />
                    <div className="max-md:hidden absolute left-6 bottom-6 max-w-[340px] bg-[#0a0c0c]/[0.86] backdrop-blur-sm px-5 py-4">
                      {project.adresse_complete && (
                        <>
                          <div className="text-[10px] tracking-[0.18em] uppercase text-[#8b9391]">Adresse</div>
                          <div className="text-[14px] leading-[1.6] text-[#edeae5] mt-1">{project.adresse_complete}</div>
                        </>
                      )}
                      {project.surface_m2 > 0 && (
                        <div className="text-[13px] text-[#d3d8d6] mt-2.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{project.surface_m2} m² exploités</div>
                      )}
                      {googleMapsLink && (
                        <a href={googleMapsLink} target="_blank" rel="noopener noreferrer"
                          className="pointer-events-auto inline-flex items-center gap-2 mt-4 text-[10px] tracking-[0.18em] uppercase text-[#7fd3c9] hover:text-[#edeae5] transition-colors">
                          Ouvrir dans Google Maps <span aria-hidden="true">→</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="md:hidden">
                    <KVRow label="Adresse" value={project.adresse_complete} />
                    <KVRow label="Surface" value={project.surface_m2 > 0 ? `${project.surface_m2} m²` : null} />
                    {googleMapsLink && (
                      <KVRow label="Carte" value={<a href={googleMapsLink} target="_blank" rel="noopener noreferrer" className="text-[#7fd3c9]">Ouvrir dans Google Maps</a>} />
                    )}
                  </div>
                </div>
              )}
              <EnvironnementIndicateurs project={project} />
              <NotesBlock notes={project.notes_secteur} />
              <AllerPlusLoin section="secteur" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="marche">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Marché"
                subtitle={`Comparables du secteur et positionnement du deal.${project.marche_quartier_nom ? ` Secteur : ${project.marche_quartier_nom}.` : ''}`}
                right={<LeadText>{marcheLead}</LeadText>}
              />

              <KpiStrip items={[
                loyerM2 > 0 && { value: `${fmtNum(loyerM2)} €`, label: 'Loyer en place /m²/an' },
                valeurLocativeSecteur > 0 && { value: `${fmtNum(valeurLocativeSecteur)} €`, label: 'Valeur locative secteur', accent: 'text-[#7fd3c9]' },
                prixM2Revient > 0 && { value: `${fmtNum(prixM2Revient)} €`, label: 'Prix de revient /m²' },
                project.marche_prix_m2_median > 0 && { value: `${fmtNum(project.marche_prix_m2_median)} €`, label: 'Prix médian résidentiel /m²' },
                ecartValeurLocative != null && {
                  value: `${ecartValeurLocative > 0 ? '+' : ''}${ecartValeurLocative.toFixed(0)} %`,
                  label: 'Écart à la valeur locative',
                  accent: ecartValeurLocative < 0 ? 'text-[#e0c9a0]' : 'text-[#7fd3c9]',
                },
              ]} />

              {(project.marche_prix_m2_median > 0 || project.marche_offre_moyenne > 0 || project.marche_baux_moyenne > 0) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-9 mb-10 max-md:mb-6">
                  {!project.marche_masquer_residentiel && project.marche_prix_m2_median > 0 && (
                    <div>
                      <SectionLabel tone="teal">Résidentiel — prix au m²</SectionLabel>
                      <RangeScale bas={project.marche_prix_m2_bas} median={project.marche_prix_m2_median} haut={project.marche_prix_m2_haut} />
                    </div>
                  )}
                  {!project.marche_masquer_commercial && project.marche_offre_moyenne > 0 && (
                    <div>
                      <SectionLabel tone="teal">Commercial — valeur locative (offre)</SectionLabel>
                      <RangeScale bas={project.marche_offre_bas} median={project.marche_offre_moyenne} haut={project.marche_offre_haut} unit="€/m²" />
                    </div>
                  )}
                  {!project.marche_masquer_commercial && project.marche_baux_moyenne > 0 && (
                    <div>
                      <SectionLabel tone="teal">Commercial — baux existants</SectionLabel>
                      <RangeScale bas={project.marche_baux_bas} median={project.marche_baux_moyenne} haut={project.marche_baux_haut} unit="€/m²" />
                    </div>
                  )}
                  {(project.marche_evolution_1an || project.marche_evolution_5ans) && (
                    <div>
                      <SectionLabel>Évolution des prix</SectionLabel>
                      <KVRow label="Sur 1 an" value={project.marche_evolution_1an != null && project.marche_evolution_1an !== 0 ? `${project.marche_evolution_1an > 0 ? '+' : ''}${project.marche_evolution_1an} %` : null}
                        accent={project.marche_evolution_1an >= 0 ? 'text-[#7fd3c9]' : 'text-red-400'} />
                      <KVRow label="Sur 5 ans" value={project.marche_evolution_5ans != null && project.marche_evolution_5ans !== 0 ? `${project.marche_evolution_5ans > 0 ? '+' : ''}${project.marche_evolution_5ans} %` : null}
                        accent={project.marche_evolution_5ans >= 0 ? 'text-[#7fd3c9]' : 'text-red-400'} />
                    </div>
                  )}
                </div>
              )}

              {!project.marche_masquer_secteurs && (
                <DataTable
                  label="Comparables du secteur"
                  head={['Secteur', 'Estimation basse', 'Estimation haute']}
                  rows={(project.marche_secteurs || []).map((s, idx) => [
                    s.nom || `Secteur ${idx + 1}`,
                    s.estimation_basse ? `${fmtNum(s.estimation_basse)} €/m²` : '—',
                    { value: s.estimation_haute ? `${fmtNum(s.estimation_haute)} €/m²` : '—', accent: 'text-[#edeae5]' },
                  ])}
                />
              )}

              <NotesBlock notes={project.notes_marche} />

              {!project.marche_prix_m2_median && !project.marche_offre_moyenne && !project.marche_baux_moyenne
                && (!project.marche_secteurs || project.marche_secteurs.length === 0)
                && (!project.notes_marche || project.notes_marche.length === 0) && <EmptyTab />}
              <AllerPlusLoin section="marche" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bien">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Bien"
                subtitle="Le physique : surfaces, configuration et éléments marquants du lot."
                left={(project.bien_champ1 || project.bien_champ2 || project.bien_champ3) && (
                  <div className="flex gap-2 mt-5 flex-wrap">
                    {project.bien_champ1 && <span className="text-[12px] px-3.5 py-1 rounded-full bg-[#35a79b]/[0.16] border border-[#35a79b] text-[#7fd3c9]">{project.bien_champ1}</span>}
                    {project.bien_champ2 && <span className="text-[12px] px-3.5 py-1 rounded-full border border-[#7fd3c9]/40 text-[#7fd3c9]">{project.bien_champ2}</span>}
                    {project.bien_champ3 && <span className="text-[12px] px-3.5 py-1 rounded-full border border-[#edeae5]/[0.18] text-[#d3d8d6]">{project.bien_champ3}</span>}
                  </div>
                )}
                right={<LeadText>{bienLead}</LeadText>}
              />

              <KpiStrip items={[
                surfaceRef > 0 && { value: `${fmtNum(surfaceRef)} m²`, label: 'Surface exploitée' },
                loyerM2 > 0 && { value: `${fmtNum(loyerM2)} €`, label: 'Loyer /m²/an', accent: 'text-[#7fd3c9]' },
                loyerAnnuel > 0 && { value: `${fmtNum(loyerAnnuel)} €`, label: 'Loyer annuel HT/HC' },
                prixM2Revient > 0 && { value: `${fmtNum(prixM2Revient)} €`, label: 'Prix de revient /m²' },
                project.type_construction && { value: project.type_construction, label: 'Type de construction' },
              ]} />

              <div className="grid md:grid-cols-2 gap-x-12 gap-y-9">
                <div>
                  <SectionLabel tone="teal">Configuration</SectionLabel>
                  <KVRow label="Surface" value={surfaceRef > 0 ? `${fmtNum(surfaceRef)} m²` : null} />
                  <KVRow label="Activité exploitée" value={project.activite_locataire} />
                  <KVRow label="Type de construction" value={project.type_construction} />
                  <KVRow label="Adresse" value={project.adresse_complete} />
                </div>
                <div>
                  <SectionLabel tone="teal">Exploitation</SectionLabel>
                  <KVRow label="Loyer annuel HT/HC" value={loyerAnnuel > 0 ? `${fmtNum(loyerAnnuel)} €` : null} />
                  <KVRow label="Loyer au m²" value={loyerM2 > 0 ? `${fmtNum(loyerM2)} €/m²/an` : null} accent="text-[#7fd3c9]" />
                  <KVRow label="Échéance du bail" value={project.echeance_bail ? moment(project.echeance_bail).format('DD MMMM YYYY') : null} />
                  <KVRow label="DPE" value={project.dpe_note ? `Classe ${project.dpe_note}` : null} />
                </div>
              </div>

              {project.description_bien && (
                <div className="mt-10 max-md:mt-6">
                  <SectionLabel>Description</SectionLabel>
                  <p className="md:columns-2 md:gap-10 text-[14.5px] leading-[1.8] text-[#d3d8d6] text-justify whitespace-pre-wrap mb-0">{project.description_bien}</p>
                </div>
              )}

              <NotesBlock notes={project.notes_bien} />

              {!project.description_bien && !project.bien_champ1 && !project.bien_champ2 && !project.bien_champ3
                && surfaceRef <= 0 && (!project.notes_bien || project.notes_bien.length === 0) && <EmptyTab />}
              <AllerPlusLoin section="bien" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="locataire">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Locataire"
                subtitle="La solidité de la signature : identité, ancienneté, comptes, garanties."
                right={<LeadText>{locataireLead}</LeadText>}
              />

              <KpiStrip items={[
                loyerAnnuel > 0 && { value: `${fmtNum(loyerAnnuel)} €`, label: 'Loyer annuel HT/HC' },
                loyerM2 > 0 && { value: `${fmtNum(loyerM2)} €`, label: 'Loyer /m²/an', accent: 'text-[#7fd3c9]' },
                anneesRestantesBail != null && { value: `${anneesRestantesBail.toFixed(1).replace('.', ',')} ans`, label: 'Bail restant à courir' },
                project.echeance_bail && { value: moment(project.echeance_bail).format('MM/YYYY'), label: 'Échéance du bail' },
              ]} />

              <div className="grid md:grid-cols-2 gap-x-12 gap-y-9">
                <div>
                  <SectionLabel tone="teal">Identité</SectionLabel>
                  <KVRow label="Raison sociale" value={project.nom_locataire} />
                  <KVRow label="Activité" value={project.activite_locataire} />
                  <KVRow label="Adresse d'exploitation" value={project.adresse_complete} />
                </div>
                <div>
                  <SectionLabel tone="teal">Économie de la signature</SectionLabel>
                  <KVRow label="Loyer annuel HT/HC" value={loyerAnnuel > 0 ? `${fmtNum(loyerAnnuel)} €` : null} />
                  <KVRow label="Loyer au m²" value={loyerM2 > 0 ? `${fmtNum(loyerM2)} €/m²/an` : null} accent="text-[#7fd3c9]" />
                  <KVRow label="Échéance du bail" value={project.echeance_bail ? moment(project.echeance_bail).format('DD MMMM YYYY') : null} />
                  <KVRow label="Dépôt de garantie" value={project.bail_depot_garantie > 0 ? `${fmtNum(project.bail_depot_garantie)} €` : null} />
                </div>
              </div>

              <div className="mt-8 max-md:mt-5">
                <LocataireLiensSociaux liens={project.liens_locataire} />
              </div>

              {project.bilans_locataire && project.bilans_locataire.length > 0 && (
                <DataTable
                  label="Santé financière — comptes déposés"
                  head={['Exercice', 'Document', '']}
                  align={['left', 'left', 'right']}
                  rows={[...project.bilans_locataire].sort((a, b) => (b.annee || '').localeCompare(a.annee || '')).map((bilan) => [
                    bilan.annee || '—',
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-[#d3d8d6] hover:text-[#7fd3c9] transition-colors">{bilan.nom}</a> },
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-[#7fd3c9] text-[13px] hover:text-[#edeae5] transition-colors">Télécharger</a> },
                  ])}
                />
              )}

              <NotesBlock notes={project.notes_locataire} />

              {!project.nom_locataire && !project.activite_locataire && loyerAnnuel <= 0 && !project.echeance_bail
                && (!project.notes_locataire || project.notes_locataire.length === 0) && <EmptyTab />}
              <AllerPlusLoin section="locataire" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bail">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Analyse du bail"
                subtitle="Économie du bail, calendrier et clauses sensibles."
                right={<LeadText>{project.bail_type || 'Bail commercial'}{project.echeance_bail ? ` — échéance au ${moment(project.echeance_bail).format('DD MMMM YYYY')}` : ''}{loyerAnnuel > 0 ? `, ${fmtNum(loyerAnnuel)} € HT/HC de loyer annuel.` : '.'}</LeadText>}
              />

              {(project.bail_date_debut || project.echeance_bail || project.bail_date_echeance) && (
                <div className="mb-10 max-md:mb-6">
                  <SectionLabel>Calendrier</SectionLabel>
                  <div className="relative h-[3px] bg-[#242726] mt-6">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#35a79b]" />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-[#35a79b] bg-[#0a0c0c]" />
                  </div>
                  <div className="flex justify-between mt-3 text-[13px]">
                    <div>
                      <div className="text-[#7fd3c9]">{project.bail_date_debut ? moment(project.bail_date_debut).format('MM/YYYY') : '—'}</div>
                      <div className="text-[12px] text-[#8b9391]">Prise d'effet</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[#7fd3c9]">{(project.bail_date_echeance || project.echeance_bail) ? moment(project.bail_date_echeance || project.echeance_bail).format('MM/YYYY') : '—'}</div>
                      <div className="text-[12px] text-[#8b9391]">Échéance</div>
                    </div>
                  </div>
                </div>
              )}

              <BailTabs project={project} />
              <AllerPlusLoin section="bail" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="copropriete">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Copropriété"
                subtitle="Charges, quote-part du lot et décisions d'assemblée générale."
                right={<LeadText>{coproLead}</LeadText>}
              />

              <KpiStrip items={[
                project.quote_part_lot > 0 && { value: `${project.quote_part_lot} %`, label: 'Quote-part du lot' },
                project.charges_copropriete > 0 && { value: `${fmtNum(project.charges_copropriete)} €`, label: 'Charges annuelles' },
                project.provision_charges > 0 && { value: `${fmtNum(project.provision_charges)} €`, label: 'Provision pour charges' },
                project.taxe_fonciere_an > 0 && { value: `${fmtNum(project.taxe_fonciere_an)} €`, label: 'Taxe foncière /an', accent: 'text-[#e0c9a0]' },
                project.type_construction && { value: project.type_construction, label: 'Type de construction' },
              ]} />

              {(project.activites_autorisees || project.activites_interdites) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 mb-10 max-md:mb-6">
                  {project.activites_autorisees && (
                    <div className="border-l border-[#35a79b] pl-5">
                      <SectionLabel tone="teal">Activités autorisées</SectionLabel>
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_autorisees.split(',').map((a, idx) => (
                          <li key={idx} className="text-[14.5px] text-[#d3d8d6]">{a.trim()}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {project.activites_interdites && (
                    <div className="border-l border-[#e0c9a0] pl-5">
                      <SectionLabel tone="gold">Activités interdites</SectionLabel>
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_interdites.split(',').map((a, idx) => (
                          <li key={idx} className="text-[14.5px] text-[#d3d8d6]">{a.trim()}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {project.synthese_assemblee_generale && project.synthese_assemblee_generale.trim() && (
                <div className="mb-10 max-md:mb-6">
                  <SectionLabel>Synthèse de l'assemblée générale</SectionLabel>
                  <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] text-justify whitespace-pre-wrap mb-0">{project.synthese_assemblee_generale}</p>
                </div>
              )}

              {(project.resolutions_votees || project.resolutions_refusees) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 mb-10 max-md:mb-6">
                  {project.resolutions_votees && (
                    <div className="border-l border-[#35a79b] pl-5">
                      <SectionLabel tone="teal">Résolutions votées</SectionLabel>
                      <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] whitespace-pre-wrap mb-0">{project.resolutions_votees}</p>
                    </div>
                  )}
                  {project.resolutions_refusees && (
                    <div className="border-l border-[#e0c9a0] pl-5">
                      <SectionLabel tone="gold">Résolutions non acceptées</SectionLabel>
                      <p className="text-[14.5px] leading-[1.8] text-[#d3d8d6] whitespace-pre-wrap mb-0">{project.resolutions_refusees}</p>
                    </div>
                  )}
                </div>
              )}

              <AssembleesGeneralesSection project={project} isAdmin={isAdmin && !showAsClient} showAsClient={showAsClient} />
              <NotesBlock notes={project.notes_libres} />

              {project.charges_copropriete <= 0 && !project.type_construction && project.taxe_fonciere_an <= 0
                && project.provision_charges <= 0 && project.quote_part_lot <= 0
                && !project.activites_autorisees && !project.activites_interdites
                && !project.synthese_assemblee_generale && <EmptyTab />}
              <AllerPlusLoin section="copropriete" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="diagnostique">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Diagnostique"
                subtitle="Performance énergétique et émissions du lot."
                right={<LeadText>{diagLead}</LeadText>}
              />

              {(project.dpe_note || project.ges_note) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-10 mb-10 max-md:mb-6">
                  {project.dpe_note && (
                    <div>
                      <SectionLabel tone="teal">Diagnostic de performance énergétique</SectionLabel>
                      <GradeScale active={project.dpe_note} valueLabel={project.dpe_consommation > 0 ? `${fmtNum(project.dpe_consommation)} kWh/m²/an` : null} />
                    </div>
                  )}
                  {project.ges_note && (
                    <div>
                      <SectionLabel tone="teal">Émissions de gaz à effet de serre</SectionLabel>
                      <GradeScale active={project.ges_note} valueLabel={project.ges_emission > 0 ? `${fmtNum(project.ges_emission)} kg CO₂/m²/an` : null} />
                    </div>
                  )}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-x-12">
                <div>
                  <KVRow label="Classe énergie" value={project.dpe_note ? `Classe ${project.dpe_note}` : null} accent="text-[#7fd3c9]" />
                  <KVRow label="Consommation" value={project.dpe_consommation > 0 ? `${fmtNum(project.dpe_consommation)} kWh/m²/an` : null} />
                </div>
                <div>
                  <KVRow label="Classe GES" value={project.ges_note ? `Classe ${project.ges_note}` : null} accent="text-[#7fd3c9]" />
                  <KVRow label="Émissions" value={project.ges_emission > 0 ? `${fmtNum(project.ges_emission)} kg CO₂/m²/an` : null} />
                </div>
              </div>

              <NotesBlock notes={project.notes_diagnostique} />

              {!project.dpe_note && !project.ges_note && (!project.notes_diagnostique || project.notes_diagnostique.length === 0) && (
                <EmptyTab text="Aucune donnée de diagnostic disponible pour ce projet." />
              )}
              <AllerPlusLoin section="diagnostique" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="documents_projet">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Documents"
                subtitle="Pièces du dossier mises à disposition."
                right={<LeadText>{project.fichiers_projet && project.fichiers_projet.length > 0
                  ? `${project.fichiers_projet.length} document${project.fichiers_projet.length > 1 ? 's' : ''} disponible${project.fichiers_projet.length > 1 ? 's' : ''} au téléchargement.`
                  : 'Aucun document disponible pour ce projet.'}</LeadText>}
              />

              {project.fichiers_projet && project.fichiers_projet.length > 0 ? (
                <div className="border-t border-[#edeae5]/[0.35]">
                  {project.fichiers_projet.map((fichier, idx) => (
                    <a key={idx} href={fichier.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 py-4 border-b border-[#edeae5]/[0.12] group">
                      <div className="flex items-center gap-4 min-w-0">
                        <FileText className="w-4 h-4 text-[#35a79b] flex-shrink-0" />
                        <span className="text-[14.5px] text-[#edeae5] truncate group-hover:text-[#7fd3c9] transition-colors">{fichier.nom}</span>
                      </div>
                      <span className="flex items-center gap-2 text-[12px] text-[#8b9391] group-hover:text-[#7fd3c9] transition-colors flex-shrink-0">
                        Télécharger <Download className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyTab text="Aucun document disponible pour ce projet." />
              )}
              <AllerPlusLoin section="documents_projet" project={project} />
            </motion.div>
          </TabsContent>
        </Tabs>

        {/* Synthèse financière */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="mt-12 max-md:mt-6 pt-10 max-md:pt-6">
          <TabHeader
            title="Synthèse financière"
            subtitle="Budget d'acquisition, indicateurs clés et création de richesse."
          />
          <div className="grid lg:grid-cols-2 gap-6 max-md:grid-cols-1 max-md:gap-4 mb-8 max-md:mb-4">
            <div className="border-t border-[#edeae5]/[0.35] pt-7 max-md:pt-5">
              <SectionLabel tone="teal">Budget total</SectionLabel>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-md:gap-4 max-w-full">
                <div className="relative flex items-center justify-center w-full order-2 md:order-1">
                  <ResponsiveContainer width="100%" height={200} className="max-w-full">
                    <PieChart>
                      <Pie data={prixBienNegocie > 0 ? pieDataBudget : [{ name: 'Prix de revient', value: prixRevientCalcule, fill: '#35a79b' }]} cx="50%" cy="50%" innerRadius={70} outerRadius={85} paddingAngle={2} dataKey="value" stroke="none">
                        {(prixBienNegocie > 0 ? pieDataBudget : [{ name: 'Prix de revient', value: prixRevientCalcule, fill: '#35a79b' }]).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} wrapperStyle={{ zIndex: 100 }} contentStyle={{ backgroundColor: '#121413', border: '1px solid #303332', borderRadius: '8px', color: '#fff' }} labelStyle={{ color: '#fff' }} position={{ y: -20 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xl text-[#edeae5]">{formatCurrency(prixRevientCalcule)}</p>
                      <p className="text-xs text-[#edeae5]">Prix de revient</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3 min-w-0 flex-shrink order-1 md:order-2">
                  {prixBienNegocie > 0 ? (
                    <>
                      <div><p className="text-xs text-[#edeae5]/30">Prix du bien négocié FAI</p><p className="text-lg text-[#edeae5]">{formatCurrency(prixBienNegocie)}</p></div>
                      <div><p className="text-xs text-[#edeae5]/30">Droits d'enregistrement estimés</p><p className="text-lg text-[#edeae5]">{formatCurrency(droitsEnregistrement)}</p></div>
                      <div><p className="text-xs text-[#edeae5]/30">Honoraires Klocka</p><p className="text-lg text-[#e0c9a0]">{formatCurrency(totalFraisKlocka)}</p></div>
                      <div><p className="text-xs text-[#edeae5]/30">Frais divers à l'acquisition</p><p className="text-lg text-[#e0c9a0]">{formatCurrency(fraisDivers)}</p></div>
                    </>
                  ) : (
                    <>
                      <div><p className="text-xs text-[#edeae5]/30">Prix de revient</p><p className="text-lg text-[#edeae5]">{formatCurrency(prixRevientCalcule)}</p></div>
                      <div><p className="text-xs text-[#edeae5]/30">Loyer annuel HT</p><p className="text-lg text-[#edeae5]">{formatCurrency(loyerAnnuel)}</p></div>
                      <div><p className="text-xs text-[#edeae5]/30">Apport estimé</p><p className="text-lg text-[#edeae5]">{formatCurrency(apport)}</p></div>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
                className="w-full mt-7 py-2.5 text-[11px] tracking-[0.16em] uppercase bg-transparent border border-[#35a79b] text-[#7fd3c9] hover:bg-[#35a79b]/[0.16] transition-colors">
                Simulateur complet
              </button>
            </div>

            <div className="border-t border-[#edeae5]/[0.35] pt-7 max-md:pt-5">
              <SectionLabel tone="teal">Indicateurs clés</SectionLabel>
              <KVRow label="Rendement locatif net" value={fmtPct(rendementLocatifNetCalcule)} accent="text-[#7fd3c9]" />
              <KVRow label="Apport initial" value={formatCurrency(apport)} />
              <KVRow label="Récupération de l'apport" value={anneeRecuperationApport ? `Année ${anneeRecuperationApport}` : '—'} accent="text-[#e0c9a0]" />
              <KVRow label="Loyer moyen net" value={`${formatCurrency(loyerMoyenNet)} /an`} />
              <KVRow label="Échéance mensuelle de crédit" value={echeanceMensuelle > 0 ? `${formatCurrency(echeanceMensuelle)} /mois` : null} />
              <KVRow label="Cash-flow cumulé" value={cashFlowCumule ? formatCurrency(cashFlowCumule) : null} accent={cashFlowCumule >= 0 ? 'text-[#7fd3c9]' : 'text-red-400'} />
            </div>
          </div>
        </motion.div>

        {/* Création de richesse annuelle — même graphique que le simulateur */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} className="mt-8 max-md:mt-6">
          <div className="border-t border-[#edeae5]/[0.35] pt-7 max-md:pt-5">
            <div className="flex items-start justify-between gap-6 mb-6 max-md:mb-4">
              <div>
                <SectionLabel tone="teal" className="mb-1.5">Création de richesse annuelle</SectionLabel>
                <p className="text-[13px] text-[#8b9391] mb-0">Cash-flow + capital remboursé sur {Math.min(anneeRevente, 20)} ans</p>
              </div>
              <p className="text-[26px] max-md:text-[20px] font-light text-[#e0c9a0] mb-0 whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(richesseBrute)}</p>
            </div>
            <div className="h-[26rem] max-md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={richesseRows} margin={{ top: 12, right: 20, left: 20, bottom: 40 }} barGap={4} barCategoryGap="20%">
                  <CartesianGrid stroke="#edeae5" strokeOpacity={0.08} strokeDasharray="3 3" />
                  <XAxis dataKey="annee" tick={{ fill: '#8b9391', fontSize: 10 }} axisLine={{ stroke: '#edeae5', strokeOpacity: 0.15 }} tickLine={{ stroke: '#edeae5', strokeOpacity: 0.15 }}
                    label={{ value: 'Année', position: 'bottom', offset: 18, fill: '#8b9391', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#8b9391', fontSize: 10 }} axisLine={{ stroke: '#edeae5', strokeOpacity: 0.15 }} tickLine={{ stroke: '#edeae5', strokeOpacity: 0.15 }}
                    tickFormatter={(v) => `${Math.round(v / 1000)}`}
                    label={{ value: 'Milliers €', angle: -90, position: 'insideLeft', offset: -4, fill: '#8b9391', fontSize: 11, style: { textAnchor: 'middle' } }} />
                  <Tooltip cursor={{ fill: 'rgba(237,234,229,0.03)' }} content={({ active, payload, label }) => {
                    if (!active || !payload || !payload.length) return null;
                    const capital = payload.find((p) => p.dataKey === 'capital')?.value || 0;
                    const cashflow = payload.find((p) => p.dataKey === 'cashflow')?.value || 0;
                    return (
                      <div style={{ background: '#121413', border: '1px solid #303332', borderRadius: 6, padding: '10px 12px', maxWidth: 260 }}>
                        <p style={{ color: '#edeae5', fontSize: 12, marginBottom: 6 }}>Année {label}</p>
                        <p style={{ color: '#7FE0D3', fontSize: 11, marginBottom: 2 }}>Capital remboursé : {formatCurrency(capital)}</p>
                        <p style={{ color: '#e0c9a0', fontSize: 11, marginBottom: 8 }}>Cash-flow annuel : {formatCurrency(cashflow)}</p>
                        <p style={{ color: '#8b9391', fontSize: 10, lineHeight: 1.4, borderTop: '1px solid rgba(237,234,229,0.1)', paddingTop: 8, margin: 0 }}>
                          La création de richesse correspond au cash-flow cumulé + le prix de la revente, en retirant l'apport initial.
                        </p>
                      </div>
                    );
                  }} />
                  <Legend verticalAlign="top" align="right" iconType="circle"
                    wrapperStyle={{ fontSize: 12, paddingBottom: 12 }}
                    formatter={(v) => <span className="text-[#d3d8d6] text-[12px]">{v === 'capital' ? 'Capital remboursé' : 'Cash-flow annuel'}</span>} />
                  <Bar name="capital" dataKey="capital" fill="#7FE0D3" radius={[3, 3, 0, 0]} animationDuration={Math.max(richesseRows.length * 90, 600)} animationEasing="ease-out" />
                  <Bar name="cashflow" dataKey="cashflow" fill="#e0c9a0" radius={[3, 3, 0, 0]} animationDuration={Math.max(richesseRows.length * 90, 600)} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
        </div>

        <aside className="max-lg:hidden">
          <div className="sticky top-8">
            <AvisProjetIA analyse={analyse} loading={analyseLoading} error={analyseError} vertical section={ongletActif} />
          </div>
        </aside>
      </div>
    </motion.div>
  );
}