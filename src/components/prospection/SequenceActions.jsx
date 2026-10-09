import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Eye, Info, Loader2, X } from "lucide-react";
import jetons from "@/design/jetons.json";
import Calendrier from "@/components/ui/calendrier";

// Les actions proposées après un appel abouti, en séquence (maquette de
// Jules, 7 oct. 2026) : ce qui part maintenant (Monday, le mail du modèle, la
// liste de diffusion), puis le rappel à la date dite, modifiable. Chaque étape
// a son œil (le détail : ce qui change dans Monday, le mail à relire, la date)
// et son interrupteur ; Monday ne se décoche pas pour un appel abouti. Le
// tracé se dessine une fois à l'ouverture.

const MAILS = { "presentation-cahier": "Présentation + cahier des charges", presentation: "Présentation seule", "demande-fiche": "Murs commerciaux · fiche commerciale", "demande-documents": "Murs commerciaux · documents du dossier" };
const ISSUES = { pas_de_reponse: "Pas de réponse", repondeur: "Répondeur, message laissé", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien intéressant", pas_interesse: "Pas intéressé" };
const jourLong = (j) => (j ? new Date(`${String(j).slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");
const lenteur = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Un trait vertical entre deux étapes, qui se dessine de haut en bas selon p.
 * À gauche, comme le fil d'une séquence d'Emailing (9 oct. 2026) ; à sa
 * droite, le moment de la carte qui suit (« Maintenant », « Vendredi
 * 30 octobre »), dans la police des délais de l'Emailing, hors de la carte.
 */
const Trait = ({ p, h = 40, moment = null }) => (
  <div className="flex items-center">
    <div className="relative ml-[22px] w-px flex-none overflow-hidden bg-bord-doux" style={{ height: h }}>
      <div className="absolute left-0 top-0 w-full bg-menthe/50" style={{ height: `${p * 100}%` }} />
    </div>
    {moment && <span className={`ml-3 text-[12.5px] transition-opacity duration-300 ${p > 0.3 ? "text-craie opacity-100" : "opacity-0"}`}>{moment}</span>}
  </div>
);

/** L'interrupteur d'une étape. */
function Interrupteur({ on, onChange, petit = false, label }) {
  const l = petit ? "w-8 h-[18px]" : "w-[38px] h-[22px]";
  const k = petit ? "h-[14px] w-[14px] top-[2px]" : "h-4 w-4 top-[3px]";
  const x = on ? (petit ? "left-[16px]" : "left-[19px]") : (petit ? "left-[2px]" : "left-[3px]");
  return (
    <button type="button" onClick={onChange} aria-pressed={on} aria-label={label} className="flex flex-none py-2 pl-1" style={{ background: "transparent" }}>
      <span className={`relative rounded-full transition-colors ${l} ${on ? "bg-menthe" : "bg-bord-vif"}`}>
        <span className={`absolute rounded-full transition-[left] ${k} ${x} ${on ? "bg-sur-menthe" : "bg-ardoise"}`} />
      </span>
    </button>
  );
}

const BoutonOeil = ({ onClick }) => (
  <button type="button" onClick={onClick} aria-label="Voir le détail" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
    <Eye className="h-[18px] w-[18px]" strokeWidth={1.6} />
  </button>
);

/**
 * Une étape d'une carte : le libellé seul (9 oct. 2026 : le détail est dans
 * l'œil), sauf ce qui demande un regard (adresse manquante, contact à
 * choisir), dit en ambre dessous ; puis l'œil et l'interrupteur.
 */
function Etape({ e }) {
  return (
    <div className="flex min-h-[40px] items-center gap-1.5 py-0.5">
      <span className={`flex min-w-0 flex-1 flex-col gap-0.5 transition-opacity ${e.on ? "" : "opacity-40"}`}>
        <span className={`text-[15.5px] text-encre ${e.on ? "" : "line-through"}`}>{e.label}</span>
        {e.warn && e.on && e.detail && <span className="text-[12.5px] text-ambre">{e.detail}</span>}
      </span>
      <BoutonOeil onClick={e.voir} />
      {e.basculer && <Interrupteur on={e.on} onChange={e.basculer} label={`${e.on ? "Retirer" : "Remettre"} : ${e.label}`} />}
    </div>
  );
}

/** Une carte d'étapes : elle apparaît tout de suite, déjà bordée ; son moment est écrit au-dessus, hors d'elle. */
function Carte({ etapes }) {
  const actif = etapes.some((e) => e.on);
  return (
    <div className={`relative rounded-[18px] border border-bord-doux bg-transparent px-[18px] py-1.5 duration-300 animate-in fade-in-0 transition-opacity ${actif ? "" : "opacity-45"}`}>
      {etapes.map((e) => <Etape key={e.k} e={e} />)}
    </div>
  );
}

const enJour = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? jourLong(v).replace(/^./, (c) => c.toUpperCase()) : v);

/** Une zone de texte aussi haute que son texte (8 oct. 2026) : le mail se lit jusqu'en bas en faisant défiler la fenêtre, sans barre à lui. */
function ZoneQuiGrandit({ valeur, onChange, lignes, label, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [valeur]);
  return <textarea ref={ref} value={valeur} onChange={(x) => onChange(x.target.value)} rows={lignes} aria-label={label} className={className} />;
}

/** Une date qui se lit comme une valeur (« Lundi 27 octobre ») ; un clic ouvre le calendrier dans un petit menu. */
function ChampDate({ valeur, onChoisir, label }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} title="Changer la date"
        className="-mx-2 rounded-champ border border-transparent px-2 py-0.5 text-left text-[14.5px] leading-[1.45] text-encre hover:border-bord-doux" style={{ background: "transparent" }}>
        {valeur ? enJour(valeur) : "Choisissez un jour"}
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-[85]" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 top-full z-[90] mt-2 rounded-[14px] border border-bord-vif bg-surface-pleine p-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            <Calendrier valeur={valeur || ""} onChoisir={(d) => { onChoisir(d); setOuvert(false); }} label={label} />
          </div>
        </>
      )}
    </div>
  );
}

// --- La ligne Monday, telle que Monday la montre (9 oct. 2026) -----------------
// Les colonnes dans l'ordre du tableau Agents immobiliers, les cellules au
// dessin de Monday : lien bleu pour l'e-mail, drapeau et numéro, étiquettes de
// statut pleines, puce pour l'entreprise, date « oct. 14 ». L'analyste y
// reconnaît la ligne qu'il retrouvera dans Monday. Contact, téléphone, e-mail et
// prochaine relance se corrigent dans la cellule.
const MO = jetons.monday;
const ORDRE_MONDAY = ["Contact", "SPOC", "Prénom", "Date", "E-mail", "Téléphone", "Statut", "Dernier contact", "Liste de diffusion", "Ville", "Entreprise", "Remarques", "Prochaine relance"];
const LARGEURS_MONDAY = { Contact: 210, SPOC: 80, "Prénom": 110, Date: 110, "E-mail": 210, "Téléphone": 170, Statut: 180, "Dernier contact": 170, "Liste de diffusion": 140, Ville: 130, Entreprise: 170, Remarques: 280, "Prochaine relance": 160 };
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const dateMonday = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || "")) ? `${MOIS_COURTS[Number(String(v).slice(5, 7)) - 1]} ${Number(String(v).slice(8, 10))}` : v || "");
const initiales = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");

function CelluleMonday({ col }) {
  const [ouvert, setOuvert] = useState(false);
  const v = col.valeur;
  const vide = !String(v ?? "").trim();
  const champ = "w-full min-w-0 bg-transparent px-2 text-center text-[14px] outline-none";
  if (col.edit?.type === "texte") {
    const lien = col.titre === "E-mail" || col.titre === "Téléphone";
    return (
      <span className="flex h-full items-center justify-center gap-2 px-2">
        {col.titre === "Téléphone" && !vide && <Drapeau />}
        <input value={col.edit.valeur ?? ""} onChange={(e) => col.edit.changer(e.target.value)} placeholder={col.edit.placeholder} aria-label={col.titre} title={col.edit.valeur || col.edit.placeholder}
          className={`${champ} ${col.titre === "Contact" ? "text-left" : ""} focus:rounded-[4px] focus:ring-1`} style={{ color: lien ? MO.lien : MO.texte, "--tw-ring-color": MO.lien }} />
      </span>
    );
  }
  if (col.edit?.type === "date") {
    return (
      <span className="relative flex h-full items-center justify-center">
        <button type="button" onClick={() => setOuvert((x) => !x)} title="Changer la date" className="flex items-center gap-2 px-2 text-[14px]" style={{ background: "transparent", color: MO.texte }}>
          <HorlogeMonday />{dateMonday(col.edit.valeur) || "—"}
        </button>
        {ouvert && (
          <>
            <div className="fixed inset-0 z-[85]" onClick={() => setOuvert(false)} />
            <div className="absolute right-0 top-full z-[90] mt-2 rounded-[14px] border border-bord-vif bg-surface-pleine p-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
              <Calendrier valeur={col.edit.valeur || ""} onChoisir={(d) => { col.edit.changer(d); setOuvert(false); }} label={col.titre} />
            </div>
          </>
        )}
      </span>
    );
  }
  if (["Statut", "Liste de diffusion"].includes(col.titre) && !vide && v !== "v") {
    return <span className="flex h-full items-center justify-center truncate px-2 text-[14px]" title={v} style={{ background: MO.etiquettes[v] || MO.etiquette_defaut, color: MO.fond }}>{v}</span>;
  }
  if (col.titre === "Liste de diffusion" && v === "v") return <span className="flex h-full items-center justify-center"><Check className="h-4 w-4" style={{ color: MO.etiquettes.Oui }} strokeWidth={3} /></span>;
  if (col.titre === "Entreprise" && !vide) return <span className="flex h-full items-center justify-center px-2"><span className="truncate rounded-[4px] px-2 py-0.5 text-[14px]" title={v} style={{ background: MO.puce, color: MO.texte }}>{v}</span></span>;
  if (col.titre === "SPOC" && !vide) return <span className="flex h-full items-center justify-center" title={v}><span className="grid h-[26px] w-[26px] place-items-center rounded-full text-[11px]" style={{ background: MO.avatar, color: MO.fond }}>{initiales(v)}</span></span>;
  if (["Date", "Prochaine relance"].includes(col.titre)) return <span className="flex h-full items-center justify-center gap-2 px-2 text-[14px]" style={{ color: MO.texte }}>{col.titre === "Prochaine relance" && !vide && <HorlogeMonday />}{vide ? "" : dateMonday(v)}</span>;
  return <span className={`block truncate px-2 text-[14px] leading-[36px] ${col.titre === "Contact" ? "text-left" : "text-center"}`} title={v} style={{ color: vide ? MO.texte_doux : MO.texte }}>{vide ? "" : v}</span>;
}

const Drapeau = () => (
  <span className="flex h-[14px] w-[21px] flex-none overflow-hidden rounded-[1px]" aria-label="France">
    <span className="flex-1" style={{ background: MO.drapeau_bleu }} /><span className="flex-1" style={{ background: MO.drapeau_blanc }} /><span className="flex-1" style={{ background: MO.drapeau_rouge }} />
  </span>
);
const HorlogeMonday = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke={MO.texte_doux} strokeWidth="1.4" /><path d="M8 8 L8 1.5 A6.5 6.5 0 0 1 13.6 11.2 Z" fill={MO.texte_doux} /></svg>
);

function TableauMonday({ colonnes }) {
  const cols = [...colonnes].sort((a, b) => ORDRE_MONDAY.indexOf(a.titre) - ORDRE_MONDAY.indexOf(b.titre));
  const bord = { borderColor: MO.trait };
  return (
    <div className="overflow-x-auto rounded-[8px] border" style={{ ...bord, background: MO.fond, fontFamily: "Figtree, 'Instrument Sans', system-ui, sans-serif" }}>
      <table className="border-collapse" style={{ minWidth: "100%" }}>
        <thead>
          <tr>
            {cols.map((c, n) => (
              <th key={c.titre} className={`h-[36px] px-2 text-[14px] font-normal ${n ? "border-l" : ""} ${c.titre === "Contact" ? "sticky left-0 z-10 text-left" : "text-center"}`} style={{ ...bord, color: MO.texte, background: MO.entete, minWidth: LARGEURS_MONDAY[c.titre] || 140, maxWidth: LARGEURS_MONDAY[c.titre] || 140, paddingLeft: c.titre === "Contact" ? 14 : undefined }}>
                <span className="inline-flex items-center gap-1.5">{c.titre}{c.titre === "Prochaine relance" && <Info className="h-4 w-4" style={{ color: MO.texte_doux }} />}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {cols.map((c, n) => (
              <td key={c.titre} className={`relative h-[36px] border-t p-0 ${n ? "border-l" : ""} ${c.titre === "Contact" ? "sticky left-0 z-10" : ""}`} style={{ ...bord, background: MO.fond, minWidth: LARGEURS_MONDAY[c.titre] || 140, maxWidth: LARGEURS_MONDAY[c.titre] || 140 }}>
                {c.titre === "Contact" && <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: MO.groupe }} aria-hidden />}
                <span className={`block h-full ${c.titre === "Contact" ? "pl-2" : ""}`}><CelluleMonday col={c} /></span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Une ligne du détail (maquette de Jules, 8 oct. 2026) : le libellé à gauche,
 * la valeur à droite, un trait dessous. Un point bleu devant le libellé : ce
 * qu'AK écrit. Une ligne qui a `edit` se change d'un clic ; les autres se lisent.
 */
function Case({ c }) {
  const bleu = !!c.statut;
  const saisie = "w-full min-w-0 -mx-2 rounded-champ border border-transparent bg-transparent px-2 py-0.5 text-[14.5px] leading-[1.45] text-encre outline-none hover:border-bord-doux focus:border-bleu max-md:text-[16px]";
  const e = c.edit;
  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,120px)_minmax(0,1fr)] items-start gap-x-5 gap-y-1 border-b border-trait py-3.5 max-md:grid-cols-1 max-md:py-3 ${c.large ? "md:col-span-2" : ""}`}>
      <span className={`flex items-start gap-2 pt-[3px] text-[13px] leading-[1.35] ${bleu ? "text-bleu" : "text-ardoise"}`}>
        {bleu && <span className="mt-[5px] h-1.5 w-1.5 flex-none rounded-full bg-bleu" aria-hidden />}
        <span>{c.label}</span>
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        {e?.type === "date" && <ChampDate valeur={e.valeur} onChoisir={e.changer} label={c.label} />}
        {e?.type === "texte" && <input value={e.valeur ?? ""} onChange={(x) => e.changer(x.target.value)} placeholder={e.placeholder || "—"} aria-label={c.label} className={`${saisie} ${c.warn ? "text-ambre" : ""}`} />}
        {e?.type === "zone" && <ZoneQuiGrandit valeur={e.valeur ?? ""} onChange={e.changer} lignes={e.lignes || 3} label={c.label} className={`${saisie} resize-none overflow-hidden text-[14px] leading-[1.6]`} />}
        {!e && <span className={`whitespace-pre-line text-[14.5px] leading-[1.5] [text-wrap:pretty] ${c.warn ? "text-ambre" : c.valeur ? "text-encre" : "text-brume"}`}>{c.valeur || "—"}</span>}
        {c.source && <span className="text-[12px] text-menthe">{c.source}</span>}
      </div>
    </div>
  );
}

