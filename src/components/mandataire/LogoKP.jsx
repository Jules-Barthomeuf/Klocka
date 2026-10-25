import React from "react";
import "./logo-kp.css";

// Le logo K Partners de la charte de marque (octobre 2026) : le mot-symbole « kp » et son trait, comme un curseur
// prêt à écrire. `fond` : « clair » (trait indigo), « nuit » (texte blanc, trait pervenche), « mono » (trait de la
// couleur du texte). La taille suit la taille de police de l'élément.

export default function LogoKP({ className = "", style = undefined, fond = "clair" }) {
  return (
    <span className={`logo-kp logo-kp-${fond} ${className}`} style={style} role="img" aria-label="K Partners">
      kp<span className="logo-kp-trait" aria-hidden="true" />
    </span>
  );
}
