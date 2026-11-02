// L'environnement d'un bien pour l'avis de valeur (1er nov. 2026, Jules : « dans l'estimation, ça ne remplit pas les
// flux, l'environnement, la dynamique, la vacance, les accès ; il faut que ça le fasse automatiquement »).
//
// Avant la rédaction, des faits mesurés autour de l'adresse, chacun avec sa source, que le modèle reformule sans rien
// inventer :
//   - le flux et les accès : l'indice de flux, les gares (SNCF, avec leur fréquentation), les arrêts de transport et
//     les parkings (OpenStreetMap), le zonage et le linéaire commercial du PLU (outils-kd/expertise.js) ;
//   - l'environnement : les commerces voisins tels que Klocka les connaît (CommerceSimple), leurs activités, et les
//     enseignes nationales reconnues par l'index des marques, gratuit (pas Google Places, payant) ;
//   - la vacance : K-Vacance autour de l'adresse (signaux du registre et taux mesuré) ;
//   - la dynamique : les chiffres de la commune (population, densité, revenu, chômage), lus par l'appelant.
// Chaque source a son délai : une source lente ou absente laisse sa case vide, jamais l'avis en attente.

import { Records } from './db.js';

const AVANT = (ms, promesse) => Promise.race([promesse, new Promise((r) => setTimeout(() => r(null), ms))]);
const rien = () => null;

/** Pure : la distance en mètres entre deux points. */
function metres(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/**
 * Pure : les commerces voisins (à `rayon` mètres, le bien lui-même exclu) résumés : combien, les activités les plus
 * présentes, les enseignes nationales. `marque` : nom → marque ou null.
 */
export function voisinage(point, commerces = [], { rayon = 150, exclure = null, marque = () => null } = {}) {
  const proches = commerces
    .filter((c) => c.lat != null && c.lon != null && c.id !== exclure && c.actif !== false)
    .map((c) => ({ c, d: metres(point, { lat: Number(c.lat), lon: Number(c.lon) }) }))
    .filter((x) => x.d <= rayon)
    .sort((a, b) => a.d - b.d);
  if (!proches.length) return null;
  const parActivite = new Map();
  for (const { c } of proches) { const a = c.activite || 'autre'; parActivite.set(a, (parActivite.get(a) || 0) + 1); }
  const activites = [...parActivite].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([activite, n]) => ({ activite, n }));
  const vues = new Set();
  const enseignes = [];
  for (const { c, d } of proches) {
    const m = marque(c.enseigne || c.nom || '');
    if (m && !vues.has(m.n)) { vues.add(m.n); enseignes.push({ marque: m.n, distance_m: d }); }
  }
  return { rayon_m: rayon, commerces: proches.length, activites, enseignes_nationales: enseignes.slice(0, 8), source: 'Klocka (registre SIRENE et OpenStreetMap)' };
}

/** Pure : la vacance de K-Vacance, réduite à ce que l'avis peut dire. */
export function vacanceLisible(v) {
  if (!v?.ok) return null;
  const t = v.taux || null;
  return {
    rayon_m: v.rayon_m,
    taux: t ? Object.fromEntries(Object.entries(t).filter(([k, x]) => typeof x === 'number' || (k === 'recense_le' && x))) : null,
    rues: t ? (t.rues || []).slice(0, 3).map((r) => ({ voie: r.voie, locaux: r.locaux, vacants: r.vacants, taux: r.taux })) : [],
    locaux_vides: v.nb_locaux_vides,
    signaux_registre: v.signaux ? { total: v.signaux.total, repartition: v.signaux.repartition } : null,
    source: 'K-Vacance (registre SIRENE, BODACC, OpenStreetMap)',
  };
}

/**
 * L'environnement d'une adresse : { point, flux, acces, environnement, vacance, sources } ; null si l'adresse ne se
 * situe pas. `commerceId` : le commerce du bien, exclu de ses voisins.
 */
