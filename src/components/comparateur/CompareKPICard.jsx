import React from "react";
import InfoTooltip from "./InfoTooltip";

const colorClasses = [
  { bg: "from-red-800/20", border: "border-red-800/50", text: "text-red-800", bar: "bg-red-800" },
  { bg: "from-[#7fd3c9]/20", border: "border-[#7fd3c9]/50", text: "text-[#7fd3c9]", bar: "bg-[#7fd3c9]" },
  { bg: "from-[#e0c9a0]/20", border: "border-[#e0c9a0]/50", text: "text-[#e0c9a0]", bar: "bg-[#e0c9a0]" },
  { bg: "from-purple-400/20", border: "border-purple-400/50", text: "text-purple-400", bar: "bg-purple-400" },
];

export default function CompareKPICard({ label, values, projectNames, format = "currency", higherIsBetter = true, tooltip }) {
  const numericValues = values.map(v => typeof v === "number" ? v : 0);
  const max = Math.max(...numericValues.filter(v => v > 0));
  const bestIdx = higherIsBetter
    ? numericValues.indexOf(Math.max(...numericValues))
    : numericValues.indexOf(Math.min(...numericValues.filter(v => v > 0)));

  const formatValue = (v) => {
    if (v === null || v === undefined) return "N/A";
    if (format === "currency") return `${Math.round(v).toLocaleString("fr-FR")} €`;
    if (format === "percent") return `${v.toFixed(2)}%`;
    if (format === "year") return v ? `Année ${v}` : "N/A";
    if (format === "years") return v !== null ? `${v} an${v > 1 ? "s" : ""}` : "N/A";
    if (format === "date") {
      if (!v) return "N/A";
      return new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
    }
    if (format === "text") return v !== null && v !== undefined ? `${v.toFixed(2)}x` : "N/A";
    return String(v);
  };

  return (
    <div className="bg-[#0a0c0c] rounded-md border border-[#242726] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#edeae5]/40 text-xs uppercase tracking-[0.15em]">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="space-y-3">
        {values.map((v, i) => {
          const colors = colorClasses[i % colorClasses.length];
          const isBest = i === bestIdx && numericValues.filter(n => n > 0).length > 1;
          const barWidth = max > 0 && typeof v === "number" && v > 0 ? (v / max) * 100 : 0;

          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#edeae5]/50 text-xs truncate max-w-[50%]">{projectNames[i]}</span>
                <span className={`text-sm font-medium ${isBest ? colors.text : "text-[#edeae5]"}`}>
                  {formatValue(v)}
                </span>
              </div>
              {typeof v === "number" && max > 0 && (
                <div className="h-1.5 bg-[#edeae5]/[0.04] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors.bar} transition-all duration-700`}
                    style={{ width: `${Math.max(barWidth, 2)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}