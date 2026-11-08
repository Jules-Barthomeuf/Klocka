import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, Loader2, Mic, Pause, Play, Plus, Sparkles, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { toast } from "@/components/ui/avis";
import { kEuros } from "@/lib/clients-commerces";
import { entreeEnvoie } from "@/lib/entree-envoie";

// La fiche du mandataire sur une page (24 oct. 2026, Jules) : le commerce et
// l'exploitant ; le propriétaire des murs (SCI, gérant, âge) ; les signaux,
// leur source et leur date ; le contact et sa source ; les recherches clients
// compatibles ; le statut, la prochaine action et l'historique. Elle avance
// par la dictée : Haka dit ce qu'il a compris, le mandataire confirme ou
// corrige, la fiche se met à jour (server/fiche-mandataire.js).

const API = "/api/mandataire/proprietaires";
// Le type prospecté (3 nov. 2026, Jules : « dès qu'on prospecte des fonds et qu'on les met dans les listes, c'est labellisé
// fonds de commerce ») : posé sur la fiche à sa naissance, il suit le bien jusqu'à l'estimation.
const TYPE_DU_MODE = { murs: "murs_commerce", fonds: "fonds_commerce", bureaux: "bureaux" };
const TYPE_LIBELLE = { murs_commerce: "Murs commerciaux", fonds_commerce: "Fonds de commerce", bureaux: "Bureaux" };
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const CHAMPS = { telephone: "Téléphone", email: "Mail", nom: "Nom", remarque: "Remarque" };
const ISSUES_PROSPECTION = [["", "Rien ne change"], ["contacte", "Contacté"], ["rdv", "Rendez-vous fixé (passe dans Biens)"], ["pas_interet", "Pas d'intérêt (relance dans six mois)"]];
const ISSUES_BIENS = [["", "Rien ne change"], ["visite", "Visité"], ["prix_accord", "Prix d'accord"], ["pause", "En pause (refuse le prix)"]];

/** L'enregistrement au micro, pour dicter : démarrer, arrêter, et le son part à Haka. */
export function useMicro(onSon) {
  const [enCours, setEnCours] = useState(false);
  const rec = useRef(null);
  const morceaux = useRef([]);
  const demarrer = async () => {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(flux);
      morceaux.current = [];
      r.ondataavailable = (e) => { if (e.data.size) morceaux.current.push(e.data); };
      r.onstop = () => { flux.getTracks().forEach((t) => t.stop()); onSon(new Blob(morceaux.current, { type: r.mimeType || "audio/webm" })); };
      r.start();
      rec.current = r;
      setEnCours(true);
    } catch { toast.error("Micro indisponible : autorisez-le, ou écrivez ce qui s'est passé."); }
  };
  const arreter = () => { rec.current?.stop(); rec.current = null; setEnCours(false); };
  useEffect(() => () => rec.current?.stop(), []);
  return { enCours, demarrer, arreter };
}

