// BLOC 2 (2/3) — Prix AEM et rendement réel.
//
// La fiche annonce un prix FAI et souvent un rendement calculé dessus. Ce
// rendement n'est pas celui qui nous intéresse : nous raisonnons en AEM (acte en
// main), c'est-à-dire sur le prix de revient complet, droits d'enregistrement et
// honoraires compris. L'écart est structurellement de l'ordre d'un point.
//
// Les taux viennent de rules.json et reprennent les valeurs par défaut du
// simulateur Klocka, pour que préanalyse et simulation racontent la même chose.

import { REGLES } from './enrich.js';

const P = () => REGLES.parametres_aem || {};

/**
 * Calcule le prix de revient (AEM) et les rendements.
 *
 * Au stade de la préanalyse aucune négociation n'a eu lieu : le prix négocié est
 * donc pris égal au prix FAI, ce qui annule mécaniquement l'incentive. Le
 * paramètre prixNegocie permet de rejouer le calcul après négociation.
 *
 * @param {object} opts
 * @param {number} opts.prixFai
 * @param {number} [opts.prixNegocie] - défaut : prixFai
 * @param {number} [opts.loyerAnnuel]
 * @param {number} [opts.travaux]
 * @returns {object|null}
 */
export function calculerAEM({ prixFai, prixNegocie, loyerAnnuel, travaux = 0 } = {}) {
  const p = P();
  if (!prixFai || prixFai <= 0) return null;

  const negocie = prixNegocie && prixNegocie > 0 ? prixNegocie : prixFai;

  // Honoraires d'agence : par défaut inclus dans le prix FAI, donc déduits pour
  // obtenir l'assiette des droits d'enregistrement.
  const honorairesAgence = negocie * ((p.taux_commission_agent ?? 0) / 100);
  const inclusFai = p.commission_agent_incluse_fai !== false;
  const prixHorsDroits = inclusFai ? negocie - honorairesAgence : negocie;

  const droitsEnregistrement = prixHorsDroits * ((p.taux_droits_enregistrement ?? 0) / 100);
  const feesKlocka = negocie * ((p.taux_fees_klocka ?? 0) / 100);
  const incentiveKlocka = Math.max(0, (prixFai > 0 ? prixFai : negocie) - negocie) * ((p.taux_incentive_klocka ?? 0) / 100);
  const fraisDivers =
    (p.frais_dossier_bancaire ?? 0) + (p.cout_creation_societe ?? 0) + (p.frais_courtage ?? 0);

  const prixAem =
    negocie +
    droitsEnregistrement +
    feesKlocka +
    incentiveKlocka +
    fraisDivers +
    (travaux || 0) +
    (inclusFai ? 0 : honorairesAgence);

  const rendementAem = loyerAnnuel > 0 ? (loyerAnnuel / prixAem) * 100 : null;
  const rendementFai = loyerAnnuel > 0 ? (loyerAnnuel / prixFai) * 100 : null;

  const arrondi = (n) => (n == null ? null : Math.round(n));
  const arrondi2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

  return {
    prix_fai: arrondi(prixFai),
    prix_negocie: arrondi(negocie),
    honoraires_agence: arrondi(honorairesAgence),
    prix_hors_droits: arrondi(prixHorsDroits),
    droits_enregistrement: arrondi(droitsEnregistrement),
    fees_klocka: arrondi(feesKlocka),
    incentive_klocka: arrondi(incentiveKlocka),
    frais_divers: arrondi(fraisDivers),
    travaux: arrondi(travaux || 0),
    prix_aem: arrondi(prixAem),
    surcout_vs_fai: arrondi(prixAem - prixFai),
    rendement_aem: arrondi2(rendementAem),
    rendement_fai: arrondi2(rendementFai),
    // Détail des taux appliqués, pour que l'affichage puisse les justifier.
    taux: {
      droits_enregistrement: p.taux_droits_enregistrement ?? 0,
      fees_klocka: p.taux_fees_klocka ?? 0,
      incentive_klocka: p.taux_incentive_klocka ?? 0,
      commission_agent: p.taux_commission_agent ?? 0,
    },
  };
}

/**
 * Paramètres de départ du simulateur, pré-remplis avec le dossier.
 * Les noms correspondent aux états de la page SimulateurRentabilite.
 */
export function parametresSimulateur({ prixFai, loyerAnnuel, surface }) {
  const p = P();
  return {
    prixBienFAI: prixFai ?? 0,
    prixBienNegocie: prixFai ?? 0,
    loyerInitialHTHC: loyerAnnuel ?? 0,
    surface: surface ?? 0,
    tauxDroitsEnregistrement: p.taux_droits_enregistrement ?? 8,
    tauxFeesKlocka: p.taux_fees_klocka ?? 8,
    feesKlockaType: 'pourcentage',
    tauxIncentiveKlocka: p.taux_incentive_klocka ?? 20,
    tauxCommissionAgent: p.taux_commission_agent ?? 5,
    commissionAgentInclusFAI: p.commission_agent_incluse_fai !== false,
    fraisDossierBancaire: p.frais_dossier_bancaire ?? 1000,
    coutCreationSociete: p.cout_creation_societe ?? 1000,
    fraisCourtage: p.frais_courtage ?? 0,
  };
}
