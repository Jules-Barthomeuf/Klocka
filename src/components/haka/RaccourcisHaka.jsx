import React from "react";
import { motion } from "framer-motion";
import { Building2, FileSearch, FileSignature, FolderOpen, Landmark, Plus } from "lucide-react";

// Les raccourcis sous la saisie de l'Accueil (17 oct. 2026, Jules) : les
// compétences les plus demandées, à la place de « Connecter un skill ». Un
// clic pose la demande dans le champ, avec le dossier choisi s'il y en a un ;
// rien ne part avant l'envoi, et c'est un « Produire ». Le « + » à droite
// (Jules, même jour) ouvre le choix des sources.

const RACCOURCIS = [
  { cle: "preanalyse", libelle: "Pré-analyser", icone: FileSearch, sans: "Pré-analyse cette fiche : ", avec: "Pré-analyse ce dossier." },
  { cle: "data-room", libelle: "Analyser une data room", icone: FolderOpen, sans: "Analyse la data room du dossier ", avec: "Analyse la data room de ce dossier." },
  { cle: "loi", libelle: "Préparer une LOI", icone: FileSignature, sans: "Prépare la LOI pour ", avec: "Prépare la LOI de ce dossier pour " },
  { cle: "page-plateforme", libelle: "Page plateforme", icone: Building2, sans: "Prépare la page plateforme du dossier ", avec: "Prépare la page plateforme de ce dossier." },
  { cle: "presentation-bancaire", libelle: "Dossier bancaire", icone: Landmark, sans: "Prépare le dossier bancaire du projet ", avec: "Prépare le dossier bancaire de ce dossier." },
];

const PILULE = "inline-flex h-9 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 text-[13.5px] text-encre transition-[border-color,transform] duration-300 hover:border-bord-vif";

/** @param {{ dossier?: {deal_id: string, titre?: string}|null, sourcesOuvert?: boolean, onSources?: () => void, nbSources?: number, className?: string }} props */
export default function RaccourcisHaka({ dossier = null, sourcesOuvert = false, onSources = null, nbSources = 0, className = "" }) {
  const poser = (r) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte: dossier ? r.avec : r.sans, sortie: "produire" } }));
  return (
    <nav aria-label="Raccourcis" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {RACCOURCIS.map((r) => {
        const Icone = r.icone;
        return (
          <button key={r.cle} type="button" onClick={() => poser(r)} className={`${PILULE} active:scale-[0.97]`}>
            <Icone className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.8} />{r.libelle}
          </button>
        );
      })}
      {onSources && (
        <button type="button" onClick={onSources} aria-expanded={sourcesOuvert}
          aria-label={sourcesOuvert ? "Fermer le choix des sources" : "Choisir les sources"} title={sourcesOuvert ? "Fermer" : "Choisir les sources que Haka lira"}
          className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors duration-300 ${sourcesOuvert || nbSources ? "border-menthe/60 text-menthe" : "border-trait bg-surface-pleine text-encre hover:border-bord-vif"}`}>
          <motion.span className="grid place-items-center" animate={{ rotate: sourcesOuvert ? 45 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 26 }}><Plus className="h-4 w-4" /></motion.span>
          {!sourcesOuvert && nbSources > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-menthe px-1 text-[10px] text-sur-menthe">{nbSources}</span>}
        </button>
      )}
    </nav>
  );
}
