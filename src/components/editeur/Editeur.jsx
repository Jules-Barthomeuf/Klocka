import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

// L'Éditeur (28 oct. 2026, Jules) : la structure commune des pages où l'on
// travaille un document avec le chat. À gauche le chat, sur le fond choisi
// par l'admin ; une ligne verticale qui sépare les deux parties, qu'on attrape
// pour régler la largeur ; à droite le document, sur le même fond. En haut du
// document, une barre : son nom à gauche, les trois modes sur la même ligne,
// puis ses actions.
//  - Éditeur : chaque élément se clique ; le panneau de droite s'ouvre sur
//    l'élément choisi.
//  - Lecture : rien ne se modifie.
//  - Sources : au survol d'un élément modifié, d'où il vient.
// Aucune partie n'a de fond propre : le fond de la page passe dessous.

export const MODES_EDITEUR = [
  ["edition", "Éditeur"],
  ["lecture", "Lecture"],
  ["sources", "Sources"],
];

const LARGEUR_DEFAUT = 420;
const borner = (l) => Math.round(Math.min(Math.max(l, 300), Math.max(320, (typeof window !== "undefined" ? window.innerWidth : 1600) - 560)));

/** La largeur du chat, gardée dans ce navigateur sous `cle` : la poignée se tire, un double-clic la remet. */
export function useLargeurChat(cle) {
  const [largeur, setLargeur] = useState(() => { try { const v = Number(localStorage.getItem(cle)); return v ? borner(v) : LARGEUR_DEFAUT; } catch { return LARGEUR_DEFAUT; } });
  const [tire, setTire] = useState(false);
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    let derniere = largeur;
    // La largeur se compte depuis le bord gauche de l'écran scindé (la barre repliée en rail peut le précéder).
    const gauche = e.currentTarget?.parentElement?.getBoundingClientRect?.().left || 0;
    const bouger = (ev) => { derniere = borner(ev.clientX - gauche); setLargeur(derniere); };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(cle, String(derniere)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => { setLargeur(LARGEUR_DEFAUT); try { localStorage.removeItem(cle); } catch { /* rien */ } };
  return { largeur, tire, tirer, remettre };
}

/**
 * La ligne entre le chat et le document : un filet toujours visible, qui
 * s'épaissit en menthe sous la souris ; on la tire pour régler la largeur.
 */
export function PoigneeEditeur({ largeur, tire, tirer, remettre }) {
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
      onPointerDown={tirer} onDoubleClick={remettre}
      className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeur - 6 }}>
      <span className={`h-full w-px transition-colors ${tire ? "bg-menthe" : "bg-trait group-hover:bg-bord-vif"}`} />
      <span className={`absolute top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-full transition-colors ${tire ? "bg-menthe" : "bg-transparent group-hover:bg-bord-vif"}`} />
    </div>
  );
}

/** L'écran entier : le chat à gauche, la poignée, le document à droite. */
export function EcranEditeur({ cle, chat, children, className = "" }) {
  const l = useLargeurChat(cle);
  return (
    <div className={`k-page-presentation k-dossier-ia relative grid h-[100dvh] overflow-hidden text-encre ${l.tire ? "select-none" : ""} ${className}`} style={{ gridTemplateColumns: `${l.largeur}px minmax(0,1fr)` }}>
      <div className="k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5">{chat}</div>
      <div className="h-[100dvh] min-h-0 min-w-0 overflow-hidden">{children}</div>
      <PoigneeEditeur {...l} />
    </div>
  );
}

