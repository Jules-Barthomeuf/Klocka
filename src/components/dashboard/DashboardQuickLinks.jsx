import React from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Building2, Calculator, Scale, TrendingUp, BookOpen, Download, ArrowRight
} from "lucide-react";

function QuickLink({ icon: Icon, label, sublabel, onClick, isLink, href }) {
  const Comp = isLink ? 'a' : 'div';
  const linkProps = isLink ? { href, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <Comp
      onClick={onClick}
      {...linkProps}
      className="group cursor-pointer flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-[#2A9D8F]/15 hover:bg-white/[0.03] transition-all duration-300"
    >
      <div className="w-9 h-9 rounded-lg bg-[#2A9D8F]/[0.08] flex items-center justify-center flex-shrink-0 group-hover:bg-[#2A9D8F]/[0.15] transition-colors">
        <Icon className="w-4 h-4 text-[#2A9D8F]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm">{label}</p>
        {sublabel && <p className="text-white/70 text-[10px]">{sublabel}</p>}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-white/[0.08] group-hover:text-[#2A9D8F]/40 transition-colors flex-shrink-0" />
    </Comp>
  );
}

export default function DashboardQuickLinks({ userEtape, user }) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-white/[0.04] rounded-2xl border border-white/[0.3] p-4"
    >
      <p className="text-white uppercase tracking-[0.2em] text-[9px] font-medium mb-3 px-1">Accès rapide</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        <QuickLink
          icon={Building2}
          label="Mes projets"
          sublabel="Voir tous les projets"
          onClick={() => navigate(createPageUrl("MesProjets"))}
        />
        <QuickLink
          icon={Calculator}
          label="Simulateur"
          sublabel="Calculez votre rentabilité"
          onClick={() => navigate(createPageUrl("SimulateurRentabilite"))}
        />
        <QuickLink
          icon={Scale}
          label="Comparateur"
          sublabel="Comparez vos projets"
          onClick={() => navigate(createPageUrl("Comparateur"))}
        />
        <QuickLink
          icon={TrendingUp}
          label="Vision"
          sublabel="Projetez votre patrimoine"
          onClick={() => navigate(createPageUrl("Vision"))}
        />
        <QuickLink
          icon={BookOpen}
          label="Ressources"
          sublabel="Formations & guides"
          onClick={() => navigate(createPageUrl("Ressources"))}
        />
        {userEtape >= 4 && user.dossier_bancaire_url && (
          <QuickLink
            icon={Download}
            label="Dossier bancaire"
            sublabel="Télécharger"
            isLink
            href={user.dossier_bancaire_url}
          />
        )}
      </div>
    </motion.div>
  );
}