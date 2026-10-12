import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Modèle Zone (11 oct. 2026) : la page admin du score « Zone » de
// l'Off-market Simple, hors du menu. Les jugements, la version active, les
// cinq dernières versions et leurs mesures, les poids et leur évolution, les
// vingt derniers désaccords ; réentraîner, ou revenir à la version d'avant.

const req = (m, chemin, body) => base44.request(m, `/api/off-market/zone/modele${chemin}`, body ? { body } : undefined);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const etiquette = "m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-brume";
const bloc = "rounded-bloc border border-bord-doux bg-surface/40 p-5";
const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const nombre = (x, d = 3) => (x == null ? "—" : Number(x).toFixed(d).replace(".", ","));
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const LIBELLES_POIDS = { flux_pieton: "Flux piéton", touristes: "Touristes", densite_commerces_300m: "Commerces à 300 m", part_commerces_fermes_300m: "Commerces fermés à 300 m", distance_rue_commercante_principale_m: "Distance à la grande rue", impasse: "Impasse", place: "Place", naf_hors_cible: "Activité hors cible", enseigne_nationale: "Enseigne nationale", note_streetview_ia: "Note Street View" };

/** Une petite courbe de l'évolution d'un poids, du départ à aujourd'hui. */
function Courbe({ depart, points }) {
  const v = [depart, ...points.map((p) => p.valeur)];
  if (v.length < 2) return <span className="text-[12px] text-brume">inchangé</span>;
  const min = Math.min(...v); const max = Math.max(...v); const h = 22; const w = 120;
  const y = (x) => (max === min ? h / 2 : h - ((x - min) / (max - min)) * h);
  return <svg width={w} height={h} aria-hidden><polyline fill="none" stroke="currentColor" strokeWidth="1.5" className="text-menthe" points={v.map((x, i) => `${(i / (v.length - 1)) * w},${y(x)}`).join(" ")} /></svg>;
}

