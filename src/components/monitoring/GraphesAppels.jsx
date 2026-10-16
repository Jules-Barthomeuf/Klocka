import React, { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import jetons from "@/design/jetons.json";

// Les graphiques du Suivi des appels (14 oct. 2026, Jules : « plein de courbes,
// des graphiques »). Règles du skill dataviz : une seule échelle par graphique,
// traits fins, grille en filet plein, une couleur par personne qui la suit
// d'un filtre à l'autre (jamais selon son rang), une légende dès deux séries,
// une infobulle sur chaque marque, et le tableau par analyste comme vue
// tableau. Les couleurs sont lues sur le thème courant : recharts écrit ses
// tracés en attributs SVG, où une variable CSS ne se résout pas.

const ROLES = ["menthe", "encre", "craie", "ardoise", "brume", "surface-pleine", "fond"];

function lireCouleurs() {
  const racine = typeof document !== "undefined" ? document.documentElement : null;
  const style = racine ? getComputedStyle(racine) : null;
  const clair = racine?.getAttribute("data-theme") === "clair";
  const c = Object.fromEntries(ROLES.map((r) => {
    const v = style?.getPropertyValue(`--k-${r}-rgb`).trim();
    return [r, v ? `rgb(${v.split(/\s+/).join(", ")})` : jetons.couleurs[r]];
  }));
  const trait = style?.getPropertyValue("--k-trait").trim() || jetons.couleurs.trait;
  return { ...c, trait, series: clair ? jetons.graphique.clair : jetons.graphique.sombre };
}

/** Les couleurs du thème, relues quand on passe du sombre au clair ou qu'on change d'accent. */
export function useCouleurs() {
  const [c, setC] = useState(lireCouleurs);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(lireCouleurs()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style", "class"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const duree = (s) => (s == null ? "—" : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")}`);
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Le cadre d'un graphique : titre en petites capitales, une phrase qui dit quoi lire, le graphique. */
export function Cadre({ titre, aide = null, droite = null, children, className = "" }) {
  return (
    <section className={`rounded-[14px] border border-trait bg-surface p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[11px] font-normal uppercase tracking-[.16em] text-menthe">{titre}</h2>
        {droite}
      </div>
      {aide && <p className="m-0 -mt-1.5 mb-3 text-[12px] text-brume">{aide}</p>}
      {children}
    </section>
  );
}

/** La légende : une pastille de la couleur, le nom en encre de texte. */
export function Legende({ items }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-craie">
      {items.map((i) => (
        <span key={i.nom} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: i.couleur }} />{i.nom}
        </span>
      ))}
    </div>
  );
}

function Bulle({ titre, lignes }) {
  return (
    <div className="min-w-[150px] rounded-[10px] border border-bord bg-surface-pleine px-3 py-2 text-[12px] shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
      <p className="m-0 mb-1 text-craie">{titre}</p>
      {lignes.filter(Boolean).map((l) => (
        <p key={l.nom} className="m-0 flex items-center justify-between gap-4 text-ardoise">
          <span className="inline-flex items-center gap-1.5">{l.couleur && <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.couleur }} />}{l.nom}</span>
          <span className="tabular-nums text-encre">{l.valeur}</span>
        </p>
      ))}
    </div>
  );
}

const axe = (c) => ({ stroke: c.trait, tick: { fill: c.ardoise, fontSize: 11 }, tickLine: false, axisLine: { stroke: c.trait } });

/**
 * La couleur de chaque personne : son rang dans l'équipe triée par adresse,
 * pas dans le classement du moment. Filtrer une période ne la repeint pas.
 */
export function couleursAnalystes(analystes, c) {
  const tries = [...analystes].map((a) => a.email).sort();
  return Object.fromEntries(tries.map((e, i) => [e, c.series[i % c.series.length]]));
}

// --- Par jour -----------------------------------------------------------------

