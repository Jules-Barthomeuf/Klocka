import React, { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { nomOnglet } from "./AnalyseDocuments";
import { toast } from "sonner";
import { ArrowRight, Loader2, X } from "lucide-react";

// Le chat du dossier : une grande zone de saisie, trois modes en pastilles,
// puis la liste des requêtes lancées — on y revient d'un clic.

const MODES = [
  { id: "analyse", label: "Analyse (critères du fonds)", court: "Table d'analyse" },
  { id: "verification", label: "Points à vérifier", court: "Points à vérifier" },
  { id: "question", label: "Question libre", court: "Question" },
  { id: "web", label: "Recherche web", court: "Recherche web" },
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

function Message({ m }) {
  const moi = m.role === "user";
  return (
    <div className={`flex ${moi ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-lg px-4 py-3 text-[13.5px] leading-[1.7] whitespace-pre-wrap
          ${moi ? "bg-[#1a1d1c] text-[#f2f3f5] border border-[#22262d]" : "bg-transparent text-[#c9cdd6] border border-[#1f2228]"}`}
      >
        {m.contenu}
      </div>
    </div>
  );
}

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
  // faire sur les étapes Mail, Vidéo, Plateforme et Présentation.
  afficherRequetes = true,
}) {
  const [mode, setMode] = useState("question");
  const [texte, setTexte] = useState("");
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
    mutationFn: () =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/chat`, {
        body: { message: texte.trim(), mode, documents: documentsCoches, conversation_id: conversationId },
      }),
    onSuccess: (conv) => { setTexte(""); setConversationId(conv.id); onRefresh?.(); },
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

  const supprimerConv = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/conversations/${id}`),
    onSuccess: (_, id) => { if (conversationId === id) setConversationId(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const enCours = modeMail ? compositionEnCours : modePreanalyse ? analyseEnCours : envoyer.isPending;
  const lancer = () => {
    if (modeMail) return onComposer?.(texte.trim());
    if (modePreanalyse) return onAnalyserTexte?.(texte.trim());
    return envoyer.mutate();
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

  // « Requêtes récentes » réunit les conversations et les extractions : on
  // revient sur une analyse lancée comme sur une question posée.
  const requetes = [
    ...conversations.map((c) => ({
      cle: c.id,
      titre: c.titre,
      type: MODES.find((m) => m.id === c.mode)?.court || "Question",
      auteur: c.cree_par,
      date: c.maj_le || c.cree_le,
      ouvrir: () => setConversationId(c.id),
      supprimer: () => supprimerConv.mutate(c.id),
    })),
    ...extractions.map((e) => ({
      cle: e.id,
      titre: nomOnglet(e),
      type: e.erreur ? "Analyse (échec)" : "Table d'analyse",
      auteur: e.extrait_par,
      date: e.extrait_le,
      ouvrir: () => onOuvrirExtraction?.(e.id),
      supprimer: null,
    })),
  ].sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));

  return (
    <div className="space-y-4">
      {/* Conversation ouverte */}
      {!modeMail && !modePreanalyse && conversation && (
        <div className="border border-[#22262d] rounded-xl bg-[#131615]">
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#1f2228]">
            <p className="m-0 text-[13.5px] text-[#f2f3f5] truncate">{conversation.titre}</p>
            <button onClick={() => setConversationId(null)} className="text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5] transition-colors flex-shrink-0">
              Nouvelle requête
            </button>
          </div>
          <div className="px-5 py-4 space-y-3 max-h-[460px] overflow-y-auto">
            {conversation.messages.map((m, i) => <Message key={i} m={m} />)}
            {envoyer.isPending && (
              <div className="flex items-center gap-2 text-[#9298a6] text-[12.5px]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Réflexion…</div>
            )}
            <div ref={finRef} />
          </div>
        </div>
      )}

      {/* Zone de saisie */}
      <div className="max-w-[880px] mx-auto">
        <div className="bg-[#171a19] border border-[#22262d] rounded-xl px-5 pt-4 pb-3 focus-within:border-[#8fa0f2]/60 transition-colors">
          <textarea
            rows={2}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && peutEnvoyer) { e.preventDefault(); lancer(); } }}
            placeholder={placeholder}
            disabled={apercu || !dossier}
            className="w-full bg-transparent border-0 outline-none resize-none text-[15px] text-[#f2f3f5] placeholder:text-[#5a615f] disabled:opacity-50"
          />
          <div className={`flex items-center gap-3 mt-2 ${modeMail || modePreanalyse ? "justify-end" : "justify-between"}`}>
            <button
              onClick={() => onToutCocher?.()}
              hidden={modeMail || modePreanalyse}
              disabled={!documents.length}
              title={documents.length ? "Choisir les documents interrogés" : "Aucun document importé"}
              className="text-[12.5px] px-3.5 py-1.5 rounded-full border border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors disabled:opacity-40"
            >
              Sources : {nbCoches ? `${nbCoches} document${nbCoches > 1 ? "s" : ""}` : documents.length ? "aucune" : "générales"}
            </button>
            <button
              onClick={lancer}
              disabled={!peutEnvoyer}
              className="w-10 h-10 rounded-full bg-[#f2f3f5] text-[#000000] flex items-center justify-center hover:brightness-95 disabled:opacity-30 transition-all flex-shrink-0"
              title="Envoyer"
            >
              {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Modes */}
        <div className="flex flex-wrap justify-center gap-2.5 mt-4">
          {modePreanalyse ? (
            <>
              <button
                onClick={() => fichierRef.current?.click()}
                disabled={apercu || analyseEnCours}
                className="px-4 py-2 rounded-full text-[13px] border border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors disabled:opacity-50"
              >
                Importer un fichier
              </button>
              <input
                ref={fichierRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.eml,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAnalyserFichier?.(f); }}
              />
              <span className="px-1 py-2 text-[12.5px] text-[#6a7180]">
                ou collez l'email dans le chat pour lancer l'analyse
              </span>
            </>
          ) : modeMail
            ? gabarits.map((g) => (
                <button
                  key={g.label}
                  onClick={() => setTexte(g.prompt(dossier))}
                  disabled={apercu}
                  className="px-4 py-2 rounded-full text-[13px] border border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors disabled:opacity-50"
                >
                  {g.label}
                </button>
              ))
            : MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  // « Analyse » sur des documents cochés part sans prompt :
                  // l'extraction est une action, pas une question.
                  if (m.id === "analyse" && nbCoches && onExtraire) return onExtraire();
                  setMode(m.id);
                }}
                disabled={!!conversation || (m.id === "analyse" && extractionEnCours)}
                title={
                  m.id === "analyse" && nbCoches
                    ? `Extraire ${nbCoches} document${nbCoches > 1 ? "s" : ""} — sans question à écrire`
                    : conversation ? "Le mode est fixé par la requête ouverte" : undefined
                }
                className={`px-4 py-2 rounded-full text-[13px] border transition-colors disabled:opacity-50
                  ${mode === m.id ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000] font-medium" : "border-[#22262d] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a]"}`}
              >
                {m.id === "analyse" && extractionEnCours ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Extraction…</span>
                ) : (
                  m.label
                )}
              </button>
            ))}
        </div>
      </div>

      {/* Requêtes récentes */}
      {afficherRequetes && !modeMail && !modePreanalyse && requetes.length > 0 && (
        <div className="pt-4">
          <h3 className="m-0 mb-3 text-[16px] font-medium text-[#f2f3f5]">Requêtes récentes</h3>
          <div className="border-t border-[#15171b]">
            {requetes.map((r) => (
              <div key={r.cle} className="flex items-center gap-4 px-1 py-3.5 border-b border-[#15171b] hover:bg-[#f2f3f5]/[0.02] transition-colors group">
                <button onClick={r.ouvrir} className="flex-1 min-w-0 text-left text-[13.5px] text-[#f2f3f5] truncate hover:text-[#aab6f5] transition-colors">
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
        </div>
      )}
    </div>
  );
}
