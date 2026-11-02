import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";
import { BarresHorizontales, Bulle, Cadre, Croissance, axe, useCouleurs } from "@/components/monitoring/GraphesAppels";
import { Tuile } from "@/components/monitoring/UsagePlateforme";
import Chargement from "@/components/ui/Chargement";
import { montant } from "../../server/montants.js";

// Suivi › Activité (2 nov. 2026, Jules : « un tableau de bord avec tous les chiffres », « des graphiques ») : est-ce
// que ça avance vers des ventes, et où ça coince ? En tête les cinq gestes qui font une vente et leur graphique par
// jour ; puis le parcours des biens aujourd'hui, étape par étape, avec ce qui y est arrêté et ce qui passe à la
// suivante ; le portefeuille sous mandat, les délais, les affaires perdues ; les biens à relancer ; chaque
// mandataire. L'usage, les appels et les coûts ont leurs onglets. Le calcul : server/suivi-activite.js.

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"], [365, "1 an"]];
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const nb = (n) => (n ?? 0).toLocaleString("fr-FR");
const jours = (n) => (n == null ? "—" : n === 0 ? "le jour même" : `${n} jour${n > 1 ? "s" : ""}`);

/** Par semaine au-delà de 90 jours : 365 barres ne se lisent pas. */
function regrouper(parJour, cles) {
  if (parJour.length <= 90) return parJour;
  const out = [];
  for (let i = 0; i < parJour.length; i += 7) {
    const tranche = parJour.slice(i, i + 7);
    out.push({ jour: tranche[0].jour, semaine: true, ...Object.fromEntries(cles.map((k) => [k, tranche.reduce((s, j) => s + j[k], 0)])) });
  }
  return out;
}