/** Les trois modes, en pilule. */
export function ModesEditeur({ mode, onMode, modes = MODES_EDITEUR }) {
  return (
    <div className="flex flex-none gap-1 rounded-full bg-rail-actif p-1" role="group" aria-label="Mode">
      {modes.map(([k, mot]) => (
        <button key={k} type="button" onClick={() => onMode(k)} aria-pressed={mode === k}
          title={k === "sources" ? "Passez la souris sur un élément modifié : sa source s'affiche" : k === "lecture" ? "Lire sans rien modifier" : "Cliquer sur un élément pour le modifier"}
          className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${mode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={mode === k ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  );
}

/**
 * La barre du haut du document : le nom (et son état) à gauche, les modes
 * sur la même ligne, les actions à droite. Sans fond : celui de la page.
 */
export function BarreEditeur({ titre, statut = "", mode = null, onMode = null, actions = null }) {
  return (
    <div className="flex h-14 flex-none items-center gap-3 border-b border-trait px-5 md:pr-[120px] max-md:gap-2 max-md:px-3" style={{ background: "transparent" }}>
      <div className="flex min-w-0 flex-1 items-baseline gap-3 max-md:flex-col max-md:gap-0">
        <span className="truncate text-[14.5px] text-encre max-md:max-w-full">{titre}</span>
        {statut ? <span className="truncate text-[12.5px] text-ardoise max-md:max-w-full">{statut}</span> : null}
      </div>
      {mode && onMode ? <ModesEditeur mode={mode} onMode={onMode} /> : null}
      {actions ? <div className="flex flex-none items-center gap-1.5 max-md:gap-1">{actions}</div> : null}
    </div>
  );
}

/**
 * Le panneau de l'élément choisi, à droite du document (mode Éditeur) :
 * le nom de l'élément, une croix (Échap ferme aussi), et ce qui le modifie.
 */
export function PanneauEditeur({ titre, sousTitre = "", onFermer, children }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer?.(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return (
    <aside className="flex h-full w-[320px] flex-none flex-col border-l border-trait duration-300 ease-out animate-in fade-in-0 slide-in-from-right-4 max-lg:w-[280px]" aria-label="L'élément choisi" style={{ background: "transparent" }}>
      <div className="flex flex-none items-start gap-2 border-b border-trait py-3 pl-5 pr-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[14px] text-encre">{titre}</p>
          {sousTitre ? <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{sousTitre}</p> : null}
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer (Échap)"
          className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </aside>
  );
}

/** Un groupe du panneau : un titre en petites capitales, puis son contenu. */
export function GroupePanneau({ titre, children }) {
  return (
    <section className="mb-5 last:mb-0">
      <p className="m-0 mb-2 text-[11px] uppercase tracking-[.14em] text-brume">{titre}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

// --- Le design d'un élément (28 oct. 2026, Jules : « tous les composants éditables, absolument tous ») ------------
// Chaque document dit ses couleurs par des variables : --doc-encre, --doc-noir, --doc-gris, --doc-accent, --doc-encart,
// --doc-blanc (la lettre les pose sur ses couleurs à elle). Un style d'élément se garde sur le document (styles[cible]).

export const PALETTE_DOC = [
  ["encre", "Texte", "var(--doc-encre)"], ["noir", "Noir", "var(--doc-noir)"], ["gris", "Gris", "var(--doc-gris)"],
  ["accent", "Accent", "var(--doc-accent)"], ["encart", "Encart", "var(--doc-encart)"], ["blanc", "Blanc", "var(--doc-blanc)"],
];
/** Une couleur de la palette du document (ou une couleur libre « #… ») en CSS. */
export const couleurDoc = (c) => PALETTE_DOC.find((p) => p[0] === c)?.[2] || c;
const POLICES_DOC = { serif: 'Georgia, "Times New Roman", serif', sans: '"Hanken Grotesk", Helvetica, Arial, sans-serif', mono: '"Courier New", monospace' };

/** Pure : le style CSS d'un élément d'après ses réglages (taille en pt). */
export function styleDesign(st) {
  if (!st) return undefined;
  return {
    ...(st.taille ? { fontSize: `${st.taille}pt` } : {}),
    ...(POLICES_DOC[st.police] ? { fontFamily: POLICES_DOC[st.police] } : {}),
    ...(st.couleur ? { color: couleurDoc(st.couleur) } : {}),
    ...(st.fond ? { backgroundColor: couleurDoc(st.fond), padding: "0.15em 0.35em", borderRadius: "3px" } : {}),
    ...(st.gras ? { fontWeight: 700 } : {}),
    ...(st.italique ? { fontStyle: "italic" } : {}),
    ...(st.souligne ? { textDecoration: "underline" } : {}),
    ...(st.majuscules ? { textTransform: "uppercase" } : {}),
    ...(st.interligne ? { lineHeight: st.interligne } : {}),
    ...(st.espacement != null ? { letterSpacing: `${st.espacement}em` } : {}),
    ...(st.opacite != null ? { opacity: st.opacite / 100 } : {}),
    ...(st.aligner ? { textAlign: st.aligner, display: "block" } : {}),
    ...(st.marge_haut != null ? { marginTop: `${st.marge_haut}mm` } : {}),
    ...(st.marge_bas != null ? { marginBottom: `${st.marge_bas}mm` } : {}),
    ...(st.masque ? { display: "none" } : {}),
  };
}

const BoutonDesign = ({ actif, onClick, children, titre }) => (
  <button type="button" onClick={onClick} aria-pressed={!!actif} title={titre} aria-label={titre}
    className={`grid h-8 min-w-8 place-items-center rounded-[8px] px-1.5 text-[12.5px] ${actif ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={actif ? undefined : { background: "transparent" }}>{children}</button>
);

function CurseurDesign({ libelle, valeur, defaut, min, max, pas, unite = "", onChoisir }) {
  const v = valeur ?? defaut;
  return (
    <label className="flex items-center gap-2">
      <span className="w-[76px] flex-none text-[12.5px] text-ardoise">{libelle}</span>
      <input type="range" min={min} max={max} step={pas} value={v} onChange={(e) => onChoisir(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--k-menthe)]" />
      <span className="w-12 flex-none text-right text-[11.5px] tabular-nums text-brume">{Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{unite}</span>
    </label>
  );
}

/**
 * Le design d'un élément, dans le panneau de l'Éditeur : taille, police, style, alignement, couleurs, interligne,
 * espacement, marges, opacité, masquer, revenir au modèle. `onStyle(patch)` fusionne ; `onStyle(null)` efface.
 */
// `max` : la plus grande taille permise, en pt (un grand chiffre de diapositive dépasse 80 pt).
export function ReglagesDesign({ style = {}, taille = null, onStyle, max = 80 }) {
  const st = style || {};
  const t = st.taille ?? taille ?? 10;
  const poser = (patch) => {
    const suite = { ...st, ...patch };
    for (const k of Object.keys(suite)) if (suite[k] === null || suite[k] === false || suite[k] === undefined) delete suite[k];
    onStyle(Object.keys(suite).length ? suite : null);
  };
  const Pastilles = ({ k, aucune = false }) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {aucune && <button type="button" onClick={() => poser({ [k]: null })} aria-pressed={!st[k]} title="Aucune" aria-label="Aucune" className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] ${!st[k] ? "border-menthe text-encre" : "border-trait text-brume"}`} style={{ background: "transparent" }}>×</button>}
      {PALETTE_DOC.map(([c, nom, css]) => (
        <button key={c} type="button" onClick={() => poser({ [k]: st[k] === c ? null : c })} title={nom} aria-label={nom} aria-pressed={st[k] === c}
          className={`h-6 w-6 rounded-full border ${st[k] === c ? "border-menthe ring-2 ring-menthe/40" : "border-trait"}`} style={{ background: css }} />
      ))}
      <label className="relative grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-trait text-[11px] text-ardoise" title="Autre couleur" style={{ background: /^#/.test(st[k] || "") ? st[k] : "transparent" }}>
        {!/^#/.test(st[k] || "") && "+"}
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Autre couleur" onChange={(e) => poser({ [k]: e.target.value })} />
      </label>
    </div>
  );
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1">
        <span className="w-[76px] flex-none text-[12.5px] text-ardoise">Taille</span>
        <BoutonDesign titre="Plus petit" onClick={() => poser({ taille: Math.max(5, Math.round((t - 0.5) * 2) / 2) })}>−</BoutonDesign>
        <input type="number" step="0.5" min="5" max={max} value={t} onChange={(e) => { const n = Number(e.target.value); if (n >= 5 && n <= max) poser({ taille: n }); }} aria-label="Taille en points"
          className="h-8 w-14 rounded-[8px] border border-trait bg-surface px-1.5 text-center text-[12.5px] tabular-nums text-encre outline-none focus:border-menthe max-md:text-[16px]" />
        <span className="text-[11.5px] text-brume">pt</span>
        <BoutonDesign titre="Plus grand" onClick={() => poser({ taille: Math.min(max, Math.round((t + 0.5) * 2) / 2) })}>+</BoutonDesign>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-[76px] flex-none text-[12.5px] text-ardoise">Police</span>
        {[["", "Modèle"], ["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"]].map(([k, mot]) => <BoutonDesign key={mot} actif={(st.police || "") === k} onClick={() => poser({ police: k || null })} titre={mot}>{mot}</BoutonDesign>)}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-[76px] flex-none text-[12.5px] text-ardoise">Style</span>
        <BoutonDesign titre="Gras" actif={st.gras} onClick={() => poser({ gras: !st.gras })}><b>G</b></BoutonDesign>
        <BoutonDesign titre="Italique" actif={st.italique} onClick={() => poser({ italique: !st.italique })}><i>I</i></BoutonDesign>
        <BoutonDesign titre="Souligné" actif={st.souligne} onClick={() => poser({ souligne: !st.souligne })}><u>S</u></BoutonDesign>
        <BoutonDesign titre="Majuscules" actif={st.majuscules} onClick={() => poser({ majuscules: !st.majuscules })}>AB</BoutonDesign>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-[76px] flex-none text-[12.5px] text-ardoise">Aligner</span>
        {[["left", "Gauche"], ["center", "Centre"], ["right", "Droite"], ["justify", "Justifié"]].map(([v, mot]) => <BoutonDesign key={v} titre={mot} actif={st.aligner === v} onClick={() => poser({ aligner: st.aligner === v ? null : v })}>{mot}</BoutonDesign>)}
      </div>
      <div className="flex items-start gap-1"><span className="w-[76px] flex-none pt-1 text-[12.5px] text-ardoise">Couleur</span><Pastilles k="couleur" /></div>
      <div className="flex items-start gap-1"><span className="w-[76px] flex-none pt-1 text-[12.5px] text-ardoise">Fond</span><Pastilles k="fond" aucune /></div>
      <CurseurDesign libelle="Interligne" valeur={st.interligne} defaut={1.5} min={0.8} max={2.6} pas={0.05} onChoisir={(v) => poser({ interligne: v })} />
      <CurseurDesign libelle="Espacement" valeur={st.espacement} defaut={0} min={-0.05} max={0.4} pas={0.01} unite=" em" onChoisir={(v) => poser({ espacement: v || null })} />
      <CurseurDesign libelle="Marge haut" valeur={st.marge_haut} defaut={0} min={0} max={30} pas={0.5} unite=" mm" onChoisir={(v) => poser({ marge_haut: v || null })} />
      <CurseurDesign libelle="Marge bas" valeur={st.marge_bas} defaut={0} min={0} max={30} pas={0.5} unite=" mm" onChoisir={(v) => poser({ marge_bas: v || null })} />
      <CurseurDesign libelle="Opacité" valeur={st.opacite} defaut={100} min={5} max={100} pas={1} unite=" %" onChoisir={(v) => poser({ opacite: v === 100 ? null : v })} />
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 border-t border-trait pt-2.5">
        <button type="button" onClick={() => poser({ masque: !st.masque })} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>{st.masque ? "Réafficher l'élément" : "Masquer l'élément"}</button>
        {Object.keys(st).length > 0 && <button type="button" onClick={() => onStyle(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Revenir au modèle</button>}
      </div>
    </div>
  );
}
