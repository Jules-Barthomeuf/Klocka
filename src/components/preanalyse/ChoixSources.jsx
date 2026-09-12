import React, { useEffect, useRef, useState } from "react";
import { Check, RotateCw } from "lucide-react";

// « Mettre à jour » : tout, ou seulement ce qu'on veut relire.
//
// Une lecture complète prend trois à quatre minutes et consomme un crédit
// Data-B pour l'étude d'implantation. Quand une seule source a échoué, ou
// qu'on veut juste rafraîchir le résidentiel, tout relancer est du gaspillage
// — de temps et de crédit.
//
// Tout est coché d'entrée : le cas courant reste la lecture complète, et
// décocher est un geste délibéré.

export const SOURCES = [
  { cle: "equimmox", nom: "Equimmox", note: "baux comparables · environ une minute" },
  { cle: "data-b-valeur-locative", nom: "Data-B · Valeurs locatives", note: "rue, quartier, ville" },
  { cle: "data-b-transactions", nom: "Data-B · Cessions de fonds", note: "rayon 250 m" },
  { cle: "figaro", nom: "Le Figaro", note: "résidentiel du quartier et de la commune" },
  { cle: "dvf", nom: "DVF", note: "ventes réelles · gratuit" },
  { cle: "bodacc", nom: "BODACC", note: "vie de la rue · gratuit" },
  { cle: "data-b-implantation", nom: "Data-B · Étude d’implantation", note: "flux, tronçon, démographie · 1 crédit", coute: true },
];

export default function ChoixSources({ onLancer, apercu = false, libelle = "Mettre à jour" }) {
  const [ouvert, setOuvert] = useState(false);
  const [cochees, setCochees] = useState(() => SOURCES.map((s) => s.cle));
  const boite = useRef(null);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    const clavier = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", dehors);
    window.addEventListener("keydown", clavier);
    return () => {
      document.removeEventListener("mousedown", dehors);
      window.removeEventListener("keydown", clavier);
    };
  }, [ouvert]);

  const basculer = (cle) => setCochees((l) => (l.includes(cle) ? l.filter((x) => x !== cle) : [...l, cle]));
  const toutes = cochees.length === SOURCES.length;

  const lancer = () => {
    if (!cochees.length) return;
    setOuvert(false);
    // Tout coché = la lecture complète : on n'envoie pas de liste, le serveur
    // fait ce qu'il a toujours fait.
    onLancer(toutes ? null : cochees);
  };

  return (
    <span ref={boite} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        disabled={apercu}
        aria-expanded={ouvert}
        aria-haspopup="true"
        className="inline-flex items-center gap-1.5 rounded-full bg-[#b8dcc8] text-[#04140c] text-[12.5px] font-semibold px-4 py-2 hover:bg-[#c8e8d6] disabled:opacity-30 transition-colors"
      >
        <RotateCw className="w-3.5 h-3.5" /> {libelle}
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-40 w-[min(340px,calc(100vw-40px))] rounded-[14px] border border-[#2c3139] bg-[#0f1114] shadow-[0_18px_50px_rgba(0,0,0,.55)] py-2"
        >
          <div className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-2">
            <span className="font-pill text-[9px] font-semibold uppercase tracking-[.1em] text-[#96c0b8]">Ce qu’on relit</span>
            <button
              type="button"
              onClick={() => setCochees(toutes ? [] : SOURCES.map((s) => s.cle))}
              className="text-[11px] text-[#6a7180] hover:text-[#c6ccd3]"
            >
              {toutes ? "Tout décocher" : "Tout cocher"}
            </button>
          </div>

          {SOURCES.map((s) => {
            const coche = cochees.includes(s.cle);
            return (
              <button
                key={s.cle}
                type="button"
                role="menuitemcheckbox"
                aria-checked={coche}
                onClick={() => basculer(s.cle)}
                className="flex w-full items-start gap-2.5 px-3 py-1.5 text-left hover:bg-[#1a1d22] transition-colors"
              >
                <span
                  className="mt-[2px] flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors"
                  style={{ borderColor: coche ? "#96c0b8" : "#3a424d", background: coche ? "#96c0b8" : "transparent" }}
                >
                  {coche && <Check className="h-[11px] w-[11px] text-[#0b1211]" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] leading-5 text-[#dfe3e8]">{s.nom}</span>
                  <span className="block text-[10.5px] leading-4" style={{ color: s.coute ? "#d9a441" : "#6a7180" }}>{s.note}</span>
                </span>
              </button>
            );
          })}

          <div className="mt-1.5 border-t border-[#1f2228] px-3 pt-2.5">
            <button
              type="button"
              onClick={lancer}
              disabled={!cochees.length}
              className="w-full rounded-full bg-[#b8dcc8] px-4 py-1.5 text-[12.5px] font-semibold text-[#04140c] hover:bg-[#c8e8d6] disabled:opacity-30 transition-colors"
            >
              {toutes ? "Tout relire" : `Relire ${cochees.length} source${cochees.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
