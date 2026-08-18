import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Play, ArrowRight, Clock, CheckCircle2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

// Plages d'ordre par étape + message contextuel
const etapeConfig = {
  1: {
    orders: [1, 2, 3],
    reason: "Vous débutez votre parcours — ces fondamentaux vous donnent les bases indispensables pour comprendre l'immobilier commercial avant d'aller plus loin."
  },
  2: {
    orders: [4, 5, 8],
    reason: "Maintenant que vous maîtrisez les bases, il est temps d'explorer des typologies plus spécifiques et de travailler votre posture d'investisseur."
  },
  3: {
    orders: [6, 7],
    reason: "Vous êtes prêt pour les sujets techniques : modes de calcul, bail commercial et compromis sont essentiels pour sécuriser vos futures opérations."
  },
};

function pickRandomResource(resources, viewedIds, userEtape) {
  const config = etapeConfig[Math.min(userEtape, 3)] || etapeConfig[1];
  const tranche = resources.filter(r => config.orders.includes(r.ordre));
  const unseen = tranche.filter(r => !viewedIds.includes(r.id));
  
  const pool = unseen.length > 0 ? unseen : tranche;
  if (pool.length === 0) return null;
  
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { resource: picked, reason: config.reason, allViewed: unseen.length === 0 };
}

export default function DashboardSuggestedResources({ user }) {
  const navigate = useNavigate();
  const userEtape = user?.etape_actuelle || 1;
  const viewedResources = user?.viewed_resources || [];

  const { data: resources = [] } = useQuery({
    queryKey: ['resources-all'],
    queryFn: () => base44.entities.Resource.filter({ visible: true }, "ordre"),
    initialData: []
  });

  // Mémoriser le pick pour ne pas changer à chaque re-render
  const suggestion = useMemo(() => {
    if (resources.length === 0) return null;
    return pickRandomResource(resources, viewedResources, userEtape);
  }, [resources.length, viewedResources.length, userEtape]);

  if (!suggestion) return null;

  const { resource, reason, allViewed } = suggestion;

  const handleOpen = async () => {
    if (!viewedResources.includes(resource.id)) {
      await base44.auth.updateMe({ viewed_resources: [...viewedResources, resource.id] });
    }
    if (resource.url_fichier) {
      window.open(resource.url_fichier, '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="bg-[#0e100f] border border-[#edeae5]/[0.12] p-4"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#e0c9a0]" />
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#e0c9a0] m-0">Ressource suggérée</p>
        </div>
        <button
          onClick={() => navigate(createPageUrl("Ressources"))}
          className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.16em] uppercase text-[#7fd3c9] hover:text-[#edeae5] transition-colors"
        >
          Toutes les ressources
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div
        onClick={handleOpen}
        className="group cursor-pointer flex gap-4 bg-[#0a0c0c] border border-[#edeae5]/[0.12] hover:border-[#35a79b]/60 transition-colors duration-300 overflow-hidden"
      >
        {/* Thumbnail */}
        <div className="relative w-40 md:w-52 flex-shrink-0 overflow-hidden bg-[#edeae5]/[0.02]">
          {resource.image_miniature ? (
            <img
              src={resource.image_miniature}
              alt={resource.titre}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full min-h-[100px] flex items-center justify-center">
              <Play className="w-10 h-10 text-[#35a79b]/30" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c0c]/30 group-hover:bg-[#0a0c0c]/20 transition-colors">
            <div className="w-10 h-10 rounded-full bg-[#edeae5]/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-4 h-4 text-[#edeae5] fill-white ml-0.5" />
            </div>
          </div>
          {viewedResources.includes(resource.id) && (
            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#35a79b] flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-[#edeae5]" />
            </div>
          )}
          {resource.duree_minutes && (
            <div className="absolute bottom-2 left-2 bg-[#0a0c0c]/70 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
              <Clock className="w-2.5 h-2.5 text-[#edeae5]/70" />
              <span className="text-[9px] text-[#edeae5]/70">{resource.duree_minutes} min</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 py-3 pr-4 flex flex-col justify-center">
          <h3 className="text-[#edeae5] text-sm md:text-base font-medium mb-1.5 group-hover:text-[#7fd3c9] transition-colors leading-snug">
            {resource.titre}
          </h3>
          <p className="text-[#edeae5]/50 text-[11px] md:text-xs leading-relaxed">
            {reason}
          </p>
          {allViewed && (
            <p className="text-[#8b9391] text-[10px] mt-2 mb-0">Déjà vue — un rappel ne fait jamais de mal.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}