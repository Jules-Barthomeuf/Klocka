import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Braces, ChevronDown, ChevronUp, Copy, Eye, Redo2, Undo2, Filter, GripVertical, LayoutTemplate, Loader2, Monitor, Plus, Save, Send, Settings2, Smartphone, Sparkles, Trash2, X } from "lucide-react";
import { GABARITS, POLICES, THEMES, TYPES_BLOCS, VARIABLES, blocNeuf, decouper, lienPolices, mentionDe, rendreEmail, styles as stylesDuTheme } from "@/lib/email-design";
import "./email-editable.css";
import { toast } from "@/components/ui/avis";
import { req, useReferentiel, useSansDefilement, useTelephone, bouton, boutonPlein, champ } from "./commun";

// L'éditeur d'un email (campagne, étape de séquence, template, mail de la
// plateforme). À gauche, les blocs : on les écrit, on les glisse pour les
// réordonner, on les duplique, on pose une condition d'affichage (un tag, un
// champ). À droite, l'aperçu en direct, le HTML exact qui part : ordinateur ou
// téléphone, et « Voir en tant que… » un vrai contact, variables remplacées.
// En haut, l'objet et le texte d'aperçu, avec leur compteur. AK, dans un
// panneau repliable, propose ; rien ne s'applique sans un clic.

const EXEMPLE = { email: "marie.durand@exemple.fr", prenom: "Marie", nom: "Durand", entreprise: "SCI Durand", ville: "Lyon", tags: [], champs: {} };
const NOM_BLOC = Object.fromEntries(TYPES_BLOCS);
const LIMITE_OBJET = 60;
const LIMITE_APERCU = 110;

/** Charge dans la page les polices Google d'un email, pour que l'aperçu les montre. */
function useLienPolices(href) {
  useEffect(() => {
    if (!href || document.querySelector(`link[data-polices-email="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href; l.dataset.policesEmail = href;
    document.head.appendChild(l);
  }, [href]);
}
const TOUTES_GOOGLE = `https://fonts.googleapis.com/css2?${Object.values(POLICES).filter((p) => p.google).map((p) => `family=${p.google}`).join("&")}&display=swap`;

/**
 * Le choix des polices (9 oct. 2026) : une pour les titres, une pour le
 * texte, chaque nom écrit dans sa police. Les polices Google s'affichent dans
 * Apple Mail et sur iPhone ; Gmail et Outlook prennent la police de repli.
 */
function ChoixPolices({ design, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);
  useLienPolices(ouvert ? TOUTES_GOOGLE : null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);
  const corps = design.police || "systeme";
  const titres = design.police_titres || corps;
  const ligne = (libelle, valeur, cle) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] text-ardoise">{libelle}</span>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(POLICES).map(([k, p]) => (
          <button key={k} type="button" onClick={() => onChange({ [cle]: k })} aria-pressed={valeur === k}
            className={`h-8 rounded-full border px-2.5 text-[13px] transition-colors ${valeur === k ? "border-encre text-encre" : "border-trait text-craie hover:text-encre"}`}
            style={{ fontFamily: p.pile, background: "transparent" }}>{p.nom}</button>
        ))}
      </div>
    </div>
  );
  return (
    <div className="relative" ref={boite}>
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className={`${bouton} h-8 text-[12.5px]`} title="Les polices de l'email">
        <span style={{ fontFamily: POLICES[titres]?.pile }}>Aa</span>{POLICES[titres]?.nom}{titres !== corps ? ` · ${POLICES[corps]?.nom}` : ""}
      </button>
      {ouvert && (
        <div className="absolute right-0 top-10 z-30 flex w-[min(440px,calc(100vw-32px))] flex-col gap-3 rounded-[14px] border border-trait bg-fond p-4 shadow-xl max-md:left-0 max-md:right-auto">
          {ligne("Titres", titres, "police_titres")}
          {ligne("Texte", corps, "police")}
          <p className="m-0 text-[11.5px] leading-[1.5] text-brume">Inter, Montserrat, Lora et Playfair s'affichent dans Apple Mail et sur iPhone ; Gmail et Outlook prennent une police proche.</p>
        </div>
      )}
    </div>
  );
}

/** Un petit menu ouvert sous un bouton, refermé au clic dehors. */
function useMenu() {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);
  return { ouvert, setOuvert, boite };
}
const panneauMenu = "absolute right-0 top-10 z-40 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3 rounded-[14px] border border-trait bg-fond p-4 shadow-xl max-md:left-0 max-md:right-auto";

