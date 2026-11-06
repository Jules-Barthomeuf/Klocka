const eur = (v) => Math.round(v).toLocaleString("fr-FR") + " €";
const pct = (v) => v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";

export default function KpiGrid({ r, years }) {
  const items = [
    ["Rendement net", pct(r.netYield)],
    ["Cash-flow mensuel", eur(r.cfMonth)],
    ["Création de richesse", eur(r.wealth)],
    ["Multiple des fonds propres", r.multiple.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " x"],
    [`TRI brut sur ${years} ans`, pct(r.irr)],
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      {items.map(([l, v], i) => (
        <div key={l} className={`rounded-[22px] bg-k-card border border-white/10 p-5 ${i === 4 ? "col-span-2 xl:col-span-1" : ""}`}>
          <p className="text-[12.5px] text-k-label">{l}</p>
          <p className={`mt-2 text-[24px] tracking-[-0.03em] ${l.startsWith("Cash") && r.cfMonth < 0 ? "text-k-negtxt" : ""}`}>{v}</p>
        </div>
      ))}
    </div>
  );
}
