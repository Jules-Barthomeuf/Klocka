// Signaux de vacance : les trois sources publiques, et rien d'autre ici.
//
//   BODACC (DILA, API Opendatasoft v2.1) : les procédures collectives, les
//   radiations, et parmi les modifications les dissolutions et transferts de
//   siège. Interrogé par code postal, par fenêtres de dates pour rester sous
//   le plafond de dix mille résultats par question.
//
//   SIRENE (INSEE, API 3.11) : les établissements d'une entreprise (par lot
//   de SIREN dans une seule question, le registre accepte le OU), et les
//   établissements d'une commune fermés depuis une date. Trente appels par
//   minute : deux secondes entre deux pages. La clé est celle de K-Vacance.
//
//   Géoplateforme (IGN) : l'autocomplétion de l'adresse tapée, et le
//   géocodage d'une adresse écrite dans une annonce quand le registre n'a
//   pas de point. Cinquante requêtes par seconde, sans clé.
//
// Chaque fonction rend des objets simples : les règles sont dans
// vacance-regles.js, l'écriture dans vacance.js.

import { ErreurSource } from '../marche/erreurs.js';
import { lireEtablissement, sireneConfigure, MESSAGE_SANS_CLE } from '../insee-sirene.js';

const BODACC = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
const SIRENE = 'https://api.insee.fr/api-sirene/3.11/siret';
const GEOCODAGE = 'https://data.geopf.fr/geocodage/search';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const PAGE_BODACC = 100;
// Le plafond d'Opendatasoft est dix mille : on coupe la fenêtre avant.
const PLAFOND_BODACC = 9800;
const PAUSE_SIRENE_MS = 2100;
const PAR_PAGE_SIRENE = 1000;
// Un lot de SIREN par question : « siren:X OR siren:Y … », loin de la limite d'une URL.
const SIRENS_PAR_LOT = 40;
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

// --- BODACC ---------------------------------------------------------------

async function appelerBodacc(params) {
  const url = `${BODACC}?${new URLSearchParams(params)}`;
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': UA } });
  } catch (e) {
    throw new ErreurSource(`Le BODACC n'a pas répondu (${e?.message || e}).`, { service: 'BODACC', cause: e });
  }
  if (!r.ok) throw new ErreurSource(`Le BODACC a répondu ${r.status}.`, { service: 'BODACC', statut: r.status });
  return r.json();
}

const FAMILLES = ['collective', 'radiation', 'modification'];
const clauseBodacc = (cp, depuis, jusqua) => `cp="${String(cp).replace(/\D/g, '')}" and familleavis in (${FAMILLES.map((f) => `"${f}"`).join(', ')}) and dateparution>="${depuis}" and dateparution<="${jusqua}"`;

/** Le milieu d'une fenêtre de dates, pour la couper en deux. */
const milieu = (a, b) => new Date((Date.parse(a) + Date.parse(b)) / 2).toISOString().slice(0, 10);
const lendemain = (j) => new Date(Date.parse(j) + 86400000).toISOString().slice(0, 10);

/**
 * Toutes les annonces d'un code postal entre deux dates, familles utiles
 * seulement. Une fenêtre trop pleine se coupe en deux, jusqu'au jour.
 *
 * @param {{cp: string, depuis: string, jusqua?: string, surProgres?: Function}} o
 */
export async function annoncesBodacc({ cp, depuis, jusqua = new Date().toISOString().slice(0, 10), surProgres = null }) {
  const sortie = [];
  const lire = async (a, b) => {
    const where = clauseBodacc(cp, a, b);
    const premiere = await appelerBodacc({ where, limit: String(PAGE_BODACC), offset: '0', order_by: 'dateparution desc' });
    const total = premiere.total_count ?? 0;
    if (total > PLAFOND_BODACC && a < b) {
      const m = milieu(a, b);
      await lire(a, m);
      await lire(lendemain(m), b);
      return;
    }
    sortie.push(...(premiere.results || []));
    for (let offset = PAGE_BODACC; offset < total; offset += PAGE_BODACC) {
      const d = await appelerBodacc({ where, limit: String(PAGE_BODACC), offset: String(offset), order_by: 'dateparution desc' });
      sortie.push(...(d.results || []));
      surProgres?.(`BODACC : ${sortie.length} annonces lues`);
    }
  };
  await lire(depuis, jusqua);
  return sortie;
}

// --- SIRENE ----------------------------------------------------------------

const cle = () => (process.env.INSEE_SIRENE_CLE || '').trim();

