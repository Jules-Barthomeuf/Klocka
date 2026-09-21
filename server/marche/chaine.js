// La chaîne de repli : ce qu'on cherche, et où on va le chercher.
//
// Deux axes, et c'est volontaire.
//
// Un BESOIN est une question posée au marché — « combien se loue le mètre
// carré commercial ici ». Une CHAÎNE est la liste ordonnée des sources qui
// savent y répondre, de la plus fiable à la moins précise. Le repli joue à
// l'intérieur d'un besoin : Equimmox tombe, le loyer déduit des ventes répond,
// la question reste couverte.
//
// Une seule liste « Equimmox → DVF → Figaro » aurait fait perdre des
// données : les cessions de fonds et le résidentiel ne remplacent pas les
// loyers, ils s'y ajoutent. Une source qui échoue ne doit coûter que ce
// qu'elle apportait, pas le reste de la lecture.
//
// L'ordre se change sans toucher au code : MARCHE_CHAINE_LOYER_COMMERCIAL=
// valeur-locative,equimmox inverse les deux. Ajouter une source, c'est
// un fichier dans connecteurs/ et son nom dans la liste.

import { tenter } from './connecteur.js';
import { comparables, laPlusComparable } from '../../src/lib/echelles.js';
import { poser, manquants } from './normalise.js';
import { DEFINITIVE, TEMPORAIRE } from './erreurs.js';

export const BESOINS_DEFAUT = [
  {
    cle: 'loyer_commercial',
    titre: 'les loyers commerciaux',
    indicateurs: ['loyer_commercial_m2_an'],
    chaine: ['equimmox', 'valeur-locative'],
    // Les deux lectures sont faites, pas l'une puis l'autre en secours.
    // Le bien à surface comparable, puis la rue, le quartier et la ville, et le
    // loyer déduit des ventes : quand ils s'écartent, ce n'est pas un détail,
    // c'est le signal qu'il faut aller voir. Un repli silencieux le masquait.
    recouper: true,
  },
  {
    cle: 'cessions_fonds',
    titre: 'les cessions de fonds',
    indicateurs: ['prix_fonds_commerce'],
    chaine: ['bodacc-cessions'],
  },
  {
    cle: 'residentiel',
    titre: 'le marché résidentiel',
    indicateurs: ['prix_residentiel_m2', 'loyer_residentiel_m2_mois', 'evolution_prix_residentiel_1_an', 'evolution_prix_residentiel_5_ans'],
    chaine: ['figaro'],
  },
  // Ce qui s'est vendu pour de vrai. Séparé du loyer : ce n'est pas un repli,
  // c'est un autre point de vue, et il ne remplace personne. Il donne au prix
  // demandé un étalon qui ne vient pas du vendeur.
  {
    cle: 'ventes_commerciales',
    titre: 'les ventes réelles',
    indicateurs: ['prix_local_commercial_m2'],
    chaine: ['dvf'],
  },
  // La rue tient-elle ? Aucun loyer ne le dit.
  {
    cle: 'vitalite_commerciale',
    titre: 'la vitalité de la rue',
    indicateurs: ['fermetures_rue', 'creations_rue'],
    chaine: ['bodacc'],
  },
  // L'emplacement lui-même : le flux, le tronçon, le secteur. L'étude interne
  // le lit en dernier : c'est la plus longue la première fois.
  {
    cle: 'emplacement',
    titre: 'l’emplacement',
    indicateurs: ['flux_pieton_note', 'flux_voiture_note', 'commercialite_troncon_note', 'revenu_moyen_annuel', 'csp_plus', 'proprietaires_zone'],
    chaine: ['implantation'],
  },
];

