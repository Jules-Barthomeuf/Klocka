import React from "react";
import { formatCurrency } from "./ComparateurCalcul";
import InfoTooltip from "./InfoTooltip";

const COLORS = ["text-red-800", "text-[#7fd3c9]", "text-[#e0c9a0]", "text-purple-400"];
const DOT_COLORS = ["bg-red-800", "bg-[#7fd3c9]", "bg-[#e0c9a0]", "bg-purple-400"];

export default function CompareSummaryTable({ metrics }) {
  if (!metrics.length) return null;

  const rows = [
    { label: "Prix de revient", key: "prixRevient", fmt: formatCurrency },
    { label: "Loyer annuel", key: "loyerAnnuel", fmt: formatCurrency },
    { label: "Rendement locatif global", key: "rendementLocatifGlobal", fmt: v => `${(v || 0).toFixed(2)}%` },
    { label: "Rendement locatif net", key: "rendementLocatifNet", fmt: v => `${v.toFixed(2)}%` },
    { label: "Multiple fonds propres", key: "multipleFondsPropres", fmt: v => `${(v || 0).toFixed(2)}x` },
    { label: "Apport", key: "apport", fmt: formatCurrency },
    { label: "Récupération apport", key: "anneeRecuperationApport", fmt: v => v ? `Année ${v}` : "N/A" },
    { label: "Cashflow cumulé", key: "cashFlowCumule", fmt: formatCurrency },
    { label: "Création de richesse", key: "creationRichesse", fmt: formatCurrency },
    { label: "Prix revente net", key: "prixVenteNet", fmt: formatCurrency },
    { label: "Surface", key: "surface", fmt: v => v ? `${v} m²` : "N/A" },
    { label: "Locataire", key: "nomLocataire", fmt: v => v || "N/A" },
    { label: "Ancienneté locataire", key: "ancienneteLocataire", fmt: v => v !== null ? `${v} an${v > 1 ? "s" : ""}` : "N/A" },
    { label: "Échéance bail", key: "echeanceBail", fmt: v => v ? new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "N/A" },
  ];

  return (
    <div className="bg-[#0a0c0c] rounded-md border border-[#242726] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#242726]">
              <th className="text-left text-[#edeae5]/30 text-xs uppercase tracking-wider py-3 px-4 min-w-[160px]">Indicateur</th>
              {metrics.map((m, i) => (
                <th key={i} className="text-left py-3 px-4 min-w-[140px]">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${DOT_COLORS[i]}`} />
                    <span className={`text-xs font-medium ${COLORS[i]} truncate max-w-[120px]`}>{m.titre}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={row.key} className={rowIdx % 2 === 0 ? "bg-[#edeae5]/[0.01]" : ""}>
                <td className="py-3 px-4 text-[#edeae5]/40 text-xs">{row.label}</td>
                {metrics.map((m, i) => {
                  const val = m[row.key];
                  return (
                    <td key={i} className="py-3 px-4 text-[#edeae5] text-xs font-medium">
                      {row.fmt(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}