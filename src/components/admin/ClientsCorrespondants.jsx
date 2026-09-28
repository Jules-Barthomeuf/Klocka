import React, { useState } from "react";
import { ChevronUp, Loader2, Users } from "lucide-react";

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

  return (
    <div className="mt-3.5 border-t border-trait pt-3.5">
      <button type="button" onClick={() => setOuvert((o) => !o)} className="flex w-full items-center gap-2 text-left" style={{ background: "transparent" }}>
        <Users className="h-[15px] w-[15px] flex-shrink-0 text-menthe" />
        <span className="flex-1 text-[13.5px] text-menthe">
          {clients.length} client{clients.length > 1 ? "s" : ""} possible{clients.length > 1 ? "s" : ""}
        </span>
        {clients.length > 2 && <ChevronUp className={`h-3.5 w-3.5 text-ardoise transition-transform ${ouvert ? "" : "rotate-180"}`} />}
      </button>

      <div className="mt-2.5 flex flex-col gap-2.5">
        {visibles.map((c) => (
          <div key={c.nom}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13.5px] text-encre">{c.nom}</span>
              <span className="flex-shrink-0 whitespace-nowrap text-[12.5px] text-ardoise">{[somme(c.budget), c.statut].filter(Boolean).join(" · ")}</span>
            </div>
            <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-ardoise">{c.raisons.join(" · ")}</p>
          </div>
        ))}
      </div>

      {!ouvert && clients.length > 2 && (
        <button type="button" onClick={() => setOuvert(true)} className="mt-2 text-[12.5px] text-brume transition-colors hover:text-menthe" style={{ background: "transparent" }}>
          et {clients.length - 2} autre{clients.length - 2 > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
