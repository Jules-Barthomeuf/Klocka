// K-Transactions, les murs (lot 6 de la boîte à outils de Haka, spec de Jules du 18 oct. 2026).
//
// Les ventes de locaux commerciaux autour d'un local, cherchées par cercles :
// la même parcelle, puis la même rue, puis l'IRIS, puis la commune, jusqu'à
// réunir au moins 5 ventes. Seules les ventes « Local industriel, commercial
// ou assimilé » comptent (dvf.js écarte déjà les actes mêlés à d'autres
// biens, dont on ne peut pas isoler le prix) ; les prix au m² hors du 5e et du
// 95e centile de la commune sont écartés. Les ventes Klocka signées (projets
// au statut « signé ») s'ajoutent, avec leur source.
//
// Les prix ne sont pas actualisés : il n'existe pas d'indice public des prix
// des murs commerciaux. La médiane par année est rendue à côté, pour voir la
// tendance, et l'écran le dit.
//
// Sources : l'entrepôt (entrepot_dvf, entrepot_iris, chargés la nuit pour le
// 06) quand la commune y est, sinon les fichiers DVF de la commune ; tout passe
// par l'interrupteur de la source (viaSource). Rien n'appelle Data-B.

import db, { Records } from './db.js';
import { sourceActive, viaSource } from './socle/registre-sources.js';
import { dansGeometrie, nomDeVoie } from './socle/local.js';

export const MIN_PAR_CERCLE = 5;
export const CENTILES = [0.05, 0.95];
export const CERCLES = ['parcelle', 'rue', 'iris', 'commune'];
const LIBELLE_CERCLE = { parcelle: 'la même parcelle', rue: 'la même rue', iris: 'le même quartier (IRIS)', commune: 'la commune' };

/** Pure : le quantile d'une série triée, par interpolation linéaire. */
export function quantile(tries, q) {
  if (!tries.length) return null;
  const pos = (tries.length - 1) * q;
  const bas = Math.floor(pos);
  const haut = Math.ceil(pos);
  return Math.round(tries[bas] + (tries[haut] - tries[bas]) * (pos - bas));
}

/** Pure : écarte les prix au m² hors du 5e–95e centile de la commune. Rend les ventes gardées et les bornes. */
export function sansAberrants(ventes) {
  const tries = ventes.map((v) => v.prix_m2).filter((x) => x > 0).sort((a, b) => a - b);
  if (tries.length < 10) return { ventes, bornes: null, ecartees: 0 };
  const [bas, haut] = CENTILES.map((q) => quantile(tries, q));
  const gardees = ventes.filter((v) => v.prix_m2 >= bas && v.prix_m2 <= haut);
  return { ventes: gardees, bornes: { bas, haut }, ecartees: ventes.length - gardees.length };
}

/** Pure : la rue d'une adresse de vente (« 12 B RUE D'ANTIBES » ou « 12 rue d'Antibes, 06400 Cannes »), normalisée. */
export const rueDe = (adresse) => nomDeVoie(String(adresse || '').split(',')[0]);

/** Pure : le résumé d'un ensemble de ventes (quartiles, nombre, période, médiane par année). */
export function resumer(ventes) {
  const tries = ventes.map((v) => v.prix_m2).sort((a, b) => a - b);
  const dates = ventes.map((v) => v.date).filter(Boolean).sort();
  const parAnnee = {};
  for (const v of ventes) {
    const a = String(v.date || '').slice(0, 4);
    if (a) (parAnnee[a] ||= []).push(v.prix_m2);
  }
  return {
    n: ventes.length,
    prix_m2: tries.length >= MIN_PAR_CERCLE ? { bas: quantile(tries, 0.25), median: quantile(tries, 0.5), haut: quantile(tries, 0.75) } : null,
    periode: dates.length ? { du: dates[0], au: dates.at(-1) } : null,
    par_annee: Object.entries(parAnnee).sort(([a], [b]) => a.localeCompare(b))
      .map(([annee, xs]) => ({ annee, n: xs.length, median: quantile([...xs].sort((a, b) => a - b), 0.5) })),
  };
}

/**
 * Pure : les ventes du premier cercle qui en réunit au moins MIN_PAR_CERCLE.
 * `local` : { parcelle, rue, code_iris } ; `irisDe(vente)` rend le code IRIS d'une vente (ou null).
 */
