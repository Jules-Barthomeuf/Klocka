import React from "react";
import { Link, useLocation } from "react-router-dom";
import { J } from "@/design/jetons";

// Suivi : une seule entrée dans le menu, quatre pages derrière (les Appels
// depuis le 9 oct. 2026 : l'usage de la Prospection, des Relances et du Rappel ; les Mandataires, le même jour).
//
// L'usage de la plateforme et ce que coûte chaque geste répondent à la même
// question — qu'est-ce qui tourne, et à quel prix. Deux lignes dans la barre
// latérale les séparaient sans raison ; elles se lisent l'une après l'autre.

const PAGES = [
  { to: "/Suivi", mot: "Usage" },
  { to: "/SuiviAppels", mot: "Appels" },
  // Enregistrer une réunion, qui nourrit l'Intelligence (14 oct. 2026).
  { to: "/SuiviReunion", mot: "Réunion" },
  // Ce que l'équipe corrige sur les projets rentrés, et les règles qu'on en tire (13 nov. 2026, Jules).
  { to: "/SuiviCorrections", mot: "Corrections" },
  // Mandataires, Chat et Assistant KPartners retirés des onglets le 6 nov. 2026 (Jules), comme Coûts IA et Agent testeur
  // le 16 oct. ; leurs pages restent à leur adresse.
];

export default function OngletsSuivi({ className = "" }) {
  const { pathname } = useLocation();
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      {PAGES.map((p) => {
        const actif = pathname.toLowerCase() === p.to.toLowerCase();
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={actif ? "page" : undefined}
            className="relative pb-2 text-[13.5px] transition-colors max-md:pt-3"
            style={{ color: actif ? J["encre"] : J["ardoise"], borderBottom: actif ? `1.5px solid ${J["menthe"]}` : "1.5px solid transparent" }}
          >
            {p.mot}
          </Link>
        );
      })}
    </div>
  );
}
