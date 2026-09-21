// Le loyer déduit des ventes : ce que vaut le mètre carré à louer, quand on
// sait ce qu'il vaut à acheter.
//
// DVF publie chaque vente de murs commerciaux, prix et surface. Un
// investisseur achète des murs pour leur rendement : prix × taux = loyer. La
// grille de taux de l'estimation (kestimation.js, GRILLE_TAUX) dit ce taux par
// emplacement ; sans emplacement connu on prend la bande du milieu, 6,5 à
// 8 %, celle des n° 1 bis et n° 2 qui font le gros des rues.
//
// C'est une DÉDUCTION, pas un constat : elle vaut moins qu'un bail signé lu
// chez Equimmox, et l'écran le dit. Mais elle ne coûte rien, répond en une
// seconde, et sait lire trois cents rues d'une ville — ce qu'aucun pilotage
// de navigateur ne peut faire. C'est elle qui remplace le loyer de rue que
// un service payant vendait à ALX.

import { ventesAutour, N_MINIMUM } from './dvf.js';

/** La bande de taux par défaut : le milieu de la grille, n° 1 bis et n° 2 en grande ville. */
export const TAUX_DEFAUT = { bas: 6.5, haut: 8 };
export const RAYON_DEFAUT = 500;

const arrondir = (n) => (n == null ? null : Math.round(n));

/**
 * Le loyer au m² déduit d'une fourchette de prix au m². Pure : testée sans
 * réseau.
 *
 * Le bas du prix au taux bas donne le bas du loyer ; le haut du prix au taux
 * haut donne le haut. La médiane prend le taux du milieu. Un prix manquant ne
 * donne rien : aucun euro n'est inventé.
 */
export function loyerDerive(prix_m2, taux = TAUX_DEFAUT) {
  if (!prix_m2 || (prix_m2.bas == null && prix_m2.median == null && prix_m2.haut == null)) return null;
  const tBas = Number(taux?.bas) || TAUX_DEFAUT.bas;
  const tHaut = Number(taux?.haut) || TAUX_DEFAUT.haut;
  const tMoyen = (tBas + tHaut) / 2;
  const bas = prix_m2.bas ?? prix_m2.median ?? prix_m2.haut;
  const haut = prix_m2.haut ?? prix_m2.median ?? prix_m2.bas;
  const median = prix_m2.median ?? (bas + haut) / 2;
  return {
    basse: arrondir((bas * tBas) / 100),
    moyenne: arrondir((median * tMoyen) / 100),
    haute: arrondir((haut * tHaut) / 100),
    taux: { bas: tBas, moyen: tMoyen, haut: tHaut },
  };
}

/** Le rayon d'une rue : ses ventes, pas celles du quartier entier. */
export const RAYON_RUE = 300;

/**
 * Le loyer d'une rue, sous la forme que le classement ALX lisait — la
 * fourchette rangée sous `rue` — déduit des ventes à 300 m. C'est ce que
 * Un service payant vendait cela rue par rue ; trois cents rues d'une ville se lisent ainsi
 * en quelques secondes, le fichier DVF de la commune étant en cache.
 */
export async function loyerDeRue(adresse, { rayon = RAYON_RUE, user = null } = {}) {
  const r = await loyerDvf(adresse, { rayon, user });
  if (!r.ok) return r;
  const d = r.resultat;
  return {
    ok: true,
    resultat: {
      source: d.source,
      unite: d.unite,
      derive: true,
      adresse: d.adresse,
      rue: { nom: String(adresse || '').split(',')[0].trim() || null, basse: d.basse, moyenne: d.moyenne, haute: d.haute, n: d.n, rayon: d.rayon },
      quartier: null,
      ville: null,
      dvf: d,
      le: d.le,
    },
  };
}

/**
 * Le loyer déduit des ventes autour d'une adresse.
 * @param {string} texteAdresse
 * @param {{rayon?: number, taux?: {bas:number, haut:number}, forcer?: boolean, user?: object}} opts
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string}>}
 */
export async function loyerDvf(texteAdresse, { rayon = RAYON_DEFAUT, taux = TAUX_DEFAUT, forcer = false, user = null } = {}) {
  const v = await ventesAutour(texteAdresse, { rayon, forcer, user });
  if (!v.ok) return v;
  const d = v.resultat;
  const loyer = loyerDerive(d.prix_m2, taux);
  if (!loyer) {
    return { ok: false, error: `${d.n} vente${d.n > 1 ? 's' : ''} de murs commerciaux dans ${rayon} m : il en faut ${N_MINIMUM} pour déduire un loyer.`, classe: 'sans_donnee' };
  }
  return {
    ok: true,
    resultat: {
      source: 'DVF · prix des murs × taux de rendement',
      unite: '€ / m² / an',
      derive: true,
      adresse: d.adresse,
      rayon: rayon >= 1000 ? `${rayon / 1000} km` : `${rayon} m`,
      rayon_m: rayon,
      n: d.n,
      annees: d.annees,
      periode: d.periode,
      prix_m2: d.prix_m2,
      ...loyer,
      lien: d.lien,
      le: new Date().toISOString(),
      par: user?.email || null,
      du_cache: !!d.du_cache,
    },
  };
}
