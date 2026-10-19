import React, { useState } from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";

// Haka, l'accueil du mandataire K Partners (19 oct. 2026, Jules : « mets Haka comme dans l'admin ») : la mise en
// page de l'Accueil de l'équipe (le salut centré, la saisie au milieu, puis ce qui attend), avec le chat du
// mandataire derrière. Son agent garde ses outils à lui (server/mandataire.js) : jamais l'assistant de l'équipe,
// c'est ce qui le cloisonne. Rien dessous : ni rappels, ni « À faire ».

export default function MandataireDashboardView() {
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  return (
    <div className="relative min-h-screen">
      <div className={`mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pt-4 pb-14"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne espace="mandataire" /> : null}
            chat={<ChatDashboard espace="mandataire" onConversation={setConversation} onHistorique={setHistorique} libelleAccueil="Haka" sansSkills
              placeholderAccueil="Notez un appel, une relance, un rendez-vous, ou demandez à Haka…" />}
            apresChat={<div />}
            // Ni rappels ni « À faire » sous la saisie (19 oct. 2026, Jules : « enlève tout ça »). Un élément vide, pas null : sans lui, le plan de travail remettrait « Ce qui vous attend ».
            bas={<></>}
          />
        </motion.div>
      </div>
    </div>
  );
}
