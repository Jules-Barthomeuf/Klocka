// Création d'un Project pré-rempli depuis un deal de préanalyse.
//
// Le mapping simulateur suit EXACTEMENT la lecture faite par
// SimulateurRentabilite.jsx (useEffect sur selectedProject) : mêmes noms
// sim_*, mêmes conventions de défauts — pour que le simulateur complet
// affiche les mêmes chiffres que le SimulateurRapide du deal.

import { Records } from '../db.js';
import { changerStatut } from './lifecycle.js';
import { lotOuVide } from './index.js';
import { patchDepuisExtractions } from './donnees-projet.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

// lot.simulateur (camelCase, aem.js:parametresSimulateur) → champs sim_* du Project.
function mapperSimulateur(sim) {
  sim = sim || {};
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
    sim_taux_interet: 3.9,
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
function mapperMarche(ville, codePostal, chiffres = null) {
  if (!ville) return {};
  const entree =
    Records.filter('DonneeMarche', { ville, code_postal: codePostal || '' })[0] ||
    Records.filter('DonneeMarche', { ville })[0];
  // Les chiffres relevés dans le point de marché servent de fond de carte : la
  // base garde le dernier mot partout où elle a une valeur, et ne laisse plus
  // une case vide là où le point de marché en donne une. Mieux vaut une case
  // remplie et sourcée qu'un paragraphe que personne ne lit.
  const repli = chiffres ? mapperChiffres(chiffres) : {};
  if (!entree) return repli;
  // Une valeur absente de la base (null ou 0) laisse passer celle du repli.
  const paires = [
    ['marche_prix_m2_bas', entree.prix_m2_bas],
    ['marche_prix_m2_median', entree.prix_m2_median],
    ['marche_prix_m2_haut', entree.prix_m2_haut],
    ['marche_evolution_1an', entree.evolution_1an],
    ['marche_evolution_5ans', entree.evolution_5ans],
    ['marche_offre_bas', entree.offre_bas],
    ['marche_offre_moyenne', entree.offre_moyenne],
    ['marche_offre_haut', entree.offre_haut],
    ['marche_baux_bas', entree.baux_bas],
    ['marche_baux_moyenne', entree.baux_moyenne],
    ['marche_baux_haut', entree.baux_haut],
  ];
  const deLaBase = {};
  for (const [cle, v] of paires) if (v != null && v !== 0) deLaBase[cle] = v;
  return {
    ...repli,
    ...deLaBase,
    marche_quartier_nom: entree.secteur || repli.marche_quartier_nom || '',
  };
}

// Data-B donne le loyer de la rue, du quartier et de la ville, en € HT HC par
// m² et par an — l'unité même des cases « Offre actuelle ». On ne remplit que
// ce qui est encore vide.
function mapperValeurLocative(vl, deja = {}) {
  if (!vl?.rue) return {};
  const vide = (cle) => !deja[cle];
  const r = vl.rue;
  const sortie = {};
  if (r.basse > 0 && vide('marche_offre_bas')) sortie.marche_offre_bas = r.basse;
  if (r.haute > 0 && vide('marche_offre_haut')) sortie.marche_offre_haut = r.haute;
  if (r.basse > 0 && r.haute > 0 && vide('marche_offre_moyenne')) sortie.marche_offre_moyenne = Math.round((r.basse + r.haute) / 2);
  if (vl.quartier?.nom && vide('marche_quartier_nom')) sortie.marche_quartier_nom = String(vl.quartier.nom).slice(0, 120);
  return sortie;
}

// Les chiffres du point de marché, rangés dans les cases de la fiche. Un zéro
// veut dire « le texte ne le dit pas » : le formulaire laisse la case vide.
function mapperChiffres(c) {
  const n = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
  return {
    marche_prix_m2_bas: n(c.prix_m2_bas),
    marche_prix_m2_median: n(c.prix_m2_median),
    marche_prix_m2_haut: n(c.prix_m2_haut),
    marche_evolution_1an: Number.isFinite(c.evolution_1an) ? c.evolution_1an : 0,
    marche_evolution_5ans: Number.isFinite(c.evolution_5ans) ? c.evolution_5ans : 0,
    marche_offre_bas: n(c.loyer_offre_bas),
    marche_offre_moyenne: n(c.loyer_offre_moyen),
    marche_offre_haut: n(c.loyer_offre_haut),
    marche_baux_bas: n(c.loyer_baux_bas),
    marche_baux_moyenne: n(c.loyer_baux_moyen),
    marche_baux_haut: n(c.loyer_baux_haut),
    marche_quartier_nom: String(c.quartier || '').slice(0, 120),
  };
}

/**
 * Détache un projet supprimé de son dossier, et rouvre le dossier là où il en
 * était. Sans cela, le dossier reste marqué « projet créé » en pointant un
 * projet disparu, et on ne peut plus le faire entrer dans la plateforme.
 *
 * L'écriture est directe : `projet_cree` est un statut terminal, aucune
 * transition n'en sort — c'est voulu pour le parcours normal, mais la
 * suppression d'un projet n'est pas le parcours normal.
 *
 * @param {string} projectId
 * @returns {{deal_id: string, statut: string}|null} le dossier rouvert
 */
export function delierProjet(projectId, user = null) {
  if (!projectId) return null;
  const deal = Records.filter('Deal', { projet_id: projectId })[0];
  if (!deal) return null;
  // On revient à l'étape réellement atteinte, pas à zéro : les pièces lues et
  // la pré-analyse restent acquises.
  const statut = (deal.extractions || []).length || deal.matrice?.lignes?.length
    ? 'depouille'
    : (deal.documents_espace || []).length
    ? 'documents_recus'
    : 'analyse';
  Records.update('Deal', deal.id, {
    projet_id: null,
    statut,
    archived: false,
    suivi: [
      ...(deal.suivi || []),
      {
        le: new Date().toISOString(),
        par: user?.email || null,
        type: 'projet_supprime',
        de: 'projet_cree',
        vers: statut,
        detail: 'Projet supprimé : le dossier peut de nouveau entrer dans la plateforme.',
      },
    ],
  });
  return { deal_id: deal.deal_id, statut };
}

/**
 * Complète ce qui manque au dossier avant d'en faire un projet.
 *
 * Les dossiers analysés avant que la commune porte son département et sa
 * région, ou avant que le point de marché soit chiffré, n'ont pas de quoi
 * remplir les cases de la fiche. On va chercher ce qui manque ici, une fois,
 * plutôt que de laisser l'utilisateur ressaisir ce qui est public.
 * Jamais bloquant : ce qui échoue laisse simplement la case vide.
 */
export async function completerAvantProjet(dealId, lotIndex = 0) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal || deal.projet_id) return;
  const lots = [...(deal.lots || [])];
  const lot = lots[lotIndex];
  if (!lot) return;
  let change = false;

  // Département et région de la commune.
  const commune = lot.enrichissement?.commune;
  if (commune?.nom && commune.departement === undefined) {
    try {
      const { resoudreCommune } = await import('./enrich.js');
      const a = val(lot.lot?.adresse) || {};
      const frais = await resoudreCommune(a.code_postal, commune.nom);
      if (frais?.departement) {
        lots[lotIndex] = { ...lot, enrichissement: { ...lot.enrichissement, commune: { ...commune, ...frais } } };
        change = true;
      }
    } catch { /* la case restera vide */ }
  }

  // Chiffres du marché, quand le point de marché n'a que sa prose.
  const contexte = lots[lotIndex].contexte_marche;
  if (contexte?.resume && !contexte.chiffres) {
    try {
      const { chiffresDuMarche } = await import('./contexte-marche.js');
      const chiffres = await chiffresDuMarche(contexte.resume, lots[lotIndex].enrichissement?.commune?.nom || '');
      if (chiffres) {
        lots[lotIndex] = { ...lots[lotIndex], contexte_marche: { ...contexte, chiffres } };
        change = true;
      }
    } catch { /* les cases resteront vides */ }
  }

  if (change) Records.update('Deal', deal.id, { lots });
}

