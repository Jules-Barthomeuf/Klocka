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
 * @param {{nouveaux, ecartes, rattaches, documents, classes, fiches, lignes, erreurs, echecs}} bilan
 * @returns {object|null} null si le passage n'a rien produit
 */
export function consignerPasse(bilan) {
  const utile =
    (bilan.nouveaux || 0) +
    (bilan.rattaches || 0) +
    (bilan.documents || 0) +
    (bilan.engagements || 0) +
    (bilan.erreurs?.length || 0);
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
      engagements: bilan.engagements || 0,
      // Le détail par dossier : c'est lui qu'on relit, pas les compteurs.
      lignes: bilan.lignes || [],
      erreurs: bilan.erreurs || [],
      // Les mêmes échecs, mais nommés : dossier, opération, cause. C'est ce qui
      // permet de les relancer au lieu de les relire.
      echecs: bilan.echecs || [],
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

/**
 * Rejoue une opération qui a échoué pendant un passage de la veille.
 *
 * Un échec consigné ne vaut que si on peut le rattraper : la cause est souvent
 * passagère (quota Drive, jeton Monday renouvelé depuis). On rejoue donc la
 * même opération, et on ne la marque réglée que si elle réussit vraiment.
 *
 * @param {string} rapportId
 * @param {number} index - position de l'échec dans le rapport
 */
export async function relancer(rapportId, index) {
  const rapport = Records.get('RapportAuto', rapportId);
  if (!rapport) throw new Error('Rapport introuvable');
  const echecs = rapport.echecs || [];
  const echec = echecs[index];
  if (!echec) throw new Error('Échec introuvable');
  if (echec.regle) return { deja: true, echec };

  let detail = '';
  if (echec.operation === 'releve') {
    const { relever } = await import('./deal/veille-mails.js');
    const r = await relever();
    // La boîte peut avoir échoué de nouveau : la relève, elle, a bien tourné.
    if (r.erreurs?.some((e) => String(e).startsWith(echec.compte || '\u0000'))) {
      throw new Error(r.erreurs.find((e) => String(e).startsWith(echec.compte)));
    }
    detail = `${r.nouveaux || 0} mail(s) relevé(s)`;
  } else {
    const deal = Records.filter('Deal', { deal_id: echec.deal_id })[0];
    if (!deal) throw new Error('Dossier introuvable');

    if (echec.operation === 'drive') {
      const { classerDeal } = await import('./deal/pieces-mails.js');
      const r = await classerDeal(deal);
      if (r.erreurs.length) throw new Error(r.erreurs[0]);
      detail = `${r.drive?.classes || 0} document(s) classé(s)`;
    } else if (echec.operation === 'monday') {
      const { pousserBien } = await import('./deal/monday-sync.js');
      const r = await pousserBien(deal, { motif: 'Relance depuis le rapport de veille' });
      if (r?.ignore) throw new Error(r.raison || 'Monday a ignoré la fiche');
      detail = r?.cree ? 'fiche créée' : 'fiche mise à jour';
    } else {
      throw new Error(`Opération inconnue : ${echec.operation}`);
    }
  }

  const majs = echecs.map((e, i) =>
    i === index ? { ...e, regle: true, regle_le: new Date().toISOString(), regle_detail: detail } : e
  );
  Records.update('RapportAuto', rapportId, { echecs: majs });
  return { detail, echec: majs[index] };
}
