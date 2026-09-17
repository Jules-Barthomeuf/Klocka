import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Etiquette, joliNom } from "@/components/alx/alx-commun";
import PenseeIA from "@/components/PenseeIA";

// Où joindre le propriétaire des murs.
//
// Pas de téléphone : l'annuaire des entreprises n'en publie pas, et une SCI
// n'en a le plus souvent aucun. Ce qui sert à écrire, c'est l'adresse du
// siège, la forme, l'année de création et les gérants. Des gérants on ne
// montre que le nom, la qualité et une tranche d'âge.
//
// La lecture ne part qu'au clic : l'annuaire est interrogé pour un
// propriétaire qu'on va contacter, pas pour les soixante d'une liste.

const Lien = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-[12.5px] text-ardoise underline-offset-2 hover:text-encre hover:underline">
    {children}
  </a>
);

export default function CoordonneesProprietaire({ siren = null, nom = null, ville = null, code_postal = null, libelle = "Trouver le propriétaire" }) {
  const [demande, setDemande] = useState(false);
  const parametres = new URLSearchParams(
    Object.entries({ siren, nom, ville, code_postal }).filter(([, v]) => v).map(([k, v]) => [k, String(v)])
  ).toString();

  const { data, isLoading } = useQuery({
    queryKey: ["proprietaire", parametres],
    queryFn: () => base44.request("GET", `/api/alx/proprietaire?${parametres}`),
    enabled: demande && !!parametres,
    staleTime: 24 * 60 * 60 * 1000,
  });

  if (!parametres) return null;

  if (!demande) {
    return (
      <button type="button" onClick={() => setDemande(true)} className="text-[12.5px] text-menthe hover:underline" style={{ background: "transparent" }}>
        {libelle}
      </button>
    );
  }
  if (isLoading) return <span className="inline-flex items-center gap-2 text-[12.5px] text-ardoise"><PenseeIA etat="searching" taille={20} /> Lecture de l&apos;annuaire…</span>;
  // Sans fiche, les liens restent : le SIREN ouvre Pappers, qui indexe ce que
  // la recherche publique laisse de côté.
  if (!data?.ok) {
    return (
      <div className="rounded-[12px] border border-trait bg-surface px-4 py-3">
        <p className="m-0 text-[12.5px] leading-[1.6] text-ardoise">{data?.erreur || "Introuvable à l'annuaire des entreprises."}</p>
        {(data?.liens || []).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {data.liens.map(([mot, href]) => <Lien key={mot} href={href}>{mot}</Lien>)}
          </div>
        )}
      </div>
    );
  }

  const s = data.societe;
  const gerants = (s.gerants || []).filter((g) => g.nom).slice(0, 4);

  return (
    <div className="rounded-[12px] border border-trait bg-surface px-4 py-3.5">
      <Etiquette className="mb-2">Où le joindre</Etiquette>
      <div className="flex flex-col gap-1.5 text-[12.5px] leading-[1.6] text-craie">
        {data.siege_ligne && (
          <div>
            Siège : {data.siege_ligne}
            {data.maps && <> · <Lien href={data.maps}>voir</Lien></>}
          </div>
        )}
        <div>
          {[s.forme, s.creation ? `créée en ${String(s.creation).slice(0, 4)}` : null, s.active === false ? "radiée" : null]
            .filter(Boolean).join(" · ")}
          {s.siren ? ` · SIREN ${s.siren}` : ""}
        </div>
        {gerants.length > 0 && (
          <div>
            {gerants.length > 1 ? "Gérants" : "Gérant"} : {gerants.map((g) => {
              const qualite = g.qualite ? ` (${g.qualite.toLowerCase()})` : "";
              const age = g.tranche_age ? `, ${g.tranche_age}` : "";
              return `${joliNom(g.nom)}${qualite}${age}`;
            }).join(" · ")}
          </div>
        )}
        <div className="text-brume">
          Pas de téléphone : l&apos;annuaire n&apos;en publie pas pour une société civile. Le courrier au siège est la voie.
        </div>
      </div>
      {data.liens.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-3">
          {data.liens.map(([mot, href]) => <Lien key={mot} href={href}>{mot}</Lien>)}
        </div>
      )}
    </div>
  );
}
