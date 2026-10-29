import React, { useEffect, useState } from "react";
import { File } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { pdfjs } from "@/components/preanalyse/AnalyseDocuments";

// La vraie vignette d'une pièce, comme un fichier dans le Finder (29 oct. 2026, Jules : « pas une icône mais une
// vraie preview du doc ») : la première page, dessinée une fois par pièce par pdf.js, gardée le temps de la session.
// Les vignettes se dessinent l'une après l'autre ; en attendant, ou si la pièce ne se lit pas, l'icône d'un document.

const faites = new Map();
let file = Promise.resolve();

function vignette(url, largeur) {
  const cle = `${url}|${largeur}`;
  if (!faites.has(cle)) {
    const travail = file.then(async () => {
      // Le fichier passe par le client authentifié, comme le panneau de la source ; une image se dessine telle quelle.
      const blob = await base44.fichier(url);
      if (/^image\//i.test(blob.type || "") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(url)) return URL.createObjectURL(blob);
      const lib = await pdfjs();
      const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      try {
        const page = await doc.getPage(1);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const v = page.getViewport({ scale: (largeur * dpr) / page.getViewport({ scale: 1 }).width });
        const c = document.createElement("canvas");
        c.width = Math.ceil(v.width);
        c.height = Math.ceil(v.height);
        await page.render({ canvasContext: c.getContext("2d"), canvas: c, viewport: v }).promise;
        return c.toDataURL("image/png");
      } finally {
        doc.destroy();
      }
    });
    file = travail.catch(() => null);
    faites.set(cle, travail.catch(() => null));
  }
  return faites.get(cle);
}

/** L'icône d'un document classique (une page au coin plié), quand la pièce ne s'affiche pas (29 oct. 2026, Jules). */
export function DocumentClassique({ taille = 40, className = "" }) {
  return <File className={`flex-none text-craie ${className}`} style={{ width: taille, height: Math.round(taille * 1.3) }} strokeWidth={1.1} aria-hidden="true" />;
}

export default function MiniaturePiece({ url, largeur = 28, className = "" }) {
  // undefined : en cours ; null : la pièce ne se dessine pas ; sinon l'image de sa première page.
  const [src, setSrc] = useState(undefined);
  useEffect(() => {
    if (!url) { setSrc(null); return undefined; }
    let fini = false;
    setSrc(undefined);
    vignette(url, largeur).then((d) => { if (!fini) setSrc(d || null); });
    return () => { fini = true; };
  }, [url, largeur]);
  const hauteur = Math.round(largeur * 1.3);
  if (src === null) return <DocumentClassique taille={largeur} className={className} />;
  return (
    <span className={`relative block flex-none overflow-hidden rounded-[3px] border border-bord-doux bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)] ${className}`} style={{ width: largeur, height: hauteur }}>
      {src && <img src={src} alt="" onError={() => setSrc(null)} className="h-full w-full object-cover object-top" draggable={false} />}
    </span>
  );
}
