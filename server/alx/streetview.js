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

/**
 * Une seule sonde, pour les appelants qui ne peuvent pas attendre.
 *
 * `metadonnees` interroge neuf positions autour du point pour écarter les
 * photo-sphères de particuliers : c'est ce qu'il faut pour lire une devanture,
 * mais cela fait neuf allers-retours par commerce. Une page publique qui en
 * affiche six n'a pas ce budget. Ici, une requête, et on écarte quand même ce
 * qui n'est pas de l'imagerie Google : mieux vaut pas de panorama du tout que
 * l'intérieur d'un restaurant à la place de sa façade.
 *
 * Rend `{ pano, cap, date, lat, lon }` ou null. Les métadonnées Street View
 * sont gratuites et ne consomment aucun quota.
 */
export async function priseProche(lat, lon, { rayon = 50 } = {}) {
  if (!cle() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const m = await unePrise({ location: `${lat},${lon}`, radius: String(rayon), source: 'outdoor' });
  if (!m || !m.google || m.lat == null || m.lon == null) return null;
  return { ...m, cap: bearing(m, { lat, lon }) };
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

// --- Le panorama d'une adresse, dans sa rue ------------------------------------------
//
// L'Embed de Street View, sur un point, se cale sur le panorama le plus
// proche : souvent celui de la rue voisine, quand la voiture de Google est
// passée à l'angle (« 1 rue du Nord » ouvrait sur la rue du Havre). On sonde
// donc les panoramas Google autour du point, on demande à la Base Adresse
// Nationale dans quelle rue est chacun, et on garde le plus proche de la
// bonne rue ; à défaut, le plus proche tout court.

const normRue = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\b(rue|avenue|av|boulevard|bd|place|pl|quai|chemin|allee|impasse|cours|route|square|passage|du|de|des|la|le|les|l|d)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Pure : la rue d'un résultat est-elle celle écrite dans l'adresse ? Tolère
 * la suite de l'adresse collée à la rue (« rue du Nord Lille »).
 */
export function rueCorrespond(ecrite, rue) {
  const x = normRue(ecrite);
  const y = normRue(rue);
  return !!x && !!y && (x === y || x.startsWith(`${y} `));
}

/** Pure : deux noms de rue désignent-ils la même voie ? */
export function memeRue(a, b) {
  const x = normRue(a);
  const y = normRue(b);
  return !!x && !!y && x === y;
}

/**
 * Pure : parmi les panoramas candidats (chacun avec sa rue, quand on la
 * connaît), le plus proche du point qui est dans la bonne rue, sinon le plus
 * proche. Rend aussi le cap vers le point.
 */
export function choisirPanorama(candidats, point, rue) {
  const tries = [...candidats].sort((a, b) => metres(point, a) - metres(point, b));
  const bon = (rue && tries.find((c) => memeRue(c.rue, rue))) || tries[0] || null;
  return bon ? { ...bon, cap: bearing(bon, point), meme_rue: !!rue && memeRue(bon.rue, rue) } : null;
}

/** Un appel à la BAN, avec un second essai : elle répond parfois 429 ou tarde quand on l'interroge en rafale. */
async function banJson(url) {
  for (let essai = 0; essai < 2; essai += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) return null;
    } catch { /* on réessaie une fois */ }
    await new Promise((f) => setTimeout(f, 400));
  }
  return null;
}

async function rueDe(lat, lon) {
  const f = (await banJson(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}&limit=1`))?.features?.[0];
  return f?.properties?.street || f?.properties?.name || null;
}

/** La rue d'une adresse en texte selon la BAN, si elle tombe à moins de 300 m du point. */
async function rueDuTexte(texte, point) {
  // Le texte entier, puis sa première partie (« 1 rue du Nord ») : la ville
  // ajoutée au texte est parfois l'enseigne du titre.
  const essais = [...new Set([texte, String(texte).split(',')[0]].map((x) => x.trim()).filter(Boolean))];
  for (const q of essais) {
    const d = await banJson(`https://api-adresse.data.gouv.fr/search/?limit=5&q=${encodeURIComponent(q)}&lat=${point.lat}&lon=${point.lon}`);
    const f = (d?.features || []).find((x) => ['housenumber', 'street'].includes(x.properties?.type)
      && metres(point, { lat: x.geometry.coordinates[1], lon: x.geometry.coordinates[0] }) <= 300);
    if (f) return f.properties?.street || f.properties?.name || null;
  }
  return null;
}

/**
 * Pure : la rue écrite dans l'adresse (« 1 bis rue du Nord, Lille » → « rue du
 * Nord »), sans réseau. Null si le début de l'adresse ne ressemble pas à une
 * voie.
 */
export function rueEcrite(texte) {
  const debut = String(texte || '').split(/[,\n]|\s+\d{5}\b/)[0].trim().replace(/^\d+\s*(bis|ter|quater|[a-z])?\b\s*/i, '').trim();
  return /^(rue|avenue|av\.?|boulevard|bd\.?|place|pl\.?|quai|chemin|all[ée]e|impasse|cours|route|square|passage|promenade|esplanade|faubourg|sentier|voie)\b/i.test(debut) ? debut : null;
}

