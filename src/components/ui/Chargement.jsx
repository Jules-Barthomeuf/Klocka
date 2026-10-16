import React from "react";

// Le chargement, partout le même (16 oct. 2026, Jules : « des animations comme
// dans la présentation ou la modification du projet, mais partout ;
// harmonise ») : les mini-diapositives qui se relaient (.k-pile, .k-mini), le
// titre traversé de lumière (.k-titre-metal), la phrase qui change toutes les
// deux secondes (.k-etats). Trois tailles : « grand » pour une page ou un
// panneau, « moyen » pour un cadre, « petit » pour une ligne.

const ETATS = ["Je rassemble les informations", "Je les mets en ordre", "J'affiche"];

function Pile({ echelle = 1 }) {
  const ligne = "h-[7px] rounded-full bg-bord-doux";
  return (
    <div style={{ width: 220 * echelle, height: 170 * echelle }} aria-hidden>
      <div className="k-pile origin-top-left" style={{ transform: echelle === 1 ? undefined : `scale(${echelle})` }}>
        <div className="k-mini p-4">
          <div className="h-[9px] w-[58%] rounded-full bg-menthe" />
          <div className={`${ligne} mt-3 w-[82%]`} />
          <div className={`${ligne} mt-2 w-[66%]`} />
        </div>
        <div className="k-mini flex gap-3 p-4">
          <div className="h-full w-[42%] rounded-[6px] bg-menthe-fonce" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-[8px] w-[80%] rounded-full bg-menthe/70" />
            <div className={`${ligne} w-full`} />
            <div className={`${ligne} w-[70%]`} />
          </div>
        </div>
        <div className="k-mini flex items-end justify-center gap-3 px-6 pb-5 pt-4">
          {[44, 66, 52, 84].map((h, i) => <div key={i} className={`w-6 rounded-t-[4px] ${i === 3 ? "bg-menthe" : "bg-bord-doux"}`} style={{ height: `${h}%` }} />)}
        </div>
      </div>
    </div>
  );
}

export default function Chargement({ taille = "moyen", titre = "Un instant", etats = ETATS, className = "" }) {
  const trois = etats?.length === 3 ? etats : ETATS;
  if (taille === "petit") {
    return (
      <div role="status" className={`flex items-center justify-center gap-2.5 py-3 ${className}`}>
        <span className="k-titre-metal text-[13.5px]">{titre}</span>
        <span className="k-etats w-[230px] text-[12.5px] text-brume">{trois.map((e) => <span key={e}>{e}</span>)}</span>
      </div>
    );
  }
  const grand = taille === "grand";
  return (
    <div role="status" className={`flex flex-col items-center justify-center text-center animate-in fade-in duration-500 ${grand ? "py-16" : "py-8"} ${className}`}>
      <Pile echelle={grand ? 1 : 0.62} />
      <p className={`k-titre-metal m-0 font-medium tracking-[-0.01em] ${grand ? "mt-9 text-[24px]" : "mt-5 text-[17px]"}`}>{titre}</p>
      <div className={`k-etats max-w-full text-craie ${grand ? "mt-2.5 w-[320px] text-[14px]" : "mt-1.5 w-[280px] text-[13px]"}`} aria-live="polite">
        {trois.map((e) => <span key={e}>{e}</span>)}
      </div>
    </div>
  );
}
