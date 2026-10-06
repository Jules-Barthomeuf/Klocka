// Les agences immobilières d'une ville, telles que Google Maps les montre :
// la recherche « agence immobilière » qu'on ferait sur Maps, avec pour
// chacune son nom, son adresse, son téléphone et son site, ceux de sa fiche.
//
// Maps ne rend que 60 lieux par recherche (trois pages de vingt). Une grande
// ville en a plus : on découpe son cadre (geo.api.gouv.fr) en cases, et une
// case qui atteint le plafond se redécoupe en quatre, jusqu'à ce que chacune
// tienne. Un lieu d'une autre commune (le cadre déborde) est écarté par son
// code postal.
//
// La clé est GOOGLE_MAPS_SERVEUR (Places API, New). Le téléphone et le site
// font de chaque requête une requête « Enterprise » : quelques centimes, une
// ville moyenne en demande une dizaine.

const TEXTE = 'https://places.googleapis.com/v1/places:searchText';
const CHAMPS = 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.primaryType,places.types,places.location,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,nextPageToken';
const PAGES = 3;
const PAR_PAGE = 20;
const PROFONDEUR = 4;
const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const mapsConfigure = () => !!cle();
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** La commune : son nom, ses codes postaux et son cadre. */
export async function communeDe(ville, { lire = fetch } = {}) {
  const r = await lire(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(ville)}&fields=nom,code,codesPostaux,bbox,population&boost=population&limit=1`, { signal: AbortSignal.timeout(10_000) });
  const [c] = r.ok ? await r.json() : [];
  if (!c?.bbox?.coordinates?.[0]) return null;
  const pts = c.bbox.coordinates[0];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return {
    nom: c.nom, code: c.code, codes_postaux: c.codesPostaux || [],
    cadre: { sud: Math.min(...lats), nord: Math.max(...lats), ouest: Math.min(...lons), est: Math.max(...lons) },
  };
}

/** Pure : un cadre en quatre. */
export function decouper(c) {
  const lat = (c.sud + c.nord) / 2;
  const lon = (c.ouest + c.est) / 2;
  return [
    { sud: c.sud, nord: lat, ouest: c.ouest, est: lon }, { sud: c.sud, nord: lat, ouest: lon, est: c.est },
    { sud: lat, nord: c.nord, ouest: c.ouest, est: lon }, { sud: lat, nord: c.nord, ouest: lon, est: c.est },
  ];
}

const codePostalDe = (lieu) => (lieu.addressComponents || []).find((x) => (x.types || []).includes('postal_code'))?.longText
  || String(lieu.formattedAddress || '').match(/\b\d{5}\b/)?.[0] || null;

/**
 * Pure : un lieu de Maps à garder. Une agence immobilière ouverte, dans la
 * commune (son code postal, ou son nom dans l'adresse quand Maps n'en donne
 * pas).
 */
export function aGarder(lieu, commune) {
  if (!lieu) return false;
  if (lieu.businessStatus && lieu.businessStatus !== 'OPERATIONAL') return false;
  const types = [lieu.primaryType, ...(lieu.types || [])];
  if (!types.includes('real_estate_agency')) return false;
  const cp = codePostalDe(lieu);
  if (cp && commune.codes_postaux.length) return commune.codes_postaux.includes(cp);
  return String(lieu.formattedAddress || '').toLowerCase().includes(String(commune.nom || '').toLowerCase());
}

/** Pure : le site tel que la fiche le donne, sans le pistage ajouté par Maps. */
export function siteDe(uri) {
  if (!uri) return null;
  try {
    const u = new URL(uri);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|gclid|fbclid|y_source)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\?$/, '');
  } catch {
    return uri;
  }
}

/** Pure : un lieu de Maps en agence de la liste. */
export function versAgence(lieu) {
  return {
    nom: lieu.displayName?.text || null,
    adresse: String(lieu.formattedAddress || '').split(',')[0].trim() || null,
    code_postal: codePostalDe(lieu),
    telephone: lieu.nationalPhoneNumber || null,
    site: siteDe(lieu.websiteUri),
    place_id: lieu.id,
    maps_url: lieu.googleMapsUri || null,
    note_google: lieu.rating ?? null,
    avis_google: lieu.userRatingCount ?? null,
    lat: lieu.location?.latitude ?? null,
    lon: lieu.location?.longitude ?? null,
  };
}

/** Une case : la recherche, page à page. Rend { lieux, sature }. */
async function chercherCase(cadre, { lire, requete }) {
  const lieux = [];
  let jeton = null;
  for (let page = 0; page < PAGES; page += 1) {
    const r = await lire(TEXTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': CHAMPS },
      body: JSON.stringify({
        textQuery: requete, languageCode: 'fr', regionCode: 'FR', pageSize: PAR_PAGE,
        includedType: 'real_estate_agency',
        locationRestriction: { rectangle: { low: { latitude: cadre.sud, longitude: cadre.ouest }, high: { latitude: cadre.nord, longitude: cadre.est } } },
        ...(jeton ? { pageToken: jeton } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google Maps a répondu ${r.status}${j.error?.message ? ` : ${j.error.message}` : ''}`);
    lieux.push(...(j.places || []));
    jeton = j.nextPageToken || null;
    if (!jeton) break;
    await pause(300);
  }
  // Maps ne donne pas de quatrième page : soixante lieux, c'est le plafond,
  // et la case en cache sans doute d'autres.
  return { lieux, sature: lieux.length >= PAGES * PAR_PAGE };
}

