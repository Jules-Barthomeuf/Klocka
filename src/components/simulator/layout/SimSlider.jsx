import React, { useState } from "react";

const sliderStyle = `
.sim-slider-input{
  -webkit-appearance:none; appearance:none;
  height:4px; border-radius:9999px; outline:none; cursor:pointer;
}
.sim-slider-input::-webkit-slider-thumb{
  -webkit-appearance:none; appearance:none;
  width:14px; height:14px; border-radius:50%;
  background:#8fa0f2; border:2px solid #0f1114;
  cursor:pointer; margin-top:0;
  box-shadow:0 0 0 1px #8fa0f2;
}
.sim-slider-input::-moz-range-thumb{
  width:14px; height:14px; border-radius:50%;
  background:#8fa0f2; border:2px solid #0f1114; cursor:pointer;
}
.sim-slider-input:disabled{ opacity:0.4; cursor:not-allowed; }
.sim-num-input::-webkit-outer-spin-button,
.sim-num-input::-webkit-inner-spin-button{ -webkit-appearance:none; margin:0; }
.sim-num-input{ -moz-appearance:textfield; appearance:textfield; }
`;

export default function SimSlider({ label, value, onChange, min, max, step = 1, unit = "", disabled, muted }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const display = typeof value === "number" ? new Intl.NumberFormat("fr-FR").format(value) : value;

  const beginEdit = () => {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
  };
  const commit = () => {
    const n = Number(draft);
    if (!isNaN(n)) onChange(n);
    setEditing(false);
  };

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-[13px] leading-tight">
        <span className="text-[#9298a6] truncate pr-2">{label}</span>
        {editing ? (
          <input
            autoFocus
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="sim-num-input bg-[#0c0d10] text-[#f2f3f5] text-right text-[13px] w-24 px-1.5 py-0.5 rounded border border-[#8fa0f2]/40 outline-none tabular-nums transition-all duration-300 ease-out animate-in fade-in zoom-in-95"
          />
        ) : (
          <button
            onClick={beginEdit}
            className={`tabular-nums font-medium transition-all duration-300 ease-out ${muted ? "text-[#c9cdd6]" : "text-[#f2f3f5]"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-text hover:underline hover:text-[#8fa0f2]"}`}
            title="Cliquer pour modifier"
          >
            {display}{unit}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sim-slider-input w-full mt-1.5"
        style={{ background: `linear-gradient(to right, #8fa0f2 ${pct}%, #262626 ${pct}%)` }}
      />
      <style>{sliderStyle}</style>
    </div>
  );
}