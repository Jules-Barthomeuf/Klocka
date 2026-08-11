import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { MapPin, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

export default function ClientProjectCard({ project, index = 0 }) {
  const navigate = useNavigate();

  // Calculer le prix de revient
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

  // Rendement locatif moyen
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
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group cursor-pointer"
      onClick={() => navigate(createPageUrl(`ProjetDetail?id=${project.id}`))}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 bg-[#111111] rounded-2xl overflow-hidden border border-white/5 hover:border-[#2A9D8F]/30 transition-all duration-500">
        {/* Left side - Info */}
        <div className="p-5 md:p-6 flex flex-col justify-between order-2 md:order-1">
          <div>
            <p className="text-[#2A9D8F] uppercase tracking-[0.2em] text-[10px] font-medium mb-3">
              {statutLabels[project.statut] || project.statut}
            </p>
            <h2 className="text-xl md:text-2xl font-light text-white leading-tight tracking-tight mb-2">
              {project.titre}
            </h2>
            {project.adresse_complete && (
              <p className="text-white/40 text-sm mt-2 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {project.adresse_complete}
              </p>
            )}
          </div>

          {/* KPIs grid */}
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1.5">Prix de revient</p>
                <p className="text-[#2A9D8F] text-lg md:text-xl font-light">{formatPrice(prixRevient)}</p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1.5">Rendement</p>
                <p className="text-white text-lg md:text-xl font-light">{rendementLocatifMoyen.toFixed(2)}%</p>
              </div>
              {surface > 0 && (
                <div>
                  <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1.5">Surface</p>
                  <p className="text-white text-lg md:text-xl font-light">{surface} m²</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
              <span className="text-[#2A9D8F]/60 text-xs uppercase tracking-wider">Voir le détail</span>
              <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:border-[#2A9D8F]/50 group-hover:bg-[#2A9D8F]/10 transition-all duration-300">
                <ArrowUpRight className="w-3.5 h-3.5 text-white/40 group-hover:text-[#2A9D8F] transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Image */}
        <div className="relative h-48 md:h-auto min-h-[220px] overflow-hidden order-1 md:order-2">
          {project.photos && project.photos.length > 0 ? (
            <img
              src={project.photos[0]}
              alt={project.titre}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] flex items-center justify-center">
              <MapPin className="w-16 h-16 text-white/10" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#111111]/50 hidden md:block" />
        </div>
      </div>
    </motion.div>
  );
}