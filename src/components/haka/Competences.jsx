import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { sourceDe } from "@/lib/sources";

// Paramètres › Compétences (17 oct. 2026, Jules seul) : les recettes de Haka.
// À gauche la liste, à droite la compétence ouverte : son en-tête (nom,
// déclencheurs, entrées, outils avec leurs obligatoires, livrable, qui valide)
// et sa recette en texte. On enregistre un brouillon, puis on publie : chaque
// publication fait une version, que Haka note sur ce qu'il produit.

const champ = "w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
const etiquette = "mb-1 block text-[11px] uppercase tracking-[.14em] text-brume";
const DECLENCHEURS = [["chat", "Le chat"], ["dossier", "Un dossier ouvert"], ["mail", "Un mail à sourcing@"], ["automatique", "Tout seul"]];
const VALIDE = [["responsable", "Le responsable du dossier"], ["jules", "Jules"], ["personne", "Personne : rien ne sort"]];
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function Editeur({ c, outilsConnus }) {
  const qc = useQueryClient();
  const depart = () => ({ ...{ nom: c.nom, resume: c.resume || "", declencheurs: c.declencheurs || [], entrees: (c.entrees || []).join("\n"), outils: c.outils || [], livrable: c.livrable || "", format: c.format || "", valide_par: c.valide_par || "responsable", corps: c.corps || "" }, ...(c.brouillon ? { ...c.brouillon, entrees: (c.brouillon.entrees || []).join("\n") } : {}) });
  const [v, setV] = useState(depart);
  useEffect(() => { setV(depart()); }, [c.cle, c.version, c.brouillon?.modifie_le]);
  const raf = () => qc.invalidateQueries({ queryKey: ["haka-competences"] });
  const enregistrer = useMutation({ mutationFn: () => base44.request("PUT", `/api/haka/competences/${c.cle}`, { body: v }), onSuccess: () => { toast.success("Brouillon enregistré"); raf(); }, onError: (e) => toast.error(e?.message || "Impossible") });
  const publier = useMutation({
    mutationFn: async () => { await base44.request("PUT", `/api/haka/competences/${c.cle}`, { body: v }); return base44.request("POST", `/api/haka/competences/${c.cle}/publier`, { body: {} }); },
    onSuccess: (r) => { toast.success(`Version ${r.competence.version} publiée${r.exporte?.ok ? ", exportée dans le dépôt" : ""}`); raf(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const abandonner = useMutation({ mutationFn: () => base44.request("POST", `/api/haka/competences/${c.cle}/abandonner`, { body: {} }), onSuccess: () => { toast.success("Brouillon abandonné"); raf(); } });
  const outil = (cle) => v.outils.find((o) => o.cle === cle);
  const basculerOutil = (cle) => setV((x) => ({ ...x, outils: outil(cle) ? x.outils.filter((o) => o.cle !== cle) : [...x.outils, { cle, obligatoire: false }] }));
  const basculerObligatoire = (cle) => setV((x) => ({ ...x, outils: x.outils.map((o) => (o.cle === cle ? { ...o, obligatoire: !o.obligatoire } : o)) }));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="m-0 text-[20px] text-encre">{c.nom}</p>
          <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">Version {c.version} publiée {quand(c.publiee_le)}{c.par ? ` par ${c.par.split("@")[0]}` : ""}{c.brouillon ? ` · brouillon du ${quand(c.brouillon.modifie_le)}` : ""}</p>
        </div>
        <span className="flex gap-2">
          {c.brouillon && <button type="button" onClick={() => abandonner.mutate()} className="h-9 rounded-full border border-trait px-3.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Abandonner le brouillon</button>}
          <button type="button" onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>{enregistrer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Enregistrer le brouillon"}</button>
          <button type="button" onClick={() => publier.mutate()} disabled={publier.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">{publier.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Publier</button>
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label><span className={etiquette}>Nom</span><input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} className={`${champ} h-10`} /></label>
        <label><span className={etiquette}>Format du livrable</span><input value={v.format} onChange={(e) => setV({ ...v, format: e.target.value })} placeholder="dossier, mail, loi, presentation…" className={`${champ} h-10`} /></label>
      </div>
      <label><span className={etiquette}>En une phrase</span><input value={v.resume} onChange={(e) => setV({ ...v, resume: e.target.value })} placeholder="Ce que la compétence fait, pour la carte" className={`${champ} h-10`} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className={etiquette}>Déclencheurs</span>
          <div className="flex flex-wrap gap-1.5">{DECLENCHEURS.map(([k, mot]) => { const on = v.declencheurs.includes(k); return <button key={k} type="button" onClick={() => setV({ ...v, declencheurs: on ? v.declencheurs.filter((x) => x !== k) : [...v.declencheurs, k] })} aria-pressed={on} className={`h-8 rounded-full border px-3 text-[12.5px] ${on ? "border-menthe bg-menthe/15 text-encre" : "border-trait text-craie hover:text-encre"}`} style={on ? undefined : { background: "transparent" }}>{mot}</button>; })}</div>
        </div>
        <div>
          <span className={etiquette}>Qui valide</span>
          <div className="flex flex-wrap gap-1.5">{VALIDE.map(([k, mot]) => <button key={k} type="button" onClick={() => setV({ ...v, valide_par: k })} aria-pressed={v.valide_par === k} className={`h-8 rounded-full border px-3 text-[12.5px] ${v.valide_par === k ? "border-menthe bg-menthe/15 text-encre" : "border-trait text-craie hover:text-encre"}`} style={v.valide_par === k ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
        </div>
      </div>
      <label><span className={etiquette}>Entrées (une par ligne)</span><textarea value={v.entrees} onChange={(e) => setV({ ...v, entrees: e.target.value })} rows={3} className={`${champ} resize-y py-2`} /></label>
      <div>
        <span className={etiquette}>Outils et sources · un clic ajoute, un second clic sur la pastille marque « obligatoire »</span>
        <div className="flex flex-wrap gap-1.5">
          {outilsConnus.map((cle) => {
            const s = sourceDe(cle); const Icone = s.icone; const o = outil(cle);
            return (
              <button key={cle} type="button" onClick={() => (o ? basculerObligatoire(cle) : basculerOutil(cle))} onContextMenu={(e) => { e.preventDefault(); if (o) basculerOutil(cle); }}
                title={o ? (o.obligatoire ? "Obligatoire · clic droit pour retirer" : "Autorisé · clic : obligatoire, clic droit : retirer") : "Ajouter"}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${o ? (o.obligatoire ? "border-menthe bg-menthe text-sur-menthe" : "border-menthe/60 bg-menthe/10 text-encre") : "border-trait text-craie hover:text-encre"}`} style={o ? undefined : { background: "transparent" }}>
                <Icone className="h-3 w-3" strokeWidth={1.8} />{s.nom}{o?.obligatoire ? " · obligatoire" : ""}
              </button>
            );
          })}
        </div>
      </div>
      <label><span className={etiquette}>Livrable</span><input value={v.livrable} onChange={(e) => setV({ ...v, livrable: e.target.value })} className={`${champ} h-10`} /></label>
      <label><span className={etiquette}>La recette</span><textarea value={v.corps} onChange={(e) => setV({ ...v, corps: e.target.value })} rows={14} className={`${champ} resize-y py-2.5 font-mono text-[13px] leading-[1.55]`} /></label>
      {c.versions?.length > 1 && (
        <details className="text-[13px] text-ardoise"><summary className="cursor-pointer">Versions ({c.versions.length})</summary>
          <ul className="m-0 mt-2 list-none p-0">{[...c.versions].reverse().map((x) => <li key={x.version} className="border-t border-trait py-1.5 first:border-t-0">v{x.version} · {quand(x.publiee_le)}{x.par ? ` · ${x.par.split("@")[0]}` : ""}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default function Competences() {
  const q = useQuery({ queryKey: ["haka-competences", "toutes"], queryFn: () => base44.request("GET", "/api/haka/competences"), retry: false });
  const [cle, setCle] = useState(null);
  const liste = q.data?.competences || [];
  const ouverte = liste.find((c) => c.cle === cle) || liste[0] || null;
  if (q.isLoading) return <Chargement taille="grand" />;
  if (q.isError) return <p className="m-0 py-8 text-[14px] text-ardoise">Les compétences ne sont pas lisibles ici : {q.error?.message || "erreur"}.</p>;
  return (
    <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Les compétences" className="flex flex-col gap-0.5">
        {liste.map((c) => (
          <button key={c.cle} type="button" onClick={() => setCle(c.cle)} aria-pressed={ouverte?.cle === c.cle}
            className={`flex items-baseline justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] ${ouverte?.cle === c.cle ? "bg-rail-actif text-encre" : "text-craie hover:bg-rail-actif hover:text-encre"}`} style={ouverte?.cle === c.cle ? undefined : { background: "transparent" }}>
            <span className="truncate">{c.nom}</span><span className="flex-none text-[11.5px] tabular-nums text-brume">v{c.version}{c.brouillon ? " ·" : ""}</span>
          </button>
        ))}
      </nav>
      {ouverte ? <Editeur key={ouverte.cle} c={ouverte} outilsConnus={q.data?.outils || []} /> : <p className="m-0 text-[14px] text-brume">Aucune compétence.</p>}
    </div>
  );
}
