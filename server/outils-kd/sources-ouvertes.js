// Les sources ouvertes du lot 8 (18 oct. 2026, K-Zoning et K-Expertise) : risques, urbanisme, gares et
// arrêts. Chacune passe par l'interrupteur de sa source (registre) et se garde ; une source coupée ou en panne
// rend « rien », jamais une erreur. Endpoints vérifiés le 18 oct. 2026 sur un point de Cannes.
//
//   - Géorisques : georisques.gouv.fr/api/v1/gaspar/risques?code_insee= (risques connus de la commune) ;
//   - Géoportail de l'urbanisme (API Carto) : apicarto.ign.fr/api/gpu/zone-urba, prescription-surf,
//     prescription-lin (zonage du PLU, prescriptions, dont les linéaires commerciaux protégés) ;
//   - SNCF : ressources.data.sncf.com, jeux « gares-de-voyageurs » (position) et « frequentation-gares »
//     (voyageurs par an, jusqu'en 2024), rapprochés par le code UIC ;
//   - OpenStreetMap (Overpass) : arrêts de bus, de tram, de métro, autour d'un point.

import { Records, Meta } from '../db.js';
import { viaSource } from '../socle/registre-sources.js';

const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const json = async (url, ms = 30000) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
};
const garde = (entite, cle, jours) => {
  const x = Records.filter(entite, { cle })[0];
  return x && Date.now() - Date.parse(x.le) < jours * 86400000 ? x.valeur : undefined;
};
const garder = (entite, cle, valeur) => {
  const x = Records.filter(entite, { cle })[0];
  const v = { cle, valeur, le: new Date().toISOString() };
  return x ? Records.update(entite, x.id, v) : Records.create(entite, v);
};

// --- Géorisques ------------------------------------------------------------------------------------

/** Pure : les risques de la commune, rangés : ceux qui pèsent sur un commerce en tête. */
export function rangerRisques(details = []) {
  const libelles = details.map((d) => d.libelle_risque_long).filter(Boolean);
  const lourds = libelles.filter((l) => /inondation|submersion|crue|mouvement de terrain|glissement|effondrement|retrait|argile|s[ée]isme|feu de for[êe]t|industriel|marchandises dangereuses|rupture de barrage/i.test(l));
  return { lourds, autres: libelles.filter((l) => !lourds.includes(l)), n: libelles.length };
}

export async function risquesDeCommune(codeInsee) {
  if (!codeInsee) return null;
  const deja = garde('CacheGeorisques', codeInsee, 90);
  if (deja !== undefined) return deja;
  const r = await viaSource('georisques', async () => {
    const d = await json(`https://georisques.gouv.fr/api/v1/gaspar/risques?code_insee=${encodeURIComponent(codeInsee)}`);
    return { ...rangerRisques(d.data?.[0]?.risques_detail || []), commune: d.data?.[0]?.libelle_commune || null, source: 'Géorisques', le: new Date().toISOString() };
  });
  if (r.ok) garder('CacheGeorisques', codeInsee, r.valeur);
  return r.valeur;
}

// --- Urbanisme (GPU) -------------------------------------------------------------------------------

const RE_LINEAIRE_COMMERCIAL = /commerc|diversit[ée] commerciale|lin[ée]aire|rez-de-chauss[ée]e actif|artisanat/i;

/** Pure : ce qui compte du PLU pour un commerce : la zone, et un linéaire commercial protégé s'il y en a un. */
export function lireUrbanisme({ zones = [], surfaces = [], lineaires = [] }) {
  const z = zones[0]?.properties || null;
  const prescriptions = [...surfaces, ...lineaires].map((f) => f.properties || {}).map((p) => ({ libelle: p.libelle || null, type: p.typepsc || null, txt: p.txt || null }));
  const protege = prescriptions.filter((p) => RE_LINEAIRE_COMMERCIAL.test(`${p.libelle || ''} ${p.txt || ''}`));
  return {
    zone: z ? { code: z.libelle || null, libelle: z.libelong || null, type: z.typezone || null, document: z.idurba || null, reglement: z.urlfic && z.nomfic ? `${z.urlfic}${z.nomfic}` : null } : null,
    lineaire_commercial: protege.length > 0,
    prescriptions: prescriptions.slice(0, 12),
  };
}

