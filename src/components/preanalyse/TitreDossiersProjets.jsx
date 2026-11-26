import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Dossiers et Projets, un seul endroit (26 nov. 2026, Jules : « projets et dossiers dans le même truc ») : une entrée
// « Dossiers » dans la barre, et en tête des deux listes, à la place du titre, les deux mots au corps du titre (24 px) ;
// celui de la page en `encre`, l'autre en `ardoise`, qui mène à l'autre liste. Un projet est aussi l'étape Projet de
// son dossier.

const MOTS = [["Analyse", "Dossiers"], ["AdminProjets", "Projets"]];

export default function TitreDossiersProjets({ actif }) {
  return (
    <nav aria-label="Dossiers et projets" className="flex min-h-9 min-w-0 items-baseline gap-5 max-md:pr-12">
      {MOTS.map(([page, mot]) => (page === actif
        ? <h1 key={page} className="m-0 truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">{mot}</h1>
        : <Link key={page} to={createPageUrl(page)} className="truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-ardoise transition-colors hover:text-encre">{mot}</Link>))}
    </nav>
  );
}
