/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import NoteCellule from "@/components/preanalyse/NoteCellule";
import { toast } from "@/components/ui/avis";
import { Check, Loader2, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import PenseeIA from "@/components/PenseeIA";
import { Depliant } from "@/components/haka/ReglagesDemande";
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

/** La requête d'une grille : la même pour l'onglet et pour le préchargement. */
export const requeteGrille = (dealId, id) => ({
  queryKey: ["grille", id, dealId],
  queryFn: async () => {
    const g = await base44.request("GET", `/api/preanalyse/dossiers/${dealId}/grille/${id}`);
    garder(dealId, id, g);
    return g;
  },
  staleTime: 10 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
});

/**
 * À l'ouverture d'un dossier, toutes ses grilles se chargent derrière (18 oct. 2026, Jules :
 * « je veux plus que ça charge avec lecture ») : un clic sur Copropriété ou Diagnostics les
 * trouve déjà là.
 */
export function prechargerGrilles(queryClient, dealId, ids) {
  if (!dealId) return;
  for (const id of ids) queryClient.prefetchQuery(requeteGrille(dealId, id)).catch(() => {});
}

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
/** Les colonnes du tableau, les mêmes que l'onglet Bien. */
const STATUT_SUIVANT = { ok: "a_verifier", a_checker: "a_verifier", a_verifier: "no_go", warning: "no_go", no_go: "ok", vide: "ok", non_lu: "ok" };
const COLONNES = "grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_110px_minmax(0,1.3fr)]";
/** Le statut d'une ligne en mot : [mot, classes, en pastille ?]. « Info » pour une ligne d'information. */
export function statutAffiche(l) {
  const info = /^information/i.test(String(l.regle || ""));
  switch (l.statut) {
    case "ok": return info ? ["Info", "bg-rail-actif text-craie", true] : ["OK", "text-menthe", false];
    case "a_checker": return info ? ["Info", "bg-rail-actif text-craie", true] : ["À checker", "bg-rail-actif text-craie", true];
    case "warning": case "a_verifier": return ["À vérifier", "bg-ambre/15 text-ambre", true];
    case "no_go": return ["Bloquant", "bg-alerte/15 text-alerte", true];
    case "non_lu": return ["Non lu", "text-brume", false];
    default: return ["Non trouvé", "text-brume", false];
  }
}
/** Le nom court d'une pièce pour sa pastille (« Bail », « Avenant », « PV d'AG »…). */
export function nomPiece(p) {
  const c = String(p.categorie || "").toLowerCase(); const n = String(p.document_nom || "").toLowerCase();
  if (/avenant/.test(c + n)) return "Avenant";
  if (/bail/.test(c) || /\bbail/.test(n)) return "Bail";
  if (/quittance/.test(c + n)) return "Quittances";
  if (/pv d.?ag/.test(c) || /\bpv\b/.test(n)) return "PV d'AG";
  if (/r[eè]glement|edd/.test(c) || /\brcp\b|edd/.test(n)) return "Règlement";
  if (/taxe/.test(c) || /\btf\b/.test(n)) return "Avis TF";
  if (/\bdpe\b/.test(n)) return "DPE";
  if (/amiante|\bdta/.test(n)) return "Amiante";
  if (/\berp/.test(n)) return "ERP";
  if (/kbis/.test(c + n)) return "Kbis";
  return String(p.document_nom || "Pièce").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").slice(0, 22);
}
export const Th = ({ children, className = "" }) => <th className={`text-left text-[11px] font-semibold tracking-[.02em] text-ardoise px-4 py-2.5 border-b border-r border-trait last:border-r-0 ${className}`}>{children}</th>;

export function TableCriteres({ g, onPreuve = undefined, sansSources = false, titre = null, dealId = null, lectureSeule = false }) {
  const [ouverts, setOuverts] = useState(() => new Set());
  const [details, setDetails] = useState(() => new Set());
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <div>
      {titre && <p className="m-0 px-5 pt-4 pb-2 text-[15px] font-semibold text-encre">{titre}</p>}
      {/* Le style du tableau de l'onglet Bien (18 oct. 2026, Jules : « partout ailleurs dans l'analyse ») :
          Ligne / Ce qu'on y lit / Sources / Statut, les sources en pastilles, le statut en mot. */}
      <div className={`grid ${COLONNES} gap-x-6 border-t border-trait px-5 py-3 text-[13px] text-ardoise max-lg:hidden`}>
        <span>Ligne</span><span>Ce qu'on y lit</span><span>{sansSources ? "" : "Sources"}</span><span>Statut</span><span>Notes</span>
      </div>
      <div className="k-cascade">
      {g.lignes.map((l, iLigne) => {
        const [mot, classe, puce] = statutAffiche(l);
        return (
          <div key={l.id} className={`group/ligne grid ${COLONNES} gap-x-6 border-t border-trait px-5 py-3.5 transition-colors duration-200 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5`}>
            <div className="min-w-0">
              <button type="button" onClick={() => bascule(l.id)} className="text-left text-[14.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>{l.libelle}</button>
              <Depliant ouvert={ouverts.has(l.id)}><p className="m-0 mt-1 text-[12px] leading-[1.45] text-brume">{l.regle}</p></Depliant>
            </div>
            <div className={`min-w-0 group ${l.details ? "cursor-pointer" : ""}`} onClick={() => l.details && !edition && basculeDetail(l.id)} title={l.details ? "Voir les valeurs comparées" : undefined}>
              {edition?.id === l.id ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <textarea autoFocus value={edition.texte} onChange={(e) => setEdition({ id: l.id, texte: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); corriger.mutate({ critere: l.id, valeur: edition.texte }); } if (e.key === "Escape") setEdition(null); }}
                    rows={Math.min(6, Math.max(2, edition.texte.split("\n").length))} className="w-full resize-y rounded-[10px] border border-menthe bg-surface px-3 py-2 text-[14px] text-encre outline-none max-md:text-[16px]" />
                  <div className="mt-1.5 flex items-center gap-2">
                    <button onClick={() => corriger.mutate({ critere: l.id, valeur: edition.texte })} disabled={corriger.isPending} className="inline-flex items-center gap-1 rounded-full bg-menthe px-2.5 py-1 text-[12.5px] font-semibold text-sur-menthe"><Check className="h-3 w-3" /> Enregistrer</button>
                    <button onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
                    {l.correction && <button onClick={() => corriger.mutate({ critere: l.id, valeur: "" })} className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><RotateCcw className="h-3 w-3" /> Valeur lue</button>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  {l.valeur ? <p className="m-0 flex-1 whitespace-pre-line text-[14.5px] leading-[1.5] text-encre">{l.valeur}</p> : <span className="flex-1 text-[14.5px] text-ardoise">Non trouvé</span>}
                  {!lectureSeule && dealId && <button onClick={(e) => { e.stopPropagation(); setEdition({ id: l.id, texte: l.valeur || "" }); }} aria-label="Corriger la valeur" title="Corriger la valeur" className="flex-none p-0.5 text-brume opacity-0 transition-opacity hover:text-encre group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}><Pencil className="h-3.5 w-3.5" /></button>}
                </div>
              )}
              {l.motif && l.statut_calcule !== "ok" && l.valeur && <p className={`m-0 mt-0.5 text-[13px] leading-[1.45] ${l.statut === "no_go" ? "text-alerte" : "text-ambre"}`}>{l.motif}{l.details ? <span className="text-brume"> · {details.has(l.id) ? "replier" : "voir les valeurs"}</span> : null}</p>}
              {l.hors_grille && l.lue_dans && edition?.id !== l.id && <p className="m-0 mt-0.5 text-[12.5px] text-ambre">Lu dans « {l.lue_dans} », pas dans les pièces de cette partie.</p>}
              {l.correction && edition?.id !== l.id && <p className="m-0 mt-0.5 text-[12.5px] text-brume">Corrigée par {l.correction.par ? l.correction.par.split("@")[0] : "l'équipe"} : verrouillée{l.valeur_lue ? ` (lu : ${String(l.valeur_lue).slice(0, 80)})` : ""}</p>}
              {l.details && (
                <Depliant ouvert={details.has(l.id)}>
                  <ul className="m-0 mt-1.5 list-none p-0 text-[13px]">
                    {l.details.map((d, i) => <li key={i} className="flex items-baseline justify-between gap-4 py-0.5"><span className="text-brume">{d.libelle}</span><span className="tabular-nums text-encre">{d.valeur}</span></li>)}
                  </ul>
                </Depliant>
              )}
            </div>
            <div className="flex flex-wrap content-start gap-1.5">
              {!sansSources && (l.preuves?.length ? l.preuves.slice(0, 3).map((pv, i) => (
                <button key={i} type="button" onClick={() => onPreuve?.(pv)} title={pv.citation || pv.reponse || undefined}
                  className="inline-flex h-7 max-w-full items-center truncate rounded-full border border-trait px-2.5 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                  {nomPiece(pv)}{pv.page ? ` p. ${pv.page}` : ""}
                </button>
              )) : null)}
            </div>
            {/* Un clic sur la case fait tourner le statut : OK, À vérifier, Bloquant (18 oct. 2026, Jules) ; plus de menu. */}
            <button type="button" disabled={lectureSeule || !dealId || decider.isPending} onClick={() => decider.mutate({ critere: l.id, statut: STATUT_SUIVANT[l.statut] || "ok" })}
              title={lectureSeule || !dealId ? undefined : "Cliquer pour changer le statut"}
              className={`-mx-2 -my-1.5 self-start rounded-[10px] px-2 py-1.5 text-left transition-colors ${lectureSeule || !dealId ? "cursor-default" : "cursor-pointer hover:bg-encre/[0.05]"}`} style={{ background: "transparent" }}>
              <span className={`${puce ? `inline-flex h-7 items-center rounded-full px-3 ${classe}` : classe} text-[13px]`}>{mot}</span>
              {l.decision && <span className="mt-0.5 block text-[11px] text-brume">décidé{l.decision.par ? ` · ${l.decision.par.split("@")[0]}` : ""}</span>}
            </button>
            {/* La note de l'analyste, dans sa colonne (19 oct. 2026, Jules). */}
            <div className="min-w-0"><NoteCellule dealId={dealId} tableau={g.id} ligne={l.id} note={l.note} lectureSeule={lectureSeule} /></div>
          </div>
        );
      })}
      </div>
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
    ...requeteGrille(dealId, v.id),
    enabled: !!dealId,
    // On revient sur le dossier : l'analyse déjà lue s'affiche tout de suite,
    // même après un rechargement de la page — elle est gardée sur le poste.
    // La relecture éventuelle se fait derrière, sans écran d'attente.
    initialData: () => gardee(dealId, v.id),
    initialDataUpdatedAt: () => gardeeLe(dealId, v.id),
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
        prevenir("Analyse terminée", `${titre} — ${dossier?.titre || dossier?.nom || "dossier"}`, dealId ? `/Dossiers?deal_id=${dealId}` : null);
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
          <div key={v.id} data-zone="listes" className="k-points relative overflow-hidden rounded-[16px] border border-trait bg-rail">
            <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 max-md:px-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className="m-0 text-[18px] font-semibold text-encre">{v.titre || g?.titre || v.id}</h2>
                {v.sousTitre && <span className="text-[12.5px] text-ardoise">{v.sousTitre}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {resume && (
                  <span className="flex flex-wrap items-center gap-3 text-[12.5px] text-craie">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.ok }} />{resume.ok} OK</span>
                    {resume.a_checker > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.a_checker }} />{resume.a_checker} à checker</span>}
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.warning }} />{resume.warning} signalé{resume.warning > 1 ? "s" : ""}</span>
                    {resume.no_go > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.no_go }} />{resume.no_go} bloquant{resume.no_go > 1 ? "s" : ""}</span>}
                    {resume.vide > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.vide }} />{resume.vide} non trouvé{resume.vide > 1 ? "s" : ""}</span>}
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
            {g ? <TableCriteres g={g} onPreuve={onPreuve} dealId={dealId} /> : null}
          </div>
        );
      })}
    </div>
  );
}
