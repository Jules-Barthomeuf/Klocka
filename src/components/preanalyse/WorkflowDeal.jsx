import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, Briefcase, Check, Clock, Download, ExternalLink, Eye, Film, FlaskConical, FolderCheck,
  ChevronLeft, ChevronRight, Loader2, Lock, Mail, Microscope, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Bandeau, CarteLot, DialogMailIntention, JournalSuivi, sansVerdict,
} from "@/components/preanalyse/DealResultat";
import SectionDocumentsDeal from "@/components/preanalyse/SectionDocumentsDeal";
import ChatDossier from "./ChatDossier";
import BoutonMonday from "@/components/BoutonMonday";
import DocumentsDossier from "./DocumentsDossier";
import { GABARITS } from "./gabaritsMail";
import PenseeIA from "@/components/PenseeIA";
import { demanderNotifications, prevenir } from "@/lib/notifications";
import GrilleCriteres from "@/components/preanalyse/GrilleCriteres";
import SectionBien from "@/components/preanalyse/SectionBien";
import ValeurLocativeDataB from "@/components/preanalyse/ValeurLocativeDataB";
import AnalyseLoyerEquimmox from "@/components/preanalyse/AnalyseLoyerEquimmox";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";

// Les parties de l'analyse : une par famille de pièces.
// Une partie par famille de pièces ; chaque tableau d'une partie a son cadre.
// Le bien et le simulateur ouvrent la série, à gauche du bail.
const GRILLES_ANALYSE = [
  { id: "bien", titre: "Bien", grilles: null },
  { id: "simulateur", titre: "Simulateur", grilles: null },
  { id: "bail", titre: "Bail", grilles: [{ id: "bail", titre: "Bail" }] },
  { id: "quittances", titre: "Quittances", grilles: [{ id: "quittances", titre: "Quittances", sousTitre: "La situation actuelle, tirée des quittances." }] },
  { id: "copropriete", titre: "Copropriété", grilles: [
    { id: "pv_ag", titre: "PV d'AG", sousTitre: "Les procès-verbaux d'assemblée : travaux, résolutions, impayés." },
    { id: "rcp", titre: "Règlement de copropriété", sousTitre: "Activités autorisées ou non, quote-part." },
  ] },
  { id: "diagnostics", titre: "Diagnostics", grilles: [{ id: "diagnostics", titre: "Diagnostics", sousTitre: "L'état du bien, diagnostic par diagnostic." }] },
  // Ce que disent les services extérieurs sur le loyer : Data-B pour la
  // fourchette de la rue, Equimmox pour les baux comparables autour.
  { id: "marche", titre: "Marché", grilles: null },
];
import { Tiroir } from "@/components/preanalyse/MatriceDossier";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";

// Workflow d'un deal en cinq étapes, sur une seule page :
//
//   1. Mail        — écrire à l'agent pendant l'appel… ou passer l'étape
//   2. Pré-analyse — la fiche décortiquée, décision Oui / Non à la fin
//   3. Documents   — analyse de tous les documents (dépôt, extraction, Drive, synthèse)
//   4. Plateforme  — entrée dans la plateforme (projet pré-rempli), puis le teaser vidéo
//   5. Présentation — dossier banque
//
// Le workflow existe avant même le deal : sans dossier, seules les étapes 1 et
// 2 sont ouvertes ; l'analyse (étape 2) crée le deal et déroule la suite.

// Miroir de server/deal/etapes.js — le déblocage (etape_max) vient du serveur.
const ETAPES = [
  { n: 1, id: "mail", label: "Mail", sub: "agent" },
  { n: 2, id: "preanalyse", label: "Pré-analyse", sub: "fiche du bien" },
  { n: 3, id: "analyse", label: "Analyse", sub: "documents et décision" },
  { n: 4, id: "plateforme", label: "Plateforme", sub: "création du projet, puis vidéo" },
  { n: 5, id: "presentation", label: "Présentation", sub: "dossier banque" },
];

// En-tête numéroté d'une étape : « 01 · Titre » + description, comme la maquette.
export function TitreEtape({ n, titre, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3.5 mb-1.5">
        {n != null && <div className="text-xs text-[#9298a6] tabular-nums">{String(n).padStart(2, "0")}</div>}
        <h2 className="m-0 text-[22px] font-medium text-[#f2f3f5]">{titre}</h2>
      </div>
      {description && <p className="m-0 text-[13.5px] text-[#9298a6] leading-[1.65]">{description}</p>}
    </div>
  );
}

// La dernière étape réellement faite : c'est là qu'on arrive quand rien n'a
// été gardé. Présentation si elle a été générée, Plateforme si le projet
// existe, Analyse dès qu'il y a des pièces, Pré-analyse dès qu'il y a un lot.
function etapeCompletee(dossier) {
  if (!dossier) return 1;
  if (dossier.lots?.[0]?.presentation) return 5;
  if (dossier.projet_id) return 4;
  if ((dossier.documents_espace || []).length) return 3;
  if (dossier.lots?.length) return 2;
  return 1;
}

// Étape la plus avancée déverrouillée selon le statut.
// L'étape atteinte vient du serveur (etape_max, débloquée explicitement).
function etapeDebloquee(dossier) {
  // Sans dossier (dépôt direct d'une fiche), mail et pré-analyse sont ouvertes.
  if (!dossier) return 2;
  // Un dossier créé nommé commence à l'étape 1 : le mail à l'agent est la
  // première chose à faire, avant même d'avoir une fiche à analyser.
  return Math.min(ETAPES.length, Math.max(1, Number(dossier.etape_max) || 1));
}

/**
 * @param dossier   deal complet, ou null pour un nouveau deal
 * @param onAnalyse (dossier) => void — appelé quand l'analyse crée le deal
 * @param onSaisie  (lotIndex, saisie) => void
 * @param enCours   bool — réévaluation en cours
 * @param onRefresh () => void
 * @param apercu    bool — mode aperçu : les cinq étapes sont ouvertes et
 *                  aucune action n'est exécutée (voir dossierDemo.js)
 */
