import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { ChevronDown, Loader2, Minus, Plus, X } from "lucide-react";
import DocumentsDossier from "./DocumentsDossier";
import SimulateurAnalyse from "./SimulateurAnalyse";
import DonneesExtraites from "./DonneesExtraites";
import LectureDossier from "./LectureDossier";
import PenseeIA from "@/components/PenseeIA";
import { J } from "@/design/jetons";
import { fenetreDuPassage, motsDeLImage } from "@/lib/ocr-passage";
import { DocumentClassique } from "@/components/preanalyse/MiniaturePiece";

// L'étape Analyse : un onglet Documents (la liste cochable) puis un onglet par
// document extrait, chacun présentant ses données extraites. Chaque ligne
// porte sa source — un clic ouvre le document à la bonne page.

const LIBELLE_TYPE = {
  bail: "bail",
  pv_ag: "PV d'AG",
  rcp: "RCP",
  quittances: "quittances",
  diagnostics: "diagnostics",
};

// Les visionneuses PDF acceptent #page=N ; pour le reste on ouvre le fichier.
const lienSource = (url, page) => (!url ? null : page && /\.pdf($|\?)/i.test(url) ? `${url}#page=${page}` : url);


// Ce que le navigateur sait afficher dans un cadre : PDF, images, texte. Le
// reste (Word, tableurs) se télécharge — on propose alors le lien.
const lisibleEnCadre = (url, mime) => {
  const m = String(mime || "");
  if (m.includes("pdf") || m.startsWith("image/") || m.startsWith("text/")) return true;
  return /\.(pdf|png|jpe?g|gif|webp|txt|csv|md)($|\?)/i.test(String(url || ""));
};

