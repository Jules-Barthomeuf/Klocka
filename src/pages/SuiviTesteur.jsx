import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Mail, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import OngletsSuivi from "@/components/OngletsSuivi";

// Suivi > Agent testeur (10 oct. 2026) : les audits lancés depuis le bouton,
// un rapport ouvert : résumé, notes, problèmes avec leurs captures, tâches,
// couverture, erreurs techniques, et le prompt de correction à copier.

const req = (m, chemin, body) => base44.request(m, `/api/testeur${chemin}`, body ? { body } : undefined);
const CATEGORIES = [["fonctionnel", "Fonctionnel"], ["taches", "Tâches"], ["interface", "Interface"], ["performance", "Performance"], ["accessibilite", "Accessibilité"]];
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const tonGravite = { bloquant: "bg-alerte/15 text-alerte", genant: "bg-ambre/15 text-ambre", detail: "bg-relief text-craie" };
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";

function Note({ v, d }) {
  const ton = v == null ? "text-brume" : v >= 8 ? "text-menthe" : v >= 5 ? "text-encre" : "text-alerte";
  return <span className={`tabular-nums ${ton}`}>{v ?? "—"}{d ? <span className={`ml-1 text-[11px] ${d > 0 ? "text-menthe" : "text-alerte"}`}>{d > 0 ? "+" : ""}{d}</span> : null}</span>;
}

