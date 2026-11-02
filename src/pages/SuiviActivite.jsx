import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { base44 } from "@/api/base44Client";
import { Bulle, useCouleurs } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";
import { montant } from "../../server/montants.js";

// Le tableau de bord (2 nov. 2026, Jules, sur sa seconde maquette « Vos statistiques », reprise telle quelle, à la
// police de l'application près) : la période en haut (semaine, mois, année) ; quatre indicateurs comparés à la même
// période un an plus tôt, chacun avec sa courbe ; la semaine jour par jour contre la précédente ; l'entonnoir de la
// prospection à la vente. Le mandataire voit ses chiffres ; l'équipe voit tout, puis chaque mandataire. Pas
// d'objectif pour l'instant. Le calcul : server/suivi-activite.js.

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];
const nb = (n) => (n ?? 0).toLocaleString("fr-FR");
const signe = (d) => (d > 0 ? "+" : d < 0 ? "−" : "");
const dateLongue = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const carte = "rounded-[16px] border border-trait bg-surface";
const titreCarte = "m-0 text-[15px] font-medium text-encre";

/** Un montant coupé en chiffre et unité, pour écrire l'unité en petit : 126 000 → ["126", "k€"]. */
function enDeux(v) {
  const t = montant(v);
  if (!t) return ["0", "€"];
  const i = t.lastIndexOf(" ");
  return [t.slice(0, i), t.slice(i + 1)];
}

/** La valeur d'un indicateur et son écart à l'an passé, dits comme sur la maquette : +18 %, +4, +5 pts, −0,6. */
function lire(x) {
  const v = x.valeur;
  const a = x.avant;
  if (x.unite === "euros") return { valeur: enDeux(v), ecart: a ? `${signe(v - a)}${Math.abs(Math.round(((v - a) / a) * 100))} %` : null };
  if (x.unite === "pct") return { valeur: v == null ? ["—", ""] : [String(v), "%"], ecart: v != null && a != null ? `${signe(v - a)}${Math.abs(v - a)} pts` : null };
  if (x.unite === "mois") {
    const d = v != null && a != null ? Math.round((v - a) * 10) / 10 : null;
    return { valeur: v == null ? ["—", ""] : [v.toLocaleString("fr-FR"), "mois"], ecart: d == null ? null : `${signe(d)}${Math.abs(d).toLocaleString("fr-FR")}` };
  }
  return { valeur: [nb(v), ""], ecart: `${signe(v - (a || 0))}${Math.abs(v - (a || 0))}` };
}

