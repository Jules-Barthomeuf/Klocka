import React, { useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@/components/providers/UserProvider";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import JourMandataire from "./JourMandataire";

// Le dashboard du mandataire K Partners (spécification V1 du 30 septembre
// 2026) : le chat avec l'agent IA, comme dans l'admin, et en dessous les
// rappels et ce qu'il y a à faire. Rien d'autre. Pensé pour le téléphone,
// d'une main, entre deux rendez-vous.

export default function MandataireDashboardView() {
  const utilisateur = useUser();
  const brut = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const prenom = brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : "";

  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  return (
    <div className="min-h-screen">
      <div className={`mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pb-14 pt-4"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <header className={conversation ? "flex flex-col" : "flex flex-col items-center pt-[13vh] text-center max-md:pt-8"}>
            {!conversation && <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
              Bonjour{prenom ? ` ${prenom}` : ""}. Que puis-je faire pour vous ?
            </h1>}
            <div className={conversation ? "w-full" : "mt-9 w-full max-w-[660px] max-md:mt-6"}>
              <ChatDashboard espace="mandataire" onConversation={setConversation} onHistorique={setHistorique} />
            </div>
          </header>
          {!conversation && (
            <div className="mx-auto mt-[9vh] max-w-[880px] max-md:mt-10">
              {historique ? <HistoriqueColonne espace="mandataire" /> : <JourMandataire />}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
