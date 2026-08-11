import React from "react";
import { motion } from "framer-motion";

export default function ClientHero({ user, userEtape, etapes }) {
  const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0];

  return (
    <div className="mb-10 md:mb-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-xs font-medium mb-3">
          Espace investisseur
        </p>
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-light text-white leading-tight tracking-tight mb-2">
          Bonjour, <span className="font-normal">{firstName}</span>
        </h1>
        <div className="h-px w-16 bg-[#2A9D8F] mb-5" />
      </motion.div>

      {/* Étapes - barre minimaliste */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex items-center gap-1 md:gap-2 max-w-2xl"
      >
        {etapes.filter(e => e.numero !== 0).map((etape, index, arr) => {
          const isCompleted = etape.numero < userEtape;
          const isCurrent = etape.numero === userEtape;
          return (
            <React.Fragment key={etape.numero}>
              <div className="flex flex-col items-center gap-2 flex-1">
                <div className={`h-1 w-full rounded-full transition-all duration-500 ${
                  isCompleted ? 'bg-[#2A9D8F]' : isCurrent ? 'bg-[#2A9D8F]' : 'bg-white/10'
                }`} />
                <span className={`text-[9px] md:text-[10px] uppercase tracking-wider text-center leading-tight ${
                  isCompleted ? 'text-[#2A9D8F]' : isCurrent ? 'text-white' : 'text-white/30'
                }`}>
                  {etape.titre}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </motion.div>
    </div>
  );
}