import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderSearch, Loader2, Building2, ChevronLeft, ChevronRight, Download, ExternalLink, Briefcase, Upload, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

// Page Présentations : on choisit un projet, six photos (suggérées depuis le
// projet, remplaçables), puis Générer construit le dossier « Projet de
// Financement » en quinze diapositives et l'ouvre dans Google Slides.

const EMPLACEMENTS = [
  { cle: "sommaire", label: "1 · Sommaire" },
  { cle: "ville", label: "2 · La ville" },
  { cle: "quartier", label: "3 · Zoom sur le quartier" },
  { cle: "local1", label: "4 · Local — photo A" },
  { cle: "local2", label: "5 · Local — photo B" },
  { cle: "conditions", label: "6 · Conditions souhaitées (fixe)" },
];

function CasePhoto({ label, url, suggestions, onChange }) {
  const fichierRef = useRef(null);
  const [envoi, setEnvoi] = useState(false);

  const index = suggestions.indexOf(url);
  const naviguer = (sens) => {
    if (!suggestions.length) return;
    const suivant = index === -1 ? 0 : (index + sens + suggestions.length) % suggestions.length;
    onChange(suggestions[suivant]);
  };

  const importer = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnvoi(true);
    try {
      const r = await base44.integrations.Core.UploadFile({ file });
      if (r?.file_url) onChange(r.file_url);
    } catch (err) {
      toast.error(err?.message || "Import impossible");
    }
    setEnvoi(false);
  };

  return (
    <div className="bg-[#0f1114] border border-[#1f2228]">
      <div className="relative aspect-video bg-[#000000] overflow-hidden">
        {url ? (
          <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageOff className="w-6 h-6 text-[#22262d]" />
          </div>
        )}
        {envoi && (
          <div className="absolute inset-0 bg-[#000000]/70 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#c3ddd6] animate-spin" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-2.5 py-2">
        <span className="text-[10.5px] tracking-[0.06em] uppercase text-[#9298a6] truncate">{label}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {suggestions.length > 1 && (
            <>
              <button onClick={() => naviguer(-1)} title="Photo précédente du projet"
                className="w-6 h-6 flex items-center justify-center text-[#9298a6] hover:text-[#f2f3f5] transition-colors">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => naviguer(1)} title="Photo suivante du projet"
                className="w-6 h-6 flex items-center justify-center text-[#9298a6] hover:text-[#f2f3f5] transition-colors">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => fichierRef.current?.click()} title="Importer une image"
            className="w-6 h-6 flex items-center justify-center text-[#9298a6] hover:text-[#c3ddd6] transition-colors">
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input ref={fichierRef} type="file" accept="image/*" className="hidden" onChange={importer} />
        </div>
      </div>
    </div>
  );
}

function PanneauGeneration({ project }) {
  const queryClient = useQueryClient();
  const [resultat, setResultat] = useState(null);
  const [photos, setPhotos] = useState({});

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const compteDrive = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;

  // La photo « conditions » est la même pour tous les dossiers : mémorisée
  // dans les réglages, resservie à chaque génération.
  const { data: reglages } = useQuery({
    queryKey: ["app-settings-global"],
    queryFn: async () => (await base44.entities.AppSettings.filter({ setting_key: "global" }))?.[0] || null,
  });

  const suggestions = useMemo(
    () => (project.photos || []).filter((u) => typeof u === "string" && u),
    [project.photos]
  );

  useEffect(() => {
    setResultat(null);
    setPhotos({
      sommaire: suggestions[0] || null,
      ville: suggestions[1] || suggestions[0] || null,
      quartier: suggestions[2] || suggestions[0] || null,
      local1: suggestions[3] || suggestions[0] || null,
      local2: suggestions[4] || suggestions[1] || null,
      conditions: reglages?.presentation_conditions_photo || null,
    });
  }, [project.id, suggestions, reglages?.presentation_conditions_photo]);

  const generer = useMutation({
    mutationFn: () =>
      base44.request("POST", `/api/admin/projets/${project.id}/presentation`, {
        body: { compte: compteDrive, photos },
      }),
    onSuccess: (r) => {
      setResultat(r);
      queryClient.invalidateQueries({ queryKey: ["all-projects-presentations"] });
      queryClient.invalidateQueries({ queryKey: ["app-settings-global"] });
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
    <div className="space-y-5">
      {/* Les six photos du dossier */}
      <div className="bg-[#0f1114] border border-[#1f2228] p-5">
        <p className="text-[#f2f3f5] text-sm font-medium mb-1">Les six photos du dossier</p>
        <p className="text-[#9298a6] text-xs mb-4">
          Suggérées depuis les photos du projet — utilisez les flèches pour en changer ou importez
          la vôtre. La photo des conditions souhaitées est commune à tous les dossiers.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {EMPLACEMENTS.map(({ cle, label }) => (
            <CasePhoto
              key={cle}
              label={label}
              url={photos[cle] || null}
              suggestions={suggestions}
              onChange={(u) => setPhotos((prev) => ({ ...prev, [cle]: u }))}
            />
          ))}
        </div>
      </div>

      {/* Génération */}
      <div className="bg-[#0f1114] border border-[#1f2228] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[#f2f3f5] text-sm font-medium mb-1">Présentation de financement</p>
            <p className="text-[#9298a6] text-xs max-w-xl">
              Quinze diapositives : couverture, sommaire, ville, carte de l'emplacement, quartier,
              local, bail, enseignes du secteur, prix vs marché, projection, conditions,
              CV et structuration — puis retouchables dans Google Slides.
            </p>
          </div>
          <button
            onClick={() => generer.mutate()}
            disabled={generer.isPending}
            className="inline-flex items-center justify-center gap-2 text-[#0f1114] px-6 py-3 text-[14px] font-bold hover:brightness-95 transition-all disabled:opacity-60"
            style={{ background: "#f2f3f5" }}
          >
            {generer.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Génération…</>
            ) : (
              <><Briefcase className="w-4 h-4" /> {slidesUrl || pptxUrl ? "Regénérer" : "Générer"}</>
            )}
          </button>
        </div>

        {generer.isPending && (
          <p className="text-[#9298a6] text-xs">
            Analyse, carte, enseignes et photos en cours d'assemblage — comptez une quinzaine de secondes.
          </p>
        )}

        {(slidesUrl || pptxUrl) && (
          <div className="flex flex-wrap items-center gap-4">
            {slidesUrl && (
              <a href={slidesUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs px-4 py-2 border border-[#2c3139] bg-[#f2f3f5]/[0.06] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] transition-colors">
                <ExternalLink className="w-3.5 h-3.5" />
                Ouvrir dans Google Slides
              </a>
            )}
            {pptxUrl && (
              <a href={pptxUrl} download
                className="inline-flex items-center gap-2 text-xs text-[#9298a6] hover:text-[#f2f3f5] transition-colors">
                <Download className="w-3.5 h-3.5" />
                Télécharger le PPTX
              </a>
            )}
            {project.presentation_generee_le && !resultat && (
              <span className="text-[#6a7180] text-xs">
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
              className="inline-flex items-center gap-2 text-xs px-4 py-2.5 border border-[#2c3139] bg-[#f2f3f5]/[0.06] hover:bg-[#f2f3f5]/[0.1] text-[#f2f3f5] transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Connecter Google Slides
            </button>
            <p className="text-[#9298a6] text-xs max-w-md">
              Une autorisation Google unique pour que les présentations s'ouvrent directement dans
              Google Slides. Sans elle, le dossier reste un PPTX à télécharger.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// La ville d'un projet, lue dans son adresse : ce qui suit le code postal
// quand il y en a un, sinon le dernier segment (en sautant « France »). La
// casse est harmonisée pour que NICE et Nice ne fassent qu'une ville.
// « Autres » regroupe les adresses inexploitables.
function villeDe(p) {
  const adresse = String(p.adresse_complete || "");
  let brut = "";
  const apresCp = adresse.match(/\b\d{5}\b[\s,]*([^,\d]+)/);
  if (apresCp) {
    brut = apresCp[1];
  } else {
    const segments = adresse.split(",").map((s) => s.trim()).filter(Boolean);
    brut = segments.pop() || "";
    if (/^france$/i.test(brut)) brut = segments.pop() || "";
  }
  brut = brut.replace(/\b\d{5}\b/g, "").replace(/\bfrance\b/gi, "").trim();
  if (!brut || /\d/.test(brut) || brut.length > 30) return "Autres";
  return brut.toLowerCase().replace(/(^|[\s\-'])\p{L}/gu, (c) => c.toUpperCase());
}

function LigneProjet({ p, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 text-left bg-[#0f1114] border border-[#1f2228] px-4 py-3.5 hover:border-[#3a3f4a] hover:bg-[#f2f3f5]/[0.04] transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-[#f2f3f5]/[0.05] flex items-center justify-center flex-shrink-0">
        <Building2 className="w-4 h-4 text-[#9298a6]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[#f2f3f5] text-[14px] font-medium truncate">{p.titre || "Sans titre"}</p>
        {p.adresse_complete && <p className="text-[#6a7180] text-[12px] truncate">{p.adresse_complete}</p>}
      </div>
      {p.presentation_google_slides && (
        <span className="text-[10px] tracking-[0.12em] uppercase text-[#c3ddd6] flex-shrink-0">Générée</span>
      )}
    </button>
  );
}

export default function AdminPresentations() {
  const [selectedId, setSelectedId] = useState("");
  const [ville, setVille] = useState("");
  const [recherche, setRecherche] = useState("");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["all-projects-presentations"],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedId) || null,
    [projects, selectedId]
  );

  // Villes triées alphabétiquement, avec leur nombre de dossiers.
  const villes = useMemo(() => {
    const compte = new Map();
    for (const p of projects) {
      const v = villeDe(p);
      compte.set(v, (compte.get(v) || 0) + 1);
    }
    return [...compte.entries()].sort((a, b) =>
      a[0] === "Autres" ? 1 : b[0] === "Autres" ? -1 : a[0].localeCompare(b[0], "fr")
    );
  }, [projects]);

  // La recherche court-circuite le tri par ville : elle mène droit au dossier.
  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return null;
    return projects.filter(
      (p) =>
        p.titre?.toLowerCase().includes(q) ||
        p.adresse_complete?.toLowerCase().includes(q) ||
        p.client_email?.toLowerCase().includes(q) ||
        villeDe(p).toLowerCase().includes(q)
    );
  }, [projects, recherche]);

  const projetsDeLaVille = useMemo(
    () => (ville ? projects.filter((p) => villeDe(p) === ville) : []),
    [projects, ville]
  );

  const ouvrirProjet = (id) => { setSelectedId(id); setRecherche(""); };

  return (
    <div className="min-h-screen text-[#f2f3f5] p-4 md:p-10" style={{ background: "linear-gradient(160deg,#000000 0%,#000000 90%)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-9 text-center">
          <h1 className="text-[28px] md:text-[32px] font-light leading-[1.08] -tracking-[0.02em] m-0">Présentations</h1>
          <p className="text-[#9298a6] text-[14px] leading-[1.5] mt-2 max-w-[460px] mx-auto">
            Une ville, un dossier : générez la présentation de financement.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#9298a6] animate-spin" />
          </div>
        )}

        {/* Villes / recherche / projets d'une ville */}
        {!selectedProject && !isLoading && (
          <div className="w-full">
            <div className="bg-[#0f1114] border border-[#1f2228] px-[18px] flex items-center focus-within:border-[#3a3f4a] focus-within:shadow-[0_0_0_3px_rgba(86,91,89,0.2)] transition-all mb-6">
              <FolderSearch className="w-4 h-4 text-[#6a7180] flex-shrink-0" />
              <input
                autoFocus
                placeholder="Rechercher une ville, un dossier, une adresse, un client…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className="w-full bg-transparent border-none text-[#f2f3f5] outline-none placeholder:text-[#6a7180] py-3.5 px-3 text-[15px]"
              />
            </div>

            {resultats ? (
              // Résultats de recherche : directement les dossiers.
              resultats.length === 0 ? (
                <div className="text-center py-16">
                  <Building2 className="w-8 h-8 text-[#22262d] mx-auto mb-4" />
                  <p className="text-[#6a7180] text-sm">Aucun dossier ne correspond à votre recherche.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {resultats.slice(0, 30).map((p) => (
                    <LigneProjet key={p.id} p={p} onClick={() => ouvrirProjet(p.id)} />
                  ))}
                  {resultats.length > 30 && (
                    <p className="text-[#6a7180] text-xs text-center pt-2">
                      {resultats.length - 30} autres résultats — précisez la recherche.
                    </p>
                  )}
                </div>
              )
            ) : ville ? (
              // Les dossiers d'une ville.
              <div>
                <button
                  onClick={() => setVille("")}
                  className="inline-flex items-center gap-1.5 text-[#9298a6] hover:text-[#f2f3f5] text-[14px] mb-4 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Toutes les villes
                </button>
                <h2 className="text-[19px] font-light text-[#f2f3f5] mb-4">
                  {ville}
                  <span className="text-[#6a7180] text-[13px] ml-2">
                    {projetsDeLaVille.length} dossier{projetsDeLaVille.length > 1 ? "s" : ""}
                  </span>
                </h2>
                <div className="space-y-2">
                  {projetsDeLaVille.map((p) => (
                    <LigneProjet key={p.id} p={p} onClick={() => ouvrirProjet(p.id)} />
                  ))}
                </div>
              </div>
            ) : (
              // L'entrée : les villes, triées, avec leur nombre de dossiers.
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {villes.map(([nom, n]) => (
                  <button
                    key={nom}
                    onClick={() => setVille(nom)}
                    className="text-left bg-[#0f1114] border border-[#1f2228] px-4 py-4 hover:border-[#96c0b8]/60 hover:bg-[#f2f3f5]/[0.03] transition-all"
                  >
                    <p className="text-[#f2f3f5] text-[15px] font-medium truncate">{nom}</p>
                    <p className="text-[#6a7180] text-[12px] mt-1">
                      {n} dossier{n > 1 ? "s" : ""}
                    </p>
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
              className="inline-flex items-center gap-1.5 text-[#9298a6] hover:text-[#f2f3f5] text-[14px] mb-5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {ville || "Retour"}
            </button>
            <h2 className="text-[20px] font-light text-[#f2f3f5] mb-1">{selectedProject.titre || "Sans titre"}</h2>
            {selectedProject.adresse_complete && <p className="text-[#6a7180] text-[13px] mb-6">{selectedProject.adresse_complete}</p>}

            <PanneauGeneration project={selectedProject} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
