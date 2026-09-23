// Le titre d'un dossier : ce qu'on dit à l'oral, pas la phrase de la synthèse.
//
// « Restaurant - Angers » quand on sait ce qui s'exploite, « Devred -
// Firminy » quand on connaît l'enseigne, « Murs commerciaux - Angers » quand
// on ne sait que la ville. Un dossier sans nom affichait le titre de la
// synthèse (« Murs de commerce de 664 m² à Lorient (56100), rue du Maréchal
// Foch, loués à RIMEL… ») ; un dossier créé au téléphone prenait ce que le
// modèle avait inventé. Les deux passent maintenant par ici.

const PAR_DEFAUT = 'Murs commerciaux';

// Ce qui ressemble à une valeur mais n'en est pas une.
const VIDE = /^(?:non\s+renseign\p{L}*|inconnu\p{L}*|n\.?\s*c\.?|nc|ind[ée]termin\p{L}*|[àa] (?:qualifier|pr[ée]ciser|d[ée]finir)|locataire non identifi\p{L}*|non identifi\p{L}*|libre|vacant\p{L}*|sans locataire|aucun\p{L}*|local|local commercial|murs(?: commerciaux| de commerce)?|commerce|activit[ée] (?:[àa] qualifier|inconnue)|-|—)$/iu;

const net = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Pure : une activité courte et lisible, ou null. « restauration traditionnelle (bar) » → « Restauration traditionnelle ». */
export function activiteCourte(activite) {
  let a = net(activite).replace(/^activit[ée]\s*:\s*/i, '');
  a = a.split(/\s*[(,;/]\s*|\s+[-–—]\s+/)[0].trim();
  if (!a || VIDE.test(a)) return null;
  const mots = a.split(' ');
  if (mots.length > 4) a = mots.slice(0, 4).join(' ');
  return a.charAt(0).toUpperCase() + a.slice(1);
}

/** Pure : un nom d'enseigne utilisable, ou null. */
export function enseigneNette(enseigne) {
  const e = net(enseigne).replace(/\s*\((?:enseigne|locataire)[^)]*\)\s*$/i, '');
  if (!e || VIDE.test(e) || e.length > 40) return null;
  return e;
}

/** Pure : la ville sans son code postal ni « Cedex ». */
export function villeNette(ville) {
  const v = net(ville).replace(/\b\d{5}\b/g, '').replace(/\bcedex\b.*$/i, '').replace(/\s+/g, ' ').trim();
  return v || null;
}

/**
 * Pure : le titre d'un dossier. L'enseigne d'abord, sinon l'activité, sinon
 * « Murs commerciaux » ; puis la ville, sauf si elle y est déjà.
 */
export function titreDossier({ enseigne = null, activite = null, ville = null } = {}) {
  const quoi = enseigneNette(enseigne) || activiteCourte(activite) || PAR_DEFAUT;
  const ou = villeNette(ville);
  if (!ou) return quoi;
  const echappe = ou.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|[^\\p{L}])${echappe}([^\\p{L}]|$)`, 'iu').test(quoi)) return quoi;
  return `${quoi} - ${ou}`;
}

const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? c.valeur : c);

/** Pure : le titre tiré du premier lot d'un dossier analysé. */
export function titreDuLot(lot, enrichissement = null) {
  const l = lot || {};
  const a = val(l.adresse) || {};
  const ville = (typeof a === 'object' && a.ville) || enrichissement?.commune?.nom || null;
  return titreDossier({ enseigne: val(l.locataire_nom) || val(l.enseigne), activite: val(l.locataire_activite), ville });
}
