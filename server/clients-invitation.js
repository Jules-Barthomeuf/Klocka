// Inviter un client : le compte est créé par l'équipe, la personne reçoit un
// lien et n'a qu'à choisir son mot de passe.
//
// Extrait de la route pour servir aussi au chat du tableau de bord, qui crée
// le client depuis un compte rendu d'appel. Une seule façon d'inviter, deux
// portes.

import { randomBytes } from 'crypto';
import { Records } from './db.js';
import { accesDe, changerAcces } from './clients-acces.js';

const QUATORZE_JOURS = 14 * 86400000;

/**
 * @param {object} p
 * @param {string} p.email
 * @param {string} [p.full_name]
 * @param {object} p.admin - l'admin qui invite
 * @param {string} p.base - adresse publique de l'application (sans barre finale)
 * @param {object} [p.profil] - champs de profil à poser sur le compte (téléphone,
 *   profil investisseur, revenus…) : jamais le rôle, jamais le mot de passe
 * @returns {{ok: boolean, error?: string, user?: object, lien?: string, jeton?: string, expire_le?: string}}
 */
export function creerInvitation({ email, full_name = '', admin, base, profil = {} }) {
  const adresse = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) return { ok: false, error: 'Adresse invalide.' };

  let user = Records.filter('User', { email: adresse })[0];
  if (user?.role === 'admin') return { ok: false, error: "Cette adresse est celle d'un administrateur." };
  // Un compte découverte déjà actif (inscrit seul, avec Google ou un mot de
  // passe) n'a pas besoin de lien : on le passe client, profil complété.
  if (user && accesDe(user) === 'decouverte' && user.email_verifie === false) {
    // Inscrit sans code : personne n'a prouvé qu'il tient cette adresse. Le
    // mot de passe tombe, le lien d'invitation fait la preuve.
    user = Records.update('User', user.id, { mot_de_passe: null, mot_de_passe_defini_le: null, email_verifie: true });
  } else if (user && accesDe(user) === 'decouverte' && (user.mot_de_passe || user.inscrit_le)) {
    const nomInvite = String(full_name || '').trim();
    user = changerAcces(user, 'client', { admin, profil: { ...(profil || {}), ...(nomInvite && !user.full_name ? { full_name: nomInvite } : {}) } });
    return { ok: true, promu: true, user };
  }
  if (user?.mot_de_passe) return { ok: false, error: `${adresse} a déjà un mot de passe : le compte est actif.`, user };

  const jeton = randomBytes(24).toString('hex');
  const expire = new Date(Date.now() + QUATORZE_JOURS).toISOString();
  const nom = String(full_name || '').trim();
  const champsProfil = Object.fromEntries(
    Object.entries(profil || {}).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !['role', 'mot_de_passe', 'email', 'id'].includes(k))
  );
  const patch = {
    invitation_jeton: jeton,
    invitation_expire_le: expire,
    invite_par: admin?.email || null,
    invite_le: new Date().toISOString(),
    ...(nom ? { full_name: nom } : {}),
    ...champsProfil,
  };
  if (user) {
    user = Records.update('User', user.id, { ...patch, acces: 'client', etape_actuelle: Math.max(1, user.etape_actuelle || 0) });
  } else {
    user = Records.create('User', { email: adresse, role: 'user', acces: 'client', etape_actuelle: 1, ...patch }, admin?.email);
  }
  return { ok: true, user, jeton, expire_le: expire, lien: `${base}/Bienvenue?jeton=${jeton}` };
}
