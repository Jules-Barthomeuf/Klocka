import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, Bold, CaseUpper, Check, Download, Eye, EyeOff, GripVertical, History, ImagePlus, Italic, ListTree, Loader2, Maximize2, MessageSquareText, Minus, Move, Pencil, Plus, Redo2, RotateCcw, Send, Strikethrough, Underline, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import LogoKP from "./LogoKP";
import AGENCE from "@/lib/agence-klocka.json";
import "./avis-valeur.css";

// L'éditeur de l'avis de valeur, comme un atelier de design : à gauche le
// chat de retouche (« raccourcis la synthèse », « mets la photo plus grande »,
// « déplace le marché avant les méthodes »), le plan des pages (glisser pour
// réordonner, masquer) et les versions ; à droite les pages du modèle
// K Partners, où tout se clique et s'écrit. Un clic sélectionne un élément :
// « ça » dans le chat le désigne. Les chiffres de la conclusion se
// recalculent quand la valeur ou les honoraires changent. Tout s'enregistre
// seul ; « Télécharger le PDF » imprime les pages, rien d'autre.

const MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const eur = (n) => (n == null || !isFinite(n) ? "[à compléter]" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const nb = (n, d = 0) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pc = (n) => (n == null || !isFinite(n) ? "—" : `${nb(n, n % 1 ? (String(n).split(".")[1]?.length > 1 ? 2 : 1) : 1)} %`);
const nombreDe = (t) => Number(String(t).replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(",", ".")) || null;

export const SECTIONS = ["cadre", "description", "emplacement", "locatif", "juridique", "marche", "methodes", "conclusion"];
const LABELS = { cadre: "Cadre de la mission", description: "Description du bien", emplacement: "Emplacement", locatif: "Situation locative", juridique: "Juridique et technique", marche: "Analyse de marché", methodes: "Méthodes", conclusion: "Conclusion" };
const NOMS = { ...LABELS, libre: "Texte", chiffres: "Chiffres", bien: "Bien", demandeur: "Demandeur", date: "Date", type_libelle: "Type de bien", mise_en_page: "Mise en page" };

/** Pose une valeur à un chemin (« conclusion.points.1 »), sans muter. */
function poser(objet, chemin, valeur) {
  const cles = chemin.split(".");
  const copie = Array.isArray(objet) ? [...objet] : { ...objet };
  let ici = copie;
  for (let i = 0; i < cles.length - 1; i++) {
    const k = cles[i];
    ici[k] = Array.isArray(ici[k]) ? [...ici[k]] : { ...(ici[k] || {}) };
    ici = ici[k];
  }
  ici[cles.at(-1)] = valeur;
  return copie;
}
const lire = (objet, chemin) => String(chemin || "").split(".").reduce((o, k) => (o == null ? undefined : o[k]), objet);

/** Les chiffres qui découlent de la valeur retenue. */
function recalculer(avis) {
  const c = { ...(avis.chiffres || {}) };
  if (!(c.valeur > 0)) return avis;
  const loyer = avis.methodes?.loyer || null;
  const hon = Number(c.honoraires_pct ?? 5) / 100;
  const frais = Number(c.frais_pct ?? 7.5) / 100;
  c.prix_affiche = Math.round((c.valeur * (1 + hon)) / 100) * 100;
  c.cout_total = Math.round((c.prix_affiche * (1 + frais)) / 1000) * 1000;
  c.rendement = loyer ? Math.round((loyer / c.valeur) * 1000) / 10 : null;
  c.rendement_affiche = loyer ? Math.round((loyer / c.prix_affiche) * 1000) / 10 : null;
  c.rendement_total = loyer ? Math.round((loyer / (c.prix_affiche * (1 + frais))) * 1000) / 10 : null;
  // Les phrases qui citent les chiffres (clés « c_ ») se réécrivent avec eux.
  const libre = Object.fromEntries(Object.entries(avis.libre || {}).filter(([k]) => !k.startsWith("c_")));
  return { ...avis, chiffres: c, libre };
}

/** Le libellé d'un chemin, pour le chat : « Situation locative › ligne 3 › texte ». */
export function libelleChemin(chemin) {
  if (!chemin) return "";
  if (chemin.startsWith("section.")) return `Page « ${LABELS[chemin.slice(8)] || chemin.slice(8)} »`;
  const [tete, ...reste] = chemin.split(".");
  return [NOMS[tete] || tete, ...reste.map((k) => (/^\d+$/.test(k) ? `ligne ${Number(k) + 1}` : k.replace(/_/g, " ")))].join(" › ");
}

// La sélection : l'élément que le mandataire a cliqué, que le chat désigne par « ça ».
const Selection = createContext({ chemin: null, clePos: null, choisir: () => {}, styles: {}, positions: {} });
// La page où l'on est : un même chemin (la valeur, le demandeur) peut
// paraître sur deux pages, et chacune se déplace à part.
const PageCtx = createContext("couverture");
const MM = 96 / 25.4;
/** Un élément déplacé à la main (avis.positions[page:chemin], en millimètres) ou tourné : sa transformation. */
const placementCss = (pos, st) => {
  const parts = [pos && (pos.x || pos.y) ? `translate(${pos.x || 0}mm, ${pos.y || 0}mm)` : null, st?.rotation ? `rotate(${st.rotation}deg)` : null].filter(Boolean);
  return parts.length ? { transform: parts.join(" "), position: "relative", zIndex: 1 } : undefined;
};

// La mise en forme d'un élément (avis.styles[chemin]) : la palette du
// document, une taille en points, gras, italique, souligné, alignement.
const PALETTE = [["encre", "Encre", "var(--encre)"], ["sauge-fonce", "Sauge foncé", "var(--sauge-fonce)"], ["sauge", "Sauge", "var(--sauge)"], ["menthe", "Menthe", "var(--kp)"], ["ocre", "Ocre", "var(--ocre)"], ["gris", "Gris", "var(--gris)"], ["blanc", "Blanc", "var(--blanc)"]];
const couleurCss = (c) => PALETTE.find((p) => p[0] === c)?.[2] || c;
const POLICES = { serif: 'Georgia, "Times New Roman", serif', sans: '"Helvetica Neue", Helvetica, Arial, sans-serif', mono: '"Courier New", Courier, monospace' };
const styleCss = (st) => (st ? {
  ...(st.taille ? { fontSize: `${st.taille}pt` } : {}),
  ...(POLICES[st.police] ? { fontFamily: POLICES[st.police] } : {}),
  ...(st.couleur ? { color: couleurCss(st.couleur) } : {}),
  ...(st.surlignage || st.fond ? { backgroundColor: couleurCss(st.surlignage || st.fond) } : {}),
  ...(st.gras ? { fontWeight: 700 } : {}),
  ...(st.italique ? { fontStyle: "italic" } : {}),
  ...(st.souligne || st.barre ? { textDecoration: [st.souligne && "underline", st.barre && "line-through"].filter(Boolean).join(" ") } : {}),
  ...(st.majuscules ? { textTransform: "uppercase" } : {}),
  ...(st.interligne ? { lineHeight: st.interligne } : {}),
  ...(st.espacement != null ? { letterSpacing: `${st.espacement}em` } : {}),
  ...(st.opacite != null ? { opacity: st.opacite / 100 } : {}),
  ...(st.aligner ? { textAlign: st.aligner, display: "block" } : {}),
  ...(st.bordure ? { border: `${st.bordure === "epaisse" ? 0.6 : 0.3}mm solid ${couleurCss(st.bordure_couleur || "encre")}` } : {}),
  ...(st.arrondi != null ? { borderRadius: `${st.arrondi}mm` } : {}),
  ...(st.marge != null ? { padding: `${st.marge}mm` } : {}),
  ...(st.largeur ? { width: `${st.largeur}%`, maxWidth: `${st.largeur}%` } : {}),
  ...(st.hauteur_mm ? { height: `${st.hauteur_mm}mm` } : {}),
  ...(st.ombre ? { boxShadow: "0 2mm 6mm rgb(0 0 0 / 0.18)" } : {}),
  ...(st.masque ? { display: "none" } : {}),
} : undefined);
/** La taille en points d'un élément, mesurée à l'écran quel que soit le zoom : l'en-tête des pages fait 8 pt. */
const taillePt = (el) => {
  const repere = el.closest(".avis")?.querySelector(".avis-entete");
  const px = parseFloat(getComputedStyle(el).fontSize);
  const reperePx = repere ? parseFloat(getComputedStyle(repere).fontSize) : null;
  const facteur = reperePx ? reperePx / (8 / 0.75) : 1;
  return Math.round(((px * 0.75) / facteur) * 2) / 2;
};

/**
 * Un texte modifiable en place. Non contrôlé pendant la frappe (le curseur
 * ne saute pas) ; la valeur part au parent quand on quitte le champ.
 */
function T({ v, chemin, onPose, as: Balise = "span", className = "", nombre = false, format = null, lire: lireTexte = null }) {
  const ref = useRef(null);
  const sel = useContext(Selection);
  const page = useContext(PageCtx);
  const clePos = `${page}:${chemin}`;
  const affiche = format ? format(v) : v == null || v === "" ? "[à compléter]" : String(v);
  useLayoutEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.textContent = affiche;
  }, [affiche]);
  const aCompleter = /\[à compléter\]/.test(affiche);
  const choisi = sel.clePos ? sel.clePos === clePos : sel.chemin === chemin;
  return (
    <Balise ref={ref} data-edit="" data-chemin={chemin} contentEditable suppressContentEditableWarning spellCheck={false}
      className={`${className} ${aCompleter ? "a-completer" : ""} ${choisi ? "avis-choisi" : ""}`}
      style={{ ...styleCss(sel.styles?.[chemin]), ...placementCss(sel.positions?.[clePos], sel.styles?.[chemin]) }}
      onFocus={() => sel.choisir({ chemin, clePos, el: ref.current, texte: ref.current?.textContent || "", taille: ref.current ? taillePt(ref.current) : null })}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const texte = e.currentTarget.textContent.trim();
        if (texte === affiche) return;
        onPose(chemin, lireTexte ? lireTexte(texte) : nombre ? nombreDe(texte) : texte);
      }}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && Balise !== "p" && Balise !== "div") { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}

