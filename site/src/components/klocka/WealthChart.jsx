import { useState } from "react";
import { eur } from "@/lib/format";

const H = 300;

export default function WealthChart({ cap, cf, yMin, yMax, step, grown, staggered }) {
  const [hover, setHover] = useState(null);
  const range = yMax - yMin;
  const zeroY = (yMax / range) * H;
  const ticks = [];
  for (let v = yMin; v <= yMax + 1e-6; v += step) ticks.push(v);
  const yOf = (v) => ((yMax - v) / range) * H;

  const barStyle = (v, i, color) => ({
    ...(v >= 0 ? { bottom: H - zeroY } : { top: zeroY }),
    height: grown ? (Math.abs(v) / range) * H : 0,
    background: v < 0 ? "#A8564E" : color,
    transition: `height 800ms var(--k-ease) ${staggered ? i * 45 : 0}ms, top 500ms var(--k-ease), bottom 500ms var(--k-ease)`,
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="flex">
          <div className="relative w-10 shrink-0" style={{ height: H }}>
            {ticks.map((t) => (
              <span key={t} className="absolute right-3 -translate-y-1/2 text-[11px] text-k-dim" style={{ top: yOf(t) }}>
                {Math.round(t / 1000)}
              </span>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: H }}>
            {ticks.filter((t) => t !== 0).map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-dashed border-white/[0.07]" style={{ top: yOf(t) }} />
            ))}
            <div className="absolute inset-x-0 border-t border-white/25" style={{ top: zeroY, transition: "top 500ms var(--k-ease)" }} />
            <div className="absolute inset-0 flex">
              {cap.map((c, i) => (
                <div
                  key={i}
                  className={`relative flex-1 transition-colors ${hover === i ? "bg-white/[0.03]" : ""}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[16px]">
                    <div className="absolute left-0 w-[6px] rounded-[2px]" style={barStyle(c, i, "#7EDDD0")} />
                    <div className="absolute right-0 w-[6px] rounded-[2px]" style={barStyle(cf[i], i, "#1F7A70")} />
                  </div>
                  {hover === i && (
                    <div className={`absolute top-6 z-10 whitespace-nowrap rounded-xl bg-k-card border border-white/10 px-4 py-3 text-[13px] pointer-events-none ${i < cap.length / 2 ? "left-full ml-1" : "right-full mr-1"}`}>
                      <p className="text-white mb-1">Année {i + 1}</p>
                      <p className="text-k-cap">Capital remboursé : {eur(c)}</p>
                      <p className="text-k-cftxt">Cash-flow annuel : {eur(cf[i])}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex mt-3">
          <span className="w-10 shrink-0 text-[11px] text-k-dim">k€</span>
          {cap.map((_, i) => <span key={i} className="flex-1 text-center text-[11px] text-k-dim">{i + 1}</span>)}
        </div>
        <p className="mt-3 text-center text-[12px] text-k-dim">Année</p>
      </div>
    </div>
  );
}
