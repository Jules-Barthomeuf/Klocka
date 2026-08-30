import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  BookOpen, Calendar, ArrowRight, Download, ChevronDown,
  Calculator, TrendingUp, Scale, Building2, MapPin, ArrowUpRight, Search
} from "lucide-react";
import DashboardProjectCard from "./DashboardProjectCard";
import RendezVousStrategique from "@/components/dashboard/RendezVousStrategique";
import DashboardProfileCard from "./DashboardProfileCard";
import DashboardStrategyCard from "./DashboardStrategyCard";
import DashboardSuggestedResources from "./DashboardSuggestedResources";
import DashboardQuizInline from "./DashboardQuizInline";

const etapeDescriptions = {
  1: "Acculturation à l'immobilier commercial",
  2: "Définition de votre stratégie",
  3: "Recherche & analyse de projet",
  4: "Recherche du financement",
  5: "Signature de l'acte authentique"
};

function StepProgressBar({ etapes, userEtape }) {
  const steps = etapes.filter(e => e.numero !== 0);
  const progression = Math.max(0, Math.min(1, (userEtape - 1) / (steps.length - 1)));

  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] uppercase text-[#aab6f5] mb-6">Votre parcours</div>
      <div className="relative">
        {/* Filet de fond + progression */}
        <div className="absolute left-0 right-0 top-[5px] h-px bg-[#f2f3f5]/[0.14]" />
        <motion.div
          className="absolute left-0 top-[4.5px] h-[2px] bg-[#8fa0f2]"
          initial={{ width: 0 }}
          animate={{ width: `${progression * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <div className="relative flex justify-between">
          {steps.map((step, i) => {
            const num = step.numero;
            const isCompleted = num < userEtape;
            const isCurrent = num === userEtape;
            return (
              <div key={num} className={`flex flex-col ${i === 0 ? "items-start" : i === steps.length - 1 ? "items-end" : "items-center"}`}>
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.07, duration: 0.3 }}
                  className={`w-[11px] h-[11px] rounded-full border-2 ${
                    isCurrent
                      ? "border-[#8fa0f2] bg-[#000000]"
                      : isCompleted
                        ? "border-[#8fa0f2] bg-[#8fa0f2]"
                        : "border-[#f2f3f5]/[0.2] bg-[#000000]"
                  }`}
                />
                <span className={`mt-3 text-[10px] tracking-[0.14em] uppercase ${isCurrent ? "text-[#aab6f5]" : isCompleted ? "text-[#c9cdd6]" : "text-[#6a7180]"} max-md:hidden`}>
                  {step.titre}
                </span>
                {isCurrent && (
                  <span className="mt-1 text-[12px] text-[#9298a6] max-md:hidden">{etapeDescriptions[userEtape]}</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Mobile : étape courante seule */}
        <div className="md:hidden mt-4">
          <span className="text-[10px] tracking-[0.14em] uppercase text-[#aab6f5]">{steps.find(s2 => s2.numero === userEtape)?.titre}</span>
          <p className="text-[12px] text-[#9298a6] mt-0.5 mb-0">{etapeDescriptions[userEtape]}</p>
        </div>
      </div>
    </div>
  );
}

function OnboardingCard({ icon: Icon, title, description, cta, onClick, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      onClick={onClick}
      className="group cursor-pointer border-t border-[#f2f3f5]/[0.35] pt-5 pb-2 transition-colors hover:border-[#8fa0f2]/60"
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[#8fa0f2]" />
        <h3 className="text-[#f2f3f5] text-[15px] font-light m-0">{title}</h3>
      </div>
      <p className="text-[#9298a6] text-[13px] leading-[1.7] mb-4">{description}</p>
      <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-[#aab6f5] group-hover:text-[#f2f3f5] transition-colors">
        {cta} <ArrowRight className="w-3 h-3" />
      </span>
    </motion.div>
  );
}

export default function ClientDashboardView({
  user, userEtape, etapes, projects, resources, userStrategy, userProfil, videoAccueilUrl
}) {
  const navigate = useNavigate();
  const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0];

  return (
    <div className="min-h-screen bg-[#000000]">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">

        {/* Header row: greeting + search */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5] m-0">
                Bonjour, {firstName}
              </h1>
              <p className="text-[13.5px] leading-[1.7] text-[#9298a6] mt-2 mb-0">Votre parcours d'investissement, étape par étape.</p>
            </div>
          </div>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="mb-10 max-md:mb-8"
        >
          <StepProgressBar etapes={etapes} userEtape={userEtape} />
        </motion.div>

        {/* Étape 1 — le rendez-vous d'abord, l'acculturation ensuite et sans
            obligation. La fenêtre le dit à l'arrivée ; les cartes le redisent. */}
        {userEtape === 1 && <RendezVousStrategique user={user} />}
        {userEtape === 1 && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <OnboardingCard
                icon={Calendar}
                title="Définissons votre stratégie"
                description="Un rendez-vous de quarante-cinq minutes avec votre conseiller : tout part de là."
                cta={user?.rdv_strategique_le ? "Reprendre rendez-vous" : "Prendre rendez-vous"}
                onClick={() => navigate(createPageUrl("Questionnaire"))}
                delay={0.15}
              />
              <OnboardingCard
                icon={BookOpen}
                title="Acculturez-vous, à votre rythme"
                description="Guides, vidéos et webinars pour comprendre l'immobilier commercial. Facultatif, et toujours accessible."
                cta="Accéder aux ressources"
                onClick={() => navigate(createPageUrl("Ressources"))}
                delay={0.2}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        {userEtape >= 1 && (
          <div className="space-y-5">

            {/* Projects + Profile row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Projects (left, larger) */}
              <div className="md:col-span-8">
                {projects.length > 0 ? (
                  <DashboardProjectCard projects={projects} />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-[#0f1114] border border-[#f2f3f5]/[0.12] p-8 flex flex-col items-center justify-center min-h-[240px]"
                  >
                    <Building2 className="w-10 h-10 text-[#f2f3f5]/[0.06] mb-3" />
                    <p className="text-[#f2f3f5]/20 text-sm mb-1">Aucun projet en cours</p>
                    <p className="text-[#f2f3f5]/10 text-xs">Vos projets apparaîtront ici.</p>
                  </motion.div>
                )}
              </div>

              {/* Profile card (right) */}
              <div className="md:col-span-4">
                <DashboardProfileCard user={user} />
              </div>
            </div>

            {/* Suggested resources */}
            <DashboardSuggestedResources user={user} />

            {/* Strategy + Quiz row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                {userEtape >= 2 && <DashboardStrategyCard userStrategy={userStrategy} />}
              </div>
              <DashboardQuizInline resources={resources} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}