// Off-market, mode Simple : le score « Zone » appris (11 oct. 2026). Une
// régression logistique sur les caractéristiques gardées avec chaque jugement
// (jamais recalculées) : les nombres standardisés, une donnée inconnue mise à
// la moyenne, les catégories en une colonne par valeur. Écrite ici, sans
// bibliothèque : le projet n'en a pas, et c'est une centaine de lignes.

import { phrase } from './score.js';
import { libelleActivite } from '../../naf.js';

const CLASSE = { fort: 1, moyen: 0.5, faible: 0 };
const NUMERIQUES = [
  ['flux_pieton', (f) => (f.flux_pieton_valeur != null ? Number(f.flux_pieton_valeur) : CLASSE[f.flux_pieton_classe] ?? null)],
  ['touristes', (f) => (f.touristes_valeur != null ? Number(f.touristes_valeur) : CLASSE[f.touristes_classe] ?? null)],
  ...['densite_commerces_100m', 'densite_commerces_300m', 'part_commerces_fermes_300m', 'distance_centre_m', 'distance_rue_commercante_principale_m',
    'surface_estimee', 'nb_voisins_meme_activite_100m', 'note_streetview_ia', 'nb_avis_google', 'note_google'].map((k) => [k, (f) => (f[k] == null ? null : Number(f[k]))]),
  ...['naf_hors_cible', 'enseigne_nationale', 'ouvert_7j'].map((k) => [k, (f) => (typeof f[k] === 'boolean' ? (f[k] ? 1 : 0) : null)]),
];
const CATEGORIES = ['type_voie', 'naf_section'];

/** Pure : un générateur pseudo-aléatoire à graine (mulberry32), pour des découpages reproductibles. */
export function hasard(graine = 1) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Pure : l'encodage appris sur les exemples d'entraînement (moyennes, écarts, valeurs des catégories). */
export function apprendreEncodage(snapshots) {
  const num = [];
  for (const [cle, lire] of NUMERIQUES) {
    const v = snapshots.map(lire).filter((x) => x != null && Number.isFinite(x));
    if (v.length < 2) continue;
    const moyenne = v.reduce((a, b) => a + b, 0) / v.length;
    const ecart = Math.sqrt(v.reduce((a, b) => a + (b - moyenne) ** 2, 0) / v.length);
    if (ecart > 0) num.push({ cle, moyenne, ecart });
  }
  const cat = {};
  for (const cle of CATEGORIES) {
    const n = new Map();
    for (const s of snapshots) if (s[cle] != null) n.set(s[cle], (n.get(s[cle]) || 0) + 1);
    cat[cle] = [...n].filter(([, k]) => k >= 3).map(([v]) => v).sort();
  }
  return { num, cat };
}

/** Pure : les colonnes d'un exemple, et le nom de la caractéristique d'origine de chacune. */
export function encoder(f, enc) {
  const lecteur = Object.fromEntries(NUMERIQUES);
  const x = []; const origine = [];
  for (const { cle, moyenne, ecart } of enc.num) {
    const v = lecteur[cle](f);
    x.push(v == null || !Number.isFinite(v) ? 0 : (v - moyenne) / ecart);
    origine.push(cle);
  }
  for (const cle of CATEGORIES) for (const valeur of enc.cat[cle] || []) { x.push(f[cle] === valeur ? 1 : 0); origine.push(cle); }
  return { x, origine };
}

const sigmoide = (z) => 1 / (1 + Math.exp(-z));

/** Pure : l'entraînement, par descente de gradient, avec une pénalité L2 légère. */
export function entrainer(snapshots, cibles, { iterations = 800, pas = 0.2, l2 = 0.01 } = {}) {
  const enc = apprendreEncodage(snapshots);
  const X = snapshots.map((f) => encoder(f, enc).x);
  const d = X[0]?.length || 0;
  const w = new Array(d).fill(0); let b = 0;
  const n = X.length;
  for (let it = 0; it < iterations; it += 1) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i += 1) {
      const p = sigmoide(b + X[i].reduce((s, xj, j) => s + xj * w[j], 0));
      const e = p - cibles[i];
      for (let j = 0; j < d; j += 1) gw[j] += e * X[i][j];
      gb += e;
    }
    for (let j = 0; j < d; j += 1) w[j] -= pas * (gw[j] / n + l2 * w[j]);
    b -= pas * (gb / n);
  }
  return { encodage: enc, coefficients: w, biais: b };
}

