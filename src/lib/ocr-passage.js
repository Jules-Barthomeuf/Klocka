// Retrouver une citation sur une page scannée (29 oct. 2026, Jules : « je veux que ça surligne le passage dans le
// bail », un scan sans couche texte). tesseract.js lit la page dans le navigateur et rend chaque mot avec sa boîte ;
// la citation se cherche mot à mot, avec la tolérance qu'il faut à une lecture de scan (accents, lettres mal lues,
// mots coupés). Le moteur et le français viennent du CDN de tesseract.js, une fois, au premier scan ouvert.

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const jetons = (texte) => String(texte || "").split(/\s+/).map(norm).filter((t) => t.length >= 2);

// Deux mots se valent s'ils sont égaux, si l'un commence l'autre (mot coupé), ou à une lettre près au-delà de quatre.
function proches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 5) return false;
  let i = 0;
  let j = 0;
  let ecarts = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i += 1; j += 1; continue; }
    ecarts += 1;
    if (ecarts > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else { i += 1; j += 1; }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1;
}

/**
 * La suite de mots de la page qui porte la citation : [premier, dernier] (indices dans `mots`), ou null.
 * Une fenêtre de la longueur de la citation glisse sur la page ; la meilleure doit retrouver au moins la moitié
 * des mots de la citation. On surligne du premier au dernier mot retrouvé de cette fenêtre.
 */
export function fenetreDuPassage(mots, citation) {
  const cite = jetons(citation);
  if (cite.length < 3 || !mots?.length) return null;
  const page = mots.map((m) => norm(m.text));
  const largeur = Math.min(page.length, cite.length + 4);
  let meilleur = null;
  for (let i = 0; i + 1 <= page.length; i++) {
    const fenetre = page.slice(i, i + largeur);
    const pris = new Set();
    let score = 0;
    for (const c of cite) {
      const k = fenetre.findIndex((m, x) => !pris.has(x) && proches(m, c));
      if (k >= 0) { pris.add(k); score += 1; }
    }
    if (!meilleur || score > meilleur.score) {
      const idx = [...pris];
      meilleur = { score, debut: i + Math.min(...idx), fin: i + Math.max(...idx) };
    }
  }
  return meilleur && meilleur.score >= Math.ceil(cite.length / 2) ? [meilleur.debut, meilleur.fin] : null;
}

let ouvrier = null;
async function lecteur() {
  if (!ouvrier) {
    ouvrier = import("tesseract.js").then(({ createWorker }) => createWorker("fra"));
    ouvrier.catch(() => { ouvrier = null; });
  }
  return ouvrier;
}

const lues = new Map();
/** Les mots d'une image de page (un canvas), avec leur boîte en pixels de cette image. Gardés par clé. */
export async function motsDeLImage(cle, image) {
  if (lues.has(cle)) return lues.get(cle);
  const w = await lecteur();
  const { data } = await w.recognize(image, {}, { blocks: true });
  const mots = (data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => (p.lines || []).flatMap((l) => l.words || []))).filter((m) => m.text?.trim()).map((m) => ({ text: m.text, bbox: m.bbox }));
  lues.set(cle, mots);
  return mots;
}
