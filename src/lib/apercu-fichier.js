// La vignette d'une pièce jointe dans le chat (19 oct. 2026, Jules : « une image comme ça du document si on en
// importe un dans le message ») : la première page d'un PDF, ou l'image elle-même, en petit JPEG. Un Word, un mail
// ou un texte n'ont pas de vignette : la carte n'affiche que son type. Ne jette jamais : sans vignette, le message
// part quand même.

const LARGEUR = 240;

/** Pure : le type affiché sur la carte d'une pièce (« PDF », « DOC », « IMG », « MAIL »…). */
export function genreDeFichier(nom = "", mime = "") {
  const n = String(nom).toLowerCase();
  if (/\.pdf$/.test(n) || /pdf/.test(mime)) return "PDF";
  if (/\.(png|jpe?g|webp|gif|heic)$/.test(n) || /^image\//.test(mime)) return "IMG";
  if (/\.(docx?|rtf)$/.test(n)) return "DOC";
  if (/\.eml$/.test(n)) return "MAIL";
  if (/\.(csv|xlsx?)$/.test(n)) return "TABLE";
  return (n.match(/\.([a-z0-9]{1,4})$/)?.[1] || "FICHIER").toUpperCase();
}

/** Pure : « 📎 nom.pdf — la phrase » (le texte gardé dans le fil) → { nom, texte } ; null si ce n'est pas une pièce. */
export function pieceDuTexte(contenu) {
  const m = /^📎\s*(.+?)(?:\s+—\s+([\s\S]*))?$/.exec(String(contenu || ""));
  return m ? { nom: m[1], texte: m[2] || "" } : null;
}

function enJpeg(source, largeurSource, hauteurSource) {
  const echelle = Math.min(1, LARGEUR / largeurSource);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(largeurSource * echelle));
  c.height = Math.max(1, Math.round(hauteurSource * echelle));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "white"; // le fond d'une page de document, pas une couleur de l'interface
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

async function vignettePdf(fichier) {
  const lib = await import("pdfjs-dist");
  const { default: worker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  lib.GlobalWorkerOptions.workerSrc = worker;
  const doc = await lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vue = page.getViewport({ scale: (LARGEUR * 2) / base.width });
    const c = document.createElement("canvas");
    c.width = Math.ceil(vue.width);
    c.height = Math.ceil(vue.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vue, canvas: c }).promise;
    return enJpeg(c, c.width, c.height);
  } finally {
    await doc.destroy();
  }
}

async function vignetteImage(fichier) {
  const bmp = await createImageBitmap(fichier);
  try { return enJpeg(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
}

/** La vignette (data URL JPEG) d'un fichier, ou null. */
export async function apercuDuFichier(fichier) {
  try {
    const genre = genreDeFichier(fichier?.name, fichier?.type);
    if (genre === "PDF") return await vignettePdf(fichier);
    if (genre === "IMG") return await vignetteImage(fichier);
  } catch { /* sans vignette, le message part quand même */ }
  return null;
}
