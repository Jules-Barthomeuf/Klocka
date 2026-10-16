import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Les objections à résoudre (16 oct. 2026, Jules) : chaque appel qui finit sur
// une objection non levée envoie quinze secondes d'audio ici. L'équipe écoute,
// propose la réponse qu'elle aurait donnée, et marque l'objection résolue.
// Rien ne s'affiche s'il n'y en a pas.

const prenom = (email) => { const p = String(email || "").split("@")[0].split(".")[0]; return p ? p.charAt(0).toUpperCase() + p.slice(1) : "?"; };
const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Objection({ o }) {
  const queryClient = useQueryClient();
  const [texte, setTexte] = useState("");
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["objections"] });
  const repondre = useMutation({
    mutationFn: () => base44.request("POST", `/api/objections/${o.id}/reponse`, { body: { texte } }),
    onSuccess: () => { setTexte(""); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const resoudre = useMutation({
    mutationFn: () => base44.request("POST", `/api/objections/${o.id}/resoudre`, { body: { resolue: true } }),
    onSuccess: () => { toast("Objection marquée résolue"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <div className="flex flex-col gap-3 border-t border-trait py-4 first:border-t-0 first:pt-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-ardoise">{[o.agence, `appel de ${prenom(o.par)}`, quand(o.le)].filter(Boolean).join(" · ")}</span>
        {o.sujet && <span className="rounded-full border border-trait px-2.5 py-0.5 text-[12px] text-craie">{o.sujet}</span>}
      </div>
      <p className="m-0 text-[15px] leading-[1.5] text-encre">« {o.phrase} »</p>
      {o.audio ? <audio controls preload="none" src={`/api/objections/${o.id}/audio`} className="h-9 w-full max-w-[460px]" /> : <span className="text-[12.5px] text-brume">Le clip est effacé (30 jours).</span>}
      {(o.reponses || []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          {o.reponses.map((r) => (
            <p key={r.le} className="m-0 text-[13.5px] leading-[1.5] text-craie"><span className="text-menthe">{prenom(r.par)} · </span>{r.texte}</p>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (texte.trim()) repondre.mutate(); }} className="flex flex-wrap items-center gap-2">
        <input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ce que vous auriez répondu…"
          className="h-10 min-w-[220px] flex-1 rounded-full border border-trait bg-transparent px-4 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
        <button type="submit" disabled={!texte.trim() || repondre.isPending} className="h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
          {repondre.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Proposer"}
        </button>
        <button type="button" onClick={() => resoudre.mutate()} disabled={resoudre.isPending} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          <Check className="h-4 w-4" />Résolue
        </button>
      </form>
    </div>
  );
}

export default function ObjectionsAResoudre({ className = "" }) {
  const { data } = useQuery({ queryKey: ["objections"], queryFn: () => base44.request("GET", "/api/objections"), refetchInterval: 60_000 });
  const liste = data?.objections || [];
  if (!liste.length) return null;
  return (
    <section className={`rounded-[18px] border border-trait bg-rail px-5 pb-2 pt-4 ${className}`}>
      <p className="m-0 mb-2 text-[11px] tracking-[.16em] text-brume">OBJECTIONS À RÉSOUDRE · {liste.length}</p>
      {liste.slice(0, 5).map((o) => <Objection key={o.id} o={o} />)}
      {liste.length > 5 && <p className="m-0 pb-3 text-[12.5px] text-brume">Et {liste.length - 5} autre{liste.length - 5 > 1 ? "s" : ""}, à mesure que celles-ci se résolvent.</p>}
    </section>
  );
}
