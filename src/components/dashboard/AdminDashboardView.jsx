import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import BoiteMail from "@/components/dashboard/BoiteMail";

// Le dashboard admin, c'est le plan de travail — rien d'autre.
//
// Les agrégats d'activité (compteurs clients/projets, pipeline, carte CRM) ont
// été retirés : ils décrivaient l'état de la plateforme sans jamais dire quoi
// faire. Ces chiffres restent consultables sur leurs pages respectives.

export default function AdminDashboardView() {
  const [conversation, setConversation] = useState(false);
  // Sur ordinateur, la pilule des boîtes rejoint le coin en haut à droite, à côté de « Rappel » (8 oct. 2026).
  const [coin, setCoin] = useState(null);
  useEffect(() => { setCoin(document.getElementById("k-haut-droite")); }, []);
  const [historique, setHistorique] = useState(false);
  return (
    <div className="min-h-screen">
      <div className={`mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pb-14 pt-4"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Les boîtes d'envoi, en haut à droite : sans elles, la moitié de
              ce qui se décide ici ne part nulle part. */}
          {!conversation && (
            <>
              <div className={`flex justify-end ${coin ? "md:hidden" : ""}`}>
                <BoiteMail />
              </div>
              {coin && createPortal(<BoiteMail />, coin)}
            </>
          )}
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne /> : null}
            chat={<ChatDashboard onConversation={setConversation} onHistorique={setHistorique} />}
          />
        </motion.div>
      </div>
    </div>
  );
}
