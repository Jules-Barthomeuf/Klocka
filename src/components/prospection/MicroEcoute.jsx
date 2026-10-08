import React from "react";

// Le micro pendant l'enregistrement (maquette de Jules, 8 oct. 2026) : un
// disque menthe pâle, l'icône sombre au centre, deux anneaux fins autour qui
// respirent l'un après l'autre, et une onde qui part du disque. Les
// mouvements s'arrêtent si l'appareil ou le Compte réduit les animations.

export default function MicroEcoute({ taille = 220, children, label = "Enregistrement en cours" }) {
  const disque = Math.round(taille * 0.57);
  const milieu = Math.round(taille * 0.77);
  return (
    <span className="relative grid flex-none place-items-center" style={{ width: taille, height: taille }} role="img" aria-label={label}>
      <span className="k-onde-part absolute rounded-full border border-menthe-pale/50" style={{ width: disque, height: disque }} aria-hidden />
      <span className="k-anneau absolute rounded-full border border-encre/[0.12]" style={{ width: taille, height: taille, animationDelay: "0.6s" }} aria-hidden />
      <span className="k-anneau absolute rounded-full border border-encre/[0.16]" style={{ width: milieu, height: milieu }} aria-hidden />
      <span className="relative grid place-items-center rounded-full bg-menthe-pale text-sur-menthe-pale" style={{ width: disque, height: disque }}>{children}</span>
    </span>
  );
}