/**
 * Le détail des étapes, en fenêtre (maquette de Jules, 8 oct. 2026) : en
 * haut, sur fond sombre, le nom de l'étape au centre, « 1 / 8 » et la croix ;
 * dessous la frise des étapes (une barre chacune, la courante en blanc,
 * « Maintenant » puis chaque date de relance au-dessus de la première de son
 * groupe, les étapes retirées en gris). Le corps, plus clair, en lignes
 * libellé / valeur sur deux colonnes. En pied : Précédente, Rétablir, Suivante.
 */
/** Une ligne de l'envoi : en cours (roue), fait et relu (coche), à faire (orange), raté (croix). */
function LigneEnvoi({ l, nom, children = null }) {
  if (!l) return null;
  const orange = ["brouillon", "doute"].includes(l.etat);
  const icone = l.etat === "ok" ? <Check className="h-4 w-4 text-menthe" strokeWidth={2.4} /> : l.etat === "attente" ? <Loader2 className="h-4 w-4 animate-spin text-ardoise" /> : l.etat === "echec" ? <X className="h-4 w-4 text-alerte" /> : orange ? <span className="text-[15px] text-ambre">!</span> : <span className="text-brume">·</span>;
  return (
    <div className="flex flex-col gap-2 border-b border-trait py-3 duration-300 animate-in fade-in-0">
      <div className="grid grid-cols-[24px_minmax(0,170px)_minmax(0,1fr)] items-center gap-3 max-md:grid-cols-[24px_minmax(0,1fr)]">
        <span className="grid h-5 w-5 place-items-center">{icone}</span>
        <span className={`text-[14px] transition-colors ${l.etat === "ok" ? "text-encre" : "text-craie"}`}>{nom}</span>
        <span className={`min-w-0 break-words text-[13px] max-md:col-start-2 ${orange ? "text-ambre" : l.etat === "echec" ? "text-alerte" : "text-ardoise"}`}>{l.texte}</span>
      </div>
      {children}
    </div>
  );
}

