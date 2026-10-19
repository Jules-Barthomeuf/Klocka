import React, { useEffect, useRef, useState } from "react";

// Un chiffre qui glisse vers sa valeur (19 oct. 2026, Jules : « des effets soft partout »). À l'arrivée il monte de
// zéro (0,7 s), puis, quand la valeur change (un curseur qu'on déplace), il glisse de l'ancienne à la nouvelle (0,4 s).
// Le format reste celui de la page : `format` reçoit le nombre en cours de route. En mouvement réduit, le chiffre
// s'affiche tout de suite à sa valeur.

const doux = (t) => 1 - (1 - t) ** 3;
const reduit = () => typeof document !== "undefined" && (document.documentElement.dataset.animations === "reduites" || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));

/** Pure : la valeur au temps `t` (0 à 1) entre `de` et `vers`. */
export const entre = (de, vers, t) => de + (vers - de) * doux(Math.min(1, Math.max(0, t)));

/** @param {{ valeur: number, format?: (n: number) => string, className?: string }} props */
export default function ChiffreDoux({ valeur, format = (n) => String(n), className = "" }) {
  const cible = Number(valeur);
  const valide = Number.isFinite(cible);
  const [affiche, setAffiche] = useState(() => (valide && !reduit() ? 0 : cible));
  const courant = useRef(affiche);
  const premiere = useRef(true);
  useEffect(() => {
    if (!valide) return undefined;
    if (reduit()) { courant.current = cible; setAffiche(cible); return undefined; }
    const de = courant.current;
    const duree = premiere.current ? 700 : 400;
    premiere.current = false;
    if (de === cible) return undefined;
    const t0 = performance.now();
    let image;
    const pas = (maintenant) => {
      const t = (maintenant - t0) / duree;
      courant.current = entre(de, cible, t);
      setAffiche(courant.current);
      if (t < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(image);
  }, [cible, valide]);
  return <span className={className}>{valide ? format(affiche) : String(valeur)}</span>;
}
