import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { quand, jour } from "@/components/haka/competences-outils";
import { sourceDe } from "@/lib/sources";

// Les trois derniers onglets de la fiche d'une compétence (17 oct. 2026, spec de Jules) :
// Tests (le brouillon et la version publiée côte à côte, les écarts surlignés), Exécutions
// (les derniers lancements, leur trace au clic), Historique (versions, diff, retour arrière,
// rejets et corrections humaines : la matière de la version suivante).

const euros = (x) => `${Number(x || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const MOTS_VERDICT = { ecarte: "Écarté", a_verifier: "À vérifier", conforme: "Conforme" };
const STATUTS = { en_attente: "En attente", en_cours: "En cours", a_valider: "À valider", en_pause: "En pause", faite: "Faite", echec: "Échec", annulee: "Annulée" };
const TEINTE_STATUT = { faite: "bg-menthe", a_valider: "bg-ambre", en_pause: "bg-ambre", echec: "bg-alerte", annulee: "bg-bord-vif", en_cours: "bg-menthe", en_attente: "bg-bord-vif" };
const Vide = ({ children }) => <p className="m-0 py-10 text-center text-[14px] text-brume">{children}</p>;
const Etiquette = ({ children }) => <p className="m-0 mb-1.5 text-[11px] uppercase tracking-[.14em] text-brume">{children}</p>;

function Colonne({ titre, r }) {
  return (
    <div className="min-w-0 rounded-[12px] border border-trait p-3.5">
      <Etiquette>{titre}</Etiquette>
      {r?.verdict ? (
        <>
          <p className="m-0 text-[14.5px] text-encre">{MOTS_VERDICT[r.verdict] || r.verdict}{r.rendement != null ? <span className="text-ardoise"> · {String(r.rendement).replace(".", ",")} %</span> : null}</p>
          {r.motif && <p className="m-0 mt-1 text-[13px] leading-[1.5] text-craie">{r.motif}</p>}
          {r.points?.length > 1 && <ul className="m-0 mt-2 list-none p-0 text-[12.5px] text-ardoise">{r.points.slice(1).map((p) => <li key={p} className="py-0.5">{p}</li>)}</ul>}
        </>
      ) : <p className="m-0 text-[13px] text-brume">Pas de verdict chiffré</p>}
    </div>
  );
}

export function OngletTests({ c, onTester, enCours }) {
  const q = useQuery({ queryKey: ["haka-competence-tests", c.cle], queryFn: () => base44.request("GET", `/api/haka/competences/${c.cle}/tests`), retry: false });
  if (q.isLoading) return <Chargement taille="grand" />;
  if (!c.brouillon) return <Vide>Pas de brouillon à tester. Modifiez la compétence dans « Définition » : un test compare le brouillon à la version publiée, sans rien écrire sur les dossiers.</Vide>;
  const tests = (q.data?.tests || []).map((t) => t.comparaison);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[70ch] text-[13.5px] leading-[1.55] text-ardoise">Le brouillon est lancé sur chaque dossier de test, en lecture seule : rien n'est écrit sur les dossiers ni dans la file. Le résultat est comparé à la version publiée ; les écarts sont surlignés.</p>
        <button type="button" onClick={onTester} disabled={enCours} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-menthe/60 px-4 text-[13px] text-encre hover:bg-menthe/10 disabled:opacity-40" style={{ background: "transparent" }}>{enCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tests.length ? "Relancer" : "Tester"}</button>
      </div>
      {!tests.length ? <Vide>Aucun test n'a tourné sur ce brouillon.</Vide> : tests.map((t, i) => (
        <div key={`${t.dossier}-${i}`} className="rounded-[16px] border border-trait bg-rail p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-[15px] text-encre">{t.titre || t.dossier}</p>
            {!t.erreur && <p className="m-0 text-[12.5px] tabular-nums text-ardoise">{euros(t.cout_eur)} · {Math.max(1, t.duree_ms || 0)} ms</p>}
          </div>
          {t.erreur ? <p className="m-0 mt-2 text-[13.5px] text-alerte">{t.erreur}</p> : (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-2"><Colonne titre="Version publiée" r={t.publiee} /><Colonne titre="Brouillon" r={t.brouillon} /></div>
              {t.note && <p className="m-0 mt-3 text-[12.5px] text-ardoise">{t.note}</p>}
              {t.ecarts?.length > 0 ? (
                <ul className="m-0 mt-3 list-none p-0">{t.ecarts.map((e) => <li key={e} className="my-1 rounded-[8px] bg-ambre/15 px-3 py-1.5 text-[13px] text-encre">{e}</li>)}</ul>
              ) : <p className="m-0 mt-3 text-[13px] text-menthe">Aucun écart avec la version publiée.</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function Trace({ id }) {
  const q = useQuery({ queryKey: ["haka-execution", id], queryFn: () => base44.request("GET", `/api/haka/executions/${id}`), retry: false });
  if (q.isLoading) return <p className="m-0 py-3 text-[13px] text-brume">Chargement…</p>;
  const e = q.data?.execution;
  if (!e) return <p className="m-0 py-3 text-[13px] text-brume">La trace n'est pas lisible.</p>;
  return (
    <div className="grid gap-5 py-4 md:grid-cols-2">
      <div>
        <Etiquette>Sources</Etiquette>
        <p className="m-0 text-[13px] text-craie">{e.sources_actives.length ? `Actives : ${e.sources_actives.map((k) => sourceDe(k).nom).join(", ")}` : "Auto : Haka a choisi parmi les sources autorisées."}</p>
        {e.sources_eteintes.length > 0 && <p className="m-0 mt-1 text-[13px] text-ambre">Éteintes : {e.sources_eteintes.map((k) => sourceDe(k).nom).join(", ")}</p>}
        <div className="mt-4"><Etiquette>Étapes</Etiquette>
          <ul className="m-0 list-none p-0 text-[13px]">{e.etapes.map((p) => <li key={p.nom} className="flex items-baseline justify-between gap-3 py-1"><span className="text-craie">{p.nom}{p.externe ? <span className="text-brume"> · vers l'extérieur</span> : null}</span><span className="text-ardoise">{p.etat}{p.erreur ? ` · ${p.erreur}` : ""}</span></li>)}</ul>
        </div>
      </div>
      <div>
        <Etiquette>Outils appelés</Etiquette>
        {e.outils_appeles.length ? <ul className="m-0 list-none p-0 text-[13px]">{e.outils_appeles.map((o, i) => <li key={i} className="py-1"><span className={o.refuse ? "text-alerte" : "text-encre"}>{sourceDe(o.outil).nom}{o.refuse ? " · refusé (non autorisé)" : ""}</span>{o.sortie && <span className="block text-ardoise">{o.sortie}</span>}</li>)}</ul> : <p className="m-0 text-[13px] text-brume">Aucun appel d'outil consigné.</p>}
        <div className="mt-4"><Etiquette>Sorties et décisions</Etiquette>
          {e.propositions.length ? <ul className="m-0 list-none p-0 text-[13px]">{e.propositions.map((p) => <li key={p.id} className="py-1 text-craie">{p.titre}<span className="text-ardoise"> · {p.etat === "proposee" ? "à valider" : p.etat}{p.decidee_par ? ` par ${p.decidee_par.split("@")[0]}` : ""}</span>{p.motif_rejet && <span className="block text-ambre">Motif : {p.motif_rejet}</span>}</li>)}</ul> : <p className="m-0 text-[13px] text-brume">Aucune sortie dans la file.</p>}
        </div>
      </div>
    </div>
  );
}

export function OngletExecutions({ c }) {
  const [ouverte, setOuverte] = useState(null);
  const q = useQuery({ queryKey: ["haka-competence-executions", c.cle], queryFn: () => base44.request("GET", `/api/haka/competences/${c.cle}/executions`), retry: false, refetchInterval: 30_000 });
  if (q.isLoading) return <Chargement taille="grand" />;
  const liste = q.data?.executions || [];
  if (!liste.length) return <Vide>Cette compétence n'a pas encore tourné. Chaque lancement s'inscrit ici avec sa version, son coût et sa trace.</Vide>;
  return (
    <div className="overflow-x-auto rounded-[16px] border border-trait">
      <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
        <thead><tr className="border-b border-trait text-[11px] uppercase tracking-[.14em] text-brume">{["Date", "Déclencheur", "Dossier", "Version", "Statut", "Coût"].map((t) => <th key={t} className="px-4 py-3 font-normal">{t}</th>)}</tr></thead>
        <tbody>
          {liste.map((e) => (
            <React.Fragment key={e.id}>
              <tr onClick={() => setOuverte(ouverte === e.id ? null : e.id)} className="cursor-pointer border-b border-trait transition-colors hover:bg-encre/[0.03]">
                <td className="whitespace-nowrap px-4 py-3 text-craie">{quand(e.cree_le)}</td>
                <td className="px-4 py-3 text-craie">{e.declencheur || "—"}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-craie">{e.dossier || "—"}</td>
                <td className="px-4 py-3 tabular-nums text-craie">{e.version ? `v${e.version}` : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-craie"><span className={`mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle ${TEINTE_STATUT[e.statut] || "bg-bord-vif"}`} />{STATUTS[e.statut] || e.statut}</td>
                <td className="px-4 py-3 tabular-nums text-craie">{euros(e.cout_eur)}</td>
              </tr>
              {ouverte === e.id && <tr className="border-b border-trait bg-rail"><td colSpan={6} className="px-5"><Trace id={e.id} /></td></tr>}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Diff({ cle, de, vers }) {
  const q = useQuery({ queryKey: ["haka-diff", cle, de, vers], queryFn: () => base44.request("GET", `/api/haka/competences/${cle}/historique?de=${de}&vers=${vers}`), retry: false });
  const d = q.data?.diff;
  if (q.isLoading) return <p className="m-0 py-3 text-[13px] text-brume">Chargement…</p>;
  if (!d) return <p className="m-0 py-3 text-[13px] text-brume">Pas de différence lisible.</p>;
  const lignes = d.corps.filter((x) => x.genre !== "=");
  const fmt = (v) => (Array.isArray(v) ? v.map((x) => x.cle || x).join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v ?? "—"));
  return (
    <div className="py-3 text-[13px]">
      {d.entete.length === 0 && lignes.length === 0 && <p className="m-0 text-brume">Aucune différence entre ces deux versions.</p>}
      {d.entete.map((x) => <p key={x.champ} className="m-0 py-1 text-craie"><span className="font-mono text-[12px] text-ardoise">{x.champ}</span> : <span className="text-alerte line-through">{fmt(x.avant)}</span> <span className="text-menthe">{fmt(x.apres)}</span></p>)}
      {lignes.length > 0 && <pre className="m-0 mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-trait bg-surface p-3 font-mono text-[12.5px] leading-[1.55]">{lignes.map((l, i) => <span key={i} className={`block ${l.genre === "+" ? "bg-menthe/15 text-encre" : "bg-alerte/15 text-encre"}`}>{l.genre} {l.texte}</span>)}</pre>}
    </div>
  );
}

export function OngletHistorique({ c, onRaf }) {
  const q = useQuery({ queryKey: ["haka-competence-historique", c.cle, c.version], queryFn: () => base44.request("GET", `/api/haka/competences/${c.cle}/historique`), retry: false });
  const [diff, setDiff] = useState(null);
  const republier = useMutation({ mutationFn: (version) => base44.request("POST", `/api/haka/competences/${c.cle}/republier`, { body: { version } }), onSuccess: (r) => { toast.success(`Republiée en version ${r.competence.version}`); onRaf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  if (q.isLoading) return <Chargement taille="grand" />;
  const versions = q.data?.versions || [];
  const s = q.data?.stats || { rejets_recents: [], corrections: [] };
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <Etiquette>Versions</Etiquette>
        <div className="rounded-[16px] border border-trait">
          {versions.map((v, i) => {
            const precedente = versions[i + 1];
            return (
              <div key={v.version} className="border-b border-trait px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 text-[14.5px] text-encre">v{v.version}{v.publiee ? <span className="ml-2 rounded-full bg-menthe/15 px-2 py-0.5 text-[11.5px] text-menthe">publiée</span> : null}</p>
                  <span className="flex gap-1.5">
                    {precedente && <button type="button" onClick={() => setDiff(diff === v.version ? null : v.version)} className="h-7 rounded-full border border-trait px-3 text-[12px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>{diff === v.version ? "Masquer le diff" : `Diff avec v${precedente.version}`}</button>}
                    {!v.publiee && <button type="button" onClick={() => republier.mutate(v.version)} disabled={republier.isPending} className="h-7 rounded-full border border-trait px-3 text-[12px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Republier cette version</button>}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{jour(v.publiee_le)}{v.par ? ` · ${v.par.split("@")[0]}` : ""}{v.note ? ` · ${v.note}` : ""}</p>
                {diff === v.version && precedente && <Diff cle={c.cle} de={precedente.version} vers={v.version} />}
              </div>
            );
          })}
          {!versions.length && <Vide>Pas encore de version publiée.</Vide>}
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <div>
          <Etiquette>Rejets récents · avec leur motif</Etiquette>
          {s.rejets_recents.length ? <ul className="m-0 list-none p-0">{s.rejets_recents.map((r) => <li key={r.id} className="border-t border-trait py-2.5 first:border-t-0"><p className="m-0 text-[13.5px] text-encre">{r.titre}</p><p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{r.motif || "Sans motif"}{r.par ? ` · ${r.par.split("@")[0]}` : ""}{r.le ? ` · ${jour(r.le)}` : ""}</p></li>)}</ul> : <p className="m-0 text-[13px] text-brume">Aucun rejet sur 90 jours.</p>}
        </div>
        <div>
          <Etiquette>Corrections humaines · ce qu'on a retouché après Haka</Etiquette>
          {s.corrections.length ? <ul className="m-0 list-none p-0">{s.corrections.map((r) => <li key={r.id} className="border-t border-trait py-2.5 first:border-t-0"><p className="m-0 text-[13.5px] text-encre">{r.titre}</p><p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{r.par ? `Corrigé par ${r.par.split("@")[0]}` : "Corrigé"}{r.le ? ` · ${jour(r.le)}` : ""}</p></li>)}</ul> : <p className="m-0 text-[13px] text-brume">Aucune correction sur 90 jours.</p>}
        </div>
        <p className="m-0 text-[12.5px] leading-[1.55] text-ardoise">Haka n'apprend pas seul : ces rejets et ces corrections sont la matière de la version suivante, que vous écrivez.</p>
      </div>
    </div>
  );
}
