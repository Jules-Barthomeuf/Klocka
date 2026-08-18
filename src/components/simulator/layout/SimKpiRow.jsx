import React from "react";

function Kpi({ label, value, accent = "text-[#edeae5]" }) {
  return (
    <div className="flex-1 px-4 py-3 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.16em] font-medium truncate text-[hsl(var(--primary-foreground))]">{label}</p>
      <p className={`text-lg font-medium tabular-nums mt-1 ${accent} truncate`}>{value}</p>
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
    <div className="border border-[#282b2a] rounded-md bg-[#0e100f] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#242726] flex items-center justify-between">
        <p className="text-[#edeae5] text-sm font-medium">Indicateurs clés</p>
        <p className="text-[11px] text-[#8b9391]">sur {anneeRevente} ans</p>
      </div>
      <div className="flex divide-x divide-[#242726]">
        {cards.map((c, i) =>
        <Kpi key={i} label={c.label} value={c.value} accent={c.accent} />
        )}
      </div>
    </div>);

}