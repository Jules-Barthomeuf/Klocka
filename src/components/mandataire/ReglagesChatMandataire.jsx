import React, { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { Depliant, PanneauSources, PastilleSource } from "@/components/haka/ReglagesDemande";
import { RACCOURCIS_MANDATAIRE, SOURCES_MANDATAIRE } from "@/components/mandataire/RaccourcisMandataire";

// Les compétences et les sources dans les chats d'un bien (26 oct. 2026, Jules : « dans les chats de l'avis de valeur,
// de la pré-visite, du mandat ») : les mêmes que sur l'accueil Haka du mandataire, en plus petit, sous la saisie.
// Une compétence choisie se pose dans la saisie et montre ce qu'elle lit ; le « + » choisit les sources.

const PETITE = "inline-flex h-8 items-center gap-1.5 rounded-full border border-trait bg-surface-pleine px-3 text-[12.5px] text-encre transition-colors duration-300 hover:border-bord-vif max-md:h-9 max-md:w-9 max-md:justify-center max-md:px-0";

/**
 * @param {string[]} cles les compétences proposées dans ce chat (clés de RACCOURCIS_MANDATAIRE)
 * @returns {{ reglages: object, sousSaisie: React.ReactNode }} à passer à ChatDashboard (`reglages`, `sousSaisie`)
 */
export function useReglagesChatMandataire(cles = []) {
  const [competence, setCompetence] = useState(null);
  const [sources, setSources] = useState([]);
  const [sourcesOuvert, setSourcesOuvert] = useState(false);
  const choisirCompetence = useCallback((c) => setCompetence(c ? { cle: c.cle, nom: c.nom, outils: (c.outils || []).map((cle) => (typeof cle === "string" ? { cle } : cle)) } : null), []);
  const panneau = <PanneauSources sources={sources} onChange={setSources} choix={SOURCES_MANDATAIRE} />;
  const reglages = useMemo(() => ({ sources, competence, eteintes: [], choisirCompetence, sourcesOuvert, onOuvrirSources: () => setSourcesOuvert((o) => !o), panneau }),
    // Le panneau se redessine avec les sources : elles suffisent à le suivre.
    [sources, competence, choisirCompetence, sourcesOuvert]);
  const proposees = RACCOURCIS_MANDATAIRE.filter((c) => cles.includes(c.cle));
  const sousSaisie = (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {proposees.map((c) => {
          const sel = competence?.cle === c.cle;
          return (
            <button key={c.cle} type="button" onClick={() => choisirCompetence(sel ? null : c)} aria-pressed={sel} aria-label={c.nom} title={c.nom}
              className={`${PETITE} ${sel ? "border-menthe/60 bg-menthe/10" : ""}`}>
              <c.Icone className={`h-3.5 w-3.5 ${sel ? "text-menthe" : "text-ardoise"}`} strokeWidth={1.8} /><span className="max-md:hidden">{c.nom}</span>
            </button>
          );
        })}
        <button type="button" onClick={() => setSourcesOuvert((o) => !o)} aria-expanded={sourcesOuvert}
          aria-label={sourcesOuvert ? "Fermer le choix des sources" : "Choisir les sources"} title={sourcesOuvert ? "Fermer" : "Choisir les sources que Haka lira"}
          className={`relative grid h-8 w-8 place-items-center rounded-full border transition-colors duration-300 max-md:h-9 max-md:w-9 ${sourcesOuvert || sources.length ? "border-menthe/60 text-menthe" : "border-trait bg-surface-pleine text-encre hover:border-bord-vif"}`}>
          <motion.span className="grid place-items-center" animate={{ rotate: sourcesOuvert ? 45 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}><Plus className="h-3.5 w-3.5" /></motion.span>
          {!sourcesOuvert && sources.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-menthe px-1 text-[10px] text-sur-menthe">{sources.length}</span>}
        </button>
      </div>
      <Depliant ouvert={!!competence && (competence.outils || []).length > 0}>
        <div className="flex flex-wrap gap-1.5 pt-2.5">{(competence?.outils || []).map((o) => <PastilleSource key={o.cle} cle={o.cle} fixe />)}</div>
      </Depliant>
    </div>
  );
  return { reglages, sousSaisie };
}