function GrandGraphique({ serie, geste, c }) {
  const moyenne = serie.length ? serie.reduce((s, j) => s + j[geste.cle], 0) / serie.length : 0;
  const parSemaine = serie[0]?.semaine;
  return (
    <Cadre titre={`${geste.libelle} par ${parSemaine ? "semaine" : "jour"}`}
      droite={moyenne > 0 ? <span className="text-[12px] text-ardoise">moyenne <span className="tabular-nums text-encre">{moyenne.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span> par {parSemaine ? "semaine" : "jour"}</span> : null}>
      <div className="h-[220px]">
        <ResponsiveContainer>
          <BarChart data={serie} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={serie.length > 45 ? 1 : 4}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={22} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length ? (
              <Bulle titre={parSemaine ? `Semaine du ${jourCourt(payload[0].payload.jour)}` : jourLong(payload[0].payload.jour)} lignes={[{ nom: geste.libelle, valeur: payload[0].payload[geste.cle], couleur: c.menthe }]} />
            ) : null} />
            {moyenne > 0 && <ReferenceLine y={moyenne} stroke={c.ardoise} strokeDasharray="4 4" />}
            <Bar dataKey={geste.cle} fill={c.menthe} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/**
 * Le parcours des biens, une ligne par étape : la prospection en gris (son échelle à elle, elle écraserait le reste),
 * les étapes des biens en menthe ; ce qui y est arrêté en ambre ; entre deux étapes, la part qui passe.
 */
function Parcours({ parcours, passages, c }) {
  const pros = parcours.filter((p) => p.prospection);
  const biens = parcours.filter((p) => !p.prospection);
  const maxP = Math.max(1, ...pros.map((p) => p.n));
  const maxB = Math.max(1, ...biens.map((p) => p.n));
  const passe = Object.fromEntries(passages.map((p) => [p.de, p]));
  const Ligne = ({ p, max, couleur }) => (
    <div className="grid grid-cols-[minmax(96px,150px)_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-[12.5px] max-sm:grid-cols-[minmax(0,1fr)_auto]">
      <span className="truncate text-craie">{p.libelle}</span>
      <span className="h-2 overflow-hidden rounded-full max-sm:col-span-2 max-sm:order-last" style={{ background: c.trait }}>
        <span className="block h-full rounded-full" style={{ width: `${(p.n / max) * 100}%`, background: couleur }} />
      </span>
      <span className="whitespace-nowrap text-right tabular-nums text-encre">
        {nb(p.n)}{p.arretes ? <span className="text-ambre"> · {p.arretes} arrêté{p.arretes > 1 ? "s" : ""}</span> : null}
      </span>
    </div>
  );
  return (
    <Cadre titre="Le parcours des biens" aide={`Où en sont les biens aujourd'hui. Arrêté : rien n'a bougé depuis 14 jours. Entre deux étapes, la part des biens arrivés à l'une qui sont arrivés à la suivante.`}>
      <div className="flex flex-col">
        {pros.map((p) => <Ligne key={p.cle} p={p} max={maxP} couleur={c.brume} />)}
        <div className="my-2 border-t border-trait" />
        {biens.map((p) => (
          <React.Fragment key={p.cle}>
            <Ligne p={p} max={maxB} couleur={p.cle === "vendus" ? c.encre : c.menthe} />
            {passe[p.libelle]?.taux != null && (
              <p className="m-0 py-0.5 pl-[min(150px,40%)] text-[11.5px] text-brume max-sm:pl-0">
                ↓ {passe[p.libelle].taux} % passent à {passe[p.libelle].vers.toLowerCase()} <span className="tabular-nums">({passe[p.libelle].passes} sur {passe[p.libelle].entres})</span>
              </p>
            )}
          </React.Fragment>
        ))}
      </div>
    </Cadre>
  );
}

function Chiffres({ titre, aide, lignes }) {
  return (
    <Cadre titre={titre} aide={aide}>
      <div className="flex flex-col">
        {lignes.map((l) => (
          <div key={l.nom} className="flex items-baseline justify-between gap-3 border-t border-trait py-2 first:border-t-0">
            <span className="text-[12.5px] text-craie">{l.nom}</span>
            <span className="text-[20px] font-light tabular-nums text-encre">{l.valeur}</span>
          </div>
        ))}
      </div>
    </Cadre>
  );
}

function ARelancer({ biens, total }) {
  return (
    <Cadre titre={`À relancer · ${total}`} aide="Les biens arrêtés depuis plus de 14 jours, le plus ancien d'abord.">
      {biens.length ? (
        <div className="flex flex-col">
          {biens.map((b) => (
            <div key={b.cle} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] items-baseline gap-3 border-t border-trait py-2 text-[12.5px] first:border-t-0 max-sm:grid-cols-[minmax(0,1fr)_auto]">
              <span className="truncate text-encre">{b.titre}</span>
              <span className="truncate text-ardoise max-sm:order-3">{b.etape} · {b.statut}</span>
              <span className="truncate text-ardoise max-sm:order-4 max-sm:text-right">{b.mandataire}</span>
              <span className="text-right tabular-nums text-ambre max-sm:order-2">{b.depuis_j == null ? "—" : `${b.depuis_j} j`}</span>
            </div>
          ))}
        </div>
      ) : <p className="m-0 text-[12.5px] text-brume">Aucun bien arrêté.</p>}
    </Cadre>
  );
}

/** Une barre empilée par mandataire : ses biens à chaque étape, une teinte par étape, dans l'ordre du parcours. */
function ParMandataire({ mandataires, etapes, c }) {
  const max = Math.max(1, ...mandataires.map((m) => m.biens));
  const teintes = etapes.map((_, i) => c.series[i % c.series.length]);
  return (
    <Cadre titre="Par mandataire" aide="Ses biens à chaque étape, aujourd'hui ; les mandats signés sur la période ; la valeur de ce qu'il a sous mandat."
      droite={<div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-craie">{etapes.map((e, i) => <span key={e} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: teintes[i] }} />{e}</span>)}</div>}>
      <div className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_80px_80px_96px] gap-3 pb-1.5 text-[11px] uppercase tracking-[.12em] text-brume max-md:hidden">
          <span>Mandataire</span><span>Biens</span><span className="text-right">Prospects</span><span className="text-right">Mandats</span><span className="text-right">Sous mandat</span>
        </div>
        {mandataires.map((m) => (
          <div key={m.email || "sans"} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_80px_80px_96px] items-center gap-3 border-t border-trait py-2 text-[12.5px] max-md:grid-cols-3 max-md:gap-y-1.5">
            <span className="truncate text-encre max-md:col-span-3">{m.nom}</span>
            <span className="flex items-center gap-2 max-md:col-span-3" title={etapes.map((e, i) => `${e} : ${m.etapes[i]}`).join(" · ") + (m.vendus ? ` · Vendus : ${m.vendus}` : "")}>
              <span className="flex h-2.5 overflow-hidden rounded-full" style={{ width: `${Math.max(4, (m.biens / max) * 100)}%`, background: c.trait }}>
                {m.etapes.map((n, i) => n ? <span key={i} className="h-full" style={{ width: `${(n / Math.max(1, m.biens)) * 100}%`, background: teintes[i] }} /> : null)}
                {m.vendus ? <span className="h-full" style={{ width: `${(m.vendus / m.biens) * 100}%`, background: c.encre }} /> : null}
              </span>
              <span className="whitespace-nowrap tabular-nums text-ardoise">{m.biens}{m.arretes ? <span className="text-ambre"> · {m.arretes} arrêté{m.arretes > 1 ? "s" : ""}</span> : null}</span>
            </span>
            <span className="text-right tabular-nums text-craie max-md:text-left"><span className="md:hidden text-brume">Prospects </span>{nb(m.prospects)}</span>
            <span className="text-right tabular-nums text-craie max-md:text-left"><span className="md:hidden text-brume">Mandats </span>{nb(m.mandats)}</span>
            <span className="text-right tabular-nums text-encre">{montant(m.valeur) || "—"}</span>
          </div>
        ))}
        {!mandataires.length && <p className="m-0 text-[12.5px] text-brume">Aucun bien pour l'instant.</p>}
      </div>
    </Cadre>
  );
}

export default function SuiviActivite() {
  const [periode, setPeriode] = useState(30);
  const [choisi, setChoisi] = useState("rdv");
  const c = useCouleurs();
  const { data, isLoading, error } = useQuery({
    queryKey: ["monitoring-activite", periode],
    queryFn: () => base44.request("GET", `/api/monitoring/activite?jours=${periode}`),
    placeholderData: (prev) => prev,
  });

  const cles = useMemo(() => (data?.gestes || []).map((g) => g.cle), [data]);
  const serie = useMemo(() => (data ? regrouper(data.par_jour, cles) : []), [data, cles]);
  // Les cinq gestes cumulés jour après jour : la pente dit le rythme.
  const cumul = useMemo(() => {
    if (!data) return [];
    const s = Object.fromEntries(cles.map((k) => [k, 0]));
    return data.par_jour.map((j) => { for (const k of cles) s[k] += j[k]; return { jour: j.jour, ...s }; });
  }, [data, cles]);

  if (error) return <div className="p-8 text-[13.5px] text-alerte">{error.message || "Accès refusé."}</div>;
  const geste = data?.gestes.find((g) => g.cle === choisi) || data?.gestes[0];
  const p = data?.portefeuille;

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <OngletsSuivi className="mb-3.5 overflow-x-auto" />
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Tableau de bord</h1>
            <p className="m-0 mt-1.5 max-w-[70ch] text-[13.5px] text-ardoise">Ce qui avance vers une vente, et où ça s'arrête. Un clic sur un chiffre le met dans le graphique.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-rail-actif p-1">
            {PERIODES.map(([j, mot]) => (
              <button key={j} type="button" onClick={() => setPeriode(j)} aria-pressed={periode === j}
                className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${periode === j ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={periode === j ? undefined : { background: "transparent" }}>
                {mot}
              </button>
            ))}
          </div>
        </div>

        {isLoading || !data ? <Chargement taille="grand" /> : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-trait bg-trait sm:grid-cols-3 lg:grid-cols-5">
              {data.gestes.map((g, i) => (
                <Tuile key={g.cle} className={i === data.gestes.length - 1 ? "max-sm:col-span-2" : ""} titre={g.libelle} valeur={nb(g.n)} cle={g.cle} serie={serie}
                  note={<span className="text-brume">{nb(g.avant)} la période d'avant</span>} actif={choisi === g.cle} onChoisir={() => setChoisi(g.cle)} c={c} />
              ))}
            </div>
            <GrandGraphique serie={serie} geste={geste} c={c} />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Parcours parcours={data.parcours} passages={data.passages} c={c} />
              <div className="flex flex-col gap-5">
                <Chiffres titre="Le portefeuille" aide="Les mandats signés, pas encore vendus, au prix du mandat."
                  lignes={[
                    { nom: "Mandats en cours", valeur: nb(p.mandats) },
                    { nom: "Valeur sous mandat", valeur: montant(p.valeur) || "—" },
                    { nom: "Honoraires attendus", valeur: montant(p.honoraires) || "—" },
                  ]} />
                <Chiffres titre="Les délais" aide="La médiane, sur tous les biens qui ont fait les deux pas."
                  lignes={data.delais.map((d) => ({ nom: `${d.de} → ${d.vers.toLowerCase()}`, valeur: jours(d.jours) }))} />
                <BarresHorizontales titre="Les affaires perdues" c={c} vide="Aucune affaire perdue."
                  aide={data.en_pause ? `Et ${data.en_pause} bien${data.en_pause > 1 ? "s" : ""} en pause.` : null}
                  lignes={data.perdus.map((x) => ({ nom: x.motif.charAt(0).toUpperCase() + x.motif.slice(1), valeur: x.n, couleur: c.alerte }))} />
              </div>
            </div>

            <Croissance serie={cumul} series={data.gestes.map((g) => ({ cle: g.cle, nom: g.libelle }))} c={c}
              titre="Les gestes, cumulés sur la période" aide="La pente dit le rythme : une courbe plate, c'est une étape qui ne tourne plus." />

            <ARelancer biens={data.a_relancer} total={data.a_relancer_total} />
            <ParMandataire mandataires={data.mandataires} etapes={data.etapes} c={c} />

            <p className="m-0 text-[12px] leading-[1.6] text-brume">
              Un geste compte à sa date : le RDV au moment où il est pris, l'avis à son envoi, le mandat à sa signature, l'offre à sa réception, la vente à l'acte.
              {data.ecartes ? ` ${data.ecartes} bien${data.ecartes > 1 ? "s" : ""} d'essai et les fiches d'exemple sont écartés.` : " Les fiches d'exemple sont écartées."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
