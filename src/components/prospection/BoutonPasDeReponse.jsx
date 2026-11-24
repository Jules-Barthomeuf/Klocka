import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// « Pas de réponse » en un seul bouton (24 nov. 2026, Jules : « au lieu de Rappeler plus tard, Pas de réponse avec un
// triangle plein à droite pointé en bas ; soit on clique Pas de réponse, soit sur le triangle puis Message laissé »).
// La pilule à contour des boutons de la carte, coupée en deux par un filet : le texte à gauche, le triangle à droite.
// Le menu s'ouvre sous le triangle (au-dessus s'il manque de place), hors de la carte qui coupe ce qui déborde.

export default function BoutonPasDeReponse({ onPasDeReponse, onMessageLaisse, disabled = false }) {
  const [place, setPlace] = useState(null);
  const triangle = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!place) return undefined;
    const fermer = (e) => { if (!menu.current?.contains(e.target) && !triangle.current?.contains(e.target)) setPlace(null); };
    const echap = (e) => { if (e.key === "Escape") setPlace(null); };
    const partir = () => setPlace(null);
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    window.addEventListener("scroll", partir, true);
    window.addEventListener("resize", partir);
    return () => { document.removeEventListener("mousedown", fermer); document.removeEventListener("keydown", echap); window.removeEventListener("scroll", partir, true); window.removeEventListener("resize", partir); };
  }, [place]);
  const ouvrir = () => {
    if (place) { setPlace(null); return; }
    const r = triangle.current.getBoundingClientRect();
    const haut = r.bottom + 60 > window.innerHeight;
    setPlace({ right: Math.max(8, window.innerWidth - r.right), ...(haut ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
  };
  const moitie = "h-9 max-md:h-10 text-[13.5px] text-encre transition-colors hover:bg-relief disabled:opacity-50";
  return (
    <span className="inline-flex flex-none items-stretch overflow-hidden rounded-full border border-bord-doux">
      <button type="button" onClick={onPasDeReponse} disabled={disabled} title="Personne n'a décroché : la relance se planifie, l'agence suivante arrive"
        className={`${moitie} pl-4 pr-3`} style={{ background: "transparent" }}>Pas de réponse</button>
      <span aria-hidden className="w-px bg-bord-doux" />
      <button ref={triangle} type="button" onClick={ouvrir} disabled={disabled} aria-haspopup="menu" aria-expanded={!!place} aria-label="Autre issue sans conversation"
        className={`${moitie} grid w-9 place-items-center max-md:w-10`} style={{ background: "transparent" }}>
        <svg viewBox="0 0 10 6" className="h-[6px] w-[10px]" aria-hidden><path d="M0 0h10L5 6z" fill="currentColor" /></svg>
      </button>
      {place && createPortal(
        <div ref={menu} role="menu" className="fixed z-[90] min-w-[180px] rounded-[14px] border border-bord-doux bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-150 animate-in fade-in-0" style={place}>
          <button type="button" role="menuitem" onClick={() => { setPlace(null); onMessageLaisse(); }} title="Répondeur : le message est laissé, les actions proposées s'ouvrent"
            className="flex w-full items-center rounded-[10px] px-3 py-2 text-left text-[14px] text-encre transition-colors hover:bg-relief" style={{ background: "transparent" }}>Message laissé</button>
        </div>,
        document.body,
      )}
    </span>
  );
}
