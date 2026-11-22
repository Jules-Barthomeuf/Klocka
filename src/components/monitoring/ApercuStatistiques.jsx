import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { base44 } from "@/api/base44Client";
import { Bulle, Cadre, axe, couleursDouces, useCouleurs } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";

// Le haut de la page Statistiques, à droite (20 nov. 2026, Jules ; refait le 22 nov. d'après sa maquette) : quatre chiffres
// avec leur écart à la période d'avant et une petite série, puis les fiches reçues semaine par semaine en courbes, pour
// toute l'équipe ou une personne. Les fiches : server/prospection/fiches-par-analyste.js ; les mois : server/statistiques.js.

const jourCourt = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const moisLong = (m) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long" });
const pluriel = (n, un, plus = `${un}s`) => `${n} ${n > 1 ? plus : un}`;
const virgule = (x) => String(x).replace(".", ",");
export const pilule = (actif) => `inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors ${actif ? "border-menthe bg-menthe/[0.1] text-menthe" : "border-bord text-ardoise hover:border-bord-vif hover:text-encre"}`;

/** L'écart à la période d'avant, en pour cent ; rien quand il n'y avait rien avant. */
export const ecart = (actuel, avant) => (avant > 0 ? Math.round(((actuel - avant) / avant) * 100) : null);
export function Ecart({ actuel, avant }) {
  const e = ecart(actuel, avant);
  if (e == null) return null;
  const teinte = e > 0 ? "text-statut-menthe" : e < 0 ? "text-statut-corail" : "text-brume";
  return <span className={`text-[12.5px] font-medium tabular-nums ${teinte}`}>{e > 0 ? "+" : e < 0 ? "−" : ""}{Math.abs(e)}{"\u202f"}%</span>;
}

/** Un chiffre de tête : la valeur, son écart, ce qu'il compte, et une petite série en bâtons (la dernière en accent). */
function Tuile({ valeur, avant, libelle, barres, aide }) {
  const max = Math.max(1, ...barres.map((b) => b.v));
  return (
    <div className="k-verre flex flex-col px-4 pb-3 pt-3.5" title={aide}>
      <p className="m-0 flex items-baseline gap-2"><span className="text-[22px] font-medium leading-none tabular-nums text-encre">{valeur}</span><Ecart actuel={valeur} avant={avant} /></p>
      <p className="m-0 mt-1.5 text-[13px] text-craie">{libelle}</p>
      <div className="mt-3 flex h-[36px] items-end gap-[3px]">
        {barres.map((b, i) => (
          <span key={b.nom} title={`${b.nom} : ${b.v}`} className={`block flex-1 rounded-t-[2px] ${i === barres.length - 1 ? "bg-menthe" : "bg-ardoise/40"}`} style={{ height: `${Math.max(4, (b.v / max) * 100)}%`, maxWidth: barres.length <= 2 ? 24 : undefined }} />
        ))}
      </div>
    </div>
  );
}

