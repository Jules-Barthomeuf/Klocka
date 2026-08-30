import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const RADIAN = Math.PI / 180;

export default function SimBudgetDonut({ calculs, prixBienNegocie, formatCurrency }) {
  const items = useMemo(() => [
  { name: "Prix du bien négocié FAI", value: Math.round(prixBienNegocie || 0), color: "#96c0b8" },
  { name: "Droits d'enregistrement estimés", value: Math.round(calculs.droitsEnregistrement || 0), color: "#C6A45C" },
  { name: "Honoraires Klocka TTC", value: Math.round(calculs.totalFraisKlocka || 0), color: "#A594C9" },
  { name: "Frais divers à l'acquisition", value: Math.round(calculs.fraisDivers || 0), color: "#E76F51" }].
  filter((d) => d.value > 0), [calculs, prixBienNegocie]);

  const total = calculs.prixRevient || items.reduce((s, d) => s + d.value, 0);

  const renderLabel = ({ cx, cy, midAngle, outerRadius, percent, index }) => {
    const r = outerRadius + 18;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    // Les petites parts se perdent à l'entier : elles gardent une décimale.
    const brut = percent * 100;
    const pct = brut < 10 ? brut.toFixed(1) : brut.toFixed(0);
    return (
      <text x={x} y={y} fill={items[index]?.color || "#888"} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="600">
        {pct}%
      </text>);

  };

  return (
    <div className="border border-[#1f2228] rounded-lg bg-[#000000]">
      <div className="px-5 py-3 border-b border-[#1f2228]">
        <p className="text-[#f2f3f5] text-sm font-medium">Budget total</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 p-5">
        {/* Donut */}
        <div className="relative w-60 h-60 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={items} dataKey="value" nameKey="name" innerRadius={64} outerRadius={80} paddingAngle={2} stroke="none" label={renderLabel} labelLine={false}>
                {items.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[#f2f3f5] text-lg font-bold tabular-nums leading-tight">{formatCurrency(total)}</span>
            <span className="text-[10px] text-[#9298a6] mt-0.5">Prix de revient</span>
          </div>
        </div>

        {/* List */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 space-y-2.5">
          {items.map((d, i) =>
          <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate pr-3 text-[#9298a6]">{d.name}</span>
              <span className="text-[#f2f3f5] tabular-nums font-medium whitespace-nowrap">{formatCurrency(d.value)}</span>
            </div>
          )}
        </div>
      </div>
    </div>);

}