import { useState } from "react";
import { ChevronDown } from "lucide-react";

const fmt = (v) => v.toLocaleString("fr-FR");

// Curseur et interrupteur natifs : le site ne charge pas les composants Radix de la plateforme.
export function SimSlider({ label, value, onChange, min, max, step = 1, unit = "€", hint }) {
  const pct = `${((value - min) / (max - min)) * 100}%`;
  return (
    <div className="py-3">
      <div className="flex justify-between text-[14px]">
        <span className="text-k-t2">{label}</span>
        <span>{fmt(value)} {unit}</span>
      </div>
      <input
        type="range" className="k-range mt-3" aria-label={label}
        value={value} min={min} max={max} step={step}
        style={{ "--k-pct": pct }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-2 text-[12.5px] text-k-dim">{hint}</p>}
    </div>
  );
}

export function SimToggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between py-3 text-[14px] text-k-t2 cursor-pointer">
      {label}
      <button
        type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-k-sage" : "bg-white/20"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-4" : ""}`} />
      </button>
    </label>
  );
}

export function SimGroup({ title, defaultOpen = true, boxed, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={boxed ? "rounded-[18px] border border-k-sage/40 px-5 mt-4" : "border-t border-white/10 px-1"}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-[15px]">
        {title}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}
