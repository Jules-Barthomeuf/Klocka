import React from "react";
import { Pencil, Copy, Trash2, Eye, Archive, ArchiveRestore, FileSearch, Calculator, Share2, MoreHorizontal } from "lucide-react";
import { createPortal } from "react-dom";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { createPageUrl } from "@/utils";
import { toast } from "@/components/ui/avis";
import CarteProjet, { ETAPES_PROJET, statutLabels } from "@/components/projet/CarteProjet";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ShadowReportDialog from "./ShadowReport";

// La carte d'un projet côté admin : la carte commune, plus les gestes du
// métier dans le menu ⋯ sous la photo (simulateur, modification, aperçu client,
// lien public, duplication, archivage, suppression ; 14 nov. 2026, planche
// « Projets », vue Givré) et le rapport shadow en dessous.

const ADMIN_AVATARS = {
  "jules.b@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/03bb5f5c4_Capturedecran2026-06-24a120022.png",
  "alexis.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/b8c3065fa_1000031171.jpg",
  "maxime.p@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/e92131b8c_Capturedecran2026-02-18a164304.png",
  "paul.dz@klocka.immo": "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/db402bc1f_Capturedecran2026-06-24a122246.png",
};

const avatarDe = (email) => (email ? ADMIN_AVATARS[email.toLowerCase()] || null : null);

export default function AdminProjectCard({ project, onEdit, onDuplicate, onDelete, onArchive, onShadowWithNav, shadowRecord, complement = null }) {
  const [reportOpen, setReportOpen] = React.useState(false);
  const queryClient = useQueryClient();
  // « Étape suivante » : le projet passe au statut d'après, tout de suite.
  const etapeSuivante = async () => {
    const i = ETAPES_PROJET.indexOf(project.statut || "prospect");
    const suivant = ETAPES_PROJET[i + 1];
    if (!suivant) return;
    try {
      await base44.entities.Project.update(project.id, { statut: suivant });
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      toast.success(`${project.titre} passe en « ${statutLabels[suivant]} »`);
    } catch (e) {
      toast.error(e?.message || "Changement d'étape impossible");
    }
  };
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
  const ouvrir = (page) => window.open(`${createPageUrl(page)}?${page === "SimulateurRentabilite" ? "projectId" : "id"}=${project.id}`, "_blank");
  const gestes = [
    { label: "Simulateur", Icone: Calculator, faire: () => ouvrir("SimulateurRentabilite") },
    { label: "Modifier", Icone: Pencil, faire: () => onEdit(project) },
    { label: "Aperçu client", Icone: Eye, faire: () => ouvrir("ProjetDetail") },
    { label: copied ? "Lien public copié" : "Copier le lien public", Icone: Share2, faire: handleSharePublic },
    { label: "Dupliquer", Icone: Copy, faire: () => onDuplicate(project) },
    { label: project.archived ? "Désarchiver" : "Archiver", Icone: project.archived ? ArchiveRestore : Archive, faire: () => onArchive(project) },
    { label: "Supprimer", Icone: Trash2, faire: () => onDelete(project.id), alerte: true },
  ];

  const rapport = (
    <>
      {hasShadow && (
        <button
          onClick={() => setReportOpen(true)}
          className="alx-mont mb-2 flex w-full items-center justify-center gap-2 rounded-full border border-menthe/30 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[.14em] text-menthe transition-colors hover:border-menthe"
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
      onEtapeSuivante={etapeSuivante}
      avatar={avatarDe(project.admin_principal)}
      sousLigne={project.client_email ? <span> · {project.client_email.split("@")[0]}</span> : null}
      compacte
      pied={complement}
      menu={<MenuGestes gestes={gestes} />}
      dessous={rapport}
    />
  );
}

/**
 * Le menu ⋯ de la carte (14 nov. 2026, planche « Projets », vue Givré) : les gestes du projet en liste, posé sur la page
 * (portail, position fixe) pour qu'aucune carte voisine ne le recouvre ; un clic ailleurs ou Échap le referme.
 */
function MenuGestes({ gestes }) {
  const [pos, setPos] = React.useState(null);
  const zone = useFermerAuClicAilleurs(!!pos, () => setPos(null));
  return (
    <div ref={zone} className="contents">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); setPos(pos ? null : { bas: b.bottom, droite: b.right }); }}
        className="grid h-9 w-9 flex-none place-items-center rounded-[10px] text-ardoise transition-colors hover:text-encre"
        aria-label="Actions" title="Actions" aria-expanded={!!pos}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && createPortal(
        <div role="menu" onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", top: pos.bas + 4, right: Math.max(8, window.innerWidth - pos.droite) }}
          className="z-[1000] min-w-[240px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.4)]">
          {gestes.map(({ label, Icone, faire, alerte }) => (
            <button key={label} type="button" role="menuitem"
              onClick={(e) => { e.stopPropagation(); setPos(null); faire(e); }}
              className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors ${alerte ? "text-alerte hover:bg-alerte/[0.08]" : "text-craie hover:bg-encre/[0.06]"}`}>
              <Icone className="h-3.5 w-3.5 flex-none" /> {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
