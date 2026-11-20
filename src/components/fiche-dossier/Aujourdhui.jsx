import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { LigneAction } from "@/components/fiche-dossier/FicheDossier";

// « Aujourd'hui », sur la page de l'assistant (19 nov. 2026, Jules : « à une date précise qu'on a fixée pendant la
// prise de notes, ça va faire ressortir ça pour Max et les autres ») : les actions dues (en retard comprises), les
// messages que l'assistant a préparés, les notes laissées sans OK. Plus de « Les dossiers qui ont bougé » (19 nov. 2026,
// Jules : « enlève Les dossiers qui ont bougé »). Rien ne s'affiche quand il n'y a rien : la page reste celle d'une question.

const Etiquette = ({ children }) => <p className="m-0 mb-1.5 text-[11px] uppercase tracking-[.14em] text-brume">{children}</p>;

export default function Aujourdhui({ className = "" }) {
  const { data } = useQuery({ queryKey: ["fiche-dossier-jour"], queryFn: () => base44.request("GET", "/api/fiche-dossier/aujourdhui"), staleTime: 30_000, refetchOnWindowFocus: true });
  if (!data) return null;
  const aFaire = [...data.dues, ...data.prets];
  // Plus de « Notes à valider » (19 nov. 2026, Jules) : une note en attente se retrouve et se valide dans « Mes notes ».
  const rien = !aFaire.length && !data.bientot.length;
  if (rien) return null;
  return (
    <div className={`mx-auto w-full max-w-[760px] space-y-6 text-left ${className}`}>
      {(aFaire.length > 0 || data.bientot.length > 0) && (
        <section className="rounded-bloc border border-trait bg-surface px-5 py-4">
          {aFaire.length > 0 && (
            <>
              <Etiquette>Aujourd'hui</Etiquette>
              <ul className="m-0 list-none divide-y divide-trait p-0">{aFaire.map((a) => <LigneAction key={a.id} a={a} avecFiche />)}</ul>
            </>
          )}
          {data.bientot.length > 0 && (
            <div className={aFaire.length ? "mt-4" : ""}>
              <Etiquette>Dans les sept jours</Etiquette>
              <ul className="m-0 list-none divide-y divide-trait p-0">{data.bientot.map((a) => <LigneAction key={a.id} a={a} avecFiche />)}</ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
