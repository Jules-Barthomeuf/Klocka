import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Calculator, Check, ChevronDown, Copy, Eye, FileSearch, Loader2, Pencil, Share2, Trash2 } from "lucide-react";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { chiffresDuProjet, ETAPES_PROJET, formatPrix, statutLabels, TramePhoto } from "@/components/projet/CarteProjet";
import ShadowReportDialog from "./ShadowReport";

// Un projet en ligne, sur la page de gestion (maquette du 28 septembre 2026) :
// la vignette, le titre et l'adresse avec le nombre de clients possibles,
// l'étape, les trois chiffres et une flèche. Au survol, la ligne déplie ses
// clients en fondu, les cartes descendent un peu et la flèche pivote ; tout
// se referme quand la souris quitte la ligne. Au toucher, un clic ouvre et
// referme. Un clic sur la ligne ouvre le projet.

const somme = (n) => (typeof n === "number" ? `${Math.round(n / 1000)} k€` : null);
const initiales = (nom) => String(nom || "").trim().split(/\s+/).slice(0, 2).map((m) => m[0]).join("").toUpperCase();

/** La teinte d'une étape : la menthe, de plus en plus pleine vers la signature. */
export const TEINTE_ETAPE = {
  prospect: "rgb(var(--k-menthe-rgb) / 0.32)",
  analyse: "rgb(var(--k-menthe-rgb) / 0.62)",
  negociation: "rgb(var(--k-menthe-rgb) / 0.8)",
  financement: "rgb(var(--k-menthe-rgb) / 1)",
  signe: "rgb(var(--k-menthe-fonce-rgb) / 1)",
};

