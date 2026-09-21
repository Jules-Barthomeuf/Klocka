// K-Estimation : l'estimation de murs commerciaux, par trois méthodes croisées.
//
// Des murs de commerce ne valent pas par leur mètre carré comme un logement :
// ils valent par le loyer qu'ils rapportent, ou qu'ils rapporteraient, et par
// le risque que ce loyer s'arrête. Trois regards, qu'on confronte :
//
//   1. LA CAPITALISATION DU LOYER RÉEL — la méthode reine d'un local loué.
//      valeur = loyer annuel net HT HC ÷ taux de capitalisation. Le taux vient
//      d'une grille par classe d'emplacement et de locataire, puis se place
//      dans sa bande d'après le quartier, puis s'ajuste au bien.
//   2. LA CAPITALISATION DE LA VALEUR LOCATIVE DE MARCHÉ — ce que le local
//      rapporterait s'il était loué au prix du secteur. C'est la seule méthode
//      par le loyer d'un local vacant, et pour un local loué elle dit si le
//      loyer facial est au-dessus ou en dessous du marché. La VLM n'est pas
//      demandée à l'utilisateur, qui ne la connaît pas : le module va la
//      chercher — Equimmox à surface comparable quand il est configuré,
//      le loyer déduit des ventes DVF au taux de rendement sinon.
//   3. LES COMPARABLES DVF — le prix au mètre carré, pondéré par la surface,
//      des murs commerciaux vendus à moins de 500 m dans les 36 derniers mois,
//      d'après les actes publiés par l'administration fiscale.
//
// Puis une matrice d'ajustements : un bail triple net vaut plus, une enseigne
// nationale se capitalise à un taux plus bas, un restaurant sans extraction se
// reloue moins cher, une fin de bail proche sans accord de renouvellement est
// un risque de vacance. Chaque ligne est nommée et rendue à l'écran.
//
// Ce qui est un choix de modèle est dit comme tel, ici et à l'écran. Aucune
// source payante : DVF, INSEE, OpenStreetMap, et Equimmox sur le compte de
// l'équipe, chaque lecture gardée trente jours.

import { Records } from './db.js';
import { geocoder } from './deal/geocodage.js';
import { interroger, construireRequete } from './kzoning-commerces.js';
import { habitantsDeLaZone } from './kzoning-insee.js';
import { loyerDvf } from './loyer-dvf.js';
import { analyseLoyer, equimmoxConfigure } from './equimmox.js';

const ENTITE = 'EstimationMurs';

/** Les étapes du calcul de marché, avant le formulaire. */
export const ETAPES = [
  { cle: 'adresse', nom: "Localisation de l'adresse" },
  { cle: 'dvf', nom: 'Ventes de murs commerciaux à 500 m sur 36 mois' },
  { cle: 'concurrence', nom: 'Commerces autour du point' },
  { cle: 'marche', nom: 'Zone de chalandise : population, niveau de vie' },
  { cle: 'vlm', nom: 'Valeur locative de marché du secteur' },
];

/** Les étapes de l'affinage, après le formulaire, quand Equimmox est là. */
export const ETAPES_AFFINAGE = [
  { cle: 'equimmox', nom: 'Loyers de locaux comparables à 500 m, surface à ±30 %' },
  { cle: 'calcul', nom: 'Croisement des trois méthodes' },
];

const RAYON_CONCURRENCE = 300;
const RAYON_ZONE = 800;
export const RAYON_COMPARABLES = 500;
export const MOIS_COMPARABLES = 36;
/** En deçà, une moyenne de ventes ne veut rien dire et la méthode s'abstient. */
export const MINIMUM_VENTES = 3;

// Le niveau de vie qui sert de comparaison, en euros par personne et par an.
// Un repère du modèle, pas une valeur relevée.
const NIVEAU_VIE_PIVOT = 22000;

/** Le taux ne sort jamais de ces bornes, quels que soient les ajustements. */
export const TAUX_MIN = 4;
export const TAUX_MAX = 12;
const borner = (t) => Math.min(TAUX_MAX, Math.max(TAUX_MIN, Math.round(t * 100) / 100));

/**
 * La grille des taux de capitalisation, par classe d'emplacement et de
 * locataire. Les trois premières bandes viennent de la pratique du marché ;
 * la deuxième est interpolée entre ses voisines, parce que la pratique ne
 * nomme pas le cas d'un indépendant sur un emplacement n°1.
 */
