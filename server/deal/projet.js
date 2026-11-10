// Création d'un Project pré-rempli depuis un deal de préanalyse.
//
// Le mapping simulateur suit EXACTEMENT la lecture faite par
// SimulateurRentabilite.jsx (useEffect sur selectedProject) : mêmes noms
// sim_*, mêmes conventions de défauts — pour que le simulateur complet
// affiche les mêmes chiffres que le SimulateurRapide du deal.

import { prixFai as prixFaiDuLot } from './prix.js';
import { Records } from '../db.js';
import { changerStatut } from './lifecycle.js';
import { lotOuVide } from './index.js';
import { patchDepuisExtractions, dpeDepuis } from './donnees-projet.js';
import { trouverVille, trouverSecteur } from '../../src/data/villes.js';
import { TRAVAUX_PAR_DEFAUT, calculerTableauAnnuel, parametresDuProjet } from '../../src/components/simulator/CalculFinancier.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);
// « Activité non renseignée » occupe la case sans rien dire : l'Analyse passe devant.
const motVide = (v) => /non renseign|[àa] qualifier/i.test(String(v || ''));

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

// Les chiffres que le simulateur du dossier et les onglets de l'Analyse ont déjà (30 oct. 2026, Jules : « la taxe foncière
// doit être resaisie alors qu'on l'a déjà saisie avant ») : taxe foncière, charges, ce qui est refacturé, TVA. Les pièces
// (avis de taxe foncière, bail) passent devant le simulateur du dossier. Seules les valeurs connues sont rendues.
const CHARGES_DU_SIMULATEUR = [
  ['taxeFonciere', 'sim_taxe_fonciere'],
  ['chargesCopropriete', 'sim_charges_copropriete'],
  ['taxeFonciereRefacturable', 'sim_taxe_refacturable'],
  ['chargesCoproRefacturables', 'sim_charges_refacturable'],
  ['loyerSoumisTVA', 'sim_loyer_soumis_tva'],
];
function chargesConnues(simDuLot = {}, desPieces = {}) {
  const sortie = {};
  for (const [cle, champ] of CHARGES_DU_SIMULATEUR) {
    const v = desPieces?.[cle] ?? simDuLot?.[cle];
    if (v == null || v === '' || (typeof v === 'number' && !(v > 0))) continue;
    sortie[champ] = v;
  }
  return sortie;
}

// Les travaux bailleur par défaut (10 000 € en années 10 et 20) : ceux du simulateur, posés à la naissance du projet.
const travauxParDefautDuProjet = () => Object.fromEntries(TRAVAUX_PAR_DEFAUT.flatMap(([annee, montant]) => [[`sim_travaux_annee${annee}`, annee], [`sim_travaux_montant${annee}`, montant]]));

// Le simulateur du dossier tel qu'on l'a laissé (9 nov. 2026, Jules : « tu prends la dernière version qu'on a mis ») :
// crédit, apport, charges, revente, travaux, vacance. Seule la création s'en sert ; une fois le projet né, ses réglages
// se font dans le projet (mettreAJourProjetDepuisDeal).
const REGLAGES_DU_SIMULATEUR = [
  ['dureeCredit', 'sim_duree_credit'], ['tauxInteret', 'sim_taux_interet'], ['tauxAssuranceCredit', 'sim_taux_assurance'],
  ['pretInFine', 'sim_pret_in_fine'], ['sansCredit', 'sim_sans_credit'], ['indexation', 'sim_indexation_loyers'],
  ['anneeRevente', 'sim_annee_revente'], ['tauxCommissionAgentRevente', 'sim_commission_agent_revente'],
  ['rendementBrutAcheteur', 'sim_rendement_capital'], ['comptabilite', 'sim_comptabilite'], ['assurancePNE', 'sim_assurance_pne'],
  ['gestionLocative', 'sim_gestion_locative'], ['chargesDiverses', 'sim_charges_diverses'], ['tauxTVA', 'sim_taux_tva'],
  ['commissionAgentType', 'sim_commission_agent_type'], ['vacancesLocatives', 'sim_vacances_locatives'],
];
// Les chiffres que l'Analyse donne aussi : comme à l'écran, elle passe devant, sauf ce qu'on a tapé à la main. Un loyer ou
// une surface à zéro veut dire « pas renseigné ».
const FAITS_DU_SIMULATEUR = [
  ['loyerInitialHTHC', ['sim_loyer_initial_ht', 'loyer_annuel_ht'], true], ['surface', ['sim_surface', 'surface_m2'], true],
  ['taxeFonciere', ['sim_taxe_fonciere']], ['chargesCopropriete', ['sim_charges_copropriete']], ['loyerSoumisTVA', ['sim_loyer_soumis_tva']],
  ['chargesCoproRefacturables', ['sim_charges_refacturable']], ['taxeFonciereRefacturable', ['sim_taxe_refacturable']],
];
export function simulateurDuDossier(sim = {}) {
  const sortie = { sim_commission_agent_active: true }; // Honoraires toujours comptés dans le simulateur du dossier.
  for (const [cle, champ] of REGLAGES_DU_SIMULATEUR) if (sim[cle] != null) sortie[champ] = sim[cle];
  if (sim.revalorisationActive != null) {
    const oui = sim.revalorisationActive && Number(sim.anneeRevalorisation) > 0;
    Object.assign(sortie, { sim_annee_revalorisation: oui ? sim.anneeRevalorisation : null, sim_loyer_revalorise: oui ? sim.loyerRevalorise || 0 : 0 });
  }
  if (sim.renegociationActive != null) {
    const oui = sim.renegociationActive && Number(sim.anneeRenegociation) > 0;
    Object.assign(sortie, { sim_annee_renegociation: oui ? sim.anneeRenegociation : null, sim_taux_renegocie: oui ? sim.nouveauTauxRenegociation || 0 : 0, sim_ira_mois: oui ? sim.iraRenegociation || 0 : 0 });
  }
  const saisis = new Set(sim.saisis || []);
  for (const [cle, champs, positif] of FAITS_DU_SIMULATEUR) {
    if (!saisis.has(cle) || sim[cle] == null || (positif && !(Number(sim[cle]) > 0))) continue;
    for (const champ of champs) sortie[champ] = sim[cle];
  }
  return sortie;
}

