import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

import PopulationSection from "./secteur/PopulationSection";
import LogementSection from "./secteur/LogementSection";
import EmploiSection from "./secteur/EmploiSection";
import EconomieSection from "./secteur/EconomieSection";
import RevenusSection from "./secteur/RevenusSection";
import SectionCard from "./secteur/SectionCard";

const CACHE_PREFIX = "secteur_insee_v4_";

const INSEE_VILLES = {
  "nice": "COM-06088", "toulon": "COM-83137", "cannes": "COM-06029",
  "grasse": "COM-06069", "cagnes-sur-mer": "COM-06027", "cagnes sur mer": "COM-06027",
  "saint-laurent-du-var": "COM-06123", "saint laurent du var": "COM-06123",
  "menton": "COM-06083", "vence": "COM-06157", "antibes": "COM-06004",
  "frejus": "COM-83061", "fréjus": "COM-83061", "draguignan": "COM-83050",
  "saint-tropez": "COM-83119", "saint tropez": "COM-83119",
  "sainte-maxime": "COM-83115", "sainte maxime": "COM-83115", "saint-maxime": "COM-83115",
  "marseille": "COM-13055", "avignon": "COM-84007", "arles": "COM-13004",
  "nimes": "COM-30189", "nîmes": "COM-30189", "montpellier": "COM-34172",
  "perpignan": "COM-66136", "toulouse": "COM-31555", "pau": "COM-64445",
  "bayonne": "COM-64102", "biarritz": "COM-64122", "bordeaux": "COM-33063",
  "limoges": "COM-87085", "clermont-ferrand": "COM-63113", "clermont ferrand": "COM-63113",
  "angers": "COM-49007", "poitiers": "COM-86194", "la rochelle": "COM-17300",
  "le mans": "COM-72181", "nantes": "COM-44109", "rennes": "COM-35238",
  "lorient": "COM-56121", "quimper": "COM-29232", "brest": "COM-29019",
  "rouen": "COM-76540", "lille": "COM-59350", "amiens": "COM-80021",
  "reims": "COM-51454", "strasbourg": "COM-67482", "dijon": "COM-21231",
  "paris": "DEP-75", "nancy": "COM-54395", "besancon": "COM-25056", "besançon": "COM-25056",
  "lyon": "COM-69123", "macon": "COM-71270", "mâcon": "COM-71270",
  "annecy": "COM-74010", "valence": "COM-26362", "grenoble": "COM-38185",
};

function detectVille(adresse) {
  if (!adresse) return null;
  const lower = adresse.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [ville, code] of Object.entries(INSEE_VILLES)) {
    const villeNorm = ville.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (lower.includes(villeNorm)) return { ville, code };
  }
  return null;
}

