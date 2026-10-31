import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Trash2 } from "lucide-react";
import LogoKP from "@/components/mandataire/LogoKP";
import { A_RENSEIGNER, euros, pourcent } from "@/lib/deck-avis";
import "./deck-avis.css";

// Le deck de l'avis de valeur K Partners (26 oct. 2026, maquette de Jules) : douze pages, un texte à gauche (numéro en
// filigrane, titre, phrase) et une carte sombre à droite. Les données viennent de `deckDeLAvis` (src/lib/deck-avis.js),
// donc de l'avis lui-même. Navigation : flèches de la barre, ← →, Page suivante / précédente, clic sur un repère,
// glissement du doigt, « #11 » dans l'adresse en plein écran. Transitions : 1,3 s, cubic-bezier(.7, 0, .2, 1).

const n2 = (i) => String(i).padStart(2, "0");
const vide = (v) => v == null || v === "" || v === A_RENSEIGNER;
const Val = ({ v, children }) => (vide(v) ? <span className="dk-vide">{A_RENSEIGNER}</span> : <>{children ?? v}</>);

/** Un élément de la cascade (fondu et remontée à l'arrivée de la page). */
const C = ({ i = 0, className = "", style, children, as: Tag = "div", chemin }) => <Tag className={`dk-c ${className}`} style={{ "--i": i, ...style }} data-chemin={chemin}>{children}</Tag>;
/** Un chiffre qui a une source (mode Sources) : son chemin dans l'avis. */
const S = ({ chemin, children }) => <span data-chemin={chemin}>{children}</span>;

// Tout texte d'une carte se retouche en mode Édition (31 oct. 2026, Jules : « pouvoir modifier toutes les informations »).
// La retouche se garde dans l'avis, comme le titre et la phrase (`avis.deck`, clé « <page>.c.<texte> ») : le deck
// l'affiche à la place de la valeur calculée ; l'avis lui-même et ses chiffres ne changent pas. Vider le champ rend la
// valeur de l'avis. Entrée enregistre, Échap annule.
const Retouches = React.createContext({ edition: false, textes: {}, onRetouche: null, page: "" });
function T({ k, children, as: Tag = "span", className, style }) {
  const { edition, textes, onRetouche, page } = React.useContext(Retouches);
  const avant = useRef("");
  const cle = `${page}.c.${k}`;
  const propre = typeof textes?.[cle] === "string" ? textes[cle] : null;
  if (!edition) {
    if (propre != null) return <Tag className={className} style={style}>{propre}</Tag>;
    return Tag === "span" && !className && !style ? <>{children}</> : <Tag className={className} style={style}>{children}</Tag>;
  }
  return (
    // La clé remonte l'élément après chaque retouche : React ne se bat pas avec ce que contentEditable a changé.
    <Tag key={propre ?? "avis"} className={className} contentEditable suppressContentEditableWarning spellCheck={false}
      style={{ ...style, outline: "1px dashed rgba(167,171,237,.6)", outlineOffset: 4, borderRadius: 4, cursor: "text" }}
      onFocus={(e) => { avant.current = e.currentTarget.textContent; }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { e.currentTarget.textContent = avant.current; e.currentTarget.blur(); }
        e.stopPropagation();
      }}
      onBlur={(e) => { const t = e.currentTarget.textContent.trim(); if (t !== avant.current.trim()) onRetouche?.(cle, t || null); }}>
      {propre ?? children}
    </Tag>
  );
}

const Lignes = ({ lignes, depart = 0, base = null, k = "l" }) => (
  <dl className="dk-lignes">
    {lignes.map((l, i) => (
      <C key={`${l.mot}-${i}`} i={depart + i} className="dk-ligne" chemin={l.chemin || (base ? `${base}.${i}` : undefined)}>
        <dt><T k={`${k}.${i}.mot`}>{l.mot}</T></dt>
        <dd className={l.vide || l.texte === A_RENSEIGNER ? "dk-vide" : l.alerte ? "dk-alerte" : ""}><T k={`${k}.${i}.texte`}>{l.texte}</T></dd>
      </C>
    ))}
  </dl>
);

