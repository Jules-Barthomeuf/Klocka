/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Check, Loader2, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import PenseeIA from "@/components/PenseeIA";
import { demanderNotifications, prevenir } from "@/lib/notifications";
import { J } from "@/design/jetons";

// Une grille de critères : critère, valeur lue au format voulu, statut en
// case colorée, source à droite. La règle se lit d'un clic sur le critère.

// La dernière lecture d'une grille, gardée sur le poste : en revenant sur le
// dossier, le tableau est là avant même la réponse du serveur. Un rafraîchis-
// sement se fait derrière et remplace ce qui est montré s'il a changé.
const cleLocale = (dealId, id) => `klocka_grille_${dealId}_${id}`;
function garder(dealId, id, g) {
  try { localStorage.setItem(cleLocale(dealId, id), JSON.stringify({ le: Date.now(), g })); } catch { /* sans mémoire */ }
}
function lire(dealId, id) {
  try { const b = localStorage.getItem(cleLocale(dealId, id)); return b ? JSON.parse(b) : null; } catch { return null; }
}
// Une analyse gardée depuis plus d'une semaine ne sert plus de point de départ.
const FRAICHEUR = 7 * 24 * 60 * 60 * 1000;
const gardee = (dealId, id) => { const c = lire(dealId, id); return c && Date.now() - c.le < FRAICHEUR ? c.g : undefined; };
const gardeeLe = (dealId, id) => lire(dealId, id)?.le ?? 0;

// « À checker » : bleu clair pâle, texte blanc — la valeur est là, un humain
// doit encore la valider en OK.
// Les statuts prennent les teintes de l'application : menthe, ambre, rouge,
// gris. La case est un fond très dilué, le mot porte la couleur pleine — un
// aplat saturé faisait tache au milieu d'un tableau sombre.
export const TEINTE = { ok: J["menthe"], a_checker: "#8fb3d9", warning: J["ambre"], a_verifier: J["ambre"], no_go: J["alerte"], vide: J["ardoise"], non_lu: J["ardoise"] };
export const teinteDe = (st) => TEINTE[st] || TEINTE.vide;
// Le fond dilué de la case. Les teintes de la marque sont des variables CSS
// (« rgb(var(--k-menthe-rgb)) ») : leur ajouter « 1f » comme à un hexadécimal
// donnait une couleur invalide, et la case restait sans teinte.
const dilue = (c) => (String(c).startsWith("rgb(var(") ? String(c).replace(/\)\)$/, ") / 0.12)") : `${c}1f`);
export const FOND = Object.fromEntries(Object.entries(TEINTE).map(([k, v]) => [k, dilue(v)]));

/** Ferme un menu surgissant dès qu'on clique ailleurs dans la page. */
export function useFermerAuClicAilleurs(ouvert, fermer) {
  const zone = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const surClic = (e) => { if (zone.current && !zone.current.contains(e.target)) fermer(); };
    const surTouche = (e) => { if (e.key === "Escape") fermer(); };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surTouche);
    return () => { document.removeEventListener("mousedown", surClic); document.removeEventListener("keydown", surTouche); };
  }, [ouvert, fermer]);
  return zone;
}
export const MOT = { ok: "OK", a_checker: "À checker", warning: "À vérifier", a_verifier: "À vérifier", no_go: "No go", vide: "Non trouvé", non_lu: "Non lu" };
export const Th = ({ children, className = "" }) => <th className={`text-left text-[11px] font-semibold tracking-[.02em] text-ardoise px-4 py-2.5 border-b border-r border-trait last:border-r-0 ${className}`}>{children}</th>;

