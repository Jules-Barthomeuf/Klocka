import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, ListPlus, Loader2, Phone, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { JL } from "@/design/jetons";
import { ChaineEtapes, useEtapesVives } from "@/components/prospection/ChaineEtapes";
import CarteOffMarket from "./CarteOffMarket";
import FacadeLocal from "./FacadeLocal";
import { BlocZone, dessinAvecZone, useFileAJuger, useZone } from "./JugementZone";
import { Case, Vide, bouton, boutonPlein, champ, dateCourte, euros, pl, req } from "./commun";
import { FILTRES_SIMPLE, OPTIONS_ANCIENNETE, OPTIONS_CLASSE, OPTIONS_EMPLACEMENT, OPTIONS_LIEN, OPTIONS_PROPRIETAIRE, basculer, cleLien, compteDe, depuisAuMoins, estExploitant, nbFiltres, passeSimple } from "@/lib/off-market-simple";
import Chargement from "@/components/ui/Chargement";
import { accroche, budgetDe, exclusionsDe, pourClient, veutEmplacement1, veutEnseigneNationale } from "@/lib/clients-commerces";

// Off-market, le mode Simple (spec de Jules du 11 oct. 2026) : la carte de la
// ville avec tous ses commerces, la couleur dit seulement si l'on sait qui
// possède les murs ; à droite la liste courte, puis la carte en six lignes du
// commerce cliqué ; une adresse précise se cherche en direct, avec la chaîne
// de raisonnement ; « Ajouter à une liste » l'envoie à la Prospection. Rien n'est partagé
// avec le mode Avancé, sauf la ville.

// La phrase « J'ai un acquéreur qui cherche exactement… » dans la fiche d'un commerce : retirée pour l'instant (24 oct. 2026, Jules).
const ACCROCHE_CLIENT = false;
export const LIENS = { exploitant_certain: { mot: "Exploitant propriétaire", couleur: JL.menthe }, exploitant_probable: { mot: "Exploitant propriétaire (probable)", couleur: JL.menthe }, tiers: { mot: "Bailleur tiers", couleur: JL.bleu || JL.ambre }, inconnu: { mot: "Propriétaire inconnu", couleur: JL.ardoise }, null: { mot: "Recherche en cours", couleur: JL.brume } };
export const DRAPEAUX = { gerant_age: "Gérant 70+", fonds_cede: "Fonds cédé", ferme: "Fermé", transmission: "Transmission", detention_30: "Détenu 30 ans+", detention_22: "Détenu 22 ans+" };
const dessinSimple = (c) => ({ couleur: LIENS[c.lien]?.couleur || JL.brume, opacite: c.lien ? 0.95 : 0.5, taille: c.drapeaux?.length ? 7 : 5 });
const ORDRE_LIEN = { exploitant_certain: 0, exploitant_probable: 1, tiers: 2, inconnu: 3 };
export const DRAPEAUX_COURTS = { gerant_age: "Gérant 70+", fonds_cede: "Fonds cédé", ferme: "Fermé", transmission: "Transmission", detention_30: "30 ans+", detention_22: "22 ans+" };

/** Pure : « d'Antibes », « de Mâcon », « du Mans », « des Sables-d'Olonne ». */
export const deVille = (nom) => {
  const n = String(nom || "").trim();
  if (/^le\s/i.test(n)) return `du ${n.slice(3)}`;
  if (/^les\s/i.test(n)) return `des ${n.slice(4)}`;
  return /^[aeiouyàâäéèêëîïôöùûüh]/i.test(n) ? `d'${n}` : `de ${n}`;
};

/** Une section du menu des filtres : un titre, puis les choix avec leur effectif. */
function SectionFiltre({ titre, options, choisis, onChange, multiple = true, recherche = false }) {
  const [cherche, setCherche] = useState("");
  const [tout, setTout] = useState(false);
  const filtrees = recherche && cherche.trim() ? options.filter((o) => o.mot.toLowerCase().includes(cherche.trim().toLowerCase())) : options;
  const montrees = tout || cherche.trim() ? filtrees : filtrees.slice(0, 8);
  const choisir = (v) => onChange(multiple ? basculer(choisis, v) : choisis[0] === v ? [] : [v]);
  return (
    <div className="flex flex-col">
      <p className="m-0 mb-1 flex items-center justify-between px-1 text-[11px] uppercase tracking-[.14em] text-brume"><span>{titre}</span>{choisis.length > 0 && <button type="button" onClick={() => onChange([])} className="p-0 text-[11px] normal-case tracking-normal text-ardoise hover:text-encre" style={{ background: "transparent" }}>Effacer</button>}</p>
      {recherche && <input value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher" className={`${champ} mb-1 h-8 w-full`} />}
      {montrees.map((o) => (
        <div key={o.v} role="checkbox" aria-checked={choisis.includes(o.v)} tabIndex={0} onClick={() => choisir(o.v)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(o.v); } }} className="flex w-full cursor-pointer items-center gap-2.5 rounded-champ px-1.5 py-1.5 text-left outline-none hover:bg-relief focus-visible:bg-relief">
          <span aria-hidden className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border transition-colors ${choisis.includes(o.v) ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif"}`}>{choisis.includes(o.v) && <Check className="h-3 w-3" strokeWidth={3} />}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-encre">{o.mot}</span>
          <span className="text-[12px] tabular-nums text-brume">{o.n}</span>
        </div>
      ))}
      {!tout && !cherche.trim() && filtrees.length > 8 && <button type="button" onClick={() => setTout(true)} className="px-1.5 py-1 text-left text-[12.5px] text-menthe hover:text-encre" style={{ background: "transparent" }}>Voir les {filtrees.length}</button>}
    </div>
  );
}

