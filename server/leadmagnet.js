// Les lead magnets : une page ouverte à tous, sans compte, qui rend un plan
// d'acquisition chiffré sur le quartier de la personne.
//
// Le premier s'appelle « Ma feuille de route ». On y dit son objectif de
// revenu, ses fonds propres, son quartier et son horizon ; il rend le nombre
// d'acquisitions à faire, leur prix, leur loyer, l'année de chacune, et un
// commerce réel du quartier en exemple — puis un lien vers le simulateur
// public, déjà en place, pré-rempli avec la première acquisition.
//
// Trois principes tiennent ce module :
//
//   1. AUCUN MODÈLE DE LANGAGE. La page est ouverte : un appel payant par
//      soumission serait une ardoise offerte au premier robot venu. Tout le
//      calcul est déterministe, donc gratuit, reproductible, et testé.
//   2. AUCUNE SOURCE PAYANTE. Les prix viennent de DVF (ventes réelles
//      publiées par l'administration) et les commerces d'OpenStreetMap. Data-B
//      coûte un crédit par recherche : il n'a rien à faire ici.
//   3. CHAQUE HYPOTHÈSE EST DITE. Un plan d'acquisition qui ne montre pas ses
//      hypothèses n'est pas un plan, c'est une promesse. Elles sont nommées
//      ici, rendues avec le résultat, et affichées sur la page.
//
// Les commerces montrés en exemple NE SONT PAS À VENDRE : ce sont des
// devantures existantes, qui disent le type de bien et le niveau de prix du
// quartier. La page le dit mot pour mot.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';

const ENTITE_LM = 'LeadMagnet';
const ENTITE_LEAD = 'Lead';
const ENTITE_VUE = 'LeadMagnetVue';

// --- Les hypothèses du plan, toutes ici ------------------------------------

/**
 * Le taux d'endettement qu'une banque accepte, tous crédits confondus. C'est
 * lui qui fixe la première acquisition : rien d'autre ne la borne.
 */
export const TAUX_ENDETTEMENT = 0.35;
/**
 * La part des loyers perçus qu'une banque réintègre dans les revenus de
 * l'emprunteur. C'est elle qui fait l'effet de levier : chaque local acheté
 * augmente la capacité d'emprunt du suivant, et c'est pour cela qu'un plan
 * accélère au lieu d'avancer au même pas.
 */
export const PART_LOYERS_RETENUS = 0.7;
/** Le crédit type sur des murs de commerce, aujourd'hui. */
export const TAUX_CREDIT = 4.5;
export const DUREE_CREDIT = 20;
/**
 * L'apport : les frais d'acquisition, qui se paient comptant et ne se financent
 * pas, plus la part que la banque demande de mettre au pot.
 */
export const PART_APPORT = 0.15;
/** Ce qu'un ménage met de côté chaque année, en part de ses revenus nets. */
export const PART_EPARGNE = 0.2;
/** Le ticket d'entrée d'un commerce : en deçà, le montage ne tient pas. */
export const TICKET_MIN = 90000;
/** Au-delà, ce n'est plus une feuille de route, c'est un fonds. */
export const TICKET_MAX = 900000;
/** Au-delà, ce n'est plus une feuille de route, c'est un catalogue. */
const ACQUISITIONS_MAX = 6;

// La surface type d'un commerce, par métier. Une pharmacie n'occupe pas la
// même boutique qu'un salon de coiffure, et c'est ce qui fait qu'elles ne
// valent pas le même prix : le prix d'une acquisition, ici, est sa surface
// multipliée par le prix du quartier. Ordres de grandeur d'exploitation,
// posés ici pour être discutés d'un seul endroit.
export const SURFACES = [
  ['Coiffure', 45], ['Institut de beauté', 50], ['Agence immobilière', 55], ['Caviste', 60],
  ['Opticien', 70], ['Prêt-à-porter', 75], ['Boulangerie', 85], ['Café', 85],
  ['Boucherie, charcuterie', 90], ['Restaurant', 100], ['Pharmacie', 120], ['Supérette', 150],
  ['Immeuble mixte', 300],
];

/**
 * Ce qu'on achète à chaque niveau de budget, et ce que ça vaut.
 *
 * Un budget ne donne pas seulement un prix : il donne accès à une classe
 * d'actif, donc à un profil de locataire et à un rendement. Un salon de
 * coiffure rapporte plus qu'un immeuble mixte, et c'est normal — il porte un
 * risque de vacance que l'autre n'a pas. C'est cet arbitrage que le plan
 * raconte quand il monte en gamme d'une acquisition à l'autre.
 */
