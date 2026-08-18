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
  ArrowRight, Briefcase, Check, Clock, Download, ExternalLink, Eye, Film, FlaskConical, FolderCheck,
  Loader2, Lock, Mail, Microscope, Send, SkipForward, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload,
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
  { n: 1, id: "mail", label: "Mail", sub: "agent" },
  { n: 2, id: "preanalyse", label: "Pré-analyse", sub: "fiche du bien" },
  { n: 3, id: "documents", label: "Documents", sub: "dépouillement" },
  { n: 4, id: "decision", label: "Décision", sub: "client / abandon" },
  { n: 5, id: "plateforme", label: "Plateforme", sub: "création projet" },
];

// En-tête numéroté d'une étape : « 01 · Titre » + description, comme la maquette.
export function TitreEtape({ n, titre, description }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3.5 mb-1.5">
        <div className="text-xs text-[#8b9391] tabular-nums">{String(n).padStart(2, "0")}</div>
        <h2 className="m-0 text-[22px] font-medium text-[#edeae5]">{titre}</h2>
      </div>
      <p className="m-0 text-[13.5px] text-[#9aa19e] max-w-[64ch] leading-[1.65]">{description}</p>
    </div>
  );
}

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
      <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[#edeae5] text-base font-medium truncate">
              {dossier ? lot?.synthese?.titre || dossier.source?.nom_fichier || "Deal" : "Nouveau deal"}
            </h2>
            <p className="text-[#8b9391] text-xs mt-0.5">
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

        {/* Stepper : pastilles reliées par un filet, sous-libellé sous chacune. */}
        <div className="flex items-start mt-5">
          {ETAPES.map((e, i) => {
            const faite = !apercu && !abandonne && dossier && e.n < courante;
            const active = etape === e.n;
            // Dès qu'un deal existe, toutes les étapes sont visitables : on
            // reçoit parfois les documents d'emblée, ou on veut préparer la
            // décision avant d'avoir envoyé le moindre mail. Les actions de
            // chaque étape restent gouvernées par le statut du deal.
            const accessible = apercu || !!dossier || e.n <= courante;
            return (
              <div key={e.id} className="flex-1 flex flex-col items-center min-w-0">
                <div className="flex items-center w-full">
                  <div
                    className={`h-px flex-1 ${
                      i === 0 ? "bg-transparent" : e.n <= etape ? "bg-[#35a79b]/40" : "bg-[#282b2a]"
                    }`}
                  />
                  <button
                    onClick={() => accessible && setEtape(e.n)}
                    disabled={!accessible}
                    className={`w-7 h-7 flex-none rounded-full border text-xs flex items-center justify-center transition-colors ${
                      active
                        ? "bg-[#35a79b]/15 border-[#35a79b] text-[#35a79b]"
                        : faite
                          ? "bg-[#0c0e0d] border-[#35a79b] text-[#35a79b]"
                          : accessible
                            ? "bg-[#0c0e0d] border-[#343735] text-[#8b9391] hover:border-[#565b59]"
                            : "bg-[#0c0e0d] border-[#22302e] text-[#4a4d4b] cursor-not-allowed"
                    }`}
                  >
                    {faite ? <Check className="w-3 h-3" /> : accessible ? e.n : <Lock className="w-2.5 h-2.5" />}
                  </button>
                  <div
                    className={`h-px flex-1 ${
                      i === ETAPES.length - 1 ? "bg-transparent" : e.n < etape ? "bg-[#35a79b]/40" : "bg-[#282b2a]"
                    }`}
                  />
                </div>
                <div className="mt-2.5 text-center px-1">
                  <div
                    className={`text-[12.5px] ${
                      active ? "text-[#edeae5]" : accessible ? "text-[#9aa19e]" : "text-[#4a4d4b]"
                    }`}
                  >
                    {e.label}
                  </div>
                  <div className="text-[11px] text-[#6b7270] mt-0.5 hidden sm:block">{e.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {apercu && (
        <div className="rounded-md border border-sky-500/25 bg-sky-500/[0.07] px-4 py-3 flex items-start gap-2 text-sm text-sky-200/90">
          <Eye className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Mode aperçu — deal fictif, les cinq étapes sont ouvertes pour visiter les écrans. Aucune
            action n'est exécutée et rien n'est enregistré.
          </span>
        </div>
      )}

      {dossier?.test && !apercu && <BandeauTest dossier={dossier} />}

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

function EtapeMail({ dossier, onSuivant, apercu }) {
  const [prompt, setPrompt] = useState("");
  const [gabarit, setGabarit] = useState(null);
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
  // Deal de test : envoi simulé côté serveur, aucune boîte requise.
  const test = !!dossier?.test;

  // Deal déjà créé : l'étape est derrière nous, on la résume. En aperçu on
  // montre plutôt l'écran de composition, qui est le cœur de l'étape.
  if (dossier && !apercu) {
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
        description="À écrire pendant l'appel. Choisissez un gabarit, complétez l'adresse et le nom de l'agent, le brouillon s'écrit. L'envoi part de votre Gmail — ou passez si vous avez déjà la fiche."
      />
      <div className="bg-[#0a0c0c] border border-[#282b2a] rounded-md p-6">
      {!brouillon ? (
        <>
          <div className="text-[10.5px] tracking-[.12em] uppercase text-[#6b7270] mb-2.5">Gabarits</div>
          <div className="flex flex-wrap gap-[7px] mb-4">
            {GABARITS.map((g) => (
              <button
                key={g.label}
                onClick={() => {
                  setGabarit(g.label);
                  setPrompt(g.prompt(dossier));
                }}
                className={`px-3 py-[7px] rounded text-[11.5px] border transition-colors ${
                  gabarit === g.label
                    ? "border-[#35a79b] text-[#35a79b] bg-[#35a79b]/10"
                    : "border-[#303332] text-[#9aa19e] hover:border-[#565b59]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Choisissez un gabarit, puis complétez l'adresse, le nom de l'agent…"
            className="bg-[#0c0e0d] border-[#282b2a] text-[#d3d8d6] resize-vertical"
          />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Button
              onClick={() => composer.mutate()}
              disabled={apercu || !prompt.trim() || composer.isPending}
              className="bg-transparent border border-[#3a3e3c] text-[#edeae5] hover:bg-[#edeae5]/[0.06]"
            >
              {composer.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Générer
            </Button>
            <Button
              variant="ghost"
              onClick={onSuivant}
              className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5 ml-auto"
            >
              <SkipForward className="w-4 h-4 mr-1.5" /> Passer — j'ai déjà la fiche
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {comptes.length > 0 ? (
            <div>
              <Label className="text-[#9aa19e] text-xs mb-1.5 block">Envoyer depuis</Label>
              <select
                value={expediteur || comptes[0]?.id}
                onChange={(e) => {
                  setExpediteur(e.target.value);
                  localStorage.setItem("klocka:dernier-expediteur", e.target.value);
                }}
                className="w-full bg-[#171918] border border-[#282b2a] rounded-md px-3 py-2 text-[#edeae5] text-sm"
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
            <Label className="text-[#9aa19e] text-xs mb-1.5 block">Destinataire</Label>
            <Input
              value={brouillon.to}
              onChange={(e) => setBrouillon({ ...brouillon, to: e.target.value })}
              placeholder="agent@agence.fr"
              className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
            />
          </div>
          <div>
            <Label className="text-[#9aa19e] text-xs mb-1.5 block">Objet</Label>
            <Input
              value={brouillon.subject}
              onChange={(e) => setBrouillon({ ...brouillon, subject: e.target.value })}
              className="bg-[#171918] border-[#282b2a] text-[#edeae5]"
            />
          </div>
          <div>
            <Label className="text-[#9aa19e] text-xs mb-1.5 block">Corps</Label>
            <Textarea
              value={brouillon.body}
              onChange={(e) => setBrouillon({ ...brouillon, body: e.target.value })}
              rows={8}
              className="bg-[#171918] border-[#282b2a] text-[#edeae5] leading-relaxed"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setBrouillon(null)} className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5">
              Reprendre
            </Button>
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={onSuivant}
              className="text-[#9aa19e] hover:text-[#edeae5] hover:bg-[#edeae5]/5"
            >
              <SkipForward className="w-4 h-4 mr-1.5" /> Passer sans envoyer
            </Button>
            <Button
              onClick={() => (sansCompte && googleConfigure && !test ? connecter() : envoyer.mutate())}
              disabled={
                apercu ||
                !brouillon.to.trim() ||
                !brouillon.subject.trim() ||
                envoyer.isPending ||
                connexionEnCours
              }
              className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d] font-medium"
            >
              {envoyer.isPending || connexionEnCours ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {test ? "Envoyer (simulé)" : sansCompte && googleConfigure ? "Connecter Gmail et envoyer" : "Envoyer via Gmail"}
            </Button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Étape 2 — Pré-analyse : dépôt (nouveau deal) ou résultat, décision Oui/Non
// ---------------------------------------------------------------------------

function EtapePreanalyse({ dossier, onAnalyse, onSaisie, enCours, onRefresh, apercu }) {
  const titre = (
    <TitreEtape
      n={2}
      titre="Pré-analyse"
      description="La fiche est passée sur nos critères : verdict déterministe, métriques AEM, simulateur pré-rempli, carte et marché local. L'étape se clôt par un Oui / Non."
    />
  );

  // --- Nouveau deal : la fiche entre ici -----------------------------------
  if (!dossier)
    return (
      <>
        {titre}
        <DepotFiche onAnalyse={onAnalyse} />
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
    <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-6">
      <p className="text-[#edeae5] text-sm font-medium mb-1">Pré-analyser la fiche</p>
      <p className="text-[#8b9391] text-xs mb-4">
        Déposez la fiche commerciale reçue de l'agent (ou collez le texte du mail) : extraction,
        vérification des citations, verdict et simulateur. Les mails reçus se préanalysent aussi en un
        clic depuis la Boîte de réception de la page Mails.
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
    if (!abandonne && !evenement) {
      return (
        <div className="bg-[#0a0c0c] border border-[#242726] rounded-md px-5 py-4 flex items-center gap-3">
          <span className="w-8 h-8 rounded-md bg-[#edeae5]/5 text-[#8b9391] flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4" />
          </span>
          <p className="text-[#9aa19e] text-sm min-w-0">
            {descInactif || "Aucune décision formelle enregistrée à cette étape."}
          </p>
        </div>
      );
    }

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
        description="Baux, PV d'AG, diagnostics : dépôt, classement dans le Drive « Klocka Projets », dépouillement case par case avec page source, puis synthèse des points à vérifier."
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

  return (
    <>
      <TitreEtape
        n={4}
        titre="Décision"
        description="Tout est sur la table : synthèse documentaire, verdict, marché. On présente au client, ou on abandonne — chaque issue part avec son mail pré-rédigé."
      />
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

      <BlocVideoPresentation dossier={dossier} apercu={apercu} />

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
        descInactif="La décision se prendra une fois les documents reçus ou dépouillés (étape 3)."
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
        pré-analyse) et données de marché issues de la base. Il s'ouvre ensuite dans l'éditeur pour
        compléter photos, secteur et documents client.
      </p>
      <Button
        onClick={() => creerProjet.mutate()}
        disabled={apercu || creerProjet.isPending || statut !== "depouille"}
        className="bg-[#edeae5] hover:bg-[#d8d5d0] text-[#0c0e0d]"
      >
        {creerProjet.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Briefcase className="w-4 h-4 mr-2" />
        )}
        Créer le projet pré-rempli
      </Button>
      {statut !== "depouille" && (
        <p className="text-[#6b7270] text-[11px] mt-3">Disponible une fois les documents analysés (étape 3).</p>
      )}
    </div>
    </>
  );
}
