import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import { Mono, Section, eur } from "./CadreEtapes";

// Étape 1 — Bail et locataire. Le bandeau de chiffres, la rentabilité réelle
// teaser contre data room poste par poste, les anomalies triées, le bien en
// dix lignes, le simulateur, les pièces pour l'étape 2.

function Source({ s, onPreuve, texte }) {
  if (!s?.document_id) return texte ? <Mono className="normal-case tracking-[.08em] text-[#4d545d]">{texte}</Mono> : null;
  return <button onClick={() => onPreuve(s)} className="font-mono text-[10.5px] tracking-[.06em] text-[#6a7180] hover:text-[#f2f3f5] whitespace-nowrap">{(s.document_nom || "").replace(/\.pdf$/i, "").slice(0, 28)}{s.page ? ` p. ${s.page}` : ""}</button>;
}

const Glyphe = ({ statut }) => <span className={`w-4 flex-none text-[13px] ${statut === "ko" ? "text-[#e8927c]" : statut === "ok" ? "text-[#7fd1a8]" : "text-[#e8b04c]"}`}>{statut === "ko" ? "✕" : statut === "ok" ? "✓" : "!"}</span>;

export default function EtapeDataRoom({ dossier, e, onPreuve, onRefresh, apercu = false, dialog, setDialog }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const tout = () => ["etape1", "etape2", "etape3", "etape4", "carte", "matrice", "fiche", "livrables"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const lancer = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/etape/${n}`, { body: {} }),
    onSuccess: () => { toast.success("Lecture du bail, des quittances et du Kbis lancée"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const enCours = e.remplissage?.etat === "en_cours";
  const nbDocs = e.progression.total;
  // Le loyer se corrige à la main : tout se recalcule depuis cette valeur.
  const [editionLoyer, setEditionLoyer] = useState(false);
  const [loyerSaisi, setLoyerSaisi] = useState("");
  const forcerLoyer = useMutation({
    mutationFn: (valeur) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/forcer/loyer`, { body: valeur == null ? {} : { valeur } }),
    onSuccess: (_, valeur) => { toast.success(valeur == null ? "Loyer du bail rétabli" : "Loyer modifié — tout est recalculé"); setEditionLoyer(false); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const validerLoyer = () => { const n = Number(String(loyerSaisi).replace(/[^\d.,]/g, "").replace(",", ".")); if (!n) return toast.error("Un montant annuel HT, en euros"); forcerLoyer.mutate(`${Math.round(n).toLocaleString("fr-FR")} € HT par an (saisi à la main)`); };

  if (!e.lue) {
    return (
      <div className="px-6 py-8">
        <p className="m-0 text-[14.5px] leading-[1.65] text-[#d6d6db] max-w-[720px]">{nbDocs ? `${nbDocs} pièce${nbDocs > 1 ? "s" : ""} importée${nbDocs > 1 ? "s" : ""}. Le bail, ses avenants, les quittances et le Kbis sont lus en premier (${e.progression.presents_etape}). Les autres attendent l'étape 2.` : "Importez les pièces de la data room en bas de page : elles sont classées automatiquement."}</p>
        <div className="mt-5 flex items-center gap-4">
          {enCours ? <span className="inline-flex items-center gap-2 text-[13px] text-[#9298a6]"><Loader2 className="w-4 h-4 animate-spin" /> {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || "lecture"}</span>
            : <button onClick={() => lancer.mutate(1)} disabled={apercu || !e.progression.presents_etape || lancer.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Lire le bail et le locataire</button>}
          {!e.progression.presents_etape && nbDocs > 0 && <span className="text-[12.5px] text-[#e8b04c]">Aucune pièce classée Bail, Avenants, Quittances ou Kbis : vérifiez les catégories.</span>}
        </div>
      </div>
    );
  }

  const { fiche, rentabilite: r, bandeau, anomalies, documents_etape2: d2 } = e;
  const postes = [
    ["Loyer annuel HT", null, r.loyer_bail, fiche.lignes.find((l) => l.id === "loyer")?.source, null],
    r.charges_non_recup ? ["Charges propriétaire", null, r.charges_non_recup, fiche.lignes.find((l) => l.id === "charges")?.source, null] : null,
    ["Taxe foncière", null, r.taxe_fonciere_bailleur || 0, null, r.taxe_fonciere_bailleur ? "à la charge du bailleur" : "refacturée → 0 € net"],
    ["Revenu net", null, bandeau.revenu_net, null, "calcul"],
    ["Prix AEM", r.prix_aem_teaser, r.prix_aem, null, "FAI + droits + frais"],
    ["Rendement brut AEM", bandeau.rendement_teaser, r.rendement_brut_aem, null, "calcul", "%"],
    ["Rendement net AEM", null, r.rendement_net_aem, null, `seuil ${r.seuil.toFixed(2).replace(".", ",")} %`, "%"],
  ].filter(Boolean);
  const fmt = (v, u) => (v == null ? "—" : u === "%" ? `${Number(v).toFixed(2).replace(".", ",")} %` : eur(v));

  return (
    <>
      {enCours && <div className="px-6 py-2 border-b border-[#1f2228] text-[12px] text-[#9298a6] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || ""}</div>}

      {/* Le bandeau */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-[#1f2228] border-b border-[#1f2228]">
        {[["Loyer HT/an", bandeau.loyer != null ? eur(bandeau.loyer) : "—", "", true], ["Revenu net", bandeau.revenu_net != null ? eur(bandeau.revenu_net) : "—", ""], ["Net AEM", bandeau.net_aem != null ? `${bandeau.net_aem.toFixed(2).replace(".", ",")} %` : "—", bandeau.net_aem != null && bandeau.net_aem >= r.seuil ? "text-[#7fd1a8]" : "text-[#e8927c]"], ["Écart teaser", bandeau.ecart_teaser_pt != null ? `${bandeau.ecart_teaser_pt >= 0 ? "+" : "−"}${Math.abs(bandeau.ecart_teaser_pt).toFixed(2).replace(".", ",")} pt` : "—", bandeau.ecart_teaser_pt != null && bandeau.ecart_teaser_pt < 0 ? "text-[#e8927c]" : "text-[#9298a6]"]].map(([l, v, c, loyer]) => (
          <div key={l} className="px-6 max-md:px-4 py-5">
            <div className="flex items-center justify-between gap-2"><Mono>{l}</Mono>{loyer && !editionLoyer && <button onClick={() => { setLoyerSaisi(bandeau.loyer ? String(Math.round(bandeau.loyer)) : ""); setEditionLoyer(true); }} disabled={apercu} title="Modifier le loyer : tout se recalcule" className="text-[#6a7180] hover:text-[#f2f3f5]"><Pencil className="w-3.5 h-3.5" /></button>}</div>
            {loyer && editionLoyer ? (
              <div className="mt-2 flex items-center gap-2">
                <input autoFocus value={loyerSaisi} onChange={(x) => setLoyerSaisi(x.target.value)} onKeyDown={(x) => { if (x.key === "Enter") validerLoyer(); if (x.key === "Escape") setEditionLoyer(false); }} inputMode="numeric" className="w-[130px] bg-transparent border-b border-[#3a3f4a] focus:border-[#f2f3f5] outline-none text-[20px] font-light tabular-nums text-[#f2f3f5]" />
                <span className="text-[12px] text-[#6a7180]">€ HT/an</span>
                <button onClick={validerLoyer} disabled={forcerLoyer.isPending} className="text-[12px] px-2.5 py-1 bg-[#f2f3f5] text-[#0b0c0e] font-semibold">OK</button>
                <button onClick={() => setEditionLoyer(false)} className="text-[12px] text-[#9298a6] hover:text-[#f2f3f5]">Annuler</button>
              </div>
            ) : (
              <p className={`m-0 mt-2 text-[22px] font-light tabular-nums ${c || "text-[#f2f3f5]"}`}>{v}</p>
            )}
            {loyer && bandeau.loyer_force && !editionLoyer && (
              <p className="m-0 mt-1 flex items-center gap-2 text-[11.5px] text-[#d9b46a]">saisi à la main{bandeau.loyer_force.par ? ` · ${bandeau.loyer_force.par}` : ""}<button onClick={() => forcerLoyer.mutate(null)} title="Revenir au loyer du bail" className="inline-flex items-center gap-1 text-[#9298a6] hover:text-[#f2f3f5]"><RotateCcw className="w-3 h-3" /> bail</button></p>
            )}
          </div>
        ))}
      </div>

      {/* Rentabilité réelle · teaser contre data room */}
      <Section id="rentabilite" titre="Rentabilité réelle · teaser contre data room">
        <table className="w-full border-collapse">
          <thead><tr><th className="text-left font-normal py-2"><Mono>Poste</Mono></th><th className="text-right font-normal py-2 pr-6"><Mono>Teaser</Mono></th><th className="text-right font-normal py-2"><Mono>Data room</Mono></th><th className="text-left font-normal py-2 pl-5 w-[260px]"><Mono>Source</Mono></th></tr></thead>
          <tbody>
            {postes.map(([l, t, d, src, note, u]) => (
              <tr key={l} className="border-t border-[#15171b]">
                <td className="py-3 text-[14px] text-[#c9cdd6]">{l}</td>
                <td className="py-3 pr-6 text-right tabular-nums text-[14px] text-[#6a7180]">{fmt(t, u)}</td>
                <td className="py-3 text-right tabular-nums text-[14px] text-[#f2f3f5] font-medium">{fmt(d, u)}</td>
                <td className="py-3 pl-5"><Source s={src} onPreuve={onPreuve} texte={note} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-3 text-[13px] leading-[1.6] text-[#9298a6] max-w-[860px]">{r.phrase}</p>
      </Section>

      {/* Écarts teaser → data room */}
      <Section id="ecarts" titre="Écarts avec la pré-analyse" droite={e.ecarts.length ? `${e.ecarts.length} champ${e.ecarts.length > 1 ? "s" : ""} qui bouge${e.ecarts.length > 1 ? "nt" : ""}` : null}>
        {e.ecarts.length ? e.ecarts.map((x) => (
          <div key={x.libelle} className="grid grid-cols-[130px_1fr] max-md:grid-cols-1 gap-x-6 py-4 border-t border-[#15171b] first:border-t-0">
            <span className="text-[13px] text-[#6a7180] pt-1">{x.libelle}</span>
            <div className="min-w-0">
              <p className="m-0 flex flex-wrap items-baseline gap-x-3">
                {x.teaser != null ? <span className="text-[16px] text-[#6a7180] line-through">{x.teaser}</span> : <Mono>non annoncé</Mono>}
                <span className="text-[#4d545d]">→</span>
                <span className="text-[20px] font-semibold text-[#f2f3f5]">{x.bail}</span>
                {x.etiquette && <Mono className="text-[#9298a6]">{x.etiquette}</Mono>}
              </p>
              <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-[#c9cdd6] max-w-[760px]">{x.commentaire}</p>
            </div>
          </div>
        )) : <p className="m-0 text-[13px] text-[#9298a6]">Aucun écart significatif avec la pré-analyse.</p>}
      </Section>

      {/* Anomalies */}
      <Section id="anomalies" titre="Anomalies" droite={anomalies.length ? `${anomalies.filter((a) => a.statut === "ko").length} ✕ · ${anomalies.filter((a) => a.statut === "a_verifier").length} ! · ${anomalies.filter((a) => a.statut === "ok").length} ✓` : "aucune"}>
        {anomalies.length ? (
          <ul className="m-0 p-0 list-none">
            {anomalies.map((a, i) => (
              <li key={i} className="flex items-start gap-3 py-3 border-t border-[#15171b] first:border-t-0">
                <Glyphe statut={a.statut} />
                <p className="m-0 flex-1 min-w-0 text-[14px] leading-[1.55] text-[#d6d6db]"><span className="font-semibold text-[#f2f3f5]">{a.titre}</span>{a.detail ? <span className="text-[#c9cdd6]"> — {a.detail}</span> : null}{a.action ? <span className="text-[#6a7180]"> {a.action}</span> : null}</p>
                <Source s={a.source} onPreuve={onPreuve} />
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[13px] text-[#7fd1a8]">Rien à signaler : le bail tient et les chiffres sont vrais.</p>}
      </Section>

      {/* Le bien en dix lignes */}
      <Section id="fiche" titre="Le bien" droite={fiche.adresse?.valeur ? fiche.adresse.valeur.slice(0, 90) : null}>
        <h3 className="m-0 mb-3 text-[18px] font-medium text-[#f2f3f5]">{fiche.titre}</h3>
        <dl className="m-0 grid grid-cols-[110px_1fr_auto] gap-x-6 gap-y-2 items-baseline">
          {fiche.lignes.map((l) => (
            <React.Fragment key={l.id}>
              <dt className="text-[12.5px] text-[#6a7180]">{l.libelle}</dt>
              <dd className="m-0 min-w-0">
                {l.source ? <button onClick={() => onPreuve(l.source)} className="text-left text-[14px] leading-[1.5] text-[#f2f3f5] hover:text-[#ffffff]">{l.valeur}</button> : <span className="text-[14px] text-[#f2f3f5]">{l.valeur}</span>}
                {l.detail && <p className="m-0 text-[12.5px] text-[#9298a6]">{l.detail}</p>}
              </dd>
              <dd className="m-0"><Source s={l.source} onPreuve={onPreuve} /></dd>
            </React.Fragment>
          ))}
        </dl>
      </Section>

      {/* Le simulateur */}
      {r.simulateur && (r.simulateur.prixBienFAI || r.simulateur.loyerInitialHTHC) ? (
        <Section id="simulateur" titre="Simulateur · chiffres du bail">
          <p className="m-0 mb-3 text-[12.5px] text-[#9298a6]">{r.hypotheses.join(" ")}</p>
          <SimulateurDossier key={`${r.simulateur.loyerInitialHTHC}-${r.simulateur.loyerSoumisTVA}-${r.simulateur.taxeFonciereRefacturable}`} parametres={r.simulateur} />
        </Section>
      ) : null}

      {/* Les pièces pour l'étape 2 */}
      <Section id="pieces" titre="Documents pour l'étape 2" droite={`${d2.importes} importé${d2.importes > 1 ? "s" : ""} · ${d2.manquants.length} manquant${d2.manquants.length > 1 ? "s" : ""}`} sansFilet>
        {d2.presents.length > 0 && <p className="m-0 text-[13px] text-[#c9cdd6]"><span className="text-[#6a7180]">Présents : </span>{d2.presents.map((p) => `${p.categorie} (${p.n})`).join(" · ")}</p>}
        {d2.manquants.length > 0 && <ul className="m-0 mt-2 pl-4 space-y-0.5">{d2.manquants.map((x) => <li key={x.piece} className="text-[13px] text-[#c9cdd6]">{x.piece} — <span className="text-[#6a7180]">{x.detail}</span></li>)}</ul>}
      </Section>

      {dialog && <DialogMailIntention dossier={dossier} intention={dialog} parametres={dialog === "demande_documents" ? { raisons: e.demandes_texte } : { raisons: e.motif_passer || undefined }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onRefresh?.(); tout(); }} />}
    </>
  );
}
