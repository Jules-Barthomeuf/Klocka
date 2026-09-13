// Street View, côté serveur : la photo d'une devanture, sa date, et sa lecture.
//
// Le modèle lit une façade comme une personne le ferait : l'enseigne, le type
// d'activité, l'état apparent, une terrasse. Il propose, l'équipe valide. La
// date de prise de vue est toujours affichée : une image de 2019 montre une
// enseigne disparue.
//
// La clé est GOOGLE_MAPS_SERVEUR, distincte de la clé du navigateur : elle ne
// quitte jamais le serveur et n'ouvre que l'API Street View Static.

import { ErreurSource } from '../marche/erreurs.js';
import { generateFromDocument } from '../llm.js';

const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
export const streetViewConfigure = () => !!cle();

const META = 'https://maps.googleapis.com/maps/api/streetview/metadata';
const IMAGE = 'https://maps.googleapis.com/maps/api/streetview';

const bearing = (a, b) => {
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const l1 = (a.lat * Math.PI) / 180, l2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dLon);
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
};
const metres = (a, b) => Math.hypot((b.lat - a.lat) * 111000, (b.lon - a.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180));
const pointDe = (texte) => { const m = String(texte || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null; };

async function unePrise(params) {
  const r = await fetch(`${META}?${new URLSearchParams({ ...params, key: cle() })}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new ErreurSource(`Street View a répondu ${r.status}.`, { service: 'Street View', statut: r.status });
  const m = await r.json();
  if (m.status !== 'OK') return null;
  return { date: m.date || null, pano: m.pano_id || null, lat: m.location?.lat ?? null, lon: m.location?.lng ?? null, google: /google/i.test(m.copyright || '') };
}

/**
 * La prise de vue disponible pour une adresse ou un point « lat,lon », ou
 * null s'il n'y en a pas. Pour un point, on cherche l'imagerie de Google
 * elle-même : la photo-sphère d'un particulier, souvent posée à côté, passe
 * avant elle par défaut et montre autre chose que la façade. On sonde donc
 * le point et ses alentours, et on garde la prise Google la plus proche ;
 * le cap vers le commerce vient avec.
 */
export async function metadonnees(adresse) {
  if (!cle()) throw new ErreurSource("Street View n'est pas configuré : ajoutez GOOGLE_MAPS_SERVEUR dans le .env.", { service: 'Street View', classe: 'definitive' });
  const point = pointDe(adresse);
  if (!point) return unePrise({ location: adresse });
  const decalages = [[0, 0], [15, 0], [-15, 0], [0, 15], [0, -15], [30, 0], [-30, 0], [0, 30], [0, -30]];
  const vues = new Map();
  let secours = null;
  for (const [dn, de] of decalages) {
    const la = point.lat + dn / 111000;
    const lo = point.lon + de / (111000 * Math.cos((point.lat * Math.PI) / 180));
    const m = await unePrise({ location: `${la},${lo}`, radius: '25', source: 'outdoor' });
    if (!m) continue;
    if (!m.google) { secours = secours || m; continue; }
    if (!vues.has(m.pano)) vues.set(m.pano, m);
  }
  const google = [...vues.values()].sort((a, b) => metres(point, a) - metres(point, b))[0] || null;
  const m = google || secours;
  return m ? { ...m, cap: bearing(m, point) } : null;
}

/** L'image elle-même, en JPEG : d'un panorama précis avec son cap, ou d'une adresse. */
export async function photo(adresse, { largeur = 800, hauteur = 500, pano = null, cap = null } = {}) {
  if (!cle()) throw new ErreurSource("Street View n'est pas configuré.", { service: 'Street View', classe: 'definitive' });
  const params = pano ? { pano, heading: String(cap ?? 0) } : { location: adresse };
  const r = await fetch(`${IMAGE}?${new URLSearchParams({ ...params, size: `${largeur}x${hauteur}`, fov: '80', key: cle() })}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new ErreurSource(`Street View a répondu ${r.status}.`, { service: 'Street View', statut: r.status });
  return Buffer.from(await r.arrayBuffer());
}

const CONSIGNE = `Tu regardes la photo d'une devanture de commerce en France, prise depuis la rue.
Réponds en JSON strict, sans commentaire, avec ces clés :
- "enseigne" : le nom lisible sur la façade, ou null
- "activite" : le type de commerce en deux ou trois mots (boulangerie, opticien, agence immobilière, restaurant, banque, pharmacie, vêtements, bar, vide), ou null
- "etat" : "soigne", "correct" ou "degrade"
- "terrasse" : true ou false
- "vitrine_m" : ta meilleure estimation de la largeur de vitrine sur la rue principale, en mètres, entier, ou null
- "angle" : true si le commerce fait l'angle de deux rues (la vitrine tourne le coin), sinon false
- "retour_m" : si angle, la largeur de vitrine sur la seconde rue, en mètres, entier ; sinon 0
- "occupe" : false si le local paraît vide (rideau baissé, vitrine vide, « à louer »), sinon true
- "confiance" : "haute", "moyenne" ou "basse"
Ne devine pas ce que tu ne vois pas : null vaut mieux qu'une invention.`;

/** La lecture d'une devanture par le modèle. */
export async function lireDevanture(adresse) {
  const meta = await metadonnees(adresse);
  if (!meta) return { ok: false, error: 'Aucune photo Street View à cette adresse.' };
  const buffer = await photo(adresse, { pano: meta.pano, cap: meta.cap });
  const brut = await generateFromDocument({ buffer, mimetype: 'image/jpeg', prompt: CONSIGNE, nom: `devanture-${adresse}` });
  let lecture = null;
  try {
    const texte = typeof brut === 'string' ? brut : brut?.text || brut?.texte || JSON.stringify(brut);
    lecture = JSON.parse(texte.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
  } catch {
    lecture = { confiance: 'basse', brut: String(brut).slice(0, 400) };
  }
  return {
    ok: true,
    photo: {
      date: meta.date,
      pano: meta.pano,
      cap: meta.cap ?? null,
      google: meta.google ?? null,
      lat: meta.lat,
      lon: meta.lon,
      lecture,
      lue_le: new Date().toISOString(),
      validee_par: null,
      validee_le: null,
    },
  };
}
