import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Cell, ResponsiveContainer } from "recharts";

const fmtK = (v) => `${Math.round(v / 1000)}`;

export default function SimCashflowBar({ calculs, anneeRevente, formatCurrency }) {
  const { bars, avg } = useMemo(() => {
    const rows = calculs.tableauAnnuel.slice(1, anneeRevente + 1);
    const total = rows.reduce((s, r) => s + r.cashFlowAnnuel, 0);
    return {
      bars: rows.map((r) => ({ annee: `${r.annee}`, value: Math.round(r.cashFlowAnnuel) })),
      avg: anneeRevente > 0 ? Math.round(total / anneeRevente) : 0,
    };
  }, [calculs, anneeRevente]);

  const axisTick = { fill: "#9ca3af", fontSize: 10 };
  const axisLine = { stroke: "#ffffff", strokeOpacity: 0.15 };

  return (
    <div className="border border-white/[0.08] rounded-md bg-[#0c0c0c] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-sm font-medium">Cash-flow annuel</p>
        <p className="text-[10px] text-gray-600">moy. {formatCurrency(avg)}/an</p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 8, right: 12, left: 12, bottom: 24 }}>
            <CartesianGrid stroke="#ffffff" strokeOpacity={0.08} strokeDasharray="3 3" />
            <XAxis dataKey="annee" tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={{ value: "(année)", position: "bottom", offset: 8, fill: "#6b6b6b", fontSize: 10 }} />
            <YAxis tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={fmtK} label={{ value: "(en milliers d'euros)", angle: -90, position: "insideLeft", fill: "#6b6b6b", fontSize: 10, style: { textAnchor: "middle" } }} />
            <ReferenceLine y={0} stroke="#333" />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 6, fontSize: 11 }} formatter={(v) => [formatCurrency(v), ""]} />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {bars.map((d, i) => <Cell key={i} fill={d.value >= 0 ? "#2A9D8F" : "#E8836B"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}