import { eur } from "@/lib/format";

export default function AnnualTable({ cap, cf }) {
  let cum = 0;
  const cums = cap.map((c) => (cum += c));
  const rows = [
    ["Cash-flow / an", cf],
    ["Cash-flow / mois", cf.map((v) => Math.round(v / 12))],
    ["Capital remb. cumulé", cums],
  ];

  return (
    <div className="overflow-x-auto rounded-[16px] border border-white/[0.08]">
      <table className="w-full text-[13px] whitespace-nowrap border-collapse">
        <thead>
          <tr className="border-b border-white/[0.08]">
            <th className="sticky left-0 z-[1] bg-k-card px-5 py-3.5 text-left font-normal k-label !text-[11px]">Ligne</th>
            {cap.map((_, i) => <th key={i} className="px-4 py-3.5 text-right font-normal text-k-t3">An {i + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, vals]) => (
            <tr key={label} className="border-b border-white/[0.06] last:border-0">
              <td className="sticky left-0 z-[1] bg-k-card px-5 py-3.5 text-white">{label}</td>
              {vals.map((v, i) => (
                <td key={i} className={`px-4 py-3.5 text-right ${v < 0 ? "text-k-negtxt" : "text-k-t2"}`}>{eur(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
