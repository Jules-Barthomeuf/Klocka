import React from "react";
import { formatCurrency } from "./ComparateurCalcul";
import InfoTooltip from "./InfoTooltip";

const COLORS = ["text-red-800", "text-emerald-400", "text-yellow-500", "text-purple-400"];
const DOT_COLORS = ["bg-red-800", "bg-emerald-400", "bg-yellow-500", "bg-purple-400"];

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
    <div className="bg-[#0a0f0e] rounded-md border border-[#16201f] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#16201f]">
              <th className="text-left text-white/30 text-xs uppercase tracking-wider py-3 px-4 min-w-[160px]">Indicateur</th>
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
              <tr key={row.key} className={rowIdx % 2 === 0 ? "bg-white/[0.01]" : ""}>
                <td className="py-3 px-4 text-white/40 text-xs">{row.label}</td>
                {metrics.map((m, i) => {
                  const val = m[row.key];
                  return (
                    <td key={i} className="py-3 px-4 text-white text-xs font-medium">
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