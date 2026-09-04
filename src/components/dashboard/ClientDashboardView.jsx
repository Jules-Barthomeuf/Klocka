import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { RENDEZ_VOUS_URL } from "@/lib/rendezVous";
import { libelleProfil } from "@/lib/profils";
import LogoKlocka from "@/components/LogoKlocka";
import {
  BookOpen, Calendar, ArrowRight, Download, ChevronDown,
  Calculator, TrendingUp, Scale, Building2, MapPin, ArrowUpRight, Search, X
} from "lucide-react";
import DashboardProjectCard from "./DashboardProjectCard";
import DashboardProfileCard from "./DashboardProfileCard";
import DashboardStrategyCard from "./DashboardStrategyCard";
import DashboardSuggestedResources from "./DashboardSuggestedResources";

const etapeDescriptions = {
  1: "Acculturation à l'immobilier commercial",
  2: "Définition de votre stratégie",
  3: "Recherche & analyse de projet",
  4: "Recherche du financement",
  5: "Signature de l'acte authentique"
};

function StepProgressBar({ etapes, userEtape }) {
  const steps = etapes.filter(e => e.numero !== 0);
  // Chaque étape occupe une colonne de largeur égale, son point au centre : le
  // trait part du premier point et s'arrête exactement sur celui de l'étape en
  // cours — il ne dépassait plus d'un cheveu, il dépassait d'une colonne.
  const n = steps.length;
  const centre = (i) => ((i + 0.5) / n) * 100;
  const atteint = Math.max(0, Math.min(n - 1, steps.findIndex((e) => e.numero === userEtape)));
  const debut = centre(0);
  const largeur = centre(atteint) - debut;

  return (
    <div>
      <div className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6] mb-6">Votre parcours</div>
      <div className="relative">
        {/* Filet de fond + progression */}
        <div className="absolute top-[5px] h-px bg-[#f2f3f5]/[0.14]" style={{ left: `${debut}%`, right: `${debut}%` }} />
        <motion.div
          className="absolute top-[4.5px] h-[2px] bg-[#96c0b8]"
          style={{ left: `${debut}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${largeur}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <div className="relative flex">
          {steps.map((step, i) => {
            const num = step.numero;
            const isCompleted = num < userEtape;
            const isCurrent = num === userEtape;
            return (
              <div key={num} className="flex-1 min-w-0 flex flex-col items-center text-center">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.07, duration: 0.3 }}
                  className={`w-[11px] h-[11px] rounded-full border-2 ${
                    isCurrent
                      ? "border-[#96c0b8] bg-[#000000]"
                      : isCompleted
                        ? "border-[#96c0b8] bg-[#96c0b8]"
                        : "border-[#f2f3f5]/[0.2] bg-[#000000]"
                  }`}
                />
                <span className={`mt-3 text-[10px] tracking-[0.14em] uppercase ${isCurrent ? "text-[#c3ddd6]" : isCompleted ? "text-[#c9cdd6]" : "text-[#6a7180]"} max-md:hidden`}>
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
          <span className="text-[10px] tracking-[0.14em] uppercase text-[#c3ddd6]">{steps.find(s2 => s2.numero === userEtape)?.titre}</span>
          <p className="text-[12px] text-[#9298a6] mt-0.5 mb-0">{etapeDescriptions[userEtape]}</p>
        </div>
      </div>
    </div>
  );
}

function OnboardingCard({ icon: Icon, title, description, cta, onClick, delay = 0, numero, principal = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      onClick={onClick}
      className={`group cursor-pointer rounded-xl px-6 py-6 flex flex-col transition-colors ${
        principal
          ? "bg-[#96c0b8]/[0.07] border border-[#96c0b8]/40 hover:border-[#96c0b8]"
          : "bg-[#0f1114] border border-[#22262d] hover:border-[#3a3f4a]"
      }`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        {numero && (
          <span className={`w-6 h-6 rounded-full flex-none flex items-center justify-center text-[11px] font-semibold ${
            principal ? "bg-[#96c0b8] text-[#000000]" : "border border-[#3a3f4a] text-[#9298a6]"
          }`}>{numero}</span>
        )}
        <Icon className="w-4 h-4 text-[#96c0b8]" />
        <h3 className="text-[#f2f3f5] text-[17px] font-medium m-0">{title}</h3>
      </div>
      <p className="text-[#9298a6] text-[13.5px] leading-[1.7] mb-5 flex-1">{description}</p>
      <span
        className={`inline-flex items-center gap-2 self-start rounded-full transition-colors ${
          principal
            ? "px-6 py-3 bg-[#96c0b8] text-[#000000] text-[13px] font-semibold group-hover:bg-[#abd0c8]"
            : "px-4 py-2 border border-[#2c3139] text-[#c9cdd6] text-[12.5px] group-hover:border-[#96c0b8] group-hover:text-[#96c0b8]"
        }`}
      >
        {cta} <ArrowRight className={principal ? "w-4 h-4" : "w-3 h-3"} />
      </span>
    </motion.div>
  );
}

// Le rendez-vous se prend sans quitter la plateforme : Calendly s'ouvre dans
// la page, en grand, et se referme d'un clic.
export function FenetreRendezVous({ user, onFermer }) {
  const url = `${RENDEZ_VOUS_URL}?hide_gdpr_banner=1&background_color=0f1114&text_color=f2f3f5&primary_color=96c0b8` +
    `${user?.email ? `&email=${encodeURIComponent(user.email)}` : ""}` +
    `${user?.full_name ? `&name=${encodeURIComponent(user.full_name)}` : ""}`;
  useEffect(() => {
    const echap = (e) => e.key === "Escape" && onFermer();
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={onFermer}>
      <div className="w-full max-w-[900px] h-[86vh] bg-[#0f1114] border border-[#22262d] rounded-xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-[#1f2228]">
          <LogoKlocka className="h-10" />
          <div className="flex items-center gap-5">
            <p className="m-0 text-[12.5px] text-[#9298a6] max-md:hidden">Définition de votre stratégie · 45 min</p>
            <button onClick={onFermer} className="text-[#6a7180] hover:text-[#f2f3f5] transition-colors" aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <iframe title="Prendre rendez-vous" src={url} className="flex-1 w-full border-0" />
      </div>
    </div>
  );
}

// Aucun projet encore attribué : on dit où on en est, et ce qu'on cherche.
function EnRecherche({ user, userEtape, onRendezVous }) {
  const criteres = [
    ["Budget", user?.budget ? `${Math.round(user.budget).toLocaleString("fr-FR")} €` : null],
    ["Apport", user?.apport_disponible ? `${Math.round(user.apport_disponible).toLocaleString("fr-FR")} €` : null],
    ["Objectif", user?.objectif || null],
    ["Lieu de recherche", user?.lieu_recherche || null],
    ["Profil", libelleProfil(user?.profil_investisseur) || null],
  ].filter(([, v]) => v);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-[#0f1114] border border-[#22262d] rounded-xl p-8 min-h-[240px] flex flex-col"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <Search className="w-4 h-4 text-[#96c0b8]" />
        <h3 className="m-0 text-[17px] font-medium text-[#f2f3f5]">
          {userEtape >= 3 ? "Oups…" : "Pas encore de projet"}
        </h3>
      </div>
      {userEtape >= 3 ? (
        <>
          <p className="m-0 text-[13.5px] leading-[1.7] text-[#9298a6]">
            Aucun projet ne vous a encore été attribué. Nos équipes mettent tout en œuvre pour vous proposer le
            projet idéal, répondant au mieux à votre cahier des charges.
          </p>
          {criteres.length > 0 && (
            <dl className="m-0 mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
              {criteres.map(([cle, valeur]) => (
                <div key={cle} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-[#1f2228]">
                  <dt className="text-[12px] text-[#6a7180]">{cle}</dt>
                  <dd className="m-0 text-[13.5px] text-[#f2f3f5] text-right">{valeur}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      ) : (
        <>
          <p className="m-0 text-[13.5px] leading-[1.7] text-[#9298a6]">
            Nous n'avons pas encore de projet pour vous, et c'est normal : définissons d'abord ensemble votre
            stratégie d'investissement, puis la recherche commence.
          </p>
          <button
            onClick={onRendezVous}
            className="mt-6 self-start inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#96c0b8] text-[#000000] text-[13px] font-semibold hover:bg-[#abd0c8] transition-colors"
          >
            Prendre rendez-vous <ArrowRight className="w-4 h-4" />
          </button>
        </>
      )}
    </motion.div>
  );
}

export default function ClientDashboardView({
  user, userEtape, etapes, projects, resources, userStrategy, userProfil, videoAccueilUrl
}) {
  const navigate = useNavigate();
  const [rdvOuvert, setRdvOuvert] = useState(false);
  const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0];

  return (
    <div className="min-h-screen bg-[#000000]">
      {rdvOuvert && <FenetreRendezVous user={user} onFermer={() => { setRdvOuvert(false); base44.auth.updateMe({ rdv_strategique_le: new Date().toISOString() }).catch(() => {}); }} />}
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

        {/* Étape 1 — les cartes disent le rendez-vous et l'acculturation ;
            aucune fenêtre ne s'impose à l'arrivée. */}
        {userEtape === 1 && (
          <div className="space-y-4 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <OnboardingCard
                numero="1"
                icon={BookOpen}
                title="Acculturez-vous, à votre rythme"
                description="Guides, vidéos et webinars : accédez à cette partie pour que l'immobilier commercial n'ait plus de secrets pour vous."
                cta="Accéder aux ressources"
                onClick={() => navigate(createPageUrl("Ressources"))}
                delay={0.15}
              />
              <OnboardingCard
                numero="2"
                icon={Calendar}
                title="Définissons votre stratégie"
                description="Planifiez dès à présent ce rendez-vous afin de bâtir ensemble votre cahier des charges."
                cta={user?.rdv_strategique_le ? "Reprendre rendez-vous" : "Prendre rendez-vous"}
                onClick={() => setRdvOuvert(true)}
                principal
                delay={0.2}
              />
            </div>
          </div>
        )}

        {userEtape === 1 && <DashboardSuggestedResources user={user} />}

        {/* Main content */}
        {userEtape >= 2 && (
          <div className="space-y-5">

            {/* Projects + Profile row */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Projects (left, larger) */}
              <div className="md:col-span-8">
                {projects.length > 0 ? (
                  <DashboardProjectCard projects={projects} />
                ) : (
                  <EnRecherche user={user} userEtape={userEtape} onRendezVous={() => setRdvOuvert(true)} />
                )}
              </div>

              {/* Profile card (right) */}
              <div className="md:col-span-4">
                <DashboardProfileCard user={user} />
              </div>
            </div>

            {/* Suggested resources */}
            <DashboardSuggestedResources user={user} />

            {userEtape >= 2 && <DashboardStrategyCard userStrategy={userStrategy} />}
          </div>
        )}
      </div>
    </div>
  );
}