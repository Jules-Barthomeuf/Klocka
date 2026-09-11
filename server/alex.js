// Alex — l'agent qui fait la recherche de marché à votre place.
//
// L'équipe ouvrait trois services à la main, l'un après l'autre : Data-B pour
// la valeur locative de la rue puis les cessions de fonds, Equimmox pour les
// baux comparables, Le Figaro pour le résidentiel. Quatre lectures, un quart
// d'heure, et autant d'occasions d'en oublier une.
//
// Alex pose désormais des QUESTIONS plutôt que d'ouvrir des services : « que
// vaut le mètre carré commercial ici », « que valent les fonds », « et le
// résidentiel ». Chaque question a sa liste ordonnée de sources (voir
// marche/chaine.js) ; si la première tombe, la suivante répond, et la
// question reste couverte. C'est ce qui distingue une panne d'Equimmox d'une
// case vide dans le dossier.
//
// Ce qui ne change pas : chaque résultat est posé sur le lot dès qu'il
// arrive, la page se remplit au fur et à mesure, et rien n'interrompt jamais
// la lecture. Ce qui change : les réessais, le repli, la trace de chaque
// tentative, et une reprise automatique quand il reste des cases vides.

import { Records } from './db.js';
import { collecter, besoinsConfigures, registreParDefaut, ecranDe } from './marche/chaine.js';
import { enregistrer } from './marche/journal.js';
import { planifier, annuler } from './marche/replanification.js';

const travaux = new Map();
const PLAFOND = 30;

const cleDe = (dealId, index) => `${dealId}|${index}`;

/** Le lot d'un dossier, tel qu'il est à cet instant. */
function lotDe(dealId, index) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  return { deal, lot: deal?.lots?.[index] || null };
}

/** Pose un résultat sur le lot, sans écraser ce qui a pu changer entre-temps. */
function poser(dealId, index, champ, valeur) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return;
  const lots = [...deal.lots];
  lots[index] = { ...lots[index], [champ]: valeur };
  Records.update('Deal', deal.id, { lots });
}

