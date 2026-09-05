import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Loader2, Plus, RefreshCw, X } from "lucide-react";
import DocumentsDossier from "./DocumentsDossier";
import { Visionneuse, TableExtraction } from "./AnalyseDocuments";
import FicheDossier, { Frise } from "./FicheDossier";

// L'étape Analyse, brique par brique : les documents, la matrice (une ligne
// par document, une colonne par question), le gabarit, la revue des anomalies
// avec une validation humaine, et les livrables qui sortent de la grille
// validée. On entre par les anomalies : c'est ce qui décide.

const TEINTE = {
  coherent: "#7fd1a8", contradictoire: "#e8927c", manquant: "#e8b04c", hors_critere: "#c39bd3", a_verifier: "#8fb6e8",
};
const LIBELLE = { coherent: "Cohérent", contradictoire: "Contradictoire", manquant: "Manquant", hors_critere: "Hors critère", a_verifier: "À vérifier" };
const ORDRE = { contradictoire: 0, manquant: 1, hors_critere: 2, a_verifier: 3, coherent: 4 };
const REGLES = [
  ["information", "On relève, on ne juge pas"],
  ["identique", "Toutes les sources doivent dire la même chose"],
  ["surface", "Surfaces à ±3 %"],
  ["loyer", "Quittances ×12 = loyer du bail ±5 %"],
  ["presence", "Au moins une source doit répondre"],
  ["presence_ou_hors", "Absent = hors critère"],
  ["permis_par", "Bail contre règlement → à vérifier"],
];

