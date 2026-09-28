import React from "react";

// Le registre de la page projet (maquette du 28 septembre 2026) : des cartes
// à peine bordées sur le fond du thème, un titre d'onglet à 28 px avec son
// contexte en gris à côté, des pastilles pour les écarts. Tous les onglets
// s'en servent, pour que Bien, Locataire ou Copropriété se lisent comme Marché.

/** Le titre d'un onglet : le nom, le contexte en gris, la source à droite. */
export function EnTeteOnglet({ titre, contexte = null, source = null, className = "mb-5" }) {
  return (
    <div className={`${className} flex flex-wrap items-baseline justify-between gap-3`}>
      <div className="flex flex-wrap items-baseline gap-3.5">
        <h2 className="m-0 text-[28px] max-md:text-[24px] font-medium tracking-[-0.01em] text-encre">{titre}</h2>
        {contexte && <span className="text-[14px] text-ardoise">{contexte}</span>}
      </div>
      {source && <span className="text-[12px] text-ardoise">{source}</span>}
    </div>
  );
}

/** Une carte : fond de surface, filet fin, 18 px d'arrondi. */
export function Carte({ children, className = "" }) {
  return <div className={`rounded-[18px] border border-trait bg-surface-pleine ${className}`}>{children}</div>;
}

/** Le titre d'une carte, et sa ligne d'explication en dessous. */
export function TitreCarte({ titre, sous = null, droite = null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[16px] font-medium text-encre">{titre}</span>
        {sous && <span className="text-[13px] text-ardoise">{sous}</span>}
      </div>
      {droite}
    </div>
  );
}

/** Un chiffre dans une carte : l'intitulé au-dessus, la valeur en grand. */
export function Chiffre({ label, valeur, unite = null, accent = false, children = null }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] text-ardoise">{label}</span>
      <div className="flex items-baseline gap-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span className={`text-[32px] max-md:text-[26px] font-medium tracking-[-0.02em] ${accent ? "text-menthe" : "text-encre"}`}>{valeur}</span>
        {unite && <span className="text-[14px] text-ardoise">{unite}</span>}
      </div>
      {children}
    </div>
  );
}

/** Une pastille d'écart : verte quand ça monte, rouge quand ça baisse. */
export function Pastille({ children, ton = "menthe" }) {
  const couleurs = ton === "alerte" ? "bg-alerte/[0.14] text-alerte" : ton === "neutre" ? "bg-relief text-craie" : "bg-menthe/[0.14] text-menthe";
  return (
    <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium ${couleurs}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {children}
    </span>
  );
}

/** Une rangée de cellules dans une seule carte, séparées par un filet. */
export function RangeeCarte({ cellules }) {
  const liste = (cellules || []).filter(Boolean);
  if (!liste.length) return null;
  return (
    <Carte className="flex flex-wrap overflow-hidden">
      {liste.map((c, i) => (
        <div key={i} className={`flex-[1_1_240px] p-7 max-md:p-5 ${i > 0 ? "border-l border-trait max-md:border-l-0 max-md:border-t" : ""}`}>{c}</div>
      ))}
    </Carte>
  );
}
