// Ce que chaque outil de K-Data demande en plus de l'adresse.
//
// Lancé depuis sa propre page, un outil a ses réglages sous la main : le
// rayon de K-Zoning, les années de K-Transactions, le formulaire de
// l'estimation. Lancé depuis K-Data, il n'avait que l'adresse et retombait
// sur des valeurs par défaut, sans que personne ne les ait choisies. Une
// zone de trois cents mètres là où il en fallait mille, une estimation
// arrêtée à la lecture de marché faute de loyer.
//
// Les questions sont donc décrites ici, une fois, et l'écran les pose avant
// de lancer. Les listes d'options ne sont pas recopiées : elles viennent des
// barèmes des outils eux-mêmes, pour qu'une option ajoutée là-bas apparaisse
// ici sans qu'on y pense.
//
// Un type de question, une façon de la poser :
//   choix   une valeur parmi des pastilles
//   nombre  un nombre, avec son unité
//   texte   une ligne libre
//   date    un jour
//   criteres  les groupes multi-choix de K-Prospective

import { CHOIX } from './kestimation.js';
import { CRITERES } from './kprospective.js';

/** Une question reprise telle quelle d'un barème d'outil. */
const duBareme = (cle, extra = {}) => ({
  cle,
  libelle: CHOIX[cle]?.libelle || cle,
  type: 'choix',
  options: CHOIX[cle]?.options || [],
  ...extra,
});

/** Des rayons en pastilles, écrits comme on les lit. */
const rayons = (valeurs) => valeurs.map((v) => ({ valeur: v, nom: v >= 1000 ? `${v / 1000} km` : `${v} m` }));

/** La condition « seulement si le local est loué ». */
const SI_LOUE = { cle: 'statut', vaut: 'loue' };

export const QUESTIONS = {
  kzoning: [
    { cle: 'rayon_m', libelle: 'Rayon de la zone', type: 'choix', defaut: 300, options: rayons([150, 300, 500, 1000, 2000]) },
  ],

  kexpertise: [
    { cle: 'activite', libelle: "L'activité étudiée", type: 'texte', defaut: '', exemple: 'Boulangerie, restaurant, opticien…', aide: 'Vide : tous les commerces.' },
  ],

  // L'activité se demande seule : elle oriente la lecture de marché et
  // n'engage rien. Le reste forme le formulaire de valorisation, entamé ou
  // laissé de côté d'un bloc — sans lui, K-Data rend la lecture de marché
  // comme avant, et l'estimation se finit sur la page de l'outil.
  kestimation: [
    { cle: 'activite', libelle: "L'activité du local", type: 'texte', defaut: '', exemple: 'Boulangerie, restaurant, opticien…', aide: 'Vide : tous les commerces.' },
    ...[
      duBareme('statut', { defaut: 'loue' }),
      { cle: 'loyer_annuel', libelle: 'Loyer annuel net HT HC', type: 'nombre', unite: '€ / an', si: SI_LOUE, requis: SI_LOUE },
      { cle: 'fin_bail', libelle: 'Fin du bail', type: 'date', si: SI_LOUE },
      duBareme('renouvellement', { si: SI_LOUE }),
      duBareme('locataire', { si: SI_LOUE }),
      duBareme('taxe_fonciere', { si: SI_LOUE }),
      duBareme('travaux_606', { si: SI_LOUE }),
      duBareme('retards', { si: SI_LOUE }),
      { cle: 'ca_ht', libelle: "Chiffre d'affaires HT du locataire", type: 'nombre', unite: '€', si: SI_LOUE, aide: 'Facultatif.' },
      { cle: 'surface_m2', libelle: 'Surface totale', type: 'nombre', unite: 'm²', requis: { cle: 'statut', vaut: 'vacant' }, aide: 'Obligatoire pour un local vacant, vivement conseillée sinon.' },
      { cle: 'surface_vente_m2', libelle: 'Dont surface de vente', type: 'nombre', unite: 'm²' },
      { cle: 'surface_reserve_m2', libelle: 'Dont réserve', type: 'nombre', unite: 'm²', aide: 'Comptée à 40 % dans la surface pondérée.' },
      { cle: 'vitrine_m', libelle: 'Linéaire de vitrine', type: 'nombre', unite: 'm' },
      duBareme('extraction'),
      duBareme('angle'),
      duBareme('parking'),
      duBareme('pmr'),
      duBareme('etat_batiment'),
      duBareme('etat_local'),
      duBareme('ville', { defaut: 'grande' }),
      duBareme('emplacement', { defaut: 'n1bis' }),
    ].map((q) => ({ ...q, groupe: 'valorisation' })),
  ],

  kprospective: [
    { cle: 'activite', libelle: 'Le métier recherché', type: 'texte', defaut: '', exemple: 'Boulangerie, restaurant, opticien…', aide: 'Vide : tous les commerces.' },
    { cle: 'rayon_m', libelle: 'Rayon de prospection', type: 'choix', defaut: 500, options: rayons([250, 500, 1000, 2000]) },
    { cle: 'criteres', libelle: 'Les critères', type: 'criteres', groupes: CRITERES, aide: "Dans un groupe, une option suffit ; entre groupes, tout doit passer." },
  ],

  kvacance: [
    { cle: 'rayon', libelle: 'Rayon étudié', type: 'choix', defaut: 400, options: rayons([250, 400, 800, 1500]) },
  ],

  ktransactions: [
    { cle: 'annees', libelle: 'Profondeur des ventes', type: 'choix', defaut: 5, options: [2, 5, 10].map((v) => ({ valeur: v, nom: `${v} ans` })) },
  ],

  // L'adresse leur suffit.
  kfoncier: [],
  'valeur-locative': [],
};

