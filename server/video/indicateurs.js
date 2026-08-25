// Les quatre chiffres de la vidéo, calculés par le moteur du simulateur.
//
// Aucun calcul n'est réécrit ici : on appelle calculerTableauAnnuel, celui-là
// même qui alimente la page Simulateur et l'onglet du dossier. Un chiffre montré
// au client ne peut pas différer de celui que l'analyste a sous les yeux.
//
// Les hypothèses manquantes sont celles du simulateur (apport 15 %, 3,7 % sur
// 20 ans, indexation 2 %) — ce sont des hypothèses de travail, la vidéo le dit.

import { calculerTableauAnnuel } from '../../src/components/simulator/CalculFinancier.js';

// Mêmes valeurs de départ que le simulateur embarqué dans le dossier.
const DEFAUTS = {
  surface: 0,
  loyerInitialHTHC: 0,
  prixBienFAI: 0,
  prixBienNegocie: 0,
  loyerSoumisTVA: false,
  tauxTVA: 20,
  chargesCoproRefacturables: true,
  chargesCopropriete: 0,
  taxeFonciereRefacturable: true,
  taxeFonciere: 0,
  loyerRevalorise: 0,
  anneeRevalorisation: null,
  revalorisationActive: false,
  gestionLocative: 0,
  comptabilite: 600,
  chargesDiverses: 0,
  assurancePNE: 400,
  fraisDossierBancaire: 1000,
  fraisCourtage: 0,
  coutCreationSociete: 1000,
  tauxCommissionAgent: 5,
  commissionAgentType: 'pourcentage',
  commissionAgentActive: true,
  commissionAgentInclusFAI: true,
  tauxDroitsEnregistrement: 8,
  tauxFeesKlocka: 8,
  feesKlockaType: 'pourcentage',
  tauxIncentiveKlocka: 20,
  dureeCredit: 20,
  tauxInteret: 3.7,
  tauxAssuranceCredit: 0.25,
  pretInFine: false,
  renegociationActive: false,
  anneeRenegociation: 10,
  nouveauTauxRenegociation: 2.5,
  iraRenegociation: 0,
  indexation: 2,
  anneeRevente: 20,
  tauxCommissionAgentRevente: 5,
  rendementBrutAcheteur: 6.5,
  vacancesLocatives: Array(25).fill(0),
  travauxBailleur: Array(25).fill(0),
};

// Part d'apport retenue par défaut, comme dans le simulateur du dossier.
const PART_APPORT = 0.15;

/**
 * Rejoue la simulation avec d'autres hypothèses.
 *
 * C'est la même fonction que celle du simulateur, appelée avec d'autres
 * paramètres : « à 25 % d'apport sur 25 ans » se répond en une seconde, sans
 * ouvrir la page ni perdre le fil de ce qu'on faisait.
 *
 * @param {object} lot
 * @param {{prixNegocie?, apportPourcent?, taux?, duree?}} hypotheses
 */
export function simuler(lot, { prixNegocie, apportPourcent, taux, duree } = {}) {
  const params = { ...DEFAUTS, ...(lot?.simulateur || {}) };
  if (prixNegocie) params.prixBienNegocie = prixNegocie;
  if (taux) params.tauxInteret = taux;
  if (duree) params.dureeCredit = duree;

  const part = (apportPourcent != null ? apportPourcent : PART_APPORT * 100) / 100;
  const sansApport = calculerTableauAnnuel({ ...params, apport: 0 });
  const apport = Math.round(sansApport.prixRevient * part);
  const r = calculerTableauAnnuel({ ...params, apport });

  return {
    prix_negocie: params.prixBienNegocie,
    prix_revient: r.prixRevient,
    apport,
    apport_pourcent: Math.round(part * 100),
    rentabilite: r.prixRevient > 0 ? Math.round((params.loyerInitialHTHC / r.prixRevient) * 10000) / 100 : null,
    cashflow_mois: r.indicateurs.cashFlowMoyenMois,
    mensualite: r.echeanceMensuelle,
    emprunt: r.montantEmprunt,
    tri_brut: r.indicateurs.triBrut,
    // Les hypothèses accompagnent toujours le résultat : un chiffre sans elles
    // se prend pour une certitude.
    hypotheses: {
      apport: `${Math.round(part * 100)} %`,
      taux: `${String(params.tauxInteret).replace('.', ',')} %`,
      duree: `${params.dureeCredit} ans`,
    },
  };
}

/**
 * Prix de revient, apport nécessaire, rentabilité et cash-flow moyen.
 * @param {object} lot - un lot du dossier (porte `simulateur`)
 * @returns {object|null} null si le lot n'a ni prix ni loyer
 */
export function indicateursCles(lot) {
  const params = { ...DEFAUTS, ...(lot?.simulateur || {}) };
  if (!params.prixBienNegocie || !params.loyerInitialHTHC) return null;

  // L'apport se définit en part du prix de revient : on le calcule une première
  // fois sans apport pour connaître ce prix, puis on rejoue.
  const sansApport = calculerTableauAnnuel({ ...params, apport: 0 });
  const apport = Math.round(sansApport.prixRevient * PART_APPORT);
  const r = calculerTableauAnnuel({ ...params, apport });

  return {
    prix_revient: r.prixRevient,
    apport,
    // Rentabilité acte en main : le loyer sur ce que le bien coûte réellement.
    rentabilite: r.prixRevient > 0 ? (params.loyerInitialHTHC / r.prixRevient) * 100 : null,
    cashflow_mois: r.indicateurs.cashFlowMoyenMois,
    // Les hypothèses, pour que la vidéo puisse les afficher plutôt que de les taire.
    hypotheses: `apport ${Math.round(PART_APPORT * 100)} %, ${String(params.tauxInteret).replace('.', ',')} % sur ${params.dureeCredit} ans`,
  };
}
