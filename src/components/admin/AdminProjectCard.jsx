import React from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Copy, Trash2, Eye, Archive, ArchiveRestore, FileSearch, Calculator, Share2, Check } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import ShadowReportDialog from "./ShadowReport";

const statutColors = {
  prospect: "text-gray-300",
  analyse: "text-blue-400",
  negociation: "text-amber-400",
  financement: "text-purple-400",
  signe: "text-[#5ee7d4]"
};

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

const ADMIN_AVATARS = {
  "jules": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png",
  "alexis": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/b8c3065fa_1000031171.jpg",
  "maxime": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png",
  "paul": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png",
};

function getAdminAvatar(email) {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower === "maxime.p@klocka.immo") return ADMIN_AVATARS.maxime;
  if (lower === "alexis.p@klocka.immo") return ADMIN_AVATARS.alexis;
  if (lower === "jules.b@klocka.immo") return ADMIN_AVATARS.jules;
  if (lower === "paul.dz@klocka.immo") return ADMIN_AVATARS.paul;
  return null;
}

export default function AdminProjectCard({ project, onEdit, onDuplicate, onDelete, onArchive, onShadow, onShadowWithNav, shadowRecord }) {
  const [reportOpen, setReportOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const publicUrl = `${window.location.origin}/ProjetPublic?id=${project.id}`;

  const handleSharePublic = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Lien public copié", { description: "Partageable même avec un non-client" });
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      window.prompt("Copiez le lien public :", publicUrl);
    }
  };
  const prixBienFAI = project.sim_prix_bien_fai || project.sim_prix_bien_negocie || 0;
  const prixBienNegocie = project.sim_prix_bien_negocie || prixBienFAI;
  const tauxDroitsEnregistrement = project.sim_droits_enregistrement ?? 8;
  const tauxFeesKlocka = project.sim_fees_klocka ?? 8;
  const feesKlockaType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentiveKlocka = project.sim_incentive_klocka ?? 20;
  const commissionAgentActive = project.sim_commission_agent_active ?? false;
  const commissionAgentType = project.sim_commission_agent_type || "pourcentage";
  const tauxCommissionAgent = project.sim_commission_agent ?? 5;
  const inclusFAI = project.sim_commission_agent_inclus_fai !== false;

  const honorairesAgent = commissionAgentActive
    ? (commissionAgentType === "fixe" ? tauxCommissionAgent : prixBienNegocie * (tauxCommissionAgent / 100))
    : 0;

  const prixHorsDroits = inclusFAI ? (prixBienNegocie - honorairesAgent) : prixBienNegocie;
  const droitsEnregistrement = prixHorsDroits * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers + (inclusFAI ? 0 : honorairesAgent)
    : (project.sim_prix_revient || project.prix_acquisition || 0);

  const loyerAnnuelInitial = project.sim_loyer_initial_ht || 0;
  const anneeRevente = project.sim_annee_revente || 20;
  const indexation = project.sim_indexation_loyers || 2;

  let totalLoyersNets = 0;
  let loyerCourant = loyerAnnuelInitial;
  for (let annee = 1; annee <= anneeRevente; annee++) {
    if (annee > 1) loyerCourant = loyerCourant * (1 + indexation / 100);
    totalLoyersNets += loyerCourant;
  }
  const loyerMoyen = anneeRevente > 0 ? totalLoyersNets / anneeRevente : 0;
  const rendementLocatifMoyen = prixRevient > 0 && loyerMoyen > 0 ? (loyerMoyen / prixRevient) * 100 : 0;

  const hasShadow = !!shadowRecord?.shadow_data;
  const surface = project.sim_surface || project.surface_m2 || 0;

  const formatPrice = (val) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M €`;
    if (val >= 1000) return `${Math.round(val / 1000)}K €`;
    return `${Math.round(val)} €`;
  };

  const actionBtn = "w-8 h-8 rounded-full bg-[#050807]/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 transition-colors";

  return (
    <div>
      <div
        className="group relative cursor-pointer bg-[#0a0f0e] rounded-md border border-[#16201f] overflow-hidden hover:border-[#33d6c0]/20 transition-all duration-500"
        onClick={() => onEdit(project)}
      >
        {/* Image band */}
        <div className="relative h-48 md:h-56 overflow-hidden">
          {project.photos && project.photos.length > 0 ? (
            <img src={project.photos[0]} alt={project.titre} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#111] to-[#080808] flex items-center justify-center">
              <Eye className="w-12 h-12 text-white/[0.05]" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f0e] via-[#0a0f0e]/30 to-transparent" />

          {/* Status badge */}
          <div className="absolute top-4 left-4">
            <span className={`text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full bg-[#050807]/60 backdrop-blur-sm border ${statutColors[project.statut] || 'text-gray-400'} border-white/10`}>
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {/* Conseiller avatar */}
          {getAdminAvatar(project.admin_principal) && (
            <div className="absolute top-3 right-3">
              <img src={getAdminAvatar(project.admin_principal)} alt="Admin" className="w-9 h-9 rounded-full object-cover border-2 border-white/20 shadow-lg" />
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-xl md:text-2xl font-light text-white tracking-tight leading-tight truncate">{project.titre}</h2>
            {project.adresse_complete && <p className="text-white/40 text-sm mt-1 truncate">{project.adresse_complete}</p>}
            {project.client_email && <p className="text-white/25 text-xs mt-0.5">{project.client_email.split('@')[0]}</p>}
          </div>

          {/* Actions — apparaissent au survol */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button onClick={(e) => { e.stopPropagation(); window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`, '_blank'); }} className={`${actionBtn} hover:text-[#33d6c0] hover:border-[#33d6c0]/40`} title="Simulateur">
              <Calculator className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(project); }} className={`${actionBtn} hover:text-[#33d6c0] hover:border-[#33d6c0]/40`} title="Modifier">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); window.open(`${createPageUrl("ProjetDetail")}?id=${project.id}`, '_blank'); }} className={`${actionBtn} hover:text-purple-400 hover:border-purple-400/40`} title="Preview client">
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleSharePublic} className={`${actionBtn} hover:text-[#33d6c0] hover:border-[#33d6c0]/40`} title="Copier le lien public (accessible sans compte)">
              {copied ? <Check className="w-3.5 h-3.5 text-[#33d6c0]" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(project); }} className={`${actionBtn} hover:text-blue-400 hover:border-blue-400/40`} title="Dupliquer">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onArchive(project); }} className={`${actionBtn} ${project.archived ? 'text-amber-400' : 'hover:text-amber-400 hover:border-amber-400/40'}`} title={project.archived ? "Désarchiver" : "Archiver"}>
              {project.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className={`${actionBtn} hover:text-red-400 hover:border-red-400/40`} title="Supprimer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="p-5 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-6 gap-y-2 min-w-0">
            <div className="min-w-0">
              <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Prix de revient</p>
              <p className="text-[#33d6c0] text-lg font-light">{formatPrice(prixRevient)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Rendement</p>
              <p className="text-white text-lg font-light">{rendementLocatifMoyen.toFixed(2)}%</p>
            </div>
            {surface > 0 && (
              <div className="min-w-0">
                <p className="text-white/25 text-[10px] uppercase tracking-wider mb-1 whitespace-nowrap">Surface</p>
                <p className="text-white text-lg font-light">{surface} m²</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Voir le rapport button */}
      {hasShadow && (
        <button
          onClick={() => setReportOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400 text-xs transition-all"
        >
          <FileSearch className="w-3.5 h-3.5" />
          Voir le rapport
        </button>
      )}

      <ShadowReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        project={project}
        shadowRecord={shadowRecord}
        onNavigateToField={(tab, viewMode) => {
          setReportOpen(false);
          setTimeout(() => {
            if (onShadowWithNav) onShadowWithNav(project, tab, viewMode);
          }, 200);
        }}
      />
    </div>
  );
}