function Statut({ statut, petit = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${petit ? "px-2 py-px text-[10.5px]" : "px-2.5 py-0.5 text-[11.5px]"} font-medium`}
      style={{ color: TEINTE[statut], borderColor: `${TEINTE[statut]}55`, background: `${TEINTE[statut]}12` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEINTE[statut] }} />
      {LIBELLE[statut] || statut}
    </span>
  );
}

// Le tiroir : le document à la page de la cellule, à droite.
export function Tiroir({ cellule, ligne, onFermer }) {
  if (!cellule || !ligne) return null;
  const extraction = { document_url: ligne.document_url, document_mime: null, document_nom: ligne.document_nom };
  return (
    <div className="w-full lg:w-[680px] flex-none">
      <Visionneuse extraction={extraction} ligne={{ page: cellule.page, citation: cellule.citation }} onFermer={onFermer} />
    </div>
  );
}

// --- La grille --------------------------------------------------------------
export function Grille({ m, dealId, onCellule, celluleOuverte }) {
  const [tri, setTri] = useState(null); // colonne triée par statut
  const [edition, setEdition] = useState(null); // colonne dont on édite la question
  const [ajout, setAjout] = useState(false);
  const queryClient = useQueryClient();

  const colonnes = useMemo(() => {
    const liste = [...m.colonnes];
    if (tri) liste.sort((a, b) => (ORDRE[m.synthese[a.id]?.statut] ?? 9) - (ORDRE[m.synthese[b.id]?.statut] ?? 9));
    return liste;
  }, [m, tri]);

  const ajouter = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/colonnes`, { body: corps }),
    onSuccess: () => { toast.success("Question ajoutée — elle tourne sur tous les documents"); setAjout(false); queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });

  const blocs = [...new Set(colonnes.map((c) => c.bloc))];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[12.5px] text-[#77777e]">
          {m.lignes.length} document{m.lignes.length > 1 ? "s" : ""} × {m.colonnes.length} questions · gabarit « {m.gabarit.nom} » v{m.gabarit.version}
          {m.rempli_le ? ` · rempli ${new Date(m.rempli_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setTri((t) => (t ? null : "statut"))} className={`text-[12px] px-3 py-1.5 rounded-full border transition-colors ${tri ? "border-[#e8927c] text-[#e8927c]" : "border-[#2c3139] text-[#97979f] hover:text-[#f2f3f5]"}`}>
            {tri ? "Ordre du gabarit" : "Trier par statut"}
          </button>
          <button onClick={() => setAjout(true)} className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full bg-[#f2f3f5] text-[#0b0c0e] font-semibold hover:bg-[#ffffff]">
            <Plus className="w-3.5 h-3.5" /> Ajouter une colonne
          </button>
        </div>
      </div>

      {ajout && <FormulaireColonne onAnnuler={() => setAjout(false)} onValider={(c) => ajouter.mutate(c)} enCours={ajouter.isPending} />}

      <div className="overflow-x-auto border border-[#1e1e22] rounded-xl">
        <table className="border-collapse text-[12.5px] min-w-full">
          <thead>
            <tr className="bg-[#0f0f11]">
              <th className="sticky left-0 z-10 bg-[#0f0f11] text-left px-4 py-3 text-[10.5px] tracking-[.16em] uppercase text-[#77777e] font-normal border-b border-r border-[#1e1e22] min-w-[220px]">Document</th>
              {colonnes.map((c) => (
                <th key={c.id} className="text-left px-3 py-3 border-b border-r border-[#1e1e22] min-w-[190px] align-top font-normal">
                  <button
                    onClick={() => setEdition(edition === c.id ? null : c.id)}
                    title={c.question}
                    className="text-left w-full group"
                  >
                    <span className="block text-[10px] tracking-[.14em] uppercase text-[#5f5f66]">{c.bloc}</span>
                    <span className="block text-[12.5px] font-semibold text-[#f2f3f5] group-hover:text-[#ffffff] mt-0.5">{c.libelle}</span>
                  </button>
                  {edition === c.id && (
                    <p className="m-0 mt-2 text-[11.5px] leading-[1.5] text-[#97979f] font-normal normal-case tracking-normal">
                      {c.question}
                      <span className="block mt-1 text-[#5f5f66]">règle : {REGLES.find(([r]) => r === c.regle)?.[1] || c.regle} · criticité {c.criticite}</span>
                    </p>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.lignes.map((l) => (
              <tr key={l.document_id} className="hover:bg-[#f2f3f5]/[0.02]">
                <td className="sticky left-0 z-10 bg-[#0f0f11] px-4 py-3 border-b border-r border-[#1e1e22] align-top">
                  <span className="block text-[13px] text-[#f2f3f5] truncate max-w-[220px]" title={l.document_nom}>{l.document_nom}</span>
                  <span className="block text-[11px] text-[#5f5f66]">{l.categorie || "Autre"}{l.erreur ? " · lecture en échec" : ""}</span>
                </td>
                {colonnes.map((c) => {
                  const cel = l.cellules?.[c.id];
                  const ouverte = celluleOuverte?.ligne?.document_id === l.document_id && celluleOuverte?.colonne === c.id;
                  return (
                    <td key={c.id} className={`px-3 py-3 border-b border-r border-[#1e1e22] align-top ${ouverte ? "bg-[#96c0b8]/[0.08]" : ""}`}>
                      {cel?.reponse ? (
                        <button onClick={() => onCellule({ ligne: l, colonne: c.id, cellule: cel })} className="text-left text-[12.5px] leading-[1.5] text-[#d6d6db] hover:text-[#ffffff] line-clamp-3" title={cel.citation || cel.reponse}>
                          {cel.reponse}
                          {cel.page ? <span className="text-[#5f5f66]"> · p.{cel.page}</span> : null}
                        </button>
                      ) : (
                        <span className="text-[#3a3f4a]">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* La ligne de synthèse : calculée par le code. */}
            <tr className="bg-[#0f0f11]">
              <td className="sticky left-0 z-10 bg-[#0f0f11] px-4 py-3 border-r border-[#1e1e22] text-[10.5px] tracking-[.16em] uppercase text-[#77777e]">Synthèse</td>
              {colonnes.map((c) => {
                const sy = m.synthese[c.id];
                return (
                  <td key={c.id} className="px-3 py-3 border-r border-[#1e1e22] align-top" title={sy?.detail}>
                    <Statut statut={sy?.statut || "manquant"} petit />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="m-0 text-[11.5px] text-[#5f5f66]">
        {blocs.length} blocs · clic sur une cellule : le document à la page · clic sur un en-tête : la question et sa règle.
      </p>
    </div>
  );
}

export function FormulaireColonne({ onAnnuler, onValider, enCours }) {
  const [question, setQuestion] = useState("");
  const [libelle, setLibelle] = useState("");
  const [bloc, setBloc] = useState("Questions");
  const [regle, setRegle] = useState("information");
  const [criticite, setCriticite] = useState("moyenne");
  const [gabarit, setGabarit] = useState(false);
  return (
    <div className="border border-[#22262d] rounded-xl bg-[#0f1114] px-5 py-4 space-y-3">
      <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">Nouvelle colonne</p>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="La question posée à chaque document — « Le bail prévoit-il une clause d'accession ? »" className="w-full bg-transparent border border-[#22262d] rounded-lg px-3 py-2 text-[14px] text-[#f2f3f5] outline-none focus:border-[#96c0b8]/60" />
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <input value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Libellé court" className="bg-transparent border border-[#22262d] rounded-lg px-3 py-2 text-[13px] text-[#f2f3f5] outline-none" />
        <input value={bloc} onChange={(e) => setBloc(e.target.value)} placeholder="Bloc" className="bg-transparent border border-[#22262d] rounded-lg px-3 py-2 text-[13px] text-[#f2f3f5] outline-none" />
        <select value={regle} onChange={(e) => setRegle(e.target.value)} className="bg-[#0f1114] border border-[#22262d] rounded-lg px-3 py-2 text-[13px] text-[#f2f3f5] outline-none">
          {REGLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={criticite} onChange={(e) => setCriticite(e.target.value)} className="bg-[#0f1114] border border-[#22262d] rounded-lg px-3 py-2 text-[13px] text-[#f2f3f5] outline-none">
          <option value="haute">Criticité haute</option><option value="moyenne">Criticité moyenne</option><option value="basse">Criticité basse</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-[12.5px] text-[#c9cdd6]">
          <input type="checkbox" checked={gabarit} onChange={(e) => setGabarit(e.target.checked)} className="accent-[#96c0b8]" />
          Enregistrer dans le gabarit « Murs de commerce » — pour tous les prochains dossiers
        </label>
        <div className="flex gap-2">
          <button onClick={onAnnuler} className="text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5] px-3">Annuler</button>
          <button onClick={() => onValider({ question, libelle: libelle || question.slice(0, 40), bloc, regle, criticite, enregistrer_gabarit: gabarit })} disabled={!question.trim() || enCours} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#96c0b8] text-[#000000] text-[12.5px] font-semibold disabled:opacity-40">
            {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// --- La revue des anomalies : confirmé, faux positif, un mot ------------------
function Anomalies({ m, dealId, onCellule }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(null);
  const reviser = useMutation({
    mutationFn: ({ colonneId, verdict, commentaire }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/revue/${colonneId}`, { body: { verdict, commentaire } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const liste = [...m.anomalies].sort((a, b) => (ORDRE[a.statut] - ORDRE[b.statut]) || (({ haute: 0, moyenne: 1, basse: 2 })[a.colonne.criticite] - ({ haute: 0, moyenne: 1, basse: 2 })[b.colonne.criticite]));
  if (!m.lignes.length) return <p className="m-0 text-[13.5px] text-[#9298a6]">La matrice n'est pas encore remplie : lancez la lecture depuis la grille.</p>;
  if (!liste.length) return <p className="m-0 text-[13.5px] text-[#7fd1a8]">Aucune anomalie : les documents concordent sur toutes les questions du gabarit.</p>;
  const nb = (s) => liste.filter((a) => a.statut === s).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        {["contradictoire", "manquant", "hors_critere", "a_verifier"].map((s) => nb(s) > 0 && (
          <span key={s} className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: TEINTE[s] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: TEINTE[s] }} />{nb(s)} {LIBELLE[s].toLowerCase()}{nb(s) > 1 ? "s" : ""}
          </span>
        ))}
        <span className="text-[12.5px] text-[#5f5f66]">· {liste.filter((a) => a.revue).length}/{liste.length} revues</span>
      </div>
      {liste.map((a) => {
        const sources = m.lignes.filter((l) => l.cellules?.[a.colonne.id]?.reponse);
        const r = a.revue;
        return (
          <div key={a.colonne.id} className={`rounded-xl border px-5 py-4 ${r?.verdict === "faux_positif" ? "border-[#1e1e22] opacity-60" : "border-[#22262d] bg-[#0f1114]"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-[10.5px] tracking-[.16em] uppercase text-[#5f5f66]">{a.colonne.bloc} · criticité {a.colonne.criticite}</p>
                <p className="m-0 mt-1 flex items-center gap-2.5 text-[16px] font-semibold text-[#f2f3f5]">{a.colonne.libelle} <Statut statut={a.statut} /></p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-[1.65] text-[#b5b5bd]">{a.detail}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-none">
                <button onClick={() => reviser.mutate({ colonneId: a.colonne.id, verdict: r?.verdict === "confirme" ? null : "confirme", commentaire: r?.commentaire })} className={`px-3 py-1.5 rounded-full text-[11.5px] border transition-colors ${r?.verdict === "confirme" ? "bg-[#e8927c] border-[#e8927c] text-[#000000] font-semibold" : "border-[#2c3139] text-[#c9cdd6] hover:border-[#e8927c]"}`}>Confirmé</button>
                <button onClick={() => reviser.mutate({ colonneId: a.colonne.id, verdict: r?.verdict === "faux_positif" ? null : "faux_positif", commentaire: r?.commentaire })} className={`px-3 py-1.5 rounded-full text-[11.5px] border transition-colors ${r?.verdict === "faux_positif" ? "bg-[#3a3f4a] border-[#3a3f4a] text-[#f2f3f5]" : "border-[#2c3139] text-[#c9cdd6] hover:border-[#3a3f4a]"}`}>Faux positif</button>
                <button onClick={() => setOuvert(ouvert === a.colonne.id ? null : a.colonne.id)} className="text-[#6c6c74] hover:text-[#f2f3f5] px-1.5" title="Sources et commentaire"><ChevronDown className={`w-4 h-4 transition-transform ${ouvert === a.colonne.id ? "" : "-rotate-90"}`} /></button>
              </div>
            </div>
            {ouvert === a.colonne.id && (
              <div className="mt-4 pt-4 border-t border-[#1e1e22] space-y-3">
                {sources.length > 0 ? (
                  <div className="space-y-1.5">
                    {sources.map((l) => (
                      <button key={l.document_id} onClick={() => onCellule({ ligne: l, colonne: a.colonne.id, cellule: l.cellules[a.colonne.id] })} className="block text-left text-[13px] text-[#c9cdd6] hover:text-[#ffffff]">
                        <span className="text-[#6c6c74]">{l.document_nom}{l.cellules[a.colonne.id].page ? ` · p.${l.cellules[a.colonne.id].page}` : ""} — </span>{l.cellules[a.colonne.id].reponse}
                      </button>
                    ))}
                  </div>
                ) : <p className="m-0 text-[12.5px] text-[#6c6c74]">Aucun document ne répond à cette question.</p>}
                <textarea defaultValue={r?.commentaire || ""} placeholder="Un mot pour la note de synthèse — pourquoi c'est confirmé, ou pourquoi c'est un faux positif" rows={2} onBlur={(e) => e.target.value !== (r?.commentaire || "") && reviser.mutate({ colonneId: a.colonne.id, verdict: r?.verdict || "confirme", commentaire: e.target.value })} className="w-full bg-transparent border border-[#22262d] rounded-lg px-3 py-2 text-[13px] text-[#f2f3f5] outline-none focus:border-[#96c0b8]/60" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Les livrables : depuis la grille validée -----------------------------------
export function Livrables({ dealId, nb }) {
  const { data, isLoading } = useQuery({ queryKey: ["livrables", dealId, nb], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice/livrables`) });
  const copier = async (t, quoi) => { try { await navigator.clipboard.writeText(t); toast.success(`${quoi} copié`); } catch { window.prompt("Copiez :", t); } };
  if (isLoading || !data) return <Loader2 className="w-4 h-4 animate-spin text-[#9298a6]" />;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <section>
        <div className="flex items-baseline justify-between gap-3 pb-2.5 mb-3 border-b border-[#1e1e22]">
          <p className="m-0 text-[11px] tracking-[.16em] uppercase font-semibold text-[#e8b04c]">Demandes au vendeur · {data.demandes.length}</p>
          <button onClick={() => copier(data.demandes_texte, "La liste")} className="inline-flex items-center gap-1.5 text-[12px] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Copier pour un mail</button>
        </div>
        {data.demandes.length ? (
          <ol className="m-0 pl-5 space-y-2.5">
            {data.demandes.map((d, i) => (
              <li key={i} className="text-[13.5px] leading-[1.65] text-[#d6d6db]">{d.texte}{d.confirme ? <span className="text-[#7fd1a8]"> ✓</span> : <span className="text-[#5f5f66]"> · non revu</span>}</li>
            ))}
          </ol>
        ) : <p className="m-0 text-[13px] text-[#6c6c74]">Rien à demander.</p>}
        {data.en_attente > 0 && <p className="m-0 mt-3 text-[12px] text-[#6c6c74]">{data.en_attente} anomalie{data.en_attente > 1 ? "s" : ""} pas encore revue{data.en_attente > 1 ? "s" : ""} : elle{data.en_attente > 1 ? "s" : ""} figure{data.en_attente > 1 ? "nt" : ""} ici tant qu'elle{data.en_attente > 1 ? "s ne sont" : " n'est"} pas écartée{data.en_attente > 1 ? "s" : ""}.</p>}
      </section>
      <section>
        <div className="flex items-baseline justify-between gap-3 pb-2.5 mb-3 border-b border-[#1e1e22]">
          <p className="m-0 text-[11px] tracking-[.16em] uppercase font-semibold text-[#8fb6e8]">Note de synthèse</p>
          <button onClick={() => copier(data.note, "La note")} className="inline-flex items-center gap-1.5 text-[12px] text-[#c9cdd6] hover:text-[#f2f3f5]"><Copy className="w-3.5 h-3.5" /> Copier</button>
        </div>
        <pre className="m-0 whitespace-pre-wrap text-[13px] leading-[1.7] text-[#b5b5bd] font-[inherit]">{data.note}</pre>
      </section>
    </div>
  );
}

// --- L'étape ---------------------------------------------------------------------
export default function MatriceDossier({ dossier, coches, onCocher, onRefresh, apercu = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("klocka_mode_analyse") || "grille"; } catch { return "grille"; } });
  const [onglet, setOnglet] = useState(() => (mode === "fiche" ? "fiche" : "anomalies"));
  const [questionLibre, setQuestionLibre] = useState(false);
  const changerMode = (m) => { setMode(m); setOnglet(m === "fiche" ? "fiche" : "anomalies"); setCelluleOuverte(null); try { localStorage.setItem("klocka_mode_analyse", m); } catch { /* sans mémoire */ } };
  const [celluleOuverte, setCelluleOuverte] = useState(null);
  const [documentOuvert, setDocumentOuvert] = useState(null);

  const { data: m, isLoading } = useQuery({
    queryKey: ["matrice", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  });

  const remplir = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/remplir`, { body: {} }),
    onSuccess: () => { toast.success("Lecture lancée — la grille se remplit document par document"); queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }); queryClient.invalidateQueries({ queryKey: ["fiche", dealId] }); },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });

  const enCours = m?.remplissage?.etat === "en_cours";
  const nbAnomalies = m?.anomalies?.length || 0;
  const nbDocs = (dossier?.documents_espace || []).length;

  const ONGLETS = mode === "fiche"
    ? [["fiche", `Fiche${nbAnomalies ? ` · ${nbAnomalies} alertes` : ""}`], ["frise", "Frise"], ["documents", `Documents · ${nbDocs}`], ["livrables", "Livrables"]]
    : [["anomalies", `Anomalies${nbAnomalies ? ` · ${nbAnomalies}` : ""}`], ["grille", "Grille"], ["documents", `Documents · ${nbDocs}`], ["livrables", "Livrables"]];

  const ajouterLibre = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/matrice/colonnes`, { body: corps }),
    onSuccess: () => { toast.success("Question ajoutée — elle tourne sur toutes les pièces"); setQuestionLibre(false); queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }); queryClient.invalidateQueries({ queryKey: ["fiche", dealId] }); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });
  // Une preuve de la fiche ou un fait de la frise s'ouvre dans le même tiroir.
  const ouvrirPreuve = (p) => setCelluleOuverte({ ligne: { document_id: p.document_id, document_nom: p.document_nom, document_url: p.document_url }, colonne: p.champ || null, cellule: { page: p.page, citation: p.citation } });

  return (
    <div className="border border-[#1e1e22] rounded-[18px] bg-[#0f0f11] overflow-hidden">
      {/* L'en-tête : les onglets et la lecture */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-7 max-md:px-4 border-b border-[#1e1e22]">
        <div className="flex gap-6 overflow-x-auto">
          {ONGLETS.map(([id, l]) => (
            <button key={id} onClick={() => { setOnglet(id); setCelluleOuverte(null); }} className={`relative py-3.5 text-[14px] whitespace-nowrap transition-colors after:absolute after:left-0 after:right-0 after:-bottom-px after:h-[2px] after:bg-[#e8927c] after:origin-left after:scale-x-0 after:transition-transform after:duration-300 ${onglet === id ? "text-[#f2f3f5] font-semibold after:scale-x-100" : "text-[#77777e] hover:text-[#c6ccd3]"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 py-2">
          <div className="inline-flex rounded-full border border-[#2c3139] p-0.5 text-[12px]" title="Deux lectures des mêmes faits : la grille (documents × questions) ou la fiche (le bien, champ par champ)">
            {[["grille", "Grille"], ["fiche", "Fiche"]].map(([m, l]) => (
              <button key={m} onClick={() => changerMode(m)} className={`px-3 py-1 rounded-full transition-colors ${mode === m ? "bg-[#f2f3f5] text-[#0b0c0e] font-semibold" : "text-[#9298a6] hover:text-[#f2f3f5]"}`}>{l}</button>
            ))}
          </div>
          {enCours ? (
            <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {m.remplissage.fait}/{m.remplissage.total ?? "…"} — {m.remplissage.document || "lecture"}</span>
          ) : (
            <button onClick={() => remplir.mutate()} disabled={apercu || remplir.isPending || !nbDocs} title={nbDocs ? "Lire tous les documents contre toutes les questions du gabarit" : "Importez des documents d'abord"} className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold bg-[#f2f3f5] text-[#0b0c0e] hover:bg-[#ffffff] disabled:opacity-40">
              <RefreshCw className="w-3.5 h-3.5" /> {m?.lignes?.length ? "Relire les documents" : "Remplir la grille"}
            </button>
          )}
        </div>
      </div>

      <div className={`px-7 max-md:px-4 py-6 ${celluleOuverte ? "lg:flex lg:gap-6 lg:items-start" : ""}`}>
        <div className="min-w-0 flex-1">
          {isLoading || !m ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" />
          ) : onglet === "fiche" ? (
            <FicheDossier
              dealId={dealId}
              onPreuve={ouvrirPreuve}
              questionsLibres={
                <section className="border border-dashed border-[#2c3139] rounded-xl px-4 py-3">
                  {questionLibre ? (
                    <FormulaireColonne onAnnuler={() => setQuestionLibre(false)} onValider={(c) => ajouterLibre.mutate(c)} enCours={ajouterLibre.isPending} />
                  ) : (
                    <button onClick={() => setQuestionLibre(true)} className="inline-flex items-center gap-2 text-[13px] text-[#9298a6] hover:text-[#f2f3f5]"><Plus className="w-3.5 h-3.5" /> Questions libres — poser une question à toutes les pièces</button>
                  )}
                </section>
              }
            />
          ) : onglet === "frise" ? (
            <FriseFiche dealId={dealId} onPreuve={ouvrirPreuve} />
          ) : onglet === "anomalies" ? (
            <Anomalies m={m} dealId={dealId} onCellule={setCelluleOuverte} />
          ) : onglet === "grille" ? (
            m.lignes.length ? <Grille m={m} dealId={dealId} onCellule={setCelluleOuverte} celluleOuverte={celluleOuverte} /> : <p className="m-0 text-[13.5px] text-[#9298a6]">Importez les documents puis « Remplir la grille » : chaque document répond à chaque question, avec sa page.</p>
          ) : onglet === "documents" ? (
            <>
              {m.a_classer > 0 && <p className="m-0 mb-4 text-[12.5px] text-[#e8b04c]">{m.a_classer} document{m.a_classer > 1 ? "s" : ""} sans catégorie : confirmez-la ci-dessous — la lecture croisée en dépend.</p>}
              <DocumentsDossier dossier={dossier} coches={coches} onCocher={onCocher} onRefresh={() => { onRefresh?.(); queryClient.invalidateQueries({ queryKey: ["matrice", dealId] }); }} apercu={apercu} proposerDrive />
              {documentOuvert && <div className="mt-6"><TableExtraction extraction={documentOuvert} dealId={dealId} onRefresh={onRefresh} /></div>}
            </>
          ) : (
            <Livrables dealId={dealId} nb={`${nbAnomalies}-${Object.keys(m.synthese || {}).filter((k) => m.synthese[k]?.revue).length}`} />
          )}
        </div>
        {celluleOuverte && (
          <div className="mt-6 lg:mt-0">
            <Tiroir cellule={celluleOuverte.cellule} ligne={celluleOuverte.ligne} onFermer={() => setCelluleOuverte(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

function FriseFiche({ dealId, onPreuve }) {
  const { data: fiche } = useQuery({ queryKey: ["fiche", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice/fiche`) });
  if (!fiche) return <Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" />;
  return <Frise fiche={fiche} onPreuve={onPreuve} />;
}
