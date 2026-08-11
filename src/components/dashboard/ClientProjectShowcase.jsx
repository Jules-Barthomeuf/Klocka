import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ChevronLeft, ChevronRight, MapPin, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

function ProjectCard({ project }) {
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

  const formatPrice = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
    if (val >= 1000) return `${Math.round(val / 1000)}K €`;
    return `${Math.round(val)} €`;
  };

  return (
    <div
      className="group cursor-pointer"
      onClick={() => navigate(createPageUrl(`ProjetDetail?id=${project.id}`))}
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-0 bg-[#0A0A0A] rounded-2xl overflow-hidden border border-white/[0.06] hover:border-[#2A9D8F]/30 transition-all duration-500">
        {/* Left side - Info (3 cols) */}
        <div className="md:col-span-3 p-6 md:p-8 flex flex-col justify-between order-2 md:order-1">
          <div>
            <p className="text-[#2A9D8F] uppercase tracking-[0.25em] text-[11px] font-medium mb-4">
              {statutLabels[project.statut] || project.statut}
            </p>

            <h2 className="text-2xl md:text-3xl font-light text-white leading-tight tracking-tight">
              {project.titre}
            </h2>
            {project.adresse_complete && (
              <p className="text-white/35 text-sm mt-3 flex items-center gap-2">
                {project.adresse_complete}
              </p>
            )}
          </div>

          {/* KPIs */}
          <div className="mt-8">
            <div className="grid grid-cols-3 gap-6 md:gap-8">
              <div>
                <p className="text-white/25 uppercase tracking-[0.2em] text-[10px] mb-2">Prix de revient</p>
                <p className="text-[#2A9D8F] text-xl md:text-2xl font-light">{formatPrice(prixRevient)}</p>
              </div>
              <div>
                <p className="text-white/25 uppercase tracking-[0.2em] text-[10px] mb-2">Rendement</p>
                <p className="text-white text-xl md:text-2xl font-light">{rendementLocatifMoyen.toFixed(2)}%</p>
              </div>
              {surface > 0 && (
                <div>
                  <p className="text-white/25 uppercase tracking-[0.2em] text-[10px] mb-2">Surface</p>
                  <p className="text-white text-xl md:text-2xl font-light">{surface} m²</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-white/[0.04] flex items-center justify-between">
              <span className="text-[#2A9D8F]/50 text-xs uppercase tracking-[0.2em]">Voir le détail</span>
              <div className="w-9 h-9 rounded-full border border-white/[0.08] flex items-center justify-center group-hover:border-[#2A9D8F]/40 group-hover:bg-[#2A9D8F]/5 transition-all duration-300">
                <ArrowUpRight className="w-4 h-4 text-white/30 group-hover:text-[#2A9D8F] transition-colors" />
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Image (2 cols) */}
        <div className="md:col-span-2 relative h-52 md:h-auto min-h-[260px] overflow-hidden order-1 md:order-2">
          {project.photos && project.photos.length > 0 ? (
            <img
              src={project.photos[0]}
              alt={project.titre}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#111] to-[#080808] flex items-center justify-center">
              <MapPin className="w-16 h-16 text-white/[0.06]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-l from-transparent to-[#0A0A0A]/40 hidden md:block" />
        </div>
      </div>
    </div>
  );
}

export default function ClientProjectShowcase({ projects }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (projects.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % projects.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [projects.length]);

  if (!projects.length) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-white/25 uppercase tracking-[0.25em] text-[10px] font-medium">
          {projects.length === 1 ? 'Mon projet' : 'Mes projets'}
        </p>
        {projects.length > 1 && (
          <div className="flex items-center gap-4">
            <span className="text-white/15 text-xs font-light">{currentIndex + 1} / {projects.length}</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentIndex((prev) => (prev - 1 + projects.length) % projects.length)}
                className="text-white/30 hover:text-white hover:bg-white/5 h-8 w-8 rounded-full"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentIndex((prev) => (prev + 1) % projects.length)}
                className="text-white/30 hover:text-white hover:bg-white/5 h-8 w-8 rounded-full"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.35 }}
        >
          <ProjectCard project={projects[currentIndex]} />
        </motion.div>
      </AnimatePresence>

      {projects.length > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {projects.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`h-[3px] rounded-full transition-all duration-400 ${
                idx === currentIndex ? 'w-8 bg-[#2A9D8F]' : 'w-2 bg-white/[0.08] hover:bg-white/15'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}