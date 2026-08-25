import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, Briefcase, Check, Clock, Download, ExternalLink, Eye, Film, FlaskConical, FolderCheck,
  ChevronLeft, ChevronRight, Loader2, Lock, Mail, Microscope, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bandeau, CarteLot, DialogMailIntention, JournalSuivi,
} from "@/components/preanalyse/DealResultat";
import SectionDocumentsDeal from "@/components/preanalyse/SectionDocumentsDeal";
import ChatDossier from "./ChatDossier";
import DocumentsDossier from "./DocumentsDossier";
import AnalyseDocuments from "./AnalyseDocuments";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";

// Workflow d'un deal en cinq étapes, sur une seule page :
//
//   1. Mail        — écrire à l'agent pendant l'appel… ou passer l'étape
//   2. Pré-analyse — la fiche décortiquée, décision Oui / Non à la fin
//   3. Documents   — analyse de tous les documents (dépôt, dépouillement, Drive, synthèse)
//   4. Décision    — mail Oui (présentation client) / Non (abandon), comme à l'étape 2
//   5. Plateforme  — si Oui : entrée dans la plateforme (projet pré-rempli)
//
// Le workflow existe avant même le deal : sans dossier, seules les étapes 1 et
// 2 sont ouvertes ; l'analyse (étape 2) crée le deal et déroule la suite.

// Miroir de server/deal/etapes.js — le déblocage (etape_max) vient du serveur.
const ETAPES = [
  { n: 1, id: "mail", label: "Mail", sub: "agent" },
  { n: 2, id: "preanalyse", label: "Pré-analyse", sub: "fiche du bien" },
  { n: 3, id: "analyse", label: "Analyse", sub: "documents et décision" },
  { n: 4, id: "video", label: "Vidéo", sub: "présentation client" },
  { n: 5, id: "plateforme", label: "Plateforme", sub: "création du projet" },
  { n: 6, id: "presentation", label: "Présentation", sub: "dossier banque" },
];

