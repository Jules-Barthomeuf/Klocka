// Les notifications de l'application : ce que Klocka a fait seul et qu'il
// faut savoir (une fiche reçue et préanalysée, une tâche de fond finie). Elles
// remplacent les messages qu'AK envoyait dans Google Chat.
//
// Une notification est enregistrée ici, puis l'écran la montre en carte en
// haut à droite (une seule fois), avec un bouton qui mène à la page. Rien ne
// s'y déclenche : elle dit, elle ne fait pas.

import { Records } from './db.js';
import { SUPER_ADMINS } from './acces-pages.js';

const PLAFOND = 300;

/**
 * Pose une notification.
 * @param {{pour?: string|null, titre: string, texte?: string, lien?: string, action?: string, genre?: string, cle?: string}} n
 *   `pour` : l'adresse de la personne ; sans elle, Jules seul (22 oct. 2026 : chacun ne voit que les siennes).
 *   `cle` : une même clé ne notifie qu'une fois (une fiche, un dossier).
 */
// Le tri des notifications (23 nov. 2026, Jules : « je veux que ces notifications soient réellement utiles », puis
// « tout à enlever, enlève-le »). Depuis le 15 nov., la cloche n'est plus à l'écran : le serveur écrivait encore une
// cinquantaine de sortes de notifications que personne ne voyait.
// RETIREES : on ne les crée plus. Chacune avec sa raison ; en enlever une ligne la remet.
export const RETIREES = [
  [/^Votre analyste est maintenant /, 'informatif, la plus fréquente'],
  [/^Vous reprenez un dossier/, 'on le sait déjà'],
  [/^Je t'ai préparé un petit quiz|^Un tuto de 2 minutes/, 'coaching, pas demandé'],
  [/^Votre matinée$/, 'résumé que personne n\'ouvre'],
  [/fais-lui ton briefing|^Bon retour|^Briefing de |attend ta relecture$|fais le brief à /, 'agenda de l\'équipe : cinq rappels pour une absence'],
  [/^\S+ a appelé /, 'le travail d\'un collègue'],
  [/^Mandat validé ·|^Votre mandat est validé ·|^Mandat signé(?: |$)/, 'trois variantes du même mandat : restent « Mandat à saisir » et « Votre mandat signé est arrivé »'],
  [/^Collecte d'annonces coupée|^Import raté|^Plafond Assistant Klocka atteint|une action est incertaine$|^Equimmox :/, 'technique : le journal et Suivi, pas une notification'],
  [/^Assistant (Klocka|KPartners) : /, 'les questions de la file : plus d\'écran depuis la cloche'],
  [/a répondu|est prêt à parler affaires|^Réponse sur /, 'un agent a répondu : retiré par Jules'],
  [/question sur un de tes appels/, 'les questions sur les appels : retiré par Jules'],
];
const CLES_RETIREES = [
  ['haka-transfert:', 'le compte rendu du transfert, dans le chat, le remplace (server/haka/compte-rendu-transfert.js)'],
  ['newsletter-alerte:', 'un agent a répondu : retiré par Jules'],
  ['tache:', 'rappeler un agent (Emailing) : retiré par Jules'],
  ['cerveau-question-', 'les questions de l\'Intelligence : pas d\'écran'],
];
/** Pure : la notification est-elle retirée ? */
export const estRetiree = ({ titre = '', cle = null } = {}) => RETIREES.some(([re]) => re.test(String(titre))) || CLES_RETIREES.some(([k]) => String(cle || '').startsWith(k));
// GARDEES : celles qu'on montre, en notification normale (l'avis de l'application, « Voir », et « À faire » si on la
// ferme) : chacune demande un geste ou ferme une attente. Les autres (ni retirées ni gardées) restent écrites, sans
// s'afficher, en attendant qu'on les classe.
export const GARDEES = [
  /^Votre LOI est prête/, /^C'est prêt :/, /^Tâche interrompue/,
  /^Dossier pour vous ·/, /^Nouvelle fiche/,
  /a déposé (une pièce|\d+ pièces)/, /demande une pièce/, /^Offre en cours ·/,
  /bon de visite n'est pas signé/,
  /^Mandat à saisir/, /^Votre mandat signé est arrivé/,
  /^Rapport prêt ·|^Estimation impossible ·/,
];
/** Pure : la notification se montre-t-elle ? */
export const estGardee = ({ titre = '' } = {}) => GARDEES.some((re) => re.test(String(titre)));

export function notifier({ pour = null, titre, texte = null, lien = null, action = null, genre = 'info', cle = null }) {
  if (!String(titre || '').trim()) return null;
  if (estRetiree({ titre, cle })) return null;
  if (cle && Records.list('Notification').some((n) => n.cle === cle)) return null;
  const n = Records.create('Notification', {
    pour: pour ? String(pour).toLowerCase() : null,
    titre: String(titre).slice(0, 140),
    texte: texte ? String(texte).slice(0, 600) : null,
    lien, action: action || (lien ? 'Ouvrir' : null), genre, cle,
    le: new Date().toISOString(),
    vue_par: [],
    lue_par: [],
    montrer: estGardee({ titre }),
  });
  elaguer();
  return n;
}

// Chacun ne voit que ses notifications (22 oct. 2026, Jules : « je ne dois pas voir les notifications que reçoivent
// les autres ») : une notification sans destinataire va à Jules seul, plus à tous les admins. Les copies qu'il
// recevait des questions posées aux analystes ne se montrent plus.
const pourMoi = (n, user) => {
  const email = String(user?.email || '').toLowerCase();
  if (String(n.cle || '').startsWith('question-appel-jules:')) return false;
  return n.pour ? n.pour === email : email === SUPER_ADMINS[0];
};

/** Les notifications d'une personne, les plus récentes d'abord. */
export function mesNotifications(user, { limite = 30 } = {}) {
  const email = String(user?.email || '').toLowerCase();
  const toutes = Records.list('Notification')
    .filter((n) => pourMoi(n, user) && !(n.supprimee_par || []).includes(email))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    notifications: toutes.slice(0, limite).map((n) => ({
      id: n.id, titre: n.titre, texte: n.texte, lien: n.lien, action: n.action, genre: n.genre, le: n.le,
      vue: (n.vue_par || []).includes(email), lue: (n.lue_par || []).includes(email),
    })),
    non_lues: toutes.filter((n) => !(n.lue_par || []).includes(email)).length,
  };
}

/** Les notifications gardées pas encore montrées à cette personne (trois jours au plus) : l'écran en fait des avis. */
export function aMontrer(user, { maintenant = Date.now() } = {}) {
  const email = String(user?.email || '').toLowerCase();
  return Records.list('Notification')
    .filter((n) => n.montrer && pourMoi(n, user) && !(n.vue_par || []).includes(email) && maintenant - Date.parse(n.le || 0) < 3 * 86400000)
    .sort((a, b) => String(a.le).localeCompare(String(b.le)))
    .map((n) => ({ id: n.id, titre: n.titre, texte: n.texte, lien: n.lien, action: n.action, le: n.le }));
}

/** Les notifications gardées fermées sans être ouvertes : des lignes de « À faire ». */
export function aFaire(user) {
  const email = String(user?.email || '').toLowerCase();
  return Records.list('Notification')
    .filter((n) => n.montrer && pourMoi(n, user) && (n.a_faire_par || []).includes(email) && !(n.lue_par || []).includes(email))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map((n) => ({ id: `notif:${n.id}`, genre: 'notification', titre: n.titre, resume: n.texte, lien: n.lien, notification: n.id, echeance: null, du: false, contexte: [], fiches: [] }));
}

/** `vue` : la carte s'est montrée (on ne la remontre pas). `lue` : on l'a ouverte ou fermée. `plus_tard` : vue, et dans « À faire ». */
export function marquer(id, user, quoi = 'lue') {
  const n = Records.get('Notification', id);
  if (!n || !pourMoi(n, user)) return { ok: false, error: 'Notification introuvable.' };
  const email = String(user.email).toLowerCase();
  const champs = quoi === 'vue' ? ['vue_par'] : quoi === 'plus_tard' ? ['vue_par', 'a_faire_par'] : ['vue_par', 'lue_par'];
  const patch = {};
  for (const c of champs) if (!(n[c] || []).includes(email)) patch[c] = [...(n[c] || []), email];
  if (Object.keys(patch).length) Records.update('Notification', n.id, patch);
  return { ok: true };
}

export function toutLire(user) {
  for (const n of mesNotifications(user, { limite: PLAFOND }).notifications.filter((x) => !x.lue)) marquer(n.id, user, 'lue');
  return { ok: true };
}

/** Supprimer une notification de sa liste (19 oct. 2026, Jules). Une notification d'équipe reste chez les autres. */
export function supprimer(id, user) {
  const n = Records.get('Notification', id);
  if (!n || !pourMoi(n, user)) return { ok: false, error: 'Notification introuvable.' };
  const email = String(user.email).toLowerCase();
  if (n.pour) Records.delete('Notification', n.id);
  else if (!(n.supprimee_par || []).includes(email)) Records.update('Notification', n.id, { supprimee_par: [...(n.supprimee_par || []), email] });
  return { ok: true };
}

/** Vider sa liste. */
export function toutSupprimer(user) {
  for (const n of mesNotifications(user, { limite: PLAFOND }).notifications) supprimer(n.id, user);
  return { ok: true };
}

function elaguer() {
  const toutes = Records.list('Notification').sort((a, b) => String(a.le).localeCompare(String(b.le)));
  for (const n of toutes.slice(0, Math.max(0, toutes.length - PLAFOND))) Records.delete('Notification', n.id);
}
