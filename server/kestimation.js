// K-Estimation : l'estimation de murs commerciaux par le rendement.
//
// Le principe tient en une division. Un investisseur achète des murs pour le
// loyer qu'ils rapportent ; il exige un rendement, et ce rendement fixe le
// prix :
//
//     valeur = loyer annuel HT / HC ÷ taux de rendement exigé
//
// Plus le taux exigé est faible, plus l'investisseur paie cher. Un taux élevé
// dit l'inverse : du risque, donc une valeur plus basse.
//
// Tout le travail est donc dans le taux, et il se fait en deux temps :
//
//   1. Un taux de marché, calculé à l'adresse avant que l'utilisateur ne
//      saisisse quoi que ce soit : densité commerciale autour du point
//      (OpenStreetMap), niveau de vie et densité de population de la zone
//      (INSEE Filosofi). C'est l'écran de chargement.
//   2. Les ajustements du bien et de l'occupation, que l'utilisateur renseigne
//      en trois étapes : état, caractéristiques commerciales, situation
//      locative.
//
// Chaque point ajouté ou retiré est nommé et rendu à l'écran : l'estimation
// n'est jamais un chiffre tombé du ciel, elle se lit ligne à ligne.
//
// Aucun crédit Data-B n'est dépensé ici : tout vient de sources ouvertes.

import { Records } from './db.js';
import { geocoder } from './deal/geocodage.js';
import { interroger, construireRequete } from './kzoning-commerces.js';
import { habitantsDeLaZone } from './kzoning-insee.js';

const ENTITE = 'EstimationMurs';

/** Les étapes du calcul de marché, dans l'ordre où elles se suivent. */
export const ETAPES = [
  { cle: 'adresse', nom: "Localisation de l'adresse" },
  { cle: 'concurrence', nom: 'Commerces autour du point' },
  { cle: 'marche', nom: 'Zone de chalandise : population, niveau de vie' },
  { cle: 'reference', nom: 'Taux de rendement de marché' },
];

// Le point de départ, avant tout ajustement. Ce n'est pas une statistique
// mesurée : c'est le pivot du modèle, l'ordre de grandeur d'un rendement de
// murs commerciaux en France hors emplacement exceptionnel. Il se corrige ici,
// en un seul endroit, et tout le reste du calcul suit.
export const TAUX_PIVOT = 7.0;

// Le niveau de vie qui sert de comparaison. Même statut que le pivot ci-dessus :
// un repère du modèle, pas une valeur relevée. En euros par personne et par an.
const NIVEAU_VIE_PIVOT = 22000;

const RAYON_CONCURRENCE = 300;
const RAYON_ZONE = 800;

/** Le taux ne sort jamais de ces bornes, quels que soient les ajustements. */
export const TAUX_MIN = 4.5;
export const TAUX_MAX = 12;

const borner = (t) => Math.min(TAUX_MAX, Math.max(TAUX_MIN, Math.round(t * 100) / 100));

/**
 * Le taux de marché à l'adresse, et le détail de ce qui l'a fait bouger.
 * Pure : testée sans réseau.
 */
export function tauxDeMarche({ commerces = 0, insee = null } = {}) {
  const facteurs = [];
  const pose = (libelle, points) => { if (points) facteurs.push({ libelle, points }); };

  // La densité commerciale dit l'emplacement mieux que n'importe quel
  // classement : un commerce isolé ne se reloue pas comme un numéro de rue
  // entouré de soixante autres.
  if (commerces >= 60) pose(`Emplacement très commerçant (${commerces} commerces dans ${RAYON_CONCURRENCE} m)`, -1);
  else if (commerces >= 25) pose(`Rue commerçante (${commerces} commerces dans ${RAYON_CONCURRENCE} m)`, -0.5);
  else if (commerces < 8) pose(`Peu de commerces autour (${commerces} dans ${RAYON_CONCURRENCE} m)`, 1);

  const niveau = insee?.revenus?.niveau_de_vie_moyen ?? null;
  if (niveau != null) {
    if (niveau >= NIVEAU_VIE_PIVOT * 1.25) pose(`Niveau de vie élevé dans la zone (${Math.round(niveau).toLocaleString('fr-FR')} € par an)`, -0.5);
    else if (niveau >= NIVEAU_VIE_PIVOT) pose(`Niveau de vie au-dessus du repère (${Math.round(niveau).toLocaleString('fr-FR')} € par an)`, -0.25);
    else if (niveau < NIVEAU_VIE_PIVOT * 0.8) pose(`Niveau de vie bas dans la zone (${Math.round(niveau).toLocaleString('fr-FR')} € par an)`, 0.5);
  }

  const pauvrete = insee?.revenus?.taux_pauvrete ?? null;
  if (pauvrete != null && pauvrete > 20) pose(`Taux de pauvreté de ${String(pauvrete).replace('.', ',')} % dans la zone`, 0.3);

  const densite = insee?.population?.densite_km2 ?? null;
  if (densite != null && densite >= 8000) pose(`Zone très dense (${Math.round(densite).toLocaleString('fr-FR')} hab./km²)`, -0.3);

  const somme = facteurs.reduce((s, f) => s + f.points, 0);
  return { pivot: TAUX_PIVOT, facteurs, taux: borner(TAUX_PIVOT + somme) };
}

