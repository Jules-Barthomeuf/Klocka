import React, { useLayoutEffect, useRef, useState } from "react";
import { CARTE, HAUTEUR, LARGEUR, TAILLES } from "@/lib/presentation-modele";
import "./presentation-bancaire.css";

// Les seize diapositives de la présentation bancaire, sur le « Deck complet »
// de Jules (12 oct. 2026) : le panneau sauge à gauche, la carte sombre à
// droite, la barre noire en bas, dessinés comme le PPTX qui en sort
// (server/presentation-projet.js, DESSINS), à plat : les animations du modèle
// ne passent ni en PPTX ni en PDF. Tout texte se modifie au clic ; une liste
// s'allonge (+) ou se raccourcit (×) ; une photo se change au clic. Chaque
// retouche rend la diapositive entière, que l'éditeur enregistre.

const echapper = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pure : pose une valeur à un chemin pointé ; null sur un élément de liste le retire, « + » ajoute. */
export function poser(diapo, chemin, valeur) {
  const copie = JSON.parse(JSON.stringify(diapo));
  const morceaux = chemin.split(".");
  let o = copie;
  for (const m of morceaux.slice(0, -1)) o = o[Array.isArray(o) ? Number(m) : m];
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

/** Un texte de la diapositive, modifiable sur place ; gardé quand on en sort. Entrée valide, Maj+Entrée passe à la ligne. */
function Champ({ valeur, onGarde, className = "", style = undefined, multiligne = false, as: Balise = "div" }) {
  const ref = useRef(null);
  const texte = String(valeur ?? "");
  const sortir = () => {
    const t = (ref.current?.innerText || "").replace(/\u00a0/g, " ").replace(/\n+$/, "");
    if (t !== texte) onGarde(t);
  };
  return (
    <Balise ref={ref} className={`pb-champ ${className}`} style={style} contentEditable suppressContentEditableWarning spellCheck
      onBlur={sortir}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !(multiligne && e.shiftKey)) { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.innerText = texte; e.currentTarget.blur(); }
      }}
      // Le texte posé une fois par valeur : React ne touche pas ce que la frappe a changé.
      dangerouslySetInnerHTML={{ __html: echapper(texte) }} />
  );
}

/** Une photo : un clic la change (photos du projet, import, ou rien). */
function Photo({ url, onChoisir, style, className = "", vide = "[Photo]" }) {
  return (
    <div className={`pb-photo ${className}`} style={style} role="button" tabIndex={0} onClick={onChoisir}
      onKeyDown={(e) => { if (e.key === "Enter") onChoisir(); }} title="Changer la photo">
      {url ? <img src={url} alt="" draggable={false} style={className === "pb-logo" ? { objectFit: "contain", padding: 14 } : undefined} /> : <span className="pb-photo-vide">{vide}</span>}
    </div>
  );
}

const Ajouter = ({ onClick, style, mot = "Ajouter" }) => (
  <button type="button" className="pb-geste" style={style} onClick={onClick}>+ {mot}</button>
);
const Retirer = ({ onClick, style }) => (
  <button type="button" className="pb-retirer" style={style} onClick={onClick} aria-label="Retirer" title="Retirer">×</button>
);

/** Un chiffre et son libellé sous un filet. */
function Chiffre({ c, chemin, set, taille = 30, couleur, labelTaille = 13 }) {
  return (
    <div className="pb-filet-haut" style={{ paddingTop: 10 }}>
      <Champ valeur={c?.valeur} onGarde={(v) => set(`${chemin}.valeur`, v)} style={{ fontSize: taille, letterSpacing: "-0.025em", color: couleur }} />
      <Champ valeur={c?.label} onGarde={(v) => set(`${chemin}.label`, v)} className="pb-gris" style={{ marginTop: 2, fontSize: labelTaille }} />
    </div>
  );
}
/** Une liste libellé / valeur. */
function Lignes({ ls, chemin, set, taille = 15, valeurCouleur = () => undefined }) {
  return (ls || []).map((l, k) => (
    <div key={k} className="pb-ligne" style={{ fontSize: taille }}>
      <Champ valeur={l.label} onGarde={(v) => set(`${chemin}.${k}.label`, v)} className="pb-gris" />
      <Champ valeur={l.valeur} onGarde={(v) => set(`${chemin}.${k}.valeur`, v)} style={{ color: valeurCouleur(k) }} />
    </div>
  ));
}
function Atouts({ as, set, padding = "4px 0", filets = false }) {
  return (as || []).slice(0, 3).map((a, k) => (
    <div key={k} style={{ display: "flex", gap: 16, padding, borderTop: filets ? `1px solid var(${k === 0 ? "--pb-filet" : "--pb-filet-doux"})` : undefined }}>
      <span className="pb-sauge" style={{ flex: "0 0 16px", fontSize: 13 }}>{"ABC"[k]}</span>
      <Champ valeur={a} onGarde={(v) => set(`atouts.${k}`, v)} style={{ flex: 1 }} multiligne />
    </div>
  ));
}

