// K-Zoning, la zone de chalandise d'un emplacement (18 oct. 2026, lot 8, plan § 3) : qui peut venir à cet
// emplacement, et combien de monde passe devant.
//
// Rassemble ce qui existe déjà et les sources du lot : les zones à 5, 10 et 15 minutes à pied (isochrones IGN,
// carreaux Filosofi, recensement à l'IRIS : implantation/zones.js), les commerces et la concurrence de
// l'activité cible dans la zone primaire (OpenStreetMap), les gares et leur fréquentation, les arrêts, puis
// l'indice de flux. Chaque adresse passe par l'identifiant de local ; chaque source par son interrupteur.

import { Records } from '../db.js';
import { resoudreLocal } from '../socle/local.js';
import { viaSource } from '../socle/registre-sources.js';
import { garesAutour, arretsAutour } from './sources-ouvertes.js';
import { indiceDeFlux } from './emplacement.js';

const ENTITE = 'ChalandiseKZoning';
const CACHE_JOURS = 30;

/** Pure : une zone lisible, sans sa géométrie : habitants, ménages, niveau de vie, jeunes et seniors. */
export function zoneLisible(z) {
  const i = z?.insee || null;
  const r = z?.recensement || null;
  return {
    cle: z.cle, nom: z.nom, marche: z.marche, approximation: z.approximation || null,
    habitants: i?.population?.habitants ?? r?.population ?? null,
    menages: i?.menages?.menages ?? null,
    niveau_de_vie_moyen: i?.revenus?.niveau_de_vie_moyen ?? null,
    part_moins_18: i?.population?.part_moins_18 ?? null,
    part_65_plus: i?.population?.part_65_plus ?? null,
    csp_plus_part: r?.csp_plus != null && r?.population ? Math.round((r.csp_plus / r.population) * 1000) / 10 : null,
    taux_chomage: r?.taux_chomage ?? null,
  };
}

/**
 * La zone de chalandise d'une adresse. `activite` : un métier de K-Zoning (« Boulangerie »…) pour compter la
 * concurrence ; sans lui, tous les commerces. Gardée trente jours par local et par activité.
 */
export async function chalandiseDe(adresse, { activite = null, forcer = false } = {}) {
  const local = await resoudreLocal(adresse);
  if (!local.ok) return { ok: false, error: local.error };
  const { id_local, point } = local.local;
  const cle = `${id_local}|${activite || 'tous'}`;
  if (!forcer) {
    const g = Records.filter(ENTITE, { cle })[0];
    if (g && Date.now() - Date.parse(g.le) < CACHE_JOURS * 86400000) return { ok: true, resultat: { ...g.resultat, du_cache: true } };
  }

  const zonesLues = await viaSource('isochrones_ign', async () => (await import('../implantation/zones.js')).zonesDeChalandise(point.lat, point.lon));
  const zones = (zonesLues.valeur?.zones || []).map(zoneLisible);
  const primaire = (zonesLues.valeur?.zones || [])[0] || null;

  const { filtresDe, TOUS_LES_COMMERCES } = await import('../kzoning-metiers.js');
  const { commercesDeLaZone } = await import('../kzoning-commerces.js');
  const rayon = primaire?.rayon_m || 400;
  const [tous, cible, gares, arrets] = await Promise.all([
    viaSource('osm', async () => commercesDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: rayon, filtres: TOUS_LES_COMMERCES.filtres }), null),
    activite ? viaSource('osm', async () => commercesDeLaZone({ lat: point.lat, lon: point.lon, rayon_m: rayon, filtres: filtresDe([activite]) }), null) : Promise.resolve(null),
    garesAutour(point).catch(() => []),
    arretsAutour(point).catch(() => []),
  ]);
  const commerces = tous?.valeur?.ok ? tous.valeur.commerces : null;
  const concurrents = cible?.valeur?.ok ? cible.valeur.commerces : null;
  const proches = (commerces || []).filter((c) => (c.distance_m ?? Infinity) <= 100).length;

  const flux = indiceDeFlux({
    habitants: zones[0]?.habitants ?? null,
    gares, arrets,
    commerces_troncon: commerces ? proches : null,
  });
  const resultat = {
    id_local, adresse: local.local.adresse.label, point,
    zones,
    commerces_zone_primaire: commerces ? commerces.length : null,
    activite: activite || null,
    concurrence: concurrents ? { nombre: concurrents.length, plus_proches: concurrents.slice(0, 8).map((c) => ({ nom: c.nom || null, distance_m: c.distance_m ?? null })) } : null,
    gares: gares.slice(0, 3), arrets: arrets.slice(0, 10),
    flux,
    sources: [
      zonesLues.ok && 'IGN (isochrones), INSEE Filosofi et recensement',
      commerces && 'OpenStreetMap (commerces)',
      gares.length && 'SNCF (gares et fréquentation)',
      arrets.length && 'OpenStreetMap (arrêts)',
    ].filter(Boolean),
    manques: [!zonesLues.ok && `zones : ${zonesLues.coupee ? 'source coupée' : zonesLues.panne}`, !commerces && 'commerces : OpenStreetMap n\'a pas répondu'].filter(Boolean),
    le: new Date().toISOString(),
  };
  const g = Records.filter(ENTITE, { cle })[0];
  if (g) Records.update(ENTITE, g.id, { cle, resultat, le: resultat.le }); else Records.create(ENTITE, { cle, resultat, le: resultat.le });
  return { ok: true, resultat };
}
