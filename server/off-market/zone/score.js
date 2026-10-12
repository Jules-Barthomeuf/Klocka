// Off-market, mode Simple : le score « Zone », version à règles (11 oct. 2026).
// Une somme pondérée des caractéristiques ramenées entre 0 et 1, les poids
// dans poids-v0.json. Après chaque jugement, chaque poids bouge un peu dans
// le sens du jugement, borné entre 0 et deux fois sa valeur de départ.

import fs from 'fs';

export const CONFIG = JSON.parse(fs.readFileSync(new URL('./poids-v0.json', import.meta.url), 'utf8'));
export const POIDS_INITIAUX = Object.fromEntries(Object.entries(CONFIG.poids).map(([k, v]) => [k, v.poids]));

const CLASSE = { fort: 1, moyen: 0.5, faible: 0 };
const borne = (x) => Math.max(0, Math.min(1, x));
/** Les caractéristiques qui sont un oui ou un non : elles n'expliquent un score que quand elles valent oui. */
const BINAIRES = new Set(['impasse', 'place', 'naf_hors_cible', 'enseigne_nationale']);

/** Pure : les caractéristiques du score à règles, entre 0 et 1, ou null si on ne sait pas. */
export function normaliser(f) {
  const num = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const classe = (valeur, c) => (num(valeur) != null ? borne(num(valeur)) : c in CLASSE ? CLASSE[c] : null);
  const bool = (v) => (typeof v === 'boolean' ? (v ? 1 : 0) : null);
  return {
    flux_pieton: classe(null, f.flux_pieton_classe),
    touristes: classe(null, f.touristes_classe),
    densite_commerces_300m: num(f.densite_commerces_300m) == null ? null : borne(num(f.densite_commerces_300m) / 120),
    part_commerces_fermes_300m: num(f.part_commerces_fermes_300m) == null ? null : borne(num(f.part_commerces_fermes_300m)),
    distance_rue_commercante_principale_m: num(f.distance_rue_commercante_principale_m) == null ? null : borne(num(f.distance_rue_commercante_principale_m) / 1500),
    impasse: f.type_voie == null ? null : f.type_voie === 'impasse' ? 1 : 0,
    place: f.type_voie == null ? null : f.type_voie === 'place' ? 1 : 0,
    naf_hors_cible: bool(f.naf_hors_cible),
    enseigne_nationale: bool(f.enseigne_nationale),
    note_streetview_ia: num(f.note_streetview_ia) == null ? null : borne(num(f.note_streetview_ia) / 10),
  };
}

/** Pure : ce que pèse une caractéristique dans un score, signé : au-dessus ou au-dessous du milieu. */
export const effet = (cle, w, x) => (x == null ? 0 : BINAIRES.has(cle) ? (x ? w : 0) : w * (x - 0.5));

/** Pure : la raison en français, d'après la caractéristique brute. */
export function phrase(cle, f) {
  const n = (v) => Math.round(Number(v)).toLocaleString('fr-FR');
  switch (cle) {
    case 'flux_pieton': return { fort: 'flux piéton élevé (approché)', moyen: 'flux piéton moyen (approché)', faible: 'flux piéton faible (approché)' }[f.flux_pieton_classe] || 'flux piéton';
    case 'touristes': return { fort: 'zone touristique', moyen: 'un peu de tourisme', faible: 'peu de touristes' }[f.touristes_classe] || 'tourisme';
    case 'densite_commerces_300m': return `${n(f.densite_commerces_300m)} commerces à 300 m`;
    case 'part_commerces_fermes_300m': return `${Math.round(Number(f.part_commerces_fermes_300m) * 100)} % de commerces fermés à 300 m`;
    case 'distance_rue_commercante_principale_m': return Number(f.distance_rue_commercante_principale_m) < 60 ? 'sur la grande rue commerçante' : `à ${n(f.distance_rue_commercante_principale_m)} m de la grande rue commerçante`;
    case 'impasse': return 'impasse';
    case 'place': return 'sur une place';
    case 'naf_hors_cible': return 'activité hors cible';
    case 'enseigne_nationale': return 'enseigne nationale';
    case 'note_streetview_ia': return `rue notée ${String(f.note_streetview_ia).replace('.', ',')}/10 sur Street View`;
    case 'distance_centre_m': return `à ${n(f.distance_centre_m)} m du centre`;
    case 'densite_commerces_100m': return `${n(f.densite_commerces_100m)} commerces à 100 m`;
    case 'nb_voisins_meme_activite_100m': return `${n(f.nb_voisins_meme_activite_100m)} commerces de la même activité à 100 m`;
    case 'surface_estimee': return `bâtiment de ${n(f.surface_estimee)} m²`;
    default: return cle.replace(/_/g, ' ');
  }
}

/**
 * Pure : le score à règles d'un point, de 0 à 100, et ses trois raisons. Une
 * caractéristique inconnue ne compte pas : le score se ramène sur celles
 * qu'on connaît. Rien de connu : null.
 */
export function scoreRegles(f, poids = POIDS_INITIAUX) {
  const x = normaliser(f);
  let s = 0; let min = 0; let max = 0;
  const effets = [];
  for (const [cle, w] of Object.entries(poids)) {
    if (x[cle] == null || !w) continue;
    s += w * x[cle];
    min += Math.min(0, w);
    max += Math.max(0, w);
    const e = effet(cle, w, x[cle]);
    if (e) effets.push({ cle, effet: e });
  }
  if (max - min <= 0) return { score: null, raisons: [] };
  const raisons = effets.sort((a, b) => Math.abs(b.effet) - Math.abs(a.effet)).slice(0, 3)
    .map((e) => ({ cle: e.cle, sens: e.effet > 0 ? 'plus' : 'moins', texte: phrase(e.cle, f) }));
  return { score: Math.round((100 * (s - min)) / (max - min)), raisons };
}

/**
 * Pure : les poids après un jugement. Pour chaque caractéristique connue qui
 * a pesé, si le jugement va dans son sens, son poids grandit de 1 % ; sinon il
 * baisse de 2 %. Le signe ne change jamais, et chaque poids reste entre 0 et
 * deux fois sa valeur de départ. « À revoir » ne bouge rien.
 */
export function ajusterPoids(poids, f, verdict, initiaux = POIDS_INITIAUX) {
  const y = verdict === 'interessant' ? 1 : verdict === 'pas_interessant' ? -1 : 0;
  const suivants = { ...poids };
  const journal = [];
  if (!y) return { poids: suivants, journal };
  const x = normaliser(f);
  for (const [cle, w] of Object.entries(poids)) {
    const e = effet(cle, w, x[cle]);
    if (!e) continue;
    const confirme = Math.sign(e) === y;
    const w0 = initiaux[cle] ?? w;
    const abs = Math.min(2 * Math.abs(w0), Math.max(0, Math.abs(w) * (confirme ? 1.01 : 0.98)));
    const apres = Math.round(Math.sign(w0 || w) * abs * 10000) / 10000;
    if (apres !== w) { suivants[cle] = apres; journal.push({ cle, avant: w, apres, sens: confirme ? 'confirme' : 'contredit' }); }
  }
  return { poids: suivants, journal };
}
