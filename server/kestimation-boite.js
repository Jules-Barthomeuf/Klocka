// Estimation des murs, les trois valeurs (lot 5 de la boîte à outils de Haka, spec de Jules du 18 oct. 2026).
//
// Trois valeurs calculées par le code, chacune avec sa source :
//   1. Par comparaison : le prix au m² de K-Transactions (ventes du cercle
//      retenu : parcelle, rue, IRIS ou commune) × la surface, ajusté à la
//      taille : on prend d'abord les ventes de surface proche (de la moitié au
//      double), s'il y en a au moins 5.
//   2. Par capitalisation : le loyer (en place, sinon de marché Equimmox ×
//      surface pondérée) ÷ le taux de rendement. Le taux vient des projets
//      Klocka signés de la commune (au moins 3) ; à défaut, du rendement
//      implicite du marché (loyer Equimmox au m² ÷ prix DVF au m², même zone) ;
//      à défaut, de la grille de taux de l'outil, et c'est dit.
//   3. Equimmox : son prix des murs (offres) au m² × la surface.
// La valeur retenue est la médiane des valeurs disponibles (la moyenne s'il y
// en a deux). La confiance dépend de l'écart entre elles. Jamais de valeur
// vide sans explication : on calcule avec ce qu'on a et on dit ce qui manque.

export const MIN_VENTES_TAILLE = 5;
export const MIN_RENDEMENTS_KLOCKA = 3;
export const SEUILS_ECART = { haute: 0.15, moyenne: 0.3 };
const TAUX_MIN = 4;
const TAUX_MAX = 12;

const arrondir = (v) => (v == null ? null : Math.round(v / 1000) * 1000);
const borner = (t) => Math.min(TAUX_MAX, Math.max(TAUX_MIN, Math.round(t * 100) / 100));
const nombre = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };
const mediane = (xs) => {
  const t = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};
const quartile = (t, q) => t[Math.min(t.length - 1, Math.floor(q * t.length))];

/** Pure : le prix au m² ajusté à la taille, à partir des ventes du cercle (avec leur surface). */
export function prixM2SelonTaille(ventes = [], surface = null, repli = null) {
  const proches = surface ? ventes.filter((v) => v.surface >= surface / 2 && v.surface <= surface * 2) : [];
  const base = proches.length >= MIN_VENTES_TAILLE ? proches : ventes;
  const t = base.map((v) => v.prix_m2).filter((x) => x > 0).sort((a, b) => a - b);
  if (t.length < MIN_VENTES_TAILLE) return repli ? { ...repli, n: repli.n ?? null, ajuste_taille: false } : null;
  return { bas: quartile(t, 0.25), median: Math.round(mediane(t)), haut: quartile(t, 0.75), n: t.length, ajuste_taille: base === proches };
}

/** Pure : le rendement brut des projets Klocka signés de la commune (loyer ÷ prix), au moins MIN_RENDEMENTS_KLOCKA. */
export function rendementKlocka(projets = [], { code_insee = null, ville = null } = {}) {
  const v = String(ville || '').toLowerCase();
  const taux = projets
    .filter((p) => p.statut === 'signe' && !p.archived)
    .filter((p) => (code_insee && String(p.code_insee || '') === code_insee) || (v && String(p.ville || '').toLowerCase() === v))
    .map((p) => {
      const loyer = nombre(p.sim_loyer_initial_ht);
      const prix = nombre(p.sim_prix_bien_negocie || p.prix_acquisition);
      return loyer && prix ? (loyer / prix) * 100 : null;
    })
    .filter((t) => t != null && t >= 2 && t <= 20);
  return taux.length >= MIN_RENDEMENTS_KLOCKA ? { taux: Math.round(mediane(taux) * 100) / 100, n: taux.length } : { taux: null, n: taux.length };
}

/** Pure : la confiance d'après l'écart relatif entre les valeurs (max − min) ÷ médiane. */
export function confianceEcart(moyennes = []) {
  const xs = moyennes.filter((x) => x != null);
  if (xs.length < 2) return { niveau: 'faible', ecart: null, raison: xs.length ? 'Une seule méthode a pu se calculer.' : 'Aucune méthode.' };
  const ecart = (Math.max(...xs) - Math.min(...xs)) / mediane(xs);
  const niveau = ecart <= SEUILS_ECART.haute ? 'haute' : ecart <= SEUILS_ECART.moyenne ? 'moyenne' : 'faible';
  return { niveau, ecart: Math.round(ecart * 100), raison: `${xs.length} méthodes, écart de ${Math.round(ecart * 100)} % entre la plus basse et la plus haute.` };
}

/**
 * Pure : les trois valeurs. `marche` : { murs (K-Transactions : prix_m2, ventes, cercle_libelle), rendement_klocka,
 * vlm_equimmox ({bas, moyenne, haut} € / m² / an), prix_equimmox ({bas, moyenne, haut} € / m²), taux_grille }.
 * `surfaces` : { totale, ponderee } ; `loyer` : loyer annuel en place (ou null).
 */
