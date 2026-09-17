import React from "react";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

// Ce qu'on voit quand l'IA travaille : l'orbe, et un mot. Remplace le petit
// rond qui tourne partout où une action passe par le modèle.
//
//   etat   : working · searching · solving · listening · composing · shaping…
//   taille : 20 (dans une ligne de texte) ou 64 (comme un avatar). La
//            bibliothèque n'en connaît pas d'autres : ses réglages sont rangés
//            sous ces deux clés, et toute autre valeur la fait planter.
//   pixels : la taille à l'écran, quand on veut l'orbe plus grand qu'un
//            avatar. Le dessin reste en 64 (fois la densité de l'écran, donc
//            128 en pratique) et c'est l'affichage qui grandit.
//   texte  : le mot à côté, facultatif
//   clair  : true sur fond clair (bouton blanc), sinon fond sombre
export default function PenseeIA({ etat = "working", taille = 20, pixels = null, texte = null, clair = false, className = "" }) {
  const dessin = taille === 64 || pixels ? 64 : 20;
  return (
    <span className={`inline-flex items-center gap-2 align-middle ${className}`}>
      <span className={pixels ? "inline-flex" : dessin === 64 ? "[&_canvas]:!size-9 inline-flex" : "inline-flex [&_canvas]:!size-5"}>
        <ThinkingOrb state={etat} size={dessin} theme={clair ? "light" : "dark"} style={pixels ? { width: pixels, height: pixels } : undefined} />
      </span>
      {texte && <span className="text-ardoise text-[12.5px]">{texte}</span>}
    </span>
  );
}