/** La dictée : on dit (ou écrit) ce qui s'est passé ; Haka propose ; on confirme ou corrige. */
export function Dictee({ id, dansBiens, onFait }) {
  const [texte, setTexte] = useState("");
  const [prop, setProp] = useState(null);
  const lire = useMutation({
    mutationFn: (son) => {
      if (son) { const f = new FormData(); f.append("audio", son, "dictee.webm"); return base44.request("POST", `${API}/${id}/dictee`, { body: f, isForm: true }); }
      return base44.request("POST", `${API}/${id}/dictee`, { body: { texte: texte.trim() } });
    },
    onSuccess: (r) => { setProp(r.proposition); if (r.dit && !texte.trim()) setTexte(r.dit); },
    onError: (e) => toast.error(e?.message || "L'Assistant KPartners n'a pas pu le lire"),
  });
  const appliquer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/dictee/appliquer`, { body: { proposition: prop } }),
    onSuccess: (r) => { toast.success((r.faits || []).join(" · ") || "Fiche à jour"); setProp(null); setTexte(""); onFait?.(); },
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  const micro = useMicro((son) => lire.mutate(son));
  const issues = dansBiens ? ISSUES_BIENS : ISSUES_PROSPECTION;
  const maj = (k, v) => setProp((p) => ({ ...p, [k]: v }));
  return (
    <div>
      {/* Comme la saisie du chat (24 oct. 2026, Jules) : pas de consigne au-dessus, une pilule avec le micro et l'envoi. */}
      {!prop && (
        <>
          <div className="flex items-end gap-1.5 rounded-[22px] border border-bord-doux bg-surface px-3 py-1.5 focus-within:border-menthe">
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={1} placeholder="Parler à l'assistant…" aria-label="Parler à l'assistant"
              onKeyDown={(e) => { if (entreeEnvoie(e) && texte.trim() && !lire.isPending) { e.preventDefault(); lire.mutate(null); } }}
              className="max-h-[140px] min-h-[36px] w-full resize-none border-none bg-transparent py-1.5 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            <button type="button" onClick={micro.enCours ? micro.arreter : micro.demarrer} disabled={lire.isPending} aria-label={micro.enCours ? "Arrêter la dictée" : "Dicter"} title={micro.enCours ? "Arrêter" : "Dicter"}
              className={`grid h-9 w-9 flex-none place-items-center rounded-full ${micro.enCours ? "text-alerte" : "text-craie hover:text-encre"}`} style={{ background: "transparent" }}>
              {micro.enCours ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => lire.mutate(null)} disabled={!texte.trim() || lire.isPending} aria-label="Envoyer" title="Envoyer"
              className="grid h-9 w-9 flex-none place-items-center rounded-full text-encre transition-colors hover:text-menthe disabled:opacity-30" style={{ background: "transparent" }}>
              {lire.isPending ? <Square className="h-3 w-3" fill="currentColor" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />}
            </button>
          </div>
          {micro.enCours && <p className="m-0 mt-1 text-[12.5px] text-alerte">Je vous écoute… appuyez sur le carré pour finir.</p>}
        </>
      )}
      {prop && (
        <div className="mt-2 flex flex-col gap-2.5">
          <p className="m-0 rounded-[10px] bg-menthe/[0.08] px-3 py-2 text-[13.5px] leading-[1.5] text-encre">{prop.compris || prop.note}</p>
          <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-ardoise">Statut
            <select value={prop.issue || ""} onChange={(e) => maj("issue", e.target.value || null)} className="h-8 rounded-full border border-trait bg-surface-pleine px-3 text-[13px] text-encre max-md:text-[16px]">
              {issues.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
            </select>
          </label>
          {/* La restitution de l'avis (27 oct. 2026) : le cas compris, son statut et sa relance s'écrivent à la validation. */}
          {prop.restitution && (
            <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-ardoise">Restitution
              <span className="text-[13px] text-encre">{prop.restitution.mot}{prop.restitution.prix ? ` · ${Number(String(prop.restitution.prix).replace(/[^\d.]/g, "")).toLocaleString("fr-FR")} €` : ""}</span>
              <button type="button" onClick={() => maj("restitution", null)} aria-label="Retirer la restitution" className="text-ardoise hover:text-encre" style={{ background: "transparent" }}>×</button>
            </p>
          )}
          {prop.issue === "rdv" && (
            <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-ardoise">Rendez-vous
              <input type="datetime-local" value={prop.rdv_quand || ""} onChange={(e) => maj("rdv_quand", e.target.value || null)} className="h-8 rounded-full border border-trait bg-surface-pleine px-3 text-[13px] text-encre max-md:text-[16px]" />
            </label>
          )}
          {(prop.infos || []).map((info, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-[86px] text-[12.5px] text-ardoise">{CHAMPS[info.champ] || info.champ}</span>
              <input value={info.valeur} onChange={(e) => maj("infos", prop.infos.map((x, j) => (j === i ? { ...x, valeur: e.target.value } : x)))} className="h-8 min-w-0 flex-1 rounded-full border border-trait bg-surface-pleine px-3 text-[13px] text-encre max-md:text-[16px]" />
              <label className="inline-flex items-center gap-1.5 text-[12px] text-ambre"><input type="checkbox" checked={!!info.a_confirmer} onChange={(e) => maj("infos", prop.infos.map((x, j) => (j === i ? { ...x, a_confirmer: e.target.checked } : x)))} /> à confirmer</label>
              <button type="button" onClick={() => maj("infos", prop.infos.filter((_, j) => j !== i))} aria-label="Retirer" title="Retirer" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-[86px] text-[12.5px] text-ardoise">Tâche</span>
            <input value={prop.tache?.quoi || ""} onChange={(e) => maj("tache", e.target.value ? { ...(prop.tache || {}), quoi: e.target.value } : null)} placeholder="Appeler M. Bernard" className="h-8 min-w-0 flex-1 rounded-full border border-trait bg-surface-pleine px-3 text-[13px] text-encre placeholder:text-brume max-md:text-[16px]" />
            {prop.tache?.quoi && <input type="date" value={String(prop.tache?.quand || "").slice(0, 10)} onChange={(e) => maj("tache", { ...prop.tache, quand: e.target.value || null })} className="h-8 rounded-full border border-trait bg-surface-pleine px-3 text-[13px] text-encre max-md:text-[16px]" />}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setProp(null)} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Corriger le texte</button>
            <button type="button" onClick={() => appliquer.mutate()} disabled={appliquer.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {appliquer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirmer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Parler à l'assistant depuis une fiche (24 oct. 2026, Jules : « le chat comme dans le dashboard Haka » ; sans contour
 * pervenche depuis le 25 oct., le même dessin que le dashboard partout) : le chat de
 * Haka du mandataire, qui sait quelle fiche est ouverte ; chaque réponse relit la fiche (statut, historique, tâches).
 */
export function ChatFiche({ id, onReponse = null, onConversation = null, onReprise = null, plein = false }) {
  return (
    <ChatDashboard espace="mandataire" proprietaireId={id} compact sansSkills epure lueur libelleAccueil="Assistant KPartners" menusVersLeHaut
      placeholderAccueil="Parler à l'assistant…" onReponse={onReponse} onConversation={onConversation} sansBarreHaut={plein}
      reprendre={!!id} onReprise={onReprise} />
  );
}

/**
 * Les pouces d'un commerce de la Prospection (6 nov. 2026, Jules : « une résidence étudiante dans les commerces, on
 * clique sur un pouce et ça enregistre que ce n'est pas bien ») : en bas, il sort de sa prospection, et son activité
 * sort de celle de tous quand elle est écartée assez souvent (server/avis-commerces.js) ; en haut, bonne cible.
 * Un second appui reprend l'avis ; « Annuler » sur l'avis aussi.
 */
function PoucesCommerce({ commerceId, avis, onEcarte = null }) {
  const queryClient = useQueryClient();
  const noter = useMutation({
    mutationFn: (v) => base44.request("POST", `/api/mandataire/commerces/${encodeURIComponent(commerceId)}/avis`, { body: { avis: v } }),
    onSuccess: (r, v) => {
      ["m-fiche", "m-prospecter"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      if (v !== "non") return;
      // La fiche se ferme : l'annulation ne passe plus par ce composant, qui n'est plus là.
      const annuler = () => base44.request("POST", `/api/mandataire/commerces/${encodeURIComponent(commerceId)}/avis`, { body: { avis: null } })
        .then(() => ["m-fiche", "m-prospecter"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }))).catch(() => toast.error("Pas annulé"));
      toast.success("Écarté de votre prospection", { description: r.activite_ecartee ? `« ${r.activite} » est écartée pour tous : assez de pouces l'ont jugée hors cible.` : "Le système le retient pour la suite.", action: { mot: "Annuler", faire: annuler } });
      onEcarte?.();
    },
    onError: (e) => toast.error(e?.message || "Avis non enregistré"),
  });
  const bouton = (v, Icone, mot, actif) => (
    <button type="button" onClick={() => noter.mutate(avis === v ? null : v)} disabled={noter.isPending} aria-pressed={avis === v} aria-label={mot} title={mot}
      className={`grid h-8 w-8 place-items-center rounded-full transition-colors disabled:opacity-50 ${avis === v ? actif : "text-brume hover:text-encre"}`}
      style={avis === v ? undefined : { background: "transparent" }}>
      <Icone className="h-4 w-4" />
    </button>
  );
  return (
    <span className="flex items-center">
      {bouton("oui", ThumbsUp, "Bonne cible", "bg-pervenche/15 text-pervenche")}
      {bouton("non", ThumbsDown, "Pas une cible : l'écarter", "bg-alerte/15 text-alerte")}
    </span>
  );
}

