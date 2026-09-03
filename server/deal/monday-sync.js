// Klocka ↔ Monday, sur les colonnes réelles de vos tableaux.
//
// Répartition des rôles : Klocka analyse, Monday se souvient.
//
//   Klocka → « Propriétés Klocka » : chaque bien pré-analysé y figure, avec son
//     prix, son loyer, sa surface, son activité locataire et son statut. Un
//     dossier abandonné devient « Archivé », avec le motif en note — c'est la
//     mémoire des biens écartés, celle qu'on relit avant de refaire deux fois la
//     même analyse.
//
//   Monday → Klocka : investisseurs et agents restent tenus dans Monday. Klocka
//     les lit, ne les écrit jamais.
//
// L'écriture est repérée par l'identifiant d'élément conservé sur le dossier :
// rejouer une synchronisation met à jour, ne duplique pas.

import { Records } from '../db.js';
import { poserElement, lireTableau, TABLEAUX, mondayConfigure } from '../monday.js';
import { statutDe } from './lifecycle.js';
import { geocoder } from './geocodage.js';

// Colonnes du tableau « Propriétés Klocka », relevées sur place : dans Monday
// une colonne s'adresse par son identifiant, jamais par son titre.
const COL = {
  adresse: 'location',
  statut: 'status',
  prix: 'numbers',
  loyer: 'numeric_mkvnjean',
  surface: 'numbers6',
  activite: 'text_mkv6b9zy',
  notes: 'long_text_mkv69k9d',
  drive: 'link_mkxwyyh',
  annonce: 'link_mkv6k5b7',
  date: 'date_mkv6xqzp',
  agent: 'board_relation_mkv59rn8',
  acheteurs: 'connect_boards',
  personnes: 'multiple_person_mkv624cf',
};

// Le cycle de Klocka se lit dans les statuts déjà en place chez vous.
const STATUT_MONDAY = {
  analyse: 'Analyse en cours',
  documents_demandes: 'Attente de docs',
  documents_recus: 'Analyse en cours',
  depouille: 'Analyse en cours',
  projet_cree: 'Attribution en cours',
  abandonne: 'Archivé',
};

// Le cycle d'un projet, une fois le dossier entré en plateforme.
const STATUT_PROJET = {
  prospect: 'Analyse en cours',
  analyse: 'Analyse en cours',
  negociation: 'Négociation',
  financement: 'Sous offre',
  signe: 'Vendu',
};

// Qui a fait l'action entre au tableau, dans la colonne Personnes — sans en
// chasser un collègue déjà posé. Sans correspondance chez Monday, on ne pose
// rien : mieux vaut une case vide qu'un mauvais nom.
async function colonnePersonnes(par, itemId) {
  if (!par?.email && !par?.full_name) return null;
  try {
    const { personneMonday, personnesDe } = await import('../monday.js');
    const moi = await personneMonday({ email: par.email, nom: par.full_name });
    if (!moi) return null;
    const deja = itemId ? await personnesDe(itemId, COL.personnes) : [];
    const ids = Array.from(new Set([...deja, Number(moi.id)]));
    return { personsAndTeams: ids.map((id) => ({ id, kind: 'person' })) };
  } catch (e) {
    console.warn('[monday] personne non posée :', e?.message || e);
    return null;
  }
}

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);
const nombre = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function vueDuLot(deal) {
  const lot = deal.lots?.[0];
  // Pas encore de fiche : la coquille porte ce qu'on a entendu au téléphone.
  if (!lot) {
    const a = deal.apercu || {};
    return {
      ville: a.ville || '', rue: a.rue || '', lat: null, lon: null,
      prix: nombre(a.prix), loyer: nombre(a.loyer), surface: nombre(a.surface),
      activite: a.activite || '', verdict: '', motifs: [],
    };
  }
  const adresse = val(lot.lot?.adresse) || {};
  const commune = lot.enrichissement?.commune;
  return {
    ville: commune?.nom || adresse.ville || '',
    rue: adresse.rue || '',
    lat: commune?.centre?.lat ?? null,
    lon: commune?.centre?.lon ?? null,
    prix: nombre(val(lot.lot?.prix_fai)),
    loyer: nombre(val(lot.lot?.loyer_annuel_ht_hc)),
    surface: nombre(val(lot.lot?.surface_m2)),
    activite: lot.enrichissement?.activite?.libelle || val(lot.lot?.locataire_activite) || '',
    verdict: lot.evaluation?.verdict || '',
    motifs: (lot.evaluation?.motifs || []).map((m) => m.motif || m).filter(Boolean),
  };
}