export const GRILLE_TAUX = [
  { cle: 'n1_enseigne', libelle: 'Grande ville, emplacement n°1, enseigne nationale', bande: [4.5, 5.5] },
  { cle: 'n1_independant', libelle: 'Grande ville, emplacement n°1, exploitant indépendant', bande: [5.5, 6.5], interpolee: true },
  { cle: 'n1bis_n2', libelle: 'Grande ville, emplacement n°1 bis ou n°2', bande: [6.5, 8] },
  { cle: 'secondaire', libelle: 'Ville moyenne ou emplacement secondaire', bande: [8.5, 11] },
];

/** La bande de taux d'un local. Pure : testée sans réseau. */
export function bandeDeTaux({ ville = 'grande', emplacement = 'n2', locataire = null } = {}) {
  if (ville === 'moyenne') return GRILLE_TAUX[3];
  if (emplacement === 'n1') return locataire === 'enseigne' ? GRILLE_TAUX[0] : GRILLE_TAUX[1];
  return GRILLE_TAUX[2];
}

/**
 * Où se placer dans la bande : 0 tout en bas (le plus sûr), 1 tout en haut.
 * Le quartier tranche — la densité commerciale et le niveau de vie disent
 * l'emplacement mieux qu'un classement déclaré. Pure : testée sans réseau.
 */
export function positionDansLaBande({ commerces = null, insee = null } = {}) {
  const raisons = [];
  let position = 0.5;
  const pose = (libelle, delta) => { position += delta; raisons.push({ libelle, delta }); };

  // Un relevé qui a échoué n'est pas un désert commercial : sans compte, la
  // densité ne pèse pas. Prendre l'échec pour zéro poussait le taux d'un
  // point sur une simple panne d'Overpass.
  if (commerces != null) {
    if (commerces >= 60) pose(`Emplacement très commerçant (${commerces} commerces dans ${RAYON_CONCURRENCE} m)`, -0.25);
    else if (commerces >= 25) pose(`Rue commerçante (${commerces} commerces dans ${RAYON_CONCURRENCE} m)`, -0.1);
    else if (commerces < 8) pose(`Peu de commerces autour (${commerces} dans ${RAYON_CONCURRENCE} m)`, 0.25);
  }

  const niveau = insee?.revenus?.niveau_de_vie_moyen ?? null;
  if (niveau != null) {
    if (niveau >= NIVEAU_VIE_PIVOT * 1.25) pose(`Niveau de vie élevé dans la zone (${Math.round(niveau).toLocaleString('fr-FR')} € par an)`, -0.15);
    else if (niveau < NIVEAU_VIE_PIVOT * 0.8) pose(`Niveau de vie bas dans la zone (${Math.round(niveau).toLocaleString('fr-FR')} € par an)`, 0.15);
  }
  const pauvrete = insee?.revenus?.taux_pauvrete ?? null;
  if (pauvrete != null && pauvrete > 20) pose(`Taux de pauvreté de ${String(pauvrete).replace('.', ',')} % dans la zone`, 0.1);

  return { position: Math.min(1, Math.max(0, Math.round(position * 100) / 100)), raisons };
}

/**
 * Les comparables DVF : le prix au mètre carré pondéré par la surface, sur les
 * ventes des derniers mois. Pondéré veut dire somme des prix sur somme des
 * surfaces — une grande cellule pèse plus qu'une petite, comme dans une
 * expertise. Pure : testée sans réseau.
 */
export function comparablesDvf(ventes = [], { mois = MOIS_COMPARABLES, aujourdhui = new Date() } = {}) {
  const limite = new Date(aujourdhui);
  limite.setMonth(limite.getMonth() - mois);
  const depuis = limite.toISOString().slice(0, 10);
  const retenues = (ventes || [])
    .filter((v) => v?.date && String(v.date) >= depuis && v.prix > 0 && v.surface > 0)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
  if (!retenues.length) return { n: 0, mois, depuis, prix_m2_pondere: null, bas: null, median: null, haut: null, ventes: [] };
  const sommePrix = retenues.reduce((s, v) => s + v.prix, 0);
  const sommeSurface = retenues.reduce((s, v) => s + v.surface, 0);
  const parM2 = retenues.map((v) => v.prix_m2 ?? Math.round(v.prix / v.surface)).sort((a, b) => a - b);
  const q = (p) => parM2[Math.min(parM2.length - 1, Math.floor(parM2.length * p))];
  return {
    n: retenues.length, mois, depuis,
    prix_m2_pondere: Math.round(sommePrix / sommeSurface),
    bas: q(0.25), median: q(0.5), haut: q(0.75),
    ventes: retenues.slice(0, 12).map(({ date, prix, surface, prix_m2, adresse, distance_m }) => ({ date, prix, surface, prix_m2, adresse, distance_m })),
  };
}

