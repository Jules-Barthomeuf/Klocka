import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ApercuStatistiques from "@/components/monitoring/ApercuStatistiques";
import FichesAVerifier from "@/components/monitoring/FichesAVerifier";
import MesStatistiques from "@/components/monitoring/MesStatistiques";
import { couleursDouces, useCouleurs } from "@/components/monitoring/GraphesAppels";
import { CarteRecordPage } from "@/components/RecordEquipe";
import { Filtres, TitrePage } from "@/components/mandataire/elements";
import { useUser } from "@/components/providers/UserProvider";

// Statistiques (20 nov. 2026, Jules : « des statistiques de fiches, par analyste, global », puis « ajoute un menu
// Statistiques ») : une entrée du menu, sous Appels. Refaite le 22 nov. 2026 d'après la maquette de Jules (« la page
// complète ») : à gauche le record (même carte que la pop-up de la semaine) et le classement commun des meilleurs agents ;
// à droite quatre chiffres, les fiches semaine par semaine, puis « Mes statistiques ». Le tableau par analyste, les
// agents et villes de la période et la liste des fiches à corriger (FichesParAnalyste) ne sont plus sur la page. Le
// classement des meilleurs agents retiré le même jour (22 nov. 2026, Jules : « enlève le truc des agents immobiliers ») ;
// MeilleursAgents.jsx et ses routes sont gardés.

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"], [365, "Un an"]];

export default function Statistiques() {
  const [jours, setJours] = useState(30);
  const c = useCouleurs();
  const user = useUser();
  const { data } = useQuery({ queryKey: ["fiches-analystes", jours], queryFn: () => base44.request("GET", `/api/monitoring/fiches-analystes?jours=${jours}`), placeholderData: (prev) => prev, staleTime: 30_000 });
  // Une couleur par personne, la même partout sur la page (graphiques, pastilles).
  const teintes = data ? couleursDouces(data.analystes, c) : {};
  const equipe = data ? [...data.analystes].sort((x, y) => y.fiches - x.fiches || x.prenom.localeCompare(y.prenom)).map((a) => ({ email: a.email, prenom: a.prenom, teinte: teintes[a.email] })) : [];

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1500px] px-5 py-[22px] md:px-8">
        <TitrePage titre="Statistiques" className="mb-4" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <p className="m-0 max-w-[760px] text-[13.5px] leading-[1.55] text-ardoise">Les fiches reçues par l'équipe, et ce qu'elles deviennent. Une fiche compte ses biens : un PDF de trois biens en vaut trois.</p>
          <Filtres label="Période" valeur={jours} onChange={setJours} options={PERIODES} />
        </div>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <CarteRecordPage r={data?.record_analyste} />
            {/* Les envois dont le compte n'est pas sûr (22 nov. 2026), et toutes les fiches de la période (23 nov.) : réglés d'un geste. */}
            <FichesAVerifier fiches={data?.fiches} justesse={data?.justesse} equipe={equipe} moi={String(user?.email || "").toLowerCase()} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <ApercuStatistiques jours={jours} />
            {equipe.length > 0 && <MesStatistiques equipe={equipe} moi={String(user?.email || "").toLowerCase()} c={c} />}
          </div>
        </div>
      </div>
    </div>
  );
}
