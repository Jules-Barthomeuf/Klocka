import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARTE, CIBLES_SOMMAIRE, HAUTEUR, LARGEUR, LIBELLES, TAILLES, estMasque } from "@/lib/presentation-modele";
import { couleurDoc, styleDesign } from "@/components/editeur/Editeur";
import "./presentation-bancaire.css";

// Le deck de la présentation bancaire, sur le « Deck complet » de Jules
// (12 oct. 2026) : un seul cadre de 1280 × 720 qui contient les seize
// diapositives, posées côte à côte sur trois bandes (les cartes sombres, les
// textes de gauche, les numéros en filigrane), et une seule variable d'état,
// le numéro de la diapositive en cours. Changer de diapositive fait glisser
// les bandes. Deux modes :
//  - lecture : les flèches, les repères et le sommaire naviguent ; les
//    éléments arrivent en cascade, les photos dézooment, les barres poussent,
//    le bloc des cartes s'incline avec la souris ;
//  - édition : un clic sur un élément le sélectionne (le panneau de droite,
//    Design commun aux éditeurs, règle sa mise en forme), un texte se retape sur place, une liste
//    s'allonge (+) ou se raccourcit (×), une photo se change au clic.
// Le PPTX (server/presentation-projet.js, DESSINS) dessine les mêmes
// diapositives, à plat, avec les mêmes mises en forme (diapo.styles).

const echapper = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PAS_CARTES = 740;
const PAS_HEROS = 500;
const PAS_FILIGRANE = 1600;

/** Pure : la valeur à un chemin pointé. */
export const lire = (o, chemin) => chemin.split(".").reduce((x, k) => x?.[k], o);

// Une partie masquée (13 oct. 2026, Jules : « masquer toute la partie ») part avec
// son cadre, ses libellés et ses filets ; ce qui reste prend la place.
const cache = (styles, chemin) => estMasque(styles, chemin);
/** Les rangs encore visibles d'une liste : aucun si la liste entière est masquée. */
const rangs = (styles, liste, chemin, max = Infinity) => (estMasque(styles, chemin) ? [] : (liste || []).slice(0, max).map((_, k) => k).filter((k) => !estMasque(styles, `${chemin}.${k}`)));

/** Pure : pose une valeur à un chemin pointé ; null sur un élément de liste le retire, « + » ajoute. */
export function poser(diapo, chemin, valeur) {
  const copie = JSON.parse(JSON.stringify(diapo));
  const morceaux = chemin.split(".");
  let o = copie;
  for (const m of morceaux.slice(0, -1)) {
    const cle = Array.isArray(o) ? Number(m) : m;
    if (o[cle] == null || typeof o[cle] !== "object") o[cle] = {};
    o = o[cle];
  }
  const dernier = morceaux.at(-1);
  if (Array.isArray(o)) {
    if (dernier === "+") o.push(valeur);
    else if (valeur === null) o.splice(Number(dernier), 1);
    else o[Number(dernier)] = valeur;
  } else {
    o[dernier] = valeur;
  }
  return copie;
}

// La palette du deck, par nom : l'écran et le PPTX (server) lisent les mêmes.
export const PALETTE = [["ivoire", "Ivoire", "var(--pb-ivoire)"], ["sauge", "Sauge", "var(--pb-sauge)"], ["clair", "Clair", "var(--pb-clair)"], ["gris", "Gris", "var(--pb-gris)"], ["encre", "Encre", "var(--pb-encre)"]];
// Une couleur gardée : libre (« #… »), du deck (ivoire, sauge, clair, gris, encre), ou de la palette commune des
// éditeurs (noir, accent, encart, blanc…), que la racine du deck pose sur ses propres couleurs (--doc-*).
const couleurCss = (c) => (!c ? undefined : /^#/.test(c) ? c : PALETTE.find(([k]) => k === c)?.[2] || couleurDoc(c));
/**
 * La mise en forme d'un élément (diapo.styles[chemin]) en CSS. Les clés du panneau Design commun (police, souligné,
 * majuscules, fond, interligne, espacement, marges) passent par styleDesign ; la taille reste en pixels (le cadre
 * fait 1280 px), le gras à 600 et l'alignement sans changer l'affichage de l'élément, comme avant.
 */
export const styleCss = (st) => {
  if (!st) return undefined;
  const { taille, gras, couleur, fond, aligner, ...reste } = st;
  return {
    ...styleDesign(reste),
    ...(taille ? { fontSize: taille } : {}),
    ...(gras ? { fontWeight: 600 } : {}),
    ...(couleur ? { color: couleurCss(couleur) } : {}),
    ...(fond ? { backgroundColor: couleurCss(fond), padding: "0.15em 0.35em", borderRadius: "3px" } : {}),
    ...(aligner ? { textAlign: aligner } : {}),
  };
};

// Ce qu'une diapositive donne à ses éléments : ses données, la retouche, la
// sélection et le mode.
const Diapo = createContext({ d: {}, set: () => {}, styles: {}, selection: null, choisir: () => {}, edition: false, onPhoto: () => {}, aller: () => {}, sources: null, surSource: null });

/** En mode Sources : la classe et le survol d'un champ qui a une source (13 oct. 2026). */
function propsSource(ctx, chemin) {
  if (!ctx.sources) return {};
  const propre = ctx.sources[chemin];
  const src = propre || ctx.sources[String(chemin).replace(/\.(label|titre|page)$/, ".valeur")];
  if (!src) return {};
  return {
    "data-source": src.nature,
    // Le libellé d'un chiffre prend sa source sans porter de cadre : une ligne, un seul cadre.
    ...(propre ? {} : { "data-source-libelle": "" }),
    onMouseEnter: (e) => ctx.surSource?.({ diapo: ctx.d.id, chemin, el: e.currentTarget }),
  };
}

/** Un texte de la diapositive. En édition : un clic le sélectionne, il se retape sur place ; gardé quand on en sort. */
function Champ({ chemin, className = "", style = undefined, multiligne = false, as: Balise = "div", defaut = null }) {
  const ref = useRef(null);
  const ctx = useContext(Diapo);
  const { d, set, styles, selection, choisir, edition } = ctx;
  const valeur = lire(d, chemin);
  // Un libellé du modèle (`defaut`) tant qu'on ne l'a pas réécrit ; vidé, il disparaît.
  const texte = String(valeur ?? defaut ?? "");
  const st = styles?.[chemin];
  useLayoutEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.innerText = texte;
  }, [texte]);
  if (cache(styles, chemin)) return null;
  const choisi = selection?.diapo === d.id && selection?.chemin === chemin;
  const sortir = () => {
    const t = (ref.current?.innerText || "").replace(/\u00a0/g, " ").replace(/\n+$/, "");
    if (t !== texte) set(chemin, t);
  };
  return (
    <Balise ref={ref} className={`pb-champ ${choisi ? "pb-choisi" : ""} ${className}`} style={{ ...style, ...styleCss(st) }} {...propsSource(ctx, chemin)}
      contentEditable={edition} suppressContentEditableWarning spellCheck
      onClick={(e) => { if (!edition) return; e.stopPropagation(); }}
      onFocus={() => { if (edition) choisir({ diapo: d.id, chemin, taille: ref.current ? Math.round(parseFloat(getComputedStyle(ref.current).fontSize)) : null }); }}
      onBlur={sortir}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(multiligne && e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.innerText = texte; e.currentTarget.blur(); }
      }}
      // Le texte posé une fois par valeur : React ne touche pas ce que la frappe a changé.
      dangerouslySetInnerHTML={{ __html: echapper(texte) }} />
  );
}

