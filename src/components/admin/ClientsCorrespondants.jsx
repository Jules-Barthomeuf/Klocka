import React from "react";
import { kEuros } from "@/lib/clients-commerces";

// Les clients du CRM qui correspondent à un projet, sous sa carte de la page Projets.

const somme = (n) => (typeof n === "number" ? kEuros(n) : null);


// Les noms seuls, sous la carte (14 nov. 2026, Jules, après la planche « Projets sans clients possibles » : « intègre avec
// les clients, tu mets juste les noms dessous ») : une ligne, le nombre puis trois noms ; le budget et le pourquoi
// restent au survol de chaque nom. Rien quand aucun client ne correspond, que Twenty ne répond pas ou que le rapprochement
// se fait encore : la carte reste nette.
// Sous la carte de verre givré (même jour, planche « Projets », vue Givré) : un point à l'accent, « N clients possibles »
// à l'encre, puis les trois premiers noms.
export default function ClientsCorrespondants({ clients, chargement, configure, erreur }) {
  if (erreur || chargement || configure === false || !clients?.length) return null;
  const visibles = clients.slice(0, 3);
  return (
    <p className="m-0 flex min-w-0 items-center gap-2.5 text-[13px] text-ardoise">
      <span aria-hidden className="h-1.5 w-1.5 flex-none rounded-full bg-menthe" />
      <span className="min-w-0 truncate">
        <span className="text-encre">{clients.length} client{clients.length > 1 ? "s" : ""} possible{clients.length > 1 ? "s" : ""}</span>
        {" · "}
        {visibles.map((c, i) => (
          <span key={c.nom}>
            <span title={[somme(c.budget), c.statut, ...(c.raisons || [])].filter(Boolean).join(" · ")}>{c.nom}</span>
            {i < visibles.length - 1 ? ", " : ""}
          </span>
        ))}
      </span>
    </p>
  );
}