export const TYPOLOGIES = [
  {
    cle: 'service', plafond: 150000, nom: 'Boutique de service',
    metiers: ['Coiffure', 'Institut de beauté', 'Agence immobilière'],
    rendement: [7, 9],
    locataire: 'Commerçant indépendant',
    risque: 'Vacance modérée à élevée',
    bail: 'Bail 3-6-9',
  },
  {
    cle: 'proximite', plafond: 350000, nom: 'Commerce de proximité',
    metiers: ['Caviste', 'Opticien', 'Prêt-à-porter', 'Boulangerie', 'Boucherie, charcuterie', 'Pharmacie'],
    rendement: [6.5, 8],
    locataire: 'Enseigne locale solide',
    risque: 'Bonne stabilité',
    bail: 'Bail 3-6-9 classique',
  },
  {
    cle: 'enseigne', plafond: 750000, nom: 'Restaurant ou enseigne nationale',
    metiers: ['Café', 'Restaurant', 'Supérette'],
    rendement: [6, 7.5],
    locataire: 'Locataire institutionnel, souvent une franchise',
    risque: 'Faible vacance',
    bail: 'Bail long, 9 à 12 ans',
  },
  {
    cle: 'mixte', plafond: Infinity, nom: 'Immeuble mixte',
    metiers: ['Immeuble mixte'],
    rendement: [5.5, 6.5],
    locataire: 'Plusieurs locataires, commerce et habitation',
    risque: 'Risque diversifié sur plusieurs baux',
    bail: 'Commerce en rez-de-chaussée, logements en étages',
  },
];

/** La typologie qu'un budget ouvre. Pure : testée sans réseau. */
export function typologiePour(budget) {
  return TYPOLOGIES.find((t) => budget <= t.plafond) || TYPOLOGIES[TYPOLOGIES.length - 1];
}

/** À défaut de prix de quartier, le m² qui sert de repère. Dit sur la page. */
const M2_PIVOT = 2200;

const euros = (n) => Math.round(n / 1000) * 1000;

// --- Le crédit, en trois formules -------------------------------------------
//
// Tout le plan repose dessus, et c'est de l'arithmétique d'annuité constante :
// pas d'approximation, pas de règle de trois. Les trois fonctions sont pures.

/** La mensualité d'un crédit à annuités constantes. */
export function mensualiteCredit(capital, taux = TAUX_CREDIT, annees = DUREE_CREDIT) {
  if (!(capital > 0)) return 0;
  const i = taux / 100 / 12;
  const n = Math.round(annees * 12);
  if (!i) return capital / n;
  return (capital * i) / (1 - Math.pow(1 + i, -n));
}

/** Le capital qu'une mensualité donnée permet d'emprunter. L'inverse. */
export function capitalEmpruntable(mensualite, taux = TAUX_CREDIT, annees = DUREE_CREDIT) {
  if (!(mensualite > 0)) return 0;
  const i = taux / 100 / 12;
  const n = Math.round(annees * 12);
  if (!i) return mensualite * n;
  return (mensualite * (1 - Math.pow(1 + i, -n))) / i;
}

/** Ce qu'il reste à devoir après un certain nombre d'années. */
export function capitalRestantDu(capital, taux = TAUX_CREDIT, annees = DUREE_CREDIT, apres = 0) {
  if (!(capital > 0) || apres >= annees) return 0;
  if (apres <= 0) return capital;
  const i = taux / 100 / 12;
  const k = Math.round(apres * 12);
  const m = mensualiteCredit(capital, taux, annees);
  if (!i) return Math.max(0, capital - m * k);
  const facteur = Math.pow(1 + i, k);
  return Math.max(0, capital * facteur - (m * (facteur - 1)) / i);
}

/**
 * Le plan d'acquisition. Pure : testée sans réseau.
 *
 * La boucle suit le parcours réel d'un investisseur, et pas une division du
 * patrimoine visé par un prix moyen :
 *
 *   1. La banque regarde ses revenus, y réintègre 70 % des loyers déjà perçus,
 *      en retient 35 %, et retranche les mensualités en cours. Ce qui reste est
 *      la mensualité admissible, donc un capital empruntable.
 *   2. Le budget d'achat est ce que portent ENSEMBLE ce capital et l'apport
 *      disponible : un prix se finance à 85 % par la banque et à 15 % comptant,
 *      et c'est la plus contraignante des deux qui décide.
 *   3. Ce budget ouvre une classe d'actif, donc un locataire et un rendement.
 *   4. Entre deux achats, l'épargne du foyer et le cash-flow des lots déjà
 *      détenus reconstituent l'apport suivant. Dès qu'il est réuni ET que la
 *      banque suit, l'acquisition suivante part.
 *
 * @param {object} p
 * @param {number} p.objectif_mensuel  le revenu net visé, par mois
 * @param {number} p.fonds_propres     ce dont la personne dispose aujourd'hui
 * @param {number} p.revenus_annuels   ses revenus nets annuels
 * @param {number} p.horizon_ans       en combien d'années elle veut y arriver
 * @param {number} p.charges_credit_mensuelles  ce qu'elle rembourse déjà chaque mois
 * @param {number|null} p.fin_credits_ans       dans combien d'années ils se terminent
 * @param {number|null} p.prix_m2      le prix au m² du quartier, si DVF le donne
 * @returns {object} le plan, ses étapes et ses hypothèses
 */
