import React from "react";
import { FField, FInput } from "./FormField";
import { dureeJusque } from "@/components/projet/durees";

// Les deux dates du bail, saisies à la main.
//
// La frise de la page projet a besoin des deux bouts : sans prise d'effet,
// elle n'a rien à mesurer et les échéances triennales ne se déduisent pas.
// Le serveur les lit dans le bail quand un dossier est rattaché
// (projet-cases) ; ce qui est saisi ici l'emporte, toujours.

export default function DatesBailPanneau({ formData, setFormData }) {
  const ecrire = (champ) => (e) => setFormData({ ...formData, [champ]: e.target.value });
  // L'échéance est la même donnée que dans Locataire : un seul champ, deux
  // endroits où le saisir.
  const fin = formData.bail_date_echeance || formData.echeance_bail || "";
  const restant = fin ? dureeJusque(fin, { court: true }) : null;

  return (
    <div>
      <div className="mb-3 text-[11px] uppercase tracking-[.16em] text-ardoise">Les dates du bail</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] border border-trait bg-surface p-3.5">
          <FField label="Prise d'effet" className="!border-0 !bg-transparent !p-0">
            <FInput type="date" value={formData.bail_date_debut || ""} onChange={ecrire("bail_date_debut")} className="[color-scheme:dark]" />
          </FField>
          <div className="mt-1.5 text-[11px] text-brume">le départ de la frise et des échéances triennales</div>
        </div>
        <div className="rounded-[12px] border border-trait bg-surface p-3.5">
          <FField label="Échéance" className="!border-0 !bg-transparent !p-0">
            <FInput type="date" value={fin} onChange={(e) => setFormData({ ...formData, echeance_bail: e.target.value, bail_date_echeance: e.target.value })} className="[color-scheme:dark]" />
          </FField>
          <div className="mt-1.5 text-[11px] text-brume">{restant ? `${restant} à courir · ` : ""}la même date que dans Locataire</div>
        </div>
      </div>
    </div>
  );
}