/** MARCHE_CHAINE_LOYER_COMMERCIAL=equimmox,valeur-locative */
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
    import('./connecteurs/valeur-locative.js'),
    import('./connecteurs/bodacc-cessions.js'),
    import('./connecteurs/figaro.js'),
    import('./connecteurs/implantation.js'),
    import('./connecteurs/dvf.js'),
    import('./connecteurs/bodacc.js'),
  ]);
  cacheRegistre = Object.fromEntries(modules.map((m) => [m.default.cle, m.default]));
  return cacheRegistre;
}

// Au-delà de cet écart entre deux sources, on lève un drapeau : les deux
// mesures ne décrivent plus le même marché, et il faut aller voir laquelle
// se trompe. Quinze pour cent, c'est l'écart qu'un loyer de rue peut avoir
// avec une estimation de quartier sans que personne ne s'en inquiète.
export const ECART_ALERTE = Number(process.env.MARCHE_ECART_ALERTE) || 0.15;

/** Le milieu d'une lecture : sa médiane, sinon le centre de sa fourchette. */
const centre = (v) => {
  if (v.median != null) return v.median;
  if (v.bas != null && v.haut != null) return (v.bas + v.haut) / 2;
  return v.bas ?? v.haut ?? null;
};

// Au-delà de ce rapport entre deux mailles d'une MÊME source, ce n'est plus
// une question d'échelle : la source se contredit. Une rue vaut couramment le
// double de son quartier ; au-delà du triple, c'est un échantillon de pieds
// d'immeuble prime ou une valeur aberrante, et cela se signale à part.
export const INCOHERENCE_INTERNE = Number(process.env.MARCHE_INCOHERENCE_INTERNE) || 3;

/**
 * Une source qui ne dit pas la même chose selon la maille interrogée.
 *
 * C'est une anomalie d'une autre nature qu'un désaccord entre deux services :
 * même méthode, même unité, même définition — donc aucune des explications
 * habituelles (pondération, périmètre de charges) ne peut la couvrir.
 */
function incoherences(lectures) {
  const parService = {};
  for (const v of lectures) {
    const c = centre(v);
    if (c == null || !v.service) continue;
    (parService[v.service] ||= []).push({ ...v, centre: c });
  }
  return Object.entries(parService)
    .map(([service, mailles]) => {
      if (mailles.length < 2) return null;
      const bas = mailles.reduce((m, v) => (v.centre < m.centre ? v : m));
      const haut = mailles.reduce((m, v) => (v.centre > m.centre ? v : m));
      const rapport = bas.centre > 0 ? haut.centre / bas.centre : null;
      if (rapport == null || rapport <= INCOHERENCE_INTERNE) return null;
      return {
        service,
        rapport,
        basse: { echelle: bas.echelle, precision: bas.precision, centre: bas.centre, bas: bas.bas, haut: bas.haut },
        haute: { echelle: haut.echelle, precision: haut.precision, centre: haut.centre, bas: haut.bas, haut: haut.haut },
      };
    })
    .filter(Boolean);
}

/**
 * Deux lectures ou plus d'un même indicateur, comparées À ÉCHELLE ÉGALE.
 *
 * Une source peut rendre plusieurs mailles (la valeur locative : rue, quartier, ville).
 * On retient, pour chacune, celle qui se compare le mieux à la portée de la
 * source de tête, et l'on écarte explicitement les autres — elles restent
 * lisibles dans `ecartees`, jamais supprimées.
 *
 * @returns {{cle, lectures, ecartees, incoherences, portee_reference, bas, haut, ecart, ecart_relatif, alerte}}
 */
