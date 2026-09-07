import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Send } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";

// Étape 3 — Risques, prix, décision. Rien n'est lu ici : tout s'assemble.
// Cinq risques avec leur raisonnement ; l'analyste confirme, ajuste ou écarte,
// et la décote, le prix ajusté, le rendement et le score bougent. Trois
// leviers de négociation, plafonnés au prix demandé. Le match investisseur
// suit. Puis la décision, avec ses livrables.

const TEINTE = { fort: "#e8927c", moyen: "#e8b04c", faible: "#7fd1a8" };
const Titre = ({ children, droite }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>
    {droite ? <span className="text-[12px] text-[#9298a6]">{droite}</span> : null}
  </div>
);
const eur = (v) => (v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);

export default function EtapeDataRoom3({ dossier, e, onPreuve, onRefresh, apercu = false }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [ouverts, setOuverts] = useState(() => new Set());
  const tout = () => ["etape3", "etape4", "carte"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const reviser = useMutation({
    mutationFn: ({ id, verdict }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/risques/${id}`, { body: { verdict } }),
    onSuccess: tout, onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const leviers = useMutation({
    mutationFn: (ids) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/leviers`, { body: { leviers: ids } }),
    onSuccess: tout, onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const avancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/etape/4`, { body: {} }),
    onSuccess: () => { toast.success("Étape 4 — présentation et closing"); ["etape1", "etape2", "etape3", "etape4", "carte"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] })); },
  });
  const copier = async (t, quoi) => { try { await navigator.clipboard.writeText(t); toast.success(`${quoi} copié`); } catch { window.prompt("Copiez :", t); } };
  const coches = e.leviers.filter((l) => l.coche).map((l) => l.id);
  const basculerLevier = (id) => leviers.mutate(coches.includes(id) ? coches.filter((x) => x !== id) : [...coches, id]);
  const { prix } = e;
  const visibles = e.risques.filter((r) => !r.replie || ouverts.has("faibles"));
  const faibles = e.risques.filter((r) => r.replie);

  return (
    <>
      {/* Le prix, en direct */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[["Prix demandé", eur(prix.demande)], ["Décote retenue", `${prix.decote_pct} %`], ["Prix ajusté", eur(prix.ajuste)], ["Rendement net AEM", prix.rendement_net_ajuste != null ? `${prix.rendement_net_ajuste.toFixed(2)} %` : "—"], ["Score", `${prix.score}/100`]].map(([l, v], i) => (
            <div key={l}><p className="m-0 text-[11px] text-[#6a7180]">{l}</p><p className={`m-0 text-[20px] font-light tabular-nums ${i === 3 ? (prix.rendement_net_ajuste >= prix.seuil_rendement ? "text-[#7fd1a8]" : "text-[#e8927c]") : i === 4 ? (prix.score >= 60 ? "text-[#7fd1a8]" : prix.score >= 40 ? "text-[#e8b04c]" : "text-[#e8927c]") : "text-[#f2f3f5]"}`}>{v}</p></div>
          ))}
        </div>
        <p className="m-0 mt-3 text-[12.5px] text-[#9298a6]">Seuil de rendement {prix.seuil_rendement.toFixed(2)} %{prix.seuil ? ` · prix FAI au seuil ${eur(prix.seuil)}` : ""} · le prix ajusté ne dépasse jamais le prix demandé.</p>
      </div>

      {/* Les risques */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite={`${e.risques.filter((r) => r.niveau === "fort").length} fort · ${e.risques.filter((r) => r.niveau === "moyen").length} moyen · ${faibles.length} faible`}>Risques</Titre>
        <div className="space-y-3">
          {visibles.map((r) => (
            <div key={r.id} className={`rounded-xl border px-4 py-3.5 ${r.verdict === "ecarte" || r.neutralise_par ? "border-[#1e1e22] opacity-60" : "border-[#22262d]"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[14.5px] font-semibold text-[#f2f3f5] flex items-center gap-2.5"><span className="w-2 h-2 rounded-full" style={{ background: TEINTE[r.niveau] }} />{r.titre} <span className="text-[11.5px] font-normal" style={{ color: TEINTE[r.niveau] }}>{r.niveau}</span> <span className="text-[11.5px] font-normal text-[#6a7180]">· décote {r.decote_pct} % → {r.decote_retenue_pct} %</span></p>
                  <p className="m-0 mt-1.5 text-[13px] leading-[1.6] text-[#c9cdd6]">{r.raisonnement}</p>
                  <p className="m-0 mt-1.5 text-[11.5px] text-[#6a7180]">
                    Se nourrit de : {r.nourri_de.join(" · ")}
                    {r.sources.length > 0 && <> · Sources : {r.sources.map((s, i) => <button key={i} onClick={() => onPreuve(s)} className="text-[#9298a6] hover:text-[#f2f3f5] underline decoration-dotted underline-offset-2 mr-2">{s.document_nom}{s.page ? ` p.${s.page}` : ""}</button>)}</>}
                    {r.neutralise_par && <span className="text-[#7fd1a8]"> · neutralisé par le levier « {r.neutralise_par} »</span>}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-none">
                  {[["confirme", "Confirmer"], ["ajuste", "Ajuster −50 %"], ["ecarte", "Écarter"]].map(([v, l]) => (
                    <button key={v} onClick={() => !apercu && reviser.mutate({ id: r.id, verdict: v })} disabled={apercu} className={`px-3 py-1 rounded-full text-[11.5px] border transition-colors ${r.verdict === v ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#0b0c0e] font-semibold" : "border-[#2c3139] text-[#c9cdd6] hover:border-[#3a3f4a]"}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
        {faibles.length > 0 && (
          <button onClick={() => setOuverts((s) => { const n = new Set(s); if (n.has("faibles")) n.delete("faibles"); else n.add("faibles"); return n; })} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5]">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${ouverts.has("faibles") ? "rotate-180" : ""}`} /> {ouverts.has("faibles") ? "Replier" : "Voir"} les {faibles.length} risques faibles ({faibles.map((r) => r.titre.toLowerCase()).join(", ")})
          </button>
        )}
      </div>

      {/* Les leviers de négociation */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite="cochez ce que vous demandez au vendeur">Leviers de négociation</Titre>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {e.leviers.map((l) => (
            <button key={l.id} onClick={() => !apercu && basculerLevier(l.id)} disabled={apercu} className={`text-left rounded-xl border px-4 py-3 transition-colors ${l.coche ? "border-[#96c0b8] bg-[#96c0b8]/[0.06]" : "border-[#22262d] hover:border-[#3a3f4a]"}`}>
              <p className="m-0 text-[13.5px] font-semibold text-[#f2f3f5] flex items-center gap-2"><span className={`w-4 h-4 rounded border flex items-center justify-center ${l.coche ? "bg-[#96c0b8] border-[#96c0b8] text-[#000000]" : "border-[#3a3f4a]"}`}>{l.coche && <Check className="w-3 h-3" strokeWidth={3} />}</span>{l.titre}</p>
              <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-[#9298a6]">{l.detail}</p>
              <p className="m-0 mt-1 text-[11.5px] text-[#6a7180]">{l.effet === "prix" ? `Ramène le prix au seuil : ${eur(prix.seuil)}` : `Neutralise le risque ${l.effet.split(":")[1]}`}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Le match investisseur */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite={e.match.configure ? `au prix ajusté ${eur(prix.ajuste)}` : "Monday non connecté"}>Match investisseur</Titre>
        {!e.match.configure ? <p className="m-0 text-[13px] text-[#9298a6]">Le rapprochement avec les investisseurs se fait depuis Monday.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[["Prêts au prix ajusté", e.match.prets, "#7fd1a8"], ["Possibles avec le levier prix", e.match.possibles, "#e8b04c"], ["Hors budget", e.match.hors, "#4d545d"]].map(([l, liste, t]) => (
              <div key={l}>
                <p className="m-0 mb-2 text-[12px] font-semibold flex items-center gap-2" style={{ color: t }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: t }} />{l} · {liste.length}</p>
                {liste.length ? liste.map((c, i) => <p key={i} className="m-0 text-[13px] text-[#f2f3f5]">{c.nom} <span className="text-[#6a7180] text-[11.5px]">{c.raisons?.join(" · ")}{c.si ? ` · si ${c.si}` : ""}</span></p>) : <p className="m-0 text-[12.5px] text-[#4d545d]">Personne.</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* La décision et ses livrables */}
      <div className="px-5 py-5 grid sm:grid-cols-3 gap-4">
        <div className="rounded-md p-5 border border-[#96c0b8]/50">
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Proposer au client</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">La note de synthèse et le mail au client, prêts à relire. Puis la présentation par profil à l'étape 4.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => copier(e.note, "La note de synthèse")} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Note de synthèse</button>
            <button onClick={() => !apercu && avancer.mutate()} disabled={apercu} className="inline-flex items-center gap-1.5 text-[12px] px-3.5 py-1.5 rounded-full bg-[#f2f3f5] text-[#0b0c0e] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Étape 4 → présentation</button>
          </div>
        </div>
        <div className="rounded-md p-5 border border-[#1f2228]">
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5] flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Demander des compléments</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Le mail au vendeur cumule les demandes des trois étapes et les leviers cochés.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => copier([e.demandes_texte, ...coches.map((id) => `Levier : ${e.leviers.find((l) => l.id === id)?.titre}`)].filter(Boolean).join("\n"), "La liste")} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Liste</button>
            <button onClick={() => !apercu && setDialog("demande_documents")} disabled={apercu} className="inline-flex items-center gap-1.5 text-[12px] px-3.5 py-1.5 rounded-full bg-[#f2f3f5] text-[#0b0c0e] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Rédiger le mail</button>
          </div>
        </div>
        <div className="rounded-md p-5 border border-[#1f2228]">
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Passer</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Refus pré-rédigé, archivé avec le motif{e.motif_passer ? ` (${e.motif_passer})` : ""}. Le dossier alimente la base marché.</p>
          <div className="mt-3"><button onClick={() => !apercu && setDialog("abandon")} disabled={apercu} className="inline-flex items-center gap-1.5 text-[12px] px-3.5 py-1.5 rounded-full border border-[#e8746a]/50 text-[#e8746a] hover:border-[#e8746a] disabled:opacity-40">Rédiger le refus</button></div>
        </div>
      </div>

      {dialog && <DialogMailIntention dossier={dossier} intention={dialog} parametres={dialog === "demande_documents" ? { raisons: [e.demandes_texte, ...coches.map((id) => `Levier de négociation : ${e.leviers.find((l) => l.id === id)?.titre}`)].filter(Boolean).join("\n") } : { raisons: e.motif_passer || undefined }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onRefresh?.(); tout(); }} />}
    </>
  );
}
