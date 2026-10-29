import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// Écrire directement dans la case (29 oct. 2026, Jules : « quand on clique dans une case, ça ne doit pas mettre le
// champ, je veux qu'on écrive direct dans la case ») : un texte qui se modifie sur place, sans cadre ni bouton.
// Il grandit avec ce qu'on écrit ; Entrée enregistre (Maj+Entrée va à la ligne), Échap rend le texte d'avant,
// quitter la case enregistre. Un clic n'importe où dans la case y place le curseur.
export default function TexteEnPlace({ valeur = "", placeholder = "", onEnregistrer, disabled = false, className = "", classeCase = "" }) {
  const zone = useRef(null);
  const [texte, setTexte] = useState(valeur || "");
  const [actif, setActif] = useState(false);
  const annule = useRef(false);
  useEffect(() => { if (!actif) setTexte(valeur || ""); }, [valeur, actif]);
  useLayoutEffect(() => {
    const el = zone.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [texte]);
  const quitter = () => {
    setActif(false);
    if (annule.current) { annule.current = false; setTexte(valeur || ""); return; }
    const t = texte.trim();
    if (t !== String(valeur || "").trim()) onEnregistrer?.(t);
  };
  return (
    <div className={`min-w-0 cursor-text ${classeCase}`} onClick={(e) => { e.stopPropagation(); if (!disabled) zone.current?.focus(); }}>
      <textarea ref={zone} rows={1} value={texte} disabled={disabled} placeholder={placeholder} spellCheck
        onFocus={() => setActif(true)} onBlur={quitter} onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") { annule.current = true; e.currentTarget.blur(); }
        }}
        className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none focus:ring-0 disabled:cursor-default ${className}`} />
    </div>
  );
}
