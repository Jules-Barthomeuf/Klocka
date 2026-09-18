import React from "react";
import { J, alpha } from "@/design/jetons";

// Le fond des pages projets : trois couches sur une base unie.
//
// 1. Le halo. Un bloc large remonté hors de l'écran : on n'en voit que la
//    retombée, jamais le centre. Trois nappes s'y superposent, celles du
//    dashboard admin : menthe au centre, une pointe d'ambre à gauche, un vert
//    plus sombre à droite, aux mêmes opacités douces.
// 2. Le fondu. Un dégradé vertical qui écrase le bas du halo dans le noir,
//    pour que les cartes reposent sur un fond neutre.
// 3. La nav, rendue translucide par le Layout sur ces pages : le halo la
//    traverse, et le dégradé est continu d'un bord à l'autre de l'écran.

// La base suit le thème : figée en dur, elle peignait une dalle presque noire
// derrière chaque page une fois le mode clair choisi. Les nappes, elles, sont
// des accents : elles se lisent sur les deux fonds et ne bougent pas.
export const FOND_BASE = "rgb(var(--k-fond-halo-rgb))";

const HALO = [
  `radial-gradient(58% 52% at 58% 42%, ${alpha("menthe", 0.22)} 0%, ${alpha("menthe", 0.10)} 34%, ${alpha("menthe-fonce", 0.05)} 60%, transparent 80%)`,
  `radial-gradient(44% 42% at 30% 60%, ${alpha("ambre", 0.11)} 0%, ${alpha("ambre", 0.05)} 40%, transparent 76%)`,
  `radial-gradient(40% 40% at 78% 56%, ${alpha("menthe-fonce", 0.16)} 0%, ${alpha("menthe-fonce", 0.06)} 45%, transparent 78%)`,
].join(", ");

const FONDU = `linear-gradient(180deg, transparent 0%, transparent 40%, rgb(var(--k-fond-halo-rgb) / 0.75) 78%, ${FOND_BASE} 100%)`;

export default function FondHalo() {
  // Posé sur le viewport, pas dans la colonne de contenu : le halo doit passer
  // sous la barre latérale, sinon la nav translucide n'a rien à laisser voir et
  // le dégradé s'arrête net au bord du menu.
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0" style={{ background: FOND_BASE }} />
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: -520, width: 1700, height: 1180, background: HALO }}
      />
      <div className="absolute inset-x-0 top-0" style={{ height: 720, background: FONDU }} />
    </div>
  );
}
