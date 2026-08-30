import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ArrowRight, BarChart2, Building2, BookOpen, Calculator, Brain, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const features = [
  {
    icon: Building2,
    titre: "Suivi de vos projets",
    description: "Accédez à une vue détaillée de chaque projet immobilier : localisation, rendement, locataire, bail et bien plus encore.",
  },
  {
    icon: Calculator,
    titre: "Simulateur de rentabilité",
    description: "Simulez la rentabilité de vos investissements avec des paramètres financiers précis : crédit, fiscalité, revente.",
  },
  {
    icon: TrendingUp,
    titre: "Vision patrimoniale",
    description: "Visualisez l'évolution de votre patrimoine sur 20 ans avec des graphiques interactifs et des projections dynamiques.",
  },
  {
    icon: BarChart2,
    titre: "Comparateur de projets",
    description: "Comparez plusieurs opportunités côte à côte pour identifier les meilleurs investissements selon vos critères.",
  },
  {
    icon: BookOpen,
    titre: "Ressources & formation",
    description: "Accédez à nos guides, vidéos et webinars pour maîtriser les fondamentaux de l'immobilier commercial.",
  },
  {
    icon: Brain,
    titre: "KlockAI – Assistant IA",
    description: "Posez vos questions à notre assistant intelligent, formé sur les spécificités de l'immobilier commercial.",
  },
];

export default function NewUserWelcome({ user }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] flex flex-col">
      {/* Navbar simple */}
      <nav className="flex items-center justify-between px-8 md:px-16 py-6">
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
          alt="Klocka"
          className="h-8 w-auto"
        />
        <button
          onClick={() => base44.auth.logout()}
          className="text-sm text-[#9298a6] hover:text-[#f2f3f5] transition-colors"
        >
          Se déconnecter
        </button>
      </nav>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-3xl mx-auto w-full text-center">

        {/* Greeting */}
        <div className="w-10 h-0.5 bg-[#96c0b8] mb-8 mx-auto"></div>
        <h1
          style={{ fontFamily: "'Instrument Sans', Georgia, serif", fontWeight: 400 }}
          className="text-4xl md:text-5xl text-[#f2f3f5] mb-4 leading-tight"
        >
          Bienvenue{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""} !
        </h1>
        <p className="text-[#9298a6] text-base md:text-lg mb-12 max-w-lg">
          Pour commencer votre parcours d'investissement, remplissez notre questionnaire de découverte.
        </p>

        {/* CTA principal */}
        <a
          href="https://dpe3smipjxh.typeform.com/to/GD7sREFs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5] font-semibold px-8 py-4 rounded-lg transition-all duration-200 text-sm group mb-12"
        >
          Remplir le questionnaire
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </a>

        {/* Séparateur */}
        <div className="w-full border-t border-[#f2f3f5]/[0.07] mb-12"></div>

        {/* Message appel découverte */}
        <div className="bg-[#f2f3f5]/[0.03] border border-[#1f2228] rounded-md px-8 py-6 mb-12 max-w-lg w-full">
          <p className="text-[#c9cdd6] text-sm leading-relaxed">
            <span className="text-[#f2f3f5] font-medium">Vous avez déjà effectué votre appel de découverte ?</span>
            <br />
            Pas de panique, nous allons vous débloquer l'accès d'ici peu !
          </p>
        </div>

        {/* Carousel fonctionnalités */}
        <div className="w-full max-w-lg">
          <p className="text-xs text-[#6a7180] uppercase tracking-widest mb-6">Ce qui vous attend sur la plateforme</p>
          <div className="relative h-40">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
                className="absolute inset-0 bg-[#f2f3f5]/[0.03] border border-[#1f2228] rounded-md px-8 py-6 flex flex-col items-center justify-center text-center"
              >
                {React.createElement(features[current].icon, { className: "w-6 h-6 text-[#96c0b8] mb-3" })}
                <h3 className="text-[#f2f3f5] font-medium mb-2">{features[current].titre}</h3>
                <p className="text-[#9298a6] text-sm leading-relaxed">{features[current].description}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {features.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? "w-6 bg-[#96c0b8]" : "w-1.5 bg-[#f2f3f5]/20"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}