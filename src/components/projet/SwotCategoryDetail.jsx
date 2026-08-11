import React from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";
import SwotInfoCards from "./SwotInfoCards";

export default function SwotCategoryDetail({ section, swotData }) {
  const { data, color, hex, border, key } = section;
  const items = data.items || [];
  const maxScore = Math.max(...items.map(i => i.score), 1);

  return (
    <div className="px-5 pb-5 space-y-5 border-t border-white/[0.04]">
      {/* Info cards from admin data */}
      <SwotInfoCards categoryKey={key} swotData={swotData} color={color} hex={hex} border={border} />

      {/* KPI Cards row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-black/30 border border-white/[0.06] text-center">
          <p className={`text-3xl font-bold ${color}`}>{items.length}</p>
          <p className="text-gray-500 text-[11px] mt-1">Éléments</p>
        </div>
        <div className="p-4 rounded-xl bg-black/30 border border-white/[0.06] text-center">
          <p className={`text-3xl font-bold ${color}`}>{data.score_global || 0}</p>
          <p className="text-gray-500 text-[11px] mt-1">Score /100</p>
        </div>
        <div className="p-4 rounded-xl bg-black/30 border border-white/[0.06] text-center">
          <p className={`text-3xl font-bold ${color}`}>
            {items.length > 0 ? (items.reduce((a, i) => a + i.score, 0) / items.length).toFixed(1) : "–"}
          </p>
          <p className="text-gray-500 text-[11px] mt-1">Moyenne /10</p>
        </div>
      </div>

      {/* Bar chart */}
      {items.length > 0 && (
        <div className="p-4 rounded-xl bg-black/20 border border-white/[0.04]">
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={items} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" domain={[0, 10]} tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fill: "#d1d5db", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={16}>
                  {items.map((_, i) => (
                    <Cell key={i} fill={hex} fillOpacity={0.7 + (items[i]?.score / maxScore) * 0.3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Individual score indicators */}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
            className={`flex items-center gap-3 p-3 rounded-xl bg-black/20 border ${border}`}
          >
            <div className="relative w-9 h-9 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="3" />
                <circle cx="18" cy="18" r="14" fill="none" stroke={hex} strokeWidth="3"
                  strokeDasharray={`${(item.score / 10) * 88} 88`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-[10px] font-bold ${color}`}>{item.score}</span>
              </div>
            </div>
            <span className="text-white text-xs font-medium flex-1">{item.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}