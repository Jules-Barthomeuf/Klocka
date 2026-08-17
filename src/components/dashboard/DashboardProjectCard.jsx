import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MapPin, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

function formatPrice(val) {
  if (!val || val === 0) return "—";
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
  if (val >= 1000) return `${Math.round(val / 1000)}K €`;
  return `${Math.round(val)} €`;
}

function computeMetrics(project) {
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

  return { prixRevient, rendementLocatifMoyen, surface };
}

function ProjectCard({ project }) {
  const navigate = useNavigate();
  const { prixRevient, rendementLocatifMoyen, surface } = computeMetrics(project);

  return (
    <div
      className="group cursor-pointer"
      onClick={() => navigate(`/ProjetDetail?id=${project.id}`)}
    >
      <div className="relative bg-white/[0.04] rounded-md overflow-hidden transition-all duration-500">
        {/* Image */}
        <div className="relative h-44 md:h-52 overflow-hidden">
          {project.photos && project.photos.length > 0 ? (
            <img
              src={project.photos[0]}
              alt={project.titre}
              className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/[0.02] to-transparent flex items-center justify-center">
              <MapPin className="w-10 h-10 text-white/[0.04]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
          
          {/* Status */}
          <div className="absolute top-3.5 left-4">
            <span className="text-[9px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full bg-[#050807]/50 backdrop-blur-sm text-[#33d6c0] border border-[#33d6c0]/15 font-medium">
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {/* Arrow */}
          <div className="absolute top-3.5 right-4">
            <div className="w-8 h-8 rounded-full bg-[#050807]/30 backdrop-blur-sm border border-[#16201f] flex items-center justify-center group-hover:border-[#33d6c0]/20 group-hover:bg-[#33d6c0]/[0.08] transition-all">
              <ArrowUpRight className="w-3.5 h-3.5 text-white/30 group-hover:text-[#33d6c0] transition-colors" />
            </div>
          </div>

          {/* Title */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-lg md:text-xl font-medium text-white tracking-tight leading-tight">
              {project.titre}
            </h2>
            {project.adresse_complete && (
              <p className="text-white text-xs mt-1 flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                {project.adresse_complete}
              </p>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-6 md:gap-10">
            {prixRevient > 0 && (
              <div>
                <p className="text-white/40 text-[9px] uppercase tracking-[0.15em] mb-0.5">Prix de revient</p>
                <p className="text-white text-base font-medium tabular-nums">{formatPrice(prixRevient)}</p>
              </div>
            )}
            {rendementLocatifMoyen > 0 && (
              <div>
                <p className="text-white/40 text-[9px] uppercase tracking-[0.15em] mb-0.5">Rendement</p>
                <p className="text-[#33d6c0] text-base font-medium tabular-nums">{rendementLocatifMoyen.toFixed(2)}%</p>
              </div>
            )}
            {surface > 0 && (
              <div>
                <p className="text-white/40 text-[9px] uppercase tracking-[0.15em] mb-0.5">Surface</p>
                <p className="text-white text-base font-medium tabular-nums">{surface} m²</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const AUTO_INTERVAL = 5000;

export default function DashboardProjectCard({ projects }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const timerRef = useRef(null);

  const goTo = useCallback((next) => {
    setDirection(next > current ? 1 : -1);
    setCurrent(next);
  }, [current]);

  const goNext = useCallback(() => {
    const next = (current + 1) % projects.length;
    setDirection(1);
    setCurrent(next);
  }, [current, projects.length]);

  // Auto-play
  useEffect(() => {
    if (projects.length <= 1) return;
    timerRef.current = setInterval(goNext, AUTO_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [goNext, projects.length]);

  // Reset timer on manual nav
  const manualNav = (next) => {
    clearInterval(timerRef.current);
    goTo(next);
    timerRef.current = setInterval(goNext, AUTO_INTERVAL);
  };

  if (projects.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-white uppercase tracking-[0.2em] text-[10px]">
          {projects.length === 1 ? 'Mon projet' : 'Mes projets'}
        </p>
        {projects.length > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => manualNav((current - 1 + projects.length) % projects.length)}
              className="w-6 h-6 rounded-full border border-[#16201f] flex items-center justify-center text-white/20 hover:text-white/40 hover:border-white/10 transition-all"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-white text-[10px] tabular-nums min-w-[24px] text-center">
              {current + 1}/{projects.length}
            </span>
            <button
              onClick={() => manualNav((current + 1) % projects.length)}
              className="w-6 h-6 rounded-full border border-[#16201f] flex items-center justify-center text-white/20 hover:text-white/40 hover:border-white/10 transition-all"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          initial={{ opacity: 0, x: direction * 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -30 }}
          transition={{ duration: 0.25 }}
        >
          <ProjectCard project={projects[current]} />
        </motion.div>
      </AnimatePresence>

      {/* Dots indicator */}
      {projects.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {projects.map((_, i) => (
            <button
              key={i}
              onClick={() => manualNav(i)}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === current ? 'w-5 bg-[#33d6c0]' : 'w-1.5 bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}