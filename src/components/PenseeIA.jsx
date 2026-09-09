import React from "react";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

// Ce qu'on voit quand l'IA travaille : l'orbe, et un mot. Remplace le petit
// rond qui tourne partout où une action passe par le modèle.
//
//   etat   : working · searching · solving · listening · composing · shaping…
//   taille : 20 (dans une ligne de texte) ou 64 (comme un avatar)
//   texte  : le mot à côté, facultatif
//   clair  : true sur fond clair (bouton blanc), sinon fond sombre
export default function PenseeIA({ etat = "working", taille = 20, texte = null, clair = false, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 align-middle ${className}`}>
      <span className={taille === 64 ? "[&_canvas]:!size-9 inline-flex" : "inline-flex [&_canvas]:!size-5"}>
        <ThinkingOrb state={etat} size={taille} theme={clair ? "light" : "dark"} />
      </span>
      {texte && <span className="text-[#9298a6] text-[13px]">{texte}</span>}
    </span>
  );
}
