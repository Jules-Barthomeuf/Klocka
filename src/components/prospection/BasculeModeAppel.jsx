import React from "react";

// Le mode appel en interrupteur (17 oct. 2026, Jules) : posé à droite, en tête
// d'Aujourd'hui et de chaque liste ; allumé, le mode appel prend la place de
// la page, éteint il la rend.
export default function BasculeModeAppel({ actif, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={() => onChange(!actif)}
      className="inline-flex h-8 items-center gap-2.5 rounded-full border border-bord-doux px-3.5 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre max-md:h-10" style={{ background: "transparent" }}>
      Mode appel
      <span aria-hidden className={`relative h-[18px] w-[32px] flex-none rounded-full transition-colors duration-300 ${actif ? "bg-menthe" : "bg-relief"}`}>
        <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-fond shadow-sm transition-all duration-300 ease-out ${actif ? "left-[16px]" : "left-[2px]"}`} />
      </span>
    </button>
  );
}
