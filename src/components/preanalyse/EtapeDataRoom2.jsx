import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Loader2 } from "lucide-react";
import { DialogMailIntention } from "./DealResultat";
import { Mono, Section } from "./CadreEtapes";

// Étape 2 — Bien, copropriété et marché. Cinq blocs synthétiques, et les
// grilles d'extraction derrière, pour vérifier.

const TEINTE = { ok: "text-vert", ko: "text-alerte", a_verifier: "text-ambre", inconnu: "text-brume", action: "text-ambre", absent: "text-brume", a_lire: "text-bleu" };
function Source({ s, onPreuve }) {
  if (!s?.document_id) return null;
  return <button onClick={() => onPreuve(s)} className="font-mono text-[11px] tracking-[.06em] text-brume hover:text-encre whitespace-nowrap">{(s.document_nom || "").replace(/\.pdf$/i, "").slice(0, 26)}{s.page ? ` p. ${s.page}` : ""}</button>;
}
const Th = ({ children, droite }) => <th className={`font-normal py-2 ${droite ? "text-right" : "text-left"}`}><Mono>{children}</Mono></th>;

function GrilleCategorie({ g, onPreuve }) {
  return (
    <div className="mb-6">
      <p className="m-0 mb-2 text-[12.5px] font-semibold text-encre">{g.titre} <span className="text-brume font-normal">· {g.lignes.length} pièce{g.lignes.length > 1 ? "s" : ""}</span></p>
      <div className="overflow-x-auto border border-relief">
        <table className="border-collapse text-[12.5px] min-w-full">
          <thead><tr className="bg-fond">
            <th className="sticky left-0 bg-fond text-left px-3 py-2 border-b border-r border-relief min-w-[200px]"><Mono>Document</Mono></th>
            {g.colonnes.map((c) => <th key={c.id} title={c.question} className="text-left px-3 py-2 text-[11px] font-semibold text-encre border-b border-r border-relief min-w-[170px]">{c.libelle}</th>)}
          </tr></thead>
          <tbody>
            {g.lignes.map((l) => (
              <tr key={l.document_id} className={l.perime ? "opacity-50" : ""}>
                <td className="sticky left-0 bg-fond px-3 py-2 border-b border-r border-relief align-top">
                  <span className="block text-[12.5px] text-encre truncate max-w-[200px]" title={l.document_nom}>{l.document_nom}</span>
                  <Mono className="normal-case tracking-[.04em]">{l.categorie}{l.date_document ? ` · ${l.date_document.split("-").reverse().join("/")}` : ""}{l.perime ? " · remplacé" : ""}</Mono>
                </td>
                {g.colonnes.map((c) => { const cel = l.cellules[c.id]; return (
                  <td key={c.id} className="px-3 py-2 border-b border-r border-relief align-top">
                    {cel?.reponse ? <button onClick={() => onPreuve({ document_id: l.document_id, document_nom: l.document_nom, document_url: l.document_url, page: cel.page, citation: cel.citation })} className="text-left text-craie hover:text-[#ffffff] line-clamp-3" title={cel.citation || cel.reponse}>{cel.reponse}{cel.page ? <span className="text-brume"> · p.{cel.page}</span> : null}</button> : <span className="text-bord-vif">—</span>}
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

export default function EtapeDataRoom2({ dossier, e, onPreuve, onRefresh, apercu = false, dialog, setDialog }) {
  const dealId = dossier.deal_id;
  const queryClient = useQueryClient();
  const [vue, setVue] = useState("blocs");
  const tout = () => ["etape1", "etape2", "etape3", "etape4", "carte", "matrice", "fiche", "livrables"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const lancer = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/etape/${n}`, { body: {} }),
    onSuccess: (r) => { toast.success(r.rien_a_lire ? "Rien de plus à lire" : "Lecture des pièces restantes lancée"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const enCours = e.remplissage?.etat === "en_cours";

  if (!e.lue) {
    return (
      <div className="px-6 py-8">
        <p className="m-0 text-[15px] leading-[1.65] text-craie max-w-[720px]">{e.progression.presents_etape ? `${e.progression.presents_etape} pièce${e.progression.presents_etape > 1 ? "s" : ""} à lire : règlement de copropriété, PV d'AG, diagnostics, Carrez, plans, EDD, appels de charges.` : "Aucune pièce d'immeuble ou de copropriété dans le dossier : importez-les en bas de page, ou passez à l'étape 3 avec ce que dit le bail."}</p>
        <div className="mt-5 flex items-center gap-4">
          {enCours ? <span className="inline-flex items-center gap-2 text-[12.5px] text-ardoise"><Loader2 className="w-4 h-4 animate-spin" /> {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || "lecture"}</span>
            : e.progression.presents_etape ? <button onClick={() => lancer.mutate(2)} disabled={apercu || lancer.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-encre text-fond text-[12.5px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">Lire l'immeuble et la copropriété</button> : null}
        </div>
      </div>
    );
  }

  const { copro_questions: questions, etat_bien: bien, surfaces, marche, synthese } = e;
  return (
    <>
      {enCours && <div className="px-6 py-2 border-b border-trait text-[12.5px] text-ardoise flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture {e.remplissage.fait}/{e.remplissage.total ?? "…"} — {e.remplissage.document || ""}</div>}
      <div className="px-6 max-md:px-4 flex items-center justify-between gap-4 border-b border-trait">
        <div className="flex gap-6">
          {[["blocs", "Synthèse"], ["grilles", "Extraction"]].map(([id, l]) => (
            <button key={id} onClick={() => setVue(id)} className={`relative py-3 text-[13.5px] after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-encre after:origin-left after:scale-x-0 after:transition-transform ${vue === id ? "text-encre font-semibold after:scale-x-100" : "text-brume hover:text-craie"}`}>{l}</button>
          ))}
        </div>
        <Mono className={e.nouveau_deal_breaker ? "text-alerte" : ""}>{e.nouveau_deal_breaker ? `${e.deal_breakers.filter((x) => !x.ok).length} nouveau${e.deal_breakers.filter((x) => !x.ok).length > 1 ? "x" : ""} deal-breaker${e.deal_breakers.filter((x) => !x.ok).length > 1 ? "s" : ""}` : "Aucun nouveau deal-breaker"}</Mono>
      </div>

      {vue === "grilles" ? (
        <div className="px-6 max-md:px-4 py-5">
          <p className="m-0 mb-4 text-[12.5px] text-ardoise">Les pièces d'une même famille répondent aux mêmes questions : une contradiction se lit sur la ligne. Chaque cellule ouvre la page du document.</p>
          {e.grilles.length ? e.grilles.map((g) => <GrilleCategorie key={g.id} g={g} onPreuve={onPreuve} />) : <p className="m-0 text-[12.5px] text-ardoise">Aucune pièce lue.</p>}
        </div>
      ) : (
        <>
          <Section id="copro" titre="1 · Copropriété">
            {questions.map((q) => (
              <div key={q.question} className="grid grid-cols-[minmax(220px,1fr)_2fr_130px] max-md:grid-cols-1 gap-x-6 gap-y-1 py-3 border-t border-relief first:border-t-0 items-baseline">
                <span className="text-[13.5px] text-craie">{q.question}</span>
                <p className="m-0 text-[13.5px] leading-[1.55] text-craie"><span className="font-semibold text-encre">{q.tete}</span> — {q.reponse} <Source s={q.source} onPreuve={onPreuve} /></p>
                <Mono className={`${TEINTE[q.statut]} md:text-right`}>{q.mot}</Mono>
              </div>
            ))}
          </Section>

          <Section id="bien" titre="2 · État du bien">
            <table className="w-full border-collapse">
              <thead><tr><Th>Sujet</Th><Th>Résultat</Th><Th>Action requise</Th><Th droite>Coût</Th></tr></thead>
              <tbody>
                {bien.map((d) => (
                  <tr key={d.sujet} className="border-t border-relief">
                    <td className="py-3 pr-4 text-[13.5px] text-craie whitespace-nowrap">{d.sujet}</td>
                    <td className="py-3 pr-4 text-[13.5px] text-encre">{d.resultat} <Source s={d.source} onPreuve={onPreuve} /></td>
                    <td className={`py-3 pr-4 text-[13.5px] ${d.statut === "action" ? "text-encre" : "text-ardoise"}`}>{d.action}</td>
                    <td className="py-3 text-right tabular-nums font-light text-[15px] text-encre whitespace-nowrap">{d.cout_texte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section id="surfaces" titre="3 · Surfaces · croisement des sources" droite={surfaces.incoherence ? surfaces.lecture : null}>
            {surfaces.sources.length ? (
              <table className="w-full border-collapse">
                <thead><tr><Th>Source</Th><Th>Périmètre</Th><Th droite>Surface</Th><Th>Observation</Th></tr></thead>
                <tbody>
                  {surfaces.sources.map((x, i) => (
                    <tr key={i} className="border-t border-relief">
                      <td className="py-3 pr-4 text-[13.5px] text-craie">{x.document_id ? <button onClick={() => onPreuve(x)} className="hover:text-encre text-left">{x.categorie === "Annonce" ? x.source : x.categorie}</button> : x.source}</td>
                      <td className="py-3 pr-4 text-[13.5px] text-encre">{x.perimetre}</td>
                      <td className="py-3 pr-6 text-right tabular-nums font-light text-[15px] text-encre whitespace-nowrap">{String(x.valeur).replace(".", ",")} m²</td>
                      <td className="py-3 text-[12.5px] text-ardoise">{x.observation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="m-0 text-[12.5px] text-ardoise">Aucune surface lue.</p>}
            {!surfaces.incoherence && surfaces.sources.length > 0 && <p className="m-0 mt-3 text-[12.5px] text-ardoise">{surfaces.lecture}</p>}
          </Section>

          <Section id="marche" titre="4 · Marché">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-5">
              {marche.kpis.map((k) => (
                <div key={k.libelle}><Mono>{k.libelle}</Mono><p className={`m-0 mt-2 text-[18px] font-light tabular-nums ${k.valeur ? "text-encre" : "text-brume"}`}>{k.valeur || "—"}</p><p className="m-0 mt-1 text-[12.5px] text-brume">{k.detail}</p></div>
              ))}
            </div>
            {marche.commune && <p className="m-0 mt-5 text-[12.5px] text-ardoise">{marche.commune}{marche.revenu_median ? ` · revenu médian ${Math.round(marche.revenu_median).toLocaleString("fr-FR")} €` : ""}</p>}
            {marche.contexte ? <p className="m-0 mt-3 text-[13.5px] leading-[1.65] text-craie whitespace-pre-wrap max-w-[860px]">{marche.contexte.resume}</p> : null}
            <p className="m-0 mt-3 text-[13.5px] leading-[1.65] text-craie max-w-[860px]">{marche.question}</p>
          </Section>

          <Section id="synthese" titre="5 · Synthèse · factuel, le jugement est à l'étape 3" sansFilet>
            {synthese.map((x) => (
              <div key={x.sujet} className="grid grid-cols-[24px_150px_1fr] max-md:grid-cols-[24px_1fr] gap-x-4 py-3 border-t border-relief first:border-t-0 items-baseline">
                <span className={`text-[13.5px] ${TEINTE[x.statut]}`}>{x.glyphe}</span>
                <span className="text-[13.5px] font-semibold text-encre">{x.sujet}</span>
                <span className="text-[13.5px] text-craie max-md:col-span-2">{x.texte}</span>
              </div>
            ))}
          </Section>
        </>
      )}
      {dialog && <DialogMailIntention dossier={dossier} intention={dialog} parametres={dialog === "demande_documents" ? { raisons: e.demandes_texte } : { raisons: e.motif_passer || undefined }} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onRefresh?.(); tout(); }} />}
    </>
  );
}