/** Le bouton « Filtrer » de la barre du haut, et son menu sous le bouton. */
export function MenuFiltres({ filtres, setFiltres, commerces, tous = commerces, activites, visibles, zones = [], scoreZone = null }) {
  const [ouvert, setOuvert] = useState(false);
  const n = nbFiltres({ ...filtres, texte: "" });
  const maj = (cle) => (v) => setFiltres((f) => ({ ...f, [cle]: v }));
  const un = (cle) => (v) => setFiltres((f) => ({ ...f, [cle]: v[0] || null }));
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [ouvert]);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors ${n ? "border-transparent bg-pervenche/10 text-encre" : "border-bord-doux bg-rail text-craie hover:text-encre"}`}>
        <SlidersHorizontal className="h-4 w-4" />Filtrer{n > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-pervenche px-1.5 text-[11.5px] text-fond">{n}</span>}
      </button>
      {/* La fenêtre des filtres monte du bas et se pose au milieu de l'écran (Jules, 11 oct. 2026). */}
      <AnimatePresence>
      {ouvert && <motion.div key="voile" className="fixed inset-0 z-[70] bg-black/40" onClick={() => setOuvert(false)} aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />}
      {ouvert && (
        <motion.div key="fenetre" className="pointer-events-none fixed inset-0 z-[71] grid place-items-center p-4"
          initial={{ opacity: 0, y: 48, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 32, scale: 0.98 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
        <div role="dialog" aria-label="Filtres" className="pointer-events-auto max-h-[85vh] w-[760px] max-w-full overflow-y-auto rounded-bloc border border-bord-doux bg-surface-pleine p-4 shadow-xl">
          <div className="grid gap-5 md:grid-cols-3">
            <div className="flex flex-col gap-5">
              {/* La classe d'actif en tête (26 oct. 2026, Jules) : commerce, bureaux, entrepôt ; rien de coché = tout. Seulement
                  s'il y a plus d'une classe à l'écran : un mandataire n'a que des commerces (31 oct. 2026, PLAN.md 0.4). */}
              {new Set(commerces.map((c) => c.classe || "commerce")).size > 1 && <SectionFiltre titre="Classe d'actif" choisis={filtres.classes || []} onChange={maj("classes")} options={OPTIONS_CLASSE.map(([v, mot]) => ({ v, mot, n: compteDe(commerces, (c) => (c.classe || "commerce") === v) }))} />}
              <SectionFiltre titre="Emplacement" multiple={false} choisis={[filtres.emplacement || "centre"]} onChange={(v) => setFiltres((f) => ({ ...f, emplacement: v[0] || "centre" }))} options={OPTIONS_EMPLACEMENT.map(([v, mot]) => ({ v, mot, n: v === "centre" ? compteDe(tous, (c) => c.centre !== false) : tous.length }))} />
              {zones.length > 0 && <SectionFiltre titre="Zone" choisis={filtres.zones} onChange={(v) => setFiltres((f) => ({ ...f, zones: v, emplacement: v.length ? "centre" : f.emplacement }))} options={zones.map((z) => ({ v: z.nom, mot: z.nom, n: compteDe(tous, (c) => c.zone === z.nom) }))} />}
              <SectionFiltre titre="Lien" choisis={filtres.liens} onChange={maj("liens")} options={OPTIONS_LIEN.map(([v, mot]) => ({ v, mot, n: compteDe(commerces, (c) => cleLien(c) === v) }))} />
              {/* Le score Zone (équipe Klocka, 11 oct. 2026) : masquer les points sous un seuil. */}
              {scoreZone && <SectionFiltre titre="Score Zone" multiple={false} choisis={scoreZone.masquer ? [String(scoreZone.seuil)] : []} onChange={(v) => scoreZone.choisir(v[0] ? Number(v[0]) : null)} options={[30, 40, 50, 60].map((k) => ({ v: String(k), mot: `Masquer sous ${k}`, n: compteDe(commerces, (c) => scoreZone.points[c.id]?.score_zone != null && scoreZone.points[c.id].score_zone < k) }))} />}
              <SectionFiltre titre="Propriétaire des murs" choisis={filtres.proprietaires} onChange={maj("proprietaires")} options={OPTIONS_PROPRIETAIRE.map(([v, mot]) => ({ v, mot, n: compteDe(commerces, (c) => (c.proprietaire_type || "inconnu") === v) }))} />
            </div>
            <div className="flex flex-col gap-5">
              <SectionFiltre titre="Activité" recherche choisis={filtres.activites} onChange={maj("activites")} options={activites} />
            </div>
            <div className="flex flex-col gap-5">
              <SectionFiltre titre="Raison de vendre" choisis={filtres.drapeaux} onChange={maj("drapeaux")} options={Object.entries(DRAPEAUX).map(([v, mot]) => ({ v, mot, n: compteDe(commerces, (c) => c.drapeaux.includes(v)) }))} />
              <SectionFiltre titre="Installé depuis" multiple={false} choisis={filtres.anciennete ? [filtres.anciennete] : []} onChange={un("anciennete")} options={OPTIONS_ANCIENNETE.map(([v, mot]) => ({ v, mot, n: compteDe(commerces, (c) => depuisAuMoins(c, Number(v))) }))} />
              <SectionFiltre titre="Enseigne" multiple={false} choisis={filtres.chaine ? [filtres.chaine] : []} onChange={un("chaine")} options={[{ v: "independant", mot: "Indépendant", n: compteDe(commerces, (c) => !c.chaine) }, { v: "chaine", mot: "Chaîne", n: compteDe(commerces, (c) => c.chaine) }]} />
              <SectionFiltre titre="Liste" multiple={false} choisis={filtres.liste ? [filtres.liste] : []} onChange={un("liste")} options={[{ v: "libres", mot: "Pas encore dans une liste", n: compteDe(commerces, (c) => !c.liste) }, { v: "en_liste", mot: "Déjà dans une liste", n: compteDe(commerces, (c) => c.liste) }]} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-trait pt-3">
            <button type="button" onClick={() => setFiltres((f) => ({ ...FILTRES_SIMPLE, texte: f.texte, emplacement: f.emplacement }))} disabled={!n} className={bouton}>Tout effacer</button>
            <button type="button" onClick={() => setOuvert(false)} className={boutonPlein}>Voir {pl(visibles, "commerce")}</button>
          </div>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Une ligne du tableau de la fiche : le libellé, la valeur en une ligne, et
 * le détail qui se déplie au clic (source et date comprises).
 */
function Ligne({ titre, valeur, ton = "text-encre", detail = null, ouvert, onBasculer }) {
  const depliable = !!detail;
  return (
    <div className="border-t border-trait first:border-t-0">
      <button type="button" onClick={depliable ? onBasculer : undefined} aria-expanded={depliable ? ouvert : undefined} aria-disabled={!depliable || undefined}
        className={`relative grid w-full grid-cols-2 items-stretch text-center ${depliable ? "hover:bg-relief/40" : "cursor-default"}`} style={{ background: "transparent" }}>
        <span className="flex items-center justify-center px-4 py-3 text-[13px] text-ardoise">{titre}</span>
        <span className={`flex min-w-0 items-center justify-center gap-2 self-stretch border-l border-bord-doux px-4 py-3 text-[14px] ${ton}`}><span className="line-clamp-2 min-w-0 break-words">{valeur}</span>{depliable && <ChevronDown className={`h-4 w-4 flex-none text-brume transition-transform ${ouvert ? "rotate-180" : ""}`} />}</span>
      </button>
      {depliable && ouvert && <div className="flex flex-col items-center gap-1 border-t border-trait px-4 py-3 text-center text-[12.5px] leading-[1.5] text-craie">{detail}</div>}
    </div>
  );
}
/** La page Pappers d'une société (son SIREN suffit : Pappers redirige vers la fiche), dans un autre onglet. */
const Pappers = ({ siren, mot = "Voir sur Pappers" }) => (/^\d{9}$/.test(String(siren || "")) ? <a href={`https://www.pappers.fr/entreprise/${siren}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-bleu underline-offset-4 hover:underline">{mot}<ExternalLink className="h-3 w-3" /></a> : null);
const Source = ({ source, date }) => (source || date ? <span className="text-[11.5px] text-brume">{[source, date ? dateCourte(date) : null].filter(Boolean).join(" · ")}</span> : null);
export const REPONSES = { proprietaire_ouvert: "Propriétaire, ouvert à en parler", proprietaire_non: "Propriétaire, mais non", pas_proprietaire: "Pas propriétaire", pas_joint: "Pas joint" };

/** La liste dans la Prospection, partie Listes, dans une autre fenêtre. */
// Les listes de l'Off-market sont celles de l'espace mandataire (12 oct. 2026), jamais celles de la Prospection admin.
const ouvrirListe = (id) => window.open(`/MandataireProspection?onglet=listes&liste=${encodeURIComponent(id)}`, "_blank", "noopener");

/**
 * La fenêtre « Envoyer vers une liste » : les listes de la personne dans son
 * espace mandataire, ou une nouvelle. Chaque commerce y devient une fiche de
 * propriétaire à appeler (Prospection > Listes du mandataire).
 */