export default function SecteurIndicateurs({ project }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const adresse = project?.adresse_complete;

  useEffect(() => {
    if (!adresse) return;
    const cached = localStorage.getItem(CACHE_PREFIX + project.id);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < 30 * 24 * 60 * 60 * 1000) {
        setData(parsed.data);
        return;
      }
    }
    fetchData();
  }, [adresse, project?.id]);

  const fetchData = async () => {
    if (!adresse) return;
    setLoading(true);
    setError(null);

    const detected = detectVille(adresse);
    const inseeUrl = detected
      ? `https://www.insee.fr/fr/statistiques/2011101?geo=${detected.code}`
      : null;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Tu es un expert data analyst INSEE. Pour l'adresse "${adresse}"${inseeUrl ? `, page INSEE: ${inseeUrl}` : ''}.

Extrais le MAXIMUM de données du dossier complet INSEE de cette commune. Données 2022 de préférence.
Cherche TOUTES les sections: Population, Ménages/Familles, Logement, Diplômes, Emploi/Activité, CSP, Secteurs d'activité, Établissements, Revenus, Transports.
IMPORTANT: Remplis un maximum de champs avec les VRAIES données INSEE. Ne laisse rien à 0 si la donnée existe.`,
      add_context_from_internet: false,
      response_json_schema: {
        type: "object",
        properties: {
          // IDENTIFICATION
          ville: { type: "string" },
          code_insee: { type: "string" },
          annee_donnees: { type: "number" },
          
          // POPULATION
          population: { type: "number" },
          evolution_annuelle_pct: { type: "number", description: "Variation annuelle moyenne de la pop en %" },
          densite_hab_km2: { type: "number" },

          pop_0_14: { type: "number", description: "% pop 0-14 ans" },
          pop_15_29: { type: "number", description: "% pop 15-29 ans" },
          pop_30_44: { type: "number", description: "% pop 30-44 ans" },
          pop_45_59: { type: "number", description: "% pop 45-59 ans" },
          pop_60_74: { type: "number", description: "% pop 60-74 ans" },
          pop_75_plus: { type: "number", description: "% pop 75+ ans" },
          pop_historique: { type: "array", items: { type: "object", properties: { annee: { type: "number" }, population: { type: "number" } } }, description: "Population historique (1968,1975,1982,1990,1999,2006,2011,2016,2022)" },
          
          // MÉNAGES & FAMILLES
          nb_menages: { type: "number" },
          taille_moyenne_menage: { type: "number" },
          pct_menages_1_personne: { type: "number" },
          pct_couples_sans_enfant: { type: "number" },
          pct_couples_avec_enfants: { type: "number" },
          pct_familles_monoparentales: { type: "number" },
          
          // LOGEMENT
          nb_logements: { type: "number" },
          pct_residences_principales: { type: "number" },
          pct_residences_secondaires: { type: "number" },
          pct_logements_vacants: { type: "number" },
          pct_maisons: { type: "number" },
          pct_appartements: { type: "number" },
          pct_proprietaires: { type: "number" },
          pct_locataires: { type: "number" },
          nb_pieces_moyen: { type: "number" },
          surface_moyenne: { type: "number", description: "Surface moyenne des rés. principales en m²" },
          pct_1_piece: { type: "number" },
          pct_2_pieces: { type: "number" },
          pct_3_pieces: { type: "number" },
          pct_4_pieces: { type: "number" },
          pct_5_pieces_plus: { type: "number" },
          pct_emmenagement_moins_2ans: { type: "number" },
          pct_emmenagement_2_4ans: { type: "number" },
          pct_emmenagement_5_9ans: { type: "number" },
          pct_emmenagement_10ans_plus: { type: "number" },
          
          // DIPLÔMES
          pct_sans_diplome: { type: "number", description: "% sans diplôme ou BEPC" },
          pct_brevet: { type: "number" },
          pct_cap_bep: { type: "number" },
          pct_bac: { type: "number" },
          pct_bac_plus_2: { type: "number" },
          pct_bac_plus_3_4: { type: "number" },
          pct_bac_plus_5: { type: "number", description: "% bac+5 et plus" },
          
          // EMPLOI / ACTIVITÉ
          pop_15_64_ans: { type: "number" },
          taux_activite: { type: "number" },
          taux_emploi: { type: "number" },
          taux_chomage: { type: "number" },
          pct_agriculteurs: { type: "number" },
          pct_artisans_commercants: { type: "number" },
          pct_cadres: { type: "number" },
          pct_professions_intermediaires: { type: "number" },
          pct_employes: { type: "number" },
          pct_ouvriers: { type: "number" },
          pct_emploi_agriculture: { type: "number" },
          pct_emploi_industrie: { type: "number" },
          pct_emploi_construction: { type: "number" },
          pct_emploi_commerce_services: { type: "number" },
          pct_emploi_admin_public: { type: "number" },
          
          // TRANSPORTS
          pct_transport_voiture: { type: "number" },
          pct_transport_commun: { type: "number" },
          pct_transport_marche: { type: "number" },
          pct_transport_velo: { type: "number" },
          pct_pas_transport: { type: "number" },
          
          // ÉTABLISSEMENTS
          nb_etablissements: { type: "number" },
          pct_etab_0_salarie: { type: "number" },
          pct_etab_1_9: { type: "number" },
          pct_etab_10_49: { type: "number" },
          pct_etab_50_plus: { type: "number" },
          pct_etab_agriculture: { type: "number" },
          pct_etab_industrie: { type: "number" },
          pct_etab_construction: { type: "number" },
          pct_etab_commerce_services: { type: "number" },
          pct_etab_admin_public: { type: "number" },
          nb_creations_entreprises: { type: "number" },
          pct_creation_industrie: { type: "number" },
          pct_creation_commerce: { type: "number" },
          
          // REVENUS
          revenu_median: { type: "number", description: "Médiane du revenu disponible par UC en €" },
          taux_pauvrete: { type: "number" },
          part_menages_imposes: { type: "number", description: "Part des ménages fiscaux imposés en %" },
          revenu_1er_decile: { type: "number", description: "D1 en €" },
          revenu_1er_quartile: { type: "number", description: "Q1 en €" },
          revenu_3eme_quartile: { type: "number", description: "Q3 en €" },
          revenu_9eme_decile: { type: "number", description: "D9 en €" },
          rapport_interdecile: { type: "number", description: "D9/D1" },
        }
      }
    });

    if (result && typeof result === 'object') {
      setData(result);
      localStorage.setItem(CACHE_PREFIX + project.id, JSON.stringify({ data: result, timestamp: Date.now() }));
    } else {
      setError("Données invalides reçues. Réessayez.");
    }
    setLoading(false);
  };

  if (!adresse) {
    return (
      <div className="text-center py-12">
        <p className="text-[#9aa19e]">Aucune adresse renseignée pour ce projet.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-[#35a79b] animate-spin" />
        <p className="text-[#9aa19e] text-sm">Récupération des données INSEE...</p>
        <p className="text-[#8b9391] text-xs">{adresse}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <Button onClick={fetchData} variant="outline" size="sm" className="text-[#d3d8d6] border-[#303332]">
          <RefreshCw className="w-4 h-4 mr-2" />Réessayer
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-cormorant text-[#edeae5]">{data.ville}</h2>
          <div className="flex items-center gap-3 mt-1">
            <Badge className="bg-[#35a79b]/20 text-[#35a79b] border-0">INSEE {data.code_insee}</Badge>
            <span className="text-sm text-[#9aa19e]">Données {data.annee_donnees || 2022}</span>
          </div>
        </div>
        <Button onClick={fetchData} variant="ghost" size="icon" className="text-[#9aa19e] hover:text-[#edeae5]" title="Actualiser les données">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <PopulationSection data={data} />
      <LogementSection data={data} />
      <EmploiSection data={data} />
      <EconomieSection data={data} />
      <RevenusSection data={data} />

      {/* Notes secteur */}
      {project.notes_secteur && project.notes_secteur.length > 0 && (
        <SectionCard title="Notes">
          <div className="space-y-4">
            {project.notes_secteur.map((note, idx) => (
              <div key={idx} className="p-4 bg-[#171918]/50 rounded-md border border-[#303332]">
                {note.titre && <h4 className="text-[#edeae5] font-semibold mb-2">{note.titre}</h4>}
                <p className="text-sm text-[#d3d8d6] whitespace-pre-wrap">{note.contenu}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}