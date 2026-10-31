import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import LogoKP from "@/components/mandataire/LogoKP";
import SurvolSources from "@/components/mandataire/SurvolSources";
import { PanneauStyles, placementCss, styleVisible } from "@/components/mandataire/EditeurAvis";
import { ModesEditeur } from "@/components/editeur/Editeur";
import { bouton, champ } from "@/components/off-market/commun";
import "./teaser.css";

// Le teaser K Partners (28 oct. 2026, Jules : « la première chose qu'on voit quand on passe à mettre en vente »). La
// page A4 (`PageTeaser`, la même pour l'écran et le PDF), et l'éditeur de la Commercialisation : l'aperçu, la classe
// d'actif, les champs à corriger, « Télécharger le PDF ». Le contenu est composé par server/teaser.js, sans modèle.

const AFAIRE = "[à compléter]";
// La mise en forme et l'élément choisi (comme l'avis) : chaque texte lit ses styles et dit au panneau qu'il est choisi.
const EditionTeaser = createContext({ styles: {}, positions: {}, choisi: null, choisir: null });

// Un texte du teaser ; avec `onChange`, il se corrige d'un clic, comme le mandat et l'avis (Entrée enregistre, Échap
// annule), et le panneau de mise en forme s'ouvre à droite.
function Texte({ v, onChange = null, chemin = null }) {
  const ed = useContext(EditionTeaser);
  // En édition, un texte masqué reste visible en pâle et en pointillé ; en lecture et au PDF, il disparaît.
  const style = chemin ? { ...styleVisible(ed.styles?.[chemin], !!onChange), ...placementCss(ed.positions?.[chemin], ed.styles?.[chemin]) } : undefined;
  if (!onChange) return <span data-chemin={chemin || undefined} style={style} className={v === AFAIRE ? "tz-afaire" : undefined}>{v}</span>;
  return (
    <span key={v} data-chemin={chemin || undefined} contentEditable suppressContentEditableWarning role="textbox" tabIndex={0} title="Cliquez pour corriger" spellCheck={false}
      style={style} className={`tz-edit ${v === AFAIRE ? "tz-afaire" : ""} ${ed.choisi === chemin ? "tz-choisi" : ""}`}
      onFocus={(e) => ed.choisir?.({ chemin, clePos: chemin, el: e.currentTarget, texte: v, taille: Math.round(parseFloat(getComputedStyle(e.currentTarget).fontSize) * 0.75 * 2) / 2 })}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.currentTarget.textContent = v; e.currentTarget.blur(); } }}
      onBlur={(e) => { const t = e.currentTarget.textContent.trim(); if (t && t !== v) onChange(t); else e.currentTarget.textContent = v; }}>{v}</span>
  );
}

