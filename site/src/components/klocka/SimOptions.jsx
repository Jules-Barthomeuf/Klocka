import { Check } from "lucide-react";

export default function SimOptions({ title, options, value, onChange }) {
  return (
    <div className="mt-8">
      <p className="k-label !text-[11.5px] mb-2">{title}</p>
      {options.map(([val, label]) => {
        const on = val === value;
        return (
          <button
            key={val}
            onClick={() => onChange(val)}
            className="w-full flex items-center justify-between py-3.5 border-b border-white/[0.06] text-left"
          >
            <span className={`text-[15px] transition-colors ${on ? "text-white" : "text-k-t3"}`}>{label}</span>
            <span className={`w-5 h-5 rounded-[5px] border flex items-center justify-center transition-colors duration-300 ${on ? "bg-k-sage border-k-sage" : "border-white/25"}`}>
              {on && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
