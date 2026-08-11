import React from "react";

export default function SimTopBar({ title = "Klocka", subtitle = "Simulateur de rentabilité commerciale" }) {
  return (
    <div className="w-full border-b border-white/[0.08] bg-[#0c0c0c]">
      <div className="flex items-baseline gap-2 px-4 h-12">
        <span className="text-white text-sm font-medium truncate">{title}</span>
        <span className="text-gray-500 text-xs truncate hidden sm:inline">— {subtitle}</span>
      </div>
    </div>
  );
}