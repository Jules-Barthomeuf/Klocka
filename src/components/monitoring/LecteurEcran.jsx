import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import "rrweb-player/dist/style.css";

// Rejouer l'écran d'un analyste pendant un appel (14 oct. 2026, Jules) : la
// page telle qu'il l'a vue et utilisée, de l'appel décroché à sa validation.
// Réservé à Jules ; effacé après 30 jours.

export default function LecteurEcran({ id, titre = "Écran pendant l'appel", onFermer }) {
  const zone = useRef(null);
  const lecteur = useRef(null);
  const [etat, setEtat] = useState({ attente: true, erreur: null });
  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const r = await fetch(`/api/monitoring/enregistrements/${id}`, { credentials: "include" });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Enregistrement illisible");
        const evenements = await r.json();
        const { default: Player } = await import("rrweb-player");
        if (!vivant || !zone.current) return;
        const largeur = Math.min(zone.current.clientWidth, 1400);
        lecteur.current = new Player({ target: zone.current, props: { events: evenements, width: largeur, height: Math.round(largeur * 0.56), autoPlay: true, skipInactive: true, speedOption: [1, 2, 4, 8] } });
        setEtat({ attente: false, erreur: null });
      } catch (e) {
        if (vivant) setEtat({ attente: false, erreur: e?.message || "Lecture impossible" });
      }
    })();
    return () => { vivant = false; try { lecteur.current?.$destroy?.(); } catch { /* déjà détruit */ } };
  }, [id]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/80 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[94vh] w-full max-w-[1460px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3.5">
          <span className="min-w-0 truncate text-[14.5px] text-encre">{titre}</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {etat.attente && <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
          {etat.erreur && <p className="m-0 py-16 text-center text-[14px] text-brume">{etat.erreur}</p>}
          <div ref={zone} className="k-lecteur-ecran w-full" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
