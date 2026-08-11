import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Calculator, Brain, BookOpen, Download, ArrowRight, Eye } from "lucide-react";
import { motion } from "framer-motion";

export default function ClientQuickNav({ user, userEtape }) {
  const navigate = useNavigate();

  const links = [
    {
      label: "Simulateur",
      desc: "Calculez votre rentabilité",
      icon: Calculator,
      page: "SimulateurRentabilite",
      show: true,
    },
    {
      label: "Assistant IA",
      desc: "Posez vos questions",
      icon: Brain,
      page: "ProjectAssistant",
      show: true,
    },
    {
      label: "Vision",
      desc: "Projection patrimoniale",
      icon: Eye,
      page: "Vision",
      show: true,
    },
    {
      label: "Ressources",
      desc: "Formations & guides",
      icon: BookOpen,
      page: "Ressources",
      show: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {links.filter(l => l.show).map((link, i) => (
        <motion.div
          key={link.page}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 + i * 0.05 }}
          onClick={() => navigate(createPageUrl(link.page))}
          className="group cursor-pointer bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 hover:border-[#2A9D8F]/20 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-[#2A9D8F]/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <link.icon className="w-4 h-4 text-[#2A9D8F]" />
            </div>
          </div>
          <p className="text-white/80 text-sm font-light">{link.label}</p>
          <p className="text-white/25 text-[11px] mt-0.5">{link.desc}</p>
        </motion.div>
      ))}

      {/* Dossier bancaire */}
      {userEtape >= 4 && user.dossier_bancaire_url && (
        <motion.a
          href={user.dossier_bancaire_url}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="group bg-[#0A0A0A] rounded-xl border border-white/[0.06] p-4 hover:border-[#2A9D8F]/20 transition-all duration-300"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 bg-[#2A9D8F]/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <Download className="w-4 h-4 text-[#2A9D8F]" />
            </div>
          </div>
          <p className="text-white/80 text-sm font-light">Dossier bancaire</p>
          <p className="text-white/25 text-[11px] mt-0.5">Télécharger</p>
        </motion.a>
      )}
    </div>
  );
}