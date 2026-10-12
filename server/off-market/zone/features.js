// Off-market, mode Simple : les caractéristiques d'un point pour le score
// « Zone » (11 oct. 2026). Toujours les mêmes clés, null quand on ne sait pas.
// C'est exactement cet objet qui est gardé avec un jugement : l'apprentissage
// le relit tel quel, il ne le recalcule jamais.
//
// Ce qu'on sait vraiment, et ce qui est approché :
// - le flux piéton et les touristes n'ont pas de mesure par point (Data-B ne
//   les donne que par étude, une adresse à la fois) : la « valeur » reste
//   null et la « classe » est approchée par la zone commerçante de la ville
//   (question au modèle, zones.js) et la densité de commerces ;
// - les commerces fermés, la note et les avis Google, l'ouverture 7 j/7 ne
//   sont pas lus aujourd'hui : null ;
// - la note Street View n'existe que pour un point noté (revue-rue.js).

import { zoneDuPoint } from '../zones.js';
import { cleRue } from '../../alx/commerces.js';

export const CLES = [
  'flux_pieton_valeur', 'flux_pieton_classe', 'touristes_valeur', 'touristes_classe',
  'densite_commerces_100m', 'densite_commerces_300m', 'part_commerces_fermes_300m',
  'distance_centre_m', 'distance_rue_commercante_principale_m', 'type_voie',
  'naf_section', 'naf_code', 'naf_hors_cible', 'enseigne_nationale', 'niveau_signature_enseigne',
  'surface_estimee', 'nb_voisins_meme_activite_100m', 'note_streetview_ia',
  'ouvert_7j', 'nb_avis_google', 'note_google',
];

const SECTIONS = [[3, 'A'], [9, 'B'], [33, 'C'], [35, 'D'], [39, 'E'], [43, 'F'], [47, 'G'], [53, 'H'], [56, 'I'], [63, 'J'], [66, 'K'], [68, 'L'], [75, 'M'], [82, 'N'], [84, 'O'], [85, 'P'], [88, 'Q'], [93, 'R'], [96, 'S'], [98, 'T'], [99, 'U']];

