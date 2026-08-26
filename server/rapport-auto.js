// Ce que la plateforme a fait toute seule.
//
// La veille relève, rattache, récupère des pièces, les classe dans le Drive et
// rafraîchit Monday — sans que personne ne soit devant l'écran. Sans rapport,
// tout cela se produit dans le dos de l'équipe : on découvre un document dans un
// dossier sans savoir d'où il vient.
//
// Un rapport par passage, et seulement quand il s'est passé quelque chose : un
// journal qui répète « rien à signaler » ne se lit plus.

import { Records } from './db.js';

// Au-delà, on ne relit plus : c'est un fil d'actualité, pas des archives.
const PLAFOND = 300;

/**
 * Consigne un passage de la veille.
 * @param {{nouveaux, ecartes, rattaches, documents, classes, fiches, lignes, erreurs}} bilan
 * @returns {object|null} null si le passage n'a rien produit
 */
export function consignerPasse(bilan) {
  const utile =
    (bilan.nouveaux || 0) + (bilan.rattaches || 0) + (bilan.documents || 0) + (bilan.erreurs?.length || 0);
  if (!utile) return null;

  try {
    const rapport = Records.create('RapportAuto', {
      le: new Date().toISOString(),
      nouveaux: bilan.nouveaux || 0,
      ecartes: bilan.ecartes || 0,
      rattaches: bilan.rattaches || 0,
      documents: bilan.documents || 0,
      classes: bilan.classes || 0,
      fiches: bilan.fiches || 0,
      // Le détail par dossier : c'est lui qu'on relit, pas les compteurs.
      lignes: bilan.lignes || [],
      erreurs: bilan.erreurs || [],
      vu_par: [],
    });
    elaguer();
    return rapport;
  } catch (e) {
    console.warn('[rapport] passage non consigné :', e?.message || e);
    return null;
  }
}

function elaguer() {
  const tout = Records.list('RapportAuto');
  if (tout.length <= PLAFOND) return;
  const trop = tout
    .sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')))
    .slice(0, tout.length - PLAFOND);
  for (const r of trop) Records.delete('RapportAuto', r.id);
}

/**
 * Les rapports récents, en séparant ce que cette personne n'a pas encore vu.
 */
export function rapports(user, { jours = 7, limite = 30 } = {}) {
  const depuis = new Date(Date.now() - jours * 86400000).toISOString();
  const email = user?.email || 'anonyme';
  const tous = Records.list('RapportAuto')
    .filter((r) => (r.le || '') >= depuis)
    .sort((a, b) => String(b.le || '').localeCompare(String(a.le || '')))
    .slice(0, limite);

  return {
    nouveaux: tous.filter((r) => !(r.vu_par || []).includes(email)),
    tous,
  };
}

/** Marque comme lus les rapports listés — ou tous les récents. */
export function marquerVus(user, ids = null) {
  const email = user?.email || 'anonyme';
  const cibles = ids?.length
    ? ids.map((id) => Records.get('RapportAuto', id)).filter(Boolean)
    : Records.list('RapportAuto');
  let n = 0;
  for (const r of cibles) {
    if ((r.vu_par || []).includes(email)) continue;
    Records.update('RapportAuto', r.id, { vu_par: [...(r.vu_par || []), email] });
    n += 1;
  }
  return n;
}
