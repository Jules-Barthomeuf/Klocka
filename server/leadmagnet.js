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

// La surface type d'un commerce, par métier. Une pharmacie n'occupe pas la
// même boutique qu'un salon de coiffure, et c'est ce qui fait qu'elles ne
// valent pas le même prix : le prix d'une acquisition, ici, est sa surface
// multipliée par le prix du quartier. Ordres de grandeur d'exploitation,
// posés ici pour être discutés d'un seul endroit.
export const SURFACES = [
  ['Coiffure', 45], ['Agence immobilière', 55], ['Opticien', 70], ['Prêt-à-porter', 75],
  ['Boulangerie', 85], ['Café', 85], ['Boucherie, charcuterie', 90], ['Restaurant', 100],
  ['Pharmacie', 120], ['Supérette', 150],
];
/** À défaut de prix de quartier, le m² qui sert de repère. Dit sur la page. */
const M2_PIVOT = 2200;

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
export function calculerRoadmap({ objectif_mensuel, fonds_propres = 0, revenus_annuels = 0, horizon_ans = 20, prix_m2 = null, metiers = [] }) {
  const objectif = Math.max(0, Number(objectif_mensuel) || 0);
  const horizon = Math.min(40, Math.max(5, Math.round(Number(horizon_ans) || 20)));
  const revenus = Math.max(0, Number(revenus_annuels) || 0);
  if (!objectif) return { ok: false, error: 'Il faut un objectif de revenu mensuel.' };

  const m2 = Math.max(600, Math.round(Number(prix_m2) || M2_PIVOT));
  const loyer_annuel_vise = (objectif * 12) / PART_CASH_FLOW;
  const patrimoine_vise = euros(loyer_annuel_vise / (RENDEMENT_CIBLE / 100));

  // Les commerces à viser : ceux du quartier quand on en connaît, sinon la
  // table. Du plus petit au plus grand — on commence avec ce qu'on a, on
  // monte en gamme à mesure que le portefeuille porte l'acquisition suivante.
  const connus = SURFACES.filter(([nom]) => metiers.includes(nom));
  const palette = (connus.length >= 3 ? connus : SURFACES).slice().sort((a, b) => a[1] - b[1]);
  const prixDe = (surface) => Math.min(TICKET_MAX, Math.max(TICKET_MIN, euros(surface * m2)));

  const epargne_annuelle = euros(revenus * PART_EPARGNE);
  const acquisitions = [];
  let disponible = Math.max(0, Number(fonds_propres) || 0);
  let annee = 0;
  let loyer_cumule = 0;
  let patrimoine = 0;

  for (let i = 0; i < ACQUISITIONS_MAX; i++) {
    if (patrimoine >= patrimoine_vise) break;
    const [metier, surface] = palette[Math.min(i, palette.length - 1)];
    const prix = prixDe(surface);
    const apport = euros(prix * PART_APPORT);
    // On avance jusqu'à ce que l'apport soit réuni : l'épargne du foyer, plus
    // ce que rapportent les lots déjà détenus.
    let attente = 0;
    while (disponible < apport && annee + attente < horizon) {
      attente += 1;
      disponible += epargne_annuelle + loyer_cumule * PART_CASH_FLOW;
    }
    if (annee + attente >= horizon && acquisitions.length) break;
    annee += attente;
    disponible -= apport;
    const loyer = euros(prix * (RENDEMENT_CIBLE / 100));
    loyer_cumule += loyer;
    patrimoine += prix;
    acquisitions.push({
      rang: i + 1, annee, metier, surface, prix, apport,
      loyer_annuel: loyer, rendement_cible: RENDEMENT_CIBLE,
      cash_flow_mensuel: Math.round((loyer * PART_CASH_FLOW) / 12),
      cumul_mensuel: Math.round((loyer_cumule * PART_CASH_FLOW) / 12),
      patrimoine_apres: patrimoine,
      exemple: null,
    });
  }

  // La projection, année par année : c'est elle qu'on trace en bâtons.
  const projection = [];
  let loyerCourant = 0;
  let cumul = 0;
  let patrimoineCourant = 0;
  for (let an = 0; an <= horizon; an++) {
    const achats = acquisitions.filter((a) => a.annee === an);
    const loyerNeuf = achats.reduce((t, a) => t + a.loyer_annuel, 0);
    for (const a of achats) { loyerCourant += a.loyer_annuel; patrimoineCourant += a.prix; }
    // L'apport n'est pas une charge : c'est un investissement, et le déduire du
    // cash-flow donnait un graphique de six gouffres qui ne disait rien de
    // l'exploitation. L'année d'un achat pèse autrement, et pour de vrai : le
    // bien n'est détenu qu'une demi-année, donc il ne rapporte que la moitié.
    const loyerDeLAnnee = loyerCourant - loyerNeuf / 2;
    const cash_flow = Math.round(loyerDeLAnnee * PART_CASH_FLOW);
    cumul += cash_flow;
    projection.push({
      annee: an,
      cash_flow,
      // Ce que la même année rapporterait à plein régime : la différence est
      // exactement ce que coûte une acquisition en cours d'année.
      cash_flow_hors_achat: Math.round(loyerCourant * PART_CASH_FLOW),
      apport_verse: achats.reduce((t, a) => t + a.apport, 0),
      cumul: Math.round(cumul),
      patrimoine: patrimoineCourant,
      achats: achats.map((a) => a.rang),
      mensuel: Math.round((loyerCourant * PART_CASH_FLOW) / 12),
    });
  }

  const derniere = acquisitions[acquisitions.length - 1];
  return {
    ok: true,
    objectif_mensuel: objectif,
    horizon_ans: horizon,
    prix_m2_retenu: m2,
    prix_m2_estime: !prix_m2,
    patrimoine_vise,
    loyer_annuel_vise: euros(loyer_annuel_vise),
    nombre_acquisitions: acquisitions.length,
    epargne_annuelle,
    acquisitions,
    projection,
    patrimoine_final: derniere ? derniere.patrimoine_apres : 0,
    atteint_mensuel: derniere ? derniere.cumul_mensuel : 0,
    annee_objectif: derniere ? derniere.annee : null,
    dans_horizon: !!derniere && derniere.cumul_mensuel >= objectif && derniere.annee <= horizon,
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
    surface: etape.surface || 60,
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
    metiers: [...new Set(exemples.map((c) => c.metier).filter(Boolean))],
  });
  if (!plan.ok) return plan;
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