const Phrase = ({ p }) => {
  if (!p) return null;
  const [a, b] = Array.isArray(p) ? p : [p, ""];
  return <p className="dk-phrase">{a}{b ? <> <em>{b}</em></> : null}</p>;
};

/** Un texte du deck retouchable en mode Édition (titre, phrase) : Entrée ou la sortie du champ l'enregistrent. */
function Editable({ cle, texte, edition, onRetouche, as: Tag = "span", className = "" }) {
  return (
    <Tag className={className} data-chemin={`deck.${cle}`} contentEditable={edition} suppressContentEditableWarning spellCheck={false}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      onBlur={(e) => { const t = e.currentTarget.textContent.trim(); if (edition && t !== texte) onRetouche?.(cle, t); }}
      style={edition ? { outline: "1px dashed rgba(14,14,16,.25)", outlineOffset: 6, borderRadius: 4, cursor: "text" } : undefined}>{texte}</Tag>
  );
}

function Gauche({ page, edition = false, onRetouche = null }) {
  if (page.cle === "couverture") {
    return (
      <>
        <T as="h1" k="titre" className="dk-titre">{page.titre}</T>
        <p className="dk-gauche-infos"><T k="adresse">{page.adresse === A_RENSEIGNER ? <span className="dk-vide">Adresse {A_RENSEIGNER}</span> : page.adresse}</T></p>
        <div className="dk-gauche-duo">
          <div><span>Mandataire</span><b><T k="mandataire"><Val v={page.mandataire} /></T></b></div>
          <div><span>À l'attention de</span><b><T k="proprietaire"><Val v={page.proprietaire} /></T></b></div>
        </div>
      </>
    );
  }
  if (edition) {
    const phrase = Array.isArray(page.phrase) ? page.phrase.filter(Boolean).join(" ") : page.phrase || "";
    return (
      <>
        <Editable as="h1" className="dk-titre" cle={`${page.cle}.titre`} texte={page.titre} edition onRetouche={onRetouche} />
        <Editable as="p" className="dk-phrase" cle={`${page.cle}.phrase`} texte={phrase} edition onRetouche={onRetouche} />
      </>
    );
  }
  return (
    <>
      <h1 className="dk-titre" data-chemin={`deck.${page.cle}.titre`}>{page.titre}</h1>
      <Phrase p={page.phrase} />
    </>
  );
}