/** Une photo : en édition, un clic la change (photos du projet, import, ou rien). En lecture, elle dézoome à l'arrivée. */
function Photo({ chemin, style, className = "", vide = "[Photo]" }) {
  const ctx = useContext(Diapo);
  const { d, styles, selection, choisir, edition, onPhoto } = ctx;
  const url = lire(d, chemin);
  const st = styles?.[chemin];
  if (cache(styles, chemin)) return null;
  const choisi = selection?.diapo === d.id && selection?.chemin === chemin;
  const ouvrir = () => { if (!edition) return; choisir({ diapo: d.id, chemin, taille: null }); onPhoto(d.id, chemin); };
  return (
    <div className={`pb-photo ${edition ? "pb-photo-edit" : ""} ${choisi ? "pb-choisi" : ""} ${className}`} style={{ ...style, ...styleCss(st) }} {...propsSource(ctx, chemin)} role={edition ? "button" : undefined} tabIndex={edition ? 0 : -1}
      onClick={(e) => { if (edition) { e.stopPropagation(); ouvrir(); } }} onKeyDown={(e) => { if (e.key === "Enter") ouvrir(); }} title={edition ? "Changer la photo" : undefined}>
      {url ? <img className="f-img" src={url} alt="" draggable={false} style={className.includes("pb-logo") ? { objectFit: "contain", padding: 14 } : undefined} /> : <span className="pb-photo-vide">{vide}</span>}
    </div>
  );
}

const Ajouter = ({ onClick, style, mot = "Ajouter" }) => {
  const { edition } = useContext(Diapo);
  return edition ? <button type="button" className="pb-geste" style={style} onClick={(e) => { e.stopPropagation(); onClick(); }}>+ {mot}</button> : null;
};
const Retirer = ({ onClick, style }) => {
  const { edition } = useContext(Diapo);
  return edition ? <button type="button" className="pb-retirer" style={style} onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="Retirer" title="Retirer">×</button> : null;
};

/** Un libellé fixe du modèle, modifiable (diapo.libelles[cle]) : vide, il ne s'affiche plus qu'en édition. */
function Libelle({ cle, className = "", style = undefined, as = "div" }) {
  const { d, edition } = useContext(Diapo);
  const defaut = LIBELLES[d.type]?.[cle] ?? "";
  if (!edition && lire(d, `libelles.${cle}`) === "") return null;
  return <Champ chemin={`libelles.${cle}`} defaut={defaut} className={className} style={style} as={as} />;
}

/** Un chiffre et son libellé sous un filet. */
function Chiffre({ chemin, taille = 30, couleur, labelTaille = 13 }) {
  return (
    <div className="pb-filet-haut" style={{ paddingTop: 10 }}>
      <Champ chemin={`${chemin}.valeur`} style={{ fontSize: taille, letterSpacing: "-0.025em", color: couleur }} />
      <Champ chemin={`${chemin}.label`} className="pb-gris" style={{ marginTop: 2, fontSize: labelTaille }} />
    </div>
  );
}
/** Une liste libellé / valeur. */
function Lignes({ ls, chemin, taille = 15, valeurCouleur = () => undefined }) {
  const { styles } = useContext(Diapo);
  return rangs(styles, ls, chemin).map((k) => (
    <div key={k} className="pb-ligne" style={{ fontSize: taille }}>
      <Champ chemin={`${chemin}.${k}.label`} className="pb-gris" />
      <Champ chemin={`${chemin}.${k}.valeur`} style={{ color: valeurCouleur(k) }} />
    </div>
  ));
}
function Atouts({ as, padding = "4px 0", filets = false, max = 3, lignes = null }) {
  const { styles } = useContext(Diapo);
  return rangs(styles, as, "atouts", max).map((k, n) => (
    <div key={k} style={{ display: "flex", gap: 16, padding, borderTop: filets ? `1px solid var(${n === 0 ? "--pb-filet" : "--pb-filet-doux"})` : undefined }}>
      <span className="pb-sauge" style={{ flex: "0 0 16px", fontSize: 13 }}>{"ABC"[n]}</span>
      <Champ chemin={`atouts.${k}`} style={{ flex: 1, minWidth: 0, ...(lignes ? { display: "-webkit-box", WebkitLineClamp: lignes, WebkitBoxOrient: "vertical", overflow: "hidden" } : {}) }} multiligne />
    </div>
  ));
}

// --- Les cartes de droite --------------------------------------------------