export function TableCriteres({ g, onPreuve = undefined, sansSources = false, titre = null, dealId = null, lectureSeule = false }) {
  const [ouverts, setOuverts] = useState(() => new Set());
  const [details, setDetails] = useState(() => new Set());
  const [choix, setChoix] = useState(null);
  const menu = useFermerAuClicAilleurs(choix != null, () => setChoix(null));
  const queryClient = useQueryClient();
  const bascule = (id) => setOuverts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const basculeDetail = (id) => setDetails((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [edition, setEdition] = useState(null); // { id, texte }
  const corriger = useMutation({
    mutationFn: ({ critere, valeur }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${g.id}/valeur/${critere}`, { body: { valeur } }),
    onSuccess: () => { setEdition(null); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const decider = useMutation({
    mutationFn: ({ critere, statut }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${g.id}/statut/${critere}`, { body: { statut } }),
    onSuccess: () => { setChoix(null); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // La note : un commentaire libre, ce qu'on veut, à côté de la valeur.
  const [note, setNote] = useState(null); // { id, texte }
  const noter = useMutation({
    mutationFn: ({ critere, texte }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${g.id}/note/${critere}`, { body: { texte } }),
    onSuccess: () => { setNote(null); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <div>
      {titre && <p className="m-0 px-5 pt-4 pb-2 text-[15px] font-semibold text-encre">{titre}</p>}
      <table className="w-full border-collapse">
        <thead><tr><Th className="w-[220px]">Critère</Th><Th>Valeur lue</Th><Th className="w-[150px]">Statut</Th><Th className="w-[200px]">Notes</Th>{!sansSources && <Th className="w-[190px]">Source</Th>}</tr></thead>
        <tbody>
          {g.lignes.map((l, iLigne) => (
            <tr key={l.id} className="align-top">
              <td className="px-4 py-3 border-b border-r border-trait">
                <button onClick={() => bascule(l.id)} className="text-left text-[13.5px] text-encre hover:text-[#ffffff]">{l.libelle}</button>
                {ouverts.has(l.id) && <p className="m-0 mt-1 text-[11px] leading-[1.45] text-brume">{l.regle}</p>}
              </td>
              <td className={`px-4 py-3 border-b border-r border-trait group ${l.details ? "cursor-pointer" : ""}`} onClick={() => l.details && !edition && basculeDetail(l.id)} title={l.details ? "Voir les valeurs comparées" : undefined}>
                {edition?.id === l.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea autoFocus value={edition.texte} onChange={(e) => setEdition({ id: l.id, texte: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); corriger.mutate({ critere: l.id, valeur: edition.texte }); } if (e.key === "Escape") setEdition(null); }} rows={Math.min(8, Math.max(2, edition.texte.split("\n").length))} className="w-full bg-transparent border border-bord-vif focus:border-encre rounded-md px-2.5 py-1.5 outline-none text-[13.5px] leading-[1.55] text-encre resize-y" />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button onClick={() => corriger.mutate({ critere: l.id, valeur: edition.texte })} disabled={corriger.isPending} className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 bg-menthe rounded-full text-sur-menthe font-semibold rounded-md"><Check className="w-3 h-3" /> OK</button>
                      <button onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
                      {l.correction && <button onClick={() => corriger.mutate({ critere: l.id, valeur: "" })} className="inline-flex items-center gap-1 text-[12.5px] text-ardoise hover:text-encre ml-auto"><RotateCcw className="w-3 h-3" /> Revenir à la valeur lue</button>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {l.valeur ? <p className="m-0 flex-1 text-[13.5px] leading-[1.55] text-encre whitespace-pre-line">{l.valeur}</p> : <span className="flex-1 text-[12.5px] text-brume">—</span>}
                    {!lectureSeule && dealId && <button onClick={(e) => { e.stopPropagation(); setEdition({ id: l.id, texte: l.valeur || "" }); }} aria-label="Modifier la valeur" title="Modifier la valeur" className="flex-none text-brume hover:text-encre opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-0.5"><Pencil className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
                {/* Une valeur venue d'une pièce qui ne relève pas de cette
                    grille : on le dit, sinon elle passe pour une lecture de la
                    pièce attendue. */}
                {l.hors_grille && l.lue_dans && edition?.id !== l.id && (
                  <p className="m-0 mt-1 text-[11px] text-ambre">lu dans « {l.lue_dans} », pas dans les pièces de cette partie</p>
                )}
                {l.correction && edition?.id !== l.id && <p className="m-0 mt-1 text-[11px] text-ambre">corrigé à la main{l.correction.par ? ` · ${l.correction.par.split("@")[0]}` : ""}{l.valeur_lue ? <span className="text-brume"> · lu : {String(l.valeur_lue).slice(0, 60)}{String(l.valeur_lue).length > 60 ? "…" : ""}</span> : null}</p>}
                {l.motif && l.statut_calcule !== "ok" && <p className="m-0 mt-1 text-[12.5px] leading-[1.45] text-ardoise">{l.motif}{l.details ? <span className="text-brume"> · {details.has(l.id) ? "replier" : "voir les valeurs"}</span> : null}</p>}
                {l.details && details.has(l.id) && (
                  <div className="mt-2 border border-bord-doux rounded-lg px-3 py-2 space-y-1">
                    {l.details.map((d, i) => <p key={i} className="m-0 flex items-baseline justify-between gap-4 text-[12.5px]"><span className="text-ardoise">{d.libelle}</span><span className="text-encre tabular-nums font-light text-[13.5px]">{d.valeur}</span></p>)}
                  </div>
                )}
              </td>
              <td className={`px-4 py-3 border-b border-r border-trait relative ${lectureSeule || !dealId ? "" : "cursor-pointer"}`} style={{ background: FOND[l.statut] || FOND.vide }} onClick={() => !lectureSeule && dealId && setChoix(choix === l.id ? null : l.id)} title={lectureSeule || !dealId ? undefined : "Changer le statut"}>
                <span className="text-[12.5px] font-medium" style={{ color: teinteDe(l.statut) }}>{MOT[l.statut] || l.statut}</span>
                {l.decision && <span className="block text-[11px] text-ardoise">décidé{l.decision.par ? ` · ${l.decision.par.split("@")[0]}` : ""}</span>}
                {/* Sur les deux dernières lignes, le menu s'ouvre vers le
                    haut : posé en dessous, il sortait du tableau et les statuts
                    n'étaient plus cliquables. */}
                {choix === l.id && (
                  <div ref={menu} className={`absolute left-2 z-20 bg-surface border border-bord-doux rounded-lg shadow-[0_12px_30px_rgba(0,0,0,.5)] p-1.5 flex flex-col gap-1 min-w-[150px] ${iLigne >= g.lignes.length - 2 ? "bottom-full mb-1" : "top-full mt-1"}`} onClick={(e) => e.stopPropagation()}>
                    {[["ok", "OK"], ["a_checker", "À checker"], ["a_verifier", "À vérifier"], ["no_go", "No go"]].map(([st, mot]) => (
                      <button key={st} onClick={() => decider.mutate({ critere: l.id, statut: st })} className="rounded-md px-3 py-1.5 text-left text-[12.5px] font-medium" style={{ background: FOND[st], color: teinteDe(st) }}>{mot}</button>
                    ))}
                    {l.decision && <button onClick={() => decider.mutate({ critere: l.id, statut: null })} className="text-left text-[12.5px] text-ardoise hover:text-encre px-3 py-1">Revenir au calcul</button>}
                  </div>
                )}
              </td>
              <td className={`px-4 py-3 border-b border-trait group ${sansSources ? "" : "border-r"}`}>
                {note?.id === l.id ? (
                  <div>
                    <textarea autoFocus value={note.texte} onChange={(e) => setNote({ id: l.id, texte: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); noter.mutate({ critere: l.id, texte: note.texte }); } if (e.key === "Escape") setNote(null); }} rows={Math.min(6, Math.max(2, note.texte.split("\n").length))} placeholder="Votre commentaire…" className="w-full bg-transparent border border-bord-vif focus:border-encre rounded-md px-2.5 py-1.5 outline-none text-[12.5px] leading-[1.5] text-encre resize-y placeholder:text-brume" />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button onClick={() => noter.mutate({ critere: l.id, texte: note.texte })} disabled={noter.isPending} className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 bg-menthe rounded-full text-sur-menthe font-semibold rounded-md"><Check className="w-3 h-3" /> OK</button>
                      <button onClick={() => setNote(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
                    </div>
                  </div>
                ) : lectureSeule || !dealId ? (
                  l.note ? <p className="m-0 text-[12.5px] leading-[1.5] text-craie whitespace-pre-line">{l.note.texte}</p> : <span className="text-[12.5px] text-brume">—</span>
                ) : (
                  <button onClick={() => setNote({ id: l.id, texte: l.note?.texte || "" })} aria-label={l.note ? "Modifier la note" : "Écrire une note"} title={l.note ? "Modifier la note" : "Écrire une note"} className="w-full text-left">
                    {l.note ? (
                      <>
                        <span className="block text-[12.5px] leading-[1.5] text-craie whitespace-pre-line">{l.note.texte}</span>
                        {l.note.par && <span className="block mt-1 text-[11px] text-brume">{l.note.par.split("@")[0]}</span>}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-brume group-hover:text-ardoise transition-colors"><Pencil className="w-3 h-3" /> Ajouter une note</span>
                    )}
                  </button>
                )}
              </td>
              {!sansSources && (
                <td className="px-4 py-3 border-b border-trait">
                  <div className="flex flex-col gap-1">
                    {l.preuves?.length ? l.preuves.slice(0, 3).map((p, i) => (
                      <button key={i} onClick={() => onPreuve?.(p)} aria-label={p.citation || p.reponse} title={p.citation || p.reponse} className="text-left text-[12.5px] text-ardoise hover:text-encre truncate max-w-[190px]">{(p.document_nom || "").replace(/\.pdf$/i, "")}{p.page ? ` · p. ${p.page}` : ""}</button>
                    )) : <span className="text-[12.5px] text-brume">—</span>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Les grilles d'une partie, chargées depuis le dossier : un cadre par tableau,
// avec son titre, son sous-titre et son propre résumé.
export default function GrilleCriteres({ dossier, grilles: demandees, ids, titre, sousTitre, onPreuve, apercu = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  // `grilles` porte titre et sous-titre par tableau ; `ids` seul reste accepté.
  const voulues = demandees || (ids || []).map((id, i) => ({ id, titre: i === 0 ? titre : null, sousTitre: i === 0 ? sousTitre : null }));
  const requetes = useQueries({ queries: voulues.map((v) => ({
    queryKey: ["grille", v.id, dealId],
    queryFn: async () => {
      const g = await base44.request("GET", `/api/preanalyse/dossiers/${dealId}/grille/${v.id}`);
      garder(dealId, v.id, g);
      return g;
    },
    enabled: !!dealId,
    // On revient sur le dossier : l'analyse déjà lue s'affiche tout de suite,
    // même après un rechargement de la page — elle est gardée sur le poste.
    // La relecture éventuelle se fait derrière, sans écran d'attente.
    initialData: () => gardee(dealId, v.id),
    initialDataUpdatedAt: () => gardeeLe(dealId, v.id),
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    placeholderData: (precedent) => precedent,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  })) });
  // Relancer l'analyse d'une grille : ses questions seules sont relues sur
  // toutes les pièces ; les autres tableaux ne bougent pas.
  const relancer = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${id}/relancer`, { body: {} }),
    onSuccess: () => { setDevis(null); demanderNotifications(); toast.success("Analyse relancée", { description: "Vous serez prévenu quand elle sera terminée." }); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Relance impossible"),
  });
  // Relire, c'est repayer la lecture des pièces. On annonce le prix avant, pas
  // sur la facture : les jetons sont comptés par l'API, ce comptage est gratuit.
  const [devis, setDevis] = useState(null); // { id, cout, pieces, jetons }
  const chiffrer = useMutation({
    mutationFn: (id) => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/estimation?grille=${id}`),
    onSuccess: (r, id) => setDevis({ id, ...r }),
    // Sans estimation, on ne bloque pas : on relance en le disant.
    onError: () => setDevis({ id: chiffrer.variables, cout: null }),
  });

  // La relecture s'achève alors qu'on est peut-être ailleurs : on prévient, et
  // le message ramène sur le dossier.
  const enCoursPrecedent = useRef(new Set());
  useEffect(() => {
    requetes.forEach((r, i) => {
      const etat = r.data?.remplissage?.etat;
      const cle = voulues[i]?.id;
      if (!cle) return;
      if (etat === "en_cours") enCoursPrecedent.current.add(cle);
      else if (enCoursPrecedent.current.has(cle)) {
        enCoursPrecedent.current.delete(cle);
        const titre = voulues[i]?.titre || r.data?.titre || cle;
        prevenir("Analyse terminée", `${titre} — ${dossier?.titre || dossier?.nom || "dossier"}`, dealId ? `/Analyse?deal_id=${dealId}` : null);
      }
    });
  }, [requetes.map((r) => r.data?.remplissage?.etat || "").join("|")]);

  return (
    <div className="space-y-5">
      {voulues.map((v, i) => {
        const r = requetes[i];
        const g = r?.data;
        const resume = g ? { ok: g.resume.ok, a_checker: g.resume.a_checker || 0, warning: g.resume.warning + g.resume.a_verifier, no_go: g.resume.no_go || 0, vide: g.resume.vide + g.resume.non_lu } : null;
        const enCours = g?.remplissage?.etat === "en_cours";
        return (
          <div key={v.id} className="overflow-hidden rounded-[16px] border border-trait bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="m-0 text-[18px] font-semibold text-encre">{v.titre || g?.titre || v.id}</h2>
                {v.sousTitre && <span className="text-[12.5px] text-ardoise">{v.sousTitre}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {resume && (
                  <span className="flex items-center gap-3 text-[12.5px] text-craie">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.ok }} />{resume.ok} OK</span>
                    {resume.a_checker > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.a_checker }} />{resume.a_checker} à checker</span>}
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.warning }} />{resume.warning} à vérifier</span>
                    {resume.no_go > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.no_go }} />{resume.no_go} no go</span>}
                    {resume.vide > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.vide }} />{resume.vide} sans valeur</span>}
                  </span>
                )}
                {enCours ? (
                  <PenseeIA etat="searching" taille={20} texte={g.remplissage?.total ? `Relecture des pièces ${g.remplissage.fait ?? 0}/${g.remplissage.total}` : "Relecture des pièces…"} />
                ) : devis?.id === v.id ? (
                  <span className="inline-flex items-center gap-2.5 rounded-full border border-ambre/40 bg-ambre/10 pl-3.5 pr-1.5 py-1">
                    <span className="text-[12.5px] text-ambre tabular-nums">
                      {devis.cout == null ? "Coût inconnu" : `≈ ${devis.cout < 0.01 ? "moins d'un centime" : `${devis.cout.toFixed(2)} $`}`}
                      {devis.pieces ? <span className="text-ardoise"> · {devis.pieces} pièce{devis.pieces > 1 ? "s" : ""}</span> : null}
                    </span>
                    <button onClick={() => relancer.mutate(v.id)} disabled={relancer.isPending} className="text-[12.5px] px-3 py-1 rounded-full bg-menthe text-fond font-semibold hover:bg-menthe-survol disabled:opacity-40">Relire</button>
                    <button onClick={() => setDevis(null)} className="text-[12.5px] px-2.5 py-1 text-ardoise hover:text-encre">Annuler</button>
                  </span>
                ) : (
                  <button onClick={() => !apercu && chiffrer.mutate(v.id)} disabled={apercu || chiffrer.isPending || relancer.isPending}  aria-label={`Relire toutes les pièces pour « ${v.titre || v.id} » — le prix s'affiche avant`} title={`Relire toutes les pièces pour « ${v.titre || v.id} » — le prix s'affiche avant`} className="inline-flex items-center gap-2 text-[12.5px] px-3.5 py-1.5 rounded-full bg-menthe text-fond font-semibold hover:bg-menthe-survol disabled:opacity-40">
                    {chiffrer.isPending && chiffrer.variables === v.id ? <PenseeIA etat="working" taille={20} /> : <RefreshCw className="w-3.5 h-3.5" />} Relancer l'analyse
                  </button>
                )}
              </div>
            </header>
            {g ? <TableCriteres g={g} onPreuve={onPreuve} dealId={dealId} /> : <div className="p-6"><PenseeIA etat="breathing" taille={20} texte="Lecture…" /></div>}
          </div>
        );
      })}
    </div>
  );
}
