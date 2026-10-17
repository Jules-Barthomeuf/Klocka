import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { useCompteHaka, usePropositions } from "@/components/haka/useFileHaka";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { ilYa } from "@/components/dashboard/ChatDashboard";

// Le bas de l'Accueil (17 oct. 2026, Jules) : deux colonnes. À gauche ce que
// Haka a préparé et qui attend un clic (les cinq premiers, puis la page) ; à
// droite ce qu'il a fait seul. Haka éteint, la colonne de gauche garde « Ce
// qui vous attend » : rien ne disparaît avant que la file ne le reprenne.

const prenom = (e) => String(e || "").split("@")[0].split(".")[0].replace(/^\w/, (c) => c.toUpperCase());

function Entete({ titre, n, lien = null }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3 border-b border-bord pb-2.5">
      <p className="m-0 text-[13.5px] text-craie">{titre}{n != null && <span className="text-ardoise"> · {n}</span>}</p>
      {lien && <Link to={lien.to} className="inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline">{lien.libelle}<ArrowRight className="h-3 w-3" /></Link>}
    </div>
  );
}

function Ligne({ to, titre, sous, teinte }) {
  const Corps = to ? Link : "div";
  return (
    <Corps {...(to ? { to } : {})} className="group flex items-baseline gap-2.5 border-t border-trait py-2.5 first:border-t-0">
      <span className={`mt-[6px] h-[7px] w-[7px] flex-none rounded-full ${teinte}`} />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14.5px] leading-[1.45] text-encre group-hover:underline group-hover:decoration-bord-vif group-hover:underline-offset-4">{titre}</p>
        {sous && <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{sous}</p>}
      </div>
    </Corps>
  );
}

function AValiderApercu() {
  const user = useUser();
  const moi = String(user?.email || "").toLowerCase();
  const compte = useCompteHaka();
  const { data, isLoading } = usePropositions("moi");
  const commun = usePropositions("commun");
  const liste = [...(data?.propositions || []), ...(commun.data?.propositions || [])]
    .filter((p, i, t) => t.findIndex((x) => x.id === p.id) === i)
    .sort((a, b) => String(b.cree_le || "").localeCompare(String(a.cree_le || "")));
  const n = (compte.data?.moi || 0) + (compte.data?.commun || 0);
  return (
    <section aria-label="À valider" className="min-w-0">
      <Entete titre="À valider" n={n} lien={n > 5 ? { to: "/AValider", libelle: "Tout voir" } : null} />
      {isLoading ? (
        <p className="m-0 py-3 text-[13.5px] text-brume">Chargement…</p>
      ) : !liste.length ? (
        <p className="m-0 py-3 text-[13.5px] text-brume">Rien n'attend votre clic. Ce que Haka prépare arrive ici.</p>
      ) : (
        <div className="flex flex-col">
          {liste.slice(0, 5).map((p) => (
            <Ligne key={p.id} to={`/AValider?id=${p.id}`} titre={p.titre} teinte={p.pour ? "bg-menthe" : "bg-ambre"}
              sous={[p.pour ? (p.pour === moi ? "Pour vous" : `Pour ${prenom(p.pour)}`) : "Commun", ilYa(p.cree_le)].filter(Boolean).join(" · ")} />
          ))}
        </div>
      )}
      {n > 0 && n <= 5 && <Link to="/AValider" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-menthe hover:underline">Ouvrir À valider<ArrowRight className="h-3 w-3" /></Link>}
    </section>
  );
}

function FaitParHaka() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["haka-fait"], queryFn: () => base44.request("GET", "/api/haka/fait"), refetchInterval: 120_000, retry: false });
  const items = data?.items || [];
  return (
    <section aria-label="Fait par Haka" className="min-w-0">
      <Entete titre="Fait par Haka" />
      {isLoading ? (
        <p className="m-0 py-3 text-[13.5px] text-brume">Chargement…</p>
      ) : isError ? (
        <p className="m-0 py-3 text-[13.5px] text-brume">Impossible de lire ce que Haka a fait.</p>
      ) : !items.length ? (
        <p className="m-0 py-3 text-[13.5px] text-brume">Rien cette semaine. Les fiches triées, les documents classés et les relances préparées s'affichent ici.</p>
      ) : (
        <div className="flex flex-col">
          {items.map((it) => <Ligne key={it.cle} to={it.lien} titre={it.quoi} teinte="bg-bord-vif" sous={[it.detail, ilYa(it.le)].filter(Boolean).join(" · ")} />)}
        </div>
      )}
    </section>
  );
}

export default function ColonnesAccueil({ className = "" }) {
  const actif = !!useCompteHaka().data?.actif;
  return (
    <div className={`grid grid-cols-2 gap-x-12 gap-y-10 max-md:grid-cols-1 ${className}`}>
      {actif ? <AValiderApercu /> : <div className="min-w-0"><CeQuiVousAttend /></div>}
      <FaitParHaka />
    </div>
  );
}
