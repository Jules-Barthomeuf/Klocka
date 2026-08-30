import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SimHeroChart from "./SimHeroChart";

const CHARTS = [
  { id: "richesse", type: "hero", title: "Création de richesse" },
  { id: "patrimoine", type: "hero", title: "Patrimoine net" },
];

export default function SimChartCarousel({ calculs, anneeRevente, formatCurrency }) {
  const [index, setIndex] = useState(0);
  const current = CHARTS[index];

  const go = (dir) => setIndex((i) => (i + dir + CHARTS.length) % CHARTS.length);

  return (
    <div className="relative border border-[#1f2228] rounded-md bg-[#0f1114] pb-3 pt-3">
      <SimHeroChart calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} metric={current.id} />

      <button
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#000000]/60 border border-[#22262d] flex items-center justify-center text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#f2f3f5]/[0.3] transition-colors"
        title="Précédent"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-[#000000]/60 border border-[#22262d] flex items-center justify-center text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#f2f3f5]/[0.3] transition-colors"
        title="Suivant"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-center gap-1.5 mt-2">
        {CHARTS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#96c0b8]" : "w-1.5 bg-[#f2f3f5]/20"}`}
          />
        ))}
      </div>
    </div>
  );
}