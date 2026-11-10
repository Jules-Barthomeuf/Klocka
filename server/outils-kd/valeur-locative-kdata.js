// K-Data, valeur locative à la rue (9 nov. 2026, Jules : « reproduire chaque partie de Data-B », point 1).
//
// Ce que les 2 078 lectures Data-B gardées en base montrent (analyse du 9 nov. 2026) : trois niveaux, ville,
// quartier (l'IRIS de l'INSEE, mot pour mot) et rue ; une seule valeur par rue, quel que soit le numéro ; une
// fourchette fixe (haut = 1,5 × bas, donc un centre ± 20 %) ; et la valeur de la rue n'est jamais celle du
// quartier : elle est modulée par la commercialité de la rue, de 0,7 à 1,7 fois la ville.
//
// Ici : le coefficient de rue (rue ÷ quartier) s'apprend sur les rues déjà lues par Data-B, à partir de ce qu'on
// mesure nous-mêmes dans le stock SIRENE (vitrines actives, fermetures récentes, longueur de la rue, banques et
// agences, restauration, type de voie), puis se prédit pour n'importe quelle rue. Le niveau absolu (ville,
// quartier) vient d'ailleurs : ce module ne fait que la modulation de rue. Aucun appel réseau, aucun modèle de
// langage : du SQL et une régression linéaire régularisée.

import db from '../db.js';
import { voirieGardee } from './voirie-bdtopo.js';

// Lire une rue sans balayer toute la commune : un index, créé une fois si la table est là.
try { db.exec('CREATE INDEX IF NOT EXISTS idx_entrepot_sirene_voie ON entrepot_sirene(commune, type_voie, voie)'); } catch { /* base en lecture seule ou table absente */ }

// Les codes NAF « à vitrine » de l'outil Vacance (vacance-taux.js), repris tels quels.
export const PREFIXES_VITRINE = ['45', '47', '56', '952', '960', '64.19', '66.22', '68.31', '79.1', '77.2', '74.2', '95.1'];
const PREFIXES_BOUCHE = ['47.2', '10.71', '10.13', '56.1'];
const PREFIXES_PRIME = ['64.19', '66.22', '68.31', '47.7', '47.72', '47.71'];
const PREFIXES_RESTAU = ['56'];

const nafSans = (naf) => String(naf || '').replace('.', '');
const dans = (naf, prefixes) => { const n = nafSans(naf); return prefixes.some((p) => n.startsWith(nafSans(p))); };

const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const VIDES = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'L', 'D', 'ET', 'AU', 'AUX', 'EN', 'SUR', 'SOUS', 'A']);
const TYPES = {
  RUE: 'RUE', R: 'RUE', AVENUE: 'AVENUE', AV: 'AVENUE', BOULEVARD: 'BOULEVARD', BD: 'BOULEVARD', BLD: 'BOULEVARD', PLACE: 'PLACE', PL: 'PLACE',
  COURS: 'COURS', CRS: 'COURS', QUAI: 'QUAI', ALLEE: 'ALLEE', ALL: 'ALLEE', CHEMIN: 'CHEMIN', CHE: 'CHEMIN', ROUTE: 'ROUTE', RTE: 'ROUTE',
  IMPASSE: 'IMPASSE', IMP: 'IMPASSE', PASSAGE: 'PASSAGE', PAS: 'PASSAGE', PROMENADE: 'PROMENADE', PROM: 'PROMENADE', SQUARE: 'SQUARE', SQ: 'SQUARE',
  ESPLANADE: 'ESPLANADE', ESP: 'ESPLANADE', GALERIE: 'GALERIE', GAL: 'GALERIE', CORNICHE: 'CORNICHE', MONTEE: 'MONTEE', MTE: 'MONTEE', TRAVERSE: 'TRAVERSE', TRA: 'TRAVERSE',
  CENTRE: 'CENTRE', CTRE: 'CENTRE', ROND: 'ROND-POINT', RPT: 'ROND-POINT', VOIE: 'VOIE', ZONE: 'ZONE', ZA: 'ZONE', ZAC: 'ZONE', ZI: 'ZONE', LOTISSEMENT: 'LOTISSEMENT', LOT: 'LOTISSEMENT',
};

