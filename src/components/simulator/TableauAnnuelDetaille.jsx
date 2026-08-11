import React, { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

const SECTIONS = [
  {
    key: "loyers",
    label: "LOYERS",
    color: "from-blue-500/20 to-blue-600/10",
    headerBg: "bg-blue-500/10",
    stickyBg: "bg-blue-950/60",
    accent: "text-blue-400",
    border: "border-blue-500/30",
  },
  {
    key: "credit",
    label: "CRÉDIT BANCAIRE",
    color: "from-purple-500/20 to-purple-600/10",
    headerBg: "bg-purple-500/10",
    stickyBg: "bg-purple-950/60",
    accent: "text-purple-400",
    border: "border-purple-500/30",
  },
  {
    key: "charges_exploitation",
    label: "CHARGES D'EXPLOITATION",
    color: "from-amber-500/20 to-amber-600/10",
    headerBg: "bg-amber-500/10",
    stickyBg: "bg-amber-950/60",
    accent: "text-amber-400",
    border: "border-amber-500/30",
  },
  {
    key: "fiscalite",
    label: "FISCALITÉ",
    color: "from-red-500/20 to-red-600/10",
    headerBg: "bg-red-500/10",
    stickyBg: "bg-red-950/60",
    accent: "text-red-400",
    border: "border-red-500/30",
  },
  {
    key: "tva",
    label: "TVA",
    color: "from-indigo-500/20 to-indigo-600/10",
    headerBg: "bg-indigo-500/10",
    stickyBg: "bg-indigo-950/60",
    accent: "text-indigo-400",
    border: "border-indigo-500/30",
  },
  {
    key: "cashflow",
    label: "CASH-FLOW & PATRIMOINE",
    color: "from-teal-500/20 to-teal-600/10",
    headerBg: "bg-teal-500/10",
    stickyBg: "bg-teal-950/60",
    accent: "text-teal-400",
    border: "border-teal-500/30",
  },
];

function Cell({ value, className = "", isAfterRevente = false }) {
  return (
    <td
      className={`px-2 py-2 text-center text-[11px] font-montserrat tabular-nums whitespace-nowrap ${className} ${
        isAfterRevente ? "opacity-40" : ""
      }`}
    >
      {value}
    </td>
  );
}

function LabelCell({ children, className = "", stickyBg = "bg-[#0d0d0d]" }) {
  return (
    <td
      className={`sticky left-0 z-10 px-3 py-2 text-[11px] text-white/70 border-r border-white/[0.06] min-w-[180px] max-w-[200px] ${stickyBg} ${className}`}
    >
      {children}
    </td>
  );
}

function SectionHeader({ section, isExpanded, onToggle, colCount }) {
  return (
    <tr
      className={`cursor-pointer group transition-colors hover:brightness-110 ${section.headerBg}`}
      onClick={onToggle}
    >
      <td
        className={`sticky left-0 z-10 px-3 py-2.5 border-r border-white/[0.06] min-w-[180px] ${section.stickyBg}`}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-white/50 transition-transform" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-white/50 transition-transform" />
          )}
          <span className={`text-[11px] font-semibold tracking-wider ${section.accent}`}>
            {section.label}
          </span>
        </div>
      </td>
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-2 py-2.5" />
      ))}
    </tr>
  );
}

