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
    <div className="relative border border-white/[0.08] rounded-md bg-[#0c0c0c] pb-3 pt-3">
      <SimHeroChart calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} metric={current.id} />

      <button
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 border border-white/[0.12] flex items-center justify-center text-gray-300 hover:text-white hover:border-white/[0.3] transition-colors"
        title="Précédent"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/60 border border-white/[0.12] flex items-center justify-center text-gray-300 hover:text-white hover:border-white/[0.3] transition-colors"
        title="Suivant"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-center gap-1.5 mt-2">
        {CHARTS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#2A9D8F]" : "w-1.5 bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}