export function comparer(cle, lectures) {
  const internes = incoherences(lectures);
  // La portée de référence : celle de la source de tête de la chaîne, qui est
  // la première lecture — l'ordre de confiance de l'équipe.
  const reference = lectures.find((v) => v.portee_m != null)?.portee_m ?? null;

  const parService = {};
  for (const v of lectures) (parService[v.service || v.connecteur] ||= []).push(v);
  const retenues = [];
  const ecartees = [];
  for (const groupe of Object.values(parService)) {
    const gardee = laPlusComparable(groupe, reference);
    for (const v of groupe) {
      if (v === gardee) continue;
      ecartees.push({ service: v.service, echelle: v.echelle, precision: v.precision, bas: v.bas, median: v.median, haut: v.haut, portee_m: v.portee_m, raison: 'autre maille de la même source' });
    }
    if (!gardee) continue;
    // Une maille trop éloignée de la référence ne se compare pas : la
    // signaler comme un désaccord serait inventer un écart.
    if (!comparables(gardee.portee_m, reference)) {
      ecartees.push({ service: gardee.service, echelle: gardee.echelle, precision: gardee.precision, bas: gardee.bas, median: gardee.median, haut: gardee.haut, portee_m: gardee.portee_m, raison: 'maille hors de portée comparable' });
      continue;
    }
    retenues.push(gardee);
  }

  const points = retenues.map((v) => ({ ...v, centre: centre(v) })).filter((v) => v.centre != null);
  if (points.length < 2) return { cle, lectures: retenues, ecartees, incoherences: internes, portee_reference: reference, alerte: false };
  const valeurs = points.map((p) => p.centre);
  const bas = Math.min(...valeurs);
  const haut = Math.max(...valeurs);
  // L'écart rapporté à la plus basse : « le secteur est 22 % au-dessus du bien ».
  const relatif = bas > 0 ? (haut - bas) / bas : null;
  return {
    cle,
    lectures: points.map((p) => ({ service: p.service, source: p.source, connecteur: p.connecteur, echelle: p.echelle, precision: p.precision, bas: p.bas, median: p.median, haut: p.haut, centre: p.centre, portee_m: p.portee_m, lien: p.lien })),
    ecartees,
    incoherences: internes,
    portee_reference: reference,
    bas,
    haut,
    ecart: haut - bas,
    ecart_relatif: relatif,
    alerte: relatif != null && relatif > ECART_ALERTE,
  };
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
        if (!etat.servi_par) etat.servi_par = cleSource;
        // Un besoin à recouper continue : c'est la comparaison qui compte.
        if (!besoin.recouper) break;
        continue;
      }
      etat.echecs.push({ source: cleSource, service: connecteur.service, classe: issue.classe, erreur: issue.erreur });
      // Un compte refusé, un plan insuffisant : l'utilisateur doit le savoir,
      // le repli ne le réparera pas.
      if (issue.classe === DEFINITIVE) {
        notifications.push({ source: cleSource, service: connecteur.service, message: issue.erreur });
      }
    }
  }

  // Ce que les sources disent d'un même indicateur, côte à côte. C'est ici
  // qu'un écart devient visible au lieu d'être absorbé par un repli.
  const recoupements = {};
  for (const besoin of besoins.filter((b) => b.recouper)) {
    for (const cleIndicateur of besoin.indicateurs) {
      const lectures = [];
      for (const cleSource of besoin.chaine) {
        const issue = vues.get(cleSource);
        if (!issue?.ok) continue;
        // Toutes les mailles, pas la première : c'est comparer() qui choisit
        // laquelle se compare, et qui garde trace de celles qu'il écarte.
        for (const v of connecteurs[cleSource].normaliser(issue.resultat)) {
          if (v?.cle === cleIndicateur) lectures.push(v);
        }
      }
      if (lectures.length >= 2) recoupements[cleIndicateur] = comparer(cleIndicateur, lectures);
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
    recoupements,
    besoins_couverts: Object.values(parBesoin).filter((b) => b.servi_par).length,
    besoins_total: besoins.length,
    complet: manquants(indicateurs, attendus).length === 0,
    // Une panne peut se réparer toute seule : elle mérite qu'on repasse plus
    // tard. Un mur ou une absence de donnée, non.
    a_reessayer: echecs.some(([, i]) => i.classe === TEMPORAIRE),
    fin: new Date().toISOString(),
  };
}
