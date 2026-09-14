/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { J } from "@/design/jetons";

const RADIAN = Math.PI / 180;

export default function SimBudgetDonut({ calculs, prixBienNegocie, formatCurrency }) {
  const items = useMemo(() => [
  { name: "Prix du bien négocié FAI", value: Math.round(prixBienNegocie || 0), color: J["menthe"] },
  { name: "Droits d'enregistrement estimés", value: Math.round(calculs.droitsEnregistrement || 0), color: "#C6A45C" },
  { name: "Honoraires Klocka TTC", value: Math.round(calculs.feesKlocka || 0), color: "#A594C9" },
  { name: "Incentive Klocka", value: Math.round(calculs.incentiveKlocka || 0), color: J["ambre"] },
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
    <div className="border border-trait rounded-lg bg-fond">
      <div className="px-5 py-3 border-b border-trait">
        <p className="text-encre text-sm font-medium">Budget total</p>
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
            <span className="text-encre text-lg font-bold tabular-nums leading-tight">{formatCurrency(total)}</span>
            <span className="text-[11px] text-ardoise mt-0.5">Prix de revient</span>
          </div>
        </div>

        {/* List */}
        <div className="w-full sm:w-auto sm:flex-1 min-w-0 space-y-2.5">
          {items.map((d, i) =>
          <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate pr-3 text-ardoise">{d.name}</span>
              <span className="text-encre tabular-nums font-medium whitespace-nowrap">{formatCurrency(d.value)}</span>
            </div>
          )}
        </div>
      </div>
    </div>);

}