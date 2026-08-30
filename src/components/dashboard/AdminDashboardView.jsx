import React from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  return (
    <div className="min-h-screen bg-[#000000]">
      {/* Une colonne large et beaucoup d'air : le plan de travail se parcourt
          d'un regard, il ne se déchiffre pas. */}
      <div className="max-w-[1400px] mx-auto px-5 md:px-12 py-10 md:py-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <PlanDeTravail />
        </motion.div>
      </div>
    </div>
  );
}
