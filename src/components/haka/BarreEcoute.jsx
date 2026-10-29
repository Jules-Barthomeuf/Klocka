import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, X } from "lucide-react";

// Le mode micro du chat de Haka (25 oct. 2026, maquette « Rubans » de Jules) : pendant la dictée, la barre du bas
// devient Annuler, trois rubans qui ondulent avec la voix, le minuteur et Envoyer ; la lumière de l'aura ralentit et
// se pose sous le chat, où une lueur (« horizon ») respire avec la voix. Le niveau vient de la dictée (`niveau`, une
// réf entre 0 et 1) : jamais un second accès au micro, qui rendait la reconnaissance muette sur certaines machines.

const ANGLE_POSE = 225; // l'arc lumineux pointe vers le bas
const LISSAGE = 0.06; // l'horizon suit la voix lentement, calmement

/** Pure : une courbe des rubans, qui s'atténue aux deux bouts. */
export function courbe(amp, freq, phase) {
  let d = "";
  for (let k = 0; k <= 60; k += 1) {
    const x = k / 60;
    const env = Math.pow(Math.sin(Math.PI * x), 1.6);
    const y = 20 + amp * env * Math.sin(x * freq * Math.PI * 2 + phase);
    d += `${k ? "L" : "M"}${(x * 300).toFixed(1)} ${y.toFixed(2)}`;
  }
  return d;
}

/**
 * La lumière de l'aura se pose sous le chat pendant la dictée, puis repart d'où elle s'était arrêtée.
 * `cadre` : l'élément qui porte l'aura (son halo `.k-aura-halo`, son filet `.k-aura-filet`).
 */
export function useAuraPosee(cadre, ecoute) {
  const posee = useRef(0);
  useLayoutEffect(() => {
    const w = cadre.current;
    if (!w) return;
    if (ecoute) {
      const halo = w.querySelector(".k-aura-halo");
      const actuel = halo ? parseFloat(getComputedStyle(halo).getPropertyValue("--k-aura-angle")) || 0 : 0;
      w.style.setProperty("--k-aura-pose", `${actuel}deg`);
      w.classList.add("k-aura-posee");
      void w.offsetWidth; // fige la position actuelle avant d'animer
      let ecart = (((ANGLE_POSE - actuel) % 360) + 360) % 360;
      if (ecart < 200) ecart += 360;
      posee.current = actuel + ecart;
      const id = requestAnimationFrame(() => w.style.setProperty("--k-aura-pose", `${posee.current}deg`));
      return () => cancelAnimationFrame(id);
    }
    if (w.classList.contains("k-aura-posee")) {
      w.style.setProperty("--k-aura-phase", ((posee.current % 360) / 360).toFixed(4));
      w.classList.remove("k-aura-posee");
    }
    return undefined;
  }, [cadre, ecoute]);
}

/**
 * La barre pendant la dictée.
 * @param {{ niveau: {current: number}, cadre: {current: HTMLElement|null}, onAnnuler: () => void, onEnvoyer: () => void, peutEnvoyer?: boolean }} props
 */
export default function BarreEcoute({ niveau, cadre, onAnnuler, onEnvoyer, peutEnvoyer = true }) {
  const rubans = [useRef(null), useRef(null), useRef(null)];
  const [secondes, setSecondes] = useState(0);
  useEffect(() => {
    const debut = Date.now();
    const id = setInterval(() => setSecondes(Math.floor((Date.now() - debut) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  // L'onde et l'horizon, à chaque image : le niveau de la voix, lissé.
  useEffect(() => {
    let amp = 0, phase = 0, lisse = 0, avant = 0, raf = 0;
    const calme = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const image = (t) => {
      const dt = avant ? Math.min(0.05, (t - avant) / 1000) : 0.016;
      avant = t;
      // La reconnaissance ne donne qu'une impulsion par mot reçu : elle retombe doucement.
      const n = Math.max(0, Math.min(1, niveau.current || 0));
      niveau.current = n * 0.94;
      lisse += (n - lisse) * LISSAGE;
      cadre.current?.style.setProperty("--k-niveau", lisse.toFixed(3));
      amp += (n - amp) * 0.1;
      phase += dt * (1.6 + amp * 5);
      const A = calme ? 1 : 1 + amp * 14;
      rubans[0].current?.setAttribute("d", courbe(A, 2.4, phase));
      rubans[1].current?.setAttribute("d", courbe(A * 0.75, 3.3, -phase * 1.3 + 1));
      rubans[2].current?.setAttribute("d", courbe(A * 0.5, 1.7, phase * 0.8 + 2));
      raf = requestAnimationFrame(image);
    };
    raf = requestAnimationFrame(image);
    const c = cadre.current;
    return () => { cancelAnimationFrame(raf); c?.style.setProperty("--k-niveau", "0"); };
    // Les réfs ne changent pas.
  }, []);
  // Échap annule la dictée.
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onAnnuler(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onAnnuler]);

  return (
    <div className="mt-4 flex items-center gap-3">
      <button type="button" onClick={onAnnuler} aria-label="Annuler la dictée" title="Annuler"
        className="grid h-8 w-8 flex-none place-items-center rounded-full text-craie transition-colors hover:bg-barre-relief hover:text-encre" style={{ background: "transparent" }}>
        <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
      <svg className="k-rubans h-10 min-w-0 flex-1 overflow-visible" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden>
        {rubans.map((r, i) => <path key={i} ref={r} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <span className="flex-none text-[14px] tabular-nums text-ardoise">{Math.floor(secondes / 60)}:{String(secondes % 60).padStart(2, "0")}</span>
      <button type="button" onClick={onEnvoyer} disabled={!peutEnvoyer} aria-label="Terminer et envoyer" title="Terminer et envoyer"
        className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-40">
        <ArrowUp className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
