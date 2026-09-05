import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Copy, Loader2, RefreshCw, Send } from "lucide-react";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import DocumentsDossier from "./DocumentsDossier";
import FicheDossier from "./FicheDossier";
import { Grille, Tiroir, Livrables, FormulaireColonne } from "./MatriceDossier";
import { VERDICTS, libelleVerdict, VuesLieu, DialogMailIntention } from "./DealResultat";

// La carte de deal : la data room confrontée au teaser, avec les mots de la
// carte de pré-analyse. Le verdict d'abord, les écarts, les problèmes en trois
// familles, le simulateur recalculé, puis le détail — la fiche du bien, les
// documents et leur couverture, la grille, le lieu.

const TEINTE = { confirme: "#7fd1a8", contradiction: "#e8927c", ecart_teaser: "#e8927c", piece_manquante: "#e8b04c", non_mentionne: "#d9b46a", hors_critere: "#c39bd3", a_verifier: "#8fb6e8", ecarte: "#4d545d" };
const LIBELLE = { confirme: "Confirmé", contradiction: "Contradiction", ecart_teaser: "Écart avec le teaser", piece_manquante: "Pièce manquante", non_mentionne: "Non mentionné", hors_critere: "Hors critère", a_verifier: "À vérifier", ecarte: "Écarté" };

const fmt = (v, unite) => (v == null ? "—" : unite === "€" ? `${Math.round(v).toLocaleString("fr-FR")} €` : unite === "%" ? `${Number(v).toFixed(2)} %` : unite === "m²" ? `${v} m²` : String(v));

function Etiquette({ statut }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium" style={{ color: TEINTE[statut], borderColor: `${TEINTE[statut]}55`, background: `${TEINTE[statut]}12` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEINTE[statut] }} /> {LIBELLE[statut] || statut}
    </span>
  );
}

const Titre = ({ children, droite }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">{children}</p>
    {droite}
  </div>
);