export default function TableauAnnuelDetaille({
  calculs,
  anneeRevente,
  formatCurrency,
}) {
  const [expanded, setExpanded] = useState({
    loyers: false,
    credit: false,
    charges_exploitation: false,
    fiscalite: false,
    tva: false,
    cashflow: false,
  });

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const rows = calculs.tableauAnnuel.slice(1, 26);
  const colCount = rows.length;

  const isAfter = (row) => row.annee > anneeRevente;

  const renderDataRow = (label, getValue, colorFn, stickyBg) => (
    <tr className="hover:bg-white/[0.02] transition-colors">
      <LabelCell stickyBg={stickyBg}>{label}</LabelCell>
      {rows.map((row) => {
        const val = getValue(row);
        return (
          <Cell
            key={row.annee}
            value={val}
            className={colorFn ? colorFn(row) : "text-white/60"}
            isAfterRevente={isAfter(row)}
          />
        );
      })}
    </tr>
  );

  const renderTotalRow = (getValue, colorFn, stickyBg) => (
    <tr className="bg-white/[0.02]">
      <LabelCell className="font-medium text-white/90" stickyBg={stickyBg}>
        Total
      </LabelCell>
      {rows.map((row) => (
        <Cell
          key={row.annee}
          value={getValue(row)}
          className={`font-medium ${colorFn ? colorFn(row) : "text-white"}`}
          isAfterRevente={isAfter(row)}
        />
      ))}
    </tr>
  );

  const sectionConfig = SECTIONS.reduce((acc, s) => {
    acc[s.key] = s;
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0a0a0a]">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-[#111]">
            <th className="sticky left-0 z-30 bg-[#111] px-3 py-3 text-left text-[10px] uppercase tracking-widest text-white/30 border-r border-white/[0.06] border-b border-white/[0.06] min-w-[180px]">
              Ligne
            </th>
            {rows.map((row) => (
              <th
                key={row.annee}
                className={`px-2 py-3 text-center text-[10px] uppercase tracking-wider border-b border-white/[0.06] min-w-[80px] ${
                  isAfter(row)
                    ? "text-white/20"
                    : row.annee === anneeRevente
                    ? "text-[#2A9D8F] font-bold"
                    : "text-white/50"
                }`}
              >
                An {row.annee}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* === LOYERS === */}
          <SectionHeader
            section={sectionConfig.loyers}
            isExpanded={expanded.loyers}
            onToggle={() => toggle("loyers")}
            colCount={colCount}
          />
          {!expanded.loyers &&
            renderTotalRow(
              (r) => formatCurrency(r.loyersNets),
              (r) => (r.loyersNets >= 0 ? "text-blue-400" : "text-red-400"),
              "bg-[#0d0d0d]"
            )}
          {expanded.loyers && (
            <>
              {renderDataRow(
                "Loyers bruts HT HC",
                (r) => formatCurrency(r.loyerBrutAnnuel),
                () => "text-white/80",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Vacance (mois)",
                (r) => (r.nbMoisVacance > 0 ? r.nbMoisVacance : "-"),
                (r) => (r.nbMoisVacance > 0 ? "text-orange-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Coût vacance",
                (r) => formatCurrency(Math.abs(r.coutVacance)),
                (r) => (r.coutVacance < 0 ? "text-red-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Charges copropriété",
                (r) => formatCurrency(Math.abs(r.chargesCopro)),
                (r) => (r.chargesCopro < 0 ? "text-red-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Taxe foncière",
                (r) => formatCurrency(Math.abs(r.taxeFonciere)),
                (r) => (r.taxeFonciere < 0 ? "text-red-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              <tr className="bg-blue-500/[0.06]">
                <LabelCell className="font-semibold text-blue-400" stickyBg="bg-blue-950/40">
                  Loyers nets
                </LabelCell>
                {rows.map((r) => (
                  <Cell
                    key={r.annee}
                    value={formatCurrency(r.loyersNets)}
                    className="font-semibold text-blue-400"
                    isAfterRevente={isAfter(r)}
                  />
                ))}
              </tr>
              {renderDataRow(
                "Rendement locatif net",
                (r) => `${r.rendementLocatifNet}%`,
                () => "text-white/40",
                "bg-[#0d0d0d]"
              )}
            </>
          )}

          {/* === CRÉDIT BANCAIRE === */}
          <SectionHeader
            section={sectionConfig.credit}
            isExpanded={expanded.credit}
            onToggle={() => toggle("credit")}
            colCount={colCount}
          />
          {!expanded.credit &&
            renderTotalRow(
              (r) => formatCurrency(r.creditBancaireCashFlow),
              () => "text-purple-400",
              "bg-[#0d0d0d]"
            )}
          {expanded.credit && (
            <>
              {renderDataRow(
                "Intérêts",
                (r) => formatCurrency(Math.abs(r.interetsAnnuels)),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Capital remboursé",
                (r) => formatCurrency(Math.abs(r.capitalRembourse)),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Échéance annuelle",
                (r) => formatCurrency(r.echeanceAnnuelle),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Capital restant dû",
                (r) => formatCurrency(r.capitalRestantDu),
                () => "text-white/40",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "IRA",
                (r) => (r.ira < 0 ? formatCurrency(Math.abs(r.ira)) : "-"),
                (r) => (r.ira < 0 ? "text-red-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Assurance crédit",
                (r) => formatCurrency(Math.abs(r.assuranceCredit)),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
            </>
          )}

          {/* === CHARGES D'EXPLOITATION === */}
          <SectionHeader
            section={sectionConfig.charges_exploitation}
            isExpanded={expanded.charges_exploitation}
            onToggle={() => toggle("charges_exploitation")}
            colCount={colCount}
          />
          {!expanded.charges_exploitation &&
            renderTotalRow(
              (r) => formatCurrency(Math.abs(r.totalCharges)),
              () => "text-amber-400",
              "bg-[#0d0d0d]"
            )}
          {expanded.charges_exploitation && (
            <>
              {renderDataRow(
                "Gestion locative",
                (r) => formatCurrency(Math.abs(r.gestionLocativeCost)),
                (r) => (r.gestionLocativeCost < 0 ? "text-amber-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Charges acquisition",
                (r) =>
                  r.chargesAcquisitionCashFlow < 0
                    ? formatCurrency(Math.abs(r.chargesAcquisitionCashFlow))
                    : "-",
                (r) =>
                  r.chargesAcquisitionCashFlow < 0 ? "text-amber-400" : "text-white/30",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Travaux bailleur",
                (r) =>
                  r.travauxBailleurCost < 0
                    ? formatCurrency(Math.abs(r.travauxBailleurCost))
                    : "-",
                (r) => (r.travauxBailleurCost < 0 ? "text-amber-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Comptabilité",
                (r) => formatCurrency(Math.abs(r.comptabiliteCost)),
                () => "text-amber-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Assurance PNE",
                (r) => formatCurrency(Math.abs(r.assurancePNECost)),
                () => "text-amber-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Charges diverses",
                (r) =>
                  r.chargesDiversesCost < 0
                    ? formatCurrency(Math.abs(r.chargesDiversesCost))
                    : "-",
                (r) => (r.chargesDiversesCost < 0 ? "text-amber-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
            </>
          )}

          {/* === FISCALITÉ === */}
          <SectionHeader
            section={sectionConfig.fiscalite}
            isExpanded={expanded.fiscalite}
            onToggle={() => toggle("fiscalite")}
            colCount={colCount}
          />
          {!expanded.fiscalite &&
            renderTotalRow(
              (r) => formatCurrency(Math.abs(r.impot)),
              () => "text-red-400",
              "bg-[#0d0d0d]"
            )}
          {expanded.fiscalite && (
            <>
              {renderDataRow(
                "Amortissement",
                (r) => formatCurrency(Math.abs(r.amortissement)),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Bénéfice imposable",
                (r) => formatCurrency(r.beneficeImposable),
                (r) =>
                  r.beneficeImposable > 0 ? "text-green-400" : "text-red-400",
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Impôt IS",
                (r) => formatCurrency(Math.abs(r.impot)),
                () => "text-red-400",
                "bg-[#0d0d0d]"
              )}
            </>
          )}

          {/* === TVA === */}
          <SectionHeader
            section={sectionConfig.tva}
            isExpanded={expanded.tva}
            onToggle={() => toggle("tva")}
            colCount={colCount}
          />
          {!expanded.tva &&
            renderTotalRow(
              (r) =>
                r.tresorerieTVACashFlow !== 0
                  ? formatCurrency(r.tresorerieTVACashFlow)
                  : "-",
              (r) =>
                r.tresorerieTVACashFlow > 0
                  ? "text-green-400"
                  : r.tresorerieTVACashFlow < 0
                  ? "text-red-400"
                  : "text-white/30",
              "bg-[#0d0d0d]"
            )}
          {expanded.tva && (
            <>
              {renderDataRow(
                "TVA collectée",
                (r) => (r.tvaCollectee > 0 ? formatCurrency(r.tvaCollectee) : "-"),
                (r) => (r.tvaCollectee > 0 ? "text-green-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "TVA déductible",
                (r) => (r.tvaDeductible > 0 ? formatCurrency(r.tvaDeductible) : "-"),
                (r) => (r.tvaDeductible > 0 ? "text-green-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Crédit de TVA",
                (r) => (r.creditTVA !== 0 ? formatCurrency(r.creditTVA) : "-"),
                (r) => (r.creditTVA > 0 ? "text-green-400" : "text-white/30"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Trésorerie TVA",
                (r) =>
                  r.tresorerieTVACashFlow !== 0
                    ? formatCurrency(r.tresorerieTVACashFlow)
                    : "-",
                (r) =>
                  r.tresorerieTVACashFlow > 0
                    ? "text-green-400"
                    : r.tresorerieTVACashFlow < 0
                    ? "text-red-400"
                    : "text-white/30",
                "bg-[#0d0d0d]"
              )}
            </>
          )}

          {/* === CASH-FLOW & PATRIMOINE === */}
          <SectionHeader
            section={sectionConfig.cashflow}
            isExpanded={expanded.cashflow}
            onToggle={() => toggle("cashflow")}
            colCount={colCount}
          />
          <tr className="bg-teal-500/[0.08]">
            <LabelCell className="font-bold text-teal-400" stickyBg="bg-teal-950/50">
              Cash-flow / an
            </LabelCell>
            {rows.map((r) => (
              <Cell
                key={r.annee}
                value={formatCurrency(r.cashFlowAnnuel)}
                className={`font-bold ${
                  r.cashFlowAnnuel >= 0 ? "text-teal-400" : "text-red-400"
                }`}
                isAfterRevente={isAfter(r)}
              />
            ))}
          </tr>
          {expanded.cashflow && (
            <>
              {renderDataRow(
                "Cash-flow / mois",
                (r) => formatCurrency(r.cashFlowMensuel),
                (r) => (r.cashFlowMensuel >= 0 ? "text-teal-400" : "text-red-400"),
                "bg-[#0d0d0d]"
              )}
              {renderDataRow(
                "Capital remb. cumulé",
                (r) => formatCurrency(r.capitalRembourseCumule),
                () => "text-white/40",
                "bg-[#0d0d0d]"
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}