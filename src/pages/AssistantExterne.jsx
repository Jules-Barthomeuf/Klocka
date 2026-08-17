import React, { useEffect } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

const ASSISTANT_URL = "https://immo-assistant.onrender.com";

export default function AssistantExterne() {
  useEffect(() => {
    window.location.href = ASSISTANT_URL;
  }, []);

  return (
    <div className="h-screen bg-[#000000] flex flex-col items-center justify-center text-center px-6">
      <Loader2 className="w-8 h-8 text-[#33d6c0] animate-spin mb-6" />
      <p className="text-white text-lg mb-2">Redirection vers l'assistant…</p>
      <p className="text-gray-500 text-sm mb-6">Vous allez être redirigé automatiquement.</p>
      <a
        href={ASSISTANT_URL}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#33d6c0]/15 border border-[#33d6c0]/30 hover:bg-[#33d6c0]/25 text-white text-sm transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        Ouvrir l'assistant
      </a>
    </div>
  );
}