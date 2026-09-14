import React from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard from "@/components/dashboard/ChatDashboard";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  return (
    <div className="min-h-screen bg-fond">
      {/* Une colonne large et beaucoup d'air : le plan de travail se parcourt
          d'un regard, il ne se déchiffre pas. */}
      <div className="mx-auto max-w-[1400px] px-5 pb-10 pt-6 md:px-12 md:pb-16 md:pt-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <PlanDeTravail chat={<ChatDashboard />} />
        </motion.div>
      </div>
    </div>
  );
}
