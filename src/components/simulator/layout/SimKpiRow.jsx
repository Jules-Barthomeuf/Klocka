import React from "react";
import ChiffreDoux from "@/components/ui/ChiffreDoux";

// Les chiffres glissent vers leur valeur (19 oct. 2026, Jules) : `valeur` est un nombre, `format` le met en forme ;
// un survol éclaire doucement la tuile.
function Kpi({ label, valeur, format, accent = "text-encre" }) {
  return (
    <div className="px-4 py-3 min-w-0 border-trait transition-colors duration-300 hover:bg-encre/[0.03]">
      <p className="text-[11px] uppercase tracking-[0.12em] font-medium leading-snug text-ardoise">{label}</p>
      <p className={`text-lg font-medium tabular-nums mt-1 ${accent} whitespace-nowrap`}><ChiffreDoux valeur={valeur} format={format} /></p>
    </div>);

}

export default function SimKpiRow({ calculs, anneeRevente, formatCurrency }) {
  const ind = calculs.indicateurs;
  const cards = [
  { label: "Rendement net", valeur: Number(ind.rendementLocatifGlobalNet), format: (n) => `${n.toFixed(1)}%` },
  { label: "Cash-flow / mois", valeur: Number(ind.cashFlowMoyenMois), format: formatCurrency },
  { label: "Création de richesse", valeur: Number(ind.creationRichesseBrute), format: formatCurrency },
  { label: "Multiple fonds propres", valeur: Number(ind.multipleNetFondsPropres), format: (n) => `${n.toFixed(2)}×` },
  { label: `TRI brut sur ${anneeRevente} ans`, valeur: Number(ind.triBrut), format: (n) => `${n.toFixed(2)}%` }];

  return (
    <div className="border border-trait rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-trait flex items-center justify-between">
        <p className="text-encre text-sm font-medium">Indicateurs clés</p>
        <p className="text-[11px] text-ardoise">sur {anneeRevente} ans</p>
      </div>
      {/* Deux colonnes sur téléphone, trois sur tablette, cinq au bureau :
          des tuiles tronquées (« REND… 22… ») ne disent plus rien. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>div]:border-t [&>div]:border-l [&>div:nth-child(-n+2)]:border-t-0 sm:[&>div:nth-child(-n+3)]:border-t-0 lg:[&>div]:border-t-0 [&>div:nth-child(2n+1)]:border-l-0 sm:[&>div:nth-child(2n+1)]:border-l sm:[&>div:nth-child(3n+1)]:border-l-0 lg:[&>div:nth-child(3n+1)]:border-l lg:[&>div:first-child]:border-l-0">
        {cards.map((c, i) =>
        <Kpi key={i} label={c.label} valeur={c.valeur} format={c.format} accent={c.accent} />
        )}
      </div>
    </div>);

}