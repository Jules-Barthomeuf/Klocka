import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function SimDataTable({ calculs, anneeRevente, formatCurrency, dureeCredit }) {
  const rows = calculs.tableauAnnuel.slice(1, 26); // An 1..25
  const years = rows.map((r) => r.annee);

  const fmtCur = (v) => formatCurrency(v || 0);
  const fmtAbs = (v) => formatCurrency(Math.abs(v || 0));
  const fmtPct = (v) => (v != null && v !== "" ? `${v}%` : "—");
  const dashZero = (v, fmt = fmtAbs) => (v ? fmt(v) : "—");

  const sections = [
    {
      title: "LOYERS",
      color: "#C6A45C",
      colorBg: "rgba(198,164,92,0.07)",
      colorBgHover: "rgba(198,164,92,0.12)",
      headerBg: "#2b2415",
      summaryKey: "loyersNets",
      rows: [
        { label: "Loyers bruts HT HC", get: (r) => fmtCur(r.loyerBrutAnnuel) },
        { label: "Vacance (mois)", get: (r) => (r.nbMoisVacance ? r.nbMoisVacance : "—") },
        { label: "Coût vacance", get: (r) => fmtAbs(r.coutVacance) },
        { label: "Charges copropriété", get: (r) => fmtAbs(r.chargesCopro) },
        { label: "Taxe foncière", get: (r) => fmtAbs(r.taxeFonciere) },
        { label: "Loyers nets", get: (r) => fmtCur(r.loyersNets) },
        { label: "Rendement locatif net", get: (r) => fmtPct(r.rendementLocatifNet) },
      ],
    },
    {
      title: "CRÉDIT BANCAIRE",
      color: "#7BA7C9",
      colorBg: "rgba(123,167,201,0.07)",
      colorBgHover: "rgba(123,167,201,0.12)",
      headerBg: "#1c2b38",
      summaryKey: "echeanceAnnuelle",
      rows: [
        { label: "Intérêts", get: (r) => fmtAbs(r.interetsAnnuels) },
        { label: "Capital remboursé", get: (r) => fmtAbs(r.capitalRembourse) },
        { label: "Échéance annuelle", get: (r) => fmtCur(r.echeanceAnnuelle) },
        { label: "Capital restant dû", get: (r) => fmtCur(r.capitalRestantDu) },
        { label: "IRA", get: (r) => dashZero(r.ira) },
        { label: "Assurance crédit", get: (r) => fmtAbs(r.assuranceCredit) },
      ],
    },
    {
      title: "CHARGES D'EXPLOITATION",
      color: "#A594C9",
      colorBg: "rgba(165,148,201,0.07)",
      colorBgHover: "rgba(165,148,201,0.12)",
      headerBg: "#262133",
      summaryFn: (r) => (r.gestionLocativeCost || 0) + (r.travauxBailleurCost || 0) + (r.comptabiliteCost || 0) + (r.assurancePNECost || 0) + (r.chargesDiversesCost || 0),
      rows: [
        { label: "Gestion locative", get: (r) => fmtAbs(r.gestionLocativeCost) },
        { label: "Charges acquisition", get: () => "—" },
        { label: "Travaux bailleur", get: (r) => dashZero(r.travauxBailleurCost) },
        { label: "Comptabilité", get: (r) => fmtAbs(r.comptabiliteCost) },
        { label: "Assurance PNE", get: (r) => fmtAbs(r.assurancePNECost) },
        { label: "Charges diverses", get: (r) => dashZero(r.chargesDiversesCost) },
      ],
    },
    {
      title: "FISCALITÉ",
      color: "#C98F8F",
      colorBg: "rgba(201,143,143,0.07)",
      colorBgHover: "rgba(201,143,143,0.12)",
      headerBg: "#33201f",
      summaryKey: "impot",
      rows: [
        { label: "Amortissement", get: (r) => fmtAbs(r.amortissement) },
        { label: "Bénéfice imposable", get: (r) => fmtCur(r.beneficeImposable) },
        { label: "Impôt IS", get: (r) => fmtAbs(r.impot) },
      ],
    },
    {
      title: "TVA",
      color: "#B8926A",
      colorBg: "rgba(184,146,106,0.07)",
      colorBgHover: "rgba(184,146,106,0.12)",
      headerBg: "#2e2419",
      summaryKey: "tresorerieTVACashFlow",
      rows: [
        { label: "TVA collectée", get: (r) => dashZero(r.tvaCollectee, fmtCur) },
        { label: "TVA déductible", get: (r) => dashZero(r.tvaDeductible, fmtCur) },
        { label: "Crédit de TVA", get: (r) => dashZero(r.creditTVA, fmtCur) },
        { label: "Trésorerie TVA", get: (r) => dashZero(r.tresorerieTVACashFlow, fmtCur) },
      ],
    },
    {
      title: "CASH-FLOW & PATRIMOINE",
      color: "#6FBFA8",
      colorBg: "rgba(111,191,168,0.07)",
      colorBgHover: "rgba(111,191,168,0.12)",
      headerBg: "#183029",
      summaryKey: "cashFlowAnnuel",
      rows: [
        { label: "Cash-flow / an", get: (r) => fmtCur(r.cashFlowAnnuel) },
        { label: "Cash-flow / mois", get: (r) => fmtCur(r.cashFlowMensuel) },
        { label: "Capital remb. cumulé", get: (r) => fmtCur(r.capitalRembourseCumule) },
      ],
    },
  ];

  const getSummary = (sec, r) => {
    if (sec.summaryFn) return sec.summaryFn(r);
    if (sec.summaryKey) return r[sec.summaryKey];
    return null;
  };

  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(sections.map((s) => [s.title, false]))
  );
  const toggle = (title) => setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div className="border border-[#1f2228] rounded-md bg-[#0f1114] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2228]">
        <p className="text-[#f2f3f5] text-sm font-medium">Tableau annuel détaillé</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#1f2228]">
              <th className="sticky left-0 z-10 bg-[#0f1114] px-3 py-2 text-left text-[9px] uppercase tracking-[0.14em] text-[#6a7180] font-medium whitespace-nowrap">Ligne</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-2 text-right text-[9px] uppercase tracking-[0.14em] text-[#6a7180] font-medium whitespace-nowrap">An {y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <React.Fragment key={sec.title}>
                <tr
                  className="cursor-pointer transition-colors"
                  style={{ backgroundColor: sec.colorBg }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = sec.colorBgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = sec.colorBg)}
                  onClick={() => toggle(sec.title)}
                >
                  <td
                    className="sticky left-0 z-10 px-3 py-2 text-[10px] uppercase tracking-[0.18em] font-semibold border-b border-[#1f2228] whitespace-nowrap"
                    style={{ backgroundColor: sec.headerBg, color: sec.color }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <ChevronDown className={`w-3 h-3 transition-transform ${openSections[sec.title] ? "" : "-rotate-90"}`} />
                      {sec.title}
                    </span>
                  </td>
                  {rows.map((r) => {
                    const sum = getSummary(sec, r);
                    const val = sum != null ? fmtCur(sum) : "";
                    const isNeg = typeof val === "string" && val.trim().startsWith("-");
                    return (
                      <td key={r.annee} className="px-2 py-2 text-right tabular-nums text-xs font-semibold whitespace-nowrap border-b border-[#1f2228]" style={{ color: isNeg ? "#E8836B" : sec.color }}>{val}</td>
                    );
                  })}
                </tr>
                {openSections[sec.title] && sec.rows.map((row, ri) => (
                  <tr key={row.label} className={`border-b border-[#f2f3f5]/[0.03] last:border-0 hover:bg-[#f2f3f5]/[0.04] transition-colors ${ri % 2 === 0 ? "bg-[#f2f3f5]/[0.02]" : "bg-transparent"}`}>
                    <td className={`sticky left-0 z-10 px-3 py-1.5 text-xs text-[#9298a6] whitespace-nowrap ${ri % 2 === 0 ? "bg-[#121212]" : "bg-[#0f1114]"}`}>{row.label}</td>
                    {rows.map((r) => {
                      const val = row.get(r);
                      const isNeg = typeof val === "string" && val.trim().startsWith("-");
                      return (
                        <td key={r.annee} className={`px-2 py-1.5 text-right tabular-nums text-xs whitespace-nowrap ${isNeg ? "text-[#E8836B]" : "text-[#f2f3f5]"}`}>{val}</td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}