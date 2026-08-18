import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Handshake, TrendingUp, LayoutDashboard, Sparkles } from "lucide-react";
import { NeonButton } from "@/components/ui/neon-button";

const slides = [
  {
    icon: Handshake,
    title: "Onglet Négociation",
    desc: "Comparez en un clin d'œil l'impact de chaque niveau de négociation sur le prix de revient, le rendement et la création de richesse — et appliquez le scénario directement au tableau détaillé.",
  },
  {
    icon: TrendingUp,
    title: "Simulation de loyer",
    desc: "Le nouvel onglet Loyer visualise l'effet d'une revalorisation (ou baisse) du loyer sur votre rendement, cash-flow, valeur de revente et création de richesse.",
  },
  {
    icon: LayoutDashboard,
    title: "Graphiques repensés",
    desc: "Une nouvelle façon de visualiser vos investissements, plus claire et plus parlante.",
  },
  {
    icon: Sparkles,
    title: "Une interface repensée",
    desc: "Nouvelle disposition en régions, KPI plus lisibles et tableaux repliables pour une expérience plus agréable.",
  },
];

export default function SimWhatsNewDialog({ onClose }) {
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const Icon = slide.icon;
  const isLast = index === slides.length - 1;

  const next = () => (isLast ? onClose() : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="absolute inset-0 bg-[#0a0c0c]/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-lg bg-gradient-to-br from-[#0a0c0c] to-black border border-[#edeae5]/[0.1] rounded-md overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-[#8b9391] hover:text-[#edeae5] transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#35a79b] mb-2">Nouveautés</p>
          <h2 className="text-2xl font-light text-[#edeae5] mb-8">Le simulateur fait peau neuve</h2>

          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-[180px] flex flex-col items-center justify-center"
            >
              <div className="w-16 h-16 rounded-md bg-[#35a79b]/15 border border-[#35a79b]/30 flex items-center justify-center mb-5">
                <Icon className="w-7 h-7 text-[#35a79b]" />
              </div>
              <h3 className="text-lg text-[#edeae5] font-medium mb-3">{slide.title}</h3>
              <p className="text-sm text-[#9aa19e] leading-relaxed max-w-sm">{slide.desc}</p>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-center gap-2 mt-8 mb-6">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-[#35a79b]" : "w-1.5 bg-[#edeae5]/20 hover:bg-[#edeae5]/40"}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              onClick={prev}
              disabled={index === 0}
              className="flex items-center gap-1 text-sm text-[#9aa19e] hover:text-[#edeae5] transition-colors disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" /> Précédent
            </button>
            <NeonButton onClick={next} variant="default" className="inline-flex items-center justify-center">
              {isLast ? "Découvrir" : "Suivant"}
              {!isLast && <ChevronRight className="w-4 h-4 ml-1.5" />}
            </NeonButton>
          </div>
        </div>
      </motion.div>
    </div>
  );
}