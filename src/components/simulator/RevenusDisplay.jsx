import React from "react";
import TooltipInfo from "./TooltipInfo";

export default function RevenusDisplay({ calculs, anneeRevente, formatCurrency, textClass, mutedClass }) {
  return (
    <div className="bg-black p-4 rounded-xl md:p-6 border border-white/[0.1] max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 md:mb-4 gap-1">
        <h3 className="font-light text-white text-xl md:text-2xl tracking-tight">Revenus locatifs prévisionnels</h3>
        <span className={`text-xs ${mutedClass}`}>sur {anneeRevente} ans</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 w-full">
        <div className="flex items-center justify-between p-2 md:p-3 bg-white/[0.04] rounded-lg border border-white/[0.08] md:block">
          <p className={`text-xs md:text-sm ${mutedClass} md:mb-1 truncate flex items-center gap-1`}>Loyer moyen net <TooltipInfo field="loyerNetMoyen" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.indicateurs.loyerNetMoyen)}</p>
        </div>
        <div className="flex items-center justify-between p-2 md:p-3 bg-white/[0.04] rounded-lg border border-white/[0.08] md:block">
          <p className={`text-xs md:text-sm ${mutedClass} md:mb-1 truncate flex items-center gap-1`}>Échéance crédit <TooltipInfo field="echeanceCredit" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.tableauAnnuel[1]?.creditBancaireCashFlow || 0)}</p>
        </div>
        <div className="flex items-center justify-between p-2 md:p-3 bg-white/[0.04] rounded-lg border border-white/[0.08] md:block">
          <p className={`text-xs md:text-sm ${mutedClass} md:mb-1 truncate flex items-center gap-1`}>Cash-flow moyen <TooltipInfo field="cashFlowMoyen" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.indicateurs.cashFlowMoyenAn)}</p>
        </div>
      </div>
    </div>
  );
}