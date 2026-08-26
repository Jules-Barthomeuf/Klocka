import React, { useState } from "react";
import { ChevronDown, Loader2, Users } from "lucide-react";

// À qui ce projet pourrait correspondre, d'après les investisseurs tenus dans
// Monday : budget, apport et zone de recherche face au prix du bien.
//
// C'est une piste, pas une attribution — d'où la justification affichée à côté
// de chaque nom. Un rapprochement qu'on ne peut pas discuter ne sert à rien.
//
// Le bloc dit toujours quelque chose. Il se taisait quand il n'avait rien à
// montrer, si bien qu'une panne, un Monday non configuré et une absence de
// candidat se ressemblaient tous : un écran vide, sans recours.

// Milliers jusqu'au million, puis millions : « 2000 k€ » ne se lit pas, « 2 M€ » si.
const somme = (n) => {
  if (typeof n !== "number" || !isFinite(n) || !n) return null;
  if (n < 1_000_000) return `${Math.round(n / 1000)} k€`;
  return `${String(Math.round((n / 1_000_000) * 10) / 10).replace(".", ",")} M€`;
};

function Mention({ children }) {
  return (
    <p className="m-0 mt-2 px-3 py-2 text-[11px] text-[#6b7270] border border-[#1c1f1e] rounded-md">
      {children}
    </p>
  );
}

/**
 * @param {object[]} [clients] - candidats rendus par Monday
 * @param {boolean} [chargement] - le rapprochement est en cours
 * @param {boolean} [configure] - Monday est relié
 * @param {boolean} [erreur] - la lecture Monday a échoué
 */
export default function ClientsCorrespondants({ clients, chargement, configure, erreur }) {
  const [ouvert, setOuvert] = useState(false);

  if (erreur) return <Mention>Rapprochement indisponible : Monday n'a pas répondu.</Mention>;
  if (chargement)
    return (
      <Mention>
        <Loader2 className="w-3 h-3 animate-spin inline-block mr-1.5 align-[-2px]" />
        Rapprochement des clients Monday…
      </Mention>
    );
  if (configure === false) return <Mention>Monday n'est pas relié : aucun rapprochement possible.</Mention>;
  if (!clients?.length)
    return <Mention>Aucun client Monday ne correspond au prix et à la zone de ce projet.</Mention>;

  const visibles = ouvert ? clients : clients.slice(0, 2);

  return (
    <div className="mt-2 border border-[#e0c9a0]/25 rounded-md bg-[#e0c9a0]/[0.03] px-3 py-2.5">
      <button onClick={() => setOuvert((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <Users className="w-3 h-3 text-[#e0c9a0] flex-shrink-0" />
        <span className="text-[10px] tracking-[.14em] uppercase text-[#e0c9a0] flex-1">
          {clients.length} client{clients.length > 1 ? "s" : ""} possible{clients.length > 1 ? "s" : ""}
        </span>
        {clients.length > 2 && (
          <ChevronDown className={`w-3 h-3 text-[#6b7270] transition-transform ${ouvert ? "" : "-rotate-90"}`} />
        )}
      </button>

      <div className="mt-2 space-y-2">
        {visibles.map((c) => (
          <div key={c.nom}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] text-[#edeae5] truncate">{c.nom}</span>
              <span className="text-[10.5px] text-[#6b7270] flex-shrink-0 whitespace-nowrap">
                {[somme(c.budget), c.statut].filter(Boolean).join(" · ")}
              </span>
            </div>
            <p className="m-0 text-[11px] text-[#8b9391] leading-[1.45]">{c.raisons.join(" · ")}</p>
          </div>
        ))}
      </div>

      {!ouvert && clients.length > 2 && (
        <button
          onClick={() => setOuvert(true)}
          className="mt-2 text-[10.5px] text-[#6b7270] hover:text-[#e0c9a0] transition-colors"
        >
          et {clients.length - 2} autre{clients.length - 2 > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