/**
 * Valeur de la colonne « Adresse ».
 *
 * Monday refuse une adresse sans coordonnées : `{address}` seul est rejeté et
 * fait échouer toute la création. Quand le dossier ou le projet ne porte pas de
 * latitude, on géocode ; si l'adresse reste introuvable, on omet la colonne
 * plutôt que de perdre l'élément entier.
 */
export async function valeurAdresse({ adresse, lat, lon }) {
  if (!adresse) return null;
  if (lat != null && lon != null) {
    return { address: adresse, lat: String(lat), lng: String(lon) };
  }
  const trouve = await geocoder({ adresse });
  return trouve ? { address: adresse, lat: String(trouve.lat), lng: String(trouve.lon) } : null;
}

/** Fiche Monday de l'agent, retrouvée par son adresse mail. */
async function elementAgent(email) {
  if (!email || !TABLEAUX.agents) return null;
  const cherche = String(email).toLowerCase();
  const trouve = (await agents()).find((a) => a.email === cherche);
  return trouve?.id || null;
}

/**
 * Pose ou met à jour le bien dans « Propriétés ».
 * @param {object} deal
 * @param {{ motif?: string }} [opts]
 */
export async function pousserBien(deal, { motif, par = null } = {}) {
  if (!mondayConfigure()) return { ignore: true, raison: "aucun jeton Monday n'est déclaré (MONDAY_TOKEN)" };
  if (!TABLEAUX.proprietes)
    return { ignore: true, raison: 'le tableau Propriétés n\'est pas déclaré (MONDAY_BOARD_PROPRIETES)' };
  if (deal.test) return { ignore: true, raison: "c'est un dossier de test : rien n'est poussé dans le CRM" };

  const v = vueDuLot(deal);
  const statut = statutDe(deal);
  const nom = [v.ville, v.rue].filter(Boolean).join(' - ') || deal.nom || deal.deal_id;

  const colonnes = {};
  const adresseDeal = await valeurAdresse({
    adresse: [v.rue, v.ville].filter(Boolean).join(', '),
    lat: v.lat,
    lon: v.lon,
  });
  if (adresseDeal) colonnes[COL.adresse] = adresseDeal;
  if (STATUT_MONDAY[statut]) colonnes[COL.statut] = { label: STATUT_MONDAY[statut] };
  if (v.prix != null) colonnes[COL.prix] = v.prix;
  if (v.loyer != null) colonnes[COL.loyer] = v.loyer;
  if (v.surface != null) colonnes[COL.surface] = v.surface;
  if (v.activite) colonnes[COL.activite] = v.activite;
  if (deal.drive_folder_url) colonnes[COL.drive] = { url: deal.drive_folder_url, text: 'Dossier Drive' };

  const personnes = await colonnePersonnes(par, deal.monday_item_id);
  if (personnes) colonnes[COL.personnes] = personnes;

  // L'annonce déjà connue part avec la fiche ; sinon elle se cherche après
  // la pose (voir plus bas) — une recherche web prend jusqu'à deux minutes,
  // la pose ne doit pas attendre.
  if (deal.annonce_url) colonnes[COL.annonce] = { url: deal.annonce_url, text: 'Annonce' };
  const bienPourAnnonce = {
    rue: v.rue, ville: v.ville, prix: v.prix, surface: v.surface, loyer: v.loyer, activite: v.activite,
    locataire: val(deal.lots?.[0]?.lot?.locataire_nom),
    agence: deal.contact_agent_email || null,
  };

  // L'agent qui a transmis le bien est relié à sa fiche : c'est la liaison que
  // vous faites à la main aujourd'hui.
  const agentId = await elementAgent(deal.contact_agent_email);
  if (agentId) colonnes[COL.agent] = { item_ids: [Number(agentId)] };

  // La note dit pourquoi, pas seulement quoi : c'est elle qu'on relira dans six
  // mois pour ne pas refaire deux fois la même analyse.
  const note = [
    v.verdict ? `Verdict Klocka : ${v.verdict}` : null,
    motif || null,
    v.motifs.length ? v.motifs.join(' · ') : null,
  ]
    .filter(Boolean)
    .join('\n');
  if (note) colonnes[COL.notes] = note;

  // Un élément déjà posé se retrouve par son identifiant, gardé sur le dossier.
  const r = await poserElement(TABLEAUX.proprietes, {
    nom,
    colonnes,
    itemId: deal.monday_item_id || null,
    recreerSiInactif: !!par,
  });

  // Première pose : on retient l'identifiant pour ne jamais recréer.
  if (r?.id && r.id !== deal.monday_item_id) {
    Records.update('Deal', deal.id, { monday_item_id: String(r.id) });
  }
  if (r?.id) completerAnnonce('Deal', deal, bienPourAnnonce, r.id);
  return r;
}

