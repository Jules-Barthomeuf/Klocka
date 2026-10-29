import React, { useEffect, useRef, useState } from "react";
import FicheSource from "@/components/presentations/FicheSource";
import { sourceDuChemin } from "@/lib/sources-avis";

// Le mode Sources de l'avis et du deck (26 oct. 2026, Jules) : le survol d'un champ (tout élément qui porte
// `data-chemin`, le chemin du champ dans l'avis) ouvre la fiche de sa source, comme dans les Présentations.

// `lire(chemin, texte)` : une autre source que l'avis (le teaser, 28 oct. 2026) donne elle-même la fiche d'un champ.
export default function SurvolSources({ actif, avis = null, estimation = null, lire = null, children, className = "" }) {
  const cadre = useRef(null);
  const actifEl = useRef(null);
  const attente = useRef(null);
  const [survol, setSurvol] = useState(null);
  const effacer = () => { clearTimeout(attente.current); actifEl.current?.classList.remove("k-source-active"); actifEl.current = null; setSurvol(null); };
  useEffect(() => { if (!actif) effacer(); }, [actif]);
  const surBouger = (e) => {
    if (!actif || (!avis && !lire)) return;
    if (e.target.closest?.("[role=dialog][aria-label=Source]")) { clearTimeout(attente.current); return; }
    const el = e.target.closest?.("[data-chemin]");
    if (!el || !cadre.current?.contains(el) || el === actifEl.current) return;
    clearTimeout(attente.current);
    attente.current = setTimeout(() => {
      const source = lire ? lire(el.getAttribute("data-chemin"), el.textContent) : sourceDuChemin(el.getAttribute("data-chemin"), { avis, estimation }, el.textContent);
      if (!source) return;
      actifEl.current?.classList.remove("k-source-active");
      el.classList.add("k-source-active");
      actifEl.current = el;
      setSurvol({ source, ancre: el.getBoundingClientRect(), cadre: cadre.current.getBoundingClientRect() });
    }, actifEl.current ? 160 : 0);
  };
  return (
    <div ref={cadre} className={`relative ${actif ? "k-mode-sources" : ""} ${className}`} onMouseOver={surBouger} onMouseLeave={effacer}>
      {children}
      {actif && survol && <FicheSource source={survol.source} ancre={survol.ancre} cadre={survol.cadre} onEntrer={() => clearTimeout(attente.current)} />}
    </div>
  );
}
