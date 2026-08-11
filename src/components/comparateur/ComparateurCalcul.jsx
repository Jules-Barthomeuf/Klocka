// Shared calculation engine for project comparison
export function calculateProjectMetrics(project) {
  const prixBienNegocie = project.sim_prix_bien_negocie || 0;
  const prixBienFAI = project.sim_prix_bien_fai || prixBienNegocie;
  const tauxDroitsEnregistrement = project.sim_droits_enregistrement || 8;
  const tauxFeesKlocka = project.sim_fees_klocka || 8;
  const feesKlockaType = project.sim_fees_klocka_type || "pourcentage";
  const tauxIncentiveKlocka = project.sim_incentive_klocka || 20;

  const droitsEnregistrement = prixBienNegocie * (tauxDroitsEnregistrement / 100);
  const feesKlocka = feesKlockaType === "fixe" ? tauxFeesKlocka : prixBienNegocie * (tauxFeesKlocka / 100);
  const incentiveKlocka = (prixBienFAI - prixBienNegocie) * (tauxIncentiveKlocka / 100);
  const totalFraisKlocka = feesKlocka + incentiveKlocka;
  const fraisDivers = (project.sim_frais_dossier_bancaire || 0) + (project.sim_cout_creation_societe || 0) + (project.sim_frais_courtage || 0);

  const prixRevient = prixBienNegocie > 0
    ? prixBienNegocie + droitsEnregistrement + totalFraisKlocka + fraisDivers
    : project.sim_prix_revient || project.prix_acquisition || 0;

  const loyerAnnuel = project.sim_loyer_initial_ht || 0;
  const anneeRevente = project.sim_annee_revente || 20;
  const apport = (project.sim_apport != null && project.sim_apport > 0) ? project.sim_apport : Math.round(prixRevient * 0.15);
  const indexation = project.sim_indexation_loyers || 2;
  const dureeCredit = project.sim_duree_credit || 20;
  const tauxInteret = project.sim_taux_interet || 3.7;
  const tauxAssuranceCredit = project.sim_taux_assurance || 0.25;
  const rendementBrutAcheteur = project.sim_rendement_capital || 6.5;
  const tauxCommissionAgentRevente = project.sim_commission_agent_revente || 5;
  const comptabilite = project.sim_comptabilite || 600;
  const assurancePNE = project.sim_assurance_pne || 400;
  const chargesDiverses = project.sim_charges_diverses || 0;
  const gestionLocative = project.sim_gestion_locative || 0;
  const chargesCopropriete = project.sim_charges_copropriete || 0;
  const chargesCoproRefacturables = project.sim_charges_refacturable !== false;
  const taxeFonciere = project.sim_taxe_fonciere || 0;
  const taxeFonciereRefacturable = project.sim_taxe_refacturable !== false;

  // rendementLocatifNet sera calculé comme la moyenne des rendements nets annuels (comme le simulateur)
  // Calculé après la boucle
  const rendementsNetsParAnnee = [];

  function PMT(rate, nper, pv) {
    if (rate === 0) return -pv / nper;
    const pvif = Math.pow(1 + rate, nper);
    return -(rate * pv * pvif) / (pvif - 1);
  }

  const montantEmprunt = prixRevient - apport;
  const echeanceMensuelle = montantEmprunt > 0 ? Math.abs(PMT((tauxInteret / 100) / 12, dureeCredit * 12, montantEmprunt)) : 0;

  // Simulation year by year
  let cashFlowCumule = 0;
  let capitalRestantDu = montantEmprunt;
  let loyerAnnuelCourant = loyerAnnuel;
  let loyerNetRevente = 0;
  let totalLoyersNets = 0;
  let anneeRecuperationApport = null;
  let cumulRecuperationApport = 0;
  const cashflowParAnnee = [];
  const richesseCumuleeParAnnee = [];
  let capitalCumule = 0;

  for (let annee = 1; annee <= anneeRevente; annee++) {
    if (annee > 1) {
      loyerAnnuelCourant = loyerAnnuelCourant * (1 + indexation / 100);
    }

    const chargesCoproNonRefact = !chargesCoproRefacturables ? -chargesCopropriete : 0;
    const taxeFonciereNonRefact = !taxeFonciereRefacturable ? -taxeFonciere : 0;
    const loyersNetsCashFlow = loyerAnnuelCourant + chargesCoproNonRefact + taxeFonciereNonRefact;
    totalLoyersNets += loyersNetsCashFlow;
    if (prixRevient > 0) {
      rendementsNetsParAnnee.push(loyersNetsCashFlow / prixRevient * 100);
    }

    if (annee === anneeRevente) loyerNetRevente = loyersNetsCashFlow;

    let interetsAnnuels = 0;
    let capitalRembourseAnnuel = 0;
    let capitalTemp = capitalRestantDu;

    if (capitalTemp > 0 && annee <= dureeCredit) {
      const tauxMensuel = (tauxInteret / 100) / 12;
      for (let mois = 0; mois < 12; mois++) {
        if (capitalTemp <= 0) break;
        const interetMois = capitalTemp * tauxMensuel;
        interetsAnnuels += interetMois;
        const capitalMois = echeanceMensuelle - interetMois;
        capitalRembourseAnnuel += capitalMois;
        capitalTemp -= capitalMois;
      }
      capitalRestantDu = Math.max(0, capitalRestantDu - capitalRembourseAnnuel);
    }

    const assuranceCreditAnnuel = annee <= dureeCredit ? -(montantEmprunt * (tauxAssuranceCredit / 100)) : 0;
    const creditBancaireCashFlow = -(interetsAnnuels + capitalRembourseAnnuel + Math.abs(assuranceCreditAnnuel));
    const gestionLocativeCost = -(loyersNetsCashFlow * (gestionLocative / 100));
    const totalCharges = gestionLocativeCost - comptabilite - assurancePNE - chargesDiverses;
    const cashFlowAnnuel = loyersNetsCashFlow + creditBancaireCashFlow + totalCharges;

    cashFlowCumule += cashFlowAnnuel;
    capitalCumule += Math.abs(capitalRembourseAnnuel);

    cumulRecuperationApport += cashFlowAnnuel + Math.abs(capitalRembourseAnnuel);
    if (cumulRecuperationApport >= apport && !anneeRecuperationApport) {
      anneeRecuperationApport = annee;
    }

    cashflowParAnnee.push({ annee, cashflow: Math.round(cashFlowAnnuel), cashflowCumule: Math.round(cashFlowCumule) });
    richesseCumuleeParAnnee.push({ annee, richesse: Math.round(cashFlowCumule + capitalCumule) });
  }

  const prixVenteFAI = rendementBrutAcheteur > 0 ? loyerNetRevente / (rendementBrutAcheteur / 100) : 0;
  const commissionAgentRevente = prixVenteFAI * (tauxCommissionAgentRevente / 100);
  const prixVenteNet = prixVenteFAI - commissionAgentRevente;
  const creationRichesse = cashFlowCumule + prixVenteNet - apport - capitalRestantDu;
  const loyerMoyenNet = anneeRevente > 0 ? totalLoyersNets / anneeRevente : 0;

  // Rendement locatif net = moyenne des rendements nets annuels (comme le simulateur)
  const rendementLocatifNet = rendementsNetsParAnnee.length > 0
    ? rendementsNetsParAnnee.reduce((sum, r) => sum + r, 0) / rendementsNetsParAnnee.length
    : 0;

  // Rendement locatif global net = moyenne des rendements nets annuels (même calcul que le simulateur)
  const rendementLocatifGlobal = rendementLocatifNet;

  // Ancienneté locataire
  let ancienneteLocataire = null;
  if (project.locataire_depuis) {
    const debut = new Date(project.locataire_depuis);
    const now = new Date();
    ancienneteLocataire = Math.round((now - debut) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10;
  }

  // Échéance bail
  let echeanceBail = project.echeance_bail || project.bail_date_echeance || null;

  return {
    titre: project.titre,
    id: project.id,
    statut: project.statut,
    adresse: project.adresse_complete,
    photo: project.photos?.[0] || null,
    surface: project.sim_surface || project.surface_m2 || 0,
    prixRevient,
    prixBienNegocie,
    loyerAnnuel,
    rendementLocatifNet,
    rendementLocatifGlobal,
    apport,
    anneeRecuperationApport,
    cashFlowCumule,
    creationRichesse,
    loyerMoyenNet,
    echeanceBail,
    nomLocataire: project.nom_locataire || '',
    activiteLocataire: project.activite_locataire || '',
    ancienneteLocataire,
    anneeRevente,
    cashflowParAnnee,
    richesseCumuleeParAnnee,
    echeanceMensuelle,
    montantEmprunt,
    dureeCredit,
    tauxInteret,
    latitude: project.latitude || null,
    longitude: project.longitude || null,
    prixVenteNet,
    multipleFondsPropres: apport > 0 ? creationRichesse / apport : 0,
  };
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(value || 0));
}