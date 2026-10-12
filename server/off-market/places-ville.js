// Off-market, mode Simple (11 oct. 2026) : Google Maps en plus du registre.
// Le registre (SIRENE) ne voit pas tout : une agence AXA tenue par un agent
// général porte le nom de l'agent, une enseigne n'y est pas toujours écrite,
// une adresse est parfois celle du siège. Google Maps voit les vitrines. On
// cherche chaque famille de commerce dans le rectangle de la ville ; quand
// Google plafonne (60 résultats par recherche), le rectangle est coupé en
// quatre. Chaque vitrine trouvée enrichit le commerce du registre le plus
// proche au même nom, ou devient un commerce à part entière.

import { Records } from '../db.js';

const VILLE = 'Ville';
const COMMERCE = 'CommerceSimple';
const TEXTE = 'https://places.googleapis.com/v1/places:searchText';
const CHAMPS = 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,nextPageToken';
const maintenant = () => new Date().toISOString();
// Ce que Google range sous une recherche de commerce sans en être un : équipements, services publics, écoles, lieux de culte.
const PAS_UN_COMMERCE = /^(gym|sports_complex|stadium|sports_club|athletic_field|swimming_pool|government_office|local_government_office|city_hall|courthouse|police|post_office|school|primary_school|secondary_school|university|library|church|place_of_worship|mosque|synagogue|park|event_venue|convention_center|community_center|hospital|doctor|dentist|medical_lab|employment_agency|social_service_organization|tourist_attraction|museum|parking|bus_station|train_station|transit_station|cemetery|funeral_home|lodging|hotel|campground|association_or_organization|non_profit_organization)$/;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Les familles cherchées sur Google Maps, avec le libellé d'activité du
 * registre qu'elles prennent. Vingt recherches regroupées au lieu de 42 (11 oct.
 * 2026, Jules : « baisse les coûts ») : Google rend aussi les voisins d'une
 * famille (« boulangerie pâtisserie » trouve les pâtissiers), et le registre
 * apporte déjà le reste.
 */
export const CATEGORIES = [
  ['agence immobilière', 'Agence immobilière'], ['banque', 'Banque'], ['assurance', 'Courtier en assurance'],
  ['boulangerie pâtisserie', 'Boulangerie, pâtisserie'], ['boucherie charcuterie traiteur', 'Boucherie, charcuterie'],
  ['épicerie fine fromagerie caviste', 'Épicerie fine, alimentation spécialisée'], ['supermarché supérette', 'Supérette, supermarché'],
  ['restaurant', 'Restaurant, restauration assise'], ['bar café brasserie', 'Bar, café (débit de boissons)'],
  ['restauration rapide', 'Restauration rapide (snack, sandwicherie)'], ['coiffeur barbier', 'Coiffure, salon de beauté'],
  ['institut de beauté onglerie spa', 'Institut, spa, bien-être'], ['pharmacie', 'Pharmacie'], ['opticien audioprothésiste', 'Optique, commerce spécialisé'],
  ['tabac presse', 'Tabac, presse'], ['fleuriste', 'Fleuriste'], ['magasin de vêtements', 'Prêt-à-porter, vêtement'],
  ['chaussures maroquinerie', 'Chaussure, maroquinerie'], ['bijouterie parfumerie', 'Bijouterie, horlogerie'], ['magasin de décoration', 'Ameublement, meuble, décoration'],
];

/** Ce que coûte une recherche Google Maps avec téléphone et site (Text Search, gamme Enterprise), en dollars. */
export const COUT_RECHERCHE_USD = 0.035;

/** Pure : le rectangle d'une ville, d'après ses commerces connus (ou son centre), élargi d'environ 300 m. */
export function rectangleDe(points = [], centre = null, rayonKm = 2.5) {
  const ok = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (ok.length >= 5) {
    const lats = ok.map((p) => p.lat).sort((a, b) => a - b);
    const lons = ok.map((p) => p.lon).sort((a, b) => a - b);
    // Les 2 % les plus éloignés ne tirent pas le rectangle vers la campagne.
    const q = (t, x) => t[Math.max(0, Math.min(t.length - 1, Math.round(x * (t.length - 1))))];
    const marge = 0.003;
    return { bas: { lat: q(lats, 0.02) - marge, lon: q(lons, 0.02) - marge }, haut: { lat: q(lats, 0.98) + marge, lon: q(lons, 0.98) + marge } };
  }
  if (!centre) return null;
  const dLat = rayonKm / 111;
  const dLon = rayonKm / (111 * Math.cos((centre.lat * Math.PI) / 180));
  return { bas: { lat: centre.lat - dLat, lon: centre.lon - dLon }, haut: { lat: centre.lat + dLat, lon: centre.lon + dLon } };
}