export function calculerRoadmap({
  objectif_mensuel, fonds_propres = 0, revenus_annuels = 0, horizon_ans = 20,
  charges_credit_mensuelles = 0, fin_credits_ans = null, prix_m2 = null, metiers = [],
}) {
  const objectif = Math.max(0, Number(objectif_mensuel) || 0);
  const horizon = Math.min(40, Math.max(5, Math.round(Number(horizon_ans) || 20)));
  const revenus = Math.max(0, Number(revenus_annuels) || 0);
  if (!objectif) return { ok: false, error: 'Il faut un objectif de revenu mensuel.' };

  const m2 = Math.max(600, Math.round(Number(prix_m2) || M2_PIVOT));
  const revenusMensuels = revenus / 12;
  const epargne_annuelle = euros(revenus * PART_EPARGNE);
  const surfaceDe = new Map(SURFACES);
  const duQuartier = new Set(metiers);

  // Les crédits déjà en cours : immobilier, auto, consommation. Ils ne changent
  // rien au rendement d'un local, mais ils changent tout à ce qu'une banque
  // acceptera de prêter — et sans eux, le plan supposerait une capacité entière
  // à quelqu'un qui est déjà au plafond.
  const chargesActuelles = Math.max(0, Number(charges_credit_mensuelles) || 0);
  // Un crédit qui se termine rend de l'air au milieu du parcours : c'est un
  // événement du plan, au même titre qu'une acquisition.
  const finCredits = Number.isFinite(Number(fin_credits_ans)) && Number(fin_credits_ans) > 0
    ? Math.min(40, Math.round(Number(fin_credits_ans)))
    : null;
  const chargesEn = (an) => (finCredits != null && an >= finCredits ? 0 : chargesActuelles);

  const acquisitions = [];
  const disponibleDepart = Math.max(0, Number(fonds_propres) || 0);
  let disponible = disponibleDepart;
  let annee = 0;
  let loyerMensuel = 0; // les loyers nets encaissés, par mois
  let mensuelCredit = 0; // les mensualités des locaux déjà achetés
  let patrimoine = 0;

  // Le profil d'endettement, à l'instant où on regarde.
  const capaciteMaintenant = () => {
    const revenusRetenus = revenusMensuels + loyerMensuel * PART_LOYERS_RETENUS;
    const charges = mensuelCredit + chargesEn(annee);
    const marge = revenusRetenus * TAUX_ENDETTEMENT - charges;
    return {
      mensualite_max: Math.max(0, Math.round(marge)),
      plafond_mensuel: Math.round(revenusRetenus * TAUX_ENDETTEMENT),
      charges_en_cours: Math.round(charges),
      capital: capitalEmpruntable(Math.max(0, marge)),
    };
  };
  const depart = capaciteMaintenant();

  for (let i = 0; i < ACQUISITIONS_MAX; i++) {
    if (loyerMensuel - mensuelCredit >= objectif) break;

    // On avance d'année en année jusqu'à ce que la banque suive ET que l'apport
    // soit réuni. Un budget est ce que portent ensemble l'emprunt et le comptant.
    let capacite = capaciteMaintenant();
    let budget = 0;
    while (annee <= horizon) {
      capacite = capaciteMaintenant();
      // Ce qu'on peut payer, c'est ce que la banque prête PLUS ce qu'on a — et
      // l'apport doit couvrir au moins les frais d'acquisition, qui ne se
      // financent pas. Quelqu'un dont la capacité est nulle peut encore
      // acheter comptant ; quelqu'un sans un sou ne peut rien acheter du tout.
      budget = Math.min(capacite.capital + disponible, disponible / PART_APPORT);
      if (budget >= TICKET_MIN) break;
      annee += 1;
      disponible += epargne_annuelle + Math.max(0, Math.round((loyerMensuel - mensuelCredit) * 12));
    }
    if (annee > horizon || budget < TICKET_MIN) break;

    // Dans la bande de budget, le plus grand local qu'il porte, et de préférence
    // un métier qu'on voit vraiment dans le quartier : le plan cesse d'être une
    // moyenne nationale.
    // Ce que le budget permet, dans sa bande ET dans toutes celles du dessous.
    // Chercher dans la seule bande du moment donnait quatre fois le même
    // commerce dès que ses métiers étaient épuisés : on redescend plutôt que
    // de répéter, et chaque métier garde la typologie de sa propre bande.
    const plafond = typologiePour(budget).plafond;
    const offre = TYPOLOGIES
      .filter((t) => t.plafond <= plafond)
      .flatMap((t) => t.metiers.map((nom) => ({ nom, surface: surfaceDe.get(nom) || 80, typo: t })))
      .sort((a, b) => a.surface - b.surface);
    const tiennent = offre.filter((o) => o.surface * m2 <= budget);
    const pris = new Set(acquisitions.map((a) => a.metier));
    const neufs = (liste) => liste.filter((o) => !pris.has(o.nom));
    // Le plus grand local que le budget porte, et de préférence un métier vu
    // dans le quartier. Si aucun n'y tient, le plus petit métier NEUF, rogné au
    // budget : retomber chaque fois sur le plus petit du marché donnait quatre
    // fois le même commerce d'affilée.
    const choisi = neufs(tiennent.filter((o) => duQuartier.has(o.nom))).pop()
      || neufs(tiennent).pop()
      || neufs(offre)[0]
      || tiennent[tiennent.length - 1]
      || offre[0];
    const { nom: metier, typo } = choisi;

    const prix = Math.max(TICKET_MIN, Math.min(TICKET_MAX, euros(Math.min(choisi.surface * m2, budget))));
    // La surface suit le prix réellement payé : un local rogné par le budget
    // est un local plus petit, pas le même local moins cher au mètre.
    const surface = Math.max(20, Math.round(prix / m2));
    const rendement = Math.round(((typo.rendement[0] + typo.rendement[1]) / 2) * 10) / 10;
    // La banque prête ce qu'elle peut, dans la limite de 85 % du prix ; le
    // reste est de l'apport. Une capacité entamée par des crédits en cours se
    // paie donc en fonds propres, et c'est visible ligne à ligne.
    const emprunt = Math.round(Math.min(capacite.capital, prix * (1 - PART_APPORT)));
    const apport = prix - emprunt;
    const mensualite_credit = Math.round(mensualiteCredit(emprunt));
    const loyer_annuel = euros((prix * rendement) / 100);
    const loyer_mensuel = Math.round(loyer_annuel / 12);

    disponible = Math.max(0, disponible - apport);
    loyerMensuel += loyer_mensuel;
    mensuelCredit += mensualite_credit;
    patrimoine += prix;

    acquisitions.push({
      rang: i + 1, annee, metier, surface, prix, apport, emprunt,
      typologie: typo.nom, typologie_cle: typo.cle,
      locataire: typo.locataire, risque: typo.risque, bail: typo.bail,
      rendement_cible: rendement, rendement_bande: typo.rendement,
      budget: euros(budget),
      capacite_emprunt: euros(capacite.capital),
      mensualite_max: capacite.mensualite_max,
      loyer_annuel, loyer_mensuel, mensualite_credit,
      cash_flow_mensuel: loyer_mensuel - mensualite_credit,
      cumul_mensuel: Math.round(loyerMensuel - mensuelCredit),
      taux_credit: TAUX_CREDIT, duree_credit: DUREE_CREDIT,
      fin_credit: annee + DUREE_CREDIT,
      patrimoine_apres: patrimoine,
      exemple: null,
    });
  }

  // La projection, année par année : c'est elle qu'on trace en bâtons. Elle
  // porte deux choses que le tableau d'acquisitions ne peut pas dire : ce que
  // coûte une année d'achat, et ce que libère la fin d'un crédit.
  const projection = [];
  let cumul = 0;
  for (let an = 0; an <= horizon; an++) {
    const achats = acquisitions.filter((a) => a.annee === an);
    const detenus = acquisitions.filter((a) => a.annee <= an);
    const loyer = detenus.reduce((t, a) => t + a.loyer_mensuel, 0);
    // Un crédit soldé ne se paie plus : sa mensualité devient du cash-flow, en
    // entier. C'est l'événement le plus important d'un plan long, et le seul
    // que l'investisseur n'a pas à provoquer.
    const enCours = detenus.filter((a) => an < a.fin_credit);
    const mensualites = enCours.reduce((t, a) => t + a.mensualite_credit, 0);
    const mensuel = Math.round(loyer - mensualites);
    // L'apport n'est pas une charge : c'est un investissement, et le déduire du
    // cash-flow donnait un graphique de gouffres qui ne disait rien de
    // l'exploitation. L'année d'un achat pèse autrement, et pour de vrai : le
    // bien n'est détenu qu'une demi-année, donc il ne rapporte et ne coûte
    // que la moitié.
    const demi = achats.reduce((t, a) => t + a.cash_flow_mensuel / 2, 0);
    const cash_flow = Math.round((mensuel - demi) * 12);
    cumul += cash_flow;
    const capital_restant = Math.round(detenus.reduce((t, a) => t + capitalRestantDu(a.emprunt, a.taux_credit, a.duree_credit, an - a.annee), 0));
    const brut = detenus.reduce((t, a) => t + a.prix, 0);
    projection.push({
      annee: an,
      mensuel,
      cash_flow,
      cash_flow_hors_achat: Math.round(mensuel * 12),
      cumul: Math.round(cumul),
      apport_verse: achats.reduce((t, a) => t + a.apport, 0),
      patrimoine: brut,
      capital_restant,
      patrimoine_net: brut - capital_restant,
      achats: achats.map((a) => a.rang),
      credits_soldes: detenus.filter((a) => a.fin_credit === an).map((a) => a.rang),
    });
  }

  // Les temps forts, dans l'ordre : ce qu'on achète, et ce qui se libère.
  const evenements = [
    ...acquisitions.map((a) => ({
      annee: a.annee, type: 'acquisition', rang: a.rang, metier: a.metier, typologie: a.typologie,
      prix: a.prix, apport: a.apport, loyer_mensuel: a.loyer_mensuel,
      mensualite_credit: a.mensualite_credit, cash_flow_mensuel: a.cash_flow_mensuel, cumul_mensuel: a.cumul_mensuel,
    })),
    ...acquisitions.filter((a) => a.fin_credit <= horizon).map((a) => ({
      annee: a.fin_credit, type: 'fin_credit', rang: a.rang, metier: a.metier,
      mensualite_liberee: a.mensualite_credit,
    })),
    // La fin des crédits déjà en cours n'ajoute pas un euro de loyer, mais elle
    // rend d'un coup toute la capacité d'emprunt qu'ils bloquaient.
    ...(finCredits != null && chargesActuelles > 0 && finCredits <= horizon
      ? [{ annee: finCredits, type: 'fin_credits_actuels', mensualite_liberee: Math.round(chargesActuelles) }]
      : []),
  ].sort((a, b) => a.annee - b.annee || (a.type === 'acquisition' ? -1 : 1));

  const derniere = acquisitions[acquisitions.length - 1];
  const atteinte = projection.find((p) => p.mensuel >= objectif) || null;
  const fin = projection[projection.length - 1];
  return {
    ok: true,
    objectif_mensuel: objectif,
    horizon_ans: horizon,
    prix_m2_retenu: m2,
    prix_m2_estime: !prix_m2,
    nombre_acquisitions: acquisitions.length,
    epargne_annuelle,
    capacite_initiale: {
      // Le profil d'endettement de départ, celui que la banque regarde avant
      // qu'un seul loyer ne soit encaissé.
      plafond_mensuel: depart.plafond_mensuel,
      charges_actuelles: Math.round(chargesActuelles),
      fin_credits_ans: finCredits,
      mensualite_max: depart.mensualite_max,
      capital: euros(depart.capital),
      budget: euros(Math.min(depart.capital + disponibleDepart, disponibleDepart / PART_APPORT)),
      fonds_propres: disponibleDepart,
      // La capacité entièrement mangée par des crédits en cours, c'est le cas
      // qu'il faut dire franchement plutôt que de rendre un plan vide.
      bloquee: depart.mensualite_max <= 0 && chargesActuelles > 0,
    },
    acquisitions,
    projection,
    evenements,
    patrimoine_final: derniere ? derniere.patrimoine_apres : 0,
    patrimoine_net_final: fin ? fin.patrimoine_net : 0,
    // Ce que les locataires ont remboursé à votre place : la somme empruntée,
    // moins ce qu'il reste à devoir au terme.
    capital_rembourse: Math.round(acquisitions.reduce((t, a) => t + a.emprunt, 0) - (fin ? fin.capital_restant : 0)),
    apport_total: acquisitions.reduce((t, a) => t + a.apport, 0),
    atteint_mensuel: fin ? fin.mensuel : 0,
    annee_objectif: atteinte ? atteinte.annee : null,
    dans_horizon: !!atteinte,
    hypotheses: {
      taux_endettement: TAUX_ENDETTEMENT,
      part_loyers_retenus: PART_LOYERS_RETENUS,
      taux_credit: TAUX_CREDIT,
      duree_credit: DUREE_CREDIT,
      part_apport: PART_APPORT,
      part_epargne: PART_EPARGNE,
    },
  };
}

