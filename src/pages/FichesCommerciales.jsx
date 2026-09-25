import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, Trophy } from "lucide-react";
import { toast } from "@/components/ui/avis";

// Les fiches commerciales : un compteur, pas un écran de travail. Combien de
// fiches on reçoit par semaine, ce qu'elles deviennent (Oui à la préanalyse,
// présentées au client, abouties), et la semaine en cours face au record. Le
// compte a été remis à zéro le 25 septembre 2026. Les chiffres viennent du
// serveur (server/deal/fiches-stats.js).

const nf = new Intl.NumberFormat("fr-FR");
const pctDe = (n, sur) => (sur > 0 ? `${Math.round((n / sur) * 100)} %` : "—");
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "—");
// Le lundi de la semaine d'une date, comme le serveur la compte (UTC).
const lundiDe = (iso) => { const d = new Date(iso); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))).toISOString().slice(0, 10); };
const semaineCourte = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

// Ce qu'on sait mesurer : la fiche reçue, et le Oui ou le Non de la
// préanalyse. La suite (présentée, signée) viendra quand elle sera tracée.
const ETAPES = [
  { cle: "fiches", libelle: "Fiches reçues" },
  { cle: "oui", libelle: "Oui à la préanalyse" },
];
// Au-delà du Oui, une fiche reste un Oui ici.
const PILULE = {
  recue: { mot: "En attente", classe: "border-bord-doux text-craie" },
  non: { mot: "Non", classe: "border-alerte/40 text-alerte" },
  oui: { mot: "Oui", classe: "border-menthe/50 text-menthe" },
  presente: { mot: "Oui", classe: "border-menthe/50 text-menthe" },
  abouti: { mot: "Oui", classe: "border-menthe/50 text-menthe" },
};

