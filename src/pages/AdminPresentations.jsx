import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Presentation, Copy, Check, FolderSearch, Loader2, Building2, ChevronLeft, Download, ImageIcon, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

// Champs internes à masquer dans l'extraction
const HIDDEN_KEYS = ["id", "created_date", "updated_date", "created_by", "created_by_id"];

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch {
    // Fallback : ouverture dans un nouvel onglet si le téléchargement direct échoue (CORS)
    window.open(url, "_blank");
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export default function AdminPresentations() {
  const [selectedId, setSelectedId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [showGenPrompt, setShowGenPrompt] = useState(false);
  const [showGenButton, setShowGenButton] = useState(false);

  const GENERATOR_URL = "https://immo-assistant.onrender.com/presentation";

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["all-projects-presentations"],
    queryFn: () => base44.entities.Project.list("-created_date"),
    initialData: [],
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

  // Entrées "propres" (sans champs internes ni valeurs vides)
  const entries = useMemo(() => {
    if (!selectedProject) return [];
    return Object.entries(selectedProject)
      .filter(([key, value]) => {
        if (HIDDEN_KEYS.includes(key)) return false;
        if (value === null || value === undefined || value === "") return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
        return true;
      })
      .filter(([key]) => !search || key.toLowerCase().includes(search.toLowerCase()));
  }, [selectedProject, search]);

  const cleanJson = useMemo(() => {
    if (!selectedProject) return "";
    const obj = {};
    Object.entries(selectedProject).forEach(([key, value]) => {
      if (HIDDEN_KEYS.includes(key)) return;
      obj[key] = value;
    });
    return JSON.stringify(obj, null, 2);
  }, [selectedProject]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanJson);
    setCopied(true);
    toast.success("JSON copié dans le presse-papier");
    setTimeout(() => setCopied(false), 2000);
    setShowGenPrompt(true);
  };

  return (
    <div className="min-h-screen text-[#EAECEF] p-4 md:p-10" style={{ background: "linear-gradient(160deg,#0B0D0F 0%,#000000 90%)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-9 flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 bg-[#33d6c0]/10 rounded-md flex items-center justify-center">
            <Presentation className="w-6 h-6 text-[#33d6c0]" />
          </div>
          <div>
            <h1 className="text-[28px] md:text-[32px] font-light leading-[1.08] -tracking-[0.02em] m-0">Présentations</h1>
            <p className="text-[#8D93A0] text-[14px] leading-[1.5] mt-2 max-w-[440px] mx-auto">
              Sélectionnez un projet pour extraire toutes les informations déjà enregistrées.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 text-[#33d6c0] animate-spin" />
          </div>
        )}

        {/* Recherche + liste de projets (tant qu'aucun n'est sélectionné) */}
        {!selectedProject && !isLoading && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] flex items-center focus-within:border-[#33d6c0] focus-within:shadow-[0_0_0_3px_rgba(42,157,143,0.14)] transition-all mb-5">
              <FolderSearch className="w-4 h-4 text-[#5B616C] flex-shrink-0" />
              <input
                autoFocus
                placeholder="Rechercher un projet par titre, adresse ou client..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="w-full bg-transparent border-none text-[#EAECEF] outline-none placeholder:text-[#5B616C] py-3.5 px-3 text-[15px]"
              />
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#171A21] border border-[#1c2725] rounded-[14px] flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-8 h-8 text-[#2E3340]" />
                </div>
                <p className="text-[#565C6A] text-sm">Aucun projet ne correspond à votre recherche.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setProjectSearch(""); }}
                    className="w-full flex items-center gap-3 text-left bg-[#171A21] border border-[#1c2725] rounded-[14px] px-4 py-3.5 hover:border-[#33d6c0]/40 hover:bg-[#33d6c0]/[0.04] transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#33d6c0]/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-[#33d6c0]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[#EAECEF] text-[14px] font-medium truncate">{p.titre || "Sans titre"}</p>
                      {p.adresse_complete && <p className="text-[#565C6A] text-[12px] truncate">{p.adresse_complete}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedProject && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <button
              onClick={() => { setSelectedId(""); setSearch(""); }}
              className="inline-flex items-center gap-1.5 text-[#8D93A0] hover:text-[#EAECEF] text-[14px] mb-5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Changer de projet
            </button>
            <h2 className="text-[20px] font-light text-[#EAECEF] mb-1">{selectedProject.titre || "Sans titre"}</h2>
            {selectedProject.adresse_complete && <p className="text-[#565C6A] text-[13px] mb-6">{selectedProject.adresse_complete}</p>}

            {/* Barre d'actions */}
            <div className="flex flex-col md:flex-row gap-3 mb-6 items-stretch md:items-center">
              <div className="flex-1 bg-[#171A21] border border-[#1c2725] rounded-[14px] px-[18px] flex items-center focus-within:border-[#33d6c0]">
                <FolderSearch className="w-4 h-4 text-[#5B616C] flex-shrink-0" />
                <input
                  placeholder="Filtrer les champs..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-transparent border-none text-[#EAECEF] outline-none placeholder:text-[#5B616C] py-3 px-3 text-[15px]"
                />
              </div>
              <div className="flex flex-col gap-3 flex-shrink-0">
                {showGenButton && (
                  <a
                    href={GENERATOR_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 text-white rounded-[14px] px-5 py-3 text-[14px] font-bold hover:brightness-110 transition-all border border-[#33d6c0]/40 bg-[#33d6c0]/[0.12]"
                  >
                    <Sparkles className="w-4 h-4" />
                    Générateur
                  </a>
                )}
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 text-white rounded-[14px] px-5 py-3 text-[14px] font-bold hover:brightness-110 transition-all"
                  style={{ background: "linear-gradient(120deg,#33d6c0,#238B7E)" }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copié" : "Copier le JSON"}
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Tableau des informations */}
              <div className="flex-1 bg-[#171A21] border border-[#1c2725] rounded-[14px] overflow-hidden w-full">
                {entries.length === 0 ? (
                  <p className="text-[#565C6A] text-sm text-center py-12">Aucun champ ne correspond au filtre.</p>
                ) : (
                  entries.map(([key, value], idx) => (
                    <div
                      key={key}
                      className={`flex flex-col md:flex-row md:items-start gap-1 md:gap-4 px-5 py-3.5 ${idx !== 0 ? "border-t border-[#16201f]" : ""}`}
                    >
                      <span className="text-[#8D93A0] text-[13px] font-medium md:w-72 flex-shrink-0 break-words">{key}</span>
                      <span className="text-[#EAECEF] text-[14px] whitespace-pre-wrap break-words flex-1">{formatValue(value)}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Colonne photos du projet */}
              {Array.isArray(selectedProject.photos) && selectedProject.photos.length > 0 && (
                <div className="w-full lg:w-[300px] flex-shrink-0 bg-[#171A21] border border-[#1c2725] rounded-[14px] p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <ImageIcon className="w-4 h-4 text-[#33d6c0]" />
                    <span className="text-[#EAECEF] text-[14px] font-medium">Photos du projet</span>
                    <span className="text-[#565C6A] text-[12px]">({selectedProject.photos.length})</span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                    {selectedProject.photos.map((photoUrl, i) => (
                      <div key={i} className="relative group rounded-[10px] overflow-hidden border border-[#1c2725]">
                        <img src={photoUrl} alt={`Photo ${i + 1}`} className="w-full h-32 object-cover" />
                        <button
                          onClick={() => downloadImage(photoUrl, `${(selectedProject.titre || "projet").replace(/[^a-z0-9]/gi, "_")}_photo_${i + 1}.jpg`)}
                          className="absolute top-2 right-2 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#050807]/60 backdrop-blur-sm text-white hover:bg-[#33d6c0] transition-all opacity-0 group-hover:opacity-100"
                          title="Télécharger l'image"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[#565C6A] text-xs text-center mt-4">{entries.length} champ(s) affiché(s)</p>
          </motion.div>
        )}
      </div>

      <Dialog open={showGenPrompt} onOpenChange={setShowGenPrompt}>
        <DialogContent className="bg-[#171A21] border-[#1c2725] text-[#EAECEF]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#33d6c0]" />
              Générateur de présentation
            </DialogTitle>
            <DialogDescription className="text-[#8D93A0]">
              Souhaitez-vous aller sur le générateur de présentation ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => { setShowGenPrompt(false); setShowGenButton(true); }}
              className="inline-flex items-center justify-center rounded-[12px] px-5 py-2.5 text-[14px] font-medium border border-[#24312f] text-[#8D93A0] hover:text-[#EAECEF] hover:border-white/[0.25] transition-all"
            >
              Non
            </button>
            <a
              href={GENERATOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowGenPrompt(false)}
              className="inline-flex items-center justify-center gap-2 text-white rounded-[12px] px-5 py-2.5 text-[14px] font-bold hover:brightness-110 transition-all"
              style={{ background: "linear-gradient(120deg,#33d6c0,#238B7E)" }}
            >
              <ExternalLink className="w-4 h-4" />
              Oui, y aller
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}