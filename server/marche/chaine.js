// La chaîne de repli : ce qu'on cherche, et où on va le chercher.
//
// Deux axes, et c'est volontaire.
//
// Un BESOIN est une question posée au marché — « combien se loue le mètre
// carré commercial ici ». Une CHAÎNE est la liste ordonnée des sources qui
// savent y répondre, de la plus fiable à la moins précise. Le repli joue à
// l'intérieur d'un besoin : Equimmox tombe, Data-B répond, la question reste
// couverte.
//
// Une seule liste « Equimmox → Data-B → Figaro » aurait fait perdre des
// données : les cessions de fonds et le résidentiel ne remplacent pas les
// loyers, ils s'y ajoutent. Une source qui échoue ne doit coûter que ce
// qu'elle apportait, pas le reste de la lecture.
//
// L'ordre se change sans toucher au code : MARCHE_CHAINE_LOYER_COMMERCIAL=
// data-b-valeur-locative,equimmox inverse les deux. Ajouter une source, c'est
// un fichier dans connecteurs/ et son nom dans la liste.

import { tenter } from './connecteur.js';
import { poser, manquants } from './normalise.js';
import { DEFINITIVE, TEMPORAIRE } from './erreurs.js';

export const BESOINS_DEFAUT = [
  {
    cle: 'loyer_commercial',
    titre: 'les loyers commerciaux',
    indicateurs: ['loyer_commercial_m2_an'],
    chaine: ['equimmox', 'data-b-valeur-locative'],
  },
  {
    cle: 'cessions_fonds',
    titre: 'les cessions de fonds',
    indicateurs: ['prix_fonds_commerce'],
    chaine: ['data-b-transactions'],
  },
  {
    cle: 'residentiel',
    titre: 'le marché résidentiel',
    indicateurs: ['prix_residentiel_m2', 'loyer_residentiel_m2_mois'],
    chaine: ['figaro'],
  },
];

/** MARCHE_CHAINE_LOYER_COMMERCIAL=equimmox,data-b-valeur-locative */
function chaineConfiguree(cle, defaut) {
  const brut = (process.env[`MARCHE_CHAINE_${cle.toUpperCase()}`] || '').trim();
  if (!brut) return defaut;
  const liste = brut.split(',').map((x) => x.trim()).filter(Boolean);
  return liste.length ? liste : defaut;
}

/** Les besoins, ordre des chaînes compris, tels que la configuration les veut. */
export function besoinsConfigures(besoins = BESOINS_DEFAUT) {
  return besoins.map((b) => ({ ...b, chaine: chaineConfiguree(b.cle, b.chaine) }));
}

let cacheRegistre = null;
/** Les connecteurs livrés avec Klocka, chargés à la demande. */
export async function registreParDefaut() {
  if (cacheRegistre) return cacheRegistre;
  const modules = await Promise.all([
    import('./connecteurs/equimmox.js'),
    import('./connecteurs/data-b-valeur-locative.js'),
    import('./connecteurs/data-b-transactions.js'),
    import('./connecteurs/figaro.js'),
  ]);
  cacheRegistre = Object.fromEntries(modules.map((m) => [m.default.cle, m.default]));
  return cacheRegistre;
}

/** Ce que l'écran affiche pour un besoin : le libellé de sa source de tête. */
export function ecranDe(besoin, connecteurs) {
  const tete = connecteurs[besoin.chaine[0]];
  return tete?.ecran || { court: besoin.titre, ligne: `Je cherche ${besoin.titre}`, legende: '' };
}

/**
 * Interroge toutes les sources et rend une lecture de marché, complète ou non.
 *
 * Ne jette jamais. Une source qui tombe coûte ses indicateurs, rien de plus ;
 * quand elles tombent toutes, la lecture est simplement vide et signalée
 * comme telle. C'est à l'appelant de décider quoi en faire — surtout pas de
 * s'arrêter.
 *
 * @param {object} contexte - { adresse, surface, rayon, forcer, user }
 * @param {object} [options]
 * @param {object} [options.connecteurs] - le registre, remplaçable en test
 * @param {Array} [options.besoins]
 * @param {(t:object)=>void} [options.surTentative] - après chaque essai
 * @param {(c:object, brut:object)=>void} [options.surResultat] - dès qu'une source répond
 * @param {(rang:number, besoin:object)=>void} [options.surBesoin] - au passage à un besoin
 */
