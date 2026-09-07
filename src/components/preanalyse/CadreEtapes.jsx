import React from "react";

// Le cadre des étapes d'analyse : à gauche les étapes, les sections de
// l'étape courante et le prix courant ; à droite l'en-tête, le contenu, le
// pied. Les libellés techniques sont en mono, petits, espacés.

export const Mono = ({ children, className = "" }) => <span className={`font-mono text-[10px] tracking-[.18em] uppercase text-[#6a7180] ${className}`}>{children}</span>;
export const eur = (v) => (v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);
export const fourchette = (f, suffixe = " €") => (!f || f[0] == null ? "—" : f[0] === f[1] ? `${Math.round(f[0]).toLocaleString("fr-FR")}${suffixe}` : `${Math.round(f[0]).toLocaleString("fr-FR")} – ${Math.round(f[1]).toLocaleString("fr-FR")}${suffixe}`);

export function Section({ id, titre, droite, children, sansFilet = false }) {
  return (
    <section id={id} className={`px-6 max-md:px-4 py-5 ${sansFilet ? "" : "border-b border-[#1f2228]"}`}>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <Mono>{titre}</Mono>
        {droite ? <span className="text-[12px] text-[#9298a6]">{droite}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function CadreEtapes({ etapes, etape, compteurs = {}, sections = [], prixCourant = null, titre, statut, question, progression, onEtape, apercu, pied, children }) {
  const aller = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const part = progression?.total ? Math.round((progression.lus / progression.total) * 100) : 0;
  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md overflow-hidden lg:grid lg:grid-cols-[230px_1fr]">
      {/* La colonne de gauche */}
      <aside className="border-b lg:border-b-0 lg:border-r border-[#1f2228]">
        <div className="px-5 pt-5 pb-3"><Mono>Étapes</Mono></div>
        <ul className="m-0 p-0 list-none">
          {etapes.map((x) => (
            <li key={x.n}>
              <button onClick={() => x.n <= etape && onEtape?.(x.n)} disabled={apercu || x.n > etape} className={`w-full text-left px-5 py-2.5 flex items-baseline justify-between gap-3 border-l-2 ${x.n === etape ? "border-[#f2f3f5] bg-[#f2f3f5]/[0.04] text-[#f2f3f5]" : x.n < etape ? "border-transparent text-[#c9cdd6] hover:text-[#f2f3f5]" : "border-transparent text-[#4d545d]"}`}>
                <span className="text-[13.5px]">{x.n} {x.titre}</span>
                <Mono className={x.n === etape ? "text-[#9298a6]" : ""}>{compteurs[x.n] ?? ""}</Mono>
              </button>
            </li>
          ))}
        </ul>
        {sections.length > 0 && (
          <div className="border-t border-[#1f2228] mt-3">
            <div className="px-5 pt-4 pb-2"><Mono>Dans cette étape</Mono></div>
            <ul className="m-0 p-0 list-none pb-3">
              {sections.map((s) => (
                <li key={s.id}><button onClick={() => aller(s.id)} className="w-full text-left px-5 py-1.5 flex items-baseline justify-between gap-3 text-[13.5px] text-[#c9cdd6] hover:text-[#f2f3f5]">{s.titre}{s.droite ? <Mono className={s.alerte ? "text-[#e8927c]" : ""}>{s.droite}</Mono> : null}</button></li>
              ))}
            </ul>
          </div>
        )}
        {prixCourant && (
          <div className="border-t border-[#1f2228] px-5 pt-4 pb-5">
            <Mono>Prix courant</Mono>
            <p className="m-0 mt-2 text-[17px] text-[#f2f3f5] tabular-nums leading-tight">{fourchette(prixCourant.fourchette)}</p>
            {prixCourant.rdt_brut && <p className="m-0 mt-1 text-[12.5px] text-[#9298a6]">{prixCourant.rdt_brut[0]} % – {prixCourant.rdt_brut[1]} % brut</p>}
            {prixCourant.decote && <p className="m-0 mt-1.5 text-[11.5px] text-[#6a7180]">décote retenue {fourchette(prixCourant.decote)}</p>}
          </div>
        )}
      </aside>

      {/* La page */}
      <div className="min-w-0">
        <header className="px-6 max-md:px-4 py-4 border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 min-w-0">
            <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]">Étape {etape} · {titre}</h2>
            {statut && <Mono className="text-[#9298a6]">{statut}</Mono>}
            {question && <span className="text-[13px] text-[#9298a6]">{question}</span>}
          </div>
          {progression && (
            <div className="flex items-center gap-3 flex-none">
              <div className="w-[120px] h-px bg-[#2c3139] relative"><div className="absolute left-0 top-[-1px] h-[3px] bg-[#f2f3f5]" style={{ width: `${part}%` }} /></div>
              <Mono className="text-[#9298a6]">{progression.lus} / {progression.total} docs</Mono>
            </div>
          )}
        </header>
        {children}
        {pied && (
          <footer className="px-6 max-md:px-4 py-4 border-t border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
            {pied}
          </footer>
        )}
      </div>
    </div>
  );
}