/** Pure : « Avenue Jean Médecin » → { type: 'AVENUE', mots: ['JEAN', 'MEDECIN'] }. */
export function decomposerRue(nomRue) {
  const mots = normaliser(nomRue).split(' ').filter(Boolean);
  const type = TYPES[mots[0]] || null;
  const reste = (type ? mots.slice(1) : mots).filter((m) => !VIDES.has(m));
  return { type, mots: reste };
}

/** Pure : le score de ressemblance entre une rue Data-B et une voie SIRENE (0 à 1). */
export function ressemblance(rue, voieSirene) {
  return ressemblanceD(decomposerRue(rue), decomposerRue(`${voieSirene.type_voie || ''} ${voieSirene.voie || ''}`));
}

// ── Lecture SIRENE ──────────────────────────────────────────────────────────────

// Code postal → commune : une seule passe sur la table (pas d'index sur le code postal, une requête par code
// balayait les 5 millions de lignes à chaque fois), gardée en mémoire.
let communeParCp = null;
/** Le code commune le plus fréquent d'un code postal dans le stock SIRENE (null s'il n'y est pas). */
export function communeDuCodePostal(cp) {
  if (!cp) return null;
  if (!communeParCp) {
    communeParCp = new Map();
    const compte = new Map();
    for (const r of db.prepare("SELECT code_postal cp, commune, COUNT(*) n FROM entrepot_sirene WHERE code_postal <> '' GROUP BY 1, 2").iterate()) {
      if ((compte.get(r.cp) || 0) < r.n) { compte.set(r.cp, r.n); communeParCp.set(r.cp, r.commune); }
    }
  }
  return communeParCp.get(String(cp)) || null;
}

// Les voies d'une commune, décomposées une fois et indexées par mot : on ne compare une rue qu'aux voies qui
// partagent au moins un mot avec elle (Nice en a 8 000, les comparer toutes à chaque rue prenait des minutes).
const voiesParCommune = new Map();
function voiesDe(commune) {
  if (!voiesParCommune.has(commune)) {
    const liste = db.prepare("SELECT type_voie, voie, COUNT(*) n FROM entrepot_sirene WHERE commune = ? AND voie <> '' GROUP BY type_voie, voie HAVING n >= 3").all(commune)
      .map((v) => ({ ...v, d: decomposerRue(`${v.type_voie || ''} ${v.voie || ''}`) }));
    const parMot = new Map();
    liste.forEach((v, i) => { for (const m of v.d.mots) { if (!parMot.has(m)) parMot.set(m, []); parMot.get(m).push(i); } });
    voiesParCommune.set(commune, { liste, parMot });
  }
  return voiesParCommune.get(commune);
}

/** Pure : la ressemblance de deux rues déjà décomposées (0 à 1). */
function ressemblanceD(a, b) {
  if (!a.mots.length || !b.mots.length) return 0;
  const sb = new Set(b.mots);
  let commun = 0;
  for (const m of a.mots) if (sb.has(m)) commun += 1;
  const jaccard = commun / new Set([...a.mots, ...b.mots]).size;
  const memeType = !a.type || !b.type || a.type === b.type ? 1 : 0.6;
  return jaccard * memeType;
}

/** La voie SIRENE qui correspond à une rue Data-B dans une commune, ou null si rien ne ressemble assez. */
export function voieSirene(commune, rue) {
  const { liste, parMot } = voiesDe(commune);
  const a = decomposerRue(rue);
  const candidats = new Set();
  for (const m of a.mots) for (const i of parMot.get(m) || []) candidats.add(i);
  let meilleure = null;
  for (const i of candidats) {
    const s = ressemblanceD(a, liste[i].d);
    if (s > (meilleure?.score || 0)) meilleure = { type_voie: liste[i].type_voie, voie: liste[i].voie, n: liste[i].n, score: s };
  }
  return meilleure && meilleure.score >= 0.5 ? meilleure : null;
}

const ilYa = (ans) => { const d = new Date(); d.setFullYear(d.getFullYear() - ans); return d.toISOString().slice(0, 10); };

