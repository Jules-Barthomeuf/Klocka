import { useEffect, useRef, useState } from "react";
import useInView from "@/hooks/useInView";
import { eur } from "@/lib/format";
import { CAP, SIM } from "./simData";
import SimOptions from "./SimOptions";
import WealthChart from "./WealthChart";
import AnnualTable from "./AnnualTable";
import Btn from "./Btn";

export const DISCLAIMER = "Cet outil est utilisé dans une démarche de projection financière, il ne pourra être reproché à Klocka du non respect de ces projections en cas d'acquisition et d'exploitation.";

export default function MiniSimulator() {
  const [apport, setApport] = useState(50000);
  const [type, setType] = useState("commercial");
  const chartRef = useRef(null);
  const grown = useInView(chartRef, { threshold: 0, rootMargin: "0px 0px -25% 0px" });
  const [staggered, setStaggered] = useState(true);

  useEffect(() => {
    if (!grown) return;
    const t = setTimeout(() => setStaggered(false), 800 + 25 * 45);
    return () => clearTimeout(t);
  }, [grown]);

  const d = SIM[type][apport];
  const cap = CAP[apport];

  return (
    <section className="k-wrap k-section">
      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="rounded-[22px] bg-k-card2 border border-white/[0.08] p-7 self-stretch">
          <p className="k-label !text-[11.5px]">Total sur 25 ans</p>
          <p className="mt-3 text-k-sage font-light tracking-[-0.02em] pb-6 border-b border-white/[0.08]" style={{ fontSize: "clamp(34px, 3.4vw, 46px)" }}>
            {eur(d.total)}
          </p>
          <SimOptions title="Apport" value={apport} onChange={setApport} options={[[50000, "50 000 €"], [100000, "100 000 €"], [150000, "150 000 €"]]} />
          <SimOptions title="Type" value={type} onChange={setType} options={[["commercial", "Commercial"], ["residentiel", "Résidentiel"]]} />
        </div>

        <div className="rounded-[22px] bg-k-card2 border border-white/[0.08] p-6 md:p-8 min-w-0">
          <h3 className="text-[24px] text-white font-light">Création de richesse annuelle</h3>
          <p className="mt-2 text-[14px] text-k-t3">Barres : cash-flow et capital remboursé, année par année. Le total ajoute la revente en l'an 25, apport déduit.</p>
          <div className="mt-6 mb-4 flex justify-end gap-6 text-[13px] text-k-t2">
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-k-cap" />Capital remboursé</span>
            <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-k-cf" />Cash-flow annuel</span>
          </div>
          <div ref={chartRef}>
            <WealthChart cap={cap} cf={d.cf} yMin={d.axis[0]} yMax={d.axis[1]} step={d.axis[2]} grown={grown} staggered={staggered} />
          </div>
          <p className="mt-6 text-[13px] text-k-t3">La création de richesse correspond au cash-flow cumulé + le prix de la revente, en retirant l'apport initial.</p>
          <div className="mt-8"><AnnualTable cap={cap} cf={d.cf} /></div>
          <p className="mt-6 text-[13px] text-k-dim leading-relaxed">{DISCLAIMER}</p>
        </div>
      </div>
      <div className="mt-16 text-center"><Btn>Investir avec Klocka →</Btn></div>
    </section>
  );
}