/** La mise en page (9 oct. 2026) : Carte, La Note, La Lettre ; le numéro et la marque de l'en-tête. */
function ChoixMiseEnPage({ design, onChange }) {
  const { ouvert, setOuvert, boite } = useMenu();
  const g = GABARITS[design.gabarit] ? design.gabarit : "carte";
  return (
    <div className="relative" ref={boite}>
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className={`${bouton} h-8 text-[12.5px]`} title="La mise en page de l'email">
        <LayoutTemplate className="h-3.5 w-3.5" />{GABARITS[g].nom}
      </button>
      {ouvert && (
        <div className={panneauMenu}>
          <span className="text-[11.5px] text-ardoise">Mise en page</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(GABARITS).map(([k, x]) => (
              <button key={k} type="button" onClick={() => onChange({ gabarit: k === "carte" ? null : k })} aria-pressed={g === k}
                className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${g === k ? "border-encre text-encre" : "border-trait text-craie hover:text-encre"}`} style={{ background: "transparent" }}>{x.nom}</button>
            ))}
          </div>
          {g !== "carte" && (
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <label className="flex flex-col gap-1 text-[11.5px] text-ardoise">Marque
                <input value={design.marque ?? "La Note"} onChange={(e) => onChange({ marque: e.target.value })} className={`${champ} h-9 text-[13px]`} />
              </label>
              <label className="flex flex-col gap-1 text-[11.5px] text-ardoise">Numéro
                <input value={design.numero || ""} onChange={(e) => onChange({ numero: e.target.value })} placeholder="12" className={`${champ} h-9 text-[13px]`} />
              </label>
            </div>
          )}
          <p className="m-0 text-[11.5px] leading-[1.5] text-brume">La Note ouvre sur un bandeau à la couleur du thème ; La Lettre est une lettre blanche, titre en serif.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Tester (9 oct. 2026) : le mail tel qu'il est à l'écran, envoyé à l'adresse
 * choisie (la sienne si on la laisse vide). `libelle` : le texte du bouton.
 */
export function BoutonTester({ email, libelle = "Tester", plein = false }) {
  const { ouvert, setOuvert, boite } = useMenu();
  const [a, setA] = useState(() => { try { return localStorage.getItem("emailing.test-a") || ""; } catch { return ""; } });
  const [enCours, setEnCours] = useState(false);
  const envoyer = async () => {
    setEnCours(true);
    try {
      try { localStorage.setItem("emailing.test-a", a.trim()); } catch { /* sans stockage */ }
      const r = await req("POST", "/test", { a: a.trim() || null, objet: email?.objet, apercu: email?.apercu, design: email?.design });
      toast.success(`Test envoyé à ${r.a}`);
      setOuvert(false);
    } catch (e) { toast.error(e?.message || "Test impossible"); }
    setEnCours(false);
  };
  return (
    <div className="relative" ref={boite}>
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className={`${plein ? boutonPlein : bouton} h-8 text-[12.5px]`}><Send className="h-3.5 w-3.5" />{libelle}</button>
      {ouvert && (
        <div className={panneauMenu}>
          <label className="flex flex-col gap-1 text-[11.5px] text-ardoise">Envoyer ce mail, tel qu'il est, à
            <input autoFocus type="email" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") envoyer(); }} placeholder="votre adresse (par défaut)" className={`${champ} h-9 text-[13px]`} />
          </label>
          <button type="button" onClick={envoyer} disabled={enCours} className={`${boutonPlein} self-end`}>{enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Envoyer le test</button>
        </div>
      )}
    </div>
  );
}

function Compteur({ n, max }) {
  return <span className={`flex-none text-[11.5px] tabular-nums ${n > max ? "text-ambre" : "text-brume"}`}>{n}/{max}</span>;
}

// ---------------------------------------------------------------------------
// L'aperçu éditable : chaque texte se modifie en cliquant dedans, directement
// dans le rendu — comme la LOI (EditeurLoi.jsx). Les champs { prenom }} ne
// sont jamais remplacés ici : on édite le modèle brut, pas un exemple ; les
// voir substitués est le rôle de « Visualiser ».
// ---------------------------------------------------------------------------

const echapperDom = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Pure : du markdown (**gras**, retours à la ligne) vers du HTML sûr. */
function versHtmlGras(texte) {
  return String(texte ?? "").split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((x) => (x.startsWith("**") && x.endsWith("**") ? `<strong>${echapperDom(x.slice(2, -2))}</strong>` : echapperDom(x).replace(/\n/g, "<br>")))
    .join("");
}

/** Pure : le DOM d'un bloc contentEditable vers du markdown. */
function versTexteDeDom(el) {
  let t = "";
  const marcher = (n) => {
    if (n.nodeType === 3) { t += n.textContent; return; }
    const nom = n.nodeName;
    if (nom === "BR") { t += "\n"; return; }
    const gras = nom === "STRONG" || nom === "B";
    if ((nom === "DIV" || nom === "P") && t && !t.endsWith("\n")) t += "\n";
    if (gras) t += "**";
    n.childNodes.forEach(marcher);
    if (gras) t += "**";
  };
  el.childNodes.forEach(marcher);
  return t.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Un texte qu'on modifie en cliquant dedans ; Échap annule la frappe en cours. */
function TexteDirect({ valeur, onGarde, registrer, blocId, style, as: Balise = "p", placeholder = "" }) {
  const ref = useRef(null);
  return (
    <Balise ref={ref} style={style} className="k-email-editable" data-placeholder={placeholder}
      contentEditable suppressContentEditableWarning spellCheck
      onFocus={() => registrer(ref.current, onGarde, blocId)}
      onBlur={() => { const t = versTexteDeDom(ref.current); if (t !== String(valeur || "")) onGarde(t); }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { ref.current.innerHTML = versHtmlGras(valeur); ref.current.blur(); }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") { e.preventDefault(); document.execCommand("bold"); }
      }}
      dangerouslySetInnerHTML={{ __html: versHtmlGras(valeur) }} />
  );
}

/**
 * Le corps de l'email, rendu et modifiable sur place, dans la palette du
 * design choisi (THEMES). Un clic dans un texte l'édite ; les champs {{…}}
 * ne sont jamais remplacés par un exemple ici.
 */
const PreviewEditable = React.memo(function PreviewEditable({ design, blocs, onChangeBloc, registrer, onChoisirBloc, logo, expediteur, desinscription = true, outils = null, rendreReglages = null }) {
  const s = stylesDuTheme(design?.theme, design);
  // Les réglages d'un bloc (lien d'un bouton, image, condition), ouverts sous lui (9 oct. 2026).
  const [reglages, setReglages] = useState(null);
  // Image et séparateur n'ont pas de texte : un clic les choisit et ouvre leurs réglages.
  const choisir = (id) => () => { onChoisirBloc(id); if (rendreReglages) setReglages(id); };
  const rond = { display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 999, color: s.t.doux, background: s.t.carte, border: `1px solid ${s.t.trait}`, cursor: "pointer" };
  // Au survol d'un bloc, ou quand on écrit dedans, ses outils dans la marge de droite.
  const barre = (b, i) => outils && (
    <span className="absolute -right-[34px] top-0 z-10 hidden flex-col gap-1 group-focus-within/bloc:flex group-hover/bloc:flex">
      {rendreReglages && <button type="button" title="Réglages du bloc" aria-label="Réglages du bloc" style={rond} onClick={() => setReglages((x) => (x === b.id ? null : b.id))}><Settings2 className="h-3.5 w-3.5" /></button>}
      {i > 0 && <button type="button" title="Monter" aria-label="Monter le bloc" style={rond} onClick={() => outils.monter(i)}><ArrowUp className="h-3.5 w-3.5" /></button>}
      {i < blocs.length - 1 && <button type="button" title="Descendre" aria-label="Descendre le bloc" style={rond} onClick={() => outils.descendre(i)}><ArrowDown className="h-3.5 w-3.5" /></button>}
      <button type="button" title="Supprimer le bloc" aria-label="Supprimer le bloc" style={rond} onClick={() => outils.supprimer(b.id)}><Trash2 className="h-3.5 w-3.5" /></button>
    </span>
  );
  const contenuDuBloc = (b) => {
    const garder = (v) => onChangeBloc({ ...b, texte: v });
    const champ = (cle, style, placeholder, as = "span") => <TexteDirect blocId={b.id} registrer={registrer} as={as} style={style} valeur={b[cle]} placeholder={placeholder} onGarde={(v) => onChangeBloc({ ...b, [cle]: v })} />;
    if (b.type === "surtitre") return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.surtitre} valeur={b.texte} placeholder="Un surtitre" onGarde={garder} />;
    if (b.type === "legende") return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.legende} valeur={b.texte} placeholder="Une légende" onGarde={garder} />;
    if (b.type === "encadre") return (
      <div style={{ ...s.encadre, ...(b.ton === "accent" ? { backgroundColor: s.teinte } : {}) }}>
        <table role="presentation" cellPadding={0} cellSpacing={0}><tbody><tr>
          <td style={{ width: 30, verticalAlign: "top", paddingTop: 2 }}><span style={s.encadreIcone}>!</span></td>
          <td><TexteDirect blocId={b.id} registrer={registrer} as="div" style={s.encadreTexte} valeur={b.texte} placeholder="Ce qu'il faut retenir" onGarde={garder} /></td>
        </tr></tbody></table>
      </div>
    );
    if (b.type === "etiquette") return <p style={{ margin: "0 0 14px" }}><TexteDirect blocId={b.id} registrer={registrer} as="span" style={s.etiquette} valeur={b.texte} placeholder="Étiquette" onGarde={garder} /></p>;
    if (b.type === "chapo") return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.chapo} valeur={b.texte} placeholder="Le chapô" onGarde={garder} />;
    if (b.type === "intertitre") return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.intertitre} valeur={b.texte} placeholder="Un intertitre" onGarde={garder} />;
    if (b.type === "verdict") return (
      <div style={s.verdict}>
        {champ("titre", { ...s.verdictTitre, display: "block" }, "Notre verdict")}
        <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.verdictTexte} valeur={b.texte} placeholder="Le verdict" onGarde={garder} />
      </div>
    );
    if (b.type === "tableau") {
      const [ea, eb] = b.entetes || [];
      const entete = (k) => (v) => onChangeBloc({ ...b, entetes: [0, 1].map((n) => (n === k ? v : (b.entetes || [])[n] || "")) });
      const cellule = (k, cle) => (v) => onChangeBloc({ ...b, lignes: b.lignes.map((x, n) => (n === k ? { ...x, [cle]: v } : x)) });
      return (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "4px 0 22px" }}><tbody>
          <tr>
            <th style={s.tableEntete}><TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={ea} placeholder="Colonne 1" onGarde={entete(0)} /></th>
            <th style={{ ...s.tableEntete, ...s.tableEnteteFort }}><TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={eb} placeholder="Colonne 2" onGarde={entete(1)} /></th>
          </tr>
          {(b.lignes || []).map((x, k) => (
            <tr key={k}>
              <td style={s.tableA}><TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={x.a} placeholder="…" onGarde={cellule(k, "a")} /></td>
              <td style={s.tableB}><TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={x.b} placeholder="…" onGarde={cellule(k, "b")} /></td>
            </tr>
          ))}
        </tbody></table>
      );
    }
    if (b.type === "chiffres") {
      const items = b.items || [];
      const rangees = [];
      for (let k = 0; k < items.length; k += 3) rangees.push(items.slice(k, k + 3).map((x, n) => [x, k + n]));
      const item = (k, cle) => (v) => onChangeBloc({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: v } : y)) });
      return (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={6} style={{ margin: "0 -6px 16px", borderCollapse: "separate", width: "calc(100% + 12px)" }}><tbody>
          {rangees.map((l, r) => (
            <tr key={r}>
              {l.map(([x, k]) => (
                <td key={k} style={{ ...s.tuile, ...(x.fort ? s.tuileForte : {}) }}>
                  <TexteDirect blocId={b.id} registrer={registrer} as="p" style={{ ...s.tuileLabel, ...(x.fort ? s.tuileLabelFort : {}) }} valeur={x.label} placeholder="Libellé" onGarde={item(k, "label")} />
                  <TexteDirect blocId={b.id} registrer={registrer} as="p" style={{ ...s.tuileValeur, ...(x.fort ? s.tuileValeurFort : {}) }} valeur={x.valeur} placeholder="Valeur" onGarde={item(k, "valeur")} />
                </td>
              ))}
            </tr>
          ))}
        </tbody></table>
      );
    }
    if (b.type === "etapes") return (
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 20px" }}><tbody>
        {(b.items || []).map((x, k) => {
          const item = (cle) => (v) => onChangeBloc({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: v } : y)) });
          return (
            <tr key={k}>
              <td style={{ width: 34, verticalAlign: "top", padding: "0 0 12px" }}><span style={s.etapeNumero}>{k + 1}</span></td>
              <td style={{ verticalAlign: "top", padding: "2px 0 12px" }}>
                <p style={s.etapeTexte}>
                  <TexteDirect blocId={b.id} registrer={registrer} as="strong" style={{ color: s.t.titre }} valeur={x.titre} placeholder="Le point" onGarde={item("titre")} /><strong style={{ color: s.t.titre }}> : </strong>
                  <TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={x.texte} placeholder="ce qu'il a changé" onGarde={item("texte")} />
                </p>
              </td>
            </tr>
          );
        })}
      </tbody></table>
    );
    if (b.type === "points") return (
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 18px" }}><tbody>
        {(b.items || []).map((x, k) => {
          const bord = k ? { borderTop: `1px solid ${s.t.trait}` } : {};
          const item = (cle) => (v) => onChangeBloc({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: v } : y)) });
          return (
            <tr key={k}>
              <td style={{ ...s.point, ...bord, width: 34 }}><span style={s.pointCase}>✓</span></td>
              <td style={{ ...s.point, ...bord }}>
                <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.pointTitre} valeur={x.titre} placeholder="La question" onGarde={item("titre")} />
                <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.pointTexte} valeur={x.texte} placeholder="La réponse" onGarde={item("texte")} />
              </td>
            </tr>
          );
        })}
      </tbody></table>
    );
    if (b.type === "rdv") {
      const ligne = (
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}><tbody><tr>
          {b.initiale && <td style={{ width: 56, verticalAlign: "middle" }}><span style={s.initiale}>{String(b.initiale).slice(0, 2)}</span></td>}
          <td style={{ verticalAlign: "middle" }}>{String(b.titre || "").trim() && champ("titre", { ...s.rdvTitre, display: "block" }, "Un bien en vue ?")}{champ("texte", { ...s.rdvTexte, display: "block" }, "Une phrase")}</td>
          {String(b.lien_texte || "").trim() && <td style={{ verticalAlign: "middle", textAlign: "right", paddingLeft: 12 }}>{champ("lien_texte", s.rdvLien, "Réserver")}<span style={s.rdvLien}> →</span></td>}
        </tr></tbody></table>
      );
      return ["note", "note_claire", "dossier"].includes(s.g) ? ligne : <div style={s.rdvBoite}>{ligne}</div>;
    }
    if (b.type === "signature" && (b.sous_titre || b.initiale)) return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: "26px 0 0" }}><tbody><tr>
        {b.initiale && <td style={{ width: 54, verticalAlign: "middle" }}><span style={s.initiale}>{String(b.initiale).slice(0, 2)}</span></td>}
        <td style={{ verticalAlign: "middle" }}><TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.signatureNom} valeur={b.texte} placeholder="Le nom" onGarde={garder} />{champ("sous_titre", { ...s.signatureSous, display: "block" }, "Klocka · Murs de commerce")}</td>
      </tr></tbody></table>
    );
    if (b.type === "titre") return <TexteDirect blocId={b.id} registrer={registrer} as="h1" style={s.titre} valeur={b.texte} placeholder="Un titre" onGarde={garder} />;
    if (b.type === "signature") return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.signature} valeur={b.texte} placeholder="La signature" onGarde={garder} />;
    if (b.type === "separateur") return <hr style={{ ...s.separateur, cursor: "pointer" }} onClick={choisir(b.id)} />;
    if (b.type === "bouton") return (
      <div style={s.zoneBouton}>
        <TexteDirect blocId={b.id} registrer={registrer} as="span" style={s.bouton} valeur={b.texte} placeholder="Le bouton" onGarde={garder} />
      </div>
    );
    if (b.type === "image") return b.src
      ? <img src={b.src} alt="" style={{ ...s.image, cursor: "pointer" }} onClick={choisir(b.id)} />
      : <div onClick={choisir(b.id)} className="mb-5 grid h-36 cursor-pointer place-items-center rounded-[10px] text-[12.5px] uppercase tracking-[.04em]" style={{ backgroundColor: s.teinte, color: s.t.titre }}>{b.vide ? `[${b.vide}]` : "Cliquez pour poser l'image"}</div>;
    if (b.type === "citation") return (
      <blockquote style={s.citation}>
        <TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={b.texte} placeholder="Une citation" onGarde={garder} />
        {/* L'auteur, seulement s'il y en a un : il se pose dans les réglages du bloc. */}
        {String(b.auteur || "").trim() && <TexteDirect blocId={b.id} registrer={registrer} as="span" style={s.auteur} valeur={b.auteur} placeholder="— l'auteur" onGarde={(v) => onChangeBloc({ ...b, auteur: v })} />}
      </blockquote>
    );
    if (b.type === "colonnes") return (
      <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 20px" }}><tbody><tr>
        <td style={{ ...s.colonne, paddingRight: 12 }}><TexteDirect blocId={b.id} registrer={registrer} as="div" style={{}} valeur={b.gauche} placeholder="À gauche" onGarde={(v) => onChangeBloc({ ...b, gauche: v })} /></td>
        <td style={{ ...s.colonne, paddingLeft: 12 }}><TexteDirect blocId={b.id} registrer={registrer} as="div" style={{}} valeur={b.droite} placeholder="À droite" onGarde={(v) => onChangeBloc({ ...b, droite: v })} /></td>
      </tr></tbody></table>
    );
    return <TexteDirect blocId={b.id} registrer={registrer} as="p" style={s.texte} valeur={b.texte} placeholder="Votre texte" onGarde={garder} />;
  };
  // Un bloc dans l'aperçu, avec ses outils au survol et ses réglages dessous.
  const enveloppe = (b, contenu) => {
    const i = blocs.findIndex((x) => x.id === b.id);
    return (
      <div key={b.id} className="group/bloc relative">
        {contenu}
        {barre(b, i)}
        {reglages === b.id && rendreReglages && <div className="mb-5">{rendreReglages(b, () => setReglages(null))}</div>}
      </div>
    );
  };
  const { bande, corps, apres } = decouper(design, blocs);
  const montrerLogo = design?.logo !== false && logo;
  const pied = desinscription && (s.g === "carte"
    ? <p style={s.pied}>Klocka · murs commerciaux<br />Vous recevez ce mail après votre inscription. <span style={s.lienPied}>Se désinscrire</span></p>
    : <p style={s.pied}>Vous recevez cet email car vous avez participé à un webinaire Klocka.<br />Klocka · murs commerciaux · <span style={s.lienPied}>Se désinscrire</span></p>);
  const vide = !blocs.length && <p style={{ ...s.texte, opacity: .5 }}>Ajoutez un bloc ci-dessous, ou demandez-le à AK.</p>;
  const enTeteMarque = (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}><tbody><tr>
      <td style={s.marque}>{montrerLogo && <img src={logo} alt="Klocka" width={28} height={28} style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 7, marginRight: 8 }} />}Klocka</td>
      <td style={s.mention}>{s.mentionPastille ? <span style={s.mentionPastille}>{mentionDe(design)}</span> : mentionDe(design)}</td>
    </tr></tbody></table>
  );
  // Le Dossier : la page à la couleur d'accent, l'en-tête dessus, la carte et son pied.
  if (s.g === "dossier") return (
    <div style={{ ...s.page, minHeight: "100%" }}>
      <div style={s.bandeInterieur}>{enTeteMarque}</div>
      <div style={{ ...s.carte, position: "relative", overflow: "hidden" }}>
        {corps.map((b) => enveloppe(b, contenuDuBloc(b)))}
        {vide}
        {apres.map((b) => <div key={b.id} style={{ ...s.rdvPied, position: "relative" }}>{enveloppe(b, contenuDuBloc(b))}</div>)}
      </div>
      {pied}
    </div>
  );
  // La Note : le bandeau (surtitre et titre dedans), la carte qui le chevauche, la carte de rendez-vous dessous.
  if (s.g === "note" || s.g === "note_claire") return (
    <div style={{ ...s.page, minHeight: "100%" }}>
      <div style={s.bande}>
        <div style={s.bandeInterieur}>
          {enTeteMarque}
          {bande.map((b) => enveloppe(b, <TexteDirect blocId={b.id} registrer={registrer} as={b.type === "titre" ? "h1" : "p"} style={b.type === "titre" ? s.titreBande : s.surtitreBande} valeur={b.texte} placeholder={b.type === "titre" ? "Un titre" : "Un surtitre"} onGarde={(v) => onChangeBloc({ ...b, texte: v })} />))}
        </div>
      </div>
      <div style={s.zoneCarte}>
        <div style={{ ...s.carte, position: "relative" }}>
          {corps.map((b) => enveloppe(b, contenuDuBloc(b)))}
          {vide}
        </div>
        {apres.map((b) => <div key={b.id} style={{ ...s.rdvCarte, position: "relative" }}>{enveloppe(b, contenuDuBloc(b))}</div>)}
        {pied}
      </div>
    </div>
  );
  return (
    <div style={{ ...s.page, minHeight: "100%" }}>
      <div style={{ ...s.carte, position: "relative" }}>
        {s.g === "lettre"
          ? <p style={s.entete}>{montrerLogo && <img src={logo} alt="Klocka" width={22} height={22} style={{ display: "inline-block", verticalAlign: "middle", borderRadius: 5, marginRight: 8 }} />}Klocka · {mentionDe(design)}</p>
          : montrerLogo && <img src={logo} alt="Klocka" width={40} height={40} style={{ ...s.logo, borderRadius: 10 }} />}
        {corps.map((b) => enveloppe(b, contenuDuBloc(b)))}
        {vide}
      </div>
      {pied}
    </div>
  );
// Mémorisé sur le contenu réel (design, blocs…) et pas sur le reste de l'éditeur :
// sans ça, choisir un bloc (actif) ou survoler un onglet refait ce rendu, React
// réécrit le innerHTML de chaque texte édité sur place et ramène le curseur au
// début — même valeur ou pas, un clic ne retombait jamais où on l'avait posé.
}, (a, b) => a.design === b.design && a.blocs === b.blocs && a.logo === b.logo && a.expediteur === b.expediteur && a.desinscription === b.desinscription);

const vars = (c) => ({ prenom: c.prenom || "", nom: c.nom || "", entreprise: c.entreprise || "", ville: c.ville || "", email: c.email || "", lien: "https://klocka.immo/Bienvenue", lien_simulateur: `/SimulateurPublic?k=${c.jeton || "exemple"}`, k: c.jeton || "exemple", expediteur: "Jules", ...(c.champs || {}) });

/** Une zone de texte qui grandit avec son contenu. */
function Zone({ valeur, onChange, onFocus, lignes = 3, placeholder = "" }) {
  return (
    <textarea value={valeur || ""} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} rows={Math.max(lignes, String(valeur || "").split("\n").length)} placeholder={placeholder}
      className="w-full resize-y rounded-[10px] border border-trait bg-surface px-3 py-2 text-[13.5px] leading-[1.55] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
  );
}

/** La condition d'affichage d'un bloc. */
function Condition({ b, onChange, referentiel }) {
  const si = b.si || null;
  const champs = [["prenom", "Prénom"], ["nom", "Nom"], ["entreprise", "Entreprise"], ["ville", "Ville"], ...(referentiel?.champs || []).map((c) => [c.cle, c.libelle])];
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[10px] border border-dashed border-bord-doux px-3 py-2 text-[12.5px] text-ardoise">
      <span>Afficher ce bloc</span>
      <select value={si?.type || ""} onChange={(e) => onChange({ ...b, si: e.target.value ? { type: e.target.value, ...(e.target.value === "champ" ? { cle: "entreprise" } : { valeur: referentiel?.tags?.[0]?.nom || "" }) } : null })}
        className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-encre outline-none max-md:h-10 max-md:text-[16px]">
        <option value="">toujours</option>
        <option value="tag">si le contact a le tag</option>
        <option value="champ">si le champ</option>
      </select>
      {si?.type === "tag" && (
        <input list="email-tags" value={si.valeur || ""} onChange={(e) => onChange({ ...b, si: { ...si, valeur: e.target.value } })} placeholder="tag"
          className="h-8 w-40 rounded-[8px] border border-trait bg-surface px-2 text-encre outline-none max-md:h-10 max-md:text-[16px]" />
      )}
      {si?.type === "champ" && (
        <>
          <select value={si.cle} onChange={(e) => onChange({ ...b, si: { ...si, cle: e.target.value } })} className="h-8 rounded-[8px] border border-trait bg-surface px-2 text-encre outline-none max-md:h-10 max-md:text-[16px]">
            {champs.map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
          </select>
          <input value={si.valeur || ""} onChange={(e) => onChange({ ...b, si: { ...si, valeur: e.target.value } })} placeholder="est rempli (ou vaut…)"
            className="h-8 w-44 rounded-[8px] border border-trait bg-surface px-2 text-encre outline-none max-md:h-10 max-md:text-[16px]" />
        </>
      )}
      <datalist id="email-tags">{(referentiel?.tags || []).map((t) => <option key={t.nom} value={t.nom} />)}</datalist>
    </div>
  );
}

/** Un bloc, dans la colonne de gauche. */
function CarteBloc({ b, i, actif, survole, onActif, onChange, onDupliquer, onSupprimer, onMonter = null, onDescendre = null, onFocus, glisser, referentiel }) {
  const [condition, setCondition] = useState(!!b.si);
  const zone = (prop, lignes = 3, placeholder = "") => <Zone valeur={b[prop]} lignes={lignes} placeholder={placeholder} onChange={(v) => onChange({ ...b, [prop]: v })} onFocus={(e) => onFocus(e.target, (v) => onChange({ ...b, [prop]: v }), b.id)} />;
  const ligne = (prop, placeholder) => <input value={b[prop] || ""} placeholder={placeholder} onChange={(e) => onChange({ ...b, [prop]: e.target.value })} onFocus={(e) => onFocus(e.target, (v) => onChange({ ...b, [prop]: v }), b.id)} className={`${champ} h-9 text-[13.5px]`} />;
  return (
    <div {...glisser(i)} onClick={() => onActif(b.id)}
      className={`rounded-[14px] border bg-surface-pleine px-3.5 py-3 transition-colors ${actif ? "border-menthe/60" : "border-trait"} ${survole ? "ring-2 ring-menthe/40" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="cursor-grab text-brume active:cursor-grabbing max-md:hidden" title="Glisser pour déplacer"><GripVertical className="h-4 w-4" /></span>
        <span className="text-[12.5px] text-ardoise">{NOM_BLOC[b.type] || b.type}</span>
        {b.si && <span className="inline-flex items-center gap-1 rounded-full bg-ambre/15 px-2 py-px text-[11px] text-ambre"><Filter className="h-3 w-3" />conditionnel</span>}
        <span className="ml-auto flex items-center gap-0.5">
          {/* Au doigt, le glisser-déposer ne marche pas : deux flèches déplacent le bloc. */}
          {onMonter && <button type="button" onClick={(e) => { e.stopPropagation(); onMonter(); }} title="Monter" aria-label="Monter le bloc" className="hidden h-9 w-9 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:grid"><ArrowUp className="h-3.5 w-3.5" /></button>}
          {onDescendre && <button type="button" onClick={(e) => { e.stopPropagation(); onDescendre(); }} title="Descendre" aria-label="Descendre le bloc" className="hidden h-9 w-9 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:grid"><ArrowDown className="h-3.5 w-3.5" /></button>}
          <button type="button" onClick={(e) => { e.stopPropagation(); setCondition((v) => !v); }} title="Condition d'affichage" aria-label="Condition d'affichage" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-9 max-md:w-9"><Filter className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDupliquer(); }} title="Dupliquer" aria-label="Dupliquer le bloc" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-9 max-md:w-9"><Copy className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onSupprimer(); }} title="Supprimer" aria-label="Supprimer le bloc" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-alerte max-md:h-9 max-md:w-9"><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
      </div>
      {["titre", "texte", "signature", "surtitre", "legende", "etiquette", "chapo", "intertitre"].includes(b.type) && zone("texte", b.type === "texte" ? 4 : 1)}
      {b.type === "verdict" && <div className="flex flex-col gap-2">{ligne("titre", "Notre verdict")}{zone("texte", 2)}</div>}
      {b.type === "image" && !b.src && <div className="mt-2">{ligne("vide", "Ce que l'image doit montrer (ex. Photo de la façade)")}</div>}
      {b.type === "etapes" && (
        <div className="flex flex-col gap-2">
          {(b.items || []).map((x, k) => {
            const changerItem = (cle) => (e) => onChange({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: e.target.value } : y)) });
            return (
              <div key={k} className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <input value={x.titre || ""} onChange={changerItem("titre")} placeholder={`Point ${k + 1}`} className={`${champ} h-9 text-[13px]`} />
                <input value={x.texte || ""} onChange={changerItem("texte")} placeholder="ce qu'il a changé" className={`${champ} h-9 text-[13px]`} />
                <button type="button" onClick={() => onChange({ ...b, items: b.items.filter((y, n) => n !== k) })} aria-label="Retirer cette étape" className="grid h-9 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => onChange({ ...b, items: [...(b.items || []), { titre: "", texte: "" }] })} className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-bord-doux px-3 py-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter une étape</button>
        </div>
      )}
      {b.type === "tableau" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_1fr_32px] gap-2">
            {[0, 1].map((n) => <input key={n} value={(b.entetes || [])[n] || ""} onChange={(e) => onChange({ ...b, entetes: [0, 1].map((m) => (m === n ? e.target.value : (b.entetes || [])[m] || "")) })} placeholder={`En-tête ${n + 1}`} className={`${champ} h-9 text-[12.5px] uppercase`} />)}
            <span />
          </div>
          {(b.lignes || []).map((x, k) => {
            const changerLigne = (cle) => (e) => onChange({ ...b, lignes: b.lignes.map((y, n) => (n === k ? { ...y, [cle]: e.target.value } : y)) });
            return (
              <div key={k} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                <input value={x.a || ""} onChange={changerLigne("a")} placeholder="À gauche" className={`${champ} h-9 text-[13px]`} />
                <input value={x.b || ""} onChange={changerLigne("b")} placeholder="À droite" className={`${champ} h-9 text-[13px]`} />
                <button type="button" onClick={() => onChange({ ...b, lignes: b.lignes.filter((y, n) => n !== k) })} aria-label="Retirer cette ligne" className="grid h-9 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => onChange({ ...b, lignes: [...(b.lignes || []), { a: "", b: "" }] })} className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-bord-doux px-3 py-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter une ligne</button>
        </div>
      )}
      {b.type === "chiffres" && (
        <div className="flex flex-col gap-2">
          {(b.items || []).map((x, k) => {
            const changerItem = (cle) => (e) => onChange({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: cle === "fort" ? e.target.checked : e.target.value } : y)) });
            return (
              <div key={k} className="grid grid-cols-[1fr_1fr_auto_32px] items-center gap-2">
                <input value={x.label || ""} onChange={changerItem("label")} placeholder="Libellé" className={`${champ} h-9 text-[13px]`} />
                <input value={x.valeur || ""} onChange={changerItem("valeur")} placeholder="Valeur" className={`${champ} h-9 text-[13px]`} />
                <label className="flex items-center gap-1.5 text-[12px] text-ardoise"><input type="checkbox" checked={!!x.fort} onChange={changerItem("fort")} />en avant</label>
                <button type="button" onClick={() => onChange({ ...b, items: b.items.filter((y, n) => n !== k) })} aria-label="Retirer ce chiffre" className="grid h-9 w-8 place-items-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => onChange({ ...b, items: [...(b.items || []), { label: "", valeur: "" }] })} className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-bord-doux px-3 py-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter un chiffre</button>
        </div>
      )}
      {b.type === "signature" && <div className="mt-2 grid grid-cols-[1fr_88px] gap-2">{ligne("sous_titre", "Sous le nom (ex. Klocka · Murs de commerce)")}{ligne("initiale", "Initiale")}</div>}
      {b.type === "encadre" && <div className="flex flex-col gap-2">{zone("texte", 2)}<label className="flex items-center gap-2 text-[12.5px] text-ardoise"><input type="checkbox" checked={b.ton === "accent"} onChange={(e) => onChange({ ...b, ton: e.target.checked ? "accent" : null })} />Fond à la couleur du mail</label></div>}
      {b.type === "points" && (
        <div className="flex flex-col gap-2">
          {(b.items || []).map((x, k) => {
            const changerItem = (cle) => (e) => onChange({ ...b, items: b.items.map((y, n) => (n === k ? { ...y, [cle]: e.target.value } : y)) });
            return (
              <div key={k} className="grid grid-cols-[1fr_auto] gap-2 rounded-[10px] border border-trait p-2">
                <div className="flex flex-col gap-1.5">
                  <input value={x.titre || ""} onChange={changerItem("titre")} placeholder="La question" className={`${champ} h-9 text-[13.5px]`} />
                  <input value={x.texte || ""} onChange={changerItem("texte")} placeholder="La réponse, en une phrase" className={`${champ} h-9 text-[13px]`} />
                </div>
                <button type="button" onClick={() => onChange({ ...b, items: b.items.filter((y, n) => n !== k) })} aria-label="Retirer ce point" className="grid h-8 w-8 place-items-center self-center rounded-full text-ardoise hover:text-alerte" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => onChange({ ...b, items: [...(b.items || []), { titre: "", texte: "" }] })} className="inline-flex items-center gap-1.5 self-start rounded-full border border-dashed border-bord-doux px-3 py-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter un point</button>
        </div>
      )}
      {b.type === "rdv" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[88px_1fr] gap-2">{ligne("initiale", "Initiale")}{ligne("titre", "Un bien en vue ?")}</div>
          {ligne("texte", "Une phrase")}
          <div className="grid grid-cols-[1fr_2fr] gap-2">{ligne("lien_texte", "Réserver")}{ligne("lien", "https://…")}</div>
        </div>
      )}
      {b.type === "citation" && <div className="flex flex-col gap-2">{zone("texte", 2)}{ligne("auteur", "Auteur (facultatif)")}</div>}
      {b.type === "bouton" && <div className="flex flex-col gap-2">{ligne("texte", "Texte du bouton")}{ligne("lien", "https://… ou {{lien}}")}</div>}
      {b.type === "image" && <div className="flex flex-col gap-2">{ligne("src", "Adresse de l'image (https://…)")}{ligne("lien", "Lien au clic (facultatif)")}</div>}
      {b.type === "colonnes" && <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">{zone("gauche", 3)}{zone("droite", 3)}</div>}
      {b.type === "separateur" && <div className="h-px bg-trait" />}
      {(condition || b.si) && <Condition b={b} onChange={onChange} referentiel={referentiel} />}
    </div>
  );
}

function ChoixBloc({ onChoisir }) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-[12px] border border-trait bg-surface-pleine p-2">
      {TYPES_BLOCS.map(([t, mot]) => (
        <button key={t} type="button" onClick={() => onChoisir(t)} className="rounded-full border border-trait px-3 py-1 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre max-md:py-2">{mot}</button>
      ))}
    </div>
  );
}

/** Le menu « Insérer une variable », avec sa valeur de repli. */
function MenuVariable({ variables, onInserer, onFermer }) {
  const [choisie, setChoisie] = useState(null);
  const [repli, setRepli] = useState("");
  return (
    <div className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] max-w-[calc(100vw-32px)] rounded-[14px] border border-trait bg-surface-pleine p-3 shadow-xl">
      {!choisie ? (
        <div className="flex flex-col">
          {variables.map(([k, mot]) => (
            <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setChoisie([k, mot])} className="rounded-[8px] px-2.5 py-1.5 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">
              {mot} <span className="text-[11.5px] text-brume">{`{{${k}}}`}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13px] text-encre">{choisie[1]}</p>
          <label className="text-[12px] text-ardoise">Si le contact n'en a pas, écrire à la place
            <input autoFocus value={repli} onChange={(e) => setRepli(e.target.value)} placeholder={choisie[0] === "prenom" ? "ex. « à vous »" : "laisser vide pour rien"}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onInserer(choisie[0], repli); } }}
              className={`${champ} mt-1 h-9`} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onFermer} className={bouton}>Annuler</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onInserer(choisie[0], repli)} className={boutonPlein}>Insérer</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** L'email tel qu'il partira, au milieu de la page. Échap ou un clic dehors referment. */
function Visualisation({ html, objet, apercu, expediteur, contacts, vu, onVu, onFermer }) {
  const [largeur, setLargeur] = useState("ordinateur");
  useSansDefilement(true);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const pilule = (on) => `inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${on ? "bg-encre text-fond" : "text-craie hover:text-encre"}`;
  return createPortal(
    // Tout l'écran flouté, barre de gauche comprise, et le mail au milieu (9 oct. 2026).
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-fond/55 p-6 backdrop-blur-md duration-200 animate-in fade-in-0 max-md:p-0" onMouseDown={onFermer}>
      <div onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Visualiser l'email"
        className="flex max-h-full w-full max-w-[760px] flex-col overflow-hidden rounded-[18px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:h-full max-md:max-w-none max-md:rounded-none">
        <div className="flex items-start gap-3 border-b border-trait px-5 py-3.5 max-md:pt-[calc(14px+env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1 text-[12.5px]">
            <div className="truncate text-ardoise">De <span className="text-craie">{expediteur}</span></div>
            <div className="truncate text-[15px] text-encre">{objet || <span className="text-brume">Sans objet</span>}</div>
            {apercu && <div className="truncate text-ardoise">{apercu}</div>}
          </div>
          <select value={vu} onChange={(e) => onVu(e.target.value)} className="h-8 max-w-[200px] flex-none rounded-[8px] border border-trait bg-surface px-2 text-[12.5px] text-encre outline-none max-md:max-w-[140px]">
            <option value="">Exemple (Marie Durand)</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{[c.prenom, c.nom].filter(Boolean).join(" ") || c.email}</option>)}
          </select>
          <div className="inline-flex flex-none gap-0.5 rounded-full border border-trait p-0.5">
            <button type="button" className={pilule(largeur === "ordinateur")} onClick={() => setLargeur("ordinateur")} aria-label="Largeur ordinateur" title="Ordinateur"><Monitor className="h-3.5 w-3.5" /></button>
            <button type="button" className={pilule(largeur === "telephone")} onClick={() => setLargeur("telephone")} aria-label="Largeur téléphone" title="Téléphone"><Smartphone className="h-3.5 w-3.5" /></button>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-rail p-5 max-md:p-3">
          <iframe title="L'email" srcDoc={html} className="h-[72vh] rounded-[12px] border border-trait bg-white transition-[width] max-md:h-full max-md:max-w-full" style={{ width: largeur === "telephone" ? 390 : "100%" }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Le panneau d'AK : retoucher le bloc choisi, proposer des objets, relire. */
function PanneauAK({ email, bloc, onBloc, onObjet, onFermer }) {
  const [enCours, setEnCours] = useState(null);
  const [proposition, setProposition] = useState(null);
  const [objets, setObjets] = useState(null);
  const [relecture, setRelecture] = useState(null);
  const [precision, setPrecision] = useState("");
  const texteDuBloc = bloc ? (bloc.type === "colonnes" ? `${bloc.gauche}\n\n${bloc.droite}` : bloc.texte) : "";
  const appeler = async (cle, chemin, corps, apres) => {
    setEnCours(cle);
    try { apres(await req("POST", `/ia/${chemin}`, corps)); } catch (e) { toast.error(e?.message || "Haka n'a pas pu répondre"); } finally { setEnCours(null); }
  };
  const action = (cle, mot, corps) => (
    <button type="button" disabled={!texteDuBloc || !!enCours} onClick={() => appeler(cle, "retoucher", { texte: texteDuBloc, ...corps }, (r) => setProposition(r.texte))} className={`${bouton} h-8 text-[12.5px]`}>
      {enCours === cle ? <Loader2 className="h-3 w-3 animate-spin" /> : null}{mot}
    </button>
  );
  return (
    <aside className="flex h-full min-h-0 w-[320px] flex-none flex-col border-l border-trait bg-surface-pleine max-md:w-full max-md:border-l-0">
      <div className="flex items-center justify-between border-b border-trait px-4 py-3 max-md:pt-[calc(12px+env(safe-area-inset-top))]">
        <span className="inline-flex items-center gap-2 text-[14px] text-encre"><Sparkles className="h-4 w-4 text-menthe" />AK</span>
        <button type="button" onClick={onFermer} aria-label="Replier le panneau d'AK" className="grid h-7 w-7 place-items-center rounded-full max-md:h-10 max-md:w-10 text-ardoise hover:bg-relief hover:text-encre"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="m-0 text-[12.5px] text-ardoise">{bloc && texteDuBloc ? `Bloc choisi : ${NOM_BLOC[bloc.type] || bloc.type}` : "Cliquez un bloc de texte pour le retoucher."}</p>
        {/* Les trois tons d'un clic ; le reste avec une précision libre. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {action("raccourcir", "Plus court", { action: "raccourcir" })}
          {action("chaleureux", "Plus chaleureux", { action: "ton", precision: "plus chaleureux" })}
          {action("direct", "Plus direct", { action: "ton", precision: "plus direct" })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {action("reecrire", "Réécrire", { action: "reecrire" })}
          {action("ton", "Autre ton", { action: "ton", precision })}
          {action("traduire", "Traduire", { action: "traduire", precision })}
        </div>
        <input value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Ton ou langue : plus formel, anglais…" className={`${champ} mt-2 h-8 text-[12.5px]`} />
        {proposition && (
          <div className="mt-3 rounded-[12px] border border-menthe/40 p-3">
            <p className="m-0 whitespace-pre-wrap text-[13px] leading-[1.55] text-encre">{proposition}</p>
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setProposition(null)} className={`${bouton} h-8 text-[12.5px]`}>Ignorer</button>
              <button type="button" onClick={() => { onBloc(proposition); setProposition(null); }} className={`${boutonPlein} h-8 text-[12.5px]`}>Appliquer</button>
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-trait pt-4">
          <button type="button" disabled={!!enCours} onClick={() => appeler("objets", "objets", { objet: email.objet, design: email.design }, (r) => setObjets(r.objets))} className={`${bouton} h-8 text-[12.5px]`}>
            {enCours === "objets" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Proposer 3 objets
          </button>
          {objets && (
            <div className="mt-2 flex flex-col gap-1.5">
              {objets.map((o) => (
                <button key={o} type="button" onClick={() => onObjet(o)} className="rounded-[10px] border border-trait px-3 py-2 text-left text-[13px] text-encre hover:border-menthe/60" title="Prendre cet objet">{o}</button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-trait pt-4">
          <button type="button" disabled={!!enCours} onClick={() => appeler("relire", "relire", { objet: email.objet, apercu: email.apercu, design: email.design }, (r) => setRelecture(r.points))} className={`${bouton} h-8 text-[12.5px]`}>
            {enCours === "relire" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Relire l'email
          </button>
          {relecture && (
            relecture.length ? (
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                {relecture.map((p, i) => (
                  <li key={i} className="rounded-[10px] border border-trait px-3 py-2 text-[12.5px] leading-[1.5]">
                    {p.passage && <span className="block text-ardoise">« {p.passage} »</span>}
                    <span className="block text-encre">{p.probleme}</span>
                    {p.correction && <span className="block text-menthe">{p.correction}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="m-0 mt-2 text-[12.5px] text-menthe">Rien à signaler.</p>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * @param {{email: {objet, apercu, design}, onChange: (email) => void, expediteur?: string,
 *   desinscription?: boolean, variables?: string[]|null, actions?: React.ReactNode,
 *   onEnregistrerTemplate?: () => void, avecAK?: boolean}} props
 */
/**
 * « Insérer un asset » (9 oct. 2026) : le simulateur, un lead magnet, un
 * encadré enregistré dans l'onglet Assets ; ses blocs s'ajoutent au mail,
 * avec de nouveaux identifiants, et se retouchent comme les autres.
 */
function InsererAsset({ onInserer }) {
  const [ouvert, setOuvert] = useState(false);
  const { data } = useQuery({ queryKey: ["emailing-assets"], queryFn: () => req("GET", "/assets"), enabled: ouvert });
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOuvert((x) => !x)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-bord-doux px-3.5 py-2 text-[13px] text-ardoise hover:text-encre max-md:py-2.5"><Plus className="h-3.5 w-3.5" />Insérer un asset</button>
      {ouvert && (
        <>
          <span className="fixed inset-0 z-[60]" onClick={() => setOuvert(false)} />
          <span className="absolute bottom-full left-0 z-[70] mb-2 flex w-[280px] flex-col rounded-[12px] border border-bord-doux bg-surface-pleine p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
            {!data && <span className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-ardoise" /></span>}
            {(data?.assets || []).map((a) => (
              <button key={a.id} type="button" onClick={() => { setOuvert(false); onInserer((a.blocs || []).map((b, k) => ({ ...b, id: `${b.type}-${Date.now().toString(36)}${k}` }))); }}
                className="flex flex-col items-start rounded-[8px] px-2.5 py-2 text-left hover:bg-relief" style={{ background: "transparent" }}>
                <span className="text-[13.5px] text-encre">{a.nom}</span>
                {a.description && <span className="line-clamp-2 text-[12px] text-ardoise">{a.description}</span>}
              </button>
            ))}
            {data && !(data.assets || []).length && <span className="px-2.5 py-2 text-[12.5px] text-brume">Aucun asset : créez-en dans l'onglet Assets.</span>}
          </span>
        </>
      )}
    </span>
  );
}

const HISTORIQUES = new Map();
const historiqueDe = (id) => {
  if (id == null) return { id, courant: null, passe: [], futur: [], le: 0, rejoue: false };
  if (!HISTORIQUES.has(id)) HISTORIQUES.set(id, { id, courant: null, passe: [], futur: [], le: 0, rejoue: false });
  return HISTORIQUES.get(id);
};

export default function EditeurEmail({ email, onChange, expediteur = "L'équipe Klocka <equipe@notifications-klocka.com>", desinscription = true, variables = null, actions = null, onEnregistrerTemplate = null, avecAK = true }) {
  const { data: referentiel } = useReferentiel();
  const { data: lesContacts } = useQuery({ queryKey: ["emailing-contacts-apercu"], queryFn: () => req("GET", "/contacts/recherche?par_page=50"), staleTime: 30_000 });
  const [largeur, setLargeur] = useState("ordinateur");
  const [vu, setVu] = useState("");
  const [menuVar, setMenuVar] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [ak, setAk] = useState(false);
  const [visualiser, setVisualiser] = useState(false);
  // De, Objet et Aperçu repliables, pour voir le mail en grand (9 oct. 2026) ; retenu d'une ouverture à l'autre.
  const [replie, setReplie] = useState(() => { try { return localStorage.getItem("emailing.entete-replie") === "1"; } catch { return false; } });
  const replier = () => setReplie((x) => { try { localStorage.setItem("emailing.entete-replie", x ? "0" : "1"); } catch { /* sans stockage */ } return !x; });
  const [actif, setActif] = useState(null);
  const focus = useRef(null);
  // Revenir en arrière, aller en avant (9 oct. 2026) : chaque état du mail, d'où qu'il vienne
  // (une retouche, AK), est une étape ; une frappe continue en fait une seule.
  // Gardé par mail hors du composant : l'éditeur se démonte pendant qu'AK réécrit, et sa retouche doit pouvoir s'annuler.
  const historique = useRef(null);
  if (!historique.current || historique.current.id !== (email?.id ?? null)) historique.current = historiqueDe(email?.id ?? null);
  const [, setTicHisto] = useState(0);
  useEffect(() => {
    const h = historique.current;
    const etat = { objet: email?.objet || "", apercu: email?.apercu || "", design: email?.design || null };
    const cle = JSON.stringify(etat);
    if (h.courant == null) { h.courant = cle; return; }
    if (cle === h.courant) return;
    if (h.rejoue) { h.rejoue = false; h.courant = cle; return; }
    const maintenant = Date.now();
    if (maintenant - h.le > 800 || !h.passe.length) h.passe = [...h.passe, h.courant].slice(-100);
    h.le = maintenant;
    h.futur = [];
    h.courant = cle;
    setTicHisto((t) => t + 1);
  }, [email]);
  const rejouer = (sens) => {
    const h = historique.current;
    const pile = sens < 0 ? h.passe : h.futur;
    if (!pile.length) return;
    const cible = pile[pile.length - 1];
    if (sens < 0) { h.passe = h.passe.slice(0, -1); h.futur = [...h.futur, h.courant]; } else { h.futur = h.futur.slice(0, -1); h.passe = [...h.passe, h.courant]; }
    h.rejoue = true; h.le = 0;
    setTicHisto((t) => t + 1);
    onChange({ ...email, ...JSON.parse(cible) });
  };
  const telephone = useTelephone();
  useSansDefilement(telephone && avecAK && ak);
  const design = email?.design || { theme: "clair", blocs: [] };
  useLienPolices(lienPolices(design));
  const blocs = design.blocs || [];
  const changer = (patch) => onChange({ ...email, ...patch });
  const changerDesign = (d) => changer({ design: { ...design, ...d } });
  const changerBlocs = (l) => changerDesign({ blocs: l });
  const remplacerBloc = (b) => changerBlocs(blocs.map((x) => (x.id === b.id ? b : x)));

  const contact = (lesContacts?.contacts || []).find((c) => c.id === vu) || EXEMPLE;
  const html = useMemo(() => rendreEmail(design, vars(contact), { desinscription: desinscription ? "#" : null, logo: "/icones/icone-192.png", apercu: email?.apercu, contact: vu ? contact : null }).html, [design, contact, desinscription, email?.apercu, vu]);
  const objetVu = String(email?.objet || "").replace(/\{\{\s*(\w+)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/g, (m, k, r) => vars(contact)[k] || r || "");

  const listeVars = [...VARIABLES.filter(([k]) => (variables ? variables.includes(k) : k !== "lien")), ...(variables ? [] : (referentiel?.champs || []).map((c) => [c.cle, c.libelle]))];
  const noterFocus = (el, appliquer, blocId = null) => { focus.current = { el, appliquer }; if (blocId) setActif(blocId); };
  const inserer = (cle, repli) => {
    const texte = repli ? `{{${cle} | "${repli.replace(/"/g, "'")}"}}` : `{{${cle}}}`;
    const f = focus.current;
    setMenuVar(false);
    if (!f?.el) { toast.error("Cliquez d'abord dans l'objet, l'aperçu ou un texte."); return; }
    const { el } = f;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      const debut = el.selectionStart ?? el.value.length;
      const fin = el.selectionEnd ?? el.value.length;
      f.appliquer(`${el.value.slice(0, debut)}${texte}${el.value.slice(fin)}`);
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(debut + texte.length, debut + texte.length); });
      return;
    }
    // Un texte édité sur place (contentEditable) : on replace le curseur où il
    // était au moment d'ouvrir le menu (les clics du menu ont pu le déplacer),
    // puis on insère ; le commit normal (au blur) la garde.
    el.focus();
    if (f.range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(f.range); }
    document.execCommand("insertText", false, texte);
  };

  // Les blocs se déplacent et se suppriment depuis l'aperçu, au survol (9 oct. 2026).
  const outils = {
    monter: (i) => { const l = [...blocs]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; changerBlocs(l); },
    descendre: (i) => { const l = [...blocs]; [l[i], l[i + 1]] = [l[i + 1], l[i]]; changerBlocs(l); },
    supprimer: (id) => changerBlocs(blocs.filter((x) => x.id !== id)),
  };
  // Les réglages d'un bloc, sous lui dans l'aperçu : la carte de l'ancienne colonne (lien, image, condition).
  const rendreReglages = (b, fermer) => {
    const i = blocs.findIndex((x) => x.id === b.id);
    return (
      <div className="flex flex-col gap-1.5">
        <CarteBloc b={b} i={i} actif survole={false} onActif={() => {}} referentiel={referentiel} glisser={() => ({})}
          onChange={remplacerBloc} onFocus={noterFocus}
          onDupliquer={() => { const l = [...blocs]; l.splice(i + 1, 0, { ...b, id: `b${Math.random().toString(36).slice(2, 9)}` }); changerBlocs(l); }}
          onSupprimer={() => { fermer(); outils.supprimer(b.id); }} />
        <button type="button" onClick={fermer} className="self-end p-0 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Fermer les réglages</button>
      </div>
    );
  };

  const blocActif = blocs.find((b) => b.id === actif) || null;
  const pilule = (on) => `inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${on ? "bg-encre text-fond" : "text-craie hover:text-encre"}`;

  return (
    // Au téléphone, l'éditeur ne tient plus dans une hauteur fixe : les blocs
    // puis l'aperçu s'empilent et c'est la page qui défile.
    <div className="flex h-full min-h-0 flex-col max-md:h-auto">
      {/* L'objet, l'aperçu, les variables, le design. */}
      {!replie && <div className="flex flex-col gap-2 px-5 pb-1 pt-3 max-md:px-4">
        <div className="flex items-center gap-3 text-[13px]">
          <span className="w-16 flex-none text-[12.5px] text-ardoise max-md:w-12">De</span>
          <span className="min-w-0 flex-1 truncate text-craie">{expediteur}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 flex-none text-[12.5px] text-ardoise max-md:w-12">Objet</span>
          <input value={email?.objet || ""} onChange={(e) => changer({ objet: e.target.value })} onFocus={(e) => noterFocus(e.target, (v) => changer({ objet: v }))} placeholder="L'objet du mail"
            className="h-9 min-w-0 flex-1 rounded-[10px] border border-trait bg-surface px-3 text-[14px] font-medium text-encre outline-none focus:border-menthe max-md:h-10 max-md:text-[16px]" />
          <Compteur n={String(email?.objet || "").length} max={LIMITE_OBJET} />
        </div>
        <div className="flex items-center gap-3">
          <span className="w-16 flex-none text-[12.5px] text-ardoise max-md:w-12">Aperçu</span>
          <input value={email?.apercu || ""} onChange={(e) => changer({ apercu: e.target.value })} onFocus={(e) => noterFocus(e.target, (v) => changer({ apercu: v }))} placeholder="La ligne grise sous l'objet, dans la boîte de réception"
            className="h-9 min-w-0 flex-1 rounded-[10px] border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none focus:border-menthe max-md:h-10 max-md:text-[16px]" />
          <Compteur n={String(email?.apercu || "").length} max={LIMITE_APERCU} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
              const f = focus.current;
              if (f?.el && !["INPUT", "TEXTAREA"].includes(f.el.tagName)) {
                const sel = window.getSelection();
                f.range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
              }
              setMenuVar((v) => !v);
            }} className={`${bouton} h-8 text-[12.5px]`}><Braces className="h-3.5 w-3.5" />Insérer une variable</button>
            {menuVar && <MenuVariable variables={listeVars} onInserer={inserer} onFermer={() => setMenuVar(false)} />}
          </div>
          <span className="text-[12px] text-brume">**gras** dans les textes</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5 max-md:ml-0">
            {Object.entries(THEMES).map(([cle, t]) => (
              <button key={cle} type="button" onClick={() => changerDesign({ theme: cle, accent: null })} aria-label={`Design ${t.nom}`}
                className={`h-8 rounded-full border px-2.5 text-[12px] transition-colors ${design.theme === cle ? "border-encre text-encre" : "border-trait text-ardoise hover:text-encre"}`}>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.accent }} />{t.nom}
              </button>
            ))}
            <ChoixMiseEnPage design={design} onChange={changerDesign} />
            <ChoixPolices design={design} onChange={changerDesign} />
            <div className="inline-flex gap-0.5 rounded-full border border-trait p-0.5">
              <button type="button" className={pilule(largeur === "ordinateur")} onClick={() => setLargeur("ordinateur")} aria-label="Largeur ordinateur" title="Ordinateur"><Monitor className="h-3.5 w-3.5" /></button>
              <button type="button" className={pilule(largeur === "telephone")} onClick={() => setLargeur("telephone")} aria-label="Largeur téléphone" title="Téléphone"><Smartphone className="h-3.5 w-3.5" /></button>
            </div>
            <button type="button" onClick={() => setVisualiser(true)} className={`${bouton} h-8 text-[12.5px]`}><Eye className="h-3.5 w-3.5" />Visualiser</button>
            <BoutonTester email={email} />
            {onEnregistrerTemplate && <button type="button" onClick={onEnregistrerTemplate} className={`${bouton} h-8 text-[12.5px]`}><Save className="h-3.5 w-3.5" />Enregistrer comme template</button>}
            {actions}
            {avecAK && !ak && <button type="button" onClick={() => setAk(true)} className={`${bouton} h-8 text-[12.5px]`}><Sparkles className="h-3.5 w-3.5 text-menthe" />AK</button>}
          </div>
        </div>
      </div>}
      {/* La petite barre sous l'en-tête : une flèche pour replier ou déplier objet, aperçu et réglages. */}
      <div className="relative flex h-7 flex-none items-center justify-center border-b border-trait px-3">
        <span className="absolute left-3 flex items-center gap-0.5">
          <button type="button" onClick={() => rejouer(-1)} disabled={!historique.current.passe.length} aria-label="Revenir en arrière" title="Revenir en arrière"
            className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre disabled:opacity-30 disabled:hover:bg-transparent" style={{ background: "transparent" }}><Undo2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => rejouer(1)} disabled={!historique.current.futur.length} aria-label="Aller en avant" title="Aller en avant"
            className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre disabled:opacity-30 disabled:hover:bg-transparent" style={{ background: "transparent" }}><Redo2 className="h-3.5 w-3.5" /></button>
        </span>
        <button type="button" onClick={replier} aria-expanded={!replie} title={replie ? "Afficher l'objet, l'aperçu et les réglages" : "Replier pour voir le mail en grand"}
          className="group grid h-6 w-16 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
          {replie ? <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-px" /> : <ChevronUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-px" />}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 max-md:flex-none">
        {/* Le mail, directement sous l'objet : on l'écrit sur place, AK le réécrit depuis le chat (9 oct. 2026). */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 pt-5 max-md:overflow-visible max-md:px-3">
          <div className="mx-auto w-full transition-[max-width] duration-300" style={{ maxWidth: largeur === "telephone" ? 390 : 760 }}>
            <div className="overflow-hidden rounded-[12px] border border-trait">
              <PreviewEditable design={design} blocs={blocs} onChangeBloc={remplacerBloc} registrer={noterFocus} onChoisirBloc={setActif}
                logo="/icones/icone-192.png" expediteur={expediteur} desinscription={desinscription} outils={outils} rendreReglages={rendreReglages} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {ajout ? <ChoixBloc onChoisir={(t) => { setAjout(false); const nb = blocNeuf(t); changerBlocs([...blocs, nb]); setActif(nb.id); }} /> : (
                <>
                  <button type="button" onClick={() => setAjout(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-bord-doux px-3.5 py-2 text-[13px] text-ardoise hover:text-encre max-md:py-2.5" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" />Ajouter un bloc</button>
                  <InsererAsset onInserer={(nouveaux) => changerBlocs([...blocs, ...nouveaux])} />
                </>
              )}
              <label className="ml-auto flex items-center gap-2 text-[12.5px] text-ardoise">
                <input type="checkbox" checked={design.logo !== false} onChange={(e) => changerDesign({ logo: e.target.checked })} />Logo Klocka en tête
              </label>
            </div>
          </div>
        </div>
        {visualiser && <Visualisation html={html} objet={objetVu} apercu={email?.apercu} expediteur={expediteur} contacts={lesContacts?.contacts || []} vu={vu} onVu={setVu} onFermer={() => setVisualiser(false)} />}
        {avecAK && ak && (() => {
          const panneau = (
            <PanneauAK email={email} bloc={blocActif} onFermer={() => setAk(false)}
              onObjet={(o) => changer({ objet: o })}
              onBloc={(t) => {
                if (!blocActif) return;
                if (blocActif.type === "colonnes") { const [g, ...d] = t.split(/\n\s*\n/); remplacerBloc({ ...blocActif, gauche: g, droite: d.join("\n\n") || blocActif.droite }); } else remplacerBloc({ ...blocActif, texte: t });
              }} />
          );
          // Au téléphone, le panneau d'AK passe en plein écran, rendu dans le body.
          return telephone ? createPortal(<div className="fixed inset-0 z-[70] flex bg-surface-pleine">{panneau}</div>, document.body) : panneau;
        })()}
      </div>
    </div>
  );
}