// Ce que chaque réponse pèse. Sur le TAUX, en points : un point en plus, c'est
// du risque, le taux monte et la valeur baisse. Sur la VALEUR, en pour cent.
const BAREME = {
  statut: { libelle: 'Statut d\'occupation', valeurs: { loue: [0, 'Loué'], vacant: [0, 'Vacant'] } },
  locataire: {
    libelle: 'Type de locataire',
    valeurs: { enseigne: [0, 'Enseigne nationale ou franchise'], independant_solide: [0, 'Indépendant solide'], independant: [0.3, 'Indépendant récent ou fragile'] },
  },
  taxe_fonciere: { libelle: 'Taxe foncière', valeurs: { locataire: [0, 'Payée par le locataire'], proprietaire: [0, 'Payée par le propriétaire'], nc: [0, 'Non communiqué'] } },
  travaux_606: { libelle: 'Travaux de l\'article 606', valeurs: { locataire: [0, 'À la charge du locataire'], proprietaire: [0, 'À la charge du propriétaire'], nc: [0, 'Non communiqué'] } },
  renouvellement: { libelle: 'Renouvellement du bail', valeurs: { accord: [0, 'Accord trouvé ou bail récent'], sans_accord: [0, 'Fin de bail sans accord'], nc: [0, 'Non communiqué'] } },
  retards: { libelle: 'Retards de paiement', valeurs: { oui: [0.8, 'Oui'], non: [-0.1, 'Non'], nc: [0, 'Non communiqué'] } },
  emplacement: { libelle: 'Classe d\'emplacement', valeurs: { n1: [0, 'N°1 : flux fort, enseignes'], n1bis: [0, 'N°1 bis'], n2: [0, 'N°2 : rue secondaire'] } },
  ville: { libelle: 'Type de ville', valeurs: { grande: [0, 'Métropole ou grande ville'], moyenne: [0, 'Ville moyenne ou petite'] } },
  extraction: { libelle: 'Extraction', valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  angle: { libelle: 'Local d\'angle', valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  parking: { libelle: 'Parking disponible', valeurs: { oui: [-0.1, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  pmr: { libelle: 'Accessibilité PMR', valeurs: { oui: [-0.1, 'Oui'], non: [0.1, 'Non'], nc: [0, 'Non communiqué'] } },
  etat_batiment: {
    libelle: 'État général du bâtiment',
    valeurs: { parfait: [-0.2, 'Parfait état'], usage: [0, 'État d\'usage'], travaux: [0.4, 'Travaux'], renover: [0.8, 'À rénover'], gros_oeuvre: [1.2, 'Gros œuvre'] },
  },
  etat_local: { libelle: 'État général du local', valeurs: { parfait: [-0.2, 'Parfait état'], usage: [0, 'État d\'usage'], travaux: [0.4, 'Travaux'], brut: [1, 'Brut de béton'] } },
};

/** Les choix proposés à l'écran : le formulaire les lit d'ici, pas l'inverse. */
export const CHOIX = Object.fromEntries(
  Object.entries(BAREME).map(([cle, { libelle, valeurs }]) => [
    cle, { libelle, options: Object.entries(valeurs).map(([v, [, nom]]) => ({ valeur: v, nom })) },
  ]),
);

// Les coefficients sur la valeur, en pour cent. La pratique donne des
// fourchettes ; on retient leur milieu, et on le dit.
export const COEFFICIENTS = {
  triple_net: 7.5, // taxe foncière ET article 606 au locataire : +5 à +10 %
  net_partiel: 3.5, // l'un des deux seulement
  fin_de_bail: -7.5, // fin de bail proche sans accord : -5 à -10 %
  surloyer: -5, // un loyer facial nettement au-dessus du marché : risque de baisse au renouvellement
  sans_extraction_restauration: -12.5, // sur la VLM d'un restaurant sans extraction : -10 à -15 %
};
/** Une enseigne nationale se capitalise à un taux plus bas : 1 à 1,5 point. */
const REMISE_ENSEIGNE = 1;
/** Un local vacant porte le risque de la commercialisation : un point. */
const RISQUE_VACANCE = 1;
/** Une fin de bail est proche en deçà de ce délai. */
const MOIS_FIN_DE_BAIL_PROCHE = 18;
/** Un loyer facial est un surloyer au-delà de cet écart au marché. */
const ECART_SURLOYER = 20;
/** La réserve et la cave pèsent moins que la surface de vente. Choix de modèle. */
export const POIDS_RESERVE = 0.4;

const nombre = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : v;
  return Number.isFinite(n) ? n : null;
};
const arrondir = (v) => Math.round(v / 1000) * 1000;
const estRestauration = (activite) => /restaur|brasserie|pizz|caf[ée]|\bbar\b|traiteur|snack|kebab|sushi|burger|bistro/i.test(String(activite || ''));

/** La surface pondérée : la vente à plein, la réserve à part. Pure. */
export function surfacePonderee({ surface_m2, surface_vente_m2, surface_reserve_m2 } = {}) {
  const totale = nombre(surface_m2);
  const vente = nombre(surface_vente_m2);
  const reserve = nombre(surface_reserve_m2);
  if (vente != null && vente > 0) return { totale: totale || vente + (reserve || 0), ponderee: Math.round(vente + (reserve || 0) * POIDS_RESERVE), detail: `${vente} m² de vente à plein, ${reserve || 0} m² de réserve à ${Math.round(POIDS_RESERVE * 100)} %` };
  if (totale != null && totale > 0) return { totale, ponderee: totale, detail: 'surface totale, sans distinction vente / réserve' };
  return { totale: null, ponderee: null, detail: null };
}

/**
 * Les lectures de valeur locative de marché, de la plus sûre à la moins sûre.
 * Equimmox constate des baux signés sur des locaux de surface comparable à
 * 500 m ; le loyer déduit des ventes DVF au taux de rendement est une
 * déduction, tous locaux confondus. Les deux peuvent diverger fortement, et
 * l'écran doit le montrer plutôt que de retenir l'une en silence.
 */
function lecturesVlm(marche) {
  const lectures = [];
  const eq = marche?.vlm_equimmox;
  if (eq && (eq.moyenne || eq.bas || eq.haut)) {
    const moyen = eq.moyenne ?? ((eq.bas + eq.haut) / 2);
    lectures.push({ source: eq.source || 'Equimmox', bas: eq.bas ?? moyen, moyen, haut: eq.haut ?? moyen, detail: `${eq.rayon || '500 m'}, surfaces de ${eq.surface_min ?? '?'} à ${eq.surface_max ?? '?'} m²` });
  }
  const dv = marche?.vlm_dvf;
  if (dv && (dv.basse != null || dv.haute != null)) {
    lectures.push({ source: dv.source || 'DVF, loyer déduit', bas: dv.basse, moyen: dv.moyenne ?? Math.round((dv.basse + dv.haute) / 2), haut: dv.haute, derive: true, detail: `déduit de ${dv.n} ventes de murs à ${dv.rayon}, au taux de ${String(dv.taux?.bas).replace('.', ',')} à ${String(dv.taux?.haut).replace('.', ',')} %` });
  }
  return lectures;
}

/** La valeur locative retenue, la plus spécifique, et les autres lectures avec elle. */
function vlmRetenue(marche) {
  const lectures = lecturesVlm(marche);
  return lectures.length ? { ...lectures[0], alternatives: lectures.slice(1) } : null;
}

/**
 * L'estimation : les trois méthodes, la matrice d'ajustements, la fourchette
 * retenue. Pure : testée sans réseau.
 */
export function calculerEstimation({ marche = {}, reponses = {}, activite = null, aujourdhui = new Date() }) {
  const statut = reponses.statut === 'vacant' ? 'vacant' : 'loue';
  const loyer = nombre(reponses.loyer_annuel);
  if (statut === 'loue' && (!loyer || loyer <= 0)) return { ok: false, error: 'Un local loué demande son loyer annuel net HT HC.' };
  const surfaces = surfacePonderee(reponses);
  const vlm = vlmRetenue(marche);
  if (statut === 'vacant' && !surfaces.ponderee) return { ok: false, error: 'Un local vacant demande sa surface : sans elle, aucune valeur locative ne se calcule.' };

  // 1. Le taux : sa bande, sa place dans la bande, ses ajustements.
  const locataire = statut === 'vacant' ? null : reponses.locataire || null;
  const bande = bandeDeTaux({ ville: reponses.ville, emplacement: reponses.emplacement, locataire });
  const place = positionDansLaBande({ commerces: marche.commerces || 0, insee: marche.insee || null });
  const tauxBase = Math.round((bande.bande[0] + place.position * (bande.bande[1] - bande.bande[0])) * 100) / 100;

  const facteurs = [];
  for (const [cle, { libelle, valeurs }] of Object.entries(BAREME)) {
    const choix = valeurs[reponses[cle]];
    if (!choix) continue;
    const [points, nom] = choix;
    if (points) facteurs.push({ libelle: `${libelle} : ${nom.toLowerCase()}`, points });
  }
  // Une enseigne nationale hors bande n°1 : la bande n°1 la porte déjà.
  if (locataire === 'enseigne' && bande.cle !== 'n1_enseigne') facteurs.push({ libelle: 'Enseigne nationale ou franchise : locataire institutionnel', points: -REMISE_ENSEIGNE });
  const vitrine = nombre(reponses.vitrine_m);
  if (vitrine != null && vitrine >= 6) facteurs.push({ libelle: `Vitrine de ${String(vitrine).replace('.', ',')} m linéaires`, points: -0.2 });
  else if (vitrine != null && vitrine > 0 && vitrine < 3) facteurs.push({ libelle: `Vitrine étroite (${String(vitrine).replace('.', ',')} m linéaires)`, points: 0.2 });
  const ca = nombre(reponses.ca_ht);
  const effort = loyer && ca && ca > 0 ? Math.round((loyer / ca) * 1000) / 10 : null;
  if (effort != null) {
    if (effort > 12) facteurs.push({ libelle: `Taux d'effort de ${String(effort).replace('.', ',')} % du chiffre d'affaires`, points: 0.6 });
    else if (effort < 6) facteurs.push({ libelle: `Taux d'effort contenu (${String(effort).replace('.', ',')} % du chiffre d'affaires)`, points: -0.3 });
  }
  const taux = borner(tauxBase + facteurs.reduce((s, f) => s + f.points, 0));
  const tauxVacant = borner(taux + RISQUE_VACANCE);

  // 2. Les coefficients sur la valeur des méthodes par le loyer.
  const coefficients = [];
  const tfLoc = reponses.taxe_fonciere === 'locataire';
  const t606Loc = reponses.travaux_606 === 'locataire';
  if (statut === 'loue' && tfLoc && t606Loc) coefficients.push({ libelle: 'Bail triple net : taxe foncière et article 606 au locataire', pct: COEFFICIENTS.triple_net });
  else if (statut === 'loue' && (tfLoc || t606Loc)) coefficients.push({ libelle: tfLoc ? 'Taxe foncière au locataire' : 'Article 606 au locataire', pct: COEFFICIENTS.net_partiel });
  const finBail = reponses.fin_bail ? Date.parse(reponses.fin_bail) : NaN;
  const moisRestants = Number.isFinite(finBail) ? Math.round((finBail - aujourdhui.getTime()) / (30.44 * 86400000)) : null;
  if (statut === 'loue' && moisRestants != null && moisRestants <= MOIS_FIN_DE_BAIL_PROCHE && reponses.renouvellement !== 'accord') {
    coefficients.push({ libelle: `Fin de bail dans ${Math.max(0, moisRestants)} mois sans accord de renouvellement : risque de vacance`, pct: COEFFICIENTS.fin_de_bail });
  }

  // 3. Le loyer facial face au marché.
  let ecartVlm = null;
  const loyerVlm = vlm && surfaces.ponderee ? { bas: Math.round(vlm.bas * surfaces.ponderee), moyen: Math.round(vlm.moyen * surfaces.ponderee), haut: Math.round(vlm.haut * surfaces.ponderee) } : null;
  const facteursVlm = [];
  if (loyerVlm && estRestauration(activite) && reponses.extraction === 'non') {
    facteursVlm.push({ libelle: 'Restaurant sans extraction : moins de preneurs possibles', pct: COEFFICIENTS.sans_extraction_restauration });
  }
  const coefVlm = 1 + facteursVlm.reduce((s, f) => s + f.pct, 0) / 100;
  const loyerVlmAjuste = loyerVlm ? { bas: Math.round(loyerVlm.bas * coefVlm), moyen: Math.round(loyerVlm.moyen * coefVlm), haut: Math.round(loyerVlm.haut * coefVlm) } : null;
  if (statut === 'loue' && loyerVlmAjuste?.moyen) {
    ecartVlm = Math.round(((loyer - loyerVlmAjuste.moyen) / loyerVlmAjuste.moyen) * 100);
    if (ecartVlm > ECART_SURLOYER) coefficients.push({ libelle: `Loyer facial ${ecartVlm} % au-dessus du marché : risque de baisse au renouvellement`, pct: COEFFICIENTS.surloyer });
  }
  const coefValeur = 1 + coefficients.reduce((s, c) => s + c.pct, 0) / 100;

  // 4. Les trois méthodes.
  const capitaliser = (montant, t) => arrondir((montant / (t / 100)) * coefValeur);
  const methodes = {};
  if (statut === 'loue') {
    methodes.capitalisation = {
      libelle: 'Capitalisation du loyer réel',
      loyer, taux, taux_bas: borner(taux - 0.5), taux_haut: borner(taux + 0.5),
      basse: capitaliser(loyer, borner(taux + 0.5)), moyenne: capitaliser(loyer, taux), haute: capitaliser(loyer, borner(taux - 0.5)),
    };
  }
  if (loyerVlmAjuste) {
    const t = statut === 'vacant' ? tauxVacant : taux;
    methodes.vlm = {
      libelle: statut === 'vacant' ? 'Capitalisation de la valeur locative de marché, risque de vacance compris' : 'Capitalisation de la valeur locative de marché',
      source: vlm.source, detail: vlm.detail, alternatives: vlm.alternatives || [], m2: { bas: vlm.bas, moyen: vlm.moyen, haut: vlm.haut }, loyer: loyerVlmAjuste, facteurs: facteursVlm, taux: t,
      basse: capitaliser(loyerVlmAjuste.bas, t), moyenne: capitaliser(loyerVlmAjuste.moyen, t), haute: capitaliser(loyerVlmAjuste.haut, t),
    };
  }
  const dvf = marche.dvf;
  if (dvf && dvf.n >= MINIMUM_VENTES && surfaces.totale) {
    // Le prix pondéré par la surface peut tomber sous le premier quartile des
    // prix unitaires, quand de grandes cellules bon marché pèsent lourd : la
    // fourchette s'élargit alors jusqu'à lui plutôt que de se renverser.
    const basM2 = Math.min(dvf.bas, dvf.prix_m2_pondere);
    const hautM2 = Math.max(dvf.haut, dvf.prix_m2_pondere);
    methodes.dvf = {
      libelle: `Comparables DVF : ${dvf.n} ventes à ${RAYON_COMPARABLES} m sur ${dvf.mois} mois`,
      n: dvf.n, prix_m2_pondere: dvf.prix_m2_pondere, bas_m2: basM2, haut_m2: hautM2, ventes: dvf.ventes,
      basse: arrondir(basM2 * surfaces.totale), moyenne: arrondir(dvf.prix_m2_pondere * surfaces.totale), haute: arrondir(hautM2 * surfaces.totale),
    };
  }

  // 5. La fourchette retenue : une moyenne pondérée des méthodes disponibles.
  //    Le loyer réel pèse le plus quand il existe ; sans lui, le marché locatif
  //    et les ventes se partagent le poids.
  const POIDS = statut === 'loue' ? { capitalisation: 0.5, vlm: 0.25, dvf: 0.25 } : { vlm: 0.6, dvf: 0.4 };
  const dispo = Object.keys(methodes).filter((k) => POIDS[k]);
  if (!dispo.length) return { ok: false, error: 'Aucune méthode ne peut se calculer : ni loyer, ni valeur locative de marché, ni assez de ventes comparables.' };
  const total = dispo.reduce((s, k) => s + POIDS[k], 0);
  const poids = Object.fromEntries(dispo.map((k) => [k, Math.round((POIDS[k] / total) * 100) / 100]));
  const moyennePonderee = (cle) => arrondir(dispo.reduce((s, k) => s + methodes[k][cle] * (POIDS[k] / total), 0));
  const valeurs = { basse: moyennePonderee('basse'), moyenne: moyennePonderee('moyenne'), haute: moyennePonderee('haute') };

  return {
    ok: true,
    statut,
    loyer_annuel: loyer,
    ca_ht: ca,
    taux_effort: effort,
    surface: surfaces,
    taux: { bande, position: place.position, raisons: place.raisons, base: tauxBase, facteurs, retenu: taux, vacant: tauxVacant },
    vlm: vlm ? { ...vlm, loyer: loyerVlmAjuste, ecart_facial_pct: ecartVlm } : null,
    coefficients,
    coefficient_valeur: Math.round(coefValeur * 1000) / 1000,
    methodes,
    poids,
    valeurs,
    prix_m2: surfaces.totale ? Math.round(valeurs.moyenne / surfaces.totale) : null,
  };
}

const noter = (id, patch) => Records.update(ENTITE, id, patch);
const etape = (id, cle, etat, detail = null) => {
  const e = Records.get(ENTITE, id);
  const etapes = (e?.etapes || []).map((x) => (x.cle === cle ? { ...x, etat, detail, le: new Date().toISOString() } : x));
  const faites = etapes.filter((x) => x.etat === 'faite' || x.etat === 'ratee').length;
  noter(id, { etapes, progression: Math.round((faites / Math.max(1, etapes.length)) * 100) });
};

export function listerEstimations() {
  return Records.list(ENTITE)
    .map(({ id, adresse, activite, etat, progression, cree_le, fini_le, par, libelle, resultat }) => ({
      id, adresse, activite, etat, progression, cree_le, fini_le, par, libelle,
      valeur: resultat?.valeurs?.moyenne ?? null,
    }))
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

export function lireEstimation(id) {
  return Records.get(ENTITE, id) || null;
}

/** Lance le calcul de marché et rend tout de suite son identifiant. */
export function lancerEstimation({ adresse, activite = null }, user = null) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return { ok: false, error: 'Il faut une adresse précise : numéro, rue, ville.' };
  const e = Records.create(ENTITE, {
    adresse: texte,
    activite: String(activite || '').trim() || 'Tous les commerces',
    etat: 'en_cours',
    progression: 0,
    etapes: ETAPES.map((x) => ({ ...x, etat: 'a_faire', detail: null })),
    cree_le: new Date().toISOString(),
    fini_le: null,
    par: user?.email || null,
    marche: null,
    reponses: null,
    resultat: null,
    libelle: texte,
  }, user?.email);
  executer(e.id, user).catch((err) => {
    noter(e.id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) });
  });
  return { ok: true, id: e.id };
}

async function executer(id, user) {
  const e = Records.get(ENTITE, id);
  const marche = { sources: [] };

  etape(id, 'adresse', 'en_cours');
  const point = await geocoder({ adresse: e.adresse });
  if (!point) {
    etape(id, 'adresse', 'ratee', 'adresse introuvable dans la Base Adresse Nationale');
    noter(id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: `Adresse introuvable : « ${e.adresse} ».` });
    return;
  }
  marche.point = { lat: point.lat, lon: point.lon, libelle: point.libelle };
  noter(id, { libelle: point.libelle, marche });
  etape(id, 'adresse', 'faite', point.libelle);

  // Les ventes de murs : DVF, au point, sur 500 m. On garde les 36 derniers
  // mois et on pondère par la surface.
  etape(id, 'dvf', 'en_cours');
  try {
    const { ventesAutour } = await import('./dvf.js');
    const r = await ventesAutour(point.libelle, { rayon: RAYON_COMPARABLES, user });
    marche.dvf = r.ok ? comparablesDvf(r.resultat?.ventes || []) : null;
    if (r.ok) marche.sources.push('DVF');
    etape(id, 'dvf', r.ok ? 'faite' : 'ratee', r.ok ? `${marche.dvf.n} ventes sur ${MOIS_COMPARABLES} mois${marche.dvf.prix_m2_pondere ? `, ${marche.dvf.prix_m2_pondere.toLocaleString('fr-FR')} € / m² pondéré` : ''}` : r.error);
  } catch (err) {
    marche.dvf = null;
    etape(id, 'dvf', 'ratee', err?.message || String(err));
  }
  noter(id, { marche });

  etape(id, 'concurrence', 'en_cours');
  try {
    const brut = await interroger(construireRequete([{ cle: 'shop', valeurs: null }], point.lat, point.lon, RAYON_CONCURRENCE));
    marche.commerces = (brut.elements || []).length;
    marche.sources.push('OpenStreetMap');
    etape(id, 'concurrence', 'faite', `${marche.commerces} commerces dans ${RAYON_CONCURRENCE} m`);
  } catch (err) {
    marche.commerces = null;
    etape(id, 'concurrence', 'ratee', `${err?.message || String(err)} : la densité commerciale ne pèsera pas`);
  }
  noter(id, { marche });

  etape(id, 'marche', 'en_cours');
  const h = await habitantsDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: RAYON_ZONE });
  marche.insee = h.ok ? h.insee : null;
  marche.rayon_zone_m = RAYON_ZONE;
  if (h.ok) marche.sources.push('INSEE Filosofi');
  etape(id, 'marche', h.ok ? 'faite' : 'ratee', h.ok ? `${h.insee?.population?.habitants ?? 0} habitants dans ${RAYON_ZONE} m` : h.error);
  noter(id, { marche });

  // La valeur locative de marché, déduite des ventes DVF au taux de rendement
  // de la grille : une seconde, aucun crédit. Le constat Equimmox, à surface
  // comparable, viendra après le formulaire et passera devant.
  etape(id, 'vlm', 'en_cours');
  try {
    const v = await loyerDvf(point.libelle, { user });
    marche.vlm_dvf = v.ok ? v.resultat : null;
    if (v.ok) marche.sources.push('DVF, loyer déduit');
    etape(id, 'vlm', v.ok ? 'faite' : 'ratee', v.ok ? `${v.resultat.basse} à ${v.resultat.haute} € / m² / an, déduits de ${v.resultat.n} ventes à ${v.resultat.rayon}` : v.error);
  } catch (err) {
    marche.vlm_dvf = null;
    etape(id, 'vlm', 'ratee', err?.message || String(err));
  }
  noter(id, { etat: 'terminee', fini_le: new Date().toISOString(), progression: 100, marche });
}