// L'annonce publique du bien, retrouvée sur le web et vérifiée, rejoint la
// fiche Monday quand elle arrive. Jamais attendue, jamais bloquante : la pose
// est faite, le lien est un complément.
function completerAnnonce(entite, record, bien, itemId) {
  if (record.annonce_url) return;
  import('./annonce.js')
    .then(({ annonceDe }) => annonceDe(entite, record, bien))
    .then((url) => {
      if (!url) return null;
      return poserElement(TABLEAUX.proprietes, { nom: '', colonnes: { [COL.annonce]: { url, text: 'Annonce' } }, itemId });
    })
    .catch((e) => console.warn('[monday] annonce non complétée :', e?.message || e));
}

/**
 * Pose ou met à jour un projet de la plateforme dans « Propriétés ».
 * Même tableau que les dossiers : un bien reste le même bien, qu'il soit encore
 * à l'étude ou déjà attribué à un client.
 * @param {object} projet - enregistrement Project
 */
export async function pousserProjet(projet, { motif, par = null } = {}) {
  if (!mondayConfigure()) return { ignore: true, raison: "aucun jeton Monday n'est déclaré (MONDAY_TOKEN)" };
  if (!TABLEAUX.proprietes)
    return { ignore: true, raison: 'le tableau Propriétés n\'est pas déclaré (MONDAY_BOARD_PROPRIETES)' };
  if (!projet) return { ignore: true, raison: 'aucun projet fourni' };

  const nombreOuNull = (v) => (typeof v === 'number' && v > 0 ? v : null);
  // Les chiffres d'un projet vivent souvent dans les champs du simulateur : la
  // fiche d'en-tête reste à zéro tant que personne ne l'a remplie à la main.
  const chiffre = (...candidats) => candidats.map(nombreOuNull).find((v) => v != null) ?? null;
  const nom = projet.titre || projet.adresse_complete || `Projet ${projet.id}`;

  const colonnes = {};
  const adresseProjet = await valeurAdresse({
    adresse: projet.adresse_complete,
    lat: projet.latitude,
    lon: projet.longitude,
  });
  if (adresseProjet) colonnes[COL.adresse] = adresseProjet;
  if (STATUT_PROJET[projet.statut]) colonnes[COL.statut] = { label: STATUT_PROJET[projet.statut] };
  const prix = chiffre(projet.prix_acquisition, projet.sim_prix_bien_negocie, projet.sim_prix_bien_fai);
  const loyer = chiffre(projet.loyer_annuel_ht, projet.sim_loyer_initial_ht);
  const surface = chiffre(projet.surface_m2, projet.sim_surface);
  if (prix != null) colonnes[COL.prix] = prix;
  if (loyer != null) colonnes[COL.loyer] = loyer;
  if (surface != null) colonnes[COL.surface] = surface;
  if (projet.activite_locataire) colonnes[COL.activite] = projet.activite_locataire;

  const personnes = await colonnePersonnes(par, projet.monday_item_id);
  if (personnes) colonnes[COL.personnes] = personnes;

  if (projet.annonce_url) colonnes[COL.annonce] = { url: projet.annonce_url, text: 'Annonce' };
  const bienPourAnnonce = {
    rue: projet.adresse_complete, ville: projet.ville_secteur_champ1, prix, surface,
    loyer, activite: projet.activite_locataire, locataire: projet.nom_locataire,
  };

  const note = [
    projet.nom_locataire ? `Locataire : ${projet.nom_locataire}` : null,
    projet.echeance_bail ? `Échéance du bail : ${projet.echeance_bail}` : null,
    motif || null,
  ]
    .filter(Boolean)
    .join('\n');
  if (note) colonnes[COL.notes] = note;

  // Le dossier d'origine peut avoir déjà posé l'élément : on le réutilise
  // plutôt que d'en créer un second pour le même bien.
  const deal = projet.deal_id ? Records.filter('Deal', { deal_id: projet.deal_id })[0] : null;
  const itemId = projet.monday_item_id || deal?.monday_item_id || null;

  const r = await poserElement(TABLEAUX.proprietes, { nom, colonnes, itemId, recreerSiInactif: !!par });
  if (r?.id && r.id !== projet.monday_item_id) {
    Records.update('Project', projet.id, { monday_item_id: String(r.id) });
  }
  if (r?.id) completerAnnonce('Project', projet, bienPourAnnonce, r.id);
  return r;
}

