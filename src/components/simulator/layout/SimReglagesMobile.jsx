import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";

// Au téléphone, le rail des curseurs (caché sous 768 px) s'ouvre en plein
// écran depuis une pilule flottante en bas : sans elle, aucun paramètre ne se
// réglait. Rendu par portail, `fixed inset-0 z-[70]`, la page derrière ne
// défile plus. Au-dessus de 768 px, rien ne s'affiche.
export default function SimReglagesMobile({ children }) {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (!ouvert) return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const touche = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", touche);
    return () => { document.body.style.overflow = avant; window.removeEventListener("keydown", touche); };
  }, [ouvert]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {!ouvert && (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="md:hidden fixed left-1/2 z-40 -translate-x-1/2 inline-flex h-11 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe shadow-[0_18px_40px_rgb(0_0_0/0.18)] hover:bg-menthe-survol"
          style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
        >
          <SlidersHorizontal className="h-4 w-4" /> Réglages
        </button>
      )}
      {ouvert && (
        <div className="md:hidden fixed inset-0 z-[70] flex h-[100dvh] flex-col bg-fond" role="dialog" aria-modal="true" aria-label="Réglages du simulateur" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="min-h-0 flex-1">{children}</div>
          <div className="flex-shrink-0 border-t border-trait bg-surface px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="h-11 w-full rounded-full bg-menthe text-[14px] text-sur-menthe hover:bg-menthe-survol"
            >
              Voir les résultats
            </button>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
