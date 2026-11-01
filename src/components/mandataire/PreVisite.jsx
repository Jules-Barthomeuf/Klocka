import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, MapPin, Navigation, PanelRightClose, PanelRightOpen, Phone, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { useReglagesChatMandataire } from "@/components/mandataire/ReglagesChatMandataire";

// La Pré-visite refaite (26 oct. 2026, spécification de Jules) : la préparation est le contenu de la page, le chat une
// aide. Sur ordinateur, la préparation au centre, la fiche du bien à droite (repliable), Haka dans un panneau qui
// s'ouvre ; en tête, le fil d'Ariane, « Raconter la visite » et les autres issues (les étapes restent dans le menu de
// droite, jamais en haut). Au téléphone, la mise en page ne change pas (MandataireBiens) : seul le contenu de la
// préparation, sous « Voir la fiche », est celui-ci. Pas de bouton de visite : à la fin du rendez-vous, un vocal à Haka
// suffit ; il lance l'avis de valeur et le bien passe à l'étape suivante.
// Chaque information dit sa source ; ce qui est déduit porte « à confirmer ». Se lit en trois minutes : la
// pré-estimation, les clients et les objections sont repliés sur une ligne.

const API = "/api/mandataire/proprietaires";
const CHAT = "/api/mandataire";
const k = (n) => (n == null ? null : n >= 1e6 ? `${(n / 1e6).toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} M€` : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`);
const quandLong = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null);
const versChampDate = (iso) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** La source d'une information, en petit, et « à confirmer » quand elle est déduite. */
function Source({ source, aConfirmer = false }) {
  if (!source && !aConfirmer) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1.5 align-baseline">
      {source && <span className="text-[12.5px] text-brume">{source}</span>}
      {aConfirmer && <span className="rounded-full border border-ambre/40 px-2 py-px text-[11px] text-ambre">à confirmer</span>}
    </span>
  );
}

/** Un bloc de la préparation : son titre, son contenu ; replié, il tient sur une ligne et s'ouvre au tap. */
function Bloc({ n, titre, resume = null, repliable = false, children }) {
  const [ouvert, setOuvert] = useState(!repliable);
  const tete = (
    <span className="flex min-w-0 flex-1 items-baseline gap-3">
      <span className="flex-none text-[12.5px] tabular-nums text-brume">{String(n).padStart(2, "0")}</span>
      <span className="text-[16px] text-encre">{titre}</span>
      {repliable && !ouvert && resume && <span className="min-w-0 truncate text-[13.5px] text-ardoise">{resume}</span>}
    </span>
  );
  return (
    <section className="border-t border-trait py-5 first:border-t-0">
      {repliable ? (
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="flex w-full items-center gap-3 text-left" style={{ background: "transparent" }}>
          {tete}
          <ChevronDown className={`h-4 w-4 flex-none text-ardoise transition-transform duration-300 ${ouvert ? "rotate-180" : ""}`} />
        </button>
      ) : <div className="flex items-center">{tete}</div>}
      <AnimatePresence initial={false}>
        {ouvert && (
          <motion.div initial={repliable ? { height: 0, opacity: 0 } : false} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }} className="overflow-hidden">
            <div className="pl-8 pt-3 text-[14.5px] leading-[1.6] text-craie max-md:pl-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

const Ligne = ({ mot, children }) => (
  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 py-1 max-md:grid-cols-1 max-md:gap-0.5">
    <span className="text-[13.5px] text-ardoise">{mot}</span>
    <span className="min-w-0 text-encre">{children}</span>
  </div>
);

const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null);

/**
 * La préparation de la visite (31 oct. 2026, Jules) : trois parties, rien d'autre. Le rendez-vous (la date, l'heure et
 * l'adresse) ; le résumé des échanges ; puis, sans titre, les questions à poser et les documents à demander, ceux de la
 * classe d'actif (server/preparation-rdv.js). `p` : la fiche (absente pour la préparation allégée).
 */
export function Preparation({ prep, p = null, onDecaler = null }) {
  const queryClient = useQueryClient();
  const [recus, setRecus] = useState(prep.documents_recus || []);
  useEffect(() => { setRecus(prep.documents_recus || []); }, [prep.documents_recus]);
  const cocher = useMutation({
    mutationFn: (liste) => base44.request("POST", `${API}/${p.id}/preparation/documents`, { body: { recus: liste } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["m-fiche", p?.id] }),
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  const basculer = (d) => { const l = recus.includes(d) ? recus.filter((x) => x !== d) : [...recus, d]; setRecus(l); if (p) cocher.mutate(l); };
  const r = prep.rdv;
  const echanges = prep.echanges || [];
  const questions = prep.questions?.indispensables || [];
  const itineraire = r?.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.adresse)}` : null;
  const section = "border-t border-trait py-5 first:border-t-0";

  return (
    <div>
      {r && (
        <section className={section}>
          {/* La date seule ; un tap la décale (le bouton « Décaler » est retiré, 31 oct. 2026). */}
          {onDecaler
            ? <button type="button" onClick={onDecaler} title="Décaler le rendez-vous" className="m-0 p-0 text-left text-[18px] text-encre first-letter:uppercase hover:text-pervenche" style={{ background: "transparent" }}>{quandLong(r.le)}</button>
            : <p className="m-0 text-[18px] text-encre first-letter:uppercase">{quandLong(r.le)}</p>}
          {r.adresse && (
            <a href={itineraire} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1.5 text-[14.5px] text-craie hover:text-encre">
              <MapPin className="mt-[5px] h-3.5 w-3.5 flex-none text-ardoise" />{r.adresse}
            </a>
          )}
        </section>
      )}
      <section className={section}>
        <p className="m-0 text-[13px] text-ardoise">Résumé des échanges</p>
        {echanges.length ? (
          <ul className="m-0 mt-2 list-none p-0">
            {echanges.map((x, i) => (
              <li key={`${x.le}-${i}`} className="flex gap-3 py-1 text-[14.5px] leading-[1.55]">
                <span className="w-[52px] flex-none text-[12.5px] tabular-nums text-brume">{jourCourt(x.le)}</span>
                <span className="min-w-0 text-encre">{x.texte}<span className="ml-1.5 text-[12.5px] text-brume">{x.source}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 mt-2 text-[14.5px] text-brume">Aucun échange noté pour l'instant.</p>}
      </section>
      {(questions.length > 0 || prep.documents?.length > 0) && (
        <section className={section}>
          <ul className="m-0 list-none p-0">
            {questions.map((x) => <li key={x} className="flex gap-3 py-1.5 text-[14.5px] leading-[1.55] text-encre"><span className="mt-[10px] h-1 w-1 flex-none rounded-full bg-ardoise" />{x}</li>)}
          </ul>
          {prep.documents?.length > 0 && (
            <ul className="m-0 mt-4 list-none p-0">
              {prep.documents.map((d) => {
                const fait = recus.includes(d);
                return (
                  <li key={d}>
                    <button type="button" onClick={() => basculer(d)} disabled={!p} aria-pressed={fait} className="flex w-full items-start gap-3 py-1.5 text-left text-[14.5px] leading-[1.55] disabled:cursor-default" style={{ background: "transparent" }}>
                      <span className={`mt-[2px] grid h-5 w-5 flex-none place-items-center rounded-[6px] border ${fait ? "border-pervenche bg-pervenche text-fond" : "border-bord-doux"}`}>{fait && <Check className="h-3.5 w-3.5" />}</span>
                      <span className={fait ? "text-ardoise line-through" : "text-encre"}>{d}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * Le compte rendu de visite (27 oct. 2026) : ce que l'assistant a structuré du récit, interne. Les écarts avec ce qu'on
 * savait montrent les deux valeurs ; les questions de la préparation restées sans réponse sont signalées.
 */
export function CompteRendu({ cr, onEstimation = null }) {
  const b = cr.bien || {}; const pr = cr.proprietaire || {}; const lo = cr.locataire || {}; const e = cr.etat || {}; const d = cr.documents || {};
  const sans = (cr.questions || []).filter((x) => !x.repondue);
  const lignes = [
    ["Loyer", b.loyer_annuel ? `${k(b.loyer_annuel)} par an` : null],
    ["Charges et taxe", [b.charges, b.taxe_fonciere, b.refacturees === true ? "refacturées" : b.refacturees === false ? "non refacturées" : null].filter(Boolean).join(" · ") || null],
    ["Bail", [b.bail_date ? `signé ${b.bail_date}` : null, b.fin_bail ? `fin ${b.fin_bail}` : null].filter(Boolean).join(" · ") || null],
    ["Surface", b.surface ? `${b.surface} m²` : null],
    ["Travaux", b.travaux],
    ["État", [e.local, e.passage, e.voisinage].filter(Boolean).join(" · ") || null],
    ["Le propriétaire", [pr.prix ? `pense à ${k(pr.prix)}` : null, pr.delai, pr.intentions, pr.decideur ? `décide : ${pr.decideur}` : null].filter(Boolean).join(" · ") || null],
    ["Le locataire", [lo.intentions, lo.solidite].filter(Boolean).join(" · ") || null],
    ["Documents", [d.remis?.length ? `remis : ${d.remis.join(", ")}` : null, d.promis?.length ? `promis : ${d.promis.join(", ")}` : null].filter(Boolean).join(" · ") || null],
  ].filter(([, v]) => v);
  return (
    <section className="mb-2 mt-3 rounded-[14px] border border-pervenche/40 bg-pervenche/[0.06] px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[16px] text-encre"><Sparkles className="h-4 w-4 self-center text-pervenche" />Compte rendu de visite<span className="text-[12.5px] text-brume">interne · {new Date(cr.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p>
        {onEstimation && pr.vendeur !== false && <button type="button" onClick={onEstimation} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-menthe/50 px-4 text-[13.5px] text-menthe hover:bg-menthe/10" style={{ background: "transparent" }}>Passer à l'estimation</button>}
      </div>
      <div className="mt-2 text-[14.5px]">{lignes.map(([mot, v]) => <Ligne key={mot} mot={mot}>{v}<Source source="visite" /></Ligne>)}</div>
      {cr.ecarts?.length > 0 && (
        <div className="mt-3">
          <p className="m-0 text-[12.5px] text-ambre">Différent de ce qu'on savait</p>
          {cr.ecarts.map((x) => <p key={x.champ} className="m-0 py-0.5 text-[14px] text-encre">{x.dit} <span className="text-ardoise">au lieu de {x.connu}</span></p>)}
        </div>
      )}
      {(cr.a_confirmer || []).length > 0 && <p className="m-0 mt-3 text-[14px]"><span className="text-ambre">À confirmer : </span>{cr.a_confirmer.join(" ; ")}</p>}
      {sans.length > 0 && (
        <div className="mt-3">
          <p className="m-0 text-[12.5px] text-ardoise">Questions restées sans réponse</p>
          <ul className="m-0 mt-1 list-none p-0">{sans.map((x) => <li key={x.question} className="flex gap-2 py-0.5 text-[14px] text-craie"><span className="mt-[8px] h-1.5 w-1.5 flex-none rounded-full bg-ambre" />{x.question}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

/** Une fenêtre centrée, celle de l'application (14 px, ombre douce). */
function Fenetre({ titre, onFermer, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/60 px-4 backdrop-blur-sm" onClick={onFermer}>
      <div role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[14px] border border-trait bg-surface-pleine p-5 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="m-0 text-[16px] text-encre">{titre}</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Les sorties de l'étape autres que la visite : décaler, annuler, pas vendeur. */
function Sortie({ quoi, p, prep, onFermer, onPerdu }) {
  const queryClient = useQueryClient();
  const [quand, setQuand] = useState(() => versChampDate(prep?.rdv?.le));
  const [motif, setMotif] = useState("");
  const rafraichir = () => ["m-fiche", "m-proprietaires"].forEach((x) => queryClient.invalidateQueries({ queryKey: [x] }));
  const agir = useMutation({
    mutationFn: () => (quoi === "decaler" ? base44.request("POST", `${API}/${p.id}/rdv/decaler`, { body: { quand } })
      : quoi === "annuler" ? base44.request("POST", `${API}/${p.id}/rdv/annuler`, { body: { motif: motif || null } })
      : base44.request("POST", `${API}/${p.id}/statut`, { body: { statut: "pas_vendeur", note: `Pas vendeur : ${motif}` } })),
    onSuccess: () => {
      rafraichir();
      toast.success(quoi === "decaler" ? "Rendez-vous décalé, la préparation est à jour" : quoi === "annuler" ? "Rendez-vous annulé : le bien est en pause, avec une relance" : "Noté : pas vendeur");
      onFermer();
      if (quoi === "pas_vendeur") onPerdu?.();
    },
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  const titre = { decaler: "Décaler le rendez-vous", annuler: "Rendez-vous annulé", pas_vendeur: "Il n'est pas vendeur" }[quoi];
  const champ = "w-full rounded-champ border border-trait bg-surface px-3.5 py-2.5 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
  const pret = quoi === "decaler" ? !!quand : quoi === "pas_vendeur" ? motif.trim().length > 2 : true;
  return (
    <Fenetre titre={titre} onFermer={onFermer}>
      {quoi === "decaler" && <input type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} className={champ} aria-label="Nouvelle date et heure" />}
      {quoi === "annuler" && <p className="m-0 mb-3 text-[13.5px] text-ardoise">Le bien passe en pause, avec une relance dans un mois.</p>}
      {quoi !== "decaler" && <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} placeholder={quoi === "pas_vendeur" ? "Le motif (obligatoire)" : "Pourquoi (facultatif)"} className={champ} />}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onFermer} className="h-9 rounded-full px-4 text-[13.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
        <button type="button" onClick={() => agir.mutate()} disabled={!pret || agir.isPending} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
          {agir.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{quoi === "decaler" ? "Décaler" : quoi === "annuler" ? "Mettre en pause" : "Noter"}
        </button>
      </div>
    </Fenetre>
  );
}

/** La préparation d'une fiche, chargée et refaite au besoin (une absente ou d'avant le 26 oct. se refait une fois). */
function usePreparation(p) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-fiche", p?.id], queryFn: () => base44.request("GET", `${API}/${p.id}/fiche`), enabled: !!p?.id });
  const f = data?.fiche;
  // La préparation est déjà sur la fiche de la liste des biens : elle s'affiche tout de suite, sans attente (27 oct. 2026).
  const prep = f?.preparation || p?.preparation || null;
  const refaire = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${p.id}/preparation`),
    onSuccess: () => ["m-fiche", "m-proprietaires"].forEach((x) => queryClient.invalidateQueries({ queryKey: [x] })),
    onError: (e) => toast.error(e?.message || "Préparation impossible pour l'instant"),
  });
  const tente = useRef(false);
  const relancer = refaire.mutate;
  useEffect(() => {
    if (!f || tente.current || prep?.v >= 3) return;
    tente.current = true;
    relancer();
  }, [f, prep, relancer]);
  return { prep, chargement: (isLoading && !(prep?.v >= 3)) || (refaire.isPending && !(prep?.v >= 3)), refaire };
}

/** Le bien passe à l'Avis de valeur quand un avis naît pendant que la Pré-visite est ouverte (le vocal de fin de visite). */
export function useVersAvis(bien, onAvis) {
  const avant = useRef(!!bien?.estimation);
  useEffect(() => {
    if (!avant.current && bien?.estimation) { avant.current = true; onAvis?.(); }
  }, [bien?.estimation, onAvis]);
}

/** Le contenu de la préparation, seul (le téléphone le montre sous « Voir la fiche », au-dessus de la fiche). */
export function PreparationDuBien({ bien, onDecaler = null }) {
  const p = bien?.proprietaire || null;
  const { prep, chargement, refaire } = usePreparation(p);
  const adresse = bien?.adresse || bien?.estimation?.adresse || null;
  const legere = useQuery({
    queryKey: ["m-prep-legere", adresse],
    queryFn: () => base44.request("GET", `/api/mandataire/biens/preparation-legere?adresse=${encodeURIComponent(adresse || "")}`),
    enabled: !p && !!adresse,
  });
  if (!p) {
    if (legere.isLoading) return <Attente />;
    if (!legere.data?.preparation) return <p className="m-0 py-16 text-center text-[14px] text-brume">Pas d'adresse connue pour préparer ce rendez-vous.</p>;
    return <><p className="m-0 mb-2 text-[13.5px] text-ardoise">Préparation allégée : ce bien n'est pas né d'une fiche de la Prospection, elle part de son adresse.</p><Preparation prep={legere.data.preparation} /></>;
  }
  if (chargement) return <Attente />;
  if (prep?.v >= 3) return <Preparation prep={prep} p={p} onDecaler={onDecaler} />;
  return (
    <div className="py-16 text-center">
      <p className="m-0 text-[14px] text-brume">La préparation n'est pas encore prête.</p>
      <button type="button" onClick={() => refaire.mutate()} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-4 text-[13.5px] text-craie hover:border-bord-vif" style={{ background: "transparent" }}><RefreshCw className="h-4 w-4" />Préparer maintenant</button>
    </div>
  );
}

/**
 * La Pré-visite d'un bien, sur ordinateur. `entete` : le fil d'Ariane (sans les étapes, qui restent dans le menu de
 * droite) ; `onAvis` : le bien passe à l'Avis de valeur.
 */
export default function PreVisite({ bien, entete, onFermer, onAvis }) {
  const p = bien?.proprietaire || null;
  const queryClient = useQueryClient();
  const { prep, refaire } = usePreparation(p);
  const [convHaka, setConvHaka] = useState(false);
  const [ficheOuverte, setFicheOuverte] = useState(true);
  const [sortie, setSortie] = useState(null);
  useVersAvis(bien, onAvis);

  // Le chat de Haka : la conversation du bien, rouverte d'elle-même.
  const outilsChat = useReglagesChatMandataire(["appel", "mail", "estimation"]);
  const cible = p ? `bien:${p.id}` : null;
  const lie = p?.biens?.conversation_id || null;
  const sansHistorique = useCallback(() => {}, []);
  useEffect(() => {
    if (!lie) return;
    window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: lie, api: CHAT, qs: "", cible } }));
  }, [lie, cible]);
  const lier = useCallback((cid) => {
    if (!cid || cid === lie || !p) return;
    base44.request("POST", `${API}/${p.id}/conversation`, { body: { conversation_id: cid } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["m-proprietaires"] })).catch(() => {});
  }, [lie, p, queryClient]);
  const surReponse = () => ["m-proprietaires", "m-fiche", "m-estimations"].forEach((x) => queryClient.invalidateQueries({ queryKey: [x] }));
  // « Passer à l'estimation » depuis le compte rendu : l'assistant s'ouvre avec la réponse prête, le mandataire l'envoie.
  const versEstimation = () => {
    window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte: "Oui, passe à l'estimation avec le compte rendu." } }));
  };

  const maj = prep?.maj_le ? new Date(prep.maj_le).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3 px-10 pr-20">
        <div className="min-w-0 flex-1">{entete}</div>
      </div>
      <div className={`grid gap-8 px-10 pb-16 pr-20 pt-4 ${ficheOuverte && p ? "grid-cols-[minmax(0,1fr)_minmax(320px,400px)]" : "grid-cols-1"}`}>
        {/* Dans un cadre, comme la fiche à côté (27 oct. 2026, Jules) ; plus de phrase sous le titre. */}
        {/* Plus large sur l'ordinateur (31 oct. 2026, Jules : « trop étroite ») : 1080 px au lieu de 720. */}
        {/* Le chat sous la préparation, à sa largeur, collé en bas de l'écran quand on défile (1er nov. 2026, Jules) :
            plus de bouton ni de panneau à droite, l'assistant est toujours là, avant la visite comme après. */}
        <div className="flex min-w-0 flex-col gap-4">
        <main className="mx-auto w-full max-w-[1080px] rounded-[18px] border border-trait bg-rail px-7 pb-3 pt-6">
          <div className="flex items-end justify-between gap-3 pb-2">
            <div className="min-w-0">
              <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }} title={maj ? `Préparée par votre assistant · mise à jour ${maj}` : undefined}>Préparer la visite</h1>
            </div>
            {p && <button type="button" onClick={() => refaire.mutate()} disabled={refaire.isPending} aria-label="Mettre la préparation à jour" title="Mettre à jour" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>{refaire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>}
          </div>
          {p?.biens?.compte_rendu && <CompteRendu cr={p.biens.compte_rendu} onEstimation={bien?.estimation?.avis ? null : onAvis || versEstimation} />}
          <PreparationDuBien bien={bien} onDecaler={() => setSortie("decaler")} />
        </main>
        {p && (
          <section aria-label="Votre assistant" className="sticky bottom-4 z-30 mx-auto flex w-full max-w-[1080px] flex-col rounded-[18px] border border-bord-doux bg-rail px-4 pb-3 pt-3 shadow-[0_18px_44px_rgb(0_0_0/0.22)]"
            style={convHaka ? { height: "min(55vh, 560px)" } : undefined}>
            <div className={convHaka ? "min-h-0 w-full flex-1" : "w-full"}>
              <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={p.id} cible={cible} reglages={outilsChat.reglages} onHistorique={sansHistorique} onConversation={setConvHaka}
                onConversationId={lier} onReponse={surReponse} sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Une question, ou racontez la visite…"
                barreApercu sansBarreHaut retour={{ libelle: "Tous les biens", onClick: onFermer }} />
            </div>
          </section>
        )}
        </div>
        {p && ficheOuverte && (
          <aside className="min-w-0">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12.5px] text-ardoise">La fiche du bien</span>
              <button type="button" onClick={() => setFicheOuverte(false)} aria-label="Replier la fiche" title="Replier la fiche" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><PanelRightClose className="h-4 w-4" /></button>
            </div>
            <div className="k-grid rounded-[18px] border border-trait"><FicheMandataire id={p.id} sansChat sansPreparation /></div>
          </aside>
        )}
      </div>
      {p && !ficheOuverte && (
        <button type="button" onClick={() => setFicheOuverte(true)} className="fixed right-20 top-20 z-20 inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux bg-surface-pleine px-3.5 text-[13px] text-craie hover:border-bord-vif">
          <PanelRightOpen className="h-4 w-4" />La fiche
        </button>
      )}
      {sortie && p && <Sortie quoi={sortie} p={p} prep={prep} onFermer={() => setSortie(null)} onPerdu={onFermer} />}
    </div>
  );
}

function Attente() {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-ardoise" />
      <p className="m-0 text-[14px] text-ardoise">L'Assistant KPartners prépare le rendez-vous…</p>
    </div>
  );
}
