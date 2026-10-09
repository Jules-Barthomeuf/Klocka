import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Braces, Copy, Eye, Filter, GripVertical, Loader2, Monitor, Plus, Save, Smartphone, Sparkles, Trash2, X } from "lucide-react";
import { THEMES, TYPES_BLOCS, VARIABLES, blocNeuf, rendreEmail, styles as stylesDuTheme } from "@/lib/email-design";
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
const PreviewEditable = React.memo(function PreviewEditable({ design, blocs, onChangeBloc, registrer, onChoisirBloc, logo, expediteur, desinscription = true }) {
  const s = stylesDuTheme(design?.theme);
  // Image et séparateur n'ont pas de texte : un clic les choisit simplement
  // pour l'AK, sans ouvrir de champ d'édition.
  const choisir = (id) => () => onChoisirBloc(id);
  return (
    <div style={{ ...s.page, minHeight: "100%" }}>
      <div style={{ ...s.carte, position: "relative" }}>
        {design?.logo !== false && logo && <img src={logo} alt="Klocka" width={40} height={40} style={{ ...s.logo, borderRadius: 10 }} />}
        {blocs.map((b) => {
          const garder = (v) => onChangeBloc({ ...b, texte: v });
          if (b.type === "titre") return <TexteDirect key={b.id} blocId={b.id} registrer={registrer} as="h1" style={s.titre} valeur={b.texte} placeholder="Un titre" onGarde={garder} />;
          if (b.type === "signature") return <TexteDirect key={b.id} blocId={b.id} registrer={registrer} as="p" style={s.signature} valeur={b.texte} placeholder="La signature" onGarde={garder} />;
          if (b.type === "separateur") return <hr key={b.id} style={{ ...s.separateur, cursor: "pointer" }} onClick={choisir(b.id)} />;
          if (b.type === "bouton") return (
            <div key={b.id} style={s.zoneBouton}>
              <TexteDirect blocId={b.id} registrer={registrer} as="span" style={s.bouton} valeur={b.texte} placeholder="Le bouton" onGarde={garder} />
            </div>
          );
          if (b.type === "image") return b.src
            ? <img key={b.id} src={b.src} alt="" style={{ ...s.image, cursor: "pointer" }} onClick={choisir(b.id)} />
            : <div key={b.id} onClick={choisir(b.id)} className="mb-5 grid h-28 cursor-pointer place-items-center rounded-[10px] border border-dashed border-bord-doux text-[13px] text-ardoise">Cliquez pour poser l'image (à gauche)</div>;
          if (b.type === "citation") return (
            <blockquote key={b.id} style={s.citation}>
              <TexteDirect blocId={b.id} registrer={registrer} as="span" style={{}} valeur={b.texte} placeholder="Une citation" onGarde={garder} />
              <TexteDirect blocId={b.id} registrer={registrer} as="span" style={s.auteur} valeur={b.auteur} placeholder="— l'auteur" onGarde={(v) => onChangeBloc({ ...b, auteur: v })} />
            </blockquote>
          );
          if (b.type === "colonnes") return (
            <table key={b.id} role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ margin: "0 0 20px" }}><tbody><tr>
              <td style={{ ...s.colonne, paddingRight: 12 }}><TexteDirect blocId={b.id} registrer={registrer} as="div" style={{}} valeur={b.gauche} placeholder="À gauche" onGarde={(v) => onChangeBloc({ ...b, gauche: v })} /></td>
              <td style={{ ...s.colonne, paddingLeft: 12 }}><TexteDirect blocId={b.id} registrer={registrer} as="div" style={{}} valeur={b.droite} placeholder="À droite" onGarde={(v) => onChangeBloc({ ...b, droite: v })} /></td>
            </tr></tbody></table>
          );
          return <TexteDirect key={b.id} blocId={b.id} registrer={registrer} as="p" style={s.texte} valeur={b.texte} placeholder="Votre texte" onGarde={garder} />;
        })}
        {!blocs.length && <p style={{ ...s.texte, opacity: .5 }}>Ajoutez un bloc à gauche.</p>}
      </div>
      {desinscription && <p style={s.pied}>Klocka · murs commerciaux<br />Vous recevez ce mail après votre inscription. <span style={s.lienPied}>Se désinscrire</span></p>}
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
      {["titre", "texte", "signature"].includes(b.type) && zone("texte", b.type === "texte" ? 4 : 1)}
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-fond/70 p-6 backdrop-blur-sm md:left-[var(--k-barre-largeur)] max-md:p-0" onMouseDown={onFermer}>
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
    try { apres(await req("POST", `/ia/${chemin}`, corps)); } catch (e) { toast.error(e?.message || "AK n'a pas pu répondre"); } finally { setEnCours(null); }
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

export default function EditeurEmail({ email, onChange, expediteur = "L'équipe Klocka <equipe@notifications-klocka.com>", desinscription = true, variables = null, actions = null, onEnregistrerTemplate = null, avecAK = true }) {
  const { data: referentiel } = useReferentiel();
  const { data: lesContacts } = useQuery({ queryKey: ["emailing-contacts-apercu"], queryFn: () => req("GET", "/contacts/recherche?par_page=50"), staleTime: 30_000 });
  const [largeur, setLargeur] = useState("ordinateur");
  const [vu, setVu] = useState("");
  const [menuVar, setMenuVar] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [ak, setAk] = useState(false);
  const [visualiser, setVisualiser] = useState(false);
  const [actif, setActif] = useState(null);
  const [survole, setSurvole] = useState(null);
  const focus = useRef(null);
  const source = useRef(null);
  const telephone = useTelephone();
  useSansDefilement(telephone && avecAK && ak);
  const design = email?.design || { theme: "clair", blocs: [] };
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

  const glisser = (i) => ({
    draggable: true,
    onDragStart: (e) => { if (["TEXTAREA", "INPUT", "SELECT"].includes(e.target.tagName)) { e.preventDefault(); return; } source.current = i; e.dataTransfer.effectAllowed = "move"; },
    onDragOver: (e) => { e.preventDefault(); setSurvole(i); },
    onDragLeave: () => setSurvole((v) => (v === i ? null : v)),
    onDrop: (e) => {
      e.preventDefault();
      setSurvole(null);
      const de = source.current;
      source.current = null;
      if (de == null || de === i) return;
      const l = [...blocs];
      const [x] = l.splice(de, 1);
      l.splice(i, 0, x);
      changerBlocs(l);
    },
  });

  const blocActif = blocs.find((b) => b.id === actif) || null;
  const pilule = (on) => `inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${on ? "bg-encre text-fond" : "text-craie hover:text-encre"}`;

  return (
    // Au téléphone, l'éditeur ne tient plus dans une hauteur fixe : les blocs
    // puis l'aperçu s'empilent et c'est la page qui défile.
    <div className="flex h-full min-h-0 flex-col max-md:h-auto">
      {/* L'objet, l'aperçu, les variables, le design. */}
      <div className="flex flex-col gap-2 border-b border-trait px-5 py-3 max-md:px-4">
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
              <button key={cle} type="button" onClick={() => changerDesign({ theme: cle })} aria-label={`Design ${t.nom}`}
                className={`h-8 rounded-full border px-2.5 text-[12px] transition-colors ${design.theme === cle ? "border-encre text-encre" : "border-trait text-ardoise hover:text-encre"}`}>
                <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.accent }} />{t.nom}
              </button>
            ))}
            <button type="button" onClick={() => setVisualiser(true)} className={`${bouton} h-8 text-[12.5px]`}><Eye className="h-3.5 w-3.5" />Visualiser</button>
            {onEnregistrerTemplate && <button type="button" onClick={onEnregistrerTemplate} className={`${bouton} h-8 text-[12.5px]`}><Save className="h-3.5 w-3.5" />Enregistrer comme template</button>}
            {actions}
            {avecAK && !ak && <button type="button" onClick={() => setAk(true)} className={`${bouton} h-8 text-[12.5px]`}><Sparkles className="h-3.5 w-3.5 text-menthe" />AK</button>}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 max-md:flex-none">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(340px,440px)_minmax(0,1fr)] max-lg:grid-cols-1 max-md:flex-none max-md:grid-cols-[minmax(0,1fr)]">
          {/* Les blocs. */}
          <div className="min-h-0 overflow-y-auto border-r border-trait px-4 py-4 max-md:overflow-visible max-md:border-b max-md:border-r-0">
            <div className="flex flex-col gap-2.5">
              {blocs.map((b, i) => (
                <CarteBloc key={b.id || i} b={b} i={i} actif={actif === b.id} survole={survole === i} onActif={setActif} referentiel={referentiel} glisser={glisser}
                  onChange={remplacerBloc} onFocus={noterFocus}
                  onDupliquer={() => { const l = [...blocs]; l.splice(i + 1, 0, { ...b, id: `b${Math.random().toString(36).slice(2, 9)}` }); changerBlocs(l); }}
                  onSupprimer={() => changerBlocs(blocs.filter((x) => x.id !== b.id))}
                  onMonter={i > 0 ? () => { const l = [...blocs]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; changerBlocs(l); } : null}
                  onDescendre={i < blocs.length - 1 ? () => { const l = [...blocs]; [l[i], l[i + 1]] = [l[i + 1], l[i]]; changerBlocs(l); } : null} />
              ))}
            </div>
            <div className="mt-3">
              {ajout ? <ChoixBloc onChoisir={(t) => { setAjout(false); const nb = blocNeuf(t); changerBlocs([...blocs, nb]); setActif(nb.id); }} /> : (
                <span className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAjout(true)} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-bord-doux px-3.5 py-2 text-[13px] text-ardoise hover:text-encre max-md:py-2.5"><Plus className="h-3.5 w-3.5" />Ajouter un bloc</button>
                  <InsererAsset onInserer={(nouveaux) => changerBlocs([...blocs, ...nouveaux])} />
                </span>
              )}
            </div>
            <label className="mt-4 flex items-center gap-2 text-[12.5px] text-ardoise">
              <input type="checkbox" checked={design.logo !== false} onChange={(e) => changerDesign({ logo: e.target.checked })} />Logo Klocka en tête
            </label>
          </div>

          {/* L'aperçu, modifiable sur place : un clic dans un texte l'édite. */}
          <div className="flex min-h-0 flex-col bg-rail">
            <div className="flex flex-wrap items-center gap-2 border-b border-trait px-4 py-2.5">
              <span className="text-[12.5px] text-ardoise">Cliquez un texte pour le modifier</span>
              <div className="ml-auto inline-flex gap-0.5 rounded-full border border-trait p-0.5">
                <button type="button" className={pilule(largeur === "ordinateur")} onClick={() => setLargeur("ordinateur")} aria-label="Largeur ordinateur"><Monitor className="h-3.5 w-3.5" /></button>
                <button type="button" className={pilule(largeur === "telephone")} onClick={() => setLargeur("telephone")} aria-label="Largeur téléphone"><Smartphone className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="border-b border-trait px-4 py-2 text-[12.5px]">
              <div className="truncate text-ardoise">De <span className="text-craie">{expediteur}</span></div>
              <div className="truncate text-[13.5px] font-medium text-encre">{email?.objet || <span className="text-brume">Sans objet</span>}</div>
            </div>
            <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4 max-md:px-3">
              <div className="h-fit w-full overflow-hidden rounded-[12px] border border-trait bg-white transition-[max-width]" style={{ maxWidth: largeur === "telephone" ? 390 : "100%" }}>
                <PreviewEditable design={design} blocs={blocs} onChangeBloc={remplacerBloc} registrer={noterFocus} onChoisirBloc={setActif}
                  logo="/icones/icone-192.png" expediteur={expediteur} desinscription={desinscription} />
              </div>
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
