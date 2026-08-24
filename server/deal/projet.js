// Création d'un Project pré-rempli depuis un deal de préanalyse.
//
// Le mapping simulateur suit EXACTEMENT la lecture faite par
// SimulateurRentabilite.jsx (useEffect sur selectedProject) : mêmes noms
// sim_*, mêmes conventions de défauts — pour que le simulateur complet
// affiche les mêmes chiffres que le SimulateurRapide du deal.

import { Records } from '../db.js';
import { changerStatut } from './lifecycle.js';
import { patchDepuisExtractions } from './donnees-projet.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

// lot.simulateur (camelCase, aem.js:parametresSimulateur) → champs sim_* du Project.
function mapperSimulateur(sim = {}) {
  const prixFai = sim.prixBienFAI || 0;
  return {
    sim_prix_bien_fai: prixFai,
    sim_prix_bien_negocie: sim.prixBienNegocie || prixFai,
    sim_loyer_initial_ht: sim.loyerInitialHTHC || 0,
    sim_surface: sim.surface || 0,
    sim_droits_enregistrement: sim.tauxDroitsEnregistrement ?? 8,
    sim_fees_klocka: sim.tauxFeesKlocka ?? 8,
    sim_fees_klocka_type: sim.feesKlockaType || 'pourcentage',
    sim_incentive_klocka: sim.tauxIncentiveKlocka ?? 20,
    sim_commission_agent: sim.tauxCommissionAgent ?? 5,
    sim_commission_agent_type: 'pourcentage',
    sim_commission_agent_inclus_fai: sim.commissionAgentInclusFAI !== false,
    sim_frais_dossier_bancaire: sim.fraisDossierBancaire ?? 1000,
    sim_cout_creation_societe: sim.coutCreationSociete ?? 1000,
    sim_frais_courtage: sim.fraisCourtage ?? 0,
    // Hypothèses de départ, identiques au SimulateurRapide du deal.
    sim_apport: prixFai ? Math.round(prixFai * 0.15) : 0,
    sim_duree_credit: 20,
    sim_taux_interet: 3.7,
    sim_taux_assurance: 0.25,
    sim_indexation_loyers: 2,
    sim_annee_revente: 20,
    sim_commission_agent_revente: 5,
    sim_rendement_capital: 6.5,
    sim_comptabilite: 600,
    sim_assurance_pne: 400,
    sim_taux_tva: 20,
    sim_frais_divers_acquisition: 2000,
  };
}

// Données de marché : reprise de la base DonneeMarche si une entrée existe
// pour la ville (alimentée par les refus précédents ou saisie à la main).
function mapperMarche(ville, codePostal) {
  if (!ville) return {};
  const entree =
    Records.filter('DonneeMarche', { ville, code_postal: codePostal || '' })[0] ||
    Records.filter('DonneeMarche', { ville })[0];
  if (!entree) return {};
  const n = (x) => (x == null ? 0 : x);
  return {
    marche_prix_m2_bas: n(entree.prix_m2_bas),
    marche_prix_m2_median: n(entree.prix_m2_median),
    marche_prix_m2_haut: n(entree.prix_m2_haut),
    marche_evolution_1an: n(entree.evolution_1an),
    marche_evolution_5ans: n(entree.evolution_5ans),
    marche_offre_bas: n(entree.offre_bas),
    marche_offre_moyenne: n(entree.offre_moyenne),
    marche_offre_haut: n(entree.offre_haut),
    marche_baux_bas: n(entree.baux_bas),
    marche_baux_moyenne: n(entree.baux_moyenne),
    marche_baux_haut: n(entree.baux_haut),
    marche_quartier_nom: entree.secteur || '',
  };
}

/**
 * Crée le Project pré-rempli et passe le deal en `projet_cree`.
 * @returns {{ ok: true, project } | { ok: false, error }}
 */
export function creerProjetDepuisDeal(dealId, lotIndex, user) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return { ok: false, error: 'Dossier introuvable' };
  if (deal.projet_id) return { ok: false, error: 'Un projet existe déjà pour ce deal.', project_id: deal.projet_id };
  const lot = deal.lots?.[Number(lotIndex)] || deal.lots?.[0];
  if (!lot) return { ok: false, error: 'Lot introuvable' };

  const adresse = val(lot.lot.adresse) || {};
  const commune = lot.enrichissement?.commune;
  const ville = commune?.nom || adresse.ville || '';
  const adresseComplete = [adresse.rue, [adresse.code_postal, ville].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');

  // Tous les admins voient le projet, comme dans l'éditeur AdminProjets.
  const adminEmails = Records.filter('User', { role: 'admin' })
    .map((u) => u.email)
    .filter(Boolean);

  const projet = {
    // Un projet issu d'un deal de test est marqué pour être repérable (et
    // supprimé avec le deal).
    titre: `${deal.test ? '[TEST] ' : ''}${lot.synthese?.titre || `Deal ${ville || dealId.slice(0, 8)}`}`,
    statut: 'analyse',
    archived: false,
    admin_principal: user?.email || adminEmails[0] || null,
    client_email: '',
    client_emails: [...new Set([...(adminEmails || []), user?.email].filter(Boolean))],

    adresse_complete: adresseComplete,
    ville_secteur_champ1: ville,
    latitude: commune?.centre?.lat ?? null,
    longitude: commune?.centre?.lon ?? null,
    surface_m2: val(lot.lot.surface_m2) ?? 0,
    prix_acquisition: val(lot.lot.prix_fai) ?? 0,
    rendement_locatif: val(lot.lot.rendement_annonce) ?? 0,
    loyer_annuel_ht: val(lot.lot.loyer_annuel_ht_hc) ?? 0,
    nom_locataire: val(lot.lot.locataire_nom) || '',
    activite_locataire: lot.enrichissement?.activite?.libelle || val(lot.lot.locataire_activite) || '',
    echeance_bail: val(lot.lot.bail_echeance) || '',
    statut_bail: val(lot.lot.occupe) === false ? 'vacant' : 'en_cours',
    bien_champ1: val(lot.lot.type_actif) || 'Local commercial',
    bien_champ2: val(lot.lot.surface_m2) ? `${val(lot.lot.surface_m2)} m²` : '',
    bien_champ3: '',
    secteur_revenu_median: lot.enrichissement?.revenu_median ?? null,
    // Contexte web sourcé : point de départ éditable, marqué comme généré.
    description_secteur: lot.contexte_marche?.resume
      ? `${lot.contexte_marche.resume}\n\n(Généré avec recherche web — à relire.)`
      : '',
    analyse_bail: lot.synthese?.synthese || '',

    ...mapperSimulateur(lot.simulateur),
    ...mapperMarche(ville, adresse.code_postal),

    // Traçabilité et suivi client (toggles à plat).
    deal_id: deal.deal_id,
    suivi_message_envoye: false,
    suivi_retour_client: null,

    photos: [],
    documents: [],
    fichiers_projet: [],
    docs_checklist: {},
  };

  // Le dépouillement des documents complète la fiche : bail, copropriété,
  // diagnostics, TVA. Il ne réécrit jamais ce que la préanalyse a déjà posé.
  const { patch, remplis } = patchDepuisExtractions(deal, projet);
  Object.assign(projet, patch);

  const cree = Records.create('Project', projet, user?.email);
  Records.update('Deal', deal.id, { projet_id: cree.id });
  changerStatut({ ...deal, projet_id: cree.id }, 'projet_cree', {
    user,
    note: `Projet créé : ${projet.titre}`,
  });

  return { ok: true, project: cree, champs_remplis: remplis };
}