// --- Les écarts teaser → data room -------------------------------------------------
function Ecarts({ ecarts }) {
  if (!ecarts.length) return null;
  return (
    <div className="px-5 py-5 border-b border-[#1f2228]">
      <Titre>Écarts pré-analyse → data room</Titre>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[10px] tracking-[.14em] uppercase text-[#6a7180]">
              <th className="text-left font-normal py-1.5 pr-3"> </th>
              <th className="text-right font-normal py-1.5 px-3">Teaser</th>
              <th className="text-right font-normal py-1.5 px-3">Data room</th>
              <th className="text-right font-normal py-1.5 px-3">Écart</th>
              <th className="text-left font-normal py-1.5 pl-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {ecarts.map((e) => {
              const delta = e.ecart_pct != null ? `${e.ecart_pct > 0 ? "+" : ""}${e.ecart_pct.toFixed(1)} %` : e.ecart_pts != null ? `${e.ecart_pts > 0 ? "+" : ""}${e.ecart_pts} pt` : e.ecart_ans != null ? `${e.ecart_ans > 0 ? "+" : ""}${e.ecart_ans} an${Math.abs(e.ecart_ans) > 1 ? "s" : ""}` : null;
              const grave = (e.ecart_pct != null && Math.abs(e.ecart_pct) > 3) || (e.ecart_pts != null && Math.abs(e.ecart_pts) > 0.3) || (e.ecart_ans != null && e.ecart_ans !== 0);
              return (
                <tr key={e.id} className="border-t border-[#15171b]">
                  <td className="py-2 pr-3 text-[#c9cdd6]">{e.libelle}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-[#9298a6]">{fmt(e.teaser, e.unite)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-[#f2f3f5]">{fmt(e.data_room, e.unite)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${delta == null ? "text-[#3a3f4a]" : grave ? "text-[#e8927c]" : "text-[#7fd1a8]"}`}>{delta ?? (e.teaser == null ? "non annoncé" : e.data_room == null ? "non trouvé" : "—")}</td>
                  <td className="py-2 pl-3 text-[12px] text-[#6a7180] truncate max-w-[260px]">{e.source || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Les problèmes -----------------------------------------------------------------------
function Problemes({ carte, dealId, onPreuve }) {
  const queryClient = useQueryClient();
  const reviser = useMutation({
    mutationFn: ({ colonneId, verdict }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/revue/${colonneId}`, { body: { verdict } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["carte", dealId] }); queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const { contradictions, pieces_manquantes: pieces, vigilance } = carte;
  if (!contradictions.length && !pieces.length && !vigilance.length) {
    return <div className="px-5 py-5 border-b border-[#1f2228]"><p className="m-0 text-[13.5px] text-[#7fd1a8]">Aucun problème : les pièces concordent, rien ne manque, rien ne sort des critères.</p></div>;
  }
  return (
    <div className="px-5 py-5 border-b border-[#1f2228] grid grid-cols-1 xl:grid-cols-3 gap-x-8 gap-y-6">
      <section className="min-w-0">
        <Titre>Contradictions · {contradictions.length}</Titre>
        {contradictions.length ? contradictions.map((c) => (
          <div key={c.champ} className={`rounded-xl border px-4 py-3 mb-2.5 ${c.revue?.verdict === "faux_positif" ? "border-[#1e1e22] opacity-60" : c.gravite === "bloquante" ? "border-[#e8927c]/50 bg-[#e8927c]/[0.04]" : "border-[#22262d]"}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="m-0 text-[14px] font-semibold text-[#f2f3f5]">{c.libelle} <span className="text-[11px] font-normal text-[#6a7180]">· {c.gravite === "bloquante" ? "bloquante" : "à lever"}</span></p>
              <Etiquette statut={c.statut} />
            </div>
            <ul className="m-0 mt-2 p-0 list-none space-y-1">
              {c.valeurs.map((v, i) => (
                <li key={i} className="text-[12.5px] leading-[1.5]">
                  {v.document_id ? (
                    <button onClick={() => onPreuve(v)} className="text-left text-[#c9cdd6] hover:text-[#f2f3f5]"><span className="text-[#6a7180]">{v.source}{v.page ? ` · p.${v.page}` : ""} : </span>{v.valeur}</button>
                  ) : (
                    <span className="text-[#c9cdd6]"><span className="text-[#6a7180]">{v.source} : </span>{v.valeur}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="m-0 mt-2 text-[12px] text-[#9298a6]">{c.detail}</p>
            <div className="mt-2.5 flex gap-1.5">
              <button onClick={() => reviser.mutate({ colonneId: c.champ, verdict: c.revue?.verdict === "confirme" ? null : "confirme" })} className={`px-2.5 py-1 rounded-full text-[11px] border ${c.revue?.verdict === "confirme" ? "bg-[#e8927c] border-[#e8927c] text-[#000000] font-semibold" : "border-[#2c3139] text-[#c9cdd6] hover:border-[#e8927c]"}`}>Confirmée</button>
              <button onClick={() => reviser.mutate({ colonneId: c.champ, verdict: c.revue?.verdict === "faux_positif" ? null : "faux_positif" })} className={`px-2.5 py-1 rounded-full text-[11px] border ${c.revue?.verdict === "faux_positif" ? "bg-[#3a3f4a] border-[#3a3f4a] text-[#f2f3f5]" : "border-[#2c3139] text-[#c9cdd6] hover:border-[#3a3f4a]"}`}>Faux positif</button>
            </div>
          </div>
        )) : <p className="m-0 text-[12.5px] text-[#6a7180]">Aucune.</p>}
      </section>
      <section className="min-w-0">
        <Titre>Pièces manquantes · {pieces.length}</Titre>
        {pieces.length ? (
          <ul className="m-0 p-0 list-none space-y-2">
            {pieces.map((p) => (
              <li key={p.champ} className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-[#c9cdd6]">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[#e8b04c] flex-none" />
                <span><span className="text-[#f2f3f5]">{p.piece}</span> — absent de la data room. À demander au vendeur ({p.libelle.toLowerCase()}).{p.criticite === "haute" && <span className="text-[#e8b04c]"> Empêche de conclure.</span>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[12.5px] text-[#6a7180]">Rien ne manque.</p>}
      </section>
      <section className="min-w-0">
        <Titre>Points de vigilance · {vigilance.length}</Titre>
        {vigilance.length ? (
          <ul className="m-0 p-0 list-none space-y-2">
            {vigilance.map((v) => (
              <li key={v.champ} className="flex items-start gap-2.5 text-[12.5px] leading-[1.55] text-[#c9cdd6]">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-none" style={{ background: TEINTE[v.statut] }} />
                <span><span className="text-[#f2f3f5]">{v.libelle}</span> — {v.detail}</span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-[12.5px] text-[#6a7180]">Rien à signaler.</p>}
      </section>
    </div>
  );
}

// --- La carte ------------------------------------------------------------------------------
export default function CarteDeal({ dossier, coches, onCocher, onRefresh, apercu = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const [source, setSource] = useState("data_room");
  const [onglet, setOnglet] = useState("fiche");
  const [detailOuvert, setDetailOuvert] = useState(false);
  const [preuve, setPreuve] = useState(null);
  const [complements, setComplements] = useState(false);
  const [questionLibre, setQuestionLibre] = useState(false);

  const { data: carte, isLoading } = useQuery({
    queryKey: ["carte", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/carte`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  });
  const { data: m } = useQuery({ queryKey: ["matrice", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice`), enabled: !!dealId && onglet === "grille" });

  const tout = () => ["carte", "matrice", "fiche", "livrables"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const remplir = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/remplir`, { body: {} }),
    onSuccess: () => { toast.success("Lecture lancée — la data room est extraite question par question"); tout(); },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  const ajouterLibre = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/colonnes`, { body: corps }),
    onSuccess: () => { toast.success("Question ajoutée — elle tourne sur toutes les pièces"); setQuestionLibre(false); tout(); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });

  const nbDocs = (dossier?.documents_espace || []).length;
  const enCours = carte?.remplissage?.etat === "en_cours";
  const v = VERDICTS[carte?.verdict] || {};
  const ouvrirPreuve = (p) => setPreuve({ ligne: { document_id: p.document_id, document_nom: p.document_nom || p.source, document_url: p.document_url }, cellule: { page: p.page, citation: p.citation } });

  if (isLoading || !carte) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" /></div>;

  const parametresSim = source === "data_room" ? carte.simulateur.data_room || carte.simulateur.teaser : carte.simulateur.teaser;
  const ONGLETS = [["fiche", "Fiche du bien"], ["documents", `Documents · ${nbDocs}`], ["grille", `Grille · ${carte.nb_questions} questions`], ["livrables", "Livrables"], ...(carte.lot ? [["lieu", "Carte et commune"]] : [])];

  return (
    <div className={`bg-[#000000] border rounded-md overflow-hidden ${v.bord || "border-[#1f2228]"}`}>
      {/* En-tête : le verdict */}
      <div className="p-5 border-b border-[#1f2228]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Analyse de la data room</p>
            <h3 className="m-0 mt-1 text-[#f2f3f5] font-medium leading-snug">{carte.titre}</h3>
            <p className="m-0 mt-1 text-[12px] text-[#6a7180]">
              {nbDocs} pièce{nbDocs > 1 ? "s" : ""} · {carte.nb_questions} questions{carte.rempli_le ? ` · lue le ${new Date(carte.rempli_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              {carte.a_classer > 0 ? <span className="text-[#e8b04c]"> · {carte.a_classer} pièce{carte.a_classer > 1 ? "s" : ""} à classer</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-none">
            {carte.verdict && <Badge className={`${v.classe}`}>{libelleVerdict(carte.verdict)}</Badge>}
            {enCours ? (
              <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {carte.remplissage.fait}/{carte.remplissage.total ?? "…"} — {carte.remplissage.document || "lecture"}</span>
            ) : (
              <button onClick={() => remplir.mutate()} disabled={apercu || remplir.isPending || !nbDocs} title={nbDocs ? "Chaque question du gabarit tourne sur toutes les pièces" : "Importez des documents d'abord"} className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold bg-[#f2f3f5] text-[#0b0c0e] hover:bg-[#ffffff] disabled:opacity-40">
                <RefreshCw className="w-3.5 h-3.5" /> {carte.remplie ? "Relire la data room" : "Analyser la data room"}
              </button>
            )}
          </div>
        </div>
        {carte.remplie ? (
          <ul className="m-0 mt-4 p-0 list-none space-y-1">
            {carte.motifs.map((mo, i) => <li key={i} className="text-[13.5px] leading-[1.6] text-[#d6d6db]">{mo}</li>)}
          </ul>
        ) : (
          <p className="m-0 mt-4 text-[13.5px] text-[#9298a6]">{nbDocs ? "Les pièces sont importées : lancez l'analyse. Chaque question du gabarit tourne sur tous les documents, le code réconcilie et rend un verdict." : "Importez les pièces de la data room dans l'onglet Documents, elles sont classées automatiquement."}</p>
        )}
      </div>

      {carte.remplie && <Ecarts ecarts={carte.ecarts} />}
      {carte.remplie && <Problemes carte={carte} dealId={dealId} onPreuve={ouvrirPreuve} />}

      {/* Le simulateur : teaser ou data room */}
      {parametresSim && (
        <div className="px-5 py-5 border-b border-[#1f2228]">
          <Titre droite={
            <div className="inline-flex rounded-full border border-[#2c3139] p-0.5 text-[12px]">
              {[["teaser", "Données du teaser"], ["data_room", "Données data room"]].map(([k, l]) => (
                <button key={k} onClick={() => setSource(k)} disabled={k === "data_room" && !carte.simulateur.data_room} className={`px-3 py-1 rounded-full transition-colors disabled:opacity-40 ${source === k ? "bg-[#f2f3f5] text-[#0b0c0e] font-semibold" : "text-[#9298a6] hover:text-[#f2f3f5]"}`}>{l}</button>
              ))}
            </div>
          }>Simulateur — {source === "data_room" ? "avec les valeurs confirmées des pièces" : "avec les chiffres du teaser"}</Titre>
          <SimulateurDossier key={source} parametres={parametresSim} />
        </div>
      )}

      {/* Le détail */}
      <button onClick={() => setDetailOuvert((o) => !o)} className="w-full px-5 py-3 flex items-center justify-between text-[#9298a6] hover:text-[#f2f3f5] text-xs transition-colors">
        <span>Détail — fiche du bien, documents et couverture, grille, livrables, lieu</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${detailOuvert ? "rotate-180" : ""}`} />
      </button>
      {detailOuvert && (
        <div className="px-5 pb-5">
          <div className="flex gap-6 border-b border-[#1e1e22] mb-5 overflow-x-auto">
            {ONGLETS.map(([id, l]) => (
              <button key={id} onClick={() => { setOnglet(id); setPreuve(null); }} className={`relative py-2.5 text-[13px] whitespace-nowrap transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#e8927c] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 ${onglet === id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>{l}</button>
            ))}
          </div>
          <div className={preuve ? "lg:flex lg:gap-6 lg:items-start" : ""}>
            <div className="min-w-0 flex-1">
              {onglet === "fiche" && (
                <FicheDossier dealId={dealId} onPreuve={ouvrirPreuve} questionsLibres={
                  <section className="border border-dashed border-[#2c3139] rounded-xl px-4 py-3">
                    {questionLibre ? <FormulaireColonne onAnnuler={() => setQuestionLibre(false)} onValider={(c) => ajouterLibre.mutate(c)} enCours={ajouterLibre.isPending} /> : <button onClick={() => setQuestionLibre(true)} className="text-[13px] text-[#9298a6] hover:text-[#f2f3f5]">+ Questions libres — poser une question à toutes les pièces</button>}
                  </section>
                } />
              )}
              {onglet === "documents" && (
                <>
                  {carte.documents.length > 0 && (
                    <div className="mb-5">
                      <Titre>Couverture</Titre>
                      <ul className="m-0 p-0 list-none divide-y divide-[#15171b]">
                        {carte.documents.map((d) => (
                          <li key={d.document_id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[12.5px]">
                            <span className="text-[#f2f3f5] truncate max-w-[360px]">{d.nom} <span className="text-[#6a7180]">· {d.categorie}</span></span>
                            <span className="text-[#9298a6] tabular-nums">{d.repondues} question{d.repondues > 1 ? "s" : ""} alimentée{d.repondues > 1 ? "s" : ""}{d.attendues ? ` · ${d.sans_reponse.length}/${d.attendues} attendue${d.attendues > 1 ? "s" : ""} sans réponse` : ""}{d.erreur ? <span className="text-[#e8927c]"> · lecture en échec</span> : null}</span>
                            {d.sans_reponse.length > 0 && <span className="w-full text-[11.5px] text-[#6a7180]">Sans réponse : {d.sans_reponse.join(", ")}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <DocumentsDossier dossier={dossier} coches={coches} onCocher={onCocher} onRefresh={() => { onRefresh?.(); tout(); }} apercu={apercu} proposerDrive />
                </>
              )}
              {onglet === "grille" && (m ? (m.lignes.length ? <Grille m={m} dealId={dealId} onCellule={(c) => setPreuve({ ligne: c.ligne, cellule: c.cellule })} celluleOuverte={null} /> : <p className="m-0 text-[13px] text-[#9298a6]">Analysez la data room d'abord.</p>) : <Loader2 className="w-4 h-4 animate-spin text-[#9298a6]" />)}
              {onglet === "livrables" && <Livrables dealId={dealId} nb={`${carte.contradictions.length}-${carte.pieces_manquantes.length}`} />}
              {onglet === "lieu" && carte.lot && <VuesLieu lot={carte.lot} enr={carte.lot.enrichissement} />}
            </div>
            {preuve && <div className="mt-6 lg:mt-0"><Tiroir cellule={preuve.cellule} ligne={preuve.ligne} onFermer={() => setPreuve(null)} /></div>}
          </div>
        </div>
      )}

      {/* Demander des compléments : le mail au vendeur, pièces et contradictions listées */}
      {carte.remplie && (carte.pieces_manquantes.length > 0 || carte.contradictions.length > 0) && (
        <div className="px-5 py-4 border-t border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-[12.5px] text-[#9298a6]">{carte.pieces_manquantes.length} pièce{carte.pieces_manquantes.length > 1 ? "s" : ""} à demander · {carte.contradictions.filter((c) => c.statut === "contradiction").length} contradiction{carte.contradictions.length > 1 ? "s" : ""} à lever — le mail au vendeur est pré-rédigé, rien ne part sans validation.</p>
          <div className="flex gap-2">
            <button onClick={async () => { try { await navigator.clipboard.writeText(carte.demandes_texte); toast.success("Liste copiée"); } catch { window.prompt("Copiez :", carte.demandes_texte); } }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#2c3139] text-[12px] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Copier la liste</button>
            <button onClick={() => !apercu && setComplements(true)} disabled={apercu} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#f2f3f5] text-[#0b0c0e] text-[12px] font-semibold hover:bg-[#ffffff] disabled:opacity-40"><Send className="w-3.5 h-3.5" /> Demander des compléments</button>
          </div>
        </div>
      )}
      {complements && <DialogMailIntention dossier={dossier} intention="demande_documents" parametres={{ raisons: carte.demandes_texte }} onClose={() => setComplements(false)} onDone={() => { setComplements(false); onRefresh?.(); }} />}
    </div>
  );
}
