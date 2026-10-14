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
  // L'audience hors équipe : clients, mandataires, pages publiques (14 oct. 2026).
  { to: "/SuiviAudience", mot: "Audience" },
  { to: "/SuiviAppels", mot: "Appels" },
  // Enregistrer une réunion, qui nourrit le Cerveau (14 oct. 2026).
  { to: "/SuiviReunion", mot: "Réunion" },
  { to: "/SuiviMandataires", mot: "Mandataires" },
  { to: "/CoutsIA", mot: "Coûts IA" },
  { to: "/SuiviChat", mot: "Chat" },
  { to: "/SuiviTesteur", mot: "Agent testeur" },
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
            className="relative pb-2 text-[11px] uppercase tracking-[.16em] transition-colors max-md:pt-3"
            style={{ color: actif ? J["menthe"] : J["brume"], borderBottom: actif ? "1.5px solid #96c0b8" : "1.5px solid transparent" }}
          >
            {p.mot}
          </Link>
        );
      })}
    </div>
  );
}
