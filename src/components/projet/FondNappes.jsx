import React from "react";
import { alpha } from "@/design/jetons";

// Le fond du dashboard admin, posé ailleurs.
//
// Trois nappes radiales sur le fond noir : une menthe au centre, une pointe
// d'ambre à gauche, un vert plus sombre à droite. Rien ne les écrête : un halo
// coupé net dessine une ligne en travers de la page, et c'est précisément ce
// qu'on ne veut pas. Elles se posent derrière un en-tête, jamais derrière une
// grille de cartes, sinon la couleur remonte à travers les images.

export default function FondNappes({ hauteur = 620 }) {
  // Les nappes sont centrées dans la bande, pas accrochées à son bord haut :
  // décalées vers le haut, on n'en voyait que la frange, et la couleur
  // disparaissait. Elles portent un peu plus loin qu'au dashboard : là-bas
  // elles tiennent un titre seul au milieu du vide, ici elles doivent se voir
  // derrière un en-tête, des chiffres et des filtres.
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: hauteur }}>
      <div
        className="absolute left-1/2 top-1/2 h-[620px] w-[1400px] max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(closest-side, ${alpha("menthe", 0.34)}, ${alpha("menthe", 0.12)} 55%, transparent)` }}
      />
      <div
        className="absolute left-[24%] top-[46%] h-[460px] w-[820px] max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(closest-side, ${alpha("ambre", 0.14)}, transparent)` }}
      />
      <div
        className="absolute left-[78%] top-[42%] h-[520px] w-[880px] max-w-full -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(closest-side, ${alpha("menthe-fonce", 0.28)}, transparent)` }}
      />
    </div>
  );
}