/**
 * Enregistre les réponses et calcule. Quand Equimmox est configuré et qu'une
 * surface est donnée, un affinage part en tâche de fond : la valeur locative
 * à surface comparable vaut mieux que celle de la rue, et elle prend une
 * minute. L'écran suit les étapes, comme au premier calcul.
 */
export function estimer(id, reponses, user = null) {
  const e = Records.get(ENTITE, id);
  if (!e) return { ok: false, error: "Cette estimation n'existe plus." };
  const rep = reponses || {};
  const r = calculerEstimation({ marche: e.marche || {}, reponses: rep, activite: e.activite });
  if (!r.ok) return r;
  const resultat = { ...r, calcule_le: new Date().toISOString() };
  const surface = surfacePonderee(rep).totale;

  if (equimmoxConfigure() && surface > 0 && !e.marche?.vlm_equimmox_pour?.[surface]) {
    Records.update(ENTITE, id, {
      reponses: rep, resultat,
      etat: 'en_cours', progression: 0,
      etapes: ETAPES_AFFINAGE.map((x) => ({ ...x, etat: 'a_faire', detail: null })),
    });
    affiner(id, surface, user).catch((err) => {
      noter(id, { etat: 'terminee', fini_le: new Date().toISOString(), erreur_affinage: err?.message || String(err) });
    });
    return { ok: true, estimation: Records.get(ENTITE, id) };
  }
  Records.update(ENTITE, id, { reponses: rep, resultat, etat: 'terminee' });
  return { ok: true, estimation: Records.get(ENTITE, id) };
}

