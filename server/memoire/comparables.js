// Les biens de la Mémoire comme comparables (30 oct. 2026, Jules) : chaque fiche vue nourrit l'avis de valeur et
// l'analyse, au poids d'une fiche (`klocka_fiche`, 1,5 dans server/valeur-locative-comparables.js), vieillie par sa
// date. Pur. Les lignes « dossier » sont déjà comptées par le dossier lui-même (referencesKlocka) : on les saute.

import { departementDe } from '../loyers-klocka.js';

/**
 * Pure : les références de loyer de la Mémoire, à la forme de `referencesKlocka` (server/loyers-klocka.js).
 * Une référence a un loyer, une surface et une adresse ; `origine: 'annonce'` la classe `klocka_fiche`.
 */
export function referencesMemoire(biens = []) {
  const refs = [];
  for (const b of biens || []) {
    if (b.statut === 'dossier' || !b.loyer_annuel || !b.surface_m2 || !b.adresse?.rue) continue;
    const adresse = { rue: b.adresse.rue, code_postal: b.adresse.code_postal || null, ville: b.adresse.ville || null, ligne: [b.adresse.rue, b.adresse.code_postal, b.adresse.ville].filter(Boolean).join(' ') };
    refs.push({
      memoire_id: b.id,
      deal_id: null,
      lot: 0,
      titre: [b.ville, b.adresse.rue].filter(Boolean).join(' - ') || null,
      loyer: b.loyer_annuel,
      surface: b.surface_m2,
      loyer_m2: Math.round((b.loyer_annuel / b.surface_m2) * 10) / 10,
      document: null,
      origine: 'annonce',
      source: 'klocka_fiche',
      adresse,
      departement: departementDe(b.adresse.code_postal),
      commune: b.adresse.ville || b.ville || null,
      le: b.recu_le || null,
      statut: 'memoire',
      archive: true,
      agence: b.agent?.agence || null,
    });
  }
  return refs;
}

/** Pure : les prix de la Mémoire (prix et surface connus), pour la comparaison de prix. */
export function prixMemoire(biens = []) {
  return (biens || [])
    .filter((b) => b.statut !== 'dossier' && b.prix && b.surface_m2 && b.adresse?.rue)
    .map((b) => ({ memoire_id: b.id, prix: b.prix, surface: b.surface_m2, prix_m2: b.prix / b.surface_m2, loyer_annuel: b.loyer_annuel || null, adresse: b.adresse, commune: b.adresse.ville || b.ville || null, le: b.recu_le || null, source: 'klocka_fiche' }));
}