/** Les établissements d'une voie, en mémoire (commune + type + voie exacts), coordonnées Lambert 93 comprises. */
function etablissements(commune, v) {
  return db.prepare('SELECT etat, date_debut, naf, numero, x, y FROM entrepot_sirene WHERE commune = ? AND type_voie = ? AND voie = ?').all(commune, v.type_voie || '', v.voie);
}

// ── La carte commerçante de la commune : les vitrines actives par carreau de 200 m (Lambert 93, en mètres) ─────
// Ce que la rue seule ne dit pas : est-elle au cœur commerçant ou en périphérie ? La densité autour d'elle et sa
// distance au carreau le plus dense le disent. Calculé une fois par commune, sans réseau.
const PAS = 200;
const cartes = new Map();
function carteCommune(commune) {
  if (!cartes.has(commune)) {
    const cases = new Map();
    const rows = db.prepare("SELECT x, y, naf FROM entrepot_sirene WHERE commune = ? AND etat = 'A' AND x IS NOT NULL AND x > 0").all(commune);
    for (const r of rows) {
      if (!dans(r.naf, PREFIXES_VITRINE)) continue;
      const k = `${Math.floor(r.x / PAS)}:${Math.floor(r.y / PAS)}`;
      cases.set(k, (cases.get(k) || 0) + 1);
    }
    let coeur = null;
    for (const [k, n] of cases) if (!coeur || n > coeur.n) { const [i, j] = k.split(':').map(Number); coeur = { x: (i + 0.5) * PAS, y: (j + 0.5) * PAS, n }; }
    // La densité à 250 m du cœur : la référence « 100 » de la commune.
    const maxDens = coeur ? densite(cases, coeur.x, coeur.y, 250) : 1;
    cartes.set(commune, { cases, coeur, maxDens: maxDens || 1 });
  }
  return cartes.get(commune);
}
function densite(cases, x, y, rayon) {
  let total = 0;
  const c = Math.ceil(rayon / PAS);
  const i0 = Math.floor(x / PAS); const j0 = Math.floor(y / PAS);
  for (let i = i0 - c; i <= i0 + c; i += 1) for (let j = j0 - c; j <= j0 + c; j += 1) {
    const dx = (i + 0.5) * PAS - x; const dy = (j + 0.5) * PAS - y;
    if (dx * dx + dy * dy <= rayon * rayon) total += cases.get(`${i}:${j}`) || 0;
  }
  return total;
}

/** Les médianes de la commune (vitrines actives par voie), pour rapporter chaque rue à sa ville. */
const refCommune = new Map();
function referenceCommune(commune) {
  if (!refCommune.has(commune)) {
    const lignes = db.prepare("SELECT type_voie, voie, SUM(etat = 'A') actifs FROM entrepot_sirene WHERE commune = ? AND voie <> '' GROUP BY type_voie, voie HAVING actifs >= 3").all(commune);
    const vit = lignes.map((l) => l.actifs).sort((a, b) => a - b);
    refCommune.set(commune, { medianeActifs: vit.length ? vit[Math.floor(vit.length / 2)] : 1, voies: lignes.length });
  }
  return refCommune.get(commune);
}

// ── La voirie de la rue (BD TOPO, voirie-bdtopo.js), si la commune est déjà sur disque ─────────────────────────
const voiriesIndexees = new Map();
function voirieIndexee(commune) {
  if (!voiriesIndexees.has(commune)) {
    const voies = voirieGardee(commune);
    if (!voies) return null;
    const liste = voies.map((v) => ({ ...v, d: decomposerRue(v.nom) }));
    const parMot = new Map();
    liste.forEach((v, i) => { for (const m of v.d.mots) { if (!parMot.has(m)) parMot.set(m, []); parMot.get(m).push(i); } });
    voiriesIndexees.set(commune, { liste, parMot });
  }
  return voiriesIndexees.get(commune);
}

/** La voie BD TOPO d'une rue (même rapprochement de noms que SIRENE), ou null. */
export function voirieRue(commune, rue) {
  const idx = voirieIndexee(commune);
  if (!idx) return null;
  const a = decomposerRue(rue);
  let meilleure = null;
  const vus = new Set();
  for (const m of a.mots) for (const i of idx.parMot.get(m) || []) {
    if (vus.has(i)) continue;
    vus.add(i);
    const s = ressemblanceD(a, idx.liste[i].d);
    if (s > (meilleure?.score || 0)) meilleure = { ...idx.liste[i], score: s };
  }
  return meilleure && meilleure.score >= 0.5 ? meilleure : null;
}