function Rapport({ id, onFerme }) {
  const q = useQuery({ queryKey: ["testeur", "rapport", id], queryFn: () => req("GET", `/rapports/${id}`), refetchInterval: (x) => (x.state.data?.rapport?.etat === "en_cours" ? 5000 : false) });
  const renvoyer = useMutation({ mutationFn: () => req("POST", `/rapports/${id}/renvoyer`, {}), onSuccess: (r) => toast.success(r.envoi?.ok ? "Mail renvoyé" : `Mail : ${r.envoi?.error || "échec"}`) });
  const arreter = useMutation({ mutationFn: () => req("POST", `/rapports/${id}/arreter`, {}), onSuccess: () => toast.success("Arrêt demandé") });
  const [grande, setGrande] = useState(null);
  const [copie, setCopie] = useState(false);
  const r = q.data?.rapport;
  if (!r) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const captureDe = (nom) => (r.captures || []).find((c) => c.fichier === nom) || null;
  const copier = async () => { try { await navigator.clipboard.writeText(r.prompt_correction || ""); setCopie(true); setTimeout(() => setCopie(false), 1500); } catch { toast.error("Copie impossible"); } };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">{r.vue} · {quand(r.lance_le)} · {r.lance_par}</p>
          <h2 className="m-0 mt-1 text-[24px] font-normal leading-[1.15] text-encre">{r.page}<span className="text-ardoise"> · {r.url}</span></h2>
          {r.note && <p className="m-0 mt-1 text-[13px] text-ardoise">Consigne : {r.note}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {r.etat === "en_cours" && <button type="button" onClick={() => arreter.mutate()} className={bouton}><Square className="h-3.5 w-3.5" />Arrêter</button>}
          {r.etat === "fini" && <button type="button" onClick={() => renvoyer.mutate()} disabled={renvoyer.isPending} className={bouton}><Mail className="h-3.5 w-3.5" />Renvoyer le mail</button>}
          {r.trace_url && <a href={r.trace_url} className={bouton}>Trace Playwright</a>}
          <button type="button" onClick={onFerme} className={bouton}>Tous les rapports</button>
        </div>
      </div>
      {r.etat === "en_cours" && <p className="m-0 inline-flex items-center gap-2 rounded-bloc border border-menthe/40 px-4 py-3 text-[14px] text-encre"><Loader2 className="h-4 w-4 animate-spin text-menthe" />{r.avancement?.texte}</p>}
      {r.etat === "erreur" && <p className="m-0 rounded-bloc border border-alerte/40 px-4 py-3 text-[14px] text-craie">L'audit s'est arrêté sur une erreur : {r.erreur}</p>}
      {r.etat === "fini" && (<>
        <p className="m-0 text-[15px] leading-[1.55] text-encre">{r.resume}</p>
        <div className="grid gap-3 sm:grid-cols-5">
          {CATEGORIES.map(([k, mot]) => <div key={k} className="rounded-bloc border border-trait px-4 py-3"><p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{mot}</p><p className="m-0 mt-1 text-[24px] font-light"><Note v={r.notes?.[k]} d={r.variation?.[k]} /><span className="text-[13px] text-brume"> / 10</span></p></div>)}
        </div>
        <section>
          <h3 className={titreCase}>Les problèmes, les plus graves d'abord</h3>
          <div className="flex flex-col">
            {(r.problemes || []).map((p, i) => {
              const c = p.capture ? captureDe(p.capture) : null;
              return (
                <article key={i} className="grid gap-4 border-t border-trait py-4 first:border-t-0 md:grid-cols-[minmax(0,1fr)_200px]">
                  <div className="min-w-0">
                    <p className="m-0 flex flex-wrap items-center gap-2 text-[15px] text-encre"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] ${tonGravite[p.gravite] || tonGravite.detail}`}>{p.gravite}</span>{p.titre}<span className="text-[12px] text-brume">{p.famille} · {p.effort}</span></p>
                    <p className="m-0 mt-1.5 text-[13.5px] text-craie"><span className="text-ardoise">Reproduire : </span>{p.reproduire}</p>
                    {p.cause_probable && <p className="m-0 mt-1 text-[13.5px] text-craie"><span className="text-ardoise">Cause probable : </span>{p.cause_probable}</p>}
                    <p className="m-0 mt-1 text-[13.5px] text-encre"><span className="text-ardoise">Correction : </span>{p.correction}</p>
                  </div>
                  {c && <button type="button" onClick={() => setGrande(c)} className="overflow-hidden rounded-champ border border-trait p-0" style={{ background: "transparent" }}><img src={c.url} alt={c.nom} className="block h-[120px] w-full object-cover object-top" /></button>}
                </article>
              );
            })}
            {!(r.problemes || []).length && <p className="m-0 py-6 text-[14px] text-brume">Aucun problème relevé.</p>}
          </div>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <section><h3 className={titreCase}>Les tâches jouées</h3>{(r.taches || []).length ? <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px] text-craie">{r.taches.map((t, i) => <li key={i}><span className={t.resultat === "reussie" ? "text-menthe" : "text-alerte"}>{t.resultat}</span> · {t.tache} · {t.clics} clics{t.hesitations ? `, ${t.hesitations} hésitation(s)` : ""}</li>)}</ul> : <p className="m-0 text-[13.5px] text-brume">Aucune.</p>}</section>
          <section><h3 className={titreCase}>Ce qui est réussi</h3><ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px] text-craie">{(r.reussi || []).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
          <section><h3 className={titreCase}>Couverture</h3><p className="m-0 text-[13.5px] text-craie"><span className="text-ardoise">Testé : </span>{(r.couverture?.teste || []).join(", ") || "-"}</p><p className="m-0 mt-1 text-[13.5px] text-craie"><span className="text-ardoise">Pas testé : </span>{(r.couverture?.pas_teste || []).join(", ") || "-"}</p></section>
          <section><h3 className={titreCase}>Ce qu'un analyste aurait pensé</h3><ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13.5px] text-craie">{(r.hesitations || []).slice(0, 8).map((h, i) => <li key={i}>« {h.texte} »</li>)}{!(r.hesitations || []).length && <li className="text-brume">Pas d'hésitation notée.</li>}</ul></section>
        </div>
        <section>
          <h3 className={titreCase}>Les captures ({(r.captures || []).length})</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">{(r.captures || []).map((c) => <button key={c.fichier} type="button" onClick={() => setGrande(c)} className="overflow-hidden rounded-champ border border-trait p-0 text-left" style={{ background: "transparent" }}><img src={c.url} alt={c.nom} loading="lazy" className="block h-[90px] w-full object-cover object-top" /><span className="block truncate px-2 py-1 text-[11px] text-ardoise">{c.vue} · {c.theme} · {c.nom}</span></button>)}</div>
        </section>
        <section>
          <h3 className={titreCase}>Erreurs techniques ({(r.erreurs_techniques || []).length}) · chargement {r.chargement_ms} ms · clavier : focus perdu {r.clavier?.perdus ?? "?"} fois</h3>
          <ul className="m-0 flex max-h-[260px] list-none flex-col gap-1 overflow-y-auto p-0 font-mono text-[12px] text-craie">{(r.erreurs_techniques || []).map((e, i) => <li key={i}><span className="text-brume">{e.type}</span> {e.texte}</li>)}</ul>
        </section>
        <section>
          <div className="flex items-center justify-between gap-3"><h3 className={titreCase}>À coller dans Claude Code</h3><button type="button" onClick={copier} className={bouton}>{copie ? <Check className="h-3.5 w-3.5 text-menthe" /> : <Copy className="h-3.5 w-3.5" />}Copier</button></div>
          <pre className="m-0 whitespace-pre-wrap rounded-bloc border border-trait bg-surface p-4 font-mono text-[12.5px] leading-[1.5] text-craie">{r.prompt_correction}</pre>
        </section>
        <p className="m-0 text-[12px] text-brume">{r.pas} pas · {r.mail ? `mail ${r.mail}` : ""}{r.cout_usd != null ? ` · ${Number(r.cout_usd).toFixed(2)} $` : ""}</p>
      </>)}
      {grande && (
        <div role="dialog" aria-modal="true" aria-label={grande.nom} className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" onClick={() => setGrande(null)}>
          <img src={grande.url} alt={grande.nom} className="max-h-full max-w-full rounded-bloc border border-bord-doux" />
        </div>
      )}
    </div>
  );
}

export default function SuiviTesteur() {
  const { search } = useLocation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(() => new URLSearchParams(search).get("rapport"));
  useEffect(() => { const id = new URLSearchParams(search).get("rapport"); if (id) setOuvert(id); }, [search]);
  const q = useQuery({ queryKey: ["testeur", "rapports"], queryFn: () => req("GET", "/rapports"), refetchInterval: (x) => ((x.state.data?.rapports || []).some((r) => r.etat === "en_cours") ? 5000 : false) });
  const rapports = q.data?.rapports || [];
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-6">
      <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre">Suivi</h1>
      <OngletsSuivi className="mt-4 mb-6" />
      {ouvert ? <Rapport id={ouvert} onFerme={() => { setOuvert(null); qc.invalidateQueries({ queryKey: ["testeur"] }); }} /> : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[14px] text-ardoise">Le bouton en haut à droite lance l'agent sur la page ouverte : bac à sable, exploration, critique, rapport par mail. Les rapports restent ici.</p>
          <div className="overflow-x-auto rounded-bloc border border-trait">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <thead><tr>{["Page", "Lancé", "État", "Notes", "Problèmes", "Coût"].map((h) => <th key={h} className="border-b border-trait px-3 py-3 text-[12px] font-normal text-ardoise">{h}</th>)}</tr></thead>
              <tbody>
                {rapports.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-relief/40" onClick={() => setOuvert(r.id)}>
                    <td className="border-b border-trait px-3 py-3"><span className="block text-[14.5px] text-encre">{r.page}</span><span className="block text-[12px] text-ardoise">{r.vue}{r.note ? ` · ${r.note.slice(0, 50)}` : ""}</span></td>
                    <td className="border-b border-trait px-3 py-3 text-craie">{quand(r.lance_le)}</td>
                    <td className="border-b border-trait px-3 py-3">{r.etat === "en_cours" ? <span className="inline-flex items-center gap-1.5 text-menthe"><Loader2 className="h-3.5 w-3.5 animate-spin" />{r.avancement?.phase}</span> : r.etat === "erreur" ? <span className="text-alerte">erreur</span> : <span className="text-craie">fini</span>}</td>
                    <td className="border-b border-trait px-3 py-3 text-[12.5px]">{r.notes ? CATEGORIES.map(([k]) => <span key={k} className="mr-2"><Note v={r.notes[k]} d={r.variation?.[k]} /></span>) : "—"}</td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-craie">{r.n_problemes ?? "—"}{r.n_bloquants ? <span className="text-alerte"> · {r.n_bloquants} bloquant(s)</span> : null}</td>
                    <td className="border-b border-trait px-3 py-3 tabular-nums text-ardoise">{r.cout_usd != null ? `${Number(r.cout_usd).toFixed(2)} $` : "—"}</td>
                  </tr>
                ))}
                {!rapports.length && !q.isLoading && <tr><td colSpan={6} className="px-3 py-10 text-center text-[14px] text-brume">Aucun audit encore. Ouvrez une page et appuyez sur le bouton en haut à droite.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