// Les travaux joués dans le simulateur du dossier, rangés par année comme dans le formulaire du projet (20 ans). Tous à
// zéro, le montant 1 à 0 dit « retirés » : sans lui, travauxDuProjet reprendrait ceux par défaut.
export function travauxDuDossier(sim = {}) {
  if (!Array.isArray(sim.travauxBailleur)) return travauxParDefautDuProjet();
  const sortie = { sim_travaux_montant1: 0 };
  sim.travauxBailleur.slice(0, 20).forEach((montant, i) => { if (Number(montant) > 0) Object.assign(sortie, { [`sim_travaux_annee${i + 1}`]: i + 1, [`sim_travaux_montant${i + 1}`]: Number(montant) }); });
  return sortie;
}

// L'apport enregistré, sinon celui que l'écran montre : 15 % du prix de revient, pas du prix FAI.
function apportDuSimulateur(champs, sim = {}) {
  if (Number(sim.apport) > 0) return Number(sim.apport);
  try {
    const revient = calculerTableauAnnuel({ ...parametresDuProjet(champs), apport: 0 }).prixRevient;
    if (revient > 0) return Math.round(revient * 0.15);
  } catch { /* l'apport de départ reste */ }
  return champs.sim_apport;
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
    // Les loyers n'en viennent plus : Equimmox et Data-B, seules sources des
    // loyers (6 oct. 2026), les posent plus bas.
  ];
  const deLaBase = {};
  for (const [cle, v] of paires) if (v != null && v !== 0) deLaBase[cle] = v;
  return {
    ...repli,
    ...deLaBase,
    marche_quartier_nom: entree.secteur || repli.marche_quartier_nom || '',
  };
}

// La valeur locative donne le loyer de la rue, du quartier et de la ville, en € HT HC par
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

// Ce qu'on sait d'une commune sans rien demander à personne : les cinq
// chiffres de la bande du haut et les points marquants, tirés du jeu de données
// partagé avec la page projet. Une fiche naît remplie plutôt que vide.
function chiffresDeLaCommune(ville, adresseComplete) {
  const v = trouverVille(adresseComplete || ville);
  if (!v) return {};
  const s = trouverSecteur(v, adresseComplete || '');
  return {
    ville_habitants: v.pop ?? null,
    ville_evolution_pop: v.evo ?? null,
    ville_revenu_median: v.revenu ?? null,
    ville_chomage: v.chomage ?? null,
    ville_prix_m2: v.prixM2 ?? null,
    ville_points: v.points || [],
    secteur_points: s?.points || [],
  };
}

// Le nom du local : l'activité puis l'enseigne, sans la forme juridique.
//   « Chez Truc » + « Pizzeria »        →  « Pizzeria Chez Truc »
//   « SARL RIMEL » + une longue activité →  « RIMEL »
//   « Pizzeria Da Mario » + « pizzeria » →  « Pizzeria Da Mario »
const FORMES_JURIDIQUES = /\b(?:SARL|SASU|SAS|EURL|SCI|SNC|SELARL|SCP|SA|EI|soci[ée]t[ée]|st[ée])\b\.?/gi;
const sansAccents = (t) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
export function nomDuLocal(locataire, activite) {
  const nom = String(locataire || '').replace(FORMES_JURIDIQUES, ' ').replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
  const act = String(activite || '').trim();
  const courte = act && act.length <= 24 && act.split(/\s+/).length <= 3 ? act[0].toUpperCase() + act.slice(1).toLowerCase() : null;
  if (nom && courte && !sansAccents(nom).includes(sansAccents(courte))) return `${courte} ${nom}`;
  return nom || courte || '';
}

// Le titre d'un projet : le nom du local seul (30 oct. 2026, Jules : l'adresse est écrite juste en dessous, la répéter
// dans le titre ne sert à rien). Sans nom, le bien se nomme par ce qu'il est. `adresse` n'est plus lue, gardée pour les appels.
// Un titre propre : court, sur une ligne, pas un paragraphe de « points forts » glissé dans le nom du locataire
// (9 nov. 2026, Jules : un projet s'appelait « Points forts (+) Ancienneté… »).
export function titrePropre(t) {
  const v = String(t || '').trim();
  return !!v && v.length <= 60 && !/[\n\r]/.test(v) && !/points?\s*forts|anciennet|notori[ée]t|diversif|[àa]\s+l.attention|\bcpf\b/i.test(v);
}

export function titreProjet(locataire, adresse, activite = null) {
  const nom = nomDuLocal(locataire, activite);
  if (titrePropre(nom)) return nom;
  // Nom vide : « Murs commerciaux », comme avant. Nom pollué (un paragraphe de points forts) : on l'écarte et on
  // nomme par la ville de l'adresse, jamais par le champ pollué (9 nov. 2026, Jules).
  if (!nom) return 'Murs commerciaux';
  const ville = typeof adresse === 'string' ? adresse.split(',').pop().replace(/\b\d{4,5}\b/g, '').trim() : null;
  return ville ? `Murs commerciaux · ${ville}` : 'Murs commerciaux';
}

