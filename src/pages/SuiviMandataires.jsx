import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import { ENTREES_MANDATAIRE } from "@/lib/menu";

// Le Suivi des mandataires (9 oct. 2026) : ce que chaque mandataire K Partners
// fait de son espace. Qui se connecte et quand, quelles pages, puis le travail
// (propriétaires appelés, prospections, avis de valeur, mandats, dossiers,
// ventes) et ce que l'IA a coûté pour lui. Mêmes motifs que le Suivi des appels.

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"]];
const VUES = [["ensemble", "Vue d'ensemble"], ["mandataires", "Par mandataire"], ["journal", "Journal"]];
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const filtre = (actif) => `px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${actif ? "border-menthe text-menthe bg-menthe/[0.1]" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`;
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const euros = (n) => `${(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const LIBELLES_PAGES = Object.fromEntries(ENTREES_MANDATAIRE.map((e) => [e.cle, e.label]));
const pageLisible = (p) => LIBELLES_PAGES[p] || p;

function depuisQuand(iso) {
  if (!iso) return "Jamais connecté";
  const j = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return j <= 0 ? "Aujourd'hui" : j === 1 ? "Hier" : `Il y a ${j} jours`;
}

function Chiffre({ valeur, libelle, note = null }) {
  return (
    <div className="rounded-md border border-trait bg-surface px-4 py-3.5">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{libelle}</p>
      <p className="m-0 mt-2 text-[24px] font-light tabular-nums text-encre">{valeur}</p>
      {note && <p className="m-0 mt-0.5 text-[12px] text-brume">{note}</p>}
    </div>
  );
}

// Les colonnes du tableau par mandataire : [clé, titre, mise en forme].
const COLONNES = [
  ["derniere_visite", "Dernière visite", depuisQuand],
  ["jours_actifs", "Jours actifs", (v) => v],
  ["visites", "Pages ouvertes", (v) => v],
  ["proprietaires", "Propriétaires", (v) => v],
  ["contacts", "Appels et suites", (v) => v],
  ["rdv", "RDV en cours", (v) => v],
  ["prospections", "Prospections", (v) => v],
  ["trouvailles", "Trouvailles", (v) => v],
  ["avis_commences", "Avis commencés", (v) => v],
  ["avis_envoyes", "Avis envoyés", (v) => v],
  ["mandats_signes", "Mandats signés", (v) => v],
  ["dossiers_ouverts", "Dossiers ouverts", (v) => v],
  ["dossiers_go", "Dossiers en GO", (v) => v],
  ["actes", "Actes", (v) => v],
  ["cout_ia_eur", "Coût IA", euros],
];

function CourbeVisites({ parJour }) {
  const [survol, setSurvol] = useState(null);
  const haut = Math.max(4, ...parJour.map((j) => j.visites));
  const jour = survol ? parJour.find((j) => j.jour === survol) : null;
  const pas = parJour.length > 31 ? 14 : 7;
  const aujourdhui = parJour.at(-1)?.jour;
  return (
    <div className="flex flex-col rounded-md border border-trait p-4">
      <h2 className={titreCase}>Pages ouvertes par jour</h2>
      <p className="m-0 mb-4 min-h-[19px] text-[13px] text-craie">
        {jour ? <><span className="text-encre">{jourCourt(jour.jour)}</span> · {jour.visites} page{jour.visites > 1 ? "s" : ""}</> : <span className="text-brume">Survolez un jour pour le détail.</span>}
      </p>
      <div className="relative h-[180px]" onMouseLeave={() => setSurvol(null)}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-bord" />
        <div className="absolute inset-0 flex gap-[3px]">
          {parJour.map((j) => (
            <div key={j.jour} onMouseEnter={() => setSurvol(j.jour)} className={`flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[3px] ${survol === j.jour ? "bg-encre/[0.06]" : ""}`}>
              {j.visites > 0
                ? <div className="mx-auto w-full max-w-[38px] rounded-t-[3px] bg-menthe" style={{ height: `${(j.visites / haut) * 100}%` }} />
                : <div className="mx-auto h-[2px] w-full max-w-[38px] rounded-full bg-encre/[0.08]" />}
            </div>
          ))}
        </div>
      </div>
      <div className="relative mt-2 flex h-4 gap-[3px] text-[11px] text-brume">
        {parJour.map((j, i) => (
          <span key={j.jour} className="relative min-w-0 flex-1">
            {(j.jour === aujourdhui || (parJour.length - 1 - i) % pas === 0) && (
              <span className={`absolute whitespace-nowrap ${j.jour === aujourdhui ? "right-0 text-menthe" : "left-1/2 -translate-x-1/2"}`}>{j.jour === aujourdhui ? "Aujourd'hui" : jourCourt(j.jour)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SuiviMandataires() {
  const [jours, setJours] = useState(30);
  const [vue, setVue] = useState("ensemble");
  const [qui, setQui] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["suivi-mandataires", jours],
    queryFn: () => base44.request("GET", `/api/monitoring/mandataires?jours=${jours}`),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  const e = data?.equipe;
  const maxPage = Math.max(1, ...(data?.pages || []).map((p) => p.n));
  const journal = (data?.journal || []).filter((x) => !qui || x.email === qui);
  const voirJournalDe = (email) => { setQui(email); setVue("journal"); };

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1300px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <OngletsSuivi className="mb-3.5" />
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Mandataires</h1>
          </div>
          <div className="flex flex-wrap gap-1.5 md:pr-14">{PERIODES.map(([j, mot]) => <button key={j} type="button" onClick={() => setJours(j)} className={filtre(jours === j)}>{mot}</button>)}</div>
        </div>

        <div className="mb-6 flex gap-5 border-b border-trait">
          {VUES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setVue(k)} className={`-mb-px border-b-[1.5px] pb-2 text-[13.5px] transition-colors ${vue === k ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
          ))}
        </div>

        {isLoading || !data ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div> : (
          <>
            {vue === "ensemble" && <div className="k-monte">
              <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <Chiffre valeur={`${e.actifs} / ${e.mandataires}`} libelle="Actifs" note="se sont connectés sur la période" />
                <Chiffre valeur={e.contacts} libelle="Appels et suites" note={`${e.rdv} RDV en cours`} />
                <Chiffre valeur={e.prospections} libelle="Prospections" note="lancées" />
                <Chiffre valeur={e.avis_envoyes} libelle="Avis envoyés" />
                <Chiffre valeur={e.mandats_signes} libelle="Mandats signés" note={`${e.dossiers_go} dossier${e.dossiers_go > 1 ? "s" : ""} en GO · ${e.actes} acte${e.actes > 1 ? "s" : ""}`} />
                <Chiffre valeur={euros(e.cout_ia_eur)} libelle="Coût IA" note="pour leurs demandes" />
              </div>
              <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <CourbeVisites parJour={data.par_jour} />
                <div className="rounded-md border border-trait p-4">
                  <h2 className={titreCase}>Pages les plus ouvertes</h2>
                  {data.pages.length ? (
                    <div className="flex flex-col gap-1.5">
                      {data.pages.slice(0, 10).map((p) => (
                        <div key={p.page} className="grid grid-cols-[110px_minmax(0,1fr)_32px] items-center gap-2 text-[12.5px]">
                          <span className="truncate text-craie">{pageLisible(p.page)}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-encre/[0.06]"><span className="block h-full rounded-full bg-menthe" style={{ width: `${(p.n / maxPage) * 100}%` }} /></span>
                          <span className="text-right tabular-nums text-craie">{p.n}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="m-0 text-[12.5px] text-brume">Aucune page ouverte sur la période.</p>}
                </div>
              </div>
            </div>}

            {vue === "mandataires" && <div className="mb-8 rounded-md border border-trait p-4 k-monte">
              <h2 className={titreCase}>Par mandataire</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1400px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-bord">
                      <th className="sticky left-0 bg-fond py-2 pr-3 text-left text-[11px] font-normal uppercase tracking-[.14em] text-brume">Mandataire</th>
                      {COLONNES.map(([k, t]) => <th key={k} className="px-2 py-2 text-right text-[11px] font-normal uppercase tracking-[.1em] text-brume">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.mandataires.map((m) => (
                      <tr key={m.email} onClick={() => voirJournalDe(m.email)} className="cursor-pointer border-b border-trait hover:bg-relief/30" title="Voir ce que cette personne a fait">
                        <td className="sticky left-0 bg-fond py-2.5 pr-3">
                          <span className="block text-encre">{m.nom}</span>
                          <span className="block text-[12px] text-brume">{m.pages.map((p) => pageLisible(p.page)).join(" · ") || m.email}</span>
                        </td>
                        {COLONNES.map(([k, , f]) => <td key={k} className={`px-2 py-2.5 text-right tabular-nums ${m.visites ? "text-craie" : "text-brume"}`}>{f(m[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.mandataires.length && <p className="m-0 py-8 text-center text-[13px] text-brume">Aucun compte mandataire.</p>}
              <p className="m-0 mt-3 text-[12px] text-brume">Tout se compte sur la période, sauf « Propriétaires » (toutes ses fiches) et « RDV en cours » (l'état des fiches aujourd'hui). « Appels et suites » : appels sans réponse et changements de statut notés sur ses fiches. Un clic sur une personne ouvre son journal.</p>
            </div>}

            {vue === "journal" && <div className="rounded-md border border-trait p-4 k-monte">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={`${titreCase} mb-0`}>Journal</h2>
                <div className="flex flex-wrap gap-1.5">
                  {[["", "Tout le monde"], ...data.mandataires.map((m) => [m.email, m.nom])].map(([em, nom]) => <button key={em || "tous"} type="button" onClick={() => setQui(em)} className={filtre(qui === em)}>{nom}</button>)}
                </div>
                <span className="text-[12px] text-brume">{journal.length} événement{journal.length > 1 ? "s" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[120px_130px_120px_minmax(0,1fr)] gap-3 border-b border-bord py-2 text-[11px] uppercase tracking-[.1em] text-brume">
                    <span>Quand</span><span>Qui</span><span>Quoi</span><span>Détail</span>
                  </div>
                  {journal.map((x, i) => (
                    <div key={`${x.le}-${i}`} className="grid grid-cols-[120px_130px_120px_minmax(0,1fr)] gap-3 border-b border-trait py-2.5 text-[13px]">
                      <span className="tabular-nums text-ardoise">{quand(x.le)}</span>
                      <span className="truncate text-craie">{x.nom}</span>
                      <span className="text-ardoise">{x.quoi}</span>
                      <span className="min-w-0 text-encre">{x.detail}</span>
                    </div>
                  ))}
                  {!journal.length && <p className="m-0 py-8 text-center text-[13px] text-brume">Rien sur la période.</p>}
                </div>
              </div>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