/** Pure : la probabilité qu'un point intéresse, en score de 0 à 100. */
export function scoreLogistique(f, modele) {
  const { x } = encoder(f, modele.encodage);
  return Math.round(100 * sigmoide(modele.biais + x.reduce((s, xj, j) => s + xj * (modele.coefficients[j] || 0), 0)));
}

/** Pure : la raison en français d'une colonne apprise. */
function phraseLogistique(cle, f) {
  if (cle === 'type_voie') return { impasse: 'impasse', place: 'sur une place', avenue: 'sur une avenue', boulevard: 'sur un boulevard', rue: 'dans une rue', autre: 'voie secondaire' }[f.type_voie] || 'genre de voie';
  if (cle === 'naf_section') return f.naf_code ? (libelleActivite(f.naf_code) || `activité ${f.naf_code}`).toLowerCase() : 'activité';
  if (cle === 'ouvert_7j') return f.ouvert_7j ? 'ouvert 7 jours sur 7' : 'pas ouvert 7 jours sur 7';
  if (cle === 'nb_avis_google') return `${f.nb_avis_google} avis Google`;
  if (cle === 'note_google') return `note Google ${String(f.note_google).replace('.', ',')}`;
  if (cle === 'naf_hors_cible' && !f.naf_hors_cible) return 'activité dans la cible';
  if (cle === 'enseigne_nationale' && !f.enseigne_nationale) return 'commerce indépendant';
  return phrase(cle, f);
}

/** Pure : les trois caractéristiques qui ont le plus pesé : coefficient × valeur standardisée, regroupées par caractéristique. */
export function raisonsLogistique(f, modele) {
  const { x, origine } = encoder(f, modele.encodage);
  const parCle = new Map();
  x.forEach((xj, j) => { const c = xj * (modele.coefficients[j] || 0); if (c) parCle.set(origine[j], (parCle.get(origine[j]) || 0) + c); });
  return [...parCle].filter(([cle]) => {
    // Une caractéristique inconnue (mise à la moyenne) n'explique rien.
    const lu = NUMERIQUES.find(([k]) => k === cle);
    return lu ? lu[1](f) != null : f[cle] != null;
  }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
    .map(([cle, c]) => ({ cle, sens: c > 0 ? 'plus' : 'moins', texte: phraseLogistique(cle, f) }));
}

/** Pure : l'aire sous la courbe ROC, par les rangs (ex aequo comptés à moitié). */
export function auc(scores, cibles) {
  const pos = []; const neg = [];
  scores.forEach((s, i) => (cibles[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let g = 0;
  for (const p of pos) for (const q of neg) g += p > q ? 1 : p === q ? 0.5 : 0;
  return g / (pos.length * neg.length);
}

/** Pure : la part d'intéressants parmi les k meilleurs scores. */
export function precisionHaut(scores, cibles, k = 20) {
  const ordre = scores.map((s, i) => [s, cibles[i]]).sort((a, b) => b[0] - a[0]).slice(0, k);
  return ordre.length ? ordre.filter(([, c]) => c).length / ordre.length : null;
}

/** Pure : les indices mis de côté pour la validation, la même part dans chaque classe. */
export function decoupageStratifie(cibles, { part = 0.2, graine = 7 } = {}) {
  const r = hasard(graine);
  const test = new Set();
  for (const classe of [0, 1]) {
    const idx = cibles.map((c, i) => [c, i]).filter(([c]) => c === classe).map(([, i]) => i);
    for (let i = idx.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    idx.slice(0, Math.ceil(idx.length * part)).forEach((i) => test.add(i));
  }
  return test;
}
