import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { EnTeteAlx, PILES } from "@/components/alx/alx-commun";

// Ce qui a marché. C'est ici qu'on ajuste les seuils du fichier de règles :
// un signal qui ne convertit jamais n'en est pas un, une rue qui ne répond pas
// ne vaut pas un second passage.

function Tableau({ titre, lignes, vide }) {
  if (!lignes?.length) return (
    <section>
      <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase text-brume">{titre}</p>
      <p className="m-0 text-[12.5px] text-brume">{vide}</p>
    </section>
  );
  return (
    <section>
      <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase text-brume">{titre}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="text-left text-ardoise text-[11px]">
              <th className="py-1.5 pr-4 font-normal"></th>
              <th className="py-1.5 pr-4 font-normal text-right">Approches</th>
              <th className="py-1.5 pr-4 font-normal text-right">Réponses</th>
              <th className="py-1.5 pr-4 font-normal text-right">Oui</th>
              <th className="py-1.5 font-normal text-right">Non</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-t border-trait">
                <td className="py-2 pr-4 text-craie">{l.cle}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-encre">{l.total}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-ardoise">{l.reponses}{l.total ? <span className="text-brume"> · {Math.round((l.reponses / l.total) * 100)} %</span> : null}</td>
                <td className="py-2 pr-4 text-right tabular-nums text-menthe">{l.oui}</td>
                <td className="py-2 text-right tabular-nums text-brume">{l.non}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ALXBilan() {
  const user = useUser();
  const { data } = useQuery({ queryKey: ["alx-bilan"], queryFn: () => base44.request("GET", "/api/alx/bilan") });
  if (!user || user.role !== "admin") return null;
  const c = data?.cibles || {};
  const a = data?.approches || {};

  return (
    <div className="bg-fond min-h-screen text-encre">
      <div className="max-w-[1180px] mx-auto px-4 md:px-8 py-8 md:py-10">
        <EnTeteAlx titre="Bilan" sous="Ce qui a répondu, par rue, par signal, par canal. C'est ici qu'on décide de reculer un seuil ou d'abandonner un tronçon." />

        <div className="flex flex-wrap gap-x-10 gap-y-4 mb-10 pb-8 border-b border-trait">
          {[
            ["Cibles", c.total || 0],
            ...PILES.map((p) => [p.mot, c.par_pile?.[p.cle] || 0, p.teinte]),
            ["Devenues dossier", c.en_dossier || 0, "var(--k-menthe)"],
            ["Approches", a.total || 0],
            ["Réponses", a.reponses || 0],
            ["Oui", a.oui || 0, "var(--k-menthe)"],
          ].map(([mot, n, teinte]) => (
            <div key={mot}>
              <div className="text-[26px] font-light tabular-nums" style={{ color: teinte || "var(--k-encre)" }}>{n}</div>
              <div className="text-[12px] text-ardoise mt-0.5">{mot}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          <Tableau titre="Par canal" lignes={data?.par_canal} vide="Aucune approche encore." />
          <Tableau titre="Par signal" lignes={data?.par_signal} vide="Aucune approche encore." />
          <Tableau titre="Par rue" lignes={data?.par_rue} vide="Aucune approche encore." />
          <Tableau titre="Motifs de refus" lignes={data?.motifs_refus} vide="Aucun refus encore. Ça viendra, et c'est de l'information." />
        </div>
      </div>
    </div>
  );
}