/**
 * Ce qu'il faut savoir avant de remplir un formulaire, dit en une ligne au
 * moment de le poser. Surtout : ce qui se passe si on le laisse vide.
 */
export const NOTES = {
  kestimation: "Laissé vide, l'outil s'arrête à la lecture de marché et l'estimation se termine sur sa page.",
  kprospective: 'Sans critère, tous les commerces du rayon ressortent.',
};

/** Les outils qui ont quelque chose à demander. Pure. */
export const outilsAvecQuestions = (outils) => (outils || []).filter((o) => (QUESTIONS[o] || []).length > 0);

/** Une condition « si » est-elle remplie par les réponses ? Pure. */
export const conditionRemplie = (si, valeurs) => !si || String(valeurs?.[si.cle] ?? '') === String(si.vaut);

/** Les valeurs de départ d'un outil, celles que les pastilles montrent. Pure. */
export function valeursParDefaut(outil) {
  const sortie = {};
  for (const q of QUESTIONS[outil] || []) {
    if (q.type === 'criteres') sortie[q.cle] = {};
    else if (q.defaut !== undefined) sortie[q.cle] = q.defaut;
  }
  return sortie;
}

/**
 * Les réponses telles que l'écran les montre : les valeurs de départ d'abord,
 * puis ce que l'utilisateur a choisi. Les conditions se lisent là-dessus, et
 * non sur les seules réponses reçues : une pastille laissée sur son défaut
 * vaut réponse, sinon « statut » paraîtrait vide et le loyer, qui en dépend,
 * serait silencieusement écarté.
 */
const avecDefauts = (outil, valeurs) => ({
  ...valeursParDefaut(outil),
  ...(valeurs && typeof valeurs === 'object' ? valeurs : {}),
});

const nombre = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Les réponses d'un outil, ramenées à ce que l'outil accepte. Pure : testée
 * sans réseau.
 *
 * Tout ce qui n'est pas une question de cet outil disparaît, une pastille
 * inconnue est refusée plutôt que transmise, et une question masquée par sa
 * condition ne laisse rien derrière elle : cocher « retards de paiement »
 * puis basculer le local en vacant ne doit pas envoyer la réponse quand même.
 */
export function nettoyerReglages(outil, brut) {
  const sortie = {};
  const source = avecDefauts(outil, brut);
  for (const q of QUESTIONS[outil] || []) {
    if (!conditionRemplie(q.si, source)) continue;
    const v = source[q.cle];
    if (q.type === 'criteres') {
      const propres = {};
      for (const g of q.groupes || []) {
        const choisis = (v?.[g.cle] || []).filter((x) => g.options.some((op) => op.valeur === x && !op.indisponible));
        if (choisis.length) propres[g.cle] = choisis;
      }
      if (Object.keys(propres).length) sortie[q.cle] = propres;
      continue;
    }
    if (q.type === 'nombre') {
      const n = nombre(v);
      if (n != null) sortie[q.cle] = n;
      continue;
    }
    if (q.type === 'choix') {
      const valide = (q.options || []).some((op) => String(op.valeur) === String(v));
      if (valide) sortie[q.cle] = (q.options || []).find((op) => String(op.valeur) === String(v)).valeur;
      else if (q.defaut !== undefined) sortie[q.cle] = q.defaut;
      continue;
    }
    const t = String(v ?? '').trim();
    if (t) sortie[q.cle] = t;
  }
  return sortie;
}

const repondu = (q, v) => (q.type === 'nombre' ? nombre(v?.[q.cle]) != null : !!String(v?.[q.cle] ?? '').trim());

/**
 * Un formulaire a-t-il été entamé ? Pure.
 *
 * Une pastille laissée sur sa valeur de départ ne compte pas : sans cela,
 * demander l'activité d'un local reviendrait à exiger son loyer, alors que
 * K-Data doit pouvoir se contenter de la lecture de marché.
 */
export function formulaireEntame(outil, valeurs, groupe = 'valorisation') {
  const defauts = valeursParDefaut(outil);
  return (QUESTIONS[outil] || [])
    .filter((q) => q.groupe === groupe)
    .some((q) => repondu(q, valeurs) && String(valeurs[q.cle]) !== String(defauts[q.cle] ?? ''));
}

/**
 * Ce qui manque encore pour lancer un outil : les questions obligatoires dont
 * la condition est remplie et la réponse absente. Pure.
 *
 * Une question de formulaire ne s'impose qu'une fois le formulaire entamé :
 * tant qu'il est vierge, l'outil part comme avant, avec l'adresse seule.
 */
export function manquantes(outil, valeurs) {
  const v = avecDefauts(outil, valeurs);
  const entame = formulaireEntame(outil, v);
  return (QUESTIONS[outil] || [])
    .filter((q) => q.requis)
    .filter((q) => !q.groupe || entame)
    .filter((q) => conditionRemplie(q.si, v) && conditionRemplie(q.requis === true ? null : q.requis, v))
    .filter((q) => !repondu(q, v))
    .map((q) => ({ cle: q.cle, libelle: q.libelle }));
}

/** Les réglages de tout un lot, outil par outil. Pure. */
export function nettoyerLot(outils, brut) {
  const sortie = {};
  for (const o of outils || []) {
    const r = nettoyerReglages(o, brut?.[o]);
    if (Object.keys(r).length) sortie[o] = r;
  }
  return sortie;
}
