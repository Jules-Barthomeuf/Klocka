import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Send, X } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";

// Étape 2 — Immeuble et copropriété. Le bail tient : le bien physique et son
// environnement méritent-ils qu'on y mette de l'argent ? Cinq blocs
// synthétiques, et les grilles d'extraction derrière, pour vérifier.

const TEINTE = { ok: "#7fd1a8", ko: "#e8927c", a_verifier: "#e8b04c", inconnu: "#4d545d", action: "#e8b04c", absent: "#4d545d", a_lire: "#8fb6e8" };
const Titre = ({ children, droite }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>
    {droite ? <span className="text-[12px] text-[#9298a6]">{droite}</span> : null}
  </div>
);
const Point = ({ statut }) => <span className="inline-block w-2 h-2 rounded-full flex-none mt-[7px]" style={{ background: TEINTE[statut] || "#4d545d" }} />;
function Source({ s, onPreuve }) {
  if (!s?.document_id) return null;
  return <button onClick={() => onPreuve(s)} className="text-[11px] text-[#6a7180] hover:text-[#f2f3f5] whitespace-nowrap">{s.document_nom}{s.page ? ` · p.${s.page}` : ""}</button>;
}

function GrilleCategorie({ g, onPreuve }) {
  return (
    <div className="mb-6">
      <p className="m-0 mb-2 text-[12.5px] font-semibold text-[#f2f3f5]">{g.titre} <span className="text-[#6a7180] font-normal">· {g.lignes.length} pièce{g.lignes.length > 1 ? "s" : ""}</span></p>
      <div className="overflow-x-auto border border-[#1e1e22] rounded-xl">
        <table className="border-collapse text-[12px] min-w-full">
          <thead><tr className="bg-[#0f0f11]">
            <th className="sticky left-0 bg-[#0f0f11] text-left px-3 py-2 text-[10px] tracking-[.14em] uppercase text-[#77777e] font-normal border-b border-r border-[#1e1e22] min-w-[200px]">Document</th>
            {g.colonnes.map((c) => <th key={c.id} title={c.question} className="text-left px-3 py-2 text-[11.5px] font-semibold text-[#f2f3f5] border-b border-r border-[#1e1e22] min-w-[170px]">{c.libelle}</th>)}
          </tr></thead>
          <tbody>
            {g.lignes.map((l) => (
              <tr key={l.document_id} className={l.perime ? "opacity-50" : ""}>
                <td className="sticky left-0 bg-[#0f0f11] px-3 py-2 border-b border-r border-[#1e1e22] align-top">
                  <span className="block text-[12.5px] text-[#f2f3f5] truncate max-w-[200px]" title={l.document_nom}>{l.document_nom}</span>
                  <span className="block text-[10.5px] text-[#5f5f66]">{l.categorie}{l.date_document ? ` · ${l.date_document.split("-").reverse().join("/")}` : ""}{l.perime ? " · remplacé" : ""}</span>
                </td>
                {g.colonnes.map((c) => { const cel = l.cellules[c.id]; return (
                  <td key={c.id} className="px-3 py-2 border-b border-r border-[#1e1e22] align-top">
                    {cel?.reponse ? <button onClick={() => onPreuve({ document_id: l.document_id, document_nom: l.document_nom, document_url: l.document_url, page: cel.page, citation: cel.citation })} className="text-left text-[#d6d6db] hover:text-[#ffffff] line-clamp-3" title={cel.citation || cel.reponse}>{cel.reponse}{cel.page ? <span className="text-[#5f5f66]"> · p.{cel.page}</span> : null}</button> : <span className="text-[#3a3f4a]">—</span>}
                  </td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function EtapeDataRoom2({ dossier, e, onPreuve, onRefresh, apercu = false }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState(null);
  const [vue, setVue] = useState("blocs");
  const tout = () => ["etape1", "etape2", "carte", "matrice", "fiche", "livrables"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const lancer = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/etape/${n}`, { body: {} }),
    onSuccess: (r, n) => { toast.success(n === 2 ? (r.rien_a_lire ? "Rien de plus à lire" : "Lecture des pièces restantes lancée") : "Étape 3 — prix et négociation"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const enCours = e.remplissage?.etat === "en_cours";

  if (!e.lue) {
    return (
      <div className="px-5 py-8">
        <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Étape 2 · Immeuble et copropriété</p>
        <p className="m-0 mt-2 text-[14.5px] leading-[1.65] text-[#d6d6db] max-w-[720px]">{e.progression.presents_etape ? `${e.progression.presents_etape} pièce${e.progression.presents_etape > 1 ? "s" : ""} à lire : règlement de copropriété, PV d'AG, diagnostics, Carrez, plans, EDD, appels de charges.` : "Aucune pièce d'immeuble ou de copropriété dans le dossier : importez-les, ou passez à l'étape 3 avec ce que dit le bail."}</p>
        <div className="mt-5 flex items-center gap-4">
          {enCours ? <span className="inline-flex items-center gap-2 text-[13px] text-[#9298a6]"><Loader2 className="w-4 h-4 animate-spin" /> {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || "lecture"}</span>
            : e.progression.presents_etape ? <button onClick={() => lancer.mutate(2)} disabled={apercu || lancer.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Lire l'immeuble et la copropriété</button>
            : <button onClick={() => lancer.mutate(3)} disabled={apercu} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] border border-[#2c3139] text-[13px] text-[#c9cdd6] hover:text-[#f2f3f5]">Passer à l'étape 3 <ArrowRight className="w-3.5 h-3.5" /></button>}
        </div>
      </div>
    );
  }

  const { copro, etat_bien: bien, surfaces, marche, synthese, deal_breakers: db } = e;
  const nbKo = db.filter((x) => !x.ok).length;
  const Ligne = ({ libelle, x }) => (
    <div className="grid grid-cols-[130px_1fr] gap-x-6 py-2 border-b border-[#15171b] last:border-b-0">
      <span className="text-[12.5px] text-[#6a7180] pt-px">{libelle}</span>
      <div className="flex items-start gap-2.5"><Point statut={x.statut} /><p className="m-0 text-[13.5px] leading-[1.55] text-[#e6e7ea]">{x.texte} <Source s={x.source} onPreuve={onPreuve} /></p></div>
    </div>
  );

  return (
    <>
      {enCours && <div className="px-5 py-2 border-b border-[#1f2228] text-[12px] text-[#9298a6] flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || ""}</div>}
      <div className="px-5 pt-3 flex gap-5 border-b border-[#1f2228]">
        {[["blocs", "Synthèse"], ["grilles", `Extraction · ${e.grilles.length} grille${e.grilles.length > 1 ? "s" : ""}`]].map(([id, l]) => (
          <button key={id} onClick={() => setVue(id)} className={`relative pb-2.5 text-[13px] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#e8927c] after:origin-left after:scale-x-0 after:transition-transform ${vue === id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>{l}</button>
        ))}
      </div>

      {vue === "grilles" ? (
        <div className="px-5 py-5">
          <p className="m-0 mb-4 text-[12.5px] text-[#9298a6]">Les pièces d'une même famille répondent aux mêmes questions : une contradiction se lit sur la ligne. Chaque cellule ouvre la page du document.</p>
          {e.grilles.map((g) => <GrilleCategorie key={g.id} g={g} onPreuve={onPreuve} />)}
        </div>
      ) : (
        <>
          {/* Bloc 1 — copropriété */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre>Copropriété</Titre>
            <Ligne libelle="Activité conforme" x={copro.conformite} />
            <Ligne libelle="Travaux votés" x={copro.travaux} />
            <Ligne libelle="Litiges" x={copro.litiges} />
            <Ligne libelle="Coût de la copro" x={copro.cout} />
            {copro.tantiemes && <div className="grid grid-cols-[130px_1fr] gap-x-6 py-2"><span className="text-[12.5px] text-[#6a7180]">Tantièmes</span><p className="m-0 text-[13px] text-[#c9cdd6]">{copro.tantiemes.texte} <Source s={copro.tantiemes.source} onPreuve={onPreuve} /></p></div>}
          </div>

          {/* Bloc 2 — état du bien */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre>État du bien</Titre>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {bien.map((d) => (
                <div key={d.sujet} className="flex items-start gap-2.5 py-2 border-b border-[#15171b]">
                  <Point statut={d.statut} />
                  <div className="min-w-0">
                    <p className="m-0 text-[13px] text-[#f2f3f5]">{d.sujet}{d.validite ? <span className="text-[#6a7180]"> · valide jusqu'au {d.validite.split("-").reverse().join("/")}</span> : null}</p>
                    <p className="m-0 text-[12.5px] leading-[1.5] text-[#9298a6]">{d.resultat} <Source s={d.source} onPreuve={onPreuve} /></p>
                    {d.action && <p className="m-0 text-[12.5px] text-[#e8b04c]">Action : {d.action}{d.cout ? ` — ${Math.round(d.cout).toLocaleString("fr-FR")} €` : ""}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bloc 3 — surfaces */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre droite={surfaces.min != null ? `de ${surfaces.min} à ${surfaces.max} m²` : null}>Surfaces</Titre>
            {surfaces.sources.length > 0 && (
              <table className="border-collapse text-[13px] mb-3">
                <tbody>
                  {surfaces.sources.map((x, i) => (
                    <tr key={i} className="border-b border-[#15171b]">
                      <td className="py-1.5 pr-6 text-[#c9cdd6]">{x.document_id ? <button onClick={() => onPreuve(x)} className="hover:text-[#f2f3f5] text-left">{x.source}</button> : x.source}</td>
                      <td className="py-1.5 pr-6 text-[#6a7180]">{x.categorie}</td>
                      <td className={`py-1.5 pr-6 tabular-nums ${surfaces.incoherence && (x.valeur === surfaces.min || x.valeur === surfaces.max) ? "text-[#e8927c]" : "text-[#f2f3f5]"}`}>{x.valeur} m²</td>
                      <td className="py-1.5 text-[12px] text-[#6a7180]">{x.extrait || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className={`m-0 text-[13.5px] ${surfaces.incoherence ? "text-[#e8b04c]" : "text-[#9298a6]"}`}>{surfaces.lecture}</p>
          </div>

          {/* Bloc 4 — marché */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre>Marché</Titre>
            {marche.commune && <p className="m-0 text-[13.5px] text-[#f2f3f5]">{marche.commune}{marche.revenu_median ? ` · revenu médian ${Math.round(marche.revenu_median).toLocaleString("fr-FR")} €` : ""}{marche.loyer_m2 ? ` · loyer ${marche.loyer_m2} €/m²/an` : ""}</p>}
            {marche.contexte ? <p className="m-0 mt-2 text-[13px] leading-[1.65] text-[#b5b5bd] whitespace-pre-wrap max-w-[860px]">{marche.contexte.resume}</p> : <p className="m-0 mt-2 text-[13px] text-[#9298a6]">Pas de contexte de marché : la pré-analyse n'a pas fait de recherche web.</p>}
            {marche.indisponibles.length > 0 && <p className="m-0 mt-2 text-[12px] text-[#6a7180]">Non disponibles dans la base : {marche.indisponibles.join(", ")}.</p>}
            <p className="m-0 mt-2 text-[13px] text-[#d6d6db]">{marche.question}</p>
          </div>

          {/* Bloc 5 — synthèse */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre>Synthèse</Titre>
            <ul className="m-0 p-0 list-none space-y-1.5">
              {synthese.map((x) => <li key={x.sujet} className="flex items-start gap-2.5 text-[13.5px] text-[#e6e7ea]"><Point statut={x.statut} />{x.texte}</li>)}
            </ul>
          </div>

          {/* Deal-breakers de l'étape */}
          <div className="px-5 py-5 border-b border-[#1f2228]">
            <Titre droite={nbKo ? `${nbKo} détecté${nbKo > 1 ? "s" : ""}` : "Aucun"}>Deal-breakers</Titre>
            <ul className="m-0 p-0 list-none space-y-2.5">
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
            {e.recommandation !== "continuer" && <p className="m-0 mt-4 text-[13px] text-[#e8927c]">{e.recommandation === "passer" ? "Recommandation : s'arrêter là." : "Recommandation : demander un complément avant de continuer."}</p>}
          </div>
        </>
      )}

      {/* La décision de fin d'étape */}
      <div className="px-5 py-5 grid sm:grid-cols-3 gap-4">
        <button onClick={() => !apercu && lancer.mutate(3)} disabled={apercu || enCours} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "continuer" ? "border-[#96c0b8]/50 hover:border-[#96c0b8]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5] flex items-center gap-2">Continuer <ArrowRight className="w-3.5 h-3.5" /> Étape 3</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Prix et négociation : le simulateur avec les données réelles, les livrables.{e.recommandation === "continuer" ? " Cas par défaut : pas de nouveau deal-breaker." : ""}</p>
        </button>
        <button onClick={() => !apercu && setDialog("demande_documents")} disabled={apercu} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "complements" ? "border-[#e8b04c]/60 hover:border-[#e8b04c]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5] flex items-center gap-2"><Send className="w-3.5 h-3.5" /> Demander des compléments</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Le mail cumule les demandes des étapes 1 et 2. Rien ne part sans validation.</p>
        </button>
        <button onClick={() => !apercu && setDialog("abandon")} disabled={apercu} className={`text-left rounded-md p-5 border transition-colors ${e.recommandation === "passer" ? "border-[#e8746a]/60 hover:border-[#e8746a]" : "border-[#1f2228] hover:border-[#2c3139]"} disabled:opacity-50`}>
          <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">Passer</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.55] text-[#9298a6]">Deal-breaker copropriété ou technique : archivé avec le motif{e.motif_passer ? ` (${e.motif_passer})` : ""}, refus pré-rédigé.</p>
        </button>
      </div>

      {dialog && <DialogMailIntention dossier={dossier} intention={dialog} parametres={dialog === "demande_documents" ? { raisons: e.demandes_texte } : { raisons: e.motif_passer || undefined }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onRefresh?.(); tout(); }} />}
    </>
  );
}
