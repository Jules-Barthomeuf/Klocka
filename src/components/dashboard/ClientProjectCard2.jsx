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
      <div className="relative bg-[#0f1114] border border-[#f2f3f5]/[0.12] overflow-hidden hover:border-[#8fa0f2]/60 transition-colors duration-300">
        {/* Image band */}
        <div className="relative h-48 md:h-56 overflow-hidden">
          {project.photos && project.photos.length > 0 ? (
            <img
              src={project.photos[0]}
              alt={project.titre}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-[#000000] flex items-center justify-center">
              <MapPin className="w-10 h-10 text-[#f2f3f5]/[0.06]" />
            </div>
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(14,16,15,0.97) 6%, rgba(14,16,15,0.35) 55%, rgba(14,16,15,0.55) 100%)" }} />
          
          {/* Status badge */}
          <div className="absolute top-4 left-4">
            <span className="text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full bg-[#000000]/70 backdrop-blur-sm text-[#aab6f5] border border-[#8fa0f2]/50">
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {/* Conseiller avatar */}
          <div className="absolute top-3 right-3">
            <img
              src="https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png"
              alt="Jules Barthomeuf"
              className="w-9 h-9 rounded-full object-cover border border-[#f2f3f5]/25"
            />
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-[21px] md:text-[23px] font-light text-[#f2f3f5] tracking-[-0.02em] leading-tight truncate">
              {project.titre}
            </h2>
            {project.adresse_complete && (
              <p className="text-[#c9cdd6]/70 text-[13px] mt-1 truncate">{project.adresse_complete}</p>
            )}
          </div>
        </div>

        {/* Chiffres clés — filets fins, chiffres alignés */}
        <div className="flex items-center px-5 border-t border-[#f2f3f5]/[0.12]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <div className="flex-1 min-w-0 py-4 pr-4">
            <p className="text-[19px] font-light text-[#f2f3f5] m-0">{formatPrice(prixRevient)}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#9298a6] mt-1 m-0 whitespace-nowrap">Prix de revient</p>
          </div>
          <div className="flex-1 min-w-0 py-4 px-4 border-l border-[#f2f3f5]/[0.12]">
            <p className="text-[19px] font-light text-[#aab6f5] m-0">{rendementLocatifMoyen.toFixed(2).replace(".", ",")} %</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#9298a6] mt-1 m-0">Rendement</p>
          </div>
          {surface > 0 && (
            <div className="flex-1 min-w-0 py-4 px-4 border-l border-[#f2f3f5]/[0.12]">
              <p className="text-[19px] font-light text-[#f2f3f5] m-0">{surface} m²</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#9298a6] mt-1 m-0">Surface</p>
            </div>
          )}
          <div className="w-9 h-9 flex-shrink-0 rounded-full border border-[#f2f3f5]/[0.14] flex items-center justify-center group-hover:border-[#8fa0f2] transition-colors">
            <ArrowUpRight className="w-4 h-4 text-[#9298a6] group-hover:text-[#aab6f5] transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}