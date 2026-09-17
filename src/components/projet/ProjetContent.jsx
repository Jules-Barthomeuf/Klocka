import React, { useEffect, useState, useRef, useMemo } from "react";
import { EditionContext, ValeurEditable, TexteEditable, ChampsPersonnalises, useEdition, estMasque, BoutonMasquer } from "./EditionEnPlace";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Download, X, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import moment from "moment";
import "moment/locale/fr";
moment.locale("fr");
import { motion } from "framer-motion";
import { useCasesProjet, PanneauPiece, VueBail, BandesCases, TableauAG, dateFr } from "./CasesProjet";
import StreetViewRue from "./StreetViewRue";
import AssembleesGeneralesSection from "./AssembleesGeneralesSection";
import LocataireLiensSociaux from "./LocataireLiensSociaux";
import EnvironnementIndicateurs from "./EnvironnementIndicateurs";
import CarteCessions from "./CarteCessions";
import VilleSecteurIA, { useAnalyseIA } from "./SecteurAnalyseIA";
import { J } from "@/design/jetons";
import MarcheProjet from "./MarcheProjet";
import BienProjet from "./BienProjet";
import LocataireProjet from "./LocataireProjet";

// Primitives éditoriales partagées par les onglets (maquette "Page Projet Klocka")
function SectionLabel({ children, tone = "muted", className = "" }) {
  const color = tone === "teal" ? "text-menthe-clair" : tone === "gold" ? "text-menthe" : tone === "red" ? "text-red-400" : "text-ardoise";
  return <div className={`text-[11px] tracking-[0.2em] uppercase ${color} mb-3 ${className}`}>{children}</div>;
}

// Le chapô (`right`) passe sous le titre : titre → sous-titre → chapô → chiffres.
function TabHeader({ title, subtitle, left = undefined, right = undefined }) {
  return (
    <div className="mb-6 max-md:mb-4">
      <h2 className="text-[34px] max-md:text-[24px] font-light tracking-[-0.02em] leading-[1.05] text-encre mb-2">{title}</h2>
      {subtitle && <p className="text-[13.5px] leading-[1.7] text-ardoise mb-0 max-w-[560px]">{subtitle}</p>}
      {left}
      {right && <div className="mt-5 max-md:mt-4 max-w-[880px] order-last">{right}</div>}
    </div>
  );
}


