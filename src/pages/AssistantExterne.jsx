import React, { useEffect } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

const ASSISTANT_URL = "https://immo-assistant.onrender.com";

export default function AssistantExterne() {
  useEffect(() => {
    window.location.href = ASSISTANT_URL;
  }, []);

  return (
    <div className="h-screen bg-[#000000] flex flex-col items-center justify-center text-center px-6">
      <Loader2 className="w-8 h-8 text-[#8fa0f2] animate-spin mb-6" />
      <p className="text-[#f2f3f5] text-lg mb-2">Redirection vers l'assistant…</p>
      <p className="text-[#9298a6] text-sm mb-6">Vous allez être redirigé automatiquement.</p>
      <a
        href={ASSISTANT_URL}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8fa0f2]/15 border border-[#8fa0f2]/30 hover:bg-[#8fa0f2]/25 text-[#f2f3f5] text-sm transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Ouvrir l'assistant
      </a>
    </div>
  );
}