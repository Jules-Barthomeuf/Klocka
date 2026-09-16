import React from "react";
import { J, alpha } from "@/design/jetons";

// Le fond des pages projets : trois couches sur une base unie.
//
// 1. Le halo. Un bloc large remonté hors de l'écran : on n'en voit que la
//    retombée, jamais le centre. Deux ellipses s'y superposent, le doré au
//    dessus (haut-droite, dominante), le vert dessous (bas-gauche, moitié
//    moins opaque) ; leur zone commune donne un vert-olive chaud. Les étapes
//    s'assombrissent de proche en proche (jaune clair, brun sourd, rien) :
//    une lumière qui s'éteint, pas une tache de peinture.
// 2. Le fondu. Un dégradé vertical qui écrase le bas du halo dans le noir,
//    pour que les cartes reposent sur un fond neutre.
// 3. La nav, rendue translucide par le Layout sur ces pages : le halo la
//    traverse, et le dégradé est continu d'un bord à l'autre de l'écran.

export const FOND_BASE = J["fond-halo"];

const HALO = [
  "radial-gradient(58% 52% at 58% 42%, rgba(232,192,116,0.40) 0%, rgba(188,152,84,0.22) 32%, rgba(72,62,30,0.09) 58%, transparent 80%)",
  "radial-gradient(44% 42% at 34% 58%, rgba(78,214,162,0.20) 0%, rgba(52,160,124,0.10) 34%, rgba(20,64,52,0.05) 58%, transparent 78%)",
].join(", ");

const FONDU = `linear-gradient(180deg, transparent 0%, transparent 40%, ${alpha("fond-halo", 0.75)} 78%, ${FOND_BASE} 100%)`;

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