async function appelerSirene(params, essai = 0) {
  if (!sireneConfigure()) throw new Error(MESSAGE_SANS_CLE);
  const r = await fetch(`${SIRENE}?${new URLSearchParams(params)}`, {
    headers: { 'X-INSEE-Api-Key-Integration': cle(), accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(60000),
  });
  if (r.status === 404) return { header: { total: 0 }, etablissements: [] };
  if (r.status === 401) throw new Error("L'API Sirene refuse la clé INSEE_SIRENE_CLE.");
  if (r.status === 429 && essai < 4) { await pause(15000); return appelerSirene(params, essai + 1); }
  if (!r.ok) throw new Error(`L'API Sirene a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const CHAMPS = [
  'siret', 'siren', 'etablissementSiege', 'statutDiffusionEtablissement', 'dateCreationEtablissement',
  'numeroVoieEtablissement', 'indiceRepetitionEtablissement', 'typeVoieEtablissement', 'libelleVoieEtablissement',
  'codePostalEtablissement', 'libelleCommuneEtablissement', 'codeCommuneEtablissement',
  'coordonneeLambertAbscisseEtablissement', 'coordonneeLambertOrdonneeEtablissement',
  'dateDebut', 'dateFin', 'etatAdministratifEtablissement', 'activitePrincipaleEtablissement', 'enseigne1Etablissement', 'denominationUsuelleEtablissement',
  'denominationUniteLegale', 'nomUniteLegale', 'nomUsageUniteLegale', 'prenom1UniteLegale', 'activitePrincipaleUniteLegale',
].join(',');

/** Toutes les pages d'une question Sirene, par curseur (voir insee-sirene.js). */
async function pagesSirene(q, extra = {}) {
  const sortie = [];
  let curseur = '*';
  for (let page = 0; page < 40; page++) {
    const d = await appelerSirene({ q, nombre: String(PAR_PAGE_SIRENE), curseur, champs: CHAMPS, ...extra });
    sortie.push(...(d.etablissements || []));
    const suivant = d.header?.curseurSuivant;
    if (!suivant || suivant === curseur) break;
    curseur = suivant;
    await pause(PAUSE_SIRENE_MS);
  }
  return sortie;
}

/**
 * Un établissement tel que l'outil le garde. Pure : testée sans réseau.
 * Un établissement en diffusion partielle (statut P) n'a pas d'adresse
 * exploitable : il rend null et n'entre pas.
 */
export function lireEtablissementVacance(e) {
  if (!e?.siret || e.statutDiffusionEtablissement === 'P') return null;
  const base = lireEtablissement(e);
  if (!base) return null;
  return {
    siret: base.siret,
    siren: e.siren || String(e.siret).slice(0, 9),
    denomination: base.nom,
    enseigne: base.enseigne,
    adresse: base.adresse,
    code_naf: base.activite,
    etat: base.etat === 'F' ? 'ferme' : 'actif',
    date_fermeture: base.fermeture,
    date_creation: base.ouverture,
    est_siege: !!e.etablissementSiege,
    lat: base.lat,
    lon: base.lon,
    // Le registre ne dit pas la précision de son point ; quand il en a un, il vient de l'adresse.
    geo_precision: base.lat != null ? 'numero' : null,
    code_commune: base.code_commune,
  };
}

/**
 * Les établissements de plusieurs entreprises, par lots.
 * @param {string[]} sirens
 * @param {{surProgres?: Function}} [o]
 */
export async function etablissementsParSirens(sirens, { surProgres = null } = {}) {
  const propres = [...new Set((sirens || []).map((s) => String(s).replace(/\D/g, '')).filter((s) => /^\d{9}$/.test(s)))];
  const sortie = [];
  for (let i = 0; i < propres.length; i += SIRENS_PAR_LOT) {
    const lot = propres.slice(i, i + SIRENS_PAR_LOT);
    const brut = await pagesSirene(lot.map((s) => `siren:${s}`).join(' OR '));
    for (const e of brut) { const l = lireEtablissementVacance(e); if (l) sortie.push(l); }
    surProgres?.(`SIRENE : ${Math.min(i + SIRENS_PAR_LOT, propres.length)} entreprises sur ${propres.length}`);
    if (i + SIRENS_PAR_LOT < propres.length) await pause(PAUSE_SIRENE_MS);
  }
  return sortie;
}

/** Les établissements d'une commune passés à l'état fermé depuis une date. */
export async function fermeturesCommune(codeCommune, depuis, { surProgres = null } = {}) {
  const code = String(codeCommune || '').replace(/[^0-9AB]/gi, '');
  if (!code) return [];
  const brut = await pagesSirene(`codeCommuneEtablissement:${code} AND periode(etatAdministratifEtablissement:F AND dateDebut:[${depuis} TO *])`);
  surProgres?.(`SIRENE : ${brut.length} fermetures dans la commune`);
  return brut.map(lireEtablissementVacance).filter(Boolean);
}

/**
 * Le recensement des locaux à vitrine d'une commune (taux de vacance, 14 oct.
 * 2026) : tous les établissements qui ont eu, à un moment, une activité de
 * vitrine (commerce, restauration, services en boutique), ouverts ou fermés.
 * Une seule question par commune, quelques pages ; la catégorie juridique en
 * plus, pour reconnaître l'entrepreneur individuel.
 * @param {string} codeCommune
 * @param {string[]} prefixes  codes NAF, avec ou sans point (« 47 », « 95.2 », « 68.31 »)
 */
export async function vitrinesCommune(codeCommune, prefixes, { surProgres = null } = {}) {
  const code = String(codeCommune || '').replace(/[^0-9AB]/gi, '');
  if (!code || !prefixes?.length) return [];
  const naf = (p) => { const c = String(p).replace(/\./g, ''); return c.length > 2 ? `${c.slice(0, 2)}.${c.slice(2)}` : c; };
  const q = `codeCommuneEtablissement:${code} AND periode(etatAdministratifEtablissement:A AND (${prefixes.map((p) => `activitePrincipaleEtablissement:${naf(p)}*`).join(' OR ')}))`;
  const brut = await pagesSirene(q, { champs: `${CHAMPS},categorieJuridiqueUniteLegale` });
  surProgres?.(`SIRENE : ${brut.length} établissements à vitrine dans la commune`);
  return brut.map((e) => { const l = lireEtablissementVacance(e); return l ? { ...l, categorie_juridique: e.uniteLegale?.categorieJuridiqueUniteLegale || null } : null; }).filter(Boolean);
}

// --- Géoplateforme ------------------------------------------------------------

async function appelerGeocodage(params) {
  let r;
  try {
    r = await fetch(`${GEOCODAGE}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': UA } });
  } catch (e) {
    throw new ErreurSource(`La Géoplateforme n'a pas répondu (${e?.message || e}).`, { service: 'Géoplateforme', cause: e });
  }
  if (!r.ok) throw new ErreurSource(`La Géoplateforme a répondu ${r.status}.`, { service: 'Géoplateforme', statut: r.status });
  return r.json();
}

/** Ce que la carte garde d'une proposition : le point, le type, la commune. */
const lireProposition = (f) => ({
  label: f.properties?.label,
  lon: f.geometry?.coordinates?.[0],
  lat: f.geometry?.coordinates?.[1],
  score: f.properties?.score ?? null,
  type: f.properties?.type || null,
  citycode: f.properties?.citycode || null,
  postcode: f.properties?.postcode || null,
  city: f.properties?.city || null,
  street: f.properties?.street || f.properties?.name || null,
});

// L'autocomplétion se répète : la même question dans la journée ne repart pas.
const CACHE_SUGGESTIONS = new Map();
const CACHE_MS = 24 * 3600 * 1000;
const CACHE_MAX = 5000;

/** Cinq propositions au plus pour ce qu'on a tapé ; les types numéro et rue seuls sont choisissables. */
export async function suggestions(q, limite = 5) {
  const texte = String(q || '').trim().replace(/\s+/g, ' ');
  if (texte.length < 3) return [];
  const cle = `${limite}|${texte.toLowerCase()}`;
  const garde = CACHE_SUGGESTIONS.get(cle);
  if (garde && Date.now() - garde.le < CACHE_MS) return garde.liste;
  const d = await appelerGeocodage({ q: texte, limit: String(limite), autocomplete: '1', index: 'address' });
  const liste = (d.features || []).map(lireProposition).filter((p) => p.label && Number.isFinite(p.lat))
    .map((p) => ({ ...p, choisissable: p.type === 'housenumber' || p.type === 'street' }));
  if (CACHE_SUGGESTIONS.size >= CACHE_MAX) CACHE_SUGGESTIONS.delete(CACHE_SUGGESTIONS.keys().next().value);
  CACHE_SUGGESTIONS.set(cle, { le: Date.now(), liste });
  return liste;
}

/** En deçà, la Géoplateforme a répondu mais ne reconnaît pas vraiment cette adresse. */
const SEUIL_GEOCODAGE = 0.5;

/**
 * Le point d'une adresse écrite dans une annonce, au numéro ou à la rue ; au
 * niveau de la commune on préfère ne pas placer (rend null).
 * @returns {Promise<{lat:number, lon:number, precision:'numero'|'rue', score:number}|null>}
 */
export async function geocoder(adresse) {
  const texte = String(adresse || '').trim();
  if (texte.length < 5) return null;
  const d = await appelerGeocodage({ q: texte, limit: '1', index: 'address' });
  const p = (d.features || []).map(lireProposition)[0];
  if (!p || !Number.isFinite(p.lat) || (p.score ?? 0) < SEUIL_GEOCODAGE) return null;
  if (p.type !== 'housenumber' && p.type !== 'street') return null;
  return { lat: p.lat, lon: p.lon, precision: p.type === 'housenumber' ? 'numero' : 'rue', score: p.score };
}

/** Les sources telles que l'ingestion les reçoit ; un test en passe de fausses. */
export const SOURCES = { annoncesBodacc, etablissementsParSirens, fermeturesCommune, geocoder };
