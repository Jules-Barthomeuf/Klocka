import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";
import { Mono, Section, eur, fourchette } from "./CadreEtapes";

// Étape 3 — Risques, prix et décision. Aucune lecture : assemblage,
// chiffrage, décision. Les risques en lignes dépliables, le prix en deux
// colonnes (décotes et bonifications ; conditions de négociation), le match
// investisseur, la décision.

const NIVEAU = { fort: "text-[#e8927c]", moyen: "text-[#e8b04c]", faible: "text-[#6a7180]" };
const neg = (f) => (!f || (f[0] === 0 && f[1] === 0) ? null : f[0] === f[1] ? `−${Math.round(f[0]).toLocaleString("fr-FR")} €` : `−${Math.round(f[0]).toLocaleString("fr-FR")} à −${Math.round(f[1]).toLocaleString("fr-FR")} €`);
const plus = (f) => (!f || (f[0] === 0 && f[1] === 0) ? "—" : `+${Math.round(f[0] / 1000)} à +${Math.round(f[1] / 1000)} k€`);

function Sources({ liste, onPreuve }) {
  if (!liste?.length) return <Mono className="normal-case tracking-[.06em] text-[#4d545d]">calcul</Mono>;
  return <span className="flex flex-wrap gap-x-3">{liste.map((s, i) => <button key={i} onClick={() => onPreuve(s)} className="font-mono text-[10.5px] tracking-[.06em] text-[#6a7180] hover:text-[#f2f3f5]">{(s.document_nom || "").replace(/\.pdf$/i, "").slice(0, 26)}{s.page ? ` p. ${s.page}` : ""}</button>)}</span>;
}

