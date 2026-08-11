/**
 * FONCTIONS FINANCIÈRES
 */
function PMT(rate, nper, pv) {
  if (rate === 0) return -pv / nper;
  const pvif = Math.pow(1 + rate, nper);
  return -(rate * pv * pvif) / (pvif - 1);
}

function calculerCRD(tauxMensuel, dureeMois, montantEmprunt, moisPasses) {
  if (moisPasses <= 0) return montantEmprunt;
  if (moisPasses >= dureeMois) return 0;
  const v = Math.pow(1 + tauxMensuel, moisPasses);
  const vTotal = Math.pow(1 + tauxMensuel, dureeMois);
  return montantEmprunt * (vTotal - v) / (vTotal - 1);
}

/**
 * CALCUL DE LA SITUATION NETTE (Valeur - Dette + Cash accumulé)
 */
function calculerBilan(projets, anneeActuelle, cashDisponible, horizon) {
  let patrimoineBrut = 0;
  let detteTotale = 0;
  let cashflowMensuelActuel = 0;
  const tauxCredit = 0.037;
  const dureeCreditMois = 20 * 12;

  projets.forEach(p => {
    const anneesDepuisAchat = Math.max(0, anneeActuelle - p.annee_acquisition);
    const anneesJusquaHorizon = Math.max(0, horizon - p.annee_acquisition);
    const moisDetention = anneesJusquaHorizon * 12;

    // Valorisation des murs (+1.5% / an) à l'horizon
    const valeurBien = p.prix_acquisition * Math.pow(1.015, anneesJusquaHorizon);
    patrimoineBrut += valeurBien;

    // Dette restante à l'horizon
    const capitalEmprunte = p.prix_acquisition - p.apport;
    const crd = calculerCRD(tauxCredit / 12, dureeCreditMois, capitalEmprunte, moisDetention);
    detteTotale += crd;

    // Cashflow actuel (pour savoir si on peut racheter)
    const loyerMensuelActuel = (p.prix_acquisition * (p.rendement_net / 100) * Math.pow(1.02, anneesDepuisAchat)) / 12;
    const mensualite = Math.abs(PMT(tauxCredit / 12, dureeCreditMois, capitalEmprunte));
    
    cashflowMensuelActuel += (anneesDepuisAchat < 20) ? (loyerMensuelActuel - mensualite) : loyerMensuelActuel;
  });

  return {
    patrimoineNet: patrimoineBrut - detteTotale,
    cashflowActuel: cashflowMensuelActuel,
    patrimoineBrut,
    detteTotale
  };
}

/**
 * GÉNÉRATEUR DE STRATÉGIE (SANS PLAFOND BANCAIRE)
 */
export function genererStrategieInvestissement(params) {
  const { montantObjectif, horizon, epargneAnnuelle, apportInitial, budgetMin, budgetMax, profil } = params;

  const configs = {
    risk_taker: { rendement: 10, apport: 0.10, rythme: 1.5, nom: "Rendement Maximal", description: "Villes secondaires, immeubles, rendements élevés" },
    equilibre: { rendement: 7.5, apport: 0.20, rythme: 2, nom: "Croissance Équilibrée", description: "Villes moyennes, mix équilibré rendement/sécurité" },
    prudent: { rendement: 5.5, apport: 0.35, rythme: 3, nom: "Patrimoine Sécurisé", description: "Grandes villes, rendements modérés mais sécurisés" }
  };

  const config = configs[profil];
  const epargneMensuelle = epargneAnnuelle / 12;
  
  let projets = [];
  let anneeActuelle = 0;
  let capitalDisponible = apportInitial;
  let tentatives = 0;
  const MAX_TENTATIVES = 100;

  // Boucle : On achète dès qu'on a l'apport, jusqu'à l'objectif NET
  while (anneeActuelle < horizon && tentatives < MAX_TENTATIVES) {
    tentatives++;
    
    // Calcul de la situation projetée à l'année "Horizon"
    const situation = calculerBilan(projets, anneeActuelle, capitalDisponible, horizon);
    
    // Vérifier si objectif atteint
    if (situation.patrimoineNet >= montantObjectif) break;

    const prixProjet = (budgetMin + budgetMax) / 2;
    const fraisNotaire = prixProjet * 0.08;
    const apportCashRequis = (prixProjet * config.apport) + fraisNotaire;

    // Attente du capital (Épargne + Cashflow cumulé)
    const revenusMensuels = epargneMensuelle + Math.max(0, situation.cashflowActuel);
    
    if (capitalDisponible < apportCashRequis) {
      // Si on ne peut plus accumuler de capital, arrêter
      if (revenusMensuels <= 0) break;
      
      const moisAttente = (apportCashRequis - capitalDisponible) / revenusMensuels;
      const anneesAttente = moisAttente / 12;
      
      // Vérifier qu'on ne dépasse pas l'horizon
      if (anneeActuelle + anneesAttente >= horizon) break;
      
      anneeActuelle += anneesAttente;
      capitalDisponible += revenusMensuels * moisAttente;
    }

    if (anneeActuelle >= horizon) break;

    // Enregistrement de l'achat
    projets.push({
      annee_acquisition: Math.round(anneeActuelle * 10) / 10,
      prix_acquisition: prixProjet,
      rendement_net: config.rendement,
      apport: prixProjet * config.apport,
      description: `Actif ${projets.length + 1}`
    });

    capitalDisponible -= apportCashRequis;
    
    // Attendre le rythme minimum entre deux projets
    anneeActuelle += config.rythme;
  }

  const bilanFinal = calculerBilan(projets, horizon, capitalDisponible, horizon);

  return {
    nom: config.nom,
    description: config.description,
    profil: profil.charAt(0).toUpperCase() + profil.slice(1).replace('_', ' '),
    taux_apport: config.apport * 100,
    projets,
    patrimoineFinal: bilanFinal.patrimoineNet,
    cashflowFinal: bilanFinal.cashflowActuel,
    patrimoineBrut: bilanFinal.patrimoineBrut,
    detteTotale: bilanFinal.detteTotale,
    apportTotal: projets.reduce((sum, p) => sum + p.apport, 0),
    objectif_atteint: bilanFinal.patrimoineNet >= montantObjectif * 0.95
  };
}

export function genererToutesStrategies(params) {
  return {
    strategies: [
      genererStrategieInvestissement({ ...params, profil: "risk_taker" }),
      genererStrategieInvestissement({ ...params, profil: "equilibre" }),
      genererStrategieInvestissement({ ...params, profil: "prudent" })
    ]
  };
}