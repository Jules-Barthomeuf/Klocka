// La balade dans une rue, sur Google Maps.
//
// On prend des points le long de la rue (les établissements de l'annuaire,
// ou à défaut des numéros sondés dans la Base Adresse Nationale), on marche
// de point en point tous les quarante mètres, et à chaque pas on demande à
// Places ce qu'il y a autour : les commerces tels qu'ils sont sur Maps, avec
// leur nom d'enseigne, leur type, leur adresse, ouverts ou fermés. On ne
// garde que ce qui a une vitrine : une pharmacie, un bar, une boutique, une
// banque, un laboratoire. Pas un dentiste au troisième, pas un appartement à
// louer, pas un coach à domicile.
//
// La clé est GOOGLE_MAPS_SERVEUR (Places API et Street View Static API).

import { ErreurSource } from '../marche/erreurs.js';
import { cleRue, rueDe, joliNomDeRue } from './commerces.js';

const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const placesConfigure = () => !!cle();

const NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';
const PAS_M = 40;
const RAYON_M = 35;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Ce qui a une vitrine. Un type absent d'ici ne devient pas une cible, et
// les types de la seconde liste écartent même quand un autre type plaide.
const VITRINES = new Set([
  'store', 'clothing_store', 'shoe_store', 'jewelry_store', 'gift_shop', 'department_store', 'discount_store', 'home_goods_store', 'furniture_store', 'home_improvement_store', 'hardware_store', 'electronics_store', 'cell_phone_store', 'bicycle_store', 'book_store', 'sporting_goods_store', 'pet_store', 'florist', 'liquor_store', 'wine_bar',
  'pharmacy', 'drugstore', 'medical_lab', 'optician',
  'bakery', 'cafe', 'coffee_shop', 'bar', 'pub', 'restaurant', 'ice_cream_shop', 'tea_house', 'sandwich_shop', 'pizza_restaurant', 'fast_food_restaurant', 'butcher_shop', 'grocery_store', 'supermarket', 'convenience_store', 'market', 'food_store', 'delicatessen', 'chocolate_shop', 'confectionery', 'dessert_shop', 'candy_store', 'cheese_shop', 'seafood_market', 'food',
  'hair_salon', 'hair_care', 'beauty_salon', 'nail_salon', 'barber_shop', 'spa', 'massage',
  'bank', 'insurance_agency', 'real_estate_agency', 'travel_agency', 'laundry', 'dry_cleaner', 'tailor', 'shoe_repair', 'locksmith', 'key_duplication_service', 'print_shop', 'copy_center', 'tobacco_shop', 'newsstand', 'photography_studio', 'mobile_phone_repair', 'watch_repair', 'eyewear_store',
]);
const HORS_VITRINE = new Set([
  'lodging', 'hotel', 'apartment_building', 'apartment_complex', 'condominium_complex', 'housing_complex', 'atm', 'parking', 'dentist', 'doctor', 'physiotherapist', 'hospital', 'lawyer', 'accounting', 'consultant', 'astrologer', 'psychic', 'gym', 'fitness_center', 'personal_trainer', 'school', 'university', 'church', 'place_of_worship', 'city_hall', 'local_government_office', 'courthouse', 'embassy', 'post_office', 'veterinary_care', 'telecommunications_service_provider', 'corporate_office', 'real_estate_developer', 'moving_company', 'storage', 'car_rental', 'car_dealer', 'car_repair', 'car_wash', 'gas_station', 'night_club', 'casino', 'adult_entertainment', 'tourist_attraction', 'museum', 'art_gallery', 'event_venue', 'wedding_venue', 'plumber', 'electrician', 'painter', 'roofing_contractor', 'general_contractor', 'insurance_broker', 'transit_station', 'bus_stop', 'taxi_stand', 'library', 'community_center',
]);

