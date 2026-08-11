import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Download, ArrowRight } from "lucide-react";

const profilImages = {
  equilibriste: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png",
  risk_taker: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png",
  collectionneur: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png",
  visionnaire: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
};

const profilLabels = {
  equilibriste: {
    label: "L'équilibriste",
    subtitle: "Le chercheur d'équilibre",
    description: "Vous recherchez le juste milieu entre sécurité et performance. Vous privilégiez un bon emplacement tout en restant attentif à la rentabilité."
  },
  risk_taker: {
    label: "Risk Taker",
    subtitle: "L'investisseur offensif",
    description: "Vous n'hésitez pas à prendre des risques calculés si les chiffres sont au rendez-vous. L'effet de levier et la rentabilité maximale sont vos priorités."
  },
  collectionneur: {
    label: "Le Collectionneur",
    subtitle: "L'amoureux de la Belle Pierre",
    description: "Pour vous, l'emplacement est roi. Vous privilégiez les actifs de qualité dans les meilleurs emplacements, avec une vision patrimoniale long terme."
  },
  visionnaire: {
    label: "Le Visionnaire",
    subtitle: "Le Stratège du potentiel",
    description: "Vous savez identifier le potentiel là où d'autres ne le voient pas. Vous misez sur la création de valeur et la transformation à long terme."
  }
};

export default function ClientProfileSidebar({ user, userStrategy, userEtape }) {
  const [showProfil, setShowProfil] = useState(false);
  const profil = profilLabels[user.profil_investisseur];
  const profilImage = profilImages[user.profil_investisseur];

  return (
    <div className="space-y-6">
      {/* Profil investisseur */}
      {profil && (
        <div>
          <p className="text-white/30 uppercase tracking-[0.2em] text-[10px] font-medium mb-4">
            Votre profil
          </p>
          <div
            className="bg-[#111111] rounded-2xl border border-white/5 overflow-hidden cursor-pointer hover:border-[#2A9D8F]/20 transition-all"
            onClick={() => setShowProfil(!showProfil)}
          >
            <div className="p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-[#2A9D8F]/30 flex-shrink-0">
                  <img src={profilImage} alt={profil.label} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[#2A9D8F] text-sm font-medium">{profil.label}</h3>
                  <p className="text-white/40 text-xs">{profil.subtitle}</p>
                </div>
                <motion.div animate={{ rotate: showProfil ? 180 : 0 }} transition={{ duration: 0.3 }}>
                  <ChevronDown className="w-4 h-4 text-white/20" />
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
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <p className="text-white/50 text-xs leading-relaxed">{profil.description}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Stratégie */}
      {userEtape >= 2 && userStrategy && (userStrategy.budget_max || userStrategy.apport || (userStrategy.fields && userStrategy.fields.length > 0)) && (
        <div>
          <p className="text-white/30 uppercase tracking-[0.2em] text-[10px] font-medium mb-4">
            Votre stratégie
          </p>
          <div className="bg-[#111111] rounded-2xl border border-white/5 p-5 space-y-4">
            {(userStrategy.budget_max > 0 || userStrategy.apport > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {userStrategy.budget_max > 0 && (
                  <div className="bg-[#2A9D8F]/5 border border-[#2A9D8F]/15 rounded-xl p-3">
                    <p className="text-white/30 uppercase tracking-[0.15em] text-[9px] mb-1">Budget max</p>
                    <p className="text-[#2A9D8F] text-lg font-light">{Math.round(userStrategy.budget_max).toLocaleString('fr-FR')} €</p>
                  </div>
                )}
                {userStrategy.apport > 0 && (
                  <div className="bg-[#2A9D8F]/5 border border-[#2A9D8F]/15 rounded-xl p-3">
                    <p className="text-white/30 uppercase tracking-[0.15em] text-[9px] mb-1">Apport</p>
                    <p className="text-[#2A9D8F] text-lg font-light">{Math.round(userStrategy.apport).toLocaleString('fr-FR')} €</p>
                  </div>
                )}
              </div>
            )}
            {userStrategy.fields && userStrategy.fields.map((field, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                field.is_nogo ? 'bg-red-500/5 border border-red-500/15' : 'bg-white/[0.02] border border-white/5'
              }`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${field.is_nogo ? 'bg-red-400' : 'bg-[#2A9D8F]'}`} />
                <div>
                  <p className={`text-xs font-medium ${field.is_nogo ? 'text-red-400' : 'text-white/70'}`}>
                    {field.label} {field.is_nogo && <span className="text-red-400/60">(No-go)</span>}
                  </p>
                  <p className="text-white/30 text-[11px] mt-0.5">{field.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dossier bancaire */}
      {userEtape >= 4 && user.dossier_bancaire_url && (
        <div>
          <p className="text-white/30 uppercase tracking-[0.2em] text-[10px] font-medium mb-4">
            Dossier bancaire
          </p>
          <a
            href={user.dossier_bancaire_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-[#111111] rounded-2xl border border-white/5 p-5 hover:border-[#2A9D8F]/30 transition-all group"
          >
            <div className="w-10 h-10 bg-[#2A9D8F]/10 rounded-xl flex items-center justify-center">
              <Download className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <div className="flex-1">
              <p className="text-white/80 text-sm">Télécharger</p>
              <p className="text-white/30 text-xs">Dossier de financement</p>
            </div>
            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-[#2A9D8F] transition-colors" />
          </a>
        </div>
      )}
    </div>
  );
}