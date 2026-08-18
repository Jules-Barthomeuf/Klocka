import React from "react";
import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

function Item({ label, value, accent = "text-[#edeae5]", info }) {
  return (
    <div className="px-4 py-4 min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-[9px] uppercase tracking-[0.16em] text-[#6b7270] font-medium truncate">{label}</p>
        {info && (
          <TooltipProvider delayDuration={100}>
            <UITooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-[#6b7270] hover:text-[#d3d8d6] transition-colors flex-shrink-0">
                  <Info className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-[11px] leading-snug">{info}</TooltipContent>
            </UITooltip>
          </TooltipProvider>
        )}
      </div>
      <p className={`text-lg font-medium tabular-nums mt-1 ${accent} truncate`}>{value}</p>
    </div>
  );
}

export default function SimReventeSynthese({ calculs, anneeRevente, formatCurrency }) {
  const rev = calculs.revente;
  const ind = calculs.indicateurs;

  const items = [
    { label: "Prix vente FAI", value: formatCurrency(rev.prixVenteFAI) },
    { label: "Prix revente net", value: formatCurrency(rev.prixVenteNet) },
    { label: "Capital restant", value: formatCurrency(ind.capitalARemboursserRevente) },
    { label: "Apport initial", value: formatCurrency(ind.apportInitial) },
    { label: "Cash-flow cumulé", value: formatCurrency(ind.cashFlowCumule) },
    { label: "Création richesse", value: formatCurrency(ind.creationRichesseBrute), accent: "text-[#35a79b]", info: "La création de richesse correspond au cash-flow cumulé + le prix de la revente, en retirant l'apport initial." },
  ];

  const barData = [
    { label: "Création richesse", value: Math.round(ind.creationRichesseBrute), fill: "#D4A93C" },
    { label: "Prix revente net", value: Math.round(rev.prixVenteNet), fill: "#7FC7BC" },
    { label: "Cash-flow cumulé", value: Math.round(ind.cashFlowCumule), fill: "#3AAE5F" },
    { label: "Apport (sortie)", value: -Math.round(ind.apportInitial), fill: "#E8836B" },
  ];

  return (
    <div className="border border-[#282b2a] rounded-md bg-[#0e100f]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#242726]">
        <p className="text-[#edeae5] text-sm font-medium">Synthèse à la revente</p>
        <p className="text-[#35a79b] text-sm font-medium tabular-nums">×{ind.multipleNetFondsPropres}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y divide-[#242726]">
        {items.map((it, i) => (
          <Item key={i} label={it.label} value={it.value} accent={it.accent} info={it.info} />
        ))}
      </div>
      <div className="h-72 px-2 pt-6 pb-4 border-t border-[#242726]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid horizontal={false} stroke="#ffffff" strokeOpacity={0.08} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              axisLine={{ stroke: "#ffffff", strokeOpacity: 0.15 }}
              tickLine={{ stroke: "#ffffff", strokeOpacity: 0.15 }}
              tickFormatter={(v) => `${Math.round(v / 1000)}k`}
            />
            <ReferenceLine x={0} stroke="#ffffff" strokeOpacity={0.25} />
            <YAxis
              type="category"
              dataKey="label"
              width={90}
              tick={{ fill: "#cbd5e1", fontSize: 10 }}
              axisLine={{ stroke: "#ffffff", strokeOpacity: 0.15 }}
              tickLine={false}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 11 }} formatter={(v) => [formatCurrency(Math.abs(v)), ""]} />
            <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={22}>
              {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}