export function FenetreListe({ ids, onFermer, onFait }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["off-market", "simple", "listes"], queryFn: () => req("GET", "/simple/listes") });
  const [nom, setNom] = useState("");
  const envoyer = useMutation({
    mutationFn: (body) => req("POST", "/simple/listes/envoyer", { ids, ...body }),
    onSuccess: (r) => {
      if (r.ajoutes) toast.success(`${pl(r.ajoutes, "commerce")} dans la liste « ${r.liste.nom} »`, { description: "Dans vos listes de mandataire, onglet Prospection > Listes.", duration: 9000, action: { mot: "Voir la liste", faire: () => ouvrirListe(r.liste.id) } });
      if (r.deja?.length) toast.error(r.deja.length === 1 ? `${r.deja[0].enseigne} est déjà dans la liste « ${r.deja[0].liste} ».` : `${pl(r.deja.length, "établissement")} déjà dans une liste : laissés de côté.`);
      qc.invalidateQueries({ queryKey: ["off-market", "simple"] });
      onFait?.(r);
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  useEffect(() => { const k = (e) => { if (e.key === "Escape") onFermer(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onFermer]);
  const listes = q.data?.listes || [];
  return (
    <div role="dialog" aria-modal="true" aria-label="Envoyer vers une liste" className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="w-[440px] max-w-full rounded-bloc border border-bord-doux bg-surface-pleine p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[20px] font-normal text-encre">Envoyer vers une liste</h2>
            <p className="m-0 mt-1 text-[13px] text-ardoise">{pl(ids.length, "commerce")} · dans vos listes de mandataire (Prospection, onglet Listes).</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 overflow-hidden rounded-[12px] border border-bord-doux">
          {q.isLoading && <Chargement />}
          {listes.map((l) => (
            <button key={l.id} type="button" disabled={envoyer.isPending} onClick={() => envoyer.mutate({ liste_id: l.id })} className="flex w-full items-center justify-between gap-3 border-t border-trait px-4 py-3 text-left first:border-t-0 hover:bg-relief/40 disabled:opacity-50" style={{ background: "transparent" }}>
              <span className="text-[14px] text-encre">{l.nom}</span><span className="text-[12.5px] text-ardoise">{pl(l.n, "commerce")}</span>
            </button>
          ))}
          {!q.isLoading && !listes.length && <p className="m-0 px-4 py-4 text-[13px] text-brume">Aucune liste encore : créez la première ci-dessous.</p>}
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nom.trim()) envoyer.mutate({ nom: nom.trim() }); }}>
          <input autoFocus={!listes.length} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nouvelle liste, par exemple Antibes" className={`${champ} h-10 flex-1`} />
          <button type="submit" disabled={!nom.trim() || envoyer.isPending} className={`${boutonPlein} h-10`}>{envoyer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Créer et envoyer</button>
        </form>
      </div>
    </div>
  );
}

export function Fiche({ id, onFermer, onMaj, zone = null, rangAJuger = null, onJuge = null, onPasser = null, client = null, pourquoi = null }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["off-market", "simple", "commerce", id], queryFn: () => req("GET", `/simple/commerces/${id}`), refetchInterval: (x) => (["a_faire", "en_cours"].includes(x.state.data?.commerce?.etat_recherche) ? 4000 : false) });
  const c = q.data?.commerce;
  const [deplie, setDeplie] = useState(null);
  const [versListe, setVersListe] = useState(false);
  const etapesPrix = useEtapesVives();
  const [estime, setEstime] = useState(false);
  const [surfaceSaisie, setSurfaceSaisie] = useState("");
  useEffect(() => { setDeplie(null); setVersListe(false); setEstime(false); setSurfaceSaisie(""); }, [id]);
  // Le prix se calcule tout seul à l'ouverture, une fois le propriétaire lu (11 oct. 2026) : pas de clic.
  const lancePrix = useRef(null);
  useEffect(() => {
    const cc = q.data?.commerce;
    if (!cc || cc.estimation || cc.etat_recherche !== "fait" || lancePrix.current === id) return;
    lancePrix.current = id;
    estimerRef.current?.();
  }, [q.data, id]);
  const estimerRef = useRef(null);
  const estimer = async (surface = null) => {
    setEstime(true); setDeplie("prix"); etapesPrix.reinitialiser();
    try { await base44.flux(`/api/off-market/simple/commerces/${id}/prix`, { body: { surface }, surEtape: etapesPrix.pousser }); qc.invalidateQueries({ queryKey: ["off-market", "simple"] }); onMaj?.(); }
    catch (e) { toast.error(e?.message || "Estimation impossible"); } finally { setEstime(false); }
  };
  estimerRef.current = () => estimer();
  if (!c) return <Chargement taille="grand" />;
  const lien = LIENS[c.lien] || LIENS.null;
  const enCours = ["a_faire", "en_cours"].includes(c.etat_recherche);
  const gerant = c.exploitant?.gerants?.[0] || null;
  const pr = c.proprietaire;
  const ligne = (cle) => ({ ouvert: deplie === cle, onBasculer: () => setDeplie(deplie === cle ? null : cle) });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[20px] font-normal leading-[1.2] text-encre">{c.enseigne || c.nom}</h2>
          <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{c.activite} · {c.adresse}{c.ville ? `, ${c.ville}` : ""}</p>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </div>
      {/* Pour le client choisi (24 oct. 2026) : ce que le mandataire dit au propriétaire. Retiré pour l'instant le même jour
          (Jules) : ACCROCHE_CLIENT à true le remet. */}
      {ACCROCHE_CLIENT && client && pourClient({ ...c, prix: c.estimation?.prix || c.prix || null }, client) && (
        <div className="mx-5 mt-3 rounded-[12px] border border-menthe/40 bg-menthe/[0.06] px-4 py-3">
          <p className="m-0 text-[12px] text-ardoise">Pour votre client {client.reference} · {client.type_commerce || "tout commerce"} · {budgetDe(client)}</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.5] text-encre">« {accroche({ prix: c.estimation?.prix || c.prix || null }, client)} »</p>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
        {/* Pourquoi c'est une bonne cible, en une ligne, juste au-dessus de la façade (Prospecter pour un client, 24 oct. 2026). */}
        {pourquoi && <p className="m-0 mb-2 truncate text-[13.5px] text-menthe" title={pourquoi}>{pourquoi}</p>}
        <FacadeLocal adresse={c.adresse} ville={c.ville} lat={c.lat} lon={c.lon} nom={c.enseigne || c.nom} />
        <BlocZone id={id} zone={zone} rangAJuger={rangAJuger} onJuge={onJuge} onPasser={onPasser} />
        <div className="mt-3 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
          <Ligne titre="Propriétaire des murs" {...ligne("proprietaire")}
            valeur={pr ? `${pr.nom}${pr.forme ? ` · ${pr.forme}` : ""}` : c.proprietaire_declare ? `${c.proprietaire_declare.nom} (déclaré)` : enCours ? "Recherche en cours…" : "Inconnu, à demander lors de l'appel"}
            ton={pr || c.proprietaire_declare ? "text-encre" : "text-brume"}
            detail={pr ? (<>
              {pr.forme && <span>{pr.forme}{pr.siren ? ` · SIREN ${pr.siren}` : ""}</span>}
              {pr.gerants?.length > 0 && <span>Dirigé par {pr.gerants.map((g) => `${g.nom}${g.age ? ` (${g.age})` : ""}`).join(", ")}</span>}
              {pr.siege && <span>Siège : {pr.siege}</span>}
              {pr.creation && <span>Créé le {dateCourte(pr.creation)}</span>}
              {pr.parcelle && <span>Parcelle {pr.parcelle}{pr.surface_batiment ? ` · bâtiment de ${pr.surface_batiment} m²` : ""}</span>}
              <Source source={pr.source} date={pr.date} />
              <Pappers siren={pr.siren} mot="Le propriétaire sur Pappers (siège, dirigeants)" />
            </>) : c.proprietaire_declare ? <span>Déclaré au téléphone le {dateCourte(c.proprietaire_declare.le)}</span> : null} />
          <Ligne titre="Lien" {...ligne("lien")}
            valeur={<span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: lien.couleur }} />{lien.mot}</span>}
            detail={c.lien_motif ? (<>
              <span>{c.lien_motif.charAt(0).toUpperCase() + c.lien_motif.slice(1)}{/siège/.test(c.lien_motif) && pr?.siege ? ` : ${pr.siege}` : ""}.</span>
              {/dirigeant/.test(c.lien_motif) && <span className="text-[12px] text-ardoise">Le même nom figure parmi les dirigeants des deux sociétés.</span>}
              <span className="flex flex-wrap justify-center gap-x-4 gap-y-1"><Pappers siren={c.exploitant?.siren} mot="L'exploitant sur Pappers" /><Pappers siren={pr?.siren} mot="Le propriétaire sur Pappers" /></span>
            </>) : null} />
          <Ligne titre="Exploitant" {...ligne("exploitant")}
            valeur={`${c.exploitant?.nom || c.nom}${c.exploitant?.forme ? ` · ${c.exploitant.forme}` : ""}`}
            detail={<>
              {c.exploitant?.forme && <span>{c.exploitant.forme}{c.exploitant.siren ? ` · SIREN ${c.exploitant.siren}` : ""}</span>}
              {c.depuis && <span>Installé depuis le {dateCourte(c.depuis)}</span>}
              <Source source={c.exploitant?.source} date={c.exploitant?.date} />
              <Pappers siren={c.exploitant?.siren} mot="L'exploitant sur Pappers" />
            </>} />
          <Ligne titre="Gérant" {...ligne("gerant")}
            valeur={gerant ? `${gerant.nom}${gerant.age ? `, ${gerant.age}` : ""}` : c.exploitant?.non_lu ? "Pas encore lu" : "Aucun au registre"}
            ton={gerant ? "text-encre" : "text-brume"}
            detail={c.exploitant?.gerants?.length > 1 ? c.exploitant.gerants.map((g) => <span key={g.nom}>{g.nom}{g.qualite ? `, ${g.qualite}` : ""}{g.age ? ` (${g.age})` : ""}</span>) : null} />
          <Ligne titre="Pourquoi il vendrait" {...ligne("signaux")}
            valeur={c.drapeaux.length ? c.drapeaux.map((d) => DRAPEAUX[d.cle] || d.cle).join(", ") : "Aucun signal"}
            ton={c.drapeaux.length ? "text-encre" : "text-brume"}
            detail={c.drapeaux.length ? c.drapeaux.map((d) => <span key={d.cle} className="flex flex-col"><span>{d.texte}</span><Source source={d.source} date={d.date} /></span>) : null} />
          <Ligne titre="Prix estimé" {...ligne("prix")}
            valeur={estime ? <span className="inline-flex items-center gap-2 text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />Estimation en cours</span> : c.estimation?.prix ? euros(c.estimation.prix.moyenne) : c.estimation ? (c.estimation.surface ? "Incomplet : voir le détail" : "Surface à saisir") : <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); estimer(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); estimer(); } }} className="text-bleu underline-offset-4 hover:underline">Estimer le prix</span>}
            ton={c.estimation?.prix ? "text-encre" : "text-brume"}
            detail={(c.estimation || estime) ? (<>
              {estime && <div className="w-full text-left"><ChaineEtapes etapes={etapesPrix.etapes} titre="L'agent estime les murs" attente="Je lis la surface et le marché" /></div>}
              {!estime && c.estimation && <>
                {c.estimation.prix && <span className="text-[13px] text-encre">Prix moyen : {euros(c.estimation.prix.moyenne)}, entre {euros(c.estimation.prix.basse)} et {euros(c.estimation.prix.haute)}</span>}
                {c.estimation.prix && c.estimation.loyer_m2 && c.estimation.surface && <span>Bas : {c.estimation.surface[0]} m² au loyer bas de la rue ({Math.round(c.estimation.loyer_m2.basse)} €/m²/an). Haut : {c.estimation.surface[1]} m² au loyer haut ({Math.round(c.estimation.loyer_m2.haute)} €/m²/an). Moyen : la surface et le loyer du milieu.</span>}
                <span>Surface : {c.estimation.surface ? (c.estimation.surface[0] === c.estimation.surface[1] ? `${c.estimation.surface[0]} m²` : `${c.estimation.surface[0]} à ${c.estimation.surface[1]} m²`) : "inconnue"}{c.estimation.surface_source ? ` (${c.estimation.surface_source})` : ""}</span>
                <span>Loyer de marché : {c.estimation.loyer_m2 ? `${Math.round(c.estimation.loyer_m2.basse)} à ${Math.round(c.estimation.loyer_m2.haute)} €/m²/an, ${c.estimation.loyer_m2.niveau}${c.estimation.loyer_m2.nom ? ` ${c.estimation.loyer_m2.nom}` : ""}` : "non trouvé"}{c.estimation.loyer_an ? ` · soit ${euros(c.estimation.loyer_an.basse)} à ${euros(c.estimation.loyer_an.haute)} par an` : ""}</span>
                <span>Taux de rendement : {c.estimation.taux ? `${String(c.estimation.taux).replace(".", ",")} %` : "non trouvé"}{c.estimation.taux_source ? ` (${c.estimation.taux_source})` : ""}</span>
                <span className="text-[11.5px] text-brume">Prix = loyer annuel ÷ taux · Data-B, OpenStreetMap · {dateCourte(c.estimation.le)}</span>
                <form className="mt-1 flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (Number(surfaceSaisie) > 0) estimer(Number(surfaceSaisie)); }}>
                  <input value={surfaceSaisie} onChange={(e) => setSurfaceSaisie(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="Surface réelle en m²" className={`${champ} h-8 w-[170px]`} onClick={(e) => e.stopPropagation()} />
                  <button type="submit" disabled={!Number(surfaceSaisie)} className={`${bouton} h-8`}>Recalculer</button>
                </form>
              </>}
            </>) : null} />
          <Ligne titre="Téléphone" {...ligne("contact")}
            valeur={c.contact?.telephone ? <a href={`tel:${c.contact.telephone.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} className="text-encre underline-offset-4 hover:underline">{c.contact.telephone}</a> : "Non trouvé"}
            ton={c.contact?.telephone ? "text-encre" : "text-brume"}
            detail={c.contact?.site || c.contact?.courrier ? (<>
              {c.contact.site && <a href={c.contact.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-craie hover:text-encre">{c.contact.site.replace(/^https?:\/\//, "").replace(/\/$/, "")}<ExternalLink className="h-3 w-3" /></a>}
              {c.contact.courrier && <span>Courrier possible au siège du propriétaire : {c.contact.courrier}</span>}
              <Source source={c.contact.source} date={c.contact.date} />
            </>) : null} />
          {c.reponse && <Ligne titre="Dernier appel" {...ligne("appel")} valeur={`${REPONSES[c.reponse.choix] || c.reponse.choix}, le ${dateCourte(c.reponse.le)}`}
            detail={c.reponse.qui || c.reponse.note ? <>{c.reponse.qui && <span>Propriétaire selon lui : {c.reponse.qui}</span>}{c.reponse.note && <span>{c.reponse.note}</span>}</> : null} />}
        </div>
        {enCours && <p className="m-0 mt-2 inline-flex items-center gap-2 text-[12.5px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />Recherche du propriétaire en cours</p>}
        <div className="mt-4">
          {c.liste ? <span className="inline-flex flex-wrap items-center gap-2"><span className="inline-flex h-10 items-center rounded-full border border-bleu/60 px-4 text-[13.5px] text-encre" title="Un établissement ne va que dans une de vos listes">Dans la liste « {c.liste.nom} »</span><button type="button" onClick={() => ouvrirListe(c.liste.id)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13.5px] text-bleu underline-offset-4 hover:underline" style={{ background: "transparent" }}>Voir la liste<ExternalLink className="h-3.5 w-3.5" /></button></span>
            : <button type="button" onClick={() => setVersListe(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-bleu px-5 text-[14px] text-fond transition-opacity hover:opacity-90"><ListPlus className="h-4 w-4" />Ajouter à une liste</button>}
        </div>
        {versListe && <FenetreListe ids={[c.id]} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); qc.invalidateQueries({ queryKey: ["off-market", "simple", "commerce", id] }); onMaj?.(); }} />}
      </div>
    </div>
  );
}

/**
 * La fiche du client pour qui l'on prospecte (24 oct. 2026) : ses critères, ce que la ville a pour lui, et le choix
 * d'un autre client (les flèches, ou la liste). « Tous les commerces » sort de la recherche par client.
 */
function ClientProspection({ clients, client, nPour, ville, n, charge, onChoisir }) {
  const [liste, setListe] = useState(false);
  if (charge) return <p className="m-0 inline-flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />Vos clients</p>;
  if (!clients.length) return <p className="m-0 text-[13px] text-ardoise">Aucun client en recherche pour l'instant : tous les commerces sont affichés.</p>;
  if (!client) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[14px] border border-trait px-4 py-3">
        <span className="text-[13.5px] text-craie">Tous les commerces {deVille(ville)}</span>
        <button type="button" onClick={() => onChoisir(null)} className="text-[13px] text-menthe underline-offset-4 hover:underline" style={{ background: "transparent" }}>Prospecter pour un client</button>
      </div>
    );
  }
  const i = clients.findIndex((d) => d.id === client.id);
  const aller = (k) => onChoisir(clients[(i + k + clients.length) % clients.length].id);
  const rendement = client.rendement_min ? `${String(client.rendement_min).replace(".", ",")} %` : "—";
  const zones = (client.zones || []).join(", ") || "Toute la France";
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-bord-doux bg-rail">
      <div className="flex items-center gap-3 border-b border-trait px-4 py-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe/15 text-[13px] font-medium text-menthe">{String(client.reference || "?").slice(0, 3)}</span>
        <button type="button" onClick={() => setListe((l) => !l)} aria-expanded={liste} className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
          <span className="block truncate text-[15px] text-encre">{client.reference} <ChevronDown className="inline h-3.5 w-3.5 text-ardoise" /></span>
          <span className="block truncate text-[12.5px] text-ardoise">{client.profil} · client {i + 1} sur {clients.length}</span>
        </button>
        <button type="button" onClick={() => aller(-1)} aria-label="Client précédent" className="grid h-8 w-8 place-items-center rounded-full border border-trait text-craie hover:text-encre" style={{ background: "transparent" }}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => aller(1)} aria-label="Client suivant" className="grid h-8 w-8 place-items-center rounded-full border border-trait text-craie hover:text-encre" style={{ background: "transparent" }}><ChevronRight className="h-4 w-4" /></button>
      </div>
      {liste && (
        <div className="absolute inset-x-2 top-[60px] z-20 max-h-[320px] overflow-y-auto rounded-[12px] border border-bord-doux bg-surface-pleine p-1.5 shadow-xl">
          {clients.map((d) => (
            <button key={d.id} type="button" onClick={() => { onChoisir(d.id); setListe(false); }} aria-pressed={d.id === client.id}
              className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-relief ${d.id === client.id ? "bg-relief" : ""}`} style={d.id === client.id ? undefined : { background: "transparent" }}>
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-encre">{d.reference} · {d.type_commerce || "tout commerce"}</span><span className="block truncate text-[12px] text-ardoise">{budgetDe(d)}{d.couvre ? "" : " · cherche ailleurs"}</span></span>
              <span className={`flex-none text-[13px] tabular-nums ${nPour.get(d.id) ? "text-menthe" : "text-brume"}`}>{nPour.get(d.id) || 0}</span>
            </button>
          ))}
          <button type="button" onClick={() => { onChoisir("tous"); setListe(false); }} className="mt-1 w-full rounded-[10px] border-t border-trait px-3 py-2 text-left text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tous les commerces, sans client</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-3 px-4 py-3.5">
        <div className="col-span-2 flex flex-col gap-0.5"><span className="text-[12px] text-brume">Cherche</span><span className="text-[15px] text-encre">{client.type_commerce || "Tout commerce"}</span></div>
        <div className="flex flex-col gap-0.5"><span className="text-[12px] text-brume">Budget</span><span className="text-[14.5px] tabular-nums text-encre">{budgetDe(client)}</span></div>
        <div className="flex flex-col gap-0.5"><span className="text-[12px] text-brume">Rendement min.</span><span className="text-[14.5px] tabular-nums text-encre">{rendement}</span></div>
        <div className="col-span-2 flex flex-col gap-0.5"><span className="text-[12px] text-brume">Zones</span><span className="text-[14px] leading-[1.45] text-craie">{zones}</span></div>
        {client.bail && <div className="col-span-2 flex flex-col gap-0.5"><span className="text-[12px] text-brume">Bail</span><span className="text-[13.5px] leading-[1.45] text-craie">{client.bail}</span></div>}
        {(exclusionsDe(client).length > 0 || veutEmplacement1(client) || veutEnseigneNationale(client)) && (
          <div className="col-span-2 flex flex-wrap gap-1.5">
            {veutEmplacement1(client) && <span className="rounded-full bg-bleu/15 px-2.5 py-0.5 text-[12px] text-bleu">Emplacement n°1 seulement</span>}
            {veutEnseigneNationale(client) && <span className="rounded-full bg-bleu/15 px-2.5 py-0.5 text-[12px] text-bleu">Enseigne nationale seulement</span>}
            {exclusionsDe(client).map((f) => <span key={f.cle} className="rounded-full bg-ambre/15 px-2.5 py-0.5 text-[12px] text-ambre">Pas de {f.mot}</span>)}
          </div>
        )}
        {client.remarque && <p className="col-span-2 m-0 text-[12.5px] leading-[1.45] text-ardoise">« {client.remarque} »</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-trait px-4 py-3">
        <span className="text-[14px]"><span className="tabular-nums text-menthe">{n}</span> <span className="text-ardoise">{n > 1 ? "commerces" : "commerce"} pour lui à {ville}</span></span>
        <button type="button" onClick={() => onChoisir("tous")} className="text-[12.5px] text-ardoise underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Tous les commerces</button>
      </div>
      {!client.couvre && <p className="m-0 border-t border-trait px-4 py-2.5 text-[12.5px] text-ambre">Il cherche ailleurs ({zones}) : changez de ville ou de client.</p>}
    </div>
  );
}