export default function EtapeDataRoom3({ dossier, e, onPreuve, onRefresh, apercu = false, dialog, setDialog }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [ouverts, setOuverts] = useState(() => new Set(e.risques.filter((r) => !r.replie).map((r) => r.id)));
  const tout = () => ["etape3", "etape4", "carte"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const reviser = useMutation({ mutationFn: ({ id, verdict }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/risques/${id}`, { body: { verdict } }), onSuccess: tout, onError: (x) => toast.error(x?.message || "Impossible") });
  const leviers = useMutation({ mutationFn: (ids) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/leviers`, { body: { leviers: ids } }), onSuccess: tout, onError: (x) => toast.error(x?.message || "Impossible") });
  const copier = async (t, quoi) => { try { await navigator.clipboard.writeText(t); toast.success(`${quoi} copié`); } catch { window.prompt("Copiez :", t); } };
  const coches = e.leviers.filter((l) => l.coche).map((l) => l.id);
  const basculer = (id) => leviers.mutate(coches.includes(id) ? coches.filter((x) => x !== id) : [...coches, id]);
  const bascule = (id) => setOuverts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const { prix } = e;
  const VERDICT = { confirme: "confirmé", ajuste: "ajusté −50 %", ecarte: "écarté" };

  return (
    <>
      <p className="m-0 px-6 max-md:px-4 py-4 text-[14px] leading-[1.65] text-[#c9cdd6] border-b border-[#1f2228] max-w-[900px]">Aucun nouveau document lu. Cette étape assemble ce que les étapes 1 et 2 ont trouvé, le traduit en risques chiffrés, calcule un prix et matche avec un investisseur.</p>

      {/* 1 · Les risques */}
      <Section id="risques" titre="1 · Les risques" droite={`${prix.nb_ecartes} écarté(s) · ${prix.nb_ajustes} ajusté(s) · décote retenue ${prix.courant ? fourchette(prix.courant.decote) : "—"}`}>
        <div className="divide-y divide-[#15171b]">
          {e.risques.map((r) => {
            const ouvert = ouverts.has(r.id);
            return (
              <div key={r.id} className="py-3">
                <button onClick={() => bascule(r.id)} className="w-full text-left flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="flex-1 min-w-[240px] text-[15px] text-[#f2f3f5]"><span className="font-semibold">{r.titre}</span> <span className="text-[#9298a6]">— {r.une_ligne}</span></span>
                  <Mono className={`${NIVEAU[r.niveau]} w-[70px] text-right`}>{r.niveau_libelle}</Mono>
                  <span className={`w-[190px] text-right tabular-nums text-[14px] ${r.verdict === "ecarte" ? "line-through text-[#4d545d]" : "text-[#f2f3f5]"}`}>{r.integre_au_prix ? <span className="text-[#9298a6]">intégré au prix</span> : neg(r.fourchette) || "—"}</span>
                  <span className="w-4 text-[#6a7180] text-[11px]">{ouvert ? "▲" : "▼"}</span>
                </button>
                {ouvert && (
                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                    <div className="min-w-0">
                      <p className="m-0 text-[14px] leading-[1.7] text-[#d6d6db]">{r.raisonnement}</p>
                      <div className="mt-2"><Sources liste={r.sources} onPreuve={onPreuve} /></div>
                    </div>
                    <div className="border border-[#1f2228] px-4 py-3">
                      <Mono>Se nourrit de</Mono>
                      <p className="m-0 mt-1.5 text-[13px] leading-[1.6] text-[#c9cdd6]">{r.nourri_de.join(", ")}.</p>
                      <div className="mt-3 pt-3 border-t border-[#1f2228]"><Mono>Statut · {VERDICT[r.verdict]}</Mono></div>
                      <div className="mt-2 flex gap-1.5">
                        {[["confirme", "Confirmer"], ["ajuste", "Ajuster −50 %"], ["ecarte", "Écarter"]].map(([v, l]) => (
                          <button key={v} onClick={() => !apercu && reviser.mutate({ id: r.id, verdict: v })} disabled={apercu} className={`px-3 py-1.5 text-[12.5px] border transition-colors ${r.verdict === v ? "border-[#f2f3f5] text-[#f2f3f5]" : "border-[#2c3139] text-[#9298a6] hover:text-[#f2f3f5]"}`}>{l}</button>
                        ))}
                      </div>
                      {r.condition?.coche && <p className="m-0 mt-2 text-[12px] text-[#7fd1a8]">Condition obtenue : {r.condition.titre}.</p>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* 2 · Le prix */}
      <Section id="prix" titre="2 · Le prix">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="border border-[#1f2228] px-6 py-5">
            <div className="flex items-baseline justify-between gap-4 pb-4 border-b border-[#1f2228]">
              <span className="text-[14px] text-[#c9cdd6]">Prix demandé</span>
              <span className="text-right"><span className="block text-[22px] font-light tabular-nums text-[#f2f3f5]">{eur(prix.demande)}</span>{prix.rdt_brut_demande != null && <span className="text-[12px] text-[#9298a6]">rdt brut {prix.rdt_brut_demande.toFixed(2).replace(".", ",")} %</span>}</span>
            </div>
            <div className="pt-4"><Mono>Décotes</Mono></div>
            {e.risques.filter((r) => !r.integre_au_prix && r.verdict !== "ecarte" && !(r.condition?.coche)).map((r) => (
              <div key={r.id} className="flex items-baseline justify-between gap-4 py-2 border-b border-[#15171b] text-[14px]"><span className="text-[#c9cdd6]">{r.titre}</span><span className="tabular-nums text-[#f2f3f5]">{neg(r.decote_retenue) || "—"}</span></div>
            ))}
            {e.bonifications.length > 0 && (
              <>
                <div className="pt-4"><Mono>Bonifications</Mono></div>
                {e.bonifications.map((b) => <div key={b.titre} className="flex items-baseline justify-between gap-4 py-2 border-b border-[#15171b] text-[14px]"><span className="text-[#c9cdd6]">{b.titre}</span><span className="tabular-nums text-[#f2f3f5]">{plus(b.fourchette).replace(/k€/g, "000 €").replace("+", "+").replace(" à ", " à ")}</span></div>)}
              </>
            )}
            <div className="flex items-baseline justify-between gap-4 pt-5">
              <span className="text-[15px] font-semibold text-[#f2f3f5]">Prix ajusté</span>
              <span className="text-right"><span className="block text-[22px] font-light tabular-nums text-[#f2f3f5]">{prix.courant ? fourchette(prix.courant.fourchette) : "—"}</span>{prix.courant?.rdt_brut && <span className="text-[12px] text-[#9298a6]">rdt brut {prix.courant.rdt_brut[0]} % – {prix.courant.rdt_brut[1]} %</span>}</span>
            </div>
          </div>
          <div className="border border-[#1f2228] px-6 py-5">
            <div className="flex items-baseline justify-between gap-4"><Mono>Simulateur · conditions de négociation</Mono><span className="text-[12px] text-[#9298a6]">{coches.length} / {e.leviers.length} cochées</span></div>
            <div className="mt-3 space-y-2">
              {e.leviers.map((l) => (
                <button key={l.id} onClick={() => !apercu && basculer(l.id)} disabled={apercu} className={`w-full text-left flex items-center gap-3 px-3 py-2.5 border transition-colors ${l.coche ? "border-[#96c0b8]/60 bg-[#96c0b8]/[0.05]" : "border-[#1f2228] hover:border-[#2c3139]"}`}>
                  <span className={`w-4 h-4 border flex items-center justify-center flex-none ${l.coche ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000]" : "border-[#3a3f4a]"}`}>{l.coche && <Check className="w-3 h-3" strokeWidth={3} />}</span>
                  <span className="flex-1 text-[14px] text-[#f2f3f5]">{l.titre}</span>
                  <Mono className="normal-case tracking-[.04em] text-[#9298a6]">{plus(l.gain)}</Mono>
                </button>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-[#1f2228] flex items-baseline justify-between gap-4">
              <span className="text-[15px] font-semibold text-[#f2f3f5]">{coches.length ? "Prix avec conditions obtenues" : "Prix sans condition obtenue"}</span>
              <span className="text-right"><span className="block text-[22px] font-light tabular-nums text-[#f2f3f5]">{prix.courant ? fourchette(prix.courant.fourchette) : "—"}</span>{prix.courant?.rdt_brut && <span className="text-[12px] text-[#9298a6]">rdt brut {prix.courant.rdt_brut[0]} % – {prix.courant.rdt_brut[1]} %</span>}</span>
            </div>
            <p className="m-0 mt-3 text-[13px] leading-[1.6] text-[#9298a6]">{coches.length ? `${coches.length} condition${coches.length > 1 ? "s" : ""} obtenue${coches.length > 1 ? "s" : ""} : la décote correspondante s'efface. Sans elles, le prix serait ${prix.sans_condition ? fourchette(prix.sans_condition.fourchette) : "—"}.` : "Sans condition obtenue, la décote s'applique en totalité : le prix demandé n'est pas justifiable."}</p>
          </div>
        </div>
      </Section>

      {/* 3 · Match investisseur */}
      <Section id="match" titre="3 · Match investisseur" droite={e.match.configure ? `au prix courant ${prix.courant ? fourchette(prix.courant.fourchette) : ""}` : "Monday non connecté"}>
        {!e.match.configure ? <p className="m-0 text-[13px] text-[#9298a6]">Le rapprochement avec les investisseurs se fait depuis Monday.</p> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[["Prêts au prix courant", e.match.prets, "text-[#7fd1a8]"], ["Possibles au prix du seuil", e.match.possibles, "text-[#e8b04c]"], ["Hors budget", e.match.hors, "text-[#6a7180]"]].map(([l, liste, c]) => (
              <div key={l}>
                <Mono className={c}>{l} · {liste.length}</Mono>
                <div className="mt-2 space-y-1">{liste.length ? liste.map((x, i) => <p key={i} className="m-0 text-[13.5px] text-[#f2f3f5]">{x.nom} <span className="text-[#6a7180] text-[11.5px]">{x.raisons?.join(" · ")}</span></p>) : <p className="m-0 text-[12.5px] text-[#4d545d]">Personne.</p>}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 4 · La décision */}
      <Section id="decision" titre="4 · La décision" sansFilet>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="border border-[#96c0b8]/50 px-5 py-4">
            <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Proposer au client</p>
            <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Note de synthèse et mail prêts à relire ; la présentation par profil à l'étape 4.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => copier(e.note, "La note")} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Note de synthèse</button></div>
          </div>
          <div className="border border-[#1f2228] px-5 py-4">
            <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Demander des compléments</p>
            <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Le mail au vendeur cumule les demandes des trois étapes et les conditions cochées.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => !apercu && setDialog("demande_documents")} disabled={apercu} className="text-[12px] px-3.5 py-1.5 bg-[#f2f3f5] text-[#0b0c0e] font-semibold disabled:opacity-40">Rédiger le mail</button></div>
          </div>
          <div className="border border-[#1f2228] px-5 py-4">
            <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Passer</p>
            <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Refus pré-rédigé, archivé avec le motif{e.motif_passer ? ` (${e.motif_passer})` : ""}.</p>
            <div className="mt-3"><button onClick={() => !apercu && setDialog("abandon")} disabled={apercu} className="text-[12px] px-3.5 py-1.5 border border-[#e8746a]/50 text-[#e8746a] hover:border-[#e8746a] disabled:opacity-40">Rédiger le refus</button></div>
          </div>
        </div>
      </Section>

      {dialog && <DialogMailIntention dossier={dossier} intention={dialog} parametres={dialog === "demande_documents" ? { raisons: [e.demandes_texte, ...coches.map((id) => `Condition de négociation : ${e.leviers.find((l) => l.id === id)?.titre}`)].filter(Boolean).join("\n") } : { raisons: e.motif_passer || undefined }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onRefresh?.(); tout(); }} />}
    </>
  );
}
