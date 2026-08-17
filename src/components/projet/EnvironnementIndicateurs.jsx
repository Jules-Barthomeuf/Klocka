import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Users, Building2, TrendingUp, Landmark, Briefcase, Leaf
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  RadialBarChart, RadialBar, Legend
} from "recharts";
import SectionCard, { KPI } from "./secteur/SectionCard";

const DARK_TOOLTIP = {
  contentStyle: { backgroundColor: "#1a1a1a", border: "1px solid #374151", borderRadius: 8 },
  labelStyle: { color: "#fff" },
  itemStyle: { color: "#ccc" }
};

export default function EnvironnementIndicateurs({ project }) {
  const env = project?.env_data || {};
  const adresse = project?.adresse_complete;

  if (!adresse && !Object.keys(env).length) return (
    <div className="text-center py-12">
      <p className="text-gray-400">Aucune adresse renseignée pour ce projet.</p>
    </div>
  );

  if (!Object.keys(env).length) return (
    <div className="text-center py-12 space-y-3">
      <Leaf className="w-12 h-12 text-gray-600 mx-auto" />
      <p className="text-gray-400">Les données environnementales n'ont pas encore été renseignées.</p>
      <p className="text-gray-500 text-sm">L'administrateur peut les saisir depuis la gestion des projets.</p>
    </div>
  );

  /* ---- RADAR DÉMOGRAPHIE ---- */
  const hasDemog = env.population != null || env.evolution_population_10ans != null || env.age_median != null;
  const radarDemog = [
    { cat: "< 25 ans", val: env.pct_moins_25ans || 0 },
    { cat: "> 65 ans", val: env.pct_plus_65ans || 0 },
    { cat: "Évol. pop.", val: Math.max(0, Math.min(100, ((env.evolution_population_10ans || 0) + 10) * 5)) },
    { cat: "Natalité", val: Math.min((env.taux_natalite || 0) * 7, 100) },
    { cat: "Densité", val: Math.min((env.densite_population || 0) / 50, 100) },
  ];

  /* ---- RADIAL ATTRACTIVITÉ ---- */
  const hasAttract = env.score_attractivite != null || env.nb_touristes_an != null || env.nb_etudiants != null;
  const radialAttract = [
    env.score_attractivite != null && { name: "Attractivité", value: env.score_attractivite, fill: "#ec4899" },
  ].filter(Boolean);

  /* ---- BAR ÉCONOMIE ---- */
  const hasEco = env.taux_chomage != null || env.nb_entreprises != null;
  const barEco = [
    env.taux_chomage != null && { name: "Chômage %", val: env.taux_chomage, fill: env.taux_chomage < 7 ? "#33d6c0" : env.taux_chomage < 10 ? "#f59e0b" : "#ef4444" },
    env.taux_vacance_commerciale != null && { name: "Vacance com. %", val: env.taux_vacance_commerciale, fill: env.taux_vacance_commerciale < 8 ? "#33d6c0" : env.taux_vacance_commerciale < 15 ? "#f59e0b" : "#ef4444" },
  ].filter(Boolean);

  /* ---- BAR PROJETS URBAINS ---- */
  const hasProjets = env.projets_en_cours || env.projets_a_venir || env.zones_revitalisation;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-montserrat text-white">{env.ville || adresse}</h2>
        <div className="flex items-center gap-3 mt-1">
          {env.departement && <Badge className="bg-[#33d6c0]/20 text-[#33d6c0] border-0">{env.departement}</Badge>}
          {env.region && <span className="text-sm text-gray-400">{env.region}</span>}
        </div>
      </div>

      {/* DÉMOGRAPHIE */}
      {hasDemog && (
        <SectionCard icon={<Users className="w-5 h-5 text-violet-400" />} title="Démographie">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {env.population != null && <KPI label="Population" value={env.population.toLocaleString('fr-FR')} color="violet" />}
                {env.evolution_population_10ans != null && (
                  <KPI label="Évolution 10 ans" value={`${env.evolution_population_10ans > 0 ? '+' : ''}${env.evolution_population_10ans}%`}
                    color={env.evolution_population_10ans >= 0 ? "green" : "red"} />
                )}
                {env.age_median != null && <KPI label="Âge médian" value={`${env.age_median} ans`} color="teal" />}
                {env.densite_population != null && <KPI label="Densité" value={`${env.densite_population} hab/km²`} color="teal" />}
                {env.solde_migratoire != null && (
                  <KPI label="Solde migratoire" value={`${env.solde_migratoire > 0 ? '+' : ''}${env.solde_migratoire}`}
                    color={env.solde_migratoire >= 0 ? "green" : "red"} />
                )}
                {env.taux_natalite != null && <KPI label="Taux natalité" value={`${env.taux_natalite}‰`} color="teal" />}
              </div>
              {env.analyse_demographie && (
                <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-md p-4 border border-gray-700">{env.analyse_demographie}</p>
              )}
            </div>
            {(env.pct_moins_25ans != null || env.pct_plus_65ans != null) && (
              <div>
                <p className="text-sm text-gray-400 mb-3">Profil démographique — toile</p>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarDemog} cx="50%" cy="50%" outerRadius="70%">
                      <PolarGrid stroke="#374151" />
                      <PolarAngleAxis dataKey="cat" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Radar dataKey="val" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* POLITIQUE DE LA VILLE */}
      {(env.axes_strategiques_ville || env.politique_fiscale || env.stabilite_politique) && (
        <SectionCard icon={<Landmark className="w-5 h-5 text-blue-400" />} title="Politique de la ville">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            {env.stabilite_politique && (
              <KPI label="Stabilité politique" value={env.stabilite_politique}
                color={env.stabilite_politique === "Très stable" || env.stabilite_politique === "Stable" ? "green" : "amber"} />
            )}
            {env.budget_investissement_annuel != null && <KPI label="Budget invest. / an" value={`${env.budget_investissement_annuel} M€`} color="teal" />}
          </div>
          <div className="space-y-3">
            {env.axes_strategiques_ville && (
              <div className="p-4 bg-blue-500/10 rounded-md border border-blue-500/20">
                <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">Axes stratégiques</p>
                <p className="text-sm text-gray-300 leading-relaxed">{env.axes_strategiques_ville}</p>
              </div>
            )}
            {env.politique_fiscale && (
              <div className="p-4 bg-gray-800/40 rounded-md border border-gray-700">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Politique fiscale</p>
                <p className="text-sm text-gray-300 leading-relaxed">{env.politique_fiscale}</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* PROJETS URBAINS */}
      {(env.projets_en_cours || env.projets_a_venir || env.zones_revitalisation || env.projets_investissement_total != null) && (
        <SectionCard icon={<Building2 className="w-5 h-5 text-[#33d6c0]" />} title="Projets urbains & Aménagements">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            {env.projets_investissement_total != null && <KPI label="Investissement prévu" value={`${env.projets_investissement_total} M€`} color="teal" />}
            {env.projets_horizon && <KPI label="Horizon" value={env.projets_horizon} color="teal" />}
          </div>
          {/* Timeline visuelle */}
          {(env.projets_en_cours || env.projets_a_venir) && (
            <div className="relative mb-4">
              <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[#33d6c0] to-amber-500" />
              <div className="space-y-4 pl-10">
                {env.projets_en_cours && (
                  <div className="relative">
                    <div className="absolute -left-7 top-1.5 w-3 h-3 rounded-full bg-[#33d6c0] border-2 border-gray-900 ring-2 ring-[#33d6c0]/30" />
                    <div className="p-4 bg-[#33d6c0]/10 rounded-md border border-[#33d6c0]/20">
                      <p className="text-xs text-[#33d6c0] font-semibold uppercase tracking-wider mb-2">En cours / réalisés</p>
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{env.projets_en_cours}</p>
                    </div>
                  </div>
                )}
                {env.projets_a_venir && (
                  <div className="relative">
                    <div className="absolute -left-7 top-1.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-gray-900 ring-2 ring-amber-500/30" />
                    <div className="p-4 bg-amber-500/10 rounded-md border border-amber-500/20">
                      <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider mb-2">À venir / prévus</p>
                      <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{env.projets_a_venir}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {env.zones_revitalisation && (
            <div className="p-4 bg-purple-500/10 rounded-md border border-purple-500/20">
              <p className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-2">Zones de revitalisation</p>
              <p className="text-sm text-gray-300 leading-relaxed">{env.zones_revitalisation}</p>
            </div>
          )}
        </SectionCard>
      )}

      {/* ATTRACTIVITÉ */}
      {hasAttract && (
        <SectionCard icon={<TrendingUp className="w-5 h-5 text-pink-400" />} title="Attractivité & Rayonnement">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {env.score_attractivite != null && (
                  <KPI label="Score attractivité" value={`${env.score_attractivite}/100`}
                    color={env.score_attractivite >= 70 ? "green" : env.score_attractivite >= 40 ? "amber" : "red"} />
                )}
                {env.classement_national && <KPI label="Classement national" value={env.classement_national} color="teal" />}
                {env.nb_touristes_an != null && <KPI label="Touristes / an" value={env.nb_touristes_an.toLocaleString('fr-FR')} color="pink" />}
                {env.nb_etudiants != null && <KPI label="Étudiants" value={env.nb_etudiants.toLocaleString('fr-FR')} color="blue" />}
                {env.nb_etablissements_sup != null && <KPI label="Étab. sup." value={env.nb_etablissements_sup} color="blue" />}
                {env.nb_hopitaux != null && <KPI label="Hôpitaux / cliniques" value={env.nb_hopitaux} color="red" />}
              </div>
              {env.points_forts_ville && (
                <p className="text-sm text-gray-300 leading-relaxed bg-gray-800/40 rounded-md p-4 border border-gray-700">{env.points_forts_ville}</p>
              )}
            </div>
            {radialAttract.length > 0 && (
              <div>
                <p className="text-sm text-gray-400 mb-3">Scores (/100)</p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%"
                      data={radialAttract} startAngle={90} endAngle={-270}
                    >
                      <RadialBar dataKey="value" cornerRadius={6} background={{ fill: "#1f2937" }} label={{ fill: "#9ca3af", fontSize: 10 }} />
                      <Tooltip {...DARK_TOOLTIP} />
                      <Legend formatter={(v) => <span className="text-xs text-gray-400">{v}</span>} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ÉCONOMIE LOCALE */}
      {hasEco && (
        <SectionCard icon={<Briefcase className="w-5 h-5 text-orange-400" />} title="Économie locale">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {env.taux_chomage != null && (
                  <KPI label="Taux de chômage" value={`${env.taux_chomage}%`}
                    color={env.taux_chomage < 7 ? "green" : env.taux_chomage < 10 ? "amber" : "red"} />
                )}
                {env.nb_entreprises != null && <KPI label="Entreprises" value={env.nb_entreprises.toLocaleString('fr-FR')} color="teal" />}
                {env.creations_entreprises_an != null && <KPI label="Créations nettes / an" value={env.creations_entreprises_an.toLocaleString('fr-FR')} color="green" />}
                {env.taux_vacance_commerciale != null && (
                  <KPI label="Vacance commerciale" value={`${env.taux_vacance_commerciale}%`}
                    color={env.taux_vacance_commerciale < 8 ? "green" : env.taux_vacance_commerciale < 15 ? "amber" : "red"} />
                )}
                {env.revenu_median_ville != null && <KPI label="Revenu médian" value={`${env.revenu_median_ville.toLocaleString('fr-FR')} €/an`} color="teal" />}
                {env.pib_habitant != null && <KPI label="PIB / habitant" value={`${env.pib_habitant.toLocaleString('fr-FR')} €`} color="teal" />}
              </div>
              <div className="space-y-3">
                {env.secteurs_activite_dominants && (
                  <div className="p-4 bg-orange-500/10 rounded-md border border-orange-500/20">
                    <p className="text-xs text-orange-400 font-semibold uppercase tracking-wider mb-2">Secteurs dominants</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{env.secteurs_activite_dominants}</p>
                  </div>
                )}
                {env.grands_employeurs && (
                  <div className="p-4 bg-gray-800/40 rounded-md border border-gray-700">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-2">Grands employeurs</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{env.grands_employeurs}</p>
                  </div>
                )}
              </div>
            </div>
            {barEco.length > 0 && (
              <div>
                <p className="text-sm text-gray-400 mb-3">Indicateurs clés (%)</p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barEco} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={110} />
                      <Tooltip {...DARK_TOOLTIP} formatter={(v) => `${v}%`} />
                      <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                        {barEco.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}