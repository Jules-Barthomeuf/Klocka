import React from "react";

// Les étapes d'AK, quand il réfléchit (16 oct. 2026, Jules). L'étape en cours porte un carré de quatre points
// qui tournent en se resserrant ; terminée, un seul point gris arrive à sa place. Le dessin est en CSS
// (`.k-carre`, `.k-point-fait` dans index.css), les couleurs viennent des jetons (brume pour les points,
// encre pour le texte en cours, craie pour le texte fini).

/** L'étape en cours : quatre points de 4 px dans un carré de 14 px. */
export function PointsEnCours({ className = "" }) {
  return <span className={`k-carre ${className}`} role="status" aria-label="En cours"><i /><i /><i /><i /></span>;
}

/** L'étape finie : un point de 8 px. `anime` : il arrive (sinon, il est déjà là : une étape d'un fil relu). */
export function PointFait({ anime = false, className = "" }) {
  return <span className={`k-point-fait ${anime ? "k-arrive" : ""} ${className}`} aria-hidden />;
}
