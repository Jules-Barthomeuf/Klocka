// Le verdict sur le prix des murs (10 nov. 2026, Jules : « un dossier à Lyon demain, je veux savoir s'il est plutôt
// sur ou sous-évalué »).
//
// Deux mesures qui ne se doivent rien, puis un contrôle :
//   1. les ventes réelles autour (DVF, actes des notaires) : même rue d'abord, puis 300 m, puis 500 m ; surface de
//      la moitié au double ; les trois dernières années (cinq s'il le faut). Le prix au m² du bien face à leur
//      médiane, et sa place parmi elles ;
//   2. la capitalisation : loyer du bail ÷ taux de marché de la ville (les taux validés par l'équipe et les
//      mandataires, TauxBaseValide), ajusté par la grille de taux-rendement.js (bail, loyer face au marché) ;
//   3. le contrôle du loyer : un loyer au-dessus du marché fait paraître le rendement meilleur qu'il n'est.
// Le verdict : sous-évalué, dans le marché (± 10 %) ou surévalué, avec l'écart et une confiance qui dit combien de
// ventes comparables et si les deux mesures s'accordent. Sous cinq ventes, la comparaison ne juge pas.

import { Records } from '../db.js';
import { ajusterTaux, valeurParRendement, reperesAppris, villeDuTexte, lectureDuTaux } from '../taux-rendement.js';
import { quartiles, prixFaiDuLot, adresseDuLot } from './comparaison-marche.js';

