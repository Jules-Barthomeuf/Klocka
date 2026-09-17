import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { MODULES_KDATA } from "@/lib/kdata-modules";

// K-Data : l'autre côté de l'application. Klocka accompagne un client sur un
// projet ; K-Data répond à une question de marché, sans dossier et sans client.
// Les deux côtés partagent le compte ; la bascule dans la barre latérale de
// Klocka échange celle-ci contre la barre du haut de K-Data, propre à ce côté.
//
// Cette page n'est qu'une porte : six modules, une carte chacun. Le travail
// vit dans les modules, pas ici. La liste des modules est partagée avec cette
// barre du haut, dans src/lib/kdata-modules.js : un seul endroit les décrit.

/** Une carte de module : le nom, ce qu'il fait, son état. Rien de plus. */
function CarteModule({ module: m }) {
  const Icone = m.icone;
  const ouvrable = !!m.chemin;

  const corps = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border border-trait bg-relief">
          <Icone className="h-[18px] w-[18px] text-menthe" />
        </div>
        {ouvrable ? (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-bord transition-colors group-hover:border-menthe">
            <ArrowUpRight className="h-4 w-4 text-ardoise transition-colors group-hover:text-menthe-clair" />
          </div>
        ) : (
          <span className="alx-mont rounded-full border border-trait px-2.5 py-1 text-[11px] font-medium uppercase tracking-[.14em] text-brume">
            {m.etat}
          </span>
        )}
      </div>

      <div className="mt-5">
        <h2 className="m-0 text-[18px] font-medium tracking-[-0.01em] text-encre">{m.nom}</h2>
        <p className="mt-2 mb-0 text-[13.5px] leading-[1.6] text-ardoise">{m.phrase}</p>
      </div>

      {ouvrable && (
        <p className="alx-mont mt-4 mb-0 text-[11px] font-medium uppercase tracking-[.14em] text-menthe">{m.etat}</p>
      )}
    </>
  );

  const habit = "group block rounded-[18px] border border-trait bg-surface p-[22px] transition-colors duration-300";

  if (!ouvrable) {
    return <div className={`${habit} cursor-default opacity-70`}>{corps}</div>;
  }
  return (
    <Link to={m.chemin} className={`${habit} cursor-pointer hover:border-menthe/40`}>
      {corps}
    </Link>
  );
}

export default function KData() {
  const user = useUser();
  if (!user || user.role !== "admin") return null;

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1440px] px-7 pb-20 pt-7">
        <header className="mb-8">
          <p className="alx-mont m-0 text-[11px] font-medium uppercase tracking-[.18em] text-menthe">K-Data</p>
          <h1 className="mt-2 mb-0 text-[34px] font-light leading-tight tracking-[-0.02em] text-encre">
            La donnée du commerce
          </h1>
          <p className="mt-3 mb-0 max-w-[62ch] text-[15px] leading-[1.7] text-ardoise">
            Six modules, six questions de marché. Chacun s&apos;ouvre seul, sans dossier ni client :
            on interroge une adresse, une ville ou un secteur, et on repart avec une réponse.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MODULES_KDATA.map((m) => (
            <CarteModule key={m.cle} module={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
