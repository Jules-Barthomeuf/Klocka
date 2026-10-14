import React from "react";
import { Link, useLocation } from "react-router-dom";
import { J } from "@/design/jetons";

// Outils : une seule entrée dans le menu, un onglet par outil derrière, sur
// le dessin des onglets du Suivi. Le premier est Vacance (13 oct. 2026) ; les
// suivants s'ajoutent ici.

// Taux de vacance (14 oct. 2026) : le même outil, un autre onglet, par « ?outil=taux ».
const PAGES = [
  { to: "/Outils", mot: "Vacance", outil: null },
  { to: "/Outils?outil=taux", mot: "Taux de vacance", outil: "taux" },
];

export default function OngletsOutils({ className = "" }) {
  const { pathname, search } = useLocation();
  const outil = new URLSearchParams(search).get("outil");
  return (
    <div className={`flex items-center gap-6 ${className}`}>
      {PAGES.map((p) => {
        const actif = pathname.toLowerCase() === "/outils" && (outil || null) === p.outil;
        return (
          <Link
            key={p.to}
            to={p.to}
            aria-current={actif ? "page" : undefined}
            className="relative pb-2 text-[11px] uppercase tracking-[.16em] transition-colors"
            style={{ color: actif ? J["menthe"] : J["brume"], borderBottom: `1.5px solid ${actif ? J["menthe"] : "transparent"}` }}
          >
            {p.mot}
          </Link>
        );
      })}
    </div>
  );
}
