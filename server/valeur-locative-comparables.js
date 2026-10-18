// La valeur locative par comparables (18 oct. 2026, plan de la boîte à outils de Haka) : une seule liste
// de références, chacune avec sa source et son poids, cherchées en cercles autour de l'adresse, une
// fourchette par quartiles pondérés et une confiance calculée par le code.
//
// Pur : aucune base, aucun réseau. Les poids et les seuils sont ici, et seulement ici : on les règle
// quand le comptage des loyers sur Render sera connu, sans rien changer d'autre.

/** Le poids d'une référence selon sa source : un bail lu > un loyer saisi ou annoncé > Equimmox. */
export const POIDS = { klocka_bail: 3, klocka_saisi: 1.5, klocka_fiche: 1.5, equimmox: 1 };

/** Les cercles, du plus serré au plus large ; on s'arrête au premier qui a assez de références Klocka. */
export const CERCLES = [
  { cle: 'troncon', libelle: 'Le tronçon', rayon: 80, memeRue: true },
  { cle: 'rue', libelle: 'La rue', memeRue: true },
  // L'IRIS viendra avec l'identifiant de local (F1) ; d'ici là, le quartier est un cercle de 500 m.
  { cle: 'quartier', libelle: 'Le quartier (500 m)', rayon: 500 },
  { cle: 'commune', libelle: 'La commune', memeCommune: true },
];

/** Combien de références Klocka un cercle doit réunir pour qu'on s'y arrête. */
export const MIN_PAR_CERCLE = 5;

/** Les seuils de la confiance. Sous « moyenne », Equimmox est affiché et Klocka sert de contrôle. */
export const SEUILS = {
  haute: { klocka: 5, dispersion: 0.35, age_ans: 3 },
  moyenne: { klocka: 3, dispersion: 0.6, age_ans: 6 },
};

const sourceDe = (ref) => (ref.source ? ref.source : ref.origine === 'reel' ? 'klocka_bail' : ref.origine === 'saisi' ? 'klocka_saisi' : 'klocka_fiche');

