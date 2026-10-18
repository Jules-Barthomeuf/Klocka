import React from "react";

// La marque de Klocka OS (18 oct. 2026, Jules) : trois losanges empilés, le dessus clair (sombre en thème clair),
// le milieu doré, le dessous gris. Les couleurs viennent de index.css (`--k-marque-*`), donc elles suivent le thème.
export default function MarqueKlocka({ className = "h-6 w-6", titre = "Klocka OS" }) {
  const losange = (cy) => `M379 ${cy - 85} L545 ${cy - 2} Q551 ${cy} 545 ${cy + 3} L382 ${cy + 85} Q379 ${cy + 87} 376 ${cy + 85} L212 ${cy + 3} Q206 ${cy} 212 ${cy - 2} Z`;
  return (
    <svg viewBox="200 215 356 345" className={`${className} flex-none select-none`} role="img" aria-label={titre} focusable="false">
      <path d={losange(467)} style={{ fill: "var(--k-marque-bas)" }} />
      <path d={losange(390)} style={{ fill: "var(--k-marque-milieu)" }} />
      <path d={losange(312)} style={{ fill: "var(--k-marque-haut)" }} />
    </svg>
  );
}
