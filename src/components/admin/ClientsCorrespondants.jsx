import React from "react";
import { kEuros } from "@/lib/clients-commerces";

// Les clients du CRM qui correspondent à un projet, sous sa carte de la page Projets.

const somme = (n) => (typeof n === "number" ? kEuros(n) : null);


// Les noms seuls, sous la carte (14 nov. 2026, Jules, après la planche « Projets sans clients possibles » : « intègre avec
// les clients, tu mets juste les noms dessous ») : une ligne, trois noms et « et N autres » ; le budget et le pourquoi
// restent au survol de chaque nom. Rien quand aucun client ne correspond, que Twenty ne répond pas ou que le rapprochement
// se fait encore : la carte reste nette.
export default function ClientsCorrespondants({ clients, chargement, configure, erreur }) {
  if (erreur || chargement || configure === false || !clients?.length) return null;
  const visibles = clients.slice(0, 3);
  const reste = clients.length - visibles.length;
  return (
    <p className="m-0 truncate pt-3 text-[12.5px] text-ardoise">
      Clients possibles :{" "}
      {visibles.map((c, i) => (
        <span key={c.nom}>
          <span className="text-encre" title={[somme(c.budget), c.statut, ...(c.raisons || [])].filter(Boolean).join(" · ")}>{c.nom}</span>
          {i < visibles.length - 1 ? ", " : ""}
        </span>
      ))}
      {reste > 0 && ` et ${reste} autre${reste > 1 ? "s" : ""}`}
    </p>
  );
}
