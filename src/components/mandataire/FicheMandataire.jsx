import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, Loader2, Sparkles, Mic, Pause, Pencil, Play, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { toast } from "@/components/ui/avis";

// La fiche du mandataire sur une page (24 oct. 2026, Jules) : le commerce et
// l'exploitant ; le propriétaire des murs (SCI, gérant, âge) ; les signaux,
// leur source et leur date ; le contact et sa source ; les recherches clients
// compatibles ; le statut, la prochaine action et l'historique. Elle avance
// par la dictée : Haka dit ce qu'il a compris, le mandataire confirme ou
// corrige, la fiche se met à jour (server/fiche-mandataire.js).

const API = "/api/mandataire/proprietaires";
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const CHAMPS = { telephone: "Téléphone", email: "Mail", nom: "Nom", remarque: "Remarque" };
const ISSUES_PROSPECTION = [["", "Rien ne change"], ["contacte", "Contacté"], ["rdv", "Rendez-vous fixé (passe dans Biens)"], ["pas_interet", "Pas d'intérêt (relance dans six mois)"]];
const ISSUES_BIENS = [["", "Rien ne change"], ["visite", "Visité"], ["prix_accord", "Prix d'accord"], ["pause", "En pause (refuse le prix)"]];

/** L'enregistrement au micro, pour dicter : démarrer, arrêter, et le son part à Haka. */
function useMicro(onSon) {
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
    onError: (e) => toast.error(e?.message || "Haka n'a pas pu le lire"),
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
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && texte.trim() && !lire.isPending) { e.preventDefault(); lire.mutate(null); } }}
              className="max-h-[140px] min-h-[36px] w-full resize-none border-none bg-transparent py-1.5 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            <button type="button" onClick={micro.enCours ? micro.arreter : micro.demarrer} disabled={lire.isPending} aria-label={micro.enCours ? "Arrêter la dictée" : "Dicter"} title={micro.enCours ? "Arrêter" : "Dicter"}
              className={`grid h-9 w-9 flex-none place-items-center rounded-full ${micro.enCours ? "text-alerte" : "text-craie hover:text-encre"}`} style={{ background: "transparent" }}>
              {micro.enCours ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => lire.mutate(null)} disabled={!texte.trim() || lire.isPending} aria-label="Envoyer" title="Envoyer"
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              {lire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
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
 * Parler à l'assistant depuis une fiche (24 oct. 2026, Jules : « le chat comme dans le dashboard Haka ») : le chat de
 * Haka du mandataire, qui sait quelle fiche est ouverte ; chaque réponse relit la fiche (statut, historique, tâches).
 */
export function ChatFiche({ id, onReponse = null }) {
  return (
    <ChatDashboard espace="mandataire" proprietaireId={id} compact sansSkills epure libelleAccueil="Haka" menusVersLeHaut
      contour="border-[rgb(var(--k-pervenche-rgb))]" placeholderAccueil="Parler à l'assistant…" onReponse={onReponse} />
  );
}

const ilYaJours = (iso) => { const j = Math.floor((Date.now() - Date.parse(iso || 0)) / 86400000); return Number.isFinite(j) && j >= 0 ? (j === 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`) : null; };
const jourMois = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");
const TRAIT = "border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)]";

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
  return (
    <div className={`border-b ${TRAIT} last:border-b-0`}>
      <div className="grid grid-cols-[130px_minmax(0,1fr)] max-md:grid-cols-[104px_minmax(0,1fr)]">
        <dt className={`border-r ${TRAIT} px-3 py-2.5 text-ardoise`}>{mot}</dt>
        <dd className="m-0 flex min-w-0 items-center text-encre">
          {edition ? (
            <input autoFocus type={type} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={finir} aria-label={mot}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setTexte(valeur || ""); setEdition(false); } }}
              className="h-full w-full border-none bg-pervenche/[0.08] px-3 py-2.5 text-inherit text-encre outline-none max-md:text-[16px]" />
          ) : champ ? (
            <div role="button" tabIndex={0} onClick={() => setEdition(true)} onKeyDown={(e) => { if (e.key === "Enter") setEdition(true); }} title="Modifier"
              className="group flex min-h-full min-w-0 flex-1 cursor-text items-center gap-2 px-3 py-2.5 hover:bg-relief/40">
              <span className="min-w-0 flex-1 break-words">{valeur ? (affiche || valeur) : <span className="text-brume">À compléter</span>}</span>
              <Pencil className="h-3.5 w-3.5 flex-none text-brume opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          ) : <div className="min-w-0 flex-1 px-3 py-2.5">{affiche || valeur}</div>}
          {fleche && <span className="pr-1.5">{fleche}</span>}
        </dd>
      </div>
      <Detail ouvert={ouvert} lignes={detail} className={`border-t ${TRAIT} [&>div]:pl-[142px] max-md:[&>div]:pl-[116px] [&>div]:pt-2.5`} />
    </div>
  );
}

/**
 * La fiche, la même partout (25 oct. 2026, Jules : la fiche des listes prend le style de celle de la carte) : le statut,
 * le commerce et son adresse ; « Remarque de votre assistant » (le signal, titré ainsi le 25 oct. 2026) ; un tableau à lignes (Exploitant, Murs, Gérant, Téléphone,
 * Mail, Client compatible) qui se modifie d'un clic ; le chat de Haka ; l'historique. Pas d'accroche.
 * `onFermer` : une croix en haut à droite. `media` : ce qui se pose sous l'adresse (la vitrine dans Street View).
 */
export default function FicheMandataire({ id, onFermer = null, media = null, repli = null }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-fiche", id], queryFn: () => base44.request("GET", `${API}/${id}/fiche`), enabled: !!id });
  const rafraichir = () => ["m-fiche", "m-listes", "m-proprietaires", "m-prospecter", "m-estimations"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const modifier = useMutation({
    mutationFn: ({ champ, valeur }) => base44.request("PATCH", `${API}/${id}`, { body: { [champ]: valeur } }),
    onSuccess: () => rafraichir(),
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  const pasInteret = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/statut`, { body: { statut: "pas_vendeur", note: "Pas d'intérêt", rappel_dans_jours: 180 } }),
    onSuccess: () => { toast.success("Pas d'intérêt : relance dans six mois"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const pause = useMutation({
    mutationFn: (enPause) => base44.request("POST", `${API}/${id}/${enPause ? "reprendre" : "pause"}`, { body: {} }),
    onSuccess: () => rafraichir(),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const f = data?.fiche;
  const enregistrer = (champ, valeur) => modifier.mutate({ champ, valeur });
  const [signauxOuverts, setSignauxOuverts] = useState(false);
  const det = f?.details || {};
  const s0 = f?.signaux?.[0] || null;
  // La date d'une annonce (BODACC) dit quand ; celle d'un registre dit seulement quand on l'a lu : on ne l'ajoute pas.
  const quand = s0?.date && /bodacc/i.test(String(s0.source || "")) ? ilYaJours(s0.date) : null;
  const signal = s0 ? String(s0.texte).replace(/\s*\([^)]*\)\s*/g, " ").trim() : null;
  const tel = f?.contact.telephone || "";
  const client = f?.investisseurs?.[0] ? [f.investisseurs[0].reference, f.investisseurs[0].budget].filter(Boolean).join(" · ") : null;
  const murs = f ? [f.murs.proprietaire, f.murs.forme && !String(f.murs.proprietaire || "").toUpperCase().startsWith(String(f.murs.forme).toUpperCase()) ? f.murs.forme : null].filter(Boolean).join(" · ") : "";
  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-2 px-6 pt-6 max-md:px-5 max-md:pt-5">
        <span className={`rounded-full px-3 py-1 text-[13px] ${f?.biens?.pause ? "bg-ambre/15 text-ambre" : "bg-pervenche/15 text-pervenche"}`}>{f?.biens?.pause ? "En pause" : f?.statut_mot || "…"}</span>
        {onFermer && <button type="button" onClick={onFermer} aria-label="Fermer la fiche" title="Fermer" className="-mr-2 -mt-1 grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>}
      </div>
      <div className="px-6 max-md:px-5">
        <p className="m-0 mt-3 text-[24px] font-medium leading-[1.2] text-encre">{f?.commerce || repli?.commerce || "Commerce"}</p>
        <p className="m-0 mt-1 text-[15px] text-ardoise">{f?.adresse || repli?.adresse}</p>
      </div>
      {media}
      <div className="px-6 pb-6 max-md:px-5 max-md:pb-5">
        {isLoading && <p className="m-0 mt-4 inline-flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin text-menthe" /> La fiche…</p>}
        {isError && <p className="m-0 mt-4 text-[13.5px] text-alerte">Cette fiche ne se charge pas.</p>}
        {f && (
          <>
            <div className="mt-4 rounded-[12px] bg-pervenche/10 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-pervenche"><Sparkles className="h-3.5 w-3.5 flex-none" aria-hidden />Remarque de votre assistant</p>
                {!!det.signaux?.length && <span className="-my-1 -mr-2"><Fleche ouvert={signauxOuverts} onClick={() => setSignauxOuverts((o) => !o)} quoi="les signaux" /></span>}
              </div>
              <p className="m-0 mt-1.5 text-[16px] font-medium leading-[1.4] text-encre">{signal ? `${signal}${quand && !/il y a/.test(signal) ? `, ${quand}` : ""}` : "Aucun signal connu"}</p>
              <Detail ouvert={signauxOuverts} lignes={det.signaux || []} className="[&>div]:px-0 [&>div]:pb-0 [&>div]:pt-2" />
            </div>
            {f.prochaine_action && <p className="m-0 mt-3 text-[13.5px] text-pervenche">Prochaine action : {f.prochaine_action}{f.prochaine_action_le ? ` · ${dateFr(f.prochaine_action_le)}` : ""}</p>}
            {/* Un tableau à lignes, comme celui des listes (24 oct. 2026, Jules) : un trait sous chaque rangée, un autre entre les deux colonnes. */}
            <dl className="m-0 mt-4 overflow-hidden rounded-[12px] border border-[color-mix(in_srgb,var(--k-bord-doux)_60%,transparent)] text-[15px] max-md:text-[14px]">
              <Rangee mot="Exploitant" champ="exploitant" valeur={f.exploitant.nom} onEnregistrer={enregistrer} detail={det.exploitant || []}
                affiche={[f.exploitant.nom, f.exploitant.depuis ? `depuis ${f.exploitant.depuis}` : null].filter(Boolean).join(" · ")} />
              <Rangee mot="Murs" champ="murs" valeur={murs} onEnregistrer={enregistrer} detail={det.murs || []} />
              <Rangee mot="Gérant" champ="gerant" valeur={f.murs.gerant?.nom || ""} onEnregistrer={enregistrer} detail={(det.gerant || []).length > 1 ? det.gerant : []}
                affiche={f.murs.gerant ? [f.murs.gerant.nom, f.murs.gerant.age].filter(Boolean).join(", ") : null} />
              <Rangee mot="Téléphone" champ="telephone" type="tel" valeur={tel} onEnregistrer={enregistrer} detail={det.telephone || []}
                affiche={tel ? <span><a href={`tel:${tel.replace(/[^\d+]/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-encre hover:text-pervenche">{tel}</a>{f.contact.telephone_source ? <span className="text-ardoise"> ({f.contact.telephone_source}{f.contact.a_confirmer?.telephone ? ", à confirmer" : ""})</span> : null}</span> : null} />
              <Rangee mot="Mail" champ="email" type="email" valeur={f.contact.email || ""} onEnregistrer={enregistrer}
                affiche={f.contact.email ? <span>{f.contact.email}{f.contact.a_confirmer?.email ? <span className="text-ardoise"> (à confirmer)</span> : null}</span> : null} />
              {client && <Rangee mot="Client compatible" valeur={client} detail={(f.investisseurs || []).map((x) => [x.reference, x.budget, x.pourquoi].filter(Boolean).join(" · "))} />}
            </dl>
            {/* Le chat de Haka, directement, sans bouton (24 oct. 2026, Jules). */}
            <div className="mt-5"><ChatFiche id={id} onReponse={rafraichir} /></div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {!f.dans_biens && f.statut !== "pas_vendeur" && (
                <button type="button" onClick={() => pasInteret.mutate()} disabled={pasInteret.isPending} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Pas d'intérêt</button>
              )}
              {f.dans_biens && (
                <button type="button" onClick={() => pause.mutate(!!f.biens?.pause)} disabled={pause.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>
                  {f.biens?.pause ? <><Play className="h-3.5 w-3.5" /> Reprendre</> : <><Pause className="h-3.5 w-3.5" /> Mettre en pause</>}
                </button>
              )}
            </div>
            {f.biens?.pause && <p className="m-0 mt-2 text-[13px] text-ambre">Relance le {dateFr(f.biens.pause.relance_le)}</p>}
            <p className="m-0 mt-6 border-b border-trait pb-2 text-[12px] uppercase tracking-[.2em] text-ardoise">Historique</p>
            {f.historique.length ? f.historique.slice(0, 12).map((h, i) => (
              <div key={`${h.le}-${i}`} className="flex gap-6 py-2.5 text-[14px]">
                <span className="w-12 flex-none tabular-nums text-ardoise">{jourMois(h.le)}</span>
                <span className="min-w-0 text-encre">{h.texte}</span>
              </div>
            )) : <p className="m-0 py-2.5 text-[13.5px] text-brume">Rien encore.</p>}
          </>
        )}
      </div>
    </div>
  );
}