/** Le lien vers le simulateur public, pré-rempli avec une acquisition. */
export function lienSimulateur(etape, base = '') {
  const params = {
    prixBienFAI: etape.prix,
    prixBienNegocie: etape.prix,
    loyerInitialHTHC: etape.loyer_annuel,
    apport: etape.apport,
    surface: etape.surface || 60,
    dureeCredit: etape.duree_credit || DUREE_CREDIT,
    tauxInteret: etape.taux_credit || TAUX_CREDIT,
    anneeRevente: 20,
  };
  return `${base}/SimulateurPublic?data=${encodeURIComponent(JSON.stringify(params))}`;
}

// --- Le débit d'une page ouverte -------------------------------------------

// Une page sans compte est une porte : on compte les passages par adresse.
const PASSAGES = new Map();
const FENETRE_MS = 60 * 60 * 1000;
const MAX_PAR_HEURE = 8;
/** Une visite coûte moins qu'un calcul : on en tolère davantage. */
export const MAX_VUES_PAR_HEURE = 60;

export function tropDeDemandes(ip, { max = MAX_PAR_HEURE, seau = 'roadmap' } = {}) {
  const cle = `${seau}|${ip}`;
  const maintenant = Date.now();
  const vus = (PASSAGES.get(cle) || []).filter((t) => maintenant - t < FENETRE_MS);
  if (vus.length >= max) { PASSAGES.set(cle, vus); return true; }
  vus.push(maintenant);
  PASSAGES.set(cle, vus);
  return false;
}

