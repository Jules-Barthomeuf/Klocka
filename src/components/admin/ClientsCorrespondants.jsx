import React, { useState } from "react";
import { ChevronDown, Users } from "lucide-react";

// À qui ce projet pourrait correspondre, d'après les investisseurs tenus dans
// Monday : budget, apport et zone de recherche face au prix du bien.
//
// C'est une piste, pas une attribution — d'où la justification affichée à côté
// de chaque nom. Un rapprochement qu'on ne peut pas discuter ne sert à rien.

export default function ClientsCorrespondants({ clients }) {
  const [ouvert, setOuvert] = useState(false);
  if (!clients?.length) return null;

  const visibles = ouvert ? clients : clients.slice(0, 2);

  return (
    <div className="mt-2 border border-[#242726] rounded-md bg-[#0c0e0d] px-3 py-2.5">
      <button
        onClick={() => setOuvert((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        <Users className="w-3 h-3 text-[#e0c9a0] flex-shrink-0" />
        <span className="text-[10px] tracking-[.14em] uppercase text-[#e0c9a0] flex-1">
          {clients.length} client{clients.length > 1 ? "s" : ""} possible{clients.length > 1 ? "s" : ""}
        </span>
        {clients.length > 2 && (
          <ChevronDown
            className={`w-3 h-3 text-[#6b7270] transition-transform ${ouvert ? "" : "-rotate-90"}`}
          />
        )}
      </button>

      <div className="mt-2 space-y-1.5">
        {visibles.map((c) => (
          <div key={c.nom}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] text-[#edeae5] truncate">{c.nom}</span>
              {c.statut && <span className="text-[10.5px] text-[#6b7270] flex-shrink-0">{c.statut}</span>}
            </div>
            <p className="m-0 text-[11px] text-[#8b9391] leading-[1.45]">{c.raisons.join(" · ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
