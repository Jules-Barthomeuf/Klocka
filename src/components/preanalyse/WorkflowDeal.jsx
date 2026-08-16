import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, Briefcase, Check, Clock, ExternalLink, Eye, FolderCheck, Loader2, Lock,
  Mail, Microscope, Send, SkipForward, Sparkles, ThumbsDown, ThumbsUp, Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bandeau, CarteLot, DialogMailIntention, JournalSuivi, STATUTS_DEAL, VERDICTS,
} from "@/components/preanalyse/DealResultat";
import SectionDocumentsDeal from "@/components/preanalyse/SectionDocumentsDeal";
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

const ETAPES = [
  { n: 1, id: "mail", label: "Mail" },
  { n: 2, id: "preanalyse", label: "Pré-analyse" },
  { n: 3, id: "documents", label: "Documents" },
  { n: 4, id: "decision", label: "Décision" },
  { n: 5, id: "plateforme", label: "Plateforme" },
];

// Étape la plus avancée déverrouillée selon le statut.
function etapeCourante(dossier) {
  if (!dossier) return 2; // nouveau deal : mail + pré-analyse ouvertes
  switch (dossier.statut || "analyse") {
    case "analyse":
      return 2;
    case "documents_demandes":
    case "documents_recus":
      return 3;
    case "depouille":
      return 5; // décision finale ET plateforme accessibles
    case "projet_cree":
      return 5;
    case "abandonne":
      if (dossier.dossier_doc_id) return 4;
      if ((dossier.suivi || []).some((s) => s.vers === "documents_demandes" || s.intention === "demande_documents")) return 3;
      return 2;
    default:
      return 2;
  }
}

