import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const RADIAN = Math.PI / 180;

export default function SimBudgetDonut({ calculs, prixBienNegocie, formatCurrency }) {
  const items = useMemo(() => [
  { name: "Prix du bien négocié FAI", value: Math.round(prixBienNegocie || 0), color: "#35a79b" },
  { name: "Droits d'enregistrement estimés", value: Math.round(calculs.droitsEnregistrement || 0), color: "#e0c9a0" },
  { name: "Honoraires Klocka TTC", value: Math.round(calculs.totalFraisKlocka || 0), color: "#48C7A5" },
  { name: "Frais divers à l'acquisition", value: Math.round(calculs.fraisDivers || 0), color: "#E76F51" }].
  filter((d) => d.value > 0), [calculs, prixBienNegocie]);

  const total = calculs.prixRevient || items.reduce((s, d) => s + d.value, 0);

  const renderLabel = ({ cx, cy, midAngle, outerRadius, percent, index }) => {
    const r = outerRadius + 16;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    const pct = (percent * 100).toFixed(0);
    return (
      <text x={x} y={y} fill={items[index]?.color || "#888"} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600">
        {pct}%
      </text>);

  };

  return (
    <div className="border border-[#282b2a] rounded-lg bg-[#0a0c0c]">
      <div className="px-5 py-3 border-b border-[#242726]">
        <p className="text-[#edeae5] text-sm font-medium">Budget total</p>
      </div>
      <div className="flex items-center gap-8 p-5">
        {/* Donut */}
        <div className="relative w-44 h-44 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={items} dataKey="value" nameKey="name" innerRadius={60} outerRadius={74} paddingAngle={2} stroke="none" label={renderLabel} labelLine={false}>
                {items.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[#edeae5] text-lg font-bold tabular-nums leading-tight">{formatCurrency(total)}</span>
            <span className="text-[10px] text-[#8b9391] mt-0.5">Prix de revient</span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {items.map((d, i) =>
          <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate pr-3 text-[hsl(var(--background))]">{d.name}</span>
              <span className="text-[#edeae5] tabular-nums font-medium whitespace-nowrap">{formatCurrency(d.value)}</span>
            </div>
          )}
        </div>
      </div>
    </div>);

}