// Ce que chaque réponse pèse, en points de rendement. Un point en plus, c'est
// du risque : le taux exigé monte et la valeur baisse.
const BAREME = {
  etat_batiment: {
    libelle: 'État général du bâtiment',
    valeurs: { parfait: [-0.2, 'Parfait état'], usage: [0, "État d'usage"], travaux: [0.4, 'Travaux'], renover: [0.8, 'À rénover'], gros_oeuvre: [1.2, 'Gros œuvre'] },
  },
  etat_local: {
    libelle: 'État général du local',
    valeurs: { parfait: [-0.2, 'Parfait état'], usage: [0, "État d'usage"], travaux: [0.4, 'Travaux'], brut: [1, 'Brut de béton'] },
  },
  angle: { libelle: "Local d'angle", valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  extraction: { libelle: 'Extraction', valeurs: { oui: [-0.2, 'Oui'], non: [0.1, 'Non'], nc: [0, 'Non communiqué'] } },
  parking: { libelle: 'Parking disponible', valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  pmr: { libelle: 'Accessibilité PMR', valeurs: { oui: [-0.1, 'Oui'], non: [0.1, 'Non'], nc: [0, 'Non communiqué'] } },
  logement: { libelle: "Présence d'un logement", valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  situation: { libelle: 'Situation locative', valeurs: { occupe: [-0.3, 'Occupé'], vide: [0.8, 'Vide'] } },
  reseau: { libelle: "Réseau d'enseigne", valeurs: { oui: [-0.5, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
  anciennete: {
    libelle: "Ancienneté de l'activité dans le local",
    valeurs: { '-1': [0.3, "- de 1 an"], '1-3': [0.1, '1 à 3 ans'], '3-6': [0, '3 à 6 ans'], '6-9': [-0.2, '6 à 9 ans'], '+9': [-0.3, '+ de 9 ans'] },
  },
  retards: { libelle: 'Retards de paiement', valeurs: { oui: [0.8, 'Oui'], non: [-0.1, 'Non'], nc: [0, 'Non communiqué'] } },
  licence_iv: { libelle: 'Licence IV', valeurs: { oui: [-0.2, 'Oui'], non: [0, 'Non'], nc: [0, 'Non communiqué'] } },
};

/** Les choix proposés à l'écran : le formulaire les lit d'ici, pas l'inverse. */
export const CHOIX = Object.fromEntries(
  Object.entries(BAREME).map(([cle, { libelle, valeurs }]) => [
    cle,
    { libelle, options: Object.entries(valeurs).map(([v, [, nom]]) => ({ valeur: v, nom })) },
  ]),
);

const nombre = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : v;
  return Number.isFinite(n) ? n : null;
};

/**
 * L'estimation : le taux final, ses raisons, et la fourchette de valeur.
 * Pure : testée sans réseau.
 */
export function calculerEstimation({ taux_marche, reponses = {} }) {
  const loyer = nombre(reponses.loyer_annuel);
  if (!loyer || loyer <= 0) return { ok: false, error: 'Il faut un loyer annuel pour estimer des murs.' };

  const depart = Number.isFinite(taux_marche) ? taux_marche : TAUX_PIVOT;
  const facteurs = [];
  for (const [cle, { libelle, valeurs }] of Object.entries(BAREME)) {
    const choix = valeurs[reponses[cle]];
    if (!choix) continue;
    const [points, nom] = choix;
    if (points) facteurs.push({ libelle: `${libelle} : ${nom.toLowerCase()}`, points });
  }

  // La vitrine et l'angle font la visibilité ; une vitrine longue se reloue.
  const vitrine = nombre(reponses.vitrine_m);
  if (vitrine != null && vitrine >= 6) facteurs.push({ libelle: `Vitrine de ${String(vitrine).replace('.', ',')} m`, points: -0.2 });
  else if (vitrine != null && vitrine > 0 && vitrine < 3) facteurs.push({ libelle: `Vitrine étroite (${String(vitrine).replace('.', ',')} m)`, points: 0.2 });

  // Le taux d'effort : ce que le loyer prend au chiffre d'affaires. Au-delà
  // d'une dizaine de pour cent, le locataire tient mal son loyer, et un loyer
  // qui ne tient pas vaut moins cher que son montant.
  const ca = nombre(reponses.ca_ht);
  const effort = ca && ca > 0 ? Math.round((loyer / ca) * 1000) / 10 : null;
  if (effort != null) {
    if (effort > 12) facteurs.push({ libelle: `Taux d'effort de ${String(effort).replace('.', ',')} % du chiffre d'affaires`, points: 0.6 });
    else if (effort < 6) facteurs.push({ libelle: `Taux d'effort contenu (${String(effort).replace('.', ',')} % du chiffre d'affaires)`, points: -0.3 });
  }

  const taux = borner(depart + facteurs.reduce((s, f) => s + f.points, 0));
  const valeur = (t) => Math.round(loyer / (t / 100) / 1000) * 1000;
  const ECART = 0.75; // La fourchette : trois quarts de point de part et d'autre.

  return {
    ok: true,
    loyer_annuel: loyer,
    ca_ht: ca,
    taux_effort: effort,
    taux_marche: depart,
    taux,
    facteurs,
    taux_fourchette: { haut: borner(taux + ECART), moyen: taux, bas: borner(taux - ECART) },
    // Un taux haut donne une valeur basse : c'est tout le principe.
    valeurs: { basse: valeur(borner(taux + ECART)), moyenne: valeur(taux), haute: valeur(borner(taux - ECART)) },
    surface_m2: nombre(reponses.surface_m2),
    prix_m2: nombre(reponses.surface_m2) > 0 ? Math.round(valeur(taux) / nombre(reponses.surface_m2)) : null,
  };
}

const noter = (id, patch) => Records.update(ENTITE, id, patch);
const etape = (id, cle, etat, detail = null) => {
  const e = Records.get(ENTITE, id);
  const etapes = (e?.etapes || []).map((x) => (x.cle === cle ? { ...x, etat, detail, le: new Date().toISOString() } : x));
  const faites = etapes.filter((x) => x.etat === 'faite' || x.etat === 'ratee').length;
  noter(id, { etapes, progression: Math.round((faites / ETAPES.length) * 100) });
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
  executer(e.id).catch((err) => {
    noter(e.id, { etat: 'echec', fini_le: new Date().toISOString(), erreur: err?.message || String(err) });
  });
  return { ok: true, id: e.id };
}

async function executer(id) {
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

  etape(id, 'concurrence', 'en_cours');
  try {
    const brut = await interroger(construireRequete([{ cle: 'shop', valeurs: null }], point.lat, point.lon, RAYON_CONCURRENCE));
    marche.commerces = (brut.elements || []).length;
    marche.sources.push('OpenStreetMap');
    etape(id, 'concurrence', 'faite', `${marche.commerces} commerces dans ${RAYON_CONCURRENCE} m`);
  } catch (err) {
    marche.commerces = 0;
    etape(id, 'concurrence', 'ratee', err?.message || String(err));
  }
  noter(id, { marche });

  etape(id, 'marche', 'en_cours');
  const h = await habitantsDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: RAYON_ZONE });
  marche.insee = h.ok ? h.insee : null;
  marche.rayon_zone_m = RAYON_ZONE;
  if (h.ok) marche.sources.push('INSEE Filosofi');
  etape(id, 'marche', h.ok ? 'faite' : 'ratee', h.ok ? `${h.insee?.population?.habitants ?? 0} habitants dans ${RAYON_ZONE} m` : h.error);
  noter(id, { marche });

  etape(id, 'reference', 'en_cours');
  const t = tauxDeMarche({ commerces: marche.commerces, insee: marche.insee });
  marche.taux = t.taux;
  marche.facteurs = t.facteurs;
  marche.pivot = t.pivot;
  etape(id, 'reference', 'faite', `${String(t.taux).replace('.', ',')} % de rendement de marché`);
  noter(id, { etat: 'terminee', fini_le: new Date().toISOString(), progression: 100, marche });
}

/** Enregistre les réponses du formulaire et calcule l'estimation. */
export function estimer(id, reponses) {
  const e = Records.get(ENTITE, id);
  if (!e) return { ok: false, error: "Cette estimation n'existe plus." };
  const r = calculerEstimation({ taux_marche: e.marche?.taux, reponses: reponses || {} });
  if (!r.ok) return r;
  const resultat = { ...r, facteurs_marche: e.marche?.facteurs || [], calcule_le: new Date().toISOString() };
  Records.update(ENTITE, id, { reponses, resultat });
  return { ok: true, estimation: Records.get(ENTITE, id) };
}

export function supprimerEstimation(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: "Cette estimation n'existe plus." };
  Records.delete(ENTITE, id);
  return { ok: true };
}
