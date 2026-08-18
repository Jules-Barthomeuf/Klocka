import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const profilLabels = {
  equilibriste: {
    label: "L'équilibriste",
    subtitle: "Le chercheur d'équilibre",
    description: "Vous recherchez le juste milieu entre sécurité et performance. Vous privilégiez un bon emplacement tout en restant attentif à la rentabilité."
  },
  risk_taker: {
    label: "Risk taker",
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

const profilImages = {
  equilibriste: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/4021d9836_Gemini_Generated_Image_vgo6wsvgo6wsvgo6.png",
  risk_taker: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/c9f0ec7e6_risktaker.png",
  collectionneur: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/ec897eb44_collectionneur.png",
  visionnaire: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/55107ab45_Gemini_Generated_Image_o65zqho65zqho65z.png"
};

export default function DashboardProfileCard({ user }) {
  const [expanded, setExpanded] = useState(false);
  const profil = profilLabels[user.profil_investisseur];
  const image = profilImages[user.profil_investisseur];
  if (!profil || !image) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-[#0e100f] border border-[#edeae5]/[0.12] overflow-hidden h-full"
    >
      <div
        className="p-5 cursor-pointer hover:bg-[#edeae5]/[0.01] transition-colors h-full flex flex-col"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#8b9391] m-0">Profil investisseur</p>
          <ChevronDown className={`w-3.5 h-3.5 text-[#6b7270] transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
          <div className="w-20 h-20 rounded-full overflow-hidden border border-[#35a79b]/50 mb-4 flex-shrink-0">
            <img src={image} alt="" className="w-full h-full object-cover" />
          </div>
          <p className="text-[#edeae5] text-[20px] font-light mb-0.5">{profil.label}</p>
          <p className="text-[#8b9391] text-[12px] m-0">{profil.subtitle}</p>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-[#edeae5]/[0.12]">
                <p className="text-[#d3d8d6] text-[13px] leading-[1.7] mb-0">{profil.description}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}