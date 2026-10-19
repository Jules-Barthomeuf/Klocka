import React from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileSearch, FileSignature, FolderOpen, Landmark, Mail, Plus, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Les raccourcis sous la saisie de l'Accueil (17 oct. 2026, Jules) : les compétences actives
// les plus utilisées, construites à partir de leur en-tête (spec du même jour : « aucun de ces éléments n'est
// codé en dur »). Un clic choisit la compétence : elle devient une pastille dans la saisie, la demande passe en
// « Produire » et ses sources s'affichent dessous. Le « + » ouvre le choix des sources.
// Repli, si la liste n'est pas lisible : les cinq raccourcis d'origine.

const ICONES = { grille_dossier: FileSearch, loi: FileSignature, dossier_bancaire: Landmark, page_plateforme: Building2, presentation: Landmark, mail: Mail, dossier: FolderOpen };
const REPLI = [
  { cle: "pre-analyse-fiche", nom: "Pré-analyser", format: "grille_dossier" },
  { cle: "data-room", nom: "Analyser une data room", format: "dossier" },
  { cle: "loi", nom: "Préparer une LOI", format: "loi" },
  { cle: "presentation-bancaire", nom: "Dossier bancaire", format: "presentation" },
];
const D_ABORD = ["pre-analyse-fiche", "data-room", "loi", "presentation-bancaire"];
// Trois gestes fixes après les compétences (19 oct. 2026, Jules) : ce ne sont pas des compétences publiées, Haka
// reçoit le geste choisi (« geste:… ») et sait quel outil prendre (server/ak/cadre-demande.js).
const GESTES = [
  { cle: "geste:creer-projet", nom: "Créer un projet", icone: Building2, outils: [] },
  { cle: "geste:mail", nom: "Drafter un email", icone: Mail, outils: [] },
  { cle: "geste:drive", nom: "Créer un dossier Drive", icone: FolderOpen, outils: [] },
];
const rang = (cle) => { const i = D_ABORD.indexOf(cle); return i < 0 ? D_ABORD.length : i; };
const PILULE = "inline-flex h-9 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 text-[13.5px] text-encre transition-[border-color,transform] duration-300 hover:border-bord-vif";

/** @param {{ choisie?: string|null, onChoisir: (c: object) => void, sourcesOuvert?: boolean, onSources?: () => void, nbSources?: number, className?: string }} props */
export default function RaccourcisHaka({ choisie = null, onChoisir, sourcesOuvert = false, onSources = null, nbSources = 0, className = "" }) {
  const q = useQuery({ queryKey: ["haka-competences", "chat"], queryFn: () => base44.request("GET", "/api/haka/competences?declencheur=chat"), staleTime: 5 * 60_000, retry: false });
  const actives = q.data?.competences || [];
  // Les plus utilisées d'abord, à égalité l'ordre des raccourcis d'origine.
  const liste = [...(actives.length ? [...actives].sort((a, b) => (b.usage || 0) - (a.usage || 0) || rang(a.cle) - rang(b.cle)) : REPLI).slice(0, 4), ...GESTES];
  return (
    <nav aria-label="Raccourcis" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {liste.map((c) => {
        const Icone = c.icone || ICONES[c.format] || Sparkles;
        const sel = choisie === c.cle;
        return (
          <button key={c.cle} type="button" onClick={() => onChoisir(c)} aria-pressed={sel}
            className={`${PILULE} active:scale-[0.97] ${sel ? "border-menthe/60 bg-menthe/10" : ""}`}>
            <Icone className={`h-3.5 w-3.5 ${sel ? "text-menthe" : "text-ardoise"}`} strokeWidth={1.8} />{c.nom}
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
