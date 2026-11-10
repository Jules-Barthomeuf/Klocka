import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { J } from "@/design/jetons";

// Le tableau annuel détaillé au dessin des tableaux de l'application (10 nov. 2026, Jules : « redesign le tableau
// annuel du bas ») : cadre `trait` à 12 px, en-tête de 35 px, lignes de 36 px en 13,5 px, plus de bandes colorées.
// Une partie se déplie d'un clic, son total sur sa ligne ; l'année de revente se marque d'une colonne teintée ; le
// capital remboursé et le cash-flow portent la pastille de leur couleur dans le graphique.
const VIOLET_FONCE = `color-mix(in srgb, ${J.violet} 62%, black)`;
const ACCENT = "rgb(var(--k-menthe-rgb))";

export default function SimDataTable({ calculs, anneeRevente, formatCurrency }) {
  // An 1 jusqu'à cinq ans après la fin du crédit : 25 ans pour un prêt de 20.
  const rows = calculs.tableauAnnuel.slice(1, (calculs.horizonAffichage || 25) + 1);

  const fmtCur = (v) => formatCurrency(v || 0);
  const fmtAbs = (v) => formatCurrency(Math.abs(v || 0));
  const fmtPct = (v) => (v != null && v !== "" ? `${v}%` : "—");
  const dashZero = (v, fmt = fmtAbs) => (v ? fmt(v) : "—");

  const sections = [
    {
      title: "Loyers",
      summaryKey: "loyersNets",
      rows: [
        { label: "Loyers bruts HT HC", get: (r) => fmtCur(r.loyerBrutAnnuel) },
        { label: "Vacance (mois)", get: (r) => (r.nbMoisVacance ? r.nbMoisVacance : "—") },
        { label: "Coût vacance", get: (r) => fmtAbs(r.coutVacance) },
        { label: "Charges copropriété", get: (r) => fmtAbs(r.chargesCopro) },
        { label: "Taxe foncière", get: (r) => fmtAbs(r.taxeFonciere) },
        { label: "Loyers nets", get: (r) => fmtCur(r.loyersNets), fort: true },
        { label: "Rendement locatif net", get: (r) => fmtPct(r.rendementLocatifNet) },
      ],
    },
    {
      title: "Crédit bancaire",
      summaryKey: "echeanceAnnuelle",
      rows: [
        { label: "Intérêts", get: (r) => fmtAbs(r.interetsAnnuels) },
        { label: "Capital remboursé", get: (r) => fmtAbs(r.capitalRembourse), pastille: VIOLET_FONCE },
        { label: "Échéance annuelle", get: (r) => fmtCur(r.echeanceAnnuelle), fort: true },
        { label: "Capital restant dû", get: (r) => fmtCur(r.capitalRestantDu) },
        { label: "IRA", get: (r) => dashZero(r.ira) },
        { label: "Assurance crédit", get: (r) => fmtAbs(r.assuranceCredit) },
      ],
    },
    {
      title: "Charges d'exploitation",
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
      title: "Fiscalité",
      summaryKey: "impot",
      rows: [
        { label: "Amortissement", get: (r) => fmtAbs(r.amortissement) },
        { label: "Bénéfice imposable", get: (r) => fmtCur(r.beneficeImposable) },
        { label: "Impôt IS", get: (r) => fmtAbs(r.impot), fort: true },
      ],
    },
    {
      title: "TVA",
      summaryKey: "tresorerieTVACashFlow",
      rows: [
        { label: "TVA collectée", get: (r) => dashZero(r.tvaCollectee, fmtCur) },
        { label: "TVA déductible", get: (r) => dashZero(r.tvaDeductible, fmtCur) },
        { label: "Crédit de TVA", get: (r) => dashZero(r.creditTVA, fmtCur) },
        { label: "Trésorerie TVA", get: (r) => dashZero(r.tresorerieTVACashFlow, fmtCur) },
      ],
    },
    {
      title: "Cash-flow et patrimoine",
      summaryKey: "cashFlowAnnuel",
      rows: [
        { label: "Cash-flow / an", get: (r) => fmtCur(r.cashFlowAnnuel), pastille: ACCENT, fort: true },
        { label: "Cash-flow / mois", get: (r) => fmtCur(r.cashFlowMensuel) },
        { label: "Capital remb. cumulé", get: (r) => fmtCur(r.capitalRembourseCumule), pastille: VIOLET_FONCE },
      ],
    },
  ];

  const getSummary = (sec, r) => (sec.summaryFn ? sec.summaryFn(r) : sec.summaryKey ? r[sec.summaryKey] : null);

  // Le cash-flow ouvert d'office : c'est la ligne qu'on vient lire.
  const [ouvertes, setOuvertes] = useState(() => new Set(["Cash-flow et patrimoine"]));
  const toutOuvert = ouvertes.size === sections.length;
  const basculer = (t) => setOuvertes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const negatif = (v) => typeof v === "string" && v.trim().startsWith("-");
  const revente = (r) => anneeRevente && r.annee === Number(anneeRevente);
  const colRevente = "bg-menthe/[0.06]";
  const premiere = "sticky left-0 z-10 bg-rail border-r border-trait";
  const Pastille = ({ c }) => <span className="inline-block h-2 w-2 flex-none rounded-full" style={{ background: c }} />;

  return (
    <div className="overflow-hidden rounded-[12px] border border-trait bg-rail">
      <div className="flex h-[35px] items-center justify-between gap-3 border-b border-trait px-4">
        <p className="m-0 text-[12.5px] text-encre">Tableau annuel détaillé</p>
        <button type="button" onClick={() => setOuvertes(toutOuvert ? new Set() : new Set(sections.map((s) => s.title)))}
          className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          {toutOuvert ? "Tout replier" : "Tout déplier"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px] [&_tbody_tr:last-child]:border-b-0">
          <thead>
            <tr className="h-[35px] border-b border-trait">
              <th className={`${premiere} px-4 text-left text-[12.5px] font-normal text-ardoise whitespace-nowrap`}>Ligne</th>
              {rows.map((r) => (
                <th key={r.annee} className={`px-3 text-right text-[12.5px] font-normal whitespace-nowrap ${revente(r) ? `${colRevente} text-encre` : "text-ardoise"}`}>
                  An {r.annee}{revente(r) ? " · revente" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const ouverte = ouvertes.has(sec.title);
              return (
                <React.Fragment key={sec.title}>
                  <tr onClick={() => basculer(sec.title)} className="group h-9 cursor-pointer border-b border-trait hover:bg-encre/[0.03]">
                    <td className={`${premiere} px-4 whitespace-nowrap max-md:min-w-[140px] max-md:whitespace-normal`}>
                      <span className="inline-flex items-center gap-2 font-medium text-encre">
                        <ChevronRight className={`h-3.5 w-3.5 flex-none text-ardoise transition-transform ${ouverte ? "rotate-90" : ""}`} />
                        {sec.title}
                      </span>
                    </td>
                    {rows.map((r) => {
                      const sum = getSummary(sec, r);
                      const v = sum != null ? fmtCur(sum) : "";
                      return <td key={r.annee} className={`px-3 text-right font-medium tabular-nums whitespace-nowrap ${revente(r) ? colRevente : ""} ${negatif(v) ? "text-alerte" : "text-encre"}`}>{v}</td>;
                    })}
                  </tr>
                  {ouverte && sec.rows.map((row) => (
                    <tr key={row.label} className="h-9 border-b border-trait hover:bg-encre/[0.03]">
                      <td className={`${premiere} py-2 pl-[38px] pr-4 whitespace-nowrap max-md:min-w-[140px] max-md:whitespace-normal`}>
                        <span className={`inline-flex items-center gap-2 ${row.fort ? "text-encre" : "text-ardoise"}`}>
                          {row.label}
                          {row.pastille && <Pastille c={row.pastille} />}
                        </span>
                      </td>
                      {rows.map((r) => {
                        const v = row.get(r);
                        return <td key={r.annee} className={`px-3 text-right tabular-nums whitespace-nowrap ${revente(r) ? colRevente : ""} ${negatif(v) ? "text-alerte" : row.fort ? "text-encre" : "text-craie"}`}>{v}</td>;
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
