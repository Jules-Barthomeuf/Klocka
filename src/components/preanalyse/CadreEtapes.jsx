import React from "react";

// Le cadre des étapes d'analyse : la barre des étapes en haut, l'en-tête de
// l'étape, le contenu, le pied. Les libellés techniques sont en mono.

export const Mono = ({ children, className = "" }) => <span className={`font-mono text-[10px] tracking-[.18em] uppercase text-[#6a7180] ${className}`}>{children}</span>;
export const eur = (v) => (v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);
export const fourchette = (f, suffixe = " €") => (!f || f[0] == null ? "—" : f[0] === f[1] ? `${Math.round(f[0]).toLocaleString("fr-FR")}${suffixe}` : `${Math.round(f[0]).toLocaleString("fr-FR")} – ${Math.round(f[1]).toLocaleString("fr-FR")}${suffixe}`);

// Le titre d'une sous-partie a la même voix que celui de l'étape :
// « 1 · Copropriété », en gras, pas en mono.
export function Section({ id, titre, droite, children, sansFilet = false }) {
  return (
    <section id={id} className={`px-6 max-md:px-4 py-6 ${sansFilet ? "" : "border-b border-[#1f2228]"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4">
        <h3 className="m-0 text-[17px] font-semibold text-[#f2f3f5] tracking-[-.01em]">{titre}</h3>
        {droite ? <span className="text-[12.5px] text-[#9298a6]">{droite}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function CadreEtapes({ etapes, etape, etapeMax = etape, compteurs = {}, titre, statut, question, progression, onEtape, apercu, pied, actions = null, bandeau = null, children }) {
  const part = progression?.total ? Math.round((progression.lus / progression.total) * 100) : 0;
  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md overflow-hidden">
      {/* Les étapes, en haut */}
      <div className="flex items-stretch border-b border-[#1f2228] overflow-x-auto">
        {etapes.map((x) => (
          <button key={x.n} onClick={() => x.n <= etapeMax && onEtape?.(x.n)} disabled={apercu || x.n > etapeMax} className={`flex-1 min-w-[180px] text-left px-5 py-3.5 flex items-baseline justify-between gap-3 border-b-2 -mb-px transition-colors ${x.n === etape ? "border-[#f2f3f5] text-[#f2f3f5]" : x.n <= etapeMax ? "border-transparent text-[#c9cdd6] hover:text-[#f2f3f5]" : "border-transparent text-[#4d545d]"}`}>
            <span className="text-[14px] font-light"><span className="font-mono text-[11px] mr-2 text-[#6a7180]">{x.n}</span>{x.titre}</span>
            <Mono className={x.n === etape ? "text-[#9298a6]" : ""}>{compteurs[x.n] ?? ""}</Mono>
          </button>
        ))}
      </div>

      <header className="px-6 max-md:px-4 py-4 border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
          <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]"><span className="font-light tabular-nums">Étape {etape}</span> · {titre}</h2>
          {statut && <Mono className="text-[#9298a6]">{statut}</Mono>}
          {question && <span className="text-[13px] text-[#9298a6]">{question}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          {actions}
          {progression && (
            <div className="flex items-center gap-3 flex-none">
              <div className="w-[120px] h-px bg-[#2c3139] relative"><div className="absolute left-0 top-[-1px] h-[3px] bg-[#f2f3f5]" style={{ width: `${part}%` }} /></div>
              <Mono className="text-[#9298a6]">{progression.lus} / {progression.total} docs</Mono>
            </div>
          )}
        </div>
      </header>
      {bandeau}
      {children}
      {pied && (
        <footer className="px-6 max-md:px-4 py-4 border-t border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
          {pied}
        </footer>
      )}
    </div>
  );
}
