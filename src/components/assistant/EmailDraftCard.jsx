import React from "react";
import { Mail, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EmailDraftCard({ draft, onSend, sending, sent }) {
  return (
    <div className="bg-neutral-800 border border-white/[0.10] rounded-2xl overflow-hidden mt-2 max-w-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-[#2A9D8F]/15 flex items-center justify-center flex-shrink-0">
          <Mail className="w-4 h-4 text-[#2A9D8F]" />
        </div>
        <span className="text-white text-sm font-medium">Brouillon de mail</span>
      </div>

      <div className="px-4 py-3 space-y-2 text-sm">
        <div className="flex gap-2">
          <span className="text-gray-500 w-14 flex-shrink-0">À :</span>
          <span className="text-white break-all">{draft.to || "—"}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-500 w-14 flex-shrink-0">Objet :</span>
          <span className="text-white">{draft.subject || "—"}</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="bg-neutral-900 rounded-xl p-4 border border-white/[0.04]">
          <pre className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-sans">{draft.body}</pre>
        </div>
      </div>

      <div className="px-4 pb-4">
        {sent ? (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <Send className="w-4 h-4" /> Mail envoyé à {draft.to}
          </div>
        ) : (
          <Button
            onClick={onSend}
            disabled={sending || !draft.to}
            className="w-full bg-[#2A9D8F] hover:bg-[#2A9D8F]/90 text-white"
          >
            {sending ? (
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</span>
            ) : (
              <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Envoyer le mail</span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}