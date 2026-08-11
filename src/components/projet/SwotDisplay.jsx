import React, { useState, useEffect } from "react";
import { Shield, TrendingUp, TrendingDown, AlertTriangle, Loader2, RefreshCw, User, Flag, Building2, Landmark, Leaf, Users, GraduationCap, BarChart2, Award } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import SectionCard, { KPI, ProgressBar } from "./secteur/SectionCard";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from "recharts";

const tooltipStyle = { backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff' };

const SECTIONS = [
  { key: "forces", label: "Forces", Icon: Shield, color: "text-green-400", hex: "#22c55e", kpiColor: "green" },
  { key: "faiblesses", label: "Faiblesses", Icon: TrendingDown, color: "text-red-400", hex: "#ef4444", kpiColor: "red" },
  { key: "opportunites", label: "Opportunités", Icon: TrendingUp, color: "text-blue-400", hex: "#3b82f6", kpiColor: "blue" },
  { key: "menaces", label: "Menaces", Icon: AlertTriangle, color: "text-amber-400", hex: "#f59e0b", kpiColor: "amber" },
];

function ItemsBarChart({ items, hex }) {
  if (!items?.length) return null;
  return (
    <div className="h-[180px] mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis type="number" domain={[0, 10]} tick={{ fill: '#9CA3AF', fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={130} tick={{ fill: '#d1d5db', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}/10`, "Impact"]} />
          <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={14}>
            {items.map((_, i) => <Cell key={i} fill={hex} fillOpacity={0.65 + (items[i].score / 10) * 0.35} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SwotSection({ section, items, score_global, swot }) {
  const { label, Icon, color, hex, kpiColor } = section;
  const avg = items.length > 0 ? (items.reduce((a, i) => a + i.score, 0) / items.length).toFixed(1) : null;

  // pick relevant swot fields per category
  const infoCards = {
    forces: [
      swot.maire && { icon: User, label: "Maire", value: swot.maire },
      swot.parti_politique && { icon: Flag, label: "Parti politique", value: swot.parti_politique },
      swot.score_global != null && { icon: Award, label: "Score global", value: `${swot.score_global}/100`, color: "teal" },
      swot.programmes_nationaux && { icon: Landmark, label: "Programmes nationaux", value: swot.programmes_nationaux },
    ].filter(Boolean),
    faiblesses: [
      swot.taux_pauvrete != null && { icon: Users, label: "Taux de pauvreté", value: `${swot.taux_pauvrete}%`, color: "red" },
      swot.taux_etudiants != null && { icon: GraduationCap, label: "Taux d'étudiants", value: `${swot.taux_etudiants}%` },
      swot.risques_environnement && { icon: Leaf, label: "Risques environnementaux", value: swot.risques_environnement },
    ].filter(Boolean),
    opportunites: [
      swot.projets_ville && { icon: Building2, label: "Projets de la ville", value: swot.projets_ville },
      swot.programmes_nationaux && { icon: Landmark, label: "Programmes nationaux", value: swot.programmes_nationaux },
      swot.politiques_cles && { icon: Flag, label: "Politiques clés", value: swot.politiques_cles },
    ].filter(Boolean),
    menaces: [
      swot.risques_environnement && { icon: Leaf, label: "Risques environnementaux", value: swot.risques_environnement },
      swot.taux_pauvrete != null && { icon: Users, label: "Taux de pauvreté", value: `${swot.taux_pauvrete}%`, color: "red" },
      swot.politiques_cles && { icon: Flag, label: "Politiques clés", value: swot.politiques_cles },
    ].filter(Boolean),
  }[section.key] || [];

  return (
    <SectionCard icon={<Icon className={`w-5 h-5 ${color}`} />} title={label}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <KPI label="Nb. éléments" value={items.length} color={kpiColor} />
        <KPI label="Score" value={`${score_global || 0}/100`} color={kpiColor} />
        {avg && <KPI label="Impact moyen" value={`${avg}/10`} color={kpiColor} />}
      </div>

      {/* Info cards from admin */}
      {infoCards.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Données clés</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {infoCards.map((card, idx) => (
              <div key={idx} className="flex items-start gap-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                <div className="w-8 h-8 rounded-lg bg-gray-700/60 flex items-center justify-center flex-shrink-0">
                  <card.icon className="w-4 h-4 text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</p>
                  <p className="text-sm text-white mt-0.5 leading-relaxed">{card.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bar chart */}
      {items.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-1">Indicateurs & impact</p>
          <ItemsBarChart items={items} hex={hex} />
        </div>
      )}

      {/* Progress bars */}
      {items.length > 0 && (
        <div className="space-y-2 mt-4">
          {items.map((item, idx) => (
            <ProgressBar key={idx} label={item.label} value={Math.round(item.score * 10)} color={hex} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default function SwotDisplay({ project }) {
  const swot = project.swot_data;
  const [classified, setClassified] = useState(null);
  const [loading, setLoading] = useState(false);

  const hasPerCategory = swot && (swot.texte_forces || swot.texte_faiblesses || swot.texte_opportunites || swot.texte_menaces);
  const hasStructured = swot && (swot.forces?.length || swot.faiblesses?.length || swot.opportunites?.length || swot.menaces?.length);

  const fetchClassified = () => {
    if (!swot?.texte_general || hasPerCategory || hasStructured) return;
    const cacheKey = `swot_v3_${project.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) { setClassified(JSON.parse(cached)); return; }

    setLoading(true);
    base44.integrations.Core.InvokeLLM({
      prompt: `Tu es expert en immobilier commercial. Analyse ce texte SWOT et classe chaque information dans les 4 catégories.
Pour chaque catégorie retourne:
- "items": tableau d'objets avec "label" (titre court 3-6 mots) et "score" (1 à 10 sur l'impact)
- "score_global": note globale de la catégorie sur 100

Texte:
${swot.texte_general}`,
      response_json_schema: {
        type: "object",
        properties: {
          forces: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, score: { type: "number" } } } }, score_global: { type: "number" } } },
          faiblesses: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, score: { type: "number" } } } }, score_global: { type: "number" } } },
          opportunites: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, score: { type: "number" } } } }, score_global: { type: "number" } } },
          menaces: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { label: { type: "string" }, score: { type: "number" } } } }, score_global: { type: "number" } } },
        },
      },
    }).then((result) => {
      setClassified(result);
      sessionStorage.setItem(cacheKey, JSON.stringify(result));
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchClassified(); }, [swot?.texte_general, project.id]);

  if (!swot) return <div className="text-center py-12"><p className="text-gray-400">Aucune analyse SWOT disponible.</p></div>;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="w-10 h-10 text-[#2A9D8F] animate-spin" />
      <p className="text-gray-400 text-sm">Analyse SWOT en cours...</p>
    </div>
  );

  // Build normalized data per section
  let data = {};
  if (hasStructured) {
    for (const s of SECTIONS) {
      const arr = swot[s.key] || [];
      data[s.key] = { items: arr.map(i => ({ label: i.titre, score: i.valeur ? parseFloat(i.valeur) || 7 : 7 })), score_global: Math.min(arr.length * 15, 100) };
    }
  } else if (hasPerCategory) {
    const parse = (t) => (t || "").split(/\n/).map(l => l.replace(/^[-•●▪]\s*/, "").trim()).filter(l => l).map(l => ({ label: l.substring(0, 50), score: 6 }));
    for (const s of SECTIONS) {
      const items = parse(swot[`texte_${s.key}`]);
      data[s.key] = { items, score_global: Math.min(items.length * 15, 100) };
    }
  } else if (classified) {
    data = classified;
  }

  const hasData = Object.values(data).some(d => d?.items?.length > 0);
  if (!hasData && !swot.maire && !swot.projets_ville && !swot.risques_environnement) {
    return <div className="text-center py-12"><p className="text-gray-400">Aucune analyse SWOT disponible.</p></div>;
  }

  const radarData = SECTIONS.map(s => ({
    category: s.label,
    score: data[s.key]?.score_global || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-montserrat text-white">Analyse SWOT</h2>
          {swot.score_global != null && (
            <div className="flex items-center gap-3 mt-1">
              <Badge className="bg-[#2A9D8F]/20 text-[#2A9D8F] border-0">Score global : {swot.score_global}/100</Badge>
            </div>
          )}
        </div>
        {swot.texte_general && !hasPerCategory && !hasStructured && (
          <Button onClick={fetchClassified} variant="ghost" size="icon" className="text-gray-400 hover:text-white" title="Relancer l'analyse">
            <RefreshCw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Radar overview */}
      {hasData && (
        <SectionCard icon={<BarChart2 className="w-5 h-5 text-[#2A9D8F]" />} title="Vue d'ensemble">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="#374151" />
                <PolarAngleAxis dataKey="category" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <Radar dataKey="score" stroke="#2A9D8F" fill="#2A9D8F" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* 4 scores inline */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
            {SECTIONS.map(s => (
              <div key={s.key} className="p-3 bg-gray-800/50 rounded-xl border border-gray-700 text-center">
                <s.Icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{data[s.key]?.score_global || 0}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* One section per SWOT category */}
      {SECTIONS.map((s) => {
        const d = data[s.key] || { items: [], score_global: 0 };
        const hasInfo = d.items.length > 0 || (() => {
          const infoMap = { forces: ["maire","parti_politique","score_global","programmes_nationaux"], faiblesses: ["taux_pauvrete","taux_etudiants","risques_environnement"], opportunites: ["projets_ville","programmes_nationaux","politiques_cles"], menaces: ["risques_environnement","taux_pauvrete","politiques_cles"] };
          return (infoMap[s.key] || []).some(f => swot[f] != null && swot[f] !== "");
        })();
        if (!hasInfo) return null;
        return <SwotSection key={s.key} section={s} items={d.items} score_global={d.score_global} swot={swot} />;
      })}

      {/* Sources */}
      {project.swot_liens?.length > 0 && (
        <SectionCard title="Sources">
          <div className="flex flex-wrap gap-2">
            {project.swot_liens.map((l, i) => (
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-[#2A9D8F] border border-gray-700 transition-colors">
                {l.label || l.url}
              </a>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}