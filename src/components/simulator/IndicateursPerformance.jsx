import React from "react";
import TooltipInfo from "./TooltipInfo";

export default function IndicateursPerformance({ calculs, anneeRevente, formatCurrency, textClass, mutedClass }) {
  return (
    <div className="bg-[#000000] p-4 rounded-md md:p-6 border border-[#f2f3f5]/[0.1] max-w-full overflow-hidden">
      <h3 className="font-light text-[#f2f3f5] text-xl md:text-2xl tracking-tight mb-3 md:mb-4">Performance globale</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 w-full">
        <div className="p-2 md:p-4 rounded-md bg-[#f2f3f5]/[0.04] border border-[#1f2228] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 min-h-[34px] flex items-center justify-center gap-1 text-center leading-tight`}>Multiple fonds propres <TooltipInfo field="multipleFondsPropres" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>x{calculs.indicateurs.multipleNetFondsPropres}</p>
        </div>
        <div className="p-2 md:p-4 rounded-md bg-[#f2f3f5]/[0.04] border border-[#1f2228] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 min-h-[34px] flex items-center justify-center gap-1 text-center leading-tight`}>TRI <TooltipInfo field="tri" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{calculs.indicateurs.triBrut}%</p>
        </div>
        <div className="p-2 md:p-4 rounded-md bg-[#f2f3f5]/[0.04] border border-[#1f2228] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 min-h-[34px] flex items-center justify-center gap-1 text-center leading-tight`}>Rendement global <TooltipInfo field="rendementGlobal" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{calculs.indicateurs.rendementLocatifGlobalNet}%</p>
        </div>
        <div className="p-2 md:p-4 rounded-md bg-[#f2f3f5]/[0.04] border border-[#1f2228] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 min-h-[34px] flex items-center justify-center gap-1 text-center leading-tight`}>Enrichissement/an <TooltipInfo field="enrichissementAn" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(Math.round(calculs.indicateurs.creationRichesseBrute / anneeRevente))}</p>
          <p className="text-xs text-[#f2f3f5]/50 mt-1">soit {formatCurrency(Math.round(calculs.indicateurs.creationRichesseBrute / anneeRevente / 12))}/mois</p>
        </div>
      </div>
    </div>
  );
}