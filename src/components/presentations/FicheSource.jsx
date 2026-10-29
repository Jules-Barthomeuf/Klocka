import React, { useLayoutEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

// La fiche d'une source, en mode Sources de l'éditeur (13 oct. 2026, Jules :
// « quand on passe la souris sur un chiffre ou une ligne, on voit la source
// qu'il a prise »). Posée à côté du champ survolé, dans le cadre de la scène :
// d'où vient la valeur, le champ ou le calcul exact, la page de la source.

const NATURES = {
  projet: { mot: "Fiche du projet", ton: "text-menthe" },
  donnee: { mot: "Source publique", ton: "text-menthe" },
  carte: { mot: "Carte", ton: "text-menthe" },
  calcul: { mot: "Calcul", ton: "text-craie" },
  ia: { mot: "Estimation de l'IA", ton: "text-ambre" },
  a_remplir: { mot: "À compléter", ton: "text-alerte" },
  modele: { mot: "Texte du modèle", ton: "text-brume" },
  // L'avis de valeur et son deck (26 oct. 2026).
  equimmox: { mot: "Equimmox", ton: "text-menthe" },
  saisie: { mot: "Dit par le mandataire", ton: "text-craie" },
  // La lettre d'intention dans l'Éditeur (28 oct. 2026).
  dossier: { mot: "Fiche du dossier", ton: "text-menthe" },
  chat: { mot: "Dit dans le chat", ton: "text-craie" },
  main: { mot: "Saisi à la main", ton: "text-craie" },
};

/**
 * @param {{ source: object, ancre: DOMRect, cadre: DOMRect, onEntrer?: () => void }} p onEntrer : la souris arrive sur la fiche (elle reste)
 * ancre : le champ survolé ; cadre : la zone où la fiche doit tenir (la scène du deck).
 */
export default function FicheSource({ source, ancre, cadre, onEntrer = null }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, visible: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !ancre || !cadre) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const marge = 12;
    // À droite du champ, sinon à gauche ; sans la place sur les côtés, au-dessous (ou au-dessus) : jamais sur le champ.
    const x = ancre.left - cadre.left;
    const y = ancre.top - cadre.top;
    let left;
    let top;
    if (x + ancre.width + marge + w <= cadre.width - 8) { left = x + ancre.width + marge; top = y + ancre.height / 2 - h / 2; }
    else if (x - marge - w >= 8) { left = x - marge - w; top = y + ancre.height / 2 - h / 2; }
    else {
      left = x + ancre.width / 2 - w / 2;
      top = y + ancre.height + marge + h <= cadre.height - 8 ? y + ancre.height + marge : y - marge - h;
    }
    left = Math.max(8, Math.min(left, cadre.width - w - 8));
    top = Math.max(8, Math.min(top, cadre.height - h - 8));
    setPos({ left, top, visible: true });
  }, [source, ancre, cadre]);

  const n = NATURES[source.nature] || NATURES.modele;
  return (
    <div ref={ref} role="dialog" aria-label="Source" onMouseEnter={onEntrer || undefined}
      className="absolute z-30 w-[320px] rounded-[14px] border border-trait bg-surface-pleine p-4 shadow-[0_18px_40px_rgb(0_0_0/0.18)] transition-opacity duration-150"
      style={{ left: pos.left, top: pos.top, opacity: pos.visible ? 1 : 0 }}>
      <div className={`text-[11px] uppercase tracking-[.14em] ${n.ton}`}>{n.mot}</div>
      {/* L'origine, sauf quand elle redit la nature (« Estimation de l'IA » deux fois, 13 oct. 2026). */}
      {source.origine && source.origine.toLowerCase() !== n.mot.toLowerCase() && <div className="mt-1.5 text-[14.5px] leading-[1.35] text-encre">{source.origine}</div>}
      <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-ardoise">{source.detail}</p>
      {source.calcul && (
        <div className="mt-3 rounded-[10px] bg-relief px-3 py-2 text-[13px] leading-[1.45] text-craie tabular-nums">{source.calcul}</div>
      )}
      {source.ecart && <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-ambre">{source.ecart}</p>}
      {(source.liens || []).length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-trait pt-3">
          {source.liens.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-craie underline decoration-trait underline-offset-2 hover:text-encre">
              <ExternalLink className="h-3.5 w-3.5 flex-none text-menthe" />{l.texte}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
