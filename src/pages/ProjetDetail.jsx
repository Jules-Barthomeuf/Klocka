import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FeedbackWidget from "../components/FeedbackWidget";
import ProjetContent from "../components/projet/ProjetContent";

export default function ProjetDetail() {
  const user = useUser();
  const [projectId, setProjectId] = useState(null);
  const [showDoorAnimation, setShowDoorAnimation] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setProjectId(urlParams.get('id'));
  }, []);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.list();
      return projects.find((p) => p.id === projectId);
    },
    enabled: !!projectId,
    staleTime: 0,
    gcTime: 0,
  });

  if (!user || isLoading || !projectId) return (
    <div className="min-h-screen bg-[#050807] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#33d6c0]/30 border-t-[#33d6c0] rounded-full animate-spin"></div>
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-[#050807] flex items-center justify-center">
      <p className="text-white/30">Projet introuvable.</p>
    </div>
  );

  const userEtape = user.etape_actuelle || 1;
  const isAdmin = user.role === "admin";
  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const showAsClient = !isAdmin || previewClientMode;

  if (showAsClient && userEtape === 1) {
    return (
      <div className="min-h-screen bg-[#050807] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/[0.015] rounded-md border border-[#131c1b] p-8 text-center">
          <div className="w-16 h-16 bg-[#33d6c0]/[0.07] rounded-md flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-8 h-8 text-[#33d6c0]" />
          </div>
          <h2 className="text-xl font-light text-white mb-3">Accès en attente</h2>
          <p className="text-white/30 text-sm">Cette section sera débloquée par votre conseiller.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {showDoorAnimation && (
          <motion.div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050807]" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, delay: 1.5 }}>
            <motion.div className="absolute top-0 left-0 h-full w-1/2 bg-[#050807] border-r border-[#33d6c0]/30" initial={{ x: 0 }} animate={{ x: "-100%" }} transition={{ duration: 0.8, delay: 1, ease: "easeInOut" }} />
            <motion.div className="absolute top-0 right-0 h-full w-1/2 bg-[#050807] border-l border-[#33d6c0]/30" initial={{ x: 0 }} animate={{ x: "100%" }} transition={{ duration: 0.8, delay: 1, ease: "easeInOut" }} />
            <motion.h1 className="relative z-10 text-5xl max-md:text-3xl font-light text-white px-8 text-center" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} onAnimationComplete={() => setTimeout(() => setShowDoorAnimation(false), 1500)}>
              {project.titre}
            </motion.h1>
          </motion.div>
        )}
      </AnimatePresence>

      <FeedbackWidget />
      <ProjetContent project={project} isAdmin={isAdmin} showAsClient={showAsClient} />
    </>
  );
}