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

// --- Les hypothèses du plan, toutes ici ------------------------------------

/** Le rendement brut visé sur un commerce, hors frais. */
export const RENDEMENT_CIBLE = 7;
/**
 * La part du loyer qui reste en poche une fois le crédit, les charges, la
 * gestion et l'impôt payés, sur un montage à l'équilibre. C'est l'hypothèse
 * la plus lourde du calcul : elle est dite sur la page.
 */
export const PART_CASH_FLOW = 0.3;
/** L'apport à prévoir : droits, honoraires et part bancaire. */
export const PART_APPORT = 0.25;
/** Ce qu'un ménage met de côté chaque année, en part de ses revenus nets. */
export const PART_EPARGNE = 0.2;
/** Le ticket d'entrée d'un commerce : en deçà, le montage ne tient pas. */
export const TICKET_MIN = 90000;
export const TICKET_MAX = 450000;
/** Au-delà, ce n'est plus une feuille de route, c'est un catalogue. */
const ACQUISITIONS_MAX = 6;

const euros = (n) => Math.round(n / 1000) * 1000;

/**
 * Le plan d'acquisition. Pure : testée sans réseau.
 *
 * @param {object} p
 * @param {number} p.objectif_mensuel  le revenu net visé, par mois
 * @param {number} p.fonds_propres     ce dont la personne dispose aujourd'hui
 * @param {number} p.revenus_annuels   ses revenus nets annuels
 * @param {number} p.horizon_ans       en combien d'années elle veut y arriver
 * @param {number|null} p.prix_m2      le prix au m² du quartier, si DVF le donne
 * @returns {object} le plan, ses étapes et ses hypothèses
 */
export function calculerRoadmap({ objectif_mensuel, fonds_propres = 0, revenus_annuels = 0, horizon_ans = 10, prix_m2 = null }) {
  const objectif = Math.max(0, Number(objectif_mensuel) || 0);
  const horizon = Math.min(25, Math.max(1, Math.round(Number(horizon_ans) || 10)));
  const fonds = Math.max(0, Number(fonds_propres) || 0);
  const revenus = Math.max(0, Number(revenus_annuels) || 0);
  if (!objectif) return { ok: false, error: 'Il faut un objectif de revenu mensuel.' };

  // Du revenu voulu au patrimoine à constituer : le loyer qui le produit,
  // puis le prix que ce loyer paie au rendement visé.
  const loyer_annuel_vise = (objectif * 12) / PART_CASH_FLOW;
  const patrimoine_vise = euros(loyer_annuel_vise / (RENDEMENT_CIBLE / 100));

  // Le ticket : on vise trois à quatre lots, bornés au marché du commerce.
  const ticket = Math.min(TICKET_MAX, Math.max(TICKET_MIN, euros(patrimoine_vise / 3)));
  const nombre = Math.min(ACQUISITIONS_MAX, Math.max(1, Math.round(patrimoine_vise / ticket)));

  // Ce qu'on peut mettre : les fonds d'aujourd'hui, plus l'épargne à venir,
  // plus le cash-flow des lots déjà achetés qui réalimente le suivant.
  const epargne_annuelle = euros(revenus * PART_EPARGNE);
  const apport_par_lot = euros(ticket * PART_APPORT);

  const etapes = [];
  let disponible = fonds;
  let annee = 0;
  let loyer_cumule = 0;
  for (let i = 1; i <= nombre; i++) {
    // On avance jusqu'à ce que l'apport soit réuni : épargne du foyer plus
    // cash-flow des lots déjà en portefeuille.
    let attente = 0;
    while (disponible < apport_par_lot && annee + attente < horizon + 15) {
      attente += 1;
      disponible += epargne_annuelle + loyer_cumule * PART_CASH_FLOW;
    }
    annee += attente;
    disponible -= apport_par_lot;
    const loyer = euros(ticket * (RENDEMENT_CIBLE / 100));
    loyer_cumule += loyer;
    etapes.push({
      rang: i,
      annee,
      prix: ticket,
      apport: apport_par_lot,
      loyer_annuel: loyer,
      rendement_cible: RENDEMENT_CIBLE,
      surface_indicative: prix_m2 ? Math.round(ticket / prix_m2) : null,
      cash_flow_mensuel: Math.round((loyer * PART_CASH_FLOW) / 12),
      cumul_mensuel: Math.round((loyer_cumule * PART_CASH_FLOW) / 12),
    });
  }

  const derniere = etapes[etapes.length - 1];
  return {
    ok: true,
    objectif_mensuel: objectif,
    horizon_ans: horizon,
    patrimoine_vise,
    loyer_annuel_vise: euros(loyer_annuel_vise),
    nombre_acquisitions: nombre,
    epargne_annuelle,
    etapes,
    // Ce que le plan atteint vraiment, et en combien de temps : arrondir au
    // profit de la promesse serait le plus sûr moyen de décevoir au premier
    // rendez-vous.
    atteint_mensuel: derniere ? derniere.cumul_mensuel : 0,
    annee_objectif: derniere ? derniere.annee : null,
    dans_horizon: !!derniere && derniere.annee <= horizon,
    hypotheses: {
      rendement_cible: RENDEMENT_CIBLE,
      part_cash_flow: PART_CASH_FLOW,
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
    surface: etape.surface_indicative || 60,
    dureeCredit: 20,
    tauxInteret: 3.7,
    anneeRevente: 20,
  };
  return `${base}/SimulateurPublic?data=${encodeURIComponent(JSON.stringify(params))}`;
}

// --- Le débit d'une page ouverte -------------------------------------------

// Une page sans compte est une porte : on compte les passages par adresse.
const PASSAGES = new Map();
const FENETRE_MS = 60 * 60 * 1000;
const MAX_PAR_HEURE = 8;

export function tropDeDemandes(ip) {
  const maintenant = Date.now();
  const vus = (PASSAGES.get(ip) || []).filter((t) => maintenant - t < FENETRE_MS);
  if (vus.length >= MAX_PAR_HEURE) { PASSAGES.set(ip, vus); return true; }
  vus.push(maintenant);
  PASSAGES.set(ip, vus);
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
    return (r.commerces || [])
      .filter((c) => c.nom && !c.vacant)
      .slice(0, 6)
      .map((c) => ({ nom: c.nom, metier: nomDe(c.genre) || c.genre, adresse: c.adresse, distance_m: c.distance_m }));
  } catch (e) { console.warn(`[lm] commerces voisins indisponibles : ${e?.message || e}`); return []; }
}

