// Le journal des lectures de marché : d'où vient chaque chiffre.
//
// Jusqu'ici, ce que la collecte avait vécu tenait dans une Map en mémoire,
// évincée au bout de trente travaux, et s'affichait douze secondes dans un
// toast. Autant dire nulle part : trois jours plus tard, personne ne pouvait
// dire si le loyer affiché venait d'Equimmox ou d'un repli sur Data-B, ni
// pourquoi une case était vide.
//
// Un passage laisse donc une trace durable : chaque tentative avec son heure,
// sa durée et son motif d'échec, la source finalement retenue pour chaque
// question, et ce qui manque encore.

import { Records } from '../db.js';

export const ENTITE = 'MarcheJournal';

/** Combien de passages on garde par lot : de quoi voir une panne s'installer. */
const GARDE_PAR_LOT = 20;

/**
 * Range un passage. Ne jette jamais : un journal qui échoue ne doit pas
 * emporter la lecture qu'il raconte.
 * @returns {object|null} l'enregistrement créé
 */
export function enregistrer(entree) {
  try {
    const cree = Records.create(ENTITE, { ...entree, le: entree.fin || new Date().toISOString() });
    elaguer(entree.deal_id, entree.lot_index);
    return cree;
  } catch (e) {
    console.error('[marche] journal non écrit :', e?.message || e);
    return null;
  }
}

/** Complète un passage déjà écrit — la date de reprise, l'issue d'un réessai. */
export function completer(id, patch) {
  try {
    return Records.update(ENTITE, id, patch);
  } catch (e) {
    console.error('[marche] journal non mis à jour :', e?.message || e);
    return null;
  }
}

function elaguer(dealId, index) {
  const anciens = Records.filter(ENTITE, { deal_id: dealId, lot_index: index })
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .slice(GARDE_PAR_LOT);
  for (const x of anciens) Records.delete(ENTITE, x.id);
}

/** Les passages d'un lot, du plus récent au plus ancien. */
export function journalDuLot(dealId, index = 0, limite = 10) {
  return Records.filter(ENTITE, { deal_id: dealId, lot_index: index })
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .slice(0, limite);
}

/** Le dernier passage d'un lot. */
export const dernierPassage = (dealId, index = 0) => journalDuLot(dealId, index, 1)[0] || null;

/**
 * Les passages qui attendent encore une reprise. Au redémarrage du serveur,
 * c'est ce qui permet de ne pas oublier une promesse de réessai.
 */
export function reprisesEnAttente() {
  return Records.list(ENTITE)
    .filter((x) => x.nouvelle_tentative_le && !x.reprise_faite)
    .sort((a, b) => String(a.nouvelle_tentative_le).localeCompare(String(b.nouvelle_tentative_le)));
}
