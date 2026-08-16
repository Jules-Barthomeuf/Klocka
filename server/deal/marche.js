// Alimentation de la base de données marché depuis les deals étudiés.
//
// Chaque refus ou abandon capitalise l'observation (loyer/m², prix/m²) dans
// l'entité DonneeMarche, dédupliquée par ville + code postal. Les agrégats
// (bas / médian / haut) sont recalculés à partir de toutes les observations,
// pour que la base s'affine deal après deal.

import { Records } from '../db.js';

const val = (champ) => (champ && champ.absent === false ? champ.valeur : null);

const arrondi = (n) => (n == null || !isFinite(n) ? null : Math.round(n));

function mediane(nombres) {
  const tri = nombres.filter((n) => n != null).sort((a, b) => a - b);
  if (!tri.length) return null;
  const m = Math.floor(tri.length / 2);
  return tri.length % 2 ? tri[m] : Math.round((tri[m - 1] + tri[m]) / 2);
}

/**
 * Capitalise les données d'un lot dans DonneeMarche.
 * Jamais bloquant : toute erreur est loguée puis avalée.
 * @returns {object|null} l'enregistrement DonneeMarche créé/mis à jour
 */
export function alimenterBaseMarche(deal, lot, user) {
  try {
    const ville =
      lot.enrichissement?.commune?.nom || val(lot.lot?.adresse)?.ville || null;
    if (!ville) return null;
    const codePostal = val(lot.lot?.adresse)?.code_postal || '';

    const surface = val(lot.lot?.surface_m2);
    const loyer = val(lot.lot?.loyer_annuel_ht_hc);
    const prixFai = val(lot.lot?.prix_fai);
    const loyerM2 = surface > 0 && loyer > 0 ? loyer / surface : null;
    const prixM2 = surface > 0 && prixFai > 0 ? prixFai / surface : null;
    if (loyerM2 == null && prixM2 == null) return null;

    const observation = {
      deal_id: deal.deal_id,
      date: new Date().toISOString(),
      loyer_m2: arrondi(loyerM2),
      prix_m2: arrondi(prixM2),
      surface_m2: surface ?? null,
      titre: lot.synthese?.titre || null,
    };

    const existante = Records.filter('DonneeMarche', { ville, code_postal: codePostal })[0];
    const observations = [
      ...(existante?.observations || []).filter((o) => o.deal_id !== deal.deal_id),
      observation,
    ];

    const loyers = observations.map((o) => o.loyer_m2).filter((n) => n != null);
    const prix = observations.map((o) => o.prix_m2).filter((n) => n != null);

    const donnees = {
      ville,
      code_postal: codePostal,
      observations,
      // Baux constatés (€/m²/an) depuis nos observations.
      ...(loyers.length
        ? {
            baux_bas: Math.min(...loyers),
            baux_moyenne: mediane(loyers),
            baux_haut: Math.max(...loyers),
          }
        : {}),
      // Prix murs (€/m²) depuis nos observations.
      ...(prix.length
        ? {
            prix_m2_bas: Math.min(...prix),
            prix_m2_median: mediane(prix),
            prix_m2_haut: Math.max(...prix),
          }
        : {}),
      source: existante?.source || 'preanalyse',
      date_maj: new Date().toISOString().slice(0, 10),
      notes: `${observations.length} observation(s) issue(s) de la préanalyse.`,
    };

    if (existante) {
      Records.update('DonneeMarche', existante.id, donnees);
      return { ...existante, ...donnees };
    }
    return Records.create('DonneeMarche', donnees, user?.email);
  } catch (e) {
    console.error('[preanalyse] alimentation base marché impossible :', e?.message || e);
    return null;
  }
}
