// Valeur locative : la fourchette de loyer au m² d'une adresse, et la carte
// des secteurs autour.
//
// La donnée vient de Data-B (module « Valeurs locatives », déjà branché dans
// data-b.js) : la rue, le quartier et la ville, chacun en fourchette basse et
// haute, en euros HT HC par m² et par an. UNE RECHERCHE CONSOMME PROBABLEMENT
// UN CRÉDIT ; data-b.js garde chaque résultat trente jours par adresse, et
// rouvrir une recherche passée ne redemande jamais rien à Data-B.
//
// La carte se colore par IRIS, les quartiers statistiques de l'INSEE, dont les
// contours sont servis par la Géoplateforme sans clé. Data-B nomme ses
// quartiers comme l'INSEE nomme ses IRIS (« Roguet », « Saint-Rome ») : un
// IRIS dont le nom correspond à un quartier déjà recherché prend sa
// fourchette, les autres prennent celle de la ville. La carte se précise donc
// avec l'usage, et le dit.

import { Records } from './db.js';
import { valeurLocative, resoudreAdresse, dataBConfigure } from './data-b.js';
import { boiteDe } from './kzoning-insee.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'STATISTICALUNITS.IRIS:contours_iris';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 90000;
const CACHE_IRIS = 'CacheIrisCommune';
// Les IRIS bougent au rythme des recensements : un cache long ne coûte rien.
const CACHE_IRIS_JOURS = 180;
const RAYON_SECTEURS = 3000;

/** Un nom sans accent, sans casse, sans ponctuation : pour comparer. */
export const normaliser = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Attribue une fourchette à chaque IRIS. Pure : testée sans réseau.
 * @param {Array} iris       features GeoJSON de la commune
 * @param {Array} recherches résultats Data-B déjà en base pour cette commune
 * @param {string|null} quartierIci le quartier de la recherche en cours
 */
export function colorerSecteurs(iris, recherches, quartierIci = null) {
  const parQuartier = new Map();
  let ville = null;
  for (const r of recherches || []) {
    const q = r?.quartier;
    if (q?.nom && (q.basse != null || q.haute != null) && !parQuartier.has(normaliser(q.nom))) parQuartier.set(normaliser(q.nom), q);
    if (!ville && r?.ville && (r.ville.basse != null || r.ville.haute != null)) ville = r.ville;
  }
  const ici = normaliser(quartierIci);
  return (iris || []).map((f) => {
    const p = f.properties || {};
    const nom = p.nom_iris || '';
    const q = parQuartier.get(normaliser(nom));
    const v = q || ville;
    return {
      code_iris: p.code_iris,
      nom_iris: nom,
      basse: v?.basse ?? null,
      haute: v?.haute ?? null,
      source: q ? 'quartier' : ville ? 'ville' : null,
      ici: !!ici && normaliser(nom) === ici,
      geometry: f.geometry,
    };
  });
}

async function irisDeLaCommune(codeInsee, lat, lon) {
  const garde = Records.filter(CACHE_IRIS, { code_insee: codeInsee })[0];
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_IRIS_JOURS * 86400000) return garde.iris;
  const b = boiteDe(lat, lon, RAYON_SECTEURS);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '1000',
    // Longitude puis latitude, comme pour les carreaux : vérifié.
    BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`La Géoplateforme a répondu ${r.status}`);
  const iris = ((await r.json()).features || [])
    .filter((f) => f.properties?.code_insee === codeInsee)
    .map((f) => ({ properties: f.properties, geometry: f.geometry }));
  if (garde) Records.update(CACHE_IRIS, garde.id, { iris, le: new Date().toISOString() });
  else Records.create(CACHE_IRIS, { code_insee: codeInsee, iris, le: new Date().toISOString() });
  return iris;
}

/** Les résultats déjà en base pour une commune, du plus récent au plus ancien. */
function recherchesDe(nomVille) {
  const v = normaliser(nomVille);
  return Records.list('DataBRecherche')
    .filter((x) => normaliser(x.resultat?.ville?.nom) === v)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map((x) => x.resultat);
}

async function carteAutour(adresse, resultat) {
  let iris = [];
  let erreur = null;
  try { iris = await irisDeLaCommune(adresse.code_insee, adresse.lat, adresse.lon); }
  catch (e) { erreur = e?.message || String(e); }
  const secteurs = colorerSecteurs(iris, recherchesDe(resultat?.ville?.nom || adresse.ville), resultat?.quartier?.nom);
  return { secteurs, erreur_secteurs: erreur };
}

/** Les dernières recherches, une par adresse. */
export function listerRecherches(limite = 40) {
  const vues = new Set();
  const liste = [];
  for (const x of Records.list('DataBRecherche').sort((a, b) => String(b.le).localeCompare(String(a.le)))) {
    if (!x.resultat?.rue && !x.resultat?.quartier) continue;
    if (vues.has(x.cle)) continue;
    vues.add(x.cle);
    liste.push({ id: x.id, adresse: x.adresse, le: x.le, par: x.par, rue: x.resultat.rue || null, quartier: x.resultat.quartier || null, ville: x.resultat.ville || null });
    if (liste.length >= limite) break;
  }
  return liste;
}

/** Une recherche : Data-B (ou son cache), puis la carte. */
export async function rechercher(texte, { forcer = false, user = null } = {}) {
  if (!dataBConfigure()) return { ok: false, error: 'Data-B n\'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent dans .env.' };
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const r = await valeurLocative(texte, { forcer, user });
  if (!r.ok) return r;
  const carte = await carteAutour(adresse, r.resultat);
  const record = Records.list('DataBRecherche').filter((x) => x.adresse === adresse.label).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  return { ok: true, id: record?.id || null, resultat: r.resultat, point: { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, ville: adresse.ville }, ...carte };
}

/** Rouvre une recherche passée : jamais d'appel à Data-B, seulement la carte. */
export async function ouvrir(id) {
  const x = Records.get('DataBRecherche', id);
  if (!x?.resultat) return { ok: false, error: 'Cette recherche n\'existe plus.' };
  let adresse = null;
  try { adresse = await resoudreAdresse(x.adresse); } catch { /* la BAN ne répond pas : la carte se passe de point */ }
  const point = adresse ? { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, ville: adresse.ville } : null;
  const carte = adresse ? await carteAutour(adresse, x.resultat) : { secteurs: [], erreur_secteurs: 'adresse non localisée' };
  return { ok: true, id, resultat: { ...x.resultat, du_cache: true }, point, ...carte };
}
