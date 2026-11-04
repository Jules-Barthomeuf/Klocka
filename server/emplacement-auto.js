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
export function resumeEmplacement({ voies = [], commerces = [], equipements = null, vacance = null, rue = null, voisinsGoogle = [], transportsGoogle = [], voisinsKlocka = null } = {}) {
  const out = {};
  // Les commerces que Klocka connaît autour (CommerceSimple, sans réseau) : un relais quand OpenStreetMap ne répond pas.
  if (voisinsKlocka?.commerces) out.commerces_klocka = voisinsKlocka;
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
export async function lireEmplacement(adresse, { lieu = null, user = null, outils = null, delai = 25000, surComplet = null, commerceId = null } = {}) {
  if (!Number.isFinite(lieu?.lat) || !Number.isFinite(lieu?.lon)) { surComplet?.(null); return {}; }
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
    voisinsKlocka: async () => {
      if (!lieu.code_insee) return null;
      const { Records } = await import('./db.js');
      const { voisinage } = await import('./avis-environnement.js');
      const { marqueDe, indexDesMarques } = await import('./enseignes-autour.js');
      const index = indexDesMarques();
      const commerces = Records.filter('Ville', { code_insee: lieu.code_insee }).flatMap((v) => Records.filter('CommerceSimple', { ville_id: v.id }));
      return voisinage({ lat, lon }, commerces, { exclure: commerceId, marque: (n) => marqueDe(n, index) });
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
  const cles = ['voies', 'commerces', 'equipements', 'vacance', 'voisinsGoogle', 'transportsGoogle', 'voisinsKlocka'];
  // Ce qui est lu à temps sert (3 nov. 2026, Jules : Vacance, Accès et Commerces voisins restaient vides) : on
  // attendait la plus lente des lectures (Overpass, K-Vacance) et l'avis, pressé, partait sans aucune. Au bout de
  // `delai`, on rend ce qui est arrivé ; `surComplet` reçoit le tout quand la dernière lecture finit.
  const lus = Object.fromEntries(cles.map((k) => [k, LISTES.includes(k) ? [] : null]));
  const tout = Promise.all(cles.map((k) => (o[k] ? borne(k) : Promise.resolve(null))
    .catch((err) => { console.warn(`[emplacement] ${k} : ${err?.message || err}`); return null; })
    .then((v) => { lus[k] = v ?? (LISTES.includes(k) ? [] : null); })));
  const resumer = () => resumeEmplacement({ ...lus, rue: lieu.rue || null });
  const fini = await Promise.race([tout.then(() => true), new Promise((ok) => { setTimeout(() => ok(false), Math.max(0, delai)).unref?.(); })]);
  // surComplet(null) : tout était là à temps, rien ne suit.
  if (surComplet) (fini ? Promise.resolve(null) : tout.then(resumer)).then(surComplet).catch((err) => console.warn(`[emplacement] suite : ${err?.message || err}`));
  return resumer();
}

const GENRES_TRANSPORT = [['métro', 'Métro'], ['tramway', 'Tramway'], ['gare', 'Gare'], ['gare routière', 'Gare routière'], ['arrêt de bus', 'Bus'], ['parking', 'Parking']];
const liste = (t, n) => t.filter(Boolean).slice(0, n).join(', ');

/**
 * Pure : les lignes Commerces voisins, Accès et Vacance de l'avis, écrites depuis les lectures seules, sans modèle
 * (3 nov. 2026, Jules : elles restaient vides quand le modèle ne les écrivait pas). Pas d'étiquette de source entre
 * parenthèses ; une rubrique dont rien n'est lu reste absente.
 */
export function lignesDeLEmplacement(lu = {}) {
  const out = {};
  const osm = lu.commerces_150m;
  const klocka = lu.commerces_klocka;
  const nombre = osm?.nombre > 0 ? osm.nombre : klocka?.commerces > 0 ? klocka.commerces : null;
  // Le seul compte (3 nov. 2026, Jules : « juste 98 commerces à 150 m ») : ni métiers, ni enseignes, ni voisins.
  if (nombre) out.commerces_voisins = `${nombre} commerce${nombre > 1 ? 's' : ''} à 150 m`;

  const t = lu.transports_300m;
  const transports = t ? GENRES_TRANSPORT.filter(([k]) => t[k]?.length).map(([k, mot]) => `${mot} ${liste(t[k], 3)}`) : [];
  if (!transports.length && lu.acces_300m) {
    const a = lu.acces_300m;
    transports.push(...[a.metro && 'Métro', a.tram && 'Tramway', a.gare && 'Gare'].filter(Boolean));
    transports.push(...(a.mobilite || []).map((m) => String(m).replace(/^(.*?)\s+(\d+)$/, (_, nom, n) => `${n} ${nom.toLowerCase()}`)).slice(0, 4));
  }
  if (transports.length) out.acces = `${transports.join(' ; ')}, à moins de 300 m.`;

  const v = Number(lu.vacance?.taux_estime);
  if (lu.vacance?.taux_estime != null && Number.isFinite(v)) out.vacance = `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % (taux estimé)`;
  return out;
}