// --- Les cartes de droite --------------------------------------------------

const CARTES = {
  couverture: ({ d, set, photo }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><img src="/logo-klocka-presentation.png" alt="Klocka" style={{ height: 24 }} draggable={false} /></div>
      {photo("photo", { flex: "1 1 0", minHeight: 0 }, "[Photo de couverture]")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 24 }}>
        {(d.stats || []).slice(0, 3).map((c, k) => <Chiffre key={k} c={c} chemin={`stats.${k}`} set={set} couleur={k === 1 ? "var(--pb-sauge)" : undefined} />)}
      </div>
    </div>
  ),
  sommaire: ({ d, set }) => (
    <div style={{ height: "100%", padding: "28px 36px", display: "flex", flexDirection: "column" }}>
      {(d.items || []).map((it, k) => (
        <div key={k} className="pb-item" style={{ flex: "1 1 0", display: "flex", alignItems: "center", gap: 22, borderTop: k ? "1px solid rgba(242,243,245,.11)" : undefined, fontSize: 21, letterSpacing: "-0.01em" }}>
          <span className="pb-sauge" style={{ flex: "0 0 32px", fontSize: 14 }}>{String(k + 1).padStart(2, "0")}</span>
          <Champ valeur={it.titre} onGarde={(v) => set(`items.${k}.titre`, v)} style={{ flex: 1 }} />
          <Champ valeur={it.page} onGarde={(v) => set(`items.${k}.page`, v)} style={{ fontSize: 14, color: "var(--pb-gris-fonce)" }} />
          <Retirer onClick={() => set(`items.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("items.+", { titre: "Nouvelle partie", page: "p. —" })} style={{ left: 36, bottom: 8 }} mot="Partie" />
    </div>
  ),
  ville: ({ d, set, photo }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {photo("photo", { height: 130 }, "[Photo de la ville]")}
      <div>
        {(d.chiffres || []).slice(0, 3).map((c, k) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "11px 0", borderTop: "1px solid var(--pb-filet)", borderBottom: k === 2 ? "1px solid var(--pb-filet)" : undefined }}>
            <Champ valeur={c.label} onGarde={(v) => set(`chiffres.${k}.label`, v)} className="pb-gris" style={{ fontSize: 14 }} />
            <Champ valeur={c.valeur} onGarde={(v) => set(`chiffres.${k}.valeur`, v)} style={{ fontSize: 34, letterSpacing: "-0.03em", whiteSpace: "nowrap" }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.4, color: "var(--pb-clair)" }}><Atouts as={d.atouts} set={set} /></div>
    </div>
  ),
  emplacement: ({ d, set }) => <Carte d={d} set={set} />,
  quartier: ({ d, set, photo }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", gap: 24 }}>
      {photo("photo", { flex: "0 0 190px" }, "[Photo du quartier]")}
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "18px 22px" }}>
          {(d.chiffres || []).slice(0, 4).map((c, k) => <Chiffre key={k} c={c} chemin={`chiffres.${k}`} set={set} taille={23} labelTaille={12.5} couleur={k === 1 ? "var(--pb-sauge)" : undefined} />)}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.4 }}><Atouts as={d.atouts} set={set} padding="10px 0" filets /></div>
      </div>
    </div>
  ),
  local: ({ d, set }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {(d.stats || []).slice(0, 3).map((c, k) => (
          <div key={k} className={k === 0 ? "pb-pleine" : "pb-boite"} style={{ padding: "16px 20px" }}>
            <Champ valeur={c.valeur} onGarde={(v) => set(`stats.${k}.valeur`, v)} style={{ fontSize: 36, lineHeight: 1, letterSpacing: "-0.03em" }} />
            <Champ valeur={c.label} onGarde={(v) => set(`stats.${k}.label`, v)} className={k === 0 ? "" : "pb-gris"} style={{ marginTop: 6, fontSize: 13 }} />
          </div>
        ))}
      </div>
      <div><div className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }}>Identité</div><Lignes ls={d.identite} chemin="identite" set={set} /></div>
      <div><div className="pb-etiquette pb-sauge" style={{ paddingBottom: 8 }}>Économie de la signature</div><Lignes ls={d.economie} chemin="economie" set={set} valeurCouleur={(k) => (k === 1 ? "var(--pb-sauge)" : undefined)} /></div>
    </div>
  ),
  photos: ({ photo }) => (
    <div style={{ height: "100%", padding: 12, display: "grid", gridTemplateColumns: "1.7fr 1fr", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {photo("photos.0", { gridRow: "1 / 3", borderRadius: 18 }, "[Photo 1]")}
      {photo("photos.1", { borderRadius: 18 }, "[Photo 2]")}
      {photo("photos.2", { borderRadius: 18 }, "[Photo 3]")}
    </div>
  ),
  bail: ({ d, set }) => (
    <div style={{ height: "100%", padding: "26px 36px", display: "flex", flexDirection: "column", fontSize: 15 }}>
      {(d.points || []).map((p, k) => (
        <div key={k} className="pb-item" style={{ flex: "1 1 0", display: "grid", gridTemplateColumns: "34px 220px 1fr", alignItems: "center", borderTop: k ? "1px solid var(--pb-filet-doux)" : undefined }}>
          <span className="pb-sauge" style={{ fontSize: 13 }}>{String(k + 1).padStart(2, "0")}</span>
          <Champ valeur={p.titre} onGarde={(v) => set(`points.${k}.titre`, v)} className="pb-gris" />
          <Champ valeur={p.valeur} onGarde={(v) => set(`points.${k}.valeur`, v)} />
          <Retirer onClick={() => set(`points.${k}`, null)} style={{ right: -30, top: "calc(50% - 13px)" }} />
        </div>
      ))}
      <Ajouter onClick={() => set("points.+", { titre: "Nouveau point", valeur: "[À compléter]" })} style={{ left: 36, bottom: 6 }} mot="Point" />
    </div>
  ),
  enseignes: ({ d, set, photo }) => (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {(d.enseignes || []).slice(0, 6).map((e, k) => {
        // La sixième tuile reste un emplacement libre, en pointillé, tant qu'elle n'a pas d'enseigne.
        const libre = k === 5 && /^\[/.test(String(e.nom || "")) && !e.logo;
        return (
        <div key={k} style={{ borderRadius: 18, background: libre ? "transparent" : "var(--pb-verre)", border: libre ? "1px dashed var(--pb-pointille)" : "1px solid var(--pb-filet-doux)", padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          {photo(`enseignes.${k}.logo`, { flex: "1 1 0", minHeight: 0, borderRadius: 10, background: libre ? "transparent" : "var(--pb-ivoire)" }, "[Logo]", libre ? "pb-logo pb-logo-libre" : "pb-logo")}
          <div>
            <Champ valeur={e.nom} onGarde={(v) => set(`enseignes.${k}.nom`, v)} style={{ fontSize: 17 }} />
            <Champ valeur={e.secteur} onGarde={(v) => set(`enseignes.${k}.secteur`, v)} className="pb-gris" style={{ fontSize: 13 }} />
          </div>
        </div>
        );
      })}
    </div>
  ),
  marche: ({ d, set }) => {
    const deux = (cle, champs) => (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 24 }}>
        {champs.map(([v, lb]) => (
          <div key={v}>
            <Champ valeur={d[cle]?.[v]} onGarde={(x) => set(`${cle}.${v}`, x)} style={{ fontSize: 36, letterSpacing: "-0.025em", color: cle === "marche" ? "var(--pb-gris)" : undefined }} />
            <Champ valeur={d[cle]?.[lb]} onGarde={(x) => set(`${cle}.${lb}`, x)} style={{ marginTop: 4, fontSize: 13.5, color: cle === "marche" ? "var(--pb-gris)" : undefined }} />
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ height: "100%", padding: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ flex: "1 1 0", borderRadius: 20, border: "1px solid var(--pb-filet)", padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ valeur={d.marche?.titre} onGarde={(v) => set("marche.titre", v)} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
          {deux("marche", [["murs", "murs_label"], ["loyer", "loyer_label"]])}
        </div>
        <div className="pb-gris" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13.5 }}><div style={{ flex: 1, height: 1, background: "var(--pb-filet)" }} /><span>comparé à</span><div style={{ flex: 1, height: 1, background: "var(--pb-filet)" }} /></div>
        <div className="pb-pleine" style={{ flex: "1 1 0", padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ valeur={d.local?.titre} onGarde={(v) => set("local.titre", v)} className="pb-etiquette" />
          {deux("local", [["prix_m2", "prix_label"], ["loyer_m2", "loyer_label"]])}
        </div>
      </div>
    );
  },
  projection: ({ d, set }) => {
    const barres = d.barres || [];
    return (
      <div style={{ height: "100%", padding: "28px 36px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          {(d.lignes || []).slice(0, 4).map((l, k) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "12px 0", borderTop: k ? "1px solid rgba(242,243,245,.11)" : undefined, borderBottom: k === 3 ? "1px solid var(--pb-filet)" : undefined }}>
              <Champ valeur={l.label} onGarde={(v) => set(`lignes.${k}.label`, v)} className="pb-gris" style={{ fontSize: 14 }} />
              <Champ valeur={l.valeur} onGarde={(v) => set(`lignes.${k}.valeur`, v)} style={{ fontSize: 34, letterSpacing: "-0.025em", color: k === 3 ? "var(--pb-sauge)" : undefined }} />
            </div>
          ))}
        </div>
        <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", alignItems: "flex-end", gap: 5 }}>
          {barres.map((v, k) => <div key={k} title={`Année ${k + 1}`} style={{ flex: "1 1 0", height: `${Math.max(2, Math.min(100, Number(v) || 0))}%`, borderRadius: "9999px 9999px 0 0", background: k === barres.length - 1 ? "var(--pb-sauge)" : "rgba(242,243,245,.2)" }} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--pb-gris-fonce)" }}>
          <span>Année 1</span><Champ valeur={d.legende} onGarde={(v) => set("legende", v)} /><span>Année {barres.length || 20}</span>
        </div>
      </div>
    );
  },
  revenus: ({ d, set }) => {
    const grille = { display: "grid", gridTemplateColumns: ".5fr 1fr 1fr 1fr 1.1fr", alignItems: "center", textAlign: "right" };
    if (!(d.lignes || []).length) return <p className="pb-gris" style={{ margin: 0, padding: 36, fontSize: 14 }}>Loyer ou prix d’acquisition manquant : le tableau se remplit depuis le simulateur du projet.</p>;
    return (
      <div style={{ height: "100%", padding: "20px 32px 22px", display: "flex", flexDirection: "column" }}>
        <div className="pb-sauge" style={{ ...grille, padding: "6px 2px 8px", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", borderBottom: "1px solid var(--pb-filet)" }}>
          {(d.entetes || []).map((e, k) => <Champ key={k} valeur={e} onGarde={(v) => set(`entetes.${k}`, v)} style={{ textAlign: k ? "right" : "left" }} />)}
        </div>
        {d.lignes.map((l, r) => (
          <div key={r} style={{ ...grille, flex: "1 1 0", padding: "0 2px", fontSize: 13, borderBottom: "1px solid rgba(242,243,245,.07)" }}>
            {l.map((c, k) => <Champ key={k} valeur={c} onGarde={(v) => set(`lignes.${r}.${k}`, v)} style={{ textAlign: k ? "right" : "left", color: k === 0 || k === 2 ? "var(--pb-gris)" : r === d.lignes.length - 1 && k === 4 ? "var(--pb-sauge)" : undefined }} />)}
          </div>
        ))}
      </div>
    );
  },
  conditions: ({ d, set }) => (
    <div style={{ height: "100%", padding: 32, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridTemplateRows: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {(d.blocs || []).slice(0, 4).map((b, k) => (
        <div key={k} className={k === 1 ? "pb-pleine" : k === 0 ? "pb-boite" : "pb-pointillee"} style={{ padding: "22px 26px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <Champ valeur={b.titre} onGarde={(v) => set(`blocs.${k}.titre`, v)} style={{ fontSize: 13, letterSpacing: ".14em", textTransform: "uppercase", color: k === 1 ? undefined : "var(--pb-gris)" }} />
          <Champ valeur={b.valeur} onGarde={(v) => set(`blocs.${k}.valeur`, v)} style={{ fontSize: k < 2 ? 62 : 46, lineHeight: 0.95, letterSpacing: "-0.04em", color: k >= 2 ? "var(--pb-gris)" : undefined }} />
        </div>
      ))}
    </div>
  ),
  porteur: ({ d, set }) => (
    <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Principales expériences</div>
        <Champ valeur={d.experiences} onGarde={(v) => set("experiences", v)} multiligne style={{ marginTop: 8, fontSize: 16, lineHeight: 1.45, color: "var(--pb-clair)" }} />
      </div>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Situation professionnelle</div>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 20 }}>
          {(d.situation || []).slice(0, 3).map((c, k) => (
            <div key={k}>
              <Champ valeur={c.valeur} onGarde={(v) => set(`situation.${k}.valeur`, v)} style={{ fontSize: 20, letterSpacing: "-0.015em" }} />
              <Champ valeur={c.label} onGarde={(v) => set(`situation.${k}.label`, v)} className="pb-gris" style={{ marginTop: 2, fontSize: 13 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="pb-filet-haut" style={{ paddingTop: 14 }}>
        <div className="pb-etiquette pb-sauge">Revenus et épargne</div>
        <div style={{ marginTop: 6 }}><Lignes ls={d.revenus} chemin="revenus" set={set} /></div>
      </div>
    </div>
  ),
  structuration: ({ d, set }) => {
    const st = d.structure || {};
    const de = d.detient || {};
    return (
      <div style={{ height: "100%", padding: "32px 36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ alignSelf: "stretch", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          {(d.associes || []).slice(0, 2).map((a, k) => (
            <div key={k} className="pb-boite" style={{ padding: "18px 22px" }}>
              <div className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }}>Associé</div>
              <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 20 }}>
                <Champ valeur={a.nom} onGarde={(v) => set(`associes.${k}.nom`, v)} />
                <Champ valeur={a.part} onGarde={(v) => set(`associes.${k}.part`, v)} className="pb-sauge" />
              </div>
            </div>
          ))}
        </div>
        <div style={{ alignSelf: "stretch", height: 26, margin: "0 25%", border: "1px solid var(--pb-pointille)", borderTop: 0, borderRadius: "0 0 14px 14px" }} />
        <div style={{ width: 1, height: 26, background: "var(--pb-pointille)" }} />
        <div className="pb-pleine" style={{ width: 400, padding: "22px 26px", textAlign: "center" }}>
          <Champ valeur={st.type} onGarde={(v) => set("structure.type", v)} className="pb-etiquette" />
          <Champ valeur={st.nom} onGarde={(v) => set("structure.nom", v)} style={{ marginTop: 6, fontSize: 28, letterSpacing: "-0.02em" }} />
          <Champ valeur={st.statut} onGarde={(v) => set("structure.statut", v)} style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>
        <div style={{ width: 1, height: 32, background: "var(--pb-pointille)" }} />
        <div style={{ width: 400, padding: "18px 22px", borderRadius: 20, border: "1px solid var(--pb-filet)", textAlign: "center" }}>
          <Champ valeur={de.titre} onGarde={(v) => set("detient.titre", v)} className="pb-etiquette" style={{ color: "var(--pb-gris-fonce)" }} />
          <Champ valeur={de.adresse} onGarde={(v) => set("detient.adresse", v)} style={{ marginTop: 6, fontSize: 18 }} />
          <Champ valeur={de.loue} onGarde={(v) => set("detient.loue", v)} className="pb-gris" style={{ marginTop: 4, fontSize: 13.5 }} />
        </div>
      </div>
    );
  },
  merci: ({ d, set, photo }) => (
    <div style={{ height: "100%", padding: 36, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <img src="/logo-klocka-presentation.png" alt="Klocka" style={{ width: 260 }} draggable={false} />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        {photo("photo", { flex: "0 0 120px", height: 120, borderRadius: 9999 }, "[Photo]")}
        <div><div className="pb-etiquette pb-sauge">Contact</div><Champ valeur={d.porteur} onGarde={(v) => set("porteur", v)} style={{ marginTop: 6, fontSize: 36, letterSpacing: "-0.025em" }} /></div>
      </div>
      <div style={{ fontSize: 17 }}>
        {[["telephone", "Téléphone"], ["email", "E-mail"]].map(([cle, mot]) => (
          <div key={cle} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderTop: "1px solid var(--pb-filet)" }}>
            <span className="pb-gris">{mot}</span><Champ valeur={d[cle]} onGarde={(v) => set(cle, v)} />
          </div>
        ))}
      </div>
    </div>
  ),
};

/** La carte IGN de l'emplacement, les mêmes tuiles que le PPTX : zoom 16, cinq sur quatre. */
function Carte({ d, set }) {
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
      <span style={{ position: "absolute", left: px - 9, top: py - 9, width: 18, height: 18, borderRadius: 9999, background: "var(--pb-sauge)", border: "3px solid var(--pb-encre)" }} />
      <Champ valeur={d.legende} onGarde={(v) => set("legende", v)} style={{ position: "absolute", left: px + 20, top: py - 40, padding: "10px 20px", borderRadius: 9999, background: "var(--pb-encre)", fontSize: 15, fontWeight: 500, whiteSpace: "nowrap" }} />
      <span style={{ position: "absolute", right: 20, bottom: 8, fontSize: 10, color: "var(--pb-encre)" }}>© IGN</span>
    </>
  );
}

/** Le panneau de gauche : le chapitre et le numéro en haut ; le chiffre ou le titre, l'accroche, la note, calés en bas. */
function Heros({ d, set, rang, total, photo }) {
  const h = d.heros || {};
  const t = TAILLES[d.type] || {};
  const grand = h.grand !== undefined ? "grand" : "titre";
  return (
    <div className="pb-heros">
      <div className="pb-heros-haut">
        <Champ valeur={d.chapitre} onGarde={(v) => set("chapitre", v)} />
        <span>{rang ? `${String(rang).padStart(2, "0")} — ${total}` : "masquée"}</span>
      </div>
      <div className="pb-heros-bas">
        {d.type === "porteur" && photo("heros.photo", { width: 140, height: 140, borderRadius: 9999, background: "transparent", border: "1.5px dashed var(--pb-encre)" }, "[Photo]")}
        <Champ valeur={h[grand]} onGarde={(v) => set(`heros.${grand}`, v)} as="h2" className="pb-grand" multiligne style={{ margin: 0, fontSize: t.grand || t.titre || 60 }} />
        <Champ valeur={h.accroche} onGarde={(v) => set("heros.accroche", v)} className="pb-accroche" multiligne style={{ fontSize: t.accroche || 24 }} />
        {h.note !== undefined && <Champ valeur={h.note} onGarde={(v) => set("heros.note", v)} className="pb-note" />}
        {d.type === "couverture" && (
          <div style={{ display: "flex", gap: 28, fontSize: 14, paddingTop: 8 }}>
            <div><div className="pb-etiquette">Porteur du projet</div><Champ valeur={h.porteur} onGarde={(v) => set("heros.porteur", v)} style={{ marginTop: 4 }} /></div>
            <div><div className="pb-etiquette">À l’attention de</div><Champ valeur={h.banque} onGarde={(v) => set("heros.banque", v)} style={{ marginTop: 4 }} /></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** La barre noire du bas : le logo, l'étape, la frise, le numéro. */
function Barre({ d, set, rang, total }) {
  const part = rang ? ((rang - 0.5) / total) * 100 : 0;
  return (
    <div className="pb-barre">
      <img src="/logo-klocka-presentation.png" alt="Klocka" style={{ height: 17 }} draggable={false} />
      <Champ valeur={d.etape} onGarde={(v) => set("etape", v)} className="pb-barre-etape" />
      <div className="pb-frise">
        <div style={{ position: "absolute", left: 0, top: 35, height: 2, width: `${part}%`, background: "var(--pb-sauge)" }} />
        {rang ? <div style={{ position: "absolute", left: `${part}%`, top: 28, width: 16, height: 16, marginLeft: -8, borderRadius: 9999, background: "var(--pb-sauge)", boxShadow: "0 0 0 5px rgba(150,192,184,.25)" }} /> : null}
        {Array.from({ length: total }, (_, k) => (
          <span key={k} style={{ position: "absolute", left: `${((k + 0.5) / total) * 100}%`, top: 32, width: 2, height: 8, marginLeft: -1, borderRadius: 2, background: rang && k < rang ? "var(--pb-sauge)" : "rgba(242,243,245,.4)" }} />
        ))}
      </div>
      <span style={{ fontSize: 13, letterSpacing: ".08em", color: "var(--pb-clair)", whiteSpace: "nowrap" }}>{rang ? `${String(rang).padStart(2, "0")} / ${total}` : "—"}</span>
      {/* Les flèches du modèle, en image : le PPTX n'a pas de clic. */}
      <span aria-hidden style={{ width: 44, height: 44, borderRadius: 9999, border: "1px solid var(--pb-pointille)", display: "grid", placeItems: "center", color: "var(--pb-ivoire)", fontSize: 18 }}>←</span>
      <span aria-hidden style={{ width: 44, height: 44, borderRadius: 9999, background: "var(--pb-sauge)", display: "grid", placeItems: "center", color: "var(--pb-encre)", fontSize: 18, marginLeft: -20 }}>→</span>
    </div>
  );
}

/**
 * Une diapositive, à la largeur de son cadre.
 * @param {object} d la diapositive
 * @param {number|null} rang sa place parmi les diapositives visibles (null : masquée)
 * @param {number} total le nombre de diapositives visibles
 * @param {(d: object) => void} onChange la diapositive retouchée
 * @param {(chemin: string) => void} onPhoto ouvre le choix d'une photo pour ce chemin
 */
export default function Diapo({ d, rang, total, onChange, onPhoto }) {
  const cadre = useRef(null);
  const [echelle, setEchelle] = useState(0.5);
  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const mesurer = () => setEchelle(el.clientWidth / LARGEUR);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const set = (chemin, valeur) => onChange(poser(d, chemin, valeur));
  const valeurDe = (chemin) => chemin.split(".").reduce((o, k) => o?.[k], d);
  const photo = (chemin, style, vide, className) => <Photo key={chemin} url={valeurDe(chemin)} style={style} vide={vide} className={className} onChoisir={() => onPhoto(chemin)} />;
  const Contenu = CARTES[d.type];
  return (
    <div ref={cadre} className="pb pb-cadre">
      <div className="pb-diapo" style={{ transform: `scale(${echelle})`, height: HAUTEUR }}>
        {rang ? <span aria-hidden className="pb-filigrane">{String(rang).padStart(2, "0")}</span> : null}
        <Heros d={d} set={set} rang={rang} total={total} photo={photo} />
        <div className="pb-carte" style={d.type === "merci" ? { background: "var(--pb-noir)" } : undefined}>
          {Contenu ? <Contenu d={d} set={set} photo={photo} /> : null}
        </div>
        <Barre d={d} set={set} rang={rang} total={total} />
      </div>
    </div>
  );
}
