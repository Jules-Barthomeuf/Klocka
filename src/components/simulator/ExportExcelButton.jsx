import React from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function ExportExcelButton({ calculs, anneeRevente, formatCurrency }) {
  const handleExport = () => {
    const rows = calculs.tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26));
    
    // Headers
    const headers = [
      "Année",
      "Loyers bruts HT HC",
      "Vacance (mois)",
      "Coût vacance",
      "Charges copropriété",
      "Taxe foncière",
      "Loyers nets",
      "Rendement locatif net (%)",
      "Intérêts",
      "Capital remboursé",
      "Échéance annuelle",
      "Capital restant dû",
      "IRA",
      "Assurance crédit",
      "Total crédit bancaire",
      "Gestion locative",
      "Charges acquisition",
      "Travaux bailleur",
      "Comptabilité",
      "Assurance PNE",
      "Charges diverses",
      "Total charges",
      "Amortissement",
      "Bénéfice imposable",
      "Impôt IS",
      "TVA collectée",
      "TVA déductible",
      "Crédit de TVA",
      "Trésorerie TVA",
      "Cash-flow annuel",
      "Cash-flow mensuel",
      "Capital remboursé cumulé",
      "Patrimoine net",
      "Gain net cumulé"
    ];

    const dataRows = rows.map((r) => [
      `Année ${r.annee}`,
      Math.round(r.loyerBrutAnnuel),
      r.nbMoisVacance || 0,
      Math.round(r.coutVacance),
      Math.round(r.chargesCopro),
      Math.round(r.taxeFonciere),
      Math.round(r.loyersNets),
      r.rendementLocatifNet,
      Math.round(r.interetsAnnuels),
      Math.round(r.capitalRembourse),
      Math.round(r.echeanceAnnuelle),
      Math.round(r.capitalRestantDu),
      Math.round(r.ira),
      Math.round(r.assuranceCredit),
      Math.round(r.creditBancaireCashFlow),
      Math.round(r.gestionLocativeCost),
      Math.round(r.chargesAcquisitionCashFlow),
      Math.round(r.travauxBailleurCost),
      Math.round(r.comptabiliteCost),
      Math.round(r.assurancePNECost),
      Math.round(r.chargesDiversesCost),
      Math.round(r.totalCharges),
      Math.round(r.amortissement),
      Math.round(r.beneficeImposable),
      Math.round(r.impot),
      Math.round(r.tvaCollectee),
      Math.round(r.tvaDeductible),
      Math.round(r.creditTVA),
      Math.round(r.tresorerieTVACashFlow),
      Math.round(r.cashFlowAnnuel),
      Math.round(r.cashFlowMensuel),
      Math.round(r.capitalRembourseCumule),
      Math.round(r.patrimoineNet),
      Math.round(r.gainNetCumule)
    ]);

    // BOM for Excel UTF-8 compatibility
    const BOM = "\uFEFF";
    const separator = ";";
    const csvContent = BOM + [
      headers.join(separator),
      ...dataRows.map(row => row.join(separator))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simulateur_klocka_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleExport}
      className="text-white/50 hover:text-white hover:bg-white/[0.06] text-xs gap-1.5"
    >
      <Download className="w-3.5 h-3.5" />
      Excel
    </Button>
  );
}