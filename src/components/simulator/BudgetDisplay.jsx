import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

export default function BudgetDisplay({ prixBienNegocie, calculs, formatCurrency, textClass, mutedClass, commissionAgentActive, commissionAgentInclusFAI = true }) {
  return (
    <div className="bg-[#000000] p-4 rounded-md md:p-6 border border-[#f2f3f5]/[0.1] max-w-full overflow-hidden">
      <h3 className="font-light text-[#f2f3f5] text-xl md:text-2xl tracking-tight mb-3 md:mb-4">Budget total</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-full">
        <div className="relative flex items-center justify-center w-full">
          <ResponsiveContainer width="100%" height={200} className="max-w-full">
            <PieChart>
              <Pie
                data={[
                  { name: 'Prix négocié', value: prixBienNegocie, fill: '#8fa0f2' },
                  ...(commissionAgentActive && !commissionAgentInclusFAI && calculs.honorairesChargeAcquereur > 0 ? [{ name: 'Honoraires acquéreur TTC', value: calculs.honorairesChargeAcquereur, fill: '#a8894f' }] : []),
                  { name: 'Droits enreg.', value: calculs.droitsEnregistrement, fill: '#aab6f5' },
                  { name: 'Honoraires Klocka TTC', value: calculs.totalFraisKlocka, fill: '#a9c5b9' },
                  { name: 'Frais divers', value: calculs.fraisDivers, fill: '#e8746a' }
                ].filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
                label={(entry) => `${(entry.value / calculs.prixRevient * 100).toFixed(0)}%`}
              >
                {[
                  { name: 'Prix négocié', value: prixBienNegocie, fill: '#8fa0f2' },
                  ...(commissionAgentActive && !commissionAgentInclusFAI && calculs.honorairesChargeAcquereur > 0 ? [{ name: 'Honoraires acquéreur TTC', value: calculs.honorairesChargeAcquereur, fill: '#a8894f' }] : []),
                  { name: 'Droits enreg.', value: calculs.droitsEnregistrement, fill: '#aab6f5' },
                  { name: 'Honoraires Klocka TTC', value: calculs.totalFraisKlocka, fill: '#a9c5b9' },
                  { name: 'Frais divers', value: calculs.fraisDivers, fill: '#e8746a' }
                ].filter(d => d.value > 0).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />)}
              </Pie>
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ backgroundColor: '#0c0d10', border: '1px solid #2c3139', borderRadius: '8px', color: '#fff' }}
                labelStyle={{ color: '#fff' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-xl font-medium text-[#f2f3f5]">{formatCurrency(calculs.prixRevient)}</p>
              <p className="text-xs text-[#f2f3f5]/60">Prix de revient</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 min-w-0 flex-shrink">
          <div className="flex items-center justify-between">
            <p className={`text-xs ${mutedClass}`}>Prix du bien négocié FAI</p>
            <p className="text-[#f2f3f5] text-base font-medium tabular-nums">{formatCurrency(prixBienNegocie)}</p>
          </div>
          {commissionAgentActive && calculs.honorairesChargeAcquereur > 0 && commissionAgentInclusFAI && (
            <>
              <div className="flex items-center justify-between pl-4">
                <p className={`text-xs ${mutedClass} italic`}>dont honoraires charge acquéreur TTC</p>
                <p className={`text-xs ${mutedClass} tabular-nums`}>{formatCurrency(calculs.honorairesChargeAcquereur)}</p>
              </div>
              <div className="flex items-center justify-between pl-4">
                <p className={`text-xs ${mutedClass} italic`}>Prix hors droits (hors honoraires)</p>
                <p className={`text-xs ${mutedClass} tabular-nums`}>{formatCurrency(calculs.prixHorsDroits)}</p>
              </div>
            </>
          )}
          {commissionAgentActive && calculs.honorairesChargeAcquereur > 0 && !commissionAgentInclusFAI && (
            <div className="flex items-center justify-between">
              <p className={`text-xs ${mutedClass}`}>Honoraires charge acquéreur TTC (en sus)</p>
              <p className={`text-base font-medium text-[#a9c5b9] tabular-nums`}>{formatCurrency(calculs.honorairesChargeAcquereur)}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <p className={`text-xs ${mutedClass}`}>Droits d'enregistrement estimés</p>
            <p className={`text-base font-medium text-[#f2f3f5] tabular-nums`}>{formatCurrency(calculs.droitsEnregistrement)}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${mutedClass}`}>Honoraires Klocka TTC</p>
            <p className={`text-base font-medium text-[#f2f3f5] tabular-nums`}>{formatCurrency(calculs.totalFraisKlocka)}</p>
          </div>
          <div className="flex items-center justify-between">
            <p className={`text-xs ${mutedClass}`}>Frais divers à l'acquisition</p>
            <p className={`text-base font-medium text-[#f2f3f5] tabular-nums`}>{formatCurrency(calculs.fraisDivers)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}