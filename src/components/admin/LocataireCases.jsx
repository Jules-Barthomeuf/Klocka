import React from "react";
import { FField, FInput } from "./FormField";
import { CASES_LOCATAIRE, valeursLocataire } from "@/components/projet/LocataireProjet";

// Les cases du locataire, en face de celles de la page.
//
// Les mêmes six, dans le même ordre. Une croix en haut à droite de chacune la
// retire de la page du client, et un mot la ramène. Deux se calculent et ne se
// saisissent pas : « en place depuis » et « bail restant » découlent des deux
// dates, qu'on saisit ici.

const CHAMPS = {
  "loc.loyer": { champ: "sim_loyer_initial_ht", type: "number", unite: "€ par an, hors taxes hors charges" },
  "loc.depuis": { champ: "locataire_depuis", type: "date", unite: "date d'entrée : la durée s'en déduit" },
  "loc.restant": { calcule: true, unite: "se déduit de l'échéance" },
  "loc.echeance": { champ: "echeance_bail", type: "date", unite: "" },
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
      {CASES_LOCATAIRE.map(([cle, label]) => {
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
              {c.calcule ? (
                <div className="text-[15px] text-encre">{valeurs[cle] || "—"}</div>
              ) : (
                <FInput
                  type={c.type}
                  value={formData[c.champ] ?? ""}
                  onChange={(e) => setFormData({ ...formData, [c.champ]: c.type === "number" ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value })}
                  className={c.type === "date" ? "[color-scheme:dark]" : ""}
                />
              )}
            </FField>
            <div className="mt-1.5 text-[11px] text-brume">
              {c.calcule && valeurs[cle] ? c.unite : c.unite}
              {cle === "loc.depuis" && valeurs[cle] ? ` · ${valeurs[cle]}` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}
