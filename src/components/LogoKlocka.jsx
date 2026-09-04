import React, { useState } from "react";

// Le logo complet — le mot et sa signature. Le fichier officiel, déposé dans
// public/logo-klocka-complet.png, prime ; sans lui, la reconstruction en
// vecteur tient la place.
export default function LogoKlocka({ className = "h-9", alt = "Klocka — Développeur de revenus immobiliers" }) {
  const [officiel, setOfficiel] = useState(true);
  return (
    <img
      src={officiel ? "/logo-klocka-complet.png" : "/logo-klocka-wordmark.svg"}
      onError={() => officiel && setOfficiel(false)}
      alt={alt}
      draggable={false}
      className={`${className} w-auto select-none`}
    />
  );
}