/** Pure : le rectangle coupé en quatre. */
export function quartiers(r) {
  const mLat = (r.bas.lat + r.haut.lat) / 2;
  const mLon = (r.bas.lon + r.haut.lon) / 2;
  return [
    { bas: { lat: r.bas.lat, lon: r.bas.lon }, haut: { lat: mLat, lon: mLon } },
    { bas: { lat: r.bas.lat, lon: mLon }, haut: { lat: mLat, lon: r.haut.lon } },
    { bas: { lat: mLat, lon: r.bas.lon }, haut: { lat: r.haut.lat, lon: mLon } },
    { bas: { lat: mLat, lon: mLon }, haut: { lat: r.haut.lat, lon: r.haut.lon } },
  ];
}

/** Pure : des rectangles qui se touchent ou se chevauchent n'en font plus qu'un (pas deux recherches pour les mêmes rues). */
export function fusionnerRectangles(liste) {
  const r = liste.map((x) => ({ bas: { ...x.bas }, haut: { ...x.haut } }));
  const touche = (a, b) => a.bas.lat <= b.haut.lat && b.bas.lat <= a.haut.lat && a.bas.lon <= b.haut.lon && b.bas.lon <= a.haut.lon;
  let fusion = true;
  while (fusion) {
    fusion = false;
    for (let i = 0; i < r.length && !fusion; i += 1) for (let j = i + 1; j < r.length && !fusion; j += 1) {
      if (!touche(r[i], r[j])) continue;
      r[i] = { bas: { lat: Math.min(r[i].bas.lat, r[j].bas.lat), lon: Math.min(r[i].bas.lon, r[j].bas.lon) }, haut: { lat: Math.max(r[i].haut.lat, r[j].haut.lat), lon: Math.max(r[i].haut.lon, r[j].haut.lon) } };
      r.splice(j, 1);
      fusion = true;
    }
  }
  return r;
}

/** Une recherche Google Maps dans un rectangle : trois pages au plus (60 lieux). */
async function chercherDans(texte, r, { lire = fetch, cle }) {
  const lieux = [];
  let jeton = null;
  for (let page = 0; page < 3; page += 1) {
    const corps = { textQuery: texte, languageCode: 'fr', regionCode: 'FR', pageSize: 20, locationRestriction: { rectangle: { low: { latitude: r.bas.lat, longitude: r.bas.lon }, high: { latitude: r.haut.lat, longitude: r.haut.lon } } }, ...(jeton ? { pageToken: jeton } : {}) };
    const rep = await lire(TEXTE, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': CHAMPS }, body: JSON.stringify(corps) });
    if (!rep.ok) throw new Error(`Google Maps a répondu ${rep.status}`);
    const j = await rep.json();
    lieux.push(...(j.places || []));
    jeton = j.nextPageToken || null;
    if (!jeton) break;
    await attendre(400);
  }
  return { lieux, sature: lieux.length >= 60 };
}

/** Une famille dans tout le rectangle, coupé en quatre une fois là où Google plafonne. */
export async function chercherFamille(texte, r, { lire = fetch, cle, profondeur = 0, compteur = { n: 0 } } = {}) {
  compteur.n += 1;
  const { lieux, sature } = await chercherDans(texte, r, { lire, cle });
  if (!sature || profondeur >= 1) return lieux;
  const out = [...lieux];
  for (const q of quartiers(r)) out.push(...(await chercherFamille(texte, q, { lire, cle, profondeur: profondeur + 1, compteur })));
  return out;
}

const distanceM = (a, b) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const VIDES = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'et', 'sarl', 'sas', 'sasu', 'eurl', 'sci', 'sa', 'snc', 'chez', 'au', 'aux', 'l', 'd', 'agence', 'cabinet', 'societe', 'ets', 'etablissements', 'macon', 'france']);
const mots = (t) => norm(t).split(' ').filter((m) => m.length >= 3 && !VIDES.has(m));

