// Les convertisseurs de la roue (18 oct. 2026, Jules, d'après Tangerine) :
// tout se fait dans le navigateur, le fichier ne part nulle part. Chaque
// bibliothèque se charge au premier usage (pdf.js, mammoth, docx, jsPDF,
// JSZip), pour ne pas alourdir la page de la Data Room.
import { nomDeSortie } from "@/lib/conversions";

const MIME = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", txt: "text/plain;charset=utf-8",
  html: "text/html;charset=utf-8", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const enBlob = (canvas, type, qualite) => new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image illisible par le navigateur."))), type, qualite));

/** Une image (fichier) dessinée sur un canvas, réduite si `maxCote` ; `fondBlanc` pour un JPG (la transparence y devient noire sinon). */
async function canvasDe(fichier, { maxCote = null, fondBlanc = false } = {}) {
  const bmp = await createImageBitmap(fichier);
  const k = maxCote ? Math.min(1, maxCote / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext("2d");
  // Le fond d'un fichier exporté, pas une couleur de l'interface.
  if (fondBlanc) { ctx.fillStyle = "white"; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

async function ouvrirPdf(fichier) {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
}

/** Le texte d'un PDF, page par page ; un PDF scanné n'en a pas. */
async function textePdf(fichier) {
  const doc = await ouvrirPdf(fichier);
  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const { items } = await page.getTextContent();
    pages.push(items.map((x) => `${x.str || ""}${x.hasEOL ? "\n" : ""}`).join("").replace(/[ \t]+\n/g, "\n").trim());
  }
  await doc.destroy();
  return pages;
}

async function textePdfOuRien(fichier) {
  const pages = await textePdf(fichier);
  if (!pages.join("").trim()) throw new Error("Ce PDF n'a pas de texte : c'est un scan. Convertissez-le en JPG ou PNG.");
  return pages;
}

async function imagesPdf(fichier, format) {
  const doc = await ouvrirPdf(fichier);
  const images = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const vue = page.getViewport({ scale: 2 });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vue.width);
    c.height = Math.ceil(vue.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white"; // le fond d'un fichier exporté, pas une couleur de l'interface
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vue, canvas: c }).promise;
    images.push(await enBlob(c, MIME[format], format === "jpg" ? 0.9 : undefined));
  }
  await doc.destroy();
  return images;
}

/** Du texte en PDF A4, avec les retours à la ligne et les pages qu'il faut. */
async function pdfDuTexte(texte) {
  const { default: JsPDF } = await import("jspdf");
  const pdf = new JsPDF({ unit: "pt", format: "a4" });
  const marge = 56;
  const largeur = pdf.internal.pageSize.getWidth() - marge * 2;
  const bas = pdf.internal.pageSize.getHeight() - marge;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const ligne = 15;
  let y = marge;
  for (const l of pdf.splitTextToSize(String(texte || ""), largeur)) {
    if (y > bas) { pdf.addPage(); y = marge; }
    pdf.text(l, marge, y);
    y += ligne;
  }
  return pdf.output("blob");
}

/** Des paragraphes en DOCX ; `pages` : un saut de page entre chaque bloc. */
async function docxDuTexte(blocs) {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import("docx");
  const enfants = [];
  blocs.forEach((bloc, i) => {
    if (i > 0) enfants.push(new Paragraph({ children: [new PageBreak()] }));
    for (const l of String(bloc || "").split("\n")) enfants.push(new Paragraph({ children: [new TextRun(l)] }));
  });
  return Packer.toBlob(new Document({ sections: [{ children: enfants }] }));
}

async function mammoth() {
  const m = await import("mammoth/mammoth.browser.js");
  return m.default || m;
}

async function zipper(blobs, nom, ext) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const base = nom.replace(/\.[^.]+$/, "");
  blobs.forEach((b, i) => zip.file(`${base} - page ${String(i + 1).padStart(2, "0")}.${ext}`, b));
  return zip.generateAsync({ type: "blob" });
}

const CONVERTISSEURS = {
  "image-jpg": async (f) => enBlob(await canvasDe(f, { fondBlanc: true }), MIME.jpg, 0.92),
  "image-png": async (f) => enBlob(await canvasDe(f), MIME.png),
  "image-webp": async (f) => enBlob(await canvasDe(f), MIME.webp, 0.9),
  "image-compresser": async (f) => enBlob(await canvasDe(f, { maxCote: 2400, fondBlanc: true }), MIME.jpg, 0.7),
  "image-reduire": async (f) => enBlob(await canvasDe(f, { maxCote: 1600, fondBlanc: true }), MIME.jpg, 0.85),
  "image-pdf": async (f) => {
    const { default: JsPDF } = await import("jspdf");
    const c = await canvasDe(f, { maxCote: 3000, fondBlanc: true });
    const pdf = new JsPDF({ unit: "px", format: [c.width, c.height], orientation: c.width > c.height ? "landscape" : "portrait", hotfixes: ["px_scaling"] });
    pdf.addImage(c.toDataURL(MIME.jpg, 0.9), "JPEG", 0, 0, c.width, c.height);
    return pdf.output("blob");
  },
  "pdf-txt": async (f) => new Blob([(await textePdfOuRien(f)).join("\n\n")], { type: MIME.txt }),
  "pdf-docx": async (f) => docxDuTexte(await textePdfOuRien(f)),
  "pdf-jpg": async (f) => imagesPdf(f, "jpg"),
  "pdf-png": async (f) => imagesPdf(f, "png"),
  "docx-txt": async (f) => new Blob([(await (await mammoth()).extractRawText({ arrayBuffer: await f.arrayBuffer() })).value], { type: MIME.txt }),
  "docx-html": async (f) => {
    const { value } = await (await mammoth()).convertToHtml({ arrayBuffer: await f.arrayBuffer() });
    return new Blob([`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${f.name.replace(/[<>&]/g, "")}</title></head><body>${value}</body></html>`], { type: MIME.html });
  },
  "docx-pdf": async (f) => pdfDuTexte((await (await mammoth()).extractRawText({ arrayBuffer: await f.arrayBuffer() })).value),
  "texte-pdf": async (f) => pdfDuTexte(await f.text()),
  "texte-docx": async (f) => docxDuTexte([await f.text()]),
};

/**
 * Convertit un fichier selon un choix de la roue. Rend `{ fichier, nom }` : un
 * File prêt à télécharger ou à ranger dans la Data Room. Un PDF de plusieurs
 * pages en images devient une archive ZIP, une image par page.
 */
export async function convertir(fichier, choix) {
  const faire = CONVERTISSEURS[choix.cle];
  if (!faire) throw new Error("Conversion inconnue.");
  const r = await faire(fichier);
  if (Array.isArray(r)) {
    if (r.length === 1) {
      const nom = nomDeSortie(fichier.name, choix);
      return { fichier: new File([r[0]], nom, { type: MIME[choix.sortie] }), nom };
    }
    const nom = nomDeSortie(fichier.name, choix, { pages: r.length });
    return { fichier: new File([await zipper(r, fichier.name, choix.sortie)], nom, { type: MIME.zip }), nom };
  }
  const nom = nomDeSortie(fichier.name, choix);
  return { fichier: new File([r], nom, { type: MIME[choix.sortie] || r.type }), nom };
}

/** Le fichier converti, posé dans les téléchargements, comme Tangerine le pose à côté de l'original. */
export function telecharger(fichier) {
  const url = URL.createObjectURL(fichier);
  const a = document.createElement("a");
  a.href = url;
  a.download = fichier.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
