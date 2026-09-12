import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Loader2 } from "lucide-react";

/**
 * Qui a fait quoi.
 *
 * L'application manipule les données financières de clients et les dossiers
 * de l'équipe, et il n'en restait aucune trace. On ne pouvait ni répondre à
 * « qui a supprimé ce projet ? », ni voir qu'un compte frappait à des portes
 * qui ne le concernent pas.
 *
 * Ce qui est montré : les écritures, les documents lus, les sauvegardes
 * emportées, et tous les refus. Une ligne de refus isolée ne dit rien ; une
 * colonne de refus en dit long, c'est pourquoi elle est comptée à part.
 */
const FENETRES = [
  { jours: 7, label: "7 j" },
  { jours: 30, label: "30 j" },
  { jours: 90, label: "90 j" },
];

const quand = (iso) =>
  new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function JournalAudit() {
  const [jours, setJours] = useState(7);
  const [personne, setPersonne] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", jours, personne],
    queryFn: () =>
      base44.request(
        "GET",
        `/api/monitoring/audit?jours=${jours}${personne ? `&email=${encodeURIComponent(personne)}` : ""}`
      ),
    staleTime: 30000,
  });

  const parPersonne = data?.par_personne || [];
  const entrees = data?.entrees || [];

  return (
    <section className="mt-10 border-t border-trait pt-7">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <div className="text-[11px] tracking-[.16em] uppercase text-ardoise mb-2">Traçabilité</div>
          <h2 className="m-0 text-[17px] font-normal text-encre">Qui a fait quoi</h2>
          <p className="mt-2 mb-0 max-w-[62ch] text-[13px] leading-[1.65] text-ardoise">
            Les écritures, les documents ouverts, les sauvegardes emportées, et tous les refus.
            Les consultations ordinaires ne figurent pas ici : elles sont comptées plus haut.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {FENETRES.map((f) => (
            <button
              key={f.jours}
              onClick={() => setJours(f.jours)}
              className={`px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${
                jours === f.jours
                  ? "border-menthe text-menthe bg-menthe/[0.1]"
                  : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-[13px] text-ardoise py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Lecture du journal…
        </div>
      ) : (
        <>
          {/* Par personne : c'est là que se voit un comportement inhabituel. */}
          <div className="flex flex-wrap gap-2 mb-5">
            {personne && (
              <button
                onClick={() => setPersonne(null)}
                className="px-3 py-2 border border-menthe text-[12px] text-menthe rounded-md"
              >
                {personne} · tout voir
              </button>
            )}
            {!personne &&
              parPersonne.map((p) => (
                <button
                  key={`${p.email}-${p.role}`}
                  onClick={() => p.email && setPersonne(p.email)}
                  className="px-3 py-2 border border-bord rounded-md text-left hover:border-bord-vif transition-colors"
                >
                  <div className="text-[12.5px] text-encre">{p.email || "non connecté"}</div>
                  <div className="text-[11px] text-ardoise mt-0.5">
                    {p.actions} action{p.actions > 1 ? "s" : ""}
                    {p.refus > 0 && (
                      <span className="text-alerte ml-1.5 inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        {p.refus} refus
                      </span>
                    )}
                  </div>
                </button>
              ))}
          </div>

          {entrees.length === 0 ? (
            <p className="m-0 text-[13px] text-brume">Rien sur cette période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead>
                  <tr className="text-left text-ardoise">
                    <th className="py-2 pr-4 font-normal whitespace-nowrap">Quand</th>
                    <th className="py-2 pr-4 font-normal">Qui</th>
                    <th className="py-2 pr-4 font-normal">Quoi</th>
                    <th className="py-2 pr-2 font-normal text-right whitespace-nowrap">Réponse</th>
                  </tr>
                </thead>
                <tbody>
                  {entrees.map((e) => (
                    <tr key={e.id} className="border-t border-trait">
                      <td className="py-2 pr-4 text-brume whitespace-nowrap">{quand(e.le)}</td>
                      <td className="py-2 pr-4 text-craie">{e.email || "non connecté"}</td>
                      <td className="py-2 pr-4 text-ardoise">
                        <span className="text-encre">{e.methode}</span> {e.chemin}
                      </td>
                      <td
                        className={`py-2 pr-2 text-right tabular-nums ${
                          e.statut >= 400 ? "text-alerte" : "text-brume"
                        }`}
                      >
                        {e.statut}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
