import React from "react";
import { Euro } from "lucide-react";
import SectionCard, { KPI } from "./SectionCard";

// Moyennes nationales France (INSEE)
const FR_REVENUS = {
  revenu_median: 23080,
  taux_pauvrete: 14.4,
  part_menages_imposes: 56.0,
};

function RevenuCompare({ label, local, national, unit = "", prefix = "", suffix = "" }) {
  const diff = local && national ? ((local - national) / national * 100) : null;
  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span className="text-gray-500">France : {prefix}{typeof national === 'number' && !unit ? Math.round(national).toLocaleString() : national}{suffix}{unit}</span>
      {diff !== null && (
        <span className={`font-medium ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          ({diff > 0 ? '+' : ''}{diff.toFixed(1)}%)
        </span>
      )}
    </div>
  );
}

export default function RevenusSection({ data }) {
  if (!data.revenu_median && !data.taux_pauvrete) return null;

  return (
    <SectionCard icon={<Euro className="w-5 h-5 text-[#2A9D8F]" />} title="Revenus et Niveau de vie">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {data.revenu_median > 0 && (
          <div className="p-5 bg-gradient-to-br from-emerald-500/20 to-transparent rounded-xl border border-emerald-500/30">
            <p className="text-sm text-gray-400 mb-1">Revenu médian disponible par UC</p>
            <p className="text-3xl font-semibold text-emerald-400">{Math.round(data.revenu_median).toLocaleString()} €</p>
            <p className="text-xs text-gray-500 mt-1">par an</p>
            <RevenuCompare local={data.revenu_median} national={FR_REVENUS.revenu_median} suffix=" €" />
          </div>
        )}
        {data.taux_pauvrete > 0 && (
          <div className="p-5 bg-gradient-to-br from-amber-500/20 to-transparent rounded-xl border border-amber-500/30">
            <p className="text-sm text-gray-400 mb-1">Taux de pauvreté</p>
            <p className={`text-3xl font-semibold ${data.taux_pauvrete > 15 ? 'text-red-400' : 'text-amber-400'}`}>{data.taux_pauvrete}%</p>
            <p className="text-xs text-gray-500 mt-1">seuil à 60% du revenu médian</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500">France : {FR_REVENUS.taux_pauvrete}%</span>
              {(() => { const d = data.taux_pauvrete - FR_REVENUS.taux_pauvrete; return (
                <span className={`font-medium ${d < 0 ? 'text-emerald-400' : d > 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  ({d > 0 ? '+' : ''}{d.toFixed(1)} pts)
                </span>
              ); })()}
            </div>
          </div>
        )}
        {data.part_menages_imposes > 0 && (
          <div className="p-5 bg-gradient-to-br from-blue-500/20 to-transparent rounded-xl border border-blue-500/30">
            <p className="text-sm text-gray-400 mb-1">Ménages imposés</p>
            <p className="text-3xl font-semibold text-blue-400">{data.part_menages_imposes}%</p>
            <p className="text-xs text-gray-500 mt-1">des ménages fiscaux</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-gray-500">France : {FR_REVENUS.part_menages_imposes}%</span>
              {(() => { const d = data.part_menages_imposes - FR_REVENUS.part_menages_imposes; return (
                <span className={`font-medium ${d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                  ({d > 0 ? '+' : ''}{d.toFixed(1)} pts)
                </span>
              ); })()}
            </div>
          </div>
        )}
      </div>

      {/* Distribution des revenus */}
      {(data.revenu_1er_decile > 0 || data.revenu_9eme_decile > 0) && (
        <div>
          <p className="text-sm text-gray-400 mb-3">Distribution des revenus</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.revenu_1er_decile > 0 && <StatBox label="1er décile (D1)" value={`${Math.round(data.revenu_1er_decile).toLocaleString()} €`} sub="10% les plus modestes" />}
            {data.revenu_1er_quartile > 0 && <StatBox label="1er quartile (Q1)" value={`${Math.round(data.revenu_1er_quartile).toLocaleString()} €`} sub="25% les plus modestes" />}
            {data.revenu_3eme_quartile > 0 && <StatBox label="3ème quartile (Q3)" value={`${Math.round(data.revenu_3eme_quartile).toLocaleString()} €`} sub="25% les plus aisés" />}
            {data.revenu_9eme_decile > 0 && <StatBox label="9ème décile (D9)" value={`${Math.round(data.revenu_9eme_decile).toLocaleString()} €`} sub="10% les plus aisés" />}
          </div>
        </div>
      )}

      {/* Rapport interdécile */}
      {data.rapport_interdecile > 0 && (
        <div className="mt-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Rapport interdécile (D9/D1)</p>
              <p className="text-xs text-gray-500 mt-1">Mesure les inégalités de revenus</p>
            </div>
            <p className={`text-2xl font-semibold ${data.rapport_interdecile > 5 ? 'text-red-400' : data.rapport_interdecile > 3.5 ? 'text-amber-400' : 'text-green-400'}`}>
              {data.rapport_interdecile}
            </p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-lg text-white font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}