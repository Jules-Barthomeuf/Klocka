import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Download, PhoneCall } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Bulle, CarteSemaine, useCouleurs } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";
import { createPageUrl } from "@/utils";
import { montant } from "../../server/montants.js";

// Le tableau de bord (2 nov. 2026, Jules, sur sa maquette « Vos statistiques ») : quatre indicateurs comparés à l'an
// passé, les honoraires encaissés mois par mois (le mois en cours en blanc), l'entonnoir de l'appel à la vente, la
// semaine en cours comparée à la précédente (pas d'objectif pour l'instant, ni annuel ni de la semaine), les dossiers
// en cours avec la barre des six étapes de Biens, et quand on prospecte. La période et l'export en haut. Le mandataire
// voit ses chiffres ; l'équipe voit tout, puis chaque mandataire. Le calcul : server/suivi-activite.js.

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];
const nb = (n) => (n ?? 0).toLocaleString("fr-FR");
const dateLongue = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const jourMois = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const carte = "rounded-[16px] border border-trait bg-surface";
const titreCarte = "m-0 text-[15px] font-medium text-encre";

/** Un montant coupé en chiffre et unité, pour écrire l'unité en petit : 126 000 → ["126", "k€"]. */
function enDeux(v) {
  const t = montant(v);
  if (!t) return ["0", "€"];
  const i = t.lastIndexOf(" ");
  return [t.slice(0, i), t.slice(i + 1)];
}