/** Pure : « 9602A » ou « 96.02A » → « 96.02A ». */
export function codeNaf(ape) {
  const s = String(ape || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = s.match(/^(\d{2})(\d{2})([A-Z])$/);
  return m ? `${m[1]}.${m[2]}${m[3]}` : null;
}

/** Pure : la section de la NAF (lettre) d'un code. */
export function sectionNaf(code) {
  const d = Number(String(code || '').slice(0, 2));
  if (!Number.isFinite(d) || d < 1) return null;
  return SECTIONS.find(([max]) => d <= max)?.[1] || null;
}

/** Pure : le genre de voie d'une rue écrite. */
export function typeVoie(rue) {
  const m = String(rue || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/)[0];
  if (!m) return null;
  if (m === 'rue') return 'rue';
  if (m === 'avenue' || m === 'av') return 'avenue';
  if (m === 'boulevard' || m === 'bd') return 'boulevard';
  if (m === 'impasse' || m === 'imp') return 'impasse';
  if (m === 'place' || m === 'pl') return 'place';
  return 'autre';
}

const distanceM = (a, b) => 6371000 * Math.hypot(((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * Math.PI) / 180, ((b.lat - a.lat) * Math.PI) / 180);
const aDesCoordonnees = (c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lon);

/**
 * Pure : le contexte d'une ville, calculé une fois pour tous ses points :
 * une grille de 300 m, la grande rue commerçante et ses commerces.
 */
export function contexteVille(ville, commerces, { naf_exclus = [], sections_cible = ['G', 'I', 'S', 'C', 'R'] } = {}) {
  const pas = 0.0027; // environ 300 m en latitude
  const cellule = (c) => [Math.floor(c.lat / pas), Math.floor(c.lon / (pas / Math.cos((c.lat * Math.PI) / 180)))];
  const grille = new Map();
  for (const c of commerces) {
    if (!aDesCoordonnees(c)) continue;
    const k = cellule(c).join(':');
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(c);
  }
  // La grande rue commerçante : celle qui compte le plus de commerces dans la liste des rues de la ville.
  const rues = [...(ville?.rues || [])].filter((r) => r?.nom).sort((a, b) => (b.commerces || 0) - (a.commerces || 0));
  const principale = rues[0] ? cleRue(rues[0].nom) : null;
  const surPrincipale = principale ? commerces.filter((c) => aDesCoordonnees(c) && (c.rue ? cleRue(c.rue) : c.cle_rue) === principale) : [];
  return { ville, grille, cellule, principale: rues[0]?.nom || null, surPrincipale, naf_exclus: new Set(naf_exclus), sections_cible: new Set(sections_cible) };
}

/** Pure : les voisins d'un point à moins de `rayon` mètres (300 m au plus). */
function voisins(point, ctx, rayon) {
  if (!aDesCoordonnees(point)) return null;
  const [i, j] = ctx.cellule(point);
  const out = [];
  for (let di = -1; di <= 1; di += 1) {
    for (let dj = -1; dj <= 1; dj += 1) {
      for (const o of ctx.grille.get(`${i + di}:${j + dj}`) || []) if (o.id !== point.id && distanceM(point, o) <= rayon) out.push(o);
    }
  }
  return out;
}

/** Pure : les caractéristiques d'un point, toujours les mêmes clés. */
export function zoneFeatures(point, ctx) {
  const f = Object.fromEntries(CLES.map((k) => [k, null]));
  if (!point) return f;
  const ville = ctx?.ville || null;
  const v100 = ctx ? voisins(point, ctx, 100) : null;
  const v300 = ctx ? voisins(point, ctx, 300) : null;
  const zones = ville?.simple?.zones || [];
  const nomZone = aDesCoordonnees(point) ? zoneDuPoint(point, zones) : null;
  const zone = nomZone ? zones.find((z) => z.nom === nomZone) || null : null;
  const genre = zone?.genre || null;

  f.densite_commerces_100m = v100 ? v100.length : null;
  f.densite_commerces_300m = v300 ? v300.length : null;
  // Approchés, faute de mesure par point (voir l'en-tête).
  f.flux_pieton_classe = v300 == null ? null
    : genre === 'hyper-centre' || genre === 'centre-ville' || v300.length >= 120 ? 'fort'
      : zone || v300.length >= 40 ? 'moyen' : 'faible';
  f.touristes_classe = !ville?.simple?.zones?.length || !aDesCoordonnees(point) ? null
    : genre === 'touristique' ? 'fort' : genre === 'hyper-centre' ? 'moyen' : 'faible';

  if (aDesCoordonnees(point) && aDesCoordonnees(ville?.centre)) f.distance_centre_m = Math.round(distanceM(point, ville.centre));
  if (aDesCoordonnees(point) && ctx?.surPrincipale?.length) {
    f.distance_rue_commercante_principale_m = Math.round(Math.min(...ctx.surPrincipale.map((o) => distanceM(point, o))));
  }
  f.type_voie = typeVoie(point.rue);

  const code = codeNaf(point.ape || point.exploitant?.ape);
  f.naf_code = code;
  f.naf_section = sectionNaf(code);
  // Hors cible : un code exclu (banque, assurance, agence immobilière) ou une section qui n'est pas du commerce de pied d'immeuble.
  f.naf_hors_cible = code ? !!(ctx?.naf_exclus?.has(code) || (ctx?.sections_cible && !ctx.sections_cible.has(f.naf_section))) : null;

  f.enseigne_nationale = typeof point.chaine === 'boolean' ? point.chaine : null;
  f.niveau_signature_enseigne = point.chaine ? 'nationale' : point.enseigne ? 'independant' : null;
  const surface = Number(point.proprietaire?.surface_batiment ?? point.foncier?.surface_batiment);
  f.surface_estimee = Number.isFinite(surface) && surface > 0 ? surface : null;
  if (v100 && code) f.nb_voisins_meme_activite_100m = v100.filter((o) => codeNaf(o.ape) === code).length;
  const note = Number(point.revue_rue?.note);
  f.note_streetview_ia = Number.isFinite(note) ? note : null;
  return f;
}
