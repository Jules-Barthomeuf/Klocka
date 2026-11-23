// Les documents de bureau qu'une fiche peut prendre (22 nov. 2026, Jules : « pour n'importe quel type de documents ça
// marche parfaitement ») : Excel (.xlsx), PowerPoint (.pptx), OpenDocument (.odt, .ods, .odp) et Word 97 (.doc). Les
// trois premiers sont des ZIP de XML, lus avec jszip déjà installé ; le .doc est binaire, on en tire les suites de texte
// lisibles (le garde-fou de citation de l'extraction écarte ce qui ne serait pas dans ce texte).
//
// Chaque lecteur rend du texte brut : un tableur ligne par ligne, cellules séparées par des tabulations, une ligne par
// bien le plus souvent ; une présentation diapositive par diapositive.

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decoder = (t) => String(t || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITES[e]);
const textes = (xml, balise) => [...String(xml).matchAll(new RegExp(`<${balise}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise}>`, 'g'))].map((m) => decoder(m[1].replace(/<[^>]+>/g, '')));

async function zip(buffer) {
  const JSZip = (await import('jszip')).default;
  return JSZip.loadAsync(buffer);
}

/** La colonne d'une référence de cellule (« C12 » → 2). */
const colonne = (ref) => [...String(ref || '').replace(/\d+/g, '')].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;

/** Excel : chaque feuille, une ligne par rangée, les cellules séparées par une tabulation. */
export async function lireXlsx(buffer) {
  const z = await zip(buffer);
  const partages = z.file('xl/sharedStrings.xml') ? [...(await z.file('xl/sharedStrings.xml').async('string')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textes(m[1], 't').join('')) : [];
  const classeur = z.file('xl/workbook.xml') ? await z.file('xl/workbook.xml').async('string') : '';
  const noms = [...classeur.matchAll(/<sheet\b[^>]*name="([^"]*)"/g)].map((m) => decoder(m[1]));
  const feuilles = Object.keys(z.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const sortie = [];
  for (const [i, f] of feuilles.entries()) {
    const xml = await z.file(f).async('string');
    const lignes = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cellules = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const dedans = c[2] || '';
        const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
        const v = (dedans.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let valeur = '';
        if (type === 's') valeur = partages[Number(v)] ?? '';
        else if (type === 'inlineStr') valeur = textes(dedans, 't').join('');
        else if (v != null) valeur = decoder(v);
        const k = ref ? colonne(ref) : cellules.length;
        cellules[k] = valeur.replace(/\s+/g, ' ').trim();
      }
      const ligne = Array.from(cellules, (x) => x || '').join('\t').replace(/\t+$/, '');
      if (ligne.trim()) lignes.push(ligne);
    }
    if (lignes.length) sortie.push(`# ${noms[i] || `Feuille ${i + 1}`}\n${lignes.join('\n')}`);
  }
  return { texte: sortie.join('\n\n'), lignes: sortie.reduce((n, f) => n + f.split('\n').length - 2, 0) };
}

/** PowerPoint : le texte de chaque diapositive, dans l'ordre. */
export async function lirePptx(buffer) {
  const z = await zip(buffer);
  const diapos = Object.keys(z.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const sortie = [];
  for (const [i, d] of diapos.entries()) {
    const xml = await z.file(d).async('string');
    const paragraphes = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)].map((m) => textes(m[1], 'a:t').join('').trim()).filter(Boolean);
    if (paragraphes.length) sortie.push(`# Diapositive ${i + 1}\n${paragraphes.join('\n')}`);
  }
  return { texte: sortie.join('\n\n'), pages: diapos.length };
}

/** OpenDocument (texte, classeur, présentation) : content.xml, paragraphes et lignes de tableau à la ligne, cellules en tabulations. */
export async function lireOdf(buffer) {
  const z = await zip(buffer);
  const xml = z.file('content.xml') ? await z.file('content.xml').async('string') : '';
  const texte = decoder(xml
    // Dans une cellule, ses paragraphes restent sur la ligne du tableau.
    .replace(/<table:table-cell\b[^>]*>([\s\S]*?)<\/table:table-cell>/g, (_, c) => `${c.replace(/<\/text:p>/g, ' ').replace(/<[^>]+>/g, '').trim()}\t`)
    .replace(/<table:table-cell\b[^>]*\/>/g, '\t')
    .replace(/<text:tab\s*\/>/g, '\t')
    .replace(/<text:s(?:\s[^>]*)?\/>/g, ' ')
    .replace(/<text:line-break\s*\/>/g, '\n')
    .replace(/<\/(text:p|text:h|table:table-row)>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map((l) => l.replace(/\t+$/, '').trimEnd()).filter((l) => l.trim()).join('\n');
  return { texte };
}

/**
 * Word 97 (.doc), sans convertisseur : les suites de texte lisibles du binaire, en UTF-16 (le cas courant) puis en
 * 8 bits. Imparfait (la mise en page se perd), suffisant pour relever adresse, prix et loyer.
 */
export function lireDoc(buffer) {
  const b = Buffer.from(buffer);
  const LISIBLE = /[\p{L}\p{N}\s.,;:'’"«»()€%/+\-–@&]/u;
  const suites = (car, pas) => {
    const out = [];
    let cur = '';
    for (let i = 0; i + pas - 1 < b.length; i += pas) {
      const c = car(i);
      if (c && LISIBLE.test(c)) cur += c;
      else { if (cur.trim().length >= 12) out.push(cur); cur = ''; }
    }
    if (cur.trim().length >= 12) out.push(cur);
    return out;
  };
  const utf16 = suites((i) => ([0x00, 0x01, 0x20].includes(b[i + 1]) ? String.fromCharCode(b[i] | (b[i + 1] << 8)) : null), 2);
  const latin = suites((i) => (b[i] >= 0x20 || b[i] === 0x0d || b[i] === 0x0a || b[i] === 0x09 ? Buffer.from([b[i]]).toString('latin1') : null), 1);
  const garder = (l) => l.map((x) => x.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').trim()).filter((x) => /[a-zà-ÿ]{3,}/i.test(x));
  const u = garder(utf16);
  const l = garder(latin);
  // Le format choisit l'un ou l'autre : on garde celui qui donne le plus de texte.
  const texte = (u.join('\n').length >= l.join('\n').length ? u : l).join('\n');
  return { texte };
}

/** Un tableur : ses lignes sont des biens, une par ligne le plus souvent (la « liste » du compte des fiches). */
export const estTableur = (nom = '', mime = '') => /\.(xlsx|xlsm|xls|ods|csv)$/i.test(nom) || /spreadsheet|ms-excel|text\/csv/i.test(mime);