/** Le type Places, en français, pour l'écran. */
const MOTS = {
  store: 'Boutique', clothing_store: 'Prêt-à-porter', shoe_store: 'Chaussures', jewelry_store: 'Bijouterie', gift_shop: 'Cadeaux', department_store: 'Grand magasin', home_goods_store: 'Maison, décoration', furniture_store: 'Ameublement', electronics_store: 'Électronique', cell_phone_store: 'Téléphonie', book_store: 'Librairie', sporting_goods_store: 'Sport', pet_store: 'Animalerie', florist: 'Fleuriste', liquor_store: 'Caviste',
  pharmacy: 'Pharmacie', drugstore: 'Parapharmacie', medical_lab: 'Laboratoire de biologie médicale', optician: 'Opticien', eyewear_store: 'Opticien',
  bakery: 'Boulangerie', cafe: 'Café', coffee_shop: 'Café', bar: 'Bar', pub: 'Bar', restaurant: 'Restaurant', ice_cream_shop: 'Glacier', tea_house: 'Salon de thé', sandwich_shop: 'Sandwicherie (snack)', pizza_restaurant: 'Pizzeria', fast_food_restaurant: 'Restauration rapide (snack)', butcher_shop: 'Boucherie', grocery_store: 'Épicerie', supermarket: 'Supermarché', convenience_store: 'Supérette', chocolate_shop: 'Chocolatier', cheese_shop: 'Fromagerie', seafood_market: 'Poissonnerie', delicatessen: 'Traiteur, épicerie fine',
  hair_salon: 'Coiffeur', hair_care: 'Coiffeur', beauty_salon: 'Institut de beauté', nail_salon: 'Onglerie', barber_shop: 'Barbier', spa: 'Spa', massage: 'Massage',
  bank: 'Banque', insurance_agency: 'Assurance', real_estate_agency: 'Agence immobilière', travel_agency: 'Agence de voyage', laundry: 'Laverie', dry_cleaner: 'Pressing', tailor: 'Retouches', shoe_repair: 'Cordonnerie', locksmith: 'Serrurier', print_shop: 'Imprimerie', tobacco_shop: 'Tabac', newsstand: 'Presse', photography_studio: 'Photographe',
};

export function motDuType(type, types = []) {
  if (MOTS[type]) return MOTS[type];
  const t = types.find((x) => MOTS[x]);
  return t ? MOTS[t] : type ? type.replace(/_/g, ' ') : null;
}

/** Une vitrine, ou non, d'après les types Places. Rend { oui, motif }. */
export function vitrine(lieu) {
  const types = [lieu.primaryType, ...(lieu.types || [])].filter(Boolean);
  const hors = types.find((t) => HORS_VITRINE.has(t));
  if (hors && !(VITRINES.has(lieu.primaryType))) return { oui: false, motif: hors.replace(/_/g, ' ') };
  if (types.some((t) => VITRINES.has(t))) return { oui: true };
  return { oui: false, motif: `sans vitrine (${lieu.primaryType || types[0] || 'type inconnu'})` };
}

async function autour(lat, lon, rayon = RAYON_M) {
  const r = await fetch(NEARBY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.primaryType,places.types,places.location,places.businessStatus,places.nationalPhoneNumber,places.websiteUri' },
    body: JSON.stringify({ maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'fr', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: rayon } } }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurSource(`Places a répondu ${r.status}${j.error?.message ? ` : ${j.error.message}` : ''}.`, { service: 'Google Places', statut: r.status });
  const lieux = j.places || [];
  // Vingt, c'est le plafond d'une réponse : le pas est saturé, une rue dense
  // en cache d'autres. On resserre en quatre demi-pas autour, jusqu'à 10 m.
  if (lieux.length >= 20 && rayon > 10) {
    const d = rayon / 2;
    const dLat = d / 111000;
    const dLon = d / (111000 * Math.cos((lat * Math.PI) / 180));
    for (const [la, lo] of [[lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon]]) {
      await pause(80);
      lieux.push(...(await autour(la, lo, d)));
    }
  }
  return lieux;
}

/**
 * Des numéros d'une rue, par la BAN. Elle ne liste pas les numéros d'une
 * voie : on en sonde une trentaine, de 1 à 300, et on garde ceux qui
 * existent. Assez pour tracer la rue de bout en bout.
 */
export async function numerosDeLaRue(nom, ville) {
  const k = cleRue(nom);
  const sondes = [1, 3, 6, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 170, 190, 210, 240, 270, 300];
  const out = [];
  for (const n of sondes) {
    try {
      const r = await fetch(`https://api-adresse.data.gouv.fr/search/?type=housenumber&limit=1&q=${encodeURIComponent(`${n} ${nom} ${ville}`)}`, { signal: AbortSignal.timeout(15000) });
      const f = (await r.json()).features?.[0];
      if (f && cleRue(f.properties.street || f.properties.name) === k && f.properties.housenumber) out.push({ numero: f.properties.housenumber, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] });
    } catch {
      // Un numéro qui ne répond pas n'arrête pas la marche.
    }
  }
  return out;
}