export default function ApercuStatistiques({ jours }) {
  const c = useCouleurs();
  const [qui, setQui] = useState("tous");
  const fiches = useQuery({ queryKey: ["fiches-analystes", jours], queryFn: () => base44.request("GET", `/api/monitoring/fiches-analystes?jours=${jours}`), placeholderData: (prev) => prev, staleTime: 30_000 });
  const mois = useQuery({ queryKey: ["statistiques-mois"], queryFn: () => base44.request("GET", "/api/statistiques/mois?mois=12"), staleTime: 60_000 });
  if (fiches.error) return <p className="m-0 py-8 text-[13.5px] text-ardoise">{fiches.error.message || "Accès réservé."}</p>;
  if (!fiches.data || !mois.data) return <Chargement />;

  const d = fiches.data;
  const m = mois.data;
  const teintes = couleursDouces(d.analystes, c);
  const avecFiches = [...d.analystes].sort((x, y) => y.fiches - x.fiches || x.prenom.localeCompare(y.prenom));
  const choix = [["tous", "Toute l'équipe", c.menthe], ...avecFiches.map((a) => [a.email, a.prenom, teintes[a.email]])];
  const actuel = choix.find(([k]) => k === qui) || choix[0];
  const tous = actuel[0] === "tous";
  const couleur = actuel[2];
  const semaines = d.semaines.map((s) => ({
    semaine: s.semaine,
    fiches: tous ? s.fiches : s.fiches_par_analyste?.[actuel[0]] || 0,
    dossiers: tous ? s.dossiers || 0 : s.dossiers_par_analyste?.[actuel[0]] || 0,
  }));
  const totalChoisi = semaines.reduce((t, s) => t + s.fiches, 0);
  const dossiersChoisis = semaines.reduce((t, s) => t + s.dossiers, 0);
  const pour100 = (n, sur) => (sur ? Math.round((n / sur) * 100) : null);
  // Appels passés et fiches reçues (20 nov. 2026, Jules) : la part des appels qui font venir une fiche, de l'équipe ou de la personne.
  const source = tous ? d.total : d.analystes.find((a) => a.email === actuel[0]) || {};
  const parAppel = source.appels ? `Fiches par appel : ${virgule(source.fiches_par_appel ?? 0)}\u202f%, ${pluriel(source.fiches_appel || 0, "fiche")} suite à ${pluriel(source.appels, "appel")}.` : "Aucun appel sur la période.";
  const huit = d.semaines.slice(-8);
  const deuxMois = (cle) => [{ nom: moisLong(m.mois_dernier?.mois || m.ce_mois.mois), v: m.mois_dernier?.[cle] || 0 }, { nom: moisLong(m.ce_mois.mois), v: m.ce_mois[cle] }];

  return (
    <div className="k-monte flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tuile valeur={d.total.fiches} avant={d.precedent?.fiches ?? 0} libelle="Fiches reçues" aide={`${pluriel(d.total.biens, "bien")} ; comparé aux ${jours} jours d'avant`}
          barres={huit.map((s) => ({ nom: `Semaine du ${jourCourt(s.semaine)}`, v: s.fiches }))} />
        <Tuile valeur={d.total.dossiers || 0} avant={d.precedent?.dossiers ?? 0} libelle="Dossiers étudiés" aide={`${pour100(d.total.dossiers || 0, d.total.fiches) ?? 0} pour 100 fiches reçues`}
          barres={huit.map((s) => ({ nom: `Semaine du ${jourCourt(s.semaine)}`, v: s.dossiers || 0 }))} />
        <Tuile valeur={m.ce_mois.projets} avant={m.mois_dernier?.projets ?? 0} libelle="Projets entrés ce mois-ci" aide="Comparé au mois dernier" barres={deuxMois("projets")} />
        <Tuile valeur={m.ce_mois.offres} avant={m.mois_dernier?.offres ?? 0} libelle="Offres faites ce mois-ci" aide="Comparé au mois dernier" barres={deuxMois("offres")} />
      </div>

      <Cadre titre="Fiches reçues, semaine par semaine"
        aide={`${pluriel(totalChoisi, "fiche")} ${tous ? "pour toute l'équipe" : `pour ${actuel[1]}`} sur ces ${semaines.length} semaines, dont ${pluriel(dossiersChoisis, "ouverte", "ouvertes")} en dossier${totalChoisi ? ` (${pour100(dossiersChoisis, totalChoisi)} pour 100)` : ""}. ${parAppel}`}
        droite={(
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-craie">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c.ardoise }} />Fiches reçues</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: couleur }} />Dossiers étudiés</span>
          </div>
        )}>
        <div role="group" aria-label="Voir les fiches de" className="mb-3 flex flex-wrap gap-1.5">
          {choix.map(([k, nom, teinte]) => (
            <button key={k} type="button" onClick={() => setQui(k)} aria-pressed={actuel[0] === k} className={pilule(actuel[0] === k)} style={{ background: actuel[0] === k ? undefined : "transparent" }}>
              {k !== "tous" && <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: teinte }} />}{nom}
            </button>
          ))}
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer>
            <ComposedChart data={semaines} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="kstat-dossiers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={couleur} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={couleur} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={c.trait} />
              <XAxis dataKey="semaine" tickFormatter={jourCourt} minTickGap={14} {...axe(c)} />
              <YAxis allowDecimals={false} {...axe(c)} />
              <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => (active && payload?.length ? (
                <Bulle titre={`Semaine du ${jourCourt(payload[0].payload.semaine)}`} lignes={[{ nom: "Fiches reçues", valeur: payload[0].payload.fiches, couleur: c.ardoise }, { nom: "Dossiers étudiés", valeur: payload[0].payload.dossiers, couleur }, { nom: "Pour 100 fiches", valeur: pour100(payload[0].payload.dossiers, payload[0].payload.fiches) ?? "—" }]} />
              ) : null)} />
              <Line type="monotone" dataKey="fiches" stroke={c.ardoise} strokeWidth={2} dot={{ r: 3, fill: c.ardoise, stroke: c["surface-pleine"], strokeWidth: 2 }} isAnimationActive={false} />
              <Area type="monotone" dataKey="dossiers" stroke={couleur} strokeWidth={2} fill="url(#kstat-dossiers)" dot={{ r: 3.5, fill: couleur, stroke: c["surface-pleine"], strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Cadre>
    </div>
  );
}
