// À quelle distance une mesure de marché prétend valoir.
//
// « 277 €/m²/an » ne veut rien dire seul : la même adresse vaut 277 sur un
// rayon de 500 m, 800 sur son seul tronçon de rue et 461 à l'échelle de la
// commune. Ces trois chiffres ne se contredisent pas — ils ne parlent pas de
// la même chose.
//
// D'où la portée : l'ordre de grandeur, en mètres, du territoire qu'une
// lecture décrit. Elle sert à ne comparer que ce qui est comparable. Sans
// elle, le recoupement opposait la rue de Data-B au rayon de 500 m d'Equimmox
// et levait un drapeau rouge à +189 % — un écart que personne n'avait mesuré,
// que le système fabriquait en choisissant deux mailles différentes.
//
// Les valeurs ci-dessous sont des ORDRES DE GRANDEUR, pas des mesures. Un
// quartier parisien ne fait pas 800 m ; ce qui compte est qu'il soit plus
// large qu'une rue et plus étroit qu'une commune.
//
// Ce module vit dans src/lib parce que les DEUX côtés s'en servent : le
// serveur quand il recoupe (marche/chaine.js), l'écran quand il doit refaire
// la comparaison d'une lecture ancienne. Deux copies auraient divergé, et
// c'est précisément une divergence de définition qui a créé le faux +189 %.

export const PORTEES_M = {
  troncon: 80,
  rue: 150,
  quartier: 800,
  ville: 3000,
  commune: 3000,
  departement: 30000,
};

// Au-delà de ce rapport entre deux portées, les lectures ne décrivent plus le
// même marché et ne se comparent pas. Trois : une rue (150 m) et un rayon de
// 500 m sont à 3,3 — hors comparaison ; un quartier (800 m) et ce même rayon
// sont à 1,6 — comparables.
// Ce module tourne des deux côtés : `process` n'existe pas dans le navigateur,
// et y lire une variable d'environnement jetterait à l'import — donc sans
// aucun écran, pas seulement sans réglage.
const reglage = (nom) => {
  try {
    return typeof process !== 'undefined' ? Number(process.env?.[nom]) : NaN;
  } catch {
    return NaN;
  }
};

export const RAPPORT_COMPARABLE = reglage('MARCHE_RAPPORT_ECHELLE') || 3;

/** La portée d'une échelle nommée, en mètres — ou null si on ne la connaît pas. */
export const porteeDe = (echelle) => PORTEES_M[String(echelle || '').toLowerCase()] ?? null;

/**
 * Deux portées décrivent-elles un territoire de même ordre ?
 *
 * Une portée inconnue est traitée comme comparable : mieux vaut comparer et
 * signaler que taire une divergence parce qu'on n'a pas su nommer l'échelle.
 */
export function comparables(a, b, rapport = RAPPORT_COMPARABLE) {
  if (a == null || b == null) return true;
  if (a <= 0 || b <= 0) return true;
  return Math.max(a, b) / Math.min(a, b) <= rapport;
}

/**
 * Parmi plusieurs lectures d'une même source, celle qui se compare le mieux
 * à une portée de référence. À défaut de portée connue, la première.
 */
export function laPlusComparable(lectures, porteeReference) {
  if (!lectures.length) return null;
  if (porteeReference == null) return lectures[0];
  const notees = lectures.filter((v) => v.portee_m != null);
  if (!notees.length) return lectures[0];
  return notees.reduce((meilleure, v) => {
    const ecart = (x) => Math.abs(Math.log(x.portee_m / porteeReference));
    return ecart(v) < ecart(meilleure) ? v : meilleure;
  });
}

/**
 * « 500m », « + 500 m », « 1km » : un rayon tel qu'un service l'affiche,
 * ramené en mètres. Rend null plutôt que de deviner — une portée fausse
 * écarterait des comparaisons justes.
 */
export function rayonEnMetres(rayon) {
  const t = String(rayon || '').toLowerCase().replace(/\s|\u202f|\u00a0/g, '');
  const m = t.match(/(\d+(?:[.,]\d+)?)(km|m)\b/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(m[2] === 'km' ? n * 1000 : n);
}