export function troisValeurs({ marche = {}, surfaces = {}, loyer = null }) {
  const manques = [];
  const methodes = {};
  const surface = surfaces.totale || null;
  const ponderee = surfaces.ponderee || surface;
  if (!surface) manques.push('la surface : sans elle, ni la comparaison ni Equimmox ne se calculent');

  // 1. Par comparaison.
  const murs = marche.murs;
  const pm2 = murs ? prixM2SelonTaille(murs.ventes || [], surface, murs.prix_m2 ? { ...murs.prix_m2, n: murs.n } : null) : null;
  if (pm2 && surface) {
    methodes.comparaison = {
      libelle: `Comparaison : ${pm2.n} ventes de murs (${murs.cercle_libelle || 'DVF'})${pm2.ajuste_taille ? ', de surface proche' : ''}`,
      source: 'K-Transactions (DVF, ventes Klocka)', prix_m2: pm2,
      basse: arrondir(pm2.bas * surface), moyenne: arrondir(pm2.median * surface), haute: arrondir(pm2.haut * surface),
    };
  } else if (!murs?.prix_m2 && !pm2) manques.push('des ventes de murs : moins de 5 dans la commune');

  // 2. Par capitalisation.
  const eq = marche.vlm_equimmox;
  const loyerMarche = eq?.moyenne && ponderee ? { bas: Math.round((eq.bas ?? eq.moyenne) * ponderee), moyen: Math.round(eq.moyenne * ponderee), haut: Math.round((eq.haut ?? eq.moyenne) * ponderee) } : null;
  const loyerRetenu = loyer || loyerMarche?.moyen || null;
  let taux = null;
  let origineTaux = null;
  let implicite = false;
  if (marche.rendement_klocka?.taux) { taux = borner(marche.rendement_klocka.taux); origineTaux = `projets Klocka signés de la commune (${marche.rendement_klocka.n})`; }
  else if (eq?.moyenne && pm2?.median) { taux = borner((eq.moyenne / pm2.median) * 100); origineTaux = 'rendement implicite du marché : loyer Equimmox au m² ÷ prix DVF au m²'; implicite = true; }
  else if (marche.taux_grille) { taux = borner(marche.taux_grille); origineTaux = "grille de taux de l'outil (ni projet Klocka signé, ni rendement implicite)"; }
  if (loyerRetenu && taux) {
    const cap = (l, t) => arrondir(l / (t / 100));
    methodes.capitalisation = {
      libelle: `Capitalisation du loyer ${loyer ? 'en place' : 'de marché (Equimmox)'} à ${String(taux).replace('.', ',')} %`,
      source: origineTaux, loyer: loyerRetenu, taux, taux_origine: origineTaux,
      basse: cap(loyerRetenu, borner(taux + 0.5)), moyenne: cap(loyerRetenu, taux), haute: cap(loyerRetenu, borner(taux - 0.5)),
      // Loyer de marché Equimmox capitalisé au rendement implicite (loyer Equimmox ÷ prix DVF) : on retombe sur le prix
      // DVF × surface, la comparaison elle-même. Montrée, elle ne compte pas comme une seconde voix.
      ...(implicite && !loyer && methodes.comparaison ? { redondante: true, note: 'Loyer de marché au rendement implicite : elle refait la comparaison, elle ne compte pas dans la médiane ni dans la confiance.' } : {}),
    };
  } else {
    if (!loyerRetenu) manques.push('un loyer : ni loyer en place, ni loyer de marché Equimmox');
    if (!taux) manques.push('un taux de rendement : ni projet Klocka signé, ni rendement implicite');
  }

  // 3. Equimmox, prix des murs.
  const px = marche.prix_equimmox;
  if (px?.moyenne && surface) {
    methodes.equimmox = {
      libelle: `Equimmox : prix des murs en offre${px.offres ? ` (${px.offres} offres)` : ''}`, source: 'Equimmox · Analyse de prix (offres)',
      prix_m2: { bas: px.bas ?? px.moyenne, median: px.moyenne, haut: px.haut ?? px.moyenne },
      basse: arrondir((px.bas ?? px.moyenne) * surface), moyenne: arrondir(px.moyenne * surface), haute: arrondir((px.haut ?? px.moyenne) * surface),
    };
  } else if (!px?.moyenne) manques.push('le prix des murs Equimmox (non lu, ou Equimmox non configuré)');

  const liste = Object.values(methodes).filter((m) => !m.redondante);
  const confiance = confianceEcart(liste.map((m) => m.moyenne));
  const valeurs = liste.length ? {
    basse: arrondir(mediane(liste.map((m) => m.basse))),
    moyenne: arrondir(mediane(liste.map((m) => m.moyenne))),
    haute: arrondir(mediane(liste.map((m) => m.haute))),
  } : null;
  return {
    ok: true,
    methodes,
    valeurs,
    prix_m2: valeurs && surface ? Math.round(valeurs.moyenne / surface) : null,
    confiance,
    manques,
    regle: 'Médiane des méthodes disponibles (moyenne s’il y en a deux).',
  };
}
