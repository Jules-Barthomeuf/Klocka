import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Send, X } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";

// Étape 1 — Bail et locataire. Ce que l'analyste lit en quinze secondes :
// le bien en dix lignes, la rentabilité réelle, ce qui a bougé depuis le
// teaser, les deal-breakers, les points notables, les pièces pour la suite.
// Chaque ligne renvoie à la page du document.

const Titre = ({ children, droite }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>
    {droite ? <span className="text-[12px] text-[#9298a6]">{droite}</span> : null}
  </div>
);
const eur = (v) => (v == null ? "—" : `${Math.round(v).toLocaleString("fr-FR")} €`);

export function BarreEtapes({ e, onEtape, apercu }) {
  return (
    <div className="px-5 py-3 border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        {e.etapes.map((x) => (
          <button key={x.n} onClick={() => x.n <= e.etape && onEtape?.(x.n)} disabled={apercu || x.n > e.etape} className={`text-[12.5px] flex items-center gap-2 ${x.n === e.etape ? "text-[#f2f3f5] font-semibold" : x.n < e.etape ? "text-[#96c0b8]" : "text-[#4d545d]"}`}>
            <span className={`w-5 h-5 rounded-full border text-[10.5px] flex items-center justify-center ${x.n === e.etape ? "border-[#f2f3f5]" : x.n < e.etape ? "border-[#96c0b8]" : "border-[#2c3139]"}`}>{x.n < e.etape ? <Check className="w-3 h-3" /> : x.n}</span>
            {x.titre}
          </button>
        ))}
      </div>
      <span className="text-[12px] text-[#9298a6]">
        Étape {e.etape} sur {e.etapes.length} · {e.etapes[e.etape - 1]?.titre} · {e.progression.lus} document{e.progression.lus > 1 ? "s" : ""} lu{e.progression.lus > 1 ? "s" : ""} sur {e.progression.total}
      </span>
    </div>
  );
}

function Source({ s, onPreuve }) {
  if (!s?.document_id) return null;
  return <button onClick={() => onPreuve(s)} className="text-[11px] text-[#6a7180] hover:text-[#f2f3f5] whitespace-nowrap">{s.document_nom}{s.page ? ` · p.${s.page}` : ""}</button>;
}

