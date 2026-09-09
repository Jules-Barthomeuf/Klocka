// Ce qu'une lecture coûtera, avant de la lancer.
//
// Le journal des coûts dit ce qu'on a dépensé ; il le dit après. Ici on compte
// les jetons des pièces avec le compteur de l'API — gratuit — et on applique
// le tarif du modèle courant. De quoi afficher « cette relecture coûtera
// environ 1,45 $ » sur le bouton, au lieu de le découvrir sur la facture.

import { Records } from '../db.js';
import { compterJetons, modeleCourant } from '../llm.js';
import { coutDe } from '../llm-couts.js';
import { GRILLES } from './grilles.js';
import { chargerPieces } from './espace.js';

/**
 * @param {string} dealId
 * @param {{uploadDir:string, grille?:string|null}} opts - `grille` restreint aux
 *   pièces de ses catégories ; sans elle, toutes les pièces du dossier.
 */
export async function estimerLecture(dealId, { uploadDir, grille = null } = {}) {
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  if (!brut) return null;
  const categories = grille && GRILLES[grille] ? GRILLES[grille].categories : null;
  const docs = (brut.documents_espace || []).filter((d) => !categories || categories.includes(d.categorie || 'Autre'));
  if (!docs.length) return { pieces: 0, jetons: 0, cout: 0, modele: modeleCourant() };

  const pieces = chargerPieces(brut, docs.map((d) => d.id), uploadDir, true);
  let jetons = 0;
  let comptees = 0;
  const detail = [];
  for (const p of pieces) {
    const n = await compterJetons({ buffer: p.buffer, mimetype: p.mimetype, texte: p.texte, consigne: 'Lecture du document.' });
    if (n == null) continue;
    comptees += 1;
    jetons += n;
    detail.push({ nom: p.nom, jetons: n });
  }
  const modele = modeleCourant();
  // Rien n'a pu être compté : on le dit, plutôt que d'annoncer un prix inventé.
  if (!comptees) return { pieces: pieces.length, jetons: null, cout: null, modele, detail: [] };
  // Une lecture répond court : la sortie ne pèse presque rien face à l'entrée.
  const cout = coutDe(modele, { entree: jetons, sortie: 2000 }) || 0;
  return { pieces: pieces.length, comptees, jetons, cout, modele, detail };
}
