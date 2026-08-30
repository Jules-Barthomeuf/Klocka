import React from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import InfoTooltip from "./InfoTooltip";

const COLORS = ["#991B1B", "#34D399", "#EAB308", "#C084FC"];

function CustomTooltip({ active, payload, label, format = "currency" }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-[#0c0d10] border border-[#22262d] rounded-lg p-3">
      <p className="text-[#f2f3f5] text-xs font-medium mb-1">Année {label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {Math.round(p.value).toLocaleString("fr-FR")} €
        </p>
      ))}
    </div>
  );
}

export function RichesseChart({ metrics }) {
  if (!metrics.length) return null;

  const maxYears = Math.max(...metrics.map(m => m.richesseCumuleeParAnnee.length));
  const data = [];
  for (let i = 0; i < maxYears; i++) {
    const point = { annee: i + 1 };
    metrics.forEach((m, idx) => {
      point[`projet${idx}`] = m.richesseCumuleeParAnnee[i]?.richesse || 0;
    });
    data.push(point);
  }

  return (
    <div className="bg-[#000000] rounded-md border border-[#1f2228] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em]">
          Création de richesse cumulée
        </p>
        <InfoTooltip text="Représente la richesse totale créée année après année : cashflow cumulé + capital remboursé. Plus la courbe monte vite, plus le projet crée de la valeur rapidement." />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {metrics.map((_, i) => (
                <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i]} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={COLORS[i]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
            <XAxis dataKey="annee" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
            {metrics.map((m, i) => (
              <Area
                key={i}
                type="monotone"
                dataKey={`projet${i}`}
                name={m.titre}
                stroke={COLORS[i]}
                strokeWidth={2}
                fill={`url(#grad${i})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CashflowChart({ metrics }) {
  if (!metrics.length) return null;

  const maxYears = Math.max(...metrics.map(m => m.cashflowParAnnee.length));
  const data = [];
  for (let i = 0; i < maxYears; i++) {
    const point = { annee: i + 1 };
    metrics.forEach((m, idx) => {
      point[`projet${idx}`] = m.cashflowParAnnee[i]?.cashflow || 0;
    });
    data.push(point);
  }

  return (
    <div className="bg-[#000000] rounded-md border border-[#1f2228] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em]">
          Cashflow annuel
        </p>
        <InfoTooltip text="Le cashflow annuel correspond à la différence entre les loyers perçus et l'ensemble des charges (crédit, assurance, comptabilité, etc.). Un cashflow positif signifie que le projet s'autofinance." />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
            <XAxis dataKey="annee" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
            {metrics.map((m, i) => (
              <Bar key={i} dataKey={`projet${i}`} name={m.titre} fill={COLORS[i]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LoyerEvolutionChart({ metrics }) {
  if (!metrics.length) return null;

  const maxYears = Math.max(...metrics.map(m => m.cashflowParAnnee.length));
  const data = [];
  for (let i = 0; i < maxYears; i++) {
    const point = { annee: i + 1 };
    metrics.forEach((m, idx) => {
      const indexation = 1.02; // 2% par défaut
      point[`projet${idx}`] = Math.round(m.loyerAnnuel * Math.pow(indexation, i));
    });
    data.push(point);
  }

  return (
    <div className="bg-[#000000] rounded-md border border-[#1f2228] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em]">
          Évolution des loyers
        </p>
        <InfoTooltip text="Projection de l'évolution des loyers sur la durée de détention, en tenant compte de l'indexation annuelle. Permet de comparer la croissance des revenus locatifs entre projets." />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
            <XAxis dataKey="annee" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
            {metrics.map((m, i) => (
              <Line
                key={i}
                type="monotone"
                dataKey={`projet${i}`}
                name={m.titre}
                stroke={COLORS[i]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RendementCompareChart({ metrics }) {
  if (!metrics.length) return null;

  const data = [
    {
      label: "Rdt locatif net",
      ...Object.fromEntries(metrics.map((m, i) => [`projet${i}`, Math.round(m.rendementLocatifNet * 100) / 100])),
    },
    {
      label: "Rdt global",
      ...Object.fromEntries(metrics.map((m, i) => [`projet${i}`, Math.round(m.rendementLocatifGlobal * 100) / 100])),
    },
    {
      label: "Multiple FP",
      ...Object.fromEntries(metrics.map((m, i) => [`projet${i}`, Math.round(m.multipleFondsPropres * 100) / 100])),
    },
  ];

  return (
    <div className="bg-[#000000] rounded-md border border-[#1f2228] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em]">
          Comparaison des rendements
        </p>
        <InfoTooltip text="Compare le rendement locatif net (loyer / prix de revient), le rendement global (performance totale incluant la revente) et le multiple des fonds propres (richesse créée / apport investi)." />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
            <XAxis dataKey="label" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0c0d10", border: "1px solid #2c3139", borderRadius: 8 }}
              labelStyle={{ color: "#fff" }}
              itemStyle={{ color: "#fff" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
            {metrics.map((m, i) => (
              <Bar key={i} dataKey={`projet${i}`} name={m.titre} fill={COLORS[i]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CashflowCumuleChart({ metrics }) {
  if (!metrics.length) return null;

  const maxYears = Math.max(...metrics.map(m => m.cashflowParAnnee.length));
  const data = [];
  for (let i = 0; i < maxYears; i++) {
    const point = { annee: i + 1 };
    metrics.forEach((m, idx) => {
      point[`projet${idx}`] = m.cashflowParAnnee[i]?.cashflowCumule || 0;
    });
    data.push(point);
  }

  return (
    <div className="bg-[#000000] rounded-md border border-[#1f2228] p-5">
      <div className="flex items-center mb-4">
        <p className="text-[#f2f3f5]/40 text-xs uppercase tracking-[0.15em]">
          Cashflow cumulé
        </p>
        <InfoTooltip text="Somme de tous les cashflows annuels depuis l'acquisition. Permet de voir combien le projet a généré ou coûté au total sur la durée de détention." />
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {metrics.map((_, i) => (
                <linearGradient key={i} id={`gradCF${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[i]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
            <XAxis dataKey="annee" stroke="#555" tick={{ fill: "#666", fontSize: 11 }} />
            <YAxis stroke="#555" tick={{ fill: "#666", fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "#999" }} />
            {metrics.map((m, i) => (
              <Area
                key={i}
                type="monotone"
                dataKey={`projet${i}`}
                name={m.titre}
                stroke={COLORS[i]}
                strokeWidth={2}
                fill={`url(#gradCF${i})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}