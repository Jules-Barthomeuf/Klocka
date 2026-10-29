import React, { useRef, useState } from "react";

// La largeur du chat d'un bien (26 oct. 2026, Jules : « ajuster la largeur de la partie chat en passant le curseur sur
// la ligne qui sépare ») : la ligne entre le chat et le document se tire ; un double-clic revient à la largeur d'origine.
// La largeur se garde dans le navigateur, la même pour toutes les étapes. Le même geste que l'accueil de l'équipe.

const CLE = "klocka.biens.largeur-chat";
const DEFAUT = 420;
// Le document garde au moins 720 px : en deçà, sa barre d'outils passe sur deux lignes.
const borner = (l, largeurGrille = (typeof window !== "undefined" ? window.innerWidth : 1600)) => Math.round(Math.min(Math.max(l, 320), Math.max(340, largeurGrille - 720)));

/** @returns {{ largeur: number, poignee: React.ReactNode, tire: boolean }} la colonne du chat mesure `largeur` px depuis le bord gauche de la grille. */
export function useLargeurChat() {
  const [largeur, setLargeur] = useState(() => { try { const v = Number(localStorage.getItem(CLE)); return v ? borner(v) : DEFAUT; } catch { return DEFAUT; } });
  const [tire, setTire] = useState(false);
  const derniere = useRef(largeur);
  const grille = useRef(null);
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    const r = e.currentTarget.parentElement?.getBoundingClientRect();
    grille.current = r?.left || 0;
    const largeurGrille = r?.width || window.innerWidth;
    const bouger = (ev) => { derniere.current = borner(ev.clientX - grille.current, largeurGrille); setLargeur(derniere.current); };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(CLE, String(derniere.current)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => { setLargeur(DEFAUT); try { localStorage.removeItem(CLE); } catch { /* rien */ } };
  const poignee = (
    <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
      onPointerDown={tirer} onDoubleClick={remettre}
      className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeur - 6 }}>
      <span className={`my-auto h-10 w-[3px] rounded-full transition-colors ${tire ? "bg-pervenche" : "bg-transparent group-hover:bg-bord-vif"}`} />
    </div>
  );
  return { largeur, poignee, tire };
}
