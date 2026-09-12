// La surface pondérée : ce sur quoi un loyer de commerce se calcule vraiment.
//
// En commerce, tous les mètres carrés ne valent pas le même loyer. La boutique
// en rez-de-chaussée, celle qu'on voit depuis le trottoir, vaut 1. La réserve
// au sous-sol, l'arrière-boutique, l'étage : une fraction. C'est la
// « pondération », et elle n'est pas une convention comptable — c'est ce que
// les baux commerciaux appliquent.
//
// Sans elle, le verdict se trompe de dossier. Sur le 93 avenue Marceau, la
// fiche dit « 91 m² RDC, environ 44 m² S.SOL » : le code ne retenait que 91,
// donnait 349 €/m²/an et concluait « surévalué de 26 % ». À sous-sol pondéré à
// 0,3, le loyer ressort à 305 €/m²/an — soit 10 % au-dessus d'un marché à 277,
// ce qui n'est plus le même dossier ni la même négociation.
//
// Deux garde-fous, parce qu'on lit une phrase écrite à la main :
//   — sans décomposition CLAIRE, la fonction rend null et rien ne change ;
//   — la décomposition est toujours affichée avec ses coefficients, pour que
//     l'analyste voie sur quoi le verdict repose et puisse le contredire.

/**
 * Les coefficients par défaut. Ce sont des usages de marché, pas des
 * constantes : un bail peut pondérer un sous-sol à 0,2 comme à 0,5. Ils sont
 * montrés à l'écran, jamais appliqués en silence.
 */
export const COEFFICIENTS = [
  { cle: 'rdc', libelle: 'rez-de-chaussée', coefficient: 1, motif: /\b(r\.?d\.?c\.?|rez[- ]de[- ]chauss|plain[- ]pied|boutique|vitrine|surface de vente|salle)\b/i },
  { cle: 'mezzanine', libelle: 'mezzanine', coefficient: 0.5, motif: /\bmezzanine\b/i },
  { cle: 'etage', libelle: 'étage', coefficient: 0.5, motif: /\b(étage|etage|\d\s*(er|ème|eme|e)\s*(étage|etage))\b/i },
  { cle: 'sous_sol', libelle: 'sous-sol', coefficient: 0.3, motif: /\b(sous[- ]?sol|s\.?\s?sol|soussol|cave|réserve|reserve|arrière[- ]boutique|arriere[- ]boutique)\b/i },
  { cle: 'terrasse', libelle: 'terrasse', coefficient: 0.2, motif: /\b(terrasse|cour)\b/i },
];

/** Le coefficient d'un segment de phrase, ou null s'il ne nomme rien de connu. */
function categorieDe(texte) {
  // Le sous-sol d'abord : « réserve en rez-de-chaussée » doit se lire réserve.
  const ordre = ['sous_sol', 'mezzanine', 'etage', 'terrasse', 'rdc'];
  for (const cle of ordre) {
    const c = COEFFICIENTS.find((x) => x.cle === cle);
    if (c.motif.test(texte)) return c;
  }
  return null;
}

/** Le premier nombre d'un segment, les ordinaux écartés (« 15 1er étage » → 15). */
function nombreDe(texte) {
  const propre = String(texte)
    .replace(/\b\d+\s*(er|ère|ere|ème|eme|nd|nde)\b/gi, ' ')
    .replace(/[\u202f\u00a0]/g, ' ');
  // Un nombre suivi de m² prime : c'est celui qui porte l'unité.
  const avecUnite = propre.match(/(\d+(?:[.,]\d+)?)\s*m\s*(?:²|2|\b)/i);
  const m = avecUnite || propre.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Décompose une citation de surface en parties pondérées.
 *
 * @param {string} citation - la phrase relevée sur la fiche
 * @param {number|null} declaree - la surface retenue sur le lot, pour contrôle
 * @returns {{parties: Array, brute: number, ponderee: number}|null}
 */
export function decomposer(citation, declaree = null) {
  const texte = String(citation || '').trim();
  if (!texte) return null;

  // Le découpage, et ses deux pièges. Une virgule entre deux chiffres est une
  // décimale française, pas un séparateur : « 121,8 m2 » ne doit pas devenir
  // 121. Et un tiret collé à un mot appartient au mot : « sous-sol » n'est pas
  // deux parties. D'où la décimale mise à l'abri le temps du découpage, et le
  // tiret qui ne sépare que s'il est entouré d'espaces.
  const segments = texte
    .replace(/(\d),(\d)/g, '$1\u0000$2')
    .replace(/\s[–—-]{1,3}\s/g, '|')
    .replace(/\bet\b/gi, '|')
    .split(/[+,;/·|]/)
    .map((x) => x.replace(/\u0000/g, ',').trim())
    .filter(Boolean);
  const parties = [];
  for (const segment of segments) {
    const categorie = categorieDe(segment);
    if (!categorie) continue;
    const m2 = nombreDe(segment);
    if (m2 == null) continue;
    parties.push({ cle: categorie.cle, libelle: categorie.libelle, m2, coefficient: categorie.coefficient, extrait: segment });
  }

  // Une seule partie ne décompose rien : c'est la surface telle quelle.
  if (parties.length < 2) return null;
  // Toutes au même coefficient non plus : pondérer ne changerait que l'échelle.
  if (new Set(parties.map((p) => p.coefficient)).size < 2) return null;

  const brute = parties.reduce((t, p) => t + p.m2, 0);
  const ponderee = parties.reduce((t, p) => t + p.m2 * p.coefficient, 0);

  // Garde-fou : une lecture qui s'éloigne trop de la surface du lot est plus
  // probablement une phrase mal découpée qu'une décomposition juste.
  if (declaree != null && declaree > 0 && (brute < declaree * 0.9 || brute > declaree * 3)) return null;

  return { parties, brute: Math.round(brute * 10) / 10, ponderee: Math.round(ponderee * 10) / 10 };
}

/** « 91 m² RDC (×1) + 44 m² sous-sol (×0,3) = 104,2 m² pondérés » */
export function expliquer(d) {
  if (!d) return null;
  const nb = (n) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  const parts = d.parties.map((p) => `${nb(p.m2)} m² ${p.libelle} (×${nb(p.coefficient)})`).join(' + ');
  return `${parts} = ${nb(d.ponderee)} m² pondérés`;
}
