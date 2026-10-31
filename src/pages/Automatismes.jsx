import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Loader2, Pause, Play, RotateCcw, Workflow, X, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { ilYa } from "@/components/dashboard/ChatDashboard";
import { Trace } from "@/components/haka/FicheOnglets";
import { createPageUrl } from "@/utils";

// Administration › Automatismes (17 oct. 2026, spec de Jules, § 11) : tout ce que Haka fait
// seul, quoi, quand, avec quel résultat aujourd'hui. Visible par l'équipe, en lecture ; Jules
// seul met en pause, reprend, lance et relance. Aucune configuration à part : la vue lit les
// compétences publiées et actives qui tournent sans qu'on les demande, et leurs exécutions.

const euros = (x) => `${Number(x || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const ETATS = { actif: ["Actif", "bg-menthe"], en_pause: ["En pause", "bg-bord-vif"], en_erreur: ["En erreur", "bg-alerte"] };
const TEINTE_RESULTAT = { "Écarté": "text-alerte", "À vérifier": "text-ambre", Conforme: "text-menthe", Erreur: "text-alerte", "Ignoré (en pause)": "text-brume" };
const prochaineLisible = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : "—");
const aujourdhui = () => new Date().toISOString().slice(0, 10);

function Detail({ a, peutAgir, onFermer }) {
  const qc = useQueryClient();
  const [jour, setJour] = useState(aujourdhui());
  const [trace, setTrace] = useState(null);
  const q = useQuery({ queryKey: ["haka-auto-detail", a.cle, jour], queryFn: () => base44.request("GET", `/api/haka/automatismes/${a.cle}/executions?date=${jour}`), refetchInterval: 30_000, retry: false });
  const raf = () => { qc.invalidateQueries({ queryKey: ["haka-auto-detail"] }); qc.invalidateQueries({ queryKey: ["haka-automatismes"] }); };
  const relancer = useMutation({ mutationFn: (id) => base44.request("POST", `/api/haka/executions/${id}/relancer`, { body: {} }), onSuccess: () => { toast.success("Relancée à l'étape qui avait échoué"); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const traiter = useMutation({ mutationFn: () => base44.request("POST", `/api/haka/automatismes/${a.cle}/ignores/traiter`, { body: {} }), onSuccess: (r) => { toast.success(`${r.lancees} événement${r.lancees > 1 ? "s" : ""} relancé${r.lancees > 1 ? "s" : ""}`); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const liste = q.data?.executions || [];
  return (
    <>
      <motion.div className="fixed inset-0 z-[60] bg-black/25" onClick={onFermer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
      <motion.aside role="dialog" aria-label={a.nom} className="fixed bottom-2 right-2 top-[66px] z-[61] flex w-[560px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[18px] border border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.28)]"
        initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
        <div className="flex items-center gap-3 border-b border-trait px-5 py-3.5">
          <div className="min-w-0 flex-1"><p className="m-0 truncate text-[15px] text-encre">{a.nom}</p><p className="m-0 truncate text-[12.5px] text-ardoise">{a.quand}</p></div>
          <input type="date" value={jour} max={aujourdhui()} onChange={(e) => setJour(e.target.value || aujourdhui())} aria-label="Jour" className="h-9 rounded-[10px] border border-trait bg-surface px-2.5 text-[13px] text-encre outline-none focus:border-menthe" />
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        {peutAgir && a.ignorees_en_attente > 0 && a.etat !== "en_pause" && (
          <div className="flex items-center justify-between gap-3 border-b border-trait bg-ambre/10 px-5 py-3 text-[13px] text-encre">
            <span>{a.ignorees_en_attente} événement{a.ignorees_en_attente > 1 ? "s" : ""} ignoré{a.ignorees_en_attente > 1 ? "s" : ""} pendant la pause.</span>
            <button type="button" onClick={() => traiter.mutate()} disabled={traiter.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">{traiter.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Traiter les ignorés</button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {q.isLoading ? <p className="m-0 px-3 py-6 text-[13.5px] text-brume">Chargement…</p> : !liste.length ? (
            <p className="m-0 px-3 py-10 text-center text-[13.5px] text-brume">Aucune exécution ce jour-là.</p>
          ) : liste.map((e) => (
            <div key={e.id} className="rounded-[12px] px-3 py-3 transition-colors hover:bg-encre/[0.03]">
              <div className="flex items-baseline gap-3">
                <span className="w-[42px] flex-none text-[12.5px] tabular-nums text-ardoise">{new Date(e.le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.45] text-encre">{e.evenement}</p>
                <span className={`flex-none text-[13px] ${TEINTE_RESULTAT[e.resultat] || "text-craie"}`}>{e.resultat}</span>
              </div>
              <div className="ml-[54px] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ardoise">
                {e.duree_s != null && <span>{String(e.duree_s).replace(".", ",")} s</span>}
                <span>{euros(e.cout_eur)}</span>
                {e.dossier && <Link to={`/Dossiers?deal_id=${e.dossier}`} className="inline-flex items-center gap-1 text-menthe hover:underline">Dossier<ExternalLink className="h-3 w-3" /></Link>}
                {e.proposition && <Link to={`/AValider?id=${e.proposition.id}`} className="inline-flex items-center gap-1 text-menthe hover:underline">À valider<ExternalLink className="h-3 w-3" /></Link>}
                {e.statut !== "ignoree" && <button type="button" onClick={() => setTrace(trace === e.id ? null : e.id)} className="text-craie underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>{trace === e.id ? "Masquer la trace" : "Trace"}</button>}
                {peutAgir && e.relancable && <button type="button" onClick={() => relancer.mutate(e.id)} disabled={relancer.isPending} className="inline-flex items-center gap-1 text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}><RotateCcw className="h-3 w-3" />Relancer</button>}
              </div>
              {e.erreur && (
                <div className="ml-[54px] mt-2">
                  <p className="m-0 text-[13px] text-alerte">{e.erreur.lisible}</p>
                  <details className="mt-1 text-[12px] text-brume"><summary className="cursor-pointer">Détail technique</summary><pre className="m-0 mt-1 whitespace-pre-wrap font-mono text-[11.5px]">{e.erreur.technique}</pre></details>
                </div>
              )}
              {trace === e.id && <div className="ml-[54px]"><Trace id={e.id} /></div>}
            </div>
          ))}
        </div>
      </motion.aside>
    </>
  );
}

// Les mails reçus avec une pièce, et ce que Haka en a fait (21 oct. 2026, Jules : « j'ai reçu une fiche, je n'ai pas eu
// de notification ») : proposée, en attente du prochain relevé, ou écartée, et pourquoi, en clair.
const VERDICTS = { proposee: ["Proposée", "text-menthe"], en_attente: ["Au prochain relevé", "text-ambre"], ecartee: ["Pas proposée", "text-ardoise"] };
function FichesRecues() {
  const q = useQuery({ queryKey: ["haka-fiches-recentes"], queryFn: () => base44.request("GET", "/api/haka/fiches/recentes?jours=3"), refetchInterval: 60_000, retry: false });
  const mails = q.data?.mails || [];
  return (
    <section className="mt-10">
      <p className="m-0 text-[17px] text-encre">Mails reçus avec une pièce, ces trois derniers jours</p>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Ce que l'Assistant KPartners en a fait : une fiche proposée vous a envoyé une notification ; sinon, la raison.</p>
      {q.isLoading ? <p className="m-0 py-6 text-[13.5px] text-brume">Lecture…</p> : !mails.length ? <p className="m-0 py-6 text-[13.5px] text-brume">Aucun mail avec une pièce ces trois derniers jours.</p> : (
        <div className="mt-3 flex flex-col">
          {mails.map((m) => {
            const [mot, teinte] = VERDICTS[m.verdict] || VERDICTS.ecartee;
            return (
              <div key={m.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-x-5 border-t border-trait py-3 max-md:grid-cols-1 max-md:gap-y-1">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-encre">{m.objet || "(sans objet)"}</span>
                  <span className="block truncate text-[12.5px] text-ardoise">{[String(m.de || "").replace(/<[^>]*>/g, "").trim(), m.date ? ilYa(m.date) : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="min-w-0 truncate text-[13px] text-craie" title={m.pieces.join(", ")}>{m.pieces.join(", ")}</span>
                <span className="min-w-0 text-[13px] leading-[1.45]"><span className={teinte}>{mot}</span><span className="text-ardoise"> · {m.raison}</span></span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function Automatismes() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["haka-automatismes"], queryFn: () => base44.request("GET", "/api/haka/automatismes"), refetchInterval: 30_000, retry: false });
  const [filtre, setFiltre] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const raf = () => qc.invalidateQueries({ queryKey: ["haka-automatismes"] });
  const action = useMutation({
    mutationFn: ({ cle, quoi }) => base44.request("POST", `/api/haka/automatismes/${cle}/${quoi}`, { body: {} }),
    onSuccess: (r, { quoi }) => { toast.success(quoi === "pause" ? "Mis en pause : les événements seront notés, pas perdus" : quoi === "reprendre" ? (r.ignorees ? `Repris · ${r.ignorees} ignoré${r.ignorees > 1 ? "s" : ""} à traiter dans le détail` : "Repris") : "Lancé"); raf(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  if (q.isLoading) return <Chargement taille="grand" />;
  if (q.isError) return <p className="m-0 px-6 py-10 text-center text-[14px] text-ardoise">Les automatismes ne sont pas lisibles : {q.error?.message || "erreur"}.</p>;
  const { automatismes = [], resume = {}, plafond = { crees: 0, max: 50, part: 0 }, peut_agir: peutAgir = false } = q.data || {};
  const ouverte = automatismes.find((a) => a.cle === ouvert) || null;
  const vues = automatismes.filter((a) => !filtre || (filtre === "executions" ? a.aujourdhui.executions : filtre === "a_valider" ? a.aujourdhui.a_valider : a.aujourdhui.erreurs) > 0);
  const jauge = plafond.part >= 100 ? "bg-alerte" : plafond.part >= 80 ? "bg-ambre" : "bg-menthe";
  const Chiffre = ({ cle, n, mot }) => (
    <button type="button" onClick={() => setFiltre(filtre === cle ? null : cle)} aria-pressed={filtre === cle}
      className={`rounded-full px-2 py-0.5 transition-colors ${filtre === cle ? "bg-menthe/15 text-encre" : "hover:text-encre"} ${cle === "erreurs" && n ? "text-alerte" : ""}`} style={filtre === cle ? undefined : { background: "transparent" }}>{n} {mot}</button>
  );
  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-16 pt-8 md:px-8">
      <h1 className="m-0 text-[26px] font-normal tracking-[-0.02em] text-encre">Automatismes</h1>
      <p className="m-0 mt-1 text-[14px] text-ardoise">Ce que l'Assistant KPartners fait seul : quoi, quand, avec quel résultat aujourd'hui.</p>
      {!automatismes.length ? (
        <div className="mt-16 text-center">
          <p className="m-0 text-[14.5px] text-craie">Aucun automatisme pour l'instant. Les compétences qui tournent seules apparaîtront ici.</p>
          {peutAgir && <Link to={createPageUrl("Personnalisation")} onClick={() => { try { localStorage.setItem("compte.section", "competences"); } catch { /* navigation privée */ } }} className="mt-3 inline-block text-[13.5px] text-menthe hover:underline">Paramètres › Compétences</Link>}
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4">
            <p className="m-0 flex flex-wrap items-center gap-1 text-[14px] text-craie">Aujourd'hui :
              <Chiffre cle="executions" n={resume.executions} mot={`exécution${resume.executions > 1 ? "s" : ""}`} />·
              <Chiffre cle="a_valider" n={resume.a_valider} mot={`proposition${resume.a_valider > 1 ? "s" : ""} en attente`} />·
              <Chiffre cle="erreurs" n={resume.erreurs} mot={`erreur${resume.erreurs > 1 ? "s" : ""}`} />
            </p>
            <div className="flex min-w-[260px] items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-rail-actif"><motion.div className={`h-full rounded-full ${jauge}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, plafond.part)}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} /></div>
              <span className={`text-[13px] tabular-nums ${plafond.part >= 100 ? "text-alerte" : plafond.part >= 80 ? "text-ambre" : "text-ardoise"}`}>{plafond.crees} / {plafond.max} dossiers créés aujourd'hui</span>
            </div>
          </div>
          <div className="mt-6 overflow-x-auto rounded-[16px] border border-trait">
            <table className="w-full min-w-[980px] border-collapse text-left text-[13.5px]">
              <thead><tr className="border-b border-trait text-[11px] uppercase tracking-[.14em] text-brume">{["Automatisme", "Quand", "État", "Dernière exécution", "Aujourd'hui", "Prochaine", "Coût du jour", ""].map((t, i) => <th key={i} className="px-4 py-3 font-normal">{t}</th>)}</tr></thead>
              <tbody>
                {vues.map((a) => {
                  const [mot, teinte] = ETATS[a.etat] || ETATS.actif;
                  return (
                    <tr key={a.cle} onClick={() => setOuvert(a.cle)} className="cursor-pointer border-b border-trait transition-colors last:border-b-0 hover:bg-encre/[0.03]">
                      <td className="px-4 py-3.5"><span className="flex items-center gap-2.5 text-[14.5px] text-encre"><span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-rail-actif text-craie"><Workflow className="h-3.5 w-3.5" /></span>{a.nom}</span></td>
                      <td className="max-w-[260px] px-4 py-3.5 text-craie">{a.quand}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-craie"><span className={`mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle ${teinte}`} />{mot}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-craie">{a.derniere ? <>{ilYa(a.derniere.le).replace(/^i/, "I")}<span className={TEINTE_RESULTAT[a.derniere.resultat] || "text-ardoise"}> · {a.derniere.resultat}</span></> : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-craie">{a.aujourdhui.executions} · {a.aujourdhui.a_valider} · <span className={a.aujourdhui.erreurs ? "text-alerte" : ""}>{a.aujourdhui.erreurs}</span></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-craie">{a.planifie ? prochaineLisible(a.prochaine) : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-craie">{euros(a.cout_jour_eur)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {peutAgir && (
                          <span className="inline-flex gap-1.5">
                            {a.lancable && <button type="button" onClick={() => action.mutate({ cle: a.cle, quoi: "lancer" })} disabled={action.isPending} title="Lancer maintenant, hors horaire" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}><Zap className="h-3 w-3" />Lancer maintenant</button>}
                            <button type="button" onClick={() => action.mutate({ cle: a.cle, quoi: a.etat === "en_pause" ? "reprendre" : "pause" })} disabled={action.isPending} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                              {a.etat === "en_pause" ? <><Play className="h-3 w-3" />Reprendre</> : <><Pause className="h-3 w-3" />Mettre en pause</>}
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!vues.length && <p className="m-0 py-8 text-center text-[13.5px] text-brume">Rien dans ce filtre aujourd'hui.</p>}
        </>
      )}
      <FichesRecues />
      <AnimatePresence>{ouverte && <Detail key={ouverte.cle} a={ouverte} peutAgir={peutAgir} onFermer={() => setOuvert(null)} />}</AnimatePresence>
    </div>
  );
}