// Étape sur laquelle on attend une action de l'utilisateur.
function etapeParDefaut(dossier) {
  if (!dossier) return 1;
  if (dossier.statut === "abandonne") return 2;
  if (dossier.statut === "depouille") return 4;
  return etapeCourante(dossier);
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
  const courante = apercu ? ETAPES.length : etapeCourante(dossier);
  const [etape, setEtape] = useState(() => (apercu ? 1 : etapeParDefaut(dossier)));

  // Changer de deal (ou le voir avancer) recale le workflow sur l'étape active.
  useEffect(() => {
    if (!apercu) setEtape(etapeParDefaut(dossier));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier?.deal_id, dossier?.statut]);

  const lot = dossier?.lots?.[0];
  const verdict = lot?.evaluation?.verdict;
  const s = dossier ? STATUTS_DEAL[dossier.statut || "analyse"] || STATUTS_DEAL.analyse : null;
  const aRelancer =
    dossier?.statut === "documents_demandes" &&
    dossier.relance_prevue_le &&
    new Date(dossier.relance_prevue_le) <= new Date();

  return (
    <div className="space-y-5">
      {/* En-tête + stepper */}
      <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-base font-medium truncate">
              {dossier ? lot?.synthese?.titre || dossier.source?.nom_fichier || "Deal" : "Nouveau deal"}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {dossier
                ? `${new Date(dossier.cree_le).toLocaleDateString("fr-FR")}${dossier.contact_agent_email ? ` · ${dossier.contact_agent_email}` : ""}`
                : "Du premier mail à l'entrée dans la plateforme"}
            </p>
          </div>
          {verdict && <Badge className={`${VERDICTS[verdict]?.classe || ""} flex-shrink-0`}>{verdict}</Badge>}
          {s && <Badge className={`${s.classe} flex-shrink-0`}>{s.libelle}</Badge>}
          {aRelancer && (
            <Badge className="bg-red-500/15 text-red-300 border-red-500/30 flex items-center gap-1 flex-shrink-0">
              <Clock className="w-3 h-3" /> À relancer
            </Badge>
          )}
        </div>

        <div className="flex items-center mt-4 overflow-x-auto pb-1">
          {ETAPES.map((e, i) => {
            const faite = !apercu && !abandonne && dossier && e.n < courante;
            const active = etape === e.n;
            const accessible = e.n <= courante;
            return (
              <React.Fragment key={e.id}>
                {i > 0 && (
                  <div
                    className={`h-px flex-1 min-w-4 mx-1.5 ${
                      e.n <= courante ? "bg-[#2A9D8F]/40" : "bg-white/[0.08]"
                    }`}
                  />
                )}
                <button
                  onClick={() => accessible && setEtape(e.n)}
                  disabled={!accessible}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all ${
                    active
                      ? "border-[#2A9D8F] bg-[#2A9D8F]/15 text-white"
                      : accessible
                        ? "border-white/10 text-gray-400 hover:border-white/25 hover:text-white"
                        : "border-white/[0.05] text-gray-700 cursor-not-allowed"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
                      faite
                        ? "bg-[#2A9D8F] text-white"
                        : active
                          ? "bg-[#2A9D8F]/30 text-[#71CCBA]"
                          : accessible
                            ? "bg-white/10 text-gray-400"
                            : "bg-white/[0.04] text-gray-700"
                    }`}
                  >
                    {faite ? <Check className="w-3 h-3" /> : accessible ? e.n : <Lock className="w-2.5 h-2.5" />}
                  </span>
                  {e.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {apercu && (
        <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 flex items-start gap-2 text-sm text-sky-200/90">
          <Eye className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Mode aperçu — deal fictif, les cinq étapes sont ouvertes pour visiter les écrans. Aucune
            action n'est exécutée et rien n'est enregistré.
          </span>
        </div>
      )}

      {abandonne && !apercu && (
        <Bandeau
          type="alerte"
          items={["Deal abandonné et archivé. Les étapes restent consultables, les actions sont désactivées."]}
        />
      )}

      <div key={etape} className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out space-y-5">
        {etape === 1 && <EtapeMail dossier={dossier} onSuivant={() => setEtape(2)} apercu={apercu} />}
        {etape === 2 && (
          <EtapePreanalyse
            dossier={dossier}
            onAnalyse={onAnalyse}
            onSaisie={onSaisie}
            enCours={enCours}
            onRefresh={onRefresh}
            apercu={apercu}
          />
        )}
        {etape === 3 && <EtapeDocuments dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
        {etape === 4 && (
          <EtapeDecisionFinale dossier={dossier} onRefresh={onRefresh} onOui={() => setEtape(5)} apercu={apercu} />
        )}
        {etape === 5 && <EtapePlateforme dossier={dossier} onRefresh={onRefresh} apercu={apercu} />}
      </div>

      {dossier && <JournalSuivi suivi={dossier.suivi} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 1 — Mail : écrire à l'agent pendant l'appel… ou passer
// ---------------------------------------------------------------------------

function EtapeMail({ dossier, onSuivant, apercu }) {
  const [prompt, setPrompt] = useState("");
  const [brouillon, setBrouillon] = useState(null);
  const [expediteur, setExpediteur] = useState(() => localStorage.getItem("klocka:dernier-expediteur") || "");

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
    enabled: !apercu,
  });
  const comptes = statutMail?.accounts || [];

  const composer = useMutation({
    mutationFn: () => base44.functions.invoke("composeMail", { prompt, from: expediteur || undefined }),
    onSuccess: (r) => {
      if (!r?.success) return toast.error(r?.error || "Composition impossible");
      setBrouillon({
        to: (r.draft.to || []).join(", "),
        subject: r.draft.subject || "",
        body: r.draft.body || "",
      });
      if (r.warnings?.length) toast.warning(r.warnings[0]);
    },
    onError: (e) => toast.error(e?.message || "Composition impossible"),
  });

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
        setPrompt("");
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

  // Deal déjà créé : l'étape est derrière nous, on la résume. En aperçu on
  // montre plutôt l'écran de composition, qui est le cœur de l'étape.
  if (dossier && !apercu) {
    return (
      <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#2A9D8F]/20 text-[#71CCBA] flex items-center justify-center flex-shrink-0">
            <Mail className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium">
              {dossier.source_mail ? "Fiche reçue par mail" : "Étape passée"}
            </p>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              {dossier.source_mail
                ? `${dossier.source_mail.de || ""} — « ${dossier.source_mail.objet || ""} » le ${dossier.source_mail.date ? new Date(dossier.source_mail.date).toLocaleString("fr-FR") : "?"}`
                : `La fiche « ${dossier.source?.nom_fichier || "texte collé"} » a été déposée directement, sans échange de mail préalable dans la plateforme.`}
            </p>
          </div>
          <Button size="sm" onClick={onSuivant} className="bg-white/5 hover:bg-white/10 text-gray-300 border-0 flex-shrink-0">
            Étape suivante <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-[#2A9D8F]" />
        <p className="text-white text-sm font-medium">Écrire à l'agent pendant l'appel</p>
      </div>
      <p className="text-gray-500 text-xs mb-4">
        Décrivez le mail (« demande la fiche du local rue X à jean@agence.fr ») : un brouillon est
        généré, vous l'ajustez et l'envoyez. Si vous avez déjà la fiche, passez directement à la
        pré-analyse.
      </p>

      {!brouillon ? (
        <>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Demande la fiche complète du local commercial à…"
            className="bg-neutral-900 border-white/[0.08] text-white resize-none"
          />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              onClick={() => composer.mutate()}
              disabled={apercu || !prompt.trim() || composer.isPending}
              className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
            >
              {composer.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Préparer le mail
            </Button>
            <Button
              variant="ghost"
              onClick={onSuivant}
              className="text-gray-400 hover:text-white hover:bg-white/5 ml-auto"
            >
              <SkipForward className="w-4 h-4 mr-1.5" /> Passer cette étape
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {comptes.length > 0 ? (
            <div>
              <Label className="text-gray-400 text-xs mb-1.5 block">Envoyer depuis</Label>
              <select
                value={expediteur || comptes[0]?.id}
                onChange={(e) => {
                  setExpediteur(e.target.value);
                  localStorage.setItem("klocka:dernier-expediteur", e.target.value);
                }}
                className="w-full bg-neutral-800 border border-white/[0.08] rounded-md px-3 py-2 text-white text-sm"
              >
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          ) : (
            !apercu && (
              <EncartConnexionGmail
                googleConfigure={googleConfigure}
                onConnecte={(email) => {
                  setExpediteur(email);
                  localStorage.setItem("klocka:dernier-expediteur", email);
                }}
              />
            )
          )}
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Destinataire</Label>
            <Input
              value={brouillon.to}
              onChange={(e) => setBrouillon({ ...brouillon, to: e.target.value })}
              placeholder="agent@agence.fr"
              className="bg-neutral-800 border-white/[0.08] text-white"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Objet</Label>
            <Input
              value={brouillon.subject}
              onChange={(e) => setBrouillon({ ...brouillon, subject: e.target.value })}
              className="bg-neutral-800 border-white/[0.08] text-white"
            />
          </div>
          <div>
            <Label className="text-gray-400 text-xs mb-1.5 block">Corps</Label>
            <Textarea
              value={brouillon.body}
              onChange={(e) => setBrouillon({ ...brouillon, body: e.target.value })}
              rows={8}
              className="bg-neutral-800 border-white/[0.08] text-white leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setBrouillon(null)} className="text-gray-400 hover:text-white hover:bg-white/5">
              Reprendre
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={onSuivant}
              className="text-gray-400 hover:text-white hover:bg-white/5"
            >
              <SkipForward className="w-4 h-4 mr-1.5" /> Passer sans envoyer
            </Button>
            <Button
              onClick={() => (sansCompte && googleConfigure ? connecter() : envoyer.mutate())}
              disabled={
                apercu ||
                !brouillon.to.trim() ||
                !brouillon.subject.trim() ||
                envoyer.isPending ||
                connexionEnCours
              }
              className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
            >
              {envoyer.isPending || connexionEnCours ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {sansCompte && googleConfigure ? "Connecter Gmail et envoyer" : "Envoyer"}
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

function EtapePreanalyse({ dossier, onAnalyse, onSaisie, enCours, onRefresh, apercu }) {
  // --- Nouveau deal : la fiche entre ici -----------------------------------
  if (!dossier) return <DepotFiche onAnalyse={onAnalyse} />;

  // --- Deal existant : résultat + décision ---------------------------------
  return (
    <>
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
      />
    </>
  );
}

function DepotFiche({ onAnalyse }) {
  const inputFichier = useRef(null);
  const [texte, setTexte] = useState("");

  const analyser = useMutation({
    mutationFn: async ({ fichier, texte: t }) => {
      const form = new FormData();
      if (fichier) form.append("fichier", fichier);
      if (t) form.append("texte", t);
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
    <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-6">
      <p className="text-white text-sm font-medium mb-1">Pré-analyser la fiche</p>
      <p className="text-gray-500 text-xs mb-4">
        Déposez la fiche commerciale reçue de l'agent (ou collez le texte du mail) : extraction,
        vérification des citations, verdict et simulateur. Les mails reçus se préanalysent aussi en un
        clic depuis la Boîte de réception de la page Mails.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <div>
          <Label className="text-gray-400 text-xs mb-2 block">Fiche commerciale</Label>
          <button
            onClick={() => inputFichier.current?.click()}
            disabled={analyser.isPending}
            className="w-full h-[104px] border border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-[#2A9D8F]/50 hover:bg-white/[0.02] transition-all disabled:opacity-50"
          >
            <Upload className="w-5 h-5 text-[#2A9D8F]" />
            <span className="text-gray-400 text-sm">PDF, image, .eml</span>
            <span className="text-gray-600 text-[11px]">Les PDF scannés sont transcrits automatiquement</span>
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
          <Label className="text-gray-400 text-xs mb-2 block">…ou collez le texte du mail</Label>
          <Textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            rows={4}
            placeholder="Bonjour, je vous propose un local commercial situé…"
            className="bg-neutral-900 border-white/[0.08] text-white resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button
          onClick={() => analyser.mutate({ texte })}
          disabled={!texte.trim() || analyser.isPending}
          className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
        >
          {analyser.isPending ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyse…</>
          ) : (
            <><Microscope className="w-4 h-4 mr-2" /> Analyser</>
          )}
        </Button>
      </div>
      {analyser.isPending && (
        <p className="text-gray-500 text-xs mt-3 text-center">
          Lecture, extraction, vérification des citations puis application des règles…
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bloc de décision Oui / Non — partagé par les étapes 2 et 4
// ---------------------------------------------------------------------------

function BlocDecision({ dossier, onRefresh, actif, intentionOui, intentionNon, titreOui, descOui, titreNon, descNon, onOui, apercu }) {
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
    return (
      <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
              abandonne ? "bg-red-500/15 text-red-300" : "bg-[#2A9D8F]/20 text-[#71CCBA]"
            }`}
          >
            {abandonne ? <ThumbsDown className="w-4 h-4" /> : <ThumbsUp className="w-4 h-4" />}
          </span>
          <p className="text-gray-400 text-sm min-w-0">
            {abandonne ? "Décision : non." : "Décision : oui."}
            {evenement && (
              <span className="text-gray-600">
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
        className="bg-[#0A0A0A] border border-[#2A9D8F]/30 hover:border-[#2A9D8F]/60 rounded-2xl p-6 text-left transition-all group"
      >
        <span className="w-9 h-9 rounded-xl bg-[#2A9D8F]/20 text-[#71CCBA] flex items-center justify-center mb-3">
          <ThumbsUp className="w-4 h-4" />
        </span>
        <p className="text-white text-sm font-medium mb-1">{titreOui}</p>
        <p className="text-gray-500 text-xs leading-relaxed">{descOui}</p>
        <span className="text-[#71CCBA] text-xs mt-3 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          Rédiger le mail <ArrowRight className="w-3 h-3" />
        </span>
      </button>

      <button
        onClick={() => ouvrir(intentionNon)}
        className="bg-[#0A0A0A] border border-white/[0.06] hover:border-red-500/40 rounded-2xl p-6 text-left transition-all group"
      >
        <span className="w-9 h-9 rounded-xl bg-red-500/15 text-red-300 flex items-center justify-center mb-3">
          <ThumbsDown className="w-4 h-4" />
        </span>
        <p className="text-white text-sm font-medium mb-1">{titreNon}</p>
        <p className="text-gray-500 text-xs leading-relaxed">{descNon}</p>
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
      {montrerAttente && (
        <div
          className={`rounded-2xl border px-5 py-4 flex flex-wrap items-center gap-3 ${
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
                : "bg-white/5 hover:bg-white/10 text-gray-300 border-0"
            }
          >
            <Send className="w-3.5 h-3.5 mr-1.5" /> Relancer l'agent
          </Button>
          <Button
            size="sm"
            onClick={() => changerStatut.mutate({ statut: "documents_recus", note: "Documents reçus" })}
            disabled={apercu || changerStatut.isPending}
            className="bg-[#2A9D8F]/15 hover:bg-[#2A9D8F]/25 text-[#71CCBA] border-0"
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
// Étape 4 — Décision finale : mail Oui / Non, comme à l'étape 2
// ---------------------------------------------------------------------------

function EtapeDecisionFinale({ dossier, onRefresh, onOui, apercu }) {
  const statut = dossier?.statut || "analyse";
  const actif = apercu || statut === "depouille" || statut === "documents_recus";

  return (
    <>
      {dossier.synthese_documents?.resume && (
        <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl px-5 py-4">
          <p className="text-gray-400 text-xs mb-2">Rappel de la synthèse documentaire</p>
          <p className="text-gray-300 text-sm leading-relaxed">{dossier.synthese_documents.resume}</p>
          {dossier.synthese_documents.points_a_verifier?.length > 0 && (
            <p className="text-amber-300/80 text-xs mt-2">
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

  const creerProjet = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/0/projet`),
    onSuccess: (r) => {
      toast.success(`Projet créé : ${r.titre}`);
      onRefresh?.();
      navigate(`/AdminProjets?id=${r.project_id}`);
    },
    onError: (e) => toast.error(e?.message || "Création du projet impossible"),
  });

  if (statut === "projet_cree" && dossier.projet_id) {
    return (
      <div className="bg-[#0A0A0A] border border-[#2A9D8F]/25 rounded-2xl p-6 text-center">
        <span className="w-10 h-10 rounded-xl bg-[#2A9D8F]/20 text-[#71CCBA] flex items-center justify-center mx-auto mb-3">
          <Briefcase className="w-5 h-5" />
        </span>
        <p className="text-white text-sm font-medium mb-1">Le deal est entré dans la plateforme</p>
        <p className="text-gray-500 text-xs mb-4">
          Suivez l'avancement client (message envoyé, retour oui/non) depuis la fiche projet.
        </p>
        <Button
          onClick={() => navigate(`/AdminProjets?id=${dossier.projet_id}`)}
          className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
        >
          <ExternalLink className="w-4 h-4 mr-2" /> Ouvrir le projet
        </Button>
      </div>
    );
  }

  return (
    <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-6 text-center">
      <span className="w-10 h-10 rounded-xl bg-[#2A9D8F]/20 text-[#71CCBA] flex items-center justify-center mx-auto mb-3">
        <Briefcase className="w-5 h-5" />
      </span>
      <p className="text-white text-sm font-medium mb-1">Entrer le deal dans la plateforme</p>
      <p className="text-gray-500 text-xs mb-4 max-w-md mx-auto">
        Le projet est créé pré-rempli : adresse, locataire, bail, simulateur (mêmes chiffres que la
        pré-analyse) et données de marché issues de la base. Il s'ouvre ensuite dans l'éditeur pour
        compléter photos, secteur et documents client.
      </p>
      <Button
        onClick={() => creerProjet.mutate()}
        disabled={apercu || creerProjet.isPending || statut !== "depouille"}
        className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
      >
        {creerProjet.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Briefcase className="w-4 h-4 mr-2" />
        )}
        Créer le projet pré-rempli
      </Button>
      {statut !== "depouille" && (
        <p className="text-gray-600 text-[11px] mt-3">Disponible une fois les documents analysés (étape 3).</p>
      )}
    </div>
  );
}
