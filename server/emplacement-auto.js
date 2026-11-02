// L'emplacement d'un local lu depuis sa seule adresse (1er nov. 2026, Jules : « la page emplacement et commercialité
// remplie automatiquement, puisqu'on n'a besoin que de l'adresse »). Pour l'avis de valeur, sans rien demander :
//  - les vingt commerces les plus proches, et les transports et parkings à 300 m (Google Places) : la source qui
//    répond toujours, en un quart de seconde ;
//  - la voie (piétonne, axe), le compte des commerces à 150 m et les locaux vides relevés (OpenStreetMap), quand
//    Overpass, service bénévole souvent saturé, répond à temps ;
//  - la vacance de la rue comparée à la commune (K-Vacance : locaux vides relevés, registre SIRENE).
// Chaque lecture a vingt-cinq secondes ; ce qui manque reste à compléter, le reste sert.

const TYPES_VOIE = {
  pedestrian: 'rue piétonne', living_street: 'zone de rencontre', primary: 'axe principal', trunk: 'axe principal',
  secondary: 'axe secondaire', tertiary: 'rue de desserte', residential: 'rue résidentielle', unclassified: 'petite rue', service: 'voie de service',
};
const RESTAURATION = new Set(['restaurant', 'cafe', 'bar', 'fast_food', 'pub']);

const TRANSPORTS = { subway_station: 'métro', light_rail_station: 'tramway', train_station: 'gare', bus_station: 'gare routière', bus_stop: 'arrêt de bus', transit_station: 'arrêt de bus', parking: 'parking', parking_lot: 'parking', parking_garage: 'parking' };
const RESTAURATION_GOOGLE = /restaurant|cafe|bar|bakery|meal_|food|coffee|sandwich|pizza|brasserie/;

/** Pure : les lieux Google en noms et types lisibles, sans doublon. */
export function lieuxGoogle(places = []) {
  return (places || []).map((p) => ({ nom: p.displayName?.text || null, type: p.primaryType || null }))
    .filter((l, i, t) => l.nom && t.findIndex((x) => x.nom === l.nom && x.type === l.type) === i);
}

/** Pure : ce que l'avis retient des lectures, compact et sourcé. */
export function resumeEmplacement({ voies = [], commerces = [], equipements = null, vacance = null, rue = null, voisinsGoogle = [], transportsGoogle = [] } = {}) {
  const out = {};
  if (voisinsGoogle.length) {
    out.voisins_les_plus_proches = {
      noms: voisinsGoogle.map((l) => `${l.nom}${l.type ? ` (${l.type})` : ''}`),
      restauration: voisinsGoogle.filter((l) => RESTAURATION_GOOGLE.test(l.type || '')).length,
      source: 'Google Maps',
    };
  }
  if (transportsGoogle.length) {
    const par = {};
    for (const l of transportsGoogle) { const k = TRANSPORTS[l.type]; if (k) (par[k] ||= new Set()).add(l.nom); }
    out.transports_300m = { ...Object.fromEntries(Object.entries(par).map(([k, v]) => [k, [...v].slice(0, 6)])), source: 'Google Maps' };
  }
  // La voie du local : celle qui porte le nom de la rue de l'adresse, sinon la plus proche.
  const nr = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const voie = voies.find((v) => rue && v.nom && nr(rue).includes(nr(v.nom).replace(/^(rue|avenue|boulevard|place|cours|quai) /, ''))) || voies[0] || null;
  if (voie?.type && TYPES_VOIE[voie.type]) out.voie = { nom: voie.nom || rue || null, type: TYPES_VOIE[voie.type], source: 'OpenStreetMap' };
  const ouverts = commerces.filter((c) => !c.vacant);
  if (commerces.length) {
    const metiers = new Map();
    for (const c of ouverts) if (c.genre) metiers.set(c.genre, (metiers.get(c.genre) || 0) + 1);
    const enseignes = [...new Set(ouverts.map((c) => c.enseigne).filter(Boolean))].slice(0, 12);
    out.commerces_150m = {
      nombre: ouverts.length, vides_releves: commerces.length - ouverts.length,
      restauration: ouverts.filter((c) => RESTAURATION.has(c.genre)).length,
      metiers: [...metiers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, n]) => `${g} ${n}`),
      enseignes, plus_proches: ouverts.slice(0, 8).map((c) => [c.nom, c.genre, c.distance_m != null ? `${c.distance_m} m` : null].filter(Boolean).join(' · ')),
      source: 'OpenStreetMap',
    };
  }
  if (equipements) {
    out.acces_300m = {
      metro: !!equipements.metro, tram: !!equipements.tram, gare: !!equipements.gare,
      mobilite: (equipements.mobilite || []).slice(0, 8).map((m) => `${m.nom} ${m.nombre}`),
      source: 'OpenStreetMap',
    };
  }
  if (vacance) out.vacance = { ...vacance, source: 'K-Vacance (locaux vides relevés, registre SIRENE)' };
  return out;
}

