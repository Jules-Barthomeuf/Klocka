import React from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Copy, Trash2, Eye, Archive, ArchiveRestore, FileSearch, Calculator, Share2, Check } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import ShadowReportDialog from "./ShadowReport";

const statutColors = {
  prospect: "text-[#8b9391] border-[#edeae5]/[0.18]",
  analyse: "text-[#7fd3c9] border-[#7fd3c9]/40",
  negociation: "text-[#e0c9a0] border-[#e0c9a0]/40",
  financement: "text-[#e0c9a0] border-[#e0c9a0]/40",
  signe: "text-[#7fd3c9] border-[#35a79b] bg-[#35a79b]/[0.16]"
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

  const actionBtn = "w-8 h-8 rounded-full bg-[#0a0c0c]/70 backdrop-blur-sm border border-[#edeae5]/[0.18] flex items-center justify-center text-[#d3d8d6] transition-colors";

  return (
    <div>
      <div
        className="group relative cursor-pointer bg-[#0e100f] border border-[#edeae5]/[0.12] overflow-hidden hover:border-[#565b59] transition-colors duration-300"
        onClick={() => onEdit(project)}
      >
        {/* Image band */}
        <div className="relative h-48 md:h-56 overflow-hidden">
          {project.photos && project.photos.length > 0 ? (
            <img src={project.photos[0]} alt={project.titre} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
          ) : (
            <div className="w-full h-full bg-[#0a0c0c] flex items-center justify-center">
              <Eye className="w-10 h-10 text-[#edeae5]/[0.06]" />
            </div>
          )}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(14,16,15,0.97) 6%, rgba(14,16,15,0.35) 55%, rgba(14,16,15,0.55) 100%)" }} />

          {/* Status badge */}
          <div className="absolute top-4 left-4">
            <span className={`text-[10px] uppercase tracking-[0.18em] px-3 py-1 rounded-full bg-[#0a0c0c]/70 backdrop-blur-sm border ${statutColors[project.statut] || 'text-[#8b9391] border-[#edeae5]/[0.18]'}`}>
              {statutLabels[project.statut] || project.statut}
            </span>
          </div>

          {/* Conseiller avatar */}
          {getAdminAvatar(project.admin_principal) && (
            <div className="absolute top-3 right-3">
              <img src={getAdminAvatar(project.admin_principal)} alt="Admin" className="w-9 h-9 rounded-full object-cover border border-[#edeae5]/25" />
            </div>
          )}

          {/* Title overlay */}
          <div className="absolute bottom-4 left-5 right-5">
            <h2 className="text-[21px] md:text-[23px] font-light text-[#edeae5] tracking-[-0.02em] leading-tight truncate">{project.titre}</h2>
            {project.adresse_complete && <p className="text-[#d3d8d6]/70 text-[13px] mt-1 truncate">{project.adresse_complete}</p>}
            {project.client_email && <p className="text-[10px] tracking-[0.16em] uppercase text-[#8b9391] mt-1.5">{project.client_email.split('@')[0]}</p>}
          </div>

          {/* Actions — apparaissent au survol */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button onClick={(e) => { e.stopPropagation(); window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`, '_blank'); }} className={`${actionBtn} hover:text-[#edeae5] hover:border-[#565b59]`} title="Simulateur">
              <Calculator className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onEdit(project); }} className={`${actionBtn} hover:text-[#edeae5] hover:border-[#565b59]`} title="Modifier">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); window.open(`${createPageUrl("ProjetDetail")}?id=${project.id}`, '_blank'); }} className={`${actionBtn} hover:text-[#edeae5] hover:border-[#565b59]`} title="Preview client">
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleSharePublic} className={`${actionBtn} hover:text-[#edeae5] hover:border-[#565b59]`} title="Copier le lien public (accessible sans compte)">
              {copied ? <Check className="w-3.5 h-3.5 text-[#7fd3c9]" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(project); }} className={`${actionBtn} hover:text-[#edeae5] hover:border-[#565b59]`} title="Dupliquer">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onArchive(project); }} className={`${actionBtn} ${project.archived ? 'text-[#e0c9a0]' : 'hover:text-[#e0c9a0] hover:border-[#e0c9a0]'}`} title={project.archived ? "Désarchiver" : "Archiver"}>
              {project.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className={`${actionBtn} hover:text-red-400 hover:border-red-400/40`} title="Supprimer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Chiffres clés — filets fins, chiffres alignés */}
        <div className="flex px-5 border-t border-[#edeae5]/[0.12]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <div className="flex-1 min-w-0 py-4 pr-4">
            <p className="text-[19px] font-light text-[#edeae5] m-0">{formatPrice(prixRevient)}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9391] mt-1 m-0 whitespace-nowrap">Prix de revient</p>
          </div>
          <div className="flex-1 min-w-0 py-4 px-4 border-l border-[#edeae5]/[0.12]">
            <p className="text-[19px] font-light text-[#7fd3c9] m-0">{rendementLocatifMoyen.toFixed(2).replace(".", ",")} %</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9391] mt-1 m-0">Rendement</p>
          </div>
          {surface > 0 && (
            <div className="flex-1 min-w-0 py-4 pl-4 border-l border-[#edeae5]/[0.12]">
              <p className="text-[19px] font-light text-[#edeae5] m-0">{surface} m²</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#8b9391] mt-1 m-0">Surface</p>
            </div>
          )}
        </div>
      </div>

      {/* Voir le rapport button */}
      {hasShadow && (
        <button
          onClick={() => setReportOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-[#e0c9a0]/30 hover:border-[#e0c9a0] text-[#e0c9a0] text-[10px] tracking-[0.16em] uppercase transition-colors"
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