import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calculator, FileSignature, FolderCheck, Mail, MapPin, PhoneCall, Plus, Users } from "lucide-react";
import { createPageUrl } from "@/utils";

// Les raccourcis sous la saisie de Haka, côté mandataire (19 oct. 2026, Jules : « les pills sous le chat, adaptées
// aux trucs mandataires, comme faire une estimation, mandat »). Le même geste que chez l'équipe : un clic pose une
// pastille dans la saisie et passe la demande en « Produire » ; l'agent du mandataire la fait avec ses outils.

export const RACCOURCIS_MANDATAIRE = [
  // Un accès rapide, pas une demande (25 oct. 2026, Jules) : le mode terrain de Listes, la carte autour de soi.
  { cle: "terrain", nom: "Mode terrain", Icone: MapPin, page: "MandataireProspection", requete: "onglet=listes&terrain=1" },
  // Ce que chaque compétence lit (26 oct. 2026, comme les cartes de l'équipe) : ses sources s'affichent sous les raccourcis.
  { cle: "estimation", nom: "Faire une estimation", Icone: Calculator, outils: ["equimmox", "data_b", "dvf", "documents"] },
  { cle: "mandat", nom: "Préparer un mandat", Icone: FileSignature, outils: ["documents"] },
  { cle: "dossier", nom: "Compléter un dossier", Icone: FolderCheck, outils: ["documents"] },
  { cle: "mail", nom: "Écrire au propriétaire", Icone: Mail, outils: ["prospection"] },
  { cle: "appel", nom: "Noter un appel", Icone: PhoneCall, outils: ["prospection"] },
  { cle: "clients", nom: "Demandes des clients", Icone: Users, outils: ["clients"] },
];
/** Les sources que le mandataire peut cocher (le « + ») ; le serveur en tient les outils (OUTILS_PAR_SOURCE). */
export const SOURCES_MANDATAIRE = ["equimmox", "data_b", "valeur_locative", "dvf", "kvacance", "bodacc", "insee", "web", "clients", "prospection"];
const PILULE = "inline-flex h-9 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 text-[13.5px] max-md:h-10 max-md:w-10 max-md:justify-center max-md:px-0 text-encre transition-[border-color,transform] duration-300 hover:border-bord-vif";

/** @param {{ choisie?: string|null, onChoisir: (c: object) => void, className?: string, sourcesOuvert?: boolean, onSources?: () => void, nbSources?: number }} props */
export default function RaccourcisMandataire({ choisie = null, onChoisir, className = "", sourcesOuvert = false, onSources = null, nbSources = 0 }) {
  const naviguer = useNavigate();
  return (
    <nav aria-label="Raccourcis" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {RACCOURCIS_MANDATAIRE.map((c) => {
        const sel = choisie === c.cle;
        return (
          <button key={c.cle} type="button" onClick={() => (c.page ? naviguer(`${createPageUrl(c.page)}?${c.requete || ""}`) : onChoisir(c))} aria-pressed={sel} aria-label={c.nom} title={c.nom}
            className={`${PILULE} active:scale-[0.97] ${sel ? "border-menthe/60 bg-menthe/10" : ""}`}>
            <c.Icone className={`h-3.5 w-3.5 max-md:h-[18px] max-md:w-[18px] ${sel ? "text-menthe" : "text-ardoise"}`} strokeWidth={1.8} /><span className="max-md:hidden">{c.nom}</span>
          </button>
        );
      })}
      {onSources && (
        <button type="button" onClick={onSources} aria-expanded={sourcesOuvert}
          aria-label={sourcesOuvert ? "Fermer le choix des sources" : "Choisir les sources"} title={sourcesOuvert ? "Fermer" : "Choisir les sources que Haka lira"}
          className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors duration-300 max-md:h-10 max-md:w-10 ${sourcesOuvert || nbSources ? "border-menthe/60 text-menthe" : "border-trait bg-surface-pleine text-encre hover:border-bord-vif"}`}>
          <motion.span className="grid place-items-center" animate={{ rotate: sourcesOuvert ? 45 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}><Plus className="h-4 w-4" /></motion.span>
          {!sourcesOuvert && nbSources > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-menthe px-1 text-[10px] text-sur-menthe">{nbSources}</span>}
        </button>
      )}
    </nav>
  );
}