export const NOMS_CARACTERISTIQUES = ['log_vitrines', 'log_tous', 'densite', 'part_bouche', 'part_prime', 'part_restau', 'taux_fermetures', 'log_numeros', 'rel_commune', 'type_place', 'type_grand_axe', 'type_petit', 'log_dens_250', 'log_dens_600', 'rel_coeur', 'log_dist_coeur', 'part_vitrines', 'sans_geo',
  'voie_imp_min', 'voie_imp_moy', 'voie_log_longueur', 'voie_pieton', 'voie_2ch', 'voie_sens_unique', 'voie_largeur', 'vitrines_100m', 'sans_voirie'];

/**
 * Les caractéristiques d'une rue, lues dans le stock SIRENE. Rend null si la rue n'y est pas.
 * @returns {{ valeurs: number[], brut: object } | null}
 */
export function caracteristiquesRue(commune, rue) {
  const v = voieSirene(commune, rue);
  if (!v) return null;
  const e = etablissements(commune, v);
  const actifs = e.filter((x) => x.etat === 'A');
  const vitrines = actifs.filter((x) => dans(x.naf, PREFIXES_VITRINE));
  const seuil3 = ilYa(3);
  const fermees3 = e.filter((x) => x.etat === 'F' && String(x.date_debut || '') >= seuil3 && dans(x.naf, PREFIXES_VITRINE));
  const numeros = new Set(e.map((x) => String(x.numero || '').trim()).filter(Boolean)).size;
  const part = (p) => (vitrines.length ? vitrines.filter((x) => dans(x.naf, p)).length / vitrines.length : 0);
  const ref = referenceCommune(commune);
  const type = decomposerRue(rue).type;
  // Le centre de la rue : la moyenne des établissements géolocalisés ; la carte de la commune autour.
  const xy = e.filter((r) => r.x > 0 && r.y > 0);
  const cx = xy.length ? xy.reduce((s2, r) => s2 + r.x, 0) / xy.length : null;
  const cy = xy.length ? xy.reduce((s2, r) => s2 + r.y, 0) / xy.length : null;
  const carte = carteCommune(commune);
  const d250 = cx != null ? densite(carte.cases, cx, cy, 250) : 0;
  const d600 = cx != null ? densite(carte.cases, cx, cy, 600) : 0;
  const distCoeur = cx != null && carte.coeur ? Math.hypot(cx - carte.coeur.x, cy - carte.coeur.y) : 5000;
  const vo = voirieRue(commune, rue);
  const brut = {
    voie: `${v.type_voie} ${v.voie}`.trim(), voirie: vo ? vo.nom : null, importance: vo ? vo.imp_min : null, longueur_m: vo ? vo.longueur : null, part_pieton: vo ? vo.part_pieton : null, score: v.score, actifs: actifs.length, vitrines: vitrines.length, fermees_3_ans: fermees3.length, numeros,
    part_bouche: part(PREFIXES_BOUCHE), part_prime: part(PREFIXES_PRIME), part_restau: part(PREFIXES_RESTAU),
    vitrines_250m: d250, vitrines_600m: d600, distance_coeur_m: Math.round(distCoeur), densite_max_commune: carte.maxDens,
  };
  const valeurs = [
    Math.log1p(vitrines.length),
    Math.log1p(actifs.length),
    vitrines.length / Math.max(numeros, 1),
    brut.part_bouche,
    brut.part_prime,
    brut.part_restau,
    fermees3.length / Math.max(vitrines.length + fermees3.length, 1),
    Math.log1p(numeros),
    Math.log((vitrines.length + 1) / (ref.medianeActifs + 1)),
    type === 'PLACE' || type === 'COURS' || type === 'ESPLANADE' ? 1 : 0,
    type === 'AVENUE' || type === 'BOULEVARD' || type === 'PROMENADE' || type === 'QUAI' ? 1 : 0,
    type === 'IMPASSE' || type === 'PASSAGE' || type === 'ALLEE' || type === 'CHEMIN' || type === 'TRAVERSE' || type === 'MONTEE' ? 1 : 0,
    Math.log1p(d250),
    Math.log1p(d600),
    d250 / carte.maxDens,
    Math.log1p(distCoeur),
    actifs.length ? vitrines.length / actifs.length : 0,
    cx == null ? 1 : 0,
    // Sans voirie connue : les valeurs médianes d'une rue de desserte, et le drapeau le dit.
    vo ? vo.imp_min : 5,
    vo ? vo.imp_moy : 5,
    Math.log1p(vo ? vo.longueur : 300),
    vo ? vo.part_pieton : 0,
    vo ? vo.part_2ch : 0,
    vo ? vo.part_sens_unique : 0.5,
    vo?.largeur || 5,
    (vitrines.length * 100) / Math.max(vo ? vo.longueur : 300, 50),
    vo ? 0 : 1,
  ];
  return { valeurs, brut };
}

