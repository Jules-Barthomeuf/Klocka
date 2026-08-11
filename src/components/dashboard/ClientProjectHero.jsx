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

export default function ClientProjectHero({ project }) {
  const navigate = useNavigate();

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
  const rendementLocatifMoyen = prixRevient > 0 && loyerMoyen > 0 ? (loyerMoyen / prixRevient) * 100 : 0;
  const surface = project.sim_surface || project.surface_m2 || 0;

  const formatCurrency = (val) => {
    if (!val) return "—";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="cursor-pointer group"
      onClick={() => navigate(createPageUrl(`ProjetDetail?id=${project.id}`))}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 bg-[#0A0A0A] rounded-2xl border border-white/[0.06] overflow-hidden hover:border-[#2A9D8F]/20 transition-all duration-500">
        {/* Left - Info */}
        <div className="p-6 md:p-10 flex flex-col justify-between order-2 md:order-1">
          <div>
            {/* Status */}
            <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-4">
              {statutLabels[project.statut] || project.statut}
            </p>

            {/* Title */}
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-light text-white tracking-tight leading-[1.1] mb-3">
              {project.titre}
            </h2>

            {/* Address */}
            {project.adresse_complete && (
              <p className="text-white/40 text-sm mb-8">{project.adresse_complete}</p>
            )}

            {/* KPIs Row */}
            <div className="flex flex-wrap gap-x-8 gap-y-4 mb-6">
              <div>
                <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1">Prix de revient</p>
                <p className="text-[#2A9D8F] text-xl md:text-2xl font-light">{formatCurrency(prixRevient)}</p>
              </div>
              <div>
                <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1">Rendement</p>
                <p className="text-white text-xl md:text-2xl font-light">{rendementLocatifMoyen.toFixed(2)}%</p>
              </div>
              {loyerAnnuelInitial > 0 && (
                <div>
                  <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1">Loyer annuel</p>
                  <p className="text-white text-xl md:text-2xl font-light">{formatCurrency(loyerAnnuelInitial)}</p>
                </div>
              )}
            </div>

            {/* Secondary KPIs */}
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {surface > 0 && (
                <div>
                  <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1">Surface</p>
                  <p className="text-white/70 text-base font-light">{surface} m²</p>
                </div>
              )}
              {project.nom_locataire && (
                <div>
                  <p className="text-white/30 uppercase tracking-[0.15em] text-[10px] mb-1">Locataire</p>
                  <p className="text-white/70 text-base font-light">{project.nom_locataire}</p>
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex items-center gap-2 text-[#2A9D8F] text-xs uppercase tracking-[0.2em] group-hover:gap-3 transition-all">
              <span>Voir le projet</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Right - Image */}
        <div className="relative h-64 md:h-auto min-h-[300px] md:min-h-[400px] overflow-hidden order-1 md:order-2">
          {project.photos && project.photos.length > 0 ? (
            <img
              src={project.photos[0]}
              alt={project.titre}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#111] to-[#080808] flex items-center justify-center">
              <MapPin className="w-16 h-16 text-white/[0.04]" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}