/** Pure : la distance en mètres entre deux points { lat, lon }. */
export function distanceM(a, b) {
  if (!(a?.lat != null && a?.lon != null && b?.lat != null && b?.lon != null)) return null;
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Pure : le nom d'une rue sans numéro, sans accents, sans « rue/avenue » (pour comparer deux rues). */
export function cleRue(rue) {
  return String(rue || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^\s*\d+\s*(bis|ter|quater|[a-d])?\b[\s,]*/i, '')
    .replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|quai|allee|chemin|impasse|route|rte|square|passage)\b\.?/g, ' ')
    .replace(/\b(de|du|des|la|le|les|l|d)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Pure : le quantile pondéré `q` (0 à 1) de valeurs et de poids. */
export function quantilePondere(valeurs, poids, q) {
  const t = valeurs.map((v, i) => ({ v, p: poids[i] ?? 1 })).filter((x) => Number.isFinite(x.v) && x.p > 0).sort((a, b) => a.v - b.v);
  if (!t.length) return null;
  const total = t.reduce((s, x) => s + x.p, 0);
  let cumul = 0;
  for (const x of t) {
    cumul += x.p;
    if (cumul / total >= q) return x.v;
  }
  return t[t.length - 1].v;
}

/** Pure : la fourchette (quartile bas, médiane, quartile haut) des références, pondérée. */
export function fourchette(refs) {
  const valeurs = refs.map((r) => r.loyer_m2);
  const poids = refs.map((r) => r.poids ?? POIDS[sourceDe(r)] ?? 1);
  const bas = quantilePondere(valeurs, poids, 0.25);
  const central = quantilePondere(valeurs, poids, 0.5);
  const haut = quantilePondere(valeurs, poids, 0.75);
  return central == null ? null : { bas: Math.round(bas), central: Math.round(central), haut: Math.round(haut) };
}

/** Pure : l'âge en années d'une référence datée, à `maintenant`. */
const ageAns = (le, maintenant) => (le ? Math.max(0, (maintenant - Date.parse(le)) / (365.25 * 86400000)) : null);

/**
 * Pure : la confiance, d'après le nombre de références Klocka, leur âge médian et la dispersion
 * (écart entre quartiles rapporté à la médiane).
 */
export function confiance({ klocka = 0, age_ans = null, dispersion = null } = {}) {
  const passe = (s) => klocka >= s.klocka && (dispersion == null || dispersion <= s.dispersion) && (age_ans == null || age_ans <= s.age_ans);
  if (passe(SEUILS.haute)) return 'haute';
  if (passe(SEUILS.moyenne)) return 'moyenne';
  return 'faible';
}

/** Pure : les références d'un cercle autour de la cible. */
function dansLeCercle(cercle, cible, ref) {
  if (cercle.memeCommune) {
    if (cible.code_insee && ref.adresse?.code_insee) return cible.code_insee === ref.adresse.code_insee;
    return !!cible.ville && !!ref.adresse?.ville && cible.ville.toLowerCase() === ref.adresse.ville.toLowerCase();
  }
  const d = distanceM(cible, ref.point);
  if (cercle.memeRue) {
    const memeRue = !!cible.rue && cleRue(cible.rue) === cleRue(ref.adresse?.rue) && (!cible.code_postal || cible.code_postal === ref.adresse?.code_postal);
    if (!memeRue) return false;
    return cercle.rayon ? d != null && d <= cercle.rayon : true;
  }
  return d != null && d <= cercle.rayon;
}

/**
 * Pure : la valeur locative par comparables.
 *
 * @param {{lat, lon, rue, code_postal, code_insee, ville, surface?}} cible
 * @param {Array} refsKlocka  références Klocka (loyers.referencesKlocka), avec `point` quand on l'a géocodée
 * @param {Array} refsEquimmox  [{ loyer_m2, niveau: 'rue'|'quartier'|'commune', le, libelle }]
 * @returns {{ niveau, libelle, comparables, fourchette, confiance, affichee: 'klocka'|'equimmox'|null, valeur, controle }}
 */
export function valeurParComparables(cible, refsKlocka = [], refsEquimmox = [], { maintenant = Date.now() } = {}) {
  const klocka = refsKlocka.map((r) => ({ ...r, source: sourceDe(r), poids: POIDS[sourceDe(r)] ?? 1 }));
  // Le premier cercle qui réunit assez de loyers Klocka ; sinon le plus large qui en a au moins un.
  let retenu = null;
  for (const c of CERCLES) {
    const dedans = klocka.filter((r) => dansLeCercle(c, cible, r));
    if (dedans.length >= MIN_PAR_CERCLE) { retenu = { cercle: c, dedans }; break; }
    if (dedans.length) retenu = { cercle: c, dedans };
  }
  const niveauEq = retenu?.cercle.cle === 'commune' ? 'commune' : retenu?.cercle.cle === 'quartier' ? 'quartier' : 'rue';
  const eq = refsEquimmox
    .filter((e) => Number.isFinite(e.loyer_m2))
    .map((e) => ({ ...e, source: 'equimmox', poids: POIDS.equimmox }));
  const eqDuNiveau = eq.filter((e) => e.niveau === niveauEq);
  const comparables = [...(retenu?.dedans || []), ...(eqDuNiveau.length ? eqDuNiveau : eq.slice(0, 1))];

  const four = fourchette(comparables);
  const fourKlocka = retenu ? fourchette(retenu.dedans) : null;
  const ages = (retenu?.dedans || []).map((r) => ageAns(r.le, maintenant)).filter((a) => a != null).sort((a, b) => a - b);
  const age = ages.length ? Math.round(ages[Math.floor(ages.length / 2)] * 10) / 10 : null;
  const dispersion = fourKlocka && fourKlocka.central ? Math.round(((fourKlocka.haut - fourKlocka.bas) / fourKlocka.central) * 100) / 100 : null;
  const conf = confiance({ klocka: retenu?.dedans.length || 0, age_ans: age, dispersion });

  // Sous le seuil, Equimmox est affiché ; les loyers Klocka restent en contrôle.
  // Affiché, Equimmox l'est à son échelle la plus fine (la rue, puis le quartier, puis la commune) ;
  // en contrôle, il se compare au même niveau que les loyers Klocka.
  const ORDRE = ['rue', 'quartier', 'commune'];
  const eqPlusFin = [...eq].sort((a, b) => ORDRE.indexOf(a.niveau) - ORDRE.indexOf(b.niveau))[0] || null;
  const eqValeur = eqPlusFin;
  const eqControle = eqDuNiveau[0] || eqPlusFin;
  const affichee = conf !== 'faible' && four ? 'klocka' : eqValeur ? 'equimmox' : four ? 'klocka' : null;
  const valeur = affichee === 'klocka' ? four
    : affichee === 'equimmox' ? { bas: eqValeur.bas ?? eqValeur.loyer_m2, central: eqValeur.loyer_m2, haut: eqValeur.haut ?? eqValeur.loyer_m2 }
      : null;
  return {
    niveau: retenu?.cercle.cle || null,
    libelle: retenu?.cercle.libelle || null,
    comparables: comparables.map((r) => ({
      source: r.source, poids: r.poids, loyer_m2: r.loyer_m2, loyer_m2_brut: r.loyer_m2_brut ?? null, ilc: r.ilc?.actualise ? { de: r.ilc.de, a: r.ilc.a, facteur: r.ilc.facteur } : null, surface: r.surface ?? null, origine: r.origine ?? null,
      titre: r.titre ?? r.libelle ?? null, adresse: r.adresse?.ligne ?? r.adresse ?? null, deal_id: r.deal_id ?? null, document: r.document ?? null,
      distance_m: distanceM(cible, r.point), le: r.le ?? null,
    })),
    fourchette: four,
    klocka: { n: retenu?.dedans.length || 0, fourchette: fourKlocka, age_median_ans: age, dispersion },
    confiance: conf,
    affichee,
    valeur,
    // Ce que l'autre source dit, pour le contrôle : l'écart de la médiane Klocka à Equimmox.
    controle: fourKlocka && eqControle ? { equimmox: eqControle.loyer_m2, niveau: eqControle.niveau, klocka: fourKlocka.central, ecart_pct: Math.round(((fourKlocka.central / eqControle.loyer_m2) - 1) * 100) } : null,
  };
}

/** Pure : l'écart entre la valeur retenue et l'estimation Data-B (gardé, jamais affiché). */
export function ecartDataB(valeur, dataB) {
  if (!valeur?.central || !dataB) return null;
  const niveaux = ['rue', 'quartier', 'ville'].map((k) => {
    const d = dataB[k];
    const m = d && d.basse != null && d.haute != null ? (d.basse + d.haute) / 2 : d?.basse ?? d?.haute ?? null;
    return m ? { niveau: k, data_b: Math.round(m), ecart_pct: Math.round(((valeur.central / m) - 1) * 100) } : null;
  }).filter(Boolean);
  return niveaux.length ? niveaux : null;
}
