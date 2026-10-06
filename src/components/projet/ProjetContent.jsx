import React, { useEffect, useState, useMemo } from "react";
import { adresseAChercher } from "@/lib/adresse-projet";
import { EditionContext, ValeurEditable, ValeurForcee, TexteEditable, ChampsPersonnalises, useEdition, estMasque, BoutonMasquer, Bloc, nombreForce } from "./EditionEnPlace";
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
import AssembleesGeneralesSection from "./AssembleesGeneralesSection";
import LocataireLiensSociaux from "./LocataireLiensSociaux";
import { J } from "@/design/jetons";
import MarcheProjet from "./MarcheProjet";
import StreetViewRue from "./StreetViewRue";
import { EnTeteOnglet, Carte } from "./Cartes";
import BienProjet from "./BienProjet";
import LocataireProjet from "./LocataireProjet";

// Primitives partagées par les onglets, au registre de la maquette du 28
// septembre (voir Cartes.jsx) : des cartes bordées, des titres à 16 px.
function SectionLabel({ children, className = "" }) {
  return <div className={`text-[16px] font-medium text-encre mb-4 border-b border-trait pb-3 ${className}`}>{children}</div>;
}

// Le chapô (`right`) passe sous le titre : titre → sous-titre → chapô → chiffres.
function TabHeader({ title, subtitle = null, right = undefined }) {
  return (
    <div className="mb-5">
      <EnTeteOnglet titre={title} contexte={subtitle} className="" />
      {right && <div className="mt-5 max-md:mt-4 max-w-[880px]">{right}</div>}
    </div>
  );
}

