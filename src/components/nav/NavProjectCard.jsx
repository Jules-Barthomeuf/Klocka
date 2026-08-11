import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { MapPin } from "lucide-react";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

const formatPrice = (val) => {
  if (!val) return "—";
  if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
  if (val >= 1000) return `${Math.round(val / 1000)}K €`;
  return `${Math.round(val)} €`;
};

export default function NavProjectCard({ project }) {
  const prixBienNegocie = project.sim_prix_bien_negocie || 0;
  const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
  const droitsEnregistrement = prixBienNegocie * ((project.sim_droits_enregistrement || 8) / 100);
  const feesKlocka = (project.sim_fees_klocka_type || "pourcentage") === "fixe"
    ? (project.sim_fees_klocka || 8)
    : prixBienNegocie * ((project.sim_fees_klocka || 8) / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * ((project.sim_incentive_klocka || 20) / 100);
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);
  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + feesKlocka + incentiveKlocka + fraisDivers
    : project.sim_prix_revient || project.prix_acquisition || 0;

  const loyerAnnuelInitial = project.sim_loyer_initial_ht || 0;
  const anneeRevente = project.sim_annee_revente || 20;
  const indexation = project.sim_indexation_loyers || 2;
  let total = 0, loyer = loyerAnnuelInitial;
  for (let a = 1; a <= anneeRevente; a++) {
    if (a > 1) loyer *= (1 + indexation / 100);
    total += loyer;
  }
  const rendement = prixRevient > 0 && total > 0 ? ((total / anneeRevente) / prixRevient) * 100 : 0;

  return (
    <Link to={`${createPageUrl("ProjetDetail")}?id=${project.id}`} className="block">
      <div className="flex gap-3 rounded-lg p-2 hover:bg-white/[0.06] transition-colors">
        {/* Mini image */}
        <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 relative">
          {project.photos?.[0] ? (
            <img src={project.photos[0]} alt={project.titre} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#111] to-[#080808] flex items-center justify-center">
              <MapPin className="w-4 h-4 text-white/[0.1]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-medium text-white truncate">{project.titre}</p>
            <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#2A9D8F]/10 text-[#2A9D8F] border border-[#2A9D8F]/20 flex-shrink-0">
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>
          {project.adresse_complete && (
            <p className="text-[11px] text-white/30 truncate">{project.adresse_complete}</p>
          )}
          <div className="flex gap-4 mt-1">
            <span className="text-[11px] text-[#2A9D8F]">{formatPrice(prixRevient)}</span>
            <span className="text-[11px] text-white/50">{rendement.toFixed(2)}%</span>
          </div>
        </div>
      </div>
    </Link>
  );
}