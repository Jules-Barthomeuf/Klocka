import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import CommunesAgent from "@/components/mandataire/CommunesAgent";

// L'accueil du mandataire : à son arrivée, il règle ce dont son espace a
// besoin. Une étape aujourd'hui, où cherche son agent IA ; les suivantes
// s'ajoutent à ETAPES. Tout se retrouve ensuite dans Compte, modifiable.
// La fenêtre revient tant que l'étape n'est pas validée.

const ETAPES = [
  {
    cle: "communes",
    titre: "Où cherche votre agent",
    texte: "Votre agent IA parcourt votre secteur toute la journée pour trouver les propriétaires des murs. Il lit toujours les villes Klocka, celles où nos investisseurs achètent. Cochez en plus les communes de votre secteur que vous travaillez pour votre activité.",
  },
];

export default function AccueilMandataire() {
  const { data } = useQuery({ queryKey: ["m-agent-communes"], queryFn: () => base44.request("GET", "/api/mandataire/agent/communes"), staleTime: 60_000 });
  if (!data?.secteur || data.regle) return null;
  const e = ETAPES[0];
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 max-md:p-3 md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Bienvenue dans votre espace">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="k-grid relative flex max-h-[88vh] w-full max-w-[760px] max-md:max-h-[calc(100dvh-24px)] flex-col overflow-hidden rounded-[20px] border border-bord-vif bg-fond shadow-[0_40px_120px_-24px_rgba(0,0,0,0.8)]">
        {/* La liste défile ; « Valider » reste en bas à droite. */}
        <CommunesAgent accueil entete={(
          <div className="mb-6">
            <p className="m-0 text-[12px] uppercase tracking-[0.14em] text-brume">Bienvenue · étape 1 sur {ETAPES.length}</p>
            <h2 className="m-0 mt-2 text-[24px] font-normal tracking-[-0.02em] text-encre max-md:text-[21px]">{e.titre}</h2>
            <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-ardoise">{e.texte}</p>
          </div>
        )} />
      </motion.div>
    </div>,
    document.body,
  );
}
