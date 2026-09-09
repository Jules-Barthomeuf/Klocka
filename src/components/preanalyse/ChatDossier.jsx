import React, { useEffect, useRef, useState } from "react";
import { useDictee } from "@/lib/dictee";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { nomOnglet } from "./AnalyseDocuments";
import { toast } from "sonner";
import { Mic, Square, Loader2, X, Plus, PanelRight, HardDrive, Paperclip, ChevronDown } from "lucide-react";
import BoiteSaisie, { BoutonBarre } from "@/components/BoiteSaisie";
import PenseeIA from "@/components/PenseeIA";
import Message from "@/components/MessageIA";
import { SuggestionsMail } from "./gabaritsMail";
import ImportDrive from "./ImportDrive";

// Le chat du dossier : une grande zone de saisie, les gabarits de mail,
// puis la liste des requêtes lancées — on y revient d'un clic.

// Un seul mode : la question. Les tables d'analyse ont leur place dans l'étape
// Analyse, les anciennes requêtes gardent leur libellé.
const MODES = [
  { id: "analyse", court: "Table d'analyse" },
  { id: "verification", court: "Points à vérifier" },
  { id: "question", court: "Question" },
];

const ilYA = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  return j < 30 ? `il y a ${j} j` : new Date(iso).toLocaleDateString("fr-FR");
};

