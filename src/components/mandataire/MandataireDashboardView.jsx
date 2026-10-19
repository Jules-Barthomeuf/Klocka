import React, { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import RaccourcisMandataire from "./RaccourcisMandataire";

// Haka, l'accueil du mandataire K Partners (19 oct. 2026, Jules : « mets Haka comme dans l'admin ») : la mise en
// page de l'Accueil de l'équipe (le salut centré, la saisie avec « Dossier : aucun » et « Répondre / Produire »,
// les raccourcis dessous), avec le chat du mandataire derrière. Son agent garde ses outils à lui
// (server/mandataire.js) : jamais l'assistant de l'équipe, c'est ce qui le cloisonne. Les dossiers proposés sont
// les siens ; pas de choix de « Sources », qui sont celles de l'équipe. Rien sous les raccourcis.

export default function MandataireDashboardView() {
  const [conversation, setConversation] = useState(false);
  const [historique, setHistorique] = useState(false);
  const [sortie, setSortie] = useState("repondre");
  const [competence, setCompetence] = useState(null);
  const choisirCompetence = useCallback((c) => {
    setCompetence(c ? { cle: c.cle, nom: c.nom } : null);
    if (c) setSortie("produire");
  }, []);
  const reglages = useMemo(() => ({ sources: [], sortie, setSortie, competence, eteintes: [], choisirCompetence }), [sortie, competence, choisirCompetence]);
  const surConversation = useCallback((ouverte) => {
    setConversation(ouverte);
    if (!ouverte) { setSortie("repondre"); setCompetence(null); }
  }, []);
  return (
    <div className="relative min-h-screen">
      <div className={`mx-auto max-w-[1100px] px-5 md:px-8 ${conversation ? "" : "pt-4 pb-14"}`}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <PlanDeTravail
            conversation={conversation}
            historique={historique ? <HistoriqueColonne espace="mandataire" /> : null}
            chat={<ChatDashboard espace="mandataire" onConversation={surConversation} onHistorique={setHistorique} libelleAccueil="Haka" sansSkills choixDossier reglages={reglages}
              placeholderAccueil="Notez un appel, une relance, un rendez-vous, ou demandez à Haka…" />}
            apresChat={<RaccourcisMandataire choisie={competence?.cle || null} className="mx-auto mt-5 max-w-[820px]"
              onChoisir={(c) => (competence?.cle === c.cle ? choisirCompetence(null) : choisirCompetence(c))} />}
            // Ni rappels ni « À faire » sous la saisie (19 oct. 2026, Jules : « enlève tout ça »). Un élément vide, pas null : sans lui, le plan de travail remettrait « Ce qui vous attend ».
            bas={<></>}
          />
        </motion.div>
      </div>
    </div>
  );
}
