import React, { useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { BookOpen, Play, FileText, CheckCircle2, ExternalLink, Video, ArrowRight, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";


const typeIcons = {
  video: Video,
  pdf: FileText,
  article: FileText,
  guide: BookOpen,
  webinar: Video
};

const typeLabels = {
  video: "Vidéo",
  pdf: "PDF",
  article: "Article",
  guide: "Guide",
  webinar: "Webinar"
};

function ResourceImage({ src, alt }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 bg-white/[0.03] animate-pulse" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
}

export default function Ressources() {
  const navigate = useNavigate();
  const user = useUser();

  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['resources'],
    queryFn: () => base44.entities.Resource.filter({ visible: true }, "ordre"),
    initialData: []
  });

  const viewedResources = user?.viewed_resources || [];
  const progressPercent = resources.length > 0 
    ? Math.round((viewedResources.length / resources.length) * 100) 
    : 0;

  const handleMarkAsViewed = async (resourceId) => {
    if (!user || viewedResources.includes(resourceId)) return;
    const newViewedResources = [...viewedResources, resourceId];
    await base44.auth.updateMe({ viewed_resources: newViewedResources });
  };

  const handleOpenResource = (resource) => {
    handleMarkAsViewed(resource.id);
    if (resource.url_fichier) {
      window.open(resource.url_fichier, '_blank');
    }
  };

  if (!user || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#2A9D8F]"></div>
      </div>
    );
  }

  const userEtape = user.etape_actuelle || 1;
  const isAdmin = user.role === "admin";
  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const showAsClient = !isAdmin || previewClientMode;

  // Bloquer l'accès avant étape 1
  if (showAsClient && userEtape < 1) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/[0.015] rounded-2xl border border-white/[0.05] p-10 text-center">
          <div className="w-16 h-16 bg-[#2A9D8F]/[0.07] rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-[#2A9D8F]" />
          </div>
          <h2 className="text-xl font-light text-white mb-3">
            Accès en attente
          </h2>
          <p className="text-white/30 text-sm">
            Cette section sera débloquée par votre conseiller.
          </p>
        </div>
      </div>
    );
  }

  const hasResources = resources.length > 0;

  return (
    <div className="min-h-screen bg-black text-white p-3 md:p-8">

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-2">Formation</p>
          <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">Ressources</h1>
          <div className="h-px w-12 bg-[#2A9D8F] mt-3" />
        </div>

        {/* Barre de progression */}
        {hasResources && (
          <div className="bg-white/[0.015] rounded-2xl border border-white/[0.05] p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/60 text-xs uppercase tracking-[0.2em]">Progression</span>
              <span className="text-[#2A9D8F] text-sm font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5 bg-white/[0.04]" />
            <p className="text-white/30 text-xs mt-2">
              {viewedResources.length} / {resources.length} ressources consultées
            </p>
          </div>
        )}

        {/* Contenu principal */}
        {hasResources ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {resources.map((resource) => {
              const Icon = typeIcons[resource.type] || FileText;
              const isViewed = viewedResources.includes(resource.id);

              return (
                <div
                  key={resource.id}
                  onClick={() => handleOpenResource(resource)}
                  className={`group bg-white/[0.015] rounded-2xl border border-white/[0.05] hover:border-[#2A9D8F]/30 transition-all duration-300 cursor-pointer overflow-hidden ${
                    isViewed ? 'opacity-70' : ''
                  }`}
                >
                  {/* Preview image */}
                  <div className="relative aspect-square w-full overflow-hidden bg-white/[0.02]">
                    {resource.image_miniature ? (
                      <ResourceImage src={resource.image_miniature} alt={resource.titre} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon className="w-12 h-12 text-[#2A9D8F]/40" />
                      </div>
                    )}
                    {/* Play overlay for videos */}
                    {(resource.type === 'video' || resource.type === 'webinar') && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/30 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        </div>
                      </div>
                    )}
                    {/* Viewed badge */}
                    {isViewed && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#2A9D8F] flex items-center justify-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    {/* Duration badge */}
                    {resource.duree_minutes && (
                      <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5 text-white/70" />
                        <span className="text-[10px] text-white/70">{resource.duree_minutes} min</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="w-3.5 h-3.5 text-[#2A9D8F] flex-shrink-0" />
                      <span className="text-[10px] text-[#2A9D8F] uppercase tracking-wider">{typeLabels[resource.type]}</span>
                    </div>
                    <h3 className="text-white font-medium text-xs md:text-sm line-clamp-2 group-hover:text-[#2A9D8F] transition-colors leading-snug">
                      {resource.titre}
                    </h3>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* État vide - bientôt disponible */
          <div className="bg-white/[0.015] rounded-2xl border border-white/[0.05] p-10 md:p-16 text-center">
            <div className="w-16 h-16 bg-[#2A9D8F]/[0.07] rounded-2xl flex items-center justify-center mx-auto mb-6">
              <BookOpen className="w-8 h-8 text-[#2A9D8F]" />
            </div>

            <h2 className="text-xl md:text-2xl font-light text-white mb-3">
              Bientôt disponible
            </h2>

            <p className="text-white/30 mb-8 text-sm max-w-md mx-auto">
              Nous préparons du contenu exclusif pour vous accompagner dans votre parcours d'investissement.
            </p>

            <button
              onClick={() => navigate(createPageUrl("Dashboard"))}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] rounded-full text-white text-sm transition-all"
            >
              Retour au tableau de bord
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}