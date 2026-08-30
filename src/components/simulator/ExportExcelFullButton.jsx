import React from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function ExportExcelFullButton({ params, calculs, anneeRevente, formatCurrency }) {
  const handleExport = () => {
    const rows = calculs.tableauAnnuel.slice(1, Math.min(anneeRevente + 6, 26));
    const BOM = "\uFEFF";
    const sep = ";";
    const lines = [];

    // Section 1: Paramètres
    lines.push("=== PARAMÈTRES D'ACQUISITION ===");
    lines.push(`Prix du bien FAI${sep}${params.prixBienFAI} €`);
    lines.push(`Prix négocié FAI${sep}${params.prixBienNegocie} €`);
    lines.push(`Surface${sep}${params.surface} m²`);
    lines.push(`Droits d'enregistrement${sep}${params.tauxDroitsEnregistrement}%`);
    lines.push(`Fees Klocka${sep}${params.tauxFeesKlocka}${params.feesKlockaType === "fixe" ? " €" : "%"}`);
    lines.push(`Incentive Klocka${sep}${params.tauxIncentiveKlocka}%`);
    lines.push("");

    lines.push("=== PARAMÈTRES DE LOCATION ===");
    lines.push(`Loyer annuel initial HC HT${sep}${params.loyerInitialHTHC} €`);
    lines.push(`Indexation annuelle${sep}${params.indexation}%`);
    lines.push(`TVA sur loyer${sep}${params.loyerSoumisTVA ? "Oui" : "Non"}`);
    lines.push(`Charges copropriété${sep}${params.chargesCopropriete} €`);
    lines.push(`Charges refacturables${sep}${params.chargesCoproRefacturables ? "Oui" : "Non"}`);
    lines.push(`Taxe foncière${sep}${params.taxeFonciere} €`);
    lines.push(`Taxe refacturable${sep}${params.taxeFonciereRefacturable ? "Oui" : "Non"}`);
    lines.push("");

    lines.push("=== PARAMÈTRES DE FINANCEMENT ===");
    lines.push(`Apport${sep}${params.apport} €`);
    lines.push(`Durée du crédit${sep}${params.dureeCredit} ans`);
    lines.push(`Taux d'intérêt${sep}${params.tauxInteret}%`);
    lines.push(`Taux assurance crédit${sep}${params.tauxAssuranceCredit}%`);
    lines.push("");

    lines.push("=== CHARGES DIVERSES ===");
    lines.push(`Frais création société${sep}${params.coutCreationSociete} €`);
    lines.push(`Frais dossier bancaire${sep}${params.fraisDossierBancaire} €`);
    lines.push(`Frais courtage${sep}${params.fraisCourtage} €`);
    lines.push(`Comptabilité${sep}${params.comptabilite} €`);
    lines.push(`Assurance PNE${sep}${params.assurancePNE} €`);
    lines.push(`Gestion locative${sep}${params.gestionLocative}%`);
    lines.push(`Charges diverses${sep}${params.chargesDiverses} €`);
    lines.push("");

    lines.push("=== PARAMÈTRES DE REVENTE ===");
    lines.push(`Année de revente${sep}${params.anneeRevente} ans`);
    lines.push(`Commission agent revente${sep}${params.tauxCommissionAgentRevente}%`);
    lines.push(`Rendement brut acquéreur${sep}${params.rendementBrutAcheteur}%`);
    lines.push("");

    // Section 2: Budget & Indicateurs
    lines.push("=== BUDGET ===");
    lines.push(`Prix hors droits${sep}${calculs.prixHorsDroits} €`);
    lines.push(`Droits d'enregistrement${sep}${calculs.droitsEnregistrement} €`);
    lines.push(`Frais Klocka${sep}${calculs.totalFraisKlocka} €`);
    lines.push(`Frais divers${sep}${calculs.fraisDivers} €`);
    lines.push(`Prix de revient${sep}${calculs.prixRevient} €`);
    lines.push(`Montant emprunt${sep}${calculs.montantEmprunt} €`);
    lines.push(`Apport (${calculs.pourcentageApport}%)${sep}${params.apport} €`);
    lines.push(`Échéance mensuelle${sep}${calculs.echeanceMensuelle} €`);
    lines.push("");

    lines.push("=== INDICATEURS DE PERFORMANCE ===");
    lines.push(`Rendement locatif global net${sep}${calculs.indicateurs.rendementLocatifGlobalNet}%`);
    lines.push(`Rendement en capital${sep}${calculs.indicateurs.rendementEnCapital}%`);
    lines.push(`TRI brut${sep}${calculs.indicateurs.triBrut}%`);
    lines.push(`Multiple fonds propres${sep}${calculs.indicateurs.multipleNetFondsPropres}x`);
    lines.push(`Cash-flow cumulé${sep}${calculs.indicateurs.cashFlowCumule} €`);
    lines.push(`Cash-flow moyen/an${sep}${calculs.indicateurs.cashFlowMoyenAn} €`);
    lines.push(`Cash-flow moyen/mois${sep}${calculs.indicateurs.cashFlowMoyenMois} €`);
    lines.push(`Création de richesse brute${sep}${calculs.indicateurs.creationRichesseBrute} €`);
    lines.push(`Marge brute revente${sep}${calculs.indicateurs.margeBruteRevente} €`);
    lines.push(`Année récupération apport${sep}${calculs.indicateurs.anneeRecuperationApport || "N/A"}`);
    lines.push("");

    lines.push("=== SYNTHÈSE REVENTE ===");
    lines.push(`Prix vente FAI${sep}${calculs.revente.prixVenteFAI} €`);
    lines.push(`Commission agent revente${sep}${calculs.revente.commissionAgentRevente} €`);
    lines.push(`Prix vente net${sep}${calculs.revente.prixVenteNet} €`);
    lines.push(`Valeur nette comptable${sep}${calculs.revente.valeurNetComptable} €`);
    lines.push("");

    // Section 3: Tableau annuel détaillé
    lines.push("=== TABLEAU ANNUEL DÉTAILLÉ ===");
    const headers = [
      "Année", "Loyers bruts HT HC", "Vacance (mois)", "Coût vacance",
      "Charges copropriété", "Taxe foncière", "Loyers nets", "Rendement locatif net (%)",
      "Intérêts", "Capital remboursé", "Échéance annuelle", "Capital restant dû",
      "IRA", "Assurance crédit", "Total crédit bancaire",
      "Gestion locative", "Charges acquisition", "Travaux bailleur",
      "Comptabilité", "Assurance PNE", "Charges diverses", "Total charges",
      "Amortissement", "Bénéfice imposable", "Impôt IS",
      "TVA collectée", "TVA déductible", "Crédit de TVA", "Trésorerie TVA",
      "Cash-flow annuel", "Cash-flow mensuel", "Capital remboursé cumulé",
      "Patrimoine net", "Gain net cumulé"
    ];
    lines.push(headers.join(sep));

    rows.forEach((r) => {
      lines.push([
        `Année ${r.annee}`, Math.round(r.loyerBrutAnnuel), r.nbMoisVacance || 0,
        Math.round(r.coutVacance), Math.round(r.chargesCopro), Math.round(r.taxeFonciere),
        Math.round(r.loyersNets), r.rendementLocatifNet,
        Math.round(r.interetsAnnuels), Math.round(r.capitalRembourse),
        Math.round(r.echeanceAnnuelle), Math.round(r.capitalRestantDu),
        Math.round(r.ira), Math.round(r.assuranceCredit), Math.round(r.creditBancaireCashFlow),
        Math.round(r.gestionLocativeCost), Math.round(r.chargesAcquisitionCashFlow),
        Math.round(r.travauxBailleurCost), Math.round(r.comptabiliteCost),
        Math.round(r.assurancePNECost), Math.round(r.chargesDiversesCost), Math.round(r.totalCharges),
        Math.round(r.amortissement), Math.round(r.beneficeImposable), Math.round(r.impot),
        Math.round(r.tvaCollectee), Math.round(r.tvaDeductible), Math.round(r.creditTVA),
        Math.round(r.tresorerieTVACashFlow), Math.round(r.cashFlowAnnuel),
        Math.round(r.cashFlowMensuel), Math.round(r.capitalRembourseCumule),
        Math.round(r.patrimoineNet), Math.round(r.gainNetCumule)
      ].join(sep));
    });

    const csvContent = BOM + lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `simulation_complete_klocka_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleExport} className="text-[#f2f3f5]/50 hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/[0.06] text-xs gap-1.5">
      <Download className="w-3.5 h-3.5" />
      <span className="hidden md:inline">Export complet</span>
      <span className="md:hidden">Excel</span>
    </Button>
  );
}