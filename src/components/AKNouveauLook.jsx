import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

// « Votre agent AK a un nouveau look ! » (16 oct. 2026, Jules) : une fenêtre,
// une fois par personne et par navigateur, au registre de « Tout préparé » :
// le portrait d'AK qui tourne en arrivant dans son anneau de lumière, le titre
// traversé d'un reflet, puis ce qu'il sait faire, ligne par ligne, cochées.

const CLE = "klocka.ak-nouveau-look.v1";
const LIGNES = [
  ["Vos présentations", "Il vous assiste pour les monter, diapositive par diapositive."],
  ["Vos projets", "Il les entre pour vous, facilement, à partir de ce que vous lui donnez."],
  ["Les données", "Demandez-lui d'aller les chercher : il s'exécute."],
];

const dejaVue = () => { try { return !!localStorage.getItem(CLE); } catch { return true; } };

export default function AKNouveauLook() {
  const [ouverte, setOuverte] = useState(() => !dejaVue());
  const fermer = () => { try { localStorage.setItem(CLE, new Date().toISOString()); } catch { /* sans stockage, elle reviendra */ } setOuverte(false); };
  useEffect(() => {
    if (!ouverte) return undefined;
    const f = (e) => { if (e.key === "Escape" || e.key === "Enter") fermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [ouverte]);
  if (!ouverte) return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-fond/70 p-6 backdrop-blur-xl duration-300 animate-in fade-in-0 md:left-[var(--k-barre-largeur,0px)] max-md:p-3" role="dialog" aria-modal="true" aria-label="AK a un nouveau look">
      <div className="flex w-full max-w-[620px] flex-col items-center rounded-[28px] border border-trait bg-fond px-10 pb-9 pt-11 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:px-5">
        <div className="relative grid h-[124px] w-[124px] place-items-center">
          <span aria-hidden className="k-ak-anneau absolute inset-0 rounded-full" />
          <span aria-hidden className="absolute inset-[6px] rounded-full border border-encre/15" />
          <img src="/avatars/ak.png" alt="" draggable={false} className="k-ak-portrait h-[100px] w-[100px] select-none rounded-full object-cover" />
        </div>
        <p className="k-reflet m-0 mt-7 text-center text-[32px] font-normal leading-[1.15] tracking-[-0.02em] max-md:text-[26px]" style={{ animationDelay: "1.2s" }}>Votre agent AK a un nouveau look{"\u00a0"}!</p>
        <p className="k-monte m-0 mt-3 text-center text-[16px] text-ardoise" style={{ animationDelay: "2.2s" }}>Et il en fait plus pour vous.</p>
        <div className="k-monte mt-8 w-full border-t border-trait" style={{ animationDelay: "2.4s" }}>
          {LIGNES.map(([nom, texte], i) => (
            <div key={nom} className="grid grid-cols-[28px_minmax(0,150px)_minmax(0,1fr)] items-center gap-3 border-b border-trait py-4 max-md:grid-cols-[28px_minmax(0,1fr)]">
              <span className="relative grid h-6 w-6 place-items-center rounded-full border border-encre/25">
                <span className="k-coche absolute inset-[-1px] grid place-items-center rounded-full bg-encre text-fond" style={{ animationDelay: `${2.7 + i * 0.3}s` }}><Check className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
              </span>
              <span className="k-blanchit text-[16px]" style={{ animationDelay: `${2.7 + i * 0.3}s` }}>{nom}</span>
              <span className="min-w-0 text-[15px] leading-[1.45] text-ardoise max-md:col-start-2">{texte}</span>
            </div>
          ))}
        </div>
        <button type="button" onClick={fermer} autoFocus className="k-monte mt-9 h-14 rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90" style={{ animationDelay: "3.8s" }}>Découvrir AK →</button>
      </div>
    </div>,
    document.body,
  );
}