export default function Simple({ territoires, territoire, onTerritoire, espace, menu = null, bascule = null }) {
  const qc = useQueryClient();
  const [menuVille, setMenuVille] = useState(false);
  const [cherche, setCherche] = useState("");
  const [filtres, setFiltres] = useState({ ...FILTRES_SIMPLE });
  const [ouvert, setOuvert] = useState(null);
  const [onglet, setOnglet] = useState("resume"); // resume | appels | adresse
  const [tri, setTri] = useState({ cle: "rang", sens: 1 });
  const [page, setPage] = useState(0);
  const haut = useRef(null);
  // Le score Zone (équipe Klocka) : opacité des points, « Masquer les zones faibles », file « À juger » (11 oct. 2026).
  const zone = useZone(territoire?.id || null, espace === "klocka");
  const file = useFileAJuger(territoire?.id || null);
  const [masquerFaibles, setMasquerFaibles] = useState(false);
  const [seuilFaible, setSeuilFaible] = useState(40);
  const [coches, setCoches] = useState(() => new Set());
  const [versListe, setVersListe] = useState(false);
  const cocher = (c) => {
    if (c.liste) { toast.error(`Cet établissement est déjà dans la liste « ${c.liste.nom} ».`); return; }
    setCoches((x) => { const n = new Set(x); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
  };
  const [adresse, setAdresse] = useState("");
  const [resultatAdresse, setResultatAdresse] = useState(null);
  const chaine = useEtapesVives();
  const [enCours, setEnCours] = useState(false);
  const annule = useRef(null);
  const villeId = territoire?.id || null;
  const q = useQuery({ queryKey: ["off-market", "simple", "ville", villeId], queryFn: () => req("GET", `/simple/villes/${villeId}`), enabled: !!villeId, staleTime: 60_000 });
  const etat = useQuery({ queryKey: ["off-market", "simple", "etat", villeId], queryFn: () => req("GET", `/simple/villes/${villeId}/etat`), enabled: !!villeId && !!q.data, refetchInterval: (x) => ((x.state.data?.etat?.a_faire || x.state.data?.etat?.en_cours || x.state.data?.etat?.google?.etat === "en_cours" || x.state.data?.etat?.zones_en_cours) ? 5000 : x.state.data?.etat?.prix_en_cours ? 15000 : false) });
  const commerces = etat.data?.commerces || q.data?.commerces || [];
  const compte = etat.data?.etat || q.data?.etat || null;
  // Prospecter pour un client (24 oct. 2026, Jules) : côté mandataire, la carte ne montre que les commerces qui
  // répondent au client choisi ; sa fiche est à droite. « Tous les commerces » reste à un clic.
  const parClient = espace === "mandataire";
  const clientsQ = useQuery({ queryKey: ["off-market", "simple", "clients", villeId], queryFn: () => req("GET", `/simple/villes/${villeId}/clients`), enabled: parClient && !!villeId, staleTime: 5 * 60_000 });
  const clients = useMemo(() => clientsQ.data?.clients || [], [clientsQ.data]);
  const [clientId, setClientIdBrut] = useState(() => { try { return localStorage.getItem("off-market.client") || null; } catch { return null; } });
  const setClientId = (id) => { setClientIdBrut(id); try { localStorage.setItem("off-market.client", id || ""); } catch { /* sans stockage */ } };
  const nPour = useMemo(() => new Map(clients.map((d) => [d.id, commerces.filter((c) => pourClient(c, d)).length])), [clients, commerces]);
  // Ceux qui cherchent dans cette ville d'abord, puis ceux qui y ont le plus de commerces.
  const ordreClients = useMemo(() => [...clients].sort((a, b) => Number(b.couvre) - Number(a.couvre) || (nPour.get(b.id) || 0) - (nPour.get(a.id) || 0)), [clients, nPour]);
  const client = !parClient || clientId === "tous" ? null : clients.find((d) => d.id === clientId) || ordreClients[0] || null;
  const visibles = useMemo(() => {
    const t = filtres.texte.trim().toLowerCase();
    const faible = (c) => masquerFaibles && zone.points[c.id]?.score_zone != null && zone.points[c.id].score_zone < seuilFaible;
    return commerces.filter((c) => pourClient(c, client) && passeSimple(c, filtres) && !faible(c) && (!t || `${c.enseigne || ""} ${c.nom || ""} ${c.nom_google || ""} ${c.activite || ""} ${c.adresse || ""} ${c.proprietaire || ""}`.toLowerCase().includes(t)));
  }, [commerces, filtres, masquerFaibles, seuilFaible, zone.points, client]);
  // Le tableau : trié comme on clique les en-têtes, cinquante lignes par page.
  const tries = useMemo(() => {
    if (tri.cle === "rang") return visibles;
    const val = (c) => (tri.cle === "commerce" ? (c.enseigne || c.nom) : tri.cle === "lien" ? String(ORDRE_LIEN[c.lien] ?? 9) : tri.cle === "signaux" ? String(9 - c.drapeaux.length) : tri.cle === "appel" ? (c.reponse ? "0" : "1") : tri.cle === "prix" ? (c.prix ? String(1e9 - c.prix.moyenne).padStart(10, "0") : null) : c[tri.cle]) || "\uffff";
    return [...visibles].sort((a, b) => String(val(a)).localeCompare(String(val(b)), "fr") * tri.sens);
  }, [visibles, tri]);
  // La ville vue par l'emplacement choisi (le centre par défaut) : compteurs, choix des filtres, total.
  const dansZone = useMemo(() => { const base = client ? commerces.filter((c) => pourClient(c, client)) : commerces; return filtres.emplacement === "partout" ? base : base.filter((c) => c.centre !== false); }, [commerces, filtres.emplacement, client]);
  const activites = useMemo(() => { const n = {}; for (const c of dansZone) if (c.activite) n[c.activite] = (n[c.activite] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1]).map(([v, k]) => ({ v, mot: v, n: k })); }, [dansZone]);
  const PAR_PAGE = 50;
  const pages = Math.max(1, Math.ceil(tries.length / PAR_PAGE));
  useEffect(() => { setPage(0); }, [filtres, tri, villeId]);
  useEffect(() => { setCoches(new Set()); }, [villeId]);
  const resume = useMemo(() => ({
    exploitant: dansZone.filter(estExploitant).length, tiers: dansZone.filter((c) => c.lien === "tiers").length, inconnu: dansZone.filter((c) => c.lien === "inconnu").length,
    en_cours: dansZone.filter((c) => !c.lien).length, signal: dansZone.filter((c) => c.drapeaux.length).length, appeles: dansZone.filter((c) => c.reponse).length,
  }), [dansZone]);
  const dessin = useMemo(() => (zone.actif ? (c) => dessinAvecZone(dessinSimple(c), zone.points[c.id]) : dessinSimple), [zone.actif, zone.points]);
  // En file « À juger », la fiche suit la file ; la fermer quitte la file.
  useEffect(() => { if (file.courant) setOuvert(file.courant.id); }, [file.courant]);
  const fermerFiche = () => { setOuvert(null); file.arreter(); };
  // ?point= dans l'adresse (un désaccord de la page Modèle Zone) ouvre ce point, une fois.
  const pointDemande = useRef((() => { try { return new URLSearchParams(window.location.search).get("point"); } catch { return null; } })());
  useEffect(() => { if (pointDemande.current && commerces.some((c) => c.id === pointDemande.current)) { setOuvert(pointDemande.current); pointDemande.current = null; } }, [commerces]);
  const ouvrir = (id) => { setOuvert(id); haut.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // Un commerce précis, par son nom : parmi ceux de la ville, sinon sur Google Maps et au registre ; trouvé, il s'ouvre.
  const trouver = async (nom) => {
    if (!villeId || !nom) return;
    const attente = toast.loading(`Je cherche « ${nom} » ${territoire ? `à ${territoire.nom}` : ""}`);
    try {
      const r = await base44.flux(`/api/off-market/simple/villes/${villeId}/trouver`, { body: { nom } });
      toast.dismiss(attente);
      if (!r?.commerces?.length) { toast.error(`« ${nom} » introuvable${territoire ? ` à ${territoire.nom}` : ""}`, { description: "Ni parmi les commerces connus, ni sur Google Maps, ni au registre. Vérifiez l'orthographe, ou cherchez son adresse." }); return; }
      await qc.invalidateQueries({ queryKey: ["off-market", "simple", "etat", villeId] });
      setFiltres((f) => ({ ...FILTRES_SIMPLE, emplacement: f.emplacement, texte: r.commerces.length > 1 ? nom : "" }));
      ouvrir(r.commerces[0].id);
      toast.success(r.commerces.length > 1 ? `${pl(r.commerces.length, "commerce")} au nom de « ${nom} »` : `Voici ${r.commerces[0].enseigne || r.commerces[0].nom}`, { description: `${r.commerces[0].adresse} · ${LIENS[r.commerces[0].lien]?.mot || "propriétaire en cours de recherche"}` });
    } catch (e) { toast.dismiss(attente); toast.error(e?.message || "Recherche impossible"); }
  };
  // Pendant qu'on regarde une adresse précise, la carte montre cette adresse, pas la ville.
  const surCarte = useMemo(() => (onglet === "adresse" && resultatAdresse?.commerces?.length ? resultatAdresse.commerces.map((c) => ({ ...c, ville_id: `adresse:${resultatAdresse.adresse?.label}` })) : visibles), [onglet, resultatAdresse, visibles]);
  useEffect(() => { setOuvert(null); setResultatAdresse(null); }, [villeId]);

  const chercherAdresse = async (e) => {
    e?.preventDefault?.();
    if (!adresse.trim()) return;
    setOnglet("adresse"); setOuvert(null); setResultatAdresse(null); chaine.reinitialiser(); setEnCours(true);
    annule.current?.abort?.(); const ctrl = new AbortController(); annule.current = ctrl;
    try {
      const r = await base44.flux("/api/off-market/simple/adresse", { body: { adresse: adresse.trim() }, signal: ctrl.signal, surEtape: chaine.pousser });
      setResultatAdresse(r);
      if (r?.commerces?.length === 1) setOuvert(r.commerces[0].id);
      qc.invalidateQueries({ queryKey: ["off-market", "simple", "etat"] });
    } catch (err) { if (err?.name !== "AbortError") toast.error(err?.message || "Recherche impossible"); } finally { setEnCours(false); }
  };

  // Au téléphone, la légende couvrait le zoom : le panneau sous la carte donne les mêmes couleurs (25 oct. 2026).
  const legende = (
    <div className="flex items-center gap-3 rounded-full px-3 py-1.5 text-[11.5px] text-craie backdrop-blur max-md:hidden" style={{ background: "rgb(var(--k-fond-rgb) / 0.78)" }}>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: LIENS.exploitant_certain.couleur }} />exploitant propriétaire</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: LIENS.tiers.couleur }} />bailleur tiers</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full" style={{ background: LIENS.inconnu.couleur }} />inconnu</span>
      <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full opacity-50" style={{ background: LIENS.null.couleur }} />en cours</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center gap-2 md:pr-16">
        {/* La bascule de la page (Pour mes clients / Tous les commerces), en tête de la même ligne (24 oct. 2026). */}
        {bascule}
        <div className="relative">
          <button type="button" onClick={() => setMenuVille((m) => !m)} aria-expanded={menuVille} className="inline-flex h-10 min-w-[240px] items-center justify-between gap-2 rounded-full border border-bord-doux bg-rail px-3.5 text-[14px] text-encre hover:border-menthe max-md:min-w-0">
            <span className="truncate">{territoire ? territoire.nom : "Choisir une ville"}</span>
            <span className="flex items-center gap-2 text-[12.5px] text-ardoise">{compte ? pl(compte.total, "commerce") : null}<ChevronDown className="h-4 w-4" /></span>
          </button>
          {menuVille && (
            <div className="absolute left-0 top-12 z-30 w-[340px] rounded-bloc border border-bord-doux bg-surface-pleine p-2 shadow-xl">
              <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher une ville" className={`${champ} mb-1 w-full`} />
              <div className="max-h-[320px] overflow-y-auto">{territoires.filter((v) => !cherche || v.nom.toLowerCase().includes(cherche.toLowerCase())).map((v) => <button key={v.id} type="button" onClick={() => { onTerritoire(v.id); setMenuVille(false); setCherche(""); }} className={`flex w-full items-center justify-between gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] hover:bg-relief ${v.id === villeId ? "text-encre" : "text-craie"}`} style={{ background: "transparent" }}><span className="truncate">{v.nom}</span><span className="text-[12px] text-brume">{v.code_postal?.slice(0, 2)}</span></button>)}</div>
            </div>
          )}
        </div>
        <form onSubmit={chercherAdresse} className="relative h-10 w-[420px] max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brume" />
          <input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Une adresse précise : 63 rue de la République, Antibes" className={`${champ} !h-10 w-full !rounded-full !border-bord-doux !bg-rail !text-[14px] focus:!border-menthe pl-9 pr-24`} />
          <button type="submit" disabled={!adresse.trim() || enCours} className="absolute right-1 top-1 inline-flex h-8 items-center rounded-full bg-encre px-3 text-[12.5px] text-fond disabled:opacity-50">{enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Chercher"}</button>
        </form>
        <MenuFiltres filtres={filtres} setFiltres={setFiltres} commerces={dansZone} tous={commerces} zones={compte?.zones || []} activites={activites} visibles={visibles.length}
          scoreZone={zone.actif ? { masquer: masquerFaibles, seuil: seuilFaible, points: zone.points, choisir: (k) => { setMasquerFaibles(k != null); if (k != null) setSeuilFaible(k); } } : null} />
        <span className="flex-1 max-md:hidden" />
        {compte && (compte.a_faire > 0 || compte.en_cours > 0) && <span className="inline-flex h-10 max-md:hidden items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-encre"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />Propriétaires : {compte.faits} sur {compte.total}</span>}
        {/* Côté mandataire, plus de « Propriétaires lus pour n sur n » ni de « +n vus sur Google Maps » (25 oct. 2026, Jules). */}
        {espace !== "mandataire" && compte && !compte.a_faire && !compte.en_cours && <span className="inline-flex h-10 max-md:hidden items-center rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-ardoise">Propriétaires lus pour {compte.faits} sur {compte.total}</span>}
        {compte?.google?.etat === "en_cours" && <span className="inline-flex h-10 max-md:hidden items-center gap-2 rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-encre" title="Chaque famille de commerce est cherchée sur Google Maps dans la ville"><Loader2 className="h-3.5 w-3.5 animate-spin text-bleu" />Google Maps</span>}
        {espace !== "mandataire" && compte?.google?.etat === "fini" && compte.depuis_google > 0 && <span className="inline-flex h-10 max-md:hidden items-center rounded-full border border-bord-doux bg-rail px-4 text-[14px] text-ardoise" title={`${compte.google.lieux} vitrines vues sur Google Maps, ${compte.google.enrichis} rapprochées du registre`}>+{compte.depuis_google} vus sur Google Maps</span>}
        {menu}
      </div>

      {!territoire ? <Vide>Choisissez une ville, ou tapez une adresse précise.</Vide> : (<>
        {/* Au téléphone, une colonne qui tient dans l'écran (25 oct. 2026) : rien ne déborde à droite. */}
        <div ref={haut} className="grid scroll-mt-4 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_520px]">
          <div className="relative min-w-0">
            {q.isLoading && <div className="absolute inset-0 z-10 grid place-items-center rounded-bloc bg-fond/60"><p className="m-0 inline-flex items-center gap-2 text-[14px] text-encre"><Loader2 className="h-4 w-4 animate-spin text-menthe" />Les commerces {deVille(territoire.nom)}</p></div>}
            <CarteOffMarket villeId={territoire.id} locaux={surCarte} centre={territoire.centre} ouvertId={ouvert} onOuvrir={(c) => setOuvert(c.id)} outils={false} dessinPoint={dessin} legende={legende} bulle={(c) => `${c.enseigne || c.nom} · ${c.activite || ""} · ${LIENS[c.lien]?.mot || "en cours"}`} className="h-[62vh] min-h-[460px] max-md:h-[380px] max-md:min-h-0" />
          </div>
          <div className="flex h-[62vh] min-h-[460px] min-w-0 flex-col rounded-bloc border border-trait bg-surface max-md:h-auto">
            {ouvert ? <Fiche id={ouvert} onFermer={fermerFiche} onMaj={() => qc.invalidateQueries({ queryKey: ["off-market", "simple", "etat"] })}
              zone={zone} client={client} rangAJuger={file.enCours && file.courant?.id === ouvert ? file.libelle : null}
              onJuge={file.enCours && file.courant?.id === ouvert ? file.suivant : null} onPasser={file.enCours && file.courant?.id === ouvert ? file.suivant : null} /> : (<>
              <div className="flex items-center gap-2 border-b border-trait px-3 py-2.5">
                <div className="inline-flex rounded-full border border-bord-vif p-[3px]">{[["resume", territoire.nom], ...(resultatAdresse || enCours ? [["adresse", "Adresse"]] : [])].map(([k, mot]) => <button key={k} type="button" onClick={() => setOnglet(k)} className={`h-7 rounded-full px-3 text-[12.5px] ${onglet === k ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={onglet === k ? undefined : { background: "transparent" }}>{mot}</button>)}</div>
                {zone.actif && <><span className="flex-1" /><button type="button" onClick={file.demarrer} disabled={file.charge} title="D'abord les points où le score hésite, puis quelques points faibles au hasard, puis le reste" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[12.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>{file.charge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}À juger</button></>}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {onglet === "resume" && (
                  <div className="flex flex-col gap-4 p-4">
                    {parClient && <ClientProspection clients={ordreClients} client={client} nPour={nPour} ville={territoire.nom} n={visibles.length} charge={clientsQ.isLoading} onChoisir={setClientId} />}
                    <div className="overflow-hidden rounded-[12px] border border-bord-doux">
                      {[["exploitant", "Exploitants propriétaires", resume.exploitant, LIENS.exploitant_certain.couleur], ["tiers", "Bailleurs tiers", resume.tiers, LIENS.tiers.couleur], ["inconnu", "Propriétaire inconnu", resume.inconnu, LIENS.inconnu.couleur], ["en_cours", "Recherche en cours", resume.en_cours, LIENS.null.couleur]].map(([cle, mot, n, couleur]) => (
                        <button key={cle} type="button" onClick={() => setFiltres((f) => ({ ...f, liens: basculer(f.liens, cle) }))} aria-pressed={filtres.liens.includes(cle)} className={`flex w-full items-center gap-3 border-t border-trait px-4 py-3 text-left first:border-t-0 ${filtres.liens.includes(cle) ? "bg-menthe/10" : "hover:bg-relief/40"}`} style={filtres.liens.includes(cle) ? undefined : { background: "transparent" }}>
                          <span className="inline-block h-3 w-3 rounded-full" style={{ background: couleur, opacity: cle === "en_cours" ? 0.5 : 1 }} /><span className="flex-1 text-[14px] text-encre">{mot}</span><span className="text-[15px] tabular-nums text-encre">{n}</span>
                        </button>
                      ))}
                      <button type="button" onClick={() => setFiltres((f) => ({ ...f, signal: !f.signal }))} aria-pressed={filtres.signal} className={`flex w-full items-center gap-3 border-t border-trait px-4 py-3 text-left ${filtres.signal ? "bg-menthe/10" : "hover:bg-relief/40"}`} style={filtres.signal ? undefined : { background: "transparent" }}><span className="flex-1 text-[14px] text-encre">Avec une raison de vendre</span><span className="text-[15px] tabular-nums text-encre">{resume.signal}</span></button>
                    </div>
                    {compte?.zones_en_cours && <p className="m-0 inline-flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />L'IA repère les zones commerçantes {deVille(territoire.nom)}…</p>}
                    {compte?.zones?.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Les zones commerçantes</p>
                        <div className="overflow-hidden rounded-[12px] border border-bord-doux">
                          {compte.zones.map((z) => { const actif = filtres.zones.includes(z.nom); return (
                            <button key={z.nom} type="button" onClick={() => setFiltres((f) => ({ ...f, emplacement: "centre", zones: basculer(f.zones, z.nom) }))} aria-pressed={actif} title={`${z.pourquoi} Rues : ${z.rues.join(", ")}.`} className={`flex w-full items-start gap-3 border-t border-trait px-4 py-3 text-left first:border-t-0 ${actif ? "bg-menthe/10" : "hover:bg-relief/40"}`} style={actif ? undefined : { background: "transparent" }}>
                              <span className="min-w-0 flex-1"><span className="block text-[14px] text-encre">{z.nom}</span><span className="block truncate text-[12px] text-ardoise">{z.rues.slice(0, 4).join(", ")}{z.rues.length > 4 ? "…" : ""}</span></span>
                              <span className="text-[15px] tabular-nums text-encre">{compteDe(commerces, (c) => c.zone === z.nom)}</span>
                            </button>
                          ); })}
                        </div>
                      </div>
                    )}
                    <p className="m-0 text-[13px] leading-[1.5] text-ardoise">Cliquez un point de la carte ou une ligne du tableau pour voir qui possède les murs. Chaque ligne ci-dessus filtre la carte et le tableau.</p>
                  </div>
                )}
                {onglet === "adresse" && (
                  <div className="flex flex-col gap-4 p-4">
                    <p className="m-0 text-[16px] text-encre">{resultatAdresse?.adresse?.label || adresse}</p>
                    <ChaineEtapes etapes={chaine.etapes} titre="L'agent lit les registres" attente="Je cherche l'adresse" />
                    {resultatAdresse && !enCours && (
                      <div className="flex flex-col gap-2">
                        {resultatAdresse.error && <p className="m-0 text-[13.5px] text-alerte">{resultatAdresse.error}</p>}
                        {resultatAdresse.commerces?.length === 0 && <p className="m-0 text-[13.5px] text-brume">Aucun établissement actif au registre à cette adresse.</p>}
                        {(resultatAdresse.commerces || []).map((c) => <button key={c.id} type="button" onClick={() => setOuvert(c.id)} className="flex items-center gap-3 rounded-champ border border-bord-vif px-3 py-2 text-left hover:border-menthe" style={{ background: "transparent" }}><span className="inline-block h-3 w-3 rounded-full" style={{ background: LIENS[c.lien]?.couleur || JL.brume }} /><span className="min-w-0"><span className="block text-[14px] text-encre">{c.enseigne || c.nom}</span><span className="block text-[12.5px] text-ardoise">{c.proprietaire?.nom || "propriétaire inconnu"} · {LIENS[c.lien]?.mot}</span></span></button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>)}
          </div>
        </div>

        {/* Le tableau de tous les commerces, sous la carte, comme PropStream. */}
        <section className="overflow-hidden rounded-bloc border border-trait bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-trait px-4 py-3">
            <h3 className="m-0 mr-2 text-[16px] font-normal text-encre">{pl(tries.length, "commerce")}{tries.length !== dansZone.length ? <span className="text-ardoise"> sur {dansZone.length}</span> : null}{filtres.emplacement !== "partout" && <span className="text-ardoise"> {compte?.zones?.length ? "dans les zones commerçantes" : "au centre-ville"}</span>}</h3>
            <div className="relative w-[280px] max-w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brume" />
              <input value={filtres.texte} onChange={(e) => setFiltres((f) => ({ ...f, texte: e.target.value }))} placeholder="Enseigne, activité, rue, propriétaire" className={`${champ} w-full pl-8`} />
            </div>
            {nbFiltres(filtres) > 0 && <button type="button" onClick={() => setFiltres((f) => ({ ...FILTRES_SIMPLE, emplacement: f.emplacement }))} className={bouton}><X className="h-3.5 w-3.5" />Tout afficher</button>}
            <button type="button" onClick={() => setVersListe(true)} disabled={!coches.size} className={coches.size ? boutonPlein : bouton}><ListPlus className="h-3.5 w-3.5" />Envoyer vers une liste{coches.size ? ` (${coches.size})` : ""}</button>
            {coches.size > 0 && <button type="button" onClick={() => setCoches(new Set())} className={bouton}>Décocher</button>}
            <span className="flex-1" />
            <span className="text-[12.5px] text-ardoise">{tries.length ? `${page * PAR_PAGE + 1} à ${Math.min(tries.length, (page + 1) * PAR_PAGE)}` : "0"}</span>
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Page précédente" className={`${bouton} px-2.5`}><ChevronDown className="h-4 w-4 rotate-90" /></button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Page suivante" className={`${bouton} px-2.5`}><ChevronDown className="h-4 w-4 -rotate-90" /></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="w-10 border-b border-trait py-2.5 pl-4 pr-0">{(() => { const libres = tries.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).filter((c) => !c.liste); const tous = libres.length > 0 && libres.every((c) => coches.has(c.id)); return <Case oui={tous} disabled={!libres.length} label="Cocher toute la page" onBasculer={() => setCoches((x) => { const n = new Set(x); for (const c of libres) { if (tous) n.delete(c.id); else n.add(c.id); } return n; })} />; })()}</th>
                  {[["commerce", "Commerce"], ["adresse", "Adresse"], ["nom", "Exploitant"], ["proprietaire", "Propriétaire des murs"], ["lien", "Lien"], ["signaux", "Raison de vendre"], ["prix", "Prix estimé"], ["appel", "Appel"]].map(([cle, mot]) => (
                    <th key={cle} className="border-b border-trait px-4 py-2.5 text-[12px] font-normal text-ardoise">
                      <button type="button" onClick={() => setTri((t) => (t.cle === cle ? { cle, sens: -t.sens } : { cle, sens: 1 }))} className="inline-flex items-center gap-1 p-0 text-ardoise hover:text-encre" style={{ background: "transparent" }}>{mot}{tri.cle === cle && <ChevronDown className={`h-3 w-3 ${tri.sens < 0 ? "rotate-180" : ""}`} />}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tries.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map((c) => (
                  <tr key={c.id} onClick={() => ouvrir(c.id)} className={`cursor-pointer border-b border-trait last:border-b-0 ${ouvert === c.id ? "bg-menthe/10" : "hover:bg-relief/40"}`}>
                    <td className="w-10 py-2.5 pl-4 pr-0" onClick={(e) => e.stopPropagation()}><Case oui={coches.has(c.id)} onBasculer={() => cocher(c)} label={c.liste ? `Déjà dans la liste « ${c.liste.nom} »` : "Choisir pour une liste"} className={c.liste ? "opacity-35" : ""} /></td>
                    <td className="px-4 py-2.5"><span className="flex items-center gap-2.5"><span className="inline-block h-2.5 w-2.5 flex-none rounded-full" style={{ background: LIENS[c.lien]?.couleur || JL.brume, opacity: c.lien ? 1 : 0.5 }} /><span className="min-w-0"><span className="block max-w-[240px] truncate text-[14px] text-encre">{c.enseigne || c.nom}</span><span className="block max-w-[240px] truncate text-[12px] text-ardoise">{c.activite}</span></span></span></td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-[13px] text-craie">{c.adresse}</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-[13px] text-craie">{c.nom}</td>
                    <td className={`max-w-[220px] truncate px-4 py-2.5 text-[13px] ${c.proprietaire ? "text-encre" : "text-brume"}`}>{c.proprietaire || (c.lien ? "Inconnu" : "En cours")}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-craie">{c.lien ? (LIENS[c.lien]?.mot || "").replace(" (probable)", "") : "…"}</td>
                    <td className="px-4 py-2.5"><span className="flex flex-wrap gap-1">{c.drapeaux.slice(0, 2).map((d) => <span key={d} className="whitespace-nowrap rounded-full bg-relief px-2 py-0.5 text-[11.5px] text-craie">{DRAPEAUX_COURTS[d] || d}</span>)}{c.drapeaux.length > 2 && <span className="text-[11.5px] text-brume">+{c.drapeaux.length - 2}</span>}</span></td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] tabular-nums">{c.prix ? <span className="text-encre" title={`Entre ${euros(c.prix.basse)} et ${euros(c.prix.haute)}`}>{euros(c.prix.moyenne)}</span> : <span className="text-brume">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px]">{c.reponse ? <span className="text-menthe">{REPONSES[c.reponse]?.split(",")[0] || "Appelé"}</span> : c.appel_prospection ? <span className="text-menthe">{c.appel_prospection}</span> : c.liste ? <button type="button" onClick={(e) => { e.stopPropagation(); ouvrirListe(c.liste.id); }} className="p-0 text-bleu underline-offset-4 hover:underline" style={{ background: "transparent" }}>Liste « {c.liste.nom} »</button> : <span className="text-brume">À appeler</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tries.length && !q.isLoading && (filtres.texte.trim()
              ? <div className="flex flex-col items-center gap-3 py-10"><p className="m-0 text-[14px] text-brume">Aucun commerce connu à ce nom ici.</p><button type="button" onClick={() => trouver(filtres.texte.trim())} className={boutonPlein}><Search className="h-3.5 w-3.5" />Chercher « {filtres.texte.trim()} » sur Google Maps et au registre</button></div>
              : <Vide>Aucun commerce avec ces filtres.</Vide>)}
          </div>
        </section>
        {/* La barre « Que cherchez-vous ? » en bas de page est retirée (19 oct. 2026, Jules) : la recherche du haut et les filtres suffisent. */}
        {versListe && <FenetreListe ids={[...coches]} onFermer={() => setVersListe(false)} onFait={() => { setVersListe(false); setCoches(new Set()); qc.invalidateQueries({ queryKey: ["off-market", "simple", "etat"] }); }} />}
      </>)}
    </div>
  );
}