// Monday limite le débit : on garde le tableau quelques minutes en mémoire.
const cache = new Map();
const DUREE_CACHE = 5 * 60 * 1000;

/**
 * Crée la fiche d'un agent immobilier dans Monday.
 *
 * Normalement Monday est la source des agents et Klocka ne fait que lire. Mais
 * un agent qui vient d'apporter un dossier n'y est pas encore : plutôt que de
 * laisser la liaison vide, on propose de l'y inscrire.
 */
export async function creerAgentMonday({ nom, email, telephone, ville, entreprise }) {
  if (!mondayConfigure()) return { ignore: true, raison: "aucun jeton Monday n'est déclaré (MONDAY_TOKEN)" };
  if (!TABLEAUX.agents)
    return { ignore: true, raison: "le tableau Agent immobilier n'est pas déclaré (MONDAY_BOARD_AGENTS)" };
  if (!email) return { erreur: 'Adresse mail manquante' };

  const colonnes = {
    email: { email, text: email },
    ...(telephone ? { phone: { phone: telephone, countryShortName: 'FR' } } : {}),
    ...(ville ? { text0: ville } : {}),
  };

  // « Entreprise » est une liste fermée : on n'y écrit que si le libellé existe
  // déjà. Créer des entrées à la volée polluerait durablement votre CRM — mais
  // l'omission doit se dire, sinon on croit l'information enregistrée.
  let entrepriseIgnoree = null;
  if (entreprise) {
    const connue = await libelleExistant(TABLEAUX.agents, COL_AGENT.entreprise, entreprise);
    if (connue) colonnes[COL_AGENT.entreprise] = { labels: [connue] };
    else entrepriseIgnoree = entreprise;
  }
  const r = await poserElement(TABLEAUX.agents, {
    nom: nom || email,
    colonnes,
    // Un agent se retrouve par son adresse : on ne crée pas deux fois la même fiche.
    cle: { colonne: 'email', valeur: email },
  });
  // La liste des agents est en cache : elle doit repartir de zéro.
  cache.delete('agents');
  return { ...r, entreprise_ignoree: entrepriseIgnoree };
}

// --- Lecture : investisseurs et agents restent tenus dans Monday ------------

// Colonnes du tableau « Clients ».
const COL_CLIENT = {
  email: 'email',
  telephone: 'phone',
  statut: 'status1',
  budget: 'numeric_mkv6khwn',
  apport: 'numeric_mkv27he0',
  localisation: 'location_mkv2tpc2',
  recherche: 'text_mkzm6pdz',
  objectif: 'color_mkzm7em7',
};

