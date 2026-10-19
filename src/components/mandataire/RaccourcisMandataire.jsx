import React from "react";
import { Calculator, FileSignature, FolderCheck, Mail, PhoneCall, Users } from "lucide-react";

// Les raccourcis sous la saisie de Haka, côté mandataire (19 oct. 2026, Jules : « les pills sous le chat, adaptées
// aux trucs mandataires, comme faire une estimation, mandat »). Le même geste que chez l'équipe : un clic pose une
// pastille dans la saisie et passe la demande en « Produire » ; l'agent du mandataire la fait avec ses outils.

export const RACCOURCIS_MANDATAIRE = [
  { cle: "estimation", nom: "Faire une estimation", Icone: Calculator },
  { cle: "mandat", nom: "Préparer un mandat", Icone: FileSignature },
  { cle: "dossier", nom: "Compléter un dossier", Icone: FolderCheck },
  { cle: "mail", nom: "Écrire au propriétaire", Icone: Mail },
  { cle: "appel", nom: "Noter un appel", Icone: PhoneCall },
  { cle: "clients", nom: "Demandes des clients", Icone: Users },
];
const PILULE = "inline-flex h-9 items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 text-[13.5px] text-encre transition-[border-color,transform] duration-300 hover:border-bord-vif";

/** @param {{ choisie?: string|null, onChoisir: (c: object) => void, className?: string }} props */
export default function RaccourcisMandataire({ choisie = null, onChoisir, className = "" }) {
  return (
    <nav aria-label="Raccourcis" className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {RACCOURCIS_MANDATAIRE.map((c) => {
        const sel = choisie === c.cle;
        return (
          <button key={c.cle} type="button" onClick={() => onChoisir(c)} aria-pressed={sel}
            className={`${PILULE} active:scale-[0.97] ${sel ? "border-menthe/60 bg-menthe/10" : ""}`}>
            <c.Icone className={`h-3.5 w-3.5 ${sel ? "text-menthe" : "text-ardoise"}`} strokeWidth={1.8} />{c.nom}
          </button>
        );
      })}
    </nav>
  );
}
