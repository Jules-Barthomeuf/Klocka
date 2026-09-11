// Le contrat d'un connecteur, et la façon dont on l'interroge.
//
// Un connecteur est une source de données de marché ramenée à quatre choses :
//
//   cle          son identifiant dans la chaîne          'equimmox'
//   service      le nom que voit l'utilisateur           'Equimmox'
//   fournit      les indicateurs qu'il sait donner       ['loyer_commercial_m2_an']
//   lire(ctx)    va chercher, rend le résultat brut, ou jette
//   normaliser() traduit ce brut dans le format pivot
//
// Rien d'autre. Ajouter une source, c'est écrire ces cinq lignes et la citer
// dans la chaîne ; ni le moteur de réessai ni l'écran n'ont à le savoir.
//
// `tenter` est la seule façon d'appeler un connecteur. Elle porte la règle de
// l'employé : sur une panne on repasse, en espaçant ; devant un mur on
// s'arrête tout de suite et on prévient. Chaque passage est daté et gardé,
// parce qu'un chiffre sans son histoire ne se défend pas.

import { classer, TEMPORAIRE, DEFINITIVE } from './erreurs.js';

// Cinq secondes, puis quinze, puis quarante-cinq : trois réessais, un peu plus
// d'une minute en tout. Assez pour laisser passer un redémarrage de leur côté,
// assez peu pour que la page ne semble pas figée.
export const ATTENTES_MS = [5000, 15000, 45000];

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Interroge un connecteur, en réessayant ce qui mérite de l'être.
 *
 * @param {object} connecteur - { cle, service, lire }
 * @param {object} contexte - { adresse, surface, rayon, forcer, user }
 * @param {object} [options]
 * @param {number[]} [options.attentes] - les délais entre deux essais, en ms
 * @param {(ms:number)=>Promise} [options.patienter] - l'attente, remplaçable en test
 * @param {()=>number} [options.maintenant] - l'horloge, remplaçable en test
 * @param {(t:object)=>void} [options.surTentative] - appelé après chaque essai
 * @returns {Promise<{ok, resultat, tentatives, classe, erreur}>}
 */
export async function tenter(connecteur, contexte = {}, options = {}) {
  const {
    attentes = ATTENTES_MS,
    patienter = dors,
    maintenant = Date.now,
    surTentative = null,
  } = options;

  const tentatives = [];
  let dernier = null;

  for (let essai = 1; ; essai++) {
    const debut = maintenant();
    let tentative;
    try {
      const resultat = await connecteur.lire(contexte);
      tentative = {
        source: connecteur.cle,
        service: connecteur.service,
        essai,
        debut: new Date(debut).toISOString(),
        ms: maintenant() - debut,
        ok: true,
        classe: null,
        erreur: null,
      };
      tentatives.push(tentative);
      surTentative?.(tentative);
      return { ok: true, resultat, tentatives, classe: null, erreur: null };
    } catch (e) {
      const verdict = classer(e);
      tentative = {
        source: connecteur.cle,
        service: connecteur.service,
        essai,
        debut: new Date(debut).toISOString(),
        ms: maintenant() - debut,
        ok: false,
        classe: verdict.classe,
        statut: verdict.statut,
        // Une erreur qu'aucun indice ne désigne : on la traite comme une panne,
        // mais on le note pour pouvoir enrichir erreurs.js plus tard.
        reconnue: verdict.reconnue,
        erreur: verdict.message,
      };
      tentatives.push(tentative);
      surTentative?.(tentative);
      dernier = verdict;

      const reste = attentes[essai - 1];
      // Un mur, une absence de donnée, ou plus d'essais en réserve : on rend
      // la main à la chaîne, qui ira voir la source suivante.
      if (verdict.classe !== TEMPORAIRE || reste == null) {
        return { ok: false, resultat: null, tentatives, classe: verdict.classe, erreur: verdict.message };
      }
      tentative.attente_ms = reste;
      await patienter(reste);
    }
  }
}

/** Vrai si l'échec de ce connecteur doit remonter à l'utilisateur. */
export const aPrevenir = (issue) => issue?.classe === DEFINITIVE;