/** Le contenu de la carte de chaque page. */
function Carte({ page }) {
  switch (page.cle) {
    case "couverture":
      return (
        <>
          <LogoKP fond="nuit" className="dk-carte-logo" />
          {/* La couverture (31 oct. 2026, maquette de Jules) : le bien, pas encore son prix. */}
          <C i={0} style={{ marginTop: 60, borderRadius: 30, border: "1px solid rgba(255,255,255,.08)", padding: "70px 40px", textAlign: "center", background: "var(--dk-panneau-valeur)" }}>
            <p className="dk-sur" style={{ color: "var(--dk-pervenche-pale)" }}><T k="etat">{page.etat}</T></p>
            <p style={{ margin: 0, fontSize: 150, fontWeight: 300, letterSpacing: "-.03em", lineHeight: 1, whiteSpace: "nowrap" }}><T k="lieu"><Val v={page.lieu} /></T></p>
            {page.accroche && <p style={{ margin: "26px 0 0", fontSize: 30 }}><T k="accroche">{page.accroche}</T></p>}
          </C>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36, marginTop: 34 }}>
            {[
              [euros(page.loyer), "Loyer annuel HT HC", false, "methodes.loyer"],
              [page.surface ? `${Math.round(page.surface).toLocaleString("fr-FR")} m²` : null, page.surface_ponderee ? "Surface pondérée" : "Surface utile", true, "description.surfaces"],
              [page.echeance ? String(page.echeance) : null, "Échéance du bail", false, "locatif.lignes.echeance"],
            ].map(([v, mot, accent, chemin], i) => (
              <C key={mot} i={1 + i} chemin={chemin} style={{ borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 24 }}>
                <b className={accent ? "dk-pervenche" : ""} style={{ display: "block", fontSize: 54, fontWeight: 300 }}><T k={`chiffre.${i}`}><Val v={v} /></T></b>
                <span style={{ fontSize: 24, color: "var(--dk-gris)" }}><T k={`legende.${i}`}>{mot}</T></span>
              </C>
            ))}
          </div>
        </>
      );
    case "sommaire":
      return (
        <div style={{ marginTop: 20 }}>
          {page.chapitres.map((ch, i) => (
            <C key={ch.n} i={i} className="dk-ligne" style={{ padding: "20px 0" }}>
              <span className="dk-pervenche" style={{ width: 70, flex: "none" }}>{n2(ch.n)}</span>
              <span style={{ flex: 1 }}><T k={`chapitre.${i}`}>{ch.mot}</T></span>
              <span style={{ color: "var(--dk-gris)" }}>p. {n2(ch.page)}</span>
            </C>
          ))}
        </div>
      );
    case "locatif":
      return (
        <>
          {page.frise.length > 1 && (
            <C i={0} style={{ position: "relative", margin: "4px 0 46px" }}>
              <div style={{ position: "absolute", left: 10, right: 10, top: 9, height: 2, background: "rgba(255,255,255,.2)" }} />
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${page.frise.length}, 1fr)` }}>
                {page.frise.map((f, i) => (
                  <div key={`${f.annee}-${f.mot}`}>
                    <span style={{ display: "block", width: f.present ? 26 : 20, height: f.present ? 26 : 20, marginTop: f.present ? -3 : 0, borderRadius: 99, background: f.present ? "var(--dk-pervenche)" : "var(--dk-carte)", border: `2px solid ${f.present ? "var(--dk-pervenche)" : "var(--dk-blanc)"}`, position: "relative", boxShadow: f.present ? "0 0 0 8px rgba(167,171,237,.25)" : "none" }} />
                    <b className={f.present ? "dk-pervenche" : ""} style={{ display: "block", marginTop: 36, fontSize: 44, fontWeight: 400 }}><T k={`frise.${i}.annee`}>{f.annee}</T></b>
                    <span style={{ fontSize: 24, color: "var(--dk-gris)" }}><T k={`frise.${i}.mot`}>{f.mot}</T></span>
                  </div>
                ))}
              </div>
            </C>
          )}
          <Lignes lignes={page.lignes} depart={1} base="locatif.lignes" />
        </>
      );
    case "ville":
      return (
        <>
          <div className="dk-tuiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {page.tuiles.map((t, i) => (
              <C key={t.mot} i={i} className="dk-tuile" chemin={`ville.${t.cle}`}><b className={t.vide ? "dk-vide" : ""} style={t.vide ? { fontSize: 40 } : undefined}><T k={`tuile.${i}.valeur`}>{t.valeur}</T></b><span><T k={`tuile.${i}.mot`}>{t.mot}</T></span></C>
            ))}
          </div>
          {page.texte && <C i={4} as="p" style={{ fontSize: 28, lineHeight: 1.45, margin: "36px 0 0", color: "var(--dk-texte-doux)" }}><T k="texte">{page.texte}</T></C>}
          <C i={5} as="p" className="dk-note" style={{ position: "absolute", bottom: 50 }}><T k="sources">{`Sources : ${page.sources}`}</T></C>
        </>
      );
    case "quartier":
      return (
        <>
          <C i={0} as="p" style={{ margin: "0 0 30px", fontSize: 42 }}><T k="titre-carte">Ce qui fait la valeur de l&apos;adresse</T></C>
          {/* En tableau (31 oct. 2026, Jules). */}
          <C i={1}>
            <table className="dk-table dk-table-lignes">
              <tbody>
                {page.lignes.map((l, i) => (
                  <tr key={`${l.mot}-${i}`} data-chemin="emplacement.lignes"><td><T k={`l.${i}.mot`}>{l.mot}</T></td><td className={l.vide ? "dk-vide" : ""}><T k={`l.${i}.texte`}>{l.texte}</T></td></tr>
                ))}
              </tbody>
            </table>
          </C>
        </>
      );
    case "local":
      return (
        <>
          {!!page.tuiles.length && (
            <div className="dk-tuiles" style={{ gridTemplateColumns: `repeat(${page.tuiles.length}, 1fr)`, marginBottom: 34 }}>
              {page.tuiles.map((t, i) => <C key={t.mot} i={i} className="dk-tuile" chemin={`description.surfaces.${i}`}><b className={i === 2 ? "dk-pervenche" : ""}><T k={`tuile.${i}.valeur`}>{t.valeur}</T></b><span><T k={`tuile.${i}.mot`}>{t.mot}</T></span></C>)}
            </div>
          )}
          {page.lignes.length ? <Lignes lignes={page.lignes} depart={3} base="description.lignes" /> : <C i={3} as="p" className="dk-vide" style={{ fontSize: 28 }}><T k="description">{`Description du local ${A_RENSEIGNER}`}</T></C>}
        </>
      );
    case "usages":
      return (
        <>
          <C i={0} as="p" className="dk-sur"><T k="sur">Activités autorisées</T></C>
          <Lignes lignes={page.autorisees} depart={1} base="juridique.lignes" />
          <C i={4} className="dk-bandeau" style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
            <div data-chemin="marche.loyers">
              <span style={{ fontSize: 26 }}><T k="marche.mot">Valeur locative de marché</T></span>
              <b style={{ display: "block", fontSize: 56, fontWeight: 300 }}><T k="marche.valeur">{page.marche ? `${page.marche.bas} – ${page.marche.haut} €/m²` : <span className="dk-vide" style={{ color: "var(--dk-pervenche-pale)" }}>{A_RENSEIGNER}</span>}</T></b>
              {page.marche?.annuel_bas && <span style={{ fontSize: 24 }}><T k="marche.annuel">{`Soit ${euros(page.marche.annuel_bas)} à ${euros(page.marche.annuel_haut)} par an`}</T></span>}
            </div>
            <div data-chemin="methodes.loyer">
              <span style={{ fontSize: 26 }}><T k="loyer.mot">Loyer actuel</T></span>
              <b style={{ display: "block", fontSize: 56, fontWeight: 300 }}><T k="loyer.valeur">{page.loyer_m2 ? `${page.loyer_m2} €/m²` : <span className="dk-vide" style={{ color: "var(--dk-pervenche-pale)" }}>{A_RENSEIGNER}</span>}</T></b>
              {page.au_marche && <span style={{ fontSize: 24 }}><T k="loyer.marche">{page.au_marche}</T></span>}
            </div>
          </C>
          {page.source && <C i={5} as="p" className="dk-note" style={{ marginTop: 18 }}><T k="source">{`Source : ${page.source}`}</T></C>}
        </>
      );
    case "taux":
      return (
        <>
          {page.etapes?.length > 0 ? (
            <C i={0} style={{ marginBottom: 30 }}>
              {page.etapes.map((x, i) => (
                <div key={x.mot} className="dk-ligne" style={{ padding: "18px 0", alignItems: "center" }}>
                  <div style={{ flex: 1 }}><span style={{ display: "block", fontSize: 30 }}><T k={`etape.${i}.mot`}>{x.mot}</T></span>{x.sous && <span style={{ fontSize: 24, color: "var(--dk-gris)" }}><T k={`etape.${i}.sous`}>{x.sous}</T></span>}</div>
                  <b style={{ fontSize: 36, fontWeight: 400, whiteSpace: "nowrap" }}><T k={`etape.${i}.valeur`}>{x.valeur}</T></b>
                </div>
              ))}
            </C>
          ) : <C i={0} as="p" className="dk-sur"><T k="sur">Pourquoi ce taux</T></C>}
          <C i={1} as="p" chemin="methodes.justification_taux" style={{ fontSize: page.etapes?.length ? 28 : 32, lineHeight: 1.45, margin: 0, color: page.justification ? "var(--dk-blanc)" : undefined }} className={page.justification ? "" : "dk-vide"}><T k="justification">{page.justification || `Justification ${A_RENSEIGNER}`}</T></C>
          {page.source && <C i={2} as="p" className="dk-note" style={{ marginTop: 22 }}><T k="source">{`Référence : ${page.source}`}</T></C>}
          <C i={3} className="dk-bandeau" style={{ position: "absolute", left: 58, right: 58, bottom: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 32 }}><T k="retenu.mot">Taux de capitalisation retenu</T></span>
            <b style={{ fontSize: 96, fontWeight: 300 }} data-chemin="methodes.taux"><T k="retenu.valeur"><Val v={page.taux}>{pourcent(page.taux)}</Val></T></b>
          </C>
        </>
      );
    case "calcul":
      return (
        <>
          <div className="dk-tuiles" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 22 }}>
            <C i={0} className="dk-tuile" chemin="methodes.loyer"><span style={{ margin: "0 0 8px", fontSize: 24 }}><T k="loyer.mot">Loyer annuel HT HC</T></span><b><T k="loyer.valeur"><Val v={euros(page.loyer)} /></T></b></C>
            <C i={1} className="dk-tuile" chemin="methodes.taux"><span style={{ margin: "0 0 8px", fontSize: 24 }}><T k="taux.mot">Taux retenu</T></span><b className="dk-pervenche"><T k="taux.valeur"><Val v={pourcent(page.taux)} /></T></b></C>
          </div>
          <C i={2} className="dk-tuile" style={{ padding: "26px 32px" }} chemin="chiffres.capitalisation">
            <p className="dk-sur" style={{ marginBottom: 10, color: "var(--dk-pervenche)" }}><T k="formule.sur">Valeur nette vendeur, hors droits</T></p>
            <p style={{ margin: 0, fontSize: 26, color: "var(--dk-gris)" }}><T k="formule.mot">Loyer ÷ taux de capitalisation</T></p>
            <p style={{ margin: "10px 0 0", fontSize: 40 }}>{page.loyer && page.taux ? <><T k="formule.calcul">{`${euros(page.loyer)} ÷ ${pourcent(page.taux)} =`}</T> <span className="dk-pervenche"><T k="formule.resultat">{euros(page.capitalisation || page.valeur)}</T></span></> : <span className="dk-vide">{A_RENSEIGNER}</span>}</p>
          </C>
          {!!page.sensibilite.length && (
            <>
              <C i={3} as="p" className="dk-sur" style={{ marginTop: 26, marginBottom: 6 }}><T k="sensibilite.sur">Sensibilité au taux</T></C>
              <C i={4}>
                <table className="dk-table">
                  <thead><tr><th><T k="sensibilite.col.0">Taux</T></th><th><T k="sensibilite.col.1">Valeur nette vendeur</T></th></tr></thead>
                  <tbody>
                    {page.sensibilite.map((x, i) => (
                      <tr key={x.taux} className={x.retenu ? "dk-votre" : ""}><td><T k={`sensibilite.${i}.taux`}>{`${pourcent(x.taux)}${x.retenu ? " · retenu" : ""}`}</T></td><td><T k={`sensibilite.${i}.valeur`}>{euros(x.valeur)}</T></td></tr>
                    ))}
                  </tbody>
                </table>
              </C>
            </>
          )}
        </>
      );
    case "valeur": {
      const pos = page.valeur && page.bas && page.haut && page.haut > page.bas ? (page.valeur - page.bas) / (page.haut - page.bas) : 0.5;
      return (
        <>
          <C i={0} as="p" className="dk-sur" style={{ color: "var(--dk-brume)" }}><T k="sur">Valeur retenue · net vendeur</T></C>
          <C i={1} as="p" chemin="chiffres.valeur" style={{ margin: 0, fontSize: 170, fontWeight: 300, letterSpacing: "-.03em", lineHeight: 1 }}><T k="valeur"><Val v={page.valeur}>{euros(page.valeur)}</Val></T></C>
          {page.bas && page.haut && (
            <C i={2} style={{ position: "relative", margin: "90px 40px 0" }}>
              <div style={{ height: 4, background: "rgba(255,255,255,.25)", borderRadius: 4 }} />
              <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 4, background: "var(--dk-blanc)", borderRadius: 4 }} />
              <span style={{ position: "absolute", top: -18, left: `calc(20% + ${pos * 60}%)`, width: 40, height: 40, marginLeft: -20, borderRadius: 99, background: "var(--dk-blanc)", boxShadow: "0 0 0 10px rgba(255,255,255,.2)" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center", marginTop: 46, fontSize: 26 }}>
                <span data-chemin="chiffres.bas"><b style={{ display: "block", fontWeight: 600 }}><T k="bas.valeur">{euros(page.bas)}</T></b><T k="bas.mot">{page.taux_bas ? `Taux à ${pourcent(page.taux_bas)}` : "Bas"}</T></span>
                <span><b style={{ display: "block", fontWeight: 600 }}><T k="milieu.valeur">{euros(page.valeur)}</T></b><T k="milieu.mot">Retenue</T></span>
                <span data-chemin="chiffres.haut"><b style={{ display: "block", fontWeight: 600 }}><T k="haut.valeur">{euros(page.haut)}</T></b><T k="haut.mot">{page.taux_haut ? `Taux à ${pourcent(page.taux_haut)}` : "Haut"}</T></span>
              </div>
            </C>
          )}
          <div style={{ position: "absolute", left: 58, right: 58, bottom: 60, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30 }}>
            {[[euros(page.prix_acquereur), `Coût acquéreur, honoraires ${String(page.honoraires_pct).replace(".", ",")} % et frais ~${String(page.frais_pct).replace(".", ",")} % inclus`, "chiffres.cout_total"], [pourcent(page.rendement_acquereur), "Rendement acquéreur", "chiffres.rendement_total"], [page.m2 ? `${page.m2.toLocaleString("fr-FR")} €/m²` : null, page.m2_pondere ? "Valeur nette vendeur, surface pondérée" : "Valeur nette vendeur, au m²", "chiffres.m2"]].map(([v, mot, chemin], i) => (
              <C key={mot} i={3 + i} chemin={chemin} style={{ borderTop: "1px solid rgba(255,255,255,.3)", paddingTop: 24 }}>
                <b style={{ display: "block", fontSize: 56, fontWeight: 300 }}><T k={`chiffre.${i}`}>{v || <span style={{ fontSize: 30, fontStyle: "italic", opacity: .7 }}>{A_RENSEIGNER}</span>}</T></b>
                <span style={{ fontSize: 24, color: "var(--dk-brume)" }}><T k={`legende.${i}`}>{mot}</T></span>
              </C>
            ))}
          </div>
        </>
      );
    }
    case "mandataire":
      return (
        <>
          <LogoKP fond="nuit" className="dk-carte-logo" />
          <C i={0} style={{ display: "flex", alignItems: "center", gap: 40, margin: "150px 0 70px" }}>
            <div data-chemin="signataire.photo" style={{ flex: "none", width: 180, height: 180, borderRadius: 999, background: page.photo ? `center / cover no-repeat url(${JSON.stringify(page.photo)})` : "var(--dk-tuile)", border: "1px solid rgba(255,255,255,.08)" }} />
            <div>
              <p data-chemin="signataire.nom" style={{ margin: 0, fontSize: 96, fontWeight: 300, letterSpacing: "-.02em", lineHeight: 1.05 }}><T k="nom"><Val v={page.nom} /></T></p>
              <p className="dk-pervenche" style={{ margin: "14px 0 0", fontSize: 30 }}><T k="fonction">Mandataire K Partners · immobilier commercial</T></p>
            </div>
          </C>
          <Lignes depart={2} lignes={[
            { mot: "Téléphone", texte: page.telephone, chemin: "signataire.telephone" }, { mot: "E-mail", texte: page.email, chemin: "signataire.email" },
            { mot: "Secteur", texte: page.secteur, chemin: "signataire.ville_signature" },
          ]} />
        </>
      );
    default:
      return null;
  }
}

/**
 * Le deck, à l'échelle de son cadre (1920 × 1080, bandes noires autour).
 * @param {{ deck: {pages: object[]}, depart?: number, clavier?: boolean, adresse?: boolean }} props
 *   `clavier` : les touches pilotent le deck ; `adresse` : la page se lit et s'écrit dans « #n ».
 */
// `transparent` (26 oct. 2026, Jules) : dans la page, autour du deck, le fond de la page plutôt que des bandes noires.
export default function DeckAvis({ deck, depart = 0, clavier = true, adresse = false, edition = false, onRetouche = null, transparent = false, onPage = null, onMasquer = null, tourne = false }) {
  const pages = deck?.pages || [];
  const total = pages.length;
  const cadre = useRef(null);
  const [echelle, setEchelle] = useState(0.5);
  const [courant, setCourant] = useState(() => {
    if (adresse && typeof window !== "undefined") { const n = Number(window.location.hash.replace("#", "")); if (n >= 1 && n <= total) return n - 1; }
    return Math.min(Math.max(0, depart), Math.max(0, total - 1));
  })  // La page affichée, pour le chat (26 oct. 2026) : « complète la page 05 » désigne la page du deck qu'on regarde.
  useEffect(() => { const p = deck?.pages?.[courant]; if (p) onPage?.({ n: courant + 1, cle: p.cle, titre: p.titre, section: p.section }); }, [courant, deck, onPage]);
;
  const [relief, setRelief] = useState({ x: 0, y: 0 });
  const aller = useCallback((i) => setCourant(Math.min(Math.max(0, i), total - 1)), [total]);
  // Une page retirée en fin de deck : on reste sur la dernière qui reste.
  useEffect(() => { if (total && courant > total - 1) setCourant(total - 1); }, [total, courant]);

  useLayoutEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const mesurer = () => setEchelle(Math.min(el.clientWidth / 1920, el.clientHeight / 1080) || 0.5);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!clavier) return undefined;
    const touche = (e) => {
      if (e.target?.closest?.("input, textarea, [contenteditable]")) return;
      if (["ArrowRight", "PageDown"].includes(e.key)) { e.preventDefault(); aller(courant + 1); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); aller(courant - 1); }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [clavier, courant, aller]);
  useEffect(() => {
    if (!adresse) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${courant + 1}`);
  }, [adresse, courant]);

  // Glisser du doigt.
  const depuis = useRef(null);
  // Tourné d'un quart de tour (le téléphone tenu debout, 27 oct. 2026) : la largeur du deck est la hauteur de l'écran.
  const axe = (t) => (tourne ? t?.clientY : t?.clientX);
  const toucher = (e) => { depuis.current = axe(e.touches?.[0]) ?? null; };
  const lacher = (e) => {
    const x = axe(e.changedTouches?.[0]);
    if (depuis.current == null || x == null) return;
    const d = x - depuis.current;
    if (Math.abs(d) > 50) aller(courant + (d < 0 ? 1 : -1));
    depuis.current = null;
  };
  // Le relief à la souris : le cadre s'incline vers le pointeur, le filigrane part dans l'autre sens.
  const bouger = (e) => {
    if (e.pointerType !== "mouse" || edition) return;
    const r = cadre.current.getBoundingClientRect();
    setRelief({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 });
  };

  const transformCarte = (d) => {
    if (d === 0) return "translate3d(0,0,0) rotateY(0deg) scale(1)";
    if (d === 1) return "translate3d(1010px,0,0) rotateY(-22deg) scale(.9)";
    if (d === -1) return "translate3d(-1800px,0,0) rotateY(22deg) scale(.84)";
    return `translate3d(${d > 0 ? 2600 : -2800}px,0,0) rotateY(${d > 0 ? -22 : 22}deg) scale(.84)`;
  };
  const avance = total > 1 ? courant / (total - 1) : 0;
  const page = pages[courant];
  if (!page) return null;

  return (
    <div ref={cadre} className={`dk-cadre ${transparent ? "dk-cadre-transparent" : ""}`} onTouchStart={toucher} onTouchEnd={lacher} onPointerMove={bouger} onPointerLeave={() => setRelief({ x: 0, y: 0 })}
      role="region" aria-roledescription="présentation" aria-label={`Avis de valeur, page ${courant + 1} sur ${total} : ${page.section}`}>
      {/* En édition : retirer la page affichée (jamais la couverture), ou remettre les pages retirées. */}
      {edition && onMasquer && (
        <div className="absolute left-3 top-3 z-20 flex gap-2">
          {page.cle !== "couverture" && (
            <button type="button" onClick={() => { onMasquer(page.cle); aller(Math.min(courant, total - 2)); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/40 px-3.5 text-[13px] text-white backdrop-blur hover:bg-black/60">
              <Trash2 className="h-3.5 w-3.5" /> Supprimer la page {n2(courant + 1)}
            </button>
          )}
          {!!deck.masquees?.length && (
            <button type="button" onClick={() => onMasquer(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/40 px-3.5 text-[13px] text-white backdrop-blur hover:bg-black/60">
              <RotateCcw className="h-3.5 w-3.5" /> Remettre {deck.masquees.length > 1 ? `les ${deck.masquees.length} pages` : "la page"}
            </button>
          )}
        </div>
      )}
      <div className="dk-scene" style={{ transform: `translate(-50%, -50%) scale(${echelle})`, transformOrigin: "50% 50%" }}>
        <div className="dk-relief" style={{ transform: `perspective(2400px) rotateY(${relief.x * 1.4}deg) rotateX(${-relief.y * 1}deg)` }}>
          <p className="dk-etiquette">Avis de valeur</p>
          <div className="dk-filigranes" style={{ transform: `translate(${-relief.x * 22}px, ${-relief.y * 14}px)` }}>
            {pages.map((p, i) => <span key={p.cle} aria-hidden className={`dk-filigrane ${i === courant ? "dk-filigrane-vu" : ""}`}>{n2(i + 1)}</span>)}
          </div>
          {pages.map((p, i) => (
            <div key={p.cle} className="dk-gauche" style={{ transform: `translateX(${(i - courant) * 1920}px)` }} aria-hidden={i !== courant}>
              <Retouches.Provider value={{ edition: edition && i === courant, textes: deck.retouches || {}, onRetouche, page: p.cle }}>
                <Gauche page={p} edition={edition && i === courant} onRetouche={onRetouche} />
              </Retouches.Provider>
            </div>
          ))}
          <div className="dk-piste">
            {pages.map((p, i) => {
              const d = i - courant;
              if (Math.abs(d) > 2) return null;
              return (
                <div key={p.cle} className={`dk-carte ${p.cle === "valeur" ? "dk-carte-indigo" : ""} ${d === 0 ? "dk-actif" : ""}`}
                  style={{ transform: transformCarte(d), zIndex: 10 - Math.abs(d) }} aria-hidden={d !== 0} onClick={d !== 0 ? () => aller(i) : undefined}>
                  <Retouches.Provider value={{ edition: edition && d === 0, textes: deck.retouches || {}, onRetouche, page: p.cle }}>
                    <Carte page={p} />
                  </Retouches.Provider>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dk-barre">
          <LogoKP fond="nuit" className="dk-barre-logo" />
          <span className="dk-barre-section">{page.section}</span>
          <div className="dk-progression">
            <div className="dk-progression-fond" />
            <div className="dk-progression-trait" style={{ width: `${avance * 100}%` }} />
            {pages.map((p, i) => (
              <button key={p.cle} type="button" className="dk-repere" style={{ left: `${total > 1 ? (i / (total - 1)) * 100 : 0}%` }} onClick={() => aller(i)} aria-label={`Page ${i + 1} : ${p.section}`} />
            ))}
            <span className="dk-point" style={{ left: `${avance * 100}%` }} />
          </div>
          <span className="dk-compteur">{n2(courant + 1)} / {n2(total)}</span>
          <div className="dk-fleches">
            <button type="button" className="dk-fleche" onClick={() => aller(courant - 1)} disabled={courant === 0} aria-label="Page précédente"><ArrowLeft /></button>
            <button type="button" className="dk-fleche dk-fleche-suite" onClick={() => aller(courant + 1)} disabled={courant === total - 1} aria-label="Page suivante"><ArrowRight /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

