// Ce qui vaut la peine d'être réessayé, et ce qui ne le vaut pas.
//
// Un employé qui se heurte à un service en panne repasse dans cinq minutes ;
// devant un mot de passe refusé, il ne réessaie pas trois fois, il prévient.
// Tout le comportement de la collecte tient à cette distinction, et les
// scrapers ne la font pas : ils rendent une phrase française, sans dire si
// elle décrit une panne passagère ou un mur.
//
// On la reconstitue ici, à partir de trois indices, du plus sûr au moins sûr :
// le statut HTTP quand il y en a un, le code réseau de Node, puis le texte du
// message — celui que data-b.js, equimmox.js et figaro.js écrivent déjà.
//
// Trois classes, et pas deux :
//   temporaire   le service a hoqueté → on réessaie, puis on passe à la suite
//   definitive   le compte, le plan, la configuration → on notifie, sans réessai
//   sans_donnee  le service marche, il n'a simplement rien sur cette adresse
//
// La troisième existe parce que « Le Figaro ne publie pas de prix pour
// Trifouillis » n'est pas une panne : la réessayer coûterait une minute pour
// obtenir la même absence.

export const TEMPORAIRE = 'temporaire';
export const DEFINITIVE = 'definitive';
export const SANS_DONNEE = 'sans_donnee';

/** Une erreur de source, qui sait dire d'où elle vient et ce qu'elle vaut. */
export class ErreurSource extends Error {
  constructor(message, { service = null, statut = null, classe = null, cause = null } = {}) {
    super(message);
    this.name = 'ErreurSource';
    this.service = service;
    this.statut = statut;
    // Un connecteur qui sait déjà à quoi il a affaire le dit, et sa parole
    // prime sur toute déduction faite du message.
    this.classe = classe;
    if (cause) this.cause = cause;
  }
}

// --- Le statut HTTP ---------------------------------------------------------

// Ceux qui passent : le service est debout, il est juste indisponible là,
// maintenant. 429 y compris — on nous demande d'attendre, on attend.
const STATUTS_TEMPORAIRES = new Set([408, 425, 429, 500, 502, 503, 504, 507, 509, 520, 521, 522, 523, 524, 525, 527, 530]);
// Ceux qui ne passeront pas en réessayant : la porte est fermée.
const STATUTS_DEFINITIFS = new Set([401, 402, 403, 407, 451]);
// Ceux qui disent « cette page n'existe pas » : ce n'est pas une panne.
const STATUTS_SANS_DONNEE = new Set([404, 410]);

/** Le statut HTTP d'une erreur, qu'il soit porté ou seulement écrit. */
export function statutDe(erreur) {
  if (!erreur) return null;
  const direct = Number(erreur.statut ?? erreur.status ?? erreur.statusCode);
  if (Number.isInteger(direct) && direct >= 100 && direct < 600) return direct;
  // « Data-B a répondu 502. », « Le Figaro a répondu 503. »
  const ecrit = String(erreur.message || erreur).match(/a répondu\s+(\d{3})\b/i);
  return ecrit ? Number(ecrit[1]) : null;
}

// --- Le réseau --------------------------------------------------------------

// Node range la vraie cause sous `cause` quand fetch échoue.
const CODES_RESEAU = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ETIMEDOUT', 'ENETUNREACH',
  'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN', 'EPROTO', 'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);

const estReseau = (e) =>
  CODES_RESEAU.has(e?.code) || CODES_RESEAU.has(e?.cause?.code) ||
  // AbortSignal.timeout() et les attentes de Playwright.
  e?.name === 'TimeoutError' || e?.name === 'AbortError' ||
  /\b(timeout|timed out|socket hang up|fetch failed|network|ECONNRESET)\b/i.test(String(e?.message || ''));

// --- Le message -------------------------------------------------------------
//
// L'ordre compte : « Analyse de loyer est introuvable (plan Premium ?) » est un
// mur, alors que « le menu Analyse est introuvable » est une page qui n'a pas
// fini de charger. Le motif le plus précis passe donc en premier.

const MURS = [
  /n['’]est pas configuré/i,            // clés absentes du .env
  /manquent dans \.env/i,
  /vérifiez le compte dans \.env/i,     // session refusée par le service
  /connexion à .+ refusée/i,
  /identifiants? refusés?/i,
  /compte (suspendu|bloqué|désactivé)/i,
  /plan premium/i,
  /abonnement|quota (épuisé|dépassé)/i,
  /a besoin d['’]un navigateur/i,       // Chromium absent : rien ne s'arrangera seul
];

const ABSENCES = [
  /adresse (introuvable|trop courte)/i,
  /ne (publie|propose|rend) (pas|aucune?)/i,
  /n['’]a (pas rendu|rendu aucune)/i,
  /aucune? (transaction|fourchette|estimation|donnée|résultat)/i,
  /commune non identifiée/i,
  /n['’]a pas été reconnue/i,           // l'adresse n'existe pas chez eux
];

const HOQUETS = [
  /ne répond pas comme attendu/i,
  /n['’]a pas répondu/i,
  /est introuvable/i,                   // un élément de page absent : page pas chargée
  /impossible de régler/i,
  /une session à la fois/i,             // quelqu'un se déconnectera
  /sans réponse/i,
];

const correspond = (motifs, texte) => motifs.some((m) => m.test(texte));

/**
 * Ce que vaut une erreur : temporaire, définitive, ou simple absence de donnée.
 *
 * Une erreur qu'aucun indice ne désigne est tenue pour temporaire : mieux vaut
 * un réessai inutile qu'une source abandonnée pour un hoquet qu'on n'a pas su
 * nommer. Le journal garde `reconnue: false` pour qu'on puisse le corriger.
 *
 * @param {Error|string} erreur
 * @returns {{classe: string, statut: number|null, reconnue: boolean, message: string}}
 */
export function classer(erreur) {
  const message = String(erreur?.message || erreur || '').trim() || 'Sans réponse.';
  const statut = statutDe(erreur);
  const rendre = (classe, reconnue = true) => ({ classe, statut, reconnue, message });

  // 1. Le connecteur savait : on ne discute pas.
  if (erreur?.classe && [TEMPORAIRE, DEFINITIVE, SANS_DONNEE].includes(erreur.classe)) {
    return rendre(erreur.classe);
  }
  // 2. Le statut HTTP, quand il y en a un.
  if (statut != null) {
    if (STATUTS_TEMPORAIRES.has(statut)) return rendre(TEMPORAIRE);
    if (STATUTS_DEFINITIFS.has(statut)) return rendre(DEFINITIVE);
    if (STATUTS_SANS_DONNEE.has(statut)) return rendre(SANS_DONNEE);
    if (statut >= 500) return rendre(TEMPORAIRE);
    if (statut >= 400) return rendre(DEFINITIVE);
  }
  // 3. Le réseau, qui ne ment pas non plus.
  if (estReseau(erreur)) return rendre(TEMPORAIRE);
  // 4. Le texte, du motif le plus précis au plus large.
  if (correspond(MURS, message)) return rendre(DEFINITIVE);
  if (correspond(ABSENCES, message)) return rendre(SANS_DONNEE);
  if (correspond(HOQUETS, message)) return rendre(TEMPORAIRE);
  return rendre(TEMPORAIRE, false);
}

/** Vrai si cette erreur mérite qu'on repasse. */
export const estTemporaire = (erreur) => classer(erreur).classe === TEMPORAIRE;

/** Vrai si elle doit remonter à l'utilisateur : compte, plan, configuration. */
export const aNotifier = (erreur) => classer(erreur).classe === DEFINITIVE;
