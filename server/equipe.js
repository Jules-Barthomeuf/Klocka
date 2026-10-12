// L'équipe (10 oct. 2026) : les administrateurs et les mandataires, à part
// des clients. Un compte a un rôle principal (admin, mandataire, user) ; un
// admin peut aussi être mandataire (`aussi_mandataire`, il garde son secteur
// et ses dossiers par son email). Un client devient mandataire ; un
// mandataire peut recevoir l'admin et reste mandataire. Seuls les super
// admins (acces-pages) changent les rôles ; leur propre rôle ne bouge pas.

import { randomBytes } from 'crypto';
import { Records } from './db.js';
import { estSuperAdmin, pagesFermees } from './acces-pages.js';
import { estMandataire } from './mandataire-espace.js';

const maintenant = () => new Date().toISOString();
const norm = (e) => String(e || '').trim().toLowerCase();
const QUATORZE_JOURS = 14 * 86400000;

/** Pure : le rôle lisible d'un compte. */
export const rolesDe = (u) => [u?.role === 'admin' ? 'admin' : null, estMandataire(u) ? 'mandataire' : null].filter(Boolean);

/** Les admins et les mandataires, avec ce qu'il faut pour décider. */
export function listerEquipe() {
  const secteurs = new Map(Records.list('SecteurMandataire').filter((s) => s.mandataire_email).map((s) => [norm(s.mandataire_email), s]));
  const fiches = new Map(Records.list('FicheMandataire').map((f) => [norm(f.email), f]));
  const visites = new Map();
  for (const v of Records.list('VisitePage')) { const e = norm(v.par); if (!visites.has(e) || visites.get(e) < v.le) visites.set(e, v.le); }
  const ligne = (u) => {
    const email = norm(u.email);
    const s = secteurs.get(email);
    const f = fiches.get(email);
    return {
      id: u.id, email, nom: u.full_name || null, role: u.role || 'user', roles: rolesDe(u), super_admin: estSuperAdmin(u), aussi_mandataire: !!u.aussi_mandataire,
      // Actif : un mot de passe, ou une connexion Google déjà vue.
      actif: !!u.mot_de_passe || !!visites.get(email), invitation_en_attente: !!u.invitation_jeton && !u.mot_de_passe && !visites.get(email), invite_le: u.invite_le || null,
      pages_fermees: u.role === 'admin' ? pagesFermees(u).length : 0, derniere_visite: visites.get(email) || null,
      secteur: s ? { id: s.id, nom: s.nom } : null, telephone: f?.telephone || u.telephone || u.phone || null, arrivee_le: f?.arrivee_le || null,
      role_modifie_le: u.role_modifie_le || null, role_modifie_par: u.role_modifie_par || null,
    };
  };
  const tous = Records.list('User');
  return {
    admins: tous.filter((u) => u.role === 'admin').map(ligne).sort((a, b) => Number(b.super_admin) - Number(a.super_admin) || String(a.nom || a.email).localeCompare(String(b.nom || b.email))),
    mandataires: tous.filter((u) => estMandataire(u)).map(ligne).sort((a, b) => String(a.nom || a.email).localeCompare(String(b.nom || b.email))),
  };
}

/**
 * Change le rôle d'un compte : admin (avec ou sans le cumul mandataire),
 * mandataire seul, ou client. `par` doit être super admin ; un super admin
 * ne se change pas.
 */
export function changerRole(par, email, { role, aussi_mandataire = null }) {
  if (!estSuperAdmin(par)) return { ok: false, code: 403, error: 'Seul un super administrateur change les rôles.' };
  const u = Records.findBy('User', 'email', norm(email));
  if (!u) return { ok: false, code: 404, error: 'Compte introuvable.' };
  if (estSuperAdmin(u)) return { ok: false, code: 400, error: 'Le rôle d\'un super administrateur ne se change pas ici.' };
  if (!['admin', 'mandataire', 'user'].includes(role)) return { ok: false, code: 400, error: 'Rôle inconnu.' };
  const etaitMandataire = estMandataire(u);
  const patch = { role, role_modifie_le: maintenant(), role_modifie_par: par.email };
  // Un admin garde le cumul s'il était mandataire, sauf demande contraire ; les autres rôles n'ont pas de cumul.
  patch.aussi_mandataire = role === 'admin' ? (aussi_mandataire == null ? etaitMandataire : !!aussi_mandataire) : false;
  const maj = Records.update('User', u.id, patch);
  return { ok: true, user: { email: norm(maj.email), role: maj.role, aussi_mandataire: !!maj.aussi_mandataire, roles: rolesDe(maj) } };
}

/**
 * Invite quelqu'un dans l'équipe : un compte neuf (admin ou mandataire) avec
 * un lien pour choisir son mot de passe, ou un compte existant qui change de
 * rôle (un client qui devient mandataire garde ses projets).
 */
export function inviterEquipe(par, { email, nom = '', role, base }) {
  if (!estSuperAdmin(par)) return { ok: false, code: 403, error: 'Seul un super administrateur invite dans l\'équipe.' };
  const adresse = norm(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) return { ok: false, code: 400, error: 'Adresse invalide.' };
  if (!['admin', 'mandataire'].includes(role)) return { ok: false, code: 400, error: 'Rôle inconnu.' };
  let u = Records.findBy('User', 'email', adresse);
  if (u) {
    const r = changerRole(par, adresse, { role });
    if (!r.ok) return r;
    if (nom && !u.full_name) Records.update('User', u.id, { full_name: String(nom).trim() });
    u = Records.get('User', u.id);
  } else {
    u = Records.create('User', { email: adresse, full_name: String(nom || '').trim() || null, role, aussi_mandataire: false, etape_actuelle: 1, cree_le: maintenant(), role_modifie_le: maintenant(), role_modifie_par: par.email }, par.email);
  }
  let lien = null;
  if (!u.mot_de_passe) {
    const jeton = randomBytes(24).toString('hex');
    Records.update('User', u.id, { invitation_jeton: jeton, invitation_expire_le: new Date(Date.now() + QUATORZE_JOURS).toISOString(), invite_par: par.email, invite_le: maintenant() });
    lien = `${String(base || '').replace(/\/$/, '')}/Bienvenue?jeton=${jeton}`;
  }
  return { ok: true, user: { email: adresse, role: u.role, roles: rolesDe(Records.get('User', u.id)) }, lien, deja_actif: !!u.mot_de_passe };
}
