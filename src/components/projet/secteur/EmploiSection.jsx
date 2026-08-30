import React from "react";
import { Briefcase } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import SectionCard, { KPI } from "./SectionCard";

const tooltipStyle = { backgroundColor: '#0f1114', border: '1px solid #22262d', borderRadius: '8px', color: '#fff' };

// Moyennes nationales France (INSEE)
const FR = {
  taux_activite: 73.9,
  taux_emploi: 66.1,
  taux_chomage: 7.3,
  pct_cadres: 18.4,
  pct_professions_intermediaires: 25.7,
  pct_employes: 26.5,
  pct_ouvriers: 19.4,
  pct_artisans_commercants: 6.5,
  pct_sans_diplome: 22.1,
  pct_cap_bep: 23.3,
  pct_bac: 16.6,
  pct_bac_plus_2: 12.3,
  pct_bac_plus_5: 12.9,
};

function CompareBar({ label, local, national, unit = "%" }) {
  const max = Math.max(local || 0, national || 0) * 1.2 || 1;
  const diff = local && national ? local - national : null;
  return (
    <div className="p-3 bg-[#0f1114]/50 rounded-lg border border-[#22262d]">
      <p className="text-xs text-[#9298a6] mb-2">{label}</p>
      <div className="flex items-end gap-3 mb-1">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[#8fa0f2]">Ville</span>
            <span className="text-[#f2f3f5] font-semibold">{local}{unit}</span>
          </div>
          <div className="h-2 bg-[#22262d] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[#8fa0f2]" style={{ width: `${((local || 0) / max) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-0.5">
          <span className="text-[#9298a6]">France</span>
          <span className="text-[#9298a6]">{national}{unit}</span>
        </div>
        <div className="h-2 bg-[#22262d] rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-[#9298a6]" style={{ width: `${((national || 0) / max) * 100}%` }} />
        </div>
      </div>
      {diff !== null && (
        <p className={`text-[10px] mt-1.5 font-medium ${diff > 0 ? 'text-[#aab6f5]' : diff < 0 ? 'text-red-400' : 'text-[#9298a6]'}`}>
          {diff > 0 ? '+' : ''}{diff.toFixed(1)}{unit} vs France
        </p>
      )}
    </div>
  );
}

export default function EmploiSection({ data }) {
  const cspData = [
    data.pct_cadres > 0 && { name: "Cadres", value: data.pct_cadres, fill: "#aab6f5" },
    data.pct_professions_intermediaires > 0 && { name: "Prof. intermédiaires", value: data.pct_professions_intermediaires, fill: "#8fa0f2" },
    data.pct_employes > 0 && { name: "Employés", value: data.pct_employes, fill: "#7c8ee8" },
    data.pct_ouvriers > 0 && { name: "Ouvriers", value: data.pct_ouvriers, fill: "#1f6b62" },
    data.pct_artisans_commercants > 0 && { name: "Artisans/Comm.", value: data.pct_artisans_commercants, fill: "#17504a" },
    data.pct_agriculteurs > 0 && { name: "Agriculteurs", value: data.pct_agriculteurs, fill: "#113a35" },
  ].filter(Boolean);

  const emploiSecteur = [
    data.pct_emploi_agriculture > 0 && { name: "Agriculture", value: data.pct_emploi_agriculture, fill: "#113a35" },
    data.pct_emploi_industrie > 0 && { name: "Industrie", value: data.pct_emploi_industrie, fill: "#1f6b62" },
    data.pct_emploi_construction > 0 && { name: "Construction", value: data.pct_emploi_construction, fill: "#7c8ee8" },
    data.pct_emploi_commerce_services > 0 && { name: "Commerce/Services", value: data.pct_emploi_commerce_services, fill: "#8fa0f2" },
    data.pct_emploi_admin_public > 0 && { name: "Admin publique", value: data.pct_emploi_admin_public, fill: "#aab6f5" },
  ].filter(Boolean);

  return (
    <SectionCard icon={<Briefcase className="w-5 h-5 text-[#8fa0f2]" />} title="Emploi et Activité">
      {/* Comparaison avec la France */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {data.taux_activite > 0 && <CompareBar label="Taux d'activité" local={data.taux_activite} national={FR.taux_activite} />}
        {data.taux_emploi > 0 && <CompareBar label="Taux d'emploi" local={data.taux_emploi} national={FR.taux_emploi} />}
        {data.taux_chomage > 0 && <CompareBar label="Taux de chômage" local={data.taux_chomage} national={FR.taux_chomage} />}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {data.pop_15_64_ans > 0 && <KPI label="Actifs 15-64 ans" value={data.pop_15_64_ans.toLocaleString()} />}
      </div>

      {/* Diplômes */}
      {(data.pct_sans_diplome > 0 || data.pct_bac_plus_2 > 0) && (
        <div className="mb-6">
          <p className="text-sm text-[#9298a6] mb-3">Niveau de diplôme (15 ans et plus non scolarisés)</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {data.pct_sans_diplome > 0 && <MiniBox label="Sans diplôme" value={`${data.pct_sans_diplome}%`} />}
            {data.pct_brevet > 0 && <MiniBox label="BEPC/Brevet" value={`${data.pct_brevet}%`} />}
            {data.pct_cap_bep > 0 && <MiniBox label="CAP/BEP" value={`${data.pct_cap_bep}%`} />}
            {data.pct_bac > 0 && <MiniBox label="Bac" value={`${data.pct_bac}%`} />}
            {data.pct_bac_plus_2 > 0 && <MiniBox label="Bac+2" value={`${data.pct_bac_plus_2}%`} />}
            {data.pct_bac_plus_3_4 > 0 && <MiniBox label="Bac+3/4" value={`${data.pct_bac_plus_3_4}%`} />}
            {data.pct_bac_plus_5 > 0 && <MiniBox label="Bac+5 et +" value={`${data.pct_bac_plus_5}%`} />}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CSP */}
        {cspData.length > 0 && (
          <div>
            <p className="text-sm text-[#9298a6] mb-3">Catégories socioprofessionnelles</p>
            <div className="flex items-center gap-4">
              <div className="w-40 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={cspData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2} dataKey="value" stroke="none">
                      {cspData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip formatter={v => `${v}%`} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1.5">
                {cspData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.fill }} />
                    <span className="text-xs text-[#c9cdd6]">{d.name}: {d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Emploi par secteur */}
        {emploiSecteur.length > 0 && (
          <div>
            <p className="text-sm text-[#9298a6] mb-3">Emploi par secteur d'activité</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emploiSecteur} layout="vertical" margin={{ left: 5, right: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2228" horizontal={false} />
                  <XAxis type="number" stroke="#9298a6" tick={{ fill: '#9298a6', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="name" stroke="#9298a6" tick={{ fill: '#9298a6', fontSize: 10 }} width={100} />
                  <Tooltip formatter={v => `${v}%`} contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                    {emploiSecteur.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Transport / mobilité */}
      {(data.pct_transport_voiture > 0 || data.pct_transport_commun > 0) && (
        <div className="mt-6">
          <p className="text-sm text-[#9298a6] mb-3">Mode de transport domicile-travail</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {data.pct_transport_voiture > 0 && <MiniBox label="Voiture" value={`${data.pct_transport_voiture}%`} />}
            {data.pct_transport_commun > 0 && <MiniBox label="Transports en commun" value={`${data.pct_transport_commun}%`} />}
            {data.pct_transport_marche > 0 && <MiniBox label="Marche" value={`${data.pct_transport_marche}%`} />}
            {data.pct_transport_velo > 0 && <MiniBox label="Vélo" value={`${data.pct_transport_velo}%`} />}
            {data.pct_pas_transport > 0 && <MiniBox label="Pas de déplacement" value={`${data.pct_pas_transport}%`} />}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function MiniBox({ label, value }) {
  return (
    <div className="p-3 bg-[#0f1114]/50 rounded-lg border border-[#22262d] text-center">
      <p className="text-lg text-[#f2f3f5] font-semibold">{value}</p>
      <p className="text-xs text-[#9298a6] mt-0.5">{label}</p>
    </div>
  );
}