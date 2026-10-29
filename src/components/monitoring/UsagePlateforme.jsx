import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Bulle, Cadre, axe } from "@/components/monitoring/GraphesAppels";
import Chargement from "@/components/ui/Chargement";

// Suivi > Usage, par personne et par session (19 oct. 2026, Jules : « des
// graphiques comme dans Apple, au lieu des trucs moches », puis « un grand
// tableau par personne, et je clique dans sa ligne pour voir sa dernière
// session : quelle page, combien de temps »). Les chiffres viennent de
// server/usage-sessions.js : une session s'arrête après 30 minutes sans page
// ouverte, le temps sur une page va jusqu'à la suivante.

// Le nom interne d'une page, en mots de l'interface.
const LIBELLES = {
  Analyse: "Dossiers", Dashboard: "Tableau de bord", AdminProjets: "Projets", ProjetDetail: "Projet", Home: "Connexion",
  Cerveau: "Intelligence", Monitoring: "Suivi · Usage", Semaine: "Agenda", AdminClients: "Clients", AdminUtilisateurs: "Utilisateurs",
  AdminMandataires: "Mandataires", AdminPresentations: "Présentations", MesPresentations: "Mes présentations", MesProjets: "Mes projets",
  OffMarket: "Off-market", KVacance: "K-Vacance", KFoncier: "K-Foncier", KZoning: "K-Zoning", KData: "K-Data", KEstimation: "K-Estimation",
  KExpertise: "K-Expertise", KProspective: "K-Prospective", KTransactions: "K-Transactions", SimulateurRentabilite: "Simulateur",
  SimulateurPublic: "Simulateur public", ConversationsMandataires: "Conversations mandataires", MandatsMandataires: "Mandats des mandataires", CoutsIA: "Coûts IA",
};
export const libellePage = (p) => {
  if (!p) return "—";
  if (LIBELLES[p]) return LIBELLES[p];
  if (p.startsWith("Mandataire") && p !== "Mandataire") return `Mandataire · ${libellePage(p.slice(10))}`;
  if (p.startsWith("Suivi")) return `Suivi · ${p.slice(5)}`;
  return p.replace(/([a-zé])([A-Z])/g, "$1 $2");
};