// Colonnes du tableau « Agent immobilier ».
const COL_AGENT = {
  email: 'email',
  telephone: 'phone',
  ville: 'text0',
  entreprise: 'dropdown_mkw4w1sz',
  priorite: 'status5',
  prenom: 'text_mm5g7dnm',
  date: 'date_mm5034ht',
  remarques: 'text4',
  relance: 'date',
  spoc: 'multiple_person_mkvez9f7',
};

const jourFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

/**
 * La note d'appel, dans la fiche de l'agent : prénom, date de l'appel, ce qui
 * a été dit dans « Remarques » (daté, au-dessus de ce qui y était), la
 * prochaine relance dans sa case, et qui a eu l'appel en SPOC. La fiche se
 * retrouve par l'adresse, sinon par le nom ; sinon elle naît.
 */
export async function noterAppelAgent({ prenom, nom, email, telephone, ville, entreprise, remarque, relance, par } = {}) {
  if (!mondayConfigure()) return { ignore: true, raison: "aucun jeton Monday n'est déclaré (MONDAY_TOKEN)" };
  if (!TABLEAUX.agents) return { ignore: true, raison: "le tableau Agent immobilier n'est pas déclaré (MONDAY_BOARD_AGENTS)" };

  const adresse = email ? String(email).trim().toLowerCase() : null;
  const nomComplet = [prenom, nom].filter(Boolean).join(' ').trim() || adresse || 'Agent';
  const lignes = await lireAvecCache(TABLEAUX.agents, 'agents');
  const existante =
    (adresse && lignes.find((l) => (l.colonnes[COL_AGENT.email] || '').toLowerCase() === adresse)) ||
    lignes.find((l) => norm(l.nom) === norm(nomComplet)) ||
    (nom && prenom && lignes.find((l) => norm(l.nom).includes(norm(nom)) && norm(l.nom).includes(norm(prenom)))) ||
    null;

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const ancienne = existante?.colonnes[COL_AGENT.remarques] || '';
  const ligne = remarque ? `[${jourFr(new Date().toISOString())}] ${String(remarque).trim()}` : null;
  const colonnes = {
    ...(prenom ? { [COL_AGENT.prenom]: prenom } : {}),
    [COL_AGENT.date]: { date: aujourdhui },
    ...(ligne ? { [COL_AGENT.remarques]: [ligne, ancienne].filter(Boolean).join('\n') } : {}),
    ...(relance ? { [COL_AGENT.relance]: { date: relance } } : {}),
    ...(adresse ? { email: { email: adresse, text: adresse } } : {}),
    ...(telephone ? { phone: { phone: String(telephone).replace(/\s+/g, ''), countryShortName: 'FR' } } : {}),
    ...(ville ? { text0: ville } : {}),
  };
  let entrepriseIgnoree = null;
  if (entreprise) {
    const connue = await libelleExistant(TABLEAUX.agents, COL_AGENT.entreprise, entreprise);
    if (connue) colonnes[COL_AGENT.entreprise] = { labels: [connue] };
    else entrepriseIgnoree = entreprise;
  }
  if (par?.email) {
    try {
      const { personneMonday } = await import('../monday.js');
      const moi = await personneMonday({ email: par.email, nom: par.full_name });
      if (moi) colonnes[COL_AGENT.spoc] = { personsAndTeams: [{ id: Number(moi.id), kind: 'person' }] };
    } catch {
      /* sans correspondance, la case reste telle quelle */
    }
  }

  const r = await poserElement(TABLEAUX.agents, {
    nom: existante?.nom || nomComplet,
    colonnes,
    itemId: existante?.id || null,
    cle: adresse && !existante ? { colonne: 'email', valeur: adresse } : null,
  });
  cache.delete('agents');
  return { ...r, cree: !existante, entreprise_ignoree: entrepriseIgnoree, nom: existante?.nom || nomComplet };
}

/**
 * Tout ce qui attend une relance, lu dans le tableau des agents : la date de
 * relance, et les remarques comme résumé. Du plus en retard au plus lointain.
 */
