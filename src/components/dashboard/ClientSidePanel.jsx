import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, ArrowRight } from "lucide-react";

const profilImages = {
  equilibriste: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png",
  risk_taker: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png",
  collectionneur: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png",
  visionnaire: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
};

export default function ClientSidePanel({ user, userStrategy, userEtape, userProfil }) {
  const [showProfil, setShowProfil] = useState(false);
  const profilImage = user.profil_investisseur ? profilImages[user.profil_investisseur] : null;

  return (
    <div className="space-y-8">
      {/* Investor profile */}
      {userProfil && profilImage && (
        <div>
          <p className="text-[#2A9D8F]/60 uppercase tracking-[0.25em] text-[10px] font-medium mb-5">
            Votre profil
          </p>
          <div
            className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] overflow-hidden cursor-pointer hover:border-[#2A9D8F]/20 transition-all duration-300"
            onClick={() => setShowProfil(!showProfil)}
          >
            <div className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#2A9D8F]/30 flex-shrink-0">
                  <img src={profilImage} alt={userProfil.label} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[#2A9D8F] text-sm font-medium">{userProfil.label}</h3>
                </div>
                <motion.div animate={{ rotate: showProfil ? 180 : 0 }} transition={{ duration: 0.3 }}>
                  <ChevronDown className="w-4 h-4 text-white/15" />
                </motion.div>
              </div>
              <AnimatePresence>
                {showProfil && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-5 pt-5 border-t border-white/[0.04]">
                      <p className="text-white/40 text-xs leading-relaxed">{userProfil.description}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Strategy */}
      {userEtape >= 2 && userStrategy && (userStrategy.budget_max || userStrategy.apport || (userStrategy.fields && userStrategy.fields.length > 0)) && (
        <div>
          <p className="text-[#2A9D8F]/60 uppercase tracking-[0.25em] text-[10px] font-medium mb-5">
            Votre stratégie
          </p>
          <div className="bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-5 space-y-4">
            {(userStrategy.budget_max > 0 || userStrategy.apport > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {userStrategy.budget_max > 0 && (
                  <div className="bg-[#2A9D8F]/[0.05] border border-[#2A9D8F]/15 rounded-xl p-4">
                    <p className="text-white/25 uppercase tracking-[0.2em] text-[9px] mb-2">Budget max</p>
                    <p className="text-[#2A9D8F] text-lg font-light">{Math.round(userStrategy.budget_max).toLocaleString('fr-FR')} €</p>
                  </div>
                )}
                {userStrategy.apport > 0 && (
                  <div className="bg-[#2A9D8F]/[0.05] border border-[#2A9D8F]/15 rounded-xl p-4">
                    <p className="text-white/25 uppercase tracking-[0.2em] text-[9px] mb-2">Apport</p>
                    <p className="text-[#2A9D8F] text-lg font-light">{Math.round(userStrategy.apport).toLocaleString('fr-FR')} €</p>
                  </div>
                )}
              </div>
            )}
            {userStrategy.fields && userStrategy.fields.map((field, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                field.is_nogo ? 'bg-red-500/[0.04] border border-red-500/10' : 'bg-white/[0.015] border border-white/[0.04]'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${field.is_nogo ? 'bg-red-400' : 'bg-[#2A9D8F]'}`} />
                <div>
                  <p className={`text-xs font-medium ${field.is_nogo ? 'text-red-400' : 'text-white/60'}`}>
                    {field.label} {field.is_nogo && <span className="text-red-400/50">(No-go)</span>}
                  </p>
                  <p className="text-white/25 text-[11px] mt-0.5">{field.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banking dossier */}
      {userEtape >= 4 && user.dossier_bancaire_url && (
        <div>
          <p className="text-[#2A9D8F]/60 uppercase tracking-[0.25em] text-[10px] font-medium mb-5">
            Dossier bancaire
          </p>
          <a
            href={user.dossier_bancaire_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#0A0A0A] rounded-2xl border border-white/[0.06] p-5 hover:border-[#2A9D8F]/20 transition-all duration-300 group"
          >
            <div className="w-11 h-11 bg-[#2A9D8F]/[0.06] rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <div className="flex-1">
              <p className="text-white/70 text-sm">Télécharger</p>
              <p className="text-white/25 text-xs">Dossier de financement</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/15 group-hover:text-[#2A9D8F] transition-colors" />
          </a>
        </div>
      )}
    </div>
  );
}