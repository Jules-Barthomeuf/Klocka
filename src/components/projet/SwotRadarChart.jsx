import React from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";

export default function SwotRadarChart({ sections }) {
  const chartData = sections.map(s => ({
    category: s.label,
    score: s.data.score_global || 0,
    fill: s.hex,
  }));

  return (
    <div className="p-5 bg-gray-800/30 rounded-2xl border border-gray-700/40">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-white text-sm font-semibold">Vue d'ensemble SWOT</h3>
        <div className="flex items-center gap-3">
          {sections.map(s => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full`} style={{ backgroundColor: s.hex }} />
              <span className="text-gray-500 text-[10px]">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="#374151" />
            <PolarAngleAxis dataKey="category" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Radar dataKey="score" stroke="#2A9D8F" fill="#2A9D8F" fillOpacity={0.2} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}