export default function LigneProjet({ project, clients = null, chargement = false, configure = true, erreur = null, onEdit, onDuplicate, onDelete, onArchive, onShadowWithNav, shadowRecord }) {
  const queryClient = useQueryClient();
  const [survol, setSurvol] = useState(false);
  const [fixe, setFixe] = useState(false);
  const [photoKo, setPhotoKo] = useState(false);
  const [rapport, setRapport] = useState(false);
  const [copie, setCopie] = useState(false);
  const ouvert = survol || fixe;
  const { prixRevient, rendement, surface } = chiffresDuProjet(project);
  const photo = photoKo ? null : project.photos?.[0];
  const n = clients?.length || 0;
  const rang = Math.max(0, ETAPES_PROJET.indexOf(project.statut || "prospect"));
  const suivant = ETAPES_PROJET[rang + 1];

  const geste = (e, quoi) => { e.stopPropagation(); quoi(); };
  const etapeSuivante = async (e) => {
    e.stopPropagation();
    if (!suivant) return;
    try {
      await base44.entities.Project.update(project.id, { statut: suivant });
      queryClient.invalidateQueries({ queryKey: ["all-projects"] });
      toast.success(`${project.titre} passe en « ${statutLabels[suivant]} »`);
    } catch (err) {
      toast.error(err?.message || "Changement d'étape impossible");
    }
  };
  const lienPublic = async (e) => {
    e.stopPropagation();
    const url = `${window.location.origin}/ProjetPublic?id=${project.id}`;
    try { await navigator.clipboard.writeText(url); setCopie(true); toast.success("Lien public copié"); setTimeout(() => setCopie(false), 2000); } catch { window.prompt("Copiez le lien public :", url); }
  };
  const icone = "grid h-8 w-8 place-items-center rounded-full border border-trait text-ardoise transition-colors hover:border-bord-vif hover:text-encre";

  return (
    <div
      className="rounded-[18px] border border-trait bg-surface-pleine transition-colors hover:border-bord-doux"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
    >
      <div role="button" tabIndex={0} onClick={() => onEdit(project)} onKeyDown={(e) => { if (e.key === "Enter") onEdit(project); }} className="flex cursor-pointer items-center gap-5 px-6 py-5 max-md:gap-3 max-md:px-4">
        <div className="h-[56px] w-[78px] flex-none overflow-hidden rounded-[10px] max-md:h-[46px] max-md:w-[60px]">
          {photo ? <img src={photo} alt="" onError={() => setPhotoKo(true)} className="h-full w-full object-cover" /> : <TramePhoto mot="" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[15.5px] text-encre">{project.titre}</p>
          <p className="m-0 mt-1 truncate text-[13px] text-ardoise">
            {project.adresse_complete || project.ville_secteur_champ1 || ""}
            {chargement ? null : n > 0 ? <span className="text-menthe"> · {n} client{n > 1 ? "s" : ""}</span> : null}
          </p>
        </div>
        <div className="hidden w-[132px] flex-none lg:block">
          <p className="m-0 flex items-center gap-2 text-[14px] text-encre"><span className="h-[7px] w-[7px] rounded-full" style={{ background: TEINTE_ETAPE[project.statut] || TEINTE_ETAPE.prospect }} />{statutLabels[project.statut] || "Prospect"}</p>
          <p className="m-0 mt-0.5 pl-[15px] text-[12px] text-ardoise">Étape</p>
        </div>
        <div className="hidden w-[108px] flex-none md:block" style={{ fontVariantNumeric: "tabular-nums" }}>
          <p className="m-0 text-[15px] text-encre">{formatPrix(prixRevient)}</p>
          <p className="m-0 mt-0.5 text-[12px] text-ardoise">Prix de revient</p>
        </div>
        <div className="w-[88px] flex-none" style={{ fontVariantNumeric: "tabular-nums" }}>
          <p className="m-0 text-[15px] text-menthe">{rendement.toFixed(2).replace(".", ",")} %</p>
          <p className="m-0 mt-0.5 text-[12px] text-ardoise">Rendement</p>
        </div>
        <div className="hidden w-[70px] flex-none sm:block" style={{ fontVariantNumeric: "tabular-nums" }}>
          <p className="m-0 text-[15px] text-encre">{surface > 0 ? `${Math.round(surface)} m²` : "—"}</p>
          <p className="m-0 mt-0.5 text-[12px] text-ardoise">Surface</p>
        </div>
        <button type="button" onClick={(e) => geste(e, () => setFixe((v) => !v))} aria-expanded={ouvert} aria-label={ouvert ? "Replier" : "Voir les clients possibles"} className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${ouvert ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Ce qui se déplie : les clients possibles, puis les gestes. */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${ouvert ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="overflow-hidden">
          <div className={`border-t border-trait px-6 pb-5 pt-4 transition-transform duration-300 ease-out max-md:px-4 ${ouvert ? "translate-y-0" : "-translate-y-2"}`}>
            <p className="m-0 mb-3 text-[13px] text-ardoise">Clients possibles</p>
            {erreur ? <p className="m-0 text-[13px] text-brume">Rapprochement indisponible : Monday n'a pas répondu.</p>
              : chargement ? <p className="m-0 flex items-center gap-2 text-[13px] text-brume"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rapprochement des clients Monday…</p>
              : configure === false ? <p className="m-0 text-[13px] text-brume">Monday n'est pas relié : aucun rapprochement possible.</p>
              : !n ? <p className="m-0 text-[13px] text-brume">Aucun client Monday ne correspond au prix et à la zone de ce projet.</p>
              : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {clients.map((c, i) => (
                    <div key={c.nom} className={`flex gap-3 rounded-[14px] border border-trait px-4 py-3 transition-all duration-300 ease-out ${ouvert ? "translate-y-0 opacity-100" : "-translate-y-1.5 opacity-0"}`} style={{ transitionDelay: ouvert ? `${Math.min(i, 5) * 40}ms` : "0ms" }}>
                      <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-menthe/[0.12] text-[11px] font-semibold text-menthe">{initiales(c.nom)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[13.5px] text-encre">{c.nom}</span>
                          <span className="flex-none whitespace-nowrap text-[12px] text-ardoise">{[somme(c.budget), c.statut].filter(Boolean).join(" · ")}</span>
                        </div>
                        {c.raisons?.length > 0 && <p className="m-0 mt-0.5 line-clamp-2 text-[12px] leading-[1.45] text-brume">{c.raisons.join(" · ")}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" onClick={(e) => geste(e, () => onEdit(project))} className="rounded-full bg-encre px-4 py-1.5 text-[13px] text-fond transition-opacity hover:opacity-90">Ouvrir le projet</button>
              {suivant && <button type="button" onClick={etapeSuivante} title={`Passer en « ${statutLabels[suivant]} »`} className="rounded-full border border-bord px-4 py-1.5 text-[13px] text-encre hover:border-bord-vif" style={{ background: "transparent" }}>Étape suivante</button>}
              {shadowRecord?.shadow_data && <button type="button" onClick={(e) => geste(e, () => setRapport(true))} className="inline-flex items-center gap-1.5 rounded-full border border-bord px-4 py-1.5 text-[13px] text-encre hover:border-bord-vif" style={{ background: "transparent" }}><FileSearch className="h-3.5 w-3.5" />Voir le rapport</button>}
              <span className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={(e) => geste(e, () => window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${project.id}`, "_blank"))} className={icone} style={{ background: "transparent" }} title="Simulateur" aria-label="Simulateur"><Calculator className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(e) => geste(e, () => onEdit(project))} className={icone} style={{ background: "transparent" }} title="Modifier" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(e) => geste(e, () => window.open(`${createPageUrl("ProjetDetail")}?id=${project.id}`, "_blank"))} className={icone} style={{ background: "transparent" }} title="Aperçu client" aria-label="Aperçu client"><Eye className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={lienPublic} className={icone} style={{ background: "transparent" }} title="Copier le lien public" aria-label="Copier le lien public">{copie ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Share2 className="h-3.5 w-3.5" />}</button>
                <button type="button" onClick={(e) => geste(e, () => onDuplicate(project))} className={icone} style={{ background: "transparent" }} title="Dupliquer" aria-label="Dupliquer"><Copy className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={(e) => geste(e, () => onArchive(project))} className={icone} style={{ background: "transparent" }} title={project.archived ? "Désarchiver" : "Archiver"} aria-label={project.archived ? "Désarchiver" : "Archiver"}>{project.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}</button>
                <button type="button" onClick={(e) => geste(e, () => onDelete(project.id))} className={`${icone} hover:!border-alerte/50 hover:!text-alerte`} style={{ background: "transparent" }} title="Supprimer" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
          </div>
        </div>
      </div>

      <ShadowReportDialog
        open={rapport}
        onOpenChange={setRapport}
        project={project}
        shadowRecord={shadowRecord}
        onNavigateToField={(tab, viewMode) => { setRapport(false); setTimeout(() => onShadowWithNav?.(project, tab, viewMode), 200); }}
      />
    </div>
  );
}