const memoire = new Map();

/** Le panorama Google à ouvrir pour une adresse : `{ pano, cap, lat, lon, meme_rue }`, ou null. */
export async function panoramaDeLaRue({ lat, lon, rue = null }) {
  if (!cle() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cleMemoire = `${lat.toFixed(6)},${lon.toFixed(6)},${normRue(rue)}`;
  if (memoire.has(cleMemoire)) return memoire.get(cleMemoire);
  const point = { lat, lon };
  // Huit directions, à 0, 15, 30 et 45 m : de quoi trouver la bonne rue sans
  // traverser le quartier.
  const sondes = [[0, 0]];
  for (const d of [15, 30, 45]) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]]) sondes.push([a * d, b * d]);
  const vus = new Map();
  await Promise.all(sondes.map(async ([dn, de]) => {
    const la = lat + dn / 111000;
    const lo = lon + de / (111000 * Math.cos((lat * Math.PI) / 180));
    try {
      const m = await unePrise({ location: `${la},${lo}`, radius: '20', source: 'outdoor' });
      if (m?.google && m.pano && m.lat != null && !vus.has(m.pano)) vus.set(m.pano, m);
    } catch { /* une sonde muette n'empêche pas les autres */ }
  }));
  // La rue des six plus proches seulement : la BAN est gratuite, pas infinie.
  const proches = [...vus.values()].sort((a, b) => metres(point, a) - metres(point, b)).slice(0, 6);
  const candidats = await Promise.all(proches.map(async (c) => ({ ...c, rue: rue ? await rueDe(c.lat, c.lon) : null })));
  const choix = choisirPanorama(candidats, point, rue);
  if (memoire.size > 500) memoire.clear();
  memoire.set(cleMemoire, choix);
  return choix;
}

// --- Le point et le panorama d'une adresse ------------------------------------------
//
// La carte de la page projet (Maps Embed, mode « place ») cherche l'adresse
// avec la recherche de lieux de Google. Street View partait d'un autre
// géocodage, et retombait sur les coordonnées enregistrées du dossier (le
// centre de la commune, ou pire) : « 1 rue du Nord » s'ouvrait rue du Havre,
// à 3 km. Ici, deux sources se recoupent : la Base Adresse Nationale (sans
// clé, précise au numéro) et la recherche de lieux de Google (avec la clé
// serveur, quand elle est posée). On garde le point le plus sûr, et la rue
// qui va avec : Street View y choisit ensuite son panorama.

const LIEU = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json';
const BAN = 'https://api-adresse.data.gouv.fr/search/';
const lieux = new Map();
const normTexte = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Le point d'une adresse selon la recherche de lieux de Google : `{ lat, lon, adresse }`, ou null (sans clé aussi). */
export async function pointDuLieu(texte) {
  const t = String(texte || '').trim();
  if (!cle() || !t) return null;
  if (lieux.has(t)) return lieux.get(t);
  let point = null;
  try {
    const params = new URLSearchParams({ input: t, inputtype: 'textquery', fields: 'geometry,formatted_address', language: 'fr', region: 'fr', key: cle() });
    const r = await fetch(`${LIEU}?${params}`, { signal: AbortSignal.timeout(10000) });
    const d = r.ok ? await r.json() : null;
    const c = d?.status === 'OK' ? d.candidates?.[0] : null;
    point = c?.geometry?.location ? { lat: c.geometry.location.lat, lon: c.geometry.location.lng, adresse: c.formatted_address || null } : null;
  } catch { point = null; }
  if (lieux.size > 500) lieux.clear();
  lieux.set(t, point);
  return point;
}

/**
 * Les adresses de la BAN pour un texte : le texte entier, puis sa première
 * partie (« 1 rue du Nord » sans la ville ajoutée, qui est parfois l'enseigne
 * du titre). Numéros et rues seulement, assez sûrs.
 */
async function candidatsBan(texte, pres = null) {
  // Le texte, puis sans code postal (un « 59000 » pour une rue en 59800
  // faisait proposer la rue du Havre à la place de la rue du Nord), puis la
  // rue seule.
  const sansCode = String(texte).replace(/\b\d{5}\b/g, ' ').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  const essais = [...new Set([texte, sansCode, String(texte).split(',')[0]].map((x) => String(x || '').trim()).filter(Boolean))];
  const ecrite = rueEcrite(texte);
  const vus = [];
  for (const q of essais) {
    const biais = pres ? `&lat=${pres.lat}&lon=${pres.lon}` : '';
    for (const f of (await banJson(`${BAN}?limit=5&q=${encodeURIComponent(q)}${biais}`))?.features || []) {
      const pr = f.properties || {};
      if ((pr.score ?? 0) < 0.5 || !['housenumber', 'street'].includes(pr.type)) continue;
      // Une autre rue que celle écrite n'est pas l'adresse, même dans la bonne ville.
      if (ecrite && !rueCorrespond(ecrite, pr.street || pr.name)) continue;
      vus.push({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], rue: pr.street || pr.name || null, ville: pr.city || null, code_postal: pr.postcode || null, score: pr.score, adresse: pr.label || null });
    }
  }
  return vus;
}

