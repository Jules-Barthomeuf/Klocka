import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

// L'écran qu'on voit pendant que Klocka va chercher sur un service extérieur,
// Data-B ou Equimmox. Plein écran, noir. À gauche, ce que Klocka fait, étape
// par étape, tapé à la machine ; à droite, l'orbe. Les étapes défilent à leur
// rythme ; celle qui correspond au vrai travail attend que la réponse soit là.
// « Passer l'animation » rend la main tout de suite : le résultat s'affiche
// dès qu'il arrive.
//
//   service    : le nom affiché en haut (« Data-B »)
//   etapes     : [{ court, ligne, legende }]
//   attendA    : l'index de l'étape qui attend la réponse
//   pret       : la réponse est arrivée
//   dureeEtape : durée d'une étape, en ms
//   onFini     : l'animation est allée au bout, la réponse est là
//
// L'animation ne s'interrompt pas : elle raconte un travail réel, qui se
// poursuit de toute façon. L'abréger ne ferait qu'afficher un écran vide en
// attendant la réponse.

const MENTHE = "#96c0b8";
const PART_FRAPPE = 0.4; // la ligne se tape sur les 40 % premiers de l'étape

export default function ConnexionExterne({ service, etapes, attendA, pret, dureeEtape = 3000, onFini }) {
  const [i, setI] = useState(0);
  const [avance, setAvance] = useState(0); // 0 → 1 dans l'étape
  const [opacite, setOpacite] = useState(0);
  const [fini, setFini] = useState(false);
  const iRef = useRef(0);
  const debut = useRef(performance.now());
  const pretRef = useRef(pret);
  pretRef.current = pret;
  const arrete = useRef(false);

  // Fondu d'entrée, dès le premier rendu.
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpacite(1));
    return () => cancelAnimationFrame(t);
  }, []);

  // Le temps qui passe : la frappe, puis l'étape suivante — sauf celle qui
  // attend la réponse, qui reste tant qu'elle n'est pas là.
  useEffect(() => {
    let raf;
    const tick = () => {
      if (arrete.current) return;
      const w = (performance.now() - debut.current) / dureeEtape;
      if (w < 1) {
        setAvance(w);
      } else {
        const cur = iRef.current;
        if (cur === attendA && !pretRef.current) {
          setAvance(1);
        } else if (cur < etapes.length - 1) {
          iRef.current = cur + 1;
          debut.current = performance.now();
          setI(cur + 1);
          setAvance(0);
        } else {
          arrete.current = true;
          setAvance(1);
          setFini(true);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dureeEtape, attendA, etapes.length]);

  // Au bout : fondu de sortie, puis on rend la main.
  useEffect(() => {
    if (!fini) return;
    setOpacite(0);
    const t = setTimeout(() => onFini?.(), 700);
    return () => clearTimeout(t);
  }, [fini]); // eslint-disable-line react-hooks/exhaustive-deps

  const e = etapes[i];
  const frappes = Math.round(Math.min(1, avance / PART_FRAPPE) * e.ligne.length);
  const progression = ((i + Math.min(avance, 1)) / etapes.length) * 100;

  return createPortal(
    <div
      role="dialog"
      aria-live="polite"
      aria-label={`Connexion à ${service}`}
      className="fixed inset-0 z-[90] bg-black grid grid-cols-[minmax(340px,52fr)_48fr] max-md:grid-cols-1"
      style={{ transition: "opacity .65s ease", opacity: opacite, fontFamily: "'Instrument Sans', -apple-system, sans-serif" }}
    >
      {/* Gauche : ce que Klocka fait */}
      <div className="flex flex-col justify-between items-start py-14 pr-6 pl-[120px] max-md:pl-6 max-md:py-10">
        <div className="flex items-center gap-2.5 text-[12px] tracking-[.16em] text-[#8d918f]">
          <span className="w-[7px] h-[7px] rounded-full" style={{ background: MENTHE, animation: "kl-point 1.4s ease-in-out infinite" }} />
          CONNEXION À {service.toUpperCase()}
        </div>

        <div>
          <div className="text-[12.5px] tracking-[.14em] text-[#6d716f]">ÉTAPE {i + 1} / {etapes.length}</div>
          <div
            className="mt-[18px] text-white leading-[1.1] tracking-[-.01em] min-h-[2.2em]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: "italic", fontWeight: 400, fontSize: "clamp(30px, 3.2vw, 40px)", textWrap: "pretty" }}
          >
            {e.ligne.slice(0, frappes)}
            <span style={{ color: MENTHE, animation: "kl-curseur 1s step-end infinite" }}>|</span>
          </div>
          <div
            className="mt-[18px] text-[15px] leading-[1.5] text-[#8d918f] max-w-[36ch]"
            style={{ transition: "opacity .5s ease", opacity: avance > 0.45 ? 1 : 0 }}
          >
            {e.legende}
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-[420px]">
          {etapes.map((s, k) => (
            <div
              key={s.court}
              className="flex items-center gap-[11px] text-[13.5px]"
              style={{ transition: "color .4s ease, opacity .4s ease", color: k < i ? "#8d918f" : k === i ? MENTHE : "#4a4d4c", opacity: k > i ? 0.8 : 1 }}
            >
              <span className="w-4 text-center text-[11px]">{k < i ? "✓" : k === i ? "▸" : "·"}</span>
              <span>{s.court}</span>
            </div>
          ))}
          <div className="mt-[14px] h-[2px] rounded-[2px] overflow-hidden bg-white/10">
            <div className="h-full" style={{ background: MENTHE, transition: "width .12s linear", width: `${progression.toFixed(2)}%` }} />
          </div>
        </div>
      </div>

      {/* Droite : l'orbe */}
      <div
        className="flex items-center justify-center p-10 max-md:hidden"
        style={{ background: "radial-gradient(120% 90% at 70% 10%, rgba(151,192,184,.05), transparent 60%)" }}
      >
        {/* L'orbe est dessinée sur un canvas de 64 px : l'étirer la rendrait
            floue. On la laisse à sa taille, posée au centre d'un halo. */}
        <div className="w-[140px] h-[140px] rounded-full flex items-center justify-center" style={{ background: "radial-gradient(circle, rgba(151,192,184,.07), transparent 70%)" }}>
          <ThinkingOrb state="solving" size={64} theme="dark" />
        </div>
      </div>
    </div>,
    document.body
  );
}
