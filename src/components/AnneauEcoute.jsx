import React from "react";

// L'anneau qui tourne autour d'un bouton de dictée pendant qu'on parle : un
// dégradé conique en couleurs, qui tourne — pour qu'on voie que ça enregistre
// d'un coup d'œil, pas seulement que le bouton a changé de couleur.
//
// Purement décoratif (aria-hidden) : l'état réel reste porté par le bouton
// lui-même (aria-pressed, titre). Respecte prefers-reduced-motion.
const ARC_EN_CIEL =
  "conic-gradient(from 0deg, #ff5f6d, #ffae42, #ffe66d, #6ee7b7, #38bdf8, #a78bfa, #f472b6, #ff5f6d)";

export default function AnneauEcoute({ actif = false, epaisseur = 3, vitesse = "2.4s", className = "", children }) {
  // Un disque plein derrière un bouton souvent translucide (le fond « écoute »
  // n'est parfois qu'à 20 % d'opacité) aurait teinté tout le bouton en
  // arc-en-ciel au lieu de border son contour. Un masque radial troue le
  // centre du disque à la taille exacte du bouton : ce qui reste peint n'est
  // que l'anneau des `epaisseur` derniers pixels, quel que soit le fond du
  // bouton par-dessus.
  const masque = `radial-gradient(farthest-side, transparent calc(100% - ${epaisseur}px), #000 calc(100% - ${epaisseur}px))`;
  return (
    <span className={`relative inline-flex flex-none ${className}`}>
      {actif && (
        <span
          aria-hidden="true"
          className="absolute rounded-full animate-spin motion-reduce:animate-none"
          style={{ inset: -epaisseur, background: ARC_EN_CIEL, animationDuration: vitesse, WebkitMask: masque, mask: masque }}
        />
      )}
      <span className="relative rounded-full">{children}</span>
    </span>
  );
}
