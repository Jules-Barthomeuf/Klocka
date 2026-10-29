import React from "react";
import "./logo-klocka.css";

/**
 * Le K de Klocka (public/logo-k-klocka.png), en tracé : le fût et la barre fine en noir, le jambage arrondi en
 * menthe. Même dessin partout (la lettre d'intention, l'avis de valeur Klocka) ; la taille vient de `className`.
 */
export default function LogoKlocka({ className = "" }) {
  return (
    <svg className={className} viewBox="104 68 417 487" role="img" aria-label="Klocka">
      <rect className="logo-klocka-noir" x="104" y="68" width="82" height="487" />
      <polygon className="logo-klocka-noir" points="480,68 505,68 255,293 232,293" />
      <path className="logo-klocka-menthe" d="M208,318 H318 C345,318 362,328 375,345 L520,555 H425 L280,350 C272,338 265,335 252,335 H208 Z" />
    </svg>
  );
}
