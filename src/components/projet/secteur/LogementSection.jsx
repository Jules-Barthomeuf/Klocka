import React from "react";
import { Home } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import SectionCard, { KPI } from "./SectionCard";

const tooltipStyle = { backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff' };

// Moyennes nationales France (INSEE)
const FR_LOG = {
  pct_logements_vacants: 8.3,
  pct_proprietaires: 57.5,
  pct_locataires: 40.0,
  pct_residences_principales: 82.2,
};

function FrCompare({ local, national, unit = "%", invert = false }) {
  if (!local || !national) return null;
  const diff = local - national;
  const positive = invert ? diff < 0 : diff > 0;
  return (
    <p className={`text-[10px] mt-1 font-medium ${positive ? 'text-emerald-400' : diff === 0 ? 'text-gray-500' : 'text-red-400'}`}>
      FR: {national}{unit} ({diff > 0 ? '+' : ''}{diff.toFixed(1)} pts)
    </p>
  );
}

export default function LogementSection({ data }) {
  const pieLogement = [
    data.pct_residences_principales > 0 && { name: "Rés. principales", value: data.pct_residences_principales, fill: "#2A9D8F" },
    data.pct_residences_secondaires > 0 && { name: "Rés. secondaires", value: data.pct_residences_secondaires, fill: "#71CCBA" },
    data.pct_logements_vacants > 0 && { name: "Vacants", value: data.pct_logements_vacants, fill: "#EF4444" },
  ].filter(Boolean);

  const pieType = [
    data.pct_maisons > 0 && { name: "Maisons", value: data.pct_maisons, fill: "#F59E0B" },
    data.pct_appartements > 0 && { name: "Appartements", value: data.pct_appartements, fill: "#3B82F6" },
  ].filter(Boolean);

  if (!data.nb_logements && pieLogement.length === 0) return null;

  return (
    <SectionCard icon={<Home className="w-5 h-5 text-[#2A9D8F]" />} title="Logement">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {data.nb_logements > 0 && <KPI label="Logements" value={data.nb_logements.toLocaleString()} color="teal" />}
        {data.pct_logements_vacants > 0 && (
          <div className={`p-4 bg-gradient-to-br ${data.pct_logements_vacants > 8 ? 'from-red-500/20 border-red-500/30' : data.pct_logements_vacants > 5 ? 'from-amber-500/20 border-amber-500/30' : 'from-green-500/20 border-green-500/30'} to-transparent rounded-xl border`}>
            <p className="text-sm text-gray-400 mb-1">Taux de vacance</p>
            <p className={`text-2xl font-semibold ${data.pct_logements_vacants > 8 ? 'text-red-400' : data.pct_logements_vacants > 5 ? 'text-amber-400' : 'text-green-400'}`}>{data.pct_logements_vacants}%</p>
            <FrCompare local={data.pct_logements_vacants} national={FR_LOG.pct_logements_vacants} invert={true} />
          </div>
        )}
        {data.nb_pieces_moyen > 0 && <KPI label="Nb pièces moyen" value={data.nb_pieces_moyen} />}
        {data.surface_moyenne > 0 && <KPI label="Surface moyenne" value={`${data.surface_moyenne} m²`} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Catégorie de logement */}
        {pieLogement.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-gray-400">Catégorie</p>
            <div className="w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieLogement} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value" stroke="none">
                    {pieLogement.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v}%`} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1">
              {pieLogement.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-xs text-gray-300">{d.name}: {d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Type de logement */}
        {pieType.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-gray-400">Type</p>
            <div className="w-36 h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieType} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value" stroke="none">
                    {pieType.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip formatter={v => `${v}%`} contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1">
              {pieType.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.fill }} />
                  <span className="text-xs text-gray-300">{d.name}: {d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Statut d'occupation + confort */}
        <div className="space-y-4">
          {(data.pct_proprietaires > 0 || data.pct_locataires > 0) && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Statut d'occupation</p>
              <div className="relative h-6 rounded-full overflow-hidden flex">
                {data.pct_proprietaires > 0 && (
                  <div className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${data.pct_proprietaires}%` }}>
                    {data.pct_proprietaires}%
                  </div>
                )}
                {data.pct_locataires > 0 && (
                  <div className="bg-purple-500 flex items-center justify-center text-white text-xs font-medium" style={{ width: `${data.pct_locataires}%` }}>
                    {data.pct_locataires}%
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-xs text-gray-400">Propriétaires</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500" /><span className="text-xs text-gray-400">Locataires</span></div>
              </div>
            </div>
          )}

          {/* Ancienneté d'emménagement */}
          {data.pct_emmenagement_moins_2ans > 0 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Ancienneté d'emménagement</p>
              <div className="space-y-1.5">
                {data.pct_emmenagement_moins_2ans > 0 && <StatLine label="< 2 ans" value={data.pct_emmenagement_moins_2ans} />}
                {data.pct_emmenagement_2_4ans > 0 && <StatLine label="2-4 ans" value={data.pct_emmenagement_2_4ans} />}
                {data.pct_emmenagement_5_9ans > 0 && <StatLine label="5-9 ans" value={data.pct_emmenagement_5_9ans} />}
                {data.pct_emmenagement_10ans_plus > 0 && <StatLine label="10+ ans" value={data.pct_emmenagement_10ans_plus} />}
              </div>
            </div>
          )}

          {/* Nb pièces */}
          {data.pct_1_piece > 0 && (
            <div>
              <p className="text-sm text-gray-400 mb-2">Nombre de pièces</p>
              <div className="space-y-1.5">
                {data.pct_1_piece > 0 && <StatLine label="1 pièce" value={data.pct_1_piece} />}
                {data.pct_2_pieces > 0 && <StatLine label="2 pièces" value={data.pct_2_pieces} />}
                {data.pct_3_pieces > 0 && <StatLine label="3 pièces" value={data.pct_3_pieces} />}
                {data.pct_4_pieces > 0 && <StatLine label="4 pièces" value={data.pct_4_pieces} />}
                {data.pct_5_pieces_plus > 0 && <StatLine label="5+ pièces" value={data.pct_5_pieces_plus} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function StatLine({ label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-16">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-[#2A9D8F]" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-300 w-10 text-right">{value}%</span>
    </div>
  );
}