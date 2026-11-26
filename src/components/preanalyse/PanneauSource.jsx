import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Le volet d'une pièce ouverte, à droite (26 nov. 2026, Jules : « on ne peut plus le fermer, il y a la tête du profil ;
// mets la croix à gauche du nom, ou un clic sur la page de gauche ferme le truc, avec une petite animation ») : posé sur
// la page entière (portail), au-dessus de la photo de profil ; un clic à côté ou Échap le ferme, il glisse à droite.
// `children` reçoit `fermer`, la fermeture animée, pour la croix de la visionneuse.

export default function PanneauSource({ onFermer, className = "", children }) {
  const zone = useRef(null);
  const [sortie, setSortie] = useState(false);
  const fini = useRef(false);
  const fermer = useCallback(() => {
    if (fini.current) return;
    fini.current = true;
    setSortie(true);
    setTimeout(onFermer, 200);
  }, [onFermer]);
  useEffect(() => {
    const touche = (e) => { if (e.key === "Escape") fermer(); };
    const ailleurs = (e) => {
      if (zone.current && !zone.current.contains(e.target) && !e.target.closest?.("[role=dialog], [role=menu], [data-sonner-toaster]")) fermer();
    };
    window.addEventListener("keydown", touche);
    document.addEventListener("pointerdown", ailleurs);
    return () => { window.removeEventListener("keydown", touche); document.removeEventListener("pointerdown", ailleurs); };
  }, [fermer]);
  return createPortal(
    <div ref={zone}
      className={`panneau-source fixed inset-y-0 right-0 z-[60] w-full border-l border-bord bg-fond shadow-[-24px_0_60px_rgba(0,0,0,.6)] sm:w-[720px] ${sortie ? "animate-out slide-out-to-right fill-mode-forwards duration-200 ease-in" : "animate-in slide-in-from-right duration-300 ease-out"} ${className}`}>
      {children(fermer)}
    </div>,
    document.body,
  );
}