/** Une photo prise par le navigateur, remise en JPEG (2000 px au plus) : une photo d'iPhone (HEIC) s'affiche ainsi partout. */
export async function enJpeg(fichier) {
  const bitmap = await createImageBitmap(fichier).catch(() => null);
  if (!bitmap) throw new Error("Ce format de photo ne se lit pas ici : choisissez un JPEG ou un PNG.");
  const r = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * r); c.height = Math.round(bitmap.height * r);
  c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.86));
  return new File([blob], `${String(fichier.name || "photo").replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
}

/** La page A4 du teaser, dessinée en 794 × 1123. */
export function PageTeaser({ t, signataire, classe, onPatch = null, onPhoto = null }) {
  const ed = (f) => (onPatch ? f : null);
  const choisir = useRef(null);
  // La mise en forme vient du teaser lui-même : l'écran et le PDF la lisent pareil.
  const dehors = useContext(EditionTeaser);
  return (
    <EditionTeaser.Provider value={{ ...dehors, styles: t.styles || {}, positions: t.positions || {} }}>
    <div className="tz-page">
      <div className="tz-haut">
        {t.photo ? <img src={t.photo} alt={t.photo_libelle || ""} data-chemin="photo" /> : <span className="tz-sans-photo">Photo · {t.photo_libelle}</span>}
        <div className="tz-voile" />
        {/* En édition, un clic sur la photo (ou sur son emplacement) en importe une autre (28 oct. 2026, Jules). */}
        {onPhoto && (
          <>
            <input ref={choisir} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPhoto(f); }} />
            <button type="button" className="tz-photo-zone" aria-label={t.photo ? "Changer la photo" : "Importer une photo"} onClick={() => choisir.current?.click()} />
            <button type="button" className="tz-photo-choix" onClick={() => choisir.current?.click()}>{t.photo ? "Changer la photo" : "Importer une photo"}</button>
          </>
        )}
        <div className="tz-entete"><span>Teaser · {classe}</span><span>Réf. {t.ref}</span></div>
        {t.filigrane && t.filigrane !== AFAIRE && <div className="tz-filigrane" aria-hidden="true">{t.filigrane}</div>}
        <div className="tz-titres">
          <h1 className="tz-titre"><Texte v={t.titre} chemin="titre" onChange={ed((x) => onPatch({ titre: x }))} /></h1>
          <p className="tz-sous"><Texte v={t.sous_titre} chemin="sous_titre" onChange={ed((x) => onPatch({ sous_titre: x }))} /></p>
        </div>
      </div>
      <div className="tz-carte">
        <div className="tz-tuiles">
          {t.tuiles.map((x, i) => <div key={x.cle} className={`tz-tuile ${x.etoile ? "tz-etoile" : ""}`}><b><Texte v={x.valeur} chemin={`tuiles.${i}`} onChange={ed((val) => onPatch({ tuiles: t.tuiles.map((y, j) => (j === i ? { ...y, valeur: val } : y)) }))} /></b><span><Texte v={x.libelle} chemin={`tuiles.${i}.libelle`} onChange={ed((val) => onPatch({ tuiles: t.tuiles.map((y, j) => (j === i ? { ...y, libelle: val } : y)) }))} /></span></div>)}
        </div>
        <p className="tz-rubrique"><Texte v={t.tableau_titre} chemin="tableau_titre" onChange={ed((x) => onPatch({ tableau_titre: x }))} /></p>
        <div className="tz-tableau">
          {t.lignes.map((l, i) => <div key={`${l.cle}-${i}`} className="tz-ligne"><span><Texte v={l.intitule} chemin={`lignes.${i}.intitule`} onChange={ed((val) => onPatch({ lignes: t.lignes.map((y, j) => (j === i ? { ...y, intitule: val } : y)) }))} /></span><b><Texte v={l.detail} chemin={`lignes.${i}`} onChange={ed((val) => onPatch({ lignes: t.lignes.map((y, j) => (j === i ? { ...y, detail: val } : y)) }))} /></b></div>)}
        </div>
        <p className="tz-rubrique">Points forts</p>
        <div className="tz-points">{t.points.map((p, i) => <span key={i} className="tz-point"><Texte v={p} chemin={`points.${i}`} onChange={ed((val) => onPatch({ points: t.points.map((y, j) => (j === i ? val : y)) }))} /></span>)}</div>
      </div>
      <p className="tz-confidentiel"><Texte v={t.confidentialite} chemin="confidentialite" onChange={ed((x) => onPatch({ confidentialite: x }))} /></p>
      <div className="tz-pied">
        <LogoKP fond="nuit" />
        <div className="tz-pied-qui">
          <b>{signataire?.nom || "[Prénom Nom]"}</b> · Mandataire K Partners<br />
          {[signataire?.telephone, signataire?.email].filter(Boolean).join(" · ")}
        </div>
        <span className="tz-pied-classe">{classe}</span>
      </div>
    </div>
    </EditionTeaser.Provider>
  );
}

/** La page à l'échelle de son conteneur (largeur donnée par le parent). */
function Apercu({ children }) {
  const ref = useRef(null);
  const [echelle, setEchelle] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const o = new ResizeObserver(([e]) => setEchelle(Math.min(1, e.contentRect.width / 794)));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return (
    <div ref={ref} className="w-full">
      <div className="overflow-hidden rounded-[10px] shadow-[0_18px_40px_rgb(0_0_0/0.25)]" style={{ height: 1123 * echelle }}>
        <div style={{ width: 794, transform: `scale(${echelle})`, transformOrigin: "0 0" }}>{children}</div>
      </div>
    </div>
  );
}

/** Le teaser d'une commercialisation : sa lecture, sa recomposition, ses retouches, son PDF, sa validation. */
function useTeaser(marcheId) {
  const queryClient = useQueryClient();
  const cle = ["m-teaser", marcheId];
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/teaser`;
  const lecture = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", url) });
  const poser = (r) => queryClient.setQueryData(cle, (d) => ({ ...d, ...r }));
  const recomposer = useMutation({
    mutationFn: (classe) => base44.request("GET", `${url}?refaire=1${classe ? `&classe=${encodeURIComponent(classe)}` : ""}`),
    onSuccess: poser,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const modifier = useMutation({ mutationFn: (patch) => base44.request("PATCH", url, { body: patch }), onSuccess: (r) => poser({ teaser: r.teaser }), onError: (e) => toast.error(e?.message || "Non enregistré") });
  const photo = useMutation({
    mutationFn: async (f) => { const corps = new FormData(); corps.append("fichier", await enJpeg(f)); return base44.request("POST", `${url}/photo`, { body: corps }); },
    onSuccess: (r) => { poser({ teaser: r.teaser }); toast.success("Photo posée"); },
    onError: (e) => toast.error(e?.message || "Photo refusée"),
  });
  const valider = useMutation({
    mutationFn: () => base44.request("POST", `${url}/valider`),
    onSuccess: (r) => { poser({ teaser: r.teaser }); ["m-marches", "m-dossiers"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); toast.success("Teaser validé"); },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const [pdf, setPdf] = useState(false);
  const telecharger = async () => {
    setPdf(true);
    try {
      const r = await fetch(`${url}/pdf`, { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || "Le PDF ne s'est pas fait."); }
      const nom = decodeURIComponent((r.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || "Teaser.pdf");
      const lien = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = lien; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(lien), 4000);
    } catch (e) { toast.error(e?.message || "Le PDF ne s'est pas fait"); } finally { setPdf(false); }
  };
  return { data: lecture.data, isLoading: lecture.isLoading, recomposer, modifier, photo, valider, pdf, telecharger };
}

/**
 * Les commandes du teaser, dans la barre du haut de l'aperçu (28 oct. 2026, Jules) : Éditeur, Lecture, Sources comme
 * l'avis, « PDF », et « Valider le teaser », qui fait la Commercialisation et mène aux offres (`onValide`). La classe
 * d'actif ne se choisit plus à la main : Haka la lit dans le mandat et l'avis.
 */
export function ActionsTeaser({ marcheId, mode, onMode, onValide = null }) {
  const { data, valider, pdf, telecharger } = useTeaser(marcheId);
  const t = data?.teaser;
  if (!t) return null;
  return (
    <div className="flex items-center gap-2">
      <ModesEditeur mode={mode} onMode={onMode} />
      <button type="button" onClick={telecharger} disabled={pdf} className={`${bouton} h-8 text-[12.5px]`}>{pdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}PDF</button>
      <button type="button" onClick={() => valider.mutate(undefined, { onSuccess: () => onValide?.() })} disabled={valider.isPending}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[12.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
        {valider.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{t.valide_le ? "Validé · passer aux offres" : "Valider le teaser"}
      </button>
    </div>
  );
}

/** Le teaser seul, en grand, corrigé d'un clic (sans fond ni commandes : elles sont dans la barre du haut). */
export default function TeaserBien({ marcheId, mode = "edition" }) {
  const { data, isLoading, recomposer, modifier, photo } = useTeaser(marcheId);
  // L'élément choisi ouvre le panneau de mise en forme à droite (28 oct. 2026, Jules : « comme dans les autres éditeurs »).
  const [selection, setSelection] = useState(null);
  useEffect(() => { if (mode !== "edition") setSelection(null); }, [mode]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") { setSelection(null); document.activeElement?.blur?.(); } };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, []);
  if (isLoading) return <Loader titre="Le teaser se compose…" />;
  if (!data?.teaser) return null;
  const t = data.teaser;
  const classe = data.classes?.[t.classe] || "";
  const manque = JSON.stringify(t).includes(AFAIRE);
  const styles = t.styles || {};
  const positions = t.positions || {};
  // Le panneau donne le style entier de l'élément (null : retour au modèle). Masqué, l'élément garde sa sélection.
  const surStyle = (chemin, st) => modifier.mutate({ styles: { [chemin]: st || null } });
  const edition = mode === "edition";
  const ouvert = edition && !!selection;
  return (
    <section aria-label="Le teaser" className="relative pt-2" onClick={() => setSelection(null)}>
      {/* Le modèle de la page éditeur (28 oct. 2026) : le panneau de l'élément choisi à droite du teaser, sans fond propre. */}
      <div className="relative flex items-start gap-4">
      <div className="min-w-0 flex-1">
      <div className="mx-auto max-w-[640px]">
        {/* Sources : le survol d'un champ montre d'où il vient (le mandat, l'avis, un calcul, l'API Géo, vous ou Haka). */}
        <SurvolSources actif={mode === "sources"} lire={(chemin, texte) => (texte.includes(AFAIRE) ? { nature: "a_remplir", detail: "Rien dans le mandat ni l'avis : corrigez-le d'un clic ou dites-le à l'Assistant KPartners." } : t.sources?.[chemin] || null)}>
          <EditionTeaser.Provider value={{ choisi: selection?.chemin || null, choisir: edition ? setSelection : null }}>
            <Apercu><PageTeaser t={t} signataire={data.signataire} classe={classe}
              onPatch={edition ? (patch) => modifier.mutate(patch) : null} onPhoto={edition ? (f) => photo.mutate(f) : null} /></Apercu>
          </EditionTeaser.Provider>
        </SurvolSources>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[12.5px] text-brume">
        <span className={manque ? "text-ambre" : undefined}>{mode === "sources" ? "Survolez un champ pour voir d'où il vient." : mode === "lecture" ? "Le teaser tel que l'acquéreur le lira." : `${manque ? "Complétez ce qui est en sable : " : ""}cliquez sur un texte pour le corriger et le mettre en forme, ou sur la photo pour la changer.`}</span>
        <button type="button" onClick={() => recomposer.mutate(t.classe)} disabled={recomposer.isPending} className="inline-flex items-center gap-1.5 text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <RotateCcw className="h-3.5 w-3.5" />Recomposer depuis le mandat et l'avis
        </button>
      </div>
      </div>
      {ouvert && (
        <div className="sticky top-0 flex h-[calc(100dvh-6rem)] flex-none self-start" onClick={(e) => e.stopPropagation()}>
          <PanneauStyles key={selection.chemin} selection={selection} doc={{ styles, positions }} palette="tz-palette" poignee={false}
            onStyle={surStyle} onPosition={(cle, pos) => modifier.mutate({ positions: { [cle]: pos } })} onFermer={() => setSelection(null)} />
        </div>
      )}
      </div>
    </section>
  );
}
