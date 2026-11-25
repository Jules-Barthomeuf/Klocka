import React from "react";
import { ChevronRight } from "lucide-react";
import { VERRE } from "@/lib/verre";

// Les briques des Paramètres, refaits le 25 nov. 2026 (Jules : « redesign la page Paramètres, je ne l'aime pas ») :
// une colonne de lecture, des groupes titrés au-dessus d'une carte de verre, une ligne par réglage (son nom et sa
// note à gauche, le geste à droite). Plus d'étiquette en capitales qui répète l'onglet, plus de carte pleine largeur.

/** Un groupe : le titre et sa note au-dessus, les lignes dans une carte de verre (`nu` : l'enfant porte sa carte). */
export function Groupe({ titre, note = null, action = null, nu = false, children, className = "" }) {
  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      {(titre || action) && (
        <div className="flex items-end justify-between gap-4 px-1">
          <div className="min-w-0">
            {titre && <h2 className="m-0 text-[15px] font-normal text-encre">{titre}</h2>}
            {note && <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise [text-wrap:pretty]">{note}</p>}
          </div>
          {action}
        </div>
      )}
      {nu ? children : <div className={`${VERRE} divide-y divide-trait overflow-hidden`}>{children}</div>}
    </div>
  );
}

/**
 * Une ligne de réglage. `pile` : le geste passe sous le nom (un champ long, une liste de pastilles) ; `onClick` : toute
 * la ligne mène ailleurs, un chevron le dit.
 */
export function Rangee({ titre, note = null, pile = false, onClick = null, children = null }) {
  const corps = (
    <>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14.5px] text-encre">{titre}</p>
        {note && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-ardoise [text-wrap:pretty]">{note}</p>}
      </div>
      {children != null && <div className={pile ? "w-full min-w-0" : "flex min-w-0 flex-none items-center gap-2"}>{children}</div>}
      {onClick && <ChevronRight className="h-4 w-4 flex-none text-brume transition-transform group-hover:translate-x-0.5" />}
    </>
  );
  const classe = `flex min-h-[60px] gap-x-6 gap-y-3 px-5 py-3.5 ${pile ? "flex-col" : "items-center max-md:flex-wrap"}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`group w-full text-left transition-colors hover:bg-relief ${classe}`} style={{ background: "transparent" }}>
        {corps}
      </button>
    );
  }
  return <div className={classe}>{corps}</div>;
}

/** L'interrupteur des Paramètres, celui de la carte du compte. */
export function Interrupteur({ actif, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!actif} aria-label={label} onClick={() => onChange(!actif)}
      className={`relative h-6 w-10 flex-none rounded-full transition-colors ${actif ? "bg-menthe" : "bg-relief"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-encre shadow transition-all ${actif ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

/** Le bouton secondaire d'une ligne. */
export const BOUTON_LIGNE = "inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50";
