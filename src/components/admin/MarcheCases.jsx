import React from "react";
import { useSecteurProjet, nf } from "@/components/projet/SecteurChiffres";
import { trancheSurface } from "@/components/projet/MarcheProjet";
import { FField, FInput } from "./FormField";

// Les cases du marché, en face de ce que le client lit.
//
// Chaque case porte la valeur du dossier. Sous elle, quand une source en
// donne une, la valeur lue s'affiche avec de quoi la reprendre : c'est
// toujours le dossier qui l'emporte à l'écran, donc il faut pouvoir y verser
// ce que la source dit, puis le corriger.

function Case({ label, unite, champ, formData, setFormData, reference, sourceMot }) {
  const valeur = formData[champ];
  const aValeur = valeur !== undefined && valeur !== null && valeur !== "";
  return (
    <div className="rounded-[12px] border border-trait bg-surface p-3.5">
      <FField label={label}>
        <FInput
          type="number"
          step="any"
          value={aValeur ? valeur : ""}
          placeholder={reference != null ? String(Math.round(reference)) : ""}
          onChange={(e) => setFormData({ ...formData, [champ]: e.target.value === "" ? "" : parseFloat(e.target.value) })}
        />
      </FField>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-brume">{unite}</span>
        {reference != null && !aValeur && (
          <button
            type="button"
            onClick={() => setFormData({ ...formData, [champ]: Math.round(reference * 100) / 100 })}
            className="text-[11.5px] text-menthe hover:underline"
            style={{ background: "transparent" }}
          >
            Reprendre {nf.format(Math.round(reference))} {sourceMot ? `(${sourceMot})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarcheCases({ formData, setFormData }) {
  const { data: donnees } = useSecteurProjet(formData, true);
  const r = donnees?.residentiel;
  const rue = donnees?.rue;
  const tranche = trancheSurface(formData.sim_surface || formData.surface_m2);

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-trait bg-surface p-3.5">
        <FField label="Nom du quartier / secteur">
          <FInput
            value={formData.marche_quartier_nom || ""}
            onChange={(e) => setFormData({ ...formData, marche_quartier_nom: e.target.value })}
            placeholder={rue?.nom || "ex : Centre-ville"}
          />
        </FField>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] uppercase tracking-[.16em] text-ardoise">Résidentiel</div>
        <div className="grid grid-cols-2 gap-3">
          <Case label="Prix moyen dans la rue" unite="€/m²" champ="marche_rue_prix_m2" formData={formData} setFormData={setFormData} reference={rue?.prix_m2 ?? null} sourceMot="Figaro" />
          <Case label="Loyer résidentiel moyen" unite="€/m²/mois" champ="marche_residentiel_loyer_m2_mois" formData={formData} setFormData={setFormData} reference={r?.loyer_m2_mois ?? null} sourceMot="Figaro" />
          <Case label="Évolution sur 1 an, dans la ville" unite="%" champ="marche_evolution_1an" formData={formData} setFormData={setFormData} reference={r?.evolution_1_an?.valeur ?? null} sourceMot="Figaro" />
          <Case label="Évolution sur 5 ans, dans la ville" unite="%" champ="marche_evolution_5ans" formData={formData} setFormData={setFormData} reference={r?.evolution_5_ans?.valeur ?? null} sourceMot="Figaro" />
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] uppercase tracking-[.16em] text-ardoise">Commercial</div>
        <p className="m-0 mb-2.5 text-[11.5px] leading-[1.5] text-brume">
          {tranche
            ? `Lus sur des locaux de ${nf.format(tranche.bas)} à ${nf.format(tranche.haut)} m², soit la surface du projet à 30 % près. Le client voit cette tranche en passant la souris sur le chiffre.`
            : "Renseignez la surface du bien pour que la tranche de comparaison s'affiche."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Case label="Loyer moyen des baux existants" unite="€/m²/an" champ="marche_baux_moyenne" formData={formData} setFormData={setFormData} reference={null} />
          <Case label="Loyer moyen à l'offre" unite="€/m²/an" champ="marche_offre_moyenne" formData={formData} setFormData={setFormData} reference={rue?.loyer_m2_an ?? null} sourceMot="Data-B" />
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[11px] uppercase tracking-[.16em] text-ardoise">Ce projet</div>
        <p className="m-0 text-[11.5px] leading-[1.5] text-brume">
          Le prix et le loyer du projet au mètre viennent du simulateur : prix de revient et loyer annuel divisés par la surface. Ils se corrigent dans l&apos;onglet Simulateur, et le graphique les compare aux deux loyers ci-dessus.
        </p>
      </div>
    </div>
  );
}
