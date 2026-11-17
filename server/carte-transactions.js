// La carte des transactions autour d'un commerce (17 nov. 2026, Jules : « dans la page Marché de l'analyse d'un dossier,
// une carte des transactions autour du commerce ; elle se voit aussi dans le projet »).
//
// Deux marchés, deux sources publiques, chacune avec ses coordonnées :
//  - les murs : les ventes de locaux commerciaux de DVF (actes des notaires), dvf.ventesAutour ;
//  - les fonds : les cessions de fonds de commerce du BODACC, géocodées par la Base Adresse Nationale, cessions-fonds.js.
// Rien n'est estimé ni déduit : chaque point est une vente publiée. Les deux lectures se gardent en cache (DVF trente
// jours, BODACC sept), la carte ne coûte rien de plus qu'une seconde lecture.

import { resoudreAdresse } from './adresse-ban.js';

export const RAYON_M = 500;

/** Pure : une vente de murs telle que la carte la montre. */
export const pointMurs = (v) => ({
  lat: v.lat, lon: v.lon, date: v.date || null, prix: v.prix ?? null, surface: v.surface ?? null, prix_m2: v.prix_m2 ?? null,
  adresse: v.adresse || null, distance_m: v.distance_m ?? null,
});

/** Pure : une cession de fonds telle que la carte la montre. */
export const pointFonds = (t) => ({
  lat: t.lat, lon: t.lon, date: t.date || null, prix: t.prix ?? null, activite: t.activite || null, enseigne: t.enseigne || null,
  adresse: t.adresse || null, distance_m: t.distance_m ?? null, sur_place: !!t.sur_place,
});

const situe = (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon);

/**
 * Les transactions autour d'une adresse. Rend { ok, bien: { lat, lon, adresse }, rayon, murs, fonds, sources, erreurs }.
 * Une source muette n'empêche pas l'autre : son erreur est dite dans `erreurs`.
 */
export async function carteTransactions(texteAdresse, { rayon = RAYON_M, user = null } = {}) {
  let adresse;
  try { adresse = await resoudreAdresse(texteAdresse); } catch (e) { return { ok: false, error: e?.message || String(e) }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };
  const { ventesAutour } = await import('./dvf.js');
  const { cessionsAutour } = await import('./cessions-fonds.js');
  const [m, f] = await Promise.allSettled([ventesAutour(adresse.label, { rayon, user }), cessionsAutour(adresse.label, { rayon, user })]);
  const erreurs = [];
  const lu = (r, nom) => {
    if (r.status === 'rejected') { erreurs.push(`${nom} : ${r.reason?.message || r.reason}`); return null; }
    if (!r.value?.ok) { erreurs.push(`${nom} : ${r.value?.error || 'pas de réponse'}`); return null; }
    return r.value.resultat;
  };
  const murs = lu(m, 'Murs (DVF)');
  const fonds = lu(f, 'Fonds (BODACC)');
  return {
    ok: true,
    bien: { lat: adresse.lat, lon: adresse.lon, adresse: adresse.label },
    rayon,
    murs: (murs?.ventes || []).filter(situe).map(pointMurs),
    fonds: (fonds?.transactions || []).filter(situe).filter((t) => t.distance_m == null || t.distance_m <= rayon).map(pointFonds),
    sources: {
      murs: murs ? { nom: 'DVF, actes des notaires', annees: murs.annees || [], lien: murs.lien || null } : null,
      fonds: fonds ? { nom: 'BODACC, annonces commerciales', annees: fonds.annees || null, lien: fonds.lien || null } : null,
    },
    erreurs,
  };
}
