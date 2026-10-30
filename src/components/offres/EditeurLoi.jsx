import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, LayoutTemplate, Loader2, RotateCcw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import LogoKP from "@/components/mandataire/LogoKP";
import LogoKlocka from "@/components/marque/LogoKlocka";
import FicheSource from "@/components/presentations/FicheSource";
import { BarreEditeur, GroupePanneau, PanneauEditeur, ReglagesDesign, styleDesign } from "@/components/editeur/Editeur";
import "./lettre-intention.css";

// La lettre d'intention ouverte, à droite du chat de la page Offres : le
// modèle de la maison, rempli, qui se relit et se retouche sur place. Un
// clic dans un paragraphe le modifie (Cmd+B pour le gras) ; un champ des
// parties (l'acquéreur, le vendeur) change la lettre entière. Le chat, lui,
// corrige les champs ou réécrit un paragraphe. Word et PDF sortent du serveur.

const echapper = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** « **gras** » → HTML pour l'écran. */
const versHtml = (t) => String(t ?? "").split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  .map((x) => (x.startsWith("**") && x.endsWith("**") ? `<b>${echapper(x.slice(2, -2))}</b>` : echapper(x))).join("");
/** Le HTML retouché → « **gras** ». Tout le reste n'est que du texte. */
function versTexte(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.textContent;
    else if (n.nodeName === "BR") s += " ";
    else if (["B", "STRONG"].includes(n.nodeName)) { const t = n.textContent; s += t.trim() ? `**${t}**` : t; }
    else s += versTexte(n);
  }
  return s.replace(/\u00a0/g, " ").replace(/\*\*\*\*/g, "").replace(/\s+/g, " ").trim();
}