// Le modèle a beau avoir la consigne, un astérisque passe parfois : on nettoie
// à l'affichage. Les listes « - » restent, le gras et les titres deviennent
// du texte, les puces « * » deviennent des tirets.
export const sansMarkdown = (t) => String(t || "")
  .replace(/\r\n?/g, "\n")
  .replace(/^[ \t]*```[^\n]*$/gm, "")
  .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
  .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "")
  .replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_, l) => l.split("|").map((c) => c.trim()).filter(Boolean).join(" — "))
  .replace(/^([ \t]*)[*+•][ \t]+/gm, "$1- ")
  .replace(/\*\*([^*\n]+)\*\*/g, "$1")
  .replace(/__([^_\n]+)__/g, "$1")
  .replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?=[^*\w]|$)/g, "$1$2")
  .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
  .replace(/`([^`\n]+)`/g, "$1")
  .replace(/^[ \t]*(---+|\*\*\*+|___+)[ \t]*$/gm, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export default function ChatDossier({
  dossier,
  documentsCoches = [],
  onToutCocher,
  onRefresh,
  apercu = false,
  // Étape Mail : le chat rédige le mail à l'agent. Les pastilles deviennent
  // les gabarits, et l'envoi produit un brouillon au lieu d'une requête.
  modeMail = false,
  gabarits = [],
  onComposer,
  compositionEnCours = false,
  // Étape Pré-analyse : coller l'email ou importer un fichier lance l'analyse.
  modePreanalyse = false,
  onAnalyserTexte,
  onAnalyserFichier,
  analyseEnCours = false,
  // Étape Analyse : extraire les documents cochés, sans passer par un prompt.
  onExtraire,
  extractionEnCours = false,
  onOuvrirExtraction,
  // Les requêtes n'accompagnent que le travail d'analyse : elles n'ont rien à
  // faire sur les étapes Mail, Plateforme et Présentation.
  afficherRequetes = true,
  panneauDocuments = null,
  nbDocuments = 0,
}) {
  const mode = "question";
  const [texte, setTexte] = useState("");
  // La suite d'une conversation se tape dans le panneau, pas dans la boîte de
  // la page : deux champs, sinon on voit l'un s'écrire dans l'autre.
  const [suite, setSuite] = useState("");
  // Rapidité : une réponse courte et directe. Réflexion : l'analyse des pièces.
  const [profondeur, setProfondeur] = useState(() => { try { return localStorage.getItem("klocka_profondeur") || "rapide"; } catch { return "rapide"; } });
  useEffect(() => { try { localStorage.setItem("klocka_profondeur", profondeur); } catch { /* sans mémoire */ } }, [profondeur]);
  const [conversationId, setConversationId] = useState(null);
  const finRef = useRef(null);
  const fichierRef = useRef(null);

  const conversations = dossier?.conversations || [];
  const extractions = dossier?.extractions || [];
  const conversation = conversations.find((c) => c.id === conversationId) || null;
  const documents = dossier?.documents_espace || [];
  const nbCoches = documentsCoches.length;

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [conversation?.messages?.length]);

  const envoyer = useMutation({
    mutationFn: (message) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/chat`, {
        body: { message: String(message || "").trim(), mode, profondeur, documents: documentsCoches, conversation_id: conversationId },
      }),
    onSuccess: (conv) => { setTexte(""); setSuite(""); setConversationId(conv.id); onRefresh?.(); },
    onError: (e) => {
      // Une coupure réseau ne dit rien d'utile telle quelle : on nomme la cause
      // probable, l'analyse étant longue et le serveur parfois redémarré.
      const reseau = /NetworkError|Failed to fetch|fetch failed/i.test(e?.message || "");
      toast.error(
        reseau ? "Connexion au serveur interrompue" : e?.message || "Le chat n'a pas pu répondre",
        reseau ? { description: "L'analyse peut prendre une minute. Vérifiez que le serveur tourne, puis relancez." } : undefined
      );
    },
  });

  // Hors pré-analyse, un fichier déposé rejoint les pièces du dossier.
  const deposer = useMutation({
    mutationFn: (fichier) => {
      const form = new FormData();
      form.append("fichier", fichier);
      return base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/documents`, { body: form, isForm: true });
    },
    onSuccess: (d) => { toast.success(`« ${d.nom} » ajouté`, { description: "L'extraction se fait toute seule." }); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Dépôt impossible"),
  });

  const supprimerConv = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/conversations/${id}`),
    onSuccess: (_, id) => { if (conversationId === id) setConversationId(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const [docsOuverts, setDocsOuverts] = useState(false);
  const [requetesOuvertes, setRequetesOuvertes] = useState(false);
  const [driveOuvert, setDriveOuvert] = useState(false);
  const [menuPlus, setMenuPlus] = useState(false);
  const enCours = modeMail ? compositionEnCours : modePreanalyse ? analyseEnCours : envoyer.isPending;
  const lancer = () => {
    // Envoyer clôt la dictée : sinon le micro reste ouvert et la suite de ce
    // qu'on dit s'écrit dans la question suivante.
    if (ecoute) arreter();
    if (modeMail) return onComposer?.(texte.trim());
    if (modePreanalyse) return onAnalyserTexte?.(texte.trim());
    return envoyer.mutate(texte);
  };
  const peutEnvoyer = !!texte.trim() && !enCours && !apercu && (modeMail || modePreanalyse || !!dossier);
  const placeholder = modeMail
    ? "Décrivez le mail à écrire à l'agent, ou choisissez un gabarit…"
    : modePreanalyse
      ? "Collez ici l'email de l'agent ou le texte de la fiche, puis lancez l'analyse…"
      : nbCoches
    ? `Poser une question sur ${nbCoches} document${nbCoches > 1 ? "s" : ""}…`
    : documents.length
      ? "Poser une question… (aucun document sélectionné : réponse générale)"
      : "Poser une question…";

  // « Requêtes récentes » : les questions posées. Les analyses de documents ont
  // leur place dans l'étape Analyse, on ne les redouble pas ici.
  const requetes = conversations
    .map((c) => ({
      cle: c.id,
      titre: c.titre,
      type: MODES.find((m) => m.id === c.mode)?.court || "Question",
      auteur: c.cree_par,
      date: c.maj_le || c.cree_le,
      ouvrir: () => setConversationId(c.id),
      supprimer: () => supprimerConv.mutate(c.id),
    }))
    .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));

  // Le micro : la dictée remplit le champ, on relit, on envoie.
  const { supporte: dicteeOk, ecoute, demarrer, arreter } = useDictee({ onTexte: (t) => setTexte(t) });

  return (
    <div className="space-y-4">
      {/* La requête s'ouvre dans un panneau : la page ne bouge pas, on la
          referme et on la retrouve depuis « Requêtes récentes ». */}
      {!modeMail && !modePreanalyse && (conversation || envoyer.isPending) && (
        <div className="fixed inset-y-0 right-0 z-[60] w-full sm:w-[680px] bg-[#0a0a0b] border-l border-[#22262d] shadow-[-24px_0_60px_rgba(0,0,0,.6)] flex flex-col animate-in slide-in-from-right duration-300 ease-out">
          <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#1f2228] flex-none">
            <p className="m-0 text-[14px] text-[#f2f3f5] truncate">{conversation?.titre || "Nouvelle requête"}</p>
            <button onClick={() => setConversationId(null)} className="text-[#6a7180] hover:text-[#f2f3f5] flex-shrink-0" aria-label="Fermer"><X className="w-4 h-4" /></button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-7">
            {(conversation?.messages || []).map((m, i) => (
              <Message
                key={i}
                m={m}
                question={m.role === "assistant" ? (conversation.messages[i - 1]?.role === "user" ? conversation.messages[i - 1].contenu : null) : null}
                surface={m.role === "assistant" ? "dossier" : null}
                dealId={dossier?.deal_id || null}
              />
            ))}
            {envoyer.isPending && (
              <PenseeIA etat={profondeur === "reflexion" ? "solving" : "working"} taille={64} texte={profondeur === "reflexion" ? "Je lis les pièces…" : "Réflexion…"} />
            )}
            <div ref={finRef} />
          </div>
          <div className="flex-none px-6 py-4 border-t border-[#1f2228]">
            <BoiteSaisie
              compact
              valeur={suite}
              onChange={setSuite}
              rows={2}
              maxLignes={5}
              placeholder={profondeur === "reflexion" ? "Poursuivre — réflexion, analyse des pièces…" : "Poursuivre — réponse rapide…"}
              onEnvoyer={() => envoyer.mutate(suite)}
              peutEnvoyer={!!suite.trim() && !envoyer.isPending}
              enCours={envoyer.isPending}
              libelle="Envoyer"
            />
          </div>
        </div>
      )}

      {/* Zone de saisie : le composeur de l'accueil, avec ce que le dossier a
          en plus — les sources, la profondeur, les mails types. */}
      <div className={`accueil-wrap max-w-[880px] mx-auto ${ecoute ? "voix" : ""}`}>
        <div aria-hidden="true" className="accueil-ring-sage" />
        <div aria-hidden="true" className="accueil-ring"><div className="accueil-beam" /></div>
        <div aria-hidden="true" className="accueil-ring-halo"><div className="accueil-beam" /></div>

        <div className="accueil-composer">
          <textarea
            rows={Math.min(4, Math.max(2, texte.split("\n").length))}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && peutEnvoyer) { e.preventDefault(); lancer(); } }}
            placeholder={placeholder}
            disabled={apercu || !dossier}
          />
          {modeMail && (
            <div className="px-7 pb-3 -mt-4 flex flex-wrap items-center gap-2">
              <SuggestionsMail dossier={dossier} onChoisir={setTexte} disabled={apercu} />
            </div>
          )}
          <div className="accueil-bar">
            <div className="accueil-tools">
              <input
                ref={fichierRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.eml,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (modePreanalyse) onAnalyserFichier?.(f); else deposer.mutate(f); }}
              />
              {!modeMail && (
                <div className="relative">
                  <button type="button" className="accueil-icon" title="Ajouter un document" aria-label="Ajouter un document" onClick={() => setMenuPlus((o) => !o)} disabled={apercu || (!dossier && !modePreanalyse)}><Paperclip className="w-4 h-4" /></button>
                  {menuPlus && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuPlus(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-20 bg-[#0f1114] border border-[#2c3139] rounded-xl shadow-[0_12px_30px_rgba(0,0,0,.5)] p-1.5 min-w-[240px]">
                        <button onClick={() => { setMenuPlus(false); fichierRef.current?.click(); }} className="w-full flex items-center gap-2.5 text-left text-[13px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.05] px-3 py-2 rounded-lg">
                          <Paperclip className="w-3.5 h-3.5" /> Depuis cet ordinateur
                        </button>
                        <button onClick={() => { setMenuPlus(false); setDriveOuvert(true); }} disabled={!dossier} className="w-full flex items-center gap-2.5 text-left text-[13px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.05] px-3 py-2 rounded-lg disabled:opacity-40">
                          <HardDrive className="w-3.5 h-3.5" /> Depuis le Google Drive
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!modeMail && !modePreanalyse && (
                <>
                  <button type="button" className={`accueil-icon ${nbCoches ? "!border-[#96c0b8]/60 !text-[#96c0b8]" : ""}`} onClick={() => onToutCocher?.()} disabled={!documents.length} title={documents.length ? `Sources : ${nbCoches ? `${nbCoches} document${nbCoches > 1 ? "s" : ""}` : "aucune"} — choisir les documents interrogés` : "Aucun document importé"} aria-label="Sources"><PanelRight className="w-4 h-4" /></button>
                  <span className="inline-flex items-center rounded-[9px] border border-white/[0.08] p-0.5">
                    {[["rapide", "Rapidité", "Une réponse courte et directe"], ["reflexion", "Réflexion", "L'analyse des pièces, plus longue"]].map(([id, mot, titre]) => (
                      <button key={id} type="button" onClick={() => setProfondeur(id)} title={titre} className={`px-3 py-1.5 rounded-[7px] text-[13px] transition-colors ${profondeur === id ? "bg-[#9CC3BC] text-[#0b1211] font-medium" : "text-[#9a9a9a] hover:text-[#f2f3f5]"}`} style={{ fontFamily: "Figtree, sans-serif" }}>{mot}</button>
                    ))}
                  </span>
                </>
              )}
              <button
                type="button"
                id="accueil-voix"
                aria-pressed={ecoute}
                disabled={apercu || !dossier}
                onClick={() => (dicteeOk ? (ecoute ? arreter() : demarrer()) : toast.error("La dictée n'est pas prise en charge par ce navigateur", { description: "Chrome ou Edge la proposent." }))}
                title={ecoute ? "Arrêter la voix" : "Dicter"}
              >
                <span className="dot" /><span>Voix</span>
              </button>
            </div>
            <button type="button" className="accueil-send" onClick={lancer} disabled={!peutEnvoyer}>
              {enCours ? <PenseeIA etat="working" taille={20} clair /> : null}
              {modeMail ? "Rédiger le mail" : modePreanalyse ? "Lancer l'analyse" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>

      {/* Documents, puis requêtes récentes : repliés, un clic les ouvre. Le
          chevron tourne, le contenu se déplie en hauteur — rien ne saute. */}
      {panneauDocuments && !modeMail && (
        <Volet titre="Documents" nombre={nbDocuments} ouvert={docsOuverts} onBasculer={() => setDocsOuverts((o) => !o)} className="mt-6">
          <div className="pt-4 pb-2">{panneauDocuments}</div>
        </Volet>
      )}
      {afficherRequetes && !modeMail && !modePreanalyse && requetes.length > 0 && (
        <Volet titre="Requêtes récentes" nombre={requetes.length} ouvert={requetesOuvertes} onBasculer={() => setRequetesOuvertes((o) => !o)} className={panneauDocuments ? "mt-4" : "mt-6"}>
          <div className="pb-2">
            {requetes.map((r) => (
              <div key={r.cle} className="flex items-center gap-4 px-1 py-3.5 border-b border-[#15171b] hover:bg-[#f2f3f5]/[0.02] transition-colors group">
                <button onClick={r.ouvrir} className="flex-1 min-w-0 text-left text-[13.5px] text-[#f2f3f5] truncate hover:text-[#c3ddd6] transition-colors">
                  {r.titre}
                </button>
                <span className="hidden md:block w-[130px] flex-shrink-0 text-[12.5px] text-[#9298a6]">{r.type}</span>
                <span className="hidden lg:block w-[190px] flex-shrink-0 text-[12.5px] text-[#6a7180] truncate">{r.auteur || "—"}</span>
                <span className="w-[86px] flex-shrink-0 text-right text-[12.5px] text-[#6a7180]">{ilYA(r.date)}</span>
                {r.supprimer ? (
                  <button
                    onClick={() => { if (window.confirm(`Supprimer « ${r.titre} » ?`)) r.supprimer(); }}
                    className="text-[#3f4644] hover:text-red-400 transition-colors flex-shrink-0"
                    title="Supprimer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="w-4 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </Volet>
      )}

      {driveOuvert && dossier && (
        <ImportDrive dealId={dossier.deal_id} onFermer={() => setDriveOuvert(false)} onImporte={() => onRefresh?.()} />
      )}
    </div>
  );
}

// Un volet repliable : le titre, le compte, un chevron qui tourne, et le
// contenu qui se déplie en hauteur (grille 0fr → 1fr) au lieu d'apparaître.
function Volet({ titre, nombre = 0, ouvert, onBasculer, className = "", children }) {
  return (
    <div className={className}>
      <button type="button" onClick={onBasculer} aria-expanded={ouvert} className="w-full flex items-center justify-between py-3 border-t border-b border-[#15171b] text-left group">
        <span className="text-[16px] font-medium text-[#f2f3f5]">{titre}{nombre ? <span className="text-[#6a7180] font-normal"> · {nombre}</span> : null}</span>
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[#6a7180] group-hover:text-[#f2f3f5] group-hover:bg-[#f2f3f5]/5 transition-all duration-300 ${ouvert ? "rotate-180" : ""}`}>
          <ChevronDown className="w-4 h-4" />
        </span>
      </button>
      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: ouvert ? "1fr" : "0fr" }} aria-hidden={!ouvert}>
        <div className={`min-h-0 overflow-hidden transition-opacity duration-300 ${ouvert ? "opacity-100" : "opacity-0"}`}>{children}</div>
      </div>
    </div>
  );
}
