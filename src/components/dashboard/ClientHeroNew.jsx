import React from "react";
import { motion } from "framer-motion";

export default function ClientHeroNew({ user, userEtape, etapes }) {
  const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0];

  return (
    <div className="mb-12 md:mb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <p className="text-[#2A9D8F] uppercase tracking-[0.35em] text-[11px] font-medium mb-4">
          Espace investisseur
        </p>
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-light text-white leading-[1.15] tracking-tight mb-3">
          Bonjour, <span className="font-normal">{firstName}</span>
        </h1>
        <div className="h-px w-20 bg-gradient-to-r from-[#2A9D8F] to-transparent mb-8" />
      </motion.div>

      {/* Progress bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="max-w-3xl"
      >
        <div className="flex items-center gap-0">
          {etapes.filter(e => e.numero !== 0).map((etape, index, arr) => {
            const isCompleted = etape.numero < userEtape;
            const isCurrent = etape.numero === userEtape;
            return (
              <div key={etape.numero} className="flex-1 flex flex-col">
                <div className="flex items-center">
                  <div className={`h-[3px] w-full transition-all duration-700 ${
                    isCompleted ? 'bg-[#2A9D8F]' : isCurrent ? 'bg-gradient-to-r from-[#2A9D8F] to-[#2A9D8F]/30' : 'bg-white/[0.06]'
                  }`} />
                </div>
                <span className={`text-[9px] md:text-[10px] uppercase tracking-[0.15em] mt-3 leading-tight ${
                  isCompleted ? 'text-[#2A9D8F]' : isCurrent ? 'text-white/80' : 'text-white/20'
                }`}>
                  {etape.titre}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}