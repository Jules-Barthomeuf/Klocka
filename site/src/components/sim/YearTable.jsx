const eur = (v) => Math.round(v).toLocaleString("fr-FR");

const ROWS = [
  ["Loyers"], ["Loyer", "rent"], ["Refacturations", "rebill"],
  ["Crédit bancaire"], ["Intérêts", "interest"], ["Capital remboursé", "capital"], ["Assurance", "ins"], ["Total crédit", "loanTotal"],
  ["Charges d’exploitation"], ["Charges", "opex"],
  ["Fiscalité"], ["Impôt sur les sociétés", "tax"],
  ["TVA"], ["TVA", "vat"],
  ["Cash-flow & patrimoine"], ["Cash-flow annuel", "cf"], ["Cash-flow mensuel", "cfMonth"], ["Capital remboursé cumulé", "cumCap"],
];

export default function YearTable({ years }) {
  return (
    <div className="rounded-[24px] bg-k-card border border-white/10 overflow-x-auto">
      <table className="text-[13px] whitespace-nowrap border-collapse">
        <thead>
          <tr className="text-k-label">
            <th className="sticky left-0 bg-k-card text-left font-normal px-5 py-4 min-w-[200px]">Année</th>
            {years.map((y) => <th key={y.y} className="font-normal px-4 py-4 text-right">{y.y}</th>)}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, key]) => key ? (
            <tr key={label + key} className="border-t border-white/5">
              <td className="sticky left-0 bg-k-card px-5 py-2.5 text-k-t2">{label}</td>
              {years.map((y) => (
                <td key={y.y} className={`px-4 py-2.5 text-right ${y[key] < 0 ? "text-k-negtxt" : ""}`}>{eur(y[key])}</td>
              ))}
            </tr>
          ) : (
            <tr key={label} className="border-t border-white/10">
              <td className="sticky left-0 bg-k-card px-5 pt-5 pb-2 text-k-sage uppercase tracking-[0.12em] text-[11.5px]">{label}</td>
              <td colSpan={years.length} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
