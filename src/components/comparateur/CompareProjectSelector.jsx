import React from "react";
import { Check, MapPin, Plus } from "lucide-react";

const BORDER_COLORS = ["border-red-800", "border-emerald-400", "border-yellow-500", "border-purple-400"];
const RING_COLORS = ["ring-red-800/30", "ring-emerald-400/30", "ring-yellow-500/30", "ring-purple-400/30"];
const DOT_COLORS = ["bg-red-800", "bg-emerald-400", "bg-yellow-500", "bg-purple-400"];

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

const formatPrice = (val) => {
  if (!val) return "—";
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
  if (val >= 1000) return `${Math.round(val / 1000)}K €`;
  return `${Math.round(val)} €`;
};

export default function CompareProjectSelector({ projects, selectedIds, onToggle }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {projects.map((project) => {
        const selIdx = selectedIds.indexOf(project.id);
        const isSelected = selIdx !== -1;
        const colorIdx = isSelected ? selIdx : 0;

        const prixBienNegocie = project.sim_prix_bien_negocie || 0;
        const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
        const tauxDroitsEnregistrement = project.sim_droits_enregistrement || 8;
        const tauxFeesKlocka = project.sim_fees_klocka || 8;
        const feesKlockaType = project.sim_fees_klocka_type || "pourcentage";
        const tauxIncentiveKlocka = project.sim_incentive_klocka || 20;
        const droitsEnregistrement = prixBienNegocie * (tauxDroitsEnregistrement / 100);
        const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
        const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
        const totalFraisKlocka = feesKlocka + incentiveKlocka;
        const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);
        const prixRevient = prixBienNegocie > 0
          ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers
          : project.sim_prix_revient || project.prix_acquisition || 0;

        const loyerAnnuelInitial = project.sim_loyer_initial_ht || 0;
        const anneeRevente = project.sim_annee_revente || 20;
        const indexation = project.sim_indexation_loyers || 2;
        let totalLoyersNets = 0;
        let loyerCourant = loyerAnnuelInitial;
        for (let annee = 1; annee <= anneeRevente; annee++) {
          if (annee > 1) loyerCourant = loyerCourant * (1 + indexation / 100);
          totalLoyersNets += loyerCourant;
        }
        const loyerMoyen = anneeRevente > 0 ? totalLoyersNets / anneeRevente : 0;
        const rendement = prixRevient > 0 && loyerMoyen > 0 ? (loyerMoyen / prixRevient) * 100 : 0;
        const surface = project.sim_surface || project.surface_m2 || 0;

        return (
          <button
            key={project.id}
            onClick={() => onToggle(project.id)}
            className="text-left group"
          >
            <div className={`relative bg-[#0A0A0A] rounded-2xl border overflow-hidden transition-all duration-300 ${
              isSelected
                ? `${BORDER_COLORS[colorIdx]} ring-2 ${RING_COLORS[colorIdx]}`
                : "border-white/[0.06] hover:border-white/[0.12]"
            }`}>
              {/* Image */}
              <div className="relative h-48 md:h-52 overflow-hidden">
                {project.photos && project.photos.length > 0 ? (
                  <img
                    src={project.photos[0]}
                    alt={project.titre}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#111] to-[#080808] flex items-center justify-center">
                    <MapPin className="w-12 h-12 text-white/[0.05]" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/30 to-transparent" />

                {/* Status badge */}
                <div className="absolute top-4 left-4">
                  <span className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-[#2A9D8F] border border-[#2A9D8F]/20">
                    {statutLabels[project.statut] || project.statut}
                  </span>
                </div>

                {/* Selection indicator */}
                <div className="absolute top-4 right-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    isSelected
                      ? `${DOT_COLORS[colorIdx]} shadow-lg`
                      : "bg-black/50 backdrop-blur-sm border border-white/20"
                  }`}>
                    {isSelected ? (
                      <Check className="w-4 h-4 text-black" />
                    ) : (
                      <Plus className="w-4 h-4 text-white/60" />
                    )}
                  </div>
                </div>

                {/* Title */}
                <div className="absolute bottom-4 left-5 right-5">
                  <h2 className="text-xl font-light text-white tracking-tight leading-tight">
                    {project.titre}
                  </h2>
                  {project.adresse_complete && (
                    <p className="text-white/40 text-sm mt-1">{project.adresse_complete}</p>
                  )}
                </div>
              </div>

              {/* KPIs */}
              <div className="p-5 flex items-center justify-between">
                <div className="flex gap-8">
                  <div>
                    <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Prix de revient</p>
                    <p className="text-[#2A9D8F] text-lg font-light">{formatPrice(prixRevient)}</p>
                  </div>
                  <div>
                    <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Rendement</p>
                    <p className="text-white text-lg font-light">{rendement.toFixed(2)}%</p>
                  </div>
                  {surface > 0 && (
                    <div>
                      <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Surface</p>
                      <p className="text-white text-lg font-light">{surface} m²</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}