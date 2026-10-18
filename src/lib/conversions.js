// La roue de conversion de la Data Room (18 oct. 2026, Jules, d'après Tangerine) :
// ce qu'on peut faire d'un fichier selon son type. Pur, sans import : le
// catalogue se teste seul, les convertisseurs vivent dans convertir-fichier.js.
//
// Une ligne par choix : la clé que lit le convertisseur, le libellé du secteur,
// le format produit. Ajouter une conversion, c'est ajouter une ligne ici et sa
// fonction là-bas.

const EXTENSIONS = {
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
  docx: ["docx"],
  texte: ["txt", "md", "csv"],
};

export const CATALOGUE = {
  pdf: [
    { cle: "pdf-docx", libelle: "DOCX", sortie: "docx" },
    { cle: "pdf-jpg", libelle: "JPG", sortie: "jpg" },
    { cle: "pdf-png", libelle: "PNG", sortie: "png" },
    { cle: "pdf-txt", libelle: "TXT", sortie: "txt" },
  ],
  image: [
    { cle: "image-jpg", libelle: "JPG", sortie: "jpg" },
    { cle: "image-png", libelle: "PNG", sortie: "png" },
    { cle: "image-webp", libelle: "WEBP", sortie: "webp" },
    { cle: "image-pdf", libelle: "PDF", sortie: "pdf" },
    { cle: "image-compresser", libelle: "Compresser", sortie: "jpg", action: true },
    { cle: "image-reduire", libelle: "Réduire", sortie: "jpg", action: true },
  ],
  docx: [
    { cle: "docx-pdf", libelle: "PDF", sortie: "pdf" },
    { cle: "docx-txt", libelle: "TXT", sortie: "txt" },
    { cle: "docx-html", libelle: "HTML", sortie: "html" },
  ],
  texte: [
    { cle: "texte-pdf", libelle: "PDF", sortie: "pdf" },
    { cle: "texte-docx", libelle: "DOCX", sortie: "docx" },
  ],
};

/** L'extension d'un nom de fichier, en minuscules, sans le point. */
export const extensionDe = (nom) => {
  const m = String(nom || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return m ? m[1] : "";
};

/** Le type d'un fichier pour la roue : pdf, image, docx, texte, ou null (rien à proposer). */
export function typeDe(nom, mime = "") {
  const ext = extensionDe(nom);
  for (const [type, liste] of Object.entries(EXTENSIONS)) if (liste.includes(ext)) return type;
  const m = String(mime || "").toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/") && !m.includes("svg") && !m.includes("heic")) return "image";
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (m.startsWith("text/")) return "texte";
  return null;
}

/** Les secteurs de la roue pour ce fichier ; une conversion vers son propre format est retirée (un JPG ne se convertit pas en JPG). */
export function choixPour(nom, mime = "") {
  const type = typeDe(nom, mime);
  if (!type) return [];
  const ext = extensionDe(nom) === "jpeg" ? "jpg" : extensionDe(nom);
  return CATALOGUE[type].filter((c) => c.action || c.sortie !== ext);
}

/** Le nom du fichier produit, à côté de l'original : « Bail.pdf » en TXT donne « Bail.txt », compressé « Bail compressé.jpg ». */
export function nomDeSortie(nom, choix, { pages = 1 } = {}) {
  const base = String(nom || "fichier").replace(/\.[^.]+$/, "") || "fichier";
  const suffixe = choix.cle === "image-compresser" ? " compressé" : choix.cle === "image-reduire" ? " réduit" : "";
  // Plusieurs pages en images : une archive, une image par page.
  if (pages > 1 && (choix.cle === "pdf-jpg" || choix.cle === "pdf-png")) return `${base} (${pages} pages, ${choix.sortie.toUpperCase()}).zip`;
  return `${base}${suffixe}.${choix.sortie}`;
}

/**
 * Pure : le secteur sous le curseur. `dx`, `dy` : le curseur par rapport au centre de la roue.
 * Rend -1 pour le moyeu, null hors de la roue, sinon l'indice du secteur (le premier en haut, puis dans le sens des aiguilles d'une montre).
 */
export function secteurSous(dx, dy, n, { rayon = 170, moyeu = 62 } = {}) {
  const d = Math.hypot(dx, dy);
  if (d <= moyeu) return -1;
  if (d > rayon || n < 1) return null;
  // L'angle depuis le haut, dans le sens des aiguilles : 0 en haut, 90 à droite.
  const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const part = 360 / n;
  return Math.floor(((angle + part / 2) % 360) / part);
}
