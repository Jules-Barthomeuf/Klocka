// Import d'utilisateurs (clients) depuis un export Base44 ou un export de la
// plateforme — tableau JSON d'enregistrements User complets.
//
// Règles :
//  - le mot de passe n'est JAMAIS importé : les comptes créés n'en ont pas,
//    chacun le définit à sa première connexion ;
//  - une adresse déjà en base est mise à jour (profil, questionnaire, étape…)
//    sans toucher à son mot de passe, son rôle ni son id ;
//  - tous les autres champs de l'export sont conservés (étape, profil
//    investisseur, ressources vues…), y compris id et created_date d'origine.

import { Records } from './db.js';

// Les exports Base44 arrivent parfois en UTF-8 relu en Latin-1 (« ThÃ©o »).
function reparerEncodage(s) {
  if (typeof s !== 'string' || !/Ã|Â/.test(s)) return s;
  try {
    const repare = Buffer.from(s, 'latin1').toString('utf8');
    return repare.includes('�') || /Ã|Â/.test(repare) ? s : repare;
  } catch {
    return s;
  }
}

function reparerProfond(v) {
  if (typeof v === 'string') return reparerEncodage(v);
  if (Array.isArray(v)) return v.map(reparerProfond);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = reparerProfond(val);
    return out;
  }
  return v;
}

/**
 * @param {Array<object>} liste - enregistrements User bruts (export)
 * @param {object} ctx - { par } email de l'admin qui importe (traçabilité)
 */
export function importerUtilisateurs(liste, { par } = {}) {
  if (!Array.isArray(liste)) return { error: 'Le fichier doit contenir un tableau JSON d’utilisateurs.' };

  const resultat = { crees: [], existants: [], invalides: [] };

  for (const brut of liste) {
    const email = String(brut?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      resultat.invalides.push(brut?.email || '(vide)');
      continue;
    }

    // Le hash de mot de passe (et ses métadonnées) ne voyagent jamais par import.
    const { mot_de_passe, mot_de_passe_defini_le, ...champs } = reparerProfond(brut);
    champs.email = email;

    const existant = Records.filter('User', { email })[0];
    if (existant) {
      // Mise à jour du profil — jamais l'identité, le rôle ni le mot de passe.
      const { id, role, created_date, created_by, ...maj } = champs;
      Records.update('User', existant.id, maj);
      resultat.existants.push(email);
      continue;
    }

    Records.create(
      'User',
      {
        etape_actuelle: 0,
        viewed_resources: [],
        comptes_lies: [],
        ...champs,
        full_name: champs.full_name || email.split('@')[0],
        role: champs.role === 'admin' ? 'admin' : 'user',
      },
      par || null
    );
    resultat.crees.push(email);
  }

  return resultat;
}
