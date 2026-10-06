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
    <div className="relative border border-trait rounded-md pb-3 pt-3">
      <SimHeroChart calculs={calculs} anneeRevente={anneeRevente} formatCurrency={formatCurrency} metric={current.id} />

      <button
        onClick={() => go(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 max-md:w-9 max-md:h-9 max-md:top-auto max-md:bottom-3 max-md:translate-y-0 rounded-full bg-fond/60 border border-bord flex items-center justify-center text-craie hover:text-encre hover:border-encre/[0.3] transition-colors"
        aria-label="Précédent" title="Précédent"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => go(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 max-md:w-9 max-md:h-9 max-md:top-auto max-md:bottom-3 max-md:translate-y-0 rounded-full bg-fond/60 border border-bord flex items-center justify-center text-craie hover:text-encre hover:border-encre/[0.3] transition-colors"
        aria-label="Suivant" title="Suivant"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-center gap-1.5 mt-2 max-md:h-9">
        {CHARTS.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setIndex(i)}
            aria-label={c.title}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-menthe" : "w-1.5 bg-encre/20"}`}
          />
        ))}
      </div>
    </div>
  );
}