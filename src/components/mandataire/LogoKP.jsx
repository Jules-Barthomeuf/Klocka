import React from "react";

// Le logo K Partners, en tracé : le K relevé pixel par pixel sur le fichier
// « Logo K.pdf » (fût et barre fine noirs, jambage menthe), le P en didone.
// Même dessin partout, quelle que soit la police de la machine.

export default function LogoKP({ className = "", style = undefined }) {
  const encre = "var(--logo-encre)";
  const menthe = "var(--logo-menthe)";
  return (
    <svg className={`logo-kp ${className}`} style={style} viewBox="366 146 440 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="K Partners">
      <rect x="376" y="156" width="41" height="242" fill={encre} />
      <polygon points="563,156 574,156 452,267 441,267" fill={encre} />
      <polygon points="429,283 501,283 582,397 536,397 460,291 429,291" fill={menthe} />
      <path fill={encre} fillRule="evenodd"
        d="M610,156 H715 C775,156 793,192 793,226 C793,262 775,298 715,298 H670 V391 H690 V397 H610 V391 H630 V162 H610 Z M670,166 V288 H713 C753,288 765,258 765,226 C765,194 753,166 713,166 Z" />
    </svg>
  );
}
