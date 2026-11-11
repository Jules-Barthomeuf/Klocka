import React, { useState } from "react";
import OngletsSuivi from "@/components/OngletsSuivi";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import SauvegardeBase from "@/components/monitoring/SauvegardeBase";
import Incidents from "@/components/monitoring/Incidents";
import { useCouleurs } from "@/components/monitoring/GraphesAppels";
import { TableauPersonnes, VueEnsemble } from "@/components/monitoring/UsagePlateforme";
import { Filtres, TitrePage } from "@/components/mandataire/elements";
import Chargement from "@/components/ui/Chargement";

// Centre de suivi : qui utilise la plateforme, combien de temps, et sur quoi.
//
// Depuis le 19 oct. 2026 (Jules) : en tête, cinq chiffres et leur courbe, un
// grand graphique par jour, le temps par page et l'heure de la semaine ; puis
// le tableau par personne, dont chaque ligne s'ouvre sur ses sessions, page
// par page. Les colonnes IA et Actions, les outils de l'assistant et ce que
// coûte l'IA sont partis de cet écran (la page Coûts IA garde les coûts).
// Le 11 nov. 2026 (Jules), la qualité d'AK et l'historique des demandes à
// l'assistant en partent aussi, puis la Traçabilité (« Qui a fait quoi ») ;
// les demandes et le journal d'audit restent gardés en base.

const FENETRES = [
  { jours: 1, libelle: "1 jour" },
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
];

export default function Monitoring() {
  const [jours, setJours] = useState(30);
  const c = useCouleurs();

  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring-usage", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/usage?jours=${jours}`),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });

  if (error) {
    return (
      <div className="bg-fond min-h-screen text-encre p-8">
        <p className="text-[13.5px] text-menthe">{error.message || "Accès refusé."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1500px] px-5 py-[22px] md:px-8">
        <OngletsSuivi className="mb-3 overflow-x-auto" />
        <TitrePage titre="Usage de la plateforme" className="mb-3.5 md:!pr-[112px]" actions={<Filtres label="Période" valeur={jours} onChange={setJours} options={FENETRES.map((f) => [f.jours, f.libelle])} />} />

        {isLoading || !data ? (
          <Chargement taille="grand" />
        ) : (
          <div className="flex flex-col gap-5 mb-8">
            <VueEnsemble data={data} c={c} />
            <TableauPersonnes personnes={data.personnes} jours={jours} c={c} />
            <p className="m-0 text-[12px] leading-[1.6] text-brume">
              Une connexion : des pages ouvertes sans pause de plus de 30 minutes. Le temps sur une page va jusqu'à la page suivante ;
              sur la dernière, jusqu'au dernier signe du navigateur (il en envoie un toutes les 30 s tant que la page est visible, 30 minutes au plus),
              ou une minute quand il n'y en a pas (marqué « ~ » et en gris). Les battements existent depuis le 14 octobre 2026.
            </p>
          </div>
        )}

        <Incidents />

        <SauvegardeBase />
      </div>
    </div>
  );
}
