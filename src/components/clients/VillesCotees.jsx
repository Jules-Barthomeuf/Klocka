import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TOUTES_VILLES_COTEES, VILLES_COTEES } from "../../../server/villes-cotees.js";

const LARGEUR = 320;

/**
 * Ce qui remplace « Toute la France » pour un client sans zone (Jules, 6 nov. 2026) : les trois premières villes cotées
 * et « +n villes », qui ouvre le détail par famille. Le clic ne remonte pas à la ligne ou à la carte qui l'entoure.
 */
export default function VillesCotees() {
  const [ouvert, setOuvert] = useState(false);
  const ancre = useRef(null);
  const boite = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!ouvert || !ancre.current) return;
    const r = ancre.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - LARGEUR - 8));
    setPos(r.bottom + 360 > window.innerHeight && r.top > 360 ? { bottom: window.innerHeight - r.top + 6, left } : { top: r.bottom + 6, left });
  }, [ouvert]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (!boite.current?.contains(e.target) && !ancre.current?.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", fermer);
    window.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", fermer); window.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const basculer = (e) => { e.stopPropagation(); e.preventDefault(); setOuvert((o) => !o); };
  return (
    <>
      {TOUTES_VILLES_COTEES.slice(0, 3).join(", ")}{" "}
      <span ref={ancre} role="button" tabIndex={0} onClick={basculer} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") basculer(e); }}
        aria-expanded={ouvert} title="Voir les villes" className="cursor-pointer whitespace-nowrap text-menthe underline-offset-4 hover:underline">
        +{TOUTES_VILLES_COTEES.length - 3} villes
      </span>
      {ouvert && createPortal(
        <div ref={boite} onClick={(e) => e.stopPropagation()} style={{ ...pos, width: LARGEUR }}
          className="fixed z-[90] max-h-[60vh] overflow-y-auto rounded-[14px] border border-trait bg-surface-pleine p-3.5 text-left shadow-[0_18px_40px_rgb(0_0_0/0.28)]">
          <p className="m-0 pb-2.5 text-[12.5px] text-ardoise">Sans zone précise, le client cherche dans ces villes.</p>
          {VILLES_COTEES.map((f) => (
            <div key={f.famille} className="pb-2.5 last:pb-0">
              <p className="m-0 pb-1 text-[12px] text-brume">{f.famille}</p>
              <p className="m-0 text-[13.5px] leading-[1.5] text-encre">{f.villes.join(", ")}</p>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