export default function EtapeDataRoom({ dossier, e, onPreuve, onRefresh, apercu = false }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const tout = () => ["etape1", "carte", "matrice", "fiche", "livrables"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const lancer = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/etape/${n}`, { body: {} }),
    onSuccess: (r, n) => { toast.success(n === 1 ? "Lecture du bail, des quittances et du Kbis lancée" : r.rien_a_lire ? "Étape suivante" : "Lecture des pièces restantes lancée"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const enCours = e.remplissage?.etat === "en_cours";
  const nbDocs = e.progression.total;

  if (!e.lue) {
    return (
      <div className="px-5 py-8">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Étape 1 · Bail et locataire</p>
        <p className="m-0 mt-2 text-[14.5px] leading-[1.65] text-[#d6d6db] max-w-[720px]">{nbDocs ? `${nbDocs} pièce${nbDocs > 1 ? "s" : ""} importée${nbDocs > 1 ? "s" : ""}. Le bail, ses avenants, les quittances et le Kbis sont lus en premier (${e.progression.presents_etape} pièce${e.progression.presents_etape > 1 ? "s" : ""}). Les autres attendent l'étape 2.` : "Importez les pièces de la data room dans l'onglet Documents : elles sont classées automatiquement."}</p>
        <div className="mt-5 flex items-center gap-4">
          {enCours ? <span className="inline-flex items-center gap-2 text-[13px] text-[#9298a6]"><Loader2 className="w-4 h-4 animate-spin" /> {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || "lecture"}</span>
            : <button onClick={() => lancer.mutate(1)} disabled={apercu || !e.progression.presents_etape || lancer.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Lire le bail et le locataire</button>}
          {!e.progression.presents_etape && nbDocs > 0 && <span className="text-[12.5px] text-[#e8b04c]">Aucune pièce classée Bail, Avenants, Quittances ou Kbis : vérifiez les catégories dans Documents.</span>}
        </div>
      </div>
    );
  }

  const { fiche, rentabilite: r, ecarts, deal_breakers: db, notables, documents_etape2: d2 } = e;
  const nbKo = db.filter((x) => !x.ok).length;

  return (
    <>
      {enCours && <div className="px-5 py-2 border-b border-[#1f2228] text-[12px] text-[#9298a6] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || ""}</div>}

      {/* Bloc 1 — le bien en dix lignes */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <h3 className="m-0 text-[20px] font-medium text-[#f2f3f5] leading-snug">{fiche.titre}</h3>
        {fiche.adresse?.valeur && (
          <p className="m-0 mt-1 text-[13.5px] text-[#9298a6] leading-[1.55] max-w-[720px]">
            {fiche.adresse.source ? <button onClick={() => onPreuve(fiche.adresse.source)} className="text-left hover:text-[#f2f3f5]">{fiche.adresse.valeur}</button> : fiche.adresse.valeur}
          </p>
        )}
        <dl className="m-0 mt-4 grid grid-cols-[110px_1fr] gap-x-6 gap-y-2 max-w-[860px]">
          {fiche.lignes.map((l) => (
            <React.Fragment key={l.id}>
              <dt className="text-[12.5px] text-[#6a7180] pt-px">{l.libelle}</dt>
              <dd className="m-0 min-w-0">
                <div className="flex items-baseline justify-between gap-4">
                  {l.source ? <button onClick={() => onPreuve(l.source)} className="text-left text-[14px] leading-[1.5] text-[#f2f3f5] hover:text-[#ffffff]">{l.valeur}</button> : <span className="text-[14px] leading-[1.5] text-[#f2f3f5]">{l.valeur}</span>}
                  <Source s={l.source} onPreuve={onPreuve} />
                </div>
                {l.detail && <p className="m-0 text-[12.5px] text-[#9298a6]">{l.detail}</p>}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      </div>

      {/* Bloc 2 — la rentabilité réelle */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre>La rentabilité réelle</Titre>
        {r.prix_fai ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
            {[["Prix FAI", eur(r.prix_fai)], ["Prix AEM", eur(r.prix_aem)], ["Loyer du bail", `${eur(r.loyer_bail)}/an`], ["Rendement brut AEM", r.rendement_brut_aem != null ? `${r.rendement_brut_aem.toFixed(2)} %` : "—"], ["Rendement net AEM", r.rendement_net_aem != null ? `${r.rendement_net_aem.toFixed(2)} %` : "—"]].map(([l, v]) => (
              <div key={l}><p className="m-0 text-[11px] text-[#6a7180]">{l}</p><p className={`m-0 text-[18px] font-light tabular-nums ${l.startsWith("Rendement net") ? (r.dans_criteres ? "text-[#7fd1a8]" : "text-[#e8927c]") : "text-[#f2f3f5]"}`}>{v}</p></div>
            ))}
          </div>
        ) : null}
        <p className="m-0 text-[14px] leading-[1.7] text-[#d6d6db] max-w-[860px]">{r.phrase || "Le loyer n'a pas été trouvé dans le bail : la rentabilité ne peut pas encore être calculée."}</p>
      </div>

      {/* Bloc 3 — écarts teaser → bail */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre>Écarts teaser → bail</Titre>
        {ecarts.length ? (
          <div className="space-y-3 max-w-[860px]">
            {ecarts.map((x) => (
              <div key={x.libelle} className="grid grid-cols-[110px_1fr] gap-x-6">
                <span className="text-[12.5px] text-[#6a7180] pt-px">{x.libelle}</span>
                <div>
                  <p className="m-0 text-[13.5px] text-[#f2f3f5]"><span className="text-[#9298a6]">Teaser : {x.teaser ?? "—"}</span> <span className="text-[#4d545d] mx-2">→</span> Bail : {x.bail}</p>
                  <p className="m-0 text-[12px] text-[#9298a6]">{x.commentaire}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="m-0 text-[13.5px] text-[#9298a6]">Aucun écart significatif avec la pré-analyse.</p>}
      </div>

      {/* Bloc 4 — deal-breakers */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite={nbKo ? `${nbKo} détecté${nbKo > 1 ? "s" : ""}` : "Aucun"}>Deal-breakers</Titre>
        <ul className="m-0 p-0 list-none space-y-2.5 max-w-[860px]">
          {[...db.filter((x) => !x.ok), ...db.filter((x) => x.ok)].map((x, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-[3px] w-[18px] h-[18px] rounded-full flex-none flex items-center justify-center ${x.ok ? "bg-[#7fd1a8]/15 text-[#7fd1a8]" : "bg-[#e8927c]/15 text-[#e8927c]"}`}>{x.ok ? <Check className="w-3 h-3" strokeWidth={3} /> : <X className="w-3 h-3" strokeWidth={3} />}</span>
              <div className="min-w-0">
                <p className={`m-0 text-[13.5px] ${x.ok ? "text-[#c9cdd6]" : "text-[#f2f3f5] font-semibold"}`}>{x.libelle}</p>
                {x.detail && <p className="m-0 text-[12.5px] leading-[1.55] text-[#9298a6]">{x.detail} <Source s={x.source} onPreuve={onPreuve} /></p>}
                {x.action && <p className="m-0 text-[12.5px] text-[#e8927c]">→ {x.action}</p>}
              </div>
            </li>
          ))}
        </ul>
        {e.recommandation !== "continuer" && (
          <p className="m-0 mt-4 text-[13px] text-[#e8927c]">{e.recommandation === "passer" ? "Recommandation : s'arrêter là." : "Recommandation : demander un complément avant de continuer."}</p>
        )}
      </div>

      {/* Bloc 5 — points notables */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite={String(notables.length)}>Points notables</Titre>
        {notables.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {notables.map((n, i) => (
              <div key={i} className="min-w-0">
                <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">{n.titre}</p>
                <p className="m-0 mt-1 text-[12.5px] leading-[1.6] text-[#b5b5bd]">{n.detail} <Source s={n.source} onPreuve={onPreuve} /></p>
                <p className="m-0 mt-1 text-[12.5px] text-[#9298a6]">→ {n.renvoi}</p>
              </div>
            ))}
          </div>
        ) : <p className="m-0 text-[13.5px] text-[#9298a6]">Rien de notable dans le bail et le Kbis.</p>}
      </div>

      {/* Bloc 6 — documents pour l'étape 2 */}
      <div className="px-5 py-5 border-b border-[#1f2228]">
        <Titre droite={`${d2.importes} importé${d2.importes > 1 ? "s" : ""} · ${d2.manquants.length} manquant${d2.manquants.length > 1 ? "s" : ""}`}>Documents pour l'étape 2</Titre>
        {d2.presents.length > 0 && <p className="m-0 text-[13px] text-[#c9cdd6]"><span className="text-[#6a7180]">Présents : </span>{d2.presents.map((p) => `${p.categorie} (${p.n})`).join(" · ")}</p>}
        {d2.manquants.length > 0 && (
          <div className="mt-2">
            <p className="m-0 text-[12.5px] text-[#6a7180]">Manquants :</p>
            <ul className="m-0 mt-1 pl-4 space-y-0.5">{d2.manquants.map((x) => <li key={x.piece} className="text-[13px] text-[#c9cdd6]">{x.piece} — {x.detail}</li>)}</ul>
          </div>
        )}
      </div>

      {/* La décision de fin d'étape */}
      <div className="px-5 py-5 grid sm:grid-cols-3 gap-4">
        <button onClick={() => !apercu && lancer.mutate(2)} disabled={apercu || enCours} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "continuer" ? "border-[#96c0b8]/50 hover:border-[#96c0b8]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5] flex items-center gap-2">Continuer <ArrowRight className="w-3.5 h-3.5" /> Étape 2</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Le système lit le reste des pièces : RCP, copropriété, diagnostics, Carrez, marché.{e.recommandation === "continuer" ? " Cas par défaut : aucun deal-breaker." : ""}</p>
        </button>
        <button onClick={() => !apercu && setDialog("demande_documents")} disabled={apercu} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "complements" ? "border-[#e8b04c]/60 hover:border-[#e8b04c]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5] flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Demander des compléments</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Un mail avec les pièces manquantes et les points à clarifier. Le dossier se met en attente. Rien ne part sans validation.</p>
        </button>
        <button onClick={() => !apercu && setDialog("abandon")} disabled={apercu} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "passer" ? "border-[#e8746a]/60 hover:border-[#e8746a]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Passer</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Le deal est mort : archivé avec le motif{e.motif_passer ? ` (${e.motif_passer})` : ""}, refus pré-rédigé.</p>
        </button>
      </div>

      {dialog && (
        <DialogMailIntention
          dossier={dossier}
          intention={dialog}
          parametres={dialog === "demande_documents" ? { raisons: e.demandes_texte } : { raisons: e.motif_passer || undefined }}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); onRefresh?.(); tout(); }}
        />
      )}
    </>
  );
}