/** Les appels par jour, joints et sans réponse empilés. Une seule échelle : des appels. */
export function AppelsParJour({ parJour, c }) {
  const data = parJour.map((j) => ({ jour: j.jour, joints: j.aboutis, sans: j.appels - j.aboutis, total: j.appels }));
  const sans = c.brume;
  return (
    <Cadre titre="Appels par jour" droite={<Legende items={[{ nom: "Joints", couleur: c.menthe }, { nom: "Sans réponse", couleur: sans }]} />}>
      <div className="h-[230px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Appels", valeur: payload[0].payload.total }, { nom: "Joints", valeur: payload[0].payload.joints, couleur: c.menthe }, { nom: "Sans réponse", valeur: payload[0].payload.sans, couleur: sans }]} /> : null} />
            <Bar dataKey="joints" stackId="a" fill={c.menthe} stroke={c["surface-pleine"]} strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="sans" stackId="a" fill={sans} stroke={c["surface-pleine"]} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Le taux de joints par jour, en pour cent. Les jours sans appel restent vides, pas à zéro. */
export function TauxJoints({ parJour, c }) {
  const data = parJour.map((j) => ({ jour: j.jour, taux: j.appels ? Math.round((j.aboutis / j.appels) * 100) : null, appels: j.appels }));
  return (
    <Cadre titre="Taux de joints" aide="Part des appels où quelqu'un a décroché, jour par jour.">
      <div className="h-[200px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v} %`} {...axe(c)} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length && payload[0].payload.taux != null ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Joints", valeur: `${payload[0].payload.taux} %`, couleur: c.menthe }, { nom: "Appels", valeur: payload[0].payload.appels }]} /> : null} />
            <Line dataKey="taux" stroke={c.menthe} strokeWidth={2} dot={{ r: 3, fill: c.menthe, stroke: c["surface-pleine"], strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Une courbe par analyste : qui appelle, quel jour. */
export function CourbesAnalystes({ parJour, analystes, c }) {
  const actifs = analystes.filter((a) => a.appels);
  const teinte = couleursAnalystes(analystes, c);
  const data = parJour.map((j) => ({ jour: j.jour, ...Object.fromEntries(actifs.map((a) => [a.email, j.par?.[a.email] || 0])) }));
  if (!actifs.length) return null;
  return (
    <Cadre titre="Appels par analyste, jour par jour" droite={<Legende items={actifs.map((a) => ({ nom: a.prenom, couleur: teinte[a.email] }))} />}>
      <div className="h-[240px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[...payload].sort((a, b) => b.value - a.value).map((p) => ({ nom: actifs.find((a) => a.email === p.dataKey)?.prenom, valeur: p.value, couleur: teinte[p.dataKey] }))} /> : null} />
            {actifs.map((a) => <Line key={a.email} dataKey={a.email} stroke={teinte[a.email]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: c["surface-pleine"], strokeWidth: 2 }} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Le cumul de la période : la pente dit le rythme. */
export function Cumul({ parJour, c }) {
  const data = useMemo(() => {
    let t = 0; let j = 0;
    return parJour.map((x) => { t += x.appels; j += x.aboutis; return { jour: x.jour, appels: t, joints: j }; });
  }, [parJour]);
  return (
    <Cadre titre="Cumul sur la période" droite={<Legende items={[{ nom: "Appels", couleur: c.menthe }, { nom: "Joints", couleur: c.series[0] }]} />}>
      <div className="h-[200px]">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="k-cumul" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.menthe} stopOpacity={0.28} /><stop offset="100%" stopColor={c.menthe} stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Appels cumulés", valeur: payload[0].payload.appels, couleur: c.menthe }, { nom: "Joints cumulés", valeur: payload[0].payload.joints, couleur: c.series[0] }]} /> : null} />
            <Area dataKey="appels" stroke={c.menthe} strokeWidth={2} fill="url(#k-cumul)" isAnimationActive={false} />
            <Area dataKey="joints" stroke={c.series[0]} strokeWidth={2} fill="transparent" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Les appels heure par heure : la vue d'une seule journée, ou d'une période entière. */
export function ParHeure({ heures, c, titre = "Heures d'appel" }) {
  const data = heures.filter((h) => h.heure >= 7 && h.heure <= 21);
  return (
    <Cadre titre={titre}>
      <div className="h-[200px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="heure" tickFormatter={(h) => `${h} h`} interval={1} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={`${payload[0].payload.heure} h – ${payload[0].payload.heure + 1} h`} lignes={[{ nom: "Appels", valeur: payload[0].payload.appels, couleur: c.menthe }]} /> : null} />
            <Bar dataKey="appels" fill={c.menthe} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** La carte jour × heure : où se concentrent les appels dans la semaine. Une teinte, du pâle au plein. */
export function CarteSemaine({ semaine, c }) {
  const heures = Array.from({ length: 15 }, (_, i) => i + 7);
  const max = Math.max(1, ...semaine.flatMap((j) => heures.map((h) => j.heures[h])));
  const total = semaine.reduce((t, j) => t + j.heures.reduce((u, n) => u + n, 0), 0);
  return (
    <Cadre titre="Jour et heure" aide={total ? "Plus la case est pleine, plus on a appelé à ce moment-là." : "Aucun appel sur la période."}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: `36px repeat(${heures.length}, minmax(0, 1fr))` }}>
          <span />
          {heures.map((h) => <span key={h} className="pb-1 text-center text-[10.5px] text-brume">{h % 2 ? "" : `${h} h`}</span>)}
          {semaine.map((j) => (
            <React.Fragment key={j.jour}>
              <span className="self-center text-[11px] text-ardoise">{JOURS[j.jour]}</span>
              {heures.map((h) => {
                const n = j.heures[h];
                return (
                  <span key={h} title={`${JOURS[j.jour]} ${h} h : ${n} appel${n > 1 ? "s" : ""}`}
                    className="h-6 rounded-[4px]"
                    style={{ background: n ? c.menthe : c.trait, opacity: n ? 0.18 + 0.82 * (n / max) : 1 }} />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      {total > 0 && (
        <div className="mt-2.5 flex items-center gap-2 text-[11px] text-brume">
          <span>0</span>
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${c.trait}, ${c.menthe})` }} />
          <span className="tabular-nums">{max} appel{max > 1 ? "s" : ""}</span>
        </div>
      )}
    </Cadre>
  );
}

/** Des barres horizontales d'une seule couleur : issues, modes. La valeur en texte au bout. */
export function BarresHorizontales({ titre, lignes, c, aide = null, vide = "Rien sur la période." }) {
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  const total = lignes.reduce((t, l) => t + l.valeur, 0);
  return (
    <Cadre titre={titre} aide={aide}>
      {lignes.length ? (
        <div className="flex flex-col gap-2">
          {lignes.map((l) => (
            <div key={l.nom} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[12.5px]" title={`${l.nom} : ${l.valeur}${total ? ` (${Math.round((l.valeur / total) * 100)} %)` : ""}`}>
              <span className="truncate text-craie">{l.nom}</span>
              <span className="tabular-nums text-encre">{l.valeur}{total ? <span className="text-brume"> · {Math.round((l.valeur / total) * 100)} %</span> : null}</span>
              <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: c.trait }}>
                <span className="block h-full rounded-full" style={{ width: `${(l.valeur / max) * 100}%`, background: l.couleur || c.menthe }} />
              </span>
            </div>
          ))}
        </div>
      ) : <p className="m-0 text-[12.5px] text-brume">{vide}</p>}
    </Cadre>
  );
}

/** La durée des appels : combien de courts, combien de longs. En barres couchées : les tranches se lisent en entier. */
export function Durees({ durees, c }) {
  const total = durees.reduce((t, d) => t + d.appels, 0);
  return (
    <BarresHorizontales titre="Durée des appels" c={c} lignes={total ? durees.map((d) => ({ nom: d.mot, valeur: d.appels })) : []}
      aide={total ? `${total} appel${total > 1 ? "s" : ""} mesuré${total > 1 ? "s" : ""}, depuis le 9 octobre.` : null} vide="Aucune durée mesurée sur la période." />
  );
}

/** La durée moyenne d'un appel, jour par jour. */
export function DureeParJour({ parJour, c }) {
  const data = parJour.map((j) => ({ jour: j.jour, duree: j.duree_moyenne_s ?? null }));
  if (!data.some((d) => d.duree)) return null;
  return (
    <Cadre titre="Durée moyenne d'un appel" aide="Jour par jour, sur les appels mesurés.">
      <div className="h-[200px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis tickFormatter={duree} width={56} {...axe(c)} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length && payload[0].payload.duree != null ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Durée moyenne", valeur: duree(payload[0].payload.duree), couleur: c.series[0] }]} /> : null} />
            <Line dataKey="duree" stroke={c.series[0]} strokeWidth={2} dot={{ r: 3, fill: c.series[0], stroke: c["surface-pleine"], strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Une petite courbe par analyste : ses appels de la période, sa couleur, ses trois chiffres. */
export function PetitsMultiples({ analystes, parJour, c, onChoisir }) {
  const teinte = couleursAnalystes(analystes, c);
  const max = Math.max(1, ...parJour.flatMap((j) => Object.values(j.par || {})));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {analystes.map((a) => {
        const data = parJour.map((j) => ({ jour: j.jour, n: j.par?.[a.email] || 0 }));
        return (
          <button key={a.email} type="button" onClick={() => onChoisir?.(a.prenom)} title="Voir les appels de cette personne"
            className="rounded-[14px] border border-trait bg-surface p-3.5 text-left transition-colors hover:border-bord-vif">
            <p className="m-0 flex items-center justify-between text-[14px] text-encre">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: teinte[a.email] }} />{a.prenom}</span>
              <span className="text-[20px] font-light">{a.appels}</span>
            </p>
            <p className="m-0 mt-0.5 text-[12px] text-brume">{a.appels ? `${a.joints_pct ?? "—"} % joints · ${a.par_jour_actif ?? "—"} par jour actif · ${duree(a.duree_moyenne_s)} en moyenne` : "Aucun appel sur la période"}</p>
            <div className="mt-2 h-[52px]">
              <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <YAxis hide domain={[0, max]} />
                  <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: a.prenom, valeur: payload[0].payload.n, couleur: teinte[a.email] }]} /> : null} />
                  <Area dataKey="n" stroke={teinte[a.email]} strokeWidth={2} fill={teinte[a.email]} fillOpacity={0.14} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Les appels de chacun, barres empilées joints / sans réponse, triées du plus actif au moins actif. */
export function ClassementAnalystes({ analystes, c, titre, onChoisir }) {
  const max = Math.max(1, ...analystes.map((a) => a.appels));
  return (
    <Cadre titre={titre} droite={<Legende items={[{ nom: "Joints", couleur: c.menthe }, { nom: "Sans réponse", couleur: c.brume }]} />}>
      <div className="flex flex-col">
        {analystes.map((a) => (
          <button key={a.email} type="button" onClick={() => onChoisir?.(a.prenom)} title={`${a.prenom} : ${a.appels} appels, ${a.aboutis} joints`}
            className="grid grid-cols-[100px_minmax(0,1fr)_44px] items-center gap-3 border-t border-trait py-2 text-left text-[13px] first:border-t-0 hover:bg-relief/30" style={{ background: "transparent" }}>
            <span className={a.appels ? "text-encre" : "text-brume"}>{a.prenom}</span>
            <span className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" style={{ width: `${Math.max(a.appels ? 3 : 0, (a.appels / max) * 100)}%` }}>
              {a.aboutis > 0 && <span className="h-full rounded-l-full" style={{ flex: a.aboutis, background: c.menthe }} />}
              {a.appels - a.aboutis > 0 && <span className="h-full rounded-r-full" style={{ flex: a.appels - a.aboutis, background: c.brume }} />}
            </span>
            <span className={`text-right tabular-nums ${a.appels ? "text-encre" : "text-brume"}`}>{a.appels}</span>
          </button>
        ))}
      </div>
    </Cadre>
  );
}

/** Les faits que les appels ont apportés à l'Intelligence, jour par jour (14 oct. 2026). */
export function FaitsParJour({ parJour, c, titre = "Faits tirés des appels, par jour", aide = "Chaque appel validé avec sa transcription entre dans l'Intelligence ; l'extraction en tire des faits.", autre = "Appels entrés" }) {
  return (
    <Cadre titre={titre} aide={aide}>
      <div className="h-[220px]">
        <ResponsiveContainer>
          <BarChart data={parJour} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap={4}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Faits", valeur: payload[0].payload.faits, couleur: c.menthe }, payload[0].payload.sources != null ? { nom: autre, valeur: payload[0].payload.sources } : null]} /> : null} />
            <Bar dataKey="faits" fill={c.menthe} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** L'audience hors équipe (14 oct. 2026) : visites et visiteurs uniques par jour, en aires. */
export function VisitesParJour({ parJour, c }) {
  return (
    <Cadre titre="Visites par jour" droite={<Legende items={[{ nom: "Visites", couleur: c.menthe }, { nom: "Visiteurs uniques", couleur: c.ardoise }]} />}>
      <div className="h-[230px]">
        <ResponsiveContainer>
          <AreaChart data={parJour} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={24} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: "Visites", valeur: payload[0].payload.visites, couleur: c.menthe }, { nom: "Visiteurs uniques", valeur: payload[0].payload.visiteurs, couleur: c.ardoise }]} /> : null} />
            <Area type="monotone" dataKey="visites" stroke={c.menthe} fill={c.menthe} fillOpacity={0.14} strokeWidth={2} isAnimationActive={false} />
            <Area type="monotone" dataKey="visiteurs" stroke={c.ardoise} fill="transparent" strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** La carte d'un chiffre (déplacée de Suivi > Appels le 15 oct. 2026 pour servir aussi à la page Intelligence). */
export function Chiffre({ valeur, libelle, note = null }) {
  return (
    <div className="rounded-md border border-trait bg-surface px-4 py-3.5">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{libelle}</p>
      <p className="m-0 mt-2 text-[24px] font-light tabular-nums text-encre">{valeur}</p>
      {note && <p className="m-0 mt-0.5 text-[12px] text-brume">{note}</p>}
    </div>
  );
}

/** Un chiffre et sa courbe sur la période (page Intelligence, 15 oct. 2026) : la carte de Chiffre, la petite courbe de PetitsMultiples. */
export function ChiffreCourbe({ valeur, libelle, note = null, serie = [], cle, c, format = (v) => v }) {
  const donnees = serie.map((d) => ({ jour: d.jour, v: d[cle] }));
  return (
    <div className="rounded-md border border-trait bg-surface px-4 pb-2 pt-3.5">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{libelle}</p>
      <p className="m-0 mt-2 text-[24px] font-light text-encre">{valeur}</p>
      {note && <p className="m-0 mt-0.5 text-[12px] text-brume">{note}</p>}
      <div className="mt-2 h-[44px]">
        <ResponsiveContainer>
          <AreaChart data={donnees} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <YAxis hide domain={[0, "auto"]} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[{ nom: libelle, valeur: payload[0].payload.v == null ? "—" : format(payload[0].payload.v), couleur: c.menthe }]} /> : null} />
            <Area dataKey="v" stroke={c.menthe} strokeWidth={2} fill={c.menthe} fillOpacity={0.14} connectNulls isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Des courbes cumulées jour après jour (page Intelligence, 16 oct. 2026, Jules :
 * « visualiser la croissance des données qu'on lui donne, le savoir qui
 * augmente »). `series` : [{ cle, nom }], une couleur par série dans l'ordre
 * fixe de la palette ; une seule échelle (des nombres d'éléments).
 */
export function Croissance({ serie, series, c, titre, aide = null }) {
  const teintes = Object.fromEntries(series.map((s, i) => [s.cle, c.series[i % c.series.length]]));
  return (
    <Cadre titre={titre} aide={aide} droite={<Legende items={series.map((s) => ({ nom: s.nom, couleur: teintes[s.cle] }))} />}>
      <div className="h-[230px]">
        <ResponsiveContainer>
          <LineChart data={serie} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} />
            <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => active && payload?.length ? <Bulle titre={jourLong(payload[0].payload.jour)} lignes={series.map((s) => ({ nom: s.nom, valeur: payload[0].payload[s.cle], couleur: teintes[s.cle] }))} /> : null} />
            {series.map((s) => <Line key={s.cle} dataKey={s.cle} stroke={teintes[s.cle]} strokeWidth={2} dot={serie.length <= 10 ? { r: 3, fill: teintes[s.cle], stroke: c["surface-pleine"], strokeWidth: 2 } : false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Pure : la croissance d'un jour sur la veille, en %, ou null sans veille comparable. */
export const croissance = (aujourdhui, veille) => (veille > 0 ? Math.round(((aujourdhui - veille) / veille) * 100) : null);
const enPourcent = (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v} %`);

/**
 * Le temps d'appel et le nombre d'appels, jour par jour (16 oct. 2026, Jules) : les appels en barres,
 * le temps total au téléphone en courbe, et la croissance de chacun sur la veille.
 */
export function TempsEtAppels({ parJour, c }) {
  const data = parJour.map((j, i) => {
    const veille = i > 0 ? parJour[i - 1] : null;
    const minutes = Math.round((j.duree_totale_s || 0) / 60);
    return {
      jour: j.jour, appels: j.appels, minutes,
      croissance_appels: veille ? croissance(j.appels, veille.appels) : null,
      croissance_minutes: veille ? croissance(minutes, Math.round((veille.duree_totale_s || 0) / 60)) : null,
    };
  });
  const dernier = data.at(-1);
  const resume = dernier && data.length > 1
    ? `Sur la veille : appels ${enPourcent(dernier.croissance_appels)}, temps ${enPourcent(dernier.croissance_minutes)}`
    : null;
  return (
    <Cadre titre="Temps d'appel et nombre d'appels" aide={resume || "Jour par jour : les appels en barres, le temps total au téléphone en courbe."}
      droite={<Legende items={[{ nom: "Appels", couleur: c.menthe }, { nom: "Minutes au téléphone", couleur: c.series[1] || c.ardoise }]} />}>
      <div className="h-[260px]">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap={4}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
            <YAxis yAxisId="appels" allowDecimals={false} {...axe(c)} />
            <YAxis yAxisId="minutes" orientation="right" allowDecimals={false} width={44} tickFormatter={(v) => `${v} min`} {...axe(c)} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return <Bulle titre={jourLong(d.jour)} lignes={[
                { nom: "Appels", valeur: `${d.appels} (${enPourcent(d.croissance_appels)} sur la veille)`, couleur: c.menthe },
                { nom: "Au téléphone", valeur: `${d.minutes} min (${enPourcent(d.croissance_minutes)} sur la veille)`, couleur: c.series[1] || c.ardoise },
              ]} />;
            }} />
            <Bar yAxisId="appels" dataKey="appels" fill={c.menthe} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line yAxisId="minutes" dataKey="minutes" stroke={c.series[1] || c.ardoise} strokeWidth={2} dot={{ r: 3, fill: c.series[1] || c.ardoise, stroke: c["surface-pleine"], strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/**
 * Le temps après l'appel, jour par jour (16 oct. 2026, Jules) : depuis le raccrochage, la médiane du temps
 * jusqu'aux actions prêtes, jusqu'à la validation, jusqu'à « Tout préparé ». Plus la courbe descend, moins
 * l'analyste attend ou retouche avant de passer à l'appel suivant.
 */
export function TempsPostAppel({ parJour, c }) {
  const ETAPES = [["pret", "Actions prêtes"], ["valide", "Validé"], ["prepare", "Tout préparé"]];
  const data = parJour.map((j) => ({
    jour: j.jour,
    ...Object.fromEntries(ETAPES.map(([k]) => [k, j.apres_appel?.[k]?.mediane_ms != null ? Math.round(j.apres_appel[k].mediane_ms / 1000) : null])),
    n: j.apres_appel?.valide?.n || 0,
  }));
  const couleur = (i) => c.series[i] || c.menthe;
  const dernier = [...data].reverse().find((d) => d.valide != null);
  const premier = data.find((d) => d.valide != null);
  const aide = dernier && premier && dernier !== premier
    ? `Raccroché → validé : ${duree(premier.valide)} le premier jour mesuré, ${duree(dernier.valide)} le dernier (médiane du jour).`
    : "Depuis le raccrochage : la médiane du jour pour chaque étape.";
  return (
    <Cadre titre="Temps après l'appel" aide={aide} droite={<Legende items={ETAPES.map(([, mot], i) => ({ nom: mot, couleur: couleur(i) }))} />}>
      {!data.some((d) => d.valide != null || d.pret != null) ? <p className="m-0 py-10 text-center text-[12.5px] text-brume">Pas encore d'appel mesuré sur la période.</p> : (
        <div className="h-[240px]">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={c.trait} />
              <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={18} {...axe(c)} />
              <YAxis tickFormatter={duree} width={56} {...axe(c)} />
              <Tooltip cursor={{ stroke: c.ardoise, strokeWidth: 1 }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return <Bulle titre={`${jourLong(d.jour)}${d.n ? ` · ${d.n} appel${d.n > 1 ? "s" : ""}` : ""}`} lignes={ETAPES.map(([k, mot], i) => ({ nom: mot, valeur: duree(d[k]), couleur: couleur(i) }))} />;
              }} />
              {ETAPES.map(([k], i) => (
                <Line key={k} dataKey={k} stroke={couleur(i)} strokeWidth={2} dot={{ r: 3, fill: couleur(i), stroke: c["surface-pleine"], strokeWidth: 2 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Cadre>
  );
}