function Semaines({ semaines, record }) {
  const max = Math.max(record?.fiches || 0, ...semaines.map((s) => s.fiches), 1);
  const hauteur = 140;
  return (
    <div className="relative mt-4" style={{ height: hauteur + 28 }}>
      {record?.fiches > 0 && (
        <div className="absolute left-0 right-0 border-t border-dashed border-ambre/60" style={{ top: hauteur - (record.fiches / max) * (hauteur - 18) }}>
          <span className="absolute -top-5 right-0 text-[11px] text-ambre">record · {record.fiches}</span>
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-end gap-1.5" style={{ height: hauteur }}>
        {semaines.map((s, k) => (
          <div key={s.semaine} className="flex h-full flex-1 flex-col justify-end" title={`Semaine du ${semaineCourte(s.semaine)} : ${s.fiches} fiche${s.fiches > 1 ? "s" : ""}`}>
            <span className="mb-1 text-center text-[11px] tabular-nums text-craie">{s.fiches || ""}</span>
            <div className={`w-full rounded-t-[4px] transition-[height] duration-500 ${k === semaines.length - 1 ? "bg-menthe" : "bg-menthe/35"}`} style={{ height: `${(s.fiches / max) * (hauteur - 18)}px`, minHeight: s.fiches ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-1.5">
        {semaines.map((s, k) => <span key={s.semaine} className={`flex-1 text-center text-[10.5px] ${k === semaines.length - 1 ? "text-encre" : "text-brume"}`}>{semaineCourte(s.semaine)}</span>)}
      </div>
    </div>
  );
}

/** L'agent d'une fiche, corrigeable d'un clic : un nom, une adresse, ou les deux. */
function Agent({ fiche, onCorriger }) {
  const [edition, setEdition] = useState(null);
  if (edition !== null) {
    const valider = () => { onCorriger(fiche.id, edition.trim()); setEdition(null); };
    return (
      <span className="flex items-center gap-1.5">
        <input autoFocus value={edition} onChange={(e) => setEdition(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") valider(); if (e.key === "Escape") setEdition(null); }}
          placeholder="Laurent Sebban, laurent@pointdevente.fr" className="w-[230px] rounded-md border border-menthe/40 bg-fond px-2 py-1 text-[12.5px] text-encre outline-none placeholder:text-bord-vif" />
        <button type="button" onClick={valider} aria-label="Enregistrer l'agent" className="grid h-6 w-6 place-items-center rounded-full bg-menthe text-sur-menthe"><Check className="h-3 w-3" /></button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setEdition(fiche.agent_email && fiche.agent !== fiche.agent_email ? `${fiche.agent}, ${fiche.agent_email}` : fiche.agent || "")}
      className="group inline-flex items-center gap-1.5 text-left" style={{ background: "transparent" }} title="Corriger l'agent">
      <span className={fiche.agent ? "text-craie" : "text-ambre"}>{fiche.agent || "à renseigner"}</span>
      <Pencil className="h-3 w-3 text-brume opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
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
  const corriger = useMutation({
    mutationFn: ({ id, agent }) => base44.request("POST", `/api/fiches/${encodeURIComponent(id)}/agent`, { body: { agent } }),
    onSuccess: () => { toast.success("Agent corrigé"); queryClient.invalidateQueries({ queryKey: ["fiches-commerciales"] }); },
    onError: (e) => toast.error(e?.message || "Agent non corrigé"),
  });

  // Seules les semaines depuis la remise à zéro : avant, il n'y a rien à compter.
  const semaines = useMemo(() => {
    const debut = data?.depuis ? lundiDe(data.depuis) : null;
    return (data?.semaines || []).filter((s) => !debut || s.semaine >= debut);
  }, [data]);
  const courante = semaines[semaines.length - 1] || { fiches: 0 };
  const record = data?.record || { fiches: 0 };
  const total = useMemo(() => semaines.reduce((t, s) => { for (const e of ETAPES) t[e.cle] = (t[e.cle] || 0) + (s[e.cle] || 0); return t; }, {}), [semaines]);
  const estOui = (f) => ["oui", "presente", "abouti"].includes(f.etape);
  const fiches = (data?.fiches || []).filter((f) => filtre === "tout" || (filtre === "a_preanalyser" ? f.a_preanalyser : filtre === "oui" ? estOui(f) : f.etape === filtre));
  const non = (data?.fiches || []).filter((f) => f.etape === "non").length;
  const attente = (data?.fiches || []).filter((f) => f.etape === "recue").length;

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div>;
  if (isError) return <p className="p-8 text-[14px] text-ardoise">Cette page est réservée à l'équipe.</p>;

  const manque = Math.max(0, record.fiches - courante.fiches + 1);
  const battu = courante.fiches > 0 && courante.fiches >= record.fiches && record.semaine === semaines[semaines.length - 1]?.semaine;

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 py-8 md:px-6">
      <header className="mb-8">
        <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Fiches commerciales</h1>
        <p className="m-0 mt-2 text-[14px] text-craie">Est-ce qu'on progresse, semaine après semaine ? Compté depuis le {data?.depuis ? new Date(data.depuis).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "début"}.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[16px] border border-trait bg-surface p-6">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Cette semaine</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="text-[56px] font-light leading-none text-encre tabular-nums">{nf.format(courante.fiches)}</span>
            <span className="pb-2 text-[14px] text-craie">fiche{courante.fiches > 1 ? "s" : ""} reçue{courante.fiches > 1 ? "s" : ""}</span>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-encre/[0.08]">
            <div className="h-full rounded-full bg-menthe transition-[width] duration-700 ease-out" style={{ width: `${record.fiches ? Math.min(100, (courante.fiches / record.fiches) * 100) : 0}%` }} />
          </div>
          <p className="m-0 mt-3 flex items-center gap-2 text-[13px] text-craie">
            <Trophy className="h-4 w-4 text-ambre" />
            {battu ? "Record battu cette semaine."
              : record.fiches ? <>Record : {record.fiches} fiche{record.fiches > 1 ? "s" : ""}, semaine du {semaineCourte(record.semaine)}. Encore <span className="text-encre">{manque}</span> pour le battre.</>
                : "Pas encore de record : la première fiche le fait."}
          </p>
        </div>

        <div className="rounded-[16px] border border-trait bg-surface p-6">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Depuis la remise à zéro</p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
            {ETAPES.map((e, k) => {
              const n = total[e.cle] || 0;
              return (
                <li key={e.cle}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] text-craie">{e.libelle}</span>
                    <span className="text-[15px] tabular-nums text-encre">{nf.format(n)}</span>
                  </div>
                  {k > 0 && <p className="m-0 mt-0.5 text-right text-[11.5px] tabular-nums text-brume">{pctDe(n, total.fiches)} des fiches reçues</p>}
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-encre/[0.06]"><div className="h-full rounded-full bg-menthe/70 transition-[width] duration-500" style={{ width: `${total.fiches ? (n / total.fiches) * 100 : 0}%` }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="m-0 mt-4 border-t border-trait pt-3 text-[12.5px] text-craie">{nf.format(non)} Non · {nf.format(attente)} en attente de décision</p>
        </div>
      </section>

      <section className="mt-4 rounded-[16px] border border-trait bg-surface p-6">
        <p className="m-0 text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">Fiches reçues par semaine</p>
        <Semaines semaines={semaines} record={record} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="m-0 text-[18px] font-semibold text-encre">Les fiches <span className="text-[13px] font-normal text-brume">{data?.total || 0}</span></h2>
          <div className="flex flex-wrap gap-1.5">
            {[["tout", "Toutes"], ["a_preanalyser", "À préanalyser"], ["recue", "En attente de décision"], ["oui", "Oui"], ["non", "Non"]].map(([v, mot]) => (
              <button key={v} type="button" onClick={() => setFiltre(v)} className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${filtre === v ? "border-menthe bg-menthe text-sur-menthe font-semibold" : "border-bord-doux text-craie hover:text-encre"}`}>{mot}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-[16px] border border-trait">
          <table className="w-full min-w-[680px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[.12em] text-ardoise">
                {["Reçue le", "Agent", "Bien", "Étape"].map((t) => <th key={t} className="border-b border-trait px-4 py-3 font-medium">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {fiches.slice(0, 200).map((f) => {
                const p = PILULE[f.etape] || PILULE.recue;
                return (
                  <tr key={f.id} className="align-top">
                    <td className="border-b border-trait px-4 py-2.5 tabular-nums text-craie">{jourCourt(f.le)}</td>
                    <td className="border-b border-trait px-4 py-2.5"><Agent fiche={f} onCorriger={(id, agent) => corriger.mutate({ id, agent })} /></td>
                    <td className="border-b border-trait px-4 py-2.5">
                      {f.deal_id ? <Link to={`/Analyse?deal_id=${f.deal_id}`} className="text-encre hover:text-menthe">{f.titre}</Link> : <span className="text-encre">{f.titre}</span>}
                      {f.ville && <span className="ml-2 text-[12px] text-brume">{f.ville}</span>}
                    </td>
                    <td className="border-b border-trait px-4 py-2.5"><span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11.5px] ${p.classe}`}>{f.a_preanalyser ? "À préanalyser" : p.mot}</span></td>
                  </tr>
                );
              })}
              {!fiches.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-[13px] text-brume">Aucune fiche depuis la remise à zéro. La prochaine arrivera ici toute seule.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
