// Le mode appel de la prospection (6 oct. 2026) : une ville, ses agences
// rangées par ce qui compte (relance due d'abord, les agences de commerce
// avant le résidentiel, les mortes en gris à la fin), puis une file d'appels
// pensée pour le téléphone. L'analyste appelle, tape l'issue en un geste, et
// ne dicte que pour les vraies conversations. La plateforme écrit dans
// Monday, puis RELIT Monday : le reçu dit ce qui y est réellement, pas ce qui
// a été demandé. Un échec reste orange et se réessaie seul.

import { Records } from '../db.js';
import * as R from './regles.js';
import { ligneDeRemarque } from './monday-agents.js';

const AGENCE = 'AgenceProspect';
const LISTE = 'ListeAgences';
const SESSION = 'SessionAppel';
const ATTENTE = 'MondayAttente';
const APPEL = 'AppelAgent';
const maintenant = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Ce qui fait remonter une agence : le commerce et l'entreprise
// ---------------------------------------------------------------------------

const COMMERCE = /\b(commerces?|commercial|commerciale|commerciaux|fonds|entreprises?|bureaux|locaux|murs|pro|professionnel|investissement|cessions?|tertiaire|retail|business|horeca|cbre|bnp|bnppre|arthur loyd|jll|cushman|knight frank|keops|ace)\b/i;
const RESIDENTIEL = /\b(locations?|gestion locative|syndic|saisonnieres?|vacances|residences?|logements?|habitat|appartements?|villas?|luxe|prestige|sotheby'?s?|viager)\b/i;

/**
 * Pure : la pertinence d'une agence pour Klocka. Le nom d'abord (« Azurea
 * Commerces & Entreprises », « Liberté Commerces »), puis ses annonces de
 * commerce chez Equimmox. Une agence qui ne parle que de location
 * résidentielle descend. C'est le tri que l'équipe faisait de tête.
 */
export function pertinence(a) {
  const nom = [a?.nom, a?.raison_sociale].filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Ses spécialités chez Apollo (« immobilier commercial », « fonds de commerce »).
  const mots = (a?.apollo_mots || []).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const motifs = [];
  let score = 0;
  const commerce = COMMERCE.test(nom);
  if (commerce) { score += 5; motifs.push('commerce ou entreprise'); }
  if (!commerce && /(immobilier commercial|commercial real estate|commerces?|fonds de commerce|immobilier d.entreprise|bureaux|locaux commerciaux|retail)/i.test(mots)) { score += 3; motifs.push('spécialité commerce (Apollo)'); }
  const n = Number(a?.annonces_commerce) || 0;
  if (n) { score += Math.min(4, n); motifs.push(`${n} annonce${n > 1 ? 's' : ''} de commerce`); }
  const residentiel = (RESIDENTIEL.test(nom) || (/(luxe|location saisonniere|gestion locative|residentiel)/i.test(mots) && !/(commercial|commerce)/i.test(mots))) && !commerce;
  if (residentiel) { score -= 3; motifs.push('résidentiel'); }
  return { score, specialite: score >= 4 ? 'commerce' : residentiel ? 'residentiel' : 'generaliste', motifs };
}

// ---------------------------------------------------------------------------
// Le statut d'une agence, croisé avec Monday et nos appels
// ---------------------------------------------------------------------------

const MORT = /\b(mort|morte|ne plus|perdu|ferm|cess|liquid|blacklist|archiv)/i;
const INTERESSE = /(int[ée]ress|discussion|chaud|partenaire|envoie des fiches|contact r[ée]gulier|a des murs)/i;

/** Pure : le prénom d'une adresse de l'équipe. */
const prenom = (email) => {
  const p = String(email || '').split('@')[0].split(/[._-]/)[0];
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};

/** Pure : une date Monday ou ISO en AAAA-MM-JJ, ou null. */
export function jourIso(v) {
  const t = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Pure : « il y a 3 semaines », « hier », « aujourd'hui ». */
export function ilYa(jour, maintenantD = new Date()) {
  const j = jourIso(jour);
  if (!j) return null;
  const jours = Math.round((Date.parse(`${R.jourDe(maintenantD)}T12:00:00Z`) - Date.parse(`${j}T12:00:00Z`)) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 14) return `il y a ${jours} jours`;
  if (jours < 60) return `il y a ${Math.round(jours / 7)} semaines`;
  if (jours < 365) return `il y a ${Math.round(jours / 30)} mois`;
  const ans = Math.round(jours / 365);
  return `il y a ${ans} an${ans > 1 ? 's' : ''}`;
}

/**
 * Pure : où en est une agence. `etat` : jamais (jamais contactée), contact
 * (déjà en contact), relance (relance due, en haut), morte (en gris, à ne pas
 * rappeler). `probable` : Monday ne la reconnaît que par son nom ou son
 * domaine, l'écran le dit au lieu de trancher.
 */
export function statutDeLAgence(a, { fiche = null, appels = [], maintenantD = new Date() } = {}) {
  const jour = R.jourDe(maintenantD);
  // Les rapprochements d'avant le 6 oct. 2026 n'ont pas de confiance : elle se
  // déduit de ce qui a reconnu l'agence (le numéro ou le mail sont sûrs).
  const mc0 = a?.monday_connu || null;
  const mc = mc0 && !mc0.confiance ? { ...mc0, confiance: ['téléphone', 'mail', 'un de ses agents'].includes(mc0.par) ? 'sure' : 'probable' } : mc0;
  const dernier = [...appels].sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] || null;
  const morte = !!(a?.fermee || a?.morte || fiche?.statut === 'archive' || (mc?.confiance === 'sure' && MORT.test(mc.statut || '')) || dernier?.issue === 'invalide');
  const relanceLe = fiche?.prochaine?.le || jourIso(mc?.relance) || null;
  const relanceDue = !morte && relanceLe && relanceLe <= jour;
  const contacte = !!(dernier || fiche?.dernier_contact_le || mc);
  const qui = dernier?.par || fiche?.referent || mc?.qui || null;
  const quand = dernier?.le || fiche?.dernier_contact_le || mc?.date || null;
  const dernierStatut = dernier ? (R.ISSUES[dernier.issue] || dernier.issue) : fiche?.statut && fiche.statut !== 'nouveau' ? R.STATUTS[fiche.statut] : mc?.statut || null;
  const etat = morte ? 'morte' : relanceDue ? 'relance' : contacte ? 'contact' : 'jamais';
  const probable = !dernier && !fiche?.dernier_contact_le && mc?.confiance === 'probable';
  const morceaux = [qui ? prenom(qui) : null, quand ? ilYa(quand, maintenantD) : null, dernierStatut ? String(dernierStatut).toLowerCase() : null].filter(Boolean);
  const libelle = {
    morte: 'Morte',
    relance: `Relance due${relanceLe ? ` depuis le ${R.dateCourte(relanceLe)}` : ''}`,
    contact: probable ? 'Correspondance probable' : 'Déjà en contact',
    jamais: 'Jamais contactée',
  }[etat];
  const interessee = !morte && (INTERESSE.test(dernierStatut || '') || ['en_discussion', 'envoie_des_fiches'].includes(fiche?.statut));
  const aRappeler = !morte && (relanceDue || fiche?.statut === 'a_rappeler');
  // À qui est l'agent : au premier de l'équipe qui l'a joint (le référent de
  // la fiche), sinon au SPOC de sa ligne Monday.
  const proprietaire = fiche?.referent || (mc?.confiance === 'sure' ? mc?.qui : null) || null;
  return { etat, libelle, detail: morceaux.join(', ') || null, probable, qui, quand, dernier_statut: dernierStatut, relance_le: relanceLe, interessee, a_rappeler: aRappeler, appelee: !!dernier, derniere_issue: dernier?.issue || null, tentatives: fiche?.tentatives || 0, proprietaire };
}

// Un agent immatriculé en nom propre (« Monsieur Nicolas Mouette ») : le code
// d'activité « agence immobilière » de Data-B compte aussi les mandataires
// indépendants. Un nom relevé sur des annonces, sans numéro ni site, n'est
// pas une agence qu'on appelle.
const PERSONNE = /^(monsieur|madame|mademoiselle|m\.|mme)\s+/i;

/** Pure : ce qu'est une ligne : une agence, un agent indépendant, une société sans vitrine, ou un nom d'annonce. */
export function genreDe(a) {
  if (PERSONNE.test(String(a?.raison_sociale || '')) || PERSONNE.test(String(a?.nom || ''))) return 'independant';
  if (!a?.telephone && !a?.site && !(a?.agents || []).some((x) => x.telephone) && (a?.sources || []).every((x) => x === 'Equimmox')) return 'annonceur';
  // Une agence a une vitrine : une fiche Google Maps, ou des annonces publiées
  // sur Equimmox. Une société trouvée seulement au registre (Data-B) ou chez
  // Apollo, sans l'une ni l'autre, est mise à part (6 oct. 2026 : 1 060 lignes
  // à Nice, dont à peine plus de 550 agences réelles). Une ligne qu'on suit
  // (au carnet, associée à quelqu'un) reste une agence.
  const sources = a?.sources || [];
  const vitrine = sources.includes('Google Maps') || sources.includes('Equimmox') || !!a?.place_id;
  const suivie = !!a?.carnet_id || (a?.pour || []).length > 0 || !!a?.monday_connu;
  if (sources.length && !vitrine && !suivie) return 'societe';
  return 'agence';
}

/** Pure : l'ordre de la ville. Relance due d'abord, puis le commerce avant le résidentiel, les jamais contactées avant les autres, les mortes à la fin. */
export function ordreDeLaVille(lignes) {
  const rang = (x) => (x.statut.etat === 'relance' ? 0 : x.statut.etat === 'morte' ? 2 : 1);
  // Les agences d'abord, puis les indépendants, puis les noms d'annonces.
  const genre = (x) => ({ agence: 0, societe: 1, independant: 2, annonceur: 3 })[x.genre || 'agence'] ?? 0;
  return [...lignes].sort((x, y) => rang(x) - rang(y)
    || genre(x) - genre(y)
    || y.pertinence.score - x.pertinence.score
    || (x.statut.etat === 'jamais' ? 0 : 1) - (y.statut.etat === 'jamais' ? 0 : 1)
    || (y.annonces || 0) - (x.annonces || 0)
    || String(x.nom).localeCompare(String(y.nom), 'fr'));
}

/** Les fiches du carnet et les appels d'une liste, lus une fois. */
function contexte(agences) {
  const ids = new Set(agences.map((a) => a.carnet_id).filter(Boolean));
  const fiches = new Map(Records.list('AgentImmo').filter((x) => ids.has(x.id)).map((x) => [x.id, x]));
  const appels = new Map();
  for (const x of Records.list(APPEL)) {
    if (!ids.has(x.agent_id) || x.essai_archive) continue;
    if (!appels.has(x.agent_id)) appels.set(x.agent_id, []);
    appels.get(x.agent_id).push(x);
  }
  return { fiches, appels };
}

/** Les lignes d'une ville, chacune avec son statut et sa pertinence, dans l'ordre. */
export function annoter(agences, maintenantD = new Date()) {
  const { fiches, appels } = contexte(agences);
  return ordreDeLaVille(agences.map((a) => ({
    ...a,
    statut: statutDeLAgence(a, { fiche: fiches.get(a.carnet_id) || null, appels: appels.get(a.carnet_id) || [], maintenantD }),
    pertinence: pertinence(a),
    genre: genreDe(a),
  })));
}

/**
 * Pure : la barre de la ville. Les agences seules sont comptées (pas les
 * mandataires indépendants ni les noms d'annonces, à part) ; « fait » est la
 * part des agences vivantes déjà contactées.
 */
export function chiffresDeLaVille(lignes) {
  const agences = lignes.filter((x) => (x.genre || 'agence') === 'agence');
  const vivantes = agences.filter((x) => x.statut.etat !== 'morte');
  const faites = vivantes.filter((x) => x.statut.appelee || x.statut.etat === 'contact' || x.statut.etat === 'relance').length;
  return {
    agences: agences.length,
    appelees: faites,
    fait_pourcent: vivantes.length ? Math.round((faites / vivantes.length) * 100) : 0,
    interessees: vivantes.filter((x) => x.statut.interessee).length,
    a_rappeler: vivantes.filter((x) => x.statut.a_rappeler).length,
    mortes: agences.length - vivantes.length,
    independants: lignes.filter((x) => x.genre === 'independant').length,
    annonceurs: lignes.filter((x) => x.genre === 'annonceur').length,
    societes: lignes.filter((x) => x.genre === 'societe').length,
  };
}

// ---------------------------------------------------------------------------
// Les recherches clients de la zone : ce qu'on pitche
// ---------------------------------------------------------------------------

const k = (n) => (n >= 1_000_000 ? `${String(Math.round(n / 100_000) / 10).replace('.', ',')} M€` : `${Math.round(n / 1000)} k€`);

// Les zones des recherches sont écrites à la main (« Est de la France en
// priorité », « Proche Bretagne », « Sud ») : on les rapproche de la ville par
// son département. Les régions, et les grands points cardinaux qu'emploient
// les clients.
const REGIONS = {
  'ile de france|paris|idf|region parisienne': ['75', '77', '78', '91', '92', '93', '94', '95'],
  'provence|paca|cote d azur|riviera|alpes maritimes|var|marseille|sud est': ['04', '05', '06', '13', '83', '84'],
  'occitanie|languedoc|toulouse|montpellier|sud ouest': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'nouvelle aquitaine|aquitaine|bordeaux|sud ouest': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  'auvergne|rhone alpes|lyon|savoie|alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'grand est|alsace|lorraine|champagne|est de la france|strasbourg': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'bourgogne|franche comte|dijon': ['21', '25', '39', '58', '70', '71', '89', '90'],
  'hauts de france|nord|picardie|lille': ['02', '59', '60', '62', '80'],
  'normandie|rouen|caen': ['14', '27', '50', '61', '76'],
  'bretagne|rennes|brest': ['22', '29', '35', '56'],
  'pays de la loire|nantes|angers|vendee': ['44', '49', '53', '72', '85'],
  'centre val de loire|tours|orleans': ['18', '28', '36', '37', '41', '45'],
  'corse': ['2A', '2B', '20'],
};
const SUD = ['04', '05', '06', '09', '11', '12', '13', '30', '31', '32', '34', '40', '46', '47', '48', '64', '65', '66', '81', '82', '83', '84'];
const PARTOUT = /(toute la france|france entiere|partout|toutes? regions?|peu importe|indifferent)/;

/** Pure : la zone écrite d'une recherche couvre-t-elle cette ville (son nom, ou son département) ? `partout` à part. */
export function zoneCouvre(zone, { ville = null, departement = null } = {}) {
  const z = R.norm(zone).replace(/[-']/g, ' ');
  if (!z) return null;
  if (PARTOUT.test(z)) return 'partout';
  const v = R.norm(ville).replace(/[-']/g, ' ');
  if (v && (z.includes(v) || v.includes(z))) return 'ville';
  if (!departement) return null;
  if (/\bsud\b/.test(z) && !/sud (est|ouest)/.test(z) && SUD.includes(departement)) return 'region';
  for (const [noms, deps] of Object.entries(REGIONS)) {
    if (noms.split('|').some((n) => new RegExp(`\\b${n}\\b`).test(z)) && deps.includes(departement)) return 'region';
  }
  if (new RegExp(`\\b${departement}\\b`).test(z)) return 'region';
  return null;
}

/**
 * Pure : les recherches actives qui portent sur la ville, en une ligne
 * chacune (« murs de commerce, 300 à 800 k€, Est de la France »), les plus
 * précises d'abord ; celles « toute la France » regroupées en une ligne.
 */
export function recherchesDeLaZone(demandes, ville, { departement = null } = {}) {
  const precises = [];
  const partout = [];
  for (const d of demandes || []) {
    if (!d.active || d.visible === false) continue;
    const zones = [...(d.zones || []), d.zone_libre].filter(Boolean);
    let portee = null;
    let zone = null;
    for (const z of zones) {
      const p = zoneCouvre(z, { ville, departement });
      if (p && (!portee || p === 'ville' || (p === 'region' && portee === 'partout'))) { portee = p; zone = z; }
    }
    if (!portee) continue;
    if (portee === 'partout') { partout.push(d); continue; }
    const prix = d.budget_min && d.budget_max ? `${k(d.budget_min)} à ${k(d.budget_max)}` : d.budget_max ? `jusqu'à ${k(d.budget_max)}` : null;
    const quoi = d.type_commerce ? `murs de ${d.type_commerce}` : 'murs de commerce';
    precises.push({ rang: portee === 'ville' ? 0 : 1, texte: [quoi, prix, R.norm(zone) === R.norm(ville) ? null : zone, d.rendement_min ? `rendement ${d.rendement_min} % mini` : null].filter(Boolean).join(', ') });
  }
  const lignes = [...new Set(precises.sort((a, b) => a.rang - b.rang).map((x) => x.texte))].slice(0, 4);
  if (partout.length) {
    const budgets = partout.flatMap((d) => [d.budget_min, d.budget_max]).filter((n) => n > 0);
    const fourchette = budgets.length ? `, de ${k(Math.min(...budgets))} à ${k(Math.max(...budgets))}` : '';
    lignes.push(`${partout.length} client${partout.length > 1 ? 's' : ''} partout en France${fourchette}`);
  }
  return lignes;
}

/** Pure : le département d'une liste, celui de la plupart de ses agences. */
export function departementDe(agences) {
  const compte = {};
  for (const a of agences || []) {
    const cp = String(a.code_postal || String(a.adresse || '').match(/\b\d{5}\b/)?.[0] || '');
    if (!/^\d{5}$/.test(cp)) continue;
    const dep = cp.startsWith('20') ? (Number(cp) < 20200 ? '2A' : '2B') : cp.slice(0, 2);
    compte[dep] = (compte[dep] || 0) + 1;
  }
  return Object.entries(compte).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

// ---------------------------------------------------------------------------
// La file
// ---------------------------------------------------------------------------

// Les mots qui ne disent pas le réseau d'une agence (« Agence », « Immobilier »).
const MOTS_GENERIQUES = new Set(['agence', 'agences', 'immobilier', 'immobiliere', 'immo', 'cabinet', 'groupe', 'transaction', 'transactions', 'commerce', 'commerces', 'entreprise', 'entreprises', 'conseil', 'gestion', 'monsieur', 'madame', 'real', 'estate', 'properties', 'immobilieres']);
const marquesDe = (nom, ville) => {
  const villeMot = R.norm(ville || '');
  return new Set(R.norm(nom).split(' ').filter((m) => m.length >= 4 && !MOTS_GENERIQUES.has(m) && m !== villeMot));
};

/** Pure : une agence du même réseau appelée ce dernier mois (« évitez de pitcher deux fois »), ou null. Un mot qui compte en commun suffit : c'est un avertissement, pas un tri. */
export function reseauDe(a, lignes, maintenantD = new Date(), ville = null) {
  const mots = marquesDe(a.nom, ville);
  if (!mots.size) return null;
  const ilYaUnMois = R.jourDe(new Date(maintenantD.getTime() - 30 * 86400000));
  const autre = lignes.find((x) => x.id !== a.id && x.statut?.quand && String(x.statut.quand).slice(0, 10) >= ilYaUnMois && [...marquesDe(x.nom, ville)].some((m) => mots.has(m)));
  return autre ? `Même réseau que ${autre.nom}, contactée le ${R.dateCourte(String(autre.statut.quand).slice(0, 10))} : évitez de pitcher deux fois.` : null;
}

/** Le numéro à appeler : celui de l'agence, sinon celui d'un de ses agents. */
const numeroDe = (a) => a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || null;

const SANS_REPONSE = ['pas_de_reponse', 'repondeur'];
const RESERVATION_MS = 5 * 60 * 1000;

/** Pure : l'agence est-elle tenue à l'écran par un collègue ? */
export const reserveeParUnAutre = (a, moi, maintenantD = new Date()) => !!a?.reservee?.par && a.reservee.par !== moi && String(a.reservee.jusqu || '') > maintenantD.toISOString();

/**
 * Pure : la place d'une agence dans la file d'une personne, ou null si elle
 * n'y entre pas. 0 : un contact donné pendant un appel, à appeler en tête ;
 * 1 : ses relances dues ; 2 : les sans-réponse à retenter ; 3 : les jamais
 * contactées. Hors de la file : les mortes (dont « Ne plus appeler »), les
 * agents d'un collègue, les agences appelées ou passées aujourd'hui, celles
 * qu'un collègue a à l'écran.
 */
export function placeDansLaFile(a, moi, { jour, fiche = null, maintenantD = new Date() } = {}) {
  if (a.statut.etat === 'morte' || !numeroDe(a) || a.genre === 'annonceur' || a.ne_plus_appeler) return null;
  const pour = a.pour || [];
  if (pour.length && !pour.includes(moi)) return null;
  const proprietaire = a.statut.proprietaire;
  if (proprietaire && proprietaire !== moi) return null;
  if (reserveeParUnAutre(a, moi, maintenantD)) return null;
  if (fiche && R.verrouTenu(fiche.verrou) && fiche.verrou.par !== moi) return null;
  if (a.prioritaire?.le === jour && (!a.prioritaire.par || a.prioritaire.par === moi)) return 0;
  if (a.passee?.le === jour && a.passee.par === moi) return null;
  if (a.statut.quand && String(a.statut.quand).slice(0, 10) === jour) return null;
  const due = !!a.statut.relance_le && a.statut.relance_le <= jour;
  if (SANS_REPONSE.includes(a.statut.derniere_issue)) return due ? 2 : null;
  if (a.statut.etat === 'relance' && due) return 1;
  if (a.statut.etat === 'jamais') return 3;
  return null;
}

/** Pure : le badge de la fiche : « Jamais contactée », « Relance », « 2e tentative ». */
export function badgeDe(place, tentatives = 0) {
  if (place === 0) return 'Contact donné';
  if (place === 1) return 'Relance';
  if (place === 2) return `${Math.max(2, (tentatives || 0) + 1)}e tentative`;
  return 'Jamais contactée';
}

/**
 * La file d'une ville pour une personne, dans l'ordre de la spec : ses
 * relances dues, les sans-réponse à retenter, puis les jamais contactées, les
 * plus pertinentes d'abord. Une agence par numéro.
 */
export function fileDAppel(listeId, user, { maintenantD = new Date() } = {}) {
  const l = Records.get(LISTE, listeId);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  const moi = String(user?.email || '').toLowerCase();
  const agences = Records.list(AGENCE).filter((a) => a.liste_id === listeId && !a.hors_cible);
  const lignes = annoter(agences, maintenantD);
  const jour = R.jourDe(maintenantD);
  const fiches = new Map(Records.list('AgentImmo').map((x) => [x.id, x]));
  const demandes = Records.list('DemandeClient');
  const recherches = recherchesDeLaZone(demandes, l.ville, { departement: departementDe(agences) });
  const placees = lignes
    .map((a, rang) => ({ a, rang, place: placeDansLaFile(a, moi, { jour, fiche: fiches.get(a.carnet_id) || null, maintenantD }) }))
    .filter((x) => x.place != null)
    .sort((x, y) => x.place - y.place
      || (x.place === 1 || x.place === 2 ? String(x.a.statut.relance_le).localeCompare(String(y.a.statut.relance_le)) : 0)
      || x.rang - y.rang);
  const file = placees
    // Un même numéro ne passe qu'une fois dans la file : on n'appelle pas deux fois la même agence.
    .filter((x, i, t) => t.findIndex((y) => R.normTel(numeroDe(y.a)) === R.normTel(numeroDe(x.a))) === i)
    .map(({ a, place }) => {
      const f = fiches.get(a.carnet_id) || null;
      const derniers = Records.list(APPEL).filter((x) => x.agent_id === a.carnet_id && x.etat === 'valide' && !x.essai_archive).sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 3);
      const telephone = place === 0 && a.prioritaire?.telephone ? a.prioritaire.telephone : numeroDe(a);
      return {
        id: a.id, nom: a.nom, adresse: a.adresse || null, telephone, place, badge: badgeDe(place, a.statut.tentatives),
        autres_numeros: [...new Set((a.agents || []).map((x) => x.telephone).filter((t) => t && R.normTel(t) !== R.normTel(telephone)))].slice(0, 3),
        email: a.email || (a.agents || []).find((x) => x.email)?.email || null,
        interlocuteurs: [
          ...(place === 0 && a.prioritaire?.nom ? [`${a.prioritaire.nom}${a.prioritaire.telephone ? ` · ${a.prioritaire.telephone}` : ''} (contact donné)`] : []),
          ...(f?.nom && f.nom !== a.nom ? [`${f.nom} (dernier interlocuteur)`] : []),
          ...(a.gerants || []).slice(0, 2).map((g) => `${g.nom}${g.qualite ? `, ${String(g.qualite).toLowerCase()}` : ''}`),
          ...(a.agents || []).filter((x) => x.nom).slice(0, 3).map((x) => `${x.nom}${x.telephone ? ` · ${x.telephone}` : ''}`),
          a.monday_connu?.nom ? `${a.monday_connu.nom} (dans Monday)` : null,
        ].filter(Boolean).filter((x, i, t) => t.indexOf(x) === i).slice(0, 5),
        statut: a.statut, pertinence: a.pertinence,
        historique: [
          ...derniers.map((x) => `${R.dateCourte(String(x.le).slice(0, 10))} · ${prenom(x.par)} · ${R.ISSUES[x.issue] || x.issue}${x.resume && !SANS_REPONSE.includes(x.issue) ? ` : ${x.resume}` : ''}`),
          ...(!derniers.length && f?.remarques ? [f.remarques] : []),
          ...(!derniers.length && a.monday_connu ? [`Monday : ${[a.monday_connu.statut, a.monday_connu.date].filter(Boolean).join(', ')}`] : []),
        ].slice(0, 3),
        site: a.site || null, maps_url: a.maps_url || null,
        lieu: [l.ville, a.adresse].filter(Boolean).join(' · '),
        // Au moment de rappeler : la raison de la relance et ce qu'a dit le dernier appel.
        raison: place === 1 && f?.prochaine?.quoi ? `Relance : ${f.prochaine.quoi}${derniers[0]?.resume ? `. Dernier appel : ${derniers[0].resume}` : ''}` : place === 2 ? `Retente : ${f?.prochaine?.quoi || 'pas de réponse la dernière fois'}` : null,
        reseau: reseauDe(a, lignes, maintenantD, l.ville),
      };
    });
  const chiffres = chiffresDeLaVille(lignes);
  return { ok: true, ville: l.ville, chiffres, recherches, file };
}

/** L'agence à l'écran est tenue cinq minutes (renouvelées tant qu'elle y reste) : un collègue de la même ville ne la voit pas. */
export function reserver(agenceId, user, { maintenantD = new Date() } = {}) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const moi = String(user?.email || '').toLowerCase();
  if (reserveeParUnAutre(a, moi, maintenantD)) return { ok: false, prise: true, error: `${prenom(a.reservee.par)} l'a à l'écran.` };
  Records.update(AGENCE, a.id, { reservee: { par: moi, jusqu: new Date(maintenantD.getTime() + RESERVATION_MS).toISOString() } });
  return { ok: true };
}

const liberer = (agenceId, moi) => {
  const a = agenceId ? Records.get(AGENCE, agenceId) : null;
  if (a?.reservee?.par === moi) Records.update(AGENCE, a.id, { reservee: null });
};

export const RAISONS_PASSER = { fermee: 'Fermée', pas_pertinente: 'Pas pertinente', plus_tard: 'Plus tard' };

/** « Passer » : fermée sort de la ville (morte), pas pertinente sort de la cible, plus tard revient demain. */
export function passer(agenceId, raison, user, { maintenantD = new Date() } = {}) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  if (!RAISONS_PASSER[raison]) return { ok: false, error: 'Raison inconnue.' };
  const moi = String(user?.email || '').toLowerCase();
  const le = maintenantD.toISOString();
  if (raison === 'fermee') Records.update(AGENCE, a.id, { morte: true, morte_le: le, morte_par: moi, morte_pourquoi: 'fermée (passée en mode appel)', reservee: null });
  else if (raison === 'pas_pertinente') Records.update(AGENCE, a.id, { hors_cible: true, hors_cible_le: le, hors_cible_par: moi, hors_cible_pourquoi: 'pas pertinente (passée en mode appel)', reservee: null });
  else Records.update(AGENCE, a.id, { passee: { par: moi, le: R.jourDe(maintenantD) }, reservee: null });
  return { ok: true, raison };
}

/** L'agent qui rappelle sur le portable : retrouver sa fiche par son nom ou son numéro. */
export function chercher(q, { max = 8 } = {}) {
  const t = R.norm(q);
  const tel = R.normTel(q);
  if (t.length < 2 && !tel) return { ok: true, resultats: [] };
  const listes = new Map(Records.list(LISTE).filter((l) => !l.essai).map((l) => [l.id, l]));
  const out = [];
  for (const a of Records.list(AGENCE)) {
    if (!listes.has(a.liste_id)) continue;
    const agents = a.agents || [];
    const parTel = tel && [a.telephone, ...agents.map((x) => x.telephone)].some((x) => R.normTel(x) === tel);
    const agent = !parTel && t.length >= 3 ? agents.find((x) => R.norm(x.nom).includes(t)) : null;
    if (parTel || agent || (t.length >= 3 && R.norm(a.nom).includes(t))) {
      out.push({ agence_id: a.id, nom: a.nom, ville: listes.get(a.liste_id).ville, telephone: numeroDe(a), qui: agent?.nom || null, par: parTel ? 'numéro' : agent ? 'agent' : 'nom' });
      if (out.length >= max * 3) break;
    }
  }
  return { ok: true, resultats: out.sort((x, y) => (x.par === 'numéro' ? 0 : 1) - (y.par === 'numéro' ? 0 : 1)).slice(0, max) };
}

// ---------------------------------------------------------------------------
// La session
// ---------------------------------------------------------------------------

export function ouvrirSession(listeId, user) {
  const l = Records.get(LISTE, listeId);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  return { ok: true, session: Records.create(SESSION, { liste_id: l.id, ville: l.ville, par: user?.email || null, debut: maintenant(), appels: [] }) };
}

function noterDansSession(sessionId, entree) {
  const s = sessionId ? Records.get(SESSION, sessionId) : null;
  if (!s) return;
  Records.update(SESSION, s.id, { appels: [...(s.appels || []).filter((x) => x.appel_id !== entree.appel_id), entree], fin: maintenant() });
}

const ligneAVerifier = (r) => r && !['ok', 'info'].includes(r.etat);

/**
 * Le récapitulatif : les appels par issue, les mails, les relances, la
 * progression de la ville, « Tout est à jour dans Monday », et ce qui n'est
 * pas allé au bout, chacun avec de quoi le régler.
 */
export function recapSession(sessionId) {
  const s = Records.get(SESSION, sessionId);
  if (!s) return { ok: false, error: 'Session introuvable.' };
  const entrees = (s.appels || []).filter((x) => !x.annule);
  const appelsDe = entrees.map((x) => ({ x, appel: Records.get(APPEL, x.appel_id) })).filter((y) => y.appel);
  const recus = appelsDe.map((y) => y.appel.recu).filter(Boolean);
  const parIssue = Object.fromEntries(Object.keys(ISSUES_APPEL).map((k) => [k, entrees.filter((x) => x.issue === k).length]));
  const echecs = [];
  for (const { x, appel } of appelsDe) {
    const r = appel.recu;
    if (!r) continue;
    const agence = (x.agence_id && Records.get(AGENCE, x.agence_id)?.nom) || appel.agent || '';
    if (r.mail && ['echec'].includes(r.mail.etat)) echecs.push({ appel_id: appel.id, quoi: 'mail', agence, texte: `Mail non parti · ${agence}`, bouton: 'Renvoyer' });
    if (r.mail?.etat === 'brouillon') echecs.push({ appel_id: appel.id, quoi: 'brouillon', agence, texte: `Mail à envoyer depuis votre téléphone · ${agence}`, bouton: 'Ouvrir le brouillon', mailto: r.mail.mailto || null });
    if (r.monday?.etat === 'doute') echecs.push({ appel_id: appel.id, quoi: 'monday_ligne', agence, texte: `Monday : quelle ligne pour ${agence} ?`, bouton: 'Choisir la ligne', candidates: r.monday.candidates || [] });
    else if (ligneAVerifier(r.monday)) echecs.push({ appel_id: appel.id, quoi: 'monday', agence, texte: `Monday en attente · ${agence}${r.monday.erreur ? ` (${r.monday.erreur})` : ''}`, bouton: 'Réessayer' });
    if (ligneAVerifier(r.diffusion)) echecs.push({ appel_id: appel.id, quoi: 'diffusion', agence, texte: `Liste de diffusion · ${agence} : ${r.diffusion.texte}`, bouton: null });
  }
  const mondayEnAttente = recus.filter((r) => ligneAVerifier(r.monday)).length;
  const l = Records.get(LISTE, s.liste_id);
  const chiffres = l ? chiffresDeLaVille(annoter(Records.list(AGENCE).filter((a) => a.liste_id === l.id && !a.hors_cible))) : null;
  return {
    ok: true, ville: s.ville, essai: !!s.essai, debut: s.debut, fin: s.fin || null,
    appels: entrees.length, par_issue: parIssue,
    sans_reponse: parIssue.pas_de_reponse + parIssue.repondeur,
    pas_de_bien: parIssue.pas_de_murs, a_un_bien: parIssue.a_des_murs, pas_interesses: parIssue.pas_interesse,
    echecs,
    mails_envoyes: recus.filter((r) => r.mail?.etat === 'ok').length,
    diffusion: recus.filter((r) => r.diffusion?.etat === 'ok').length,
    relances: recus.filter((r) => r.relance?.etat === 'ok').length,
    progression: chiffres ? { contactees: chiffres.appelees, agences: chiffres.agences - chiffres.mortes, texte: `${s.ville} : ${chiffres.appelees} / ${chiffres.agences - chiffres.mortes} agences contactées` } : null,
    monday_en_attente: mondayEnAttente,
    monday_a_jour: mondayEnAttente === 0,
  };
}

// ---------------------------------------------------------------------------
// Prendre, appeler, l'issue
// ---------------------------------------------------------------------------

// Les cinq issues, en deux groupes (spec du 7 oct. 2026). Les non abouties se
// valident d'un geste ; les abouties ouvrent l'écran d'actions, cases cochées.
export const ISSUES_APPEL = {
  pas_de_reponse: { cle: 'pas_de_reponse', titre: 'Pas de réponse', groupe: 'non_abouti', simple: true },
  repondeur: { cle: 'repondeur', titre: 'Répondeur, message laissé', groupe: 'non_abouti', simple: true },
  pas_de_murs: { cle: 'pas_de_murs', titre: "Pas de bien pour l'instant", groupe: 'abouti', principal: true },
  a_des_murs: { cle: 'a_des_murs', titre: 'A un bien intéressant', groupe: 'abouti' },
  pas_interesse: { cle: 'pas_interesse', titre: 'Pas intéressé', groupe: 'abouti' },
};

/** L'agence prise pour l'appeler : elle entre au carnet si besoin, et personne d'autre ne la prend pendant trente minutes. */
export async function prendre(agenceId, user) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  // Le mode essai : une fiche fictive, hors du carnet, sans verrou.
  if (Records.get(LISTE, a.liste_id)?.essai) return { ok: true, agent_id: ficheEssai(a).id, essai: true };
  const IA = await import('./agent-ia.js');
  const parAgent = !a.telephone ? (a.agents || []).find((x) => x.telephone) : null;
  const p = await IA.pourAppeler(agenceId, { agent: parAgent ? parAgent.telephone : null }, user);
  if (!p.ok) return p;
  const { verrouiller } = await import('./carnet.js');
  const v = verrouiller(p.agent_id, String(user?.email || '').toLowerCase());
  if (!v.ok) return v;
  return { ok: true, agent_id: p.agent_id };
}

/** Le nom à mettre sur la ligne Monday : l'interlocuteur s'il est sûr (ou corrigé à la main), sinon rien (« Accueil »). */
const contactSur = (compris, corrige = {}) => {
  if (corrige.interlocuteur != null) return String(corrige.interlocuteur).trim() || null;
  const c = compris?.champs?.interlocuteur;
  return c && !c.incertain ? String(c.valeur).replace(/^(madame|monsieur)\s+/i, '').trim() : null;
};
const valeurSure = (compris, cle, corrige = {}) => {
  if (corrige[cle] != null) return String(corrige[cle]).trim() || null;
  const c = compris?.champs?.[cle];
  return c && !c.incertain ? c.valeur : null;
};

/** Ce que la ligne Monday doit recevoir pour cet appel. */
function donneesMonday({ appel, agence, fiche, issue, user, relance, note = '', corrige = {}, email = null, diffusion = null }) {
  const compris = appel.compris || {};
  const ville = Records.get(LISTE, agence.liste_id)?.ville || fiche?.ville || null;
  const resumeAppel = [appel.resume && !/^(pas de réponse|pas de bien|a un bien|pas intéressé)[^:]*\.$/i.test(appel.resume) ? appel.resume : null, note ? `Note : ${note}` : null].filter(Boolean).join(' ');
  return {
    contact: contactSur(compris, corrige), ville, agence: agence.nom,
    remarque: ligneDeRemarque({ jour: R.jourDe(new Date(appel.le || Date.now())), analyste: prenom(user?.email) || user?.full_name || '', issue: ISSUES_APPEL[issue]?.titre || R.ISSUES[issue], resume: resumeAppel, ne_plus_appeler: issue === 'pas_interesse' }),
    relance: issue === 'pas_interesse' ? null : relance || null,
    telephone: valeurSure(compris, 'telephone', corrige) || appel.numero || numeroDe(agence),
    // L'adresse dite pendant l'appel, sinon celle à qui part le mail ou qui entre dans la liste.
    email: valeurSure(compris, 'email', corrige) || R.normEmail(email),
    analyste_email: String(user?.email || '').toLowerCase() || null,
    analyste_nom: prenom(user?.email) || null,
    diffusion,
    issue: ISSUES_APPEL[issue]?.titre || null,
    statut: issue === 'pas_interesse' ? 'Ne plus appeler' : ISSUES_APPEL[issue]?.titre || null,
    dernier_contact: R.jourDe(new Date(appel.le || Date.now())),
  };
}

const cibleMonday = (d, agence, fiche) => ({
  telephones: [d.telephone, numeroDe(agence), ...(fiche?.telephones || [])].filter(Boolean),
  emails: [d.email, ...(fiche?.emails || [])].filter(Boolean),
  agence: agence.nom, ville: d.ville, contact: d.contact,
});

/**
 * L'issue tapée. Les non abouties (pas de réponse, répondeur) se valident
 * d'office et rendent le reçu ; les abouties rendent l'écran d'actions : ce
 * qui a été compris (chaque info avec sa phrase), la ligne Monday et ce qui
 * va y changer, le mail du modèle, la liste de diffusion, la relance.
 * Une transcription ratée n'empêche rien : l'écran s'ouvre sur l'issue seule.
 */
export async function noterIssue({ agence_id, agent_id, issue, session_id = null, audio = null, recit = null, numero = null, user }) {
  const def = ISSUES_APPEL[issue];
  if (!def) return { ok: false, error: 'Issue inconnue.' };
  const a = Records.get(AGENCE, agence_id);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  let agentId = agent_id;
  if (!agentId) { const p = await prendre(agence_id, user); if (!p.ok) return p; agentId = p.agent_id; }
  const A = await import('./appel.js');
  const lu = await A.analyserAppel({ agent_id: agentId, audio: def.simple ? null : audio, recit: recit || null, issue: def.cle, par: user?.email, sans_reponse: def.simple });
  if (!lu.ok) return lu;
  const essai = estEssai(a);
  Records.update(APPEL, lu.appel.id, { agence_id: a.id, session_id, issue_tapee: issue, numero: numero || numeroDe(a), ...(essai ? { essai: true } : {}) });
  if (def.simple) {
    const choix = lu.appel.propositions.filter((p) => p.coche !== false && ['statut', 'relance'].includes(p.type)).map((p) => p.id);
    return validerIssue({ appel_id: lu.appel.id, choix, session_id, agence_id, user, issue });
  }
  const f = Records.get('AgentImmo', agentId);
  const compris = lu.appel.compris || { champs: {} };
  const moi = String(user?.email || '').toLowerCase();
  const u = Records.filter('User', { email: moi })[0];
  const analyste = u?.full_name || user?.full_name || prenom(moi);
  // Les propositions d'AK gardées : le statut, la relance (date modifiable), la fiche. Le mail vient des modèles.
  const base = lu.appel.propositions.filter((p) => ['statut', 'relance', 'fiche'].includes(p.type));
  const actions = [];
  const relance = base.find((p) => p.type === 'relance');
  const appelPourMonday = { ...lu.appel, numero: numero || numeroDe(a) };
  const emailPrevu = valeurSure(compris, 'email') || (f?.emails || [])[0] || a.email || null;
  const d = donneesMonday({ appel: appelPourMonday, agence: a, fiche: f, issue, user, relance: relance?.prochaine?.le || null, email: emailPrevu, diffusion: issue === 'pas_interesse' ? false : !!emailPrevu });
  const monday = essai ? { etat: 'info', texte: "Essai : Monday n'est pas touché" } : await (await import('./monday-agents.js')).preparer(cibleMonday(d, a, f), d);
  actions.push({ id: 'monday', type: 'monday', titre: 'Mettre à jour Monday', coche: true, toujours: true, ligne: monday });
  // Le mail : le modèle de l'issue, variables remplies, rien de réécrit.
  const MO = await import('./modeles-appel.js');
  const choixModele = MO.MODELES_DE_L_ISSUE[issue];
  const emailSur = valeurSure(compris, 'email');
  const emailIncertain = !emailSur && compris.champs?.email ? compris.champs.email.valeur : null;
  const destinataire = emailSur || (f?.emails || [])[0] || a.email || emailIncertain || null;
  if (choixModele) {
    const vars = { analyste, salutation: compris.salutation || 'Bonjour,', contexte: compris.contexte || null };
    const variantes = [];
    for (const slug of [choixModele.defaut, choixModele.variante].filter(Boolean)) {
      const t = await MO.modele(slug);
      if (t) variantes.push(MO.remplirModele(t, vars));
    }
    if (variantes.length) {
      const m = variantes[0];
      actions.push({ id: 'mail', type: 'mail', titre: `Envoyer « ${m.titre} »`, a: destinataire, ...(destinataire && destinataire === emailIncertain ? { a_incertain: compris.champs.email.incertain } : {}), objet: m.objet, corps: m.corps, contexte: m.contexte, modele: m.slug, variantes, coche: !!destinataire });
    }
    actions.push({ id: 'diffusion', type: 'diffusion', titre: 'Ajouter à la liste de diffusion agents', liste: LISTE_DIFFUSION, a: destinataire, coche: !!destinataire });
  }
  if (relance) actions.push({ ...relance, titre: 'Planifier la relance', coche: true });
  if (issue === 'pas_interesse') actions.push({ id: 'ne_plus_appeler', type: 'ne_plus_appeler', titre: 'Ne plus appeler', coche: true, toujours: true });
  const statut = base.find((p) => p.type === 'statut');
  if (statut) actions.push({ ...statut, cache: true });
  const fiche = base.find((p) => p.type === 'fiche');
  if (fiche) actions.push({ ...fiche, coche: true });
  // Un bon contact donné pendant l'appel : proposé, et mis en tête de file.
  if (compris.nouveau_contact) actions.push({ id: 'nouveau_contact', type: 'nouveau_contact', titre: `Ajouter ${compris.nouveau_contact.nom || 'ce contact'}${compris.nouveau_contact.telephone ? ` (${compris.nouveau_contact.telephone})` : ''} et l'appeler en tête de file`, contact: compris.nouveau_contact, source: compris.nouveau_contact.source, ...(compris.nouveau_contact.incertain ? { incertain: compris.nouveau_contact.incertain } : {}), coche: !compris.nouveau_contact.incertain });
  const autres = (a.pour || []).filter((e) => e !== moi);
  if (autres.length) actions.push({ id: 'prevenir', type: 'prevenir', titre: `Prévenir ${autres.map(prenom).join(', ')} : la ligne est aussi à eux`, pour: autres, coche: false });
  if ((lu.appel.biens || []).length && issue === 'a_des_murs') actions.push({ id: 'signaler_bien', type: 'signaler_bien', titre: `Noter le bien évoqué : ${lu.appel.biens[0]}`, biens: lu.appel.biens, coche: false, ...(lu.appel.citations?.biens ? { source: lu.appel.citations.biens } : {}) });
  Records.update(APPEL, lu.appel.id, { propositions: actions, monday_prevu: monday });
  const avant = f ? { statut: R.STATUTS[f.statut] || null, interlocuteur: f.nom || null, email: (f.emails || [])[0] || null, prochaine: f.prochaine || null, dernier_contact_le: f.dernier_contact_le || null, referent: f.referent || null } : null;
  return {
    ok: true, simple: false,
    appel: { ...lu.appel, propositions: actions, agence: a.nom, issue_tapee: issue, avant, compris, transcription_echec: lu.appel.transcription_echec || null, sans_details: !audio?.length && !recit },
  };
}

// ---------------------------------------------------------------------------
// Valider, une seule fois ; annuler pendant dix secondes
// ---------------------------------------------------------------------------

export const LISTE_DIFFUSION = 'Agents immobiliers';
export const DELAI_ANNULER_MS = 10000;
const enCours = new Map();

/** Valider : une validation par appel, quel que soit le nombre de taps ou de nouveaux essais (identifiant unique). */
export async function validerIssue(x) {
  const appel = Records.get(APPEL, x.appel_id);
  if (!appel) return { ok: false, error: 'Appel introuvable.' };
  if (appel.etat === 'valide' && appel.recu) return { ok: true, deja: true, simple: !!ISSUES_APPEL[x.issue || appel.issue_tapee]?.simple, recu: appel.recu };
  if (enCours.has(appel.id)) return enCours.get(appel.id);
  const p = validerUneFois(x).finally(() => enCours.delete(appel.id));
  enCours.set(appel.id, p);
  return p;
}

async function validerUneFois({ appel_id, choix = [], mail = null, relance_le = null, monday_ligne = null, note = '', corrections = [], cle = null, session_id = null, agence_id = null, user, issue = null, maintenantD = new Date() }) {
  const appel = Records.get(APPEL, appel_id);
  const A = await import('./appel.js');
  const agenceId = agence_id || appel.agence_id || null;
  const ag = agenceId ? Records.get(AGENCE, agenceId) : null;
  const issueTapee = issue || appel.issue_tapee || Object.keys(ISSUES_APPEL).find((k) => ISSUES_APPEL[k].cle === appel.issue) || appel.issue;
  const def = ISSUES_APPEL[issueTapee] || {};
  const essai = !!appel.essai || estEssai(ag);
  const moi = String(user?.email || '').toLowerCase();
  const pris = new Set(choix);
  const actions = appel.propositions || [];
  const action = (id) => (pris.has(id) || actions.find((p) => p.id === id)?.toujours ? actions.find((p) => p.id === id) : null);
  const corrige = {};
  for (const c of Array.isArray(corrections) ? corrections : []) if (c?.cle && ['interlocuteur', 'telephone', 'email'].includes(c.cle)) corrige[c.cle] = String(c.valeur ?? '').trim();
  // De quoi tout remettre comme avant (« Annuler ») : la fiche et l'agence telles qu'elles étaient.
  const ficheAvant = Records.get('AgentImmo', appel.agent_id);
  const agenceAvant = ag ? { morte: ag.morte ?? null, ne_plus_appeler: ag.ne_plus_appeler ?? null, prioritaire: ag.prioritaire ?? null, agents: ag.agents || [] } : null;

  // La fiche : statut, relance (à la date choisie), secteurs ; aucun mail par ce chemin.
  const choixFiche = [...pris].filter((id) => ['statut', 'relance', 'fiche'].includes(actions.find((p) => p.id === id)?.type));
  if (!choixFiche.includes('statut') && actions.some((p) => p.type === 'statut')) choixFiche.push(actions.find((p) => p.type === 'statut').id);
  const v = await A.validerAppel({ appel_id, choix: choixFiche, envoyer: false, user, maintenant: maintenantD });
  if (!v.ok) return v;
  const { majAgent, journal, agentDe } = await import('./carnet.js');
  const rel = actions.find((p) => p.type === 'relance');
  if (rel && pris.has(rel.id) && relance_le && /^\d{4}-\d{2}-\d{2}$/.test(relance_le) && relance_le !== rel.prochaine?.le) {
    majAgent(appel.agent_id, { prochaine: { ...rel.prochaine, le: relance_le, date_choisie: true } });
  }
  if (issueTapee === 'pas_interesse') {
    majAgent(appel.agent_id, { statut: 'archive', prochaine: null, ne_plus_appeler: true });
    if (ag) Records.update(AGENCE, ag.id, { ne_plus_appeler: true });
  }
  if (note && String(note).trim()) journal(appel.agent_id, { type: 'note', texte: `Note : ${String(note).trim().slice(0, 500)}`, par: moi });
  for (const c of (Array.isArray(corrections) ? corrections : []).slice(0, 8)) {
    if (c?.libelle && String(c.valeur || '').trim()) journal(appel.agent_id, { type: 'note', texte: `Corrigé à la validation · ${String(c.libelle).slice(0, 40)} : ${String(c.valeur).trim().slice(0, 300)}`, par: moi });
  }
  if (corrige.interlocuteur) majAgent(appel.agent_id, { nom: corrige.interlocuteur });
  const a = agentDe(appel.agent_id);

  const extras = [];
  // Le nouveau contact : ajouté à l'agence, en tête de file aujourd'hui.
  const nc = action('nouveau_contact');
  if (nc && ag) {
    const agents = [...(ag.agents || []).filter((x) => !(nc.contact.telephone && R.normTel(x.telephone) === R.normTel(nc.contact.telephone))), { nom: nc.contact.nom || null, telephone: nc.contact.telephone || null, email: nc.contact.email || null, source: 'donné pendant un appel' }];
    Records.update(AGENCE, ag.id, { agents, prioritaire: { le: R.jourDe(maintenantD), par: moi, nom: nc.contact.nom || null, telephone: nc.contact.telephone || null } });
    extras.push({ quoi: 'contact', etat: 'ok', texte: `${nc.contact.nom || 'Le contact'} ajouté, en tête de file` });
  }
  const bien = action('signaler_bien');
  if (bien && !essai) {
    journal(appel.agent_id, { type: 'note', texte: `Bien évoqué : ${bien.biens.join(' ; ')}. Le dossier se crée quand la fiche arrive.`, par: moi });
    extras.push({ quoi: 'bien', etat: 'ok', texte: `Bien noté : ${bien.biens[0]}` });
  }
  const prevenir = action('prevenir');
  if (prevenir && !essai) {
    const { notifier } = await import('../notifications.js');
    for (const e of prevenir.pour) notifier({ pour: e, titre: `${prenom(moi)} a appelé ${ag?.nom || appel.agent}`, texte: `${def.titre || R.ISSUES[appel.issue]}${appel.resume ? ` : ${appel.resume}` : ''}`, lien: '/Prospection', genre: 'info' });
    extras.push({ quoi: 'collegue', etat: 'ok', texte: `${prevenir.pour.map(prenom).join(', ')} prévenu${prevenir.pour.length > 1 ? 's' : ''}` });
  }

  // La liste de diffusion : ajoutée, puis relue.
  let diffusion = null;
  const dif = action('diffusion');
  const adresse = R.normEmail(corrige.email || mail?.a || dif?.a);
  if (dif) diffusion = essai ? { etat: 'info', texte: `Essai : ${adresse || 'l\'agent'} n'est pas ajouté à la liste` } : await ajouterALaDiffusion({ email: adresse, nom: contactSur(appel.compris, corrige) || a?.nom, agence: ag?.nom, ville: Records.get(LISTE, ag?.liste_id)?.ville || null, par: moi });

  // Monday : les appels aboutis seulement.
  let monday = null;
  let ecriture = null;
  if (!def.simple && ag) {
    const emailUtilise = action('mail') ? R.normEmail(mail?.a ?? action('mail').a) : adresse;
    const dansLaListe = dif ? ['ok'].includes(diffusion?.etat) : issueTapee === 'pas_interesse' ? false : null;
    const d = donneesMonday({ appel, agence: ag, fiche: a, issue: issueTapee, user, relance: a?.prochaine?.le || null, note, corrige, email: emailUtilise, diffusion: dansLaListe });
    if (essai) monday = { etat: 'info', texte: `Essai : Monday n'est pas touché (on y aurait écrit « ${[d.agence, d.contact || 'Accueil', d.issue].join(' · ')} »)` };
    else {
      const r = await ecrireMonday({ appel_id, cible: cibleMonday(d, ag, a), donnees: d, ligne_id: monday_ligne });
      monday = r.monday;
      ecriture = r.ecriture;
    }
  }

  // Le mail : il part dix secondes après la validation, pour que « Annuler » puisse le retenir.
  let mailRecu = null;
  let mailId = null;
  const pm = action('mail');
  if (pm) {
    const m = { a: R.normEmail(mail?.a ?? pm.a), objet: mail?.objet ?? pm.objet, corps: mail?.corps ?? pm.corps };
    const { mettreEnAttente } = await import('./mails.js');
    if (!m.a) mailRecu = { etat: 'echec', texte: "Mail non parti : il manque l'adresse" };
    else {
      const sansBoite = !essai && !(await boiteDEnvoi(moi));
      const cree = mettreEnAttente({ genre: 'agent', sous_genre: pm.modele, agent_id: appel.agent_id, nom: a?.nom, agence: a?.agence, a: m.a, objet: m.objet, corps: m.corps, appel_id, modele: pm.modele, etat: essai ? 'pret' : sansBoite ? 'brouillon' : 'differe', partir_le: new Date(maintenantD.getTime() + DELAI_ANNULER_MS).toISOString(), ...(essai ? { essai: true } : {}) });
      mailId = cree.id;
      if (essai) mailRecu = { etat: 'info', texte: `Essai : le mail à ${m.a} est prêt, il ne part pas`, mail_id: cree.id };
      else if (sansBoite) mailRecu = { etat: 'brouillon', texte: 'Aucune boîte connectée : ouvrez le brouillon pour l\'envoyer', mail_id: cree.id, mailto: mailtoDe(m, user) };
      else mailRecu = { etat: 'attente', texte: `Mail à ${m.a} : part dans 10 secondes`, mail_id: cree.id };
      if (mailRecu) mailRecu.detail = { a: m.a, objet: m.objet, corps: m.corps };
    }
  }

  const relance = a?.prochaine?.le ? { etat: 'ok', texte: `Relance ${jourLong(a.prochaine.le)}${a.prochaine.moment ? `, ${a.prochaine.moment}` : ''}${a.prochaine.si_fiche ? ', si la fiche n\'est pas arrivée' : ''}` } : issueTapee === 'pas_interesse' ? { etat: 'ok', texte: 'Ne plus appeler : aucune relance' } : null;
  const recu = { monday, mail: mailRecu, diffusion, relance, extras, le: maintenantD.toISOString(), cle: cle || null, annulable_jusqu: new Date(maintenantD.getTime() + DELAI_ANNULER_MS).toISOString() };
  Records.update(APPEL, appel_id, { recu, validation_cle: cle || null, issue_tapee: issueTapee, annuler: { fiche: ficheAvant, agence: agenceAvant, ecriture, diffusion: diffusion?.annuler || null, mail_id: mailId } });
  if (mailId && mailRecu?.etat === 'attente') setTimeout(() => { envoyerMailDiffere(appel_id).catch(() => {}); }, DELAI_ANNULER_MS + 300).unref?.();
  liberer(agenceId, moi);
  noterDansSession(session_id || appel.session_id, { appel_id, agence_id: agenceId, issue: issueTapee, le: maintenant() });
  return { ok: true, simple: !!def.simple, recu };
}

/** Une boîte d'envoi rattachée par la personne (Gmail ou SMTP) : sans elle, le mail s'ouvre en brouillon. */
async function boiteDEnvoi(email) {
  try { const { listAccounts } = await import('../email.js'); return listAccounts(email).some((x) => x.peut_envoyer !== false && !x.needs_reconnect); } catch { return false; }
}

const mailtoDe = (m, user) => {
  const signature = user?.full_name || prenom(user?.email);
  return `mailto:${encodeURIComponent(m.a)}?subject=${encodeURIComponent(m.objet || '')}&body=${encodeURIComponent(String(m.corps || '').replace(/\{signature\}/g, signature))}`;
};

/** Écrit dans Monday, relit ; un échec se met en attente (avec ce qu'il faut pour réessayer) et reste orange. */
async function ecrireMonday({ appel_id, cible, donnees, ligne_id = null, item_cree = null }) {
  const MA2 = await import('./monday-agents.js');
  let r;
  try {
    if (!(await MA2.mondayAgentsBranche())) r = { etat: 'attente', texte: "Monday n'est pas branché ici : rien n'a été écrit", erreur: 'non branché' };
    else r = await MA2.ecrire({ cible, donnees, ligne_id, item_cree });
  } catch (e) {
    r = { etat: 'attente', texte: 'Monday en attente, nouvel essai en cours', erreur: String(e?.message || e).slice(0, 200) };
  }
  const deja = Records.list(ATTENTE).find((x) => x.appel_id === appel_id && !x.fait_le);
  if (r.etat === 'attente' && r.erreur !== 'non branché') {
    const charge = { appel_id, cible, donnees, ligne_id, item_cree: r.item_id || item_cree || null };
    if (deja) Records.update(ATTENTE, deja.id, { ...charge, essais: (deja.essais || 0) + 1, dernier_essai_le: maintenant(), erreur: r.erreur || null });
    else Records.create(ATTENTE, { ...charge, essais: 1, dernier_essai_le: maintenant(), erreur: r.erreur || null });
  } else if (deja) Records.update(ATTENTE, deja.id, { fait_le: maintenant() });
  // La ligne de l'agent, gardée sur sa fiche : une relance annulée la videra.
  const ap = Records.get(APPEL, appel_id);
  if (r.etat === 'ok' && r.item_id && ap?.agent_id) Records.update('AgentImmo', ap.agent_id, { monday_ligne_id: r.item_id });
  const monday = r.etat === 'ok'
    ? { etat: 'ok', texte: r.texte, lien: r.lien, relu_le: r.relu_le }
    : r.etat === 'doute' ? { etat: 'doute', texte: "C'est bien cette ligne ?", candidates: r.candidates }
      : { etat: 'attente', texte: r.texte, erreur: r.erreur || null };
  return { monday, ecriture: r.item_id ? { item_id: r.item_id, cree: r.cree, avant: r.avant, attendus: r.attendus } : null };
}

/** Le choix de la ligne Monday après coup (« C'est bien cette ligne ? » dans le reçu ou le récapitulatif). */
export async function choisirLigneMonday(appelId, ligneId) {
  const appel = Records.get(APPEL, appelId);
  if (!appel?.recu) return { ok: false, error: 'Appel introuvable.' };
  if (appel.essai) return { ok: false, error: 'Mode essai.' };
  const ag = Records.get(AGENCE, appel.agence_id);
  const { agentDe } = await import('./carnet.js');
  const a = agentDe(appel.agent_id);
  const user = { email: appel.par };
  const d = donneesMonday({ appel, agence: ag, fiche: a, issue: appel.issue_tapee, user, relance: a?.prochaine?.le || null, email: appel.recu.mail?.detail?.a || null, diffusion: appel.recu.diffusion ? appel.recu.diffusion.etat === 'ok' : appel.issue_tapee === 'pas_interesse' ? false : null });
  const r = await ecrireMonday({ appel_id: appel.id, cible: cibleMonday(d, ag, a), donnees: d, ligne_id: ligneId || 'nouvelle' });
  const recu = { ...appel.recu, monday: r.monday };
  Records.update(APPEL, appel.id, { recu, annuler: { ...(appel.annuler || {}), ecriture: r.ecriture } });
  return { ok: true, recu };
}

/** L'agent dans la liste de diffusion « Agents immobiliers » de l'Emailing, puis relu. */
async function ajouterALaDiffusion({ email, nom, agence, ville, par }) {
  if (!email) return { etat: 'echec', texte: "Pas ajouté à la liste : il manque l'adresse" };
  try {
    const { listeDuNom, E } = await import('../emailing/schema.js');
    const C = await import('../emailing/contacts.js');
    const liste = listeDuNom(LISTE_DIFFUSION, par);
    const existant = Records.list(E.CONTACT).find((x) => x.email === email) || null;
    if (existant && existant.statut !== 'abonne') return { etat: 'attente', texte: `${email} s'est désinscrit des envois : pas ajouté` };
    if (existant && (existant.listes || []).includes(liste.id)) return { etat: 'ok', texte: 'Déjà dans la liste de diffusion agents' };
    const [prenomC, ...reste] = String(nom || '').trim().split(/\s+/);
    let contactId;
    let cree = false;
    if (existant) { Records.update(E.CONTACT, existant.id, { listes: [...new Set([...(existant.listes || []), liste.id])] }); contactId = existant.id; } else {
      const r = C.creerContact({ email, prenom: prenomC || '', nom: reste.join(' '), entreprise: agence || '', ville: ville || '', type: 'partenaire', listes: [liste.id], source: 'mode appel', tags: ['agent immobilier'] }, { par });
      if (!r.ok) return { etat: 'echec', texte: `Pas ajouté à la liste : ${r.error}` };
      contactId = r.contact.id;
      cree = true;
    }
    const relu = Records.get(E.CONTACT, contactId);
    if (!(relu?.listes || []).includes(liste.id)) return { etat: 'attente', texte: 'La liste ne montre pas le contact' };
    return { etat: 'ok', texte: 'Ajouté à la liste de diffusion agents', annuler: { contact_id: contactId, liste_id: liste.id, cree } };
  } catch (e) {
    return { etat: 'echec', texte: `Pas ajouté à la liste : ${String(e?.message || e).slice(0, 120)}` };
  }
}

/** Le mail différé part, s'il n'a pas été annulé ; le reçu dit s'il est retrouvé dans les envoyés. */
export async function envoyerMailDiffere(appelId) {
  const appel = Records.get(APPEL, appelId);
  const mailId = appel?.recu?.mail?.mail_id;
  const m = mailId ? Records.get('ProspectionMail', mailId) : null;
  if (!m || m.etat !== 'differe') return { ok: false, error: 'Rien à envoyer.' };
  Records.update('ProspectionMail', m.id, { etat: 'pret' });
  const user = Records.filter('User', { email: appel.par })[0] || { email: appel.par };
  const { envoyerMails } = await import('./mails.js');
  const envoi = await envoyerMails([m.id], user);
  const mail = etatDuMail(envoi?.resultats?.[0], m, appel.recu.mail);
  const a2 = Records.get(APPEL, appelId);
  Records.update(APPEL, appelId, { recu: { ...a2.recu, mail, annulable_jusqu: a2.recu.annulable_jusqu } });
  return { ok: mail.etat === 'ok', mail };
}

/** Pure : la ligne « mail » du reçu. « Mail envoyé » seulement si Gmail le range dans les envoyés. */
export function etatDuMail(r0, m, avant = {}) {
  if (r0?.ok && r0.dans_les_envoyes) return { ...avant, etat: 'ok', texte: `Mail envoyé à ${m?.a || ''}, retrouvé dans les envoyés` };
  if (r0?.ok && !r0.simule) return { ...avant, etat: 'attente', texte: `Mail remis au serveur d'envoi pour ${m?.a || ''}, pas retrouvé dans les envoyés : vérifiez votre boîte` };
  if (r0?.simule) return { ...avant, etat: 'brouillon', texte: "Aucune boîte connectée : ouvrez le brouillon pour l'envoyer" };
  return { ...avant, etat: 'echec', texte: `Mail non parti : ${r0?.error || 'erreur'}` };
}

/** Le brouillon a été ouvert depuis le reçu : le reçu le dit, sans affirmer d'envoi. */
export function brouillonOuvert(appelId) {
  const appel = Records.get(APPEL, appelId);
  if (!appel?.recu?.mail) return { ok: false, error: 'Pas de mail pour cet appel.' };
  if (appel.recu.mail.mail_id) Records.update('ProspectionMail', appel.recu.mail.mail_id, { etat: 'brouillon_ouvert', brouillon_ouvert_le: maintenant() });
  const recu = { ...appel.recu, mail: { ...appel.recu.mail, etat: 'info', texte: 'Brouillon ouvert : à envoyer depuis votre app mail' } };
  Records.update(APPEL, appel.id, { recu });
  return { ok: true, recu };
}

/**
 * « Annuler », dans les dix secondes : Monday reprend ses valeurs d'avant, le
 * mail ne part pas, l'agent sort de la liste, la fiche redevient ce qu'elle
 * était. L'appel revient à l'écran d'actions.
 */
export async function annulerValidation(appelId, user, { maintenantD = new Date() } = {}) {
  const appel = Records.get(APPEL, appelId);
  if (!appel?.recu) return { ok: false, error: 'Rien à annuler.' };
  if (!appel.recu.annulable_jusqu || maintenantD.toISOString() > new Date(Date.parse(appel.recu.annulable_jusqu) + 3000).toISOString()) return { ok: false, error: 'Trop tard pour annuler : tout est déjà fait.' };
  const an = appel.annuler || {};
  const fait = [];
  // Le mail d'abord : s'il n'est pas parti, il ne partira plus.
  if (an.mail_id) {
    const m = Records.get('ProspectionMail', an.mail_id);
    if (m && ['differe', 'pret', 'brouillon'].includes(m.etat)) { Records.update('ProspectionMail', m.id, { etat: 'ecarte', ecarte_le: maintenant(), ecarte_par: user?.email || null, raison: 'validation annulée' }); fait.push('mail retenu'); } else if (m) fait.push('le mail était déjà parti');
  }
  if (an.diffusion) {
    const { E } = await import('../emailing/schema.js');
    const c = Records.get(E.CONTACT, an.diffusion.contact_id);
    if (c && an.diffusion.cree) Records.delete(E.CONTACT, c.id);
    else if (c) Records.update(E.CONTACT, c.id, { listes: (c.listes || []).filter((x) => x !== an.diffusion.liste_id) });
    fait.push('retiré de la liste');
  }
  for (const x of Records.list(ATTENTE).filter((y) => y.appel_id === appelId && !y.fait_le)) Records.update(ATTENTE, x.id, { fait_le: maintenant(), annule: true });
  if (an.ecriture?.item_id) {
    try { await (await import('./monday-agents.js')).restaurer(an.ecriture); fait.push(an.ecriture.cree ? 'ligne Monday retirée' : 'Monday remis comme avant'); } catch (e) { return { ok: false, error: `Monday n'a pas pu être remis comme avant : ${e?.message || e}` }; }
  }
  if (an.fiche?.id) {
    const actuelle = Records.get('AgentImmo', an.fiche.id) || {};
    const { id, ...avant } = an.fiche;
    const nouveaux = Object.fromEntries(Object.keys(actuelle).filter((k) => !(k in an.fiche) && !['id', 'created_date', 'updated_date'].includes(k)).map((k) => [k, null]));
    Records.update('AgentImmo', id, { ...nouveaux, ...avant });
  }
  if (an.agence && appel.agence_id) Records.update(AGENCE, appel.agence_id, an.agence);
  Records.update(APPEL, appel.id, { etat: 'a_valider', recu: null, annule_le: maintenant(), annuler: null, validation_cle: null });
  const s = appel.session_id ? Records.get(SESSION, appel.session_id) : null;
  if (s) Records.update(SESSION, s.id, { appels: (s.appels || []).filter((x) => x.appel_id !== appel.id) });
  return { ok: true, fait, appel: { ...Records.get(APPEL, appel.id), agence: Records.get(AGENCE, appel.agence_id)?.nom || appel.agent } };
}

// ---------------------------------------------------------------------------
// Le reçu, vérifié
// ---------------------------------------------------------------------------

const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/** Le reçu d'un appel, tel qu'il est maintenant (Monday et le mail ont pu avancer entre-temps). */
export function recu(appelId) {
  const appel = Records.get(APPEL, appelId);
  return appel?.recu ? { ok: true, recu: appel.recu } : { ok: false, error: 'Pas de reçu pour cet appel.' };
}

/**
 * Le tour des écritures Monday en attente : chacune se réessaie avec ce
 * qu'elle devait écrire, et le reçu passe au vert dès que Monday a la bonne
 * ligne. Les mails différés oubliés (serveur relancé) partent aussi.
 */
export async function reessayerAttentes({ max = 20 } = {}) {
  const enAttente = Records.list(ATTENTE).filter((x) => !x.fait_le && x.donnees).slice(0, max);
  let faits = 0;
  for (const x of enAttente) {
    const appel = Records.get(APPEL, x.appel_id);
    if (!appel?.recu) { Records.update(ATTENTE, x.id, { fait_le: maintenant(), annule: true }); continue; }
    const r = await ecrireMonday({ appel_id: x.appel_id, cible: x.cible, donnees: x.donnees, ligne_id: x.ligne_id, item_cree: x.item_cree });
    Records.update(APPEL, appel.id, { recu: { ...appel.recu, monday: r.monday }, ...(r.ecriture && appel.annuler ? { annuler: { ...appel.annuler, ecriture: appel.annuler.ecriture || r.ecriture } } : {}) });
    if (r.monday.etat === 'ok') faits += 1;
  }
  // Les anciennes attentes (avant le 7 oct.) n'ont pas de quoi se rejouer : elles se ferment.
  for (const x of Records.list(ATTENTE).filter((y) => !y.fait_le && !y.donnees)) Records.update(ATTENTE, x.id, { fait_le: maintenant(), obsolete: true });
  const tard = new Date(Date.now() - DELAI_ANNULER_MS - 5000).toISOString();
  for (const m of Records.list('ProspectionMail').filter((y) => y.etat === 'differe' && String(y.partir_le || '') < tard && y.appel_id)) await envoyerMailDiffere(m.appel_id).catch(() => {});
  return { essayes: enAttente.length, faits };
}

// ---------------------------------------------------------------------------
// Le mode essai : tout le parcours, sans vrai appel ni effet réel
// ---------------------------------------------------------------------------
//
// Quatre agences fictives, remises à zéro à chaque essai. Leurs fiches, leurs
// appels et leurs mails portent `essai` : ni Monday, ni envoi, ni liste du
// jour, ni fiabilité d'AK ne les voient (carnet.js, mails.js, appel.js,
// monday.js). Tout le reste est le vrai circuit : la lecture par AK, les
// propositions, les relances, le reçu.

const AGENCES_ESSAI = [
  { nom: 'Agence Essai Commerces', telephone: '01 00 00 00 01', email: 'essai.commerces@exemple.invalid', adresse: '1 rue de l\'Essai', gerants: [{ nom: 'Sophie Essai', qualite: 'Gérante' }], sources: ['Essai'] },
  { nom: 'Riviera Test Immobilier', telephone: '01 00 00 00 02', email: 'contact@riviera-test.invalid', adresse: '2 avenue du Test', gerants: [{ nom: 'Marc Démo', qualite: 'Gérant' }], sources: ['Essai'] },
  { nom: 'Cabinet Démo Transactions', telephone: '01 00 00 00 03', email: 'transactions@cabinet-demo.invalid', adresse: '3 boulevard Fictif', gerants: [], sources: ['Essai'] },
  { nom: 'Agence Fictive du Port', telephone: '01 00 00 00 04', email: null, adresse: '4 quai Imaginaire', gerants: [], sources: ['Essai'] },
];

const estEssai = (agence) => !!agence && !!Records.get(LISTE, agence.liste_id)?.essai;

/** La fiche fictive d'une agence d'essai : créée la première fois, hors du carnet. */
function ficheEssai(a) {
  const deja = a.carnet_id ? Records.get('AgentImmo', a.carnet_id) : null;
  if (deja) return deja;
  const fiche = Records.create('AgentImmo', {
    essai: true, nom: a.gerants?.[0]?.nom || a.nom, agence: a.nom, ville: 'Essai', telephones: [a.telephone].filter(Boolean),
    emails: [a.email].filter(Boolean), statut: 'nouveau', tentatives: 0, secteurs: [], journal: [], source: 'Mode essai', cree_le: maintenant(),
  });
  Records.update(AGENCE, a.id, { carnet_id: fiche.id });
  return fiche;
}

/**
 * Ouvre un essai : la liste fictive, remise à zéro (les fiches reviennent à
 * « à appeler », les appels d'avant ne comptent plus), puis une session.
 */
export function ouvrirEssai(user) {
  let l = Records.list(LISTE).find((x) => x.essai);
  if (!l) l = Records.create(LISTE, { ville: 'Essai', essai: true, etat: 'fini', journal: [], lancee_le: maintenant() });
  const existantes = Records.list(AGENCE).filter((a) => a.liste_id === l.id);
  for (const modele of AGENCES_ESSAI) {
    const a = existantes.find((x) => x.nom === modele.nom);
    if (!a) { Records.create(AGENCE, { liste_id: l.id, ...modele, agents: [], cree_le: maintenant() }); continue; }
    Records.update(AGENCE, a.id, { ...modele, morte: false, morte_le: null, pour: [], hors_cible: false, monday_connu: null });
    if (a.carnet_id) {
      Records.update('AgentImmo', a.carnet_id, { statut: 'nouveau', tentatives: 0, prochaine: null, dernier_contact_le: null, dernier_essai_le: null, referent: null, verrou: null });
      for (const x of Records.list(APPEL).filter((y) => y.agent_id === a.carnet_id && !y.essai_archive)) Records.update(APPEL, x.id, { essai_archive: true });
    }
  }
  const session = Records.create(SESSION, { liste_id: l.id, ville: 'Essai', essai: true, par: user?.email || null, debut: maintenant(), appels: [] });
  return { ok: true, session };
}

/** Renvoie le mail d'un appel qui n'est pas parti, et met le reçu à jour. */
export async function renvoyerMail(appelId, user) {
  const appel = Records.get(APPEL, appelId);
  const mailId = appel?.recu?.mail?.mail_id;
  if (!mailId) return { ok: false, error: 'Pas de mail pour cet appel.' };
  if (appel.essai) return { ok: false, error: 'Mode essai : le mail ne part pas.' };
  const m = Records.get('ProspectionMail', mailId);
  if (m && ['echec', 'brouillon', 'differe'].includes(m.etat)) Records.update('ProspectionMail', mailId, { etat: 'pret' });
  const { envoyerMails } = await import('./mails.js');
  const envoi = await envoyerMails([mailId], user);
  const mail = etatDuMail(envoi?.resultats?.[0] || null, m, appel.recu.mail);
  Records.update(APPEL, appel.id, { recu: { ...appel.recu, mail } });
  return { ok: mail.etat === 'ok', recu: { ...appel.recu, mail }, error: mail.etat === 'ok' ? null : mail.texte };
}