export default function AdminModeleZone() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["zone", "modele"], queryFn: () => req("GET", "") });
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["zone", "modele"] });
  const entrainer = useMutation({ mutationFn: () => req("POST", "/entrainer", {}), onSuccess: (r) => { if (r.ok) toast.success(`Version ${r.version} ${r.active ? "active" : "gardée mais pas activée"}`); else toast.info(r.raison); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const revenir = useMutation({ mutationFn: () => req("POST", "/revenir", {}), onSuccess: (r) => { toast.success(`Version ${r.version} rétablie`); rafraichir(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const d = q.data;
  if (q.isError) return <p className="px-6 py-10 text-[14px] text-ardoise">{q.error?.message || "Page réservée à l'équipe Klocka."}</p>;
  if (!d) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const j = d.jugements;
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Off-market · mode Simple</p>
          <h1 className="m-0 mt-1 text-[26px] font-normal leading-[1.15] text-encre">Modèle Zone</h1>
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">Version {d.actif.version} active{d.actif.type === "regles" ? " (règles, poids ajustés à chaque jugement)" : " (régression logistique)"} · depuis le {quand(d.actif.active_depuis)}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => revenir.mutate()} disabled={revenir.isPending} className={bouton}><RotateCcw className="h-3.5 w-3.5" />Revenir à la version précédente</button>
          <button type="button" onClick={() => entrainer.mutate()} disabled={entrainer.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">{entrainer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Réentraîner maintenant</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className={bloc}>
          <p className={etiquette}>Jugements</p>
          <p className="m-0 text-[32px] font-light leading-none text-encre tabular-nums">{j.total}</p>
          <p className="m-0 mt-2 text-[13px] text-ardoise">{j.exploitables} exploitables sur les {j.pour_apprendre} qu'il faut pour apprendre</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-encre/[0.12]"><div className="h-full bg-menthe" style={{ width: `${Math.min(100, (j.exploitables / j.pour_apprendre) * 100)}%` }} /></div>
        </div>
        <div className={bloc}>
          <p className={etiquette}>Par verdict</p>
          {Object.entries(j.par_verdict).map(([v, n]) => <div key={v} className="flex justify-between border-t border-trait py-1.5 text-[13.5px] first:border-t-0"><span className="text-craie">{d.verdicts[v]}</span><span className="tabular-nums text-encre">{n}</span></div>)}
        </div>
        <div className={bloc}>
          <p className={etiquette}>Raisons lues par l'IA</p>
          {Object.entries(j.par_raison).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([r, n]) => <div key={r} className="flex justify-between border-t border-trait py-1.5 text-[13.5px] first:border-t-0"><span className="text-craie">{d.raisons[r]}</span><span className="tabular-nums text-encre">{n}</span></div>)}
          {!Object.values(j.par_raison).some(Boolean) && <p className="m-0 text-[13px] text-brume">Aucune encore.</p>}
        </div>
      </div>

      <div className={bloc}>
        <p className={etiquette}>Les cinq dernières versions</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="text-[12px] text-ardoise">{["Version", "Type", "Entraînée", "Exemples", "AUC", "AUC de l'active", "Précision des 20 meilleurs", "Accord 7 jours", ""].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {d.versions.map((v) => (
                <tr key={v.id} className="border-t border-trait">
                  <td className="py-2 pr-4 text-encre">{v.version}</td>
                  <td className="py-2 pr-4 text-craie">{v.type === "regles" ? "Règles" : v.type === "logistique" ? "Régression" : v.type}</td>
                  <td className="py-2 pr-4 text-ardoise">{quand(v.trained_at)}</td>
                  <td className="py-2 pr-4 tabular-nums text-craie">{v.nb_exemples}</td>
                  <td className="py-2 pr-4 tabular-nums text-encre">{nombre(v.metriques.auc)}</td>
                  <td className="py-2 pr-4 tabular-nums text-ardoise">{nombre(v.metriques.auc_actif)}</td>
                  <td className="py-2 pr-4 tabular-nums text-craie">{pct(v.metriques.precision_20)}</td>
                  <td className="py-2 pr-4 tabular-nums text-craie">{pct(v.metriques.accord_7j)}</td>
                  <td className="py-2 text-[12px]">{v.actif ? <span className="rounded-full bg-menthe/20 px-2 py-0.5 text-encre">active</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={bloc}>
        <p className={etiquette}>{d.coefficients ? "Coefficients de la version active" : "Poids de la version à règles"}</p>
        {d.coefficients ? (
          <div className="grid gap-x-8 md:grid-cols-2">{Object.entries(d.coefficients).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, c]) => <div key={k} className="flex justify-between border-t border-trait py-1.5 text-[13.5px]"><span className="text-craie">{LIBELLES_POIDS[k] || k.replace(/_/g, " ")}</span><span className={`tabular-nums ${c > 0 ? "text-menthe" : "text-ardoise"}`}>{c > 0 ? "+" : ""}{nombre(c)}</span></div>)}</div>
        ) : (
          <table className="w-full text-left text-[13.5px]">
            <thead><tr className="text-[12px] text-ardoise">{["Caractéristique", "Départ", "Aujourd'hui", "Évolution", "Pourquoi"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {d.poids.map((p) => (
                <tr key={p.cle} className="border-t border-trait align-top">
                  <td className="py-2 pr-4 text-encre">{LIBELLES_POIDS[p.cle] || p.cle}</td>
                  <td className="py-2 pr-4 tabular-nums text-ardoise">{p.depart}</td>
                  <td className={`py-2 pr-4 tabular-nums ${p.valeur === p.depart ? "text-craie" : "text-encre"}`}>{String(Math.round(p.valeur * 100) / 100).replace(".", ",")}</td>
                  <td className="py-2 pr-4"><Courbe depart={p.depart} points={p.evolution} /></td>
                  <td className="py-2 text-[12.5px] text-ardoise">{p.raison}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={bloc}>
        <p className={etiquette}>Les vingt derniers désaccords</p>
        {!d.desaccords.length ? <p className="m-0 text-[13.5px] text-brume">Aucun : le score affiché allait dans le sens de chaque jugement.</p> : (
          <div className="flex flex-col">
            {d.desaccords.map((x) => (
              <a key={x.id} href={`/OffMarket?ville=${encodeURIComponent(x.ville_id || "")}&point=${encodeURIComponent(x.point_id)}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-trait py-2.5 text-left no-underline first:border-t-0 hover:bg-relief/30">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-encre">{x.commerce?.nom || "Commerce"}<span className="text-ardoise"> · {x.commerce?.adresse || ""}</span></span>
                  <span className="block text-[12.5px] text-craie">{d.verdicts[x.verdict]}{x.commentaire ? ` : « ${x.commentaire} »` : ""}</span>
                </span>
                <span className="text-right text-[12.5px] text-ardoise">score affiché <span className="tabular-nums text-encre">{x.score_affiche}</span> · v{x.version ?? "?"}<br />{x.par?.split("@")[0]} · {quand(x.le)}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className={bloc}>
        <p className={etiquette}>Journal</p>
        {d.journal.map((e) => <div key={e.id} className="flex justify-between gap-3 border-t border-trait py-1.5 text-[13px] first:border-t-0"><span className="text-craie">{e.type.replace(/_/g, " ")}{e.version != null ? ` · version ${e.version}` : ""}{e.motif ? ` · ${e.motif}` : ""}{e.resultat ? ` · ${e.resultat}` : ""}</span><span className="flex-none text-ardoise">{quand(e.le)}</span></div>)}
      </div>
    </div>
  );
}
