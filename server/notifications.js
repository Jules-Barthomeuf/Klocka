// Les notifications de l'application : ce que Klocka a fait seul et qu'il
// faut savoir (une fiche reçue et préanalysée, une tâche de fond finie). Elles
// remplacent les messages qu'AK envoyait dans Google Chat.
//
// Une notification est enregistrée ici, puis l'écran la montre en carte en
// haut à droite (une seule fois), avec un bouton qui mène à la page. Rien ne
// s'y déclenche : elle dit, elle ne fait pas.

import { Records } from './db.js';

const PLAFOND = 300;

/**
 * Pose une notification.
 * @param {{pour?: string|null, titre: string, texte?: string, lien?: string, action?: string, genre?: string, cle?: string}} n
 *   `pour` : l'adresse de la personne ; sans elle, toute l'équipe (les admins).
 *   `cle` : une même clé ne notifie qu'une fois (une fiche, un dossier).
 */
export function notifier({ pour = null, titre, texte = null, lien = null, action = null, genre = 'info', cle = null }) {
  if (!String(titre || '').trim()) return null;
  if (cle && Records.list('Notification').some((n) => n.cle === cle)) return null;
  const n = Records.create('Notification', {
    pour: pour ? String(pour).toLowerCase() : null,
    titre: String(titre).slice(0, 140),
    texte: texte ? String(texte).slice(0, 600) : null,
    lien, action: action || (lien ? 'Ouvrir' : null), genre, cle,
    le: new Date().toISOString(),
    vue_par: [],
    lue_par: [],
  });
  elaguer();
  return n;
}

const pourMoi = (n, user) => (n.pour ? n.pour === String(user?.email || '').toLowerCase() : user?.role === 'admin');

/** Les notifications d'une personne, les plus récentes d'abord. */
export function mesNotifications(user, { limite = 30 } = {}) {
  const email = String(user?.email || '').toLowerCase();
  const toutes = Records.list('Notification')
    .filter((n) => pourMoi(n, user))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
  return {
    notifications: toutes.slice(0, limite).map((n) => ({
      id: n.id, titre: n.titre, texte: n.texte, lien: n.lien, action: n.action, genre: n.genre, le: n.le,
      vue: (n.vue_par || []).includes(email), lue: (n.lue_par || []).includes(email),
    })),
    non_lues: toutes.filter((n) => !(n.lue_par || []).includes(email)).length,
  };
}

/** `vue` : la carte s'est montrée (on ne la remontre pas). `lue` : on l'a ouverte ou fermée. */
export function marquer(id, user, quoi = 'lue') {
  const n = Records.get('Notification', id);
  if (!n || !pourMoi(n, user)) return { ok: false, error: 'Notification introuvable.' };
  const email = String(user.email).toLowerCase();
  const champs = quoi === 'vue' ? ['vue_par'] : ['vue_par', 'lue_par'];
  const patch = {};
  for (const c of champs) if (!(n[c] || []).includes(email)) patch[c] = [...(n[c] || []), email];
  if (Object.keys(patch).length) Records.update('Notification', n.id, patch);
  return { ok: true };
}

export function toutLire(user) {
  for (const n of mesNotifications(user, { limite: PLAFOND }).notifications.filter((x) => !x.lue)) marquer(n.id, user, 'lue');
  return { ok: true };
}

function elaguer() {
  const toutes = Records.list('Notification').sort((a, b) => String(a.le).localeCompare(String(b.le)));
  for (const n of toutes.slice(0, Math.max(0, toutes.length - PLAFOND))) Records.delete('Notification', n.id);
}