/** Fiche · Conversation : la bascule d'une fiche dont la conversation est ouverte (25 oct. 2026, Jules). */
const BasculeFiche = ({ vue, onVue }) => (
  <div className="flex w-fit gap-0.5 rounded-full border border-bord-doux bg-rail p-1" role="tablist" aria-label="Vue de la fiche">
    {[["fiche", "Fiche"], ["conversation", "Assistant"]].map(([k, mot]) => (
      <button key={k} type="button" role="tab" aria-selected={vue === k} onClick={() => onVue(k)}
        className={`h-8 rounded-full px-4 text-[13.5px] ${vue === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
        style={vue === k ? undefined : { background: "transparent" }}>{mot}</button>
    ))}
  </div>
);

const ilYaJours = (iso) => { const j = Math.floor((Date.now() - Date.parse(iso || 0)) / 86400000); return Number.isFinite(j) && j >= 0 ? (j === 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`) : null; };
const jourMois = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");

/** La petite flèche à droite qui déplie le détail d'une rangée (25 oct. 2026, Jules). */
const Fleche = ({ ouvert, onClick, quoi }) => (
  <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-expanded={ouvert} aria-label={`${ouvert ? "Replier" : "Voir"} le détail : ${quoi}`} title={ouvert ? "Replier" : "Voir le détail"}
    className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
    <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${ouvert ? "rotate-180" : ""}`} />
  </button>
);

/** Le détail déplié, en lignes courtes, qui glisse doucement. */
const Detail = ({ ouvert, lignes, className = "" }) => (
  <AnimatePresence initial={false}>
    {ouvert && (
      <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}
        className={`m-0 list-none overflow-hidden p-0 ${className}`}>
        <div className="flex flex-col gap-1 px-3 pb-3 pt-0.5">
          {lignes.map((l, i) => <li key={i} className="text-[13px] leading-[1.45] text-craie">{l}</li>)}
        </div>
      </motion.ul>
    )}
  </AnimatePresence>
);

/**
 * Une rangée du tableau de la fiche. `champ` : elle se modifie d'un clic (25 oct. 2026, Jules) ; Entrée ou un clic
 * ailleurs enregistre, Échap annule. `affiche` : ce qui se montre hors édition (un lien d'appel, une source).
 * `detail` : des lignes dépliées par une petite flèche à droite.
 */
function Rangee({ mot, valeur, affiche = null, champ = null, onEnregistrer = null, type = "text", detail = [] }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(valeur || "");
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => { if (!edition) setTexte(valeur || ""); }, [valeur, edition]);
  const finir = () => { setEdition(false); if (texte.trim() !== String(valeur || "").trim()) onEnregistrer?.(champ, texte.trim()); };
  const fleche = detail.length ? <Fleche ouvert={ouvert} onClick={() => setOuvert((o) => !o)} quoi={mot} /> : null;
  // Au dessin des lignes de « Tous les commerces » (25 oct. 2026, Jules) : deux colonnes égales, centrées, le libellé en
  // 13 px `ardoise`, la valeur en 14 px, la flèche dans la case de la valeur ; le détail centré en 12,5 px dessous.
  return (
    <div className="border-t border-trait first:border-t-0">
      <div className="grid grid-cols-2 items-stretch text-center">
        <dt className="flex items-center justify-center px-4 py-3 text-[13px] text-ardoise">{mot}</dt>
        <dd className="m-0 flex min-w-0 items-center justify-center border-l border-bord-doux text-[14px] text-encre">
          {edition ? (
            <input autoFocus type={type} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={finir} aria-label={mot}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTexte(valeur || ""); setEdition(false); } }}
              className="h-full w-full border-none bg-pervenche/[0.08] px-4 py-3 text-center text-[14px] text-encre outline-none max-md:text-[16px]" />
          ) : champ ? (
            <div role="button" tabIndex={0} onClick={() => setEdition(true)} onKeyDown={(e) => { if (e.key === "Enter") setEdition(true); }} title="Modifier"
              className="flex min-h-full min-w-0 flex-1 cursor-text items-center justify-center px-4 py-3 hover:bg-relief/40">
              <span className="line-clamp-2 min-w-0 break-words">{valeur ? (affiche || valeur) : <span className="text-brume">À compléter</span>}</span>
            </div>
          ) : <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-3"><span className="line-clamp-2 min-w-0 break-words">{affiche || valeur}</span></div>}
          {fleche && <span className="pr-1.5">{fleche}</span>}
        </dd>
      </div>
      <Detail ouvert={ouvert} lignes={detail} className="border-t border-trait [&>div]:items-center [&>div]:px-4 [&>div]:py-3 [&>div]:text-center [&_li]:text-[12.5px] [&_li]:leading-[1.5]" />
    </div>
  );
}

/** Un petit menu qui s'ouvre sous (ou au-dessus de) son déclencheur, et se ferme d'un clic ailleurs ou par Échap. */
function useMenu() {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", dehors); document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", dehors); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  return { ouvert, setOuvert, racine };
}
const MENU = "absolute z-40 m-0 min-w-[220px] list-none rounded-[14px] border border-bord-doux bg-surface-pleine p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.35)]";
const ENTREE = "flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] text-encre hover:bg-rail-actif";

const STATUTS = [["a_appeler", "À contacter"], ["contacte", "Contacté"], ["pas_vendeur", "Pas d'intérêt"]];
/** La pastille du statut, cliquable (25 oct. 2026, Jules) : le statut se change là, plus de boutons à part. */
function MenuStatut({ f, onChoisir, occupe = false }) {
  const { ouvert, setOuvert, racine } = useMenu();
  const actuel = ["a_recontacter"].includes(f.statut) ? "a_appeler" : ["en_discussion"].includes(f.statut) ? "contacte" : f.statut;
  return (
    <span ref={racine} className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} disabled={occupe} aria-haspopup="listbox" aria-expanded={ouvert} title="Changer le statut"
        className="inline-flex items-center gap-1 rounded-full bg-pervenche/15 px-2.5 py-1 text-[12px] text-pervenche hover:bg-pervenche/25">
        {occupe ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{f.statut_mot}<ChevronDown className="h-3 w-3" />
      </button>
      {ouvert && (
        <ul role="listbox" className={`${MENU} right-0 top-[calc(100%+6px)]`}>
          {STATUTS.map(([k, mot]) => (
            <li key={k} role="option" aria-selected={actuel === k}>
              <button type="button" onClick={() => { setOuvert(false); if (k !== actuel) onChoisir(k); }} className={ENTREE} style={{ background: actuel === k ? undefined : "transparent" }}>
                <span className="flex-1">{mot}</span>{actuel === k && <Check className="h-4 w-4 text-pervenche" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

/**
 * Le choix d'une liste (25 oct. 2026) : les listes du mandataire, puis « Nouvelle liste » par son nom. `declencheur`
 * reçoit la fonction qui ouvre ; `versLeHaut` ouvre au-dessus (le bouton collé en bas du panneau).
 */
function ChoixListe({ listes = [], actuelle = null, onChoisir, occupe = false, declencheur, versLeHaut = false }) {
  const { ouvert, setOuvert, racine } = useMenu();
  const [nom, setNom] = useState("");
  return (
    <span ref={racine} className="relative inline-flex">
      {declencheur(() => setOuvert((o) => !o))}
      {ouvert && (
        <div className={`${MENU} right-0 w-[260px] ${versLeHaut ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+6px)]"}`}>
          <div className="max-h-[240px] overflow-y-auto">
            {listes.map((l) => (
              <button key={l.id} type="button" disabled={occupe || l.id === actuelle} onClick={() => { setOuvert(false); onChoisir({ liste_id: l.id }); }} className={`${ENTREE} disabled:opacity-60`} style={{ background: "transparent" }}>
                <span className="min-w-0 flex-1 truncate">{l.nom}</span>
                {l.id === actuelle ? <Check className="h-4 w-4 text-pervenche" /> : <span className="text-[12px] tabular-nums text-brume">{l.n ?? ""}</span>}
              </button>
            ))}
            {!listes.length && <p className="m-0 px-3 py-2 text-[13px] text-brume">Aucune liste encore.</p>}
          </div>
          <form className="mt-1 flex gap-1.5 border-t border-trait px-1.5 pt-2" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) { setOuvert(false); onChoisir({ nom: nom.trim() }); setNom(""); } }}>
            <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle liste" aria-label="Nom de la nouvelle liste"
              className="h-9 min-w-0 flex-1 rounded-full border border-bord-doux bg-rail px-3 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-pervenche max-md:text-[16px]" />
            <button type="submit" disabled={!nom.trim() || occupe} aria-label="Créer la liste" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </span>
  );
}

