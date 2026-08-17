import React from "react";
import { Building2 } from "lucide-react";
import SectionCard, { KPI, ProgressBar } from "./SectionCard";

export default function EconomieSection({ data }) {
  const secteursData = [
    data.pct_etab_commerce_services > 0 && { name: "Commerce/Services", value: data.pct_etab_commerce_services, color: "#33d6c0" },
    data.pct_etab_admin_public > 0 && { name: "Admin publique", value: data.pct_etab_admin_public, color: "#6366F1" },
    data.pct_etab_construction > 0 && { name: "Construction", value: data.pct_etab_construction, color: "#F59E0B" },
    data.pct_etab_industrie > 0 && { name: "Industrie", value: data.pct_etab_industrie, color: "#3B82F6" },
    data.pct_etab_agriculture > 0 && { name: "Agriculture", value: data.pct_etab_agriculture, color: "#22C55E" },
  ].filter(Boolean);

  const tailleData = [
    data.pct_etab_0_salarie > 0 && { name: "0 salarié", value: data.pct_etab_0_salarie, color: "#5ee7d4" },
    data.pct_etab_1_9 > 0 && { name: "1-9 sal.", value: data.pct_etab_1_9, color: "#33d6c0" },
    data.pct_etab_10_49 > 0 && { name: "10-49 sal.", value: data.pct_etab_10_49, color: "#1A6B61" },
    data.pct_etab_50_plus > 0 && { name: "50+ sal.", value: data.pct_etab_50_plus, color: "#0E3D37" },
  ].filter(Boolean);

  if (!data.nb_etablissements && secteursData.length === 0) return null;

  return (
    <SectionCard icon={<Building2 className="w-5 h-5 text-[#33d6c0]" />} title="Tissu Économique">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {data.nb_etablissements > 0 && <KPI label="Établissements actifs" value={data.nb_etablissements.toLocaleString()} color="teal" />}
        {data.nb_creations_entreprises > 0 && <KPI label="Créations d'entreprises" value={data.nb_creations_entreprises.toLocaleString()} sub="sur l'année" color="green" />}
        {data.pct_creation_industrie > 0 && <KPI label="Dont industrie" value={`${data.pct_creation_industrie}%`} />}
        {data.pct_creation_commerce > 0 && <KPI label="Dont commerce/services" value={`${data.pct_creation_commerce}%`} />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {secteursData.length > 0 && (
          <div>
            <p className="text-sm text-[#93aca7] mb-3">Répartition par secteur</p>
            <div className="space-y-2">
              {secteursData.map((d, i) => <ProgressBar key={i} label={d.name} value={d.value} color={d.color} />)}
            </div>
          </div>
        )}

        {tailleData.length > 0 && (
          <div>
            <p className="text-sm text-[#93aca7] mb-3">Taille des établissements</p>
            <div className="space-y-2">
              {tailleData.map((d, i) => <ProgressBar key={i} label={d.name} value={d.value} color={d.color} />)}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}