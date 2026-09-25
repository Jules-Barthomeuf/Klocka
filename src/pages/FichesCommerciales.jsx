import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, Trophy, Undo2 } from "lucide-react";
import { toast } from "@/components/ui/avis";

// Les fiches commerciales : combien on en reçoit, combien d'appels il faut
// pour en avoir une, et ce qu'elles deviennent jusqu'à la signature. Le
// chiffre qui compte est en haut : la semaine en cours face au record.
// Les chiffres viennent du serveur (server/deal/fiches-stats.js).

const nf = new Intl.NumberFormat("fr-FR");
const pctDe = (n, sur) => (sur > 0 ? `${Math.round((n / sur) * 100)} %` : "—");
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
const semaineCourte = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const nomDe = (a) => String(a || "").replace(/<[^>]*>/, "").replace(/["']/g, "").trim() || "—";

const ETAPES = [
  { cle: "fiches", libelle: "Fiches reçues" },
  { cle: "oui", libelle: "Oui à la préanalyse" },
  { cle: "projet", libelle: "Projets créés" },
  { cle: "presente", libelle: "Présentées au client" },
  { cle: "abouti", libelle: "Abouties" },
];
const PILULE = {
  recue: { mot: "Reçue", classe: "border-bord-doux text-craie" },
  non: { mot: "Non", classe: "border-alerte/40 text-alerte" },
  oui: { mot: "Oui", classe: "border-menthe/50 text-menthe" },
  projet: { mot: "Projet", classe: "border-menthe/50 text-menthe" },
  presente: { mot: "Présentée", classe: "border-menthe bg-menthe/15 text-encre" },
  abouti: { mot: "Aboutie", classe: "border-menthe bg-menthe text-sur-menthe" },
};
const RESULTATS = [
  { cle: "pas_de_reponse", mot: "Pas de réponse" },
  { cle: "a_rappeler", mot: "À rappeler" },
  { cle: "interesse", mot: "Intéressé" },
  { cle: "fiche_promise", mot: "Fiche promise" },
  { cle: "pas_interesse", mot: "Pas intéressé" },
];

function Semaines({ semaines, record }) {
  const max = Math.max(record?.fiches || 0, ...semaines.map((s) => s.fiches), 1);
  const hauteur = 140;
  return (
    <div className="relative mt-4" style={{ height: hauteur + 28 }}>
      {record?.fiches > 0 && (
        <div className="absolute left-0 right-0 border-t border-dashed border-ambre/60" style={{ top: hauteur - (record.fiches / max) * hauteur }}>
          <span className="absolute -top-5 right-0 text-[11px] text-ambre">record · {record.fiches}</span>
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-end gap-1.5" style={{ height: hauteur }}>
        {semaines.map((s, k) => {
          const courante = k === semaines.length - 1;
          return (
            <div key={s.semaine} className="flex h-full flex-1 flex-col justify-end" title={`Semaine du ${semaineCourte(s.semaine)} : ${s.fiches} fiche${s.fiches > 1 ? "s" : ""}, ${s.appels} appel${s.appels > 1 ? "s" : ""}`}>
              <span className="mb-1 text-center text-[11px] tabular-nums text-craie">{s.fiches || ""}</span>
              <div className={`w-full rounded-t-[4px] transition-[height] duration-500 ${courante ? "bg-menthe" : "bg-menthe/35"}`} style={{ height: `${(s.fiches / max) * (hauteur - 18)}px`, minHeight: s.fiches ? 3 : 0 }} />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-1.5">
        {semaines.map((s, k) => <span key={s.semaine} className={`flex-1 text-center text-[10.5px] ${k === semaines.length - 1 ? "text-encre" : "text-brume"}`}>{k % 2 === semaines.length % 2 || k === semaines.length - 1 ? semaineCourte(s.semaine) : ""}</span>)}
      </div>
    </div>
  );
}

function NoterAppel({ onNote, enCours }) {
  const [agent, setAgent] = useState("");
  return (
    <div className="rounded-[16px] border border-trait bg-surface p-5">
      <h2 className="m-0 flex items-center gap-2 text-[15px] font-semibold text-encre"><Phone className="h-4 w-4 text-menthe" /> Noter un appel</h2>
      <p className="m-0 mt-1 text-[12.5px] text-brume">Deux clics après chaque appel : c'est ce qui dit combien d'appels il faut pour une fiche.</p>
      <input
        value={agent}
        onChange={(e) => setAgent(e.target.value)}
        placeholder="L'agent (facultatif) : Rosario Aiello, Cannes"
        className="mt-4 w-full rounded-lg border border-trait bg-fond px-3.5 py-2.5 text-[13.5px] text-encre outline-none placeholder:text-bord-vif focus:border-menthe/60"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {RESULTATS.map((r) => (
          <button key={r.cle} type="button" disabled={enCours} onClick={() => { onNote({ agent, resultat: r.cle }); setAgent(""); }}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors disabled:opacity-40 ${r.cle === "fiche_promise" ? "border-menthe/60 text-encre hover:bg-menthe/15" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}>
            {r.mot}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FichesCommerciales() {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState("tout");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["fiches-commerciales"],
    queryFn: () => base44.request("GET", "/api/fiches?semaines=12"),
    refetchInterval: 60000,
  });
  const recharger = () => queryClient.invalidateQueries({ queryKey: ["fiches-commerciales"] });
  const noter = useMutation({
    mutationFn: (appel) => base44.request("POST", "/api/appels", { body: appel }),
    onSuccess: () => { toast.success("Appel noté"); recharger(); },
    onError: (e) => toast.error(e?.message || "Appel non noté"),
  });
  const annuler = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/appels/${id}`),
    onSuccess: () => { toast.success("Appel retiré"); recharger(); },
  });

  const semaines = data?.semaines || [];
  const courante = semaines[semaines.length - 1] || { fiches: 0, appels: 0 };
  const record = data?.record || { fiches: 0 };
  const periode = useMemo(() => semaines.reduce((t, s) => { for (const k of ["fiches", "oui", "projet", "presente", "abouti", "appels", "appels_fiche"]) t[k] = (t[k] || 0) + s[k]; return t; }, {}), [semaines]);
  const fiches = (data?.fiches || []).filter((f) => filtre === "tout" || (filtre === "a_preanalyser" ? f.a_preanalyser : f.etape === filtre));

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  if (isError) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;

  const manque = Math.max(0, record.fiches - courante.fiches + 1);
  const battu = courante.fiches > 0 && courante.fiches >= record.fiches && record.semaine === semaines[semaines.length - 1]?.semaine;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Fiches commerciales</h1>
        <p className="m-0 mt-2 text-[14px] text-craie">Toutes les fiches reçues, et ce qu'elles deviennent. L'objectif : battre le record chaque semaine.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[16px] border border-trait bg-surface p-6">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Cette semaine</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-[56px] font-light leading-none text-encre tabular-nums">{nf.format(courante.fiches)}</span>
            <span className="pb-2 text-[14px] text-craie">fiche{courante.fiches > 1 ? "s" : ""}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-encre/[0.08]">
            <div className="h-full rounded-full bg-menthe transition-[width] duration-700 ease-out" style={{ width: `${record.fiches ? Math.min(100, (courante.fiches / record.fiches) * 100) : 0}%` }} />
          </div>
          <p className="m-0 mt-3 flex items-center gap-2 text-[13px] text-craie">
            <Trophy className="h-4 w-4 text-ambre" />
            {battu ? "Record battu cette semaine."
              : record.fiches ? <>Record : {record.fiches} fiches, semaine du {semaineCourte(record.semaine)}. Encore <span className="text-encre">{manque}</span> pour le battre.</>
                : "Pas encore de record : la première fiche le fait."}
          </p>
          <p className="m-0 mt-1 text-[12.5px] text-brume">{courante.appels} appel{courante.appels > 1 ? "s" : ""} noté{courante.appels > 1 ? "s" : ""} cette semaine{courante.appels ? `, ${courante.appels_fiche} fiche${courante.appels_fiche > 1 ? "s" : ""} promise${courante.appels_fiche > 1 ? "s" : ""}` : ""}.</p>
        </div>

        <div className="rounded-[16px] border border-trait bg-surface p-6">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Sur 12 semaines</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {ETAPES.map((e, k) => {
              const n = periode[e.cle] || 0;
              const avant = k ? periode[ETAPES[k - 1].cle] || 0 : null;
              return (
                <li key={e.cle}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] text-craie">{e.libelle}</span>
                    <span className="text-[13.5px] tabular-nums text-encre">{nf.format(n)}{k ? <span className="ml-2 text-[12px] text-brume">{pctDe(n, avant)}</span> : null}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-encre/[0.06]"><div className="h-full rounded-full bg-menthe/70" style={{ width: `${periode.fiches ? (n / periode.fiches) * 100 : 0}%` }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-4 border-t border-trait pt-3 text-[12.5px] text-craie">
            {periode.appels
              ? <>{nf.format(periode.appels)} appel{periode.appels > 1 ? "s" : ""} noté{periode.appels > 1 ? "s" : ""}, {periode.appels_fiche} fiche{periode.appels_fiche > 1 ? "s" : ""} promise{periode.appels_fiche > 1 ? "s" : ""}{periode.appels_fiche ? <> : <span className="text-encre">une fiche promise tous les {Math.round(periode.appels / periode.appels_fiche)} appel{Math.round(periode.appels / periode.appels_fiche) > 1 ? "s" : ""}</span></> : ""}.</>
              : "Aucun appel noté encore : notez-les pour savoir combien d'appels il faut pour une fiche."}
          </p>
        </div>
      </section>

      <section className="mt-4 rounded-[16px] border border-trait bg-surface p-6">
        <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Fiches par semaine</p>
        <Semaines semaines={semaines} record={record} />
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <NoterAppel onNote={(a) => noter.mutate(a)} enCours={noter.isPending} />
        <div className="rounded-[16px] border border-trait bg-surface p-5">
          <h2 className="m-0 text-[15px] font-semibold text-encre">Les agents qui apportent</h2>
          <p className="m-0 mt-1 text-[12.5px] text-brume">Sur 12 semaines, classés par fiches qui ont eu un Oui.</p>
          {data?.agents?.length ? (
            <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-trait p-0">
              {data.agents.slice(0, 8).map((a) => (
                <li key={a.email} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 truncate text-encre" title={a.email}>{a.nom}</span>
                  <span className="flex-none tabular-nums text-craie">{a.fiches} fiche{a.fiches > 1 ? "s" : ""} · <span className="text-menthe">{a.oui} Oui</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="m-0 mt-3 text-[13px] text-brume">Pas encore d'agent sur la période.</p>}
        </div>
      </section>

      {data?.appels?.length > 0 && (
        <section className="mt-4 rounded-[16px] border border-trait bg-surface p-5">
          <h2 className="m-0 text-[15px] font-semibold text-encre">Derniers appels</h2>
          <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-trait p-0">
            {data.appels.slice(0, 8).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-craie">{jourCourt(a.le)} · <span className="text-encre">{a.agent || "un agent"}</span> · {RESULTATS.find((r) => r.cle === a.resultat)?.mot} · {String(a.par_nom || a.par || "").split(" ")[0]}</span>
                <button type="button" onClick={() => annuler.mutate(a.id)} title="Retirer cet appel" aria-label="Retirer cet appel" className="flex-none text-brume hover:text-encre" style={{ background: "transparent" }}><Undo2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[18px] font-semibold text-encre">Toutes les fiches <span className="text-[13px] font-normal text-brume">{data?.total || 0}</span></h2>
          <div className="flex flex-wrap gap-1.5">
            {[["tout", "Toutes"], ["a_preanalyser", "À préanalyser"], ["recue", "Reçues"], ["oui", "Oui"], ["non", "Non"], ["projet", "Projet"], ["presente", "Présentées"], ["abouti", "Abouties"]].map(([v, mot]) => (
              <button key={v} type="button" onClick={() => setFiltre(v)} className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${filtre === v ? "border-menthe bg-menthe text-sur-menthe font-semibold" : "border-bord-doux text-craie hover:text-encre"}`}>{mot}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-[16px] border border-trait">
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[.12em] text-ardoise">
                {["Reçue le", "Agent", "Bien", "Boîte", "Étape"].map((t) => <th key={t} className="border-b border-trait px-4 py-3 font-medium">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {fiches.slice(0, 200).map((f) => {
                const p = PILULE[f.etape] || PILULE.recue;
                return (
                  <tr key={f.id} className="align-top">
                    <td className="border-b border-trait px-4 py-2.5 tabular-nums text-craie">{jourCourt(f.le)}</td>
                    <td className="border-b border-trait px-4 py-2.5 text-craie">{nomDe(f.agent)}</td>
                    <td className="border-b border-trait px-4 py-2.5">
                      {f.deal_id ? <Link to={`/Analyse?deal_id=${f.deal_id}`} className="text-encre hover:text-menthe">{f.titre}</Link> : <span className="text-encre">{f.titre}</span>}
                      {f.ville && <span className="ml-2 text-[12px] text-brume">{f.ville}</span>}
                    </td>
                    <td className="border-b border-trait px-4 py-2.5 text-[12px] text-brume">{f.boite ? f.boite.split("@")[0] : "—"}</td>
                    <td className="border-b border-trait px-4 py-2.5">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11.5px] ${p.classe}`}>{f.a_preanalyser ? "À préanalyser" : p.mot}</span>
                    </td>
                  </tr>
                );
              })}
              {!fiches.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-[13px] text-brume">Aucune fiche ici.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