export async function relancesAgents() {
  if (!mondayConfigure() || !TABLEAUX.agents) return [];
  const lignes = await lireAvecCache(TABLEAUX.agents, 'agents');
  const JOUR = 86400000;
  const minuit = new Date();
  minuit.setHours(0, 0, 0, 0);
  return lignes
    .filter((l) => l.colonnes[COL_AGENT.relance])
    .map((l) => {
      const relance = l.colonnes[COL_AGENT.relance];
      const dans = Math.round((new Date(relance).getTime() - minuit.getTime()) / JOUR);
      return {
        id: l.id,
        nom: l.nom,
        prenom: l.colonnes[COL_AGENT.prenom] || '',
        entreprise: l.colonnes[COL_AGENT.entreprise] || '',
        email: (l.colonnes[COL_AGENT.email] || '').toLowerCase(),
        telephone: l.colonnes[COL_AGENT.telephone] || '',
        ville: l.colonnes[COL_AGENT.ville] || '',
        dernier_appel: l.colonnes[COL_AGENT.date] || null,
        relance,
        dans,
        remarques: l.colonnes[COL_AGENT.remarques] || '',
        url: `https://klocka-company.monday.com/boards/${TABLEAUX.agents}/pulses/${l.id}`,
      };
    })
    .sort((a, b) => a.dans - b.dans);
}


/** Oublier une lecture en cache — après avoir écrit, on veut relire vrai. */
export function oublierCache(cle) {
  cache.delete(cle);
}

async function lireAvecCache(boardId, cle) {
  const vu = cache.get(cle);
  if (vu && Date.now() - vu.le < DUREE_CACHE) return vu.lignes;
  const lignes = await lireTableau(boardId);
  cache.set(cle, { le: Date.now(), lignes });
  return lignes;
}