/** Pure : ce lieu Google et ce commerce du registre sont-ils la même vitrine ? */
export function memeVitrine(lieu, c) {
  if (!Number.isFinite(c.lat)) return false;
  const d = distanceM({ lat: lieu.lat, lon: lieu.lon }, { lat: c.lat, lon: c.lon });
  if (d > 120) return false;
  const a = new Set(mots(lieu.nom));
  const b = [...mots(c.enseigne), ...mots(c.nom), ...mots(c.nom_google)];
  // Un mot en commun, ou un début de mot de six lettres (« Carrefour » ne ressemble plus à « Carreira »).
  return b.some((m) => a.has(m) || [...a].some((x) => x.length >= 6 && m.length >= 6 && x.slice(0, 6) === m.slice(0, 6)));
}

/**
 * Pure : la franchise. Google dit « Carrefour City », le registre dit
 * « GORYLO », la société qui l'exploite, sans enseigne déclarée : à moins de
 * 30 m et dans la même famille d'activité, c'est la même vitrine.
 */
export function memeFranchise(lieu, c) {
  if (!Number.isFinite(c.lat) || c.place_id) return false;
  if (distanceM({ lat: lieu.lat, lon: lieu.lon }, { lat: c.lat, lon: c.lon }) > 30) return false;
  const sansEnseigne = !c.enseigne || norm(c.enseigne) === norm(c.nom) || norm(c.nom).includes(norm(c.enseigne));
  return sansEnseigne && !!lieu.activite && familleDe(lieu.activite) === familleDe(c.activite);
}
const familleDe = (a) => {
  const t = norm(a);
  if (/superette|supermarche|epicerie|alimentation|primeur|boucherie|boulangerie|patisserie|caviste|fromag/.test(t)) return 'alimentaire';
  if (/restaurant|restauration|bar|cafe|traiteur|snack/.test(t)) return 'restauration';
  if (/coiffure|beaute|spa|institut|esthetique/.test(t)) return 'beaute';
  if (/vetement|chaussure|maroquinerie|bijouterie|parfumerie/.test(t)) return 'mode';
  return t.split(' ')[0] || null;
};

/** Pure : ce nom Google a-t-il été rattaché de travers (aucun mot en commun, pas une franchise) ? */
export const rattachementDouteux = (c) => !!c.nom_google && !memeVitrine({ nom: c.nom_google, lat: c.lat, lon: c.lon }, { ...c, nom_google: null }) && !(norm(c.enseigne) === norm(c.nom_google));

/** Défait les rattachements Google douteux d'une ville (avant un nouveau passage). Rend le nombre défait. */
export function reparerRattachements(villeId) {
  let n = 0;
  for (const c of Records.filter(COMMERCE, { ville_id: villeId })) {
    if (c.source === 'Google Maps' || !rattachementDouteux(c)) continue;
    const patch = { place_id: null, nom_google: null };
    if (c.contact_source === 'Google Maps') Object.assign(patch, { telephone: null, site: null, contact_source: null, contact_le: null });
    Records.update(COMMERCE, c.id, patch);
    n += 1;
  }
  return n;
}

/** Pure : l'adresse courte d'un lieu Google (« 12 Rue Carnot »), et son code postal. */
export function adresseDuLieu(p) {
  const complete = String(p.formattedAddress || '');
  const cp = (complete.match(/\b(\d{5})\b/) || [])[1] || null;
  const courte = String(p.shortFormattedAddress || complete).split(',')[0].trim();
  return { adresse: courte, code_postal: cp };
}

/**
 * Balaye une ville sur Google Maps, puis fusionne avec le registre. Rend ce
 * qui a été fait. `lire` et `cle` se remplacent dans les tests.
 */
