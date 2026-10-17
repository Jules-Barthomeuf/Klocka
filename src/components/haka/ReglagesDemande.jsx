import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { sourceDe } from "@/lib/sources";

// Les réglages d'une demande à Haka (17 oct. 2026, Jules) : les sources
// (« Auto », Haka choisit ; ou celles qu'on coche) et la réponse attendue
// (« Répondre » dans la conversation, « Produire » un livrable qui finit dans
// À valider). Une carte de compétence ou un raccourci, c'est « Produire ».

/** Les sources qu'on peut cocher, dans l'ordre du panneau. */
export const SOURCES_CHOISISSABLES = [
  "documents", "layer", "dossiers", "clients", "monday",
  "kzoning", "kexpertise", "kestimation", "kprospective", "kvacance", "kfoncier", "valeur_locative", "ktransactions",
  "dvf", "equimmox", "data_b", "web", "drive",
];

// Les transitions (17 oct. 2026, Jules : « super smooth ») : un ressort doux, partout le même.
export const RESSORT = { type: "spring", stiffness: 380, damping: 32, mass: 0.7 };
const FONDU = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

/**
 * Une pastille de source, au dessin des raccourcis (Jules, 17 oct. 2026 : « harmonisées avec Pré-analyser ») : l'icône, le nom.
 * `choisie` (panneau des sources) : coche menthe ; `eteinte` (carte de compétence) : barrée, en retrait.
 */
export function PastilleSource({ cle, choisie = false, eteinte = false, onClick, libelle = null, icone = null, title = null, fixe = false }) {
  const s = sourceDe(cle);
  const Icone = icone || s.icone;
  return (
    <motion.button type="button" onClick={onClick} aria-pressed={eteinte ? false : choisie || undefined} title={title || undefined}
      layout transition={RESSORT} whileTap={fixe ? undefined : { scale: 0.95 }}
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] transition-[background-color,border-color,color,opacity] duration-300 ease-out ${choisie ? "border-menthe/60 bg-menthe/10 text-encre" : eteinte ? "border-trait bg-transparent text-brume line-through opacity-70" : "border-trait bg-surface-pleine text-encre hover:border-bord-vif"} ${fixe ? "cursor-default" : ""}`}>
      <span className={`relative grid h-3.5 w-3.5 flex-none place-items-center transition-colors duration-300 ${choisie ? "text-menthe" : "text-ardoise"}`}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={choisie ? "coche" : "icone"} className="grid place-items-center"
            initial={{ opacity: 0, scale: 0.4, rotate: -30 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.4, rotate: 30 }} transition={FONDU}>
            {choisie ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Icone className="h-3.5 w-3.5" strokeWidth={1.8} />}
          </motion.span>
        </AnimatePresence>
      </span>
      {libelle || s.nom}
    </motion.button>
  );
}

/** Le panneau des sources : « Auto » d'abord, puis chaque source à cocher. */
export function PanneauSources({ sources, onChange, className = "" }) {
  const basculer = (cle) => onChange(sources.includes(cle) ? sources.filter((x) => x !== cle) : [...sources, cle]);
  const phrase = sources.length ? `Haka ne lira que ${sources.length > 1 ? `ces ${sources.length} sources` : "cette source"}.` : "Auto : Haka choisit lui-même où chercher. Cochez des sources pour l'en tenir là.";
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={phrase} className="m-0 text-[13px] text-ardoise" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={FONDU}>{phrase}</motion.p>
      </AnimatePresence>
      <div className="flex flex-wrap justify-center gap-2">
        {[{ cle: "auto" }, ...SOURCES_CHOISISSABLES.map((cle) => ({ cle }))].map(({ cle }, i) => (
          <motion.div key={cle} initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...FONDU, delay: Math.min(i * 0.018, 0.3) }}>
            {cle === "auto"
              ? <PastilleSource cle="auto" libelle="Auto" icone={Sparkles} choisie={!sources.length} onClick={() => onChange([])} />
              : <PastilleSource cle={cle} choisie={sources.includes(cle)} onClick={() => basculer(cle)} />}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Le panneau qui s'ouvre et se ferme en douceur (hauteur et fondu). */
export function Depliant({ ouvert, children, className = "" }) {
  return (
    <AnimatePresence initial={false}>
      {ouvert && (
        <motion.div key="depliant" className={`overflow-hidden ${className}`}
          initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
          transition={{ height: { duration: 0.38, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.25 } }}>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Dans la barre de saisie : où en sont les sources, un clic ouvre le panneau. */
export function BoutonSources({ sources, onOuvrir, ouvert }) {
  const libelle = !sources.length ? "Auto" : sources.length === 1 ? sourceDe(sources[0]).nom : String(sources.length);
  return (
    <button type="button" onClick={onOuvrir} aria-expanded={ouvert}
      title={sources.length ? `Haka ne lira que : ${sources.map((c) => sourceDe(c).nom).join(", ")}` : "Haka choisit lui-même ses sources ; un clic pour les choisir"}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors hover:bg-barre-relief ${sources.length ? "text-menthe" : "text-craie"}`}
      style={{ background: "transparent" }}>
      <Sparkles className="h-3.5 w-3.5" />
      <span><span className="max-md:hidden">Sources : </span>{libelle}</span>
    </button>
  );
}

/** Répondre ou Produire : le fond glisse d'un mot à l'autre. */
export function BasculeSortie({ sortie, onChange }) {
  const choix = [["repondre", "Répondre", "Une réponse dans la conversation, avec ses sources"], ["produire", "Produire", "Un livrable dans l'écran de droite, qui finit dans À valider"]];
  return (
    <div className="relative flex items-center gap-0.5 rounded-full bg-barre-relief p-0.5">
      {choix.map(([cle, mot, aide]) => (
        <button key={cle} type="button" onClick={() => onChange(cle)} aria-pressed={sortie === cle} title={aide}
          className={`relative rounded-full px-3 py-1 text-[13px] transition-colors duration-300 ${sortie === cle ? "text-encre" : "text-ardoise hover:text-encre"}`}
          style={{ background: "transparent" }}>
          {sortie === cle && <motion.span layoutId="k-sortie-fond" transition={RESSORT} className="absolute inset-0 rounded-full bg-surface-pleine shadow-[0_1px_3px_rgb(0_0_0/0.08)]" />}
          <span className="relative">{mot}</span>
        </button>
      ))}
    </div>
  );
}
