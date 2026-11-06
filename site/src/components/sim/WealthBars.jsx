import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, CartesianGrid } from "recharts";

const eur = (v) => Math.round(v).toLocaleString("fr-FR") + " €";

export default function WealthBars({ years, total }) {
  const data = years.map((y) => ({ year: y.y, capital: y.capital, cf: y.cf }));
  return (
    <div className="rounded-[24px] bg-k-card border border-white/10 p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="text-[22px]">Création de richesse annuelle</h2>
          <div className="flex gap-5 mt-3 text-[13px] text-k-t3">
            <span className="flex items-center gap-2"><i className="w-3 h-3 rounded-sm bg-k-cap" />Capital remboursé</span>
            <span className="flex items-center gap-2"><i className="w-3 h-3 rounded-sm bg-k-cf" />Cash-flow</span>
          </div>
        </div>
        <div className="text-right">
          <p className="k-label">Total</p>
          <p className="text-[30px] text-k-sage tracking-[-0.03em]">{eur(total)}</p>
        </div>
      </div>
      <div className="h-[300px] mt-6">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="year" stroke="#767c7b" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis stroke="#767c7b" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)} k€`} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{ background: "#0b0c0c", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}
              labelFormatter={(l) => `Année ${l}`}
              formatter={(v, n) => [eur(v), n === "capital" ? "Capital remboursé" : "Cash-flow"]}
            />
            <Bar dataKey="capital" fill="#7EDDD0" radius={[4, 4, 0, 0]} />
            <Bar dataKey="cf" radius={[4, 4, 0, 0]}>
              {data.map((d) => <Cell key={d.year} fill={d.cf < 0 ? "#A8564E" : "#1F7A70"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