// Comparer sans se soucier des accents, de la casse, des espaces ni de la
// ponctuation : le modèle recopie rarement une citation au caractère près.
// On garde, pour chaque caractère normalisé, l'index d'origine : le surlignage
// retombe sur le vrai texte.
function normaliserAvecCarte(texte) {
  const carte = [];
  let sortie = "";
  const brut = String(texte || "");
  for (let i = 0; i < brut.length; i++) {
    const c = brut[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const ch = /[a-z0-9]/.test(c) ? c : " ";
    if (ch === " " && sortie.endsWith(" ")) continue;
    sortie += ch;
    carte.push(i);
  }
  return { texte: sortie, carte };
}

// Où la citation se trouve dans le texte de la page : la citation entière,
// sinon son début, sinon rien. Rend [début, fin] dans le texte d'origine.
export function trouverPassage(texteBrut, citation) {
  if (!texteBrut || !citation) return null;
  const page = normaliserAvecCarte(texteBrut);
  const cible = normaliserAvecCarte(citation).texte.trim();
  if (cible.length < 8) return null;
  for (const longueur of [cible.length, 120, 80, 50, 30, 18]) {
    const morceau = cible.slice(0, longueur).trim();
    if (morceau.length < 12 && longueur !== cible.length) continue;
    const i = page.texte.indexOf(morceau);
    if (i >= 0) {
      const fin = Math.min(page.carte.length - 1, i + morceau.length - 1);
      return [page.carte[i], page.carte[fin] + 1];
    }
  }
  return null;
}

// Le texte de la page, le passage cité surligné et amené sous les yeux.
function TextePage({ dealId, documentId, page, citation }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["page-texte", dealId, documentId, page],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/espace/documents/${documentId}/page/${page || 1}`),
    enabled: !!dealId && !!documentId,
    staleTime: 60 * 60 * 1000,
  });
  const ref = useRef(null);
  const texte = data?.texte || "";
  const passage = useMemo(() => trouverPassage(texte, citation), [texte, citation]);
  useEffect(() => { ref.current?.scrollIntoView({ block: "center" }); }, [passage]);

  if (isLoading) return <p className="m-0 px-4 py-3 text-[12.5px] text-ardoise inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture de la page…</p>;
  if (isError || !texte) return <p className="m-0 px-4 py-3 text-[12.5px] text-brume">Pas de couche texte sur cette page : le passage se lit dans le PDF, à la page {page || 1}.</p>;
  return (
    <div className="px-4 py-3 text-[12.5px] leading-[1.7] text-craie whitespace-pre-wrap">
      {passage ? (
        <>
          {texte.slice(0, passage[0])}
          <mark ref={ref} className="bg-ambre text-fond rounded-[3px] px-0.5 font-medium">{texte.slice(passage[0], passage[1])}</mark>
          {texte.slice(passage[1])}
        </>
      ) : (
        <>
          <p className="m-0 mb-3 text-[12.5px] text-ambre">Le passage exact n'a pas été retrouvé mot pour mot dans cette page : voici son texte entier.</p>
          {texte}
        </>
      )}
    </div>
  );
}

// La page du PDF elle-même, le passage cité surligné dessus (29 oct. 2026, Jules : « le document avec le passage bien
// surligné »). pdf.js dessine la page et lit sa couche texte ; les morceaux de texte qui portent la citation reçoivent
// un aplat ambre. La citation absente de la page dite est cherchée dans les autres. Un scan n'a pas de couche texte :
// la page s'affiche, la citation reste au-dessus.
export async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

async function texteDeLaPage(page) {
  const contenu = await page.getTextContent();
  let brut = "";
  const itemDe = [];
  contenu.items.forEach((it, i) => {
    const morceau = `${it.str || ""}${it.hasEOL ? "\n" : " "}`;
    for (let k = 0; k < morceau.length; k++) itemDe.push(i);
    brut += morceau;
  });
  return { items: contenu.items, brut, itemDe };
}

// Toutes les pages l'une sous l'autre, on fait défiler (2 nov. 2026, Jules : « au lieu de devoir cliquer sur les flèches,
// on doit pouvoir juste scroller ») ; on arrive sur la page du passage. Le zoom, en haut à gauche : − et +, ou Ctrl +
// molette (le pincement du pavé tactile). Chaque page ne se dessine qu'à l'approche de l'écran.
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/** Une page du PDF, dessinée quand elle approche de l'écran ; ses marques (en points de la page) mises à l'échelle. */
function PageRendue({ doc, n, largeur, taille, marques, premiere, onRef }) {
  const boite = useRef(null);
  const toile = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = boite.current;
    if (!el) return undefined;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { rootMargin: "800px 0px" });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !doc) return undefined;
    let fini = false;
    let tache = null;
    (async () => {
      const p = await doc.getPage(n);
      const c = toile.current;
      if (fini || !c) return;
      const v = p.getViewport({ scale: largeur / taille.w });
      const dpr = window.devicePixelRatio || 1;
      // Le dessin se fait à côté, puis se pose d'un coup : pendant un zoom, l'ancienne image reste, étirée.
      const hors = document.createElement("canvas");
      hors.width = Math.floor(v.width * dpr);
      hors.height = Math.floor(v.height * dpr);
      tache = p.render({ canvasContext: hors.getContext("2d"), canvas: hors, viewport: v, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try { await tache.promise; } catch { return; }
      if (fini) return;
      c.width = hors.width;
      c.height = hors.height;
      c.getContext("2d").drawImage(hors, 0, 0);
    })();
    return () => { fini = true; tache?.cancel?.(); };
  }, [visible, doc, n, largeur, taille.w]);
  const k = largeur / taille.w;
  return (
    <div ref={(el) => { boite.current = el; onRef?.(el); }} data-page={n} className="relative flex-none bg-white shadow-[0_6px_18px_rgb(0_0_0/0.12)]" style={{ width: largeur, height: taille.h * k }}>
      <canvas ref={toile} className="block h-full w-full" />
      {marques.map((m, i) => (
        <span key={i} ref={i === 0 ? premiere : undefined} className="pointer-events-none absolute rounded-[2px] bg-ambre/40 mix-blend-multiply ring-1 ring-ambre/60"
          style={{ left: m.left * k, top: m.top * k, width: m.width * k, height: m.height * k }} />
      ))}
    </div>
  );
}

export function PagePdfSurlignee({ url, page: pageDite = null, citation = null }) {
  const cadre = useRef(null);
  const pages = useRef([]);
  const premiere = useRef(null);
  const [doc, setDoc] = useState(null);
  const [tailles, setTailles] = useState([]);
  const [cible, setCible] = useState({ page: pageDite || 1, marques: [], ocr: false });
  const [erreur, setErreur] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [largeurCadre, setLargeurCadre] = useState(0);
  const [courante, setCourante] = useState(pageDite || 1);
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    const o = new ResizeObserver(() => setLargeurCadre(el.clientWidth));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    let fini = false;
    let d = null;
    setDoc(null); setErreur(null); setTailles([]); setZoom(1); setCourante(pageDite || 1); pages.current = [];
    (async () => {
      try {
        const lib = await pdfjs();
        const donnees = new Uint8Array(await (await fetch(url)).arrayBuffer());
        d = await lib.getDocument({ data: donnees }).promise;
        const total = d.numPages;
        const t = [];
        for (let n = 1; n <= total; n++) { const v = (await d.getPage(n)).getViewport({ scale: 1 }); t.push({ w: v.width, h: v.height }); }
        if (fini) return;
        // La page du passage : celle où la citation se lit vraiment, la page dite d'abord.
        let numero = Math.min(Math.max(1, pageDite || 1), total);
        let lu = null;
        let passage = null;
        if (citation) {
          for (const n of [numero, ...Array.from({ length: total }, (_, i) => i + 1).filter((x) => x !== numero)]) {
            const tx = await texteDeLaPage(await d.getPage(n));
            const p = trouverPassage(tx.brut, citation);
            if (p) { numero = n; lu = tx; passage = p; break; }
            if (fini) return;
          }
          if (!lu) lu = await texteDeLaPage(await d.getPage(numero));
        }
        // Les marques en points de la page (échelle 1) : elles suivent le zoom sans être recalculées.
        const marques = [];
        if (passage && lu) {
          const v1 = (await d.getPage(numero)).getViewport({ scale: 1 });
          for (const i of new Set(lu.itemDe.slice(passage[0], passage[1]))) {
            const it = lu.items[i];
            if (!it?.str?.trim()) continue;
            const tx = lib.Util.transform(v1.transform, it.transform);
            const h = Math.hypot(tx[2], tx[3]);
            marques.push({ left: tx[4], top: tx[5] - h, width: it.width, height: h * 1.15 });
          }
        }
        // Un scan n'a pas de couche texte : les pages s'affichent d'abord, puis l'OCR y cherche le passage.
        const scan = !!citation && !marques.length && (lu?.brut || "").replace(/\s+/g, "").length < 40;
        setTailles(t); setDoc(d); setCible({ page: numero, marques, ocr: scan });
        if (!scan) return;
        for (const n of [numero, numero + 1, numero - 1].filter((x) => x >= 1 && x <= total)) {
          const p = await d.getPage(n);
          // L'OCR lit une image large d'environ 2 000 points : assez fin pour un bail scanné.
          const vo = p.getViewport({ scale: 2000 / t[n - 1].w });
          const img = document.createElement("canvas");
          img.width = Math.floor(vo.width);
          img.height = Math.floor(vo.height);
          await p.render({ canvasContext: img.getContext("2d"), canvas: img, viewport: vo }).promise;
          if (fini) return;
          const mots = await motsDeLImage(`${url}#${n}`, img);
          if (fini) return;
          const f = fenetreDuPassage(mots, citation);
          if (!f) continue;
          const k = t[n - 1].w / vo.width;
          setCible({ page: n, ocr: false, marques: mots.slice(f[0], f[1] + 1).map((m) => ({ left: m.bbox.x0 * k, top: m.bbox.y0 * k - 1, width: (m.bbox.x1 - m.bbox.x0) * k, height: (m.bbox.y1 - m.bbox.y0) * k + 2 })) });
          return;
        }
        if (!fini) setCible((x) => ({ ...x, ocr: false }));
      } catch (e) {
        if (!fini) setErreur(e?.message || "Le PDF ne s'affiche pas");
      }
    })();
    return () => { fini = true; d?.destroy?.(); };
  }, [url, pageDite, citation]);

  const base = Math.max(280, largeurCadre - 34);
  const largeur = Math.round(base * zoom);
  // On arrive sur le passage (ou la page dite), une fois la page posée.
  const amene = useRef(null);
  useEffect(() => {
    if (!doc || !largeurCadre) return;
    const cle = `${cible.page}:${cible.marques.length}`;
    if (amene.current === cle) return;
    amene.current = cle;
    requestAnimationFrame(() => {
      if (premiere.current) premiere.current.scrollIntoView({ block: "center" });
      else pages.current[cible.page - 1]?.scrollIntoView({ block: "start" });
    });
  }, [doc, cible, largeurCadre]);
  useEffect(() => { amene.current = null; }, [url, pageDite, citation]);
  // Le numéro de la page lue suit le défilement.
  const surDefilement = () => {
    const el = cadre.current;
    if (!el) return;
    const repere = el.getBoundingClientRect().top + el.clientHeight / 3;
    let n = 1;
    pages.current.forEach((p, i) => { if (p && p.getBoundingClientRect().top <= repere) n = i + 1; });
    setCourante(n);
  };
  // Le zoom garde sous les yeux ce qu'on lisait.
  const zoomer = (sens) => setZoom((z) => {
    const i = ZOOMS.indexOf(z);
    const suivant = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + sens))];
    const el = cadre.current;
    if (el && suivant !== z) {
      const r = suivant / z;
      const haut = el.scrollTop + el.clientHeight / 2;
      const gauche = el.scrollLeft + el.clientWidth / 2;
      requestAnimationFrame(() => { el.scrollTop = haut * r - el.clientHeight / 2; el.scrollLeft = gauche * r - el.clientWidth / 2; });
    }
    return suivant;
  });
  const zoomerRef = useRef(zoomer);
  zoomerRef.current = zoomer;
  useEffect(() => {
    const el = cadre.current;
    if (!el) return undefined;
    let cumul = 0;
    const molette = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      cumul += e.deltaY;
      if (Math.abs(cumul) < 40) return;
      zoomerRef.current(cumul < 0 ? 1 : -1);
      cumul = 0;
    };
    el.addEventListener("wheel", molette, { passive: false });
    return () => el.removeEventListener("wheel", molette);
  }, []);

  const boutonZoom = "grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre disabled:opacity-40";
  return (
    <div ref={cadre} onScroll={surDefilement} className="relative flex-1 overflow-auto bg-fond">
      {/* Le zoom et la page lue, en haut à gauche ; plus de flèches pour changer de page : on fait défiler. */}
      <div className="sticky left-0 top-0 z-10 flex h-0 items-start gap-2 px-3 pt-3">
        <span className="flex items-center gap-0.5 rounded-full bg-surface-pleine/90 px-1 py-0.5 text-[12px] text-ardoise shadow-[0_6px_18px_rgb(0_0_0/0.18)]">
          <button type="button" onClick={() => zoomer(-1)} disabled={zoom <= ZOOMS[0]} className={boutonZoom} style={{ background: "transparent" }} aria-label="Dézoomer" title="Dézoomer"><Minus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-[42px] rounded-full px-1 tabular-nums hover:text-encre" style={{ background: "transparent" }} title="Largeur du panneau">{Math.round(zoom * 100)} %</button>
          <button type="button" onClick={() => zoomer(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} className={boutonZoom} style={{ background: "transparent" }} aria-label="Zoomer" title="Zoomer"><Plus className="h-3.5 w-3.5" /></button>
          {tailles.length > 1 && <span className="border-l border-trait pl-2 pr-2 tabular-nums">{courante} / {tailles.length}</span>}
        </span>
        {cible.ocr && <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-pleine/90 shadow-[0_6px_18px_rgb(0_0_0/0.18)]" title="Lecture du scan pour retrouver le passage"><Loader2 className="h-4 w-4 animate-spin text-ambre" /></span>}
      </div>
      {erreur ? (
        <PasAffichable />
      ) : !doc || !largeurCadre ? (
        <div className="grid h-full min-h-[200px] place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brume" /></div>
      ) : (
        <div className="flex w-max min-w-full flex-col items-center gap-3 px-4 pb-6 pt-14">
          {tailles.map((t, i) => (
            <PageRendue key={i} doc={doc} n={i + 1} largeur={largeur} taille={t} marques={cible.page === i + 1 ? cible.marques : []}
              premiere={cible.page === i + 1 ? premiere : undefined} onRef={(el) => { pages.current[i] = el; }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Une source seule : la page du PDF et son passage surligné, sans barre ni citation ; le texte surligné pour le reste. */
export function SourceSeule({ dealId, doc, page = null, citation = null }) {
  const { data: local, isLoading, isError } = useQuery({
    queryKey: ["fichier-source", doc.url],
    queryFn: async () => {
      const blob = await base44.fichier(doc.url);
      return { url: URL.createObjectURL(blob), type: blob.type || null };
    },
    enabled: !!doc.url,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
  const estPdf = /pdf/i.test(local?.type || doc.mime || doc.url || "");
  if (isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brume" /></div>;
  if (isError || !local) return <PasAffichable />;
  if (estPdf) return <PagePdfSurlignee url={local.url} page={page} citation={citation} />;
  // Une photo ou une image : l'image elle-même, jamais son texte (29 oct. 2026, Jules : « même si c'est une photo
  // je veux voir la photo »). Le texte lu ne reste que pour ce qu'un navigateur ne sait pas montrer (Word, Excel).
  if (/^image\//i.test(local.type || doc.mime || "") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(doc.nom || doc.url || "")) return <ImageSurlignee url={local.url} citation={citation} />;
  // Un fichier Word : mis en page par mammoth, sur une feuille blanche, le paragraphe cité surligné.
  if (/wordprocessingml|msword/i.test(local.type || doc.mime || "") || /\.docx$/i.test(doc.nom || doc.url || "")) return <WordSurligne url={local.url} citation={citation} />;
  return <div className="flex-1 overflow-y-auto"><TextePage dealId={dealId} documentId={doc.id} page={page} citation={citation} /></div>;
}

/** Une pièce qui ne s'affiche pas : l'icône d'un document classique, au centre (29 oct. 2026, Jules). */
function PasAffichable() {
  return (
    <div className="grid flex-1 place-items-center px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <DocumentClassique taille={64} />
        <p className="m-0 text-[12.5px] text-ardoise">Cette pièce ne s'affiche pas ici.</p>
      </div>
    </div>
  );
}

const sansAccents = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Une pièce Word, telle qu'on la lirait : sa mise en page simple (titres, paragraphes, tableaux), le passage cité surligné. */
function WordSurligne({ url, citation = null }) {
  const feuille = useRef(null);
  const [etat, setEtat] = useState({ html: null, erreur: false });
  useEffect(() => {
    let fini = false;
    (async () => {
      try {
        const m = await import("mammoth/mammoth.browser.js");
        const lib = m.default || m;
        const r = await lib.convertToHtml({ arrayBuffer: await (await fetch(url)).arrayBuffer() });
        if (!fini) setEtat({ html: r.value, erreur: false });
      } catch {
        if (!fini) setEtat({ html: null, erreur: true });
      }
    })();
    return () => { fini = true; };
  }, [url]);
  useEffect(() => {
    const el = feuille.current;
    if (!el || !etat.html || !citation) return;
    const debut = sansAccents(citation).slice(0, 48);
    const bloc = [...el.querySelectorAll("p, li, td, h1, h2, h3")].find((b) => sansAccents(b.textContent).includes(debut));
    if (bloc) { bloc.classList.add("k-passage-cite"); bloc.scrollIntoView({ block: "center" }); }
  }, [etat.html, citation]);
  if (etat.erreur) return <PasAffichable />;
  if (!etat.html) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-brume" /></div>;
  return (
    <div className="flex-1 overflow-y-auto bg-fond p-4">
      {/* La feuille reste blanche et son texte noir quel que soit le thème : c'est la pièce, pas l'interface. */}
      <div ref={feuille} className="k-feuille-word mx-auto max-w-[720px] rounded-[4px] bg-white px-10 py-12 text-[13.5px] leading-[1.6] text-black shadow-[0_8px_30px_rgb(0_0_0/0.3)] max-md:px-5" dangerouslySetInnerHTML={{ __html: etat.html }} />
    </div>
  );
}

/** Une pièce en image, le passage cité surligné dessus par l'OCR, comme sur un scan. */
function ImageSurlignee({ url, citation = null }) {
  const image = useRef(null);
  const [marques, setMarques] = useState([]);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState(false);
  const premiere = useRef(null);
  const chargee = async () => {
    const el = image.current;
    if (!el || !citation) return;
    setLecture(true);
    try {
      const k0 = Math.min(1, 2000 / el.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.round(el.naturalWidth * k0);
      c.height = Math.round(el.naturalHeight * k0);
      c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
      const mots = await motsDeLImage(url, c);
      const f = fenetreDuPassage(mots, citation);
      const k = el.clientWidth / c.width;
      setMarques(f ? mots.slice(f[0], f[1] + 1).map((m) => ({ left: m.bbox.x0 * k, top: m.bbox.y0 * k - 1, width: (m.bbox.x1 - m.bbox.x0) * k, height: (m.bbox.y1 - m.bbox.y0) * k + 2 })) : []);
    } catch { /* l'image reste, sans surlignage */ }
    setLecture(false);
  };
  useEffect(() => { premiere.current?.scrollIntoView({ block: "center" }); }, [marques]);
  if (erreur) return <PasAffichable />;
  return (
    <div className="flex-1 overflow-y-auto bg-fond">
      <div className="relative mx-auto w-full">
        <img ref={image} src={url} alt="" onLoad={chargee} onError={() => setErreur(true)} className="block h-auto w-full" draggable={false} />
        {marques.map((m, i) => (
          <span key={i} ref={i === 0 ? premiere : undefined} className="pointer-events-none absolute rounded-[2px] bg-ambre/40 mix-blend-multiply ring-1 ring-ambre/60"
            style={{ left: m.left, top: m.top, width: m.width, height: m.height }} />
        ))}
        {lecture && <span className="absolute bottom-3 left-3 grid h-8 w-8 place-items-center rounded-full bg-surface-pleine/90 shadow-[0_6px_18px_rgb(0_0_0/0.18)]" title="Lecture de l'image pour retrouver le passage"><Loader2 className="h-4 w-4 animate-spin text-ambre" /></span>}
      </div>
    </div>
  );
}

export function Visionneuse({ extraction, ligne, onFermer, dealId = null, hauteur = null }) {
  const page = ligne?.page || null;
  // Le document est rapporté par le client authentifié, puis affiché depuis la
  // mémoire du navigateur. Un <iframe src="/uploads/…"> n'emporte ni le jeton
  // de fenêtre ni l'origine de l'API : le cadre restait blanc pendant que le
  // passage cité, lui, s'affichait — c'est qu'il passe par l'API.
  const { data: local, isLoading: chargementFichier, isError: erreurFichier } = useQuery({
    queryKey: ["fichier-source", extraction.document_url],
    queryFn: async () => {
      const blob = await base44.fichier(extraction.document_url);
      return { url: URL.createObjectURL(blob), type: blob.type || null };
    },
    enabled: !!extraction.document_url,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
  // L'objet créé pour le cadre doit être rendu, sinon la mémoire le garde.
  useEffect(() => () => { if (local?.url) URL.revokeObjectURL(local.url); }, [local?.url]);

  const url = local?.url ? (page && /pdf/i.test(local.type || extraction.document_url || "") ? `${local.url}#page=${page}` : local.url) : lienSource(extraction.document_url, page);
  const affichable = lisibleEnCadre(extraction.document_url, local?.type || extraction.document_mime);
  const estPdf = /pdf/i.test(local?.type || extraction.document_mime || extraction.document_url || "");
  // Le passage d'abord : le texte de la page avec la citation surlignée. Le
  // PDF reste à un clic, ouvert à la bonne page.
  const peutSurligner = !!(dealId && extraction.document_id && ligne?.citation);
  // Un PDF s'ouvre sur sa page, le passage surligné dessus ; « Texte » garde la page en texte brut.
  const [vue, setVue] = useState("document");
  useEffect(() => { setVue("document"); }, [extraction.document_id, page, ligne?.citation]);

  return (
    <div className={`bg-surface border border-trait rounded-md overflow-hidden flex flex-col ${hauteur || "h-[560px] lg:sticky lg:top-4 [.panneau-source_&]:h-[calc(100vh-32px)] max-md:[.panneau-source_&]:h-[calc(100dvh-32px)] [.panneau-source_&]:static"}`}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bord flex-shrink-0">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[12.5px] text-encre truncate">{extraction.document_nom}</p>
          <p className="m-0 text-[11px] text-brume truncate">
            {ligne?.element}{page ? ` · page ${page}` : ""}
          </p>
        </div>
        {peutSurligner && (
          <span className="inline-flex items-center rounded-full border border-bord-doux p-0.5 flex-shrink-0">
            {[["document", "Document"], ["passage", "Texte"]].map(([id, mot]) => (
              <button key={id} onClick={() => setVue(id)} className={`px-2.5 py-0.5 rounded-full text-[11px] transition-colors ${vue === id ? "bg-menthe rounded-full text-sur-menthe font-semibold" : "text-ardoise hover:text-encre"}`}>{mot}</button>
            ))}
          </span>
        )}
        {local?.url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-menthe-clair hover:text-encre transition-colors flex-shrink-0"
          >
            Plein écran
          </a>
        )}
        <button onClick={onFermer} className="text-brume hover:text-encre transition-colors flex-shrink-0 max-md:-m-2 max-md:p-2" title="Fermer" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {vue === "passage" && peutSurligner ? (
        <div className="flex-1 overflow-y-auto">
          <TextePage dealId={dealId} documentId={extraction.document_id} page={page} citation={ligne.citation} />
        </div>
      ) : chargementFichier ? (
        <div className="flex-1 flex items-center justify-center">
          <PenseeIA etat="breathing" taille={20} texte="Ouverture du document…" />
        </div>
      ) : erreurFichier ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="m-0 text-[12.5px] text-alerte">Le document n'a pas pu être ouvert.</p>
          <p className="m-0 text-[12.5px] text-brume">Il a peut-être été supprimé du dossier, ou votre session a expiré.</p>
        </div>
      ) : estPdf && local?.url ? (
        <PagePdfSurlignee url={local.url} page={page} citation={ligne?.citation || null} />
      ) : affichable ? (
        <>
          <iframe
            key={url}
            src={url}
            title={extraction.document_nom}
            className={`flex-1 w-full bg-fond border-0 ${estPdf ? "max-md:hidden" : ""}`}
          />
          {/* Au téléphone, un PDF dans un cadre ne montre que sa première
              page (iOS) ou rien du tout (Android) : on l'ouvre à part. */}
          {estPdf && (
            <div className="flex-1 flex-col items-center justify-center gap-3 px-6 text-center hidden max-md:flex">
              <p className="m-0 text-[12.5px] text-ardoise">Le document s'ouvre dans la visionneuse du téléphone{page ? `, page ${page}` : ""}.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">Ouvrir le document</a>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="m-0 text-[12.5px] text-ardoise">
            Ce format ne s'affiche pas dans le navigateur.
          </p>
          <a href={url} download={extraction.document_nom || true} className="text-[12.5px] text-menthe-clair hover:text-encre transition-colors">
            Télécharger le document
          </a>
        </div>
      )}

    </div>
  );
}


export function TableExtraction({ extraction, dealId, onSupprimer = undefined, onRefresh }) {
  const [recherche, setRecherche] = useState("");
  const [edition, setEdition] = useState(null); // { index, champ }
  // Ligne dont la source est ouverte dans la visionneuse, à droite.
  const [ligneOuverte, setLigneOuverte] = useState(null);
  // Le relevé est là dès l'ouverture — c'est lui qu'on vient lire ; la revue
  // des points à regarder le précède, elle ne le remplace pas.
  const [tableOuverte, setTableOuverte] = useState(true);
  // Un constat long tient en trois lignes ; un clic le déplie.
  const [deplies, setDeplies] = useState(() => new Set());
  const basculerDepli = (i) =>
    setDeplies((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  // Une analyse ratée se relance sur le même document.
  const reessayer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/espace/extraire`, { body: { documents: [extraction.document_id] } }),
    onSuccess: () => { toast.success("Analyse relancée"); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Relance impossible"),
  });

  const majLigne = useMutation({
    mutationFn: ({ index, ...patch }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/espace/extractions/${extraction.id}/lignes/${index}`, { body: patch }),
    onSuccess: () => { setEdition(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });

  const lignes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const toutes = (extraction.lignes || []).map((l, index) => ({ ...l, index }));
    if (!q) return toutes;
    return toutes.filter(
      (l) => l.element.toLowerCase().includes(q) || String(l.constat).toLowerCase().includes(q)
    );
  }, [extraction.lignes, recherche]);

  if (extraction.erreur) {
    return (
      <div className="border-t border-bord py-10 text-center">
        <p className="m-0 text-[13.5px] text-alerte">L'analyse a échoué : {extraction.erreur}</p>
        <p className="m-0 mt-2 text-[12.5px] text-brume">
          Le plus souvent : quota du modèle atteint, ou document illisible (scan sans texte). Relancez — le document est relu tel quel.
        </p>
        <button
          onClick={() => reessayer.mutate()}
          disabled={reessayer.isPending}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-menthe rounded-full text-sur-menthe text-[11px] tracking-[.14em] uppercase font-semibold rounded-[10px] hover:bg-menthe-survol disabled:opacity-50"
        >
          {reessayer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Relancer l'analyse
        </button>
      </div>
    );
  }

  const vigilances = (extraction.lignes || []).map((l, index) => ({ ...l, index })).filter((l) => l.statut === "Point de vigilance");
  const aVerifier = (extraction.lignes || []).map((l, index) => ({ ...l, index })).filter((l) => l.statut === "À vérifier");
  const total = (extraction.lignes || []).length;
  const renseignees = (extraction.lignes || []).filter((l) => l.constat).length;
  // Une grille attendue (bail, diagnostics…) : ce que le document couvre, et
  // ce qu'il laisse aux autres pièces. Sans grille, on compte simplement.
  const avecGrille = !!extraction.type && total > 0;
  const absents = avecGrille ? (extraction.lignes || []).filter((l) => !l.constat).map((l) => l.element) : [];
  const couverture = avecGrille
    ? `${renseignees} des ${total} points de la grille ${LIBELLE_TYPE[extraction.type] || ""}`.trim()
    : `${renseignees} point${renseignees > 1 ? "s" : ""} relevé${renseignees > 1 ? "s" : ""}`;

  return (
    <div>
      {/* --- L'analyse en tête : ce qu'elle est, ce qu'elle a trouvé --------- */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-5 border-b border-relief">
        <div className="min-w-0">
          <h3 className="m-0 text-[24px] max-md:text-[18px] font-bold tracking-[-.015em] text-encre">{nomOnglet(extraction)}</h3>
          <p className="m-0 mt-1 text-[12.5px] text-brume">
            {[
              couverture,
              extraction.extrait_par,
              extraction.extrait_le ? ilYA(extraction.extrait_le) : null,
            ].filter(Boolean).join(" · ")}
          </p>
          {absents.length > 0 && (
            <p className="m-0 mt-1.5 text-[12.5px] text-ambre">
              Ce document ne traite pas : {absents.join(", ")} — à obtenir séparément.
            </p>
          )}
        </div>
        <div className="flex items-center gap-5 text-[12.5px] flex-shrink-0">
          {vigilances.length > 0 && <span className="font-semibold text-alerte">{vigilances.length} vigilance{vigilances.length > 1 ? "s" : ""}</span>}
          {aVerifier.length > 0 && <span className="font-semibold text-bleu">{aVerifier.length} à vérifier</span>}
          {!vigilances.length && !aVerifier.length && <span className="text-vert font-semibold">Rien à signaler</span>}
        </div>
      </div>

      {extraction.synthese && (
        <p className="m-0 mt-5 text-[13.5px] leading-[1.75] text-craie border-l-2 border-relief pl-4">{extraction.synthese}</p>
      )}

      {/* --- Ce qui décide, en deux colonnes -------------------------------- */}
      {(vigilances.length > 0 || aVerifier.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] gap-x-8 gap-y-8 py-7">
          <Colonne titre="Points de vigilance" teinte={J["alerte"]} lignes={vigilances} onOuvrir={setLigneOuverte} />
          <div className="hidden xl:block w-px h-full bg-relief" />
          <Colonne titre="À vérifier" teinte={J["bleu"]} lignes={aVerifier} onOuvrir={setLigneOuverte} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pt-1">
        <button
          onClick={() => setTableOuverte((v) => !v)}
          className="inline-flex items-center gap-2 text-[12.5px] text-ardoise hover:text-encre transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tableOuverte ? "" : "-rotate-90"}`} />
          Données extraites ({(extraction.lignes || []).length})
        </button>
        <div className={`flex items-center gap-2.5 ${tableOuverte ? "" : "hidden"}`}>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher"
            className="bg-surface border border-trait focus:border-menthe/60 rounded-md px-3.5 py-1.5 text-[12.5px] text-encre outline-none placeholder:text-brume transition-colors w-[170px] max-md:text-[16px]"
          />
          <button onClick={() => onSupprimer?.(extraction.id)} className="text-[12.5px] text-brume hover:text-red-400 transition-colors" title="Retirer cette extraction">
            Retirer
          </button>
        </div>
      </div>

      <div className={`${tableOuverte || ligneOuverte ? "" : "hidden"} ${ligneOuverte ? "grid lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-5 items-start" : ""}`}>
      <div className="overflow-x-auto min-w-0">
        <table
          className={`w-full border-collapse ${ligneOuverte ? "min-w-[560px]" : "min-w-[860px]"}
            [&_th]:border-r [&_td]:border-r [&_th]:border-bord [&_td]:border-bord
            [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0
            [&_th]:pl-3 [&_td]:pl-3`}
        >
          <thead>
            <tr className="border-y border-bord-doux">
              {(ligneOuverte
                ? [["Élément", "w-[24%]"], ["Constat / valeur relevée", "w-[40%]"], ["Source", "w-[12%]"], ["Commentaire", "w-[24%]"]]
                : [["Élément", "w-[22%]"], ["Constat / valeur relevée", "w-[38%]"], ["Source", "w-[12%]"], ["Commentaire", "w-[28%]"]]
              ).map(([h, cls]) => (
                <th key={h} className={`py-2.5 text-[11px] tracking-[0.16em] uppercase text-encre font-normal text-left ${cls}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const lien = lienSource(extraction.document_url, l.page);
              const ouverte = ligneOuverte?.index === l.index;
              const nouveauBloc = l.bloc && (i === 0 || lignes[i - 1].bloc !== l.bloc);
              const teinte = l.statut === "Point de vigilance" ? J["alerte"] : l.statut === "À vérifier" ? J["ambre"] : l.statut === "Conforme" ? J["menthe"] : J["bord-vif"];
              return (
                <React.Fragment key={l.index}>
                {nouveauBloc && (
                  <tr className="border-b border-bord bg-surface">
                    <td colSpan={4} className="py-2 text-[11px] tracking-[.16em] uppercase text-menthe-clair">{l.bloc}</td>
                  </tr>
                )}
                <tr
                  className={`border-b border-bord transition-colors align-top ${ouverte ? "bg-menthe/[0.07]" : "hover:bg-encre/[0.02]"}`}
                >
                  <td className="py-3 pr-4 text-[12.5px] text-encre">
                    <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: teinte }} title={l.statut || "Non renseigné"} />
                    {l.element}
                  </td>

                  <td className="py-3 pr-4">
                    {edition?.index === l.index && edition.champ === "constat" ? (
                      <textarea
                        autoFocus
                        rows={2}
                        defaultValue={l.constat}
                        onBlur={(e) => majLigne.mutate({ index: l.index, constat: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEdition(null); }}
                        className="w-full bg-fond border border-menthe rounded px-2 py-1 text-[12.5px] text-encre outline-none resize-y max-md:text-[16px]"
                      />
                    ) : (
                      <button
                        onClick={() => (deplies.has(l.index) ? setEdition({ index: l.index, champ: "constat" }) : basculerDepli(l.index))}
                        className="block w-full text-left text-[13.5px] text-encre hover:text-menthe-clair transition-colors"
                        title={deplies.has(l.index) ? "Cliquer pour corriger" : "Cliquer pour tout lire"}
                      >
                        <span className={deplies.has(l.index) ? "" : "line-clamp-3"}>
                          {l.constat || <span className="text-bord-vif">—</span>}
                        </span>
                        {l.citation && deplies.has(l.index) && (
                          <span className="block mt-1 text-[11px] text-brume italic leading-[1.5]">« {l.citation} »</span>
                        )}
                        {!deplies.has(l.index) && String(l.constat || "").length > 150 && (
                          <span className="block mt-0.5 text-[11px] text-brume">tout lire</span>
                        )}
                      </button>
                    )}
                  </td>


                  <td className="py-3 pr-4 whitespace-nowrap">
                    {lien ? (
                      <button
                        onClick={() => setLigneOuverte(ligneOuverte?.index === l.index ? null : l)}
                        className={`text-[12.5px] transition-colors ${ouverte ? "text-encre underline" : "text-menthe-clair hover:text-encre"}`}
                        title={l.citation || "Afficher le document ici"}
                      >
                        {l.page ? `page ${l.page}` : "voir"}
                      </button>
                    ) : (
                      <span className="text-[12.5px] text-brume">—</span>
                    )}
                  </td>

                  <td className="py-3 pr-4">
                    {edition?.index === l.index && edition.champ === "commentaire" ? (
                      <textarea
                        autoFocus
                        rows={2}
                        defaultValue={l.commentaire}
                        onBlur={(e) => majLigne.mutate({ index: l.index, commentaire: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setEdition(null); }}
                        className="w-full bg-fond border border-menthe rounded px-2 py-1 text-[12.5px] text-encre outline-none resize-y max-md:text-[16px]"
                      />
                    ) : (
                      <button
                        onClick={() => setEdition({ index: l.index, champ: "commentaire" })}
                        className="block w-full text-left text-[12.5px] text-ardoise hover:text-encre transition-colors"
                        title="Cliquer pour commenter"
                      >
                        {l.commentaire || <span className="text-brume">+ commenter</span>}
                      </button>
                    )}
                  </td>

                </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {ligneOuverte && (
        <Visionneuse extraction={extraction} ligne={ligneOuverte} onFermer={() => setLigneOuverte(null)} />
      )}
      </div>
    </div>
  );
}

// Le modèle redit parfois le constat dans le commentaire : on ne l'écrit
// qu'une fois. Comparaison à la ponctuation et aux accents près.
const aplati = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const memeTexte = (a, b) => {
  const x = aplati(a);
  const y = aplati(b);
  if (!x || !y) return false;
  return x === y || (x.length > 24 && (y.includes(x) || x.includes(y)));
};

// Une colonne de la revue : le point, ce que dit le document, ce qu'on en
// pense. Au-delà de deux points, le reste se déplie.
function Colonne({ titre, teinte, lignes, onOuvrir }) {
  const [tout, setTout] = useState(false);
  if (!lignes.length) return <div />;
  const montres = tout ? lignes : lignes.slice(0, 2);
  const reste = lignes.length - montres.length;
  return (
    <section className="min-w-0 flex flex-col gap-6">
      <p className="m-0 text-[12.5px] tracking-[.16em] uppercase font-semibold" style={{ color: teinte }}>{titre}</p>
      {montres.map((l) => (
        <button
          key={l.index}
          onClick={() => onOuvrir?.(l)}
          title={l.page ? `Ouvrir le document page ${l.page}` : undefined}
          className="text-left flex flex-col gap-2 group"
        >
          <span className="text-[15px] font-semibold text-encre group-hover:text-menthe transition-colors">{l.element}</span>
          {l.constat && <span className="text-[13.5px] leading-[1.65] text-craie">{l.constat}</span>}
          {l.commentaire && !memeTexte(l.commentaire, l.constat) && (
            <span className="text-[13.5px] leading-[1.6]" style={{ color: teinte === J["alerte"] ? J["ambre"] : teinte }}>→ {l.commentaire}</span>
          )}
        </button>
      ))}
      {reste > 0 && (
        <button onClick={() => setTout(true)} className="text-left text-[12.5px] text-brume hover:text-craie transition-colors">
          + {reste} autre{reste > 1 ? "s" : ""} point{reste > 1 ? "s" : ""}
        </button>
      )}
    </section>
  );
}

// Depuis quand : « il y a 18 h », « il y a 3 j ».
function ilYA(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "";
  const h = Math.round(ms / 3600000);
  if (h < 1) return "à l'instant";
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

// L'onglet d'une analyse porte la nature du document, pas son nom de fichier.
export function nomOnglet(e) {
  if (e.titre) return e.titre;
  const nature = LIBELLE_TYPE[e.type] || (e.document_categorie || "").toLowerCase();
  return nature ? `Analyse ${nature}` : `Analyse — ${e.document_nom}`;
}

export default function AnalyseDocuments({ dossier, coches, onCocher, onRefresh, apercu = false, onglet: ongletDemande, onOnglet }) {
  const [ongletLocal, setOngletLocal] = useState("dossier");
  // L'onglet peut être piloté depuis « Requêtes récentes » : le parent en tient
  // alors l'état, sinon on le garde ici.
  const onglet = ongletDemande ?? ongletLocal;
  const setOnglet = (v) => { setOngletLocal(v); onOnglet?.(v); };
  const extractions = dossier?.extractions || [];

  const [renommage, setRenommage] = useState(null);

  const renommer = useMutation({
    mutationFn: ({ id, titre }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extractions/${id}/renommer`, { body: { titre } }),
    onSuccess: () => { setRenommage(null); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Renommage impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/extractions/${id}`),
    onSuccess: () => { setOnglet("documents"); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const actif = extractions.find((e) => e.id === onglet) || null;

  return (
    <div>
      {/* --- À gauche les analyses, à droite celle qu'on lit ------------- */}
      <div className="flex max-lg:flex-col gap-0 border border-relief rounded-[18px] overflow-hidden bg-fond">
        <nav className="w-[264px] max-lg:w-full flex-none border-r max-lg:border-r-0 max-lg:border-b border-relief py-5 flex flex-col">
          <button
            onClick={() => setOnglet("dossier")}
            className={`w-full text-left px-6 py-2.5 mb-3 border-l-2 text-[13.5px] transition-colors ${
              onglet === "dossier" ? "border-alerte bg-alerte/[0.05] text-encre font-semibold" : "border-transparent text-ardoise hover:text-encre"
            }`}
          >
            Le dossier
          </button>
          {extractions.length > 0 && (
            <>
              <p className="m-0 px-6 pb-3 text-[11px] tracking-[.16em] uppercase text-brume">Par document</p>
              {extractions.map((e) => {
                const choisi = onglet === e.id;
                const total = (e.lignes || []).filter((l) => l.constat).length;
                const vigilances = (e.lignes || []).filter((l) => l.statut === "Point de vigilance").length;
                return renommage?.id === e.id ? (
                  <input
                    key={e.id}
                    autoFocus
                    defaultValue={renommage.titre}
                    onBlur={(ev) => renommer.mutate({ id: e.id, titre: ev.target.value })}
                    onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); if (ev.key === "Escape") setRenommage(null); }}
                    className="mx-6 my-1 bg-fond border border-menthe rounded px-2 py-1 text-[13.5px] text-encre outline-none max-md:text-[16px]"
                  />
                ) : (
                  <button
                    key={e.id}
                    onClick={() => (choisi ? setRenommage({ id: e.id, titre: nomOnglet(e) }) : setOnglet(e.id))}
                    onDoubleClick={() => setRenommage({ id: e.id, titre: nomOnglet(e) })}
                    title={choisi ? "Cliquer pour renommer" : e.document_nom}
                    className={`w-full text-left px-6 py-2.5 border-l-2 flex items-baseline justify-between gap-3 transition-colors ${
                      choisi ? "border-alerte bg-alerte/[0.05] text-encre" : "border-transparent text-ardoise hover:text-encre"
                    }`}
                  >
                    <span className={`text-[13.5px] truncate ${choisi ? "font-semibold" : ""}`}>{nomOnglet(e)}</span>
                    <span
                      className="text-[11px] flex-none"
                      title={e.erreur ? "L'analyse a échoué" : vigilances ? `${vigilances} point(s) de vigilance` : total === 0 ? "Rien relevé dans ce document" : "Rien à signaler"}
                      style={{ color: e.erreur ? J["alerte"] : vigilances ? J["alerte"] : total === 0 ? J["brume"] : J["vert"] }}
                    >
                      {e.erreur ? "échec" : vigilances ? `${vigilances} ⚑` : total === 0 ? "vide" : "ok"}
                    </span>
                  </button>
                );
              })}
              <div className="h-px bg-relief mx-6 my-3.5" />
            </>
          )}
          {[
            ["documents", "Documents"],
            ...(extractions.length ? [["donnees", "Données extraites"]] : []),
            ["simulateur", "Simulateur"],
          ].map(([id, libelle]) => (
            <button
              key={id}
              onClick={() => setOnglet(id)}
              className={`w-full text-left px-6 py-2.5 border-l-2 text-[13.5px] transition-colors ${
                onglet === id ? "border-alerte bg-alerte/[0.05] text-encre font-semibold" : "border-transparent text-ardoise hover:text-encre"
              }`}
            >
              {libelle}
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 px-9 max-md:px-5 py-7">
      {onglet === "dossier" ? (
        <LectureDossier dealId={dossier.deal_id} nbExtractions={extractions.length} />
      ) : onglet === "simulateur" ? (
        <SimulateurAnalyse dossier={dossier} />
      ) : onglet === "donnees" ? (
        <DonneesExtraites dossier={dossier} apercu={apercu} />
      ) : onglet === "documents" || !actif ? (
        <DocumentsDossier dossier={dossier} coches={coches} onCocher={onCocher} onRefresh={onRefresh} apercu={apercu} proposerDrive />
      ) : (
        <TableExtraction extraction={actif} dealId={dossier.deal_id} onSupprimer={(id) => supprimer.mutate(id)} onRefresh={onRefresh} />
      )}
        </div>
      </div>
    </div>
  );
}