async function affiner(id, surface, user) {
  const e = Records.get(ENTITE, id);
  const marche = { ...(e.marche || {}) };
  etape(id, 'equimmox', 'en_cours');
  try {
    const r = await analyseLoyer(e.libelle || e.adresse, { surface, user });
    if (r.ok) {
      marche.vlm_equimmox = r.resultat;
      marche.vlm_equimmox_pour = { ...(marche.vlm_equimmox_pour || {}), [surface]: true };
      if (!marche.sources.includes('Equimmox')) marche.sources.push('Equimmox');
      etape(id, 'equimmox', 'faite', `${r.resultat.bas ?? '?'} à ${r.resultat.haut ?? '?'} € / m² / an${r.resultat.du_cache ? ', repris de la base' : ''}`);
    } else {
      etape(id, 'equimmox', 'ratee', r.error);
    }
  } catch (err) {
    etape(id, 'equimmox', 'ratee', err?.message || String(err));
  }
  etape(id, 'calcul', 'en_cours');
  const r = calculerEstimation({ marche, reponses: e.reponses || {}, activite: e.activite });
  const resultat = r.ok ? { ...r, calcule_le: new Date().toISOString() } : e.resultat;
  etape(id, 'calcul', 'faite', r.ok ? `${r.valeurs.moyenne.toLocaleString('fr-FR')} € en valeur moyenne` : r.error);
  noter(id, { marche, resultat, etat: 'terminee', fini_le: new Date().toISOString(), progression: 100 });
}

export function supprimerEstimation(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: "Cette estimation n'existe plus." };
  Records.delete(ENTITE, id);
  return { ok: true };
}
