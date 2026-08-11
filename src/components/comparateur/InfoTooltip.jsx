import React, { useState } from "react";
import { Info, X } from "lucide-react";

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="ml-1.5 w-5 h-5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors"
      >
        <Info className="w-3 h-3 text-white/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-7 left-1/2 -translate-x-1/2 w-72 bg-[#1a1a1a] border border-gray-700 rounded-xl p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="text-white/70 text-xs leading-relaxed">{text}</p>
              <button onClick={() => setOpen(false)} className="flex-shrink-0 text-white/30 hover:text-white/60">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}