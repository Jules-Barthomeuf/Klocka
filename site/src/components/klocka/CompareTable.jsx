import { useEffect, useRef, useState } from "react";
import useInView from "@/hooks/useInView";
import LetterTitle from "./LetterTitle";

const TITLE = [{ text: "Quel investissement pour " }, { text: "votre retraite ?", serif: true }];
const ROWS = [
  ["Effet de levier", "Oui", "Oui", "Non", false],
  ["Rendement", "4 %", "7 %", "7 %", true],
  ["TRI", "8 %", "14 %", "7 %", true],
  ["Volatilité", "Faible", "Faible", "Élevée", false],
  ["Gestion", "Élevée", "Faible", "Inexistante", false],
];
const COL_TEXT = ["text-white", "text-white", "text-white"];

export default function CompareTable() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView) return;
    setPhase(1);
    const a = setTimeout(() => setPhase(2), 900);
    const b = setTimeout(() => setPhase(3), 2100);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [inView]);

  const commercialBg = { background: phase >= 3 ? "#2B3331" : "transparent", transition: "background 800ms var(--k-ease)" };

  return (
    <section ref={ref} className="k-wrap k-section">
      <LetterTitle parts={TITLE} show={phase >= 1} />
      <div className="mt-16 overflow-x-auto p-[2px] max-w-[820px] mx-auto">
        <div className="relative min-w-[640px]">
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
            <rect
              x="0.5" y="0.5" width="100%" height="100%" rx="22" fill="none"
              stroke="rgba(255,255,255,0.18)" pathLength="1" strokeDasharray="1"
              style={{ strokeDashoffset: phase >= 2 ? 0 : 1, transition: "stroke-dashoffset 1200ms var(--k-ease)" }}
            />
          </svg>
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] rounded-[22px] overflow-hidden [&>div]:border-white/20 [&>div]:border-l [&>div:nth-child(4n+1)]:border-l-0">
            <div />
            {["Résidentiel", "Commercial", "ETF"].map((h, i) => (
              <div key={h} className={`px-6 pt-8 pb-6 text-[18px] font-light ${COL_TEXT[i]}`} style={i === 1 ? commercialBg : undefined}>{h}</div>
            ))}
            {ROWS.map(([label, ...rest]) => {
              const big = rest[3];
              return [
                <div key={label} className="border-t px-5 py-5 text-[18px] font-light text-white flex items-center justify-center text-center">{label}</div>,
                ...rest.slice(0, 3).map((v, i) => (
                  <div
                    key={label + i}
                    className={`border-t px-6 py-5 flex items-center font-light ${big ? "text-[20px]" : "text-[15px]"} ${COL_TEXT[i]}`}
                    style={i === 1 ? commercialBg : undefined}
                  >
                    {v}
                  </div>
                )),
              ];
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
