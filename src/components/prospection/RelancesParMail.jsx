import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Mail, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Relances > Par mail (10 oct. 2026) : l'IA prépare un mail pour chaque
// relance due dont l'agent a une adresse ; on relit, on retouche, on valide.
// Validé, le mail part de sa boîte et c'est une relance comme un appel : le
// contact est noté, la prochaine relance passe un mois plus tard, sur la
// fiche et dans Monday.

const API = "/api/prospection/relances/par-mail";
const dateCourte = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const champ = "w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";

function CarteMail({ m, onValider, onIgnorer, occupe }) {
  const [v, setV] = useState({ a: m.a || "", objet: m.objet || "", corps: m.corps || "" });
  const modifie = v.a !== m.a || v.objet !== m.objet || v.corps !== m.corps;
  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-trait bg-rail p-5 max-md:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] text-encre">{m.nom || m.agence}</span>
        {m.nom && m.agence && <span className="text-[13px] text-ardoise">{m.agence}{m.ville ? ` · ${m.ville}` : ""}</span>}
        {m.motif && <span className="rounded-full bg-relief px-2.5 py-0.5 text-[12px] text-craie">{m.motif}</span>}
        {m.ligne_le && <span className="ml-auto text-[12.5px] text-brume">due le {dateCourte(m.ligne_le)}</span>}
      </div>
      <label className="flex items-center gap-3 text-[12.5px] text-ardoise">
        <span className="w-12 flex-none">À</span>
        <input value={v.a} onChange={(e) => setV((x) => ({ ...x, a: e.target.value }))} className={`${champ} h-9`} />
      </label>
      <label className="flex items-center gap-3 text-[12.5px] text-ardoise">
        <span className="w-12 flex-none">Objet</span>
        <input value={v.objet} onChange={(e) => setV((x) => ({ ...x, objet: e.target.value }))} className={`${champ} h-9`} />
      </label>
      <textarea value={v.corps} onChange={(e) => setV((x) => ({ ...x, corps: e.target.value }))} rows={Math.min(16, Math.max(6, v.corps.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 100)), 1)))}
        className={`${champ} resize-y py-2.5 leading-[1.55]`} />
      <p className="m-0 text-[12px] text-brume">Votre signature s'ajoute à l'envoi.</p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => onIgnorer(m.id)} disabled={occupe} className="h-9 rounded-full border border-trait px-4 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Ignorer</button>
        <button type="button" onClick={() => onValider(m.id, modifie ? v : null)} disabled={occupe || !v.a.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {occupe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Valider et envoyer
        </button>
      </div>
    </div>
  );
}

export default function RelancesParMail({ onFait }) {
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["relances-par-mail"], queryFn: () => base44.request("GET", API) });
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["relances-par-mail"] }); onFait?.(); };
  const preparer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/preparer`),
    onSuccess: (r) => { toast.success(r.prepares ? `${r.prepares} mail${r.prepares > 1 ? "s" : ""} préparé${r.prepares > 1 ? "s" : ""}` : "Aucun mail à préparer"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Préparation impossible"),
  });
  const valider = useMutation({
    mutationFn: ({ id, v }) => base44.request("POST", `${API}/${id}/valider`, { body: v || {} }),
    onSuccess: (r) => {
      const monday = r.recu?.monday?.etat === "ok" ? "Monday à jour" : "Monday en attente";
      toast.success(`Envoyé · relance le ${dateCourte(r.relance_le)} · ${monday}`);
      rafraichir();
    },
    onError: (e) => toast.error(e?.message || "Le mail n'est pas parti"),
  });
  const ignorer = useMutation({ mutationFn: (id) => base44.request("POST", `${API}/${id}/ignorer`), onSuccess: rafraichir, onError: (e) => toast.error(e?.message || "Impossible") });
  const tout = useMutation({
    mutationFn: (ids) => base44.request("POST", `${API}/valider-tout`, { body: { ids } }),
    onSuccess: (r) => { toast.success(`${r.valides} relance${r.valides > 1 ? "s" : ""} envoyée${r.valides > 1 ? "s" : ""}${r.rates.length ? ` · ${r.rates.length} non partie${r.rates.length > 1 ? "s" : ""}` : ""}`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (q.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const d = q.data || {};
  const mails = d.mails || [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-trait px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] text-encre">{mails.length ? `${mails.length} relance${mails.length > 1 ? "s" : ""} par mail à valider` : "Aucun mail à valider"}</span>
          <span className="text-[12.5px] text-ardoise">
            Validé, un mail compte comme une relance : contact noté, prochaine relance un mois plus tard, Monday à jour.
            {d.sans_adresse > 0 && ` ${d.sans_adresse} relance${d.sans_adresse > 1 ? "s" : ""} sans adresse : à faire au téléphone.`}
          </span>
        </div>
        <span className="flex flex-wrap gap-2">
          {d.a_preparer > 0 && (
            <button type="button" onClick={() => preparer.mutate()} disabled={preparer.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-menthe/50 px-4 text-[13px] text-menthe hover:bg-menthe/10 disabled:opacity-50" style={{ background: "transparent" }}>
              {preparer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{preparer.isPending ? "AK prépare les mails…" : `Préparer ${d.a_preparer} mail${d.a_preparer > 1 ? "s" : ""}`}
            </button>
          )}
          {mails.length > 1 && (
            <button type="button" onClick={() => { if (window.confirm(`Envoyer les ${mails.length} mails tels qu'ils sont ? Chacun compte comme une relance.`)) tout.mutate(mails.map((m) => m.id)); }} disabled={tout.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {tout.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}Tout valider
            </button>
          )}
        </span>
      </div>
      {mails.map((m) => (
        <CarteMail key={m.id} m={m} occupe={(valider.isPending && valider.variables?.id === m.id) || tout.isPending}
          onValider={(id, v) => valider.mutate({ id, v })} onIgnorer={(id) => ignorer.mutate(id)} />
      ))}
      {!mails.length && !d.a_preparer && <p className="m-0 py-10 text-center text-[14px] text-brume">Rien à préparer : aucune relance due avec une adresse.</p>}
    </div>
  );
}