function KpiStrip({ items, className = "" }) {
  const edition = useEdition();
  const list = (items || []).filter(Boolean).filter((it) => !estMasque(edition, it.champ));
  if (!list.length) return null;
  return (
    <div className={`mb-5 ${className}`}>
      <Carte className="flex flex-wrap overflow-hidden">
        {list.map((it, i) => (
          <div key={i} className={`flex-[1_1_200px] flex flex-col gap-2.5 p-7 max-md:p-5 ${i > 0 ? "border-l border-trait max-md:border-l-0 max-md:border-t" : ""}`}>
            <span className="text-[13px] text-ardoise flex items-center gap-1">{it.label}<BoutonMasquer champ={it.champ} /></span>
            <span className={`text-[32px] max-md:text-[26px] font-medium tracking-[-0.02em] leading-tight whitespace-nowrap max-md:whitespace-normal ${it.accent ? "text-menthe" : "text-encre"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
              <ValeurEditable champ={it.champ} type={it.typeChamp || "number"}>{it.value}</ValeurEditable>
            </span>
          </div>
        ))}
      </Carte>
    </div>
  );
}

// Tableau dans une carte : en-têtes gris, filets fins, chiffres alignés à droite.
function DataTable({ label, head, rows, align = undefined }) {
  if (!rows || rows.length === 0) return null;
  const cellAlign = (i) => (align?.[i] === "left" || (!align && i === 0) ? "text-left" : "text-right");
  return (
    <Carte className="mt-5 p-7 max-md:p-5">
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className={`text-[13px] text-ardoise font-normal pb-3 whitespace-nowrap ${cellAlign(i)}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-trait">
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
    </Carte>
  );
}

function EmptyTab({ text = "Aucune information dans cette partie" }) {
  return <Carte className="p-7 max-md:p-5"><p className="text-ardoise text-[14px] mb-0">{text}</p></Carte>;
}

function NotesBlock({ notes }) {
  if (!notes || notes.length === 0) return null;
  return (
    <Carte className="mt-5 p-7 max-md:p-5">
      <SectionLabel>Notes</SectionLabel>
      <div className="flex flex-col">
        {notes.map((note, idx) => (
          <div key={idx} className={`py-4 ${idx > 0 ? "border-t border-trait" : "pt-1"}`}>
            {note.titre && <h4 className="text-encre text-[15px] font-medium mb-1.5">{note.titre}</h4>}
            <p className="text-[14px] text-craie leading-[1.75] whitespace-pre-wrap mb-0">{note.contenu}</p>
          </div>
        ))}
      </div>
    </Carte>
  );
}

// Shared project display used by the client detail page and the public share page.
// `isAdmin` / `showAsClient` control admin-only bits; `isPublic` disables navigation to
// internal tools (simulator/comparator) for anonymous visitors.
// `apercuOnglet` : mode aperçu de l'éditeur admin — rend UNIQUEMENT le contenu
// de l'onglet demandé (marche, bien, locataire, bail, copropriete,
// documents_projet), sans hero, sans barre d'onglets ni rail IA.
// `modeEdition` + `onChamp` : éditeur admin — les chiffres deviennent des
// champs au clic, et le hero comme la synthèse financière sont masqués.
// `editeurDocuments` et `onPhotos` (éditeur seulement) : l'ajout de pièces dans
// l'onglet Documents, et le bouton Photos du hero ; le reste se modifie au clic.
export default function ProjetContent({ project, isAdmin = false, showAsClient = true, isPublic = false, apercuOnglet = null, onOngletChange = null, modeEdition = false, onChamp = null, ongletsSupplementaires = [], ongletDemande = null, editeurDocuments = null, onPhotos = null }) {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState(null);
  // Les adresses de photos qui ne répondent plus : un hébergeur disparu ne
  // doit pas condamner les suivantes.
  const [urlsMortes, setUrlsMortes] = useState(() => new Set());
  // Les photos qui répondent encore ; le compteur du hero les fait défiler.
  const photosVivantes = (project.photos || []).filter((u) => u && !urlsMortes.has(u));
  const [indexPhoto, setIndexPhoto] = useState(0);
  const photoMontree = photosVivantes.length ? photosVivantes[indexPhoto % photosVivantes.length] : null;
  const rueDisponible = !!(project.adresse_complete || (project.latitude && project.longitude));
  // Le hero montre la photo, ou l'une des deux vues : la carte Google, ou Street View.
  const [vue, setVue] = useState(null); // null | "maps" | "street"
  const streetView = vue === "street";
  const vueMaps = vue === "maps";
  const basculerVue = (v) => setVue((x) => (x === v ? null : v));
  // La pièce ouverte à droite quand on clique une case.
  const [piece, setPiece] = useState(null);
  const cases = useCasesProjet(project, isPublic);
  const enPlace = cases?.locataire?.find((c) => c.id === "en_place");
  const [ongletChoisi, setOngletActif] = useState("marche");
  // Le panneau d'édition choisit la section : la page la suit.
  useEffect(() => { if (ongletDemande) setOngletActif(ongletDemande); }, [ongletDemande]);
  const ongletActif = apercuOnglet || ongletChoisi;

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

  // Une valeur forcée dans l'éditeur l'emporte sur le calcul, et se
  // répercute sur ce qui en découle (rendement, prix au m²).
  const prixRevientCalcule = nombreForce(project, "prix_revient") ?? (prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + (commissionAgentInclusFAI ? 0 : honorairesCA)
    : project.sim_prix_revient && project.sim_prix_revient > 0 ? project.sim_prix_revient : project.prix_acquisition || 0);

  const loyerAnnuel = project.sim_loyer_initial_ht || project.loyer_annuel_ht || 0;

  // Le vrai rendement net vient du simulateur complet (loyers nets de
  // charges, moyenné sur la durée de détention) : on le préfère toujours
  // quand il existe. Le calcul au loyer de la première année n'est qu'un
  // repli, pour un projet qui n'est pas encore passé par le simulateur.
  const rendementLocatifNetCalcule = nombreForce(project, "rendement_net") ?? (project.sim_rendement_locatif_global_net > 0
    ? project.sim_rendement_locatif_global_net
    : prixRevientCalcule > 0 && loyerAnnuel > 0 ? (loyerAnnuel / prixRevientCalcule) * 100 : 0);

  // Clé Embed API extraite en variable d'environnement (VITE_GOOGLE_MAPS_API_KEY).
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
  // L'adresse d'abord, avec la ville du projet : les coordonnées enregistrées
  // sont parfois le centre de la commune (l'Hôtel de Ville au lieu du local).
  const adresseCarte = adresseAChercher(project);
  const mapUrl = !mapsKey ? null :
    adresseCarte ?
    `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${encodeURIComponent(adresseCarte)}&zoom=15` :
    project.latitude && project.longitude ?
    `https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${project.latitude},${project.longitude}&zoom=15` :
    null;

  const googleMapsLink = adresseCarte ?
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresseCarte)}` :
    project.latitude && project.longitude ?
    `https://www.google.com/maps?q=${project.latitude},${project.longitude}` :
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
      className="projet-editorial k-sobre font-projet min-h-screen text-encre overflow-x-clip">

      {/* Le carrousel en grand : toutes les photos, on avance à la main
          (flèches à l'écran ou du clavier), jamais tout seul. */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent
          className="max-w-[100vw] max-h-[100vh] w-screen h-screen max-md:h-[100dvh] max-md:max-h-[100dvh] p-0 bg-black/90 border-none [&>button]:hidden"
          onKeyDown={(e) => {
            const liste = photosVivantes;
            const n = liste.indexOf(selectedImage);
            if (liste.length < 2 || n < 0) return;
            if (e.key === "ArrowRight") setSelectedImage(liste[(n + 1) % liste.length]);
            if (e.key === "ArrowLeft") setSelectedImage(liste[(n - 1 + liste.length) % liste.length]);
          }}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <button type="button" onClick={() => setSelectedImage(null)} aria-label="Fermer"
              className="absolute top-6 right-6 max-md:top-[max(12px,env(safe-area-inset-top))] max-md:right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
              <X className="h-5 w-5" />
            </button>
            {photosVivantes.length > 1 && (
              <>
                <button type="button" aria-label="Photo précédente"
                  onClick={() => { const n = photosVivantes.indexOf(selectedImage); setSelectedImage(photosVivantes[(n - 1 + photosVivantes.length) % photosVivantes.length]); }}
                  className="absolute left-6 max-md:left-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button type="button" aria-label="Photo suivante"
                  onClick={() => { const n = photosVivantes.indexOf(selectedImage); setSelectedImage(photosVivantes[(n + 1) % photosVivantes.length]); }}
                  className="absolute right-6 max-md:right-2 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors">
                  <ChevronRight className="h-6 w-6" />
                </button>
                <span className="absolute bottom-6 max-md:bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-[13px] text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {photosVivantes.indexOf(selectedImage) + 1} / {photosVivantes.length}
                </span>
              </>
            )}
            {selectedImage && <img src={selectedImage} alt="Photo agrandie" className="max-w-[90vw] max-h-[86vh] object-contain rounded-[12px]" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Le hero (maquette du 28 septembre) : la photo dans une carte arrondie,
          des pilules en verre en haut, l'étape et le titre en bas à gauche, et
          une carte en verre pour les deux chiffres et le simulateur. Masqué en
          aperçu d'onglet seulement : l'éditeur montre la page entière. */}
      {!apercuOnglet && (
      <div className="px-4 pt-4 max-md:px-3 max-md:pt-3">
      <div className="relative flex min-h-[440px] max-md:min-h-[380px] flex-col gap-8 max-md:gap-6 overflow-hidden rounded-[18px] bg-relief pt-5 pb-6 pl-10 pr-6 max-md:px-4 max-md:pb-4">
        {streetView ? (
          <StreetViewRue project={project} />
        ) : vueMaps && mapUrl ? (
          // Toute la carte, jusqu'en haut : les boutons flottent dessus, à droite,
          // et le retour aux projets s'efface pour laisser la fiche du lieu lisible.
          <iframe src={mapUrl} className="absolute inset-0 h-full w-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" title="Carte Google du projet" allowFullScreen />
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
          <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(135deg, rgb(var(--k-encre-rgb) / .05) 0 12px, rgb(var(--k-encre-rgb) / .02) 12px 24px)" }} />
        )}
        {/* En Street View comme sur la carte, ni voile ni habillage : la vue se manipule. */}
        {!vue && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)" }} />
        )}

        <div className="pointer-events-none relative -ml-4 flex items-center justify-between gap-3 max-md:ml-0 max-md:items-start [&_button]:pointer-events-auto">
          {!modeEdition && !isPublic && !vueMaps ? (
            <button
              onClick={() => navigate(createPageUrl(isAdmin && !showAsClient ? "AdminProjets" : "MesProjets"))}
              className="k-verre inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px]"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Projets
            </button>
          ) : <span />}
          {/* Au téléphone, quatre pilules ne tiennent pas sur 300 px : elles
              passent à la ligne, calées à droite. */}
          <div className="flex gap-2 items-center max-md:flex-wrap max-md:justify-end max-md:min-w-0">
            {modeEdition && onPhotos && (
              <button onClick={onPhotos} className="k-verre inline-flex h-8 items-center rounded-full px-3.5 text-[13px]">Photos</button>
            )}
            {mapUrl && (
              <button onClick={() => basculerVue("maps")} aria-pressed={vueMaps} className="k-verre inline-flex h-8 items-center rounded-full px-3.5 text-[13px]">
                {vueMaps ? "Fermer la carte" : "Vue Maps"}
              </button>
            )}
            {mapsKey && rueDisponible && (
              <button onClick={() => basculerVue("street")} aria-pressed={streetView} className="k-verre inline-flex h-8 items-center rounded-full px-3.5 text-[13px]">
                {streetView ? "Fermer Street View" : "Street View"}
              </button>
            )}
            {/* Le compteur fait avancer la photo du hero, à la main. */}
            {!vue && photosVivantes.length > 1 && (
              <button
                onClick={() => setIndexPhoto((i) => (i + 1) % photosVivantes.length)}
                aria-label="Photo suivante"
                className="k-verre inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-[13px]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {(indexPhoto % photosVivantes.length) + 1} / {photosVivantes.length}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Habillage masqué en Street View pour laisser le panorama réactif :
            le titre à gauche, les deux chiffres à droite, à même la photo. */}
        <div className={`k-sur-photo pointer-events-none relative mt-auto flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pb-2 pr-4 max-md:pr-0 [&_button]:pointer-events-auto [&_input]:pointer-events-auto ${vue ? "hidden" : ""}`} style={{ color: "white" }}>
          <div className="flex-[1_1_360px] min-w-0 max-w-[760px]">
            <h1 className="m-0 text-[40px] max-md:text-[28px] font-medium leading-[1.1] tracking-[-0.02em]" style={{ textWrap: "pretty", color: "white" }}>
              <ValeurEditable champ="titre" type="text">{project.titre}</ValeurEditable>
            </h1>
            {/* L'adresse, modifiable sur place dans l'éditeur (la carte et le secteur en partent). */}
            {modeEdition && onChamp && (
              <p className="m-0 mt-2 text-[15px] text-white/80">
                <ValeurEditable champ="adresse_complete" type="text" titre="Adresse du bien">{project.adresse_complete || "Ajouter l'adresse du bien"}</ValeurEditable>
              </p>
            )}
          </div>
          <Bloc id="hero-chiffres" titre="Prix de revient et rendement">
          <div className="flex gap-12 max-md:gap-8" style={{ fontVariantNumeric: "tabular-nums" }}>
            <div className="flex flex-col gap-1.5">
              <span className="text-[40px] max-md:text-[26px] leading-[1.1] tracking-[-0.02em] whitespace-nowrap"><ValeurForcee cle="prix_revient">{formatCurrency(prixRevientCalcule)}</ValeurForcee></span>
              <span className="text-[13px] text-white/75">Prix de revient</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[40px] max-md:text-[26px] leading-[1.1] tracking-[-0.02em] text-menthe whitespace-nowrap"><ValeurForcee cle="rendement_net">{rendementLocatifNetCalcule > 0 ? `${rendementLocatifNetCalcule.toFixed(2).replace('.', ',')} %` : "—"}</ValeurForcee></span>
              <span className="text-[13px] text-white/75">Rendement net</span>
            </div>
          </div>
          </Bloc>
        </div>
      </div>
      </div>
      )}

      <div className={apercuOnglet
        ? "px-3 py-3"
        : "px-[clamp(20px,4vw,56px)] pt-7 pb-[72px] max-md:px-4"}>
        <div className="min-w-0">
        <Tabs value={ongletActif} onValueChange={(v) => { setOngletActif(v); onOngletChange?.(v); }} className="w-full">
          {!apercuOnglet && (
          // La barre reste en haut au défilement, sans bande de fond : seules
          // les deux pilules, en verre, passent au-dessus du contenu.
          // Page publique : pas de barre du haut au téléphone, la barre colle en haut.
          // Au téléphone, une seule rangée : les onglets défilent, le
          // simulateur garde sa place à droite sous un nom court.
          <div className={`sticky top-0 ${isPublic ? "" : "max-md:top-[var(--k-haut-mobile,3.5rem)]"} z-30 -mx-2 mb-10 max-md:mb-7 flex flex-wrap max-md:flex-nowrap items-center justify-between gap-4 max-md:gap-2 px-2 py-3`}>
          <TabsList className="h-auto max-w-full max-md:min-w-0 max-md:flex-shrink inline-flex justify-start gap-1 overflow-x-auto rounded-full border border-trait bg-surface-pleine/60 backdrop-blur-xl p-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
            {[
              { v: "marche", l: "Marché" },
              { v: "bien", l: "Bien" },
              { v: "locataire", l: "Locataire" },
              { v: "bail", l: "Analyse du bail" },
              { v: "copropriete", l: "Copropriété" },
              { v: "documents_projet", l: "Documents" },
              // Onglets ajoutés par l'éditeur (simulateur…) : la barre les
              // affiche, leur contenu est rendu par le parent.
              ...ongletsSupplementaires.map((o) => ({ v: o.value, l: o.label })),
            ].map(({ v, l }) => (
              <TabsTrigger key={v} value={v} className="h-9 rounded-full border-0 bg-transparent px-4 py-0 text-[14px] normal-case tracking-normal whitespace-nowrap text-craie shadow-none transition-colors hover:text-encre data-[state=active]:bg-encre data-[state=active]:text-fond data-[state=active]:shadow-none after:hidden">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="max-md:flex-shrink-0 rounded-full border border-trait bg-surface-pleine/60 backdrop-blur-xl p-[5px]">
            <button
              onClick={isPublic ? openPublicSimulator : () => navigate(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`)}
              className="h-9 rounded-full bg-menthe px-4 max-md:px-3.5 text-[14px] text-sur-menthe hover:bg-menthe-survol transition-colors max-md:whitespace-nowrap"
            >
              <span className="max-md:hidden">Simulateur complet →</span>
              <span className="md:hidden">Simulateur</span>
            </button>
          </div>
          </div>
          )}

          <TabsContent value="marche">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <MarcheProjet project={project} isPublic={isPublic} prixM2Revient={prixM2Revient} loyerM2={loyerM2} />

              <Bloc id="marche-notes" titre="Notes du marché"><NotesBlock notes={[...(project.notes_secteur || []), ...(project.notes_marche || [])]} /></Bloc>

              {!project.ville_habitants_agglo && !project.ville_revenu_median && !project.adresse_complete
                && !project.marche_prix_m2_median && !project.marche_offre_moyenne && !project.marche_baux_moyenne
                && !project.notes_secteur?.length && !project.notes_marche?.length && <EmptyTab />}
              {/* Les champs ajoutés dans l'ancien onglet Secteur vivent ici désormais. */}
              <ChampsPersonnalises zone="secteur" project={project} />
              <ChampsPersonnalises zone="marche" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bien">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader title="Bien" />
              <BienProjet project={project} friseLue={cases?.frise} />
            </motion.div>
          </TabsContent>

          <TabsContent value="locataire">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Locataire"
              />

              <LocataireProjet project={project} friseLue={cases?.frise} />

              <Bloc id="locataire-liens" titre="Liens du locataire" className="mt-5">
                <LocataireLiensSociaux liens={project.liens_locataire} />
              </Bloc>

              {project.bilans_locataire && project.bilans_locataire.length > 0 && (
                <Bloc id="locataire-bilans" titre="Santé financière"><DataTable
                  label="Santé financière — comptes déposés"
                  head={['Exercice', 'Document', '']}
                  align={['left', 'left', 'right']}
                  rows={[...project.bilans_locataire].sort((a, b) => (b.annee || '').localeCompare(a.annee || '')).map((bilan) => [
                    bilan.annee || '—',
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-craie hover:text-menthe-clair transition-colors">{bilan.nom}</a> },
                    { value: <a href={bilan.url} target="_blank" rel="noopener noreferrer" className="text-menthe-clair text-[12.5px] hover:text-encre transition-colors">Télécharger</a> },
                  ])}
                /></Bloc>
              )}

              <Bloc id="locataire-notes" titre="Notes du locataire"><NotesBlock notes={project.notes_locataire} /></Bloc>

              {!project.nom_locataire && !project.activite_locataire && loyerAnnuel <= 0 && !project.echeance_bail
                && (!project.notes_locataire || project.notes_locataire.length === 0) && <EmptyTab />}
              <ChampsPersonnalises zone="locataire" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="bail">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <VueBail cases={cases} project={project} onSource={setPiece} />
            </motion.div>
          </TabsContent>

          <TabsContent value="copropriete">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Copropriété"
              />

              {(modeEdition || (cases?.copropriete || []).some((c) => c.valeur)
                || Object.entries(project?.cases_forcees || {}).some(([cle, f]) => cle.startsWith("copropriete.") && f?.valeur)) && (
              <Bloc id="copro-pv" titre="PV d'assemblée générale">
              <Carte className="mb-5 p-7 max-md:p-5">
                <SectionLabel>PV d'assemblée générale</SectionLabel>
                <TableauAG cases={cases?.copropriete} project={project} />
                {/* Les impayés ne sont pas une résolution : ils restent une case. */}
                <div className="mt-5">
                  <BandesCases zone="copropriete" cases={(cases?.copropriete || []).filter((c) => c.id === "impayes_copro")} project={project} />
                </div>
              </Carte>
              </Bloc>
              )}

              <Bloc id="copro-chiffres" titre="Chiffres de la copropriété">
              <KpiStrip items={[
                project.quote_part_lot > 0 && { value: `${project.quote_part_lot} %`, label: 'Quote-part du lot', champ: 'quote_part_lot' },
                project.charges_copropriete > 0 && { value: `${fmtNum(project.charges_copropriete)} €`, label: 'Charges annuelles', champ: 'charges_copropriete' },
                project.provision_charges > 0 && { value: `${fmtNum(project.provision_charges)} €`, label: 'Provision pour charges', champ: 'provision_charges' },
                project.taxe_fonciere_an > 0 && { value: `${fmtNum(project.taxe_fonciere_an)} €`, label: 'Taxe foncière /an', accent: 'text-menthe', champ: 'taxe_fonciere_an' },
                project.type_construction && { value: project.type_construction, label: 'Type de construction', champ: 'type_construction', typeChamp: 'text' },
              ]} />
              </Bloc>

              {(project.activites_autorisees || project.activites_interdites) && (
                <div className="grid md:grid-cols-2 gap-5 mb-5">
                  {project.activites_autorisees && (
                    <Bloc id="copro-autorisees" titre="Activités autorisées">
                    <Carte className="p-7 max-md:p-5 h-full">
                      <SectionLabel>Activités autorisées</SectionLabel>
                      <TexteEditable champ="activites_autorisees">
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_autorisees.split(',').map((a, idx) => (
                          <li key={idx} className="text-[15px] text-craie">{a.trim()}</li>
                        ))}
                      </ul>
                      </TexteEditable>
                    </Carte>
                    </Bloc>
                  )}
                  {project.activites_interdites && (
                    <Bloc id="copro-interdites" titre="Activités interdites">
                    <Carte className="p-7 max-md:p-5 h-full">
                      <SectionLabel>Activités interdites</SectionLabel>
                      <TexteEditable champ="activites_interdites">
                      <ul className="space-y-2.5 list-none pl-0 mb-0">
                        {project.activites_interdites.split(',').map((a, idx) => (
                          <li key={idx} className="text-[15px] text-craie">{a.trim()}</li>
                        ))}
                      </ul>
                      </TexteEditable>
                    </Carte>
                    </Bloc>
                  )}
                </div>
              )}

              {project.synthese_assemblee_generale && project.synthese_assemblee_generale.trim() && (
                <Bloc id="copro-synthese" titre="Synthèse de l'assemblée générale">
                <Carte className="mb-5 p-7 max-md:p-5">
                  <SectionLabel>Synthèse de l'assemblée générale</SectionLabel>
                  <TexteEditable champ="synthese_assemblee_generale"><p className="text-[15px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.synthese_assemblee_generale}</p></TexteEditable>
                </Carte>
                </Bloc>
              )}

              {(project.resolutions_votees || project.resolutions_refusees) && (
                <div className="grid md:grid-cols-2 gap-5 mb-5">
                  {project.resolutions_votees && (
                    <Bloc id="copro-votees" titre="Résolutions votées">
                    <Carte className="p-7 max-md:p-5 h-full">
                      <SectionLabel>Résolutions votées</SectionLabel>
                      <TexteEditable champ="resolutions_votees"><p className="text-[15px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.resolutions_votees}</p></TexteEditable>
                    </Carte>
                    </Bloc>
                  )}
                  {project.resolutions_refusees && (
                    <Bloc id="copro-refusees" titre="Résolutions non acceptées">
                    <Carte className="p-7 max-md:p-5 h-full">
                      <SectionLabel>Résolutions non acceptées</SectionLabel>
                      <TexteEditable champ="resolutions_refusees"><p className="text-[15px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.resolutions_refusees}</p></TexteEditable>
                    </Carte>
                    </Bloc>
                  )}
                </div>
              )}

              <Bloc id="copro-ag" titre="Assemblées générales"><AssembleesGeneralesSection project={project} isAdmin={isAdmin && !showAsClient} showAsClient={showAsClient} /></Bloc>
              <Bloc id="copro-notes" titre="Notes de la copropriété"><NotesBlock notes={project.notes_libres} /></Bloc>

              {project.charges_copropriete <= 0 && !project.type_construction && project.taxe_fonciere_an <= 0
                && project.provision_charges <= 0 && project.quote_part_lot <= 0
                && !project.activites_autorisees && !project.activites_interdites
                && !project.synthese_assemblee_generale && <EmptyTab />}
              <ChampsPersonnalises zone="copropriete" project={project} />
            </motion.div>
          </TabsContent>

          <TabsContent value="documents_projet">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              <TabHeader
                title="Documents"
              />
              {modeEdition && editeurDocuments}

              {project.fichiers_projet && project.fichiers_projet.length > 0 ? (
                <Bloc id="documents-liste" titre="Documents">
                <Carte className="overflow-hidden">
                  {project.fichiers_projet.map((fichier, idx) => (
                    <a key={idx} href={fichier.url} target="_blank" rel="noopener noreferrer"
                      className={`flex items-center justify-between gap-4 px-7 py-4 max-md:px-5 group hover:bg-relief transition-colors ${idx > 0 ? "border-t border-trait" : ""}`}>
                      <div className="flex items-center gap-4 min-w-0">
                        <FileText className="w-4 h-4 text-menthe flex-shrink-0" />
                        <span className="text-[15px] text-encre truncate group-hover:text-menthe-clair transition-colors">{fichier.nom}</span>
                      </div>
                      <span className="flex items-center gap-2 text-[12.5px] text-ardoise group-hover:text-menthe-clair transition-colors flex-shrink-0">
                        Télécharger <Download className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  ))}
                </Carte>
                </Bloc>
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