// `surFond` (26 oct. 2026, Jules) : à côté du chat, le fond de la page continue sous la lettre, sans panneau.
// Sans `id`, la lettre vierge (28 oct. 2026, Jules) : le modèle à remplir, rien de gardé ; le premier geste
// la crée (`onCree` reçoit son id), les suivants la retouchent.
// `dealId` : la lettre vierge part de ce que ce dossier sait déjà, et s'y rattache à sa création.
// `titre` : le nom en haut à gauche de la barre (le dossier), à la place de l'adresse.
// Sur le canevas de l'Éditeur (components/editeur, 28 oct. 2026, Jules) : la barre (nom, Éditeur / Lecture /
// Sources, actions), la lettre, et le panneau de l'élément choisi à droite.
// `marque` : « kp » en vue mandataire (28 oct. 2026, Jules) ; la lettre vierge et sa création la prennent.
export default function EditeurLoi({ id = null, dealId = null, titre = null, onFermer, onCree = null, travail = null, surFond = false, entete = null, marque = null }) {
  const queryClient = useQueryClient();
  const vierge = !id;
  const cle = ["offre", id || `vierge:${dealId || ""}:${marque || ""}`];
  // La vue décide de la marque affichée (« kp » en vue mandataire) : lecture, retouches et fichiers.
  const qm = marque ? `?marque=${marque}` : "";
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", id ? `/api/offres/${id}${qm}` : `/api/offres/vierge?${new URLSearchParams({ ...(dealId ? { deal_id: dealId } : {}), ...(marque ? { marque } : {}) })}`) });
  const creation = useRef(null);
  const modifier = useMutation({
    mutationFn: async (corps) => {
      if (id) return base44.request("PATCH", `/api/offres/${id}${qm}`, { body: corps });
      // Deux retouches coup sur coup dans la lettre vierge : une seule lettre, la seconde la retouche.
      if (!creation.current) {
        creation.current = base44.request("POST", "/api/offres", { body: { ...corps, ...(dealId ? { deal_id: dealId } : {}), ...(marque ? { marque } : {}) } });
        creation.current.catch(() => { creation.current = null; });
        return creation.current;
      }
      const d = await creation.current;
      return base44.request("PATCH", `/api/offres/${d.lettre.id}${qm}`, { body: corps });
    },
    onSuccess: (d) => {
      queryClient.setQueryData(["offre", d.lettre.id], d);
      // La lettre vierge montre déjà la lettre créée, le temps que la page passe sur elle.
      queryClient.setQueryData(cle, d);
      queryClient.invalidateQueries({ queryKey: ["offres"] });
      if (vierge) onCree?.(d.lettre.id);
    },
    onError: (e) => toast.error(e?.message || "La retouche n'a pas été gardée"),
  });
  const surChamp = (k, v) => modifier.mutate({ champs: { [k]: v } });
  const surTexte = (k, v) => modifier.mutate({ textes: { [k]: v } });
  // Le design d'un élément (28 oct. 2026, Jules : « tous les composants éditables ») : gardé sur la lettre.
  const surStyle = (cible, st) => modifier.mutate({ styles: { [cible]: st } });
  const [telechargement, setTelechargement] = useState(null);
  const telecharger = async (format) => {
    setTelechargement(format);
    try {
      const blob = await base44.fichier(`/api/offres/${id}/fichier?format=${format}${marque ? `&marque=${marque}` : ""}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LOI ${data?.lettre?.adresse || "local"}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e?.message || "Téléchargement impossible");
    } finally {
      setTelechargement(null);
    }
  };

  // Pendant que le chat travaille, ses étapes à la place de la lettre, puis elle revient.
  const [maj, setMaj] = useState(false);
  const enCours = !!travail?.enCours;
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    queryClient.invalidateQueries({ queryKey: cle });
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);

  const modele = data?.lettre?.modele || null;
  // Un modèle choisi ou changé : la lettre s'ouvre par le haut.
  const defile = useRef(null);
  useEffect(() => { defile.current?.scrollTo({ top: 0 }); }, [modele]);
  // La barre ne dit que le nom ; l'état seulement pendant un enregistrement.
  const statut = modifier.isPending ? "Enregistrement…" : "";

  // Les trois modes de l'Éditeur, et l'élément choisi (mode Éditeur) ou survolé (mode Sources).
  const [mode, setModeBrut] = useState("edition");
  const [choisi, setChoisi] = useState(null);
  const [survol, setSurvol] = useState(null);
  const cadre = useRef(null);
  const setMode = (m) => { setModeBrut(m); setChoisi(null); setSurvol(null); document.activeElement?.blur?.(); };
  const sources = useMemo(() => (data ? sourcesDesCibles(data) : {}), [data]);
  const styles = data?.lettre?.styles || {};
  const ctx = useMemo(() => ({
    mode, choisi, sources, styles,
    choisir: (cible) => setChoisi(cible),
    survoler: (cible, el) => {
      if (!cible || !el || !cadre.current) { setSurvol(null); return; }
      setSurvol({ cible, ancre: el.getBoundingClientRect(), cadre: cadre.current.getBoundingClientRect() });
    },
  }), [mode, choisi, sources, styles]);
  const source = survol ? sources[survol.cible] : null;

  const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] disabled:opacity-40 max-md:px-3";
  const actions = (
    <>
      {modele && mode === "edition" && (
        <button type="button" onClick={() => modifier.mutate({ modele: null })} disabled={modifier.isPending} aria-label="Changer de modèle" title="Changer de modèle"
          className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
          <LayoutTemplate className="h-4 w-4" />
        </button>
      )}
      <button type="button" onClick={() => telecharger("docx")} disabled={vierge || !data || !modele || !!telechargement}
        className={`${bouton} border border-bord-doux text-craie hover:border-bord-vif hover:text-encre`} style={{ background: "transparent" }}>
        {telechargement === "docx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Word
      </button>
      <button type="button" onClick={() => telecharger("pdf")} disabled={vierge || !data || !modele || !!telechargement}
        className={`${bouton} bg-menthe text-sur-menthe hover:bg-menthe-survol`}>
        {telechargement === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}PDF
      </button>
      {onFermer && (
        <button type="button" onClick={onFermer} aria-label="Fermer la lettre" title="Fermer"
          className="ml-1 grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:ml-0" style={{ background: "transparent" }}>
          <X className="h-4 w-4" />
        </button>
      )}
    </>
  );
  return (
    <div className={`flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${surFond ? "" : "bg-rail"}`}>
      <BarreEditeur titre={titre || data?.lettre?.adresse || (vierge ? "Nouvelle lettre d'intention" : "Lettre d'intention")} statut={statut}
        mode={modele ? mode : null} onMode={setMode} actions={actions} />
      {entete}
      <div className="flex min-h-0 flex-1">
        {/* Le cadre ne défile pas : la fiche d'une source s'y pose à côté de l'élément survolé. */}
        <div ref={cadre} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <div ref={defile} className="h-full overflow-y-auto" onScroll={() => survol && setSurvol(null)}>
            {maj && data ? (
              <MiseAJourDocument surtitre="Mise à jour de la lettre" titre="La LOI s'adapte" etapes={travail?.etapes || []} enCours={enCours} />
            ) : isLoading ? (
              <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
            ) : error || !data ? (
              <p className="m-0 p-10 text-center text-[14px] text-brume">{error?.message || "Lettre introuvable."}</p>
            ) : !modele && data.versions ? (
              <ChoixModele d={data} enCours={modifier.isPending ? modifier.variables?.modele : null} onChoisir={(m) => modifier.mutate({ modele: m })}
                onChamp={surChamp} onTexte={surTexte} />
            ) : (
              <CtxLoi.Provider value={ctx}>
                <div key={modele} className={`px-6 py-8 animate-in fade-in duration-500 max-md:py-4 loi-mode-${mode}`}>
                  <Lettre d={data} modele={modele} apercu={mode !== "edition"} onChamp={surChamp} onTexte={surTexte} />
                </div>
              </CtxLoi.Provider>
            )}
          </div>
          {mode === "sources" && source && <FicheSource source={source} ancre={survol.ancre} cadre={survol.cadre} />}
        </div>
        {mode === "edition" && choisi && data && modele && (
          <PanneauLoi key={choisi} d={data} cible={choisi} sources={sources} onChamp={surChamp} onTexte={surTexte} onStyle={(st) => surStyle(choisi, st)} onFermer={() => setChoisi(null)} />
        )}
      </div>
    </div>
  );
}

// Le mode de l'éditeur, l'élément choisi et les sources, pour chaque élément de la lettre.
const CtxLoi = createContext(null);

// Les noms des champs, comme le serveur les dit (server/offres.js).
const LIBELLES = {
  acquereur_nom: "L'acquéreur", acquereur_societe: "La société de l'acquéreur", acquereur_adresse: "L'adresse de l'acquéreur",
  vendeur_societe: "Le vendeur (signature)", attention_nom: "À l'attention de", attention_representant: "Son représentant", attention_adresse: "Son adresse",
  adresse_bien: "Le bien", surface_m2: "La surface (m²)", locataire: "Le locataire", fin_bail: "La fin du bail",
  prix: "Le prix FAI TTC (€)", apport: "L'apport (€)", duree_ans: "La durée du crédit (ans)", taux: "Le taux (%)", lieu: "Le lieu de signature",
  validite: "La validité de l'offre", limite_documents: "La remise des documents", fin_exclusivite: "La fin de l'exclusivité",
};
const NOMBRES = new Set(["prix", "apport", "surface_m2", "duree_ans", "taux"]);
const DATES = new Set(["validite", "limite_documents", "fin_exclusivite", "fin_bail"]);
// Les champs que chaque paragraphe du modèle reprend : ils se remplissent depuis le panneau.
const CHAMPS_DU_BLOC = {
  date: ["lieu"], objet: ["adresse_bien"], "offre-1": ["acquereur_nom", "adresse_bien"], "offre-liste": ["surface_m2", "locataire", "fin_bail", "prix"],
  financement: ["apport", "duree_ans", "taux"], exclusivite: ["fin_exclusivite", "limite_documents"], "pieces-liste": ["locataire"], validite: ["validite"],
};
const TYPES = { date: "Date", objet: "Objet", h2: "Titre", h3: "Sous-titre", p: "Paragraphe", liste: "Liste à tirets" };

/** Pure : la source de chaque élément de la lettre (« champ:prix », « bloc:offre-3 »), pour le mode Sources. */
export function sourcesDesCibles(d) {
  const parChamp = d.sources_champs || {};
  const out = {};
  for (const [k, s] of Object.entries(parChamp)) out[`champ:${k}`] = s;
  for (const b of d.blocs || []) {
    if (b.retouche) { out[`bloc:${b.cle}`] = { nature: "main", origine: "Réécrit à la main", detail: "Ce texte ne suit plus les champs de la lettre ; « Revenir au texte du modèle » le rend au modèle." }; continue; }
    const champs = (CHAMPS_DU_BLOC[b.cle] || []).map((k) => [k, parChamp[k]]).filter(([, s]) => s);
    if (!champs.length) continue;
    // Un champ à compléter l'emporte : c'est ce qu'il faut voir d'abord.
    const premier = champs.find(([, s]) => s.nature === "a_remplir") || champs.find(([, s]) => s.nature !== "modele") || champs[0];
    out[`bloc:${b.cle}`] = {
      nature: premier[1].nature,
      origine: champs.map(([, s]) => s.origine).join(" · "),
      detail: champs.map(([k, s]) => `${(LIBELLES[k] || k).replace(/ \(.*\)$/, "")} : ${s.detail.charAt(0).toLowerCase()}${s.detail.slice(1)}`).join(" "),
      ...(premier[1].calcul ? { calcul: premier[1].calcul } : {}),
    };
  }
  return out;
}

/** La valeur d'un champ telle qu'elle se saisit dans le panneau. */
const pourSaisie = (k, v) => (v == null ? "" : DATES.has(k) ? String(v).slice(0, 10) : String(v));
/** Ce que le panneau envoie : un nombre pour un montant, une date ISO, sinon le texte. */
function depuisSaisie(k, t) {
  const x = String(t ?? "").trim();
  if (!x) return null;
  if (NOMBRES.has(k)) { const n = Number(x.replace(/[\s\u202f€%]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : x; }
  return x;
}

/** Un champ du panneau : gardé en sortant ou sur Entrée. */
function ChampPanneau({ cle, valeur, source, onChamp }) {
  const [v, setV] = useState(pourSaisie(cle, valeur));
  const garder = () => { if (v !== pourSaisie(cle, valeur)) onChamp(cle, depuisSaisie(cle, v)); };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12.5px] text-ardoise">{LIBELLES[cle] || cle}</span>
      <input type={DATES.has(cle) ? "date" : "text"} inputMode={NOMBRES.has(cle) ? "decimal" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={garder}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} placeholder={source?.nature === "modele" ? source.origine.replace(/^[^:]+:\s*/, "") : "À compléter"}
        className="h-9 rounded-[10px] border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
      {source && source.nature !== "a_remplir" && <span className="text-[11.5px] text-brume">{source.detail}</span>}
    </label>
  );
}

/** Le panneau de l'élément choisi : ses champs, son texte, sa source. */
function PanneauLoi({ d, cible, sources, onChamp, onTexte, onStyle, onFermer }) {
  const [genre, cle] = cible.split(":");
  const champs = d.lettre?.champs || {};
  const sc = d.sources_champs || {};
  // La taille affichée de l'élément, pour partir de la vraie valeur (en points).
  const el = typeof document !== "undefined" ? document.querySelector(`[data-cible="${CSS.escape(cible)}"]`) : null;
  const taille = el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 0.75 * 2) / 2 : null;
  // Les pastilles prennent les couleurs de la lettre (et de sa marque) : le panneau porte la même palette.
  const design = <GroupePanneau titre="Design"><div className={`loi-palette${classeMarque(d)}`}><ReglagesDesign style={d.lettre?.styles?.[cible]} taille={taille} onStyle={onStyle} /></div></GroupePanneau>;
  if (genre === "zone") {
    return <PanneauEditeur titre={ZONES[cle] || "Élément"} sousTitre="Élément du modèle" onFermer={onFermer}>{design}</PanneauEditeur>;
  }
  if (genre === "champ") {
    return (
      <PanneauEditeur titre={(LIBELLES[cle] || cle).replace(/ \(.*\)$/, "")} sousTitre="Champ de la lettre" onFermer={onFermer}>
        <GroupePanneau titre="Valeur">
          <ChampPanneau key={`${cle}:${champs[cle] ?? ""}`} cle={cle} valeur={champs[cle]} source={sc[cle]} onChamp={onChamp} />
        </GroupePanneau>
        <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">Le champ change partout où la lettre le reprend.</p>
        {design}
      </PanneauEditeur>
    );
  }
  const b = (d.blocs || []).find((x) => x.cle === cle);
  if (!b) return null;
  const liste = CHAMPS_DU_BLOC[cle] || [];
  return (
    <PanneauEditeur titre={TYPES[b.type] || "Élément"} sousTitre={String(b.texte || "").replace(/\*\*/g, "").slice(0, 60)} onFermer={onFermer}>
      {liste.length > 0 && (
        <GroupePanneau titre="Les informations">
          {b.retouche && <p className="m-0 text-[12.5px] leading-[1.5] text-ambre">Ce texte a été réécrit : les informations ne s'y reportent plus tant qu'il ne revient pas au modèle.</p>}
          {liste.map((k) => <ChampPanneau key={`${k}:${champs[k] ?? ""}`} cle={k} valeur={champs[k]} source={sc[k]} onChamp={onChamp} />)}
        </GroupePanneau>
      )}
      <GroupePanneau titre="Texte">
        <TextePanneau key={b.texte} valeur={b.texte} liste={b.type === "liste"} onGarde={(t) => onTexte(cle, t)} />
        {b.retouche && (
          <button type="button" onClick={() => onTexte(cle, "")} className="inline-flex items-center gap-1.5 self-start text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" />Revenir au texte du modèle
          </button>
        )}
      </GroupePanneau>
      {design}
      {sources[cible] && (
        <GroupePanneau titre="Source">
          <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{sources[cible].detail}</p>
        </GroupePanneau>
      )}
    </PanneauEditeur>
  );
}

/** Le texte d'un élément, à réécrire ; « **…** » met en gras. */
function TextePanneau({ valeur, onGarde, liste = false }) {
  const [t, setT] = useState(String(valeur ?? ""));
  const change = t.trim() !== String(valeur ?? "").trim();
  return (
    <>
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={Math.min(12, Math.max(3, Math.ceil(t.length / 38)))}
        className="w-full resize-y rounded-[10px] border border-trait bg-surface px-3 py-2 text-[13.5px] leading-[1.5] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-brume">{liste ? "Un tiret par ligne ; " : ""}entre **astérisques** : en gras</span>
        <button type="button" onClick={() => onGarde(t)} disabled={!change}
          className="inline-flex h-8 items-center rounded-full bg-menthe px-3.5 text-[12.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Garder</button>
      </div>
    </>
  );
}

/** Le style d'un élément d'après la lettre ; masqué, il reste visible en pâle dans l'Éditeur pour qu'on le retrouve. */
function styleDe(ctx, cible) {
  const st = cible ? ctx?.styles?.[cible] : null;
  if (!st) return undefined;
  if (st.masque && ctx?.mode === "edition") return { ...styleDesign({ ...st, masque: false }), opacity: 0.3, outline: "1px dashed currentColor" };
  return styleDesign(st);
}

// Les éléments fixes du modèle : ils ne s'écrivent pas, mais leur design se règle comme le reste.
const ZONES = {
  logo: "Logo", "entete-titre": "Titre de l'en-tête", "entete-date": "Date de l'en-tête", "label-acquereur": "Libellé « Acquéreur »",
  "label-attention": "Libellé « À l'attention de »", encart: "Encart « À l'attention de »", "titre-lettre": "Titre de la lettre", pied: "Pied de page",
  "signature-gauche": "Signature de l'acquéreur", "signature-droite": "Signature du vendeur", bande: "Bande du bas", num: "Numéros de section",
};

/** Un élément fixe du modèle : un clic le choisit (mode Éditeur), son design s'applique. */
function Zone({ cle, as: Balise = "span", className = "", children }) {
  const ctx = useContext(CtxLoi);
  const cible = `zone:${cle}`;
  const edition = !!ctx && ctx.mode === "edition";
  return (
    <Balise data-cible={cible} style={styleDe(ctx, cible)}
      className={`${className}${edition ? " loi-zone" : ""}${ctx?.choisi === cible ? " loi-choisi" : ""}`}
      onClick={edition ? (e) => { e.stopPropagation(); ctx.choisir(cible); } : undefined}>{children}</Balise>
  );
}

/**
 * Un texte de la lettre. En mode Éditeur, il se retape sur place et un clic
 * le choisit (le panneau s'ouvre) ; en Lecture, rien ne bouge ; en Sources,
 * un élément qui a une source la montre au survol. `cible` : « champ:prix »,
 * « bloc:offre-3 ».
 */
function Editable({ valeur, onGarde, className = "", gras = true, as: Balise = "p", lecture = false, vide = "", cible = null }) {
  const ref = useRef(null);
  const ctx = useContext(CtxLoi);
  const editable = !lecture && (!ctx || ctx.mode === "edition");
  const choisi = !!ctx && !!cible && ctx.choisi === cible;
  const aSource = !!ctx && ctx.mode === "sources" && !!cible && !!ctx.sources[cible];
  const style = styleDe(ctx, cible);
  const sortir = () => {
    const el = ref.current;
    if (!el) return;
    const t = gras ? versTexte(el) : el.textContent.replace(/\s+/g, " ").trim();
    if (t !== String(valeur ?? "").trim()) onGarde(t);
  };
  return (
    <Balise ref={ref} className={`${editable ? "loi-editable " : ""}${choisi ? "loi-choisi " : ""}${aSource ? "loi-source " : ""}${className}`}
      contentEditable={editable} suppressContentEditableWarning spellCheck data-vide={editable && vide ? vide : undefined} data-cible={cible || undefined} style={style}
      onFocus={editable && cible ? () => ctx?.choisir(cible) : undefined}
      onBlur={editable ? sortir : undefined}
      onMouseEnter={aSource ? (e) => ctx.survoler(cible, e.currentTarget) : undefined}
      onMouseLeave={aSource ? () => ctx.survoler(null) : undefined}
      onKeyDown={editable ? (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.currentTarget.innerHTML = gras ? versHtml(valeur) : echapper(valeur); e.currentTarget.blur(); } } : undefined}
      dangerouslySetInnerHTML={{ __html: gras ? versHtml(valeur) : echapper(valeur) }} />
  );
}

const MODELES = [["classique", "Classique", "Encart gris, titres numérotés I à III"], ["menthe", "Bande", "Logo en tête, sections 00 à 03, bande au pied"]];
export const MARQUES = [["klocka", "Klocka"], ["kp", "K Partners"]];

/**
 * Les deux modèles côte à côte, remplis : on choisit, et la lettre se
 * construit sur lui. Chacun se retouche déjà sur place : le texte et les
 * champs sont communs, une retouche dans l'un vaut pour l'autre.
 */
function ChoixModele({ d, enCours, onChoisir, onChamp, onTexte }) {
  return (
    <div className="px-6 py-7 animate-in fade-in duration-500 max-md:px-4 max-md:py-5">
      <p className="m-0 text-center text-[17px] text-encre">Choisissez le modèle de la lettre</p>
      <p className="m-0 mt-1 text-center text-[13.5px] text-ardoise">Le texte est le même et se modifie dans l'un comme dans l'autre ; vous pourrez changer de modèle plus tard.</p>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {MODELES.map(([m, nom, detail]) => (
          <div key={m} className="flex flex-col items-center gap-3 rounded-[16px] border border-trait p-4 transition-colors hover:border-bord-vif">
            <span className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[15px] text-encre">{nom}</span>
                <span className="block truncate text-[12.5px] text-ardoise">{detail}</span>
              </span>
              <button type="button" onClick={() => onChoisir(m)} disabled={!!enCours}
                className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
                {enCours === m ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Choisir
              </button>
            </span>
            <span className="loi-apercu block w-full">
              <Lettre d={{ ...d, ...d.versions[m] }} modele={m} onChamp={onChamp} onTexte={onTexte} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ce qu'une ligne vide des parties invite à écrire (la lettre vierge, ou une lettre incomplète).
const VIDES = {
  acquereur_nom: "Nom de l'acquéreur", acquereur_societe: "Sa société", acquereur_adresse: "Son adresse",
  vendeur_societe: "Le vendeur", attention_nom: "À l'attention de (nom)", attention_representant: "Représentant (texte libre)", attention_adresse: "Son adresse",
};

// Les noms au-dessus des signatures : chacun est un champ de la lettre ; « Bon pour accord », sous les deux, reste fixe.
const SIGNE_GAUCHE = ["acquereur_nom", "acquereur_societe"];
const SIGNE_DROITE = ["vendeur_societe"];
/** Une ligne de signature : modifiable quand elle porte un champ (« Bon pour accord » reste fixe). */
function LigneSignature({ texte, champ, i, onChamp, lecture }) {
  if (!champ) return <p className={i === 0 ? "loi-nom" : "loi-sous"}>{texte}</p>;
  return <Editable key={`${champ}:${texte}`} valeur={texte} gras={false} lecture={lecture} cible={`champ:${champ}`} className={i === 0 ? "loi-nom" : "loi-sous"} onGarde={(t) => onChamp(champ, t)} />;
}

/** La lettre d'un modèle, aux couleurs de sa marque (`d.cadre.marque`). Exportée pour la page Modèles. */
export function Lettre(props) {
  return props.modele === "menthe" ? <LettreMenthe {...props} /> : <LettreClassique {...props} />;
}

/**
 * La lettre telle qu'elle s'imprime (29 oct. 2026, Jules : « le PDF n'est pas comme le document ») : en lecture, avec
 * le design gardé sur la lettre, pour la page d'impression que le navigateur du serveur ouvre.
 */
export function LettreImprimee({ d }) {
  const ctx = useMemo(() => ({ mode: "lecture", choisi: null, sources: {}, styles: d?.lettre?.styles || {}, choisir: () => {}, survoler: () => {} }), [d]);
  return (
    <CtxLoi.Provider value={ctx}>
      {/* `k-impression` : à l'impression, le reste de la page s'efface (index.css). */}
      <div className="loi-impression k-impression loi-mode-lecture">
        <Lettre d={d} modele={d?.lettre?.modele || "classique"} apercu onChamp={() => {}} onTexte={() => {}} />
      </div>
    </CtxLoi.Provider>
  );
}

/** Le logo en tête de la lettre : le K de Klocka, ou « kp » et son trait pour K Partners. */
function LogoMarque({ d }) {
  return d.cadre?.marque === "kp" ? <LogoKP className="loi-logo-kp" /> : <LogoKlocka className="loi-logo-k" />;
}
const classeMarque = (d) => (d.cadre?.marque === "kp" ? " loi-kp" : "");


/** Le modèle menthe : le K de Klocka en tête, titre et adresse, sections 00 à 03, lignes de signature, bande menthe. */
function LettreMenthe({ d, onChamp, onTexte, apercu = false }) {
  const { parties, cadre, blocs } = d;
  const par = (b) => ({ valeur: b.texte, onGarde: (t) => onTexte(b.cle, t), lecture: apercu, cible: `bloc:${b.cle}` });
  const date = blocs.find((b) => b.type === "date");
  // Les sections : chaque titre numéroté ouvre la sienne ; les salutations et les signatures restent dehors.
  const sections = [];
  const apres = [];
  for (const b of blocs) {
    if (["date", "objet"].includes(b.type)) continue;
    if (b.cle === "salutations" || b.type === "signatures") { apres.push(b); continue; }
    if (b.type === "h2") sections.push({ titre: b, contenu: [] });
    else sections.at(-1)?.contenu.push(b);
  }
  const ligne = (cleChamp, v, i, liste) => (
    <Editable key={`${cleChamp}:${v}`} valeur={v} gras={false} lecture={apercu} vide={VIDES[cleChamp]} cible={`champ:${cleChamp}`}
      className={i === 0 ? "loi-nom" : i === liste.length - 1 && /adresse/.test(cleChamp) ? "loi-adresse" : ""}
      onGarde={(t) => onChamp(cleChamp, t)} />
  );
  return (
    <article className={`loi-papier loi-menthe${classeMarque(d)}`} aria-label="Lettre d'intention d'achat">
      <div className="loi-corps">
        <div className="loi-m-tete">
          <Zone cle="logo"><LogoMarque d={d} /></Zone>
          {date && <Editable key={`date:${date.texte}`} {...par(date)} gras={false} className="loi-date" />}
        </div>
        <div className="loi-parties">
          <div>{parties.acquereur.map(([k, v], i, l) => ligne(k, v, i, l))}</div>
          <div>
            <Zone cle="label-attention" as="p" className="loi-m-attention">À l'attention de</Zone>
            {parties.attention.map(([k, v], i, l) => ligne(k, v, i, l))}
          </div>
        </div>
        <Zone cle="titre-lettre" as="p" className="loi-m-titre">Lettre d'intention d'achat</Zone>
        <Editable key={`adresse:${cadre.adresse_courte}`} valeur={cadre.adresse_courte} gras={false} lecture={apercu} vide="Adresse du local" cible="champ:adresse_bien" className="loi-m-adresse" onGarde={(t) => onChamp("adresse_bien", t)} />
        {sections.map((s) => (
          <section key={s.titre.cle} className="loi-m-section">
            <Zone cle="num" className="loi-m-num">{s.titre.num}</Zone>
            <div>
              <Editable key={`${s.titre.cle}:${s.titre.texte}`} {...par(s.titre)} gras={false} as="h2" className="loi-h2" />
              {s.contenu.map((b) => (b.type === "h3"
                ? <Editable key={`${b.cle}:${b.texte}`} {...par(b)} gras={false} className="loi-h3" />
                : b.type === "liste" ? <Liste key={`${b.cle}:${b.texte}`} b={b} onTexte={onTexte} apercu={apercu} cible={`bloc:${b.cle}`} />
                : <Paragraphe key={`${b.cle}:${b.texte}`} b={b} {...par(b)} onTexte={onTexte} apercu={apercu} />))}
            </div>
          </section>
        ))}
        {apres.map((b) => (b.type === "signatures" ? (
          <div key={b.cle} className="loi-signatures">
            {[[b.gauche, SIGNE_GAUCHE], [b.droite, SIGNE_DROITE]].map(([lignes, champs], n) => (
              <div key={n}>
                {lignes.map((l, i) => <LigneSignature key={l} texte={l} champ={l === "Bon pour accord" ? null : champs[i]} i={i} onChamp={onChamp} lecture={apercu} />)}
                <div className="loi-m-ligne" />
                <Zone cle={n === 0 ? "signature-gauche" : "signature-droite"} as="p" className="loi-m-sous">Signature</Zone>
              </div>
            ))}
          </div>
        ) : (
          <div key={`${b.cle}:${b.texte}`} className="loi-m-salut"><Paragraphe b={b} {...par(b)} onTexte={onTexte} apercu={apercu} /></div>
        )))}
      </div>
      {/* Le bas de page : à l'impression, posé en bas de chaque page (lettre-intention.css). */}
      <div className="loi-bas">
        <Zone cle="pied" as="footer" className="loi-pied"><span>{cadre.pied_gauche}</span><span>{cadre.pied_droite}</span></Zone>
        <Zone cle="bande" as="div" className="loi-m-bande" />
      </div>
    </article>
  );
}

/** Un paragraphe du corps, avec sa marque de retouche et le retour au modèle. */
function Paragraphe({ b, onTexte, apercu, ...par }) {
  return (
    <div className={b.retouche ? "loi-retouche" : ""}>
      {b.retouche && !apercu && (
        <button type="button" title="Revenir au texte du modèle" aria-label="Revenir au texte du modèle" onClick={() => onTexte(b.cle, "")}
          className="float-right -mr-9 mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[color:var(--loi-vert)] opacity-60 hover:opacity-100" style={{ background: "transparent" }}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <Editable {...par} className="loi-p" />
    </div>
  );
}

/**
 * Une liste à tirets (30 oct. 2026, Jules : « sous forme de tirets », comme la LOI de référence) : chaque tiret se
 * retape sur place ; vidé, il disparaît. Le texte de la liste a un tiret par ligne.
 */
function Liste({ b, onTexte, apercu, cible }) {
  const lignes = String(b.texte || "").split("\n").map((l) => l.replace(/^\s*[-–•]\s*/, "").trim()).filter(Boolean);
  const garder = (i, t) => onTexte(b.cle, lignes.map((l, j) => (j === i ? t : l)).filter((l) => l.trim()).join("\n"));
  return (
    <div className={b.retouche ? "loi-retouche" : ""}>
      {b.retouche && !apercu && (
        <button type="button" title="Revenir au texte du modèle" aria-label="Revenir au texte du modèle" onClick={() => onTexte(b.cle, "")}
          className="float-right -mr-9 mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[color:var(--loi-vert)] opacity-60 hover:opacity-100" style={{ background: "transparent" }}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <ul className="loi-tirets">
        {lignes.map((l, i) => <Editable key={`${i}:${l}`} as="li" valeur={l} lecture={apercu} cible={cible} onGarde={(t) => garder(i, t)} />)}
      </ul>
    </div>
  );
}

function LettreClassique({ d, onChamp, onTexte, apercu = false }) {
  const { parties, cadre, blocs } = d;
  const ligne = (cleChamp, v, i, liste) => {
    const nom = i === 0;
    const adresse = i === liste.length - 1 && /adresse/.test(cleChamp);
    return (
      <Editable key={`${cleChamp}:${v}`} valeur={v} gras={false} lecture={apercu} vide={VIDES[cleChamp]} cible={`champ:${cleChamp}`} className={nom ? "loi-nom" : adresse ? "loi-adresse" : ""}
        onGarde={(t) => onChamp(cleChamp, t)} />
    );
  };
  return (
    <article className={`loi-papier${classeMarque(d)}`} aria-label="Lettre d'intention d'achat">
      <header className="loi-entete">
        <span className="flex min-w-0 items-center"><Zone cle="logo"><LogoMarque d={d} /></Zone><Zone cle="entete-titre" className="truncate">{cadre.titre}</Zone></span>
        <Zone cle="entete-date" className="loi-date-haut">{cadre.date}</Zone>
      </header>
      <div className="loi-corps">
        <div className="loi-parties">
          <div>
            <Zone cle="label-acquereur" as="p" className="loi-label">Acquéreur</Zone>
            {parties.acquereur.map(([k, v], i, l) => ligne(k, v, i, l))}
          </div>
          <Zone cle="encart" as="div" className="loi-attention">
            <Zone cle="label-attention" as="p" className="loi-label">À l'attention de</Zone>
            {parties.attention.map(([k, v], i, l) => ligne(k, v, i, l))}
          </Zone>
        </div>
        {blocs.map((b) => {
          const k = `${b.cle}:${b.texte}`;
          const commun = { valeur: b.texte, onGarde: (t) => onTexte(b.cle, t), lecture: apercu, cible: `bloc:${b.cle}` };
          const retour = b.retouche && !apercu ? (
            <button type="button" title="Revenir au texte du modèle" aria-label="Revenir au texte du modèle" onClick={() => onTexte(b.cle, "")}
              className="float-right -mr-9 mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[color:var(--loi-vert)] opacity-60 hover:opacity-100" style={{ background: "transparent" }}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null;
          if (b.type === "date") return <Editable key={k} {...commun} gras={false} className="loi-date" />;
          if (b.type === "objet") return <Editable key={k} {...commun} gras={false} className="loi-objet" />;
          if (b.type === "h2") {
            return (
              <h2 key={b.cle} className={`loi-h2 ${b.num ? "" : "loi-conseil"}`}>
                {b.num && <Zone cle="num" className="loi-num">{b.num}</Zone>}
                <Editable key={k} {...commun} as="span" gras={false} />
              </h2>
            );
          }
          if (b.type === "h3") return <Editable key={k} {...commun} gras={false} className="loi-h3" />;
          if (b.type === "liste") return <Liste key={k} b={b} onTexte={onTexte} apercu={apercu} cible={commun.cible} />;
          if (b.type === "signatures") {
            return (
              <div key={b.cle} className="loi-signatures">
                {[[b.gauche, "Signature", SIGNE_GAUCHE, "signature-gauche"], [b.droite, "Date et signature", SIGNE_DROITE, "signature-droite"]].map(([lignes, sous, champs, zone]) => (
                  <div key={sous}>
                    {lignes.map((l, i) => <LigneSignature key={l} texte={l} champ={l === "Bon pour accord" ? null : champs[i]} i={i} onChamp={onChamp} lecture={apercu} />)}
                    <Zone cle={zone} as="div" className="loi-cadre"><span>{sous.toUpperCase()}</span></Zone>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={b.cle} className={b.retouche ? "loi-retouche" : ""}>
              {retour}
              <Editable key={k} {...commun} className="loi-p" />
            </div>
          );
        })}
      </div>
      <div className="loi-bas">
        <Zone cle="pied" as="footer" className="loi-pied"><span>{cadre.pied_gauche}</span><span>{cadre.pied_droite}</span></Zone>
      </div>
    </article>
  );
}
