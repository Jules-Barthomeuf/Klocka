import React from "react";
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

/** Une pastille de source, au dessin de la maquette : l'icône dans un rond, le nom à côté. */
export function PastilleSource({ cle, choisie = false, onClick, libelle = null, icone = null }) {
  const s = sourceDe(cle);
  const Icone = icone || s.icone;
  return (
    <button type="button" onClick={onClick} aria-pressed={choisie}
      className={`inline-flex h-11 items-center gap-2.5 rounded-full border py-1 pl-1 pr-4 text-[15px] transition-colors ${choisie ? "border-menthe/60 bg-menthe/10 text-encre" : "border-trait bg-surface-pleine text-encre hover:border-bord-vif"}`}>
      <span className={`grid h-9 w-9 flex-none place-items-center rounded-full ${choisie ? "bg-menthe/20 text-menthe" : "bg-rail-actif text-craie"}`}>
        {choisie ? <Check className="h-4 w-4" strokeWidth={2} /> : <Icone className="h-4 w-4" strokeWidth={1.7} />}
      </span>
      {libelle || s.nom}
    </button>
  );
}

/** Le panneau des sources : « Auto » d'abord, puis chaque source à cocher. */
export function PanneauSources({ sources, onChange, className = "" }) {
  const basculer = (cle) => onChange(sources.includes(cle) ? sources.filter((x) => x !== cle) : [...sources, cle]);
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <p className="m-0 text-[13px] text-ardoise">{sources.length ? `Haka ne lira que ${sources.length > 1 ? `ces ${sources.length} sources` : "cette source"}.` : "Auto : Haka choisit lui-même où chercher. Cochez des sources pour l'en tenir là."}</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        <PastilleSource cle="auto" libelle="Auto" icone={Sparkles} choisie={!sources.length} onClick={() => onChange([])} />
        {SOURCES_CHOISISSABLES.map((cle) => <PastilleSource key={cle} cle={cle} choisie={sources.includes(cle)} onClick={() => basculer(cle)} />)}
      </div>
    </div>
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

/** Répondre ou Produire. */
export function BasculeSortie({ sortie, onChange }) {
  const choix = [["repondre", "Répondre", "Une réponse dans la conversation, avec ses sources"], ["produire", "Produire", "Un livrable dans l'écran de droite, qui finit dans À valider"]];
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-barre-relief p-0.5">
      {choix.map(([cle, mot, aide]) => (
        <button key={cle} type="button" onClick={() => onChange(cle)} aria-pressed={sortie === cle} title={aide}
          className={`rounded-full px-3 py-1 text-[13px] transition-colors ${sortie === cle ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
          style={sortie === cle ? undefined : { background: "transparent" }}>
          {mot}
        </button>
      ))}
    </div>
  );
}
