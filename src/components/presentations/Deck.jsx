import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CARTE, HAUTEUR, LARGEUR, TAILLES } from "@/lib/presentation-modele";
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
//  - édition : un clic sur un élément le sélectionne (le panneau de droite
//    règle sa mise en forme), un texte se retape sur place, une liste
//    s'allonge (+) ou se raccourcit (×), une photo se change au clic.
// Le PPTX (server/presentation-projet.js, DESSINS) dessine les mêmes
// diapositives, à plat, avec les mêmes mises en forme (diapo.styles).

const echapper = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PAS_CARTES = 740;
const PAS_HEROS = 500;
const PAS_FILIGRANE = 1600;

/** Pure : la valeur à un chemin pointé. */
export const lire = (o, chemin) => chemin.split(".").reduce((x, k) => x?.[k], o);

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
const couleurCss = (c) => (!c ? undefined : /^#/.test(c) ? c : PALETTE.find(([k]) => k === c)?.[2]);
/** La mise en forme d'un élément (diapo.styles[chemin]) en CSS. */
export const styleCss = (st) => (st ? {
  ...(st.taille ? { fontSize: st.taille } : {}),
  ...(st.gras ? { fontWeight: 600 } : {}),
  ...(st.italique ? { fontStyle: "italic" } : {}),
  ...(st.couleur ? { color: couleurCss(st.couleur) } : {}),
  ...(st.aligner ? { textAlign: st.aligner } : {}),
  ...(st.opacite != null ? { opacity: st.opacite / 100 } : {}),
  ...(st.masque ? { display: "none" } : {}),
} : undefined);

// Ce qu'une diapositive donne à ses éléments : ses données, la retouche, la
// sélection et le mode.
const Diapo = createContext({ d: {}, set: () => {}, styles: {}, selection: null, choisir: () => {}, edition: false, onPhoto: () => {}, aller: () => {} });

/** Un texte de la diapositive. En édition : un clic le sélectionne, il se retape sur place ; gardé quand on en sort. */
function Champ({ chemin, className = "", style = undefined, multiligne = false, as: Balise = "div" }) {
  const ref = useRef(null);
  const { d, set, styles, selection, choisir, edition } = useContext(Diapo);
  const valeur = lire(d, chemin);
  const texte = String(valeur ?? "");
  const st = styles?.[chemin];
  useLayoutEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.innerText = texte;
  }, [texte]);
  if (st?.masque) return null;
  const choisi = selection?.diapo === d.id && selection?.chemin === chemin;
  const sortir = () => {
    const t = (ref.current?.innerText || "").replace(/\u00a0/g, " ").replace(/\n+$/, "");
    if (t !== texte) set(chemin, t);
  };
  return (
    <Balise ref={ref} className={`pb-champ ${choisi ? "pb-choisi" : ""} ${className}`} style={{ ...style, ...styleCss(st) }}
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
  const { d, styles, selection, choisir, edition, onPhoto } = useContext(Diapo);
  const url = lire(d, chemin);
  const st = styles?.[chemin];
  if (st?.masque) return null;
  const choisi = selection?.diapo === d.id && selection?.chemin === chemin;
  const ouvrir = () => { if (!edition) return; choisir({ diapo: d.id, chemin, taille: null }); onPhoto(d.id, chemin); };
  return (
    <div className={`pb-photo ${edition ? "pb-photo-edit" : ""} ${choisi ? "pb-choisi" : ""} ${className}`} style={{ ...style, ...styleCss(st) }} role={edition ? "button" : undefined} tabIndex={edition ? 0 : -1}
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
  return (ls || []).map((l, k) => (
    <div key={k} className="pb-ligne" style={{ fontSize: taille }}>
      <Champ chemin={`${chemin}.${k}.label`} className="pb-gris" />
      <Champ chemin={`${chemin}.${k}.valeur`} style={{ color: valeurCouleur(k) }} />
    </div>
  ));
}
function Atouts({ as, padding = "4px 0", filets = false }) {
  return (as || []).slice(0, 3).map((a, k) => (
    <div key={k} style={{ display: "flex", gap: 16, padding, borderTop: filets ? `1px solid var(${k === 0 ? "--pb-filet" : "--pb-filet-doux"})` : undefined }}>
      <span className="pb-sauge" style={{ flex: "0 0 16px", fontSize: 13 }}>{"ABC"[k]}</span>
      <Champ chemin={`atouts.${k}`} style={{ flex: 1 }} multiligne />
    </div>
  ));
}

// --- Les cartes de droite --------------------------------------------------

const CARTES = {
  couverture: ({ d }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><img src="/logo-klocka-presentation.png" alt="Klocka" style={{ height: 24 }} draggable={false} /></div>
      <Photo chemin={"photo"} style={{ flex: "1 1 0", minHeight: 0 }} vide="[Photo de couverture]" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24 }}>
        {(d.stats || []).slice(0, 3).map((c, k) => <Chiffre key={k} chemin={`stats.${k}`} couleur={k === 1 ? "var(--pb-sauge)" : undefined} />)}
      </div>
    </div>
  ),
  sommaire: ({ d, set }) => (
    <div style={{ height: "100%", padding: "28px 36px", display: "flex", flexDirection: "column" }}>
      {(d.items || []).map((it, k) => (
        <div key={k} className="pb-item" style={{ flex: "1 1 0", display: "flex", alignItems: "center", gap: 22, borderTop: k ? "1px solid rgba(242,243,245,.11)" : undefined, fontSize: 21, letterSpacing: "-0.01em" }}>
          <span className="pb-sauge" style={{ flex: "0 0 32px", fontSize: 14 }}>{String(k + 1).padStart(2, "0")}</span>
          <Champ chemin={`items.${k}.titre`} style={{ flex: 1 }} />
          <Champ chemin={`items.${k}.page`} style={{ fontSize: 14, color: "var(--pb-gris-fonce)" }} />
          <Retirer onClick={() => set(`items.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("items.+", { titre: "Nouvelle partie", page: "p. —" })} style={{ left: 36, bottom: 8 }} mot="Partie" />
    </div>
  ),
  ville: ({ d }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <Photo chemin={"photo"} style={{ height: 130 }} vide="[Photo de la ville]" />
      <div>
        {(d.chiffres || []).slice(0, 3).map((c, k) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "11px 0", borderTop: "1px solid var(--pb-filet)", borderBottom: k === 2 ? "1px solid var(--pb-filet)" : undefined }}>
            <Champ chemin={`chiffres.${k}.label`} className="pb-gris" style={{ fontSize: 14 }} />
            <Champ chemin={`chiffres.${k}.valeur`} style={{ fontSize: 34, letterSpacing: "-0.03em", whiteSpace: "nowrap" }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.4, color: "var(--pb-clair)" }}><Atouts as={d.atouts} /></div>
    </div>
  ),
  emplacement: ({ d }) => <Carte d={d} />,
  quartier: ({ d }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", gap: 24 }}>
      <Photo chemin={"photo"} style={{ flex: "0 0 190px" }} vide="[Photo du quartier]" />
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px 22px" }}>
          {(d.chiffres || []).slice(0, 4).map((c, k) => <Chiffre key={k} chemin={`chiffres.${k}`} taille={23} labelTaille={12.5} couleur={k === 1 ? "var(--pb-sauge)" : undefined} />)}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.4 }}><Atouts as={d.atouts} padding="10px 0" filets /></div>
      </div>
    </div>
  ),
  local: ({ d }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {(d.stats || []).slice(0, 3).map((c, k) => (
          <div key={k} className={k === 0 ? "pb-pleine" : "pb-boite"} style={{ padding: "16px 20px" }}>
            <Champ chemin={`stats.${k}.valeur`} style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.03em" }} />
            <Champ chemin={`stats.${k}.label`} className={k === 0 ? "" : "pb-gris"} style={{ marginTop: 6, fontSize: 13 }} />
          </div>
        ))}
      </div>
      <div><div className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }}>Identité</div><Lignes ls={d.identite} chemin="identite" /></div>
      <div><div className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }}>Économie de la signature</div><Lignes ls={d.economie} chemin="economie" valeurCouleur={(k) => (k === 1 ? "var(--pb-sauge)" : undefined)} /></div>
    </div>
  ),
  photos: () => (
    <div style={{ height: "100%", padding: 12, display: "grid", gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      <Photo chemin={"photos.0"} style={{ gridRow: "1 / 3", borderRadius: 18 }} vide="[Photo 1]" />
      <Photo chemin={"photos.1"} style={{ borderRadius: 18 }} vide="[Photo 2]" />
      <Photo chemin={"photos.2"} style={{ borderRadius: 18 }} vide="[Photo 3]" />
    </div>
  ),
  bail: ({ d, set }) => (
    <div style={{ height: "100%", padding: "26px 36px", display: "flex", flexDirection: "column", fontSize: 15 }}>
      {(d.points || []).map((p, k) => (
        <div key={k} className="pb-item" style={{ flex: "1 1 0", display: "grid", gridTemplateColumns: "34px 220px 1fr", alignItems: "center", borderTop: k ? "1px solid var(--pb-filet-doux)" : undefined }}>
          <span className="pb-sauge" style={{ fontSize: 13 }}>{String(k + 1).padStart(2, "0")}</span>
          <Champ chemin={`points.${k}.titre`} className="pb-gris" />
          <Champ chemin={`points.${k}.valeur`} />
          <Retirer onClick={() => set(`points.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("points.+", { titre: "Nouveau point", valeur: "[À compléter]" })} style={{ left: 36, bottom: 6 }} mot="Point" />
    </div>
  ),
  enseignes: ({ d }) => (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {(d.enseignes || []).slice(0, 6).map((e, k) => {
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
  ),
  marche: ({ d }) => {
    const deux = (cle, champs) => (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 24 }}>
        {champs.map(([v, lb]) => (
          <div key={v}>
            <Champ chemin={`${cle}.${v}`} style={{ fontSize: 36, letterSpacing: "-0.025em", color: cle === "marche" ? "var(--pb-gris)" : undefined }} />
            <Champ chemin={`${cle}.${lb}`} style={{ marginTop: 4, fontSize: 13.5, color: cle === "marche" ? "var(--pb-gris)" : undefined }} />
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ height: "100%", padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ flex: "1 1 0", borderRadius: 20, border: "1px solid var(--pb-filet)", padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ chemin={"marche.titre"} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
          {deux("marche", [["murs", "murs_label"], ["loyer", "loyer_label"]])}
        </div>
        <div className="pb-gris" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13.5 }}><div style={{ flex: 1, height: 1, background: "var(--pb-filet)" }} /><span>comparé à</span><div style={{ flex: 1, height: 1, background: "var(--pb-filet)" }} /></div>
        <div className="pb-pleine" style={{ flex: "1 1 0", padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ chemin={"local.titre"} className="pb-etiquette" />
          {deux("local", [["prix_m2", "prix_label"], ["loyer_m2", "loyer_label"]])}
        </div>
      </div>
    );
  },
  projection: ({ d }) => {
    const barres = d.barres || [];
    return (
      <div style={{ height: "100%", padding: "28px 36px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          {(d.lignes || []).slice(0, 4).map((l, k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "12px 0", borderTop: k ? "1px solid rgba(242,243,245,.11)" : undefined, borderBottom: k === 3 ? "1px solid var(--pb-filet)" : undefined }}>
              <Champ chemin={`lignes.${k}.label`} className="pb-gris" style={{ fontSize: 14 }} />
              <Champ chemin={`lignes.${k}.valeur`} style={{ fontSize: 34, letterSpacing: "-0.025em", color: k === 3 ? "var(--pb-sauge)" : undefined }} />
            </div>
          ))}
        </div>
        <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", alignItems: "flex-end", gap: 5 }}>
          {barres.map((v, k) => <div key={k} className="f-bar" title={`Année ${k + 1}`} style={{ flex: "1 1 0", height: `${Math.max(2, Math.min(100, Number(v) || 0))}%`, borderRadius: "9999px 9999px 0 0", background: k === barres.length - 1 ? "var(--pb-sauge)" : "rgba(242,243,245,.2)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--pb-gris-fonce)" }}>
          <span>Année 1</span><Champ chemin={"legende"} /><span>Année {barres.length || 20}</span>
        </div>
      </div>
    );
  },
  revenus: ({ d }) => {
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
  conditions: ({ d }) => (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {(d.blocs || []).slice(0, 4).map((b, k) => (
        <div key={k} className={k === 1 ? "pb-pleine" : k === 0 ? "pb-boite" : "pb-pointillee"} style={{ padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ chemin={`blocs.${k}.titre`} style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: k === 1 ? undefined : "var(--pb-gris)" }} />
          <Champ chemin={`blocs.${k}.valeur`} style={{ fontSize: k < 2 ? 62 : 46, lineHeight: 0.95, letterSpacing: "-0.04em", color: k >= 2 ? "var(--pb-gris)" : undefined }} />
        </div>
      ))}
    </div>
  ),
  porteur: ({ d }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Principales expériences</div>
        <Champ chemin={"experiences"} multiligne style={{ marginTop: 8, fontSize: 16, lineHeight: 1.45, color: "var(--pb-clair)" }} />
      </div>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Situation professionnelle</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
          {(d.situation || []).slice(0, 3).map((c, k) => (
            <div key={k}>
              <Champ chemin={`situation.${k}.valeur`} style={{ fontSize: 20, letterSpacing: "-0.015em" }} />
              <Champ chemin={`situation.${k}.label`} className="pb-gris" style={{ marginTop: 2, fontSize: 13 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Revenus et épargne</div>
        <div style={{ marginTop: 6 }}><Lignes ls={d.revenus} chemin="revenus" /></div>
      </div>
    </div>
  ),
  structuration: ({ d }) => {
    const st = d.structure || {};
    const de = d.detient || {};
    return (
      <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {(d.associes || []).slice(0, 2).map((a, k) => (
            <div key={k} className="pb-boite" style={{ padding: "18px 22px" }}>
              <div className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }}>Associé</div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 20 }}>
                <Champ chemin={`associes.${k}.nom`} />
                <Champ chemin={`associes.${k}.part`} className="pb-sauge" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ alignSelf: "stretch", height: 26, margin: "0 25%", border: "1px solid var(--pb-pointille)", borderTop: 0, borderRadius: "0 0 14px 14px" }} />
        <div style={{ width: 1, height: 26, background: "var(--pb-pointille)" }} />
        <div className="pb-pleine" style={{ width: 400, padding: "22px 26px", textAlign: "center" }}>
          <Champ chemin={"structure.type"} className="pb-etiquette" />
          <Champ chemin={"structure.nom"} style={{ marginTop: 6, fontSize: 28, letterSpacing: "-0.02em" }} />
          <Champ chemin={"structure.statut"} style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>
        <div style={{ width: 1, height: 32, background: "var(--pb-pointille)" }} />
        <div style={{ width: 400, padding: "18px 22px", borderRadius: 20, border: "1px solid var(--pb-filet)", textAlign: "center" }}>
          <Champ chemin={"detient.titre"} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
          <Champ chemin={"detient.adresse"} style={{ marginTop: 6, fontSize: 18 }} />
          <Champ chemin={"detient.loue"} className="pb-gris" style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>
      </div>
    );
  },
  merci: ({ d }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <img src="/logo-klocka-presentation.png" alt="Klocka" style={{ width: 260 }} draggable={false} />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Photo chemin={"photo"} style={{ flex: "0 0 120px", height: 120, borderRadius: 9999 }} vide="[Photo]" />
        <div><div className="pb-etiquette pb-sauge">Contact</div><Champ chemin={"porteur"} style={{ marginTop: 6, fontSize: 36, letterSpacing: "-0.025em" }} /></div>
      </div>
      <div style={{ fontSize: 17 }}>
        {[["telephone", "Téléphone"], ["email", "E-mail"]].map(([cle, mot]) => (
          <div key={cle} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderTop: "1px solid var(--pb-filet)" }}>
            <span className="pb-gris">{mot}</span><Champ chemin={cle} />
          </div>
        ))}
      </div>
    </div>
  ),
};


/** La carte IGN de l'emplacement, les mêmes tuiles que le PPTX : zoom 16, cinq sur quatre. Le repère pulse en lecture. */
function Carte({ d }) {
  const lat = Number(d.lat);
  const lon = Number(d.lon);
  const ok = d.lat != null && d.lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  if (!ok) return <div className="pb-photo-vide" style={{ alignItems: "end", paddingBottom: 40 }}>Adresse non géolocalisable : carte à insérer.</div>;
  const n = 2 ** 16;
  const rad = (lat * Math.PI) / 180;
  const cx = ((lon + 180) / 360) * n;
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x0 = Math.round(cx - 2.5);
  const y0 = Math.round(cy - 2);
  const tw = CARTE.w / 5;
  const th = CARTE.h / 4;
  const tuiles = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) tuiles.push({ i, j, url: `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=16&TILEROW=${y0 + j}&TILECOL=${x0 + i}` });
  const px = ((cx - x0) / 5) * CARTE.w;
  const py = ((cy - y0) / 4) * CARTE.h;
  return (
    <>
      {tuiles.map((t) => <img key={`${t.i}-${t.j}`} src={t.url} alt="" draggable={false} style={{ position: "absolute", left: t.i * tw, top: t.j * th, width: tw + 0.5, height: th + 0.5 }} />)}
      <span className="f-pulse" style={{ position: "absolute", left: px - 12, top: py - 12, width: 24, height: 24, borderRadius: 9999, background: "var(--pb-encre)" }} />
      <span style={{ position: "absolute", left: px - 9, top: py - 9, width: 18, height: 18, borderRadius: 9999, background: "var(--pb-sauge)", border: "3px solid var(--pb-encre)" }} />
      <Champ chemin="legende" className="f-pin" style={{ position: "absolute", left: px + 20, top: py - 40, padding: "10px 20px", borderRadius: 9999, background: "var(--pb-encre)", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }} />
      <span style={{ position: "absolute", right: 20, bottom: 8, fontSize: 10, color: "var(--pb-encre)" }}>© IGN</span>
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
        <span>{rang ? `${String(rang).padStart(2, "0")} — ${total}` : "masquée"}</span>
      </div>
      <div className="pb-heros-bas">
        {d.type === "porteur" && <Photo chemin="heros.photo" style={{ width: 140, height: 140, borderRadius: 9999, background: "transparent", border: "1.5px dashed var(--pb-encre)" }} vide="[Photo]" />}
        <Champ chemin={`heros.${grand}`} as="h2" className="pb-grand" multiligne style={{ margin: 0, fontSize: t.grand || t.titre || 60 }} />
        <Champ chemin="heros.accroche" className="pb-accroche" multiligne style={{ fontSize: t.accroche || 24 }} />
        {h.note !== undefined && <Champ chemin="heros.note" className="pb-note" />}
        {d.type === "couverture" && (
          <div style={{ display: "flex", gap: 28, fontSize: 14, paddingTop: 8 }}>
            <div><div className="pb-etiquette">Porteur du projet</div><Champ chemin="heros.porteur" style={{ marginTop: 4 }} /></div>
            <div><div className="pb-etiquette">À l’attention de</div><Champ chemin="heros.banque" style={{ marginTop: 4 }} /></div>
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
      <span style={{ fontSize: 13, letterSpacing: ".08em", color: "var(--pb-clair)", whiteSpace: "nowrap" }}>{rang ? `${String(rang).padStart(2, "0")} / ${total}` : "—"}</span>
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
 */
export default function Deck({ diapos, courante, onCourante, mode = "edition", selection = null, onSelection = () => {}, onChange, onPhoto, relief = 6, sceneRef = null }) {
  const edition = mode === "edition";
  const scene = useRef(null);
  const [echelle, setEchelle] = useState(0.5);
  useLayoutEffect(() => {
    const el = scene.current;
    if (!el) return undefined;
    // Le cadre tient dans la scène : à la largeur, ou à la hauteur en plein écran.
    const mesurer = () => setEchelle(Math.min(el.clientWidth / LARGEUR, el.clientHeight ? el.clientHeight / HAUTEUR : 10));
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
    set: (chemin, valeur) => onChange(poser(d, chemin, valeur)),
    choisir: onSelection,
    aller: onCourante,
  });

  return (
    <div ref={scene} className={`pb pb-scene ${edition ? "pb-mode-edition" : "pb-mode-lecture"}`} onClick={() => { if (edition) onSelection(null); }}>
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
                    <Diapo.Provider key={d.id} value={contexteDe(d)}>
                      <div className={`pb-carte f-carte ${delta === 0 ? "f-on" : "f-s"} ${d.masquee ? "pb-carte-masquee" : ""} ${delta === 0 ? "" : "pb-carte-loin"}`}
                        style={{ left: CARTE.x + k * PAS_CARTES, top: CARTE.y, transform, opacity: d.masquee && delta === 0 ? 0.35 : delta < 0 ? 0 : delta === 0 ? 1 : 0.6, background: d.type === "merci" ? "var(--pb-noir)" : undefined }}>
                        <div className="pb-carte-corps">{Contenu ? <Contenu d={d} /> : null}</div>
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