function Indicateur({ x, etendue, anneeAvant, c }) {
  const l = lire(x);
  const courbe = (x.courbe || []).map((v, i) => ({ i, v }));
  return (
    <div className={`${carte} flex flex-col px-5 pb-4 pt-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 text-[13px] text-craie">{x.libelle}</p>
        {l.ecart && <span className="shrink-0 rounded-full bg-menthe/15 px-2 py-0.5 text-[11px] tabular-nums text-encre">{l.ecart}</span>}
      </div>
      <p className="m-0 mt-2 flex items-baseline gap-1.5 text-encre">
        <span className="text-[34px] font-light tabular-nums tracking-[-0.02em]">{l.valeur[0]}</span>
        {l.valeur[1] && <span className="text-[13.5px] text-ardoise">{l.valeur[1]}</span>}
      </p>
      <div className="mt-2 h-[44px]">
        {courbe.length > 1 && (
          <ResponsiveContainer>
            <LineChart data={courbe} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line dataKey="v" type="linear" stroke={c.menthe} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="m-0 mt-2 text-[11px] text-brume">{etendue} · vs {anneeAvant}</p>
    </div>
  );
}

/** Un geste de la semaine, jour par jour : la semaine en trait plein et ses valeurs, la précédente en pointillé. */
function Jour({ s, couleur, c }) {
  const data = s.jours.map((j, i) => ({ ...j, nom: JOURS[i] }));
  const d = s.n - s.avant;
  return (
    <div className="rounded-[12px] border border-trait p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13px] text-craie"><span className="inline-block h-2 w-2 rounded-full" style={{ background: couleur }} />{s.libelle}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[24px] font-light tabular-nums text-encre">{nb(s.n)}</span>
          <span className="text-[12px] tabular-nums text-ardoise">{d ? `${signe(d)}${Math.abs(d)}` : "="}</span>
        </span>
      </div>
      <div className="mt-2 h-[130px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 18, right: 14, left: 14, bottom: 0 }}>
            <YAxis hide domain={[0, "dataMax"]} />
            <XAxis dataKey="nom" tickLine={false} axisLine={{ stroke: c.trait }} tick={{ fill: c.ardoise, fontSize: 11 }} interval={0} tickMargin={8} />
            <Tooltip cursor={{ stroke: c.trait }} content={({ active, payload }) => (active && payload?.length ? (
              <Bulle titre={payload[0].payload.nom} lignes={[
                payload[0].payload.n != null && { nom: "Cette semaine", valeur: nb(payload[0].payload.n), couleur },
                { nom: "Semaine précédente", valeur: nb(payload[0].payload.avant), couleur: c.ardoise },
              ]} />
            ) : null)} />
            <Line dataKey="avant" type="linear" stroke={c.ardoise} strokeWidth={1.25} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            <Line dataKey="n" type="linear" stroke={couleur} strokeWidth={1.75} dot={{ r: 3.5, fill: couleur, stroke: couleur }} activeDot={{ r: 4.5 }} isAnimationActive={false}>
              <LabelList dataKey="n" position="top" offset={9} style={{ fill: c.craie, fontSize: 11 }} formatter={(v) => (v == null ? "" : v)} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="m-0 mt-2 text-[11px] text-brume">Semaine précédente : {nb(s.avant)}</p>
    </div>
  );
}

function CetteSemaine({ lignes, c }) {
  const teinte = { reperes: c.menthe, appels: c.menthe, rdv: c["lu-ia"] };
  return (
    <section className={`${carte} p-5`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={titreCarte}>Cette semaine</h2>
        <div className="flex items-center gap-4 text-[11px] text-craie">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-px w-3.5 bg-encre" />Cette semaine</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3.5 border-t border-dashed border-ardoise" />Semaine précédente</span>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {lignes.map((s) => <Jour key={s.cle} s={s} couleur={teinte[s.cle] || c.menthe} c={c} />)}
      </div>
    </section>
  );
}

/** De la prospection à la vente : une barre centrée par étape, sa largeur en racine du nombre (les petites étapes se
 *  lisent encore), le nombre dedans, la part de l'étape précédente au bout. */
const TEINTES = ["bg-menthe/25", "bg-menthe/40", "bg-menthe/60 [[data-theme=clair]_&]:text-sur-menthe", "bg-menthe/85 [[data-theme=clair]_&]:text-sur-menthe"];

function Entonnoir({ etages }) {
  const max = Math.max(1, ...etages.map((e) => e.n));
  return (
    <section className={`${carte} p-5`}>
      <h2 className={`${titreCarte} mb-4`}>De la prospection à la vente</h2>
      <div className="flex flex-col gap-2.5">
        {etages.map((e, i) => {
          const derniere = i === etages.length - 1;
          const teinte = derniere ? "bg-lu-ia text-fond [[data-theme=clair]_&]:text-encre" : `${TEINTES[Math.min(i, TEINTES.length - 1)]} text-encre`;
          return (
            <div key={e.cle} className="grid grid-cols-[110px_minmax(0,1fr)_190px] items-center gap-4 max-md:grid-cols-[84px_minmax(0,1fr)_44px] max-md:gap-2">
              <span className="text-right text-[13px] text-craie">{e.libelle}</span>
              <span className="flex justify-center">
                <span className={`flex h-8 items-center justify-center rounded-[8px] text-[13px] font-medium tabular-nums ${e.n ? teinte : "text-brume"}`} style={{ width: `${e.n ? Math.max(10, Math.sqrt(e.n / max) * 100) : 10}%` }}>
                  {nb(e.n)}
                </span>
              </span>
              <span className="text-[12px] tabular-nums text-brume">
                {e.taux == null ? "" : <>{e.taux} %<span className="max-md:hidden"> de l'étape précédente</span></>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** L'équipe : chaque mandataire, ses biens à chaque étape, ses mandats et ses honoraires de la période. */
function ParMandataire({ mandataires, etapes, c }) {
  const max = Math.max(1, ...mandataires.map((m) => m.biens));
  const teintes = etapes.map((_, i) => c.series[i % c.series.length]);
  return (
    <section className={`${carte} p-5`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={titreCarte}>Par mandataire</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-craie">{etapes.map((e, i) => <span key={e.id} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: teintes[i] }} />{e.label}</span>)}</div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_80px_80px_96px] gap-3 pb-1.5 text-[11px] uppercase tracking-[.12em] text-brume max-md:hidden">
        <span>Mandataire</span><span>Biens</span><span className="text-right">Prospects</span><span className="text-right">Mandats</span><span className="text-right">Honoraires</span>
      </div>
      {mandataires.map((m) => (
        <div key={m.email || "sans"} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_80px_80px_96px] items-center gap-3 border-t border-trait py-2 text-[12.5px] max-md:grid-cols-3 max-md:gap-y-1.5">
          <span className="truncate text-encre max-md:col-span-3">{m.nom}</span>
          <span className="flex items-center gap-2 max-md:col-span-3" title={etapes.map((e, i) => `${e.label} : ${m.etapes[i]}`).join(" · ") + (m.vendus ? ` · Vendus : ${m.vendus}` : "")}>
            <span className="flex h-2.5 overflow-hidden rounded-full" style={{ width: `${Math.max(4, (m.biens / max) * 100)}%`, background: c.trait }}>
              {m.etapes.map((n, i) => (n ? <span key={i} className="h-full" style={{ width: `${(n / Math.max(1, m.biens)) * 100}%`, background: teintes[i] }} /> : null))}
              {m.vendus ? <span className="h-full" style={{ width: `${(m.vendus / m.biens) * 100}%`, background: c.encre }} /> : null}
            </span>
            <span className="whitespace-nowrap tabular-nums text-ardoise">{m.biens}</span>
          </span>
          <span className="text-right tabular-nums text-craie max-md:text-left"><span className="text-brume md:hidden">Prospects </span>{nb(m.prospects)}</span>
          <span className="text-right tabular-nums text-craie max-md:text-left"><span className="text-brume md:hidden">Mandats </span>{nb(m.mandats)}</span>
          <span className="text-right tabular-nums text-encre">{montant(m.honoraires) || "—"}</span>
        </div>
      ))}
    </section>
  );
}

export default function SuiviActivite({ pourMandataire = false }) {
  const [periode, setPeriode] = useState("annee");
  const c = useCouleurs();
  const { data, isLoading, error } = useQuery({
    queryKey: [pourMandataire ? "mandataire-tableau-de-bord" : "monitoring-activite", periode],
    // Le mandataire voit le même tableau, sur ses seuls biens (2 nov. 2026).
    queryFn: () => base44.request("GET", `${pourMandataire ? "/api/mandataire/tableau-de-bord" : "/api/monitoring/activite"}?periode=${periode}`),
    placeholderData: (prev) => prev,
  });

  if (error) return <div className="p-8 text-[13.5px] text-alerte">{error.message || "Accès refusé."}</div>;
  const periodes = [["semaine", "Semaine"], ["mois", "Mois"], ["annee", "Année"]];

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">{pourMandataire ? "Vos statistiques" : "Tableau de bord"}</h1>
            {data && <p className="m-0 mt-1.5 text-[12.5px] text-ardoise">{pourMandataire ? "Vos biens" : "L'équipe"} · au {dateLongue(data.au)}</p>}
          </div>
          <div className="flex gap-1 rounded-full border border-trait p-1">
            {periodes.map(([k, mot]) => (
              <button key={k} type="button" onClick={() => setPeriode(k)} aria-pressed={periode === k}
                className={`rounded-full px-3.5 py-1 text-[12.5px] transition-colors ${periode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={periode === k ? undefined : { background: "transparent" }}>
                {mot}
              </button>
            ))}
          </div>
        </div>

        {isLoading || !data ? <Chargement taille="grand" /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {data.indicateurs.map((x) => <Indicateur key={x.cle} x={x} etendue={data.etendue} anneeAvant={data.annee_avant} c={c} />)}
            </div>
            <CetteSemaine lignes={data.cette_semaine} c={c} />
            <Entonnoir etages={data.entonnoir} />
            {data.mandataires && <ParMandataire mandataires={data.mandataires} etapes={data.etapes} c={c} />}
          </div>
        )}
      </div>
    </div>
  );
}
