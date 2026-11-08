import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Loader from "@/components/ui/Loader";
import { bouton, boutonPlein, champ } from "@/components/off-market/commun";

// L'onglet Offres de la Mise en vente (7 nov. 2026, Jules) : toutes les offres du bien, celles des clients de Klocka et
// celles des contacts du mandataire, de la plus haute à la plus basse, avec le prix demandé et l'écart en tête. Une offre
// de Klocka se tranche ici (Accepter, Refuser, Contre-offre) ; celle d'un contact ouvre sa fiche (`onPiste`).
// Le serveur : GET /api/mandataire/marches/:id/offres-tout, POST …/offres/:offre/reponse.

const montant = (n) => {
  if (n == null || n === "" || !isFinite(Number(n))) return null;
  const v = Number(n);
  return Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(v).toLocaleString("fr-FR")} €`;
};
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const REPONSES = {
  acceptee: ["Acceptée", "text-menthe"],
  refusee: ["Refusée", "text-brume"],
  contre_offre: ["Contre-offre", "text-pervenche"],
};

/** L'écart au prix demandé, tel que le serveur le donne : un texte, un montant, ou { montant, pourcentage }. */
function ecartLisible(e) {
  if (e == null || e === "") return null;
  if (typeof e === "string") return e;
  if (typeof e === "number") return montant(e);
  if (typeof e === "object") {
    const pct = e.pourcentage ?? e.pct ?? e.pourcent;
    return [montant(e.montant), pct != null && isFinite(Number(pct)) ? `${Number(pct).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : null].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function Offre({ o, marcheId, onPiste }) {
  const qc = useQueryClient();
  const [contre, setContre] = useState(false);
  const [note, setNote] = useState("");
  const repondre = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/offres/${encodeURIComponent(o.id)}/reponse`, { body: corps }),
    onSuccess: (_, corps) => {
      toast.success(corps.reponse === "acceptee" ? "Offre acceptée" : corps.reponse === "refusee" ? "Offre refusée" : "Contre-offre envoyée");
      setContre(false); setNote("");
      [["m-offres-tout", marcheId], ["m-vente-etat", marcheId], ["m-marches"]].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const reponse = o.reponse ? REPONSES[o.reponse] || [String(o.reponse), "text-ardoise"] : ["En attente", "text-ambre"];
  const klocka = o.source === "klocka";
  return (
    <li className="border-t border-trait py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {o.piste_id && onPiste
          ? <button type="button" onClick={() => onPiste(o.piste_id)} className="min-w-0 truncate text-left text-[16px] text-encre hover:text-pervenche" style={{ background: "transparent" }}>{o.nom || "Contact"}</button>
          : <span className="min-w-0 truncate text-[16px] text-encre">{o.nom || (klocka ? "Client Klocka" : "Contact")}</span>}
        <span className={`flex-none rounded-full px-2 py-px text-[12px] ${klocka ? "bg-pervenche/15 text-pervenche" : "bg-relief text-ardoise"}`}>{klocka ? "Klocka" : "Votre contact"}</span>
        <span className="flex-1" />
        <span className="text-[18px] tabular-nums text-encre">{montant(o.montant) || "Montant à préciser"}</span>
      </div>
      <p className="m-0 mt-1 text-[13.5px] text-ardoise">
        {[o.conditions, o.le ? `le ${jour(o.le)}` : null].filter(Boolean).join(" · ")}
        {(o.conditions || o.le) ? " · " : ""}<span className={reponse[1]}>{reponse[0]}</span>
      </p>
      {klocka && !o.reponse && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => repondre.mutate({ reponse: "acceptee" })} disabled={repondre.isPending} className={`${boutonPlein} h-8 text-[12.5px]`}>
            {repondre.isPending && repondre.variables?.reponse === "acceptee" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accepter
          </button>
          <button type="button" onClick={() => repondre.mutate({ reponse: "refusee" })} disabled={repondre.isPending} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>Refuser</button>
          <button type="button" onClick={() => setContre((x) => !x)} disabled={repondre.isPending} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>Contre-offre</button>
        </div>
      )}
      {contre && (
        <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) repondre.mutate({ reponse: "contre_offre", note: note.trim() }); }}>
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Votre contre-offre : montant, conditions…" aria-label="La contre-offre" className={`${champ} min-w-[220px] flex-1`} />
          <button type="submit" disabled={!note.trim() || repondre.isPending} className={`${boutonPlein} h-9`}>Envoyer</button>
          <button type="button" onClick={() => setContre(false)} aria-label="Annuler" className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </form>
      )}
    </li>
  );
}

export default function OngletOffres({ marcheId, onPiste = null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["m-offres-tout", marcheId],
    queryFn: () => base44.request("GET", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/offres-tout`),
    enabled: !!marcheId,
  });
  if (isLoading) return <Loader titre="Les offres…" />;
  if (isError || !data) return <p className="m-0 py-8 text-[14px] text-alerte">Les offres ne se chargent pas.</p>;
  const offres = (data.offres || []).slice().sort((a, b) => (Number(b.montant) || 0) - (Number(a.montant) || 0));
  const prix = montant(data.prix_demande);
  const ecart = ecartLisible(data.ecart);
  return (
    <section aria-label="Les offres">
      {(prix || ecart) && (
        <p className="m-0 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ardoise">
          {prix && <span>Prix demandé <span className="tabular-nums text-encre">{prix}</span></span>}
          {ecart && <span>Écart au prix demandé <span className="tabular-nums text-encre">{ecart}</span></span>}
        </p>
      )}
      {offres.length ? (
        <ul className="m-0 mt-4 list-none border-y border-trait p-0">
          {offres.map((o) => <Offre key={`${o.source}-${o.id}`} o={o} marcheId={marcheId} onPiste={onPiste} />)}
        </ul>
      ) : <p className="m-0 mt-4 border-y border-trait py-10 text-center text-[13.5px] text-brume">Aucune offre pour l'instant. Elles arrivent ici, celles des clients de Klocka comme celles de vos contacts.</p>}
    </section>
  );
}