// --- Les lead magnets et leurs leads ---------------------------------------

/** Les lead magnets publiés, pour le tableau de bord de l'équipe. */
export function listerLeadMagnets() {
  const leads = Records.list(ENTITE_LEAD);
  return Records.list(ENTITE_LM)
    .map((m) => ({
      ...m,
      leads: leads.filter((l) => l.slug === m.slug).length,
      dernier_lead: leads.filter((l) => l.slug === m.slug).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0]?.le || null,
    }))
    .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')));
}

export function lireLeadMagnet(slug) {
  return Records.list(ENTITE_LM).find((m) => m.slug === slug && m.actif) || null;
}

export function listerLeads(slug = null) {
  return Records.list(ENTITE_LEAD)
    .filter((l) => !slug || l.slug === slug)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

/** Le lead magnet de départ, posé au premier démarrage. */
export function assurerLeadMagnetInitial() {
  if (Records.list(ENTITE_LM).some((m) => m.slug === 'feuille-de-route')) return;
  Records.create(ENTITE_LM, {
    slug: 'feuille-de-route',
    titre: 'Ma feuille de route vers les revenus commerciaux',
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
    prix_m2: marche?.m2 || null,
  });
  if (!plan.ok) return plan;

  const roadmap = {
    ...plan,
    quartier: point?.label || quartier,
    commune: marche?.commune || point?.ville || null,
    marche,
    exemples,
    lien_simulateur: lienSimulateur(plan.etapes[0], base),
  };

  Records.create(ENTITE_LEAD, {
    slug: String(reponses?.slug || 'feuille-de-route'),
    nom, email,
    telephone: String(reponses?.telephone || '').trim().slice(0, 30) || null,
    quartier: roadmap.quartier,
    objectif_mensuel: plan.objectif_mensuel,
    fonds_propres: Number(reponses.fonds_propres) || 0,
    revenus_annuels: Number(reponses.revenus_annuels) || 0,
    horizon_ans: plan.horizon_ans,
    roadmap,
    ip: ip || null,
    le: new Date().toISOString(),
    traite: false,
  });

  return { ok: true, roadmap };
}

export function marquerTraite(id, traite = true) {
  if (!Records.get(ENTITE_LEAD, id)) return { ok: false, error: "Ce lead n'existe plus." };
  Records.update(ENTITE_LEAD, id, { traite: !!traite });
  return { ok: true };
}
