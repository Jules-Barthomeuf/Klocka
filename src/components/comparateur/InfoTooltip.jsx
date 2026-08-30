import React, { useState } from "react";
import { Info, X } from "lucide-react";

export default function InfoTooltip({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="ml-1.5 w-5 h-5 rounded-full bg-[#f2f3f5]/[0.06] hover:bg-[#f2f3f5]/[0.12] flex items-center justify-center transition-colors"
      >
        <Info className="w-3 h-3 text-[#f2f3f5]/40" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-7 left-1/2 -translate-x-1/2 w-72 bg-[#0c0d10] border border-[#22262d] rounded-md p-3 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[#f2f3f5]/70 text-xs leading-relaxed">{text}</p>
              <button onClick={() => setOpen(false)} className="flex-shrink-0 text-[#f2f3f5]/30 hover:text-[#f2f3f5]/60">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </span>
  );
}