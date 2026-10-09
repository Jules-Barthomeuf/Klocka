import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le Suivi de la prospection (9 oct. 2026), deux cases côte à côte :
// - la qualité d'AK : la part des appels validés sans aucune correction
//   (issue changée, champ corrigé, date ou mail retouché), semaine par
//   semaine ; si elle baisse, quelque chose s'est dégradé ;
// - les règles contrôlées chaque nuit : le dernier rapport (celui qui part par
//   mail vers 7 h), et de quoi le relancer tout de suite.

const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const semaineCourte = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

function QualiteAK() {
  const { data, isLoading } = useQuery({ queryKey: ["monitoring-qualite-ak"], queryFn: () => base44.request("GET", "/api/monitoring/qualite-ak?semaines=8") });
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const c = data?.courante;
  const p = data?.precedente;
  const ecart = c?.taux != null && p?.taux != null ? c.taux - p.taux : null;
  const corr = data?.corrections || {};
  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="text-[34px] font-light tabular-nums text-encre">{c?.taux != null ? `${c.taux} %` : "—"}</span>
        {ecart != null && ecart !== 0 && <span className={`text-[13px] tabular-nums ${ecart < 0 ? "text-ambre" : "text-menthe"}`}>{ecart > 0 ? "+" : ""}{ecart} pts sur la semaine d'avant</span>}
      </div>
      <p className="m-0 mt-1 text-[13px] text-ardoise">
        {c?.appels ? `${c.sans_correction} appel${c.sans_correction > 1 ? "s" : ""} sur ${c.appels} validé${c.appels > 1 ? "s" : ""} sans correction cette semaine.` : "Aucun appel proposé par AK et validé cette semaine. La mesure a commencé le 9 octobre 2026."}
      </p>
      <div className="mt-4 flex flex-col gap-1.5">
        {(data?.semaines || []).map((s) => (
          <div key={s.semaine} className="grid grid-cols-[56px_minmax(0,1fr)_64px] items-center gap-3 text-[12.5px]">
            <span className="text-brume">{semaineCourte(s.semaine)}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-encre/[0.06]">{s.taux != null && <span className="block h-full rounded-full bg-menthe" style={{ width: `${Math.max(2, s.taux)}%` }} />}</span>
            <span className="text-right tabular-nums text-craie">{s.taux != null ? `${s.taux} % · ${s.appels}` : "—"}</span>
          </div>
        ))}
      </div>
      {data?.appels > 0 && (
        <p className="m-0 mt-4 text-[12.5px] leading-[1.6] text-ardoise">
          Corrections sur 8 semaines : issue changée {corr.issue} · champ corrigé {corr.champs} · date retouchée {corr.date} · mail retouché {corr.mail}
        </p>
      )}
    </>
  );
}

function Regles() {
  const queryClient = useQueryClient();
  const [ouverte, setOuverte] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["monitoring-regles"], queryFn: () => base44.request("GET", "/api/monitoring/regles") });
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", "/api/monitoring/regles", { body: { envoyer: true } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["monitoring-regles"] });
      const e = r.envoi;
      toast.success(r.conforme ? "Tout est conforme" : `${r.ecarts} règle${r.ecarts > 1 ? "s" : ""} non conforme${r.ecarts > 1 ? "s" : ""}`, { description: e?.ok ? (e.simule ? "Mail simulé : aucune adresse de test ici." : e.redirige ? `Rapport envoyé à ${e.redirige}` : "Rapport envoyé par mail") : `Le mail n'est pas parti : ${e?.error || "erreur"}` });
    },
    onError: (e) => toast.error(e?.message || "Contrôle impossible"),
  });
  const rap = data?.rapport;
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className={`text-[20px] ${!rap ? "text-ardoise" : rap.conforme ? "text-encre" : "text-ambre"}`}>{!rap ? "Pas encore contrôlé" : rap.conforme ? "Tout est conforme" : `${rap.ecarts} règle${rap.ecarts > 1 ? "s" : ""} non conforme${rap.ecarts > 1 ? "s" : ""}`}</span>
        {rap && <span className="text-[12.5px] text-brume">{new Date(rap.le).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {rap && (
        <div className="mt-3 flex flex-col">
          {rap.regles.map((x) => (
            <div key={x.cle} className="border-t border-trait py-2">
              <button type="button" onClick={() => setOuverte(ouverte === x.cle ? null : x.cle)} disabled={x.ok || !!x.non_verifie} className="flex w-full items-center gap-2.5 p-0 text-left text-[13.5px] disabled:cursor-default" style={{ background: "transparent" }}>
                {x.non_verifie ? <span className="w-4 text-center text-brume">·</span> : x.ok ? <Check className="h-4 w-4 flex-none text-menthe" /> : <X className="h-4 w-4 flex-none text-ambre" />}
                <span className={`min-w-0 flex-1 ${x.ok ? "text-craie" : x.non_verifie ? "text-brume" : "text-encre"}`}>{x.titre}</span>
                <span className="flex-none text-[12.5px] text-ardoise">{x.non_verifie ? "non vérifiée" : x.ok ? "" : `${x.n} écart${x.n > 1 ? "s" : ""}`}</span>
                {!x.ok && !x.non_verifie && <ChevronDown className={`h-3.5 w-3.5 flex-none text-brume transition-transform ${ouverte === x.cle ? "rotate-180" : ""}`} />}
              </button>
              {ouverte === x.cle && (
                <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 pl-6">
                  {x.details.map((d) => <li key={d} className="text-[12.5px] leading-[1.5] text-ardoise">{d}</li>)}
                  {x.n > x.details.length && <li className="text-[12.5px] text-brume">et {x.n - x.details.length} autre{x.n - x.details.length > 1 ? "s" : ""}</li>}
                </ul>
              )}
              {x.non_verifie && <p className="m-0 mt-1 pl-6 text-[12px] text-brume">{x.non_verifie}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12.5px] text-brume">Contrôlé chaque nuit, rapport par mail vers 7 h.</span>
        <button type="button" onClick={() => lancer.mutate()} disabled={lancer.isPending} className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {lancer.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Contrôler maintenant
        </button>
      </div>
    </>
  );
}

export default function QualiteEtRegles() {
  return (
    <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-md border border-trait p-4">
        <h2 className={titreCase}>Qualité d'AK · appels validés sans correction</h2>
        <QualiteAK />
      </div>
      <div className="rounded-md border border-trait p-4">
        <h2 className={titreCase}>Les règles de la nuit</h2>
        <Regles />
      </div>
    </div>
  );
}
