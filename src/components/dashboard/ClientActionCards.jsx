import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BookOpen, Calendar, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientActionCards() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="group cursor-pointer"
        onClick={() => navigate(createPageUrl("Ressources"))}
      >
        <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-7 md:p-8 hover:border-[#2A9D8F]/20 transition-all duration-300 h-full flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-[#2A9D8F]/[0.08] rounded-xl flex items-center justify-center mb-6">
              <BookOpen className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <h3 className="text-white text-lg font-light mb-2">Maîtrisez les fondamentaux</h3>
            <p className="text-white/25 text-sm leading-relaxed">
              Accédez à nos ressources pour vous acculturer aux spécificités de l'immobilier commercial.
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[#2A9D8F] text-xs uppercase tracking-[0.2em]">Accéder</span>
            <ArrowUpRight className="w-4 h-4 text-white/15 group-hover:text-[#2A9D8F] transition-colors" />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="group cursor-pointer"
        onClick={() => navigate(createPageUrl("Questionnaire"))}
      >
        <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-7 md:p-8 hover:border-[#2A9D8F]/20 transition-all duration-300 h-full flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 bg-[#2A9D8F]/[0.08] rounded-xl flex items-center justify-center mb-6">
              <Calendar className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <h3 className="text-white text-lg font-light mb-2">Prêt pour la suite ?</h3>
            <p className="text-white/25 text-sm leading-relaxed">
              Définissons ensemble votre stratégie d'investissement personnalisée.
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-white/[0.04] flex items-center justify-between">
            <span className="text-[#2A9D8F] text-xs uppercase tracking-[0.2em]">Prendre rendez-vous</span>
            <ArrowUpRight className="w-4 h-4 text-white/15 group-hover:text-[#2A9D8F] transition-colors" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}