export async function balayerVille(villeId, { lire = fetch, cle = (process.env.GOOGLE_MAPS_SERVEUR || '').trim(), categories = CATEGORIES, journal = () => {} } = {}) {
  const v = Records.get(VILLE, villeId);
  if (!v) return { ok: false, error: 'Ville introuvable.' };
  if (!cle) return { ok: false, error: 'Google Maps n\'est pas configuré (GOOGLE_MAPS_SERVEUR).' };
  const existants = Records.filter(COMMERCE, { ville_id: villeId });
  // Les zones commerçantes de la ville, quand on les a : on ne cherche que là. Sinon toute la ville.
  const { rectangleDeZone } = await import('./zones.js');
  const rectangles = fusionnerRectangles((v.simple?.zones || []).map(rectangleDeZone).filter(Boolean));
  const r = rectangleDe(existants, v.centre);
  if (!r && !rectangles.length) return { ok: false, error: 'Ville sans position.' };
  const zonesACouvrir = rectangles.length ? rectangles : [r];
  Records.update(VILLE, villeId, { simple: { ...(v.simple || {}), google: { etat: 'en_cours', depuis: maintenant() } } });
  const defaits = reparerRattachements(villeId);
  if (defaits) journal(`${v.nom} : ${defaits} rattachement(s) Google douteux défait(s) avant le passage.`);
  const compteur = { n: 0 };
  const vus = new Map();
  for (const [texte, activite] of categories) {
    try {
      const trouves = [];
      for (const rz of zonesACouvrir) trouves.push(...(await chercherFamille(texte, rz, { lire, cle, compteur })));
      for (const p of trouves) {
        if (!p?.id || vus.has(p.id) || !p.location) continue;
        if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
        if (PAS_UN_COMMERCE.test(String(p.primaryType || ''))) continue;
        vus.set(p.id, { ...p, activite });
      }
    } catch (e) { journal(`Google Maps, « ${texte} » : ${e?.message || e}`); }
  }
  let enrichis = 0;
  let ajoutes = 0;
  const pool = Records.filter(COMMERCE, { ville_id: villeId });
  for (const p of vus.values()) {
    const lieu = { nom: p.displayName?.text || '', lat: p.location.latitude, lon: p.location.longitude };
    const lieuA = { ...lieu, activite: p.activite };
    const deja = pool.find((c) => c.place_id === p.id) || pool.find((c) => !c.place_id && memeVitrine(lieu, c)) || pool.find((c) => memeFranchise(lieuA, c));
    const contact = { telephone: p.nationalPhoneNumber || null, site: p.websiteUri || null, contact_source: 'Google Maps', contact_le: maintenant() };
    if (deja) {
      // Une franchise prend l'enseigne de Google ; la société du registre reste l'exploitant.
      const franchise = !memeVitrine(lieu, deja);
      Records.update(COMMERCE, deja.id, { place_id: p.id, nom_google: lieu.nom, ...(deja.telephone ? {} : contact), ...(!deja.enseigne || franchise ? { enseigne: lieu.nom } : {}) });
      enrichis += 1;
      continue;
    }
    const { adresse, code_postal } = adresseDuLieu(p);
    const nouveau = Records.create(COMMERCE, {
      ville_id: villeId, source: 'Google Maps', place_id: p.id, siret: null, siren: null, nom: lieu.nom, enseigne: lieu.nom, nom_google: lieu.nom,
      activite: p.activite || p.primaryTypeDisplayName?.text || 'Commerce', adresse, code_postal, ville: v.nom, lat: lieu.lat, lon: lieu.lon,
      actif: true, chaine: false, depuis: null, etat_recherche: 'a_faire', cree_le: maintenant(), ...contact,
    });
    pool.push(nouveau);
    ajoutes += 1;
  }
  const bilan = { etat: 'fini', fini_le: maintenant(), recherches: compteur.n, cout_usd: Math.round(compteur.n * COUT_RECHERCHE_USD * 100) / 100, lieux: vus.size, enrichis, ajoutes };
  Records.update(VILLE, villeId, { simple: { ...(Records.get(VILLE, villeId).simple || {}), google: bilan } });
  journal(`${v.nom} : Google Maps, ${compteur.n} recherches, ${vus.size} vitrines, ${enrichis} rapprochées du registre, ${ajoutes} nouvelles.`);
  return { ok: true, ...bilan };
}