// Equimmox : bas, moyenne et haut des loyers observés, en € par m² et par an,
// l'unité des cases « Baux existants ». Seules les cases vides sont remplies.
function mapperAnalyseLoyer(al, deja = {}) {
  if (!al || (al.bas == null && al.moyenne == null && al.haut == null)) return {};
  const vide = (cle) => !deja[cle];
  const sortie = {};
  if (al.bas > 0 && vide('marche_baux_bas')) sortie.marche_baux_bas = al.bas;
  if (al.moyenne > 0 && vide('marche_baux_moyenne')) sortie.marche_baux_moyenne = al.moyenne;
  if (al.haut > 0 && vide('marche_baux_haut')) sortie.marche_baux_haut = al.haut;
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
    // Pas les loyers que le point de marché cite : ils viennent d'une
    // recherche sur le web, pas d'Equimmox ni de Data-B.
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
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return;
  // Un identifiant de projet périmé — le projet a été supprimé — laissait le
  // dossier sans département ni chiffres de marché, et la fiche naissait à
  // moitié vide. Comme à la création, on ne s'arrête que si le projet est là.
  if (deal.projet_id && Records.get('Project', deal.projet_id)) return;
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
 * Ce que le projet prend du lot : l'adresse, la commune, le bien, le bail, le simulateur, le marché. Commun à la
 * création du projet et à sa mise à jour depuis le dossier (30 oct. 2026, Jules).
 */
function donneesDuLot(lot) {
  const adresse = val(lot.lot.adresse) || {};
  const commune = lot.enrichissement?.commune;
  const ville = commune?.nom || adresse.ville || '';
  const adresseComplete = [adresse.rue, [adresse.code_postal, ville].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const champs = {
    adresse_complete: adresseComplete,
    // Les chiffres de la commune et les points à en dire, quand elle figure
    // dans le jeu de données des villes de plus de cent mille habitants. En
    // dessous, l'IA prend le relais à l'affichage et les cases restent vides.
    ...chiffresDeLaCommune(ville, adresseComplete),

    // Les trois cases du secteur : ville, département, région. Données
    // publiques de la commune, personne n'a à les ressaisir.
    ville_secteur_champ1: ville,
    ville_secteur_champ2: commune?.departement || '',
    ville_secteur_champ3: commune?.region || '',
    latitude: commune?.centre?.lat ?? null,
    longitude: commune?.centre?.lon ?? null,
    surface_m2: val(lot.lot.surface_m2) ?? 0,
    prix_acquisition: prixFaiDuLot(lot.lot) ?? 0,
    rendement_locatif: val(lot.lot.rendement_annonce) ?? 0,
    loyer_annuel_ht: val(lot.lot.loyer_annuel_ht_hc) ?? 0,
    nom_locataire: val(lot.lot.locataire_nom) || '',
    // L'activité dite dans la Pré-analyse passe devant la catégorie déduite par l'enrichissement (10 nov. 2026, Jules :
    // « activité fausse depuis la préanalyse »), qui devinait parfois d'après le nom.
    activite_locataire: [val(lot.lot.locataire_activite), lot.enrichissement?.activite?.libelle].find((a) => a && !motVide(a)) || '',
    type_bail: val(lot.lot.bail_type) || '',
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
    // La valeur locative du secteur, si elle a été cherchée : la fourchette
    // de la rue entre dans « Offre actuelle », le quartier nomme le secteur.
    // Elle passe après la base marché et le point de marché, sans les écraser.
    // La rue lue chez Equimmox, sinon l'estimation Data-B de la même rue.
    ...mapperValeurLocative(lot.valeur_locative?.rue ? lot.valeur_locative : lot.valeur_locative_data_b, mapperMarche(ville, adresse.code_postal, lot.contexte_marche?.chiffres)),
    // Les loyers observés par Equimmox — des baux en place autour du bien, à
    // surface comparable — remplissent « Baux existants » si elle est vide.
    ...mapperAnalyseLoyer(lot.analyse_loyer, mapperMarche(ville, adresse.code_postal, lot.contexte_marche?.chiffres)),

    // Les cessions de fonds relevées sur le dossier suivent le projet : c'est
    // sur sa carte qu'elles se lisent, à côté du bien.
    transactions_fonds: lot.transactions_fonds || null,

  };
  return { adresseComplete, champs };
}

// Les cases de l'Analyse tranchées (OK) qui ont leur place dans le projet. Le texte de la case passe tel quel, sauf
// le loyer, ramené à l'année (« 1 500 € par mois » → 18 000).
const CASES_DU_PROJET = [
  ['bail', 'echeance', 'echeance_bail'],
  ['bail', 'loyer_signature', 'loyer_annuel_ht'],
  ['kbis', 'denomination', 'nom_locataire'],
  ['kbis', 'activite', 'activite_locataire'],
];
const premierNombre = (texte) => {
  const m = String(texte || '').replace(/(\d)[\s\u00a0\u202f.](?=\d{3}\b)/g, '$1').match(/\d+(?:,\d+)?/);
  const n = m ? Number(m[0].replace(',', '.')) : null;
  return Number.isFinite(n) && n > 0 ? n : null;
};
export function loyerAnnuel(texte) {
  const t = String(texte || '').toLowerCase();
  const n = premierNombre(t);
  if (n == null) return null;
  return Math.round(/mois|mensuel/.test(t) ? n * 12 : /trimestr/.test(t) ? n * 4 : n);
}

// Les dates d'une case (« du 01/01/2020 au 31/12/2028 ») en ISO, dans l'ordre où elles sont écrites.
const datesIso = (t) => [...String(t || '').matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map(([, j, m, a]) => `${a}-${m.padStart(2, '0')}-${j.padStart(2, '0')}`);

// Ce que l'Analyse sait pour le projet : les cases du Bail et du Kbis. `tranchees` : seulement les cases vérifiées (la
// mise à jour) ; sinon tout ce qui a été lu (la création, qui remplit au maximum). L'échéance donne le début et la fin du
// bail en dates (30 oct. 2026, Jules : « des éléments déjà saisis en analyse ne se remettent pas » dans le projet), le
// locataire du bail nomme le local quand il n'y a pas de Kbis.
function champsDeLAnalyse(analyse, { tranchees = false } = {}) {
  const patch = {};
  const ligne = (grille, critere) => {
    const l = analyse?.grilles?.find((g) => g.id === grille)?.lignes.find((x) => x.id === critere);
    if (!l?.valeur || (tranchees && !['verifie', 'corrige'].includes(l.statut))) return null;
    const donnees = l.statut === 'corrige' ? {} : (l.sources || []).find((x) => x.document_id === l.retenue)?.donnees || {};
    return { texte: String(l.valeur), donnees };
  };
  for (const [grille, critere, champ] of CASES_DU_PROJET) {
    const l = ligne(grille, critere);
    if (!l) continue;
    if (champ === 'echeance_bail') {
      const ds = datesIso(l.texte);
      const debut = datesIso(l.donnees.debut)[0] || (ds.length > 1 ? ds[0] : null);
      const fin = datesIso(l.donnees.fin)[0] || ds.at(-1) || null;
      if (fin) patch.echeance_bail = fin;
      if (debut) patch.bail_date_debut = debut;
      continue;
    }
    const v = champ === 'loyer_annuel_ht' ? loyerAnnuel(l.texte) : l.texte.split('\n')[0].trim();
    if (v) patch[champ] = v;
  }
  if (!patch.nom_locataire) {
    const parties = ligne('bail', 'parties');
    const nom = parties && (parties.donnees.locataire || null);
    if (nom) patch.nom_locataire = nom;
  }
  return patch;
}

// Le reste de ce que l'Analyse a lu, là où le projet l'attend (9 nov. 2026, Jules : « vraiment tout doit se mettre sinon on
// est obligé de ressaisir à la main ») : bail, copropriété, diagnostics, Kbis. Ni le vendeur ni le bailleur : la page
// du projet est lue par les clients.
const LIGNES_DU_BAIL = [
  ['bail', 'type_bail', 'Type de bail'], ['bail', 'echeance', 'Echéance du bail'], ['bail', 'parties', 'Les parties'],
  ['bail', 'destination', 'Destination'], ['bail', 'loyer_signature', 'Loyer de signature'], ['quittances', 'loyer_hc_ht', 'Loyer relevé sur quittances'],
  ['bail', 'cession', 'Droit de cession'], ['bail', 'indexation', "Mode d'indexation"], ['bail', 'depot', 'Dépôt de garantie'],
  ['bail', 'pas_de_porte', 'Pas-de-porte'], ['bail', 'charges', 'Charges et taxes refacturées'], ['bail', 'taxes', 'Taxes refacturées'],
];
const DIAGNOSTICS_NOTES = ['dtg', 'amiante', 'erp', 'termites', 'plomb', 'electricite'];
const KBIS_NOTES = ['immatriculation', 'capital', 'dirigeant', 'procedure'];
export function champsCompletsDeLAnalyse(analyse, deal = null) {
  const lue = (grille, critere) => {
    const l = analyse?.grilles?.find((g) => g.id === grille)?.lignes.find((x) => x.id === critere);
    if (!l?.valeur || l.statut === 'introuvable') return null;
    return { libelle: l.libelle, texte: [...new Set(String(l.valeur).split('\n').map((x) => x.trim()).filter(Boolean))].join('\n'), donnees: l.statut === 'corrige' ? {} : (l.sources || []).find((x) => x.document_id === l.retenue)?.donnees || {} };
  };
  const note = (grille) => (id) => { const l = lue(grille, id); return l ? { titre: l.libelle, contenu: l.texte } : null; };
  const sortie = {};

  const bail = LIGNES_DU_BAIL.map(([g, c, label]) => { const l = lue(g, c); return l ? { label, value: l.texte } : null; }).filter(Boolean);
  if (bail.length) sortie.bail_admin_fields = bail;
  const signature = lue('bail', 'loyer_signature');
  if (signature) sortie.bail_loyer_initial = Number(signature.donnees.annuel_ht) || loyerAnnuel(signature.texte);
  const depot = lue('bail', 'depot');
  if (depot) sortie.bail_depot_garantie = Number(depot.donnees.montant) || premierNombre(depot.texte);
  const ferme = lue('bail', 'type_bail')?.texte.match(/(\d{1,2})\s*ans?\s+ferme/i);
  if (ferme) sortie.bail_duree_ferme_ans = Number(ferme[1]);
  const provision = lue('quittances', 'provision');
  if (provision) sortie.provision_charges = Number(provision.donnees.montant) || premierNombre(provision.texte);

  const autorisees = lue('rcp', 'activites_autorisees') || lue('bail', 'destination');
  if (autorisees) sortie.activites_autorisees = autorisees.texte;
  const interdites = lue('rcp', 'activites_interdites');
  if (interdites) sortie.activites_interdites = interdites.texte;
  // La case de la page attend un pourcentage ; des tantièmes seuls restent dans l'analyse de la copropriété.
  const quotePart = lue('rcp', 'quote_part')?.texte.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (quotePart) sortie.quote_part_lot = Number(quotePart[1].replace(',', '.'));

  // Les résolutions lues, assemblée par assemblée ; celles qu'on a cachées dans l'Analyse restent cachées.
  const issues = (ag, issue) => ag.resolutions.filter((r) => r.issue === issue && !r.cachee).map((r) => r.nom).filter(Boolean).join('\n');
  const assemblees = (analyse?.assemblees || []).filter((ag) => ag.annee && ag.resolutions?.length)
    .map((ag) => ({ annee: ag.annee, synthese: '', resolutions_votees: issues(ag, 'adoptee'), resolutions_refusees: issues(ag, 'rejetee') }));
  if (assemblees.length) sortie.assemblees_generales = assemblees;
  const votees = assemblees.map((a) => a.resolutions_votees).filter(Boolean).join('\n') || lue('pv_ag', 'travaux_votes')?.texte;
  if (votees) sortie.resolutions_votees = votees;
  const refusees = assemblees.map((a) => a.resolutions_refusees).filter(Boolean).join('\n') || lue('pv_ag', 'resolutions_non_votees')?.texte;
  if (refusees) sortie.resolutions_refusees = refusees;

  const dpe = lue('diagnostics', 'dpe');
  if (dpe) {
    const { note: lettre, consommation } = dpeDepuis(dpe.texte);
    if (lettre) sortie.dpe_note = lettre;
    if (consommation) sortie.dpe_consommation = consommation;
  }
  const diagnostics = [dpe && { titre: 'DPE', contenu: dpe.texte }, ...DIAGNOSTICS_NOTES.map(note('diagnostics'))].filter(Boolean);
  if (diagnostics.length) sortie.notes_diagnostique = diagnostics;
  const kbis = KBIS_NOTES.map(note('kbis')).filter(Boolean);
  if (kbis.length) sortie.notes_locataire = kbis;

  // La surface dite en toutes lettres : la case de l'onglet Bien si elle dit un chiffre, sinon la première pièce lue.
  const etat = deal?.analyse_pieces || {};
  const lues = Object.values(etat.docs || {}).filter((d) => ['bail', 'diagnostics'].includes(d?.type)).map((d) => d.valeurs?.bien_surface?.valeur);
  const detail = [etat.cases?.['bien.surface']?.valeur, ...lues].find((t) => /\d/.test(String(t || '')));
  if (detail) sortie.surface_detail = String(detail).trim();

  // Le loyer du marché seulement s'il a été vérifié : sinon la page suit Equimmox et « Relancer l'analyse du loyer ».
  const marche = [analyse?.cases_marche?.loyer_marche, analyse?.cases_marche?.loyer_moyen].find((c) => c?.statut === 'verifie' && premierNombre(c.valeur));
  if (marche) sortie.marche_loyer_autour = premierNombre(marche.valeur);
  return Object.fromEntries(Object.entries(sortie).filter(([, v]) => v != null && v !== ''));
}

// Les pièces de la Data Room, rangées par l'Analyse, dans l'onglet Documents du projet, et les cases cochées avec.
// Ni la fiche de l'agent ni les pièces sans type : l'onglet est montré aux clients.
const PIECES_DU_PROJET = ['bail', 'avenants', 'quittances', 'pv_ag', 'rcp', 'diagnostics', 'taxe_fonciere', 'kbis'];
const CASES_DOCUMENTS = ['bail', 'pv_ag', 'diagnostics', 'quittances', 'rcp'];
export function piecesDuProjet(analyse) {
  const fichiers_projet = [];
  const docs_checklist = {};
  for (const e of analyse?.emplacements || []) {
    if (!PIECES_DU_PROJET.includes(e.id)) continue;
    const pieces = (e.documents || []).filter((d) => d.url);
    fichiers_projet.push(...pieces.map((d) => ({ nom: d.titre || d.nom || e.titre, url: d.url })));
    if (pieces.length && CASES_DOCUMENTS.includes(e.id)) docs_checklist[e.id] = true;
  }
  return { fichiers_projet, docs_checklist };
}

// « SARL TARTANPION » s'écrit « Sarl tartanpion » (30 oct. 2026, Jules : une majuscule pour commencer, le reste en
// minuscules), pour le nom, l'activité et chaque pastille du profil.
export const casse = (t) => { const x = String(t || '').trim().toLowerCase(); return x ? x[0].toUpperCase() + x.slice(1) : ''; };
const casseProfil = (t) => String(t || '').split(/\s*,\s*/).map(casse).filter(Boolean).join(', ');

// Le profil de l'exploitant, en pastilles, d'après le Kbis lu dans l'Analyse : sa forme, l'année d'immatriculation,
// le capital. Rien sans Kbis.
const FORMES = /\b(SASU|SAS|SARL|EURL|SNC|SCI|SELARL|SA|EI|EIRL)\b/i;
export function profilDuKbis(analyse) {
  const lignes = analyse?.grilles?.find((g) => g.id === 'kbis')?.lignes || [];
  const v = (id) => { const l = lignes.find((x) => x.id === id); return l?.valeur && l.statut !== 'introuvable' ? String(l.valeur) : ''; };
  const forme = (v('denomination').match(FORMES) || [])[1];
  const annee = (v('immatriculation').match(/\b(19|20)\d{2}\b/) || [])[0];
  const capital = v('capital').match(/\d[\d\s\u00a0\u202f.]*\s*€/);
  return [forme && forme.toUpperCase(), annee && `Immatriculée en ${annee}`, capital && `Capital ${capital[0].replace(/[\s\u00a0\u202f.]+(?=\d)/g, ' ').trim()}`].filter(Boolean).join(', ');
}

// Les chiffres de la ville pour l'onglet Marché du projet : les habitants de l'agglomération (Insee), sinon de la commune,
// et le revenu médian de la commune, lus à l'enrichissement du dossier.
export async function villeDuLot(lot) {
  const commune = lot.enrichissement?.commune || {};
  const sortie = {};
  let habitants = null;
  if (commune.code_insee) {
    try { const { agglomerationDe } = await import('../projet-secteur.js'); habitants = agglomerationDe(commune.code_insee)?.population || null; } catch { habitants = null; }
  }
  habitants = habitants || commune.population || null;
  if (habitants) sortie.ville_habitants_agglo = habitants;
  if (lot.enrichissement?.revenu_median) sortie.ville_revenu_median = lot.enrichissement.revenu_median;
  return sortie;
}

// Les images déposées dans la Data Room, rangées « Images du projet » (30 oct. 2026, Jules).
const estImage = (d) => /^image\//.test(d.mime || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(d.nom || d.url || '');
export function photosDeLaDataRoom(deal) {
  const types = deal?.analyse_pieces?.docs || {};
  return (deal?.documents_espace || []).filter((d) => types[d.id]?.type === 'photos' && d.url && estImage(d)).map((d) => ({ id: d.id, url: d.url }));
}

/** L'adresse du lot, en une ligne, pour la Base Adresse Nationale. */
export function adresseDuLot(lot) {
  const a = val(lot?.lot?.adresse) || {};
  return [a.rue, [a.code_postal, lot?.enrichissement?.commune?.nom || a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

/**
 * La dernière vente des murs, d'après DVF sur la parcelle de l'adresse (30 oct. 2026, Jules : « si on trouve, sinon
 * cache-la »). Seule une vente de locaux commerciaux seuls compte : la vente d'un appartement de l'immeuble n'est pas
 * celle des murs. Jamais bloquant : au-delà de quinze secondes, ou sans parcelle, rien.
 */
export async function derniereVenteDesMurs(adresse, { delai = 15000 } = {}) {
  if (!adresse) return null;
  const lire = async () => {
    const { resoudreLocal } = await import('../socle/local.js');
    const l = await resoudreLocal(adresse);
    const idu = l?.ok ? l.local?.parcelle?.idu : null;
    if (!idu) return null;
    const { mutationsDeLaParcelle } = await import('../dvf.js');
    const m = (await mutationsDeLaParcelle(l.local.adresse?.code_insee || idu.slice(0, 5), idu)).find((x) => x.commercial_pur && x.date);
    return m ? { annee: Number(String(m.date).slice(0, 4)) || null, prix: m.prix || null } : null;
  };
  try {
    return await Promise.race([lire(), new Promise((r) => { setTimeout(() => r(null), delai).unref?.(); })]);
  } catch { return null; }
}

// Ce qu'un projet doit avoir pour être présenté, et la question qui le demande (30 oct. 2026, Jules : « une fois
// rempli au maximum, le chat pose des questions »).
const ESSENTIELS = [
  ['adresse_complete', "l'adresse exacte du local"],
  ['nom_locataire', "le nom du locataire (l'enseigne ou la société)"],
  ['activite_locataire', "l'activité du locataire"],
  ['surface_m2', 'la surface du local, en m²'],
  ['prix_acquisition', 'le prix de vente FAI'],
  ['loyer_annuel_ht', 'le loyer annuel HT HC'],
  ['echeance_bail', "l'échéance du bail"],
  ['rendement_locatif', 'le rendement annoncé'],
];
// Le simulateur du projet suit ce que l'Analyse a lu (30 oct. 2026, Jules : « et le simulateur correctement ») : le loyer
// retenu (quittances, bail), la surface, et le prix FAI repris s'il manque ; l'apport suit le prix.
function simulateurDeLAnalyse(champs, analyse) {
  const v = analyse?.simulateur?.valeurs || {};
  const sortie = {};
  if (Number(v.loyerInitialHTHC) > 0) { sortie.sim_loyer_initial_ht = Number(v.loyerInitialHTHC); sortie.loyer_annuel_ht = Number(v.loyerInitialHTHC); }
  else if (!(Number(champs.sim_loyer_initial_ht) > 0) && Number(champs.loyer_annuel_ht) > 0) sortie.sim_loyer_initial_ht = Number(champs.loyer_annuel_ht);
  if (Number(v.surface) > 0) { sortie.sim_surface = Number(v.surface); sortie.surface_m2 = Number(v.surface); }
  else if (!(Number(champs.sim_surface) > 0) && Number(champs.surface_m2) > 0) sortie.sim_surface = Number(champs.surface_m2);
  if (!(Number(champs.sim_prix_bien_fai) > 0) && Number(champs.prix_acquisition) > 0) {
    sortie.sim_prix_bien_fai = Number(champs.prix_acquisition);
    sortie.sim_prix_bien_negocie = Number(champs.prix_acquisition);
    sortie.sim_apport = Math.round(Number(champs.prix_acquisition) * 0.15);
  }
  if (typeof v.loyerSoumisTVA === 'boolean') sortie.sim_loyer_soumis_tva = v.loyerSoumisTVA;
  if (typeof v.taxeFonciereRefacturable === 'boolean') sortie.sim_taxe_refacturable = v.taxeFonciereRefacturable;
  if (typeof v.chargesCoproRefacturables === 'boolean') sortie.sim_charges_refacturable = v.chargesCoproRefacturables;
  if (Number(v.taxeFonciere) > 0) sortie.sim_taxe_fonciere = Number(v.taxeFonciere);
  return sortie;
}

// Combien de points du bail et de la copropriété l'Analyse a lus : ils passent dans le projet par ses cases.
const lignesLues = (analyse, ids) => (analyse?.grilles || []).filter((g) => ids.includes(g.id)).flatMap((g) => g.lignes).filter((l) => l.valeur && l.statut !== 'introuvable');
const pointsDeLAnalyse = (analyse) => ({ analyse_bail_points: lignesLues(analyse, ['bail']).length, copropriete_points: lignesLues(analyse, ['pv_ag', 'rcp']).length });
// Ce que l'IA a lu sans que personne l'ait vérifié, et les alertes : à relire avant de présenter le projet.
function aVerifierDansLAnalyse(analyse) {
  const sortie = [];
  for (const g of analyse?.grilles || []) {
    for (const l of g.lignes || []) {
      if (!l.valeur || l.statut === 'introuvable') continue;
      // Une ligne passée au vert a été vue : son alerte ne se redemande pas.
      if (l.alerte?.motif && !['verifie', 'corrige'].includes(l.statut)) sortie.push(`${l.libelle} : ${l.alerte.motif}`);
    }
  }
  const nonVerifiees = (analyse?.grilles || []).flatMap((g) => g.lignes || []).filter((l) => l.valeur && l.statut === 'ia').length;
  if (nonVerifiees) sortie.push(`${nonVerifiees} valeur${nonVerifiees > 1 ? 's' : ''} lue${nonVerifiees > 1 ? 's' : ''} par l'IA et pas encore vérifiée${nonVerifiees > 1 ? 's' : ''} dans l'Analyse`);
  return sortie.slice(0, 12);
}

const eurosTexte = (n) => `${Math.round(Number(n)).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} €`;
const dateTexte = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); };
// Ce que le message d'ouverture montre, dans l'ordre de la page projet. Une ligne par champ rempli.
const RESUME = [
  ['nom_locataire', 'Locataire'],
  ['activite_locataire', 'Activité'],
  ['profil_locataire', 'Profil'],
  ['adresse_complete', 'Adresse'],
  ['ville_habitants_agglo', 'Habitants', (n) => Number(n).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')],
  ['ville_revenu_median', 'Revenu médian de la ville', eurosTexte],
  ['sim_surface', 'Surface', (n) => `${String(n).replace('.', ',')} m²`],
  ['sim_prix_bien_fai', 'Prix FAI', eurosTexte],
  ['sim_loyer_initial_ht', 'Loyer annuel HT HC', eurosTexte],
  ['loyer_m2', 'Loyer au m² par an', eurosTexte],
  ['bail_date_debut', 'Début du bail', dateTexte],
  ['echeance_bail', 'Échéance du bail', dateTexte],
  ['sim_taxe_fonciere', 'Taxe foncière', eurosTexte],
  ['derniere_vente_annee', 'Dernière vente', null],
];
/**
 * Le premier message du chat du projet (30 oct. 2026, Jules) : ce qui a été mis dans le projet, une ligne par valeur,
 * puis ce qu'il reste à vérifier : ce qui manque pour le présenter, et ce que l'IA a lu sans qu'on l'ait vérifié.
 */
export function questionsDuProjet(projet, { aVerifier = [] } = {}) {
  const vide = (v) => v == null || v === '' || v === 0;
  const loyerM2 = Number(projet?.sim_loyer_initial_ht) > 0 && Number(projet?.sim_surface) > 0 ? Math.round(projet.sim_loyer_initial_ht / projet.sim_surface) : 0;
  const p = { ...projet, loyer_m2: loyerM2 };
  const mis = RESUME.filter(([champ, libelle]) => libelle && !vide(p[champ])).map(([champ, libelle, f]) => {
    if (champ === 'derniere_vente_annee') return `- ${libelle} : ${p.derniere_vente_annee}${Number(p.derniere_vente_prix) > 0 ? `, ${eurosTexte(p.derniere_vente_prix)}` : ''}`;
    return `- ${libelle} : ${f ? f(p[champ]) : String(p[champ]).split('\n')[0]}`;
  });
  const bail = (projet?.analyse_bail_points || 0);
  if (bail) mis.push(`- Analyse du bail : ${bail} point${bail > 1 ? 's' : ''} repris de l'Analyse`);
  if (projet?.copropriete_points) mis.push(`- Copropriété : ${projet.copropriete_points} point${projet.copropriete_points > 1 ? 's' : ''} repris de l'Analyse`);
  const manque = ESSENTIELS.filter(([champ]) => vide(projet?.[champ])).map(([, q]) => `- ${q[0].toUpperCase()}${q.slice(1)} : manquant`);
  const verifier = [...manque, ...aVerifier.map((t) => `- ${t}`)];
  const parties = [];
  if (mis.length) parties.push(`Voici ce que j'ai mis dans le projet :\n\n${mis.join('\n')}`);
  if (verifier.length) parties.push(`À vérifier :\n\n${verifier.join('\n')}\n\nDonnez-moi ce qui manque ici, même en vrac : je le range dans le projet.`);
  return parties.length ? parties.join('\n\n') : null;
}

/**
 * Remet le projet à jour depuis le dossier (30 oct. 2026, Jules : un projet rentré dès la Pré-analyse, puis analysé,
 * gardait ses chiffres de départ). Les chiffres du lot et les cases tranchées de l'Analyse remplacent ceux du projet ;
 * une valeur vide du dossier n'efface jamais celle du projet. Les photos, textes et réglages du projet ne bougent pas.
 */
export async function mettreAJourProjetDepuisDeal(dealId, user, { completerVides = true } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, error: 'Dossier introuvable' };
  const projet = deal.projet_id ? Records.get('Project', deal.projet_id) : null;
  if (!projet) return { ok: false, error: "Ce dossier n'a pas de projet." };
  const lot = lotOuVide(deal, 0);
  const { champs } = donneesDuLot(lot);
  const plein = (v) => v != null && v !== '' && v !== 0 && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  // Les hypothèses du simulateur (durée, taux, frais…) se règlent dans le projet : le dossier ne les pose que si le
  // projet n'en a pas, sans quoi chaque pièce importée remettait les valeurs par défaut.
  const hypotheses = new Set(Object.keys(mapperSimulateur({})).filter((k) => !['sim_prix_bien_fai', 'sim_prix_bien_negocie', 'sim_loyer_initial_ht', 'sim_surface'].includes(k)));
  const patch = Object.fromEntries(Object.entries(champs).filter(([k, v]) => plein(v) && !(hypotheses.has(k) && plein(projet[k]))));
  const { lireAnalyse } = await import('./analyse-pieces.js');
  const analyse = lireAnalyse(dealId);
  // Taxe foncière, charges, TVA déjà connues : elles remplissent ce que le projet n'a pas encore.
  for (const [k, v] of Object.entries(chargesConnues(lot.simulateur, analyse?.simulateur?.valeurs))) {
    if (projet[k] == null || projet[k] === '' || projet[k] === 0) patch[k] = v;
  }
  Object.assign(patch, champsDeLAnalyse(analyse, { tranchees: true }));
  // À l'arrivée d'une pièce, ce que l'IA vient d'y lire remplit aussi les cases encore vides du projet ; une case déjà
  // remplie ne change que par une valeur vérifiée.
  if (completerVides) {
    for (const [champ, v] of Object.entries(champsDeLAnalyse(analyse))) {
      if (!(champ in patch) && !plein(projet[champ])) patch[champ] = v;
    }
  }
  const { patch: pieces } = patchDepuisExtractions(deal, { ...projet, ...patch });
  Object.assign(patch, pieces);
  // Une case modifiée à la main dans le projet ne bouge plus (10 nov. 2026, Jules) : le dossier ne l'écrase jamais.
  for (const k of projet.champs_a_la_main || []) delete patch[k];
  // Une image déposée dans la Data Room s'ajoute aux photos du projet, une fois : retirée du projet, elle n'y revient pas.
  const vues = new Set(projet.photos_data_room || []);
  const nouvelles = photosDeLaDataRoom(deal).filter((p) => !vues.has(p.id));
  if (nouvelles.length) {
    patch.photos = [...(projet.photos || []), ...nouvelles.map((p) => p.url)];
    patch.photos_data_room = [...vues, ...nouvelles.map((p) => p.id)];
  }
  Records.update('Project', projet.id, { ...patch, maj_depuis_dossier_le: new Date().toISOString(), maj_depuis_dossier_par: user?.email || null });
  return { ok: true, project_id: projet.id, champs: Object.keys(patch).length };
}

/**
 * Le projet suit le dossier tout seul (30 oct. 2026, Jules : « lorsqu'on importe un nouveau document dans le dossier, je
 * veux que ça mette à jour le projet aussi ») : à chaque pièce importée ou lue, et à chaque information du bien posée.
 * Sans projet, rien ; une erreur ne bloque jamais le geste qui l'a lancé.
 */
export function projetSuitLeDossier(dealId, user = null) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal?.projet_id) return Promise.resolve(null);
  return mettreAJourProjetDepuisDeal(dealId, user, { completerVides: true })
    .catch((e) => { console.warn(`[projet] mise à jour depuis le dossier ${dealId} : ${e?.message || e}`); return null; });
}

/**
 * Crée le Project pré-rempli et passe le deal en `projet_cree`.
 * @returns {{ ok: true, project } | { ok: false, error }}
 */
export function creerProjetDepuisDeal(dealId, lotIndex, user, { analyse = null, ville = null, vente = null, imageVille = null } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
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
  const { adresseComplete, champs } = donneesDuLot(lot);
  // Remplir au maximum (30 oct. 2026, Jules) : ce que les pièces ont lu (Kbis, bail) complète le lot, sans l'écraser.
  for (const [k, v] of Object.entries(champsDeLAnalyse(analyse))) if (!champs[k] || motVide(champs[k])) champs[k] = v;
  Object.assign(champs, chargesConnues(lot.simulateur, analyse?.simulateur?.valeurs), travauxDuDossier(lot.simulateur));
  Object.assign(champs, simulateurDeLAnalyse(champs, analyse), ville || {});
  Object.assign(champs, simulateurDuDossier(lot.simulateur));
  champs.sim_apport = apportDuSimulateur(champs, lot.simulateur);
  for (const [k, v] of Object.entries(champsCompletsDeLAnalyse(analyse, deal))) if (!champs[k] || (Array.isArray(champs[k]) && !champs[k].length)) champs[k] = v;
  // Le type de bail de la Pré-analyse tient aussi la ligne « Type de bail » du bail (10 nov. 2026).
  if (champs.type_bail) {
    const lignes = (champs.bail_admin_fields || []).filter((l) => l.label !== 'Type de bail');
    champs.bail_admin_fields = [{ label: 'Type de bail', value: champs.type_bail }, ...lignes];
  }
  if (!champs.locataire_depuis && champs.bail_date_debut) champs.locataire_depuis = champs.bail_date_debut;
  if (!champs.bail_date_echeance && /^\d{4}-\d{2}-\d{2}/.test(String(champs.echeance_bail || ''))) champs.bail_date_echeance = champs.echeance_bail;
  // Les cases de la page projet qui redisent un chiffre du simulateur.
  if (Number(champs.sim_taxe_fonciere) > 0) champs.taxe_fonciere_an = champs.sim_taxe_fonciere;
  if (Number(champs.sim_charges_copropriete) > 0) champs.charges_copropriete = champs.sim_charges_copropriete;
  if (Number(champs.sim_loyer_initial_ht) > 0 && Number(champs.sim_surface) > 0) champs.loyer_m2_an = Math.round(champs.sim_loyer_initial_ht / champs.sim_surface);
  if (vente?.annee) Object.assign(champs, { derniere_vente_annee: vente.annee, detenu_depuis: String(vente.annee), ...(vente.prix ? { derniere_vente_prix: vente.prix } : {}) });
  const profil = profilDuKbis(analyse);
  if (profil && !champs.profil_locataire) champs.profil_locataire = profil;
  // Le titre garde l'écriture de l'enseigne ; seules les cases de la page passent en minuscules.
  const brut = { nom: champs.nom_locataire, activite: champs.activite_locataire };
  for (const k of ['nom_locataire', 'activite_locataire']) if (champs[k]) champs[k] = casse(champs[k]);
  if (champs.profil_locataire) champs.profil_locataire = casseProfil(champs.profil_locataire);

  // Tous les admins voient le projet, comme dans l'éditeur AdminProjets.
  const adminEmails = Records.filter('User', { role: 'admin' })
    .map((u) => u.email)
    .filter(Boolean);

  const projet = {
    // Un projet issu d'un deal de test est marqué pour être repérable (et
    // supprimé avec le deal).
    // Le nom du local, sans l'adresse (30 oct. 2026) : il vient du lot, sinon du Kbis lu dans l'Analyse.
    titre: `${deal.test ? '[TEST] ' : ''}${titreProjet(val(lot.lot.locataire_nom) || brut.nom, adresseComplete, [val(lot.lot.locataire_activite), brut.activite].find((a) => a && !motVide(a)) || null)}`,
    statut: 'analyse',
    archived: false,
    admin_principal: user?.email || adminEmails[0] || null,
    client_email: '',
    client_emails: [...new Set([...(adminEmails || []), user?.email].filter(Boolean))],

    ...champs,

    // Traçabilité et suivi client (toggles à plat).
    deal_id: deal.deal_id,
    suivi_message_envoye: false,
    suivi_retour_client: null,

    // L'image de la ville en premier, puis les images de la Data Room.
    photos: [imageVille, ...photosDeLaDataRoom(deal).map((p) => p.url)].filter(Boolean),
    photos_data_room: photosDeLaDataRoom(deal).map((p) => p.id),
    documents: [],
    ...piecesDuProjet(analyse),
  };

  // L'extraction des documents complète la fiche : bail, copropriété,
  // diagnostics, TVA. Il ne réécrit jamais ce que la préanalyse a déjà posé.
  const { patch, remplis } = patchDepuisExtractions(deal, projet);
  // L'ancienne lecture ne contredit ni ce qu'on a tapé dans le simulateur, ni l'Analyse.
  if ((lot.simulateur?.saisis || []).includes('loyerSoumisTVA') || typeof analyse?.simulateur?.valeurs?.loyerSoumisTVA === 'boolean') delete patch.sim_loyer_soumis_tva;
  // Un diagnostic lu deux fois (ancienne lecture et Analyse) n'a qu'une note, celle de l'Analyse.
  if (patch.notes_diagnostique) patch.notes_diagnostique = patch.notes_diagnostique.filter((n, i, t) => t.findIndex((x) => x.titre.toLowerCase() === n.titre.toLowerCase()) === i);
  Object.assign(projet, patch);
  // Le premier message du chat : ce qui a été mis, puis ce qu'il reste à vérifier.
  projet.questions_ouverture = questionsDuProjet({ ...projet, ...pointsDeLAnalyse(analyse) }, { aVerifier: aVerifierDansLAnalyse(analyse) });

  const cree = Records.create('Project', projet, user?.email);
  Records.update('Deal', deal.id, { projet_id: cree.id });
  changerStatut({ ...deal, projet_id: cree.id }, 'projet_cree', {
    user,
    note: `Projet créé : ${projet.titre}`,
  });

  return { ok: true, project: cree, champs_remplis: remplis };
}
