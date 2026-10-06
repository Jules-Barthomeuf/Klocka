// Le mode appel de la prospection (6 oct. 2026) : une ville, ses agences
// rangées par ce qui compte (relance due d'abord, les agences de commerce
// avant le résidentiel, les mortes en gris à la fin), puis une file d'appels
// pensée pour le téléphone. L'analyste appelle, tape l'issue en un geste, et
// ne dicte que pour les vraies conversations. La plateforme écrit dans
// Monday, puis RELIT Monday : le reçu dit ce qui y est réellement, pas ce qui
// a été demandé. Un échec reste orange et se réessaie seul.

import { Records } from '../db.js';
import * as R from './regles.js';

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
  return { etat, libelle, detail: morceaux.join(', ') || null, probable, qui, quand, dernier_statut: dernierStatut, relance_le: relanceLe, interessee, a_rappeler: aRappeler, appelee: !!dernier };
}

// Un agent immatriculé en nom propre (« Monsieur Nicolas Mouette ») : le code
// d'activité « agence immobilière » de Data-B compte aussi les mandataires
// indépendants. Un nom relevé sur des annonces, sans numéro ni site, n'est
// pas une agence qu'on appelle.
const PERSONNE = /^(monsieur|madame|mademoiselle|m\.|mme)\s+/i;

/** Pure : ce qu'est une ligne : une agence, un agent indépendant, ou un nom d'annonce. */
export function genreDe(a) {
  if (PERSONNE.test(String(a?.raison_sociale || '')) || PERSONNE.test(String(a?.nom || ''))) return 'independant';
  if (!a?.telephone && !a?.site && !(a?.agents || []).some((x) => x.telephone) && (a?.sources || []).every((x) => x === 'Equimmox')) return 'annonceur';
  return 'agence';
}