// --- Le quartier -----------------------------------------------------------

// Un visiteur n'attend pas. La toute première recherche sur un département
// télécharge cinq millésimes de ventes : plus d'une minute, parfois en vain.
// Passé ce délai, la page se rend sans le quartier et le dit — le calcul, lui,
// est instantané. Les visiteurs suivants sur la même ville trouvent le cache
// chaud et ont tout.
const DELAI_QUARTIER_MS = 12000;

/** La promesse, ou `secours` si elle tarde trop. Pure : testée sans réseau. */
export function avecDelai(promesse, ms, secours = null) {
  let minuteur;
  return Promise.race([
    Promise.resolve(promesse).catch(() => secours),
    new Promise((resoudre) => { minuteur = setTimeout(() => resoudre(secours), ms); }),
  ]).finally(() => clearTimeout(minuteur));
}

/** Le prix au m² du quartier, d'après les ventes réelles. Jamais bloquant. */
async function prixDuQuartier(adresse) {
  try {
    const { ventesAutour } = await import('./dvf.js');
    const r = await ventesAutour(adresse, { rayon: 800 });
    if (!r.ok || !r.resultat?.prix_m2) return null;
    return {
      m2: r.resultat.prix_m2.median,
      bas: r.resultat.prix_m2.bas,
      haut: r.resultat.prix_m2.haut,
      ventes: r.resultat.n,
      annees: r.resultat.annees,
      commune: r.resultat.commune,
      lien: r.resultat.lien,
    };
  } catch (e) { console.warn(`[lm] prix du quartier indisponible : ${e?.message || e}`); return null; }
}