/** Pure : les voies d'une réponse Overpass, la plus proche d'abord (l'ordre d'Overpass suffit). */
export function voiesDe(elements = []) {
  return (elements || []).filter((e) => e.tags?.highway).map((e) => ({ nom: e.tags.name || null, type: e.tags.highway }))
    .filter((v, i, t) => t.findIndex((x) => x.nom === v.nom && x.type === v.type) === i);
}

/**
 * L'emplacement d'une adresse, lu en parallèle. `lieu` : l'adresse déjà résolue (BAN), avec lat, lon, rue.
 * Rend {} sans position. `outils` remplace les lectures dans les tests.
 */
export async function lireEmplacement(adresse, { lieu = null, user = null, outils = null } = {}) {
  if (!Number.isFinite(lieu?.lat) || !Number.isFinite(lieu?.lon)) return {};
  const { lat, lon } = lieu;
  const google = async (includedTypes, rayon) => {
    const k = (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
    if (!k) return [];
    const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      // Les noms et les types seulement (SKU Nearby Search Pro) : ni avis, ni horaires, ni photos.
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'places.displayName,places.primaryType' },
      body: JSON.stringify({ includedTypes, maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'fr', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: rayon } } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Google Places a répondu ${r.status}`);
    return lieuxGoogle((await r.json()).places);
  };
  const o = outils || {
    voisinsGoogle: () => google(['store', 'restaurant', 'cafe', 'bar', 'bakery', 'bank', 'pharmacy', 'beauty_salon', 'hair_care'], 150),
    transportsGoogle: () => google(['subway_station', 'light_rail_station', 'train_station', 'bus_station', 'transit_station', 'bus_stop', 'parking'], 300),
    voies: async () => {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'user-agent': 'Klocka/1.0 (sourcing@klocka.immo)', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: `[out:json][timeout:10];way(around:25,${lat},${lon})[highway];out tags 10;` }).toString(),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`Overpass a répondu ${r.status}`);
      return voiesDe((await r.json()).elements);
    },
    commerces: async () => {
      const { commercesDeLaZone } = await import('./kzoning-commerces.js');
      const r = await commercesDeLaZone({ lat, lon, rayon_m: 150, filtres: [{ cle: 'shop', valeurs: [] }, { cle: 'amenity', valeurs: [...RESTAURATION, 'bank', 'pharmacy'] }] });
      return r.ok ? r.commerces : [];
    },
    equipements: async () => {
      const { equipementsDeLaZone } = await import('./kzoning-commerces.js');
      const r = await equipementsDeLaZone({ lat, lon, rayon_m: 300 });
      return r.ok ? r.equipements : null;
    },
    vacance: async () => {
      const { analyser } = await import('./kvacance.js');
      const r = await analyser(String(adresse || ''), { user });
      if (!r || r.ok === false) return null;
      // Le verdict et ses appuis en phrases, les taux : pas les points de chaque local (des dizaines de Ko).
      const v = r.verdict || {};
      // Un seul chiffre dans l'avis (1er nov. 2026, Jules : « juste x % (taux estimé) ») : celui de la rue au registre
      // quand K-Vacance le porte, sinon celui des devantures relevées.
      const taux = Number.isFinite(v.face_ville?.zone) ? v.face_ville.zone : Number.isFinite(r.vacance?.taux) ? r.vacance.taux : null;
      return { taux_estime: taux };
    },
  };
  // Chaque lecture a 25 secondes : passé ce délai, l'avis se rédige sans elle.
  const borne = (k) => Promise.race([o[k](), new Promise((_, non) => setTimeout(() => non(new Error("trop long")), 25000).unref?.())]);
  const LISTES = ['voies', 'commerces', 'voisinsGoogle', 'transportsGoogle'];
  const cles = ['voies', 'commerces', 'equipements', 'vacance', 'voisinsGoogle', 'transportsGoogle'];
  const lus = await Promise.all(cles.map((k) => (o[k] ? borne(k) : Promise.resolve(null))
    .catch((err) => { console.warn(`[emplacement] ${k} : ${err?.message || err}`); return null; })
    .then((v) => v ?? (LISTES.includes(k) ? [] : null))));
  return resumeEmplacement({ ...Object.fromEntries(cles.map((k, i) => [k, lus[i]])), rue: lieu.rue || null });
}
