import React from "react";

function Kpi({ label, value, accent = "text-[#f2f3f5]" }) {
  return (
    <div className="px-4 py-3 min-w-0 border-[#1f2228]">
      <p className="text-[9px] uppercase tracking-[0.12em] font-medium leading-snug text-[hsl(var(--primary-foreground))]">{label}</p>
      <p className={`text-lg font-medium tabular-nums mt-1 ${accent} whitespace-nowrap`}>{value}</p>
    </div>);

}

export default function SimKpiRow({ calculs, anneeRevente, formatCurrency }) {
  const ind = calculs.indicateurs;
  const cards = [
  { label: "Rendement net", value: `${ind.rendementLocatifGlobalNet}%` },
  { label: "Cash-flow / mois", value: formatCurrency(ind.cashFlowMoyenMois) },
  { label: "Création de richesse", value: formatCurrency(ind.creationRichesseBrute) },
  { label: "Multiple fonds propres", value: `${ind.multipleNetFondsPropres}×` },
  { label: `TRI brut sur ${anneeRevente} ans`, value: `${ind.triBrut}%` }];

  return (
    <div className="border border-[#1f2228] rounded-md bg-[#0f1114] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2228] flex items-center justify-between">
        <p className="text-[#f2f3f5] text-sm font-medium">Indicateurs clés</p>
        <p className="text-[11px] text-[#9298a6]">sur {anneeRevente} ans</p>
      </div>
      {/* Deux colonnes sur téléphone, trois sur tablette, cinq au bureau :
          des tuiles tronquées (« REND… 22… ») ne disent plus rien. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>div]:border-t [&>div]:border-l [&>div:nth-child(-n+2)]:border-t-0 sm:[&>div:nth-child(-n+3)]:border-t-0 lg:[&>div]:border-t-0 [&>div:nth-child(2n+1)]:border-l-0 sm:[&>div:nth-child(2n+1)]:border-l sm:[&>div:nth-child(3n+1)]:border-l-0 lg:[&>div:nth-child(3n+1)]:border-l lg:[&>div:first-child]:border-l-0">
        {cards.map((c, i) =>
        <Kpi key={i} label={c.label} value={c.value} accent={c.accent} />
        )}
      </div>
    </div>);

}