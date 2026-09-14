import React from "react";
import { Info } from "lucide-react";

// Une précision qui ne prend pas de place : un « i » discret, et le texte
// n'apparaît qu'au survol ou au clavier.
//
// C'est pour ce qui explique un chiffre sans le porter — l'échelle, le rayon,
// la source, la fourchette de surface. Utile quand on doute, encombrant le
// reste du temps : quatre cartes côte à côte, chacune avec deux lignes de
// mention grise, et l'on ne voit plus les chiffres.
//
// Ce n'est PAS un bouton : ces cartes sont elles-mêmes cliquables, et un
// bouton dans un bouton n'est pas du HTML valide. C'est un span focalisable,
// avec un title natif pour le survol long et le tactile.

export default function InfoBulle({ texte, className = "" }) {
  if (!texte) return null;
  return (
    <span
      role="note"
      tabIndex={0}
      title={texte}
      aria-label={texte}
      onClick={(e) => e.stopPropagation()}
      className={`group/info relative inline-flex items-center outline-none ${className}`}
    >
      <Info className="w-[13px] h-[13px] text-brume group-hover/info:text-menthe group-focus/info:text-menthe transition-colors" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 z-30 w-max max-w-[280px] rounded-[8px] border border-bord-doux bg-surface px-2.5 py-1.5 text-[11px] leading-[1.45] font-normal normal-case tracking-normal text-craie text-left shadow-[0_10px_30px_rgba(0,0,0,.55)] opacity-0 group-hover/info:opacity-100 group-focus/info:opacity-100 transition-opacity"
      >
        {texte}
      </span>
    </span>
  );
}
