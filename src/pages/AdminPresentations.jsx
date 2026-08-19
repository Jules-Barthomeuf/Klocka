import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderSearch, Loader2, Building2, ChevronLeft, Download, ExternalLink, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Page Présentations : on choisit un projet, on clique sur Générer, et le
// dossier « Projet de Financement » complet est construit depuis les données
// du projet (couverture, ville, carte, quartier, marché, local, bail,
// projection financière, conditions, structuration) puis converti en Google
// Slides, prêt à retoucher.

function PanneauGeneration({ project }) {
  const queryClient = useQueryClient();
  const [resultat, setResultat] = useState(null);

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;

  const generer = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/admin/projets/${project.id}/presentation`, {
        body: { compte: compteDrive },
      }),
    onSuccess: (r) => {
      setResultat(r);
      queryClient.invalidateQueries({ queryKey: ["all-projects-presentations"] });
      if (r.slides_url) {
        toast.success("Présentation générée — ouverture dans Google Slides");
        window.open(r.slides_url, "_blank", "noopener");
      } else if (r.erreur_slides) {
        toast.error(`PPTX généré, mais conversion Slides impossible : ${r.erreur_slides}`);
      } else {
        toast.success("Présentation générée (PPTX)");
      }
    },
    onError: (e) => toast.error(e?.message || "Génération impossible"),
  });

  const slidesUrl = resultat?.slides_url || project.presentation_google_slides || null;
  const pptxUrl = resultat?.pptx_url || project.presentation_pptx_url || null;

  return (
    <div className="bg-[#121413] border border-[#282b2a] rounded-none p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[#edeae5] text-sm font-medium mb-1">Présentation de financement</p>
          <p className="text-[#8b9391] text-xs max-w-xl">
            Couverture, ville, carte de l'emplacement, quartier, marché, local, bail, projection
            financière, conditions et structuration — générés depuis les données du projet, puis
            retouchables dans Google Slides.
          </p>
        </div>
        <button
          onClick={() => generer.mutate()}
          disabled={generer.isPending}
          className="inline-flex items-center justify-center gap-2 text-[#0c0e0d] rounded-none px-6 py-3 text-[14px] font-bold hover:brightness-95 transition-all disabled:opacity-60"
          style={{ background: "#edeae5" }}
        >
          {generer.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</>
          ) : (
            <><Briefcase className="w-4 h-4" /> {slidesUrl || pptxUrl ? "Regénérer" : "Générer"}</>
          )}
        </button>
      </div>

      {generer.isPending && (
        <p className="text-[#8b9391] text-xs">
          Rédaction, carte et calculs en cours — comptez une dizaine de secondes.
        </p>
      )}

      {(slidesUrl || pptxUrl) && (
        <div className="flex flex-wrap items-center gap-4">
          {slidesUrl && (
            <a href={slidesUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs px-4 py-2 border border-[#3a3e3c] bg-[#edeae5]/[0.06] hover:bg-[#edeae5]/[0.1] text-[#edeae5] transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
              Ouvrir dans Google Slides
            </a>
          )}
          {pptxUrl && (
            <a href={pptxUrl} download
              className="inline-flex items-center gap-2 text-xs text-[#8b9391] hover:text-[#edeae5] transition-colors">
              <Download className="w-3.5 h-3.5" />
              Télécharger le PPTX
            </a>
          )}
          {project.presentation_generee_le && !resultat && (
            <span className="text-[#6b7270] text-xs">
              Dernière génération le {new Date(project.presentation_generee_le).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      )}

      {statutMail && !compteDrive && (
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={() => {
              window.location.href = "/api/auth/google/login?returnTo=" + encodeURIComponent("/AdminPresentations");
            }}
            className="inline-flex items-center gap-2 text-xs px-4 py-2.5 border border-[#3a3e3c] bg-[#edeae5]/[0.06] hover:bg-[#edeae5]/[0.1] text-[#edeae5] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Connecter Google Slides
          </button>
          <p className="text-[#8b9391] text-xs max-w-md">
            Une autorisation Google unique pour que les présentations s'ouvrent directement dans
            Google Slides. Sans elle, le dossier reste un PPTX à télécharger.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminPresentations() {
  const [selectedId, setSelectedId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["all-projects-presentations"],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  );

  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projects;
    const q = projectSearch.toLowerCase();
    return projects.filter(
      (p) =>
        p.titre?.toLowerCase().includes(q) ||
        p.adresse_complete?.toLowerCase().includes(q) ||
        p.client_email?.toLowerCase().includes(q)
    );
  }, [projects, projectSearch]);

  return (
    <div className="min-h-screen text-[#edeae5] p-4 md:p-10" style={{ background: "linear-gradient(160deg,#0a0c0c 0%,#000000 90%)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-9 text-center">
          <h1 className="text-[28px] md:text-[32px] font-light leading-[1.08] -tracking-[0.02em] m-0">Présentations</h1>
          <p className="text-[#8b9391] text-[14px] leading-[1.5] mt-2 max-w-[460px] mx-auto">
            Choisissez un projet et générez son dossier de financement, prêt à envoyer à la banque.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#8b9391] animate-spin" />
          </div>
        )}

        {/* Recherche + liste de projets (tant qu'aucun n'est sélectionné) */}
        {!selectedProject && !isLoading && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-[#121413] border border-[#282b2a] rounded-none px-[18px] flex items-center focus-within:border-[#565b59] focus-within:shadow-[0_0_0_3px_rgba(86,91,89,0.2)] transition-all mb-5">
              <FolderSearch className="w-4 h-4 text-[#6b7270] flex-shrink-0" />
              <input
                autoFocus
                placeholder="Rechercher un projet par titre, adresse ou client..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full bg-transparent border-none text-[#edeae5] outline-none placeholder:text-[#6b7270] py-3.5 px-3 text-[15px]"
              />
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#121413] border border-[#282b2a] rounded-none flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-[#343735]" />
                </div>
                <p className="text-[#6b7270] text-sm">Aucun projet ne correspond à votre recherche.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setProjectSearch(""); }}
                    className="w-full flex items-center gap-3 text-left bg-[#121413] border border-[#282b2a] rounded-none px-4 py-3.5 hover:border-[#565b59] hover:bg-[#edeae5]/[0.04] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#edeae5]/[0.05] flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#8b9391]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[#edeae5] text-[14px] font-medium truncate">{p.titre || "Sans titre"}</p>
                      {p.adresse_complete && <p className="text-[#6b7270] text-[12px] truncate">{p.adresse_complete}</p>}
                    </div>
                    {p.presentation_google_slides && (
                      <span className="text-[10px] tracking-[0.12em] uppercase text-[#7fd3c9] flex-shrink-0">Générée</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedProject && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <button
              onClick={() => setSelectedId("")}
              className="inline-flex items-center gap-1.5 text-[#8b9391] hover:text-[#edeae5] text-[14px] mb-5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Changer de projet
            </button>
            <h2 className="text-[20px] font-light text-[#edeae5] mb-1">{selectedProject.titre || "Sans titre"}</h2>
            {selectedProject.adresse_complete && <p className="text-[#6b7270] text-[13px] mb-6">{selectedProject.adresse_complete}</p>}

            <PanneauGeneration project={selectedProject} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