/** L'adresse d'un lot, telle qu'on la donne aux services. */
function adresseDe(lot) {
  const a = lot?.lot?.adresse?.valeur;
  if (!a) return '';
  return [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/**
 * Démarre — ou retrouve — la recherche de marché d'un lot.
 *
 * @param {string} dealId
 * @param {number} index
 * @param {{user?, forcer?, essai?, automatique?}} opts - `essai` compte les
 *   reprises automatiques ; `automatique` distingue une reprise d'un clic.
 * @returns {{cle, etat, etape, total, etapes}}
 */
export function lancerRechercheMarche(dealId, index = 0, { user = null, forcer = false, essai = 1, automatique = false } = {}) {
  const cle = cleDe(dealId, index);
  const enCours = travaux.get(cle);
  if (enCours?.etat === 'en_cours') return { cle, ...vue(enCours) };

  const travail = {
    etat: 'en_cours',
    // L'étape en cours, par son rang : c'est ce que l'écran suit.
    etape: 0,
    etapes: [],
    resultats: {},
    echecs: {},
    essai,
    automatique,
    depuis: new Date().toISOString(),
  };
  travaux.set(cle, travail);
  if (travaux.size > PLAFOND) {
    for (const [k, t] of travaux) {
      if (t.etat !== 'en_cours') travaux.delete(k);
      if (travaux.size <= PLAFOND) break;
    }
  }

  chercher(dealId, index, travail, { user, forcer }).catch((e) => {
    travail.etat = 'erreur';
    travail.erreur = e?.message || 'La recherche de marché a échoué.';
  });

  return { cle, ...vue(travail) };
}

async function chercher(dealId, index, travail, { user, forcer }) {
  const { lot } = lotDe(dealId, index);
  if (!lot) throw new Error('Lot introuvable.');

  const adresse = adresseDe(lot);
  if (!adresse) throw new Error('Aucune adresse sur ce lot : renseignez-la avant de lancer Alex.');
  const surface = Number(lot.lot?.surface_m2?.valeur) > 0 ? Number(lot.lot.surface_m2.valeur) : null;

  const connecteurs = await registreParDefaut();
  const besoins = besoinsConfigures();
  travail.etapes = besoins.map((b) => ecranDe(b, connecteurs));
  travail.total = besoins.length;

  const debut = new Date().toISOString();
  const chrono = Date.now();

  const rapport = await collecter(
    { adresse, surface, forcer, user },
    {
      connecteurs,
      besoins,
      surBesoin: (rang) => { travail.etape = rang; },
      surTentative: (t) => {
        // Un repli est entré en scène : l'écran doit dire le vrai nom du
        // service qu'on interroge, pas celui qui vient de tomber.
        const besoin = besoins[t.rang];
        if (besoin && besoin.chaine[0] !== t.source && t.essai === 1) {
          const ecran = connecteurs[t.source]?.ecran;
          if (ecran) travail.etapes[t.rang] = { ...ecran, court: `${ecran.court} (repli)` };
        }
      },
      surResultat: (connecteur, brut) => {
        // Le résultat se pose sur le lot tout de suite : la page se remplit
        // pendant qu'Alex continue.
        travail.resultats[connecteur.champ_lot] = brut;
        poser(dealId, index, connecteur.champ_lot, brut);
      },
    }
  );

  // Les échecs, sous la forme que l'écran connaît depuis toujours.
  for (const e of rapport.sources_en_echec) {
    const champ = connecteurs[e.source]?.champ_lot || e.source;
    travail.echecs[champ] = e.erreur;
  }

  travail.etape = besoins.length;
  travail.rapport = rapport;
  travail.etat = rapport.complet ? 'pret' : 'partiel';
  travail.fin = new Date().toISOString();

  // Le passage laisse une trace durable : c'est elle que l'écran affiche pour
  // dire d'où vient chaque chiffre, longtemps après le toast.
  const entree = enregistrer({
    deal_id: dealId,
    lot_index: index,
    adresse,
    surface,
    debut,
    fin: travail.fin,
    ms: Date.now() - chrono,
    essai: travail.essai,
    automatique: travail.automatique,
    etat: travail.etat,
    complet: rapport.complet,
    indicateurs: rapport.indicateurs,
    indicateurs_manquants: rapport.indicateurs_manquants,
    besoins: rapport.besoins,
    tentatives: rapport.tentatives,
    sources_utilisees: rapport.sources_utilisees,
    sources_en_echec: rapport.sources_en_echec,
    notifications: rapport.notifications,
    par: user?.email || null,
  });
  travail.journal_id = entree?.id || null;

  // Une lecture incomplète pour cause de panne se reprend toute seule ; une
  // lecture complète annule la reprise qu'un passage précédent aurait promise.
  if (!rapport.complet && rapport.a_reessayer) {
    travail.nouvelle_tentative_le = planifier({
      dealId, index, essai: travail.essai, journalId: travail.journal_id, user,
    });
  } else {
    annuler(dealId, index);
  }

  const servies = rapport.sources_utilisees.length;
  console.log(
    `[alex] ${adresse} — ${rapport.besoins_couverts}/${besoins.length} question(s) couverte(s), ${servies} source(s)` +
    `${rapport.sources_en_echec.length ? ` · échecs : ${rapport.sources_en_echec.map((e) => `${e.source} (${e.classe})`).join(', ')}` : ''}` +
    `${travail.nouvelle_tentative_le ? ` · reprise le ${travail.nouvelle_tentative_le}` : ''}`
  );
}

/** Ce qu'on montre d'un travail : la mémoire garde plus que l'écran n'affiche. */
function vue(t) {
  const r = t.rapport;
  return {
    etat: t.etat,
    etape: t.etape,
    total: t.total ?? t.etapes.length,
    etapes: t.etapes,
    resultats: t.resultats,
    echecs: t.echecs,
    erreur: t.erreur || null,
    essai: t.essai,
    automatique: !!t.automatique,
    // La lecture, dans le format pivot : chaque chiffre avec sa source.
    indicateurs: r?.indicateurs || {},
    indicateurs_manquants: r?.indicateurs_manquants || [],
    besoins: r?.besoins || {},
    tentatives: r?.tentatives || [],
    sources_utilisees: r?.sources_utilisees || [],
    sources_en_echec: r?.sources_en_echec || [],
    // Les murs — compte refusé, plan insuffisant — que l'utilisateur doit voir.
    notifications: r?.notifications || [],
    complet: r ? r.complet : null,
    nouvelle_tentative_le: t.nouvelle_tentative_le || null,
    journal_id: t.journal_id || null,
  };
}

/** Où en est la recherche lancée pour cette clé. */
export function etatRechercheMarche(cle) {
  const t = travaux.get(cle);
  if (!t) return null;
  return { cle, ...vue(t) };
}