export async function urbanismeAuPoint(point) {
  if (!point?.lat) return null;
  const cle = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`;
  const deja = garde('CacheUrbanisme', cle, 30);
  if (deja !== undefined) return deja;
  const g = encodeURIComponent(JSON.stringify({ type: 'Point', coordinates: [point.lon, point.lat] }));
  const r = await viaSource('gpu', async () => {
    const [zones, surfaces, lineaires] = await Promise.all(['zone-urba', 'prescription-surf', 'prescription-lin'].map((e) => json(`https://apicarto.ign.fr/api/gpu/${e}?geom=${g}`).then((d) => d.features || []).catch(() => [])));
    return { ...lireUrbanisme({ zones, surfaces, lineaires }), source: "Géoportail de l'urbanisme", le: new Date().toISOString() };
  });
  if (r.ok) garder('CacheUrbanisme', cle, r.valeur);
  return r.valeur;
}

// --- Gares SNCF ------------------------------------------------------------------------------------

const CLE_GARES = 'kd.gares-sncf';

/** Pure : les gares avec leur fréquentation, rapprochées par le code UIC (8 chiffres). */
export function rapprocherGares(positions = [], frequentations = []) {
  const parUic = new Map(frequentations.map((f) => [String(f.code_uic_complet || '').slice(-8), f]));
  return positions
    .filter((g) => g.position_geographique?.lat != null)
    .map((g) => {
      const f = parUic.get(String(g.codes_uic || '').split(/[;,\s]/)[0].slice(-8));
      return { nom: g.nom, lat: g.position_geographique.lat, lon: g.position_geographique.lon, code_insee: g.codeinsee || null, voyageurs: f?.total_voyageurs_2024 ?? null, annee: f?.total_voyageurs_2024 != null ? 2024 : null, segment: g.segment_drg || null };
    });
}

async function toutesLesGares() {
  try { const g = JSON.parse(Meta.get(CLE_GARES) || 'null'); if (g && Date.now() - Date.parse(g.le) < 30 * 86400000) return g.gares; } catch { /* relire */ }
  const lirePages = async (jeu, champs) => {
    const tout = [];
    for (let offset = 0; offset < 4000; offset += 100) {
      const d = await json(`https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/${jeu}/records?limit=100&offset=${offset}&select=${champs}`);
      tout.push(...(d.results || []));
      if ((d.results || []).length < 100) break;
    }
    return tout;
  };
  const [positions, frequentations] = await Promise.all([
    lirePages('gares-de-voyageurs', 'nom,position_geographique,codeinsee,codes_uic,segment_drg'),
    lirePages('frequentation-gares', 'code_uic_complet,total_voyageurs_2024'),
  ]);
  const gares = rapprocherGares(positions, frequentations);
  Meta.set(CLE_GARES, JSON.stringify({ le: new Date().toISOString(), gares }));
  return gares;
}

const metres = (a, b) => {
  const R = 6371000; const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

/** Les gares à moins de `rayon` mètres, avec leurs voyageurs par an, la plus proche d'abord. */
export async function garesAutour(point, rayon = 1500) {
  const r = await viaSource('sncf_gares', async () => (await toutesLesGares())
    .map((g) => ({ ...g, distance_m: metres(point, g) }))
    .filter((g) => g.distance_m <= rayon)
    .sort((a, b) => a.distance_m - b.distance_m), []);
  return r.valeur || [];
}

// --- Arrêts de transport (OpenStreetMap) -----------------------------------------------------------

/** Les arrêts de bus, de tram et de métro à moins de `rayon` mètres (OpenStreetMap, Overpass). */
export async function arretsAutour(point, rayon = 300) {
  const cle = `${point.lat.toFixed(4)},${point.lon.toFixed(4)},${rayon}`;
  const deja = garde('CacheArrets', cle, 14);
  if (deja !== undefined) return deja;
  const r = await viaSource('osm', async () => {
    const { interroger } = await import('../kzoning-commerces.js');
    const a = `around:${rayon},${point.lat},${point.lon}`;
    const d = await interroger(`[out:json][timeout:60];(node[highway=bus_stop](${a});node[railway=tram_stop](${a});node[station=subway](${a});node[railway=station](${a});node[public_transport=platform](${a}););out tags center;`);
    const vus = new Set();
    const arrets = [];
    for (const e of d.elements || []) {
      const t = e.tags || {};
      const genre = t.railway === 'tram_stop' ? 'tram' : t.station === 'subway' ? 'metro' : t.railway === 'station' ? 'train' : 'bus';
      const nom = t.name || null;
      const k = `${genre}:${nom || e.id}`;
      if (vus.has(k)) continue;
      vus.add(k);
      arrets.push({ genre, nom, distance_m: metres(point, { lat: e.lat, lon: e.lon }) });
    }
    return arrets.sort((x, y) => x.distance_m - y.distance_m);
  }, []);
  if (r.ok) garder('CacheArrets', cle, r.valeur);
  return r.valeur || [];
}
