import React from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import BoiteMail from "@/components/dashboard/BoiteMail";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-5 md:px-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Les boîtes d'envoi, en haut à droite : sans elles, la moitié de
              ce qui se décide ici ne part nulle part. */}
          <div className="flex justify-end">
            <BoiteMail />
          </div>
          <PlanDeTravail chat={<ChatDashboard />} />
        </motion.div>
      </div>
    </div>
  );
}
