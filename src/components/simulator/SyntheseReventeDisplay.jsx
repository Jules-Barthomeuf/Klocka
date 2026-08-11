import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import TooltipInfo from "./TooltipInfo";

export default function SyntheseReventeDisplay({ calculs, apport, anneeRevente, formatCurrency, textClass, mutedClass }) {
  return (
    <div className="bg-black p-4 rounded-xl md:p-6 border border-white/[0.1] max-w-full overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3 mb-3 md:mb-4">
        <h3 className="font-light text-white text-xl md:text-2xl tracking-tight">Synthèse à la revente</h3>
        <span className="text-xs text-white/50">année {anneeRevente}</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4 w-full mb-4 md:mb-6">
        <div className="p-2 md:p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 flex items-center gap-1`}>Prix vente FAI <TooltipInfo field="prixVenteFAI" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.revente.prixVenteFAI)}</p>
        </div>
        <div className="p-2 md:p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 flex items-center gap-1`}>Prix revente net <TooltipInfo field="prixReventeNet" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.revente.prixVenteNet)}</p>
        </div>
        <div className="p-2 md:p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 flex items-center gap-1`}>Capital restant <TooltipInfo field="capitalRestant" /></p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(calculs.indicateurs.capitalARemboursserRevente)}</p>
        </div>
        <div className="p-2 md:p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1`}>Apport initial</p>
          <p className={`text-sm md:text-lg font-medium ${textClass} tabular-nums`}>{formatCurrency(apport)}</p>
        </div>
        <div className="p-2 md:p-4 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm ${mutedClass} mb-1 flex items-center gap-1`}>Cash-flow cumulé <TooltipInfo field="cashFlowCumule" /></p>
          <p className={`text-sm md:text-lg font-medium tabular-nums ${calculs.indicateurs.cashFlowCumule >= 0 ? 'text-green-500' : 'text-red-500'}`}>{formatCurrency(calculs.indicateurs.cashFlowCumule)}</p>
        </div>
        <div className="p-2 md:p-4 rounded-xl bg-gradient-to-r from-[#D4AF37]/20 to-[#F5D76E]/20 border border-[#D4AF37]/50 flex flex-col items-center justify-center text-center">
          <p className={`text-xs md:text-sm text-[#F5D76E] mb-1 flex items-center gap-1`}>Création richesse <TooltipInfo field="creationRichesse" /></p>
          <p className={`text-base md:text-xl font-medium text-[#D4AF37] tabular-nums`}>{formatCurrency(calculs.indicateurs.creationRichesseBrute)}</p>
          <p className="text-xs text-white/50 mt-1">x{calculs.indicateurs.multipleNetFondsPropres}</p>
        </div>
      </div>
      
      <div className="hidden md:block h-[250px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[
              { name: 'Apport', value: apport, fill: '#6B7280' },
              { name: 'Cash-flow cumulé', value: calculs.indicateurs.cashFlowCumule, fill: calculs.indicateurs.cashFlowCumule >= 0 ? '#22C55E' : '#EF4444' },
              { name: 'Prix revente net', value: calculs.revente.prixVenteNet, fill: '#71CCBA' },
              { name: 'Création richesse', value: calculs.indicateurs.creationRichesseBrute, fill: '#D4AF37' }
            ]}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis type="number" stroke="#9ca3af" tick={{ fontSize: 11 }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" stroke="#9ca3af" tick={{ fontSize: 12 }} width={95} />
            <Tooltip
              formatter={(value) => formatCurrency(value)}
              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {[
                { name: 'Apport', value: apport, fill: '#6B7280' },
                { name: 'Cash-flow cumulé', value: calculs.indicateurs.cashFlowCumule, fill: calculs.indicateurs.cashFlowCumule >= 0 ? '#22C55E' : '#EF4444' },
                { name: 'Prix revente net', value: calculs.revente.prixVenteNet, fill: '#71CCBA' },
                { name: 'Création richesse', value: calculs.indicateurs.creationRichesseBrute, fill: '#D4AF37' }
              ].map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}