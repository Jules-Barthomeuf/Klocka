import React from "react";
import { Link, useLocation } from "react-router-dom";
import { prechargerAuSurvol } from "@/lib/precharger";

// Suivi : une seule entrée dans le menu, quatre pages derrière (les Appels
// depuis le 9 oct. 2026 : l'usage de la Prospection, des Relances et du Rappel ; les Mandataires, le même jour).
//
// L'usage de la plateforme et ce que coûte chaque geste répondent à la même
// question — qu'est-ce qui tourne, et à quel prix. Deux lignes dans la barre
// latérale les séparaient sans raison ; elles se lisent l'une après l'autre.

const PAGES = [
  { to: "/Suivi", page: "Monitoring", mot: "Usage" },
  { to: "/SuiviAppels", page: "SuiviAppels", mot: "Appels" },
  // Enregistrer une réunion, qui nourrit l'Intelligence (14 oct. 2026).
  { to: "/SuiviReunion", page: "SuiviReunion", mot: "Réunion" },
  // Ce que l'équipe corrige sur les projets rentrés, et les règles qu'on en tire (13 nov. 2026, Jules).
  { to: "/SuiviCorrections", page: "SuiviCorrections", mot: "Corrections" },
  // Mandataires, Chat et Assistant KPartners retirés des onglets le 6 nov. 2026 (Jules), comme Coûts IA et Agent testeur
  // le 16 oct. ; leurs pages restent à leur adresse.
];

export default function OngletsSuivi({ className = "" }) {
  const { pathname } = useLocation();
  // Sous le titre, centrés, en pilules comme les sections de Paramètres (15 nov. 2026, Jules : posés au-dessus du titre,
  // ils passaient sous lui, que la page cale à hauteur du logo ; « Usage, Appels, Réunion, Corrections au milieu »).
  return (
    <nav aria-label="Pages du Suivi" className={`flex justify-center ${className}`}>
      <div className="inline-flex max-w-full gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PAGES.map((p) => {
          const actif = pathname.toLowerCase() === p.to.toLowerCase();
          return (
            <Link
              key={p.to}
              to={p.to}
              aria-current={actif ? "page" : undefined}
              onMouseEnter={() => prechargerAuSurvol(p.page)}
              onFocus={() => prechargerAuSurvol(p.page)}
              className={`inline-flex h-7 flex-none items-center whitespace-nowrap rounded-full px-3 text-[13px] transition-colors max-md:h-10 max-md:px-3.5 ${actif ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}
            >
              {p.mot}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
