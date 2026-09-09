import React from "react";
import { sansMarkdown } from "@/components/preanalyse/ChatDossier";

// Un message de conversation, le même partout : la question dans une bulle à
// droite, la réponse en texte plein à gauche — elle se lit comme une page, pas
// comme un cadre. Le markdown résiduel est nettoyé à l'affichage.
export default function MessageIA({ m }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[20px] bg-[#1a1d1c] px-5 py-3.5 text-[15px] leading-[1.6] text-[#f2f3f5] whitespace-pre-wrap">{m.contenu}</div>
      </div>
    );
  }
  return <div className="text-[15px] leading-[1.75] text-[#e6e8eb] whitespace-pre-wrap">{sansMarkdown(m.contenu)}</div>;
}
