import React from "react";

// Le mode appel en interrupteur (17 oct. 2026, Jules) : posé à droite, en tête
// d'Aujourd'hui et de chaque liste ; allumé, le mode appel prend la place de
// la page, éteint il la rend.
export default function BasculeModeAppel({ actif, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={actif} onClick={() => onChange(!actif)}
      className="inline-flex h-9 items-center gap-3 rounded-full border border-trait px-4 text-[14px] text-encre hover:border-bord-vif" style={{ background: "transparent" }}>
      Mode appel
      <span aria-hidden className={`relative h-[20px] w-[36px] flex-none rounded-full transition-colors ${actif ? "bg-menthe" : "bg-relief"}`}>
        <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-fond shadow-sm transition-all ${actif ? "left-[18px]" : "left-[2px]"}`} />
      </span>
    </button>
  );
}