/** Pure : l'ordre de la ville. Relance due d'abord, puis le commerce avant le résidentiel, les jamais contactées avant les autres, les mortes à la fin. */
export function ordreDeLaVille(lignes) {
  const rang = (x) => (x.statut.etat === 'relance' ? 0 : x.statut.etat === 'morte' ? 2 : 1);
  // Les agences d'abord, puis les indépendants, puis les noms d'annonces.
  const genre = (x) => ({ agence: 0, independant: 1, annonceur: 2 })[x.genre || 'agence'] ?? 0;
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
    if (!ids.has(x.agent_id)) continue;
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

/** Le numéro à appeler : celui de l'agence, sinon celui d'un de ses agents. */
const numeroDe = (a) => a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || null;

/**
 * La file d'une ville pour une personne : les agences vivantes qui ont un
 * numéro, pas déjà appelées aujourd'hui, pas tenues par un collègue (verrou
 * ou colonne « Qui »), contactées il y a plus d'un mois sauf relance due.
 */
export function fileDAppel(listeId, user, { maintenantD = new Date() } = {}) {
  const l = Records.get(LISTE, listeId);
  if (!l) return { ok: false, error: 'Liste introuvable.' };
  const moi = String(user?.email || '').toLowerCase();
  const agences = Records.list(AGENCE).filter((a) => a.liste_id === listeId && !a.hors_cible);
  const lignes = annoter(agences, maintenantD);
  const jour = R.jourDe(maintenantD);
  const ilYaUnMois = R.jourDe(new Date(maintenantD.getTime() - 30 * 86400000));
  const fiches = new Map(Records.list('AgentImmo').map((x) => [x.id, x]));
  const demandes = Records.list('DemandeClient');
  const recherches = recherchesDeLaZone(demandes, l.ville, { departement: departementDe(agences) });
  // Dans la file (6 oct. 2026) : les lignes qui me sont associées, et les
  // agences jamais contactées que personne n'a prises. Rien d'autre.
  const file = lignes.filter((a) => {
    if (a.statut.etat === 'morte' || !numeroDe(a) || a.genre === 'annonceur') return false;
    const pour = a.pour || [];
    const aMoi = pour.includes(moi);
    if (!aMoi && !(a.statut.etat === 'jamais' && !pour.length)) return false;
    const f = fiches.get(a.carnet_id);
    if (f && R.verrouTenu(f.verrou) && f.verrou.par !== moi) return false;
    if (a.statut.quand && String(a.statut.quand).slice(0, 10) === jour) return false;
    if (!aMoi && a.statut.etat === 'contact' && a.statut.quand && String(a.statut.quand).slice(0, 10) > ilYaUnMois) return false;
    return true;
  })
    // Un même numéro ne passe qu'une fois dans la file : on n'appelle pas deux fois la même agence.
    .filter((a, i, l) => l.findIndex((x) => R.normTel(numeroDe(x)) === R.normTel(numeroDe(a))) === i)
    .map((a) => {
    const f = fiches.get(a.carnet_id) || null;
    const derniers = Records.list(APPEL).filter((x) => x.agent_id === a.carnet_id && x.etat === 'valide').sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 3);
    return {
      id: a.id, nom: a.nom, adresse: a.adresse || null, telephone: numeroDe(a),
      autres_numeros: [...new Set((a.agents || []).map((x) => x.telephone).filter((t) => t && R.normTel(t) !== R.normTel(numeroDe(a))))].slice(0, 3),
      email: a.email || (a.agents || []).find((x) => x.email)?.email || null,
      interlocuteurs: [
        ...(a.gerants || []).slice(0, 2).map((g) => `${g.nom}${g.qualite ? `, ${String(g.qualite).toLowerCase()}` : ''}`),
        ...(a.agents || []).filter((x) => x.nom).slice(0, 3).map((x) => `${x.nom}${x.telephone ? ` · ${x.telephone}` : ''}`),
        a.monday_connu?.nom ? `${a.monday_connu.nom} (dans Monday)` : null,
      ].filter(Boolean),
      statut: a.statut, pertinence: a.pertinence,
      historique: [
        ...derniers.map((x) => `${String(x.le).slice(0, 10)} · ${prenom(x.par)} · ${R.ISSUES[x.issue] || x.issue}${x.resume ? ` : ${x.resume}` : ''}`),
        ...(!derniers.length && f?.remarques ? [f.remarques] : []),
        ...(!derniers.length && a.monday_connu ? [`Monday (${a.monday_connu.tableau}) : ${[a.monday_connu.statut, a.monday_connu.date].filter(Boolean).join(', ')}`] : []),
      ].slice(0, 4),
      site: a.site || null, maps_url: a.maps_url || null,
    };
  });
  return { ok: true, ville: l.ville, chiffres: chiffresDeLaVille(lignes), recherches, file };
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

/** Le récapitulatif : « 23 appels · 4 intéressés · 4 mails envoyés · 11 relances planifiées · tout est à jour dans Monday. » */
export function recapSession(sessionId) {
  const s = Records.get(SESSION, sessionId);
  if (!s) return { ok: false, error: 'Session introuvable.' };
  const recus = (s.appels || []).map((x) => Records.get(APPEL, x.appel_id)?.recu || null).filter(Boolean);
  const mondayEnAttente = recus.filter((r) => r.monday && r.monday.etat !== 'ok').length;
  return {
    ok: true, ville: s.ville, debut: s.debut, fin: s.fin || null,
    appels: (s.appels || []).length,
    interesses: (s.appels || []).filter((x) => x.issue === 'interesse').length,
    mails_envoyes: recus.filter((r) => r.mail?.etat === 'ok').length,
    relances: recus.filter((r) => r.relance?.etat === 'ok').length,
    monday_en_attente: mondayEnAttente,
    monday_a_jour: mondayEnAttente === 0,
  };
}

// ---------------------------------------------------------------------------
// Prendre, appeler, l'issue
// ---------------------------------------------------------------------------

// Les issues tapées en raccrochant, et leur clé dans les règles.
export const ISSUES_APPEL = {
  pas_de_reponse: { cle: 'pas_de_reponse', titre: 'Pas de réponse', simple: true },
  mauvais_numero: { cle: 'invalide', titre: 'Mauvais numéro / fermée', simple: true },
  pas_interesse: { cle: 'pas_interesse', titre: 'Pas intéressé', court: true },
  a_rappeler: { cle: 'a_rappeler', titre: 'À rappeler', vocal: true },
  interesse: { cle: 'interesse', titre: 'Intéressé', vocal: true },
};

/** L'agence prise pour l'appeler : elle entre au carnet si besoin, et personne d'autre ne la prend pendant trente minutes. */
export async function prendre(agenceId, user) {
  const a = Records.get(AGENCE, agenceId);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  const IA = await import('./agent-ia.js');
  const parAgent = !a.telephone ? (a.agents || []).find((x) => x.telephone) : null;
  const p = await IA.pourAppeler(agenceId, { agent: parAgent ? parAgent.telephone : null }, user);
  if (!p.ok) return p;
  const { verrouiller } = await import('./carnet.js');
  const v = verrouiller(p.agent_id, String(user?.email || '').toLowerCase());
  if (!v.ok) return v;
  return { ok: true, agent_id: p.agent_id };
}

/**
 * L'issue tapée. Pas de réponse et mauvais numéro se valident d'office et
 * rendent le reçu ; les autres rendent les propositions à relire (avec le
 * vocal transcrit, s'il y en a un).
 */
export async function noterIssue({ agence_id, agent_id, issue, session_id = null, audio = null, recit = null, user }) {
  const def = ISSUES_APPEL[issue];
  if (!def) return { ok: false, error: 'Issue inconnue.' };
  const a = Records.get(AGENCE, agence_id);
  if (!a) return { ok: false, error: 'Agence introuvable.' };
  let agentId = agent_id;
  if (!agentId) { const p = await prendre(agence_id, user); if (!p.ok) return p; agentId = p.agent_id; }
  const A = await import('./appel.js');
  let texte = recit;
  if (audio?.length) {
    try { texte = [await A.transcrire(audio), recit].filter(Boolean).join('\n'); } catch (e) { return { ok: false, error: `Le vocal n'a pas pu être lu : ${e?.message || e}. Tapez quelques mots à la place.` }; }
  }
  const lu = await A.analyserAppel({ agent_id: agentId, recit: texte || null, issue: def.cle, par: user?.email, sans_reponse: issue === 'pas_de_reponse' });
  if (!lu.ok) return lu;
  if (issue === 'mauvais_numero') Records.update(AGENCE, a.id, { morte: true, morte_le: maintenant(), morte_par: user?.email || null, morte_pourquoi: 'mauvais numéro ou fermée' });
  if (def.simple) {
    const choix = lu.appel.propositions.filter((p) => p.coche !== false && p.type !== 'mail' && p.type !== 'sms').map((p) => p.id);
    return validerIssue({ appel_id: lu.appel.id, choix, envoyer: false, session_id, agence_id, user, issue });
  }
  // Les actions de plus : signaler un bien évoqué, prévenir un collègue qui tient aussi la ligne. Décochées.
  const extras = [];
  if ((lu.appel.biens || []).length) extras.push({ id: 'signaler_bien', type: 'signaler_bien', titre: `Signaler le bien évoqué : ${lu.appel.biens[0]}`, biens: lu.appel.biens, coche: false, ...(lu.appel.citations?.biens ? { source: lu.appel.citations.biens } : {}) });
  const autres = (a.pour || []).filter((e) => e !== String(user?.email || '').toLowerCase());
  if (autres.length) extras.push({ id: 'prevenir', type: 'prevenir', titre: `Prévenir ${autres.map(prenom).join(', ')} : la ligne est aussi à eux`, pour: autres, coche: false });
  const propositions = [...lu.appel.propositions, ...extras];
  Records.update(APPEL, lu.appel.id, { propositions, agence_id: a.id, session_id });
  return { ok: true, simple: false, appel: { ...lu.appel, propositions, agence: a.nom, issue_tapee: issue } };
}

/**
 * Valider : la fiche, la relance, le mail (envoyé si demandé), Monday, puis le
 * reçu, vérifié. Rend { ok, recu }.
 */
export async function validerIssue({ appel_id, choix = [], mail = null, envoyer = true, session_id = null, agence_id = null, user, issue = null }) {
  const appel = Records.get(APPEL, appel_id);
  if (!appel) return { ok: false, error: 'Appel introuvable.' };
  const A = await import('./appel.js');
  const v = await A.validerAppel({ appel_id, choix, mail, envoyer, user });
  if (!v.ok) return v;
  const pris = new Set(choix);
  const props = (appel.propositions || []).filter((p) => pris.has(p.id));
  const agenceId = agence_id || appel.agence_id || null;
  const ag = agenceId ? Records.get(AGENCE, agenceId) : null;
  const { journal } = await import('./carnet.js');
  const extras = [];
  const bien = props.find((p) => p.type === 'signaler_bien');
  if (bien) {
    journal(appel.agent_id, { type: 'note', texte: `Bien signalé : ${bien.biens.join(' ; ')}. À envoyer en pré-analyse dès que la fiche arrive.`, par: user?.email || null });
    const { notifier } = await import('../notifications.js');
    notifier({ pour: user?.email || null, titre: `Bien signalé chez ${ag?.nom || appel.agent}`, texte: `${bien.biens.join(' ; ')}. Demandez la fiche, puis envoyez-la en pré-analyse.`, lien: '/Prospection', genre: 'info' });
    extras.push({ quoi: 'bien', etat: 'ok', texte: `Bien noté : ${bien.biens[0]}, à envoyer en pré-analyse` });
  }
  const prevenir = props.find((p) => p.type === 'prevenir');
  if (prevenir) {
    const { notifier } = await import('../notifications.js');
    for (const e of prevenir.pour) notifier({ pour: e, titre: `${prenom(user?.email)} a appelé ${ag?.nom || appel.agent}`, texte: `${R.ISSUES[appel.issue] || appel.issue}${appel.resume ? ` : ${appel.resume}` : ''}`, lien: '/Prospection', genre: 'info' });
    extras.push({ quoi: 'collegue', etat: 'ok', texte: `${prevenir.pour.map(prenom).join(', ')} prévenu${prevenir.pour.length > 1 ? 's' : ''}` });
  }
  const recu = await recuDe(appel_id, v, extras);
  noterDansSession(session_id || appel.session_id, { appel_id, agence_id: agenceId, issue: issue || Object.keys(ISSUES_APPEL).find((x) => ISSUES_APPEL[x].cle === appel.issue) || appel.issue, le: maintenant() });
  return { ok: true, simple: !!ISSUES_APPEL[issue]?.simple, recu };
}

// ---------------------------------------------------------------------------
// Le reçu, vérifié
// ---------------------------------------------------------------------------

const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/**
 * Écrit l'agent dans Monday puis relit sa ligne : le reçu dit ce que Monday
 * contient, et seulement si c'est bien ce qu'on y a écrit. Sinon, la ligne
 * reste « en attente » et un nouvel essai part seul.
 */
export async function ecrireEtRelire(agentId, { pousser = null, relire = null, colonnes = null } = {}) {
  const { agentDe } = await import('./carnet.js');
  const a = agentDe(agentId);
  if (!a) return { etat: 'echec', texte: 'Agent introuvable' };
  const attendu = R.STATUTS[a.statut] || R.STATUTS.nouveau;
  try {
    const M = await import('./monday.js');
    if (!pousser && !M.mondayConfigure()) return { etat: 'attente', texte: "Monday n'est pas branché ici : rien n'a été écrit" };
    const r = await (pousser || M.pousserUnAgent)(agentId);
    if (!r?.ok) throw new Error(r?.error || "Monday n'a pas répondu");
    const lu = await (relire || (async (id) => (await import('../monday.js')).lireElement(id)))(r.id);
    const cols = colonnes || M.tableaux()?.agents?.colonnes || {};
    const statutLu = cols.statut ? lu?.colonnes?.[cols.statut] : null;
    if (!lu) throw new Error('la ligne écrite ne se relit pas');
    if (cols.statut && statutLu !== attendu) throw new Error(`Monday affiche « ${statutLu || 'rien'} » au lieu de « ${attendu} »`);
    const agence = cols.agence ? lu.colonnes[cols.agence] : a.agence;
    return { etat: 'ok', texte: [agence, lu.nom, statutLu || attendu].filter(Boolean).filter((x, i, l) => l.indexOf(x) === i).join(' · '), lien: r.lien || null, relu_le: maintenant() };
  } catch (e) {
    return { etat: 'attente', texte: 'Monday en attente, nouvel essai en cours', erreur: String(e?.message || e).slice(0, 200) };
  }
}

async function recuDe(appelId, v, extras = []) {
  const appel = Records.get(APPEL, appelId);
  const { agentDe } = await import('./carnet.js');
  const a = agentDe(appel.agent_id);
  const monday = await ecrireEtRelire(appel.agent_id);
  if (monday.etat !== 'ok') {
    const deja = Records.list(ATTENTE).find((x) => x.appel_id === appelId && !x.fait_le);
    if (!deja) Records.create(ATTENTE, { appel_id: appelId, agent_id: appel.agent_id, essais: 1, dernier_essai_le: maintenant(), erreur: monday.erreur || null });
  }
  // Le mail : le statut d'envoi réel, pas « envoi demandé ».
  let mail = null;
  const r0 = v?.envoi?.resultats?.[0] || null;
  const m = v?.mail_id ? Records.get('ProspectionMail', v.mail_id) : null;
  if (v?.envoi) {
    mail = r0?.success && !r0?.simulated
      ? { etat: 'ok', texte: `Mail envoyé à ${m?.a || ''}`, mail_id: v.mail_id }
      : r0?.simulated || v.envoi.simules
        ? { etat: 'attente', texte: "Mail non parti : aucune boîte d'envoi connectée", mail_id: v.mail_id }
        : { etat: 'echec', texte: `Mail non parti : ${r0?.error || 'erreur'}`, mail_id: v.mail_id };
  } else if (v?.mail_id) mail = { etat: 'info', texte: 'Mail prêt dans « À envoyer »', mail_id: v.mail_id };
  if (mail && m) mail.detail = { a: m.a, objet: m.objet, corps: m.corps };
  const relance = a?.prochaine?.le ? { etat: 'ok', texte: `Relance ${jourLong(a.prochaine.le)}${a.prochaine.moment ? `, ${a.prochaine.moment}` : ''}` } : null;
  const recu = { monday, mail, relance, extras, le: maintenant() };
  Records.update(APPEL, appelId, { recu });
  return recu;
}

/** Le reçu d'un appel, tel qu'il est maintenant (Monday a pu se rattraper entre-temps). */
export function recu(appelId) {
  const appel = Records.get(APPEL, appelId);
  return appel?.recu ? { ok: true, recu: appel.recu } : { ok: false, error: 'Pas de reçu pour cet appel.' };
}

/** Le tour des écritures Monday en attente : chacune se réessaie, et le reçu passe au vert dès que Monday a la bonne ligne. */
export async function reessayerAttentes({ max = 20 } = {}) {
  const enCours = Records.list(ATTENTE).filter((x) => !x.fait_le).slice(0, max);
  let faits = 0;
  for (const x of enCours) {
    const monday = await ecrireEtRelire(x.agent_id);
    const appel = Records.get(APPEL, x.appel_id);
    if (monday.etat === 'ok') {
      Records.update(ATTENTE, x.id, { fait_le: maintenant(), essais: (x.essais || 0) + 1 });
      if (appel?.recu) Records.update(APPEL, appel.id, { recu: { ...appel.recu, monday } });
      faits += 1;
    } else {
      Records.update(ATTENTE, x.id, { essais: (x.essais || 0) + 1, dernier_essai_le: maintenant(), erreur: monday.erreur || null });
    }
  }
  return { essayes: enCours.length, faits };
}
