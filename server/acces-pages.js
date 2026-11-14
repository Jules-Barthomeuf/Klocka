// Les pages de l'équipe, page par page (6 oct. 2026) : Jules décide qui, parmi
// les admins, ouvre quoi. Tout est fermé par défaut : Jules ouvre une à une
// les pages qu'il veut donner (`pages_ouvertes`). Une page fermée reste dans le menu avec un cadenas,
// et s'ouvre sur « Accès réservé ». Les pages qui ont leur propre API la
// ferment aussi côté serveur : un cadenas qui ne serait qu'un dessin ne
// protégerait rien.

import { Records } from './db.js';
import { ENTREES_ADMIN, ENTREES_AUTRE, PILIERS_ACCES } from '../src/lib/menu.js';

/** Les comptes de Jules, les seuls qui gèrent les accès (et qui ont tout). */
export const SUPER_ADMINS = (process.env.SUPER_ADMIN_EMAILS || 'jules.b@klocka.immo,jules.btmf@gmail.com,admin@klocka.local')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const norm = (e) => String(e || '').trim().toLowerCase();
export const estSuperAdmin = (u) => !!u && SUPER_ADMINS.includes(norm(u.email));

/** Les API qu'une page possède en propre : fermer la page les ferme aussi. */
export const API_DES_PAGES = {
  // L'Intelligence (14 oct. 2026) : la mémoire de l'équipe ; fermé avec sa page.
  Cerveau: ['/api/layer', '/api/cerveau'],
  Prospection: ['/api/prospection'],
  // Relances a rejoint la Prospection le 16 oct. 2026 : ses API (relances, mode appel, rappels) sont sous /api/prospection.
  // Le Suivi : l'usage de chaque analyste et les règles de la nuit, fermés avec la page Suivi.
  // Haka (17 oct. 2026) : la file À valider et ses décisions.
  AValider: ['/api/haka'],
  Automatismes: ['/api/haka/automatismes'],
  Monitoring: ['/api/monitoring/haka', '/api/monitoring/appels', '/api/monitoring/mandataires', '/api/monitoring/activite', '/api/monitoring/regles', '/api/monitoring/qualite-ak', '/api/monitoring/chat', '/api/monitoring/reunions', '/api/monitoring/audience', '/api/monitoring/enregistrements', '/api/ak/lecons', '/api/testeur'],
  Emailing: ['/api/emailing'],
  ALX: ['/api/alx'],
  // Off-market (10 oct. 2026) : sa page et son API, pour l'équipe ; les mandataires passent par la même API, hors de ce cadenas.
  OffMarket: ['/api/off-market'],
  // Les rôles de l'équipe se cochent dans Utilisateurs (3 nov. 2026) : leur API se ferme avec elle.
  AdminUtilisateurs: ['/api/admin/equipe'],
  // Clients (16 oct. 2026) : les fiches nourries par les appels, fermées avec leur page.
  AdminClients: ['/api/clients-equipe'],
  // La Mémoire Klocka (30 oct. 2026) : les fiches gardées et le lecteur des boîtes, fermés avec leur page.
  MemoireKlocka: ['/api/memoire'],
  // Tokimo (6 nov. 2026) : le module d'analyse des opérations présentées à Tokimo.
  Tokimo: ['/api/tokimo'],
  // Agents (16 oct. 2026) : la liste et les appels en entier ; la fiche reste celle de la Prospection.
  Agents: ['/api/prospection/agents-liste', '/api/prospection/agents', '/api/prospection/fiche', '/api/prospection/agent-ia/equipe'],
};

// Ce qui ne se ferme jamais : sans elles, plus moyen de travailler ni de revenir.
// Présentations (13 oct. 2026, Jules : « toutes les présentations sont partagées entre tous les admins ») : ouverte à tous.
// L'Assistant et les Présentations se règlent aussi depuis le 14 nov. 2026 (Jules) : ce sont des piliers.
export const TOUJOURS_OUVERTES = ['Personnalisation', 'Semaine'];
// Les pages devenues réglables le 14 nov. 2026 : ouvertes une fois à chaque admin (migrerPiliers), pour que rien ne
// disparaisse de sa barre tant que Jules ne les lui cache pas.
export const NOUVELLES_REGLABLES = ['Dashboard', 'AdminPresentations', 'KData', 'CRM'];

/** Les pages du menu de l'équipe, celles qui s'ouvrent ou se ferment. */
export const PAGES_EQUIPE = [...new Set([...PILIERS_ACCES, ...ENTREES_ADMIN, ...ENTREES_AUTRE].map((e) => e.cle))].filter((p) => !TOUJOURS_OUVERTES.includes(p));

