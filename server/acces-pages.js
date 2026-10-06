// Les pages de l'équipe, page par page (6 oct. 2026) : Jules décide qui, parmi
// les admins, ouvre quoi. Tout est fermé par défaut : Jules ouvre une à une
// les pages qu'il veut donner (`pages_ouvertes`). Une page fermée reste dans le menu avec un cadenas,
// et s'ouvre sur « Accès réservé ». Les pages qui ont leur propre API la
// ferment aussi côté serveur : un cadenas qui ne serait qu'un dessin ne
// protégerait rien.

import { Records } from './db.js';
import { ENTREES_ADMIN, ENTREES_AUTRE } from '../src/lib/menu.js';

/** Les comptes de Jules, les seuls qui gèrent les accès (et qui ont tout). */
export const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || 'jules.b@klocka.immo,jules.btmf@gmail.com,admin@klocka.local')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const norm = (e) => String(e || '').trim().toLowerCase();
export const estSuperAdmin = (u) => !!u && SUPER_ADMINS.includes(norm(u.email));

/** Les API qu'une page possède en propre : fermer la page les ferme aussi. */
export const API_DES_PAGES = {
  Prospection: ['/api/prospection'],
  Emailing: ['/api/emailing'],
  ALX: ['/api/alx'],
};

// Ce qui ne se ferme jamais : sans elles, plus moyen de travailler ni de revenir.
export const TOUJOURS_OUVERTES = ['Dashboard', 'Personnalisation'];

/** Les pages du menu de l'équipe, celles qui s'ouvrent ou se ferment. */
export const PAGES_EQUIPE = [...new Set([...ENTREES_ADMIN, ...ENTREES_AUTRE].map((e) => e.cle))].filter((p) => !TOUJOURS_OUVERTES.includes(p));

/** Pure : les pages fermées pour ce compte : toutes, sauf celles que Jules lui a ouvertes. Jules n'en a aucune. */
export function pagesFermees(u) {
  if (!u || u.role !== 'admin' || estSuperAdmin(u)) return [];
  const ouvertes = new Set(u.pages_ouvertes || []);
  return PAGES_EQUIPE.filter((p) => !ouvertes.has(p));
}

/** Pure : cette adresse d'API est-elle fermée pour ce compte ? */
export function apiFermee(u, chemin) {
  const fermees = pagesFermees(u);
  if (!fermees.length) return null;
  const c = String(chemin || '').split('?')[0];
  return fermees.find((p) => (API_DES_PAGES[p] || []).some((prefixe) => c === prefixe || c.startsWith(`${prefixe}/`))) || null;
}

/** Les admins et leurs pages fermées, pour l'écran de Jules. */
export function admins() {
  return Records.list('User')
    .filter((u) => u.role === 'admin' && !estSuperAdmin(u))
    .map((u) => ({ email: norm(u.email), nom: u.full_name || u.email, pages_ouvertes: (u.pages_ouvertes || []).filter((p) => PAGES_EQUIPE.includes(p)), pages_bloquees: pagesFermees(u) }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

/** Les pages ouvertes à un admin, toutes les autres fermées. Jules seul. */
export function poserAcces(par, email, pages) {
  if (!estSuperAdmin(par)) return { ok: false, error: 'Seul Jules gère les accès.' };
  const u = Records.list('User').find((x) => norm(x.email) === norm(email));
  if (!u || u.role !== 'admin') return { ok: false, error: 'Admin introuvable.' };
  if (estSuperAdmin(u)) return { ok: false, error: 'Vos propres accès ne se ferment pas.' };
  const liste = [...new Set((Array.isArray(pages) ? pages : []).map(String))].filter((p) => PAGES_EQUIPE.includes(p));
  Records.update('User', u.id, { pages_ouvertes: liste, acces_modifies_le: new Date().toISOString(), acces_modifies_par: norm(par.email) });
  return { ok: true, email: norm(u.email), pages_ouvertes: liste, pages_bloquees: pagesFermees(Records.get('User', u.id)) };
}
