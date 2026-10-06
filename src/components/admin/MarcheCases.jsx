import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
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
  const queryClient = useQueryClient();
  const [relance, setRelance] = useState(null);

  // Relancer l'analyse du loyer : Equimmox (et Data-B en repli) sans leur
  // cache de trente jours. Le serveur répond tout de suite, la recherche
  // tourne derrière ; la page et ce panneau repassent tant qu'elle dure.
  const relancerLoyer = async () => {
    setRelance("envoi");
    try {
      const reponse = await base44.request("GET", `/api/projects/${projetId}/secteur?relancer_loyer=1`);
      queryClient.setQueriesData({ queryKey: ["secteur-projet", projetId] }, reponse);
      setRelance(null);
    } catch (e) {
      setRelance(e?.message || "La relance n'est pas partie.");
    }
  };
  const enCours = relance === "envoi" || !!donnees?.en_cours;

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
            ? `Baux constatés par Equimmox à 500 m, sur des locaux de ${nf.format(tranche.bas)} à ${nf.format(tranche.haut)} m², soit la surface du projet à 20 % près.`
            : "Baux constatés par Equimmox à 500 m. Renseignez la surface du bien : la recherche porte sur les locaux à 20 % près."}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Case label="Loyer moyen autour" unite="€/m²/an" champ="marche_loyer_autour" formData={formData} setFormData={setFormData} reference={rue?.loyer_m2_an ?? null} sourceMot={rue?.loyer_source || "Equimmox"} />
        </div>
        {projetId && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button type="button" onClick={relancerLoyer} disabled={enCours || !formData.adresse_complete}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie transition-colors hover:border-menthe hover:text-encre disabled:opacity-50 disabled:hover:border-trait disabled:hover:text-craie"
              style={{ background: "transparent" }}>
              <RotateCw className={`h-4 w-4 ${enCours ? "animate-spin" : ""}`} />
              {enCours ? "Analyse du loyer en cours" : "Relancer l'analyse du loyer"}
            </button>
            <span className="text-[11.5px] leading-[1.5] text-brume">
              {enCours
                ? "Equimmox, environ une minute, sur la surface enregistrée du projet."
                : typeof relance === "string" && relance !== "envoi"
                  ? relance
                  : rue?.le
                    ? `Dernière lecture ${rue.loyer_source || "Equimmox"} le ${new Date(rue.le).toLocaleDateString("fr-FR")}.`
                    : !formData.adresse_complete ? "Renseignez l'adresse du bien." : "Aucune lecture encore."}
            </span>
          </div>
        )}
      </div>

      <p className="m-0 text-[11.5px] leading-[1.5] text-brume">
        Le loyer du projet au m² se déduit du Simulateur ; on le force au clic sur la page.
      </p>
    </div>
  );
}
