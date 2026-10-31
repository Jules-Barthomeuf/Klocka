import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, MapPin, Mic, Navigation, PanelRightClose, PanelRightOpen, Phone, RefreshCw, Send, Sparkles, X } from "lucide-react";
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

/** La préparation, dans l'ordre de la spécification. `p` : la fiche (absente pour la préparation allégée). */
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
  const [mail, setMail] = useState(null);
  const preparerMail = useMutation({
    mutationFn: () => base44.request("GET", `${API}/${p.id}/preparation/mail`),
    onSuccess: (r) => setMail(r),
    onError: (e) => toast.error(e?.message || "Mail impossible"),
  });
  const r = prep.rdv;
  const pers = prep.personne;
  const b = prep.bien || {};
  const e = prep.estimation;
  const cc = prep.clients_compatibles || {};
  const q = prep.questions || {};
  let n = 0;
  const suivant = () => { n += 1; return n; };
  const itineraire = r?.adresse ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.adresse)}` : null;
  const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre max-md:h-10";

  return (
    <div>
      {r && (
        <Bloc n={suivant()} titre="Le rendez-vous">
          <p className="m-0 text-[18px] text-encre first-letter:uppercase">{quandLong(r.le)}</p>
          {r.adresse && <p className="m-0 mt-1 flex items-start gap-1.5"><MapPin className="mt-[5px] h-3.5 w-3.5 flex-none text-ardoise" />{r.adresse}</p>}
          {r.avec && <p className="m-0 mt-0.5 text-ardoise">Avec {r.avec}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {itineraire && <a href={itineraire} target="_blank" rel="noreferrer" className={bouton}><Navigation className="h-4 w-4" />Itinéraire</a>}
            {r.telephone && <a href={`tel:${String(r.telephone).replace(/\s+/g, "")}`} className={bouton}><Phone className="h-4 w-4" />Appeler</a>}
            {onDecaler && <button type="button" onClick={onDecaler} className={bouton} style={{ background: "transparent" }}>Décaler</button>}
          </div>
        </Bloc>
      )}
      {/* !! : sans propriétaire ni phrase, `0` s'affichait seul sous le titre (27 oct. 2026, Jules). */}
      {pers && !!(pers.proprietaire || pers.deja_dit?.length) && (
        <Bloc n={suivant()} titre="La personne">
          {pers.proprietaire && <p className="m-0 text-encre">{[pers.proprietaire, pers.forme, pers.gerant ? `gérant ${pers.gerant}${pers.age ? `, ${pers.age}` : ""}` : null].filter(Boolean).join(" · ")}<Source source={pers.source} aConfirmer={!!pers.gerant} /></p>}
          {pers.deja_dit?.length > 0 && (
            <div className="mt-3">
              <p className="m-0 text-[12.5px] text-ardoise">Ce qu'il a déjà dit</p>
              <ul className="m-0 mt-1 list-none p-0">{pers.deja_dit.map((d) => <li key={d.texte} className="py-0.5">« {d.texte} »<Source source={d.source} /></li>)}</ul>
            </div>
          )}
          {pers.approche && <p className="m-0 mt-3 text-encre"><span className="text-ardoise">Comment l'aborder : </span>{pers.approche}</p>}
        </Bloc>
      )}
      {prep.vendre && (prep.vendre.signal || prep.vendre.terrain?.length > 0) && (
        <Bloc n={suivant()} titre="Pourquoi il pourrait vendre">
          {prep.vendre.signal && <p className="m-0">{prep.vendre.signal}<Source source={prep.vendre.source} /></p>}
          {(prep.vendre.terrain || []).map((t) => <p key={t.texte} className="m-0 mt-1">« {t.texte} »<Source source={t.source} /></p>)}
        </Bloc>
      )}
      {(b.exploitant || b.rue || b.loyer || b.surface) && (
        <Bloc n={suivant()} titre="Le bien et le locataire">
          {b.exploitant && <Ligne mot={prep.profil === "exploitant" ? "Exploitant" : "Locataire"}>{[b.exploitant, b.depuis ? `depuis ${b.depuis}` : null, b.activite].filter(Boolean).join(" · ")}<Source source={b.source} /></Ligne>}
          {b.rue && <Ligne mot="Adresse">{b.rue}</Ligne>}
          {b.surface && <Ligne mot="Surface">{b.surface.basse === b.surface.haute ? `${b.surface.basse} m²` : `${b.surface.basse} à ${b.surface.haute} m²`}<Source source={b.surface.source} aConfirmer={b.surface.a_confirmer} /></Ligne>}
          {b.loyer && prep.profil !== "exploitant" && <Ligne mot="Loyer probable">{k(b.loyer.basse)} à {k(b.loyer.haute)} par an<Source source={b.loyer.source} aConfirmer /></Ligne>}
          {b.fin_bail && <Ligne mot="Fin de bail">{b.fin_bail.annee}<Source source={`bail 3-6-9 supposé depuis ${b.fin_bail.depuis}`} aConfirmer /></Ligne>}
        </Bloc>
      )}
      {e && (
        <Bloc n={suivant()} titre="La pré-estimation, interne" repliable resume={`${k(e.basse)} à ${k(e.haute)} · à ne pas annoncer`}>
          <p className="m-0 text-[18px] tabular-nums text-encre">{k(e.basse)} à {k(e.haute)}</p>
          <p className="m-0 text-[12.5px] text-ambre">Interne : à ne pas annoncer au propriétaire.</p>
          {e.calcul && <p className="m-0 mt-3">{e.calcul}<Source source={(e.sources || []).join(" · ")} /></p>}
          {e.sensibilite?.length > 0 && (
            <div className="mt-3">
              <p className="m-0 text-[12.5px] text-ardoise">Ce qui la ferait bouger</p>
              <ul className="m-0 mt-1 list-none p-0">{e.sensibilite.map((x) => <li key={x} className="py-0.5">{x}</li>)}</ul>
            </div>
          )}
          {e.comparables?.length > 0 && (
            <div className="mt-3">
              <p className="m-0 text-[12.5px] text-ardoise">Ventes comparables autour</p>
              <ul className="m-0 mt-1 list-none p-0">{e.comparables.map((c) => <li key={c.texte} className="py-0.5 tabular-nums">{c.texte}<Source source={c.source} /></li>)}</ul>
            </div>
          )}
        </Bloc>
      )}
      {cc.liste?.length > 0 && (
        <Bloc n={suivant()} titre="Les clients compatibles" repliable resume={`${cc.liste.length} recherche${cc.liste.length > 1 ? "s" : ""}${cc.plafond ? ` · plus aucun au-delà de ${k(cc.plafond)}` : ""}`}>
          <ul className="m-0 list-none p-0">{cc.liste.map((c) => <li key={c.reference} className="py-0.5">{[c.reference, c.budget, c.pourquoi].filter(Boolean).join(" · ")}</li>)}</ul>
          {cc.plafond && <p className="m-0 mt-2 text-encre">Au-delà de {k(cc.plafond)}, plus aucun client ne suit : c'est l'argument du rendez-vous.<Source source={cc.source} /></p>}
        </Bloc>
      )}
      {(q.indispensables?.length > 0) && (
        <Bloc n={suivant()} titre="Les questions à poser">
          <ol className="m-0 list-none p-0">
            {q.indispensables.map((x, i) => <li key={x} className="flex gap-3 py-1 text-encre"><span className="w-4 flex-none text-[13.5px] tabular-nums text-pervenche">{i + 1}</span>{x}</li>)}
          </ol>
          {(q.autres || []).length > 0 && <ul className="m-0 mt-2 list-none p-0">{q.autres.map((x) => <li key={x} className="flex gap-3 py-0.5"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-brume" />{x}</li>)}</ul>}
          {(q.a_confirmer || []).length > 0 && (
            <div className="mt-3">
              <p className="m-0 text-[12.5px] text-ambre">Nées de ce qui est à confirmer</p>
              <ul className="m-0 mt-1 list-none p-0">{q.a_confirmer.map((x) => <li key={x} className="flex gap-3 py-0.5"><span className="mt-[9px] h-1 w-1 flex-none rounded-full bg-ambre" />{x}</li>)}</ul>
            </div>
          )}
        </Bloc>
      )}
      {prep.objections?.length > 0 && (
        <Bloc n={suivant()} titre="Les objections probables" repliable resume={`${prep.objections.length} objection${prep.objections.length > 1 ? "s" : ""}, avec la réponse`}>
          {prep.objections.map((o) => (
            <div key={o.objection} className="py-1.5">
              <p className="m-0 text-encre">« {o.objection} »</p>
              <p className="m-0 text-ardoise">{o.reponse}</p>
            </div>
          ))}
        </Bloc>
      )}
      {prep.documents?.length > 0 && (
        <Bloc n={suivant()} titre="Les documents à demander">
          <ul className="m-0 list-none p-0">
            {prep.documents.map((d) => {
              const fait = recus.includes(d);
              return (
                <li key={d}>
                  <button type="button" onClick={() => basculer(d)} disabled={!p} aria-pressed={fait} className="flex w-full items-center gap-3 py-1.5 text-left disabled:cursor-default" style={{ background: "transparent" }}>
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-[6px] border ${fait ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-doux"}`}>{fait && <Check className="h-3.5 w-3.5" />}</span>
                    <span className={fait ? "text-ardoise line-through" : "text-encre"}>{d}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {p && (
            <button type="button" onClick={() => preparerMail.mutate()} disabled={preparerMail.isPending} className={`${bouton} mt-3`} style={{ background: "transparent" }}>
              {preparerMail.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Envoyer la liste au propriétaire
            </button>
          )}
          {mail && (
            <div className="mt-3 rounded-[14px] border border-trait p-4">
              <p className="m-0 text-[12.5px] text-ardoise">Préparé par l'Assistant KPartners, à envoyer après le rendez-vous</p>
              <p className="m-0 mt-1 text-encre">{mail.objet}</p>
              <p className="m-0 mt-2 whitespace-pre-line text-[13.5px] text-craie">{mail.texte}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${mail.email || ""}?subject=${encodeURIComponent(mail.objet)}&body=${encodeURIComponent(mail.texte)}`} className={bouton}><Send className="h-4 w-4" />Ouvrir dans ma messagerie</a>
                <button type="button" onClick={() => { navigator.clipboard?.writeText(mail.texte).then(() => toast.success("Copié")).catch(() => {}); }} className={bouton} style={{ background: "transparent" }}>Copier</button>
              </div>
            </div>
          )}
        </Bloc>
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
    if (!f || tente.current || prep?.v === 2) return;
    tente.current = true;
    relancer();
  }, [f, prep, relancer]);
  return { prep, chargement: (isLoading && prep?.v !== 2) || (refaire.isPending && prep?.v !== 2), refaire };
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
  if (prep?.v === 2) return <Preparation prep={prep} p={p} onDecaler={onDecaler} />;
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
  const [haka, setHaka] = useState(false);
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
    if (!lie || !haka) return;
    window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: lie, api: CHAT, qs: "", cible } }));
  }, [lie, cible, haka]);
  const lier = useCallback((cid) => {
    if (!cid || cid === lie || !p) return;
    base44.request("POST", `${API}/${p.id}/conversation`, { body: { conversation_id: cid } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["m-proprietaires"] })).catch(() => {});
  }, [lie, p, queryClient]);
  const surReponse = () => ["m-proprietaires", "m-fiche", "m-estimations"].forEach((x) => queryClient.invalidateQueries({ queryKey: [x] }));
  // « Passer à l'estimation » depuis le compte rendu : l'assistant s'ouvre avec la réponse prête, le mandataire l'envoie.
  const versEstimation = () => {
    setHaka(true);
    setTimeout(() => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte: "Oui, passe à l'estimation avec le compte rendu." } })), 500);
  };

  const maj = prep?.maj_le ? new Date(prep.maj_le).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3 px-10 pr-20">
        <div className="min-w-0 flex-1">{entete}</div>
        {p && (
          <div className="flex flex-none items-center gap-2">
            {/* Un seul bouton (27 oct. 2026, Jules) : parler à son assistant, avant la visite comme après. */}
            <button type="button" onClick={() => setHaka((o) => !o)} aria-pressed={haka} title="Une question avant la visite, ou le récit après : il fait le compte rendu" className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">
              <Mic className="h-4 w-4" />Parler à mon assistant
            </button>
          </div>
        )}
      </div>
      <div className={`grid gap-8 px-10 pb-16 pr-20 pt-4 ${ficheOuverte && p ? "grid-cols-[minmax(0,1fr)_minmax(320px,400px)]" : "grid-cols-1"}`}>
        {/* Dans un cadre, comme la fiche à côté (27 oct. 2026, Jules) ; plus de phrase sous le titre. */}
        <main className="mx-auto w-full max-w-[720px] rounded-[18px] border border-trait bg-rail px-7 pb-3 pt-6">
          <div className="flex items-end justify-between gap-3 pb-2">
            <div className="min-w-0">
              <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }} title={maj ? `Préparée par votre assistant · mise à jour ${maj}` : undefined}>Préparer la visite</h1>
            </div>
            {p && <button type="button" onClick={() => refaire.mutate()} disabled={refaire.isPending} aria-label="Mettre la préparation à jour" title="Mettre à jour" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>{refaire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>}
          </div>
          {p?.biens?.compte_rendu && <CompteRendu cr={p.biens.compte_rendu} onEstimation={bien?.estimation?.avis ? null : onAvis || versEstimation} />}
          <PreparationDuBien bien={bien} onDecaler={() => setSortie("decaler")} />
        </main>
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
      {/* Haka, un panneau latéral qui s'ouvre sur la droite. */}
      <AnimatePresence>
        {haka && p && (
          <motion.aside key="haka" role="complementary" aria-label="Votre assistant" className="fixed bottom-2 right-2 top-16 z-[60] flex w-[440px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[18px] border border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.28)]"
            initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex h-12 flex-none items-center justify-between border-b border-trait px-4">
              <span className="flex items-center gap-2 text-[14px] text-encre"><Sparkles className="h-4 w-4 text-pervenche" />Votre assistant</span>
              <button type="button" onClick={() => setHaka(false)} aria-label="Fermer l'assistant" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
            {/* Le chat au milieu du panneau à l'ouverture, puis en bas dès le premier message (27 oct. 2026, Jules). */}
            <div className={`flex min-h-0 flex-1 flex-col px-4 pb-4 ${convHaka ? "" : "justify-center"}`}>
              <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={p.id} cible={cible} reglages={outilsChat.reglages} onHistorique={sansHistorique} onConversation={setConvHaka}
                onConversationId={lier} onReponse={surReponse} sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Une question, ou racontez la visite…"
                barreApercu sansBarreHaut retour={{ libelle: "Tous les biens", onClick: onFermer }} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
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