const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? (c.absent === false || c.absent === undefined ? c.valeur : null) : c);
export const N_MINIMUM = 5;
// À 10 % près, c'est le bruit d'une négociation : « dans le marché ».
export const SEUIL_MARCHE = 10;
// Au-delà de 20 points d'écart entre les deux mesures, elles ne disent pas la même chose.
const DESACCORD = 20;
const ANNEE = 365.25 * 86400000;

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const ABREGES = { AV: 'AVENUE', BD: 'BOULEVARD', CRS: 'COURS', PL: 'PLACE', R: 'RUE', QU: 'QUAI', QUA: 'QUAI', CHE: 'CHEMIN', IMP: 'IMPASSE', PAS: 'PASSAGE', RTE: 'ROUTE', ALL: 'ALLEE', MTE: 'MONTEE', GR: 'GRANDE' };
const VIDES = new Set(['DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'L', 'D', 'ET']);

/** Pure : le nom de voie d'une adresse, sans numéro ni ville, pour reconnaître une même rue (« 22 RUE DE LA REPUBLIQUE » → « RUE REPUBLIQUE »). */
export function cleDeRue(adresse) {
  const avant = String(adresse || '').split(',')[0];
  const mots = sansAccents(avant).replace(/\b\d{5}\b.*$/, '').split(' ').filter(Boolean);
  while (mots.length && /^\d+[A-Z]?$|^(BIS|TER)$/.test(mots[0])) mots.shift();
  return mots.map((m) => ABREGES[m] || m).filter((m) => !VIDES.has(m)).join(' ') || null;
}

/**
 * Pure : les ventes comparables d'un bien, par cercles qui s'élargissent jusqu'à en avoir assez. ventes : celles de
 * DVF (date, adresse, surface, prix, prix_m2, distance_m). Rend { retenues, cercle, annees } ; retenues vide si aucun
 * cercle n'en a cinq.
 */
export function ventesComparables(ventes, { surface, rue, aujourdhui = new Date() } = {}) {
  const semblable = (v) => !(surface > 0) || (v.surface >= surface / 2 && v.surface <= surface * 2);
  const depuis = (ans) => (v) => v.date && aujourdhui - new Date(v.date) <= ans * ANNEE;
  const cercles = [
    { nom: 'même rue', garde: (v) => rue && cleDeRue(v.adresse) === rue && v.distance_m <= 500 },
    { nom: '300 m', garde: (v) => v.distance_m <= 300 },
    { nom: '500 m', garde: (v) => v.distance_m <= 500 },
  ];
  for (const ans of [3, 5]) {
    for (const c of cercles) {
      const retenues = (ventes || []).filter((v) => v.prix_m2 > 0 && semblable(v) && depuis(ans)(v) && c.garde(v));
      if (retenues.length >= N_MINIMUM) return { retenues, cercle: c.nom, annees: ans };
    }
  }
  return { retenues: [], cercle: null, annees: null };
}

const pct = (a, b) => Math.round(((a / b) - 1) * 100);

/** Pure : le mot du verdict pour un écart en %. */
export function motDuVerdict(ecart) {
  if (ecart == null) return null;
  if (ecart > 2 * SEUIL_MARCHE) return { mot: 'surévalué', sens: 'haut' };
  if (ecart > SEUIL_MARCHE) return { mot: 'légèrement surévalué', sens: 'haut' };
  if (ecart < -2 * SEUIL_MARCHE) return { mot: 'sous-évalué', sens: 'bas' };
  if (ecart < -SEUIL_MARCHE) return { mot: 'légèrement sous-évalué', sens: 'bas' };
  return { mot: 'dans le marché', sens: 'juste' };
}

/**
 * Pure : le verdict entier. bien : { prix, surface, loyer, echeance, bail_type, occupe } ; ventes : les ventes DVF
 * autour ; rue : cleDeRue de l'adresse ; taux : { base, source, nombre } ou null ; loyerMarcheM2 : { median, source }
 * ou null.
 */
export function calculerVerdict({ bien = {}, ventes = [], rue = null, taux = null, loyerMarcheM2 = null, aujourdhui = new Date() }) {
  const prix = Number(bien.prix) || null;
  const surface = Number(bien.surface) || null;
  const loyer = Number(bien.loyer) || null;
  const manque = [];
  if (!prix) manque.push('le prix demandé');
  if (!surface) manque.push('la surface');

  // 1. Les ventes réelles.
  let comparaison = null;
  if (prix && surface) {
    const c = ventesComparables(ventes, { surface, rue, aujourdhui });
    if (c.retenues.length) {
      const q = quartiles(c.retenues.map((v) => v.prix_m2));
      const prixM2 = Math.round(prix / surface);
      const moinsCheres = c.retenues.filter((v) => v.prix_m2 < prixM2).length;
      comparaison = {
        n: c.retenues.length, cercle: c.cercle, annees: c.annees, prix_m2: q, bien_m2: prixM2,
        valeur: Math.round((q.median * surface) / 1000) * 1000,
        ecart: pct(prix, q.median * surface),
        rang: Math.round((100 * moinsCheres) / c.retenues.length),
        ventes: [...c.retenues].sort((a, b) => a.distance_m - b.distance_m).slice(0, 12).map((v) => ({ date: v.date, adresse: v.adresse, surface: v.surface, prix: v.prix, prix_m2: v.prix_m2, distance_m: v.distance_m })),
      };
    } else manque.push(`cinq ventes comparables (DVF n'en a pas assez à 500 m sur cinq ans, de ${surface ? Math.round(surface / 2) : '?'} à ${surface ? Math.round(surface * 2) : '?'} m²)`);
  }

  // 2. La capitalisation.
  let capitalisation = null;
  if (prix && loyer && taux?.base > 0) {
    const loyerMarche = loyerMarcheM2?.median > 0 && surface ? loyerMarcheM2.median * surface : null;
    const a = ajusterTaux(taux.base, { occupe: true, echeance: bien.echeance, loyer_annuel_hc: loyer, profil_locataire: bien.profil_locataire }, { loyerMarche, aujourdhui });
    const v = valeurParRendement({ loyer, taux: a.taux });
    capitalisation = { ...v, taux: a.taux, taux_base: a.taux_base, ajustements: a.ajustements, lecture: lectureDuTaux(a), source_taux: taux.source, ecart: pct(prix, v.moyenne), rendement_affiche: Math.round((loyer / prix) * 10000) / 100 };
  } else if (prix && !loyer) manque.push('le loyer (bien libre ou loyer absent : pas de capitalisation)');
  else if (prix && loyer) manque.push('un taux de marché pour la ville (aucun taux validé)');

  // 3. Le loyer face au marché.
  let controleLoyer = null;
  if (loyer && surface && loyerMarcheM2?.median > 0) {
    const m2 = Math.round(loyer / surface);
    const e = pct(m2, loyerMarcheM2.median);
    controleLoyer = {
      loyer_m2: m2, marche_m2: loyerMarcheM2.median, ecart: e, source: loyerMarcheM2.source || null,
      alerte: e > 15 ? `Le loyer (${m2} €/m²/an) dépasse le marché de ${e} % : le rendement affiché flatte le bien, et le loyer risque de baisser au renouvellement.` : e < -15 ? `Le loyer est ${-e} % sous le marché : potentiel de hausse.` : null,
    };
  }

  // Le verdict.
  const ecarts = [comparaison?.ecart, capitalisation?.ecart].filter((x) => x != null);
  const ecart = ecarts.length ? Math.round(ecarts.reduce((s, x) => s + x, 0) / ecarts.length) : null;
  const mot = motDuVerdict(ecart);
  let confiance = null;
  let pourquoi = '';
  if (ecarts.length === 2) {
    const d = Math.abs(comparaison.ecart - capitalisation.ecart);
    const memeSens = motDuVerdict(comparaison.ecart).sens === motDuVerdict(capitalisation.ecart).sens;
    if (d > DESACCORD && !memeSens) { confiance = 'basse'; pourquoi = 'les ventes réelles et la capitalisation ne disent pas la même chose'; }
    else if (comparaison.n >= 8 && (memeSens || d <= 10)) {
      confiance = taux?.nombre >= 5 ? 'haute' : 'moyenne';
      pourquoi = `les deux mesures s'accordent${taux?.nombre >= 5 ? '' : taux?.nombre ? ' ; le taux de la ville repose sur peu de validations' : ' ; le taux est donné à la main'}`;
    }
    else { confiance = 'moyenne'; pourquoi = comparaison.n < 8 ? 'peu de ventes comparables' : 'les deux mesures s\'accordent à peu près'; }
  } else if (ecarts.length === 1) {
    confiance = comparaison && comparaison.n >= 10 ? 'moyenne' : 'basse';
    pourquoi = comparaison ? 'les ventes réelles seules, sans capitalisation' : 'la capitalisation seule, sans ventes comparables';
  }
  if (controleLoyer?.alerte && controleLoyer.ecart > 15 && confiance === 'haute') confiance = 'moyenne';

  return {
    verdict: mot ? { ...mot, ecart, confiance, pourquoi } : null,
    bien: { prix, surface, loyer, prix_m2: prix && surface ? Math.round(prix / surface) : null, rendement: prix && loyer ? Math.round((loyer / prix) * 10000) / 100 : null },
    comparaison, capitalisation, controle_loyer: controleLoyer, manque,
  };
}

/** Le taux de marché d'une ville : la médiane des taux validés (hors essais), ou un taux donné par la personne. */
export function tauxDeLaVille(ville, tauxDonne = null) {
  if (Number(tauxDonne) > 0) return { base: Number(tauxDonne), source: 'donné à la main pour ce calcul', nombre: null };
  const r = reperesAppris(Records.list('TauxBaseValide'), ville);
  const t = r.taux_valides_ville;
  return t?.mediane > 0 ? { base: t.mediane, source: `médiane de ${t.nombre} taux validé${t.nombre > 1 ? 's' : ''} à ${ville} (avis de l'équipe et des mandataires, pas des ventes)`, nombre: t.nombre } : null;
}

/** Le verdict d'une adresse et de chiffres donnés (sans dossier). */
export async function verdictPrixAdresse({ adresse, prix, surface, loyer, echeance = null, taux = null, loyerMarcheM2 = null, user = null }) {
  const { ventesAutour } = await import('../dvf.js');
  const d = await ventesAutour(adresse, { rayon: 500, user });
  const ville = d.ok ? d.resultat.commune : villeDuTexte(adresse);
  const r = calculerVerdict({
    bien: { prix, surface, loyer, echeance },
    ventes: d.ok ? d.resultat.ventes : [],
    rue: cleDeRue(d.ok ? d.resultat.adresse : adresse),
    taux: tauxDeLaVille(ville, taux),
    loyerMarcheM2,
  });
  return { ok: true, adresse: d.ok ? d.resultat.adresse : adresse, ville, dvf_erreur: d.ok ? null : d.error, lien_dvf: d.ok ? d.resultat.lien : null, ...r, le: new Date().toISOString() };
}

/** Le verdict d'un lot de dossier : ses chiffres, son adresse, le loyer de marché déjà lu par la comparaison. */
export async function verdictPrixDossier(deal, index = 0, { taux = null, user = null } = {}) {
  const entree = deal?.lots?.[index];
  if (!entree) return { ok: false, error: 'Lot introuvable' };
  const { comparerAuMarche } = await import('./comparaison-marche.js');
  const c = await comparerAuMarche(deal, index).catch(() => null);
  const adresse = c?.adresse || adresseDuLot(entree);
  if (!adresse) return { ok: false, error: "Ce dossier n'a ni adresse ni quartier situable : pas de marché à comparer." };
  const lot = entree.lot || {};
  const loyerLu = c?.loyer?.median > 0 ? { median: c.loyer.median, source: c.loyer.source } : null;
  const r = await verdictPrixAdresse({
    adresse,
    prix: prixFaiDuLot(lot),
    surface: Number(val(lot.surface_m2)) || null,
    loyer: val(lot.occupe) === false ? null : Number(val(lot.loyer_annuel_ht_hc)) || null,
    echeance: val(lot.bail_echeance) || null,
    taux,
    loyerMarcheM2: loyerLu,
    user,
  });
  return { ...r, approche: c?.approche || null };
}