/** Quelques commerces du quartier, en exemple. Ils ne sont pas à vendre. */
async function commercesVoisins(lat, lon) {
  try {
    const { commercesDeLaZone } = await import('./kzoning-commerces.js');
    const { TOUS_LES_COMMERCES, nomMetierDe } = await import('./kzoning-metiers.js');
    const nomDe = nomMetierDe();
    const r = await commercesDeLaZone({ lat, lon, rayon_m: 600, filtres: TOUS_LES_COMMERCES.filtres });
    if (!r.ok) return [];
    // Tout ce que la fiche OpenStreetMap porte déjà : la page s'en sert pour
    // montrer la devanture sur un plan et dire à quoi ressemble l'exploitant.
    // Rien n'est deviné — un champ absent reste absent.
    return (r.commerces || [])
      .filter((c) => c.nom && !c.vacant)
      .slice(0, 8)
      .map((c) => ({
        nom: c.nom,
        enseigne: c.enseigne,
        metier: nomDe(c.genre) || c.genre,
        adresse: c.adresse,
        distance_m: c.distance_m,
        lat: c.lat,
        lon: c.lon,
        horaires: c.horaires,
        telephone: c.telephone,
        site: c.site,
        cuisine: c.cuisine,
        terrasse: c.terrasse,
        pmr: c.pmr,
      }));
  } catch (e) { console.warn(`[lm] commerces voisins indisponibles : ${e?.message || e}`); return []; }
}

// --- La fréquentation d'une page ouverte ------------------------------------
//
// Une page sans compte ne dit rien d'elle-même : sans mesure, on ne sait pas si
// personne ne vient ou si tout le monde repart au formulaire. On enregistre
// donc une ligne par visite, et on la complète au fil du passage.
//
// Ce qu'on garde tient en une phrase : d'où la personne vient, sur quel
// appareil, jusqu'où elle est allée, et combien de temps elle est restée sur le
// résultat. Pas de traceur, pas de tiers, pas d'identifiant qui survit à la
// visite : la ligne vit dans notre base et nulle part ailleurs.

const APPAREILS = [
  [/\bipad\b|\btablet\b/i, 'Tablette'],
  [/\bmobile\b|\biphone\b|\bandroid\b/i, 'Mobile'],
];

/** L'appareil, lu dans l'en-tête du navigateur. Pure : testée sans réseau. */
export function lireAppareil(ua) {
  const t = String(ua || '');
  if (!t) return 'Inconnu';
  return APPAREILS.find(([m]) => m.test(t))?.[1] || 'Ordinateur';
}

/**
 * D'où vient la visite, dite en clair. Pure : testée sans réseau.
 *
 * `hote` est notre propre domaine : une navigation interne nous renvoie notre
 * adresse en référent, et l'afficher comme provenance ferait croire que le
 * visiteur vient d'ailleurs.
 */
export function lireOrigine(referer, utm, hote = null) {
  const source = String(utm || '').trim().slice(0, 60);
  if (source) return source;
  const r = String(referer || '').trim();
  if (!r) return 'Direct';
  const sansWww = (h) => String(h || '').replace(/^www\./, '').toLowerCase();
  try {
    const h = sansWww(new URL(r).host);
    if (!h || h === sansWww(hote)) return 'Direct';
    return h.slice(0, 60);
  } catch { return 'Direct'; }
}

const jourDe = (iso) => String(iso || '').slice(0, 10);

/** Une visite s'ouvre. On rend son identifiant, que la page nous redonnera. */
export function ouvrirVue(slug, { ip = null, referer = null, ua = null, utm = null, hote = null } = {}) {
  const le = new Date().toISOString();
  const v = Records.create(ENTITE_VUE, {
    slug: String(slug || '').slice(0, 60),
    le, jour: jourDe(le),
    ip: ip || null,
    origine: lireOrigine(referer, utm, hote),
    appareil: lireAppareil(ua),
    ecran: 'formulaire',
    secondes_resultat: 0,
    lead_id: null,
    appel_clique: false,
  });
  return { ok: true, vue_id: v.id };
}

/**
 * La visite avance : elle a atteint le résultat, y est restée tant de secondes,
 * ou a cliqué le bouton d'appel. Le temps ne recule jamais — une page rouverte
 * repart d'un compteur à zéro, et on garderait le plus grand des deux.
 */
export function avancerVue(id, { ecran = null, secondes = null, appel_clique = null } = {}) {
  const v = Records.get(ENTITE_VUE, id);
  if (!v) return { ok: false, error: "Cette visite n'existe plus." };
  const patch = {};
  if (ecran) patch.ecran = String(ecran).slice(0, 30);
  if (Number.isFinite(Number(secondes))) {
    // Une page laissée ouverte une nuit ne dit pas qu'on l'a lue huit heures :
    // au-delà d'une heure, le chiffre ne mesure plus une lecture.
    const s = Math.min(3600, Math.max(0, Math.round(Number(secondes))));
    patch.secondes_resultat = Math.max(Number(v.secondes_resultat) || 0, s);
  }
  if (appel_clique != null) patch.appel_clique = !!appel_clique;
  Records.update(ENTITE_VUE, id, patch);
  return { ok: true };
}

/**
 * L'activité jour par jour : visites, leads, et ce que les gens font. Pure
 * agrégation, testée sans réseau.
 */
