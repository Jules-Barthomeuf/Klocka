import React from "react";
import { useSecteurProjet, nf } from "@/components/projet/SecteurChiffres";
import { trancheSurface } from "@/components/projet/MarcheProjet";
import { FField, FInput } from "./FormField";

// Les cases du marché, en face de ce que le client lit.
//
// Une case n'est jamais vide quand une source donne le chiffre : elle montre
// ce que la page affiche, et taper dedans le remplace. Tant qu'on n'y touche
// pas, rien n'est figé dans le dossier et la page continue de suivre la
// source ; vider une case y revient.

function Case({ label, unite, champ, formData, setFormData, reference, sourceMot }) {
  const duDossier = formData[champ];
  // Un zéro compte pour une case vide : le formulaire en écrit dans ses champs
  // numériques sans qu'on y ait touché, et il masquerait la valeur lue.
  const saisi = duDossier !== undefined && duDossier !== null && duDossier !== "" && Number(duDossier) !== 0;
  const affichee = saisi ? duDossier : reference ?? "";

  return (
    <div className="rounded-[12px] border border-trait bg-surface p-3.5">
      <FField label={label}>
        <FInput
          type="number"
          step="any"
          value={affichee === "" ? "" : affichee}
          onChange={(e) => setFormData({ ...formData, [champ]: e.target.value === "" ? "" : parseFloat(e.target.value) })}
        />
      </FField>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-brume">{unite}</span>
        {!saisi && reference != null && sourceMot && (
          <span className="text-[11px] text-brume">lu chez {sourceMot}</span>
        )}
        {saisi && reference != null && Math.round(Number(duDossier)) !== Math.round(reference) && (
          <button
            type="button"
            onClick={() => setFormData({ ...formData, [champ]: "" })}
            className="text-[11.5px] text-menthe hover:underline"
            style={{ background: "transparent" }}
          >
            Revenir à {nf.format(Math.round(reference))}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarcheCases({ formData, setFormData, projetId = null }) {
  const { data: donnees } = useSecteurProjet({ id: projetId, adresse_complete: formData.adresse_complete }, !!projetId);
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
          <Case label="Prix résidentiel moyen" unite="€/m²" champ="marche_rue_prix_m2" formData={formData} setFormData={setFormData} reference={r?.prix_m2 ?? null} sourceMot="Le Figaro" />
          <Case label="Loyer résidentiel moyen" unite="€/m²/mois" champ="marche_residentiel_loyer_m2_mois" formData={formData} setFormData={setFormData} reference={r?.loyer_m2_mois ?? null} sourceMot="Le Figaro" />
          <Case label="Évolution sur 1 an, dans la ville" unite="%" champ="marche_evolution_1an" formData={formData} setFormData={setFormData} reference={r?.evolution_1_an?.valeur ?? null} sourceMot="Le Figaro" />
          <Case label="Évolution sur 5 ans, dans la ville" unite="%" champ="marche_evolution_5ans" formData={formData} setFormData={setFormData} reference={r?.evolution_5_ans?.valeur ?? null} sourceMot="Le Figaro" />
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
          <Case label="Prix des murs autour" unite="€/m²" champ="marche_commercial_prix_m2" formData={formData} setFormData={setFormData} reference={rue?.prix_m2 ?? null} sourceMot={rue?.prix_m2_source || "DVF"} />
          <Case label="Loyer moyen des baux existants" unite="€/m²/an · à saisir, aucune source ne le publie" champ="marche_baux_moyenne" formData={formData} setFormData={setFormData} reference={null} />
          <Case label="Loyer moyen à l'offre" unite="€/m²/an" champ="marche_offre_moyenne" formData={formData} setFormData={setFormData} reference={rue?.loyer_m2_an ?? null} sourceMot="ALX" />
        </div>
      </div>

      <p className="m-0 text-[11.5px] leading-[1.5] text-brume">
        Le prix et le loyer du projet au m² se déduisent du Simulateur ; on les force au clic sur la page.
      </p>
    </div>
  );
}
