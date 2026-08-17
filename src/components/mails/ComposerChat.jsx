import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

// Chat de composition de mail (agent « mailier ») : conversation multi-tours
// persistée via /api/agents/conversations. À chaque tour, l'agent peut créer
// ou réviser le brouillon — remonté au parent via onBrouillon, qui alimente le
// panneau d'édition/envoi existant de la page Mails.

const EXEMPLES = [
  "Envoie le template présentation à Marc Dupont de l'agence Centrale",
  "Prépare une demande de documents pour le local rue de la République",
  "Réponds à un agent que nous restons en recherche d'opportunités",
];

export default function ComposerChat({ onBrouillon }) {
  const [conversation, setConversation] = useState(null);
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const finListe = useRef(null);

  // Reprend la dernière conversation mailier, sans en créer une d'office.
  useEffect(() => {
    let vivant = true;
    base44.agents
      .listConversations({ agent_name: "mailier" })
      .then((liste) => {
        if (vivant && Array.isArray(liste) && liste.length) setConversation(liste[0]);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  useEffect(() => {
    finListe.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages?.length, enCours]);

  const messages = (conversation?.messages || []).filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  const envoyer = async (contenu) => {
    const instruction = (contenu ?? texte).trim();
    if (!instruction || enCours) return;
    setEnCours(true);
    setTexte("");
    // Affichage optimiste du message utilisateur pendant la génération.
    setConversation((c) =>
      c ? { ...c, messages: [...(c.messages || []), { role: "user", content: instruction }] } : c
    );
    try {
      let conv = conversation;
      if (!conv) {
        conv = await base44.agents.createConversation({ agent_name: "mailier" });
      }
      const maj = await base44.agents.addMessage(conv, { role: "user", content: instruction });
      setConversation(maj);
      const derniere = [...(maj?.messages || [])].reverse().find((m) => m.role === "assistant");
      if (derniere?.brouillon) onBrouillon?.(derniere.brouillon);
    } catch (e) {
      toast.error(e?.message || "L'assistant n'a pas répondu");
    } finally {
      setEnCours(false);
    }
  };

  const nouvelleConversation = () => {
    setConversation(null);
    setTexte("");
  };

  return (
    <div className="bg-[#0a0f0e] border border-[#1c2725] rounded-md p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-[#33d6c0]" />
        <span className="text-white text-sm font-medium">Décrivez le mail, affinez-le en discutant</span>
        {conversation && (
          <button
            onClick={nouvelleConversation}
            className="ml-auto text-[11px] text-gray-500 hover:text-white flex items-center gap-1 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" /> Nouvelle conversation
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div className="max-h-64 overflow-y-auto space-y-2.5 mb-3 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-md px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-[#33d6c0]/20 text-[#D8F3EE]"
                    : "bg-[#101715] text-gray-300"
                }`}
              >
                {m.content}
                {m.role === "assistant" && m.brouillon && (
                  <p className="text-[#5ee7d4] text-[11px] mt-1.5">→ Brouillon mis à jour ci-dessous</p>
                )}
              </div>
            </div>
          ))}
          {enCours && (
            <div className="flex justify-start">
              <div className="bg-[#101715] rounded-md px-3 py-2">
                <Loader2 className="w-4 h-4 text-[#33d6c0] animate-spin" />
              </div>
            </div>
          )}
          <div ref={finListe} />
        </div>
      )}

      <Textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            envoyer();
          }
        }}
        placeholder={
          messages.length
            ? "Ajoutez une consigne : « ajoute le cahier des charges », « ton plus direct »…"
            : "Envoie le template présentation à Marc Dupont de l'agence Centrale…"
        }
        rows={2}
        disabled={enCours}
        className="bg-[#101715] border-[#1c2725] text-white placeholder:text-gray-600 resize-none"
      />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {!messages.length &&
          EXEMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => envoyer(ex)}
              className="text-[11px] text-gray-500 hover:text-gray-300 border border-[#1c2725] rounded-full px-3 py-1 transition-colors"
            >
              {ex}
            </button>
          ))}
        <Button
          onClick={() => envoyer()}
          disabled={!texte.trim() || enCours}
          className="ml-auto bg-[#33d6c0] hover:bg-[#2bb8a5] text-white"
        >
          {enCours ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Réflexion…
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> Envoyer à l'assistant
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