export function activiteParJour(vues, leads, jours = 30) {
  const par = new Map();
  const touche = (jour) => {
    if (!par.has(jour)) par.set(jour, { jour, vues: 0, leads: 0, appels: 0, secondes: [] });
    return par.get(jour);
  };
  for (const v of vues) {
    const j = touche(jourDe(v.le));
    j.vues += 1;
    if (v.appel_clique) j.appels += 1;
    if (v.secondes_resultat > 0) j.secondes.push(Number(v.secondes_resultat));
  }
  for (const l of leads) touche(jourDe(l.le)).leads += 1;
  return [...par.values()]
    .map(({ secondes, ...j }) => ({
      ...j,
      // La moyenne, pas la médiane : sur cinq visites par jour, une médiane ne
      // dit rien de plus et se lit moins bien.
      secondes_moyennes: secondes.length ? Math.round(secondes.reduce((t, s) => t + s, 0) / secondes.length) : 0,
    }))
    .sort((a, b) => b.jour.localeCompare(a.jour))
    .slice(0, jours);
}

// --- Les lead magnets et leurs leads ---------------------------------------

/** Les lead magnets publiés, pour le tableau de bord de l'équipe. */
export function listerLeadMagnets() {
  const leads = Records.list(ENTITE_LEAD);
  const vues = Records.list(ENTITE_VUE);
  return Records.list(ENTITE_LM)
    .map((m) => {
      const siens = leads.filter((l) => l.slug === m.slug);
      const vus = vues.filter((v) => v.slug === m.slug);
      const lus = vus.filter((v) => v.secondes_resultat > 0).map((v) => Number(v.secondes_resultat));
      return {
        ...m,
        leads: siens.length,
        vues: vus.length,
        // Le taux qui compte vraiment : sur cent passages, combien laissent
        // leurs coordonnées. Sans les visites, un nombre de leads ne dit pas
        // si la page convertit mal ou si personne ne la voit.
        //
        // Seuls les leads rattachés à une visite comptent : les leads reçus
        // avant que la mesure n'existe donnaient un taux au-dessus de cent,
        // qui ne veut rien dire.
        conversion: vus.length ? Math.round((vus.filter((v) => v.lead_id).length / vus.length) * 1000) / 10 : null,
        appels: vus.filter((v) => v.appel_clique).length,
        secondes_resultat_moyenne: lus.length ? Math.round(lus.reduce((t, s) => t + s, 0) / lus.length) : 0,
        dernier_lead: siens.sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.le || null,
        derniere_vue: vus.sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.le || null,
        activite: activiteParJour(vus, siens),
      };
    })
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

export function lireLeadMagnet(slug) {
  return Records.list(ENTITE_LM).find((m) => m.slug === slug && m.actif) || null;
}

/** Les leads, chacun avec ce que sa visite a dit de lui. */
export function listerLeads(slug = null) {
  const vues = Records.list(ENTITE_VUE);
  return Records.list(ENTITE_LEAD)
    .filter((l) => !slug || l.slug === slug)
    .map((l) => {
      const v = vues.find((x) => x.lead_id === l.id) || (l.vue_id ? vues.find((x) => x.id === l.vue_id) : null);
      return {
        ...l,
        jour: jourDe(l.le),
        origine: v?.origine || null,
        appareil: v?.appareil || null,
        secondes_resultat: v?.secondes_resultat || 0,
        appel_clique: !!v?.appel_clique,
      };
    })
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

/** Le titre de la page, qui vit ici et pas dans la base. */
const TITRE_FEUILLE_DE_ROUTE = 'Construisez votre retraite dès maintenant';

/**
 * Le lead magnet de départ, posé au premier démarrage — et son titre remis
 * d'aplomb au suivant. Sans cette reprise, une page déjà enregistrée garderait
 * son ancien titre dans le tableau de bord pendant que la page publique en
 * affiche un autre.
 */
export function assurerLeadMagnetInitial() {
  const existant = Records.list(ENTITE_LM).find((m) => m.slug === 'feuille-de-route');
  if (existant) {
    if (existant.titre !== TITRE_FEUILLE_DE_ROUTE) Records.update(ENTITE_LM, existant.id, { titre: TITRE_FEUILLE_DE_ROUTE });
    return;
  }
  Records.create(ENTITE_LM, {
    slug: 'feuille-de-route',
    titre: TITRE_FEUILLE_DE_ROUTE,
    accroche: "Dites votre objectif et votre quartier : vous repartez avec le nombre d'acquisitions à faire, leur prix, leur loyer et leur année.",
    actif: true,
    cree_le: new Date().toISOString(),
  });
}

/**
 * Une soumission : on situe l'adresse, on lit le quartier, on calcule le plan
 * et on garde le lead. Jamais d'erreur bloquante sur le quartier : un plan
 * sans prix de marché vaut mieux que pas de plan.
 */
export async function genererFeuilleDeRoute(reponses, { ip = null, base = '' } = {}) {
  const nom = String(reponses?.nom || '').trim().slice(0, 80);
  const email = String(reponses?.email || '').trim().toLowerCase().slice(0, 120);
  const quartier = String(reponses?.quartier || '').trim().slice(0, 140);
  if (!nom) return { ok: false, error: 'Il faut un prénom pour vous répondre.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return { ok: false, error: 'Il faut une adresse e-mail valide.' };
  if (quartier.length < 3) return { ok: false, error: 'Il faut une ville ou un quartier.' };
  if (!reponses?.consentement) return { ok: false, error: 'Il faut accepter que nous vous recontactions.' };

  let point = null;
  try { point = await resoudreAdresse(quartier); } catch { point = null; }

  // Les deux sources se lisent ensemble et sous le même délai : l'une qui
  // traîne ne doit pas coûter l'autre.
  const [marche, exemples] = point
    ? await Promise.all([
      avecDelai(prixDuQuartier(point.label), DELAI_QUARTIER_MS, null),
      avecDelai(commercesVoisins(point.lat, point.lon), DELAI_QUARTIER_MS, []),
    ])
    : [null, []];
  const plan = calculerRoadmap({
    objectif_mensuel: reponses.objectif_mensuel,
    fonds_propres: reponses.fonds_propres,
    revenus_annuels: reponses.revenus_annuels,
    horizon_ans: reponses.horizon_ans,
    charges_credit_mensuelles: reponses.charges_credit_mensuelles,
    fin_credits_ans: reponses.fin_credits_ans,
    prix_m2: marche?.m2 || null,
    metiers: [...new Set(exemples.map((c) => c.metier).filter(Boolean))],
  });
  if (!plan.ok) return plan;
  if (!plan.acquisitions.length) {
    // Dire pourquoi, et laquelle des deux causes : les chiffres ne mentent pas,
    // autant qu'ils servent à quelque chose.
    return {
      ok: false,
      error: plan.capacite_initiale.bloquee
        ? "Vos mensualités actuelles occupent déjà les 35 % que les banques acceptent : aucune capacité d'emprunt ne reste pour une acquisition. Dites-nous quand ces crédits se terminent, ou parlons-en — il y a d'autres montages."
        : "Avec ces revenus et ces fonds propres, aucune banque ne suivrait sur une première acquisition dans cet horizon. Parlons-en : il y a d'autres montages.",
    };
  }
  // Chaque acquisition reçoit une devanture du quartier, du même métier quand
  // il s'en trouve une : le plan cesse d'être abstrait.
  const pris = new Set();
  for (const a of plan.acquisitions) {
    const c = exemples.find((x) => x.metier === a.metier && !pris.has(x.nom)) || exemples.find((x) => !pris.has(x.nom));
    if (c) { pris.add(c.nom); a.exemple = c; }
  }

  const roadmap = {
    ...plan,
    quartier: point?.label || quartier,
    commune: marche?.commune || point?.ville || null,
    marche,
    exemples,
    lien_simulateur: lienSimulateur(plan.acquisitions[0], base),
  };

  const vue_id = String(reponses?.vue_id || '').trim() || null;
  const lead = Records.create(ENTITE_LEAD, {
    slug: String(reponses?.slug || 'feuille-de-route'),
    nom, email,
    telephone: String(reponses?.telephone || '').trim().slice(0, 30) || null,
    quartier: roadmap.quartier,
    objectif_mensuel: plan.objectif_mensuel,
    fonds_propres: Number(reponses.fonds_propres) || 0,
    revenus_annuels: Number(reponses.revenus_annuels) || 0,
    charges_credit_mensuelles: Number(reponses.charges_credit_mensuelles) || 0,
    fin_credits_ans: Number(reponses.fin_credits_ans) || null,
    horizon_ans: plan.horizon_ans,
    roadmap,
    ip: ip || null,
    vue_id,
    le: new Date().toISOString(),
    traite: false,
  });
  // La visite et le lead se reconnaissent : c'est ce lien qui donne le taux de
  // conversion et le temps passé sur le résultat.
  if (vue_id && Records.get(ENTITE_VUE, vue_id)) {
    Records.update(ENTITE_VUE, vue_id, { lead_id: lead.id, ecran: 'resultat' });
  }

  return { ok: true, roadmap, vue_id };
}

export function marquerTraite(id, traite = true) {
  if (!Records.get(ENTITE_LEAD, id)) return { ok: false, error: "Ce lead n'existe plus." };
  Records.update(ENTITE_LEAD, id, { traite: !!traite });
  return { ok: true };
}

/** Un lead s'efface, et la visite qui lui était rattachée le redevient anonyme. */
export function supprimerLead(id) {
  const l = Records.get(ENTITE_LEAD, id);
  if (!l) return { ok: false, error: "Ce lead n'existe plus." };
  for (const v of Records.filter(ENTITE_VUE, { lead_id: id })) Records.update(ENTITE_VUE, v.id, { lead_id: null });
  Records.delete(ENTITE_LEAD, id);
  return { ok: true };
}

/**
 * Tout remettre à zéro sur un lead magnet : les leads et les visites.
 *
 * C'est irréversible et c'est voulu : après une série d'essais, on veut des
 * compteurs propres, pas un filtre. Le lead magnet lui-même reste en ligne.
 */
export function reinitialiser(slug) {
  const s = String(slug || '').trim();
  if (!s) return { ok: false, error: 'Il faut dire quel lead magnet remettre à zéro.' };
  const leads = Records.filter(ENTITE_LEAD, { slug: s });
  const vues = Records.filter(ENTITE_VUE, { slug: s });
  for (const l of leads) Records.delete(ENTITE_LEAD, l.id);
  for (const v of vues) Records.delete(ENTITE_VUE, v.id);
  return { ok: true, leads: leads.length, vues: vues.length };
}
