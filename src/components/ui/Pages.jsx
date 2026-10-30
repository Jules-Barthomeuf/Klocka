import React from "react";

// Une liste longue se lit par pages (30 oct. 2026, Jules : « on n'a pas à tout charger ») : Dossiers et Projets par
// 20, les commerces de la Prospection par 50. Le serveur ne renvoie que la page demandée ; ici, les deux boutons de
// CasesProjet (« ‹ Précédente », « Suivante › ») et la position au milieu. Rien quand tout tient sur une page.
const BOUTON = "px-5 py-2 rounded-full border border-bord-doux text-[13px] text-craie hover:text-encre hover:border-bord-vif transition-colors disabled:opacity-40 disabled:hover:text-craie disabled:hover:border-bord-doux disabled:cursor-default";

/** Pure : le nombre de pages (au moins une). */
export const nombrePages = (total, parPage) => Math.max(1, Math.ceil((Number(total) || 0) / parPage));

export default function Pages({ page, total, parPage, onPage, className = "" }) {
  const n = nombrePages(total, parPage);
  if (n <= 1) return null;
  const aller = (p) => {
    onPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <nav aria-label="Pages" className={`flex items-center justify-between gap-4 pt-6 ${className}`}>
      <button type="button" onClick={() => aller(page - 1)} disabled={page <= 1} className={BOUTON} style={{ background: "transparent" }}>‹ Précédente</button>
      <span className="text-[13px] tabular-nums text-ardoise">Page {page} sur {n} · {total}</span>
      <button type="button" onClick={() => aller(page + 1)} disabled={page >= n} className={BOUTON} style={{ background: "transparent" }}>Suivante ›</button>
    </nav>
  );
}