/**
 * Un bloc du document (photo, tableau, encadré, logo, bandeau…) : il se
 * sélectionne d'un clic, se déplace à la poignée, prend une mise en forme.
 */
function Bloc({ cle, nom = null, as: Balise = "div", className = "", style, children, ...reste }) {
  const sel = useContext(Selection);
  const page = useContext(PageCtx);
  const ref = useRef(null);
  const chemin = `bloc.${cle}`;
  const clePos = `${page}:${chemin}`;
  const choisi = sel.clePos === clePos;
  return (
    <Balise ref={ref} data-bloc={cle} className={`avis-bloc ${className} ${choisi ? "avis-choisi" : ""}`}
      style={{ ...style, ...styleCss(sel.styles?.[chemin]), ...placementCss(sel.positions?.[clePos], sel.styles?.[chemin]) }}
      onClick={(e) => { e.stopPropagation(); sel.choisir({ chemin, clePos, el: ref.current, texte: nom || cle }); }}
      {...reste}>
      {children}
    </Balise>
  );
}

/** Un texte fixe du modèle, modifiable lui aussi : la retouche se garde dans avis.libre. */
function L({ avis, k, defaut, onPose, as, className }) {
  return <T v={avis.libre?.[k] ?? defaut} chemin={`libre.${k}`} onPose={onPose} as={as} className={className} />;
}

/** Le logo K Partners, le même partout : le fichier s'il est là, sinon le tracé. */
function Logo() {
  const [image, setImage] = useState(true);
  return image
    ? <img className="avis-logo avis-logo-image" src="/logo-kpartners.png" alt="K Partners" onError={() => setImage(false)} />
    : <LogoKP className="avis-logo avis-logo-trace" />;
}

function Page({ cle, num, avis, numero, children }) {
  const sel = useContext(Selection);
  const choisi = sel.chemin === `section.${cle}`;
  return (
    <section className={`avis-page ${choisi ? "avis-page-choisie" : ""}`} data-section={cle} id={`avis-page-${cle}`}>
      <aside className="avis-bande" onClick={() => sel.choisir({ chemin: `section.${cle}`, texte: LABELS[cle] })} title="Sélectionner la page">
        <span className="avis-bande-num">{String(num).padStart(2, "0")}</span>
        <span className="avis-bande-label">{LABELS[cle]}</span>
      </aside>
      <div className="avis-corps">
        <div className="avis-entete">
          <span>Avis de valeur · {avis.bien.rue}, {avis.bien.ville}</span>
          <b>{numero}</b>
        </div>
        <div className="avis-contenu"><PageCtx.Provider value={cle}>{children}</PageCtx.Provider></div>
        <div className="avis-pied">
          <div className="avis-pied-trait">KP</div>
          <span className="avis-pied-texte">Page {numero} · Avis de valeur · {avis.type_libelle} · {avis.bien.rue}, {avis.bien.ville}</span>
        </div>
      </div>
    </section>
  );
}

