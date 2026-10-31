import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import PlanDeTravail from "@/components/dashboard/PlanDeTravail";
import ChatDashboard, { HistoriqueColonne } from "@/components/dashboard/ChatDashboard";
import BoiteMandataire from "@/components/mandataire/BoiteMandataire";
import RaccourcisMandataire, { SOURCES_MANDATAIRE } from "./RaccourcisMandataire";
import { Depliant, PanneauSources, PastilleSource } from "@/components/haka/ReglagesDemande";

// Haka, l'accueil du mandataire K Partners (19 oct. 2026, Jules : « mets Haka comme dans l'admin ») : la mise en
// page de l'Accueil de l'équipe (le salut centré, la saisie avec « Dossier : aucun » et « Répondre / Produire »,
// les raccourcis dessous), avec le chat du mandataire derrière. Son agent garde ses outils à lui
// (server/mandataire.js) : jamais l'assistant de l'équipe, c'est ce qui le cloisonne. Les dossiers proposés sont
// les siens. Depuis le 26 oct. 2026 (Jules : « les outils comme dans l'admin ») : le « + » choisit les sources qu'il lira
// (Equimmox, Data-B, DVF, INSEE, ses clients, sa prospection), et une compétence choisie montre les siennes dessous.

export default function MandataireDashboardView() {
  const [conversation, setConversation] = useState(false);
  useEffect(() => {
    document.documentElement.classList.add("k-sans-ascenseur");
    return () => document.documentElement.classList.remove("k-sans-ascenseur");
  }, []);
  const [historique, setHistorique] = useState(false);
  const [sortie, setSortie] = useState("repondre");
  const [competence, setCompetence] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourcesOuvert, setSourcesOuvert] = useState(false);
  const choisirCompetence = useCallback((c) => {
    setCompetence(c ? { cle: c.cle, nom: c.nom, outils: (c.outils || []).map((cle) => ({ cle })) } : null);
    if (c) setSortie("produire");
  }, []);
  const panneauSources = <PanneauSources sources={sources} onChange={setSources} choix={SOURCES_MANDATAIRE} />;
  const reglages = useMemo(() => ({ sources, sortie, setSortie, competence, eteintes: [], choisirCompetence, sourcesOuvert, onOuvrirSources: () => setSourcesOuvert((o) => !o), panneau: panneauSources }),
    // Le panneau se redessine avec les sources : elles suffisent à le suivre.
    [sources, sortie, competence, choisirCompetence, sourcesOuvert]);
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
            chat={<ChatDashboard espace="mandataire" onConversation={surConversation} onHistorique={setHistorique} libelleAccueil="Assistant KPartners" sansSkills choixDossier reglages={reglages}
              placeholderAccueil="Notez un appel, une relance, un rendez-vous, ou demandez à l'Assistant KPartners…" />}
            apresChat={(
              <>
                <RaccourcisMandataire choisie={competence?.cle || null} className="mx-auto mt-5 max-w-[820px]"
                  onChoisir={(c) => (competence?.cle === c.cle ? choisirCompetence(null) : choisirCompetence(c))}
                  sourcesOuvert={sourcesOuvert} onSources={() => setSourcesOuvert((o) => !o)} nbSources={sources.length} />
                <Depliant ouvert={!!competence && (competence.outils || []).length > 0} className="mx-auto max-w-[900px]">
                  <div className="flex flex-wrap justify-center gap-2 pt-5">
                    {(competence?.outils || []).map((o) => <PastilleSource key={o.cle} cle={o.cle} fixe />)}
                  </div>
                </Depliant>
                <Depliant ouvert={sourcesOuvert} className="mx-auto max-w-[900px]"><div className="pt-6">{panneauSources}</div></Depliant>
                <BoiteMandataire className="mx-auto mt-6 max-w-[820px]" />
              </>
            )}
            // Ni rappels ni « À faire » sous la saisie (19 oct. 2026, Jules : « enlève tout ça »). Un élément vide, pas null : sans lui, le plan de travail remettrait « Ce qui vous attend ».
            bas={<></>}
          />
        </motion.div>
      </div>
    </div>
  );
}