// ── Le modèle : régression linéaire régularisée sur ln(rue ÷ quartier) ──────────

/** Pure : résout (XᵀX + λI) w = Xᵀy par élimination de Gauss ; X a déjà sa colonne de 1. */
function resoudre(X, y, lambda) {
  const p = X[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < X.length; i += 1) {
    for (let j = 0; j < p; j += 1) {
      b[j] += X[i][j] * y[i];
      for (let k = 0; k < p; k += 1) A[j][k] += X[i][j] * X[i][k];
    }
  }
  for (let j = 1; j < p; j += 1) A[j][j] += lambda; // pas de pénalité sur l'ordonnée à l'origine
  for (let c = 0; c < p; c += 1) {
    let piv = c;
    for (let r = c + 1; r < p; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) continue;
    for (let r = 0; r < p; r += 1) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < p; k += 1) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => (Math.abs(A[i][i]) < 1e-12 ? 0 : v / A[i][i]));
}

/**
 * Pure : apprend le coefficient de rue. `exemples` : [{ valeurs, cible }] où cible = ln(rue ÷ quartier).
 * Les caractéristiques sont centrées-réduites ; rend le modèle (moyennes, écarts, poids).
 */
export function apprendre(exemples, { lambda = 1 } = {}) {
  const p = NOMS_CARACTERISTIQUES.length;
  const n = exemples.length;
  const moy = new Array(p).fill(0);
  const ect = new Array(p).fill(0);
  for (const ex of exemples) for (let j = 0; j < p; j += 1) moy[j] += ex.valeurs[j] / n;
  for (const ex of exemples) for (let j = 0; j < p; j += 1) ect[j] += (ex.valeurs[j] - moy[j]) ** 2 / n;
  for (let j = 0; j < p; j += 1) ect[j] = Math.sqrt(ect[j]) || 1;
  const X = exemples.map((ex) => [1, ...ex.valeurs.map((v, j) => (v - moy[j]) / ect[j])]);
  const y = exemples.map((ex) => ex.cible);
  const poids = resoudre(X, y, lambda);
  return { moy, ect, poids, n, lambda, noms: NOMS_CARACTERISTIQUES };
}

/**
 * Pure : le modèle par voisins (9 nov. 2026) : les classes de Data-B ne sont pas linéaires (périphérie peu dense en
 * bas, cœur de ville au milieu, axes commerçants de périphérie en haut). On garde les exemples d'apprentissage,
 * centrés-réduits comme la régression, et on prédit par la médiane pondérée des k plus proches.
 */
// Les poids retenus par sélection pas à pas en validation croisée (9 nov. 2026, 1 522 rues) : six mesures sur 27,
// les autres diluaient la distance. 12,1 % → 11,8 % d'écart médian, 58 % → 60 % des rues à 15 % près.
export const POIDS_VOISINS = { log_tous: 1, part_prime: 2, log_numeros: 1, log_dens_600: 1, voie_log_longueur: 2, vitrines_100m: 2 };

