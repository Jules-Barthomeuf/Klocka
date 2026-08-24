import React from "react";
import { motion } from "framer-motion";
import FeedbackWidget from "../FeedbackWidget";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  return (
    <div className="min-h-screen bg-[#0a0c0c]">
      <FeedbackWidget />
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <PlanDeTravail />
        </motion.div>
      </div>
    </div>
  );
}
