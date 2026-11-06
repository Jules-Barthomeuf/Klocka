import { useState, useMemo, useEffect } from "react";
import SiteNav from "@/components/klocka/SiteNav";
import SiteFooter from "@/components/klocka/SiteFooter";
import ParamsPanel from "@/components/sim/ParamsPanel";
import KpiGrid from "@/components/sim/KpiGrid";
import WealthBars from "@/components/sim/WealthBars";
import YearTable from "@/components/sim/YearTable";
import { DEFAULTS, simulate } from "@/lib/simEngine";

export default function Simulateur() {
  const [p, setP] = useState(DEFAULTS);
  const r = useMemo(() => simulate(p), [p]);
  const set = (k, v) => setP((s) => ({ ...s, [k]: v }));
  useEffect(() => { document.title = "Simulateur · Klocka"; }, []);

  return (
    <div className="min-h-screen bg-black text-white font-light">
      <SiteNav />
      <main className="pt-[92px]" style={{ zoom: 0.8 / 0.95 }}>
        <div className="k-wrap" style={{ paddingBlock: "80px 140px" }}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h1 className="k-h2">Simulateur de <span className="k-serif">projet</span></h1>
            <button onClick={() => setP(DEFAULTS)} className="k-btn-secondary">Réinitialiser</button>
          </div>
          <div className="grid lg:grid-cols-[380px_1fr] gap-6 mt-12">
            <ParamsPanel p={p} set={set} cost={r.cost} />
            <div className="flex flex-col gap-6 min-w-0">
              <KpiGrid r={r} years={p.saleYear} />
              <WealthBars years={r.years} total={r.wealth} />
              <YearTable years={r.years} />
              <p className="italic text-[13px] text-k-dim">
                Cette simulation est fournie à titre indicatif et n’engage pas Klocka. Les montants reposent sur des hypothèses (droits, honoraires et frais d’acquisition, fiscalité, revente) susceptibles d’évoluer.
              </p>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