/** Pure : la ville ou le code postal de ce candidat sont-ils écrits dans l'adresse ? */
export function candidatDansLeTexte(texte, c) {
  const t = ` ${normTexte(texte)} `;
  return !!((c.code_postal && t.includes(` ${c.code_postal} `)) || (c.ville && normTexte(c.ville) && t.includes(` ${normTexte(c.ville)} `)));
}

/**
 * Pure : le point retenu entre la BAN et Google. La BAN est précise au numéro
 * mais sans ville dite elle cherche dans toute la France ; Google comprend
 * le texte mais place parfois au mauvais endroit (« 1 rue du Nord » seul : à
 * Pourrières, dans le Var). `pres`, les coordonnées du dossier, dit au moins
 * la commune. Dans l'ordre : les deux d'accord (300 m) ; la BAN dont la ville
 * est écrite dans l'adresse ; la BAN à moins de 15 km du dossier ; Google,
 * s'il n'est pas à plus de 50 km du dossier (ou, sans dossier, si l'adresse
 * dit plus qu'une rue) ; sinon rien. Rend
 * `{ lat, lon, rue, adresse, source }` ou null.
 */
export function choisirPoint(texte, candidats, google, pres = null) {
  const pris = (c, source) => ({ lat: c.lat, lon: c.lon, rue: c.rue || null, adresse: c.adresse || null, source });
  const proche = google && candidats.find((c) => metres(google, c) <= 300);
  if (proche) return pris(proche, 'ban+google');
  const dansTexte = candidats.find((c) => candidatDansLeTexte(texte, c));
  if (dansTexte) return pris(dansTexte, 'ban');
  const presDuDossier = pres && candidats.find((c) => metres(pres, c) <= 15000);
  if (presDuDossier) return pris(presDuDossier, 'ban-pres-du-dossier');
  // Google seul : s'il n'est pas à plus de 50 km du dossier, ou, sans dossier
  // situé, si l'adresse dit plus qu'une rue (ville, code postal, enseigne).
  // « 1 rue du Nord » tout court, Google l'envoyait dans le Var.
  const texteSitue = /\b\d{5}\b/.test(texte) || String(texte).split(',').length > 1;
  if (google && (pres ? metres(pres, google) <= 50000 : texteSitue)) return { lat: google.lat, lon: google.lon, rue: null, adresse: google.adresse, source: 'google' };
  // Une BAN sans ville écrite, sans Google d'accord, sans commune connue :
  // une rue de ce nom n'importe où en France. Plutôt rien qu'un autre endroit.
  return null;
}

const resolutions = new Map();

/** Le point d'une adresse en texte, croisé entre la BAN et Google : `{ lat, lon, rue, adresse, source }`, ou null. */
export async function resoudrePoint(texte, { pres = null } = {}) {
  const t = String(texte || '').trim();
  if (!t) return null;
  const cleR = `${t}|${pres ? `${pres.lat},${pres.lon}` : ''}`;
  if (resolutions.has(cleR)) return resolutions.get(cleR);
  const [google, candidats] = await Promise.all([pointDuLieu(t), candidatsBan(t, pres)]);
  let point = choisirPoint(t, candidats, google, pres);
  // Google seul : la rue écrite dans l'adresse, lue par la BAN près du point
  // (le géocodage inverse du point tombe parfois sur la rue d'angle).
  if (point && !point.rue) point = { ...point, rue: rueEcrite(t) || (await rueDuTexte(t, point)) || (await rueDe(point.lat, point.lon)) };
  if (resolutions.size > 500) resolutions.clear();
  resolutions.set(cleR, point);
  return point;
}

/** Le panorama à ouvrir pour une adresse en texte : `{ point, panorama }` ; panorama null sans clé serveur ou sans prise de vue. */
export async function panoramaDeAdresse(texte, { pres = null } = {}) {
  const point = await resoudrePoint(texte, { pres });
  if (!point) {
    console.log(`[streetview] ${JSON.stringify(texte)} : aucune adresse trouvée`);
    return null;
  }
  const panorama = cle() ? await panoramaDeLaRue({ lat: point.lat, lon: point.lon, rue: point.rue }).catch(() => null) : null;
  console.log(`[streetview] ${JSON.stringify(texte)} → ${point.adresse || `${point.lat},${point.lon}`} (${point.source}${point.rue ? `, ${point.rue}` : ''}) → ${panorama?.pano ? `panorama ${panorama.pano}${panorama.meme_rue ? '' : ' (autre rue)'}` : cle() ? 'pas de panorama' : 'sans clé serveur : le point'}`);
  return { point, panorama };
}
