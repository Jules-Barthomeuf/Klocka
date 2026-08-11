import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const profilImages = {
  equilibriste: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png",
  risk_taker: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png",
  collectionneur: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png",
  visionnaire: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
};

export default function ClientProfileStrategy({ user, userProfil, userStrategy, userEtape }) {
  const [showProfil, setShowProfil] = useState(false);
  const profilImage = user.profil_investisseur ? profilImages[user.profil_investisseur] : null;
  const hasStrategy = userEtape >= 2 && userStrategy && (userStrategy.budget_max || userStrategy.apport);

  if (!userProfil && !hasStrategy) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Profil */}
      {userProfil && profilImage && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-5 cursor-pointer hover:border-[#2A9D8F]/15 transition-all"
          onClick={() => setShowProfil(!showProfil)}
        >
          <p className="text-[#2A9D8F]/50 uppercase tracking-[0.2em] text-[9px] mb-4">
            Profil investisseur
          </p>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#2A9D8F]/15 flex-shrink-0">
              <img src={profilImage} alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-[#2A9D8F] text-sm font-medium flex-1 leading-tight">{userProfil.label}</p>
            <ChevronDown className={`w-4 h-4 text-white/20 transition-transform ${showProfil ? 'rotate-180' : ''}`} />
          </div>
          <AnimatePresence>
            {showProfil && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="text-white/30 text-xs leading-relaxed pt-4 mt-4 border-t border-white/[0.04]">
                  {userProfil.description}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Strategy */}
      {hasStrategy && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-5"
        >
          <p className="text-[#2A9D8F]/50 uppercase tracking-[0.2em] text-[9px] mb-4">
            Stratégie d'investissement
          </p>
          <div className="grid grid-cols-2 gap-4">
            {userStrategy.budget_max > 0 && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Budget max</p>
                <p className="text-[#2A9D8F] text-xl font-light">
                  {Math.round(userStrategy.budget_max).toLocaleString('fr-FR')} €
                </p>
              </div>
            )}
            {userStrategy.apport > 0 && (
              <div>
                <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1">Apport</p>
                <p className="text-white text-xl font-light">
                  {Math.round(userStrategy.apport).toLocaleString('fr-FR')} €
                </p>
              </div>
            )}
          </div>
          {userStrategy.fields && userStrategy.fields.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.04] space-y-2">
              {userStrategy.fields.slice(0, 4).map((field, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${field.is_nogo ? 'bg-red-400' : 'bg-[#2A9D8F]'}`} />
                  <span className={`text-[11px] ${field.is_nogo ? 'text-red-400/70' : 'text-white/40'}`}>
                    {field.label}
                    {field.is_nogo && <span className="ml-1 text-red-400/50">(No-go)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}