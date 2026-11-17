// La rue de l'adresse dite pendant l'appel (17 nov. 2026, Jules : « je dis 20 rue de la République à Antibes, ça va
// directement en Street View dans la rue ; au-dessus, l'adresse ; rien d'autre »). L'écran d'appel lit l'adresse dite
// (src/lib/adresse-dite.js) ; ici, la Base Adresse Nationale la place, et la caméra se pose sur la chaussée la plus
// proche, tournée vers le local.
//
// La ville : celle dite après la rue (« à Lyon », même tapée en minuscules), vérifiée sur la réponse de la BAN ; sinon
// celle de l'agence ; en dernier recours la meilleure réponse de la BAN, l'adresse retenue s'affichant au-dessus de la rue.
//
// Le Street View passe par l'intégration publique de Google Maps (output=svembed), sans notre clé : notre projet Google
// Cloud est coupé depuis le 12 nov., l'intégration publique ne l'utilise pas.

import { boiteDe } from '../kzoning-insee.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const GARDE_MS = 60 * 60000;
const GARDES = new Map();

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Pure : la ville de la réponse se retrouve-t-elle dans ce qui a été dit (« à lyon », « Lyon 2e », « 69002 ») ? */
export function villeDite(adresse, dit) {
  const d = ` ${sansAccents(dit)} `;
  const v = sansAccents(adresse?.ville);
  if (v && (d.includes(` ${v} `) || d.includes(` ${v.split(' ')[0]} `))) return true;
  return !!adresse?.code_postal && d.includes(` ${adresse.code_postal} `);
}

/** Pure : le point le plus proche d'une ligne (LineString ou MultiLineString), approximation plane. */
export function pointLePlusProche(point, g) {
  const lignes = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
  const kx = 111320 * Math.cos((point.lat * Math.PI) / 180); const ky = 110540;
  let mieux = null;
  for (const l of lignes) {
    for (let i = 1; i < l.length; i += 1) {
      const ax = (l[i - 1][0] - point.lon) * kx; const ay = (l[i - 1][1] - point.lat) * ky;
      const bx = (l[i][0] - point.lon) * kx; const by = (l[i][1] - point.lat) * ky;
      const dx = bx - ax; const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
      const x = ax + t * dx; const y = ay + t * dy;
      const d = Math.hypot(x, y);
      if (!mieux || d < mieux.d) mieux = { d, lon: point.lon + x / kx, lat: point.lat + y / ky };
    }
  }
  return mieux ? { lat: mieux.lat, lon: mieux.lon, distance_m: Math.round(mieux.d) } : null;
}

/** Pure : le cap (0 = nord, 90 = est) d'un point vers un autre. */
export function cap(de, vers) {
  const kx = Math.cos((de.lat * Math.PI) / 180);
  const a = (Math.atan2((vers.lon - de.lon) * kx, vers.lat - de.lat) * 180) / Math.PI;
  return Math.round((a + 360) % 360);
}

/** Pure : l'adresse de Street View, la caméra posée sur la chaussée, tournée vers le local. */
export function urlStreetView({ lat, lon }, cap_ = 0) {
  return `https://maps.google.com/maps?layer=c&cbll=${lat.toFixed(6)},${lon.toFixed(6)}&cbp=11,${cap_},0,0,0&output=svembed`;
}

async function troncons(point) {
  const b = boiteDe(point.lat, point.lon, 60);
  const p = new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'BDTOPO_V3:troncon_de_route', OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '100', BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326` });
  const r = await fetch(`${WFS}?${p}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Géoplateforme ${r.status}`);
  return (await r.json()).features || [];
}

/**
 * La rue d'une adresse dite. `ville` : la ville dite juste après ; `suite` : les mots qui suivaient la rue (la ville s'y
 * cherche même en minuscules) ; `agence` : la ville de l'agence, à défaut.
 * @returns {Promise<{ok: true, adresse, point, camera, cap, url, ville_de: string} | {ok: false, error: string}>}
 */
export async function lieuDeLAdresse(texte, { ville = null, suite = null, agence = null } = {}) {
  const t = String(texte || '').trim();
  if (t.length < 4) return { ok: false, error: 'Adresse vide.' };
  const cle = sansAccents([t, ville, suite, agence].join('|'));
  const garde = GARDES.get(cle);
  if (garde && Date.now() - garde.le < GARDE_MS) return garde.lieu;
  const { resoudreAdresse } = await import('../adresse-ban.js');
  const essayer = (q) => resoudreAdresse(q).catch(() => null);
  // Dans l'ordre : la ville dite, les mots dits après la rue (vérifiés sur la réponse), la ville de l'agence.
  let adr = null; let villeDe = null;
  if (ville) { const r = await essayer(`${t} ${ville}`); if (r && villeDite(r, ville)) { adr = r; villeDe = 'dite'; } }
  if (!adr && suite) { const r = await essayer(`${t} ${suite}`); if (r && villeDite(r, suite)) { adr = r; villeDe = 'dite'; } }
  if (!adr && agence) { const r = await essayer(`${t} ${agence}`); if (r && villeDite(r, agence)) { adr = r; villeDe = 'agence'; } }
  if (!adr) { adr = await essayer(t); villeDe = adr ? 'devinee' : null; }
  if (!adr) return { ok: false, error: `Je ne trouve pas « ${t}${ville ? `, ${ville}` : ''} ».` };
  const point = { lat: adr.lat, lon: adr.lon };
  // La caméra sur la chaussée de la même rue, tournée vers le local ; sans tronçon, au point de l'adresse.
  let camera = null;
  try {
    const { choisirTroncon } = await import('../socle/local.js');
    const fs = await troncons(point);
    const tr = choisirTroncon(fs, point, adr.rue);
    const f = tr ? fs.find((x) => x.properties?.cleabs === tr.cleabs) : null;
    camera = f ? pointLePlusProche(point, f.geometry) : null;
  } catch { camera = null; }
  const regard = camera && camera.distance_m >= 2 ? cap(camera, point) : 0;
  const lieu = {
    ok: true,
    adresse: { label: adr.label, numero: adr.numero || null, rue: adr.rue || null, code_postal: adr.code_postal || null, ville: adr.ville || null },
    point,
    camera: camera ? { lat: camera.lat, lon: camera.lon } : point,
    cap: regard,
    url: urlStreetView(camera || point, regard),
    ville_de: villeDe,
  };
  if (GARDES.size > 500) GARDES.clear();
  GARDES.set(cle, { le: Date.now(), lieu });
  return lieu;
}
