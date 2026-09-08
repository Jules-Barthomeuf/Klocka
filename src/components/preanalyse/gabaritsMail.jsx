import React, { useState } from "react";
import { Plus, Minus } from "lucide-react";

// Les mails types : un clic écrit le prompt, il ne reste qu'à remplacer les
// valeurs entre crochets. Partagés entre le dossier et le tableau de bord.

const ref = (d) => {
  const a = d?.lots?.[0]?.lot?.adresse?.valeur;
  return a?.rue ? `${a.rue}${a.ville ? ` à ${a.ville}` : ""}` : "[adresse du bien]";
};
const agent = (d) => d?.contact_agent_email || "[email de l'agent]";

export const GABARITS = [
  { label: "Fiche commerciale", prompt: (d) => `Demande la fiche commerciale du bien ${ref(d)} auprès de ${agent(d)}. Précise : surface utile, état locatif, charges, taxe foncière.` },
  { label: "Prise de contact", prompt: (d) => `Premier contact avec ${agent(d)} au sujet de ${ref(d)}. Présente-nous brièvement et demande un échange téléphonique.` },
  { label: "Demande de documents", prompt: (d) => `Demande les documents du bien ${ref(d)} : baux, taxe foncière, DPE, trois derniers PV d'AG.` },
  { label: "Demande de visite", prompt: (d) => `Demande une visite du bien ${ref(d)}, en proposant deux créneaux.` },
  { label: "Relance", prompt: (d) => `Relance ${agent(d)} sur les documents demandés il y a une semaine pour ${ref(d)}.` },
  { label: "Négociation prix", prompt: (d) => `Propose une offre sous le prix affiché pour ${ref(d)}, en justifiant par le marché local.` },
];

// Trois suggestions sur une ligne, un « + » pour les autres.
export function SuggestionsMail({ dossier = null, onChoisir, disabled = false, visibles = 3 }) {
  const [tout, setTout] = useState(false);
  const liste = tout ? GABARITS : GABARITS.slice(0, visibles);
  return (
    <>
      {liste.map((g) => (
        <button key={g.label} onClick={() => onChoisir(g.prompt(dossier))} disabled={disabled} className="px-3 py-1 rounded-full text-[12.5px] border border-[#2c3139] text-[#b7bdc5] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors disabled:opacity-50 whitespace-nowrap">{g.label}</button>
      ))}
      {GABARITS.length > visibles && (
        <button onClick={() => setTout((t) => !t)} title={tout ? "Moins de suggestions" : `${GABARITS.length - visibles} autres suggestions`} className="w-7 h-7 inline-flex items-center justify-center rounded-full border border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] transition-colors">
          {tout ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      )}
    </>
  );
}