const CARTES = {
  couverture: ({ d, styles }) => {
    const ks = rangs(styles, d.stats, "stats", 3);
    return (
      <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 22 }}>
        <div style={{ display: "flex", justifyContent: "flex-end" }}><img src="/logo-klocka-presentation.png" alt="Klocka" style={{ height: 24 }} draggable={false} /></div>
        <Photo chemin={"photo"} style={{ flex: "1 1 0", minHeight: 0 }} vide="[Photo de couverture]" />
        {ks.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${ks.length}, minmax(0, 1fr))`, gap: 24 }}>
            {ks.map((k) => <Chiffre key={k} chemin={`stats.${k}`} couleur={k === 1 ? "var(--pb-sauge)" : undefined} />)}
          </div>
        )}
      </div>
    );
  },
  // En lecture, chaque chapitre du sommaire mène à la diapositive où il commence (la spec de Jules : « cliquables »).
  sommaire: ({ d, set, edition, aller, styles }) => (
    <div style={{ height: "100%", padding: "28px 36px", display: "flex", flexDirection: "column" }}>
      {rangs(styles, d.items, "items").map((k, n) => (
        <div key={k} className="pb-item" onClick={edition ? undefined : () => CIBLES_SOMMAIRE[k] && aller(CIBLES_SOMMAIRE[k])} role={edition ? undefined : "button"} tabIndex={edition ? undefined : 0} onKeyDown={edition ? undefined : (e) => { if (e.key === "Enter" && CIBLES_SOMMAIRE[k]) aller(CIBLES_SOMMAIRE[k]); }}
          style={{ flex: "1 1 0", display: "flex", alignItems: "center", gap: 22, borderTop: n ? "1px solid rgba(242,243,245,.11)" : undefined, fontSize: 21, letterSpacing: "-0.01em", cursor: edition ? undefined : "pointer" }}>
          <span className="pb-sauge" style={{ flex: "0 0 32px", fontSize: 14 }}>{String(k + 1).padStart(2, "0")}</span>
          <Champ chemin={`items.${k}.titre`} style={{ flex: 1 }} />
          <Champ chemin={`items.${k}.page`} style={{ fontSize: 14, color: "var(--pb-gris-fonce)" }} />
          <Retirer onClick={() => set(`items.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("items.+", { titre: "Nouvelle partie", page: "p. —" })} style={{ left: 36, bottom: 8 }} mot="Partie" />
    </div>
  ),
  // La ville (refaite le 12 oct. 2026, Jules : « la photo est trop petite », deux atouts au lieu de trois) :
  // la photo prend la moitié de la carte ; libellé et chiffre sur une grille, ils ne peuvent plus se chevaucher.
  ville: ({ d, styles }) => (
    <div style={{ height: "100%", padding: 32, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
      <Photo chemin={"photo"} style={{ flex: "1 1 0", minHeight: 0 }} vide="[Photo de la ville]" />
      <div style={{ flex: "none" }}>
        {rangs(styles, d.chiffres, "chiffres", 3).map((k, n, ks) => (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", columnGap: 24, padding: "9px 0", borderTop: "1px solid var(--pb-filet)", borderBottom: n === ks.length - 1 ? "1px solid var(--pb-filet)" : undefined }}>
            <Champ chemin={`chiffres.${k}.label`} className="pb-gris" style={{ fontSize: 13.5, minWidth: 0 }} />
            <Champ chemin={`chiffres.${k}.valeur`} style={{ fontSize: 28, letterSpacing: "-0.03em", whiteSpace: "nowrap", textAlign: "right" }} />
          </div>
        ))}
      </div>
      <div style={{ flex: "none", fontSize: 14, lineHeight: 1.4, color: "var(--pb-clair)" }}><Atouts as={d.atouts} max={2} lignes={2} /></div>
    </div>
  ),
  // L'emplacement : la carte, et en bas les flux autour du local (13 oct. 2026, Jules).
  // Sans la carte, les flux prennent la place, au milieu de la carte sombre.
  emplacement: ({ d, styles }) => (
    <>
      {!cache(styles, "carte") && <Carte d={d} />}
      {d.flux && !cache(styles, "flux") && <Flux seul={cache(styles, "carte")} />}
    </>
  ),
  // Le quartier (13 oct. 2026, maquette de Jules) : la photo en haut, sur toute
  // la largeur ; dessous, les quatre indicateurs en tuiles côte à côte ; puis
  // les trois atouts A, B, C, séparés d'un filet.
  quartier: ({ d, styles }) => (
    <div style={{ height: "100%", padding: 26, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}>
      <Photo chemin={"photo"} style={{ flex: "1 1 0", minHeight: 0 }} vide="[Photo du quartier]" />
      {rangs(styles, d.chiffres, "chiffres", 4).length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${rangs(styles, d.chiffres, "chiffres", 4).length}, minmax(0, 1fr))`, gap: 10 }}>
        {rangs(styles, d.chiffres, "chiffres", 4).map((k) => (
          <div key={k} className="pb-boite" style={{ borderRadius: 14, padding: "14px 16px", minHeight: 108, display: "flex", flexDirection: "column", gap: 4 }}>
            <Champ chemin={`chiffres.${k}.valeur`} style={{ fontSize: 21, lineHeight: 1.18, letterSpacing: "-0.02em", color: k === 1 ? "var(--pb-sauge)" : undefined }} />
            <Champ chemin={`chiffres.${k}.label`} className="pb-gris" style={{ fontSize: 12, lineHeight: 1.3 }} />
          </div>
        ))}
      </div>}
      <div style={{ fontSize: 14.5, lineHeight: 1.35 }}><Atouts as={d.atouts} padding="9px 0" filets /></div>
    </div>
  ),
  local: ({ d, styles }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
      {rangs(styles, d.stats, "stats", 3).length > 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${rangs(styles, d.stats, "stats", 3).length}, minmax(0, 1fr))`, gap: 12 }}>
        {rangs(styles, d.stats, "stats", 3).map((k) => (
          <div key={k} className={k === 0 ? "pb-pleine" : "pb-boite"} style={{ padding: "16px 20px" }}>
            <Champ chemin={`stats.${k}.valeur`} style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.03em" }} />
            <Champ chemin={`stats.${k}.label`} className={k === 0 ? "" : "pb-gris"} style={{ marginTop: 6, fontSize: 13 }} />
          </div>
        ))}
      </div>}
      {rangs(styles, d.identite, "identite").length > 0 && <div><Libelle cle="identite" className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }} /><Lignes ls={d.identite} chemin="identite" /></div>}
      {rangs(styles, d.economie, "economie").length > 0 && <div><Libelle cle="economie" className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }} /><Lignes ls={d.economie} chemin="economie" valeurCouleur={(k) => (k === 1 ? "var(--pb-sauge)" : undefined)} /></div>}
    </div>
  ),
  // Trois photos : la grande à gauche, deux à droite ; deux : côte à côte ; une : toute la carte.
  photos: ({ styles }) => {
    const ks = [0, 1, 2].filter((k) => !cache(styles, `photos.${k}`));
    const grille = ks.length === 3 ? { gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: "repeat(2, minmax(0, 1fr))" } : { gridTemplateColumns: `repeat(${Math.max(1, ks.length)}, minmax(0, 1fr))`, gridTemplateRows: "minmax(0, 1fr)" };
    return (
      <div style={{ height: "100%", padding: 12, display: "grid", ...grille, gap: 12 }}>
        {ks.map((k, n) => <Photo key={k} chemin={`photos.${k}`} style={{ gridRow: ks.length === 3 && n === 0 ? "1 / 3" : undefined, borderRadius: 18 }} vide={`[Photo ${k + 1}]`} />)}
      </div>
    );
  },
  bail: ({ d, set, styles }) => (
    <div style={{ height: "100%", padding: "26px 36px", display: "flex", flexDirection: "column", fontSize: 15 }}>
      {rangs(styles, d.points, "points").map((k, n) => (
        <div key={k} className="pb-item" style={{ flex: "1 1 0", display: "grid", gridTemplateColumns: "34px 220px 1fr", alignItems: "center", borderTop: n ? "1px solid var(--pb-filet-doux)" : undefined }}>
          <span className="pb-sauge" style={{ fontSize: 13 }}>{String(n + 1).padStart(2, "0")}</span>
          <Champ chemin={`points.${k}.titre`} className="pb-gris" />
          <Champ chemin={`points.${k}.valeur`} />
          <Retirer onClick={() => set(`points.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("points.+", { titre: "Nouveau point", valeur: "[À compléter]" })} style={{ left: 36, bottom: 6 }} mot="Point" />
    </div>
  ),
  enseignes: ({ d, styles }) => {
    const ks = rangs(styles, d.enseignes, "enseignes", 6);
    const colonnes = Math.min(3, Math.max(1, ks.length));
    return (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: `repeat(${colonnes}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.max(1, Math.ceil(ks.length / colonnes))}, minmax(0, 1fr))`, gap: 12 }}>
      {ks.map((k) => {
        const e = d.enseignes[k];
        // La sixième tuile reste un emplacement libre, en pointillé, tant qu'elle n'a pas d'enseigne.
        const libre = k === 5 && /^\[/.test(String(e.nom || "")) && !e.logo;
        return (
        <div key={k} style={{ borderRadius: 18, background: libre ? "transparent" : "var(--pb-verre)", border: libre ? "1px dashed var(--pb-pointille)" : "1px solid var(--pb-filet-doux)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <Photo chemin={`enseignes.${k}.logo`} style={{ flex: "1 1 0", minHeight: 0, borderRadius: 10, background: libre ? "transparent" : "var(--pb-ivoire)" }} vide="[Logo]" className={libre ? "pb-logo pb-logo-libre" : "pb-logo"} />
          <div>
            <Champ chemin={`enseignes.${k}.nom`} style={{ fontSize: 17 }} />
            <Champ chemin={`enseignes.${k}.secteur`} className="pb-gris" style={{ fontSize: 13 }} />
          </div>
        </div>
        );
      })}
    </div>
    );
  },
  // Le marché face au local (maquette de Jules, 13 oct. 2026) : pour le prix des murs et pour le loyer, une barre grise
  // (le marché du secteur) et une barre sauge (le local), la valeur au bout, l'écart à droite du titre.
  marche: ({ d, styles }) => {
    // « 2 816 €/m² » → 2816 ; une fourchette (« 387 – 580 €/m²/an ») → son milieu ; une case à remplir → rien.
    const chiffre = (v) => {
      const t = String(v ?? "");
      if (/^\s*\[/.test(t)) return null;
      const ns = (t.match(/\d{1,3}(?:[\s\u202f\u00a0]\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) || []).map((x) => Number(x.replace(/[\s\u202f\u00a0]/g, "").replace(",", "."))).filter((n) => n > 0);
      return ns.length ? (ns.length > 1 ? (ns[0] + ns[1]) / 2 : ns[0]) : null;
    };
    const illustratif = [];
    const bloc = (titre, cMarche, cLocal) => {
      const m = chiffre(lire(d, cMarche));
      const l = chiffre(lire(d, cLocal));
      // Les longueurs : la plus grande valeur prend toute la piste ; un marché sans chiffre, une longueur d'exemple.
      const haut = Math.max(m || 0, l || 0) || 1;
      const lm = m ? m / haut : 0.47;
      const ll = l ? l / haut : 1;
      if (!m) illustratif.push(titre);
      const ecart = m && l ? `${l >= m ? "+" : "−"}${Math.round(Math.abs((l - m) / m) * 100)} %` : "[écart]";
      const barre = (part, fond, chemin, couleur) => (
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: `${Math.max(0.08, part) * 66}%`, height: 42, borderRadius: 8, background: fond, flex: "none" }} />
          <Champ chemin={chemin} style={{ fontSize: 22, letterSpacing: "-0.02em", whiteSpace: "nowrap", color: couleur }} />
        </div>
      );
      return (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
            <Libelle cle={titre} as="span" style={{ fontSize: 19, letterSpacing: "-0.01em" }} />
            <span className="pb-gris" style={{ fontSize: 13.5, whiteSpace: "nowrap", display: "inline-flex", gap: 5 }}><Libelle cle="ecart" as="span" />{ecart}</span>
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {barre(lm, "var(--pb-barre-marche)", cMarche, "var(--pb-clair)")}
            {barre(ll, "var(--pb-sauge)", cLocal, "var(--pb-sauge)")}
          </div>
        </div>
      );
    };
    const murs = cache(styles, "marche.murs") ? null : bloc("murs", "marche.murs", "local.prix_m2");
    const loyer = cache(styles, "marche.loyer") ? null : bloc("loyer", "marche.loyer", "local.loyer_m2");
    const pastille = (fond) => <span style={{ width: 14, height: 14, borderRadius: 3, background: fond, flex: "none" }} />;
    return (
      <div style={{ height: "100%", padding: "28px 30px 26px", display: "flex", flexDirection: "column" }}>
        {!cache(styles, "legende") && <div className="pb-gris" style={{ display: "flex", alignItems: "center", gap: 26, fontSize: 14.5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{pastille("var(--pb-barre-marche)")}<Libelle cle="marche_secteur" as="span" /></span>
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{pastille("var(--pb-sauge)")}<Libelle cle="le_local" as="span" /></span>
        </div>}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
          {murs}
          {loyer}
        </div>
        {illustratif.length > 0 && (
          <div className="pb-gris" style={{ borderTop: "1px solid var(--pb-filet-doux)", paddingTop: 16, fontSize: 13 }}>Longueurs des barres marché illustratives tant que les valeurs ne sont pas renseignées</div>
        )}
      </div>
    );
  },
  projection: ({ d, styles }) => {
    const barres = d.barres || [];
    const ks = rangs(styles, d.lignes, "lignes", 4);
    return (
      <div style={{ height: "100%", padding: "28px 36px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          {ks.map((k, n) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "12px 0", borderTop: n ? "1px solid rgba(242,243,245,.11)" : undefined, borderBottom: n === ks.length - 1 ? "1px solid var(--pb-filet)" : undefined }}>
              <Champ chemin={`lignes.${k}.label`} className="pb-gris" style={{ fontSize: 14 }} />
              <Champ chemin={`lignes.${k}.valeur`} style={{ fontSize: 34, letterSpacing: "-0.025em", color: k === 3 ? "var(--pb-sauge)" : undefined }} />
            </div>
          ))}
        </div>
        {!cache(styles, "barres") && <>
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", alignItems: "flex-end", gap: 5 }}>
            {barres.map((v, k) => <div key={k} className="f-bar" title={`Année ${k + 1}`} style={{ flex: "1 1 0", height: `${Math.max(2, Math.min(100, Number(v) || 0))}%`, borderRadius: "9999px 9999px 0 0", background: k === barres.length - 1 ? "var(--pb-sauge)" : "rgba(242,243,245,.2)" }} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--pb-gris-fonce)" }}>
            <span>Année 1</span><Champ chemin={"legende"} /><span>Année {barres.length || 20}</span>
          </div>
        </>}
      </div>
    );
  },
  revenus: ({ d, styles }) => {
    if (cache(styles, "lignes")) return null;
    const grille = { display: "grid", gridTemplateColumns: ".5fr 1fr 1fr 1fr 1.1fr", alignItems: "center", textAlign: "right" };
    if (!(d.lignes || []).length) return <p className="pb-gris" style={{ margin: 0, padding: 36, fontSize: 14 }}>Loyer ou prix d’acquisition manquant : le tableau se remplit depuis le simulateur du projet.</p>;
    return (
      <div style={{ height: "100%", padding: "20px 32px 22px", display: "flex", flexDirection: "column" }}>
        <div className="pb-sauge" style={{ ...grille, padding: "6px 2px 8px", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", borderBottom: "1px solid var(--pb-filet)" }}>
          {(d.entetes || []).map((e, k) => <Champ key={k} chemin={`entetes.${k}`} style={{ textAlign: k ? "right" : "left" }} />)}
        </div>
        {d.lignes.map((l, r) => (
          <div key={r} style={{ ...grille, flex: "1 1 0", padding: "0 2px", fontSize: 13, borderBottom: "1px solid rgba(242,243,245,.07)" }}>
            {l.map((c, k) => <Champ key={k} chemin={`lignes.${r}.${k}`} style={{ textAlign: k ? "right" : "left", color: k === 0 || k === 2 ? "var(--pb-gris)" : r === d.lignes.length - 1 && k === 4 ? "var(--pb-sauge)" : undefined }} />)}
          </div>
        ))}
      </div>
    );
  },
  conditions: ({ d, styles }) => {
    const ks = rangs(styles, d.blocs, "blocs", 4);
    return (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: `repeat(${ks.length > 1 ? 2 : 1}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.max(1, Math.ceil(ks.length / 2))}, minmax(0, 1fr))`, gap: 12 }}>
      {ks.map((k) => (
        <div key={k} className={k === 1 ? "pb-pleine" : k === 0 ? "pb-boite" : "pb-pointillee"} style={{ padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ chemin={`blocs.${k}.titre`} style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: k === 1 ? undefined : "var(--pb-gris)" }} />
          <Champ chemin={`blocs.${k}.valeur`} style={{ fontSize: k < 2 ? 62 : 46, lineHeight: 0.95, letterSpacing: "-0.04em", color: k >= 2 ? "var(--pb-gris)" : undefined }} />
        </div>
      ))}
    </div>
    );
  },
  porteur: ({ d, styles }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-around" }}>
      {!cache(styles, "experiences") && <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <Libelle cle="experiences" className="pb-etiquette pb-sauge" />
        <Champ chemin={"experiences"} multiligne style={{ marginTop: 8, fontSize: 16, lineHeight: 1.45, color: "var(--pb-clair)" }} />
      </div>}
      {rangs(styles, d.situation, "situation", 3).length > 0 && <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <Libelle cle="situation" className="pb-etiquette pb-sauge" />
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: `repeat(${rangs(styles, d.situation, "situation", 3).length}, minmax(0, 1fr))`, gap: 20 }}>
          {rangs(styles, d.situation, "situation", 3).map((k) => (
            <div key={k}>
              <Champ chemin={`situation.${k}.valeur`} style={{ fontSize: 20, letterSpacing: "-0.015em" }} />
              <Champ chemin={`situation.${k}.label`} className="pb-gris" style={{ marginTop: 2, fontSize: 13 }} />
            </div>
          ))}
        </div>
      </div>}
      {rangs(styles, d.revenus, "revenus").length > 0 && <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <Libelle cle="revenus" className="pb-etiquette pb-sauge" />
        <div style={{ marginTop: 6 }}><Lignes ls={d.revenus} chemin="revenus" /></div>
      </div>}
    </div>
  ),
  structuration: ({ d, styles }) => {
    const st = d.structure || {};
    const de = d.detient || {};
    return (
      <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {rangs(styles, d.associes, "associes", 2).length > 0 && <>
        <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: `repeat(${rangs(styles, d.associes, "associes", 2).length}, minmax(0, 1fr))`, gap: 12 }}>
          {rangs(styles, d.associes, "associes", 2).map((k) => (
            <div key={k} className="pb-boite" style={{ padding: "18px 22px" }}>
              <Champ chemin={`associes.${k}.titre`} defaut={LIBELLES.structuration.associe} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 20 }}>
                <Champ chemin={`associes.${k}.nom`} />
                <Champ chemin={`associes.${k}.part`} className="pb-sauge" />
              </div>
            </div>
          ))}
        </div>
        {!cache(styles, "structure") && <>
          {rangs(styles, d.associes, "associes", 2).length > 1 && <div style={{ alignSelf: "stretch", height: 26, margin: "0 25%", border: "1px solid var(--pb-pointille)", borderTop: 0, borderRadius: "0 0 14px 14px" }} />}
          <div style={{ width: 1, height: 26, background: "var(--pb-pointille)" }} />
        </>}
        </>}
        {!cache(styles, "structure") && <div className="pb-pleine" style={{ width: 400, padding: "22px 26px", textAlign: "center" }}>
          <Champ chemin={"structure.type"} className="pb-etiquette" />
          <Champ chemin={"structure.nom"} style={{ marginTop: 6, fontSize: 28, letterSpacing: "-0.02em" }} />
          <Champ chemin={"structure.statut"} style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>}
        {!cache(styles, "structure") && !cache(styles, "detient") && <div style={{ width: 1, height: 32, background: "var(--pb-pointille)" }} />}
        {!cache(styles, "detient") && <div style={{ width: 400, padding: "18px 22px", borderRadius: 20, border: "1px solid var(--pb-filet)", textAlign: "center" }}>
          <Champ chemin={"detient.titre"} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
          <Champ chemin={"detient.adresse"} style={{ marginTop: 6, fontSize: 18 }} />
          <Champ chemin={"detient.loue"} className="pb-gris" style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>}
      </div>
    );
  },
  merci: ({ styles }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <img src="/logo-klocka-presentation.png" alt="Klocka" style={{ width: 260 }} draggable={false} />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Photo chemin={"photo"} style={{ flex: "0 0 120px", height: 120, borderRadius: 9999 }} vide="[Photo]" />
        {!cache(styles, "porteur") && <div><Libelle cle="contact" className="pb-etiquette pb-sauge" /><Champ chemin={"porteur"} style={{ marginTop: 6, fontSize: 36, letterSpacing: "-0.025em" }} /></div>}
      </div>
      {!cache(styles, "coordonnees") && <div style={{ fontSize: 17 }}>
        {["telephone", "email"].map((cle) => (
          <div key={cle} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderTop: "1px solid var(--pb-filet)" }}>
            <Libelle cle={cle} as="span" className="pb-gris" /><Champ chemin={cle} />
          </div>
        ))}
      </div>}
    </div>
  ),
};


/** La carte de l'emplacement : Google Maps (12 oct. 2026, à la place des tuiles IGN), centrée sur le local ; le repère pulse en lecture. */
/** Les flux piéton et voiture, posés en bas de la carte : la densité, puis l'estimation basse (heure creuse) et haute (heure de pointe). */
/** Une note en étoiles jaunes : pleines jusqu'à la note, éteintes ensuite. */
function Etoiles({ n, sur = 5 }) {
  if (!Number.isFinite(n)) return null;
  return (
    <span aria-label={`${n} sur ${sur}`} title={`${n} sur ${sur}`} style={{ flex: "none", fontSize: 17, letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
      <span style={{ color: "var(--pb-etoile)" }}>{"★".repeat(n)}</span><span style={{ color: "var(--pb-etoile-eteinte)" }}>{"★".repeat(Math.max(0, sur - n))}</span>
    </span>
  );
}

function Flux({ seul = false }) {
  const { d, styles } = useContext(Diapo);
  const colonnes = [["pieton", "flux_pieton"], ["voiture", "flux_voiture"]].filter(([cle]) => !cache(styles, `flux.${cle}`));
  if (!colonnes.length) return null;
  const colonne = (cle, titre) => (
    <div style={{ minWidth: 0 }}>
      <Libelle cle={titre} className="pb-etiquette pb-sauge" />
      {/* La densité à gauche, la note en étoiles jaunes alignée à droite du cadre (13 oct. 2026, Jules). */}
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Champ chemin={`flux.${cle}.densite`} style={{ fontSize: 20, letterSpacing: "-0.015em" }} />
        <Etoiles n={d.flux?.[cle]?.etoiles?.note} sur={d.flux?.[cle]?.etoiles?.sur} />
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: "1px solid var(--pb-filet)" }}><Libelle cle="heure_creuse" as="span" className="pb-gris" /><Champ chemin={`flux.${cle}.basse`} /></div>
        {/* Pas d'heure de pointe pour le flux voiture (13 oct. 2026, Jules). */}
        {cle !== "voiture" && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: "1px solid var(--pb-filet-doux)" }}><Libelle cle="heure_pointe" as="span" className="pb-gris" /><Champ chemin={`flux.${cle}.haute`} /></div>}
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", left: 18, right: 18, ...(seul ? { top: "50%", transform: "translateY(-50%)" } : { bottom: 18 }), zIndex: 2, borderRadius: 18, padding: "14px 20px", background: "rgba(18, 19, 18, 0.9)", border: "1px solid var(--pb-filet)", backdropFilter: "blur(8px)", display: "grid", gridTemplateColumns: `repeat(${colonnes.length}, minmax(0, 1fr))`, gap: 28 }}>
      {colonnes.map(([cle, titre]) => <React.Fragment key={cle}>{colonne(cle, titre)}</React.Fragment>)}
    </div>
  );
}

function Carte({ d }) {
  const ctx = useContext(Diapo);
  const lat = Number(d.lat);
  const lon = Number(d.lon);
  const ok = d.lat != null && d.lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  // Un échec (serveur qui redémarre, réseau) n'est pas définitif : deux nouveaux essais, espacés, avant d'abandonner.
  const [essai, setEssai] = useState(0);
  useEffect(() => { setEssai(0); }, [lat, lon]);
  if (!ok) return <div className="pb-photo-vide" style={{ alignItems: "end", paddingBottom: 40 }}>Adresse non géolocalisable : carte à insérer.</div>;
  // La carte est centrée sur le point : le repère est au milieu.
  const px = CARTE.w / 2;
  const py = CARTE.h / 2;
  const rate = essai > 2;
  const rater = () => setTimeout(() => setEssai((n) => n + 1), 1500 * (essai + 1));
  return (
    <>
      {rate
        ? <div className="pb-photo-vide" style={{ position: "absolute", inset: 0 }}>Carte Google Maps indisponible</div>
        : <img key={essai} src={`/api/presentations-carte?lat=${lat}&lon=${lon}${essai ? `&essai=${essai}` : ""}`} alt="Plan du quartier" draggable={false} onError={rater} {...propsSource(ctx, "carte")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <span className="f-pulse" style={{ position: "absolute", left: px - 12, top: py - 12, width: 24, height: 24, borderRadius: 9999, background: "var(--pb-encre)" }} />
      <span style={{ position: "absolute", left: px - 9, top: py - 9, width: 18, height: 18, borderRadius: 9999, background: "var(--pb-sauge)", border: "3px solid var(--pb-encre)" }} />
      <Champ chemin="legende" className="f-pin" style={{ position: "absolute", left: px + 20, top: py - 40, padding: "10px 20px", borderRadius: 9999, background: "var(--pb-encre)", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }} />
    </>
  );
}

/** Le panneau de gauche d'une diapositive : le chapitre et le numéro en haut ; le chiffre ou le titre, l'accroche, la note, calés en bas. */
function Heros({ d, rang, total }) {
  const h = d.heros || {};
  const t = TAILLES[d.type] || {};
  const grand = h.grand !== undefined ? "grand" : "titre";
  return (
    <div className="pb-heros-corps">
      <div className="pb-heros-haut">
        <Champ chemin="chapitre" />
        <span className="pb-heros-rang">{rang ? `${String(rang).padStart(2, "0")} — ${total}` : "masquée"}</span>
      </div>
      <div className="pb-heros-bas">
        {d.type === "porteur" && <Photo chemin="heros.photo" style={{ width: 140, height: 140, borderRadius: 9999, background: "transparent", border: "1.5px dashed var(--pb-encre)" }} vide="[Photo]" />}
        <Champ chemin={`heros.${grand}`} as="h2" className="pb-grand" multiligne style={{ margin: 0, fontSize: t.grand || t.titre || 60 }} />
        <Champ chemin="heros.accroche" className="pb-accroche" multiligne style={{ fontSize: t.accroche || 24 }} />
        {h.note !== undefined && <Champ chemin="heros.note" className="pb-note" />}
        {d.type === "couverture" && (
          <div style={{ display: "flex", gap: 28, fontSize: 14, paddingTop: 8 }}>
            <div><Libelle cle="porteur" className="pb-etiquette" /><Champ chemin="heros.porteur" style={{ marginTop: 4 }} /></div>
            <div><Libelle cle="attention" className="pb-etiquette" /><Champ chemin="heros.banque" style={{ marginTop: 4 }} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** La barre noire du bas : le logo, l'étape, la frise à repères, le compteur, les flèches. */
function Barre({ d, rang, total, visibles, onAller, onPrecedente, onSuivante }) {
  const { edition } = useContext(Diapo);
  const part = rang ? ((rang - 0.5) / total) * 100 : 0;
  return (
    <div className="pb-barre">
      <img src="/logo-klocka-presentation.png" alt="Klocka" style={{ height: 17 }} draggable={false} />
      <Champ chemin="etape" className="pb-barre-etape" />
      <div className="pb-frise">
        <div style={{ position: "absolute", left: 0, top: 35, height: 2, width: `${part}%`, background: "var(--pb-sauge)", transition: "width 1.3s cubic-bezier(.7,0,.2,1)" }} />
        {rang ? <div style={{ position: "absolute", left: `${part}%`, top: 28, width: 16, height: 16, marginLeft: -8, borderRadius: 9999, background: "var(--pb-sauge)", boxShadow: "0 0 0 5px rgba(150,192,184,.25)", transition: "left 1.3s cubic-bezier(.7,0,.2,1)" }} /> : null}
        {visibles.map((x, k) => (
          <button key={x.id} type="button" className="pb-repere" onClick={(e) => { e.stopPropagation(); onAller(x.id); }} aria-label={`${String(k + 1).padStart(2, "0")} · ${x.etape || ""}`} title={`${String(k + 1).padStart(2, "0")} · ${x.etape || ""}`}
            style={{ left: `${((k + 0.5) / total) * 100}%` }}>
            <span style={{ background: rang && k < rang ? "var(--pb-sauge)" : "rgba(242,243,245,.4)" }} />
          </button>
        ))}
      </div>
      <span className="pb-compteur" style={{ fontSize: 13, letterSpacing: ".08em", color: "var(--pb-clair)", whiteSpace: "nowrap" }}>{rang ? `${String(rang).padStart(2, "0")} / ${total}` : "—"}</span>
      <button type="button" className="pb-fleche" onClick={(e) => { e.stopPropagation(); onPrecedente(); }} aria-label="Diapositive précédente" title="Précédente" style={{ border: "1px solid var(--pb-pointille)", background: "transparent", color: "var(--pb-ivoire)" }}>←</button>
      <button type="button" className="pb-fleche" onClick={(e) => { e.stopPropagation(); onSuivante(); }} aria-label="Diapositive suivante" title="Suivante" style={{ background: "var(--pb-sauge)", color: "var(--pb-encre)", marginLeft: -20 }}>→</button>
      {edition ? null : <span className="pb-touche" aria-hidden>← → au clavier</span>}
    </div>
  );
}

/**
 * Le deck : toutes les diapositives, le numéro courant en état, deux modes.
 * @param {Array} diapos toutes les diapositives, masquées comprises
 * @param {string} courante l'id de la diapositive affichée
 * @param {(id: string) => void} onCourante changer de diapositive
 * @param {"lecture"|"edition"} mode
 * @param {object|null} selection { diapo, chemin, taille } en édition
 * @param {(sel: object|null) => void} onSelection
 * @param {(d: object) => void} onChange une diapositive retouchée
 * @param {(diapoId: string, chemin: string) => void} onPhoto ouvre le choix d'une photo
 * @param {number} relief l'inclinaison 3D à la souris, 0 à 12 (6 par défaut)
 * @param {boolean} impression la diapositive figée pour le PDF : rien ne bouge, tout est posé
 */
export default function Deck({ diapos, courante, onCourante, mode = "edition", selection = null, onSelection = () => {}, onChange, onPhoto, relief = 6, sceneRef = null, impression = false, sources = null, onSource = null }) {
  const edition = mode === "edition";
  const scene = useRef(null);
  const [echelle, setEchelle] = useState(impression ? 1 : 0.5);
  useLayoutEffect(() => {
    const el = scene.current;
    // À l'impression, la diapositive est à sa taille : Chrome remesure la page en imprimant, et la réduisait aux deux tiers.
    if (!el || impression) return undefined;
    // Le cadre tient dans la scène : à la largeur, ou à la hauteur en plein écran.
    // L'échelle va par pas de 1/80 : le cadre mesure alors 16 x 9 pixels entiers par pas. À une taille fractionnaire,
    // les bandes en 3D (calques à part, découpés au pixel entier) dépassaient sous la barre en un trait fin.
    const mesurer = () => setEchelle(Math.max(1, Math.floor(80 * Math.min(el.clientWidth / LARGEUR, el.clientHeight ? el.clientHeight / HAUTEUR : 10))) / 80);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (sceneRef) sceneRef.current = scene.current; });

  const visibles = diapos.filter((d) => !d.masquee);
  const total = visibles.length;
  let i = diapos.findIndex((d) => d.id === courante);
  if (i < 0) i = 0;
  const rangDe = (d) => (d.masquee ? null : visibles.indexOf(d) + 1);
  // Précédente et suivante sautent les diapositives masquées en lecture.
  const voisine = (sens) => {
    let k = i;
    for (let n = 0; n < diapos.length; n++) {
      k = (k + sens + diapos.length) % diapos.length;
      if (edition || !diapos[k].masquee) return diapos[k].id;
    }
    return diapos[i]?.id;
  };
  const precedente = () => onCourante(voisine(-1));
  const suivante = () => onCourante(voisine(1));

  // La 3D suit la souris, en lecture seulement.
  const [souris, setSouris] = useState({ mx: 0, my: 0 });
  const bouge = (e) => {
    if (edition || !relief) return;
    const r = e.currentTarget.getBoundingClientRect();
    setSouris({ mx: (e.clientX - r.left) / r.width - 0.5, my: (e.clientY - r.top) / r.height - 0.5 });
  };
  const ry = edition ? 0 : Math.round(souris.mx * relief * 20) / 10;
  const rx = edition ? 0 : Math.round(-souris.my * relief * 14) / 10;

  // Les flèches du clavier, hors d'un texte en cours de frappe.
  useEffect(() => {
    const clavier = (e) => {
      if (document.activeElement?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); suivante(); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); precedente(); }
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  });

  const contexteDe = (d) => ({
    d, styles: d.styles || {}, selection, edition, onPhoto,
    sources: sources ? sources[d.id] || {} : null, surSource: onSource,
    set: (chemin, valeur) => onChange(poser(d, chemin, valeur)),
    choisir: onSelection,
    aller: onCourante,
  });

  return (
    <div ref={scene} className={`pb pb-scene ${edition ? "pb-mode-edition" : "pb-mode-lecture"} ${impression ? "pb-impression" : ""} ${sources ? "pb-mode-sources" : ""}`} onClick={() => { if (edition) onSelection(null); }}>
      <div className="pb-cadre" style={{ width: LARGEUR * echelle, height: HAUTEUR * echelle }}>
        <div className="pb-diapo" style={{ transform: `scale(${echelle})` }} onMouseMove={bouge} onMouseLeave={() => setSouris({ mx: 0, my: 0 })}>
          <div className="pb-etage">
            {/* Les numéros en filigrane : une bande, seul le courant est visible. */}
            <div aria-hidden className="pb-bande" style={{ width: diapos.length * PAS_FILIGRANE, transform: `translate(${-i * PAS_FILIGRANE + (edition ? 0 : Math.round(-souris.mx * 60))}px, ${edition ? 0 : Math.round(-souris.my * 36)}px)` }}>
              {diapos.map((d, k) => <span key={d.id} className="pb-filigrane" style={{ left: 34 + k * PAS_FILIGRANE, opacity: k === i ? 1 : 0 }}>{String(rangDe(d) || k + 1).padStart(2, "0")}</span>)}
            </div>
            {/* Les cartes, en profondeur : la courante de face, la suivante tournée à droite, la précédente partie à gauche. */}
            <div className="pb-cartes-3d" style={{ transform: `rotateY(${ry}deg) rotateX(${rx}deg)` }}>
              <div className="pb-bande" style={{ width: diapos.length * PAS_CARTES, transform: `translateX(${-i * PAS_CARTES}px)` }}>
                {diapos.map((d, k) => {
                  const delta = k - i;
                  const Contenu = CARTES[d.type];
                  const transform = delta === 0 ? "translateZ(0px) rotateY(0deg) scale(1)" : delta > 0 ? "translateZ(-140px) rotateY(-22deg) scale(.9)" : "translateX(-180px) translateZ(-200px) rotateY(24deg) scale(.84)";
                  return (
                    <Diapo.Provider key={d.id} value={contexteDe(d)}>{/* la carte reçoit aussi le contexte en props : set, edition, aller (12 oct. 2026) */}
                      <div className={`pb-carte f-carte ${delta === 0 ? "f-on" : "f-s"} ${d.masquee ? "pb-carte-masquee" : ""} ${delta === 0 ? "" : "pb-carte-loin"}`}
                        style={{ left: CARTE.x + k * PAS_CARTES, top: CARTE.y, transform, opacity: d.masquee && delta === 0 ? 0.35 : delta < 0 ? 0 : delta === 0 ? 1 : 0.6, background: d.type === "merci" ? "var(--pb-noir)" : undefined }}>
                        <div className="pb-carte-corps">{Contenu ? <Contenu {...contexteDe(d)} /> : null}</div>
                      </div>
                    </Diapo.Provider>
                  );
                })}
              </div>
            </div>
            {/* Les textes de gauche : une bande, un bloc par diapositive. */}
            <div className="pb-heros">
              <div className="pb-bande" style={{ width: diapos.length * PAS_HEROS, transform: `translateX(${-i * PAS_HEROS}px)` }}>
                {diapos.map((d, k) => (
                  <Diapo.Provider key={d.id} value={contexteDe(d)}>
                    <div className={`pb-heros-bloc ${k === i ? "f-on" : "f-s pb-heros-loin"}`} style={{ left: k * PAS_HEROS }}>
                      <Heros d={d} rang={rangDe(d)} total={total} />
                    </div>
                  </Diapo.Provider>
                ))}
              </div>
            </div>
          </div>
          <Diapo.Provider value={contexteDe(diapos[i] || {})}>
            <Barre d={diapos[i] || {}} rang={rangDe(diapos[i] || {})} total={total} visibles={visibles} onAller={onCourante} onPrecedente={precedente} onSuivante={suivante} />
          </Diapo.Provider>
        </div>
      </div>
    </div>
  );
}
