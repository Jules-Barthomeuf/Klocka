import React from "react";
import { FField, FInput } from "./FormField";
import { CASES_LOCATAIRE, valeursLocataire } from "@/components/projet/LocataireProjet";

// Les cases du locataire, en face de celles de la page.
//
// Une croix en haut à droite de chacune la retire de la page du client, et un
// mot la ramène. Chaque donnée ne se saisit qu'à un endroit : le loyer dans
// le Simulateur, l'échéance dans Analyse du bail (avec la prise d'effet) ; le
// bail restant s'en déduit. Le panneau ne garde que ce qui n'existe qu'ici.

const CHAMPS = {
  "loc.depuis": { champ: "locataire_depuis", type: "date", unite: "date d'entrée : la durée s'en déduit" },
  "loc.nom": { champ: "nom_locataire", type: "text", unite: "" },
  "loc.profil": { champ: "profil_locataire", type: "text", unite: "ex : couple dans la quarantaine, enseigne nationale" },
};

export default function LocataireCases({ formData, setFormData }) {
  const masques = formData.champs_masques || [];
  const valeurs = valeursLocataire(formData);
  const masquer = (cle) => setFormData({ ...formData, champs_masques: [...masques, cle] });
  const montrer = (cle) => setFormData({ ...formData, champs_masques: masques.filter((c) => c !== cle) });

  return (
    <div className="grid grid-cols-2 gap-3">
      {CASES_LOCATAIRE.filter(([cle]) => CHAMPS[cle]).map(([cle, label]) => {
        const c = CHAMPS[cle];
        const cache = masques.includes(cle);
        return (
          <div key={cle} className={`relative rounded-[12px] border border-trait bg-surface p-3.5 ${cache ? "opacity-50" : ""}`}>
            {cache ? (
              <button type="button" onClick={() => montrer(cle)} className="absolute right-3 top-2.5 text-[11px] text-menthe hover:underline" style={{ background: "transparent" }}>
                Remettre
              </button>
            ) : (
              <button
                type="button"
                onClick={() => masquer(cle)}
                aria-label="Retirer cette case de la page"
                title="Retirer cette case de la page"
                className="absolute right-3 top-2 text-[15px] leading-none text-ardoise hover:text-alerte"
                style={{ background: "transparent" }}
              >
                ×
              </button>
            )}
            <FField label={label} className="!border-0 !bg-transparent !p-0">
              <FInput
                type={c.type}
                value={formData[c.champ] ?? ""}
                onChange={(e) => setFormData({ ...formData, [c.champ]: e.target.value })}
                className={c.type === "date" ? "[color-scheme:dark]" : ""}
              />
            </FField>
            <div className="mt-1.5 text-[11px] text-brume">
              {c.unite}
              {cle === "loc.depuis" && valeurs[cle] ? ` · ${valeurs[cle]}` : ""}
            </div>
          </div>
        );
      })}
      <p className="col-span-2 m-0 text-[11.5px] leading-[1.5] text-brume">
        Le loyer se saisit dans Simulateur, l&apos;échéance dans Analyse du bail.
      </p>
    </div>
  );
}
