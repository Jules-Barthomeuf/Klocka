// Off-market, mode Simple (11 oct. 2026) : la casse des noms et des adresses,
// telle que Jules la veut. Les registres écrivent tout en capitales ; on
// rend « 15 Rue de la République », « Geoffroy MOISSE » (le premier prénom,
// puis le nom de famille en capitales), « Madame Lara NOEL » pour un
// particulier. Une société (SCI, BNP PARIBAS) ou une enseigne garde son nom tel quel.

const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'a', 'à', 'au', 'aux', 'en', 'sur', 'sous', 'l', 'd']);
const SIGLES = new Set(['zi', 'za', 'zac', 'zae', 'rn', 'rd', 'cd', 'bp', 'cs', 'sci', 'sarl', 'sas', 'sasu', 'eurl', 'snc', 'sa']);

/** Pure : un mot avec sa première lettre en capitale (et après un tiret). */
const capitale = (mot) => mot.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase());

/** Pure : « 15 RUE DE LA REPUBLIQUE » → « 15 Rue de la Republique ». */
export function adresseLisible(adresse) {
  const t = String(adresse || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  return t.split(' ').map((mot, i) => {
    const bas = mot.toLowerCase();
    if (/^\d/.test(mot)) return bas; // 15, 15bis, 71000
    if (SIGLES.has(bas.replace(/[.,]/g, ''))) return mot.toUpperCase();
    if (i > 0 && PETITS.has(bas)) return bas;
    if (/^[ld]['’]/i.test(mot) && i > 0) return bas.slice(0, 2) + capitale(mot.slice(2));
    return capitale(mot);
  }).join(' ');
}

/** Pure : l'adresse courte d'un commerce, sans le code postal ni la ville (« 15 Rue Carnot »). */
export function rueLisible(adresse) {
  const t = String(adresse || '').replace(/\s+\d{5}\s.*$/, '').trim();
  return adresseLisible(t || adresse);
}

const CIVILITES = /^(madame|monsieur|mme|mlle|mademoiselle|m\.?)\s+/i;
const FORMES_MORALES = /\b(sci|sarl|sas|sasu|eurl|snc|sa|scp|scm|sccv|selarl|gie|soci[ée]t[ée]|holding|groupe|fonci[èe]re|banque|bank|assurance|mutuelle|commune|ville|departement|r[ée]gion|office|habitat|immobili[èe]re|association|syndicat|compagnie|cie|caisse|credit|cr[ée]dit|indivision|consorts|copropri[ée]t[ée])\b/i;

/** Pure : ce nom est-il celui d'une personne (et pas d'une société) ? */
export function estPersonne(nom, { forme = null } = {}) {
  const t = String(nom || '').trim();
  if (!t) return false;
  if (CIVILITES.test(t)) return true;
  if (/entrepreneur individuel|personne physique/i.test(String(forme || ''))) return true;
  if (forme && !/entrepreneur individuel/i.test(String(forme))) return false;
  return false;
}

/**
 * Pure : « GEOFFROY JEAN-GHISLAIN MOISSE » → « Geoffroy MOISSE ». Le nom de
 * famille vient du registre quand il le donne (`nom_famille`) ; sinon c'est
 * le dernier mot (et ce qui est entre parenthèses, le nom d'usage, le suit).
 * Une civilité est gardée en toutes lettres : « Madame Lara NOEL ».
 */
export function personneLisible(nom, { nom_famille = null } = {}) {
  let t = String(nom || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  let civilite = '';
  const m = t.match(CIVILITES);
  if (m) { const c = m[1].toLowerCase().replace('.', ''); civilite = c === 'm' || c === 'monsieur' ? 'Monsieur ' : 'Madame '; t = t.slice(m[0].length); }
  const usage = (t.match(/\(([^)]*)\)/) || [])[1] || null;
  const sans = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  let famille = nom_famille ? String(nom_famille).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() : null;
  let prenoms = sans;
  if (famille && sans.toUpperCase().includes(famille.toUpperCase())) prenoms = sans.replace(new RegExp(famille.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim();
  else {
    const mots = sans.split(' ');
    // Data-B écrit « NOM Prénom » quand le prénom est en minuscules : sinon, le nom est à la fin.
    const prenomEnMinuscules = mots.length > 1 && mots[0] === mots[0].toUpperCase() && mots.slice(1).some((x) => x !== x.toUpperCase());
    if (prenomEnMinuscules) { famille = mots[0]; prenoms = mots.slice(1).join(' '); } else { famille = mots.pop(); prenoms = mots.join(' '); }
  }
  const premier = prenoms.split(' ').filter(Boolean)[0] || '';
  const nomFamille = `${famille.toUpperCase()}${usage ? ` (${usage.toUpperCase()})` : ''}`;
  return `${civilite}${premier ? `${capitale(premier)} ` : ''}${nomFamille}`.trim();
}

const FORMES = new Set(['sci', 'sarl', 'sas', 'sasu', 'eurl', 'snc', 'sa', 'scp', 'scm', 'sccv', 'selarl', 'selas', 'gie', 'sem', 'spl', 'ei', 'eirl', 'scea', 'gaec', 'earl', 'sca', 'sc']);

/**
 * Pure : une société ou une enseigne en minuscules avec une capitale à chaque
 * mot (« PITOA IMMOBILIER » → « Pitoa Immobilier », « CAISSE D'EPARGNE » →
 * « Caisse d'Epargne ») ; les formes juridiques et les sigles sans voyelle
 * restent en capitales (« SCI Planche », « BNP Paribas »).
 */
export function societeLisible(nom) {
  const t = String(nom || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;
  // Déjà écrit à la main en minuscules et capitales : on n'y touche pas.
  if (t !== t.toUpperCase()) return t;
  return t.split(' ').map((mot, i) => {
    const nu = mot.replace(/[().,]/g, '');
    const bas = nu.toLowerCase();
    if (FORMES.has(bas) || (nu.length >= 2 && nu.length <= 5 && !/[AEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛÜ]/i.test(nu) && /^\p{L}+$/u.test(nu))) return mot.toUpperCase();
    if (/^\d/.test(mot)) return mot.toLowerCase();
    if (i > 0 && PETITS.has(bas)) return mot.toLowerCase();
    if (/^[ld]['’]/i.test(mot) && i > 0) return mot.slice(0, 2).toLowerCase() + capitale(mot.slice(2));
    return mot.replace(/\p{L}[\p{L}'’-]*/gu, (m) => capitale(m));
  }).join(' ');
}

/** Pure : le nom d'un propriétaire ou d'un exploitant : une personne en « Prénom NOM », une société en « Pitoa Immobilier ». */
export function nomLisible(nom, { forme = null, nom_famille = null } = {}) {
  const t = String(nom || '').trim();
  if (!t) return t;
  if (FORMES_MORALES.test(t) && !CIVILITES.test(t)) return societeLisible(t);
  return estPersonne(t, { forme }) ? personneLisible(t, { nom_famille }) : societeLisible(t);
}