export function apprendreVoisins(exemples, { k = 15, ponderer = true, memeCommune = false, poidsFixes = POIDS_VOISINS } = {}) {
  const lin = apprendre(exemples, { lambda: 1 });
  if (poidsFixes) {
    // Distance euclidienne pondérée : le poids s'applique au carré de l'écart, d'où la racine sur chaque coordonnée.
    const poids = NOMS_CARACTERISTIQUES.map((n) => Math.sqrt(poidsFixes[n] || 0));
    const points = exemples.map((ex) => ({ z: ex.valeurs.map((v, j) => ((v - lin.moy[j]) / lin.ect[j]) * poids[j]), cible: ex.cible, commune: ex.commune || null }));
    return { type: 'voisins', k, moy: lin.moy, ect: lin.ect, poids, memeCommune, points, noms: NOMS_CARACTERISTIQUES, n: exemples.length };
  }
  // Les mesures qui comptent pèsent plus dans la distance : le poids de la régression (en valeur absolue) sert
  // d'échelle, avec un plancher pour qu'aucune mesure ne disparaisse.
  const poids = ponderer ? lin.poids.slice(1).map((w) => Math.max(0.15, Math.abs(w))) : lin.poids.slice(1).map(() => 1);
  const points = exemples.map((ex) => ({ z: ex.valeurs.map((v, j) => ((v - lin.moy[j]) / lin.ect[j]) * poids[j]), cible: ex.cible, commune: ex.commune || null }));
  return { type: 'voisins', k, moy: lin.moy, ect: lin.ect, poids, memeCommune, points, noms: NOMS_CARACTERISTIQUES, n: exemples.length };
}

export function coefficientVoisins(modele, valeurs, { commune = null } = {}) {
  const z = valeurs.map((v, j) => ((v - modele.moy[j]) / modele.ect[j]) * modele.poids[j]);
  let base = modele.points;
  if (modele.memeCommune && commune) { const m = base.filter((p) => p.commune === commune); if (m.length >= modele.k) base = m; }
  const voisins = base.map((p) => { let d = 0; for (let j = 0; j < z.length; j += 1) d += (z[j] - p.z[j]) ** 2; return { d: Math.sqrt(d), cible: p.cible }; })
    .sort((a, b) => a.d - b.d).slice(0, modele.k);
  // Médiane pondérée par l'inverse de la distance : un voisin identique pèse lourd, un lointain peu.
  const pond = voisins.map((v) => ({ ...v, w: 1 / (0.05 + v.d) })).sort((a, b) => a.cible - b.cible);
  const total = pond.reduce((s2, v) => s2 + v.w, 0);
  let cumul = 0;
  let cible = pond[0]?.cible ?? 0;
  for (const v of pond) { cumul += v.w; if (cumul >= total / 2) { cible = v.cible; break; } }
  return Math.min(2.2, Math.max(0.5, Math.exp(cible)));
}

// ── Les arbres boostés (9 nov. 2026) : les classes de Data-B sont des seuils (rue de plus d'un kilomètre, rue
// piétonne, axe d'importance 3), que des arbres trouvent seuls là où la distance des voisins se dilue. Perte en
// valeur absolue (chaque feuille prend la médiane des résidus) : on vise l'écart médian, pas la moyenne.

const medianeDe = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Pure : un arbre de régression (partage par moindres carrés sur les résidus, feuilles à la médiane). */
function arbre(X, r, indices, profondeur, minFeuille) {
  if (profondeur === 0 || indices.length < 2 * minFeuille) return { v: medianeDe(indices.map((i) => r[i])) };
  let meilleur = null;
  const p = X[0].length;
  for (let j = 0; j < p; j += 1) {
    const ordre = [...indices].sort((a, b) => X[a][j] - X[b][j]);
    let sg = 0; let sg2 = 0; let st = 0; let st2 = 0;
    for (const i of ordre) { st += r[i]; st2 += r[i] * r[i]; }
    for (let k = 0; k < ordre.length - 1; k += 1) {
      const i = ordre[k];
      sg += r[i]; sg2 += r[i] * r[i];
      const ng = k + 1; const nd = ordre.length - ng;
      if (ng < minFeuille || nd < minFeuille || X[i][j] === X[ordre[k + 1]][j]) continue;
      const sd = st - sg; const sd2 = st2 - sg2;
      const perte = (sg2 - (sg * sg) / ng) + (sd2 - (sd * sd) / nd);
      if (!meilleur || perte < meilleur.perte) meilleur = { perte, j, seuil: (X[i][j] + X[ordre[k + 1]][j]) / 2 };
    }
  }
  if (!meilleur) return { v: medianeDe(indices.map((i) => r[i])) };
  const g = indices.filter((i) => X[i][meilleur.j] <= meilleur.seuil);
  const d = indices.filter((i) => X[i][meilleur.j] > meilleur.seuil);
  return { j: meilleur.j, s: meilleur.seuil, g: arbre(X, r, g, profondeur - 1, minFeuille), d: arbre(X, r, d, profondeur - 1, minFeuille) };
}
const predireArbre = (a, x) => (a.v !== undefined ? a.v : predireArbre(x[a.j] <= a.s ? a.g : a.d, x));