/** Des lignes mot / texte, à glisser pour réordonner. */
function Lignes({ lignes = [], base, onPose }) {
  const [glisse, setGlisse] = useState(null);
  const deposer = (vers) => {
    if (glisse == null || glisse === vers) return setGlisse(null);
    const copie = [...lignes];
    const [x] = copie.splice(glisse, 1);
    copie.splice(vers, 0, x);
    setGlisse(null);
    onPose(base, copie);
  };
  return (
    <Bloc cle={base} nom="Tableau">
    <table className="avis-table">
      <tbody>
        {lignes.map((l, i) => (
          <tr key={i} className={`${l.alerte ? "alerte" : ""} ${glisse === i ? "avis-glisse" : ""}`} draggable
            onDragStart={(e) => { setGlisse(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => { e.preventDefault(); deposer(i); }}
            onDragEnd={() => setGlisse(null)}>
            <td><span className="avis-grip" aria-hidden><GripVertical /></span><T v={l.mot} chemin={`${base}.${i}.mot`} onPose={onPose} /></td>
            <td><T v={l.texte} chemin={`${base}.${i}.texte`} onPose={onPose} /></td>
          </tr>
        ))}
      </tbody>
    </table>
    </Bloc>
  );
}

const vueRue = (avis, cap = 0) =>
  avis.bien.lat != null && MAPS
    ? `https://maps.googleapis.com/maps/api/streetview?size=1280x720&location=${avis.bien.lat},${avis.bien.lon}&fov=80&heading=${cap}&key=${MAPS}`
    : null;

function Photo({ avis, cle, className, style, estimationId, onAvis, cap = 0 }) {
  const fichier = useRef(null);
  const url = avis.photos?.[cle] || (cle === "portrait" ? avis.signataire?.photo || null : vueRue(avis, cap));
  const envoyer = async (f) => {
    if (!f) return;
    const form = new FormData();
    form.append("fichier", f);
    try {
      const r = await base44.request("POST", `/api/mandataire/estimations/${estimationId}/photo?cle=${cle}`, { body: form, isForm: true });
      onAvis(r.avis || r.estimation.avis);
      toast.success("Photo remplacée");
    } catch (e) { toast.error(e?.message || "Envoi impossible"); }
  };
  return (
    <Bloc cle={`photo.${cle}`} nom="Photo" className={className} style={{ ...style, backgroundImage: url ? `url("${url}")` : undefined }}>
      <input ref={fichier} type="file" accept="image/*" hidden onChange={(e) => { envoyer(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" className="avis-photo-bouton" onClick={(e) => { e.stopPropagation(); fichier.current?.click(); }}>{url ? "Changer la photo" : "Ajouter une photo"}</button>
    </Bloc>
  );
}

/** Les sections visibles, dans l'ordre voulu. */
export function sectionsDe(avis) {
  const masquees = new Set(avis.masquees || []);
  const ordre = [...new Set([...(avis.ordre || []), ...SECTIONS])].filter((x) => SECTIONS.includes(x));
  return ordre.filter((cle) => (cle !== "locatif" || avis.locatif) && !masquees.has(cle));
}

export function PagesAvis({ avis, onPose, estimationId, onAvis }) {
  const s = avis.signataire || {};
  const c = avis.chiffres || {};
  const m = avis.methodes || {};
  const mep = avis.mise_en_page || {};
  const sections = sectionsDe(avis);
  const num = (cle) => sections.indexOf(cle) + 1;
  const page = (cle) => num(cle) + 1;
  const redige = s.nom || "[à compléter]";
  const position = c.haut > c.bas ? Math.min(100, Math.max(0, ((c.valeur - c.bas) / (c.haut - c.bas)) * 100)) : 50;

  const contenu = {
    cadre: (
      <>
        <p className="avis-etiquette" style={{ margin: "0 0 4mm" }}>Résumé de l'avis</p>
        <Bloc cle="resume" nom="Résumé de l'avis" style={{ display: "flex", alignItems: "flex-end", gap: "10mm", paddingBottom: "5mm", borderBottom: "1px solid var(--sauge)" }}>
          <div>
            <div style={{ fontSize: `${mep.taille_valeur_pt || 36}pt`, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}><T v={c.valeur} chemin="chiffres.valeur" onPose={onPose} nombre format={(v) => eur(v)} /></div>
            <L avis={avis} k="net_vendeur" defaut="Net vendeur hors droits" onPose={onPose} as="div" className="avis-texte avis-mt2" />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "9mm" }}>
            <div><div className="avis-texte">Fourchette</div><b style={{ fontSize: "11pt" }}><T v={c.bas} chemin="chiffres.bas" onPose={onPose} nombre format={(v) => nb(v)} /> – <T v={c.haut} chemin="chiffres.haut" onPose={onPose} nombre format={(v) => eur(v)} /></b></div>
            {c.rendement != null && <div><div className="avis-texte">Rendement brut</div><b style={{ fontSize: "11pt" }}><L avis={avis} k="c_rendement" defaut={pc(c.rendement)} onPose={onPose} /></b></div>}
          </div>
        </Bloc>
        <L avis={avis} k="c_resume" as="p" className="avis-chapeau avis-mt5" onPose={onPose}
          defaut={`La valeur ${avis.type_bien === "murs_commerce" ? "des murs" : "du bien"} est estimée à ${eur(c.valeur)} net vendeur hors droits, dans une fourchette de ${nb(c.bas)} à ${eur(c.haut)}${c.rendement != null ? `, soit un rendement brut de ${pc(c.rendement)} sur le loyer en place` : ""}.`} />
        <L avis={avis} k="titre_cadre" as="h2" className="avis-titre" defaut="Cadre de la mission" onPose={onPose} />
        <Bloc cle="cadre_table" nom="Cadre de la mission">
        <table className="avis-table">
          <tbody>
            <tr><td>Demandeur</td><td><T v={avis.demandeur} chemin="demandeur" onPose={onPose} /></td></tr>
            <tr><td>Objet</td><td><T v={avis.cadre?.objet} chemin="cadre.objet" onPose={onPose} /></td></tr>
            <tr><td>Bien</td><td><T v={avis.cadre?.bien} chemin="cadre.bien" onPose={onPose} /></td></tr>
            <tr><td>Rédigé par</td><td><L avis={avis} k="redige" defaut={redige} onPose={onPose} /></td></tr>
            {/* L'agence et sa carte : les mêmes pour tous les mandataires (src/lib/agence-klocka.json). */}
            <tr><td>Agence</td><td><L avis={avis} k="agence" onPose={onPose}
              defaut={`${AGENCE.denomination}, ${AGENCE.forme} au capital de ${AGENCE.capital}, ${AGENCE.siege}, ${AGENCE.rcs}, représentée par ${AGENCE.representant}.`} /></td></tr>
            <tr><td>Habilitation</td><td><L avis={avis} k="habilitation_agence" onPose={onPose}
              defaut={`${s.qualite ? s.qualite.charAt(0).toUpperCase() + s.qualite.slice(1) : "Agent commercial"} immatriculé(e) au RSAC de ${s.ville_rsac || "[ville]"} sous le n° ${s.rsac || "[à compléter]"}, mandataire de ${AGENCE.denomination}, titulaire de la carte professionnelle ${s.carte_t || AGENCE.carte.numero} délivrée le ${AGENCE.carte.delivree_le} par ${AGENCE.carte.par}.`} /></td></tr>
            <tr><td>Garanties</td><td><L avis={avis} k="garanties" onPose={onPose}
              defaut={`Garantie financière ${AGENCE.garantie.organisme} à hauteur de ${AGENCE.garantie.montant}. Responsabilité civile professionnelle ${AGENCE.rcp.organisme}, ${AGENCE.rcp.adresse}, police n° ${AGENCE.rcp.police}.`} /></td></tr>
            <tr><td>Visite</td><td><T v={avis.cadre?.visite} chemin="cadre.visite" onPose={onPose} /></td></tr>
            <tr><td>Date de l'avis</td><td><T v={avis.date} chemin="date" onPose={onPose} /></td></tr>
          </tbody>
        </table>
        </Bloc>
      </>
    ),
    description: (
      <>
        <L avis={avis} k="titre_description" as="h2" className="avis-titre" defaut="Description du bien" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.description?.resume} chemin="description.resume" onPose={onPose} />
        <Lignes lignes={avis.description?.lignes} base="description.lignes" onPose={onPose} />
        {(avis.description?.surfaces || []).length > 0 && (
          <Bloc cle="surfaces" nom="Surfaces">
            <p className="avis-etiquette" style={{ margin: "8mm 0 3mm" }}>Surfaces{avis.description.surfaces.some((x) => x.coef !== 1) ? " pondérées" : ""}</p>
            <table className="avis-grille">
              <thead><tr><th>Zone</th><th>Surface utile (m²)</th><th>Coefficient</th><th>Surface pondérée (m²P)</th></tr></thead>
              <tbody>
                {avis.description.surfaces.map((x, i) => (
                  <tr key={i}><td><T v={x.zone} chemin={`description.surfaces.${i}.zone`} onPose={onPose} /></td><td><T v={x.utile} chemin={`description.surfaces.${i}.utile`} onPose={onPose} nombre format={(v) => nb(v)} /></td><td><T v={x.coef} chemin={`description.surfaces.${i}.coef`} onPose={onPose} nombre format={(v) => nb(v, 1)} /></td><td><b>{nb(Math.round((x.utile || 0) * (x.coef || 0)))}</b></td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td>{nb(avis.description.surfaces.reduce((t, x) => t + (x.utile || 0), 0))}</td><td /><td className="fort">{nb(avis.description.surfaces.reduce((t, x) => t + Math.round((x.utile || 0) * (x.coef || 0)), 0))}</td></tr></tfoot>
            </table>
            <L avis={avis} k="note_surfaces" as="p" className="avis-texte avis-note" onPose={onPose} defaut="Les coefficients suivent la charte de l'expertise en évaluation immobilière pour les commerces de pied d'immeuble." />
          </Bloc>
        )}
      </>
    ),
    emplacement: (
      <>
        <L avis={avis} k="titre_emplacement" as="h2" className="avis-titre" defaut="Emplacement et commercialité" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.emplacement?.synthese} chemin="emplacement.synthese" onPose={onPose} />
        {mep.photo_emplacement !== false && (
          <Photo avis={avis} cle="emplacement" cap={180} estimationId={estimationId} onAvis={onAvis}
            className="" style={{ position: "relative", height: `${mep.photo_emplacement_mm || 62}mm`, borderRadius: "3mm", backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "var(--ligne)", marginBottom: "4mm" }} />
        )}
        <Lignes lignes={avis.emplacement?.lignes} base="emplacement.lignes" onPose={onPose} />
      </>
    ),
    locatif: avis.locatif ? (
      <>
        <L avis={avis} k="titre_locatif" as="h2" className="avis-titre" defaut="Situation locative" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.locatif.synthese} chemin="locatif.synthese" onPose={onPose} />
        <Lignes lignes={avis.locatif.lignes} base="locatif.lignes" onPose={onPose} />
        <Bloc cle="locatif_colonnes" nom="Solidité et valeur locative" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8mm", marginTop: "6mm" }}>
          <div style={{ borderRight: "1px solid var(--gris)", paddingRight: "6mm" }}>
            <L avis={avis} k="titre_solidite" as="p" className="avis-sous-titre" onPose={onPose} defaut="Solidité du locataire :" />
            <T as="p" className="avis-texte" v={avis.locatif.solidite} chemin="locatif.solidite" onPose={onPose} />
          </div>
          <div>
            <L avis={avis} k="titre_valeur_locative" as="p" className="avis-sous-titre" onPose={onPose} defaut="Valeur locative de marché :" />
            <T as="p" className="avis-texte" v={avis.locatif.valeur_locative} chemin="locatif.valeur_locative" onPose={onPose} />
          </div>
        </Bloc>
      </>
    ) : null,
    juridique: (
      <>
        <L avis={avis} k="titre_juridique" as="h2" className="avis-titre" defaut="Situation juridique et technique" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.juridique?.synthese} chemin="juridique.synthese" onPose={onPose} />
        <Lignes lignes={avis.juridique?.lignes} base="juridique.lignes" onPose={onPose} />
      </>
    ),
    marche: (
      <>
        <L avis={avis} k="titre_marche" as="h2" className="avis-titre" defaut="Analyse de marché" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.marche?.synthese} chemin="marche.synthese" onPose={onPose} />
        {(avis.marche?.references || []).length > 0 && (
          <Bloc cle="references" nom="Ventes comparables">
          <table className="avis-grille">
            <thead><tr><th>Date</th><th>Bien</th><th>Distance</th><th>Surface (m²)</th><th>Prix (€)</th><th>Prix (€/m²)</th></tr></thead>
            <tbody>
              {avis.marche.references.map((r, i) => (
                <tr key={i}>
                  <td><T v={r.date} chemin={`marche.references.${i}.date`} onPose={onPose} /></td>
                  <td><T v={r.bien} chemin={`marche.references.${i}.bien`} onPose={onPose} /></td>
                  <td><T v={r.distance_m} chemin={`marche.references.${i}.distance_m`} onPose={onPose} nombre format={(v) => (v != null ? `${v} m` : "—")} /></td>
                  <td><T v={r.surface} chemin={`marche.references.${i}.surface`} onPose={onPose} nombre format={(v) => nb(v)} /></td>
                  <td><T v={r.prix} chemin={`marche.references.${i}.prix`} onPose={onPose} nombre format={(v) => nb(v)} /></td>
                  <td className="fort"><T v={r.prix_m2} chemin={`marche.references.${i}.prix_m2`} onPose={onPose} nombre format={(v) => nb(v)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </Bloc>
        )}
        {avis.marche?.source && <T as="p" className="avis-texte avis-note" v={avis.marche.source} chemin="marche.source" onPose={onPose} />}
        {avis.marche?.loyers && (
          <L avis={avis} k="loyers_marche" as="p" className="avis-texte avis-mt4" onPose={onPose}
            defaut={`Loyers de marché relevés : ${nb(avis.marche.loyers.basse)} à ${nb(avis.marche.loyers.haute)} € /m²/an${avis.marche.loyers.source ? ` (${avis.marche.loyers.source})` : ""}.`} />
        )}
        <Bloc cle="encadre_marche" nom="Lecture du marché" className="avis-encadre"><T as="div" v={avis.marche?.lecture} chemin="marche.lecture" onPose={onPose} /></Bloc>
      </>
    ),
    methodes: (
      <>
        <L avis={avis} k="titre_methodes" as="h2" className="avis-titre" defaut="Méthodes de valorisation" onPose={onPose} />
        <T as="p" className="avis-chapeau" v={avis.methodes?.synthese} chemin="methodes.synthese" onPose={onPose} />
        {c.capitalisation != null && (
          <>
            <p style={{ fontSize: "11pt", margin: "0 0 2mm" }}><L avis={avis} k="titre_methode_1" defaut="Méthode 1 : capitalisation du revenu" onPose={onPose} /> <span className="avis-pastille">PRINCIPALE</span></p>
            {m.source_taux && <L avis={avis} k="source_taux" as="p" className="avis-texte avis-note" onPose={onPose} defaut={`Taux de rendement : ${m.source_taux}.`} />}
            <T as="p" className="avis-texte" v={m.justification_taux} chemin="methodes.justification_taux" onPose={onPose} />
            <Bloc cle="formule_1" nom="Formule de capitalisation" className="avis-formule">
              <i>V</i> = <span style={{ textAlign: "center", fontSize: "8.5pt" }}><span style={{ display: "block", borderBottom: "1px solid var(--encre)" }}>Loyer annuel HT HC</span>Taux de rendement brut</span>
              = <span style={{ textAlign: "center" }}><span style={{ display: "block", borderBottom: "1px solid var(--encre)" }}><T v={m.loyer} chemin="methodes.loyer" onPose={onPose} nombre format={(v) => nb(v)} /></span><T v={m.taux} chemin="methodes.taux" onPose={onPose} format={(v) => nb(v / 100, 3)} lire={(t) => { const n = nombreDe(t); return n != null && n < 1 ? Math.round(n * 1000) / 10 : n; }} /></span>
              ≈ <span className="resultat"><T v={c.capitalisation} chemin="chiffres.capitalisation" onPose={onPose} nombre format={(v) => eur(v)} /></span>
            </Bloc>
            {c.sensibilite && <L avis={avis} k="c_sensibilite" as="p" className="avis-texte avis-gris" onPose={onPose}
              defaut={`Sensibilité : à ${pc(c.sensibilite.taux_bas)}, la valeur est de ${eur(c.sensibilite.valeur_basse_taux)}. À ${pc(c.sensibilite.taux_haut)}, elle est de ${eur(c.sensibilite.valeur_haute_taux)}.`} />}
          </>
        )}
        {c.comparaison != null && (
          <>
            <p style={{ fontSize: "11pt", margin: "6mm 0 2mm" }}><L avis={avis} k="titre_methode_2" defaut={`Méthode ${c.capitalisation != null ? "2" : "1"} : comparaison`} onPose={onPose} />{c.capitalisation == null && <span className="avis-pastille">PRINCIPALE</span>}</p>
            <T as="p" className="avis-texte" v={m.justification_prix} chemin="methodes.justification_prix" onPose={onPose} />
            <Bloc cle="formule_2" nom="Formule de comparaison" className="avis-formule"><i>V</i> = <T v={m.surface} chemin="methodes.surface" onPose={onPose} nombre format={(v) => nb(v)} /> m² × <T v={m.prix_m2} chemin="methodes.prix_m2" onPose={onPose} nombre format={(v) => nb(v)} /> €/m² = <span className="resultat"><T v={c.comparaison} chemin="chiffres.comparaison" onPose={onPose} nombre format={(v) => eur(v)} /></span></Bloc>
          </>
        )}
        {c.valeur_libre != null && (
          <Bloc cle="valeur_libre" nom="Valeur libre" className="avis-encadre" style={{ display: "flex", gap: "4mm" }}>
            <span className="avis-alerte-rond">!</span>
            <div>
              <b style={{ color: "var(--sauge-fonce)", fontSize: "9pt" }}><L avis={avis} k="titre_valeur_libre" defaut="Valeur en cas de départ du locataire, donnée à titre de mesure du risque." onPose={onPose} /></b>
              <L avis={avis} k="c_valeur_libre" as="p" className="avis-texte avis-encre" onPose={onPose}
                defaut={`En retenant un loyer de marché de ${eur(c.loyer_marche)}, un rendement plus élevé pour un local à relouer, 12 mois de vacance et 15 000 € de remise en état et de franchise, la valeur libre est d'environ ${eur(c.valeur_libre)}. L'écart avec la valeur occupée mesure ce que vaut le bail en place.`} />
            </div>
          </Bloc>
        )}
      </>
    ),
    conclusion: (
      <>
        <p className="avis-etiquette" style={{ margin: "0 0 3mm" }}>Conclusion</p>
        <L avis={avis} k="c_conclusion" as="p" className="avis-chapeau" onPose={onPose}
          defaut={`La valeur vénale ${avis.type_bien === "murs_commerce" ? "des murs" : "du bien"} est estimée à ${eur(c.valeur)} net vendeur hors droits, dans une fourchette de ${nb(c.bas)} à ${eur(c.haut)}.`} />
        <div style={{ fontSize: "44pt", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
          <T v={c.valeur} chemin="chiffres.valeur" onPose={onPose} nombre format={(v) => eur(v)} />
        </div>
        <L avis={avis} k="c_net" as="p" className="avis-texte avis-mt2" onPose={onPose} defaut={`Net vendeur hors droits${c.rendement != null ? ` · rendement brut ${pc(c.rendement)}` : ""}`} />
        <Bloc cle="curseur" nom="Curseur de la fourchette" className="avis-curseur"><span style={{ left: `${position}%` }} /></Bloc>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9pt", color: "var(--gris)" }}>
          <T v={c.bas} chemin="chiffres.bas" onPose={onPose} nombre format={(v) => eur(v)} />
          <b style={{ color: "var(--encre)" }}>{eur(c.valeur)}</b>
          <T v={c.haut} chemin="chiffres.haut" onPose={onPose} nombre format={(v) => eur(v)} />
        </div>
        <Bloc cle="grille_prix" nom="Prix affiché et coût total">
        <table className="avis-grille" style={{ marginTop: "6mm" }}>
          <tbody>
            <tr><td style={{ textAlign: "left" }}>Prix affiché honoraires inclus (<T v={c.honoraires_pct} chemin="chiffres.honoraires_pct" onPose={onPose} nombre format={(v) => nb(v, v % 1 ? 1 : 0)} /> % TTC à la charge de l'acquéreur)</td><td><b><L avis={avis} k="c_prix_affiche" defaut={eur(c.prix_affiche)} onPose={onPose} /></b></td><td>{c.rendement_affiche != null && <L avis={avis} k="c_rendement_affiche" defaut={pc(c.rendement_affiche)} onPose={onPose} />}</td></tr>
            <tr><td style={{ textAlign: "left" }}><L avis={avis} k="c_cout_libelle" defaut={`Coût total pour l'acquéreur, frais d'acquisition d'environ ${nb(c.frais_pct, 1)} % inclus`} onPose={onPose} /></td><td><b><L avis={avis} k="c_cout_total" defaut={`environ ${eur(c.cout_total)}`} onPose={onPose} /></b></td><td>{c.rendement_total != null && <L avis={avis} k="c_rendement_total" defaut={pc(c.rendement_total)} onPose={onPose} />}</td></tr>
          </tbody>
        </table>
        </Bloc>
        {(avis.conclusion?.points || []).length > 0 && (
          <Bloc cle="points" nom="Points à traiter" className="avis-encadre" style={{ display: "flex", gap: "4mm" }}>
            <span className="avis-alerte-rond">!</span>
            <div style={{ flex: 1 }}>
              <b style={{ color: "var(--sauge-fonce)", fontSize: "9.5pt" }}><L avis={avis} k="titre_points" defaut="Points à traiter avant la mise en vente :" onPose={onPose} /></b>
              <ul className="avis-cases" style={{ margin: "2mm 0 0", padding: 0, fontSize: "9.5pt" }}>
                {avis.conclusion.points.map((x, i) => <li key={i}><T v={x} chemin={`conclusion.points.${i}`} onPose={onPose} /></li>)}
              </ul>
            </div>
          </Bloc>
        )}
        <p className="avis-etiquette" style={{ margin: "7mm 0 2mm" }}>Réserves</p>
        <T as="p" className="avis-texte" v={avis.conclusion?.reserves} chemin="conclusion.reserves" onPose={onPose} />
        <Bloc cle="mentions" nom="Mentions légales">
          <L avis={avis} k="mentions_legales" as="p" className="avis-texte avis-mentions" onPose={onPose}
            defaut={`${AGENCE.denomination}, ${AGENCE.forme} au capital de ${AGENCE.capital}, siège ${AGENCE.siege}, ${AGENCE.rcs}. Carte professionnelle ${AGENCE.carte.numero} délivrée le ${AGENCE.carte.delivree_le} par ${AGENCE.carte.par}. Garantie financière ${AGENCE.garantie.organisme} de ${AGENCE.garantie.montant}. RCP ${AGENCE.rcp.organisme}, police n° ${AGENCE.rcp.police}. Contact : ${AGENCE.email}.`} />
        </Bloc>
        <Bloc cle="signature" nom="Signature" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "6mm" }}>
          <div style={{ fontSize: "9.5pt" }}>
            <p style={{ margin: 0 }}>Fait à <T v={avis.conclusion?.fait_a} chemin="conclusion.fait_a" onPose={onPose} />, le <T v={avis.date} chemin="date" onPose={onPose} />.</p>
            <b><L avis={avis} k="signature_nom" defaut={s.nom || "[à compléter]"} onPose={onPose} /></b>
          </div>
          <div>
            <p className="avis-texte" style={{ margin: "0 0 1.5mm" }}>Signature</p>
            <div className="avis-signature">{s.signature && <img src={s.signature} alt="Signature" />}</div>
          </div>
        </Bloc>
      </>
    ),
  };

  return (
    <div className="avis">
      {/* Couverture */}
      <section className="avis-page avis-couverture" data-section="couverture" id="avis-page-couverture">
        <PageCtx.Provider value="couverture">
        <Photo avis={avis} cle="couverture" className="avis-couverture-photo" estimationId={estimationId} onAvis={onAvis} />
        <Bloc cle="couverture_texte" nom="Texte de couverture" className="avis-couverture-texte">
          <p className="avis-etiquette" style={{ margin: 0 }}>Avis de valeur · <T v={avis.type_libelle} chemin="type_libelle" onPose={onPose} /></p>
          <h1><T v={avis.bien.rue} chemin="bien.rue" onPose={onPose} /></h1>
          <p className="ville" style={{ margin: 0 }}><T v={avis.bien.ville} chemin="bien.ville" onPose={onPose} /></p>
          <Bloc cle="logo" nom="Logo" className="avis-logo-bloc"><Logo /></Bloc>
        </Bloc>
        <Bloc cle="bande" nom="Bandeau de couverture" className="avis-couverture-bande">
          <div>
            <p className="mot">Demandeur</p>
            <p className="val"><T v={avis.demandeur} chemin="demandeur" onPose={onPose} /></p>
            <p className="mot" style={{ marginTop: "5mm" }}>Rédigé par</p>
            <p className="val"><L avis={avis} k="redige" defaut={redige} onPose={onPose} /></p>
          </div>
          <div>
            <p className="mot">Date de l'avis</p>
            <p className="val"><T v={avis.date} chemin="date" onPose={onPose} /></p>
          </div>
          <div />
        </Bloc>
        {/* Le portrait du mandataire : sous le logo, à cheval entre la page et le bandeau. */}
        {(avis.photos?.portrait || s.photo) && (
          <Photo avis={avis} cle="portrait" className="avis-portrait-couverture" estimationId={estimationId} onAvis={onAvis} />
        )}
        </PageCtx.Provider>
      </section>
      {sections.map((cle) => (
        <Page key={cle} cle={cle} num={num(cle)} avis={avis} numero={page(cle)}>{contenu[cle]}</Page>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'atelier : le chat de retouche, le plan, les versions.
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  "Raccourcis la synthèse de l'emplacement",
  "Rends la conclusion plus vendeuse",
  "Mets la valeur en menthe et plus grande",
  "Enlève la ligne taxe foncière de la situation locative",
  "Mets la photo de l'emplacement plus grande",
  "Déplace l'analyse de marché avant les méthodes",
  "Masque la page juridique",
];

/**
 * Le cadre autour de l'élément sélectionné, et sa poignée : on la glisse,
 * l'élément suit (en millimètres, quel que soit le zoom). Il vit hors du
 * document zoomé, dans la toile, et suit le défilement.
 */
function CadreSelection({ selection, toile, zoom, positions, onBrouillon, onFin }) {
  const [rect, setRect] = useState(null);
  const debut = useRef(null);
  const mesurer = () => {
    const el = selection?.el;
    const t = toile.current;
    if (!el || !t || !el.isConnected) { if (rect) setRect(null); return; }
    const r = el.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const suivant = { left: Math.round(r.left - tr.left + t.scrollLeft), top: Math.round(r.top - tr.top + t.scrollTop), width: Math.round(r.width), height: Math.round(r.height) };
    if (!rect || Object.keys(suivant).some((k) => suivant[k] !== rect[k])) setRect(suivant);
  };
  useLayoutEffect(mesurer);
  useEffect(() => {
    const t = toile.current;
    window.addEventListener("resize", mesurer);
    t?.addEventListener("scroll", mesurer);
    return () => { window.removeEventListener("resize", mesurer); t?.removeEventListener("scroll", mesurer); };
  });
  if (!rect || !selection?.clePos) return null;
  const commencer = (e) => {
    e.preventDefault(); e.stopPropagation();
    debut.current = { x: e.clientX, y: e.clientY, base: positions[selection.clePos] || { x: 0, y: 0 } };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const bouger = (e) => {
    if (!debut.current) return;
    const dx = (e.clientX - debut.current.x) / zoom / MM;
    const dy = (e.clientY - debut.current.y) / zoom / MM;
    onBrouillon({ ...positions, [selection.clePos]: { x: Math.round((debut.current.base.x + dx) * 2) / 2, y: Math.round((debut.current.base.y + dy) * 2) / 2 } });
  };
  const finir = () => { if (!debut.current) return; debut.current = null; onFin(); };
  return (
    <div className="avis-ecran avis-cadre" style={{ left: rect.left - 3, top: rect.top - 3, width: rect.width + 6, height: rect.height + 6 }}>
      <button type="button" className="avis-poignee" title="Glisser pour déplacer · flèches du clavier (⇧ : 5 mm)" aria-label="Déplacer l'élément"
        onPointerDown={commencer} onPointerMove={bouger} onPointerUp={finir} onPointerCancel={finir} onClick={(e) => e.stopPropagation()}>
        <Move />
      </button>
    </div>
  );
}

/** Des pastilles de couleur : la palette du document, « aucune », et une couleur libre. */
function Pastilles({ valeur, onChoisir, aucune = false }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {aucune && (
        <button type="button" onClick={() => onChoisir(null)} title="Aucune" aria-label="Aucune" aria-pressed={!valeur}
          className={`grid h-5 w-5 flex-none place-items-center rounded-full border text-[10px] text-ardoise ${!valeur ? "border-menthe ring-2 ring-menthe/40" : "border-trait"}`} style={{ background: "transparent" }}>×</button>
      )}
      {PALETTE.map(([k, nom, css]) => (
        <button key={k} type="button" onClick={() => onChoisir(valeur === k ? null : k)} title={nom} aria-label={nom} aria-pressed={valeur === k}
          className={`h-5 w-5 flex-none rounded-full border ${valeur === k ? "border-menthe ring-2 ring-menthe/40" : "border-trait"}`} style={{ background: css }} />
      ))}
      <label className="relative grid h-5 w-5 flex-none cursor-pointer place-items-center rounded-full border border-trait text-[10px] text-ardoise" title="Autre couleur" style={{ background: /^#/.test(valeur || "") ? valeur : "transparent" }}>
        {!/^#/.test(valeur || "") && "+"}
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Autre couleur" onChange={(e) => onChoisir(e.target.value)} />
      </label>
    </div>
  );
}

/** Un curseur avec sa valeur : interligne, opacité, arrondi… */
function Curseur({ libelle, valeur, defaut, min, max, pas, unite = "", onChoisir }) {
  const v = valeur ?? defaut;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[72px] flex-none text-[12px] text-ardoise">{libelle}</span>
      <input type="range" min={min} max={max} step={pas} value={v} onChange={(e) => onChoisir(Number(e.target.value))} aria-label={libelle} className="min-w-0 flex-1 accent-[var(--k-menthe)]" />
      <span className="w-12 flex-none text-right text-[11.5px] tabular-nums text-brume">{Number(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}{unite}</span>
    </div>
  );
}

const Groupe = ({ titre, children }) => (
  <div className="mt-3 first:mt-0">
    <p className="m-0 mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-brume">{titre}</p>
    <div className="space-y-2">{children}</div>
  </div>
);

/** Le menu de mise en forme de l'élément sélectionné : texte, bloc, position. */
function Styles({ selection, avis, onStyle, onPosition, onFermer }) {
  const chemin = selection?.chemin;
  if (!chemin || chemin.startsWith("section.")) return null;
  const st = avis.styles?.[chemin] || {};
  const bloc = chemin.startsWith("bloc.");
  const photo = chemin.startsWith("bloc.photo.");
  const pos = selection.clePos ? avis.positions?.[selection.clePos] : null;
  const taille = st.taille ?? selection.taille ?? null;
  const poser = (patch) => onStyle(chemin, patch);
  const poserTaille = (t) => { if (t >= 5 && t <= 80) poser({ taille: Math.round(t * 2) / 2 }); };
  const Bascule = ({ k, Icone, titre }) => (
    <button type="button" onClick={() => poser({ [k]: !st[k] })} aria-pressed={!!st[k]} title={titre} aria-label={titre}
      className={`grid h-7 w-7 place-items-center rounded-[8px] ${st[k] ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={st[k] ? undefined : { background: "transparent" }}>
      <Icone className="h-3.5 w-3.5" />
    </button>
  );
  const Choix = ({ k, valeurs, defaut }) => (
    <div className="flex flex-wrap gap-1">
      {valeurs.map(([v, mot]) => {
        const actif = (st[k] ?? defaut) === v;
        return (
          <button key={v} type="button" onClick={() => poser({ [k]: v === defaut ? null : v })} aria-pressed={actif}
            className={`rounded-[8px] px-2 py-1 text-[12px] ${actif ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={actif ? undefined : { background: "transparent" }}>{mot}</button>
        );
      })}
    </div>
  );
  return (
    <div className="avis-styles avis-ecran absolute right-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-[272px] flex-col rounded-[14px] border border-trait bg-rail shadow-[0_18px_40px_rgb(0_0_0/0.22)] max-md:right-2 max-md:top-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-none items-center gap-2 border-b border-trait px-3 py-2.5">
        <p className="m-0 min-w-0 flex-1 truncate text-[12px] text-craie" title={libelleChemin(chemin)}>{libelleChemin(chemin)}</p>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-6 w-6 flex-none place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <Groupe titre="Texte">
          <div className="flex items-center gap-1">
            <span className="w-[72px] flex-none text-[12px] text-ardoise">Taille</span>
            <button type="button" onClick={() => poserTaille((taille ?? 10) - 1)} aria-label="Plus petit" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Minus className="h-3.5 w-3.5" /></button>
            <input type="number" step="0.5" min="5" max="80" value={taille != null ? Math.round(taille * 2) / 2 : ""} onChange={(e) => poserTaille(Number(e.target.value))} aria-label="Taille en points"
              className="h-7 w-14 rounded-[8px] border border-trait bg-surface px-1.5 text-center text-[12.5px] tabular-nums text-encre outline-none focus:border-menthe" />
            <span className="text-[11.5px] text-brume">pt</span>
            <button type="button" onClick={() => poserTaille((taille ?? 10) + 1)} aria-label="Plus grand" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><Plus className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-[72px] flex-none text-[12px] text-ardoise">Police</span>
            <Choix k="police" defaut="modele" valeurs={[["modele", "Modèle"], ["serif", "Serif"], ["sans", "Sans"], ["mono", "Mono"]]} />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-[72px] flex-none text-[12px] text-ardoise">Style</span>
            <Bascule k="gras" Icone={Bold} titre="Gras" />
            <Bascule k="italique" Icone={Italic} titre="Italique" />
            <Bascule k="souligne" Icone={Underline} titre="Souligné" />
            <Bascule k="barre" Icone={Strikethrough} titre="Barré" />
            <Bascule k="majuscules" Icone={CaseUpper} titre="Majuscules" />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-[72px] flex-none text-[12px] text-ardoise">Aligner</span>
            {[["left", AlignLeft, "À gauche"], ["center", AlignCenter, "Centré"], ["right", AlignRight, "À droite"]].map(([v, Icone, titre]) => (
              <button key={v} type="button" onClick={() => poser({ aligner: st.aligner === v ? null : v })} aria-pressed={st.aligner === v} title={titre} aria-label={titre}
                className={`grid h-7 w-7 place-items-center rounded-[8px] ${st.aligner === v ? "bg-encre/[0.1] text-encre" : "text-ardoise hover:text-encre"}`} style={st.aligner === v ? undefined : { background: "transparent" }}>
                <Icone className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <div className="flex items-start gap-1"><span className="w-[72px] flex-none pt-0.5 text-[12px] text-ardoise">Couleur</span><Pastilles valeur={st.couleur} onChoisir={(c) => poser({ couleur: c })} /></div>
          {!bloc && <div className="flex items-start gap-1"><span className="w-[72px] flex-none pt-0.5 text-[12px] text-ardoise">Surlignage</span><Pastilles valeur={st.surlignage} aucune onChoisir={(c) => poser({ surlignage: c })} /></div>}
          <Curseur libelle="Interligne" valeur={st.interligne} defaut={1.5} min={0.8} max={2.4} pas={0.05} onChoisir={(v) => poser({ interligne: v })} />
          <Curseur libelle="Espacement" valeur={st.espacement} defaut={0} min={-0.05} max={0.3} pas={0.01} unite=" em" onChoisir={(v) => poser({ espacement: v })} />
          <Curseur libelle="Opacité" valeur={st.opacite} defaut={100} min={5} max={100} pas={1} unite=" %" onChoisir={(v) => poser({ opacite: v === 100 ? null : v })} />
        </Groupe>
        {bloc && (
          <Groupe titre={photo ? "Photo" : "Bloc"}>
            <div className="flex items-start gap-1"><span className="w-[72px] flex-none pt-0.5 text-[12px] text-ardoise">Fond</span><Pastilles valeur={st.fond} aucune onChoisir={(c) => poser({ fond: c })} /></div>
            <div className="flex items-center gap-1">
              <span className="w-[72px] flex-none text-[12px] text-ardoise">Bordure</span>
              <Choix k="bordure" defaut="aucune" valeurs={[["aucune", "Aucune"], ["fine", "Fine"], ["epaisse", "Épaisse"]]} />
            </div>
            {st.bordure && <div className="flex items-start gap-1"><span className="w-[72px] flex-none pt-0.5 text-[12px] text-ardoise">Trait</span><Pastilles valeur={st.bordure_couleur || "encre"} onChoisir={(c) => poser({ bordure_couleur: c })} /></div>}
            <Curseur libelle="Arrondi" valeur={st.arrondi} defaut={0} min={0} max={20} pas={0.5} unite=" mm" onChoisir={(v) => poser({ arrondi: v || null })} />
            <Curseur libelle="Marge int." valeur={st.marge} defaut={0} min={0} max={30} pas={0.5} unite=" mm" onChoisir={(v) => poser({ marge: v || null })} />
            <Curseur libelle="Largeur" valeur={st.largeur} defaut={100} min={10} max={100} pas={1} unite=" %" onChoisir={(v) => poser({ largeur: v === 100 ? null : v })} />
            <Curseur libelle="Hauteur" valeur={st.hauteur_mm} defaut={photo ? (chemin.endsWith("couverture") ? 148 : avis.mise_en_page?.photo_emplacement_mm || 62) : 40} min={5} max={280} pas={1} unite=" mm" onChoisir={(v) => poser({ hauteur_mm: v })} />
            <div className="flex items-center gap-1">
              <span className="w-[72px] flex-none text-[12px] text-ardoise">Ombre</span>
              <Choix k="ombre" defaut={false} valeurs={[[false, "Sans"], [true, "Avec"]]} />
            </div>
          </Groupe>
        )}
        <Groupe titre="Position">
          <Curseur libelle="Rotation" valeur={st.rotation} defaut={0} min={-30} max={30} pas={1} unite="°" onChoisir={(v) => poser({ rotation: v || null })} />
          <div className="flex items-center gap-2">
            <span className="w-[72px] flex-none text-[12px] text-ardoise">Décalage</span>
            {[["x", "→"], ["y", "↓"]].map(([k, fleche]) => (
              <label key={k} className="flex items-center gap-1 text-[11.5px] text-brume">{fleche}
                <input type="number" step="0.5" value={pos?.[k] ?? 0} aria-label={k === "x" ? "Décalage horizontal" : "Décalage vertical"}
                  onChange={(e) => onPosition(selection.clePos, { x: pos?.x || 0, y: pos?.y || 0, [k]: Number(e.target.value) || 0 })}
                  className="h-7 w-16 rounded-[8px] border border-trait bg-surface px-1.5 text-center text-[12px] tabular-nums text-encre outline-none focus:border-menthe" />
                mm
              </label>
            ))}
          </div>
          <p className="m-0 text-[11.5px] leading-[1.5] text-brume">Glissez la poignée du cadre, ou les flèches du clavier (⇧ : 5 mm).</p>
        </Groupe>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-trait pt-3">
          <button type="button" onClick={() => poser({ masque: true })} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <EyeOff className="h-3 w-3" /> Masquer l'élément
          </button>
          {Object.keys(st).length > 0 && (
            <button type="button" onClick={() => onStyle(chemin, null)} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <RotateCcw className="h-3 w-3" /> Revenir au modèle
            </button>
          )}
          {pos && (
            <button type="button" onClick={() => onPosition(selection.clePos, null)} className="inline-flex items-center gap-1.5 text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <Move className="h-3 w-3" /> Remettre en place
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Retouches({ estimation, avis, selection, onSelection, onAvis }) {
  const [fil, setFil] = useState([]);
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  // Une image jointe par le « + » (ou déposée) : elle remplace une photo de l'avis.
  const [image, setImage] = useState(null);
  const entree = useRef(null);
  const bas = useRef(null);
  const queryClient = useQueryClient();
  useEffect(() => { bas.current?.scrollIntoView({ block: "end" }); }, [fil, enCours]);
  useEffect(() => () => { if (image?.apercu) URL.revokeObjectURL(image.apercu); }, [image]);
  const joindre = (f) => {
    if (!f) return;
    if (!/^image\//.test(f.type || "")) return toast.error("Joignez une image (photo, JPEG, PNG).");
    setImage({ fichier: f, apercu: URL.createObjectURL(f), nom: f.name });
  };
  const photoChoisie = selection?.chemin?.startsWith("bloc.photo.") ? selection.chemin.slice(11) : null;

  const envoyer = async (t) => {
    const demande = String(t || "").trim();
    if ((!demande && !image) || enCours) return;
    const jointe = image;
    setTexte(""); setImage(null);
    setFil((f) => [...f, { role: "user", contenu: demande || `Image jointe : ${jointe.nom}`, image: jointe?.apercu || null, selection: selection?.chemin ? libelleChemin(selection.chemin) : null }]);
    setEnCours(true);
    try {
      const sel = selection?.chemin ? { chemin: selection.chemin, texte: selection.texte } : null;
      const historique = fil.slice(-8).map(({ role, contenu }) => ({ role, contenu }));
      let r;
      if (jointe) {
        const form = new FormData();
        form.append("fichier", jointe.fichier);
        form.append("instruction", demande);
        form.append("selection", JSON.stringify(sel));
        form.append("historique", JSON.stringify(historique));
        r = await base44.request("POST", `/api/mandataire/estimations/${estimation.id}/avis/retoucher`, { body: form, isForm: true });
      } else {
        r = await base44.request("POST", `/api/mandataire/estimations/${estimation.id}/avis/retoucher`, {
          body: { instruction: demande, selection: sel, historique },
        });
      }
      const faits = (r.faits || []).filter((f) => !f.refus);
      setFil((f) => [...f, { role: "assistant", contenu: r.reponse || (faits.length ? "C'est fait." : "Rien à changer."), faits: faits.length }]);
      if (faits.length && (r.avis || r.estimation?.avis)) {
        onAvis(r.avis || r.estimation.avis);
        queryClient.invalidateQueries({ queryKey: ["avis-versions", estimation.id] });
      }
    } catch (e) {
      setFil((f) => [...f, { role: "assistant", contenu: e?.message || "La retouche a échoué.", erreur: true }]);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="flex h-full flex-col"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { const f = e.dataTransfer?.files?.[0]; if (f) { e.preventDefault(); joindre(f); } }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!fil.length && (
          <div className="space-y-2">
            <p className="m-0 text-[13px] leading-[1.55] text-ardoise">Dites ce que vous voulez changer. Cliquez d'abord un texte, une photo ou une page pour que « ça » le désigne. Le « + » joint une image qui remplace une photo.</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {SUGGESTIONS.map((x) => (
                <button key={x} type="button" onClick={() => envoyer(x)}
                  className="rounded-full border border-trait px-3 py-1.5 text-left text-[12.5px] text-craie transition-colors hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>{x}</button>
              ))}
            </div>
          </div>
        )}
        <div className="space-y-4">
          {fil.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[88%] rounded-[16px] rounded-br-[5px] px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-encre" style={{ background: "rgb(var(--k-encre-rgb) / 0.07)" }}>
                {m.selection && <span className="mb-1 block text-[11px] text-menthe">{m.selection}</span>}
                {m.image && <img src={m.image} alt="" className="mb-1.5 block max-h-[120px] rounded-[10px] object-cover" />}
                {m.contenu}
              </div>
            </div>
          ) : (
            <div key={i} className={`text-[13.5px] leading-[1.55] ${m.erreur ? "text-alerte" : "text-craie"}`}>
              {m.faits > 0 && <span className="mr-1.5 inline-flex items-center gap-1 text-[11.5px] text-menthe"><Check className="h-3 w-3" />{m.faits} retouche{m.faits > 1 ? "s" : ""}</span>}
              {m.contenu}
            </div>
          ))}
          {enCours && <div className="flex items-center gap-2 text-[13px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> Je retouche…</div>}
        </div>
        <div ref={bas} />
      </div>
      <form className="border-t border-trait px-3 py-3" onSubmit={(e) => { e.preventDefault(); envoyer(texte); }}>
        {selection?.chemin && (
          <div className="mb-2 flex items-center gap-1.5 text-[12px] text-menthe">
            <span className="truncate">Sélection : {libelleChemin(selection.chemin)}</span>
            <button type="button" onClick={() => onSelection(null)} aria-label="Désélectionner" className="grid h-5 w-5 flex-none place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
          </div>
        )}
        {image && (
          <div className="mb-2 flex items-center gap-2 rounded-[12px] border border-trait px-2 py-1.5">
            <img src={image.apercu} alt="" className="h-9 w-9 flex-none rounded-[8px] object-cover" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-craie">{image.nom}</span>
            <span className="flex-none text-[11.5px] text-brume">{photoChoisie ? `→ photo ${photoChoisie === "emplacement" ? "de l'emplacement" : "de couverture"}` : "dites où la mettre"}</span>
            <button type="button" onClick={() => setImage(null)} aria-label="Retirer l'image" className="grid h-6 w-6 flex-none place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-[14px] border border-trait bg-surface px-2 py-2 focus-within:border-menthe">
          <input ref={entree} type="file" accept="image/*" hidden onChange={(e) => { joindre(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => entree.current?.click()} title="Joindre une image (remplace une photo de l'avis)" aria-label="Joindre une image"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            {image ? <ImagePlus className="h-4 w-4 text-menthe" /> : <Plus className="h-4 w-4" />}
          </button>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2}
            placeholder={image ? (photoChoisie ? "Envoyez, ou précisez" : "En couverture, ou à l'emplacement ?") : selection?.chemin ? "Que changer sur la sélection ?" : "Modifie, déplace, reformule, enlève…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); envoyer(texte); } }}
            className="w-full resize-none border-none bg-transparent text-[13.5px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          <button type="submit" disabled={(!texte.trim() && !image) || enCours} aria-label="Envoyer" className="grid h-8 w-8 flex-none place-items-center rounded-full bg-menthe text-sur-menthe disabled:opacity-40">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Plan({ avis, onPose, onSelection, onStyle }) {
  const masques = Object.entries(avis.styles || {}).filter(([, st]) => st?.masque).map(([chemin]) => chemin);
  const masquees = new Set(avis.masquees || []);
  const ordre = [...new Set([...(avis.ordre || []), ...SECTIONS])].filter((x) => SECTIONS.includes(x) && (x !== "locatif" || avis.locatif));
  const [glisse, setGlisse] = useState(null);
  const deposer = (vers) => {
    if (glisse == null || glisse === vers) return setGlisse(null);
    const copie = [...ordre];
    const [x] = copie.splice(glisse, 1);
    copie.splice(vers, 0, x);
    setGlisse(null);
    onPose("ordre", copie);
  };
  const basculer = (cle) => {
    if (cle === "conclusion") return toast.error("La conclusion reste.");
    const m = new Set(masquees);
    if (m.has(cle)) m.delete(cle); else m.add(cle);
    onPose("masquees", [...m]);
  };
  const aller = (cle) => {
    document.getElementById(`avis-page-${cle}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    onSelection({ chemin: `section.${cle}`, texte: LABELS[cle] });
  };
  return (
    <div className="px-3 py-3">
      <p className="m-0 px-1 pb-2 text-[12.5px] text-ardoise">Glissez pour réordonner les pages, l'œil les masque.</p>
      <button type="button" onClick={() => document.getElementById("avis-page-couverture")?.scrollIntoView({ behavior: "smooth" })}
        className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-left text-[13.5px] text-craie hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
        <span className="w-4" /> Couverture
      </button>
      {ordre.map((cle, i) => {
        const cachee = masquees.has(cle);
        return (
          <div key={cle} draggable className={`flex items-center gap-2 rounded-[10px] px-2 py-2 text-[13.5px] ${glisse === i ? "opacity-40" : ""} ${cachee ? "text-brume" : "text-encre"} hover:bg-encre/[0.05]`}
            onDragStart={(e) => { setGlisse(i); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => { e.preventDefault(); deposer(i); }}
            onDragEnd={() => setGlisse(null)}>
            <GripVertical className="h-4 w-4 flex-none cursor-grab text-brume" />
            <button type="button" onClick={() => aller(cle)} className="min-w-0 flex-1 truncate text-left" style={{ background: "transparent", color: "inherit" }}>{LABELS[cle]}</button>
            <button type="button" onClick={() => basculer(cle)} aria-label={cachee ? "Afficher la page" : "Masquer la page"} title={cachee ? "Afficher" : "Masquer"}
              className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              {cachee ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        );
      })}
      {masques.length > 0 && (
        <div className="mt-4 border-t border-trait pt-3">
          <p className="m-0 px-1 pb-1.5 text-[12.5px] text-ardoise">Éléments masqués</p>
          {masques.map((chemin) => (
            <div key={chemin} className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px] text-brume hover:bg-encre/[0.05]">
              <span className="min-w-0 flex-1 truncate">{libelleChemin(chemin)}</span>
              <button type="button" onClick={() => onStyle(chemin, { masque: null })} aria-label="Afficher" title="Afficher"
                className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><Eye className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Versions({ estimation, onAvis }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["avis-versions", estimation.id], queryFn: () => base44.request("GET", `/api/mandataire/estimations/${estimation.id}/avis/versions`) });
  const [enCours, setEnCours] = useState(null);
  const restaurer = async (v) => {
    if (!window.confirm("Revenir à cette version ? L'avis actuel sera gardé dans les versions.")) return;
    setEnCours(v.id);
    try {
      const r = await base44.request("POST", `/api/mandataire/estimations/${estimation.id}/avis/versions/${v.id}/restaurer`);
      onAvis(r.estimation.avis);
      queryClient.invalidateQueries({ queryKey: ["avis-versions", estimation.id] });
      toast.success("Version restaurée");
    } catch (e) { toast.error(e?.message || "Impossible"); } finally { setEnCours(null); }
  };
  const versions = data?.versions || [];
  return (
    <div className="px-3 py-3">
      {isLoading ? <p className="m-0 px-1 text-[13px] text-brume">Lecture…</p>
        : !versions.length ? <p className="m-0 px-1 text-[13px] leading-[1.5] text-ardoise">Aucune version encore : chaque retouche par le chat en garde une.</p>
        : versions.map((v) => (
          <div key={v.id} className="flex items-center gap-2 border-t border-trait px-1 py-2.5 first:border-t-0">
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[13px] text-encre">{v.motif || "Version"}</p>
              <p className="m-0 text-[11.5px] text-brume">{new Date(v.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <button type="button" onClick={() => restaurer(v)} disabled={enCours === v.id}
              className="flex-none rounded-full border border-trait px-2.5 py-1 text-[12px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {enCours === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revenir"}
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * Le nom de l'avis, en haut de l'éditeur : un clic, on l'écrit, il s'enregistre
 * seul (Entrée ou clic ailleurs) ; Échap annule. Le chat ne le réécrit plus.
 */
function NomAvis({ estimation }) {
  const queryClient = useQueryClient();
  const [nom, setNom] = useState(estimation.bien || "");
  const [edition, setEdition] = useState(false);
  const [etat, setEtat] = useState(null);
  useEffect(() => { if (!edition) setNom(estimation.bien || ""); }, [estimation.bien, edition]);
  const enregistrer = async () => {
    setEdition(false);
    const propre = nom.replace(/\s+/g, " ").trim();
    if (!propre || propre === estimation.bien) { setNom(estimation.bien || ""); return; }
    setEtat("envoi");
    try {
      await base44.request("PATCH", `/api/mandataire/estimations/${estimation.id}`, { body: { bien: propre } });
      setEtat(null);
      queryClient.invalidateQueries({ queryKey: ["m-estimations"] });
      queryClient.invalidateQueries({ queryKey: ["m-apercu"] });
    } catch (e) {
      setEtat(null);
      setNom(estimation.bien || "");
      toast.error(e?.message || "Renommage impossible");
    }
  };
  if (edition) {
    return (
      <input autoFocus value={nom} maxLength={160} aria-label="Nom de l'avis" onChange={(e) => setNom(e.target.value)} onBlur={enregistrer}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setNom(estimation.bien || ""); setEdition(false); } }}
        className="w-full max-w-[460px] rounded-champ border border-menthe bg-surface px-3 py-1 text-center text-[14px] text-encre outline-none" />
    );
  }
  return (
    <button type="button" onClick={() => setEdition(true)} title="Renommer l'avis"
      className="group inline-flex min-w-0 items-center gap-1.5 truncate text-[14px] text-encre" style={{ background: "transparent" }}>
      <span className="truncate">{nom || "Avis de valeur"}</span>
      {etat === "envoi" ? <Loader2 className="h-3 w-3 flex-none animate-spin text-brume" /> : <Pencil className="h-3 w-3 flex-none text-brume opacity-0 transition-opacity group-hover:opacity-100" />}
    </button>
  );
}

const PAGE_PX = 794; // 210 mm à 96 dpi

export default function EditeurAvis({ estimation, onRetour, libelleRetour = "Estimations", integre = false, provisoire = false, onSelection = null, selectionExterne, statut = null }) {
  const [avis, setAvis] = useState(estimation.avis);
  const [etat, setEtat] = useState("enregistre"); // enregistre | modifie | envoi
  const [selection, setSelection] = useState(null);
  // À côté du chat : la sélection part au chat (« ça » la désigne), et le chat peut la défaire.
  useEffect(() => { onSelection?.(selection?.chemin ? { chemin: selection.chemin, texte: selection.texte || null, libelle: libelleChemin(selection.chemin) } : null); }, [selection?.chemin]);
  useEffect(() => { if (selectionExterne === null) setSelection(null); }, [selectionExterne]);
  // Pendant un glisser, les positions en cours ; posées à la fin.
  const [positionsVives, setPositionsVives] = useState(null);
  // À côté du chat, c'est lui qui retouche : l'atelier se réduit au plan et aux versions.
  const [onglet, setOnglet] = useState(integre ? "plan" : "retouches");
  // À côté du chat de l'estimation, l'atelier reste fermé : le chat de gauche fait les questions.
  const [panneau, setPanneau] = useState(!integre);
  const [zoom, setZoom] = useState(1);
  const minuterie = useRef(null);
  const passe = useRef([]);
  const futur = useRef([]);
  const [, forcer] = useState(0);
  const versionPosee = useRef(false);
  const toile = useRef(null);
  // Un autre avis, ou le même rédigé de nouveau par le chat : on repart de lui.
  // En questions (provisoire), l'avis se reconstruit à chaque réponse du chat : on suit.
  // Avant la rédaction, les retouches vont dans la surcouche, chemin par chemin ;
  // l'éditeur en tient l'état entier, pour que l'annulation puisse en retirer une.
  const cheminsPoses = useRef(estimation.surcouche?.chemins || {});
  // Les retouches demandées au chat avant la rédaction : l'annulation en retire.
  const opsPoses = useRef(estimation.surcouche?.operations || []);
  const avisRef = useRef(estimation.avis);
  avisRef.current = avis;
  const idVu = useRef(estimation.id);
  useEffect(() => {
    // Le même avis, changé par le chat : son état d'avant reste à portée des flèches.
    const memeAvis = idVu.current === estimation.id && avisRef.current;
    if (memeAvis && JSON.stringify(avisRef.current) !== JSON.stringify(estimation.avis)) {
      passe.current = [...passe.current.slice(-60), { avis: avisRef.current, chemins: cheminsPoses.current, ops: opsPoses.current }];
      futur.current = [];
    } else if (!memeAvis) {
      passe.current = []; futur.current = []; versionPosee.current = false;
    }
    idVu.current = estimation.id;
    setAvis(estimation.avis);
    cheminsPoses.current = estimation.surcouche?.chemins || {};
    opsPoses.current = estimation.surcouche?.operations || [];
    forcer((n) => n + 1);
  }, [estimation.id, estimation.prete_le, estimation.avis_retouche_le, provisoire ? estimation.avis : null]);

  const enregistrer = (suivant) => {
    setEtat("modifie");
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(async () => {
      setEtat("envoi");
      try {
        if (provisoire) {
          await base44.request("PUT", `/api/mandataire/estimations/${estimation.id}/surcouche`, { body: { remplacer: true, chemins: cheminsPoses.current, operations: opsPoses.current, styles: suivant.styles || {}, positions: suivant.positions || {} } });
        } else {
          await base44.request("PUT", `/api/mandataire/estimations/${estimation.id}/avis`, { body: { avis: suivant } });
        }
        setEtat("enregistre");
      } catch (e) {
        setEtat("modifie");
        toast.error(e?.message || "Enregistrement impossible");
      }
    }, 700);
  };
  useEffect(() => () => clearTimeout(minuterie.current), []);

  // Chaque changement garde l'état d'avant, pour annuler ; la première
  // retouche à la main de la séance pose une version côté serveur.
  const appliquer = (suivant, { persister = true, chemins = null } = {}) => {
    const cheminsAvant = cheminsPoses.current;
    if (chemins) cheminsPoses.current = chemins;
    setAvis((a) => {
      passe.current = [...passe.current.slice(-60), { avis: a, chemins: cheminsAvant, ops: opsPoses.current }];
      futur.current = [];
      return suivant;
    });
    if (persister) enregistrer(suivant);
    forcer((n) => n + 1);
  };
  const versionAvantLaMain = () => {
    if (versionPosee.current || provisoire) return;
    versionPosee.current = true;
    base44.request("POST", `/api/mandataire/estimations/${estimation.id}/avis/versions`, { body: { motif: "Avant les retouches à la main" } }).catch(() => {});
  };
  const onPose = (chemin, valeur) => {
    versionAvantLaMain();
    let chemins = null;
    if (provisoire) {
      // Une ligne de tableau se retient par son intitulé : sa place bouge à mesure des réponses.
      const ligne = chemin.match(/^(.*\.lignes)\.(\d+)\.(mot|texte)$/);
      const mot = ligne ? lire(avis, `${ligne[1]}.${ligne[2]}.mot`) : null;
      chemins = { ...cheminsPoses.current, [ligne && mot ? `${ligne[1]}.@${mot}.${ligne[3]}` : chemin]: valeur };
    }
    let suivant = poser(avis, chemin, valeur);
    if (chemin.startsWith("chiffres.")) suivant = recalculer(suivant);
    appliquer(suivant, { chemins });
  };
  // Le déplacement d'un élément (page:chemin) : null le remet en place.
  const onPosition = (clePos, pos) => {
    versionAvantLaMain();
    const positions = { ...(avis.positions || {}) };
    if (!pos || (!pos.x && !pos.y)) delete positions[clePos]; else positions[clePos] = pos;
    appliquer({ ...avis, positions });
  };
  const finirGlisser = () => {
    if (!positionsVives) return;
    versionAvantLaMain();
    appliquer({ ...avis, positions: positionsVives });
    setPositionsVives(null);
  };
  // La mise en forme d'un élément : null revient au modèle ; une clé à null ou false s'efface.
  const onStyle = (chemin, patch) => {
    versionAvantLaMain();
    if (patch?.masque) setSelection(null);
    const styles = { ...(avis.styles || {}) };
    if (patch === null) delete styles[chemin];
    else {
      const suivant = { ...(styles[chemin] || {}), ...patch };
      for (const k of Object.keys(suivant)) if (suivant[k] === null || suivant[k] === false || suivant[k] === undefined) delete suivant[k];
      if (Object.keys(suivant).length) styles[chemin] = suivant; else delete styles[chemin];
    }
    appliquer({ ...avis, styles });
  };
  const annuler = () => {
    if (!passe.current.length) return;
    const avant = passe.current.pop();
    futur.current.push({ avis, chemins: cheminsPoses.current, ops: opsPoses.current });
    cheminsPoses.current = avant.chemins;
    opsPoses.current = avant.ops || [];
    setAvis(avant.avis); enregistrer(avant.avis); forcer((n) => n + 1);
  };
  const retablir = () => {
    if (!futur.current.length) return;
    const apres = futur.current.pop();
    passe.current.push({ avis, chemins: cheminsPoses.current, ops: opsPoses.current });
    cheminsPoses.current = apres.chemins;
    opsPoses.current = apres.ops || [];
    setAvis(apres.avis); enregistrer(apres.avis); forcer((n) => n + 1);
  };
  useEffect(() => {
    const clavier = (e) => {
      if (document.activeElement?.isContentEditable) return;
      if (selection?.clePos && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const pas = e.shiftKey ? 5 : 1;
        const p = (avis.positions || {})[selection.clePos] || { x: 0, y: 0 };
        onPosition(selection.clePos, {
          x: p.x + (e.key === "ArrowRight" ? pas : e.key === "ArrowLeft" ? -pas : 0),
          y: p.y + (e.key === "ArrowDown" ? pas : e.key === "ArrowUp" ? -pas : 0),
        });
        return;
      }
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) retablir(); else annuler();
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") { setSelection(null); document.activeElement?.blur?.(); } };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, []);

  // Ajuster : la page tient dans la largeur disponible.
  const ajuster = () => {
    const largeur = toile.current?.clientWidth || 0;
    if (largeur) setZoom(Math.min(1, Math.max(0.35, (largeur - 48) / PAGE_PX)));
  };
  useEffect(() => { ajuster(); }, [panneau]);

  const titre = useMemo(() => `${avis?.bien?.rue || "Avis"}, ${avis?.bien?.ville || ""}`, [avis]);
  const positions = positionsVives || avis?.positions || {};
  const contexteSelection = useMemo(() => ({ chemin: selection?.chemin || null, clePos: selection?.clePos || null, choisir: setSelection, styles: avis?.styles || {}, positions }), [selection?.chemin, selection?.clePos, avis?.styles, positions]);

  return (
    // À côté du chat, le fond est celui de la page, comme le chat ; seul, il est opaque.
    <div className={`avis-editeur flex flex-col ${integre ? "h-full" : "h-[100dvh]"}`} style={integre ? undefined : { background: "rgb(var(--k-fond-rgb))" }}>
      <div className={`avis-ecran z-30 flex flex-none flex-wrap items-center gap-2 border-b border-trait px-4 py-2.5 md:gap-3 md:px-5 ${integre ? "k-barre-apercu h-14 flex-nowrap py-0" : ""}`} style={integre ? undefined : { background: "rgb(var(--k-fond-rgb) / 0.85)" }}>
        {!integre && (
          <button type="button" onClick={onRetour} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            {libelleRetour === "Fermer" ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />} {libelleRetour}
          </button>
        )}
        <button type="button" onClick={() => setPanneau((v) => !v)} aria-pressed={panneau} title="Retouches, plan, versions"
          className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] ${panneau ? "bg-encre/[0.08] text-encre" : "text-ardoise hover:text-encre"}`} style={panneau ? undefined : { background: "transparent" }}>
          {integre ? <ListTree className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />} <span className="max-md:hidden">{integre ? "Plan et versions" : "Atelier"}</span>
        </button>
        {/* À côté du chat, la barre dit où en est l'avis (une seule barre, comme celle du chat). */}
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2 max-md:hidden">
          <NomAvis estimation={estimation} />
          {statut && <span className="flex-none truncate text-[12.5px] text-ardoise">· {statut}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={annuler} disabled={!passe.current.length} aria-label="Annuler" title="Annuler (⌘Z)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={retablir} disabled={!futur.current.length} aria-label="Rétablir" title="Rétablir (⇧⌘Z)" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><Redo2 className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-0.5 max-md:hidden">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.35, Math.round((z - 0.1) * 100) / 100))} aria-label="Réduire" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><ZoomOut className="h-4 w-4" /></button>
          <span className="w-10 text-center text-[12px] tabular-nums text-ardoise">{Math.round(zoom * 100)} %</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))} aria-label="Agrandir" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><ZoomIn className="h-4 w-4" /></button>
          <button type="button" onClick={ajuster} aria-label="Ajuster à la largeur" title="Ajuster" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><Maximize2 className="h-4 w-4" /></button>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12.5px] text-brume max-md:hidden">
          {etat === "envoi" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : etat === "enregistre" ? <Check className="h-3.5 w-3.5 text-menthe" /> : null}
          {etat === "envoi" ? "Enregistrement…" : etat === "enregistre" ? "Enregistré" : "Modifications…"}
        </span>
        <button type="button" onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol">
          <Download className="h-4 w-4" /> <span className="max-md:hidden">Télécharger le</span> PDF
        </button>
      </div>

      <div className="avis-atelier relative flex min-h-0 flex-1">
        {panneau && (
          <aside className="avis-ecran avis-panneau flex w-[340px] flex-none flex-col border-r border-trait bg-rail max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:top-[52px] max-md:z-20 max-md:w-auto">
            <div className="flex flex-none gap-1 border-b border-trait px-2 py-1.5">
              {[["retouches", "Retouches", MessageSquareText], ["plan", "Plan", ListTree], ["versions", "Versions", History]].filter(([k]) => !integre || k !== "retouches").map(([k, mot, Icone]) => (
                <button key={k} type="button" onClick={() => setOnglet(k)} aria-pressed={onglet === k}
                  className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] ${onglet === k ? "bg-encre/[0.08] text-encre" : "text-ardoise hover:text-encre"}`} style={onglet === k ? undefined : { background: "transparent" }}>
                  <Icone className="h-3.5 w-3.5" /> {mot}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {onglet === "retouches" && <Retouches estimation={estimation} avis={avis} selection={selection} onSelection={setSelection} onAvis={(a) => appliquer(a, { persister: false })} />}
              {onglet === "plan" && <Plan avis={avis} onPose={onPose} onSelection={setSelection} onStyle={onStyle} />}
              {onglet === "versions" && <Versions estimation={estimation} onAvis={(a) => appliquer(a, { persister: false })} />}
            </div>
          </aside>
        )}
        <Styles selection={selection} avis={avis} onStyle={onStyle} onPosition={onPosition} onFermer={() => setSelection(null)} />
        <div ref={toile} className="avis-toile relative min-w-0 flex-1 overflow-auto" onClick={() => setSelection(null)}>
          <p className="avis-ecran m-0 pt-4 text-center text-[12.5px] text-brume">Tout se modifie : cliquez un texte, un chiffre, une photo ou un tableau, puis glissez la poignée pour le déplacer. Un clic sur le bandeau d'une page la sélectionne pour le chat.</p>
          <CadreSelection selection={selection} toile={toile} zoom={zoom} positions={positions} onBrouillon={setPositionsVives} onFin={finirGlisser} />
          <div className="avis-zoom" style={{ zoom }}>
            <Selection.Provider value={contexteSelection}>
              {avis ? <PagesAvis avis={avis} onPose={onPose} estimationId={estimation.id} onAvis={(a) => appliquer(a, { persister: false })} /> : null}
            </Selection.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
