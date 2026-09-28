// Import de projets depuis un export JSON — le fichier produit par la page
// Export Projets ({ projects: [...] }) ou un export Base44 de l'entité Project.
//
// Idempotent : un projet dont l'id est déjà en base est mis à jour (merge
// shallow de Records.update, les champs absents du fichier sont conservés) ;
// les autres sont créés en gardant id, created_date et created_by d'origine.

import { Records } from './db.js';

// Les exports Base44 arrivent parfois en UTF-8 relu en Latin-1 (« ThÃ©o »).
function reparerEncodage(s) {
  if (typeof s !== 'string' || !/Ã|Â/.test(s)) return s;
  try {
    const repare = Buffer.from(s, 'latin1').toString('utf8');
    // Le caractère de remplacement signale une réinterprétation ratée.
    return repare.includes('�') || /Ã|Â/.test(repare) ? s : repare;
  } catch {
    return s;
  }
}

// Un projet porte des structures imbriquées (sim_*, listes de documents,
// SWOT…) : la réparation doit descendre dans tout l'arbre.
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
 * @param {Array<object>} liste - enregistrements Project bruts
 * @param {object} ctx - { par } email de l'admin qui importe (traçabilité)
 */
export function importerProjets(liste, { par } = {}) {
  if (!Array.isArray(liste)) {
    return { error: 'Le fichier doit contenir un tableau JSON de projets (ou un objet { "projects": [...] }).' };
  }

  const resultat = { crees: 0, maj: 0, invalides: 0 };

  for (const brut of liste) {
    if (!brut || typeof brut !== 'object' || Array.isArray(brut)) {
      resultat.invalides++;
      continue;
    }
    const rec = reparerProfond(brut);
    if (rec.id && Records.get('Project', rec.id)) {
      Records.update('Project', rec.id, rec);
      resultat.maj++;
    } else {
      Records.create('Project', rec, par || null);
      resultat.crees++;
    }
  }

  return resultat;
}
