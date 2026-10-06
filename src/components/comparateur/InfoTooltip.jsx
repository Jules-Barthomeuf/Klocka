import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

// Au téléphone, la bulle de 288 px centrée sur le bouton sortait de l'écran :
// elle s'y pose en bas, sur toute la largeur, par portail (fixed).
const telephone = () => typeof window !== "undefined" && window.innerWidth < 768;

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);

  const contenu = (
    <div className="flex items-start justify-between gap-2">
      <p className="text-encre/70 text-xs max-md:text-[13.5px] leading-relaxed">{text}</p>
      <button onClick={() => setOpen(false)} aria-label="Fermer" className="flex-shrink-0 text-encre/30 hover:text-encre/60 max-md:grid max-md:h-8 max-md:w-8 max-md:place-items-center max-md:-mr-1.5 max-md:-mt-1.5">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        aria-label="En savoir plus"
        className="relative ml-1.5 w-5 h-5 rounded-full bg-encre/[0.06] hover:bg-encre/[0.12] flex items-center justify-center transition-colors max-md:before:absolute max-md:before:-inset-2 max-md:before:content-['']"
      >
        <Info className="w-3 h-3 text-encre/40" />
      </button>
      {open && telephone() && createPortal(
        <>
          <div className="fixed inset-0 z-[79]" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-4 z-[80] bg-surface border border-bord rounded-[14px] p-4 shadow-xl" style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            {contenu}
          </div>
        </>,
        document.body
      )}
      {open && !telephone() && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-7 left-1/2 -translate-x-1/2 w-72 bg-surface border border-bord rounded-md p-3 shadow-xl">
            {contenu}
          </div>
        </>
      )}
    </span>
  );
}
