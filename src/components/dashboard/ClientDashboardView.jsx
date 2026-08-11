import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  BookOpen, Calendar, ArrowRight, Download, ChevronDown,
  Calculator, TrendingUp, Scale, Building2, MapPin, ArrowUpRight, Search
} from "lucide-react";
import DashboardProjectCard from "./DashboardProjectCard";
import DashboardProfileCard from "./DashboardProfileCard";
import DashboardStrategyCard from "./DashboardStrategyCard";
import DashboardSuggestedResources from "./DashboardSuggestedResources";
import DashboardQuizInline from "./DashboardQuizInline";
import FeedbackWidget from "../FeedbackWidget";

const etapeDescriptions = {
  1: "Acculturation à l'immobilier commercial",
  2: "Définition de votre stratégie",
  3: "Recherche & analyse de projet",
  4: "Recherche du financement",
  5: "Signature de l'acte authentique"
};

function StepProgressBar({ etapes, userEtape }) {
  const steps = etapes.filter(e => e.numero !== 0);

  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/[0.3] px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <span className="text-white text-[10px] uppercase tracking-[0.2em] font-medium">
          Étape en cours
        </span>
        <span className="text-white text-[10px]">
          {etapeDescriptions[userEtape] || ""}
        </span>
      </div>
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const num = step.numero;
          const isCompleted = num < userEtape;
          const isCurrent = num === userEtape;
          const isActive = isCompleted || isCurrent;

          return (
            <div key={num} className="flex flex-col items-center gap-2 flex-1">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all duration-500 ${
                  isCurrent
                    ? 'bg-[#2A9D8F] text-white shadow-[0_0_12px_rgba(42,157,143,0.4)]'
                    : isCompleted
                      ? 'bg-[#2A9D8F]/80 text-white'
                      : 'bg-white/[0.06] text-white/20'
                }`}
              >
                {num}
              </motion.div>
              <span className={`text-[9px] text-center leading-tight transition-colors duration-300 ${
                isActive ? 'text-white' : 'text-white/20'
              }`}>
                {step.titre}
              </span>
            </div>
          );
        })}
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
      className="group cursor-pointer bg-white/[0.04] rounded-2xl border border-white/[0.3] p-5 md:p-6 hover:border-[#2A9D8F]/15 hover:bg-white/[0.06] transition-all duration-500"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#2A9D8F]/[0.07] flex items-center justify-center flex-shrink-0 group-hover:bg-[#2A9D8F]/[0.12] transition-colors">
          <Icon className="w-[18px] h-[18px] text-[#2A9D8F]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white text-sm font-medium mb-1">{title}</h3>
          <p className="text-white/70 text-xs leading-relaxed mb-4">{description}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[#2A9D8F] text-[11px] font-medium">{cta}</span>
            <ArrowRight className="w-3 h-3 text-[#2A9D8F]/50 group-hover:text-[#2A9D8F] group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ClientDashboardView({
  user, userEtape, etapes, projects, resources, userStrategy, userProfil, videoAccueilUrl
}) {
  const navigate = useNavigate();
  const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0];

  return (
    <div className="min-h-screen bg-black">
      <FeedbackWidget />
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">

        {/* Header row: greeting + search */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">
              Bonjour, <span className="italic">{firstName}</span>
            </h1>
          </div>
        </motion.div>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="mb-8"
        >
          <StepProgressBar etapes={etapes} userEtape={userEtape} />
        </motion.div>

        {/* Étape 1 - Onboarding cards */}
        {userEtape === 1 && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <OnboardingCard
                icon={BookOpen}
                title="Maîtrisez les fondamentaux"
                description="Accédez à nos ressources pour comprendre l'immobilier commercial."
                cta="Accéder aux ressources"
                onClick={() => navigate(createPageUrl("Ressources"))}
                delay={0.15}
              />
              <OnboardingCard
                icon={Calendar}
                title="Prêt pour la suite ?"
                description="Définissons ensemble votre stratégie d'investissement."
                cta="Prendre rendez-vous"
                onClick={() => navigate(createPageUrl("Questionnaire"))}
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
                    className="bg-white/[0.04] rounded-2xl border border-white/[0.3] p-8 flex flex-col items-center justify-center min-h-[240px]"
                  >
                    <Building2 className="w-10 h-10 text-white/[0.06] mb-3" />
                    <p className="text-white/20 text-sm mb-1">Aucun projet en cours</p>
                    <p className="text-white/10 text-xs">Vos projets apparaîtront ici.</p>
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