/** La valeur d'un indicateur et son écart à l'an passé, dits comme sur la maquette. */
function lire(x) {
  const v = x.valeur;
  const a = x.avant;
  if (x.unite === "euros") return { valeur: enDeux(v), ecart: a ? `${v >= a ? "+" : "−"}${Math.abs(Math.round(((v - a) / a) * 100))} %` : null, mieux: v >= a };
  if (x.unite === "pct") return { valeur: v == null ? ["—", ""] : [String(v), "%"], ecart: v != null && a != null ? `${v >= a ? "+" : "−"}${Math.abs(v - a)} pts` : null, mieux: (v ?? 0) >= (a ?? 0) };
  if (x.unite === "mois") {
    const d = v != null && a != null ? Math.round((v - a) * 10) / 10 : null;
    return { valeur: v == null ? ["—", ""] : [v.toLocaleString("fr-FR"), "mois"], ecart: d == null ? null : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toLocaleString("fr-FR")}`, mieux: d == null || d <= 0 };
  }
  return { valeur: [nb(v), ""], ecart: `${v >= (a || 0) ? "+" : "−"}${Math.abs(v - (a || 0))}`, mieux: v >= (a || 0) };
}

function Indicateur({ x, anneeAvant }) {
  const l = lire(x);
  return (
    <div className={`${carte} px-5 pb-4 pt-4`}>
      <p className="m-0 text-[13px] text-ardoise">{x.libelle}</p>
      <p className="m-0 mt-2 flex items-baseline gap-1.5 text-encre">
        <span className="text-[34px] font-light tabular-nums tracking-[-0.02em]">{l.valeur[0]}</span>
        {l.valeur[1] && <span className="text-[14px] text-ardoise">{l.valeur[1]}</span>}
      </p>
      <p className="m-0 mt-2 flex items-center gap-2 text-[12px] text-brume">
        {l.ecart ? <span className={`rounded-full px-2 py-0.5 tabular-nums ${l.mieux ? "bg-menthe/15 text-menthe" : "bg-alerte/15 text-alerte"}`}>{l.ecart}</span> : <span>—</span>}
        <span>vs {anneeAvant}</span>
      </p>
    </div>
  );
}

/** Les honoraires encaissés par mois, en k€ ; le mois en cours en blanc, les mois à venir vides. */
function HonorairesParMois({ mois, c }) {
  const data = mois.map((m) => ({ ...m, nom: MOIS[m.mois], k: m.montant == null ? null : Math.round(m.montant / 1000) }));
  return (
    <section className={`${carte} p-5`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={titreCarte}>Honoraires encaissés par mois</h2>
        <span className="text-[12px] text-brume">en k€ HT</span>
      </div>
      <div className="h-[230px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%">
            <XAxis dataKey="nom" tickLine={false} axisLine={{ stroke: c.trait }} tick={{ fill: c.ardoise, fontSize: 11 }} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length && payload[0].payload.montant != null
              ? <Bulle titre={MOIS[payload[0].payload.mois]} lignes={[{ nom: "Encaissés", valeur: montant(payload[0].payload.montant) || "0 €", couleur: payload[0].payload.courant ? c.encre : c.menthe }]} /> : null} />
            <Bar dataKey="k" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {data.map((m) => <Cell key={m.mois} fill={m.courant ? c.encre : c.menthe} />)}
              <LabelList dataKey="k" position="top" style={{ fill: c.ardoise, fontSize: 11 }} formatter={(v) => (v == null ? "" : v)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** De l'appel à la vente : une barre par étape, le nombre dedans, la part de l'étape précédente au bout. */
function Entonnoir({ etages, c }) {
  const max = Math.max(1, ...etages.map((e) => e.n));
  return (
    <section className={`${carte} p-5`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className={titreCarte}>De l'appel à la vente</h2>
        <span className="text-[12px] text-brume">taux vs étape précédente</span>
      </div>
      <div className="flex flex-col gap-3">
        {etages.map((e, i) => {
          const derniere = i === etages.length - 1;
          const fond = derniere ? c.encre : i === 0 ? c.trait : c.menthe;
          const opacite = derniere || i === 0 ? 1 : 0.45 + (0.55 * i) / (etages.length - 2);
          return (
            <div key={e.cle} className="grid grid-cols-[92px_minmax(0,1fr)_44px] items-center gap-3 max-sm:grid-cols-[76px_minmax(0,1fr)_40px]">
              <span className="text-[13px] text-craie">{e.libelle}</span>
              <span className="relative h-8 overflow-hidden rounded-[8px] bg-encre/[0.04]">
                <span className="absolute inset-y-0 left-0 rounded-[8px]" style={{ width: `${Math.max(e.n ? 7 : 0, (e.n / max) * 100)}%`, background: fond, opacity: opacite }} />
                <span className={`absolute inset-y-0 left-3 flex items-center text-[13px] font-medium tabular-nums ${derniere && e.n ? "text-fond" : "text-encre"}`}>{nb(e.n)}</span>
              </span>
              <span className="text-right text-[12.5px] tabular-nums text-ardoise">{e.taux == null ? "" : `${e.taux} %`}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Cette semaine : appels, relances, rendez-vous, comparés à la semaine dernière ; puis « Noter un appel ». */
function CetteSemaine({ lignes, onNoter }) {
  return (
    <section className={`${carte} flex flex-col p-5`}>
      <h2 className={`${titreCarte} mb-4`}>Cette semaine</h2>
      <div className="flex flex-col gap-2.5">
        {lignes.map((l) => (
          <div key={l.cle} className="flex items-center justify-between gap-3 rounded-[12px] border border-trait px-4 py-3">
            <span className="text-[13.5px] text-craie">{l.libelle}</span>
            <span className="flex items-baseline gap-2">
              <span className="text-[22px] font-light tabular-nums text-encre">{nb(l.n)}</span>
              <span className="w-[86px] text-right text-[11.5px] text-brume">sem. dern. {nb(l.avant)}</span>
            </span>
          </div>
        ))}
      </div>
      <button type="button" onClick={onNoter} className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-trait text-[13.5px] text-encre hover:border-bord-vif" style={{ background: "transparent" }}>
        <PhoneCall className="h-4 w-4" /> Noter un appel
      </button>
    </section>
  );
}

/** Les six étapes en segments, comme les cartes de Biens : faites pleines, en cours à moitié. */
function Segments({ etapes, faites, en }) {
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${etapes.length}, minmax(0, 1fr))` }}>
      {etapes.map((x, i) => <span key={x.id} className={`h-1 rounded-full ${faites.includes(x.id) ? "bg-menthe" : i + 1 === en ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />)}
    </div>
  );
}

const DOSSIERS_VUS = 8;

function DossiersEnCours({ dossiers, etapes, ouvrir }) {
  // Les huit plus récemment bougés ; les autres d'un clic.
  const [tous, setTous] = useState(false);
  const vus = tous ? dossiers : dossiers.slice(0, DOSSIERS_VUS);
  return (
    <section className={`${carte} p-5`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={titreCarte}>Dossiers en cours</h2>
        <span className="text-[12px] text-brume">{nb(dossiers.length)}</span>
      </div>
      {!dossiers.length ? <p className="m-0 text-[13px] text-brume">Aucun dossier en cours.</p> : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_96px_minmax(0,1.2fr)] gap-4 pb-2 text-[11px] uppercase tracking-[.12em] text-brume max-md:hidden">
            <span>Bien</span><span>Étape</span><span className="text-right">Honoraires</span><span>Prochaine action</span>
          </div>
          {vus.map((d) => (
            <button key={d.cle} type="button" onClick={ouvrir ? () => ouvrir(d) : undefined} disabled={!ouvrir}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_96px_minmax(0,1.2fr)] items-center gap-4 border-t border-trait py-3 text-left enabled:hover:bg-encre/[0.02] max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-y-2"
              style={{ background: "transparent" }}>
              <span className="min-w-0 max-md:col-span-2">
                <span className="block truncate text-[14px] text-encre">{d.titre}</span>
                {d.mandataire && <span className="block truncate text-[12px] text-brume">{d.mandataire}</span>}
              </span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="truncate text-[12px] text-ardoise">{d.etape_libelle} · {d.etape} / {etapes.length}</span>
                <Segments etapes={etapes} faites={d.faites} en={d.etape} />
              </span>
              <span className="text-right text-[14px] tabular-nums text-encre">{montant(d.honoraires) || "—"}</span>
              <span className="min-w-0 text-[13px] text-craie max-md:col-span-2">
                {d.prochaine.quoi}{d.prochaine.le && <span className="text-brume"> · {jourMois(d.prochaine.le)}</span>}
              </span>
            </button>
          ))}
          {dossiers.length > DOSSIERS_VUS && (
            <button type="button" onClick={() => setTous((t) => !t)} className="mt-2 h-9 rounded-full border border-trait text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              {tous ? "Afficher moins" : `Afficher les ${nb(dossiers.length)} dossiers`}
            </button>
          )}
        </div>
      )}
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

/** L'export : un CSV des chiffres à l'écran, lisible dans un tableur français (point-virgule, BOM). */
function exporter(data, libellePeriode) {
  const l = [];
  const ligne = (...x) => l.push(x.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"));
  ligne("Statistiques", data.nom || "Équipe", libellePeriode, `au ${dateLongue(data.au)}`);
  ligne();
  ligne("Indicateur", "Valeur", `Même période ${data.annee_avant}`);
  for (const x of data.indicateurs) ligne(x.libelle, x.valeur, x.avant);
  ligne();
  ligne(`Honoraires encaissés ${data.annee}`, "Montant (€)");
  for (const m of data.mois) ligne(MOIS[m.mois], m.montant);
  ligne();
  ligne("Étape", "Nombre", "Taux vs étape précédente (%)");
  for (const e of data.entonnoir) ligne(e.libelle, e.n, e.taux);
  ligne();
  ligne("Cette semaine", "Nombre", "Semaine dernière");
  for (const s of data.cette_semaine) ligne(s.libelle, s.n, s.avant);
  ligne();
  ligne("Dossier", "Mandataire", "Étape", "Honoraires (€)", "Prochaine action");
  for (const d of data.dossiers) ligne(d.titre, d.mandataire, `${d.etape} / ${data.etapes.length} · ${d.etape_libelle}`, d.honoraires, d.prochaine.quoi);
  const blob = new Blob([`${String.fromCharCode(0xfeff)}${l.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `statistiques-${data.au.slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function SuiviActivite({ pourMandataire = false }) {
  const naviguer = useNavigate();
  const [periode, setPeriode] = useState("annee");
  const c = useCouleurs();
  const { data, isLoading, error } = useQuery({
    queryKey: [pourMandataire ? "mandataire-tableau-de-bord" : "monitoring-activite", periode],
    // Le mandataire voit le même tableau, sur ses seuls biens (2 nov. 2026).
    queryFn: () => base44.request("GET", `${pourMandataire ? "/api/mandataire/tableau-de-bord" : "/api/monitoring/activite"}?periode=${periode}`),
    placeholderData: (prev) => prev,
  });

  if (error) return <div className="p-8 text-[13.5px] text-alerte">{error.message || "Accès refusé."}</div>;
  const periodes = [["30j", "30 jours"], ["trimestre", "Trimestre"], ["annee", String(data?.annee || new Date().getFullYear())]];
  const libellePeriode = periodes.find(([k]) => k === periode)?.[1];

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">{pourMandataire ? "Vos statistiques" : "Tableau de bord"}</h1>
            {data && <p className="m-0 mt-1.5 text-[13.5px] text-ardoise">Activité et résultats {data.nom ? `de ${data.nom}` : "de l'équipe"}, au {dateLongue(data.au)}.</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-full bg-rail-actif p-1">
              {periodes.map(([k, mot]) => (
                <button key={k} type="button" onClick={() => setPeriode(k)} aria-pressed={periode === k}
                  className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${periode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={periode === k ? undefined : { background: "transparent" }}>
                  {mot}
                </button>
              ))}
            </div>
            <button type="button" disabled={!data} onClick={() => exporter(data, libellePeriode)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              <Download className="h-3.5 w-3.5" /> Exporter
            </button>
          </div>
        </div>

        {isLoading || !data ? <Chargement taille="grand" /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {data.indicateurs.map((x) => <Indicateur key={x.cle} x={x} anneeAvant={data.annee_avant} />)}
            </div>
            <HonorairesParMois mois={data.mois} c={c} />
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              <Entonnoir etages={data.entonnoir} c={c} />
              <CetteSemaine lignes={data.cette_semaine} onNoter={() => naviguer(createPageUrl(pourMandataire ? "MandataireProspection" : "Prospection"))} />
            </div>
            <DossiersEnCours dossiers={data.dossiers} etapes={data.etapes} ouvrir={pourMandataire ? (d) => naviguer(d.lien) : null} />
            <CarteSemaine semaine={data.semaine} c={c} titre="Quand on prospecte" unite={["appel", "appels"]}
              aide="Jour et heure : plus la case est pleine, plus on a appelé de biens à ce moment-là." vide="Aucun appel sur la période." />
            {data.mandataires && <ParMandataire mandataires={data.mandataires} etapes={data.etapes} c={c} />}
          </div>
        )}
      </div>
    </div>
  );
}