/**
 * Crée le Project pré-rempli et passe le deal en `projet_cree`.
 * @returns {{ ok: true, project } | { ok: false, error }}
 */
export function creerProjetDepuisDeal(dealId, lotIndex, user) {
  const deal = Records.filter('Deal', { deal_id: dealId })[0];
  if (!deal) return { ok: false, error: 'Dossier introuvable' };
  // Un projet supprimé laissait son identifiant sur le dossier : la plateforme
  // refusait alors d'en créer un autre, en désignant un projet qui n'existe
  // plus. On ne refuse que si le projet est encore là.
  if (deal.projet_id) {
    if (Records.get('Project', deal.projet_id)) {
      return { ok: false, error: 'Un projet existe déjà pour ce deal.', project_id: deal.projet_id };
    }
    delierProjet(deal.projet_id, user);
  }
  // Sans pré-analyse, le projet naît d'une fiche vide au nom du dossier.
  const lot = lotOuVide(deal, lotIndex);

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
    // Les trois cases du secteur : ville, département, région. Données
    // publiques de la commune, personne n'a à les ressaisir.
    ville_secteur_champ1: ville,
    ville_secteur_champ2: commune?.departement || '',
    ville_secteur_champ3: commune?.region || '',
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
    // Le point de marché reste sur le dossier, avec ses sources : ce sont ses
    // chiffres qui entrent dans la fiche, pas ses douze phrases.
    description_secteur: '',
    analyse_bail: lot.synthese?.synthese || '',

    ...mapperSimulateur(lot.simulateur),
    ...mapperMarche(ville, adresse.code_postal, lot.contexte_marche?.chiffres),
    // La valeur locative lue sur Data-B, si elle a été cherchée : la fourchette
    // de la rue entre dans « Offre actuelle », le quartier nomme le secteur.
    // Elle passe après la base marché et le point de marché, sans les écraser.
    ...mapperValeurLocative(lot.valeur_locative, mapperMarche(ville, adresse.code_postal, lot.contexte_marche?.chiffres)),

    // Traçabilité et suivi client (toggles à plat).
    deal_id: deal.deal_id,
    suivi_message_envoye: false,
    suivi_retour_client: null,

    photos: [],
    documents: [],
    fichiers_projet: [],
    docs_checklist: {},
  };

  // L'extraction des documents complète la fiche : bail, copropriété,
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
