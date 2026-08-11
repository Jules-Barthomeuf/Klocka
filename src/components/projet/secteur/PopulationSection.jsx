import React from "react";
import { Users } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import SectionCard, { KPI } from "./SectionCard";

const tooltipStyle = { backgroundColor: '#1a1a1a', border: '1px solid #374151', borderRadius: '8px', color: '#fff' };

// Moyennes nationales France (INSEE)
const FR_POP = {
  densite_hab_km2: 106,
  taille_moyenne_menage: 2.17,
  taux_natalite: 10.7,
  taux_mortalite: 9.9,
  pct_menages_1_personne: 36.5,
  pct_couples_sans_enfant: 25.8,
  pct_couples_avec_enfants: 25.3,
  pct_familles_monoparentales: 9.2,
  pop_0_14: 17.7,
  pop_15_29: 17.4,
  pop_30_44: 19.2,
  pop_45_59: 19.5,
  pop_60_74: 15.9,
  pop_75_plus: 10.3,
};

function CompareBar({ label, local, national, unit = "", suffix = "", invert = false }) {
  if (!local && local !== 0) return null;
  const max = Math.max(local || 0, national || 0) * 1.2 || 1;
  const diff = local != null && national != null ? local - national : null;
  const positive = invert ? diff < 0 : diff > 0;
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <p className="text-xs text-gray-400 mb-2">{label}</p>
      <div className="space-y-1.5">
        <div>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[#2A9D8F]">Ville</span>
            <span className="text-white font-semibold">{local}{suffix}{unit}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#2A9D8F]" style={{ width: `${((local || 0) / max) * 100}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-gray-500">France</span>
            <span className="text-gray-400">{national}{suffix}{unit}</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gray-500" style={{ width: `${((national || 0) / max) * 100}%` }} />
          </div>
        </div>
      </div>
      {diff !== null && (
        <p className={`text-[10px] mt-1.5 font-medium ${positive ? 'text-emerald-400' : diff === 0 ? 'text-gray-500' : 'text-red-400'}`}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}{suffix} vs France
        </p>
      )}
    </div>
  );
}

export default function PopulationSection({ data }) {
  const pyramide = [
    { tranche: "0-14 ans", value: data.pop_0_14 },
    { tranche: "15-29 ans", value: data.pop_15_29 },
    { tranche: "30-44 ans", value: data.pop_30_44 },
    { tranche: "45-59 ans", value: data.pop_45_59 },
    { tranche: "60-74 ans", value: data.pop_60_74 },
    { tranche: "75+ ans", value: data.pop_75_plus },
  ].filter(d => d.value > 0);

  const historique = (data.pop_historique || []).filter(d => d.annee && d.population > 0);

  return (
    <SectionCard icon={<Users className="w-5 h-5 text-[#2A9D8F]" />} title="Population">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPI label="Population" value={data.population?.toLocaleString()} color="teal" />
        {data.evolution_annuelle_pct != null && (
          <KPI label="Croissance annuelle" value={`${data.evolution_annuelle_pct >= 0 ? '+' : ''}${data.evolution_annuelle_pct}%`} color={data.evolution_annuelle_pct >= 0 ? "green" : "red"} />
        )}
        {data.nb_menages > 0 && <KPI label="Ménages" value={data.nb_menages.toLocaleString()} sub={data.taille_moyenne_menage ? `${data.taille_moyenne_menage} pers/ménage (FR: ${FR_POP.taille_moyenne_menage})` : undefined} />}
      </div>

      {/* Comparatifs France */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {data.densite_hab_km2 > 0 && <CompareBar label="Densité (hab/km²)" local={Math.round(data.densite_hab_km2)} national={FR_POP.densite_hab_km2} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pyramide des âges */}
        {pyramide.length > 0 && (
          <div>
            <p className="text-sm text-gray-400 mb-3">Répartition par âge</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pyramide} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                  <XAxis type="number" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 'auto']} />
                  <YAxis type="category" dataKey="tranche" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} width={70} />
                  <Tooltip formatter={v => `${v}%`} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill="#2A9D8F" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Historique population */}
        {historique.length > 2 && (
          <div>
            <p className="text-sm text-gray-400 mb-3">Évolution historique</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historique} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="annee" stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => v.toLocaleString()} contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="population" stroke="#2A9D8F" strokeWidth={2} dot={{ fill: '#2A9D8F', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Ménages et familles */}
      {(data.pct_menages_1_personne > 0 || data.pct_couples_avec_enfants > 0) && (
        <div className="mt-6">
          <p className="text-sm text-gray-400 mb-3">Composition des ménages</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.pct_menages_1_personne > 0 && <MiniStat label="Pers. seules" value={`${data.pct_menages_1_personne}%`} national={FR_POP.pct_menages_1_personne} />}
            {data.pct_couples_sans_enfant > 0 && <MiniStat label="Couples sans enfant" value={`${data.pct_couples_sans_enfant}%`} national={FR_POP.pct_couples_sans_enfant} />}
            {data.pct_couples_avec_enfants > 0 && <MiniStat label="Couples avec enfants" value={`${data.pct_couples_avec_enfants}%`} national={FR_POP.pct_couples_avec_enfants} />}
            {data.pct_familles_monoparentales > 0 && <MiniStat label="Monoparentales" value={`${data.pct_familles_monoparentales}%`} national={FR_POP.pct_familles_monoparentales} />}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MiniStat({ label, value, national }) {
  const localNum = parseFloat(value);
  const diff = national != null && !isNaN(localNum) ? localNum - national : null;
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg text-white font-semibold">{value}</p>
      {national != null && (
        <p className="text-[10px] text-gray-500 mt-0.5">
          FR: {national}%
          {diff !== null && (
            <span className={`ml-1 font-medium ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
              ({diff > 0 ? '+' : ''}{diff.toFixed(1)} pts)
            </span>
          )}
        </p>
      )}
    </div>
  );
}