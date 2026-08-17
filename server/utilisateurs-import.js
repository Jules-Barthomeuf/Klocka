// Import d'utilisateurs depuis un export Base44 (tableau JSON).
//
// Idempotent : une adresse déjà en base n'est jamais écrasée (elle peut avoir
// un mot de passe, un questionnaire rempli…). Les comptes créés n'ont pas de
// mot de passe : chaque personne le définit à sa première connexion.

import { Records } from './db.js';

// Les exports Base44 arrivent parfois en UTF-8 relu en Latin-1 (« ThÃ©o »).
function reparerEncodage(s) {
  if (!s || !/Ã|Â/.test(s)) return s;
  try {
    const repare = Buffer.from(s, 'latin1').toString('utf8');
    // On ne garde la réparation que si elle a fait disparaître le mojibake.
    return /Ã|Â/.test(repare) ? s : repare;
  } catch {
    return s;
  }
}

/**
 * @param {Array<{email: string, full_name?: string, role?: string, created_date?: string}>} liste
 * @param {object} ctx - { par } email de l'admin qui importe (traçabilité)
 */
export function importerUtilisateurs(liste, { par } = {}) {
  if (!Array.isArray(liste)) return { error: 'Le fichier doit contenir un tableau JSON d’utilisateurs.' };

  const resultat = { crees: [], existants: [], invalides: [] };

  for (const entree of liste) {
    const email = String(entree?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      resultat.invalides.push(entree?.email || '(vide)');
      continue;
    }
    if (Records.filter('User', { email })[0]) {
      resultat.existants.push(email);
      continue;
    }
    Records.create(
      'User',
      {
        email,
        full_name: reparerEncodage(entree.full_name) || email.split('@')[0],
        role: entree.role === 'admin' ? 'admin' : 'user',
        etape_actuelle: 0,
        viewed_resources: [],
        comptes_lies: [],
        // La date d'inscription d'origine est conservée si l'export la donne.
        ...(entree.created_date ? { created_date: entree.created_date } : {}),
      },
      par || null
    );
    resultat.crees.push(email);
  }

  return resultat;
}
