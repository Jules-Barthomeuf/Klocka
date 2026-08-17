import React, { useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import PullToRefresh from "@/components/mobile/PullToRefresh";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, ArrowRight, Calendar, MapPin, ArrowUpRight, Search } from "lucide-react";
import { motion } from "framer-motion";
import { NeonButton } from "@/components/ui/neon-button";
import ClientProjectCard2 from "@/components/dashboard/ClientProjectCard2";

const statutLabels = {
  prospect: "Prospect",
  analyse: "En analyse",
  negociation: "Négociation",
  financement: "Financement",
  signe: "Signé"
};

export default function MesProjets() {
  const navigate = useNavigate();
  const user = useUser();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', user?.email, user?.projet_selectionne_id, user?.compte_maitre_email],
    queryFn: async () => {
      if (!user) return [];
      const emailToCheck = user.est_compte_shadow && user.compte_maitre_email ?
        user.compte_maitre_email : user.email;
      const userEtape = user.etape_actuelle || 1;

      if (userEtape >= 4 && user.projet_selectionne_id) {
        const allProjects = await base44.entities.Project.list();
        return allProjects.filter((p) => p.id === user.projet_selectionne_id);
      }

      const allProjects = await base44.entities.Project.list();
      return allProjects.filter((p) =>
        p.client_email === emailToCheck ||
        p.client_emails && p.client_emails.includes(emailToCheck) ||
        p.client_email === user.email ||
        p.client_emails && p.client_emails.includes(user.email)
      );
    },
    enabled: !!user,
    initialData: []
  });

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#050807]">
        <div className="relative w-16 h-4">
          <div className="absolute w-3 h-3 bg-[#33d6c0] rounded-full animate-[bounce-horizontal_1s_ease-in-out_infinite]"></div>
        </div>
        <style>{`
          @keyframes bounce-horizontal {
            0%, 100% { left: 0; }
            50% { left: calc(100% - 12px); }
          }
        `}</style>
      </div>
    );
  }

  const previewClientMode = localStorage.getItem('previewClientMode') === 'true';
  const userEtape = user.etape_actuelle || 1;
  const isAdmin = user.role === "admin";
  const showAsClient = !isAdmin || previewClientMode;

  // Étape 1 - Accès bloqué
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

  // Étape 2 - Prendre rendez-vous
  if (showAsClient && userEtape === 2) {
    return (
      <div className="min-h-screen bg-[#050807] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/[0.015] rounded-md border border-[#131c1b] p-8 text-center">
          <div className="w-16 h-16 bg-[#33d6c0]/[0.07] rounded-md flex items-center justify-center mx-auto mb-6">
            <Calendar className="w-8 h-8 text-[#33d6c0]" />
          </div>
          <h2 className="text-xl font-light text-white mb-3">Définissons votre stratégie</h2>
          <p className="text-white/30 text-sm mb-6">
            Avant d'accéder aux projets, nous devons définir ensemble votre stratégie d'investissement.
          </p>
          <NeonButton
            onClick={() => navigate(createPageUrl("Questionnaire"))}
            variant="default"
            className="w-full inline-flex items-center justify-center"
          >
            Prendre rendez-vous
            <ArrowRight className="w-4 h-4 ml-2" />
          </NeonButton>
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
    <div className="min-h-screen bg-[#050807]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10"
        >
          <p className="text-[#33d6c0] uppercase tracking-[0.3em] text-[10px] font-medium mb-3">
            Portfolio
          </p>
          <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">
            Mes projets
          </h1>
          <div className="h-px w-16 bg-[#33d6c0] mt-3" />
          <p className="text-white/30 text-sm mt-3">
            {projects.length} projet{projects.length > 1 ? 's' : ''} en cours
          </p>
        </motion.div>

        {/* Search */}
        {projects.length > 1 && (
          <div className="mb-6 relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un projet..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-[#1c2725] rounded-md text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#33d6c0]/40 transition-colors"
            />
          </div>
        )}

        {/* Projects Grid */}
        {(() => {
          const q = searchQuery.toLowerCase().trim();
          const filtered = q ? projects.filter((p) =>
            (p.titre || "").toLowerCase().includes(q) ||
            (p.adresse_complete || "").toLowerCase().includes(q) ||
            (p.statut || "").toLowerCase().includes(q) ||
            (p.nom_locataire || "").toLowerCase().includes(q)
          ) : projects;
          return filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filtered.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <ClientProjectCard2 project={project} />
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 bg-white/[0.03] rounded-md flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-7 h-7 text-white/10" />
            </div>
            <p className="text-white/30 text-sm">Aucun projet pour le moment</p>
            <p className="text-white/15 text-xs mt-1">
              {searchQuery ? "Essayez un autre terme" : "Vos projets apparaîtront ici"}
            </p>
          </motion.div>
        );
        })()}
      </div>
    </div>
    </PullToRefresh>
  );
}