const enNombre = (t) => {
  const n = Number(String(t ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Les investisseurs, tels que Monday les tient. */
export async function investisseurs() {
  if (!mondayConfigure() || !TABLEAUX.investisseurs) return [];
  const lignes = await lireAvecCache(TABLEAUX.investisseurs, 'investisseurs');
  return lignes.map((l) => ({
    id: l.id,
    nom: l.nom,
    email: l.colonnes[COL_CLIENT.email] || '',
    statut: l.colonnes[COL_CLIENT.statut] || '',
    budget: enNombre(l.colonnes[COL_CLIENT.budget]),
    apport: enNombre(l.colonnes[COL_CLIENT.apport]),
    localisation: l.colonnes[COL_CLIENT.localisation] || '',
    recherche: l.colonnes[COL_CLIENT.recherche] || '',
    objectif: l.colonnes[COL_CLIENT.objectif] || '',
  }));
}

/** Le libellé d'une liste fermée, s'il existe déjà (comparaison insensible à la casse). */
async function libelleExistant(boardId, colonneId, valeur) {
  try {
    const { colonnesDuTableau } = await import('../monday.js');
    const colonnes = await colonnesDuTableau(boardId);
    const col = colonnes.find((c) => c.id === colonneId);
    const reglages = col?.settings_str ? JSON.parse(col.settings_str) : {};
    const libelles = Object.values(reglages.labels || {}).map((l) => (typeof l === 'object' ? l.name : l));
    return libelles.find((l) => String(l).toLowerCase() === String(valeur).toLowerCase()) || null;
  } catch {
    return null;
  }
}

/** Les agents immobiliers, tels que Monday les tient. */
export async function agents() {
  if (!mondayConfigure() || !TABLEAUX.agents) return [];
  const lignes = await lireAvecCache(TABLEAUX.agents, 'agents');
  return lignes.map((l) => ({
    id: l.id,
    // Le nom de l'élément porte déjà le nom complet : y ajouter la colonne
    // « Prénom » donnerait « Damien Damien ROUCHER ».
    nom: l.nom,
    email: (l.colonnes[COL_AGENT.email] || '').toLowerCase(),
    telephone: l.colonnes[COL_AGENT.telephone] || '',
    ville: l.colonnes[COL_AGENT.ville] || '',
    entreprise: l.colonnes[COL_AGENT.entreprise] || '',
    priorite: l.colonnes[COL_AGENT.priorite] || '',
  }));
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Un montant se lit en milliers jusqu'au million, puis en millions : « 2 020 k€ »
// se déchiffre, « 2 M€ » se lit.
const somme = (n) => {
  if (!n) return null;
  if (n < 1_000_000) return `${Math.round(n / 1000)} k€`;
  const millions = Math.round((n / 1_000_000) * 10) / 10;
  return `${String(millions).replace('.', ',')} M€`;
};

// En dessous, la correspondance ne repose sur rien de solide : un budget
// simplement « suffisant » ne dit pas qu'un client cherche ce bien-là.
const SCORE_MINIMUM = 3;

// Trois pistes se regardent ; dix ne se regardent pas.
const MAX_CANDIDATS = 3;

/**
 * Investisseurs Monday dont le budget et la zone collent à un bien.
 * Un critère absent ne disqualifie pas ; chaque rapprochement dit pourquoi.
 *
 * @param {{cout: number, ville: string}} bien
 */
export async function investisseursPourBien({ cout, ville: nomVille }) {
  if (!cout) return [];

  const ville = norm(nomVille);
  const ecartes = ['Abandonné', 'Projet Signé', 'Compromis'];

  const resultats = [];
  for (const c of await investisseurs()) {
    if (ecartes.includes(c.statut)) continue;
    const raisons = [];
    // Le score sépare une vraie piste d'une simple compatibilité arithmétique :
    // un budget de 1 000 k€ « passe » sur un bien à 210 k€ sans rien dire.
    let score = 0;

    if (c.budget) {
      if (c.budget < cout * 0.9) continue; // hors budget : on écarte franchement
      const rapport = c.budget / cout;
      // Le bien occupe une part sérieuse du budget : c'est là que ça se joue.
      if (rapport <= 1.6) score += 3;
      else if (rapport <= 2.5) score += 1;
      raisons.push(`budget ${somme(c.budget)} pour ${somme(cout)}`);
    }
    if (c.apport && c.apport >= cout * 0.15) {
      score += 1;
      raisons.push(`apport ${somme(c.apport)}`);
    }
    // On dit quel champ a matché : afficher « Nice » parce que le lieu de
    // recherche mentionnait Lyon serait trompeur.
    if (ville) {
      if (norm(c.recherche).includes(ville)) {
        // Chercher précisément cette ville est le signal le plus fort.
        score += 4;
        raisons.push(`cherche sur ${c.recherche}`);
      } else if (norm(c.localisation).includes(ville)) {
        score += 2;
        raisons.push(`basé à ${c.localisation}`);
      } else if (norm(c.recherche).includes('partout') || norm(c.localisation).includes('partout')) {
        score += 1;
        raisons.push('cherche partout');
      }
    }

    // Un score trop faible n'est pas une piste : sans ce seuil, tous les
    // investisseurs dont le budget dépasse le prix ressortaient sur chaque
    // bien, et la liste affichait invariablement cinq noms sans rapport.
    if (raisons.length && score >= SCORE_MINIMUM) resultats.push({ client: c, raisons, score });
  }

  // Le meilleur score d'abord ; à égalité, le budget le plus proche du bien —
  // et non le plus gros, qui correspondrait à tout.
  return resultats
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.client.budget || Infinity) - (b.client.budget || Infinity)
    )
    .slice(0, MAX_CANDIDATS);
}

/** Rapprochement pour un dossier de préanalyse. */
export async function investisseursPourDeal(deal) {
  const v = vueDuLot(deal);
  return investisseursPourBien({ cout: v.prix, ville: v.ville });
}

/**
 * Rapprochement pour un projet de la plateforme.
 * Le prix se cherche aussi dans les champs du simulateur : la fiche d'en-tête
 * reste souvent à zéro.
 */
export async function investisseursPourProjet(projet) {
  const nombre = (v) => (typeof v === 'number' && v > 0 ? v : null);
  const cout =
    [projet.prix_acquisition, projet.sim_prix_bien_negocie, projet.sim_prix_bien_fai]
      .map(nombre)
      .find((v) => v != null) ?? null;
  return investisseursPourBien({ cout, ville: projet.ville_secteur_champ1 || '' });
}