export default function WorkflowDeal({ dossier, onAnalyse, onSaisie, enCours, onRefresh, apercu = false }) {
  const abandonne = dossier?.statut === "abandonne";
  // En aperçu, tout est déverrouillé pour parcourir les écrans librement.
  const debloquee = apercu ? ETAPES.length : etapeDebloquee(dossier);
  // On revient sur le dossier là où on l'a laissé : l'étape ouverte en dernier
  // est gardée par dossier. Sans mémoire, l'étape la plus avancée fait foi.
  const cleEtape = dossier?.deal_id ? `klocka_etape_${dossier.deal_id}` : null;
  const [etape, setEtapeBrut] = useState(() => {
    if (apercu) return 1;
    try {
      const gardee = cleEtape ? Number(localStorage.getItem(cleEtape)) : 0;
      if (gardee >= 1 && gardee <= debloquee) return gardee;
    } catch { /* sans mémoire */ }
    return Math.min(debloquee, etapeCompletee(dossier));
  });
  const setEtape = (n) => {
    setEtapeBrut(n);
    try { if (cleEtape && !apercu) localStorage.setItem(cleEtape, String(n)); } catch { /* sans mémoire */ }
  };
  const [preuveGrille, setPreuveGrille] = useState(null);
  const [grilleAnalyse, setGrilleAnalyse] = useState(() => { try { return localStorage.getItem("klocka_grille_analyse") || "bail"; } catch { return "bail"; } });
  useEffect(() => { try { localStorage.setItem("klocka_grille_analyse", grilleAnalyse); } catch { /* sans mémoire */ } }, [grilleAnalyse]);
  const [deblocageEnCours, setDeblocageEnCours] = useState(false);
  // Documents cochés dans l'étape Analyse, soumis au chat.
  const [documentsCoches, setDocumentsCoches] = useState([]);
  const [ongletAnalyse, setOngletAnalyse] = useState("dossier");
  // Étape Mail : brouillon rédigé depuis le chat du haut.
  const [brouillonMail, setBrouillonMail] = useState(null);
  // Étape Pré-analyse : le chat lance l'analyse (texte collé ou fichier).
  // Arrêter la pré-analyse : le contrôleur vit le temps d'une requête.
  const arretAnalyse = useRef(null);
  const analyserFiche = useMutation({
    mutationFn: async ({ fichier, texte }) => {
      arretAnalyse.current = new AbortController();
      const form = new FormData();
      if (fichier) form.append("fichier", fichier);
      if (texte) form.append("texte", texte);
      // Un dossier nommé existe déjà : l'analyse le remplit au lieu d'en créer un.
      if (dossier?.deal_id) form.append("deal_id", dossier.deal_id);
      return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true, signal: arretAnalyse.current.signal });
    },
    onSuccess: (d) => {
      toast.success(d.multi_lots ? `${d.lots.length} lots analysés` : "Fiche analysée");
      onAnalyse?.(d);
      onRefresh?.();
    },
    onError: (e) => e?.name === "AbortError" ? null : toast.error(e?.message || "Analyse impossible"),
  });

  // Étape Analyse : extraire les documents cochés, sans prompt.
  const extraire = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extraire`, {
        body: { documents: documentsCoches },
      }),
    onSuccess: (tables) => {
      const total = (tables || []).reduce((n, t) => n + (t.lignes?.length || 0), 0);
      toast.success(`${tables.length} document${tables.length > 1 ? "s" : ""} extrait${tables.length > 1 ? "s" : ""} — ${total} donnée${total > 1 ? "s" : ""}`);
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Extraction impossible"),
  });

  const composerMail = useMutation({
    mutationFn: (prompt) => base44.functions.invoke("composeMail", { prompt }),
    onSuccess: (r) => {
      if (!r?.success) return toast.error(r?.error || "Composition impossible");
      setBrouillonMail({
        to: (r.draft.to || []).join(", "),
        subject: r.draft.subject || "",
        body: r.draft.body || "",
      });
      if (r.warnings?.length) toast.warning(r.warnings[0]);
    },
    onError: (e) => toast.error(e?.message || "Composition impossible"),
  });

  // Changer de dossier reprend l'étape gardée pour lui ; à défaut, ou si elle
  // n'est plus accessible, le front débloqué fait foi.
  useEffect(() => {
    if (apercu) return;
    const front = etapeDebloquee(dossier);
    let gardee = 0;
    try { gardee = cleEtape ? Number(localStorage.getItem(cleEtape)) : 0; } catch { /* sans mémoire */ }
    setEtapeBrut(gardee >= 1 && gardee <= front ? gardee : Math.min(front, etapeCompletee(dossier)));
  }, [dossier?.deal_id, dossier?.etape_max]);

  // Aller à une étape non atteinte la débloque — et valide automatiquement
  // toutes les précédentes (etape_max = cible, côté serveur).
  const passerVersEtape = async (cible) => {
    if (!dossier || apercu) return;
    setDeblocageEnCours(true);
    try {
      const r = await base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/etape-suivante`, {
        body: cible ? { etape: cible } : {},
      });
      setEtape(cible || r.etape_max);
      onRefresh?.();
    } catch (e) {
      toast.error(e?.message || "Passage à l'étape impossible");
    } finally {
      setDeblocageEnCours(false);
    }
  };
  const passerEtapeSuivante = () => passerVersEtape(null);

  const lot = dossier?.lots?.[0];
  const aRelancer =
    dossier?.statut === "documents_demandes" &&
    dossier.relance_prevue_le &&
    new Date(dossier.relance_prevue_le) <= new Date();

  return (
    <div className="space-y-5">
      {apercu && (
        <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 flex items-start gap-2 text-sm text-sky-200/90">
          <Eye className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Mode aperçu — dossier fictif, toutes les étapes sont ouvertes pour visiter les écrans.
            Aucune action n'est exécutée et rien n'est enregistré.
          </span>
        </div>
      )}

      {dossier?.test && !apercu && <BandeauTest dossier={dossier} />}

      {abandonne && !apercu && (
        <Bandeau
          type="alerte"
          items={["Dossier abandonné et archivé. Les étapes restent consultables, les actions sont désactivées."]}
        />
      )}

      {/* En-tête du dossier : nom, repères, actions */}
      {dossier && (
        <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-[#1f2228]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[34px] max-md:text-[24px] font-semibold tracking-[-.01em] text-[#f2f3f5] truncate">
                {dossier.titre || dossier.nom || dossier.lots?.[0]?.synthese?.titre || dossier.source?.nom_fichier || "Sans nom"}
              </h1>
              {aRelancer && (
                <Badge className="bg-red-500/15 text-red-300 border-red-500/30 flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" /> À relancer
                </Badge>
              )}
            </div>
          </div>
          {!apercu && (
            <div className="flex items-center gap-2.5 flex-shrink-0 max-md:flex-wrap max-md:flex-shrink max-md:justify-end">
              {dossier && (
                <BoutonMonday dealId={dossier.deal_id} dejaPose={!!dossier.monday_item_id} />
              )}
              <Button
                onClick={() => {
                  if (!window.confirm("Abandonner ce dossier ? Il restera consultable.")) return;
                  base44
                    .request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/abandonner`)
                    .then(() => { toast.success("Dossier abandonné"); onRefresh?.(); })
                    .catch((e) => toast.error(e?.message || "Abandon impossible"));
                }}
                disabled={abandonne || dossier.statut === "projet_cree"}
                title="Classer le dossier sans suite : il reste consultable, il n'avance plus"
                className="bg-transparent border-0 text-[#9aa0a8] hover:text-[#e6e8eb] hover:bg-transparent h-10 px-3 text-[14px]"
              >
                Abandonner
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Le chat du dossier : questions, analyses, points à vérifier */}
      {/* Étapes du dossier — libellés seuls, sans pastilles. Toujours visibles :
          on doit pouvoir changer d'étape sans refermer la table ouverte. */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-b border-[#1f2228] mb-8">
        {ETAPES.map((e) => {
          const accessible = e.n <= debloquee;
          const active = etape === e.n;
          return (
            <button
              key={e.id}
              onClick={() => (accessible ? setEtape(e.n) : dossier && !deblocageEnCours && passerVersEtape(e.n))}
              disabled={!accessible && !dossier}
              title={accessible ? e.sub : dossier ? "Ouvrir cette étape — les précédentes seront validées" : "Analysez d'abord la fiche"}
              className={`relative text-[14px] pb-3 px-0.5 rounded-none transition-colors whitespace-nowrap
                after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#f2f3f5] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 after:ease-out
                ${active ? "after:scale-x-100 text-[#f2f3f5] font-semibold"
                  : accessible ? "text-[#8f959e] hover:text-[#c6ccd3]"
                  : "text-[#4d545d] hover:text-[#8f959e]"}`}
            >
              {e.label}
            </button>
          );
        })}
      </div>

      {/* Le chat n'a rien à faire sur Plateforme ni Présentation : là, on génère. */}
      {etape <= 3 && (
      <ChatDossier
        afficherRequetes={etape === 2 || etape === 3}
        panneauDocuments={dossier ? <DocumentsDossier dossier={dossier} coches={documentsCoches} onCocher={setDocumentsCoches} onRefresh={onRefresh} apercu={apercu} proposerDrive /> : null}
        nbDocuments={(dossier?.documents_espace || []).length}
        onOuvrirExtraction={(id) => {
          setOngletAnalyse(id);
          // Ouvrir une table depuis une autre étape emmène à l'étape Analyse,
          // sinon l'onglet change sans que rien ne s'affiche.
          if (etape !== 3 && debloquee >= 3) setEtape(3);
          requestAnimationFrame(() =>
            document.getElementById("tables-analyse")?.scrollIntoView({ behavior: "smooth", block: "start" })
          );
        }}
        dossier={dossier}
        modeMail={etape === 1}
        gabarits={GABARITS}
        onComposer={(prompt) => composerMail.mutate(prompt)}
        compositionEnCours={composerMail.isPending}
        modePreanalyse={!dossier?.lots?.length}
        onAnalyserTexte={(texte) => analyserFiche.mutate({ texte })}
        onAnalyserFichier={(fichier) => analyserFiche.mutate({ fichier })}
        analyseEnCours={analyserFiche.isPending}
        onArreter={() => arretAnalyse.current?.abort()}
        onExtraire={() => extraire.mutate()}
        extractionEnCours={extraire.isPending}
        documentsCoches={documentsCoches}
        onToutCocher={() => {
          const tous = (dossier?.documents_espace || []).map((d) => d.id);
          setDocumentsCoches(documentsCoches.length === tous.length ? [] : tous);
        }}
        onRefresh={onRefresh}
        apercu={apercu}
      />
      )}

      {/* Contenu de l'étape courante */}
      <div key={etape} className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out space-y-5">
        {etape === 1 && <EtapeMail dossier={dossier} onSuivant={() => setEtape(2)} apercu={apercu} brouillon={brouillonMail} onBrouillon={setBrouillonMail} />}
        {etape === 2 && (
          <EtapePreanalyse
            analyseParChat
            dossier={dossier}
            onAnalyse={onAnalyse}
            onSaisie={onSaisie}
            enCours={enCours}
            onRefresh={onRefresh}
            apercu={apercu}
          />
        )}
        {etape === 3 && (
          <div id="tables-analyse" className="space-y-5">
            {/* Une partie par famille de pièces : on n'affiche qu'une grille à la fois. */}
            <div className="flex gap-6 border-b border-[#1f2228]">
              {GRILLES_ANALYSE.map((g) => (
                <button key={g.id} onClick={() => setGrilleAnalyse(g.id)} className={`relative pb-3 text-[14px] transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#f2f3f5] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 ${grilleAnalyse === g.id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>{g.titre}</button>
              ))}
            </div>
            {grilleAnalyse === "bien" && <SectionBien dossier={dossier} apercu={apercu} onSaisie={(saisie) => onSaisie?.(0, saisie)} enCours={enCours} onRefresh={onRefresh} />}
            {grilleAnalyse === "marche" && (
              <div className="flex flex-col gap-4">
                <ValeurLocativeDataB dossier={dossier} lot={dossier?.lots?.[0]} apercu={apercu} onRefresh={onRefresh} />
                <AnalyseLoyerEquimmox dossier={dossier} lot={dossier?.lots?.[0]} apercu={apercu} onRefresh={onRefresh} />
              </div>
            )}
            {grilleAnalyse === "simulateur" && (
              dossier?.lots?.[0]?.simulateur
                ? <SimulateurDossier parametres={dossier.lots[0].simulateur} dealId={dossier.deal_id} lotIndex={0} onEnregistre={onRefresh} />
                : <p className="m-0 py-8 text-[13.5px] text-[#6a7180]">Le simulateur se remplit à la pré-analyse : lancez-la d'abord.</p>
            )}
            {GRILLES_ANALYSE.filter((g) => g.id === grilleAnalyse && g.grilles).map((g) => (
              <GrilleCriteres key={g.id} grilles={g.grilles} dossier={dossier} apercu={apercu} onPreuve={(p) => setPreuveGrille(p)} />
            ))}
            {preuveGrille && (
              <div className="panneau-source fixed inset-y-0 right-0 z-[60] w-full sm:w-[720px] bg-[#000000] border-l border-[#22262d] shadow-[-24px_0_60px_rgba(0,0,0,.6)] overflow-y-auto p-4">
                <Tiroir cellule={{ page: preuveGrille.page, citation: preuveGrille.citation }} ligne={{ document_id: preuveGrille.document_id, document_nom: preuveGrille.document_nom, document_url: preuveGrille.document_url }} onFermer={() => setPreuveGrille(null)} dealId={dossier?.deal_id || null} />
              </div>
            )}
          </div>
        )}
        {etape === 3 && <EtapeDecisionFinale dossier={dossier} onRefresh={onRefresh} onOui={passerEtapeSuivante} apercu={apercu} />}
        {etape === 4 && <EtapePlateforme dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
        {etape === 5 && <EtapePresentation dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
      </div>

    </div>
  );
}

// Bandeau du mode test : le cycle est réel (statuts, journal, décisions) mais
// aucun appel API ne part — mails simulés, documents fictifs, marché intact.
function BandeauTest({ dossier }) {
  const navigate = useNavigate();
  const supprimer = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}`),
    onSuccess: () => {
      toast.success("Deal de test supprimé");
      navigate("/Analyse");
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  return (
    <div className="rounded-md border border-[#96c0b8]/25 bg-[#96c0b8]/[0.06] px-4 py-3 flex flex-wrap items-center gap-2 text-sm text-amber-200/90">
      <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="flex-1 min-w-56">
        Mode test — chaque bouton agit réellement (statuts, journal, projet), mais aucun appel API
        ne part : mails simulés, documents fictifs, base marché non alimentée.
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => supprimer.mutate()}
        disabled={supprimer.isPending}
        className="text-amber-200/80 hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5 flex-shrink-0"
      >
        {supprimer.isPending ? (
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5 mr-1.5" />
        )}
        Supprimer le deal de test
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 1 — Mail : écrire à l'agent pendant l'appel… ou passer
// ---------------------------------------------------------------------------

// Gabarits de l'étape 1 : chacun pré-écrit l'instruction de composition, à
// compléter avec l'adresse du bien et le nom de l'agent.

function EtapeMail({ dossier, onSuivant, apercu, brouillon: brouillonExterne, onBrouillon }) {
  const [brouillonLocal, setBrouillonLocal] = useState(null);
  // Le brouillon vient du chat du haut quand il est piloté de là.
  const brouillon = brouillonExterne !== undefined ? brouillonExterne : brouillonLocal;
  const setBrouillon = onBrouillon || setBrouillonLocal;
  const [expediteur, setExpediteur] = useState(() => localStorage.getItem("klocka:dernier-expediteur") || "");

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
    enabled: !apercu,
  });
  const comptes = statutMail?.accounts || [];

  const envoyer = useMutation({
    mutationFn: (depuis) =>
      base44.functions.invoke("sendMail", {
        from: depuis || expediteur || undefined,
        to: brouillon.to,
        subject: brouillon.subject,
        body: brouillon.body,
        ...(dossier ? { deal_id: dossier.deal_id } : {}),
      }),
    onSuccess: (r) => {
      if (r?.success || r?.simulated) {
        toast.success(r?.simulated ? "Envoi simulé (aucun compte connecté)" : "Mail envoyé");
        setBrouillon(null);
        onSuivant?.();
      } else toast.error(r?.error || "Envoi impossible");
    },
  });

  // Sans boîte connectée, « Envoyer » ouvre d'abord la connexion Gmail : le
  // brouillon reste à l'écran et part dès que la boîte est rattachée.
  const { connecter, enCours: connexionEnCours } = useConnexionGmail((email) => {
    setExpediteur(email);
    localStorage.setItem("klocka:dernier-expediteur", email);
    envoyer.mutate(email);
  });
  const sansCompte = comptes.length === 0;
  const googleConfigure = statutMail?.google?.enabled !== false;
  // Deal de test : envoi simulé côté serveur, aucune boîte requise.
  const test = !!dossier?.test;

  // L'étape n'est « derrière nous » que si elle a été franchie : fiche reçue
  // par mail, mail déjà envoyé, ou dossier avancé au-delà de l'étape 1. Un
  // dossier tout juste créé reste sur l'écran de composition.
  const mailEnvoye = (dossier?.suivi || []).some((s) => s.type === "mail" || s.intention === "mail_agent");
  const etapeFranchie = !!dossier && (!!dossier.source_mail || mailEnvoye || (Number(dossier.etape_max) || 1) > 1);
  // Le chat du haut rédige : ici on ne montre plus que le brouillon obtenu.
  if (onBrouillon && !brouillon && !etapeFranchie) {
    return (
      <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-8 text-center">
        <p className="m-0 text-[13.5px] text-[#9298a6]">
          Décrivez le mail dans le chat ci-dessus, ou choisissez un gabarit, puis générez le brouillon.
        </p>
      </div>
    );
  }

  if (dossier && !apercu && etapeFranchie) {
    return (
      <div className="bg-[#0f1114] border border-[#1f2228] rounded-2xl px-6 py-5">
        <div className="flex items-center gap-[18px] max-md:flex-wrap">
          <span className="w-10 h-10 rounded-full bg-[#1a1d22] border border-[#3a3f4a] text-[#e6e8eb] flex items-center justify-center flex-shrink-0">
            {dossier.source_mail ? <Mail className="w-4 h-4" /> : <Check className="w-4 h-4" strokeWidth={2.2} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[#f2f3f5] text-[15px] font-semibold">
              {dossier.source_mail ? "Fiche reçue par mail" : "Étape passée"}
            </p>
            <p className="m-0 text-[#8f959e] text-[13.5px] mt-[3px] leading-relaxed">
              {dossier.source_mail
                ? `${dossier.source_mail.de || ""} — « ${dossier.source_mail.objet || ""} » le ${dossier.source_mail.date ? new Date(dossier.source_mail.date).toLocaleString("fr-FR") : "?"}`
                : `La fiche « ${dossier.source?.nom_fichier || "texte collé"} » a été déposée directement, sans échange de mail préalable dans la plateforme.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TitreEtape
        n={1}
        titre="Mail à l'agent"
        description="À écrire pendant l'appel, depuis le chat en haut de page. Le brouillon apparaît ici, prêt à relire et à envoyer depuis votre Gmail — ou passez si vous avez déjà la fiche."
      />
      {!brouillon ? (
        <div className="bg-[#000000] border border-[#1f2228] rounded-xl px-6 py-10 text-center">
          <p className="m-0 text-[13.5px] text-[#9298a6]">
            Rédigez le mail dans le chat en haut de page — un gabarit pour partir vite, puis générez.
          </p>
          <Button
            variant="ghost"
            onClick={onSuivant}
            className="text-[#9298a6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/5 mt-3"
          >
            Passer — j'ai déjà la fiche
          </Button>
        </div>
      ) : (
        <div className="bg-[#000000] border border-[#1f2228] rounded-xl overflow-hidden">
          {/* Expéditeur : la ligne d'identité du message */}
          {comptes.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#15171b]">
              <span className="text-[11px] tracking-[0.14em] uppercase text-[#6a7180] w-[74px] flex-shrink-0">De</span>
              <select
                value={expediteur || comptes[0]?.id}
                onChange={(e) => {
                  setExpediteur(e.target.value);
                  localStorage.setItem("klocka:dernier-expediteur", e.target.value);
                }}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#f2f3f5] cursor-pointer"
              >
                {comptes.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0f1114]">{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            !apercu && (
              <div className="px-5 py-4 border-b border-[#15171b]">
                <EncartConnexionGmail
                  googleConfigure={googleConfigure}
                  onConnecte={(email) => {
                    setExpediteur(email);
                    localStorage.setItem("klocka:dernier-expediteur", email);
                  }}
                />
              </div>
            )
          )}

          {/* Destinataire et objet, sur filets fins */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#15171b]">
            <label htmlFor="mail-to" className="text-[11px] tracking-[0.14em] uppercase text-[#6a7180] w-[74px] flex-shrink-0">À</label>
            <input
              id="mail-to"
              value={brouillon.to}
              onChange={(e) => setBrouillon({ ...brouillon, to: e.target.value })}
              placeholder="agent@agence.fr"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#f2f3f5] placeholder:text-[#3a3f4a]"
            />
          </div>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#15171b]">
            <label htmlFor="mail-objet" className="text-[11px] tracking-[0.14em] uppercase text-[#6a7180] w-[74px] flex-shrink-0">Objet</label>
            <input
              id="mail-objet"
              value={brouillon.subject}
              onChange={(e) => setBrouillon({ ...brouillon, subject: e.target.value })}
              placeholder="Objet du message"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#f2f3f5] placeholder:text-[#3a3f4a]"
            />
          </div>

          {/* Corps : la zone d'écriture, sans cadre dans le cadre */}
          <textarea
            value={brouillon.body}
            onChange={(e) => setBrouillon({ ...brouillon, body: e.target.value })}
            rows={14}
            placeholder="Corps du message"
            className="w-full bg-transparent border-0 outline-none resize-y px-5 py-4 text-[13.5px] leading-[1.75] text-[#c9cdd6] placeholder:text-[#3a3f4a]"
          />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-[#15171b] bg-[#0f1114]">
            <button
              onClick={() => setBrouillon(null)}
              className="text-[13px] text-[#9298a6] hover:text-[#f2f3f5] transition-colors"
            >
              Reprendre
            </button>
            <div className="flex-1" />
            <button
              onClick={onSuivant}
              className="text-[13px] text-[#9298a6] hover:text-[#f2f3f5] transition-colors px-2"
            >
              Passer sans envoyer
            </button>
            <Button
              onClick={() => (sansCompte && googleConfigure && !test ? connecter() : envoyer.mutate())}
              disabled={
                apercu ||
                !brouillon.to.trim() ||
                !brouillon.subject.trim() ||
                envoyer.isPending ||
                connexionEnCours
              }
              className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114] font-medium h-9 text-[13px]"
            >
              {(envoyer.isPending || connexionEnCours) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {test ? "Envoyer (simulé)" : sansCompte && googleConfigure ? "Connecter Gmail et envoyer" : "Envoyer via Gmail"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 2 — Pré-analyse : dépôt (nouveau deal) ou résultat, décision Oui/Non
// ---------------------------------------------------------------------------

function EtapePreanalyse({ dossier, onAnalyse, onSaisie, enCours, onRefresh, apercu, analyseParChat = false }) {
  const titre = (
    <TitreEtape n={2} titre="Pré-analyse" />
  );

  // --- Nouveau dossier, ou coquille nommée sans analyse : la fiche entre ici.
  if (!dossier || !dossier.lots?.length)
    return (
      <>
        {titre}
        {dossier?.documents_espace?.length > 0 ? (
          <PreanalyseDepuisDocuments dossier={dossier} onRefresh={onRefresh} apercu={apercu} />
        ) : analyseParChat ? (
          <div className="bg-[#000000] border border-[#1f2228] rounded-xl px-6 py-10 text-center">
            <p className="m-0 text-[13.5px] text-[#9298a6]">
              Importez un fichier ou collez l'email dans le chat pour lancer l'analyse.
            </p>
          </div>
        ) : (
          <DepotFiche onAnalyse={onAnalyse} dealId={dossier?.deal_id || null} />
        )}
      </>
    );

  // --- Deal existant : résultat + décision ---------------------------------
  return (
    <>
      {titre}
      <RelancePreanalyse dossier={dossier} onRefresh={onRefresh} apercu={apercu} />
      {dossier.source?.avertissements?.length > 0 && (
        <Bandeau type="info" items={dossier.source.avertissements} />
      )}
      {dossier.profils_configures === 0 && (
        <Bandeau
          type="alerte"
          items={[
            "Aucun profil d'acquéreur n'est encore défini dans server/deal/data/rules.json : le moteur applique les knock-outs et contrôle les données clés, mais ne peut pas conclure à un GO ferme.",
          ]}
        />
      )}
      {dossier.multi_lots && (
        <Bandeau type="info" items={[`Cette fiche décrit ${dossier.lots.length} lots, analysés séparément.`]} />
      )}
      {dossier.lots.map((lot) => (
        <CarteLot
          key={lot.index}
          lot={lot}
          dossier={dossier}
          onSaisie={(saisie) => onSaisie?.(lot.index, saisie)}
          onRefresh={onRefresh}
          enCours={enCours}
          apercu={apercu}
        />
      ))}

      {/* La décision Oui / Non clôt l'étape. */}
      <BlocDecision
        dossier={dossier}
        onRefresh={onRefresh}
        apercu={apercu}
        actif={apercu || (dossier.statut || "analyse") === "analyse"}
        intentionOui="demande_documents"
        intentionNon="refus"
        titreOui="Oui — on poursuit"
        descOui="Un mail de demande de documents (bail, PV d'AG, diagnostics…) est pré-rédigé pour l'agent. Le deal passe en attente de documents, avec relance automatique proposée."
        titreNon="Non — on s'arrête là"
        descNon="Un mail de refus courtois est pré-rédigé (« nous restons en recherche d'opportunités »). Le deal alimente la base de données marché puis part aux archives."
        descInactif="Étape dépassée — le deal a avancé sans refus ni demande de documents formelle."
      />
    </>
  );
}

function DepotFiche({ onAnalyse, dealId = null }) {
  const inputFichier = useRef(null);
  const [texte, setTexte] = useState("");

  const analyser = useMutation({
    mutationFn: async ({ fichier, texte: t }) => {
      const form = new FormData();
      if (fichier) form.append("fichier", fichier);
      if (t) form.append("texte", t);
      // Un dossier nommé existe déjà : l'analyse le remplit au lieu d'en créer un.
      if (dealId) form.append("deal_id", dealId);
      return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true });
    },
    onSuccess: (d) => {
      toast.success(d.multi_lots ? `${d.lots.length} lots analysés` : "Fiche analysée");
      onAnalyse?.(d);
    },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  const onFichier = (e) => {
    const f = e.target.files?.[0];
    if (f) analyser.mutate({ fichier: f });
    e.target.value = "";
  };

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md p-6">
      <p className="text-[#f2f3f5] text-sm font-medium mb-1">Pré-analyser la fiche</p>
      <p className="text-[#9298a6] text-xs mb-4">
        Déposez la fiche commerciale reçue de l'agent (ou collez le texte du mail) : extraction,
        vérification des citations, verdict et simulateur. Les mails reçus se préanalysent aussi en un
        clic depuis le plan de travail du dashboard.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-[#9298a6] text-xs mb-2 block">Fiche commerciale</Label>
          <button
            onClick={() => inputFichier.current?.click()}
            disabled={analyser.isPending}
            className="w-full h-[104px] border border-dashed border-[#f2f3f5]/15 rounded-md flex flex-col items-center justify-center gap-2 hover:border-[#3a3f4a] hover:bg-[#f2f3f5]/[0.02] transition-all disabled:opacity-50"
          >
            <Upload className="w-5 h-5 text-[#9298a6]" />
            <span className="text-[#9298a6] text-sm">PDF, image, .eml</span>
            <span className="text-[#6a7180] text-[11px]">Les PDF scannés sont transcrits automatiquement</span>
          </button>
          <input
            ref={inputFichier}
            type="file"
            accept=".pdf,.doc,.docx,.rtf,.jpg,.jpeg,.png,.webp,.eml,.txt,.md,.csv"
            onChange={onFichier}
            className="hidden"
          />
        </div>
        <div>
          <Label className="text-[#9298a6] text-xs mb-2 block">…ou collez le texte du mail</Label>
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={4}
            placeholder="Bonjour, je vous propose un local commercial situé…"
            className="bg-[#000000] border-[#1f2228] text-[#f2f3f5] resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button
          onClick={() => analyser.mutate({ texte })}
          disabled={!texte.trim() || analyser.isPending}
          className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114]"
        >
          {analyser.isPending ? (
            <><PenseeIA etat="searching" taille={20} clair className="mr-2" /> Analyse…</>
          ) : (
            <><Microscope className="w-4 h-4 mr-2" /> Analyser</>
          )}
        </Button>
      </div>
      {analyser.isPending && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[#f2f3f5] text-sm">Analyse Klocka</span>
            <span className="flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#f2f3f5] animate-bounce"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          </div>
          <p className="text-[#9298a6] text-xs text-center">
            Lecture, extraction, vérification des citations puis application des règles…
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloc de décision Oui / Non — partagé par les étapes 2 et 4
// ---------------------------------------------------------------------------

function BlocDecision({ dossier, onRefresh, actif, intentionOui, intentionNon, titreOui, descOui, titreNon, descNon, onOui, apercu, descInactif }) {
  const [dialogIntention, setDialogIntention] = useState(null);
  // En aperçu, les cartes sont visibles mais inertes.
  const ouvrir = (intention) => !apercu && setDialogIntention(intention);

  const changerStatut = useMutation({
    mutationFn: ({ statut, note }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/statut`, {
        body: { statut, note },
      }),
    onSuccess: () => {
      toast.success("Statut mis à jour");
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Changement de statut impossible"),
  });

  if (!actif) {
    // Décision déjà prise (ou étape hors contexte) : résumé depuis le journal.
    const abandonne = dossier.statut === "abandonne";
    const evenement = [...(dossier.suivi || [])]
      .reverse()
      .find(
        (e) =>
          e.intention === intentionOui ||
          e.intention === intentionNon ||
          e.vers === "abandonne" ||
          e.vers === "documents_demandes" ||
          e.vers === "projet_cree"
      );
    // Ni abandon, ni trace de décision : l'étape n'a simplement pas encore été
    // jouée (navigation libre) — on l'explique plutôt que d'inventer un « oui ».
    // Étape simplement pas encore jouée : rien à dire, on n'affiche rien.
    if (!abandonne && !evenement) return descInactif ? (
      <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-md bg-[#f2f3f5]/5 text-[#9298a6] flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4" />
        </span>
        <p className="text-[#9298a6] text-sm min-w-0">{descInactif}</p>
      </div>
    ) : null;

    return (
      <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
              abandonne ? "bg-red-500/15 text-red-300" : "bg-[#96c0b8]/20 text-[#c3ddd6]"
            }`}
          >
            {abandonne ? <ThumbsDown className="w-4 h-4" /> : <ThumbsUp className="w-4 h-4" />}
          </span>
          <p className="text-[#9298a6] text-sm min-w-0">
            {abandonne ? "Décision : non." : "Décision : oui."}
            {evenement && (
              <span className="text-[#6a7180]">
                {" "}
                {evenement.detail || ""} —{" "}
                {new Date(evenement.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }

  // La décision reste sous la main : deux boutons posés en bas à droite de
  // l'écran, au-dessus de la bulle d'assistant. Un clic écrit le mail.
  return (
    <>
      {/* La place que les boutons occupent : le contenu ne passe pas dessous. */}
      <div className="h-[72px]" aria-hidden />
      <div className="fixed z-40 right-5 bottom-[84px] max-md:right-3 max-md:bottom-[calc(3.5rem+env(safe-area-inset-bottom)+70px)] flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <button
          onClick={() => ouvrir(intentionNon)}
          title={`${titreNon} — ${descNon}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#9b3b32]/60 bg-[#0a0a0bee] backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,.5)] text-[#e8746a] text-[13.5px] font-semibold hover:bg-[#9b3b32]/20 hover:border-[#9b3b32] transition-colors"
        >
          <ThumbsDown className="w-4 h-4" /> Abandonner
        </button>
        <button
          onClick={() => ouvrir(intentionOui)}
          title={`${titreOui} — ${descOui}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#96c0b8] shadow-[0_10px_30px_rgba(0,0,0,.5)] text-[#0b0c0e] text-[13.5px] font-semibold hover:bg-[#abd0c8] transition-colors"
        >
          <ThumbsUp className="w-4 h-4" /> Poursuivre
        </button>
      </div>

      {dialogIntention && (
        <DialogMailIntention
          dossier={dossier}
          intention={dialogIntention}
          onClose={() => setDialogIntention(null)}
          onDone={() => {
            const etaitOui = dialogIntention === intentionOui;
            setDialogIntention(null);
            onRefresh?.();
            if (etaitOui) onOui?.();
          }}
          onArchiverSansMail={
            dialogIntention === intentionNon
              ? () => {
                  changerStatut.mutate({
                    statut: "abandonne",
                    note: intentionNon === "refus" ? "Refusé sans mail" : "Abandonné sans mail",
                  });
                  setDialogIntention(null);
                }
              : null
          }
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Étape 3 — Documents : attente, relance, dépôt, extraction, Drive, synthèse
// ---------------------------------------------------------------------------

function EtapeDocuments({ dossier, onRefresh, apercu }) {
  const [dialogIntention, setDialogIntention] = useState(null);
  const statut = dossier?.statut || "analyse";
  const aRelancer =
    statut === "documents_demandes" &&
    dossier.relance_prevue_le &&
    new Date(dossier.relance_prevue_le) <= new Date();
  // En aperçu, le bandeau d'attente est montré même si le deal fictif est déjà
  // extrait : il fait partie des écrans de l'étape.
  const montrerAttente = apercu || statut === "documents_demandes";

  const changerStatut = useMutation({
    mutationFn: ({ statut: nouveau, note }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/statut`, {
        body: { statut: nouveau, note },
      }),
    onSuccess: () => onRefresh?.(),
    onError: (e) => toast.error(e?.message || "Changement de statut impossible"),
  });

  return (
    <>
      <TitreEtape
        n={3}
        titre="Documents"
        description="Baux, PV d'AG, diagnostics : dépôt, classement dans le Drive d'équipe, extraction case par case avec page source, puis synthèse des points à vérifier."
      />
      {montrerAttente && (
        <div
          className={`rounded-md border px-5 py-4 flex flex-wrap items-center gap-3 ${
            aRelancer ? "border-red-500/25 bg-red-500/[0.06]" : "border-sky-500/25 bg-sky-500/[0.06]"
          }`}
        >
          <Clock className={`w-4 h-4 flex-shrink-0 ${aRelancer ? "text-red-300" : "text-sky-300"}`} />
          <p className={`text-sm flex-1 min-w-40 ${aRelancer ? "text-red-200/90" : "text-sky-200/90"}`}>
            {aRelancer
              ? "Les documents se font attendre : relancez l'agent."
              : dossier.relance_prevue_le
                ? `En attente des documents de l'agent — relance proposée le ${new Date(dossier.relance_prevue_le).toLocaleDateString("fr-FR")}.`
                : "En attente des documents de l'agent — une relance est proposée après quelques jours."}
          </p>
          <Button
            size="sm"
            onClick={() => !apercu && setDialogIntention("relance")}
            disabled={apercu}
            className={
              aRelancer
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-200 border-0"
                : "bg-[#f2f3f5]/5 hover:bg-[#f2f3f5]/10 text-[#c9cdd6] border-0"
            }
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Relancer l'agent
          </Button>
          <Button
            size="sm"
            onClick={() => changerStatut.mutate({ statut: "documents_recus", note: "Documents reçus" })}
            disabled={apercu || changerStatut.isPending}
            className="bg-[#f2f3f5]/[0.06] hover:bg-[#f2f3f5]/[0.1] text-[#c9cdd6] border-0"
          >
            <FolderCheck className="w-3.5 h-3.5 mr-1.5" /> Documents reçus
          </Button>
        </div>
      )}

      {/* Analyse de tous les documents : dépôt, extraction, Drive, synthèse. */}
      <SectionDocumentsDeal dossier={dossier} onRefresh={onRefresh} apercu={apercu} />

      {dialogIntention && (
        <DialogMailIntention
          dossier={dossier}
          intention={dialogIntention}
          onClose={() => setDialogIntention(null)}
          onDone={() => {
            setDialogIntention(null);
            onRefresh?.();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Étape 6 — Présentation bancaire : PPTX généré depuis le dossier, converti
// en Google Slides (modifiable) quand un compte Drive est connecté.
// ---------------------------------------------------------------------------

function EtapePresentation({ dossier, onRefresh, apercu }) {
  const pres = dossier?.lots?.[0]?.presentation;

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
    enabled: !apercu,
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;

  const generer = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/0/presentation`, {
        body: { compte: compteDrive },
      }),
    onSuccess: (r) => {
      if (r.slides_url) {
        toast.success("Présentation générée — ouverture dans Google Slides");
        window.open(r.slides_url, "_blank", "noopener");
      } else if (r.erreur_slides) {
        toast.error(`PPTX généré, mais conversion Slides impossible : ${r.erreur_slides}`);
      } else {
        toast.success("Présentation générée (PPTX)");
      }
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Génération impossible"),
  });

  return (
    <>
      <TitreEtape
        n={5}
        titre="Présentation"
        description="Le dossier de présentation bancaire du bien, généré depuis les données du deal : le bien, le bail, l'opération, le plan de financement, le marché et les points forts. Modifiable ensuite dans Google Slides."
      />

      <div className="bg-[#000000] border border-[#1f2228] rounded-md p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[#f2f3f5] text-sm font-medium mb-1">Présentation bancaire</p>
            <p className="text-[#9298a6] text-xs">
              {pres?.genere_le
                ? `Dernière génération le ${new Date(pres.genere_le).toLocaleDateString("fr-FR")} à ${new Date(pres.genere_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
                : "Un clic : le PPTX est construit puis converti en Google Slides, prêt à retoucher."}
            </p>
          </div>
          <Button
            onClick={() => generer.mutate()}
            disabled={generer.isPending || apercu}
            className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114]"
            title={apercu ? "Indisponible en mode aperçu" : undefined}
          >
            {generer.isPending ? (
              <><PenseeIA etat="composing" taille={20} clair className="mr-2" /> Génération…</>
            ) : (
              <><Briefcase className="w-4 h-4 mr-2" /> {pres ? "Regénérer" : "Générer la présentation"}</>
            )}
          </Button>
        </div>

        {pres && (
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {pres.slides_url && (
              <a href={pres.slides_url} target="_blank" rel="noopener noreferrer">
                <Button className="h-9 text-xs bg-[#f2f3f5]/[0.06] border border-[#2c3139] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5]">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Ouvrir dans Google Slides
                </Button>
              </a>
            )}
            {pres.pptx_url && (
              <a
                href={pres.pptx_url}
                download
                className="inline-flex items-center gap-2 text-xs text-[#9298a6] hover:text-[#f2f3f5] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger le PPTX
              </a>
            )}
          </div>
        )}

        {!apercu && !compteDrive && (
          <p className="text-[#9298a6] text-xs">
            Aucun compte Google Drive connecté : la présentation restera un PPTX à télécharger. Connectez un
            compte depuis le dashboard (accès Drive) pour obtenir directement un lien Google Slides modifiable.
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Teaser client (~20 s) — rendu par Remotion côté serveur.
// La vidéo n'expose que les faits (bien, chiffres, bail, ville), jamais le
// verdict ni les réserves : elle est faite pour être envoyée au client.
// ---------------------------------------------------------------------------

function BlocVideoPresentation({ dossier, apercu }) {
  const dealId = dossier?.deal_id;

  const { data: statut, refetch } = useQuery({
    queryKey: ["video-deal", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/lots/0/video`),
    enabled: !apercu && !!dealId,
    refetchInterval: (query) => (query.state.data?.etat === "en_cours" ? 3000 : false),
  });

  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/0/video`),
    onSuccess: () => {
      toast.success("Rendu lancé — environ une à deux minutes");
      refetch();
    },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });

  const etat = apercu ? "aucune" : statut?.etat || "aucune";
  const enCours = etat === "en_cours" || lancer.isPending;
  const progression = Math.round((statut?.progression || 0) * 100);

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Film className="w-4 h-4 text-[#9298a6]" />
          <div>
            <p className="text-[#f2f3f5] text-sm">Teaser client</p>
            <p className="text-[#9298a6] text-xs">
              Vingt secondes : la devanture du bien, les quatre chiffres qui décident, l'appel — à envoyer au client.
            </p>
          </div>
        </div>
        <Button
          onClick={() => lancer.mutate()}
          disabled={enCours || apercu}
          variant="outline"
          className="h-9 text-xs border-[#22262d] bg-transparent text-[#9298a6] hover:border-[#3a3f4a] hover:text-[#f2f3f5] shrink-0"
          title={apercu ? "Indisponible en mode aperçu" : undefined}
        >
          {enCours ? (
            <><PenseeIA etat="shaping" taille={20} className="mr-2" />Rendu {progression}%</>
          ) : (
            <><Film className="w-3.5 h-3.5 mr-2" />{etat === "pret" ? "Regénérer" : "Générer la vidéo"}</>
          )}
        </Button>
      </div>

      {enCours && (
        <div className="h-1 rounded bg-[#1a1d1c] overflow-hidden">
          <div
            className="h-full bg-[#96c0b8] transition-all duration-500"
            style={{ width: `${Math.max(progression, 3)}%` }}
          />
        </div>
      )}

      {etat === "erreur" && (
        <p className="text-[#e8746a] text-xs">Le rendu a échoué : {statut?.erreur || "erreur inconnue"}</p>
      )}

      {(statut?.avertissements || []).map((a) => (
        <p key={a} className="m-0 text-[12px] leading-[1.6] text-[#d9b46a] border-l-2 border-[#d9b46a]/50 pl-3">{a}</p>
      ))}

      {etat === "pret" && statut?.url && (
        <div className="space-y-3">
          <video
            key={statut.url}
            controls
            preload="metadata"
            src={statut.url}
            className="w-full rounded-md border border-[#1f2228]"
          />
          <a
            href={statut.url}
            download={`presentation-${dealId}.mp4`}
            className="inline-flex items-center gap-2 text-xs text-[#9298a6] hover:text-[#f2f3f5] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger le MP4
          </a>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 4 — Décision finale : mail Oui / Non, comme à l'étape 2
// ---------------------------------------------------------------------------

function EtapeDecisionFinale({ dossier, onRefresh, onOui, apercu }) {
  const statut = dossier?.statut || "analyse";
  const actif = apercu || statut === "depouille" || statut === "documents_recus";

  // Décision ni ouverte ni prise : le bloc n'aurait rien à dire, on le tait
  // — titre compris, plutôt qu'un en-tête suivi d'un encart vide.
  const decisionPrise =
    statut === "abandonne" ||
    (dossier?.suivi || []).some(
      (e) =>
        e.intention === "presentation_client" ||
        e.intention === "abandon" ||
        e.vers === "abandonne" ||
        e.vers === "projet_cree"
    );
  if (!actif && !decisionPrise) return null;

  return (
    <>
      {dossier.synthese_documents?.resume && (
        <div className="bg-[#000000] border border-[#1f2228] rounded-md px-5 py-4">
          <p className="text-[#9298a6] text-xs mb-2">Rappel de la synthèse documentaire</p>
          <p className="text-[#c9cdd6] text-sm leading-relaxed">{dossier.synthese_documents.resume}</p>
          {dossier.synthese_documents.points_a_verifier?.length > 0 && (
            <p className="text-[#96c0b8]/80 text-xs mt-2">
              {dossier.synthese_documents.points_a_verifier.length} point(s) à vérifier — détail à l'étape
              Documents.
            </p>
          )}
        </div>
      )}

      <BlocDecision
        dossier={dossier}
        onRefresh={onRefresh}
        actif={actif}
        apercu={apercu}
        intentionOui="presentation_client"
        intentionNon="abandon"
        titreOui="Proposer au client"
        descOui="La fiche de présentation du deal et le mail au client sont pré-rédigés avec les points clés et les réserves. Rien ne part sans validation. Puis direction l'étape Plateforme."
        titreNon="Abandonner"
        descNon="Vous donnez les raisons en une phrase ; un mail professionnel est rédigé pour l'agent. Le dossier alimente la base marché puis part aux archives."
        onOui={onOui}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Étape 4 — Plateforme : entrée du deal dans la plateforme (projet pré-rempli), puis la vidéo
// ---------------------------------------------------------------------------

function EtapePlateforme({ dossier, onRefresh, apercu }) {
  const navigate = useNavigate();
  const statut = dossier?.statut || "analyse";

  // Documents importés mais pas encore extraits : le serveur les analyse
  // avant de créer le projet — l'entrée en plateforme ne dépend plus de l'étape 3.
  const documents = dossier?.documents_espace || [];
  const analyses = dossier?.extractions || [];
  const aAnalyser = documents.length > 0 && analyses.length === 0;

  const creerProjet = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/0/projet`),
    onSuccess: (r) => {
      const details = [
        r.analyse ? `${r.analyse.documents} document(s) extrait(s), ${r.analyse.donnees} donnée(s)` : null,
        r.champs_remplis?.length ? `${r.champs_remplis.length} champ(s) pré-rempli(s)` : null,
        r.photos ? `${r.photos} image(s) du bien et de la ville` : null,
      ].filter(Boolean);
      // Une clé Maps absente ou une adresse sans Street View : on le dit, le
      // projet est créé quand même et les photos s'ajoutent à la main.
      (r.photos_raisons || []).forEach((m) => toast.message("Images automatiques", { description: m }));
      toast.success(`Projet créé : ${r.titre}`, details.length ? { description: details.join(" · ") } : undefined);
      onRefresh?.();
      navigate(`/AdminProjets?id=${r.project_id}`);
    },
    onError: (e) => toast.error(e?.message || "Création du projet impossible"),
  });

  const titre = (
    <TitreEtape n={4} titre="Plateforme" />
  );

  // Le projet existe : le deal est dans la plateforme, quel que soit le statut
  // écrit sur le dossier. Se fier au seul statut faisait reproposer la création
  // d'un projet déjà créé, qui échouait ensuite.
  if (dossier.projet_id) {
    return (
      <>
      {titre}
      <div className="bg-[#000000] border border-[#22262d] rounded-md p-6 text-center">
        <span className="w-10 h-10 rounded-md bg-[#f2f3f5]/[0.05] text-[#9298a6] flex items-center justify-center mx-auto mb-3">
          <Briefcase className="w-5 h-5" />
        </span>
        <p className="text-[#f2f3f5] text-sm font-medium mb-1">Le deal est entré dans la plateforme</p>
        <p className="text-[#9298a6] text-xs mb-4">
          Suivez l'avancement client (message envoyé, retour oui/non) depuis la fiche projet.
        </p>
        <Button
          onClick={() => navigate(`/AdminProjets?id=${dossier.projet_id}`)}
          className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114]"
        >
          <ExternalLink className="w-4 h-4 mr-2" /> Ouvrir le projet
        </Button>
      </div>
      <BlocVideoPresentation dossier={dossier} apercu={apercu} />
      </>
    );
  }

  return (
    <>
    {titre}
    <div className="bg-[#000000] border border-[#1f2228] rounded-md p-6 text-center">
      <span className="w-10 h-10 rounded-md bg-[#f2f3f5]/[0.05] text-[#9298a6] flex items-center justify-center mx-auto mb-3">
        <Briefcase className="w-5 h-5" />
      </span>
      <p className="text-[#f2f3f5] text-sm font-medium mb-1">Entrer le deal dans la plateforme</p>
      <Button
        onClick={() => creerProjet.mutate()}
        disabled={apercu || creerProjet.isPending}
        className="bg-[#f2f3f5] hover:bg-[#c9cdd6] text-[#0f1114]"
      >
        {creerProjet.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Briefcase className="w-4 h-4 mr-2" />
        )}
        {aAnalyser ? "Analyser les documents et créer le projet" : "Créer le projet pré-rempli"}
      </Button>
      {aAnalyser ? (
        <p className="text-[#6a7180] text-[11px] mt-3">
          {documents.length} document{documents.length > 1 ? "s" : ""} pas encore extrait
          {documents.length > 1 ? "s" : ""} : ils le seront à la création, ce qui peut prendre une minute.
        </p>
      ) : analyses.length > 0 ? null : (
        <p className="text-[#6a7180] text-[11px] mt-3">
          Aucun document au dossier : le projet part des seules données de la pré-analyse.
        </p>
      )}
    </div>
    </>
  );
}

// Le dossier a ses pièces mais pas de teaser : la fiche se compose depuis les
// documents, puis passe dans la pré-analyse habituelle.
function PreanalyseDepuisDocuments({ dossier, onRefresh, apercu }) {
  const dealId = dossier.deal_id;
  const nb = dossier.documents_espace.length;
  const { data: etat } = useQuery({
    queryKey: ["preanalyse-documents", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/preanalyse-documents`),
    refetchInterval: (q) => (q.state.data?.etat === "en_cours" ? 3000 : false),
  });
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/preanalyse-documents`, { body: {} }),
    onSuccess: () => { demanderNotifications(); toast.success("Pré-analyse lancée depuis les pièces du dossier", { description: "Vous serez prévenu quand elle sera terminée." }); },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  const queryClient = useQueryClient();
  useEffect(() => {
    if (etat?.etat === "pret") {
      onRefresh?.();
      queryClient.invalidateQueries({ queryKey: ["carte", dealId] });
      prevenir("Pré-analyse terminée", dossier.titre || dossier.nom || "Le dossier est prêt", `/Analyse?deal_id=${dealId}`);
    }
  }, [etat?.etat]);
  const enCours = etat?.etat === "en_cours" || lancer.isPending;

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-xl px-6 py-8">
      <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Pas de teaser, mais {nb} pièce{nb > 1 ? "s" : ""} dans le dossier</p>
      <p className="m-0 mt-2 text-[14.5px] leading-[1.65] text-[#d6d6db] max-w-[720px]">
        La fiche se compose depuis les documents — adresse, surface, locataire, bail, loyer, charges — puis passe dans la pré-analyse habituelle : mêmes critères, même verdict. Le prix de vente, absent des pièces, restera à renseigner.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {enCours ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-[#9298a6]">
            <PenseeIA etat="searching" taille={20} />
            {etat?.phase === "analyse" ? "Fiche composée, pré-analyse en cours…" : etat?.total ? `Lecture des pièces ${etat.fait}/${etat.total} — ${etat.document || ""}` : "Lecture des pièces…"}
          </span>
        ) : (
          <button onClick={() => lancer.mutate()} disabled={apercu} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">
            Pré-analyser à partir des {nb} pièce{nb > 1 ? "s" : ""}
          </button>
        )}
        {etat?.etat === "erreur" && <span className="text-[13px] text-[#e8746a]">{etat.erreur}</span>}
        <span className="text-[12.5px] text-[#6a7180]">Ou collez le teaser de l'agent dans le chat : il sera analysé dans ce dossier.</span>
      </div>
    </div>
  );
}

// Relancer la pré-analyse depuis l'onglet Pré-analyse : le teaser est rejoué,
// puis la data room relue jusqu'à l'étape atteinte.
function RelancePreanalyse({ dossier, onRefresh, apercu }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const { data: etat } = useQuery({
    queryKey: ["preanalyse-documents", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/preanalyse-documents`),
    refetchInterval: (q) => (q.state.data?.etat === "en_cours" ? 3000 : false),
  });
  const relancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/relancer-preanalyse`, { body: {} }),
    onSuccess: () => { demanderNotifications(); toast.success("Pré-analyse relancée — l'analyse suivra", { description: "Vous serez prévenu quand elle sera terminée." }); queryClient.invalidateQueries({ queryKey: ["preanalyse-documents", dealId] }); },
    onError: (e) => toast.error(e?.message || "Relance impossible"),
  });
  useEffect(() => {
    if (etat?.etat === "pret" && etat?.relance) {
      onRefresh?.();
      ["etape1", "etape2", "etape3", "etape4", "carte", "matrice", "fiche"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
      prevenir("Pré-analyse terminée", dossier.titre || dossier.nom || "Le dossier est à jour", `/Analyse?deal_id=${dealId}`);
    }
  }, [etat?.etat]);
  const enCours = etat?.etat === "en_cours";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 -mt-2 mb-4">
      <p className="m-0 text-[12.5px] text-[#e8746a]">{etat?.etat === "erreur" ? etat.erreur : ""}</p>
      {enCours ? (
        <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><PenseeIA etat="searching" taille={20} /> {etat.phase === "preanalyse" ? "Pré-analyse en cours…" : etat.phase?.startsWith("etape") ? `Relecture de la data room ${etat.fait ?? 0}/${etat.total ?? "…"}` : "En cours…"}</span>
      ) : (
        <button onClick={() => !apercu && window.confirm("Relancer la pré-analyse, puis l'analyse de la data room ?") && relancer.mutate()} disabled={apercu || relancer.isPending} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#2c3139] text-[12.5px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] disabled:opacity-40">
          <RefreshCw className="w-3.5 h-3.5" /> Relancer la pré-analyse
        </button>
      )}
    </div>
  );
}