export const dureeCourte = (ms) => {
  if (!ms) return "0 min";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const heure = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dateSession = (iso) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const ilYa = (iso) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : j < 7 ? `il y a ${j} jours` : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
const maj = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const nomDe = (p) => p.nom || p.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

// --- La tête : quatre chiffres et leur courbe --------------------------------

function Evolution({ v }) {
  if (v == null) return <span className="text-brume">pas de période précédente</span>;
  return <span className={v >= 0 ? "text-menthe" : "text-alerte"}>{v > 0 ? "+" : ""}{v} % sur la période précédente</span>;
}

/** Un chiffre, son évolution, et sa courbe dessous ; un clic le met dans le grand graphique. */
function Tuile({ titre, valeur, evolution, serie, cle, actif, onChoisir, c, className = "" }) {
  return (
    <button type="button" onClick={onChoisir} aria-pressed={actif}
      className={`${className} min-w-0 px-5 pb-3 pt-4 text-left transition-colors ${actif ? "bg-surface-pleine" : "bg-fond hover:bg-surface"}`}>
      <div className={`text-[12.5px] ${actif ? "text-menthe" : "text-ardoise"}`}>{titre}</div>
      <div className="mt-1 text-[30px] font-light tracking-[-0.02em] text-encre tabular-nums">{valeur}</div>
      <div className="mt-0.5 truncate text-[12px] tabular-nums"><Evolution v={evolution} /></div>
      <div className="mt-2 h-[38px]">
        <ResponsiveContainer>
          <AreaChart data={serie} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <YAxis hide domain={[0, "auto"]} />
            <Area type="monotone" dataKey={cle} stroke={actif ? c.menthe : c.ardoise} strokeWidth={1.5} fill={actif ? c.menthe : c.ardoise} fillOpacity={0.12} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

const MESURES = {
  minutes: { titre: "Temps sur la plateforme", unite: (v) => dureeCourte(v * 60000), aide: "Les minutes passées chaque jour, toutes personnes confondues." },
  personnes: { titre: "Personnes actives", unite: (v) => `${v} personne${v > 1 ? "s" : ""}`, aide: "Combien de personnes ont ouvert au moins une page ce jour-là." },
  sessions: { titre: "Connexions", unite: (v) => `${v} connexion${v > 1 ? "s" : ""}`, aide: "Une connexion : des pages ouvertes sans pause de plus de 30 minutes." },
  pages: { titre: "Pages ouvertes", unite: (v) => `${v} page${v > 1 ? "s" : ""}`, aide: "Chaque page ouverte, chaque jour." },
  duree_moyenne: { titre: "Durée moyenne d'une connexion", unite: (v) => dureeCourte(v * 60000), aide: "Le temps d'une connexion, en moyenne, jour par jour." },
};

/** Le grand graphique, à la manière de Temps d'écran : une barre par jour, la moyenne en pointillé. */
function GrandGraphique({ serie, mesure, c }) {
  const m = MESURES[mesure];
  const enMinutes = mesure === "minutes" || mesure === "duree_moyenne";
  // La durée moyenne se lit sur les jours où quelqu'un est venu ; les autres mesures, sur tous les jours.
  const jours = mesure === "duree_moyenne" ? serie.filter((j) => j.sessions > 0) : serie;
  const moyenne = jours.length ? jours.reduce((t, j) => t + j[mesure], 0) / jours.length : 0;
  return (
    <Cadre titre={m.titre} aide={m.aide}
      droite={<span className="text-[12px] text-ardoise">moyenne <span className="tabular-nums text-encre">{m.unite(Math.round(moyenne))}</span> par jour</span>}>
      <div className="h-[240px]">
        <ResponsiveContainer>
          <BarChart data={serie} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} barCategoryGap={serie.length > 45 ? 1 : 4}>
            <CartesianGrid vertical={false} stroke={c.trait} />
            <XAxis dataKey="jour" tickFormatter={jourCourt} minTickGap={22} {...axe(c)} />
            <YAxis allowDecimals={false} {...axe(c)} tickFormatter={(v) => (enMinutes ? (v >= 60 ? `${Math.round(v / 60)} h` : `${v} min`) : v)} width={enMinutes ? 52 : 40} />
            <Tooltip cursor={{ fill: c.trait }} content={({ active, payload }) => active && payload?.length ? (
              <Bulle titre={jourLong(payload[0].payload.jour)} lignes={[
                { nom: "Temps", valeur: dureeCourte(payload[0].payload.minutes * 60000), couleur: mesure === "minutes" ? c.menthe : null },
                { nom: "Personnes", valeur: payload[0].payload.personnes, couleur: mesure === "personnes" ? c.menthe : null },
                { nom: "Connexions", valeur: payload[0].payload.sessions, couleur: mesure === "sessions" ? c.menthe : null },
                { nom: "Pages", valeur: payload[0].payload.pages, couleur: mesure === "pages" ? c.menthe : null },
                { nom: "Durée moyenne", valeur: dureeCourte(payload[0].payload.duree_moyenne * 60000), couleur: mesure === "duree_moyenne" ? c.menthe : null },
              ]} />
            ) : null} />
            {moyenne > 0 && <ReferenceLine y={moyenne} stroke={c.ardoise} strokeDasharray="4 4" />}
            <Bar dataKey={mesure} fill={c.menthe} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Cadre>
  );
}

/** Où passe le temps : chaque page, son temps et sa part, en barres couchées. */
function PagesParTemps({ pages, c }) {
  const liste = pages.slice(0, 10);
  const max = Math.max(1, ...liste.map((p) => p.temps_ms));
  const total = pages.reduce((t, p) => t + p.temps_ms, 0);
  return (
    <Cadre titre="Où passe le temps" aide="Le temps passé sur chaque page, puis combien de fois elle a été ouverte et par combien de personnes.">
      {liste.length ? (
        <div className="flex flex-col gap-2.5">
          {liste.map((p) => (
            <div key={p.page} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-[12.5px]" title={`${libellePage(p.page)} : ${p.vues} ouverture${p.vues > 1 ? "s" : ""}, ${p.personnes} personne${p.personnes > 1 ? "s" : ""}`}>
              <span className="truncate text-craie">{libellePage(p.page)}</span>
              <span className="tabular-nums text-encre">{dureeCourte(p.temps_ms)}<span className="text-brume"> · {total ? Math.round((p.temps_ms / total) * 100) : 0} %</span></span>
              <span className="col-span-2 mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: c.trait }}>
                <span className="block h-full rounded-full" style={{ width: `${(p.temps_ms / max) * 100}%`, background: c.menthe }} />
              </span>
              <span className="col-span-2 mt-0.5 text-[11px] text-brume">{p.vues} ouverture{p.vues > 1 ? "s" : ""} · {p.personnes} personne{p.personnes > 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      ) : <p className="m-0 text-[12.5px] text-brume">Aucune page ouverte sur la période.</p>}
    </Cadre>
  );
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
/** Jour × heure : quand l'équipe travaille sur la plateforme. Une teinte, de trait à la menthe. */
function QuandOnTravaille({ semaine, c }) {
  const heures = Array.from({ length: 15 }, (_, i) => i + 7);
  const max = Math.max(1, ...semaine.flatMap((j) => heures.map((h) => j.heures[h])));
  return (
    <Cadre titre="Quand on travaille" aide="Les minutes passées sur la plateforme, par jour de la semaine et par heure (heure de Paris).">
      <div className="overflow-x-auto">
        <div className="grid min-w-[440px] gap-[2px]" style={{ gridTemplateColumns: `34px repeat(${heures.length}, minmax(0, 1fr))` }}>
          <span />
          {heures.map((h) => <span key={h} className="pb-1 text-center text-[10.5px] text-brume">{h % 2 ? "" : `${h} h`}</span>)}
          {semaine.map((j) => (
            <React.Fragment key={j.jour}>
              <span className="self-center text-[11px] text-ardoise">{JOURS[j.jour]}</span>
              {heures.map((h) => {
                const n = j.heures[h];
                return <span key={h} title={`${JOURS[j.jour]} ${h} h : ${dureeCourte(n * 60000)}`} className="h-6 rounded-[4px]" style={{ background: n ? c.menthe : c.trait, opacity: n ? 0.18 + 0.82 * (n / max) : 1 }} />;
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-brume">
        <span>0</span>
        <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${c.trait}, ${c.menthe})` }} />
        <span className="tabular-nums">{dureeCourte(max * 60000)}</span>
      </div>
    </Cadre>
  );
}

/** La vue d'ensemble : les quatre chiffres, le grand graphique, le temps par page et l'heure. */
export function VueEnsemble({ data, c }) {
  const [mesure, setMesure] = useState("minutes");
  const t = data.totaux;
  const tuiles = [
    { cle: "minutes", titre: "Temps passé", valeur: dureeCourte(t.temps_ms), evolution: t.temps_evolution },
    { cle: "personnes", titre: "Personnes actives", valeur: t.personnes, evolution: t.personnes_evolution },
    { cle: "sessions", titre: "Connexions", valeur: t.sessions, evolution: t.sessions_evolution },
    { cle: "duree_moyenne", titre: "Durée moyenne", valeur: dureeCourte(t.duree_moyenne_ms), evolution: t.duree_evolution },
    { cle: "pages", titre: "Pages ouvertes", valeur: t.pages, evolution: t.pages_evolution },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-trait bg-trait sm:grid-cols-3 lg:grid-cols-5">
        {tuiles.map((x, i) => <Tuile key={x.cle} className={i === tuiles.length - 1 ? "max-sm:col-span-2" : ""} {...x} serie={data.serie} actif={mesure === x.cle} onChoisir={() => setMesure(x.cle)} c={c} />)}
      </div>
      <GrandGraphique serie={data.serie} mesure={mesure} c={c} />
      <div className="grid gap-5 lg:grid-cols-2">
        <PagesParTemps pages={data.pages} c={c} />
        <QuandOnTravaille semaine={data.semaine} c={c} />
      </div>
    </div>
  );
}

// --- Le tableau par personne ----------------------------------------------------

function MiniCourbe({ activite, c }) {
  return (
    <div className="h-[26px] w-[92px]">
      <ResponsiveContainer>
        <BarChart data={activite} margin={{ top: 1, right: 0, left: 0, bottom: 0 }} barCategoryGap={1}>
          <YAxis hide domain={[0, (max) => Math.max(max, 10)]} />
          <Bar dataKey="minutes" fill={c.menthe} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Une session, page après page : l'heure, la page, le temps, une barre à l'échelle de la session. */
function DetailSession({ s, c }) {
  const max = Math.max(1, ...s.pages.map((p) => p.duree_ms));
  return (
    <div className="flex flex-col">
      {s.pages.map((p, i) => {
        const chemin = p.url ? (() => { try { const u = new URL(p.url); return `${u.pathname}${u.search}`; } catch { return p.url; } })() : null;
        return (
          <div key={`${p.le}-${i}`} className="grid grid-cols-[48px_minmax(0,1fr)_minmax(60px,180px)_64px] items-center gap-3 border-t border-trait py-1.5 text-[12.5px] first:border-t-0">
            <span className="tabular-nums text-brume">{heure(p.le)}</span>
            <span className="min-w-0 truncate text-craie" title={chemin || undefined}>{libellePage(p.page)}{chemin && /\?/.test(chemin) ? <span className="text-brume"> · {chemin.split("?")[1].slice(0, 40)}</span> : null}</span>
            <span className="h-1.5 overflow-hidden rounded-full" style={{ background: c.trait }}>
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (p.duree_ms / max) * 100)}%`, background: p.estimee ? c.brume : c.menthe }} />
            </span>
            <span className="text-right tabular-nums text-encre" title={p.estimee ? "Estimée : aucune page ni battement du navigateur après celle-ci." : undefined}>{p.estimee ? "~" : ""}{dureeCourte(p.duree_ms)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Le panneau sous une ligne : les sessions de la personne, la dernière ouverte. */
function SessionsDePersonne({ p, c }) {
  const [limite, setLimite] = useState(20);
  const [choisie, setChoisie] = useState(0);
  const q = useQuery({
    queryKey: ["usage-sessions", p.email, limite],
    queryFn: () => base44.request("GET", `/api/monitoring/usage/sessions?email=${encodeURIComponent(p.email)}&limite=${limite}`),
    placeholderData: (prev) => prev,
  });
  if (q.isLoading || !q.data) return <div className="py-6"><Chargement /></div>;
  const { sessions, total } = q.data;
  if (!sessions.length) return <p className="m-0 py-4 text-[12.5px] text-brume">Aucune session gardée.</p>;
  const s = sessions[Math.min(choisie, sessions.length - 1)];
  const parPage = new Map();
  for (const x of s.pages) parPage.set(x.page, (parPage.get(x.page) || 0) + x.duree_ms);
  return (
    <div className="grid gap-4 py-4 md:grid-cols-[230px_minmax(0,1fr)]">
      <div className="flex max-h-[420px] flex-col overflow-y-auto">
        <p className="m-0 mb-1.5 text-[11px] uppercase tracking-[.14em] text-brume">{total} session{total > 1 ? "s" : ""}</p>
        {sessions.map((x, i) => (
          <button key={x.debut} type="button" onClick={() => setChoisie(i)} aria-pressed={i === choisie}
            className={`rounded-[10px] px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${i === choisie ? "bg-surface-pleine text-encre" : "text-craie hover:bg-surface"}`} style={i === choisie ? undefined : { background: "transparent" }}>
            <span className="block">{maj(dateSession(x.debut))} · {heure(x.debut)}</span>
            <span className="block text-[11.5px] text-brume">{dureeCourte(x.duree_ms)} · {x.pages.length} page{x.pages.length > 1 ? "s" : ""}</span>
          </button>
        ))}
        {total > sessions.length && (
          <button type="button" onClick={() => setLimite((n) => n + 40)} className="mt-1 px-2.5 py-1 text-left text-[12px] text-menthe hover:text-menthe-survol" style={{ background: "transparent" }}>Voir plus ancien</button>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="m-0 text-[15px] text-encre">{maj(jourLong(new Date(s.debut).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" })))}, de {heure(s.debut)} à {heure(s.fin)}</p>
          <p className="m-0 text-[12.5px] text-ardoise tabular-nums">{dureeCourte(s.duree_ms)} · {s.pages.length} page{s.pages.length > 1 ? "s" : ""}</p>
        </div>
        {/* La session d'un coup d'œil : une bande, une part par page dans l'ordre. */}
        <div className="mb-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
          {s.pages.map((x, i) => <span key={i} title={`${libellePage(x.page)} · ${dureeCourte(x.duree_ms)}`} className="h-full" style={{ flex: Math.max(x.duree_ms, 1), background: x.estimee ? c.brume : c.series[[...parPage.keys()].indexOf(x.page) % c.series.length] }} />)}
        </div>
        <DetailSession s={s} c={c} />
      </div>
    </div>
  );
}

const COLONNES = [
  { cle: "nom", mot: "Personne", gauche: true },
  { cle: "pages", mot: "Pages" },
  { cle: "pages_derniere", mot: "Dernière session" },
  { cle: "sessions_7j", mot: "Connexions 7 j" },
  { cle: "sessions_30j", mot: "Connexions 30 j" },
  { cle: "duree_moyenne_ms", mot: "Durée moyenne" },
  { cle: "temps_ms", mot: "Temps total" },
  { cle: "derniere", mot: "Vu" },
];

/** Le grand tableau : une ligne par personne, un clic ouvre ses sessions. */
export function TableauPersonnes({ personnes, jours, c }) {
  const [tri, setTri] = useState({ cle: "derniere", sens: -1 });
  const [ouverte, setOuverte] = useState(null);
  const [equipeSeule, setEquipeSeule] = useState(false);
  const lignes = useMemo(() => {
    const l = personnes.filter((p) => !equipeSeule || p.role === "admin");
    const val = (p) => (tri.cle === "nom" ? nomDe(p).toLowerCase() : p[tri.cle] ?? 0);
    return [...l].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * tri.sens);
  }, [personnes, tri, equipeSeule]);
  const trier = (cle) => setTri((t) => ({ cle, sens: t.cle === cle ? -t.sens : cle === "nom" ? 1 : -1 }));
  return (
    <Cadre titre={`Par personne · ${personnes.length}`}
      aide={`Pages et temps total sur les ${jours} derniers jours ; les connexions sur 7 et 30 jours quelle que soit la période. Cliquez une ligne pour voir ses sessions, page par page.`}
      droite={
        <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] text-ardoise">
          <input type="checkbox" checked={equipeSeule} onChange={(e) => setEquipeSeule(e.target.checked)} className="accent-[rgb(var(--k-menthe-rgb))]" />
          L'équipe seulement
        </label>
      }>
      {lignes.length ? (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-bord">
                {COLONNES.map((col) => (
                  <th key={col.cle} className={`py-2 text-[11px] font-normal uppercase tracking-[.12em] ${col.gauche ? "text-left" : "text-right"} ${tri.cle === col.cle ? "text-encre" : "text-brume"}`}>
                    <button type="button" onClick={() => trier(col.cle)} className="uppercase tracking-[.12em] hover:text-encre" style={{ background: "transparent" }}>
                      {col.mot}{tri.cle === col.cle ? (tri.sens > 0 ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                ))}
                <th className="py-2 pl-4 text-right text-[11px] font-normal uppercase tracking-[.12em] text-brume">14 jours</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((p) => {
                const ouv = ouverte === p.email;
                return (
                  <React.Fragment key={p.email}>
                    <tr onClick={() => setOuverte(ouv ? null : p.email)} className={`cursor-pointer border-b border-relief transition-colors ${ouv ? "bg-surface" : "hover:bg-surface"}`}>
                      <td className="max-w-[260px] py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <ChevronDown className={`h-3.5 w-3.5 flex-none text-brume transition-transform ${ouv ? "" : "-rotate-90"}`} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] text-encre">
                              {nomDe(p)}
                              {p.role === "admin" && <span className="ml-1.5 text-[11px] text-menthe">équipe</span>}
                              {p.role === "mandataire" && <span className="ml-1.5 text-[11px] text-ardoise">mandataire</span>}
                              {p.essai && <span className="ml-1.5 text-[11px] text-brume">essai</span>}
                            </span>
                            <span className="block truncate text-[11.5px] text-brume">{p.email}{p.page_favorite ? ` · surtout ${libellePage(p.page_favorite)}` : ""}</span>
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-encre">{p.pages}</td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-craie">{p.pages_derniere}<span className="text-brume"> · {dureeCourte(p.duree_derniere_ms)}</span></td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-craie">{p.sessions_7j}</td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-craie">{p.sessions_30j}</td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-craie">{dureeCourte(p.duree_moyenne_ms)}</td>
                      <td className="py-2.5 text-right text-[13px] tabular-nums text-craie">{dureeCourte(p.temps_ms)}</td>
                      <td className="whitespace-nowrap py-2.5 text-right text-[12px] text-ardoise" title={new Date(p.derniere).toLocaleString("fr-FR")}>{ilYa(p.derniere)}</td>
                      <td className="py-2.5 pl-4"><div className="flex justify-end"><MiniCourbe activite={p.activite} c={c} /></div></td>
                    </tr>
                    {ouv && (
                      <tr className="border-b border-relief bg-surface">
                        <td colSpan={COLONNES.length + 1} className="px-3"><SessionsDePersonne p={p} c={c} /></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="m-0 text-[12.5px] text-brume">Aucune activité sur la période.</p>}
    </Cadre>
  );
}
