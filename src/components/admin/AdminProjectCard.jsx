import React from "react";
import { Pencil, Copy, Trash2, Eye, Archive, ArchiveRestore, FileSearch, Calculator, Share2, Check } from "lucide-react";
import { createPageUrl } from "@/utils";
import { toast } from "@/components/ui/avis";
import CarteProjet from "@/components/projet/CarteProjet";
import ShadowReportDialog from "./ShadowReport";

// La carte d'un projet côté admin : la carte commune, plus les gestes du
// métier au survol (simulateur, modification, aperçu client, lien public,
// duplication, archivage, suppression) et le rapport shadow en pied.

const ADMIN_AVATARS = {
  "jules.b@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png",
  "alexis.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/b8c3065fa_1000031171.jpg",
  "maxime.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png",
  "paul.dz@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png",
};

const avatarDe = (email) => (email ? ADMIN_AVATARS[email.toLowerCase()] || null : null);

export default function AdminProjectCard({ project, onEdit, onDuplicate, onDelete, onArchive, onShadowWithNav, shadowRecord }) {
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

  const hasShadow = !!shadowRecord?.shadow_data;
  const actionBtn = "w-8 h-8 rounded-full bg-fond/70 backdrop-blur-sm border border-encre/[0.18] flex items-center justify-center text-craie transition-colors";
  const geste = (e, quoi) => { e.stopPropagation(); quoi(); };

  const actions = (
    <>
      <button onClick={(e) => geste(e, () => window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`, "_blank"))} className={`${actionBtn} hover:border-bord-vif hover:text-encre`} aria-label="Simulateur" title="Simulateur">
        <Calculator className="h-3.5 w-3.5" />
      </button>
      <button onClick={(e) => geste(e, () => onEdit(project))} className={`${actionBtn} hover:border-bord-vif hover:text-encre`} aria-label="Modifier" title="Modifier">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={(e) => geste(e, () => window.open(`${createPageUrl("ProjetDetail")}?id=${project.id}`, "_blank"))} className={`${actionBtn} hover:border-bord-vif hover:text-encre`} aria-label="Preview client" title="Preview client">
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button onClick={handleSharePublic} className={`${actionBtn} hover:border-bord-vif hover:text-encre`} aria-label="Copier le lien public (accessible sans compte)" title="Copier le lien public (accessible sans compte)">
        {copied ? <Check className="h-3.5 w-3.5 text-menthe-clair" /> : <Share2 className="h-3.5 w-3.5" />}
      </button>
      <button onClick={(e) => geste(e, () => onDuplicate(project))} className={`${actionBtn} hover:border-bord-vif hover:text-encre`} aria-label="Dupliquer" title="Dupliquer">
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button onClick={(e) => geste(e, () => onArchive(project))} className={`${actionBtn} ${project.archived ? "text-menthe" : "hover:border-menthe hover:text-menthe"}`} aria-label={project.archived ? "Désarchiver" : "Archiver"} title={project.archived ? "Désarchiver" : "Archiver"}>
        {project.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
      </button>
      <button onClick={(e) => geste(e, () => onDelete(project.id))} className={`${actionBtn} hover:border-red-400/40 hover:text-red-400`} aria-label="Supprimer" title="Supprimer">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );

  const pied = (
    <>
      {hasShadow && (
        <button
          onClick={() => setReportOpen(true)}
          className="alx-mont mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-menthe/30 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[.14em] text-menthe transition-colors hover:border-menthe"
        >
          <FileSearch className="h-3.5 w-3.5" />
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
          setTimeout(() => { if (onShadowWithNav) onShadowWithNav(project, tab, viewMode); }, 200);
        }}
      />
    </>
  );

  return (
    <CarteProjet
      project={project}
      onOuvrir={() => onEdit(project)}
      avatar={avatarDe(project.admin_principal)}
      sousLigne={project.client_email ? <p className="alx-mont mt-1.5 text-[11px] font-medium uppercase tracking-[.14em] text-ardoise">{project.client_email.split("@")[0]}</p> : null}
      actions={actions}
      pied={pied}
    />
  );
}
