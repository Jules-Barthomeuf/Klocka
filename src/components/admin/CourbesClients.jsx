import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import Chargement from "@/components/ui/Chargement";
import { ChiffreCourbe, Croissance, useCouleurs } from "@/components/monitoring/GraphesAppels";

// Les courbes des clients, en tête de la page Utilisateurs (18 oct. 2026, Jules :
// « comme dans le Suivi, des graphiques : le nombre de clients, s'il augmente ou
// pas, et la durée de connexion de ces clients, en courbes »). Les mêmes
// composants que le Suivi et l'Intelligence ; le calcul est dans
// server/clients-courbes.js (la durée est estimée à partir des pages ouvertes).

const PERIODES = [[30, "30 jours"], [90, "90 jours"], [365, "1 an"]];
const minutes = (m) => (m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);

export default function CourbesClients() {
  const c = useCouleurs();
  const [jours, setJours] = useState(90);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["clients-courbes", jours],
    queryFn: () => base44.request("GET", `/api/admin/clients/courbes?jours=${jours}`),
    staleTime: 5 * 60 * 1000,
  });
  const t = data?.totaux;
  return (
    <section aria-label="Évolution des clients" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[15px] text-encre">Évolution des clients</p>
        <div className="flex gap-1.5">
          {PERIODES.map(([n, mot]) => (
            <button key={n} type="button" onClick={() => setJours(n)} aria-pressed={jours === n}
              className={`h-8 rounded-full border px-3.5 text-[12.5px] transition-colors ${jours === n ? "border-menthe bg-menthe/10 text-menthe" : "border-trait text-ardoise hover:text-encre"}`}
              style={jours === n ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
      </div>
      {isLoading ? <Chargement titre="Les courbes des clients" /> : isError || !data ? (
        <p className="m-0 rounded-[14px] border border-dashed border-trait p-6 text-center text-[13.5px] text-brume">Les courbes n'ont pas pu être chargées.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ChiffreCourbe c={c} libelle="Comptes clients" valeur={t.comptes} note={`${t.nouveaux > 0 ? "+" : ""}${t.nouveaux} sur ${jours === 365 ? "un an" : `${jours} jours`}`} serie={data.serie} cle="comptes" />
            <ChiffreCourbe c={c} libelle="Clients connectés" valeur={t.connectes} note={`sur la période · ${t.deja_connectes} déjà venus`} serie={data.serie} cle="connectes" />
            <ChiffreCourbe c={c} libelle="Temps moyen par client" valeur={minutes(t.moyenne)} note={`${minutes(t.minutes)} en tout sur la période`} serie={data.serie} cle="moyenne" format={minutes} />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Croissance c={c} titre="Nombre de clients" aide="Les comptes clients, cumulés à leur création, et ceux qui se sont déjà connectés au moins une fois. Sans l'équipe ni les mandataires."
              serie={data.serie} series={[{ cle: "comptes", nom: "Comptes clients" }, { cle: "deja_connectes", nom: "Déjà connectés" }]} />
            <Croissance c={c} titre="Durée de connexion des clients" aide="En minutes, jour par jour. Estimée à partir des pages ouvertes : une pause de plus de 30 minutes coupe la session."
              serie={data.serie} series={[{ cle: "minutes", nom: "Minutes du jour" }, { cle: "moyenne", nom: "Moyenne par client connecté" }]} />
          </div>
        </>
      )}
    </section>
  );
}