const distanceM = (a, b) => Math.hypot((b.lat - a.lat) * 111000, (b.lon - a.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180));

/** Des points tous les PAS_M mètres le long d'une suite de points, pour ne rien rater ni tout redemander. */
export function pasDeMarche(points, pas = PAS_M) {
  if (!points.length) return [];
  // On ordonne le long de l'axe principal de la rue, puis on saute ce qui est trop près du dernier pas.
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const etendueLat = (Math.max(...lats) - Math.min(...lats)) * 111000;
  const etendueLon = (Math.max(...lons) - Math.min(...lons)) * 111000 * Math.cos((lats[0] * Math.PI) / 180);
  const tries = [...points].sort((a, b) => (etendueLat >= etendueLon ? a.lat - b.lat : a.lon - b.lon));
  const out = [];
  for (const p of tries) {
    if (!out.length || distanceM(out[out.length - 1], p) >= pas) out.push(p);
  }
  return out;
}

/**
 * Les commerces d'une rue, tels que Maps les montre, avec vitrine seulement.
 * @param {{nom:string, ville:string, points?:{lat,lon}[], arreter?:Function, journal?:Function}} o
 * @returns {Promise<{commerces: object[], ignores: Record<string,number>, pas: number}>}
 */
export async function commercesDeLaRue({ nom, ville, points = null, arreter = () => false, journal = () => {} }) {
  if (!placesConfigure()) throw new ErreurSource("Google Places n'est pas configuré : GOOGLE_MAPS_SERVEUR manque dans le .env.", { service: 'Google Places', classe: 'definitive' });
  const base = points && points.length ? points : await numerosDeLaRue(nom, ville);
  const pas = pasDeMarche(base);
  const k = cleRue(nom);
  const vus = new Map();
  const ignores = {};
  for (const p of pas) {
    if (arreter()) break;
    let lieux;
    try {
      lieux = await autour(p.lat, p.lon);
    } catch (e) {
      journal(`${nom} : Places n'a pas répondu à un pas (${e.message}).`);
      continue;
    }
    for (const l of lieux) {
      if (vus.has(l.id)) continue;
      const adr = rueDe(String(l.formattedAddress || '').replace(/,\s*France$/, '').replace(/,/g, ' '));
      // Un commerce d'une rue adjacente qui tombe dans le rayon n'est pas de cette rue.
      if (adr.rue && cleRue(adr.rue) !== k) continue;
      if (l.businessStatus && l.businessStatus !== 'OPERATIONAL') { ignores['fermé ou en travaux'] = (ignores['fermé ou en travaux'] || 0) + 1; vus.set(l.id, null); continue; }
      const v = vitrine(l);
      if (!v.oui) { ignores[v.motif] = (ignores[v.motif] || 0) + 1; vus.set(l.id, null); continue; }
      vus.set(l.id, {
        place_id: l.id,
        enseigne: l.displayName?.text || null,
        type: l.primaryType || null,
        types: l.types || [],
        activite: motDuType(l.primaryType, l.types),
        adresse: adr.numero ? `${adr.numero} ${adr.rue}` : adr.rue || l.formattedAddress || null,
        numero: adr.numero,
        rue: adr.rue || joliNomDeRue(nom),
        code_postal: adr.code_postal,
        ville: adr.ville || ville,
        lat: l.location?.latitude ?? null,
        lon: l.location?.longitude ?? null,
        telephone: l.nationalPhoneNumber || null,
        site: l.websiteUri || null,
        source: 'Google Maps',
      });
    }
    await pause(120);
  }
  // Les vitrines numérotées d'abord, dans l'ordre de la rue ; celles dont
  // Maps ne connaît pas le numéro ferment la marche.
  const commerces = [...vus.values()].filter(Boolean).sort((a, b) => (Number(a.numero) || 9999) - (Number(b.numero) || 9999));
  return { commerces, ignores, pas: pas.length };
}