export async function collecter(contexte, options = {}) {
  const connecteurs = options.connecteurs || (await registreParDefaut());
  const besoins = options.besoins || besoinsConfigures();
  const { surTentative = null, surResultat = null, surBesoin = null } = options;

  const indicateurs = {};
  const brut = {};
  const tentatives = [];
  const parBesoin = {};
  const notifications = [];
  // Une source interrogée une fois ne l'est pas deux dans le même passage,
  // qu'elle ait répondu ou non : elle peut servir deux besoins, et une source
  // à terre le reste le temps de la lecture.
  const vues = new Map();

  for (let rang = 0; rang < besoins.length; rang++) {
    const besoin = besoins[rang];
    surBesoin?.(rang, besoin);
    const etat = { cle: besoin.cle, titre: besoin.titre, servi_par: null, essayees: [], echecs: [] };
    parBesoin[besoin.cle] = etat;

    for (const cleSource of besoin.chaine) {
      const connecteur = connecteurs[cleSource];
      if (!connecteur) {
        etat.echecs.push({ source: cleSource, service: cleSource, classe: DEFINITIVE, erreur: `Source inconnue : ${cleSource}.` });
        continue;
      }
      etat.essayees.push(cleSource);

      let issue = vues.get(cleSource);
      if (!issue) {
        issue = await tenter(connecteur, contexte, {
          ...options,
          surTentative: (t) => {
            const enrichie = { ...t, besoin: besoin.cle, rang };
            tentatives.push(enrichie);
            surTentative?.(enrichie);
          },
        });
        vues.set(cleSource, issue);
        if (issue.ok) {
          brut[cleSource] = issue.resultat;
          surResultat?.(connecteur, issue.resultat);
        }
      }

      if (issue.ok) {
        poser(indicateurs, connecteur.normaliser(issue.resultat));
        etat.servi_par = cleSource;
        break;
      }
      etat.echecs.push({ source: cleSource, service: connecteur.service, classe: issue.classe, erreur: issue.erreur });
      // Un compte refusé, un plan insuffisant : l'utilisateur doit le savoir,
      // le repli ne le réparera pas.
      if (issue.classe === DEFINITIVE) {
        notifications.push({ source: cleSource, service: connecteur.service, message: issue.erreur });
      }
    }
  }

  const attendus = besoins.flatMap((b) => b.indicateurs);
  const echecs = [...vues.entries()].filter(([, i]) => !i.ok);
  const servies = [...vues.entries()].filter(([, i]) => i.ok).map(([c]) => c);

  return {
    // Le format pivot, une entrée par indicateur obtenu. Les absents ne sont
    // pas là : une case vide, jamais un zéro.
    indicateurs,
    // Les résultats bruts, tels que les cartes de l'onglet Marché les lisent.
    brut,
    besoins: parBesoin,
    tentatives,
    sources_utilisees: servies,
    sources_en_echec: echecs.map(([cle, i]) => ({
      source: cle,
      service: connecteurs[cle]?.service || cle,
      classe: i.classe,
      erreur: i.erreur,
      essais: i.tentatives.length,
    })),
    notifications,
    indicateurs_manquants: manquants(indicateurs, attendus),
    besoins_couverts: Object.values(parBesoin).filter((b) => b.servi_par).length,
    besoins_total: besoins.length,
    complet: manquants(indicateurs, attendus).length === 0,
    // Une panne peut se réparer toute seule : elle mérite qu'on repasse plus
    // tard. Un mur ou une absence de donnée, non.
    a_reessayer: echecs.some(([, i]) => i.classe === TEMPORAIRE),
    fin: new Date().toISOString(),
  };
}
