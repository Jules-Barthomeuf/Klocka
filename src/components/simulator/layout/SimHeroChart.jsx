import React, { useMemo } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer, ReferenceDot } from "recharts";

const fmtK = (v) => `${Math.round(v / 1000)}`;

export default function SimHeroChart({ calculs, anneeRevente, formatCurrency, metric = "richesse" }) {
  const config = useMemo(() => {
    const rows = calculs.tableauAnnuel.slice(1, anneeRevente + 1);

    if (metric === "cashflow") {
      return {
        kind: "area",
        title: "Cash-flow annuel",
        subtitle: `Projection sur ${anneeRevente} ans`,
        bigValue: formatCurrency(calculs.indicateurs.cashFlowMoyenAn),
        color: "#96c0b8",
        data: rows.map((r) => ({ annee: `${r.annee}`, value: Math.round(r.cashFlowAnnuel) })),
      };
    }

    if (metric === "patrimoine") {
      const apport = calculs.indicateurs.apportInitial || 0;
      const data = rows.map((r) => ({ annee: `${r.annee}`, value: Math.round(r.patrimoineNet) }));
      // Points issus du cumul (capital remboursé + cash-flow) calculé dans la page
      const anneeRecup = calculs.indicateurs.anneeRecuperationApport;
      const anneeDouble = calculs.indicateurs.anneeDoubleApport;
      const rowFor = (an) => rows.find((r) => r.annee === an);
      let recupApport = null;
      let doubleApport = null;
      if (anneeRecup && rowFor(anneeRecup)) {
        recupApport = { annee: `${anneeRecup}`, value: Math.round(rowFor(anneeRecup).patrimoineNet), montant: Math.round(apport) };
      }
      if (anneeDouble && rowFor(anneeDouble)) {
        doubleApport = { annee: `${anneeDouble}`, value: Math.round(rowFor(anneeDouble).patrimoineNet), montant: Math.round(apport * 2) };
      }
      return {
        kind: "area",
        title: "Patrimoine net",
        subtitle: `Valeur à la revente année ${anneeRevente}`,
        bigValue: formatCurrency(calculs.revente.prixVenteNet),
        color: "#96c0b8",
        data,
        markers: { recupApport, doubleApport },
      };
    }

    // richesse cumulée -> grouped bars: capital remboursé + cash-flow annuel
    return {
      kind: "grouped",
      title: "Création de richesse annuelle",
      subtitle: `Cash-flow + capital remboursé sur ${anneeRevente} ans`,
      bigValue: formatCurrency(calculs.indicateurs.creationRichesseBrute),
      data: rows.map((r) => ({
        annee: `${r.annee}`,
        capital: Math.round(Math.abs(r.capitalRembourse)),
        cashflow: Math.round(r.cashFlowAnnuel),
      })),
    };
  }, [calculs, anneeRevente, metric, formatCurrency]);

  const axisTick = { fill: "#9298a6", fontSize: 10 };
  const axisLine = { stroke: "#ffffff", strokeOpacity: 0.15 };
  const tooltipStyle = { background: "#0c0d10", border: "1px solid #333", borderRadius: 6, fontSize: 11 };

  const RichesseTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const capital = payload.find((p) => p.dataKey === "capital")?.value || 0;
    const cashflow = payload.find((p) => p.dataKey === "cashflow")?.value || 0;
    return (
      <div style={{ ...tooltipStyle, padding: "10px 12px", maxWidth: 260 }}>
        <p className="text-[#f2f3f5] text-xs font-medium mb-1">Année {label}</p>
        <p className="text-[#7FE0D3] text-[11px]">Capital remboursé : {formatCurrency(capital)}</p>
        <p className="text-[#1F6E64] text-[11px] mb-2" style={{ color: "#4FD1A5" }}>Cash-flow annuel : {formatCurrency(cashflow)}</p>
        <p className="text-[#9298a6] text-[10px] leading-snug border-t border-[#f2f3f5]/10 pt-2">
          La création de richesse correspond au cash-flow cumulé + le prix de la revente, en retirant l'apport initial.
        </p>
      </div>
    );
  };

  return (
    <div className="border border-[#1f2228] rounded-md bg-[#0f1114] p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[#f2f3f5] text-sm font-medium">{config.title}</p>
          <p className="text-[#9298a6] text-xs mt-0.5">{config.subtitle}</p>
        </div>
        <p className="text-[#96c0b8] text-xl font-medium tabular-nums">{config.bigValue}</p>
      </div>
      <div className="h-[26rem]">
        <ResponsiveContainer width="100%" height="100%">
          {config.kind === "grouped" ? (
            <BarChart key={`bars-${config.data.length}`} data={config.data} margin={{ top: 12, right: 20, left: 20, bottom: 40 }} barGap={4} barCategoryGap="20%">
              <CartesianGrid stroke="#ffffff" strokeOpacity={0.08} strokeDasharray="3 3" />
              <XAxis dataKey="annee" tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={{ value: "Année", position: "bottom", offset: 18, fill: "#9298a6", fontSize: 11 }} />
              <YAxis tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={fmtK} label={{ value: "Milliers €", angle: -90, position: "insideLeft", offset: -4, fill: "#9298a6", fontSize: 11, style: { textAnchor: "middle" } }} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<RichesseTooltip />} />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, color: "#e5e7eb", paddingBottom: 12 }} formatter={(v) => <span className="text-[#f2f3f5]">{v === "capital" ? "Capital remboursé" : "Cash-flow annuel"}</span>} />
              <Bar name="capital" dataKey="capital" fill="#7FE0D3" radius={[3, 3, 0, 0]} animationBegin={0} animationDuration={Math.max(config.data.length * 90, 600)} animationEasing="ease-out" />
              <Bar name="cashflow" dataKey="cashflow" fill="#1F6E64" radius={[3, 3, 0, 0]} animationBegin={0} animationDuration={Math.max(config.data.length * 90, 600)} animationEasing="ease-out" />
            </BarChart>
          ) : (
            <AreaChart data={config.data} margin={{ top: 12, right: 20, left: 20, bottom: 40 }}>
              <defs>
                <linearGradient id="simHeroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={config.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={config.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ffffff" strokeOpacity={0.08} strokeDasharray="3 3" />
              <XAxis dataKey="annee" tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={{ value: "Année", position: "bottom", offset: 18, fill: "#9298a6", fontSize: 11 }} />
              <YAxis tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={fmtK} label={{ value: "Milliers €", angle: -90, position: "insideLeft", offset: -4, fill: "#9298a6", fontSize: 11, style: { textAnchor: "middle" } }} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#fff" }} formatter={(v) => [formatCurrency(v), ""]} />
              <Area type="monotone" dataKey="value" stroke={config.color} strokeWidth={2} fill="url(#simHeroFill)" />
              {config.markers?.recupApport && (
                <ReferenceDot x={config.markers.recupApport.annee} y={config.markers.recupApport.value} r={6} fill="#96c0b8" stroke="#0f1114" strokeWidth={2} isFront />
              )}
              {config.markers?.doubleApport && (
                <ReferenceDot x={config.markers.doubleApport.annee} y={config.markers.doubleApport.value} r={6} fill="#a8894f" stroke="#0f1114" strokeWidth={2} isFront />
              )}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      {config.markers && (config.markers.recupApport || config.markers.doubleApport) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {config.markers.recupApport && (
            <div className="flex items-center gap-2 border border-[#1f2228] rounded-md px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#96c0b8] flex-shrink-0" />
              <div>
                <p className="text-[#f2f3f5] text-xs font-medium">Récupération de l'apport</p>
                <p className="text-[#9298a6] text-[11px]">Année {config.markers.recupApport.annee} – Vous récupérez vos {formatCurrency(config.markers.recupApport.montant)}</p>
              </div>
            </div>
          )}
          {config.markers.doubleApport && (
            <div className="flex items-center gap-2 border border-[#1f2228] rounded-md px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#a8894f] flex-shrink-0" />
              <div>
                <p className="text-[#f2f3f5] text-xs font-medium">Double de l'apport</p>
                <p className="text-[#9298a6] text-[11px]">Année {config.markers.doubleApport.annee} – Vous atteignez {formatCurrency(config.markers.doubleApport.montant)}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}