export async function environnementDuBien({ adresse, commerceId = null, user = null, patience = 1 } = {}) {
  if (!adresse) return null;
  const { resoudreLocal } = await import('./socle/local.js');
  const l = await AVANT(20000, resoudreLocal(adresse).catch(rien));
  const point = l?.ok ? l.local.point : null;
  if (!point?.lat) return null;
  const code = l.local.adresse?.code_insee || null;

  // Les commerces voisins d'abord (la base, sans réseau) : leur nombre nourrit aussi l'indice de flux.
  let environnement = null;
  try {
    const villes = code ? Records.filter('Ville', { code_insee: code }) : [];
    const commerces = villes.flatMap((v) => Records.filter('CommerceSimple', { ville_id: v.id }));
    const { marqueDe, indexDesMarques } = await import('./enseignes-autour.js');
    const index = indexDesMarques();
    environnement = voisinage(point, commerces, { exclure: commerceId, marque: (n) => marqueDe(n, index) });
  } catch (err) { console.warn(`[avis] voisinage : ${err?.message || err}`); }

  const { emplacementDe } = await import('./outils-kd/expertise.js');
  const { vacanceDeLAdresse } = await import('./outils-kd/vacance.js');
  const { parkingsAutour } = await import('./outils-kd/sources-ouvertes.js');
  const etude = environnement ? { commerces_troncon: { total: environnement.commerces } } : null;
  const [empl, parkings, vac] = await Promise.all([
    AVANT(45000 * patience, emplacementDe({ adresse, point, etude }).catch(rien)),
    AVANT(45000 * patience, parkingsAutour(point).catch(rien)),
    AVANT(30000 * patience, vacanceDeLAdresse(adresse, { rayon: 300, user }).catch(rien)),
  ]);

  const flux = empl?.flux ? { ...empl.flux, source: 'Indice Klocka (gares, arrêts, commerces du tronçon)' } : null;
  const acces = {
    gares: (empl?.gares || []).map((g) => ({ nom: g.nom || g.libelle || null, distance_m: g.distance_m, voyageurs_an: g.voyageurs ?? g.frequentation ?? null })),
    arrets: (empl?.arrets || []).slice(0, 6).map((a) => ({ nom: a.nom || null, genre: a.genre || null, distance_m: a.distance_m ?? null })),
    parkings: parkings || [],
    source: 'SNCF, OpenStreetMap',
  };
  const urbanisme = empl?.urbanisme || null;
  const vacance = vacanceLisible(vac);
  const sources = [
    flux && 'Indice de flux Klocka',
    acces.gares.length && 'SNCF (gares)',
    (acces.arrets.length || acces.parkings.length) && 'OpenStreetMap',
    urbanisme && "Géoportail de l'urbanisme",
    environnement && 'Klocka (commerces voisins)',
    vacance && 'K-Vacance',
  ].filter(Boolean);
  return { point: { lat: point.lat, lon: point.lon }, flux, acces, urbanisme, environnement, vacance, sources };
}

/**
 * Lue dès l'ouverture de l'avis, en fond (1er nov. 2026) : la première lecture de la vacance d'une commune prend deux
 * minutes, le temps des questions au mandataire. Gardée sur l'estimation ; la rédaction la reprend sans attendre.
 */
export async function prechaufferEnvironnement(estimationId, user = null) {
  const e = Records.get('EstimationMandataire', estimationId);
  const adresse = e?.questionnaire?.adresse || e?.adresse;
  if (!adresse) return null;
  const p = e.proprietaire_id ? Records.get('ProprietaireMandataire', e.proprietaire_id) : null;
  const env = await environnementDuBien({ adresse, commerceId: p?.commerce_simple_id || null, user, patience: 6 });
  if (env) Records.update('EstimationMandataire', e.id, { environnement: { ...env, adresse, le: new Date().toISOString() } });
  return env;
}

/** Pure : l'environnement gardé sur l'estimation sert-il encore (même adresse, moins de sept jours) ? */
export const environnementFrais = (e, adresse, maintenant = Date.now()) =>
  !!(e?.environnement && e.environnement.adresse === adresse && maintenant - Date.parse(e.environnement.le || 0) < 7 * 86400000);

