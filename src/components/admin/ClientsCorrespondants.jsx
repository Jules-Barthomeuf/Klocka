import React, { useState } from "react";
import { Loader2 } from "lucide-react";

// Les clients Monday qui correspondent à un projet, sous ses chiffres : le
// nombre en vert, puis chaque nom avec son budget et son statut, et pourquoi
// il correspond. Deux se voient, les autres s'ouvrent d'un clic.

const somme = (n) => (typeof n === "number" ? `${Math.round(n / 1000)} k€` : null);

function Mention({ children }) {
  return <p className="m-0 mt-3.5 text-[12.5px] leading-[1.5] text-brume">{children}</p>;
}

export default function ClientsCorrespondants({ clients, chargement, configure, erreur }) {
  const [ouvert, setOuvert] = useState(false);

  if (erreur) return <Mention>Rapprochement indisponible : Monday n'a pas répondu.</Mention>;
  if (chargement)
    return (
      <Mention>
        <Loader2 className="mr-1.5 inline-block h-3 w-3 animate-spin align-[-2px]" />
        Rapprochement des clients Monday…
      </Mention>
    );
  if (configure === false) return <Mention>Monday n'est pas relié : aucun rapprochement possible.</Mention>;
  if (!clients?.length) return <Mention>Aucun client Monday ne correspond au prix et à la zone de ce projet.</Mention>;

  const visibles = ouvert ? clients : clients.slice(0, 2);
  const initiales = (nom) => String(nom || "").trim().split(/\s+/).slice(0, 2).map((m) => m[0]).join("").toUpperCase();

  return (
    <div className="mt-4 border-t border-trait pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13.5px] text-encre">Clients possibles</span>
        <span className="text-[12.5px] text-ardoise">{clients.length} client{clients.length > 1 ? "s" : ""}</span>
      </div>
      <div className="mt-3 flex flex-col gap-3.5">
        {visibles.map((c) => (
          <div key={c.nom} className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full bg-menthe/[0.12] text-[11px] font-semibold text-menthe">{initiales(c.nom)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13.5px] text-encre">{c.nom}</span>
                <span className="flex-shrink-0 whitespace-nowrap text-[12.5px] text-ardoise">{[somme(c.budget), c.statut].filter(Boolean).join(" · ")}</span>
              </div>
              {c.raisons?.length > 0 && <p className="m-0 mt-0.5 text-[12px] leading-[1.45] text-brume">{c.raisons.join(" · ")}</p>}
            </div>
          </div>
        ))}
      </div>
      {clients.length > 2 && (
        <button type="button" onClick={() => setOuvert((o) => !o)} className="mt-3 text-[12.5px] text-ardoise transition-colors hover:text-menthe" style={{ background: "transparent" }}>
          {ouvert ? "Moins" : `et ${clients.length - 2} autre${clients.length - 2 > 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