function Panneau({ pas, ouverte, setOuverte, contenuDe, onFermer, onValider = null, validable = true, envoi = false, envoiFenetre = null, onQuitterEnvoi = null, onVoir = null }) {
  // L'envoi suivi dans la fenêtre (8 oct. 2026) : validé d'ici, on y voit chaque ligne passer de « en cours » à « fait ».
  const enEnvoi = !!envoiFenetre;
  const re = envoiFenetre?.recu || null;
  const fermer = () => { if (enEnvoi) onQuitterEnvoi?.(); onFermer(); };
  // L'écran de fin (8 oct. 2026) : après la dernière étape, « Terminer » dit que tout est vu, avant de valider.
  const [fini, setFini] = useState(false);
  const ouvrir = (k) => { setFini(false); setOuverte(k); };
  useEffect(() => {
    const f = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onFermer]);
  const i = Math.max(0, pas.findIndex((x) => x.k === ouverte));
  const courant = pas[i];
  // Le suivi de l'usage (9 oct. 2026) : les étapes réellement ouvertes avant de valider.
  useEffect(() => { onVoir?.(courant.k); }, [courant.k]);
  const c = contenuDe(courant.q);
  // Le sens du glissement (8 oct. 2026) : l'étape suivante arrive de la droite, la précédente de la gauche.
  const avant = useRef(i);
  const sens = i >= avant.current ? "slide-in-from-right-6" : "slide-in-from-left-6";
  useEffect(() => { avant.current = i; }, [i]);
  // La barre blanche de l'étape ouverte glisse d'une étape à l'autre (9 oct. 2026) : une seule barre, posée sur celle de l'étape.
  const barres = useRef({});
  const [repere, setRepere] = useState(null);
  const actifK = !fini && !enEnvoi ? courant.k : null;
  useLayoutEffect(() => {
    const el = actifK ? barres.current[actifK] : null;
    setRepere(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth } : null);
    el?.parentElement?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [actifK, pas.length]);
  const gardees = pas.filter((x) => x.on);
  const retirees = pas.filter((x) => !x.on);
  const cases = c.cases || [];
  // Une ligne seule en fin de grille prend toute la largeur : pas de trou.
  const simples = cases.filter((x) => !x.large).length;
  const bleues = cases.some((x) => x.statut);
  // Rendue dans le body : sous un parent qui crée son propre empilement, la barre du téléphone passait devant.
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-fond/80 p-6 backdrop-blur-xl md:left-[var(--k-barre-largeur)] max-md:p-0" onMouseDown={(e) => { if (e.target === e.currentTarget && !enEnvoi) fermer(); }}>
      <div role="dialog" aria-modal="true" aria-label={fini ? "Étapes vérifiées" : courant.court}
        className="flex h-[min(680px,100%)] w-full max-w-[1000px] flex-col overflow-hidden rounded-[28px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:h-full max-md:max-h-none max-md:max-w-none max-md:rounded-none">
        <div className="flex-none bg-black/55 px-8 pt-6 [[data-theme=clair]_&]:bg-fond max-md:px-4 max-md:pt-[calc(14px+env(safe-area-inset-top))]">
          <div className="relative flex min-h-[52px] items-center justify-center">
            <h2 key={enEnvoi ? "envoi" : fini ? "fini" : courant.k} className="m-0 truncate px-28 duration-300 animate-in fade-in-0 text-center text-[22px] font-normal leading-[1.15] tracking-[-0.01em] text-encre max-md:px-20 max-md:text-[18px]">{enEnvoi ? "Envoi en cours" : fini ? "Étapes vérifiées" : courant.court}</h2>
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-4 max-md:gap-2">
              <span className="text-[13px] tabular-nums text-ardoise">{fini ? `${pas.length} / ${pas.length}` : `${i + 1} / ${pas.length}`}</span>
              <button type="button" onClick={fermer} aria-label="Fermer" className="grid h-10 w-10 place-items-center rounded-full border border-bord-doux text-craie hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
          </div>
          <nav aria-label="Les étapes" className="relative mt-4 flex gap-3 overflow-x-auto pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pas.map((x, n) => {
              const actif = !fini && !enEnvoi && x.k === courant.k;
              const debut = n === 0 || pas[n - 1].groupe !== x.groupe;
              return (
                <button key={x.k} type="button" onClick={() => ouvrir(x.k)} aria-current={actif ? "step" : undefined}
                  className="flex min-w-[100px] flex-1 flex-col items-stretch gap-2 p-0 text-left" style={{ background: "transparent" }}>
                  <span className="h-4 truncate text-[11px] uppercase tracking-[.16em] text-ardoise">{debut ? x.groupe : ""}</span>
                  <span ref={(el) => { barres.current[x.k] = el; }} className={`h-[3px] w-full rounded-full transition-colors duration-500 ${(fini || enEnvoi) && x.on ? "bg-menthe" : "bg-relief"}`} />
                  <span className={`truncate pt-1 text-[13px] transition-colors ${actif ? "text-encre" : x.on ? "text-craie hover:text-encre" : "text-brume"}`}>{x.court}</span>
                </button>
              );
            })}
            {repere && <span aria-hidden className="pointer-events-none absolute h-[5px] rounded-full bg-encre transition-[left,width,top] duration-500 ease-[cubic-bezier(.22,1,.36,1)]" style={{ left: repere.x, top: repere.y - 1, width: repere.w }} />}
          </nav>
        </div>
        {enEnvoi ? (
          <div key="envoi" className="k-fond-points min-h-0 flex-1 overflow-y-auto px-8 py-8 duration-300 animate-in fade-in-0 max-md:px-4 max-md:py-6">
            <p className="m-0 text-[13.5px] text-ardoise">Validé. Chaque ligne se coche une fois relue.</p>
            <div className="mt-5 border-t border-trait">
              {!re && <div className="flex items-center gap-3 py-3 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Validation en cours</div>}
              {re && (
                <>
                  <LigneEnvoi l={re.monday} nom="Contact Monday">
                    {re.monday?.etat === "doute" && (
                      <div className="ml-9 flex flex-col gap-1.5">
                        {(re.monday.candidates || []).map((c) => <button key={c.id} type="button" onClick={() => envoiFenetre.onChoisirLigne(c.id)} className="rounded-champ border border-trait px-3 py-2 text-left text-[14px] text-encre hover:border-bord-doux" style={{ background: "transparent" }}>{c.nom} <span className="text-ardoise">· {[c.entreprise, c.ville, c.telephone].filter(Boolean).join(" · ")}</span></button>)}
                        <button type="button" onClick={() => envoiFenetre.onChoisirLigne("nouvelle")} className="rounded-champ border border-trait px-3 py-2 text-left text-[14px] text-craie hover:border-bord-doux" style={{ background: "transparent" }}>Aucun : nouveau contact</button>
                      </div>
                    )}
                  </LigneEnvoi>
                  <LigneEnvoi l={re.mail} nom="Email">
                    {re.mail?.etat === "brouillon" && <button type="button" onClick={envoiFenetre.onBrouillon} className="ml-9 self-start rounded-full border border-ambre/40 px-3.5 py-1.5 text-[13px] text-ambre" style={{ background: "transparent" }}>Ouvrir le brouillon</button>}
                  </LigneEnvoi>
                  <LigneEnvoi l={re.diffusion} nom="Liste de diffusion" />
                  <LigneEnvoi l={re.relance} nom="Relance" />
                  {(re.extras || []).map((x, k) => <LigneEnvoi key={k} l={x} nom="Aussi" />)}
                </>
              )}
            </div>
          </div>
        ) : fini ? (
          <div className="k-fond-points min-h-0 flex-1 overflow-y-auto px-8 py-10 max-md:px-4 max-md:py-8">
            <div className="mx-auto flex max-w-[560px] flex-col items-center gap-4 text-center duration-500 animate-in fade-in-0 zoom-in-95">
              <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-menthe text-sur-menthe"><Check className="h-10 w-10" strokeWidth={2.2} /></span>
              <p className="m-0 text-[19px] text-encre">Toutes les étapes sont vérifiées</p>
              <p className="m-0 text-[13.5px] leading-[1.55] text-ardoise">
                {gardees.length} à valider{retirees.length ? ` · ${retirees.length} retirée${retirees.length > 1 ? "s" : ""}` : ""}
              </p>
            </div>
            <div className="mx-auto mt-8 grid max-w-[640px] border-t border-trait">
              {pas.map((x) => (
                <button key={x.k} type="button" onClick={() => ouvrir(x.k)} className="flex items-center gap-3 border-b border-trait py-2.5 text-left" style={{ background: "transparent" }}>
                  {x.on ? <Check className="h-4 w-4 flex-none text-menthe" strokeWidth={2.2} /> : <X className="h-4 w-4 flex-none text-brume" />}
                  <span className={`min-w-0 flex-1 truncate text-[14px] ${x.on ? "text-encre" : "text-brume line-through"}`}>{x.court}</span>
                  <span className="flex-none text-[12px] text-ardoise">{x.groupe === "Maintenant" ? "à la validation" : x.groupe}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
        <div key={courant.k} className={`k-fond-points min-h-0 flex-1 overflow-y-auto px-8 pt-5 duration-300 ease-out animate-in fade-in-0 max-md:px-4 max-md:pt-4 ${sens}`}>
          {!courant.on && <p className="m-0 mb-3 text-[13px] text-ambre">Étape retirée : elle ne partira pas.</p>}
          <div className="flex flex-col gap-2.5 text-[13.5px] text-ardoise">{c.haut || (c.titre && c.titre !== courant.court && <p className="m-0">{c.titre}</p>)}</div>
          {c.tableau && <div className="mt-4">{c.tableau}</div>}
          {cases.length > 0 && (
            <div className="mt-4 grid border-t border-trait md:grid-cols-2 md:gap-x-12">
              {cases.map((x, n) => <Case key={`${x.label}-${n}`} c={!x.large && simples % 2 === 1 && cases.slice(n + 1).every((y) => y.large) ? { ...x, large: true } : x} />)}
            </div>
          )}
          {c.aide && (
            <p className="m-0 mt-4 flex items-center gap-2.5 text-[12.5px] leading-[1.5] text-ardoise">
              {bleues && <span className="h-2 w-2 flex-none rounded-full bg-bleu" aria-hidden />}{c.aide}
            </p>
          )}
          <div className="h-6" />
        </div>
        )}
        <div className="flex flex-none items-center gap-6 border-t border-trait bg-surface-pleine px-8 py-4 max-md:gap-5 max-md:px-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom))]">
          {enEnvoi ? (
            <>
              {envoiFenetre.annulerDans > 0
                ? <button type="button" onClick={envoiFenetre.onAnnuler} disabled={envoiFenetre.annulation} className="h-11 rounded-full border border-trait px-5 text-[14px] text-encre hover:bg-relief disabled:opacity-50" style={{ background: "transparent" }}>{envoiFenetre.annulation ? "Annulation…" : `Annuler · ${envoiFenetre.annulerDans} s`}</button>
                : <span className="text-[13.5px] text-ardoise">Trop tard pour annuler : tout part.</span>}
              <span className="ml-auto flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours</span>
            </>
          ) : fini ? (
            <>
              <button type="button" onClick={() => ouvrir(pas[pas.length - 1].k)} className="p-0 text-[14.5px] text-ardoise transition-colors hover:text-encre max-md:text-[13.5px]" style={{ background: "transparent" }}>← Revoir</button>
              <button type="button" onClick={onFermer} className="p-0 text-[14.5px] text-ardoise transition-colors hover:text-encre max-md:text-[13.5px]" style={{ background: "transparent" }}>Fermer</button>
              {onValider && (
                <button type="button" onClick={() => onValider({ depuisFenetre: true })} disabled={!validable || envoi}
                  className="ml-auto h-11 rounded-full bg-menthe px-8 text-[14.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40 max-md:h-10 max-md:px-6 max-md:text-[13.5px]">
                  {envoi ? "Validation…" : `Valider · ${gardees.length} étape${gardees.length > 1 ? "s" : ""}`}
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" disabled={i === 0} onClick={() => setOuverte(pas[i - 1].k)} className="p-0 text-[14.5px] text-ardoise transition-colors hover:text-encre disabled:opacity-40 max-md:text-[13.5px]" style={{ background: "transparent" }}>← Précédente</button>
              <button type="button" disabled={!c.retablir} onClick={() => c.retablir?.()} className="p-0 text-[14.5px] text-ardoise transition-colors hover:text-encre disabled:opacity-40 max-md:text-[13.5px]" style={{ background: "transparent" }}>Rétablir</button>
              {/* Valider d'ici, à n'importe quelle étape (8 oct. 2026) : la fenêtre reste ouverte et suit l'envoi. */}
              {onValider && (
                <button type="button" onClick={() => onValider({ depuisFenetre: true })} disabled={!validable || envoi}
                  className="ml-auto h-11 rounded-full border border-menthe/60 px-7 text-[14.5px] text-menthe hover:bg-menthe/10 disabled:opacity-40 max-md:h-10 max-md:px-5 max-md:text-[13.5px]" style={{ background: "transparent" }}>
                  {envoi ? "Validation…" : `Valider · ${gardees.length}`}
                </button>
              )}
              <button type="button" onClick={() => (i < pas.length - 1 ? setOuverte(pas[i + 1].k) : setFini(true))}
                className={`${onValider ? "" : "ml-auto "}h-11 rounded-full bg-encre px-8 text-[14.5px] text-fond hover:opacity-90 max-md:h-10 max-md:px-6 max-md:text-[13.5px]`}>{i < pas.length - 1 ? "Suivante →" : "Terminer"}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * @param {{appel, agence, issue, coches: Set, setCoches, mail, setMail, relanceLe, setRelanceLe, ligneMonday, setLigneMonday, onLancer, envoi}} props
 */
export default function SequenceActions({ appel, agence, issue, coches, setCoches, mail, setMail, relanceLe, setRelanceLe, relance2Le, setRelance2Le, ligneMonday, setLigneMonday, edits = null, setEdits = null, onChangerIssue = null, changementEnCours = false, issuesEnPlus = null, onLancer, envoi = false, envoiFenetre = null, onQuitterEnvoi = null }) {
  // Relances (8 oct. 2026) : « Agent prévenu » s'ajoute aux issues pour un bien retenu ou refusé.
  const ISS = issuesEnPlus ? { ...ISSUES, ...issuesEnPlus } : ISSUES;
  const props = appel.propositions || [];
  const par = (t) => props.find((p) => p.type === t);
  const pm = par("mail");
  const pr = par("relance");
  const pr2 = par("relance_suivante");
  const pmo = par("monday");
  const pdi = par("diffusion");
  const compris = appel.compris?.champs || {};
  // Le nom seul (8 oct. 2026) : ni « président de SAS », ni numéro, ni civilité.
  const nomSeul = (t) => String(t || "").split(/[,·(]/)[0].replace(/^(madame|monsieur)\s+/i, "").trim() || null;
  const interlocuteur = nomSeul(compris.interlocuteur?.valeur) || (agence?.contacts || []).find((x) => !x.standard)?.nom || nomSeul(agence?.interlocuteurs?.[0]) || nomSeul(appel.avant?.interlocuteur);
  const [ouverte, setOuverte] = useState(null);
  const vues = useRef(new Set());
  const [choixIssue, setChoixIssue] = useState(false);
  const [debut] = useState(() => performance.now());
  const [t, setT] = useState(() => (lenteur() ? 99 : 0));
  const ligne = pmo?.ligne || null;
  const doute = ligne?.etat === "doute" && !ligneMonday;

  const segments = useMemo(() => {
    // Les cartes sont là d'emblée ; seuls les traits se dessinent, l'un après l'autre.
    const l = [["v0", 0.45, 0.15], ["v1", 0.45, 0.1], ["v2", 0.4, 0.1]];
    let x = 0;
    const out = {};
    for (const [k, d, avant0 = 0] of l) { x += avant0; out[k] = [x, d]; x += d; }
    return { out, fin: x };
  }, []);
  useEffect(() => {
    if (lenteur()) return undefined;
    let ra;
    const f = (now) => { const e = (now - debut) / 1000; setT(e); if (e < segments.fin) ra = requestAnimationFrame(f); };
    ra = requestAnimationFrame(f);
    return () => cancelAnimationFrame(ra);
  }, [debut, segments.fin]);
  const p = (k) => { const sg = segments.out[k]; return sg ? Math.max(0, Math.min(1, (t - sg[0]) / sg[1])) : 0; };

  const basculer = (id) => () => setCoches((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const modifie = pm && mail && (mail.objet !== pm.objet || mail.corps !== pm.corps || (mail.a || "") !== (pm.a || ""));
  const dateRelance = relanceLe || pr?.prochaine?.le;
  const choisie = ligneMonday ? (ligneMonday === "nouvelle" ? { nom: "Nouveau contact" } : (ligne?.candidates || []).find((c) => c.id === ligneMonday)) : null;

  // Le mail tel qu'il partira : celui retouché, sinon celui du modèle.
  const m = pm ? (mail || { a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele }) : null;
  const pastille = (on) => `h-9 rounded-full border px-3.5 text-[13.5px] ${on ? "border-menthe/50 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`;
  const prenomDe = (e) => { const x = e.split("@")[0].split(".")[0]; return x.charAt(0).toUpperCase() + x.slice(1); };
  // « Pourquoi cette date » (8 oct. 2026) : la phrase exacte d'abord, puis le contexte de l'appel.
  const pourquoi = (q, aLaMain, defaut) => {
    if (aLaMain) return { label: "Pourquoi cette date", valeur: "Choisie à la main", large: true };
    const phrase = q.phrase || q.source || null;
    const lignes = [phrase ? `« ${phrase} »` : null, q.pourquoi || null, !phrase && q.incertain ? defaut : null].filter(Boolean);
    return { label: "Pourquoi cette date", valeur: lignes.join("\n\n") || "Selon l'issue", warn: !phrase && !q.pourquoi && !!q.incertain, large: true };
  };

  // Les cases Monday qu'on corrige ici sont celles que la validation sait reporter :
  // le contact, le téléphone, l'email (corrections) et la date de relance.
  const CLE_MONDAY = { Contact: "interlocuteur", "Téléphone": "telephone", "E-mail": "email" };
  // Ce qu'on met dans chaque case (8 oct. 2026) : vide, la case ne dit pas quoi y écrire.
  const PLACEHOLDERS_MONDAY = { interlocuteur: "Nom de la personne au bout du fil (vide si vous ne l'avez pas)", telephone: "Son numéro direct, sinon celui appelé", email: "Son adresse mail" };
  const casesMonday = () => {
    if (!ligne) return [];
    if (["indisponible", "info"].includes(ligne.etat) && !ligne.apercu?.length) return [{ label: "Monday", valeur: ligne.texte, warn: ligne.etat === "indisponible", large: true }];
    // L'ordre de la maquette de Jules (8 oct. 2026), deux par ligne, les Remarques en dernier sur toute la largeur.
    const ORDRE = ["Contact", "Téléphone", "E-mail", "Ville", "Entreprise", "Prochaine relance", "Dernier contact", "Statut", "SPOC", "Liste de diffusion", "Date", "Prénom", "Remarques"];
    const rang = (t) => { const k = ORDRE.indexOf(t); return k < 0 ? ORDRE.length - 1.5 : k; };
    // Prénom et « par qui » s'écrivent aussi, mais la maquette ne les montre pas : le Contact et le SPOC les disent déjà.
    const CACHES = ["Prénom", "Dernier contact, par qui"];
    return [...(ligne.apercu || [])].filter((x) => !CACHES.includes(x.titre)).sort((x, y) => rang(x.titre) - rang(y.titre)).map((x) => {
      const statut = String(x.avant || "").replace(/\u200b/g, "").trim() ? "modifié" : "nouveau";
      const apres = String(x.apres ?? "").replace(/\u200b/g, "").trim();
      const cle = CLE_MONDAY[x.titre];
      if (x.titre === "Prochaine relance" && pr) return { label: x.titre, statut, edit: { type: "date", valeur: relanceLe || apres, changer: setRelanceLe } };
      if (cle && setEdits) return { label: x.titre, statut, edit: { type: "texte", valeur: edits?.[cle] ?? apres, changer: (v) => setEdits((e) => ({ ...e, [cle]: v })), placeholder: PLACEHOLDERS_MONDAY[cle] } };
      if (x.titre === "Remarques") return { label: x.titre, statut: String(x.avant || "").trim() ? "ajout" : "nouveau", valeur: apres.replace(/^\+\s*/, ""), large: true };
      // « 8 octobre 2026 », comme sur la maquette.
      if (x.titre === "Dernier contact" && /^\d{4}-\d{2}-\d{2}$/.test(apres)) return { label: x.titre, statut, valeur: new Date(`${apres}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) };
      return { label: x.titre, statut, valeur: apres ? enJour(apres) : "(vidée)" };
    });
  };
  // Les colonnes du tableau Monday, sous leur titre dans Monday : « Date » est le jour du contact, « Dernier contact » le texte « jour · qui ».
  const colonnesMonday = () => {
    const ap = ligne?.apercu || [];
    const avecParQui = ap.some((x) => x.titre === "Dernier contact, par qui");
    return ap.map((x) => {
      const titre = x.titre === "Dernier contact, par qui" ? "Dernier contact" : x.titre === "Dernier contact" && avecParQui ? "Date" : x.titre;
      const apres = String(x.apres ?? "").replace(/\u200b/g, "").trim();
      const cle = CLE_MONDAY[x.titre];
      if (x.titre === "Prochaine relance" && pr) return { titre, edit: { type: "date", valeur: relanceLe || apres, changer: setRelanceLe } };
      if (cle && setEdits) return { titre, edit: { type: "texte", valeur: edits?.[cle] ?? apres, changer: (v) => setEdits((e) => ({ ...e, [cle]: v })), placeholder: PLACEHOLDERS_MONDAY[cle] } };
      return { titre, valeur: x.titre === "Remarques" ? apres.replace(/^\+\s*/, "") : apres };
    });
  };
  const mondayRetouche = !!relanceLe || ["interlocuteur", "telephone", "email"].some((k) => edits?.[k] != null);

  /** Ce que la fenêtre montre pour une étape : son titre, ses cases, et ce que « Rétablir » remet. */
  const contenuDe = (q) => {
    if (q.type === "monday") {
      const cases = casesMonday();
      return {
        kicker: "MONDAY · AGENTS IMMOBILIERS",
        titre: ligne?.etat === "trouvee" ? `${String(ligne.ligne.nom || "").replace(/\u200b/g, "").trim() || "Contact sans nom"} · ${agence?.nom || ""}`.replace(/ · $/, "") : ligne?.etat === "doute" ? (choisie ? choisie.nom : "Quel contact ?") : agence?.nom || appel.agent,
        haut: (
          <>
            {ligne?.etat === "trouvee" && <p className="m-0 text-[13.5px] text-ardoise">Retrouvé par {ligne.par}</p>}
            {["info", "indisponible"].includes(ligne?.etat) && ligne.apercu?.length > 0 && <p className={`m-0 text-[13.5px] ${ligne.etat === "indisponible" ? "text-ambre" : "text-ardoise"}`}>{ligne.texte}</p>}
            {ligne?.etat === "nouvelle" && <p className="m-0 text-[13.5px] text-ardoise">Nouvelle ligne</p>}
            {ligne?.etat === "doute" && (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13.5px] text-ambre">Plusieurs contacts possibles : lequel ?</p>
                {(ligne.candidates || []).map((c) => (
                  <button key={c.id} type="button" onClick={() => setLigneMonday(c.id)}
                    className={`flex flex-col items-start gap-0.5 rounded-champ border px-3.5 py-2.5 text-left ${ligneMonday === c.id ? "border-menthe bg-menthe/10" : "border-trait hover:border-bord-doux"}`} style={ligneMonday === c.id ? undefined : { background: "transparent" }}>
                    <span className="text-[14px] text-encre">{c.nom}</span>
                    <span className="text-[12.5px] text-ardoise">{[c.entreprise, c.ville, c.telephone, c.email].filter(Boolean).join(" · ")}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setLigneMonday("nouvelle")}
                  className={`rounded-champ border px-3.5 py-2.5 text-left text-[14px] ${ligneMonday === "nouvelle" ? "border-menthe bg-menthe/10 text-encre" : "border-trait text-craie hover:border-bord-doux"}`} style={ligneMonday === "nouvelle" ? undefined : { background: "transparent" }}>
                  Aucun : nouveau contact
                </button>
              </div>
            )}
          </>
        ),
        // La ligne au dessin de Monday ; sans aperçu (Monday muet), les cases d'avant.
        ...(ligne?.apercu?.length ? { tableau: <TableauMonday colonnes={colonnesMonday()} />, cases: [], aide: "Ce qu'AK écrit sur la ligne Monday. Contact, téléphone, e-mail et relance se corrigent dans la cellule." } : { cases, aide: null }),
        retablir: mondayRetouche ? () => { setRelanceLe(null); setEdits?.((e) => { const n0 = { ...e }; delete n0.interlocuteur; delete n0.telephone; delete n0.email; return n0; }); } : null,
      };
    }
    if (q.type === "mail") {
      const change = (k) => (v) => setMail({ ...m, [k]: v });
      return {
        kicker: "MAIL",
        titre: MAILS[m.modele || pm.modele] || pm.titre,
        haut: (
          <>
            {/* La boîte d'où il part (8 oct. 2026), et à sa droite les versions du mail en bascule (9 oct. 2026). */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`m-0 text-[13px] ${pm.depuis ? "text-ardoise" : "text-ambre"}`}>{pm.depuis ? <>Depuis <span className="text-encre">{pm.depuis}</span></> : "Aucune boîte connectée : il deviendra un brouillon"}</p>
              {pm.variantes?.length > 1 && (
                <div role="group" aria-label="Version du mail" className="flex flex-none gap-1 rounded-full bg-rail-actif p-1">
                  {pm.variantes.map((v) => {
                    const on = m.modele === v.slug;
                    return <button key={v.slug} type="button" aria-pressed={on} onClick={() => setMail({ ...m, objet: v.objet, corps: v.corps, modele: v.slug })} className={`h-7 rounded-full px-3 text-[12.5px] transition-colors ${on ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={on ? undefined : { background: "transparent" }}>{MAILS[v.slug] || v.titre}</button>;
                  })}
                </div>
              )}
            </div>
          </>
        ),
        cases: [
          { label: "À", large: true, statut: (m.a || "") !== (pm.a || "") ? "modifié" : null, warn: !m.a || (pm.a_incertain && m.a === pm.a), source: pm.a_incertain && m.a === pm.a ? pm.a_incertain : null, edit: { type: "texte", valeur: m.a, changer: change("a"), placeholder: "adresse@agence.fr" } },
          { label: "Objet", large: true, statut: m.objet !== pm.objet ? "modifié" : null, edit: { type: "texte", valeur: m.objet, changer: change("objet") } },
          { label: "Message", statut: m.corps !== pm.corps ? "modifié" : null, large: true, edit: { type: "zone", valeur: m.corps, changer: change("corps"), lignes: 12 } },
        ],
        aide: m.a ? "+ votre signature, chargée dans votre compte." : "Sans adresse, il ne part pas.",
        retablir: modifie || m.modele !== pm.modele ? () => setMail({ a: pm.a || "", objet: pm.objet, corps: pm.corps, modele: pm.modele }) : null,
      };
    }
    if (q.type === "relance") return {
      kicker: "", titre: `Rappeler ${interlocuteur || agence?.nom || ""}`.trim(),
      cases: [
        { label: "Date", statut: relanceLe ? "modifié" : null, large: true, edit: { type: "date", valeur: dateRelance, changer: setRelanceLe } },
        pourquoi(pr, !!relanceLe, "Date par défaut : rien n'a été dit"),
        { label: "Quoi", valeur: pr.prochaine?.quoi, large: true },
        pr.prochaine?.si_fiche && { label: "Annulée", valeur: "Si la fiche arrive", large: true },
      ].filter(Boolean),
      retablir: relanceLe ? () => setRelanceLe(null) : null,
    };
    if (q.type === "relance_suivante") return {
      kicker: "SECONDE RELANCE", titre: "Faire le point",
      cases: [
        { label: "Date", statut: relance2Le ? "modifié" : null, large: true, edit: { type: "date", valeur: relance2Le || pr2.prochaine?.le, changer: setRelance2Le } },
        pourquoi(pr2, !!relance2Le, "Date par défaut : trois semaines"),
        { label: "Quoi", valeur: pr2.prochaine?.quoi, large: true },
      ],
      retablir: relance2Le ? () => setRelance2Le(null) : null,
    };
    if (q.type === "diffusion") return {
      kicker: "EMAILING · LISTE DE DIFFUSION", titre: q.liste,
      cases: [
        { label: "Adresse", statut: "nouveau", valeur: m?.a || q.a || "Il manque l'adresse", warn: !(m?.a || q.a) },
      ],
    };
    if (q.type === "fiche") return {
      kicker: "FICHE · CE QUI S'AJOUTE", titre: agence?.nom || appel.agent,
      cases: [
        (q.infos?.secteurs || []).length && { label: "Secteurs", statut: "nouveau", valeur: q.infos.secteurs.join(", ") },
        q.infos?.email && { label: "Email", statut: "nouveau", valeur: q.infos.email },
        (q.infos?.notes || []).length && { label: "Notes", statut: "nouveau", valeur: q.infos.notes.join("\n"), large: true },
      ].filter(Boolean),
    };
    if (q.type === "nouveau_contact") return {
      kicker: "CONTACT DONNÉ PENDANT L'APPEL", titre: q.contact.nom || "Nouveau contact",
      cases: [
        q.contact.telephone && { label: "Téléphone", statut: "nouveau", valeur: q.contact.telephone, warn: !!q.incertain, source: q.incertain || null },
        q.contact.email && { label: "Email", statut: "nouveau", valeur: q.contact.email },
        { label: "D'où ça vient", valeur: `« ${q.source} »`, large: true },
        { label: "Suite", valeur: "En tête de file aujourd'hui", large: true },
      ].filter(Boolean),
    };
    if (q.type === "ne_plus_appeler") return {
      kicker: "MONDAY", titre: "Ne plus appeler",
      cases: [
        { label: "Monday", statut: "modifié", valeur: "« Ne plus appeler », relance vidée" },
        { label: "File", valeur: "Ne revient plus" },
      ],
    };
    if (q.type === "signaler_bien") return {
      kicker: "BIEN ÉVOQUÉ", titre: q.biens[0],
      cases: [
        { label: "Biens", statut: "nouveau", valeur: q.biens.join("\n"), source: q.source ? `Dit : « ${q.source} »` : null, large: true },
        { label: "Suite", valeur: "Dossier créé à l'arrivée de la fiche", large: true },
      ],
    };
    if (q.type === "prevenir") return {
      kicker: "MESSAGE · NOTIFICATION", titre: "Prévenir un collègue",
      cases: [
        { label: "À", valeur: q.pour.map(prenomDe).join(", ") },
        { label: "Quand", valeur: "À la validation" },
        { label: "Message", valeur: `Vous avez appelé ${agence?.nom || appel.agent} : ${ISS[issue] || ""}${appel.resume ? `. ${appel.resume}` : ""}`, large: true },
      ],
    };
    return { kicker: "ÉTAPE", titre: q.titre, cases: [{ label: "Détail", valeur: q.texte || q.titre, large: true }] };
  };

  const etape = (q, champs) => ({ k: q.id, q, on: q.toujours || coches.has(q.id), basculer: q.toujours ? null : basculer(q.id), voir: () => setOuverte(q.id), ...champs });
  const maintenant = [];
  if (pmo) {
    const detail = ligne?.etat === "trouvee" ? `${ligne.ligne.nom?.replace(/\u200b/g, "").trim() || "Contact sans nom"}, retrouvé par ${ligne.par}` : ligne?.etat === "nouvelle" ? "Nouveau contact" : ligne?.etat === "doute" ? (choisie ? `Contact choisi : ${choisie.nom}` : "C'est bien ce contact ? Choisissez") : ligne?.texte || "";
    maintenant.push(etape(pmo, { label: "Contact Monday", detail, warn: doute || ligne?.etat === "indisponible" }));
  }
  if (par("ne_plus_appeler")) maintenant.push(etape(par("ne_plus_appeler"), { label: "Ne plus appeler", detail: "Ni relance ni mail" }));
  if (pm) maintenant.push(etape(pm, { label: "Email", detail: `${MAILS[mail?.modele || pm.modele] || pm.titre} · ${mail?.a ? `à ${mail.a}` : "adresse manquante : il ne part pas"}${pm.a_incertain && mail?.a === pm.a ? " · adresse à vérifier" : ""}${modifie ? " · modifié" : ""}`, warn: !mail?.a || (pm.a_incertain && mail?.a === pm.a) }));
  if (pdi) maintenant.push(etape(pdi, { label: "Ajouter à la liste de diffusion agents", detail: pdi.a || mail?.a ? `${mail?.a || pdi.a}` : "il manque l'adresse", warn: !(pdi.a || mail?.a) }));
  for (const q of props.filter((x) => ["fiche", "signaler_bien", "nouveau_contact"].includes(x.type) && !x.cache)) {
    const lib = { fiche: "Compléter sa fiche", signaler_bien: "Noter le bien évoqué", nouveau_contact: "Appeler le contact donné" }[q.type];
    maintenant.push(etape(q, { label: lib, detail: String(q.titre).replace(/^Ajouter à sa fiche : /, "").replace(/^Noter le bien évoqué : /, ""), warn: !!q.incertain }));
  }
  const ensuite = [];
  if (pr) ensuite.push(etape(pr, { label: "Planifier la relance", detail: `${pr.prochaine?.quoi}${relanceLe ? " · date changée" : ""}`, warn: !relanceLe && !!pr.incertain }));
  if (pr2) ensuite.push(etape(pr2, { label: "Seconde relance", detail: `${jourLong(relance2Le || pr2.prochaine?.le)} · ${pr2.prochaine?.quoi}`, warn: !relance2Le && !!pr2.incertain }));
  const pv = par("prevenir");
  if (pv) ensuite.push(etape(pv, { label: "Prévenir un collègue", detail: pv.pour.map((e) => e.split("@")[0].split(".")[0]).map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(", ") }));
  const n = [...maintenant, ...ensuite].filter((e) => e.on).length;
  // Les étapes de la fenêtre, rangées par moment : maintenant, puis chaque date de relance dans l'ordre.
  const COURT = { monday: "Contact Monday", ne_plus_appeler: "Ne plus appeler", mail: "Email", diffusion: "Liste de diffusion", fiche: "Compléter sa fiche", signaler_bien: "Bien évoqué", nouveau_contact: "Contact donné", relance: "Relance", relance_suivante: "Seconde relance", prevenir: "Prévenir un collègue" };
  const dateDe = (e) => (e.q.type === "relance" ? dateRelance : e.q.type === "relance_suivante" ? relance2Le || pr2?.prochaine?.le : null);
  const datees = ensuite.filter((e) => dateDe(e)).sort((x, y) => String(dateDe(x)).localeCompare(String(dateDe(y))));
  const pas = [
    ...[...maintenant, ...ensuite.filter((e) => !dateDe(e))].map((e) => ({ ...e, groupe: "Maintenant" })),
    ...datees.map((e) => ({ ...e, groupe: jourLong(dateDe(e)) })),
  ].map((e) => ({ ...e, court: COURT[e.q.type] || e.label }));

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[12px] tracking-[.14em] text-ardoise">ACTIONS PROPOSÉES</span>
        <span className="flex items-center gap-2">
          <span className={`text-[13px] ${issue === "pas_interesse" ? "text-ardoise" : "text-menthe"}`}>{ISS[issue] || ""}</span>
          {/* AK s'est trompé d'issue : on la change, les actions se refont sur la même transcription. */}
          {onChangerIssue && <button type="button" onClick={() => setChoixIssue((x) => !x)} disabled={changementEnCours} className="p-0 text-[13px] text-ardoise underline hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>changer</button>}
        </span>
      </div>
      {choixIssue && onChangerIssue && (
        <div className="mb-3 flex flex-wrap justify-end gap-1.5 px-1">
          {Object.entries(ISS).filter(([k]) => k !== issue).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setChoixIssue(false); onChangerIssue(k); }} className="h-8 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>{l}</button>
          ))}
        </div>
      )}

      {maintenant.length > 0 && (
        <>
          <Trait p={p("v0")} moment="Maintenant" />
          <Carte etapes={maintenant} />
        </>
      )}

      {ensuite.length > 0 && (
        <>
          <Trait p={p(maintenant.length ? "v1" : "v0")} moment={pr && dateRelance ? enJour(String(dateRelance).slice(0, 10)) : "Ensuite"} />
          <Carte etapes={ensuite} />
        </>
      )}

      {doute && <p className="m-0 mt-4 px-1 text-[14px] text-ambre">Monday a plusieurs contacts possibles : ouvrez « Contact Monday » et choisissez le bon.</p>}
      <Trait p={p("v2")} />
      <button type="button" onClick={() => onLancer({ vues: [...vues.current] })} disabled={envoi || !n || doute}
        className="w-full rounded-full bg-encre py-[18px] text-[17px] text-fond hover:opacity-90 disabled:opacity-50">
        {envoi ? "Validation…" : `Valider · ${n} étape${n > 1 ? "s" : ""}`}
      </button>

      {ouverte && pas.some((x) => x.k === ouverte) && <Panneau pas={pas} ouverte={ouverte} setOuverte={setOuverte} contenuDe={contenuDe} onFermer={() => setOuverte(null)} onValider={(o) => onLancer({ ...(o || {}), vues: [...vues.current] })} validable={!!n && !doute} envoi={envoi} envoiFenetre={envoiFenetre} onQuitterEnvoi={onQuitterEnvoi} onVoir={(k) => vues.current.add(k)} />}
    </div>
  );
}