/**
 * La préparation du rendez-vous (26 oct. 2026, Jules) : prête en fond au rendez-vous fixé, mise à jour la veille à 18 h.
 * Ce qu'il faut savoir avant d'entrer (la pré-estimation, interne, jamais annoncée ; les murs ; le locataire ; la rue ; le
 * signal ; les clients compatibles) et ce qu'il faut demander. Repliable, ouverte par défaut.
 */
function Preparation({ prep }) {
  const [ouverte, setOuverte] = useState(true);
  const k = kEuros;
  const pe = prep.pre_estimation;
  const lignes = [
    ["Pré-estimation", pe?.basse ? `${k(pe.basse)} à ${k(pe.haute)}` : "À faire après la visite", "interne, à ne pas annoncer"],
    ["Les murs", [prep.murs?.proprietaire, prep.murs?.forme, prep.murs?.gerant ? `gérant ${prep.murs.gerant}` : null].filter(Boolean).join(" · ") || null],
    ["Le locataire", prep.locataire],
    ["La rue", prep.rue],
    ["Le signal", prep.signal],
    ["Clients", (prep.clients || []).length ? prep.clients.join(" ; ") : null],
  ].filter(([, v]) => v);
  const maj = prep.maj_le ? new Date(prep.maj_le).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="mt-1 mb-3 rounded-[12px] border border-pervenche/40 bg-pervenche/[0.06]">
      <button type="button" onClick={() => setOuverte((o) => !o)} aria-expanded={ouverte} className="flex w-full items-center gap-2 px-4 py-3 text-left" style={{ background: "transparent" }}>
        <Sparkles className="h-3.5 w-3.5 flex-none text-pervenche" aria-hidden />
        <span className="flex-1 text-[13px] text-pervenche">Préparation du rendez-vous{maj ? <span className="text-ardoise"> · mise à jour {maj}</span> : null}</span>
        <ChevronDown className={`h-4 w-4 flex-none text-ardoise transition-transform duration-300 ${ouverte ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {ouverte && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }} className="overflow-hidden">
            {/* De petites lignes entre les rangées, pour les démarquer (26 oct. 2026, Jules). */}
            <dl className="m-0 border-t border-pervenche/20 px-4">
              {lignes.map(([mot, v, note]) => (
                <div key={mot} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-pervenche/15 py-2.5 text-[13.5px] first:border-t-0">
                  <dt className="text-ardoise">{mot}</dt>
                  <dd className="m-0 min-w-0 text-encre">{v}{note ? <span className="block text-[12px] text-ardoise">{note}</span> : null}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-pervenche/20 px-4 py-3">
              <p className="m-0 text-[12px] text-ardoise">À demander</p>
              <ul className="m-0 mt-1.5 list-none p-0">
                {(prep.a_demander || []).map((q) => <li key={q} className="flex gap-2 border-t border-pervenche/15 py-2 text-[13.5px] text-encre first:border-t-0"><span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-pervenche" />{q}</li>)}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * La fiche, la même partout (25 oct. 2026, Jules : la fiche des listes prend le style de celle de la carte) : le statut,
 * le commerce et son adresse ; « Remarque de votre assistant » (le signal, titré ainsi le 25 oct. 2026) ; un tableau à lignes (Exploitant, Murs, Gérant, Téléphone,
 * Mail, Client compatible) qui se modifie d'un clic ; le chat de Haka ; l'historique. Pas d'accroche.
 * `onFermer` : une croix en haut à droite. `media` : ce qui se pose sous la photo du commerce.
 */
// `sansChat` : la fiche sans son chat, quand il est posé ailleurs (Biens, le chat à gauche, 25 oct. 2026).
// `sansPreparation` : la Pré-visite montre déjà la préparation au centre (26 oct. 2026), la fiche ne la répète pas.
/**
 * `mode` « fonds » (3 nov. 2026, Jules) : la fiche d'un fonds de commerce, pour l'activité du mandataire. Les raisons de
 * céder, le dirigeant et son âge, les chiffres publics, le bail, le contact ; l'accroche parle de transmission, jamais
 * d'investisseur. Un exploitant qui possède aussi ses murs garde les deux : le fonds pour lui, les murs pour les clients.
 */
export default function FicheMandataire({ id, commerceId = null, onFermer = null, media = null, repli = null, sansChat = false, sansPreparation = false, sansHistorique = false, mode = "murs" }) {
  const queryClient = useQueryClient();
  // Sans `id`, l'aperçu d'un commerce qui n'a pas encore de fiche (25 oct. 2026) : la même fiche, en lecture ; elle naît
  // quand on l'ajoute à une liste (« Ajouter à ma liste »), et la même carte devient la fiche complète.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["m-fiche", id || `commerce:${commerceId}`],
    queryFn: () => base44.request("GET", id ? `${API}/${id}/fiche` : `/api/mandataire/commerces/${commerceId}/apercu`),
    enabled: !!(id || commerceId),
  });
  const f = data?.fiche;
  // La fiche réelle : celle donnée, ou celle née de l'aperçu une fois le commerce ajouté à une liste.
  const fid = id || f?.id || null;
  // Les listes de la Prospection aussi (31 oct. 2026 : après « Vu l'exploitante… », la liste restait « À contacter »).
  const rafraichir = () => {
    ["m-fiche", "m-listes", "m-proprietaires", "mandataire-proprietaires", "mandataire-jour", "m-prospecter", "m-estimations"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
    queryClient.invalidateQueries({ queryKey: ["off-market", "simple"] });
  };
  const modifier = useMutation({
    // Un numéro corrigé sur un commerce sans fiche (le mode Fonds sur le terrain, 3 nov. 2026, Jules : « bloquant ») fait
    // naître sa fiche, puis l'enregistre.
    mutationFn: async ({ champ, valeur }) => {
      let cible = fid;
      if (!cible && commerceId) cible = (await base44.request("POST", `/api/mandataire/commerces/${encodeURIComponent(commerceId)}/fiche`, { body: { type_bien: TYPE_DU_MODE[mode] || "murs_commerce" } }))?.proprietaire?.id || null;
      if (!cible) throw new Error("Pas de fiche pour ce commerce");
      return base44.request("PATCH", `${API}/${cible}`, { body: { [champ]: valeur } });
    },
    onSuccess: () => rafraichir(),
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  // Le statut se change sur sa pastille (25 oct. 2026, Jules) : À contacter, Contacté, Pas d'intérêt (relance dans six mois).
  const statut = useMutation({
    mutationFn: (k) => base44.request("POST", `${API}/${fid}/statut`, { body: k === "pas_vendeur" ? { statut: k, note: "Pas d'intérêt", rappel_dans_jours: 180 } : { statut: k } }),
    onSuccess: (_, k) => { if (k === "pas_vendeur") toast.success("Pas d'intérêt : relance dans six mois"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Ajouter le commerce à une liste fait naître sa fiche ; changer de liste la déplace. La dernière liste choisie revient.
  const listesQ = useQuery({ queryKey: ["off-market", "simple", "listes"], queryFn: () => base44.request("GET", "/api/off-market/simple/listes"), enabled: !!(f?.apercu || f?.liste !== undefined) });
  const listes = listesQ.data?.listes || [];
  const derniere = (() => { let d = null; try { d = localStorage.getItem("klocka.liste.derniere"); } catch { /* sans stockage */ } return listes.find((l) => l.id === d) || listes[0] || null; })();
  const retenir = (l) => { try { if (l?.id) localStorage.setItem("klocka.liste.derniere", l.id); } catch { /* sans stockage */ } };
  const ajouter = useMutation({
    mutationFn: (choix) => base44.request("POST", "/api/off-market/simple/listes/envoyer", { body: { ids: [commerceId], type_bien: TYPE_DU_MODE[mode] || "murs_commerce", ...choix } }),
    onSuccess: (r) => {
      if (r.refuses?.length) { toast.error(r.refuses[0]); return; }
      retenir(r.liste); toast.success(`Dans la liste « ${r.liste.nom} »`);
      queryClient.invalidateQueries({ queryKey: ["off-market", "simple", "listes"] });
      queryClient.invalidateQueries({ queryKey: ["m-prospecter", "points"] });
      rafraichir();
    },
    onError: (e) => toast.error(e?.message || "Impossible d'ajouter à la liste"),
  });
  const pause = useMutation({
    mutationFn: (enPause) => base44.request("POST", `${API}/${fid}/${enPause ? "reprendre" : "pause"}`, { body: {} }),
    onSuccess: () => rafraichir(),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const enregistrer = (champ, valeur) => modifier.mutate({ champ, valeur });
  const apercu = !!f?.apercu;
  // Dans Biens, la pastille dit l'étape où en est le bien (« Visité », « Prix d'accord »), pas « Dans Biens » (25 oct. 2026).
  const etapeBiens = f?.dans_biens && f.biens ? (f.biens.etapes || []).find((e) => e.id === f.biens.en_cours)?.mot || null : null;
  const ch = (c) => (apercu ? null : c);
  const [signauxOuverts, setSignauxOuverts] = useState(false);
  // Un message envoyé depuis la fiche (25 oct. 2026, Jules) : la conversation prend la place de la fiche, le fil et la
  // saisie en bas ; « Fiche · Conversation » revient à la fiche normale. Le chat reste monté : le fil ne se perd pas.
  const [discussion, setDiscussion] = useState(false);
  const [vue, setVue] = useState("fiche");
  // Stable : le chat la rappelle à chaque rendu ; la vue ne change qu'à l'ouverture ou à la fermeture de la conversation.
  // Une conversation reprise en rouvrant la fiche (31 oct. 2026, Jules) : la bascule revient, mais sur la fiche.
  const reprise = useRef(false);
  const surReprise = useCallback(() => { reprise.current = true; }, []);
  const surConversation = useCallback((ouverte) => {
    const repriseVue = reprise.current;
    if (ouverte) reprise.current = false;
    setDiscussion((avant) => {
      if (avant !== ouverte) setVue(ouverte && !repriseVue ? "conversation" : "fiche");
      return ouverte;
    });
  }, []);
  const enConv = discussion && vue === "conversation";
  // Collé au bas de la page (Biens), le chat se pose au-dessus de la barre d'onglets du téléphone ; dans un panneau qui
  // défile lui-même, au bas du panneau. La vue Conversation prend la hauteur du panneau qui la porte ; posée dans la
  // page, celle de l'écran.
  const racine = useRef(null);
  const [dansLaPage, setDansLaPage] = useState(false);
  const panneau = useRef(null);
  useLayoutEffect(() => {
    let e = racine.current?.parentElement;
    while (e && e !== document.body && !/(auto|scroll)/.test(getComputedStyle(e).overflowY)) e = e.parentElement;
    const page = !e || e === document.body || e.tagName === "MAIN";
    panneau.current = page ? null : e;
    setDansLaPage(page);
  }, []);
  // Un panneau dont la hauteur suit son contenu (la fiche au centre de l'écran, au téléphone) : la conversation prend
  // sa hauteur maximale, sinon le fil pousserait la saisie hors de l'écran.
  const [hauteurPanneau, setHauteurPanneau] = useState(null);
  useLayoutEffect(() => {
    const e = panneau.current;
    if (!enConv || !e) { setHauteurPanneau(null); return; }
    const c = getComputedStyle(e);
    const max = parseFloat(c.maxHeight);
    const bords = parseFloat(c.paddingTop) + parseFloat(c.paddingBottom);
    setHauteurPanneau(Math.max(320, (Number.isFinite(max) ? max : e.clientHeight) - bords));
  }, [enConv]);
  // Le chat se monte un instant après la fiche (1er nov. 2026, Jules : « c'est super long ») : ses propres lectures ne
  // passent plus devant celles de la fiche et de sa photo. Une barre de même hauteur tient sa place.
  const [chatPret, setChatPret] = useState(false);
  useEffect(() => {
    if (!f || chatPret) return undefined;
    const t = setTimeout(() => setChatPret(true), 600);
    return () => clearTimeout(t);
  }, [f, chatPret]);
  const det = f?.details || {};
  const s0 = f?.signaux?.[0] || null;
  // La date d'une annonce (BODACC) dit quand ; celle d'un registre dit seulement quand on l'a lu : on ne l'ajoute pas.
  const quand = s0?.date && /bodacc/i.test(String(s0.source || "")) ? ilYaJours(s0.date) : null;
  const signal = s0 ? String(s0.texte).replace(/\s*\([^)]*\)\s*/g, " ").trim() : null;
  const tel = f?.contact.telephone || "";
  const fonds = mode === "fonds" && f?.fonds ? f.fonds : null;
  // Un bureau (3 nov. 2026, Jules) : l'immeuble et ses occupants, le propriétaire, l'accroche du locataire qui part.
  const bureau = f?.bureau || null;
  // Le numéro de l'exploitant, cherché une fois sur Google Places quand le commerce n'en a pas (3 nov. 2026, Jules).
  const fc = f?.fonds || null;
  const numeroQ = useQuery({
    queryKey: ["m-numero-exploitant", fc?.commerce_id],
    queryFn: () => base44.request("POST", `/api/mandataire/commerces/${encodeURIComponent(fc.commerce_id)}/numero`, { body: {} }),
    enabled: !!fc?.commerce_id && !fc.telephone && !fc.telephone_cherche,
    staleTime: Infinity,
  });
  const telExploitant = fc?.telephone || numeroQ.data?.telephone || null;
  const sourceExploitant = fc?.telephone ? fc.telephone_source : numeroQ.data?.source || null;
  const client = f?.investisseurs?.[0] ? [f.investisseurs[0].reference, f.investisseurs[0].budget].filter(Boolean).join(" · ") : null;
  const murs = f ? [f.murs.proprietaire, f.murs.forme && !String(f.murs.proprietaire || "").toUpperCase().startsWith(String(f.murs.forme).toUpperCase()) ? f.murs.forme : null].filter(Boolean).join(" · ") : "";
  return (
    // Une hauteur bornée en vue Conversation : le fil défile, la saisie reste en bas, dans un panneau comme dans une page.
    <div ref={racine} className={enConv ? `flex flex-col ${dansLaPage ? "h-[calc(100dvh-12rem)] md:h-[calc(100dvh-7rem)]" : "h-full"}` : "flex min-h-full flex-col"}
      style={enConv && hauteurPanneau ? { height: hauteurPanneau } : undefined}>
      {/* L'en-tête de « Tous les commerces » : le nom en 20 px, l'activité et l'adresse en 13 px, le statut, la croix. */}
      {/* En vue Conversation, un en-tête d'une ligne (25 oct. 2026, Jules : « juste le nom, Fiche et Conversation ») : le nom,
          la bascule, la croix ; l'adresse, la liste et le statut restent dans la vue Fiche. */}
      <div className={`flex justify-between gap-3 px-5 ${enConv ? "items-center pb-2 pt-4" : "items-start pt-5"}`}>
        <div className="min-w-0">
          <h2 className={`m-0 truncate font-normal leading-[1.2] text-encre ${enConv ? "text-[17px]" : "text-[20px]"}`}>{f?.commerce || repli?.commerce || (mode === "bureaux" ? "Bureaux" : "Commerce")}</h2>
          {!enConv && <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{[TYPE_LIBELLE[f?.type_bien || (mode === "bureaux" ? "bureaux" : null)], f?.activite, f?.adresse || repli?.adresse].filter(Boolean).join(" · ")}</p>}
          {/* « Dans la liste … · changer » retiré de l'en-tête (27 oct. 2026, Jules). */}
        </div>
        <span className="flex flex-none items-center gap-1">
          {!enConv && f?.commerce_id && !f.dans_biens && <PoucesCommerce commerceId={f.commerce_id} avis={f.avis_commerce || null} onEcarte={onFermer} />}
          {enConv ? <BasculeFiche vue={vue} onVue={setVue} /> : f && !f.apercu && !f.dans_biens ? <MenuStatut f={f} onChoisir={(k) => statut.mutate(k)} occupe={statut.isPending} />
            : <span className={`rounded-full px-2.5 py-1 text-[12px] ${f?.biens?.pause ? "bg-ambre/15 text-ambre" : f?.apercu ? "bg-relief text-ardoise" : "bg-pervenche/15 text-pervenche"}`}>{f?.biens?.pause ? "En pause" : etapeBiens || f?.statut_mot || "…"}</span>}
          {onFermer && <button type="button" onClick={onFermer} aria-label="Fermer la fiche" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>}
        </span>
      </div>
      {discussion && !enConv && <div className="px-5 pt-3"><BasculeFiche vue={vue} onVue={setVue} /></div>}
      {/* Plus de photo du commerce en tête de la fiche (6 nov. 2026, Jules : « pour le chargement et une fiche épurée »). */}
      {!enConv && media}
      <div className={enConv ? "hidden" : "px-5 pb-5 pt-3"}>
        {isLoading && <Loader titre="La fiche…" />}
        {isError && <p className="m-0 mt-4 text-[13.5px] text-alerte">Cette fiche ne se charge pas.</p>}
        {f && (
          <>
            <div className={enConv ? "hidden" : ""}>
            {f.preparation && f.dans_biens && !sansPreparation && <Preparation prep={f.preparation} />}
            <div className="mt-1 rounded-[12px] bg-pervenche/10 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-pervenche"><Sparkles className="h-3.5 w-3.5 flex-none" aria-hidden />Remarque de votre assistant</p>
                {!!det.signaux?.length && <span className="-my-1 -mr-2"><Fleche ouvert={signauxOuverts} onClick={() => setSignauxOuverts((o) => !o)} quoi="les signaux" /></span>}
              </div>
              {bureau ? (<>
                <p className="m-0 mt-1.5 text-[14px] leading-[1.5] text-encre">{bureau.raisons.length ? bureau.raisons.join(" · ") : "Aucun signal connu pour ces bureaux"}</p>
                <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-craie">À dire au propriétaire : « Votre locataire part : je peux vous trouver un remplaçant. »</p>
              </>) : fonds ? (<>
                <p className="m-0 mt-1.5 text-[14px] leading-[1.5] text-encre">{fonds.raisons.length ? fonds.raisons.join(" · ") : "Aucun signal de cession connu"}</p>
              </>) : <p className="m-0 mt-1.5 text-[14px] leading-[1.5] text-encre">{signal ? `${signal}${quand && !/il y a/.test(signal) ? `, ${quand}` : ""}` : "Aucun signal connu"}</p>}
              {/* La passerelle (3 nov. 2026) : un exploitant propriétaire qui céderait son fonds, en mode Murs. */}
              {!fonds && f.fonds?.murs_aussi && f.fonds.raisons.length > 0 && <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-craie">Son fonds aussi, pour votre activité : {f.fonds.raisons.join(" · ").toLowerCase()}.</p>}
              {/* La prochaine action dans la remarque de l'assistant, plus en ligne à part (31 oct. 2026, Jules). */}
              {f.prochaine_action && <p className="m-0 mt-1.5 text-[13.5px] text-encre">Prochaine action : {f.prochaine_action}{f.prochaine_action_le ? ` · ${dateFr(f.prochaine_action_le)}` : ""}</p>}
              <Detail ouvert={signauxOuverts} lignes={det.signaux || []} className="[&>div]:px-0 [&>div]:pb-0 [&>div]:pt-2" />
            </div>
            {/* Une seule fiche partout (3 nov. 2026, Jules : « dans les listes, les mêmes champs que dans la prospection »), dans
                l'ordre de la maquette du fonds : l'exploitant, son dirigeant, ses chiffres, le bail, la licence, le contact, puis
                les murs. Le mode Fonds ne change que la remarque de l'assistant et deux libellés. Deux colonnes égales, un trait
                entre les rangées (25 oct. 2026). Le téléphone et le mail se corrigent même sans fiche : elle naît alors. */}
            <dl className="m-0 mt-3 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
              {bureau && (<>
                {/* Un bureau : l'immeuble et ses occupants à la place de l'exploitant et du fonds (3 nov. 2026, Jules). */}
                <Rangee mot="Immeuble" valeur={bureau.adresse || ""} affiche={bureau.adresse || <span className="text-brume">Adresse inconnue</span>} />
                <Rangee mot={`Occupants (${bureau.occupants.length})`} valeur="" detail={bureau.occupants.slice(5).map((o) => [o.nom, o.activite, o.effectif ? `effectif ${o.effectif}` : null, o.parti ? `parti en ${o.parti}` : o.depuis ? `depuis ${o.depuis}` : null].filter(Boolean).join(" · "))}
                  affiche={<span className="block text-left">{bureau.occupants.slice(0, 5).map((o) => <span key={o.id || o.nom} className="block">{[o.nom, o.parti ? `parti en ${o.parti}` : o.depuis ? `depuis ${o.depuis}` : null].filter(Boolean).join(" · ")}</span>)}{bureau.occupants.length > 5 ? <span className="block text-ardoise">et {bureau.occupants.length - 5} autres</span> : null}</span>} />
                <Rangee mot="Valeur locative" valeur="" affiche={<span className="text-brume">Inconnue</span>} />
              </>)}
              {!bureau && (<>
              <Rangee mot={fonds ? "Exploitant (vendeur du fonds)" : "Exploitant"} champ={ch("exploitant")} valeur={f.exploitant.nom} onEnregistrer={enregistrer} detail={det.exploitant || []}
                affiche={[f.exploitant.nom, f.fonds?.forme, (f.fonds?.depuis || f.exploitant.depuis) ? `depuis ${f.fonds?.depuis || f.exploitant.depuis}` : null].filter(Boolean).join(" · ")} />
              <Rangee mot="Dirigeant" valeur={f.fonds?.dirigeant?.nom || ""} affiche={f.fonds?.dirigeant ? [f.fonds.dirigeant.nom, f.fonds.dirigeant.age].filter(Boolean).join(", ") : <span className="text-brume">Inconnu</span>} />
              <Rangee mot="Chiffres" valeur={f.fonds?.chiffres || ""} affiche={f.fonds?.chiffres || <span className="text-brume">Comptes non publiés</span>} />
              <Rangee mot="Bail" valeur={f.fonds?.bail || ""} affiche={f.fonds?.bail || <span className="text-brume">Inconnu</span>} />
              <Rangee mot="Licence" valeur={f.fonds?.licence || ""} affiche={f.fonds?.licence || <span className="text-brume">Inconnue</span>} />
              </>)}
              {/* Deux numéros (3 nov. 2026, Jules) : celui de la fiche, que le mandataire corrige, et celui de l'exploitant (le
                  commerce, Google Places), trouvé seul. */}
              <Rangee mot="Téléphone" champ="telephone" type="tel" valeur={tel} onEnregistrer={enregistrer} detail={det.telephone || []}
                affiche={tel ? <span><a href={`tel:${tel.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-encre hover:text-pervenche">{tel}</a>{f.contact.telephone_source ? <span className="text-ardoise"> ({f.contact.telephone_source}{f.contact.a_confirmer?.telephone ? ", à confirmer" : ""})</span> : null}</span> : null} />
              {fc && <Rangee mot="Tél. de l'exploitant" valeur={telExploitant || ""}
                affiche={telExploitant ? <span><a href={`tel:${telExploitant.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-encre hover:text-pervenche">{telExploitant}</a>{sourceExploitant ? <span className="text-ardoise"> ({sourceExploitant})</span> : null}</span>
                  : numeroQ.isFetching ? <span className="text-ardoise">Recherche…</span> : <span className="text-brume">Introuvable</span>} />}
              <Rangee mot="Mail" champ="email" type="email" valeur={f.contact.email || ""} onEnregistrer={enregistrer}
                affiche={f.contact.email ? <span>{f.contact.email}{f.contact.a_confirmer?.email ? <span className="text-ardoise"> (à confirmer)</span> : null}</span> : null} />
              {/* Les murs : leur propriétaire, sa forme, son gérant ; en mode Fonds, un signal des murs dit qu'ils intéressent
                  aussi les clients Klocka, la seule passerelle entre les deux modes. */}
              <Rangee mot="Murs" champ={ch("murs")} valeur={murs} onEnregistrer={enregistrer} detail={[...(det.murs || []), ...(det.gerant || []).map((x) => `Gérant : ${x}`)]}
                affiche={murs ? <span>{[murs, f.murs.gerant ? `gérant ${f.murs.gerant.age ? `de ${f.murs.gerant.age}` : f.murs.gerant.nom}` : null].filter(Boolean).join(" · ")}{fonds && (f.signaux?.length || fonds.murs_aussi) ? <span className="text-pervenche"> · aussi intéressant pour les clients Klocka</span> : null}</span> : null} />
              {client && <Rangee mot="Client compatible" valeur={client} detail={(f.investisseurs || []).map((x) => [x.reference, x.budget, x.pourquoi].filter(Boolean).join(" · "))} />}
            </dl>
            {/* Les parties libres que Haka ajoute à la fiche (26 oct. 2026, Jules : « rajouter une partie et tout ») : un titre, un texte. */}
            {(f.sections || []).map((x) => (
              <div key={x.titre} className="mt-3 rounded-[12px] border border-bord-doux bg-surface/40 px-4 py-3">
                <p className="m-0 text-[13px] text-ardoise">{x.titre}</p>
                {x.texte && <p className="m-0 mt-1 whitespace-pre-line text-[14px] leading-[1.5] text-encre">{x.texte}</p>}
              </div>
            ))}
            </div>
            <div className={enConv ? "hidden" : ""}>
            {!apercu && (<>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {/* « Pas d'intérêt » se choisit sur la pastille du statut (25 oct. 2026). */}
              {f.dans_biens && (
                <button type="button" onClick={() => pause.mutate(!!f.biens?.pause)} disabled={pause.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                  {f.biens?.pause ? <><Play className="h-3.5 w-3.5" /> Reprendre</> : <><Pause className="h-3.5 w-3.5" /> Mettre en pause</>}
                </button>
              )}
            </div>
            {f.biens?.pause && <p className="m-0 mt-2 text-[13px] text-ambre">Relance le {dateFr(f.biens.pause.relance_le)}</p>}
            </>)}
            {/* `sansHistorique` : le Suivi du bien montre déjà tout l'historique (27 oct. 2026). */}
            {!apercu && !sansHistorique && (<>
            <p className="m-0 mt-6 border-b border-trait pb-2 text-[11px] uppercase tracking-[.16em] text-brume">Historique</p>
            {f.historique.length ? f.historique.slice(0, 12).map((h, i) => (
              <div key={`${h.le}-${i}`} className="flex gap-6 py-2 text-[13.5px]">
                <span className="w-12 flex-none tabular-nums text-ardoise">{jourMois(h.le)}</span>
                <span className="min-w-0 text-encre">{h.texte}</span>
              </div>
            )) : <p className="m-0 py-2.5 text-[13.5px] text-brume">Rien encore.</p>}
            </>)}
            </div>
          </>
        )}
      </div>
      {/* Le chat de Haka (24 oct. 2026, Jules), en bas de la fiche, collé au bas du panneau pendant que la fiche défile
          (25 oct. 2026) ; un message envoyé ouvre la vue Conversation, où il prend toute la place. */}
      {f && !apercu && !sansChat && (
        <div className={enConv ? "flex min-h-0 flex-1 flex-col px-5 pt-1" : discussion ? "hidden" : `sticky bottom-0 z-10 mt-auto border-t border-trait bg-rail px-5 pb-4 pt-4 ${dansLaPage ? "max-md:bottom-[var(--k-bas-mobile,0px)]" : ""}`}>
          {chatPret ? <ChatFiche id={fid} onReponse={rafraichir} onConversation={surConversation} onReprise={surReprise} plein={enConv} />
            : <button type="button" onClick={() => setChatPret(true)} className="flex h-12 w-full items-center rounded-full border border-bord-doux bg-surface px-5 text-left text-[14px] text-brume">Parler à l&apos;assistant…</button>}
        </div>
      )}
      {/* Pas encore de fiche : un seul geste, ajouter le commerce à sa liste (25 oct. 2026, Jules). Collé en bas du panneau,
          pleine largeur ; la fiche défile au-dessus. Le chevron choisit une autre liste ou en crée une. */}
      {f?.apercu && (
        <div className="sticky bottom-0 mt-auto flex gap-2 border-t border-trait bg-rail px-5 py-3">
          <button type="button" onClick={() => (derniere ? ajouter.mutate({ liste_id: derniere.id }) : null)} disabled={ajouter.isPending || !derniere}
            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
            {ajouter.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="truncate">{derniere ? `Ajouter à ma liste « ${derniere.nom} »` : listesQ.isLoading ? "Vos listes…" : "Ajouter à une nouvelle liste"}</span>
          </button>
          <ChoixListe listes={listes} onChoisir={(c) => ajouter.mutate(c)} occupe={ajouter.isPending} versLeHaut
            declencheur={(ouvrir) => <button type="button" onClick={ouvrir} aria-label="Choisir une autre liste" title="Choisir une autre liste" className="grid h-11 w-11 flex-none place-items-center rounded-full border border-bord-doux bg-rail text-craie hover:text-encre"><ChevronDown className="h-4 w-4" /></button>} />
        </div>
      )}
    </div>
  );
}