function KpiStrip({ items, className = "" }) {
  const edition = useEdition();
  const list = (items || []).filter(Boolean).filter((it) => !estMasque(edition, it.champ));
  if (!list.length) return null;
  return (
    <div className={`flex flex-wrap rounded-xl border border-bord bg-surface px-6 max-md:px-4 mb-10 max-md:mb-6 ${className}`}>
      {list.map((it, i) => (
        <div key={i} className={`flex-1 min-w-[150px] max-md:min-w-[46%] py-6 max-md:py-4 pr-5 ${i > 0 ? "md:border-l md:border-trait md:pl-6" : ""}`}>
          <div className="text-[11px] tracking-[0.16em] uppercase text-ardoise mb-1.5 flex items-center gap-1">{it.label}<BoutonMasquer champ={it.champ} /></div>
          <div className={`text-[28px] max-md:text-[22px] font-light leading-tight whitespace-nowrap ${it.accent || "text-encre"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
            <ValeurEditable champ={it.champ} type={it.typeChamp || "number"}>{it.value}</ValeurEditable>
          </div>
        </div>
      ))}
    </div>
  );
}

function KVRow({ label, value, accent = undefined, champ = undefined, typeChamp = undefined }) {
  const edition = useEdition();
  if (estMasque(edition, champ)) return null;
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm border-t border-encre/[0.12]">
      <span className="text-ardoise flex-shrink-0">{label}</span>
      <span className={`text-right flex items-center justify-end gap-1 ${accent || "text-encre"}`}>
        <ValeurEditable champ={champ} type={typeChamp || "number"}>{value}</ValeurEditable>
        <BoutonMasquer champ={champ} />
      </span>
    </div>
  );
}

// Tableau éditorial : en-têtes lettrés, filets fins, chiffres alignés à droite
function DataTable({ label, head, rows, align = undefined }) {
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
                <th key={i} className={`text-[11px] tracking-[0.16em] uppercase text-ardoise font-normal pb-3 whitespace-nowrap ${cellAlign(i)}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-encre/[0.12]">
                {r.map((c, ci) => {
                  const isObj = c !== null && typeof c === "object" && !React.isValidElement(c);
                  return (
                    <td key={ci} className={`py-3.5 align-top ${cellAlign(ci)} ${isObj && c.accent ? c.accent : ci === 0 ? "text-encre" : "text-craie"}`}>
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
  return <p className="text-ardoise text-sm border-t border-encre/[0.12] pt-6 mb-0">{text}</p>;
}

function NotesBlock({ notes }) {
  if (!notes || notes.length === 0) return null;
  return (
    <div className="mt-10 max-md:mt-6">
      <SectionLabel>Notes</SectionLabel>
      <div className="space-y-5">
        {notes.map((note, idx) => (
          <div key={idx} className="border-t border-encre/[0.12] pt-4">
            {note.titre && <h4 className="text-encre text-[15px] font-medium mb-1.5">{note.titre}</h4>}
            <p className="text-sm text-craie leading-[1.8] whitespace-pre-wrap mb-0">{note.contenu}</p>
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
            <span className={`w-5 text-center flex-shrink-0 ${isActive ? "text-[18px] text-encre" : "text-[12.5px] text-bord-vif"}`}>{g}</span>
            <div className="h-[9px] flex-shrink-0" style={{ width: `${26 + idx * 10}%`, backgroundColor: isActive ? J["menthe"] : J["trait"] }} />
            {isActive && valueLabel && <span className="text-[12.5px] text-menthe-clair whitespace-nowrap">{valueLabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Fourchette bas / médian / haut sur filet fin
function RangeScale({ bas, median, haut, unit = "€", champBas, champMedian, champHaut }) {
  const b = bas || 0;
  const h = haut || (median ? median * 2 : 0);
  const m = median || 0;
  const range = h - b;
  const pos = range > 0 && m > 0 ? Math.max(0, Math.min(100, ((m - b) / range) * 100)) : 50;
  const fmtN = (v) => (v ? v.toLocaleString("fr-FR") : "—");
  return (
    <div>
      <div className="relative h-[3px] bg-trait">
        {m > 0 && <div className="absolute w-[9px] h-[9px] rounded-full bg-menthe-clair" style={{ left: `${pos}%`, top: "50%", transform: "translate(-50%, -50%)" }} />}
      </div>
      <div className="flex justify-between mt-2.5 text-[12.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className="text-ardoise"><ValeurEditable champ={champBas}>{`${fmtN(b)} ${unit}`}</ValeurEditable></span>
        <span className="text-encre"><ValeurEditable champ={champMedian}>{`${fmtN(m)} ${unit}`}</ValeurEditable></span>
        <span className="text-ardoise"><ValeurEditable champ={champHaut}>{`${fmtN(h)} ${unit}`}</ValeurEditable></span>
      </div>
    </div>
  );
}

// Shared project display used by the client detail page and the public share page.
// `isAdmin` / `showAsClient` control admin-only bits; `isPublic` disables navigation to
// internal tools (simulator/comparator) for anonymous visitors.
// `apercuOnglet` : mode aperçu de l'éditeur admin — rend UNIQUEMENT le contenu
// de l'onglet demandé (secteur, marche, bien, locataire, bail, copropriete,
// diagnostique, documents_projet), sans hero, sans barre d'onglets ni rail IA.
// `modeEdition` + `onChamp` : éditeur admin — les chiffres deviennent des
// champs au clic, et le hero comme la synthèse financière sont masqués.
export default function ProjetContent({ project, isAdmin = false, showAsClient = true, isPublic = false, apercuOnglet = null, onOngletChange = null, modeEdition = false, onChamp = null, ongletsSupplementaires = [], ongletDemande = null }) {
  const navigate = useNavigate();
  // Analyse IA (avis projet + chiffres ville/secteur), mutualisée en un appel.
  const { analyse, villeData, secteurData, loading: analyseLoading, error: analyseError, refresh: refreshAnalyse } = useAnalyseIA(project);
  const [selectedImage, setSelectedImage] = useState(null);
  // Le carrousel du hero : le rang de la photo montrée, et les adresses qui ne
  // répondent plus (un hébergeur disparu ne doit pas condamner les suivantes).
  const [iPhoto, setIPhoto] = useState(0);
  const [urlsMortes, setUrlsMortes] = useState(() => new Set());
  // Ce que le carrousel montre : les photos qui répondent encore, celle du
  // rang courant, et la rue s'il y a de quoi la situer.
  const photosVivantes = (project.photos || []).filter((u) => u && !urlsMortes.has(u));
  const photoMontree = photosVivantes[Math.min(iPhoto, photosVivantes.length - 1)] || null;
  const rueDisponible = !!(project.adresse_complete || (project.latitude && project.longitude));
  const [streetView, setStreetView] = useState(false);
  // La pièce ouverte à droite quand on clique une case.
  const [piece, setPiece] = useState(null);
  // La localisation bascule entre la carte et Street View.
  const [rueLocalisation, setRueLocalisation] = useState(false);
  const cases = useCasesProjet(project, isPublic);
  const enPlace = cases?.locataire?.find((c) => c.id === "en_place");
  const [ongletChoisi, setOngletActif] = useState("secteur");
  // Le panneau d'édition choisit la section : la page la suit.
  useEffect(() => { if (ongletDemande) setOngletActif(ongletDemande); }, [ongletDemande]);
  const ongletActif = apercuOnglet || ongletChoisi;
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
  const incentiveKlocka = Math.max(0, (prixBienFAI > 0 ? prixBienFAI : prixBienNegocie) - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevientCalcule = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + (commissionAgentInclusFAI ? 0 : honorairesCA)
    : project.sim_prix_revient && project.sim_prix_revient > 0 ? project.sim_prix_revient : project.prix_acquisition || 0;

  const loyerAnnuel = project.sim_loyer_initial_ht || project.loyer_annuel_ht || 0;

  const rendementLocatifNetCalcule = prixRevientCalcule > 0 && loyerAnnuel > 0
    ? (loyerAnnuel / prixRevientCalcule) * 100
    : project.sim_rendement_locatif_global_net || 0;

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
  const anneesRestantesBail = project.echeance_bail && moment(project.echeance_bail).isValid()
    ? Math.max(0, moment(project.echeance_bail).diff(moment(), 'years', true))
    : null;

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

  // Contexte toujours fourni : les champs supprimés doivent disparaître pour
  // le client aussi. Seul `onChamp` distingue le mode édition.
  const contexteEdition = useMemo(
    () => ({
      onChamp: modeEdition && onChamp ? onChamp : null,
      valeurs: project,
      masques: project?.champs_masques || [],
    }),
    [modeEdition, onChamp, project]
  );

  return (
    <EditionContext.Provider value={contexteEdition}>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      // `overflow-x-clip` et non `hidden` : `hidden` crée un conteneur de
      // défilement qui neutralise le `sticky` du rail d'analyse.
      className="projet-editorial font-projet min-h-screen text-encre overflow-x-clip">

      {/* Image Lightbox */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-[100vw] max-h-[100vh] w-screen h-screen p-0 bg-fond border-none [&>button]:hidden">
          <div className="relative w-full h-full flex items-center justify-center">
            <Button variant="ghost" size="icon" onClick={() => setSelectedImage(null)} className="absolute top-6 right-6 text-encre hover:bg-encre/20 z-10 w-14 h-14">
              <X className="w-8 h-8" />
            </Button>
            {project?.photos && project.photos.length > 1 && (
              <>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const prevIndex = (currentIndex - 1 + project.photos.length) % project.photos.length;
                  setSelectedImage(project.photos[prevIndex]);
                }} className="absolute left-6 top-1/2 -translate-y-1/2 bg-fond/50 hover:bg-fond/70 text-encre rounded-full w-16 h-16 z-10">
                  <ChevronLeft className="w-10 h-10" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => {
                  const currentIndex = project.photos.indexOf(selectedImage);
                  const nextIndex = (currentIndex + 1) % project.photos.length;
                  setSelectedImage(project.photos[nextIndex]);
                }} className="absolute right-6 top-1/2 -translate-y-1/2 bg-fond/50 hover:bg-fond/70 text-encre rounded-full w-16 h-16 z-10">
                  <ChevronRight className="w-10 h-10" />
                </Button>
              </>
            )}
            {selectedImage && <img src={selectedImage} alt="Photo agrandie" className="max-w-[95vw] max-h-[95vh] object-contain" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hero pleine largeur (masqué en aperçu d'onglet et en édition) */}
      {!apercuOnglet && !modeEdition && (
      <div className="relative w-full h-[560px] max-md:h-[440px] overflow-hidden">
        {streetView ? (
          <StreetViewRue project={project} />
        ) : photoMontree ? (
          <img
            key={photoMontree}
            src={photoMontree}
            alt=""
            onError={() => setUrlsMortes((s) => new Set(s).add(photoMontree))}
            onClick={() => setSelectedImage(photoMontree)}
            className="absolute inset-0 h-full w-full cursor-pointer object-cover"
          />
        ) : mapUrl ? (
          <iframe src={mapUrl} className="absolute inset-0 w-full h-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte du projet" />
        ) : (
          <div className="absolute inset-0 bg-surface" />
        )}
        {/* En Street View, ni voile ni habillage : le panorama se manipule. */}
        {!streetView && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(10,12,12,0.96) 8%, rgba(10,12,12,0.45) 55%, rgba(10,12,12,0.7) 100%)' }} />
        )}

        {/* Le carrousel : une photo, les suivantes d'un clic, et la rue au
            bout. Les flèches ne s'affichent que s'il y a quelque part où
            aller. */}
        {!streetView && photoMontree && (photosVivantes.length > 1 || rueDisponible) && (
          <>
            {photosVivantes.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); setIPhoto((i) => (i - 1 + photosVivantes.length) % photosVivantes.length); }}
                aria-label="Photo précédente" title="Photo précédente"
                className="absolute left-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-encre/[0.28] bg-fond/50 text-encre backdrop-blur-sm transition-colors hover:border-encre max-md:left-3"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (iPhoto < photosVivantes.length - 1) setIPhoto(iPhoto + 1);
                else if (rueDisponible) setStreetView(true);
                else setIPhoto(0);
              }}
              aria-label={iPhoto < photosVivantes.length - 1 ? "Photo suivante" : "Voir la rue"}
              title={iPhoto < photosVivantes.length - 1 ? "Photo suivante" : "Voir la rue"}
              className="absolute right-5 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-encre/[0.28] bg-fond/50 text-encre backdrop-blur-sm transition-colors hover:border-encre max-md:right-3"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Les pastilles : où l'on en est, et la dernière mène à la rue. */}
        {!streetView && photosVivantes.length > 1 && (
          <div className="absolute bottom-[104px] left-1/2 flex -translate-x-1/2 items-center gap-2 max-md:bottom-[92px]">
            {photosVivantes.map((u, i) => (
              <button
                key={u}
                onClick={(e) => { e.stopPropagation(); setIPhoto(i); }}
                aria-label={`Aller à la photo ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{ width: i === iPhoto ? 22 : 6, background: i === iPhoto ? J["menthe"] : "rgba(242,243,245,0.35)" }}
              />
            ))}
          </div>
        )}

        <div className="absolute top-7 left-5 right-5 md:left-14 md:right-14 flex justify-end items-center gap-3">
          <div className="flex gap-2 flex-wrap justify-end items-center">
            {/* Street View : se déplacer dans la rue autour du local. */}
            {mapsKey && (project.adresse_complete || (project.latitude && project.longitude)) && (
              <button
                onClick={() => setStreetView((v) => !v)}
                className="text-[12.5px] px-4 py-2 rounded-full bg-fond/50 backdrop-blur-sm border border-encre/[0.28] text-encre hover:border-encre transition-colors"
              >
                {streetView ? "Fermer Street View" : "Street View"}
              </button>
            )}
            {project.documents && project.documents.length > 0 && (
              <button onClick={() => window.open(project.documents[0], '_blank')}
                className="text-[12.5px] px-4 py-2 rounded-full bg-fond/50 backdrop-blur-sm border border-encre/[0.28] text-encre hover:border-encre transition-colors max-md:hidden">
                Documents ({project.documents.length})
              </button>
            )}
          </div>
        </div>

        {/* Habillage masqué en Street View pour laisser le panorama réactif. */}
        <div className={`absolute bottom-9 md:bottom-11 left-5 right-5 md:left-14 md:right-14 grid md:grid-cols-[minmax(0,1fr)_300px] gap-6 md:gap-12 items-end ${streetView ? "hidden" : ""}`}>
          <div>
            <h1 className="text-[28px] md:text-[40px] font-light tracking-[-0.02em] leading-[1.08] text-encre mb-0">{project.titre}</h1>
            <div className="md:hidden mt-5">
              <div className="flex gap-8" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <div>
                  <div className="text-[24px] font-light text-encre leading-tight">{formatCurrency(prixRevientCalcule)}</div>
                  <div className="text-[11px] tracking-[0.16em] uppercase text-ardoise mt-1">Prix de revient</div>
                </div>
                {rendementLocatifNetCalcule > 0 && (
                  <div>
                    <div className="text-[24px] font-light text-menthe-clair leading-tight">{rendementLocatifNetCalcule.toFixed(2).replace('.', ',')} %</div>
                    <div className="text-[11px] tracking-[0.16em] uppercase text-ardoise mt-1">Rendement net</div>
                  </div>
                )}
              </div>
              <button onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
                className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-menthe text-fond text-[12.5px] font-semibold hover:bg-menthe-survol transition-colors">
                Simulateur complet <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <div className="max-md:hidden text-right">
            <div className="flex justify-end gap-10" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <div>
                <div className="text-[30px] font-light text-encre leading-tight whitespace-nowrap">{formatCurrency(prixRevientCalcule)}</div>
                <div className="text-[11px] tracking-[0.18em] uppercase text-ardoise mt-1.5">Prix de revient</div>
              </div>
              <div>
                <div className="text-[30px] font-light text-menthe-clair leading-tight whitespace-nowrap">{rendementLocatifNetCalcule > 0 ? `${rendementLocatifNetCalcule.toFixed(2).replace('.', ',')} %` : '—'}</div>
                <div className="text-[11px] tracking-[0.18em] uppercase text-ardoise mt-1.5">Rendement net</div>
              </div>
            </div>
            <button onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-menthe text-fond text-[12.5px] font-semibold hover:bg-menthe-survol transition-colors">
              Simulateur complet <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {!apercuOnglet && project.photos && project.photos.length > 1 && (
        <div ref={photosContainerRef} className="flex gap-2 overflow-x-auto px-5 md:px-14 py-3 bg-fond border-b border-encre/[0.08]" style={{ scrollbarWidth: 'none' }}>
          {project.photos.slice(1).map((photo, idx) => (
            <img key={idx} src={photo} alt={`Photo ${idx + 2}`} onClick={() => setSelectedImage(photo)}
              className="h-20 w-32 object-cover flex-shrink-0 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" />
          ))}
        </div>
      )}

      <div className={apercuOnglet
        ? "px-3 py-3"
        : "max-w-6xl mx-auto px-4 md:px-6 py-4 md:py-8"}>
        <div className="min-w-0">
        <Tabs value={ongletActif} onValueChange={(v) => { setOngletActif(v); onOngletChange?.(v); }} className="w-full">
          {!apercuOnglet && (
          <TabsList className="w-full min-w-0 flex justify-start flex-wrap max-md:flex-nowrap max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden gap-x-7 gap-y-2 max-md:gap-x-5 bg-transparent border-0 mb-10 max-md:mb-6 rounded-none px-0 h-auto pt-1 pb-6 max-md:pb-4 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
            {[
              { v: "secteur", l: "Secteur" },
              { v: "marche", l: "Marché" },
              { v: "bien", l: "Bien" },
              { v: "locataire", l: "Locataire" },
              { v: "bail", l: "Analyse du bail" },
              { v: "copropriete", l: "Copropriété" },
              { v: "diagnostique", l: "Diagnostique" },
              { v: "documents_projet", l: "Documents" },
              // Onglets ajoutés par l'éditeur (simulateur…) : la barre les
              // affiche, leur contenu est rendu par le parent.
              ...ongletsSupplementaires.map((o) => ({ v: o.value, l: o.label })),
            ].map(({ v, l }) => (
              <TabsTrigger key={v} value={v} className="text-[11px] max-md:text-[11px] tracking-[0.16em] uppercase px-0 py-1 h-auto rounded-none whitespace-nowrap bg-transparent text-ardoise hover:text-encre data-[state=active]:text-encre transition-colors duration-200">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
          )}

          <TabsContent value="secteur" className="space-y-6 max-md:space-y-4">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <div className="mb-8 max-md:mb-5">
                <h2 className="text-[34px] max-md:text-[24px] font-light tracking-[-0.02em] leading-[1.05] text-encre mb-2">Secteur</h2>
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
                    prixM2Revient={prixM2Revient}
                    loyerM2={loyerM2}
                  />
                </div>
              </div>

              {(mapUrl || project.transactions_fonds) && (
                <div className="mb-10 max-md:mb-6">
                  <div className="flex items-start justify-between gap-4">
                    <SectionLabel tone="teal">Localisation</SectionLabel>
                    {mapsKey && (project.adresse_complete || (project.latitude && project.longitude)) && (
                      <button type="button" onClick={() => setRueLocalisation((v) => !v)}
                        className="-mt-1.5 mb-3 text-[12.5px] px-4 py-1.5 rounded-full border border-bord-doux text-craie hover:text-encre hover:border-bord-vif transition-colors">
                        {rueLocalisation ? "Revenir à la carte" : "Street View"}
                      </button>
                    )}
                  </div>
                  {rueLocalisation ? (
                    <div className="relative h-[420px] max-md:h-[260px] overflow-hidden bg-surface">
                      <StreetViewRue project={project} />
                    </div>
                  ) : project.transactions_fonds ? (
                    <CarteCessions
                      resultat={project.transactions_fonds}
                      titre={project.titre}
                      adresse={project.adresse_complete}
                      lat={project.latitude}
                      lon={project.longitude}
                    />
                  ) : (
                  <div className="relative h-[420px] max-md:h-[260px] overflow-hidden bg-surface">
                    <iframe src={mapUrl} className="w-full h-full" style={{ border: 0, filter: 'saturate(0.85) contrast(1.04)' }} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte du secteur" />
                    <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-encre/[0.13]" />
                    <div className="max-md:hidden absolute left-6 bottom-6 max-w-[340px] bg-fond/[0.86] backdrop-blur-sm px-5 py-4">
                      {project.adresse_complete && (
                        <>
                          <div className="text-[11px] tracking-[0.18em] uppercase text-ardoise">Adresse</div>
                          <div className="text-[13.5px] leading-[1.6] text-encre mt-1">{project.adresse_complete}</div>
                        </>
                      )}
                      {project.surface_m2 > 0 && (
                        <div className="text-[12.5px] text-craie mt-2.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{project.surface_m2} m² exploités</div>
                      )}
                      {googleMapsLink && (
                        <a href={googleMapsLink} target="_blank" rel="noopener noreferrer"
                          className="pointer-events-auto inline-flex items-center gap-2 mt-4 text-[11px] tracking-[0.18em] uppercase text-menthe-clair hover:text-encre transition-colors">
                          Ouvrir dans Google Maps <span aria-hidden="true">→</span>
                        </a>
                      )}
                    </div>
                  </div>
                  )}
                  <div className="md:hidden">
                    <KVRow champ="adresse_complete" typeChamp="text" label="Adresse" value={project.adresse_complete} />
                    <KVRow label="Surface" value={project.surface_m2 > 0 ? `${project.surface_m2} m²` : null} champ="surface_m2" />
                    {googleMapsLink && (
                      <KVRow label="Carte" value={<a href={googleMapsLink} target="_blank" rel="noopener noreferrer" className="text-menthe-clair">Ouvrir dans Google Maps</a>} />
                    )}
                  </div>
                </div>
              )}
              <EnvironnementIndicateurs project={project} />
              <NotesBlock notes={project.notes_secteur} />
              <ChampsPersonnalises zone="secteur" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="marche">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Marché"
              />

              <MarcheProjet project={project} isPublic={isPublic} prixM2Revient={prixM2Revient} loyerM2={loyerM2} />

              <NotesBlock notes={project.notes_marche} />

              {!project.marche_prix_m2_median && !project.marche_offre_moyenne && !project.marche_baux_moyenne
                && (!project.marche_secteurs || project.marche_secteurs.length === 0)
                && (!project.notes_marche || project.notes_marche.length === 0) && <EmptyTab />}
              <ChampsPersonnalises zone="marche" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bien">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader title="Bien" />
              <BienProjet project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="locataire">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Locataire"
              />

              <LocataireProjet project={project} />

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
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-craie hover:text-menthe-clair transition-colors">{bilan.nom}</a> },
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-menthe-clair text-[12.5px] hover:text-encre transition-colors">Télécharger</a> },
                  ])}
                />
              )}

              <NotesBlock notes={project.notes_locataire} />

              {!project.nom_locataire && !project.activite_locataire && loyerAnnuel <= 0 && !project.echeance_bail
                && (!project.notes_locataire || project.notes_locataire.length === 0) && <EmptyTab />}
              <ChampsPersonnalises zone="locataire" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bail">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader title="Analyse du bail" />
              <VueBail cases={cases} project={project} onSource={setPiece} />
            </motion.div>
          </TabsContent>

          <TabsContent value="copropriete">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Copropriété"
              />

              <div className="mb-10 max-md:mb-6">
                <SectionLabel tone="teal">PV d'assemblée générale</SectionLabel>
                <TableauAG cases={cases?.copropriete} project={project} />
                {/* Les impayés ne sont pas une résolution : ils restent une case. */}
                <div className="mt-5">
                  <BandesCases zone="copropriete" cases={(cases?.copropriete || []).filter((c) => c.id === "impayes_copro")} project={project} />
                </div>
              </div>

              <KpiStrip items={[
                project.quote_part_lot > 0 && { value: `${project.quote_part_lot} %`, label: 'Quote-part du lot', champ: 'quote_part_lot' },
                project.charges_copropriete > 0 && { value: `${fmtNum(project.charges_copropriete)} €`, label: 'Charges annuelles', champ: 'charges_copropriete' },
                project.provision_charges > 0 && { value: `${fmtNum(project.provision_charges)} €`, label: 'Provision pour charges', champ: 'provision_charges' },
                project.taxe_fonciere_an > 0 && { value: `${fmtNum(project.taxe_fonciere_an)} €`, label: 'Taxe foncière /an', accent: 'text-menthe', champ: 'taxe_fonciere_an' },
                project.type_construction && { value: project.type_construction, label: 'Type de construction', champ: 'type_construction', typeChamp: 'text' },
              ]} />

              {(project.activites_autorisees || project.activites_interdites) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 mb-10 max-md:mb-6">
                  {project.activites_autorisees && (
                    <div className="border-l border-menthe pl-5">
                      <SectionLabel tone="teal">Activités autorisées</SectionLabel>
                      <TexteEditable champ="activites_autorisees">
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_autorisees.split(',').map((a, idx) => (
                          <li key={idx} className="text-[15px] text-craie">{a.trim()}</li>
                        ))}
                      </ul>
                      </TexteEditable>
                    </div>
                  )}
                  {project.activites_interdites && (
                    <div className="border-l border-menthe pl-5">
                      <SectionLabel tone="gold">Activités interdites</SectionLabel>
                      <TexteEditable champ="activites_interdites">
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_interdites.split(',').map((a, idx) => (
                          <li key={idx} className="text-[15px] text-craie">{a.trim()}</li>
                        ))}
                      </ul>
                      </TexteEditable>
                    </div>
                  )}
                </div>
              )}

              {project.synthese_assemblee_generale && project.synthese_assemblee_generale.trim() && (
                <div className="mb-10 max-md:mb-6">
                  <SectionLabel>Synthèse de l'assemblée générale</SectionLabel>
                  <TexteEditable champ="synthese_assemblee_generale"><p className="text-[15px] leading-[1.8] text-craie text-justify whitespace-pre-wrap mb-0">{project.synthese_assemblee_generale}</p></TexteEditable>
                </div>
              )}

              {(project.resolutions_votees || project.resolutions_refusees) && (
                <div className="grid md:grid-cols-2 gap-x-12 gap-y-8 mb-10 max-md:mb-6">
                  {project.resolutions_votees && (
                    <div className="border-l border-menthe pl-5">
                      <SectionLabel tone="teal">Résolutions votées</SectionLabel>
                      <TexteEditable champ="resolutions_votees"><p className="text-[15px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.resolutions_votees}</p></TexteEditable>
                    </div>
                  )}
                  {project.resolutions_refusees && (
                    <div className="border-l border-menthe pl-5">
                      <SectionLabel tone="gold">Résolutions non acceptées</SectionLabel>
                      <TexteEditable champ="resolutions_refusees"><p className="text-[15px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.resolutions_refusees}</p></TexteEditable>
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
              <ChampsPersonnalises zone="copropriete" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="diagnostique">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Diagnostique"
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
                  <KVRow champ="dpe_note" typeChamp="text" label="Classe énergie" value={project.dpe_note ? `Classe ${project.dpe_note}` : null} accent="text-menthe-clair" />
                  <KVRow label="Consommation" value={project.dpe_consommation > 0 ? `${fmtNum(project.dpe_consommation)} kWh/m²/an` : null} champ="dpe_consommation" />
                </div>
                <div>
                  <KVRow champ="ges_note" typeChamp="text" label="Classe GES" value={project.ges_note ? `Classe ${project.ges_note}` : null} accent="text-menthe-clair" />
                  <KVRow label="Émissions" value={project.ges_emission > 0 ? `${fmtNum(project.ges_emission)} kg CO₂/m²/an` : null} champ="ges_emission" />
                </div>
              </div>

              <NotesBlock notes={project.notes_diagnostique} />

              {!project.dpe_note && !project.ges_note && (!project.notes_diagnostique || project.notes_diagnostique.length === 0) && (
                <EmptyTab text="Aucune donnée de diagnostic disponible pour ce projet." />
              )}
              <ChampsPersonnalises zone="diagnostique" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="documents_projet">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Documents"
              />

              {project.fichiers_projet && project.fichiers_projet.length > 0 ? (
                <div className="border-t border-encre/[0.35]">
                  {project.fichiers_projet.map((fichier, idx) => (
                    <a key={idx} href={fichier.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between gap-4 py-4 border-b border-encre/[0.12] group">
                      <div className="flex items-center gap-4 min-w-0">
                        <FileText className="w-4 h-4 text-menthe flex-shrink-0" />
                        <span className="text-[15px] text-encre truncate group-hover:text-menthe-clair transition-colors">{fichier.nom}</span>
                      </div>
                      <span className="flex items-center gap-2 text-[12.5px] text-ardoise group-hover:text-menthe-clair transition-colors flex-shrink-0">
                        Télécharger <Download className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyTab text="Aucun document disponible pour ce projet." />
              )}
              <ChampsPersonnalises zone="documents_projet" project={project} />
            </motion.div>
          </TabsContent>
        </Tabs>

        </div>

      </div>
    </motion.div>
    <PanneauPiece piece={piece} onFermer={() => setPiece(null)} />
    </EditionContext.Provider>
  );
}