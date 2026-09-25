// Lire un classeur Excel (.xlsx) sans dépendance : un .xlsx est une archive
// zip de fichiers XML. On lit le répertoire central de l'archive, on décompresse
// les deux fichiers utiles (les chaînes partagées et la première feuille) avec
// zlib, et on rend les lignes comme des objets indexés par l'en-tête.
//
// Ça suffit pour les exports tabulaires qu'on reçoit (Equimmox, Apollo passé
// par Excel) : une feuille, une ligne d'en-tête, du texte et des nombres. Les
// formules, les styles et les dates en numéro de série ne sont pas interprétés.

import zlib from 'zlib';

/** Pure : les fichiers d'une archive zip, {nom: Buffer}. */
export function lireZip(buffer, garder = () => true) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  // La fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error('Archive illisible : ce n\'est pas un fichier Excel (.xlsx).');
  const nombre = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const fichiers = {};
  for (let n = 0; n < nombre; n++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const methode = b.readUInt16LE(p + 10);
    const taille = b.readUInt32LE(p + 20);
    const lNom = b.readUInt16LE(p + 28);
    const lExtra = b.readUInt16LE(p + 30);
    const lComment = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nom = b.toString('utf8', p + 46, p + 46 + lNom);
    p += 46 + lNom + lExtra + lComment;
    if (!garder(nom)) continue;
    const debut = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const brut = b.subarray(debut, debut + taille);
    fichiers[nom] = methode === 0 ? Buffer.from(brut) : zlib.inflateRawSync(brut);
  }
  return fichiers;
}

const entites = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');

/** « AB12 » → 27 (colonne, à partir de 0). */
const colonneDe = (ref) => {
  const lettres = String(ref).match(/^[A-Z]+/)?.[0] || 'A';
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

/** Pure : les lignes brutes d'une feuille, tableaux de chaînes. */
export function lignesDeFeuille(xmlFeuille, partagees = []) {
  const lignes = [];
  for (const [, contenu] of String(xmlFeuille).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const ligne = [];
    for (const m of contenu.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1] || '';
      const corps = m[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      let valeur = '';
      if (type === 's') valeur = partagees[Number((corps.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? '';
      else if (type === 'inlineStr') valeur = [...corps.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => entites(x[1])).join('');
      else valeur = entites((corps.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? '');
      ligne[ref ? colonneDe(ref) : ligne.length] = valeur;
    }
    lignes.push(Array.from(ligne, (v) => v ?? ''));
  }
  return lignes;
}

/** Pure : les chaînes partagées d'un classeur. */
export function chainesPartagees(xml) {
  return [...String(xml || '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(([, si]) => [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => entites(x[1])).join(''));
}

/**
 * Pure : les lignes de la première feuille d'un .xlsx, en objets indexés par
 * l'en-tête (la première ligne non vide).
 */
export function lireXlsx(buffer) {
  const f = lireZip(buffer, (n) => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const feuille = Object.keys(f).filter((n) => n.startsWith('xl/worksheets/')).sort()[0];
  if (!feuille) throw new Error('Classeur sans feuille.');
  const lignes = lignesDeFeuille(f[feuille].toString('utf8'), chainesPartagees(f['xl/sharedStrings.xml']?.toString('utf8')));
  const i = lignes.findIndex((l) => l.some((v) => String(v).trim()));
  if (i < 0) return [];
  const entete = lignes[i].map((v) => String(v).trim());
  return lignes.slice(i + 1)
    .filter((l) => l.some((v) => String(v).trim()))
    .map((l) => Object.fromEntries(entete.map((h, k) => [h || `colonne ${k + 1}`, String(l[k] ?? '').trim()])));
}