/**
 * Les agences immobilières de la ville, sur Maps. `surCase` suit
 * l'avancement (cases lues, lieux trouvés).
 */
export async function agencesDeLaVille(ville, { lire = fetch, surCase = () => {}, requete = 'agence immobilière' } = {}) {
  if (!mapsConfigure()) throw new Error('La clé GOOGLE_MAPS_SERVEUR manque.');
  const commune = await communeDe(ville, { lire });
  if (!commune) throw new Error(`La commune « ${ville} » est introuvable.`);
  const vus = new Map();
  let cases = 0;
  let requetes = 0;
  const lireCase = async (cadre, profondeur) => {
    const { lieux, sature } = await chercherCase(cadre, { lire, requete });
    cases += 1;
    requetes += Math.min(PAGES, Math.ceil(Math.max(lieux.length, 1) / PAR_PAGE));
    for (const l of lieux) if (l?.id && !vus.has(l.id)) vus.set(l.id, l);
    surCase({ cases, lieux: vus.size });
    // Le plafond atteint : la case en cache d'autres, on la redécoupe.
    if (sature && profondeur < PROFONDEUR) for (const sous of decouper(cadre)) await lireCase(sous, profondeur + 1);
  };
  await lireCase(commune.cadre, 0);
  const tous = [...vus.values()];
  const gardes = tous.filter((l) => aGarder(l, commune)).map(versAgence);
  return { commune, agences: gardes, lus: tous.length, ecartes: tous.length - gardes.length, cases, requetes };
}

/**
 * Une agence précise, sur Maps : « son nom, sa ville », la première fiche
 * d'agence immobilière de la commune. Sert à compléter une ligne (adresse,
 * site, fiche, téléphone) sans relire toute la ville. Null si rien ne tient.
 */
export async function chercherAgence(nom, ville, { lire = fetch, commune = null } = {}) {
  if (!mapsConfigure()) throw new Error('La clé GOOGLE_MAPS_SERVEUR manque.');
  const c = commune || await communeDe(ville, { lire });
  const r = await lire(TEXTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': CHAMPS },
    body: JSON.stringify({
      textQuery: `${nom}, ${ville}`, languageCode: 'fr', regionCode: 'FR', pageSize: 3, includedType: 'real_estate_agency',
      ...(c?.cadre ? { locationBias: { rectangle: { low: { latitude: c.cadre.sud, longitude: c.cadre.ouest }, high: { latitude: c.cadre.nord, longitude: c.cadre.est } } } } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Maps a répondu ${r.status}${j.error?.message ? ` : ${j.error.message}` : ''}`);
  const lieu = (j.places || []).find((l) => !c || aGarder(l, c));
  return lieu ? versAgence(lieu) : null;
}