/**
 * Pure : apprend le coefficient de rue par arbres boostés. `exemples` : [{ valeurs, cible }], cible = ln(rue ÷ ville).
 * Tirage reproductible des sous-échantillons (graine fixe).
 */
export function apprendreArbres(exemples, { arbres = 300, profondeur = 4, pas = 0.05, minFeuille = 8, part = 0.8, graine = 11 } = {}) {
  const X = exemples.map((e) => e.valeurs);
  const y = exemples.map((e) => e.cible);
  const base = medianeDe(y);
  const F = y.map(() => base);
  let g = graine >>> 0 || 11;
  const alea = () => { g ^= g << 13; g >>>= 0; g ^= g >>> 17; g ^= g << 5; g >>>= 0; return g / 4294967296; };
  const foret = [];
  for (let t = 0; t < arbres; t += 1) {
    const r = y.map((v, i) => v - F[i]);
    const indices = X.map((_, i) => i).filter(() => alea() < part);
    const a = arbre(X, r, indices, profondeur, minFeuille);
    foret.push(a);
    for (let i = 0; i < X.length; i += 1) F[i] += pas * predireArbre(a, X[i]);
  }
  return { type: 'arbres', base, pas, foret, noms: NOMS_CARACTERISTIQUES, n: exemples.length, arbres, profondeur };
}

/** Pure : les deux modèles ensemble ; ils se trompent sur des rues différentes, leur moyenne géométrique corrige. */
export function apprendreMixte(exemples, { arbres = {}, voisins = {} } = {}) {
  return { type: 'mixte', modeles: [apprendreArbres(exemples, arbres), apprendreVoisins(exemples, voisins)], n: exemples.length, noms: NOMS_CARACTERISTIQUES };
}

/** Pure : le coefficient prédit (rue ÷ quartier) pour des caractéristiques. */
export function coefficient(modele, valeurs, options = {}) {
  if (modele.type === 'mixte') return Math.exp(modele.modeles.reduce((s, m) => s + Math.log(coefficient(m, valeurs, options)), 0) / modele.modeles.length);
  if (modele.type === 'voisins') return coefficientVoisins(modele, valeurs, options);
  if (modele.type === 'arbres') {
    let s = modele.base;
    for (const a of modele.foret) s += modele.pas * predireArbre(a, valeurs);
    return Math.min(2.2, Math.max(0.5, Math.exp(s)));
  }
  let s = modele.poids[0];
  for (let j = 0; j < valeurs.length; j += 1) s += modele.poids[j + 1] * ((valeurs[j] - modele.moy[j]) / modele.ect[j]);
  // Borné à ce que Data-B montre (0,5 à 2,2 fois le quartier) : pas d'extrapolation folle.
  return Math.min(2.2, Math.max(0.5, Math.exp(s)));
}

/** Pure : la fourchette au format Data-B (centre ± 20 %), arrondie à l'euro. */
export const fourchette = (centre) => ({ basse: Math.round(centre / 1.2), haute: Math.round(centre * 1.2 / 1.0) });

/**
 * La valeur locative K-Data d'une rue, à partir de la valeur du quartier et du modèle appris.
 * @returns {{ centre, basse, haute, coefficient, caracteristiques } | null} null si la rue est inconnue de SIRENE
 */
export function valeurRue(modele, { commune, rue, quartierCentre }) {
  const c = caracteristiquesRue(commune, rue);
  if (!c) return null;
  const k = coefficient(modele, c.valeurs);
  const centre = Math.round(quartierCentre * k);
  return { centre, ...fourchette(centre), coefficient: k, caracteristiques: c.brut };
}
