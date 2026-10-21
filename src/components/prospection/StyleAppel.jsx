import React from "react";

// Le vocabulaire des « Actions proposées » (SequenceActions), repris par les écrans d'appel (21 oct. 2026, Jules :
// « harmoniser le rappel et le mode appel avec les actions proposées ») : une étiquette en petites capitales, des
// cartes à bord doux, un trait vertical qui relie les étapes avec leur moment, un grand bouton pleine largeur.

export const ETIQUETTE = "m-0 text-[12px] tracking-[.14em] text-ardoise";
export const CARTE = "rounded-[18px] border border-bord-doux bg-transparent";
export const GROS_BOUTON = "w-full rounded-full py-[18px] text-[17px] transition-opacity hover:opacity-90 disabled:opacity-50";
export const CHAMP_CARTE = "w-full resize-y rounded-[18px] border border-bord-doux bg-transparent px-[18px] py-3 text-[15px] leading-[1.55] text-encre outline-none focus:border-menthe max-md:text-[16px]";

/** Le trait entre deux cartes, comme dans les actions proposées ; `moment` le nomme. */
export function TraitAppel({ moment = null, h = 28 }) {
  return (
    <div className="flex items-center">
      <div className="relative ml-[22px] w-px flex-none bg-menthe/50" style={{ height: h }} />
      {moment && <span className="ml-3 text-[12.5px] text-craie">{moment}</span>}
    </div>
  );
}
