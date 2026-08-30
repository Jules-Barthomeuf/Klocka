// Deux façons d'être chez Klocka : en découverte, ou client.
//
// Beaucoup de gens s'inscrivent seuls ; on ne devient réellement client
// qu'après un rendez-vous avec l'équipe. Entre les deux, l'espace découverte :
// un aperçu — les projets vitrine, le simulateur — et une seule porte, le
// rendez-vous stratégique. Après l'appel, l'équipe passe le compte client :
// mêmes identifiants, l'espace complet s'ouvre.
//
// Le champ `acces` porte cette distinction ; son absence vaut « client », pour
// que les comptes existants ne changent pas d'un pouce.

import { Records, Meta } from './db.js';

export const ACCES = ['decouverte', 'client'];

/** Le niveau d'accès d'un compte, absence comprise. */
export const accesDe = (user) => (user?.acces === 'decouverte' ? 'decouverte' : 'client');

const CHAMPS_INTERDITS = new Set(['role', 'mot_de_passe', 'email', 'id', 'acces', 'invitation_jeton', 'invitation_expire_le']);

/**
 * Passe un compte client (ou le repasse en découverte). Le profil transmis
 * complète la fiche — jamais le rôle, jamais le mot de passe.
 */
export function changerAcces(user, acces, { admin = null, profil = {} } = {}) {
  if (!ACCES.includes(acces)) throw new Error(`Accès inconnu : ${acces}`);
  const champsProfil = Object.fromEntries(
    Object.entries(profil || {}).filter(([k, v]) => v !== null && v !== undefined && v !== '' && !CHAMPS_INTERDITS.has(k))
  );
  const patch = {
    acces,
    ...champsProfil,
    ...(acces === 'client'
      ? {
          etape_actuelle: accesDe(user) === 'decouverte' ? 1 : Math.max(1, user.etape_actuelle || 0),
          promu_client_le: new Date().toISOString(),
          promu_par: admin?.email || null,
        }
      : {}),
  };
  const maj = Records.update('User', user.id, patch);
  console.log(`[acces] ${user.email} → ${acces}${admin?.email ? ` (par ${admin.email})` : ''}`);
  return maj;
}

/**
 * Les comptes restés à l'étape 0 sont des inscrits jamais activés — la salle
 * d'attente d'avant. Ils deviennent des comptes découverte, une seule fois.
 */
export function migrerComptesEnAttente() {
  if (Meta.get('migration_acces_v1')) return 0;
  let n = 0;
  for (const u of Records.list('User')) {
    if (u.role === 'admin' || (u.etape_actuelle ?? 0) !== 0) continue;
    Records.update('User', u.id, {
      acces: 'decouverte',
      etape_actuelle: 1,
      inscrit_le: u.inscrit_le || u.created_date || new Date().toISOString(),
      inscription_via: u.inscription_via || 'import',
    });
    n += 1;
  }
  Meta.set('migration_acces_v1', `${n} le ${new Date().toISOString()}`);
  if (n) console.log(`[acces] ${n} compte(s) en attente passé(s) en découverte`);
  return n;
}