/**
 * Pure : les pages fermées pour ce compte : toutes, sauf celles que Jules lui a ouvertes. Jules, lui, a tout, sauf les pages
 * qu'il se cache pour essayer ce que voient les autres (14 nov. 2026, Jules : « avoir mon compte dans les accès pour
 * tester par moi-même ») : `pages_cachees_essai`, vide par défaut. L'onglet Accès n'est pas dans ces pages : il ne se
 * ferme jamais, Jules peut toujours tout rouvrir.
 */
export function pagesFermees(u) {
  if (!u || u.role !== 'admin') return [];
  if (estSuperAdmin(u)) return (u.pages_cachees_essai || []).filter((p) => PAGES_EQUIPE.includes(p));
  const ouvertes = new Set(u.pages_ouvertes || []);
  return PAGES_EQUIPE.filter((p) => !ouvertes.has(p));
}

/** Pure : cette adresse d'API est-elle fermée pour ce compte ? Une API partagée par deux pages reste ouverte si l'une des deux l'est. */
export function apiFermee(u, chemin) {
  const fermees = pagesFermees(u);
  if (!fermees.length) return null;
  const c = String(chemin || '').split('?')[0];
  const couvre = (p) => (API_DES_PAGES[p] || []).some((prefixe) => c === prefixe || c.startsWith(`${prefixe}/`));
  const pages = Object.keys(API_DES_PAGES).filter(couvre);
  if (pages.some((p) => !fermees.includes(p))) return null;
  return pages[0] || null;
}

/** Les admins et leurs pages fermées, pour l'écran de Jules. */
export function admins(par = null) {
  // Jules voit aussi son propre compte, en tête, pour s'essayer à ce que voient les autres.
  const lui = (u) => !!par && norm(u.email) === norm(par.email);
  return Records.list('User')
    .filter((u) => u.role === 'admin' && (!estSuperAdmin(u) || lui(u)))
    .map((u) => {
      const fermees = pagesFermees(u);
      const ouvertes = estSuperAdmin(u) ? PAGES_EQUIPE.filter((p) => !fermees.includes(p)) : (u.pages_ouvertes || []).filter((p) => PAGES_EQUIPE.includes(p));
      return { email: norm(u.email), nom: u.full_name || u.email, vous: lui(u), pages_ouvertes: ouvertes, pages_bloquees: fermees };
    })
    .sort((a, b) => Number(b.vous) - Number(a.vous) || a.email.localeCompare(b.email));
}

/** Les pages ouvertes à un admin, toutes les autres fermées. Jules seul. */
export function poserAcces(par, email, pages) {
  if (!estSuperAdmin(par)) return { ok: false, error: 'Seul Jules gère les accès.' };
  const u = Records.list('User').find((x) => norm(x.email) === norm(email));
  if (!u || u.role !== 'admin') return { ok: false, error: 'Admin introuvable.' };
  const liste = [...new Set((Array.isArray(pages) ? pages : []).map(String))].filter((p) => PAGES_EQUIPE.includes(p));
  // Le compte de Jules, par Jules seul : ce qu'il se cache pour essayer (le reste de ses pages reste ouvert).
  if (estSuperAdmin(u)) {
    if (norm(u.email) !== norm(par.email)) return { ok: false, error: "Les accès d'un autre compte de Jules ne se changent pas d'ici." };
    Records.update('User', u.id, { pages_cachees_essai: PAGES_EQUIPE.filter((p) => !liste.includes(p)) });
    const frais = Records.get('User', u.id);
    return { ok: true, email: norm(u.email), pages_ouvertes: PAGES_EQUIPE.filter((p) => !pagesFermees(frais).includes(p)), pages_bloquees: pagesFermees(frais) };
  }
  Records.update('User', u.id, { pages_ouvertes: liste, acces_modifies_le: new Date().toISOString(), acces_modifies_par: norm(par.email) });
  return { ok: true, email: norm(u.email), pages_ouvertes: liste, pages_bloquees: pagesFermees(Records.get('User', u.id)) };
}

/** Une fois par admin : les pages devenues réglables le 14 nov. 2026 lui sont ouvertes, sa barre ne change pas. */
export function migrerPiliers() {
  let n = 0;
  for (const u of Records.list('User')) {
    if (u.role !== 'admin' || estSuperAdmin(u) || u.acces_piliers_le) continue;
    const ouvertes = [...new Set([...(u.pages_ouvertes || []), ...NOUVELLES_REGLABLES])];
    Records.update('User', u.id, { pages_ouvertes: ouvertes, acces_piliers_le: new Date().toISOString() });
    n += 1;
  }
  if (n) console.log(`[acces] ${n} admin(s) : Assistant, Présentations, Outils et CRM ouverts une fois (pages devenues réglables)`);
  return n;
}
