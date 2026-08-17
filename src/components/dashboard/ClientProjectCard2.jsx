import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { MapPin, ArrowUpRight } from "lucide-react";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

export default function ClientProjectCard2({ project }) {
  const navigate = useNavigate();

  const prixBienNegocie = project.sim_prix_bien_negocie || 0;
  const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
  const tauxDroitsEnregistrement = project.sim_droits_enregistrement || 8;
  const tauxFeesKlocka = project.sim_fees_klocka || 8;
  const feesKlockaType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentiveKlocka = project.sim_incentive_klocka || 20;
  const commissionAgentActive = project.sim_commission_agent_active || false;
  const commissionAgentInclusFAI = project.sim_commission_agent_inclus_fai ?? true;
  const tauxCommissionAgent = project.sim_commission_agent || 5;
  const commissionAgentType = project.sim_commission_agent_type || "pourcentage";
  const honorairesCA = commissionAgentActive ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100)) : 0;
  const prixHorsDroits = commissionAgentInclusFAI ? (prixBienNegocie - honorairesCA) : prixBienNegocie;
  const droitsEnregistrement = prixHorsDroits * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);
  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + (commissionAgentInclusFAI ? 0 : honorairesCA)
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
  const rendementLocatifMoyen = prixRevient > 0 && loyerMoyen > 0 ? (loyerMoyen / prixRevient) * 100 : 0;
  const surface = project.sim_surface || project.surface_m2 || 0;

  const formatPrice = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
    if (val >= 1000) return `${Math.round(val / 1000)}K €`;
    return `${Math.round(val)} €`;
  };

  return (
    <div
      className="group cursor-pointer"
      onClick={() => navigate(`/ProjetDetail?id=${project.id}`)}
    >
      <div className="relative bg-[#0a0f0e] rounded-md border border-[#16201f] overflow-hidden hover:border-[#33d6c0]/20 transition-all duration-500">
        {/* Image band */}
        <div className="relative h-48 md:h-56 overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f0e] via-[#0a0f0e]/30 to-transparent" />
          
          {/* Status badge */}
          <div className="absolute top-4 left-4">
            <span className="text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full bg-[#050807]/60 backdrop-blur-sm text-[#33d6c0] border border-[#33d6c0]/20">
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {/* Conseiller avatar */}
          <div className="absolute top-3 right-3">
            <img
              src="https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png"
              alt="Jules Barthomeuf"
              className="w-9 h-9 rounded-full object-cover border-2 border-white/20 shadow-lg"
            />
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-xl md:text-2xl font-light text-white tracking-tight leading-tight">
              {project.titre}
            </h2>
            {project.adresse_complete && (
              <p className="text-white/40 text-sm mt-1">{project.adresse_complete}</p>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="p-5 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2 min-w-0">
            <div className="min-w-0">
              <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Prix de revient</p>
              <p className="text-[#33d6c0] text-lg font-light">{formatPrice(prixRevient)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Rendement</p>
              <p className="text-white text-lg font-light">{rendementLocatifMoyen.toFixed(2)}%</p>
            </div>
            {surface > 0 && (
              <div className="min-w-0">
                <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Surface</p>
                <p className="text-white text-lg font-light">{surface} m²</p>
              </div>
            )}
          </div>
          <div className="w-10 h-10 flex-shrink-0 rounded-full border border-[#16201f] flex items-center justify-center group-hover:border-[#33d6c0]/30 group-hover:bg-[#33d6c0]/5 transition-all">
            <ArrowUpRight className="w-4 h-4 text-white/20 group-hover:text-[#33d6c0] transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}