export function choisirCercle(ventes, local, irisDe = () => null) {
  const rue = local.rue ? nomDeVoie(local.rue) : null;
  const tests = {
    parcelle: (v) => !!local.parcelle && v.parcelle === local.parcelle,
    rue: (v) => !!rue && rueDe(v.adresse) === rue,
    iris: (v) => !!local.code_iris && irisDe(v) === local.code_iris,
    commune: () => true,
  };
  const essais = [];
  for (const c of CERCLES) {
    const dedans = ventes.filter(tests[c]);
    essais.push({ cercle: c, n: dedans.length });
    if (dedans.length >= MIN_PAR_CERCLE) return { cercle: c, libelle: LIBELLE_CERCLE[c], ventes: dedans, essais };
  }
  return { cercle: 'commune', libelle: LIBELLE_CERCLE.commune, ventes, essais };
}

/** Pure : la dernière vente d'une parcelle (DVF, toutes natures de local), ou null. */
export function derniereVente(ventes, parcelle) {
  if (!parcelle) return null;
  return ventes.filter((v) => v.parcelle === parcelle).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

/** Pure : un projet Klocka signé, en vente comparable (ou null s'il manque le prix, la surface ou le point). */
export function venteKlocka(p) {
  const prix = Number(p.sim_prix_bien_negocie || p.prix_acquisition) || null;
  const surface = Number(p.surface_m2) || null;
  const lat = Number(p.latitude); const lon = Number(p.longitude);
  if (!prix || !surface || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: `klocka:${p.id}`, source: 'klocka', date: String(p.signe_le || p.updated_date || p.created_date || '').slice(0, 10) || null,
    prix, surface, prix_m2: Math.round(prix / surface), parcelle: null, lots: 1,
    adresse: p.adresse_complete || p.titre || null, lat, lon, titre: p.titre || null,
  };
}

// --- Les lectures ---------------------------------------------------------------------------------

const lien = (v) => (v.source === 'klocka' ? null : `https://app.dvf.etalab.gouv.fr/?lat=${v.lat}&lon=${v.lon}&zoom=19`);

/** Les ventes commerciales d'une commune : l'entrepôt s'il l'a, sinon les fichiers DVF. */
async function ventesDvf(code_insee) {
  return viaSource('dvf', async () => {
    let lignes = [];
    try { lignes = db.prepare('SELECT * FROM entrepot_dvf WHERE commune = ?').all(code_insee); } catch { lignes = []; }
    if (lignes.length) {
      const millesimes = [...new Set(lignes.flatMap((l) => String(l.millesime || '').split(',')).filter(Boolean))].sort();
      return { origine: 'entrepot', millesimes, ventes: lignes.map((l) => ({ id: l.id_mutation, date: l.date, prix: l.prix, surface: l.surface, prix_m2: l.prix_m2, parcelle: l.parcelle, lots: l.lots, adresse: l.adresse, lat: l.lat, lon: l.lon })) };
    }
    const { telechargerFichiers, lireCsv, ventesCommerciales, departementDe } = await import('./dvf.js');
    const fichiers = await telechargerFichiers(departementDe(code_insee), code_insee);
    const { ventes } = ventesCommerciales(fichiers.flatMap((m) => lireCsv(m.texte)));
    return { origine: 'fichiers', millesimes: fichiers.map((m) => m.annee).sort(), ventes };
  }, { origine: null, millesimes: [], ventes: [] });
}

/** Les contours IRIS de la commune, depuis l'entrepôt (vide s'il ne les a pas). */
function irisDeLaCommune(code_insee) {
  try {
    return db.prepare('SELECT code_iris, geometrie FROM entrepot_iris WHERE commune = ?').all(code_insee)
      .map((r) => ({ code: r.code_iris, g: JSON.parse(r.geometrie) }));
  } catch { return []; }
}

/** Les ventes Klocka signées de la commune. */
function ventesKlocka(local) {
  const ville = String(local.adresse?.ville || '').toLowerCase();
  const cp = String(local.adresse?.code_postal || '');
  return Records.list('Project')
    .filter((p) => p.statut === 'signe' && !p.archived)
    .filter((p) => String(p.code_insee || '') === local.adresse?.code_insee || String(p.ville || '').toLowerCase() === ville || (cp && String(p.adresse_complete || '').includes(cp)))
    .map(venteKlocka).filter(Boolean);
}

/**
 * Les murs autour d'un local résolu (socle/local.js). Rend le même contrat que dvf.ventesAutour (prix_m2, n,
 * ventes, annees, lien…) pour que la page et le format commun ne changent pas, plus le cercle retenu, les ventes de
 * la rue, la dernière vente de la parcelle et la médiane par année.
 */
export async function mursAutour(local) {
  const insee = local.adresse?.code_insee;
  if (!insee) return { ok: false, error: 'Commune inconnue pour cette adresse.' };
  const dvf = await ventesDvf(insee);
  if (!dvf.ok && !dvf.valeur?.ventes?.length) return { ok: false, error: dvf.coupee ? 'La source DVF est coupée.' : `DVF illisible : ${dvf.panne}` };
  const { ventes: brutes, millesimes, origine } = dvf.valeur;
  // Les ventes Klocka passent par leur interrupteur (« klocka_transactions », à ajouter au registre ; inconnue, elle est active).
  const klocka = sourceActive('klocka_transactions') ? ventesKlocka(local) : [];

  const { ventes: propres, bornes, ecartees } = sansAberrants([...brutes, ...klocka]);
  const contours = irisDeLaCommune(insee);
  const irisDe = (v) => contours.find((c) => dansGeometrie({ lat: v.lat, lon: v.lon }, c.g))?.code || null;
  const cible = { parcelle: local.parcelle?.idu || null, rue: local.adresse?.rue || null, code_iris: local.iris?.code_iris || null };
  const choix = choisirCercle(propres, cible, irisDe);
  const r = resumer(choix.ventes);
  const rue = cible.rue ? propres.filter((v) => rueDe(v.adresse) === nomDeVoie(cible.rue)) : [];
  // La dernière mutation de la parcelle, quel que soit le bien (DVF entier) ; à défaut, la dernière vente commerciale connue.
  const mutation = cible.parcelle ? await viaSource('dvf', async () => {
    const { mutationsDeLaParcelle } = await import('./dvf.js');
    return (await mutationsDeLaParcelle(insee, cible.parcelle))[0] || null;
  }) : { valeur: null };
  const commerciale = derniereVente(brutes, cible.parcelle);
  const parcelle = mutation.valeur
    ? { id: mutation.valeur.id, date: mutation.valeur.date, nature: mutation.valeur.nature, types: mutation.valeur.types, lots: mutation.valeur.lots, prix: mutation.valeur.prix, surface: mutation.valeur.surface_commerciale, commercial_pur: mutation.valeur.commercial_pur, lat: local.point.lat, lon: local.point.lon, parcelle: cible.parcelle }
    : commerciale;
  const dist = (v) => Math.round(Math.hypot((v.lat - local.point.lat) * 111320, (v.lon - local.point.lon) * 111320 * Math.cos((local.point.lat * Math.PI) / 180)));
  const enListe = (v) => ({ ...v, distance_m: dist(v), lien: lien(v), source: v.source || 'dvf' });

  return {
    ok: true,
    resultat: {
      source: klocka.length ? 'DVF · Demandes de valeurs foncières, et ventes Klocka' : 'DVF · Demandes de valeurs foncières',
      unite: '€ / m²',
      adresse: local.adresse?.label,
      commune: local.adresse?.ville,
      code_insee: insee,
      id_local: local.id_local || null,
      annees: millesimes,
      origine,
      cercle: choix.cercle,
      cercle_libelle: choix.libelle,
      essais: choix.essais,
      prix_m2: r.prix_m2,
      n: r.n,
      n_minimum: MIN_PAR_CERCLE,
      periode: r.periode,
      par_annee: r.par_annee,
      actualise: false,
      ventes: choix.ventes.map(enListe).sort((a, b) => a.distance_m - b.distance_m).slice(0, 60),
      ventes_rue: rue.map(enListe).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30),
      derniere_vente_parcelle: parcelle ? enListe(parcelle) : null,
      klocka: klocka.length,
      bornes_commune: bornes,
      ecartees: { aberrantes: ecartees },
      iris_disponibles: contours.length > 0,
      lien: `https://app.dvf.etalab.gouv.fr/?lat=${local.point.lat}&lon=${local.point.lon}&zoom=17`,
      le: new Date().toISOString(),
    },
  };
}