// En-tête numéroté d'une étape : « 01 · Titre » + description, comme la maquette.
export function TitreEtape({ n, titre, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3.5 mb-1.5">
        {n != null && <div className="text-xs text-[#8b9391] tabular-nums">{String(n).padStart(2, "0")}</div>}
        <h2 className="m-0 text-[22px] font-medium text-[#edeae5]">{titre}</h2>
      </div>
      <p className="m-0 text-[13.5px] text-[#9aa19e] max-w-[64ch] leading-[1.65]">{description}</p>
    </div>
  );
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
  const [etape, setEtape] = useState(() => (apercu ? 1 : debloquee));
  const [deblocageEnCours, setDeblocageEnCours] = useState(false);
  // Documents cochés dans l'étape Analyse, soumis au chat.
  const [documentsCoches, setDocumentsCoches] = useState([]);
  const [ongletAnalyse, setOngletAnalyse] = useState("documents");
  // Étape Mail : brouillon rédigé depuis le chat du haut.
  const [brouillonMail, setBrouillonMail] = useState(null);
  // Étape Pré-analyse : le chat lance l'analyse (texte collé ou fichier).
  const analyserFiche = useMutation({
    mutationFn: async ({ fichier, texte }) => {
      const form = new FormData();
      if (fichier) form.append("fichier", fichier);
      if (texte) form.append("texte", texte);
      // Un dossier nommé existe déjà : l'analyse le remplit au lieu d'en créer un.
      if (dossier?.deal_id) form.append("deal_id", dossier.deal_id);
      return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true });
    },
    onSuccess: (d) => {
      toast.success(d.multi_lots ? `${d.lots.length} lots analysés` : "Fiche analysée");
      onAnalyse?.(d);
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });

  // Étape Analyse : dépouiller les documents cochés, sans prompt.
  const extraire = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extraire`, {
        body: { documents: documentsCoches },
      }),
    onSuccess: (tables) => {
      const total = (tables || []).reduce((n, t) => n + (t.lignes?.length || 0), 0);
      toast.success(`${tables.length} document${tables.length > 1 ? "s" : ""} dépouillé${tables.length > 1 ? "s" : ""} — ${total} donnée${total > 1 ? "s" : ""}`);
      onRefresh?.();
    },
    onError: (e) => toast.error(e?.message || "Dépouillement impossible"),
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

  // Changer de dossier (ou le voir avancer) recale la vue sur le front débloqué.
  useEffect(() => {
    if (!apercu) setEtape(etapeDebloquee(dossier));
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
        <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="m-0 text-[26px] max-md:text-[21px] font-medium tracking-[-.01em] text-[#edeae5] truncate">
                {dossier.titre || dossier.nom || dossier.lots?.[0]?.synthese?.titre || dossier.source?.nom_fichier || "Sans nom"}
              </h1>
              {aRelancer && (
                <Badge className="bg-red-500/15 text-red-300 border-red-500/30 flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" /> À relancer
                </Badge>
              )}
            </div>
            <p className="m-0 mt-1.5 text-[12.5px] text-[#8b9391]">
              {[
                `${(dossier.documents_espace || []).length} document${(dossier.documents_espace || []).length > 1 ? "s" : ""}`,
                ETAPES[Math.max(0, (dossier.etape_max || 1) - 1)]?.label,
                (dossier.conversations || []).length ? `${dossier.conversations.length} requête${dossier.conversations.length > 1 ? "s" : ""}` : null,
                dossier.contact_agent_email || null,
                !isNaN(new Date(dossier.cree_le)) ? `créé le ${new Date(dossier.cree_le).toLocaleDateString("fr-FR")}` : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!apercu && (
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {etape < ETAPES.length && (
                <Button
                  onClick={() => (etape < debloquee ? setEtape(etape + 1) : passerVersEtape(etape + 1))}
                  disabled={deblocageEnCours || abandonne}
                  className="bg-transparent border border-[#2e3230] text-[#edeae5] hover:bg-[#edeae5]/[0.06] hover:border-[#565b59] h-9 text-[13px]"
                >
                  {deblocageEnCours ? "Passage…" : "Poursuivre"}
                </Button>
              )}
              {debloquee > 1 && (
                <Button
                  onClick={() => {
                    if (!window.confirm("Ramener ce dossier à l'étape 1 ? Documents et analyses sont conservés.")) return;
                    base44
                      .request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/revenir`, { body: { etape: 1 } })
                      .then(() => { toast.success("Retour à l'étape 1"); setEtape(1); onRefresh?.(); })
                      .catch((e) => toast.error(e?.message || "Retour impossible"));
                  }}
                  disabled={abandonne}
                  className="bg-transparent border border-[#2e3230] text-[#9aa19e] hover:text-[#edeae5] hover:border-[#565b59] h-9 text-[13px]"
                >
                  Revenir à l'étape 1
                </Button>
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
                className="bg-transparent border border-[#2e3230] text-[#9aa19e] hover:text-red-300 hover:border-red-400/40 h-9 text-[13px]"
              >
                Abandonner
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Le chat du dossier : questions, analyses, points à vérifier */}
      <ChatDossier
        afficherRequetes={etape === 2 || etape === 3}
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
        modePreanalyse={etape === 2 && !dossier?.lots?.length}
        onAnalyserTexte={(texte) => analyserFiche.mutate({ texte })}
        onAnalyserFichier={(fichier) => analyserFiche.mutate({ fichier })}
        analyseEnCours={analyserFiche.isPending}
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

      {/* Étapes du dossier — libellés seuls, sans pastilles. Toujours visibles :
          on doit pouvoir changer d'étape sans refermer la table ouverte. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[#2e3230] py-3">
        {ETAPES.map((e) => {
          const accessible = e.n <= debloquee;
          const active = etape === e.n;
          return (
            <button
              key={e.id}
              onClick={() => (accessible ? setEtape(e.n) : dossier && !deblocageEnCours && passerVersEtape(e.n))}
              disabled={!accessible && !dossier}
              title={accessible ? e.sub : dossier ? "Ouvrir cette étape — les précédentes seront validées" : "Analysez d'abord la fiche"}
              className={`text-[12.5px] tracking-[0.02em] pb-1 border-b-2 transition-colors whitespace-nowrap
                ${active ? "border-[#35a79b] text-[#edeae5]"
                  : accessible ? "border-transparent text-[#9aa19e] hover:text-[#edeae5]"
                  : "border-transparent text-[#4a4d4b] hover:text-[#8b9391]"}`}
            >
              {e.label}
            </button>
          );
        })}
      </div>

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
          <div id="tables-analyse">
            <AnalyseDocuments
              dossier={dossier}
              coches={documentsCoches}
              onCocher={setDocumentsCoches}
              onRefresh={onRefresh}
              apercu={apercu}
              onglet={ongletAnalyse}
              onOnglet={setOngletAnalyse}
            />
          </div>
        )}
        {etape === 3 && <EtapeDecisionFinale dossier={dossier} onRefresh={onRefresh} onOui={passerEtapeSuivante} apercu={apercu} />}
        {etape === 4 && <BlocVideoPresentation dossier={dossier} apercu={apercu} />}
        {etape === 5 && <EtapePlateforme dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
        {etape === 6 && <EtapePresentation dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
      </div>

      {/* Documents du dossier — toujours accessibles */}
      {dossier && etape !== 3 && (
        <DocumentsDossier
          dossier={dossier}
          coches={documentsCoches}
          onCocher={setDocumentsCoches}
          onRefresh={onRefresh}
          apercu={apercu}
        />
      )}
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
    <div className="rounded-md border border-[#e0c9a0]/25 bg-[#e0c9a0]/[0.06] px-4 py-3 flex flex-wrap items-center gap-2 text-sm text-amber-200/90">
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
        className="text-amber-200/80 hover:text-[#edeae5] hover:bg-[#edeae5]/5 flex-shrink-0"
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
const GABARITS = [
  { label: "Fiche commerciale", prompt: (d) => `Demande la fiche commerciale du bien ${ref(d)} auprès de ${agent(d)}. Précise : surface utile, état locatif, charges, taxe foncière.` },
  { label: "Prise de contact", prompt: (d) => `Premier contact avec ${agent(d)} au sujet de ${ref(d)}. Présente-nous brièvement et demande un échange téléphonique.` },
  { label: "Demande de documents", prompt: (d) => `Demande les documents du bien ${ref(d)} : baux, taxe foncière, DPE, trois derniers PV d'AG.` },
  { label: "Demande de visite", prompt: (d) => `Demande une visite du bien ${ref(d)}, en proposant deux créneaux.` },
  { label: "Relance", prompt: (d) => `Relance ${agent(d)} sur les documents demandés il y a une semaine pour ${ref(d)}.` },
  { label: "Négociation prix", prompt: (d) => `Propose une offre sous le prix affiché pour ${ref(d)}, en justifiant par le marché local.` },
];
const ref = (d) => {
  const a = d?.lots?.[0]?.lot?.adresse?.valeur;
  return a?.rue ? `${a.rue}${a.ville ? ` à ${a.ville}` : ""}` : "[adresse du bien]";
};
const agent = (d) => d?.contact_agent_email || "[email de l'agent]";

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
      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-8 text-center">
        <p className="m-0 text-[13.5px] text-[#9aa19e]">
          Décrivez le mail dans le chat ci-dessus, ou choisissez un gabarit, puis générez le brouillon.
        </p>
      </div>
    );
  }

  if (dossier && !apercu && etapeFranchie) {
    return (
      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-6">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-md bg-[#edeae5]/[0.05] text-[#8b9391] flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[#edeae5] text-sm font-medium">
              {dossier.source_mail ? "Fiche reçue par mail" : "Étape passée"}
            </p>
            <p className="text-[#8b9391] text-xs mt-1 leading-relaxed">
              {dossier.source_mail
                ? `${dossier.source_mail.de || ""} — « ${dossier.source_mail.objet || ""} » le ${dossier.source_mail.date ? new Date(dossier.source_mail.date).toLocaleString("fr-FR") : "?"}`
                : `La fiche « ${dossier.source?.nom_fichier || "texte collé"} » a été déposée directement, sans échange de mail préalable dans la plateforme.`}
            </p>
          </div>
          <Button size="sm" onClick={onSuivant} className="bg-[#edeae5]/5 hover:bg-[#edeae5]/10 text-[#d3d8d6] border-0 flex-shrink-0">
            Étape suivante <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
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
        <div className="bg-[#0a0c0c] border border-[#242726] rounded-xl px-6 py-10 text-center">
          <p className="m-0 text-[13.5px] text-[#9aa19e]">
            Rédigez le mail dans le chat en haut de page — un gabarit pour partir vite, puis générez.
          </p>
          <Button
            variant="ghost"
            onClick={onSuivant}
            className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 mt-3"
          >
            Passer — j'ai déjà la fiche
          </Button>
        </div>
      ) : (
        <div className="bg-[#0a0c0c] border border-[#242726] rounded-xl overflow-hidden">
          {/* Expéditeur : la ligne d'identité du message */}
          {comptes.length > 0 ? (
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1c1f1e]">
              <span className="text-[11px] tracking-[0.14em] uppercase text-[#6b7270] w-[74px] flex-shrink-0">De</span>
              <select
                value={expediteur || comptes[0]?.id}
                onChange={(e) => {
                  setExpediteur(e.target.value);
                  localStorage.setItem("klocka:dernier-expediteur", e.target.value);
                }}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#edeae5] cursor-pointer"
              >
                {comptes.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#121413]">{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            !apercu && (
              <div className="px-5 py-4 border-b border-[#1c1f1e]">
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
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1c1f1e]">
            <label htmlFor="mail-to" className="text-[11px] tracking-[0.14em] uppercase text-[#6b7270] w-[74px] flex-shrink-0">À</label>
            <input
              id="mail-to"
              value={brouillon.to}
              onChange={(e) => setBrouillon({ ...brouillon, to: e.target.value })}
              placeholder="agent@agence.fr"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#edeae5] placeholder:text-[#4f5654]"
            />
          </div>
          <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1c1f1e]">
            <label htmlFor="mail-objet" className="text-[11px] tracking-[0.14em] uppercase text-[#6b7270] w-[74px] flex-shrink-0">Objet</label>
            <input
              id="mail-objet"
              value={brouillon.subject}
              onChange={(e) => setBrouillon({ ...brouillon, subject: e.target.value })}
              placeholder="Objet du message"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13.5px] text-[#edeae5] placeholder:text-[#4f5654]"
            />
          </div>

          {/* Corps : la zone d'écriture, sans cadre dans le cadre */}
          <textarea
            value={brouillon.body}
            onChange={(e) => setBrouillon({ ...brouillon, body: e.target.value })}
            rows={14}
            placeholder="Corps du message"
            className="w-full bg-transparent border-0 outline-none resize-y px-5 py-4 text-[13.5px] leading-[1.75] text-[#d3d8d6] placeholder:text-[#4f5654]"
          />

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-t border-[#1c1f1e] bg-[#0c0e0d]">
            <button
              onClick={() => setBrouillon(null)}
              className="text-[13px] text-[#8b9391] hover:text-[#edeae5] transition-colors"
            >
              Reprendre
            </button>
            <div className="flex-1" />
            <button
              onClick={onSuivant}
              className="text-[13px] text-[#8b9391] hover:text-[#edeae5] transition-colors px-2"
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
              className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d] font-medium h-9 text-[13px]"
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
    <TitreEtape
      n={2}
      titre="Pré-analyse"
      description="La fiche est passée sur nos critères : verdict déterministe, métriques AEM, simulateur pré-rempli, carte et marché local. L'étape se clôt par un Oui / Non."
    />
  );

  // --- Nouveau dossier, ou coquille nommée sans analyse : la fiche entre ici.
  if (!dossier || !dossier.lots?.length)
    return (
      <>
        {titre}
        {analyseParChat ? (
          <div className="bg-[#0a0c0c] border border-[#242726] rounded-xl px-6 py-10 text-center">
            <p className="m-0 text-[13.5px] text-[#9aa19e]">
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
    <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-6">
      <p className="text-[#edeae5] text-sm font-medium mb-1">Pré-analyser la fiche</p>
      <p className="text-[#8b9391] text-xs mb-4">
        Déposez la fiche commerciale reçue de l'agent (ou collez le texte du mail) : extraction,
        vérification des citations, verdict et simulateur. Les mails reçus se préanalysent aussi en un
        clic depuis le plan de travail du dashboard.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-[#9aa19e] text-xs mb-2 block">Fiche commerciale</Label>
          <button
            onClick={() => inputFichier.current?.click()}
            disabled={analyser.isPending}
            className="w-full h-[104px] border border-dashed border-[#edeae5]/15 rounded-md flex flex-col items-center justify-center gap-2 hover:border-[#565b59] hover:bg-[#edeae5]/[0.02] transition-all disabled:opacity-50"
          >
            <Upload className="w-5 h-5 text-[#8b9391]" />
            <span className="text-[#9aa19e] text-sm">PDF, image, .eml</span>
            <span className="text-[#6b7270] text-[11px]">Les PDF scannés sont transcrits automatiquement</span>
          </button>
          <input
            ref={inputFichier}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.eml,.txt"
            onChange={onFichier}
            className="hidden"
          />
        </div>
        <div>
          <Label className="text-[#9aa19e] text-xs mb-2 block">…ou collez le texte du mail</Label>
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={4}
            placeholder="Bonjour, je vous propose un local commercial situé…"
            className="bg-[#0a0c0c] border-[#282b2a] text-[#edeae5] resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button
          onClick={() => analyser.mutate({ texte })}
          disabled={!texte.trim() || analyser.isPending}
          className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
        >
          {analyser.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse…</>
          ) : (
            <><Microscope className="w-4 h-4 mr-2" /> Analyser</>
          )}
        </Button>
      </div>
      {analyser.isPending && (
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-[#edeae5] text-sm">Analyse Klocka</span>
            <span className="flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#edeae5] animate-bounce"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          </div>
          <p className="text-[#8b9391] text-xs text-center">
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
      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4 flex items-center gap-3">
        <span className="w-8 h-8 rounded-md bg-[#edeae5]/5 text-[#8b9391] flex items-center justify-center flex-shrink-0">
          <Clock className="w-4 h-4" />
        </span>
        <p className="text-[#9aa19e] text-sm min-w-0">{descInactif}</p>
      </div>
    ) : null;

    return (
      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${
              abandonne ? "bg-red-500/15 text-red-300" : "bg-[#35a79b]/20 text-[#7fd3c9]"
            }`}
          >
            {abandonne ? <ThumbsDown className="w-4 h-4" /> : <ThumbsUp className="w-4 h-4" />}
          </span>
          <p className="text-[#9aa19e] text-sm min-w-0">
            {abandonne ? "Décision : non." : "Décision : oui."}
            {evenement && (
              <span className="text-[#6b7270]">
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

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <button
        onClick={() => ouvrir(intentionOui)}
        className="bg-[#0a0c0c] border border-[#35a79b]/30 hover:border-[#35a79b]/60 rounded-md p-6 text-left transition-all group"
      >
        <span className="w-9 h-9 rounded-md bg-[#35a79b]/20 text-[#7fd3c9] flex items-center justify-center mb-3">
          <ThumbsUp className="w-4 h-4" />
        </span>
        <p className="text-[#edeae5] text-sm font-medium mb-1">{titreOui}</p>
        <p className="text-[#8b9391] text-xs leading-relaxed">{descOui}</p>
        <span className="text-[#7fd3c9] text-xs mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          Rédiger le mail <ArrowRight className="w-3 h-3" />
        </span>
      </button>

      <button
        onClick={() => ouvrir(intentionNon)}
        className="bg-[#0a0c0c] border border-[#242726] hover:border-red-500/40 rounded-md p-6 text-left transition-all group"
      >
        <span className="w-9 h-9 rounded-md bg-red-500/15 text-red-300 flex items-center justify-center mb-3">
          <ThumbsDown className="w-4 h-4" />
        </span>
        <p className="text-[#edeae5] text-sm font-medium mb-1">{titreNon}</p>
        <p className="text-[#8b9391] text-xs leading-relaxed">{descNon}</p>
        <span className="text-red-300 text-xs mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          Rédiger le mail <ArrowRight className="w-3 h-3" />
        </span>
      </button>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 3 — Documents : attente, relance, dépôt, dépouillement, Drive, synthèse
// ---------------------------------------------------------------------------

function EtapeDocuments({ dossier, onRefresh, apercu }) {
  const [dialogIntention, setDialogIntention] = useState(null);
  const statut = dossier?.statut || "analyse";
  const aRelancer =
    statut === "documents_demandes" &&
    dossier.relance_prevue_le &&
    new Date(dossier.relance_prevue_le) <= new Date();
  // En aperçu, le bandeau d'attente est montré même si le deal fictif est déjà
  // dépouillé : il fait partie des écrans de l'étape.
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
        description="Baux, PV d'AG, diagnostics : dépôt, classement dans le Drive d'équipe, dépouillement case par case avec page source, puis synthèse des points à vérifier."
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
                : "bg-[#edeae5]/5 hover:bg-[#edeae5]/10 text-[#d3d8d6] border-0"
            }
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Relancer l'agent
          </Button>
          <Button
            size="sm"
            onClick={() => changerStatut.mutate({ statut: "documents_recus", note: "Documents reçus" })}
            disabled={apercu || changerStatut.isPending}
            className="bg-[#edeae5]/[0.06] hover:bg-[#edeae5]/[0.1] text-[#d3d8d6] border-0"
          >
            <FolderCheck className="w-3.5 h-3.5 mr-1.5" /> Documents reçus
          </Button>
        </div>
      )}

      {/* Analyse de tous les documents : dépôt, dépouillement, Drive, synthèse. */}
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
        n={6}
        titre="Présentation"
        description="Le dossier de présentation bancaire du bien, généré depuis les données du deal : le bien, le bail, l'opération, le plan de financement, le marché et les points forts. Modifiable ensuite dans Google Slides."
      />

      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[#edeae5] text-sm font-medium mb-1">Présentation bancaire</p>
            <p className="text-[#8b9391] text-xs">
              {pres?.genere_le
                ? `Dernière génération le ${new Date(pres.genere_le).toLocaleDateString("fr-FR")} à ${new Date(pres.genere_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`
                : "Un clic : le PPTX est construit puis converti en Google Slides, prêt à retoucher."}
            </p>
          </div>
          <Button
            onClick={() => generer.mutate()}
            disabled={generer.isPending || apercu}
            className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
            title={apercu ? "Indisponible en mode aperçu" : undefined}
          >
            {generer.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Génération…</>
            ) : (
              <><Briefcase className="w-4 h-4 mr-2" /> {pres ? "Regénérer" : "Générer la présentation"}</>
            )}
          </Button>
        </div>

        {pres && (
          <div className="flex flex-wrap items-center gap-4 pt-1">
            {pres.slides_url && (
              <a href={pres.slides_url} target="_blank" rel="noopener noreferrer">
                <Button className="h-9 text-xs bg-[#edeae5]/[0.06] border border-[#3a3e3c] hover:bg-[#edeae5]/[0.1] text-[#edeae5]">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  Ouvrir dans Google Slides
                </Button>
              </a>
            )}
            {pres.pptx_url && (
              <a
                href={pres.pptx_url}
                download
                className="inline-flex items-center gap-2 text-xs text-[#8b9391] hover:text-[#edeae5] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger le PPTX
              </a>
            )}
          </div>
        )}

        {!apercu && !compteDrive && (
          <p className="text-[#8b9391] text-xs">
            Aucun compte Google Drive connecté : la présentation restera un PPTX à télécharger. Connectez un
            compte depuis le dashboard (accès Drive) pour obtenir directement un lien Google Slides modifiable.
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Vidéo de présentation client (~30 s) — rendue par Remotion côté serveur.
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
    <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Film className="w-4 h-4 text-[#8b9391]" />
          <div>
            <p className="text-[#edeae5] text-sm">Vidéo de présentation</p>
            <p className="text-[#8b9391] text-xs">
              30 secondes générées depuis les informations clés du lot — à envoyer au client.
            </p>
          </div>
        </div>
        <Button
          onClick={() => lancer.mutate()}
          disabled={enCours || apercu}
          variant="outline"
          className="h-9 text-xs border-[#303332] bg-transparent text-[#9aa19e] hover:border-[#565b59] hover:text-[#edeae5] shrink-0"
          title={apercu ? "Indisponible en mode aperçu" : undefined}
        >
          {enCours ? (
            <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Rendu {progression}%</>
          ) : (
            <><Film className="w-3.5 h-3.5 mr-2" />{etat === "pret" ? "Regénérer" : "Générer la vidéo"}</>
          )}
        </Button>
      </div>

      {enCours && (
        <div className="h-1 rounded bg-[#1a1d1c] overflow-hidden">
          <div
            className="h-full bg-[#35a79b] transition-all duration-500"
            style={{ width: `${Math.max(progression, 3)}%` }}
          />
        </div>
      )}

      {etat === "erreur" && (
        <p className="text-[#e2564d] text-xs">Le rendu a échoué : {statut?.erreur || "erreur inconnue"}</p>
      )}

      {etat === "pret" && statut?.url && (
        <div className="space-y-3">
          <video
            key={statut.url}
            controls
            preload="metadata"
            src={statut.url}
            className="w-full rounded-md border border-[#242726]"
          />
          <a
            href={statut.url}
            download={`presentation-${dealId}.mp4`}
            className="inline-flex items-center gap-2 text-xs text-[#8b9391] hover:text-[#edeae5] transition-colors"
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
        <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4">
          <p className="text-[#9aa19e] text-xs mb-2">Rappel de la synthèse documentaire</p>
          <p className="text-[#d3d8d6] text-sm leading-relaxed">{dossier.synthese_documents.resume}</p>
          {dossier.synthese_documents.points_a_verifier?.length > 0 && (
            <p className="text-[#e0c9a0]/80 text-xs mt-2">
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
        titreOui="Oui — on présente au client"
        descOui="Un mail est pré-rédigé pour annoncer à l'agent que le dossier sera présenté à l'un de nos clients investisseurs. Puis direction l'étape Plateforme."
        titreNon="Non — on abandonne"
        descNon="Vous donnez les raisons en une phrase ; un mail professionnel est rédigé pour l'agent. Le deal alimente la base de données marché puis part aux archives."
        onOui={onOui}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Étape 5 — Plateforme : entrée du deal dans la plateforme (projet pré-rempli)
// ---------------------------------------------------------------------------

function EtapePlateforme({ dossier, onRefresh, apercu }) {
  const navigate = useNavigate();
  const statut = dossier?.statut || "analyse";

  // Documents importés mais pas encore dépouillés : le serveur les analyse
  // avant de créer le projet — l'entrée en plateforme ne dépend plus de l'étape 3.
  const documents = dossier?.documents_espace || [];
  const analyses = dossier?.extractions || [];
  const aAnalyser = documents.length > 0 && analyses.length === 0;

  const creerProjet = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/0/projet`),
    onSuccess: (r) => {
      const details = [
        r.analyse ? `${r.analyse.documents} document(s) dépouillé(s), ${r.analyse.donnees} donnée(s)` : null,
        r.champs_remplis?.length ? `${r.champs_remplis.length} champ(s) pré-rempli(s)` : null,
      ].filter(Boolean);
      toast.success(`Projet créé : ${r.titre}`, details.length ? { description: details.join(" · ") } : undefined);
      onRefresh?.();
      navigate(`/AdminProjets?id=${r.project_id}`);
    },
    onError: (e) => toast.error(e?.message || "Création du projet impossible"),
  });

  const titre = (
    <TitreEtape
      n={5}
      titre="Plateforme"
      description="Le deal devient un projet pré-rempli : adresse, locataire, bail, simulateur et données de marché issues de la base. Le suivi client se poursuit sur la fiche projet."
    />
  );

  if (statut === "projet_cree" && dossier.projet_id) {
    return (
      <>
      {titre}
      <div className="bg-[#0a0c0c] border border-[#2e3130] rounded-md p-6 text-center">
        <span className="w-10 h-10 rounded-md bg-[#edeae5]/[0.05] text-[#8b9391] flex items-center justify-center mx-auto mb-3">
          <Briefcase className="w-5 h-5" />
        </span>
        <p className="text-[#edeae5] text-sm font-medium mb-1">Le deal est entré dans la plateforme</p>
        <p className="text-[#8b9391] text-xs mb-4">
          Suivez l'avancement client (message envoyé, retour oui/non) depuis la fiche projet.
        </p>
        <Button
          onClick={() => navigate(`/AdminProjets?id=${dossier.projet_id}`)}
          className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
        >
          <ExternalLink className="w-4 h-4 mr-2" /> Ouvrir le projet
        </Button>
      </div>
      </>
    );
  }

  return (
    <>
    {titre}
    <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-6 text-center">
      <span className="w-10 h-10 rounded-md bg-[#edeae5]/[0.05] text-[#8b9391] flex items-center justify-center mx-auto mb-3">
        <Briefcase className="w-5 h-5" />
      </span>
      <p className="text-[#edeae5] text-sm font-medium mb-1">Entrer le deal dans la plateforme</p>
      <p className="text-[#8b9391] text-xs mb-4 max-w-md mx-auto">
        Le projet est créé pré-rempli : adresse, locataire, bail, simulateur (mêmes chiffres que la
        pré-analyse), données de marché issues de la base, et tout ce que le dépouillement a relevé —
        bail, copropriété, diagnostics. Il s'ouvre ensuite dans l'éditeur pour compléter photos,
        secteur et documents client.
      </p>
      <Button
        onClick={() => creerProjet.mutate()}
        disabled={apercu || creerProjet.isPending}
        className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
      >
        {creerProjet.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Briefcase className="w-4 h-4 mr-2" />
        )}
        {aAnalyser ? "Analyser les documents et créer le projet" : "Créer le projet pré-rempli"}
      </Button>
      {aAnalyser ? (
        <p className="text-[#6b7270] text-[11px] mt-3">
          {documents.length} document{documents.length > 1 ? "s" : ""} pas encore dépouillé
          {documents.length > 1 ? "s" : ""} : ils le seront à la création, ce qui peut prendre une minute.
        </p>
      ) : analyses.length > 0 ? (
        <p className="text-[#6b7270] text-[11px] mt-3">
          Les données de l'onglet « Données extraites » (étape 3) seront reportées dans la fiche.
        </p>
      ) : (
        <p className="text-[#6b7270] text-[11px] mt-3">
          Aucun document au dossier : le projet part des seules données de la pré-analyse.
        </p>
      )}
    </div>
    </>
  );
}
