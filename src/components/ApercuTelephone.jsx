import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCw, X } from "lucide-react";

// Le mode téléphone : la page ouverte, vue comme sur un téléphone, depuis un
// ordinateur. Les règles mobiles (max-md:) suivent la largeur de la fenêtre,
// pas celle d'un conteneur : seul un cadre de 390 px de large les déclenche.
// Le cadre partage la session du navigateur, on y reste connecté.
//
// Le cadre porte un nom : l'application s'y reconnaît (`estApercuTelephone`)
// et s'y affiche comme sur un vrai téléphone, sans ce bouton ni les égards
// réservés aux pages intégrées ailleurs. Le nom survit aux navigations dans
// le cadre, une adresse ne l'aurait pas fait.

const NOM_CADRE = "k-apercu-telephone";

export const estApercuTelephone = () => {
  try { return typeof window !== "undefined" && window.self !== window.top && window.name === NOM_CADRE; } catch { return false; }
};

export const APPAREILS = [
  { cle: "iphone", nom: "iPhone 15", largeur: 393, hauteur: 852 },
  { cle: "android", nom: "Petit Android", largeur: 360, hauteur: 780 },
  { cle: "max", nom: "iPhone Pro Max", largeur: 430, hauteur: 932 },
];

// La marge autour du cadre : la barre des réglages au-dessus, de l'air dessous.
const MARGE_HAUT = 76;
const MARGE_BAS = 24;
const BORD = 10;

/** Pure : l'échelle qui fait tenir l'appareil, bordure comprise, dans la fenêtre. */
export function echelleCadre(appareil, fenetre) {
  const h = appareil.hauteur + 2 * BORD;
  const l = appareil.largeur + 2 * BORD;
  return Math.min(1, (fenetre.hauteur - MARGE_HAUT - MARGE_BAS) / h, (fenetre.largeur - 32) / l);
}

export default function ApercuTelephone({ onFermer }) {
  const [cle, setCleBrute] = useState("iphone");
  const [fenetre, setFenetre] = useState({ largeur: window.innerWidth, hauteur: window.innerHeight });
  const [tour, setTour] = useState(0);
  const cadre = useRef(null);
  // La page de départ : celle qu'on regardait. Ensuite, le cadre navigue seul ;
  // changer d'appareil le rouvre là où il en était.
  const [depart, setDepart] = useState(() => window.location.pathname + window.location.search + window.location.hash);
  const ici = () => {
    try { const l = cadre.current?.contentWindow?.location; return l ? l.pathname + l.search + l.hash : depart; } catch { return depart; }
  };
  const setCle = (c) => { setDepart(ici()); setCleBrute(c); };
  const appareil = APPAREILS.find((a) => a.cle === cle) || APPAREILS[0];
  const echelle = echelleCadre(appareil, fenetre);

  useEffect(() => {
    const surTaille = () => setFenetre({ largeur: window.innerWidth, hauteur: window.innerHeight });
    const surTouche = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("resize", surTaille);
    window.addEventListener("keydown", surTouche);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", surTaille);
      window.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [onFermer]);

  // Recharger garde la page où l'on est arrivé dans le cadre.
  const recharger = () => {
    try { cadre.current?.contentWindow?.location.reload(); } catch { setTour((t) => t + 1); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] bg-fond/85 backdrop-blur-md" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="absolute inset-x-0 top-0 flex h-[60px] items-center justify-center gap-3 px-4">
        <div className="inline-flex gap-1 rounded-full border border-trait bg-surface-pleine p-1">
          {APPAREILS.map((a) => (
            <button key={a.cle} type="button" onClick={() => setCle(a.cle)}
              className={`h-8 rounded-full px-3.5 text-[13px] transition-colors ${a.cle === cle ? "bg-encre text-fond" : "text-craie hover:text-encre"}`}>
              {a.nom}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
          {appareil.largeur} × {appareil.hauteur}{echelle < 1 ? ` · ${Math.round(echelle * 100)} %` : ""}
        </span>
        <button type="button" onClick={recharger} aria-label="Recharger" title="Recharger"
          className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <RotateCw className="h-4 w-4" />
        </button>
        <button type="button" onClick={onFermer} aria-label="Fermer le mode téléphone" title="Fermer (Échap)"
          className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2" style={{ top: MARGE_HAUT }}>
        <div className="origin-top rounded-[52px] border border-bord-vif bg-encre/[0.08] shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
          style={{ padding: BORD, transform: `scale(${echelle})`, width: appareil.largeur + 2 * BORD, height: appareil.hauteur + 2 * BORD }}>
          <iframe
            key={`${cle}-${tour}`}
            ref={cadre}
            name={NOM_CADRE}
            src={depart}
            title="Aperçu téléphone"
            className="block rounded-[42px] bg-fond"
            style={{ width: appareil.largeur, height: appareil.hauteur, border: 0 }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
