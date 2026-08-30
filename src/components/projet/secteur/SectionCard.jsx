import React from "react";

// Section éditoriale : filet supérieur, titre lettré, aucun cadre (maquette "Page Projet Klocka")
export default function SectionCard({ title, children }) {
  return (
    <section className="border-t border-[#f2f3f5]/[0.35] pt-7 max-md:pt-5">
      {title && (
        <div className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6] mb-5 max-md:mb-4">{title}</div>
      )}
      {children}
    </section>
  );
}

export function KPI({ label, value, sub, color = "gray", inline }) {
  const accents = {
    teal: "text-[#c3ddd6]",
    green: "text-[#c3ddd6]",
    red: "text-red-400",
    amber: "text-[#96c0b8]",
    gray: "text-[#f2f3f5]",
  };
  const accent = accents[color] || accents.gray;

  if (inline) {
    return (
      <div className="inline-flex items-baseline gap-3">
        <p className="text-[12px] text-[#9298a6] mb-0">{label}</p>
        <p className={`text-[24px] font-light mb-0 ${accent}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      </div>
    );
  }

  return (
    <div>
      <p className={`text-[24px] max-md:text-[20px] font-light mb-0 ${accent}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-[12px] text-[#9298a6] mt-1 mb-0">{label}</p>
      {sub && <p className="text-[11px] text-[#6a7180] mt-0.5 mb-0">{sub}</p>}
    </div>
  );
}

export function ProgressBar({ label, value, color = "#96c0b8", maxValue = 100 }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-[#9298a6] mb-1">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-2 bg-[#0f1114] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(value, maxValue)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}