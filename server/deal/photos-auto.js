// Les images d'un projet, cherchées toutes seules à sa création.
//
// Deux sources, toutes deux sourcées et sans droits à demander :
//
//  - Street View, cadré depuis la rue sur l'adresse du bien : la devanture,
//    telle qu'un passant la voit. Trois angles pour avoir le choix.
//  - Maps Static, une vue aérienne du quartier et un plan large de la ville.
//
// Les images sont rapatriées dans /uploads : la clé Google ne part jamais au
// navigateur, et le projet garde ses photos même si la clé change. Un échec
// n'est jamais bloquant : le projet se crée sans images, elles s'ajoutent à la
// main comme avant.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const CLE = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

async function telecharger(url, uploadDir) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`image indisponible (${resp.status})`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  // Une image d'erreur de Google pèse quelques centaines d'octets.
  if (buffer.length < 3000) throw new Error('image vide');
  const nom = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(uploadDir, nom), buffer);
  return `/uploads/${nom}`;
}

/** Y a-t-il une prise de vue Street View à ce point ? */
async function couvertureStreetView(position) {
  const meta = await fetch(
    `https://maps.googleapis.com/maps/api/streetview/metadata?location=${position}&key=${CLE}`
  ).then((r) => r.json());
  return meta?.status === 'OK';
}

/**
 * Les photos d'un bien : devanture sous trois angles, quartier vu du ciel,
 * plan de la ville. Retourne les URLs locales, dans cet ordre.
 * @param {{ adresse?: string, lat?: number, lon?: number, ville?: string }} lieu
 * @param {string} uploadDir
 * @returns {Promise<{ photos: string[], raisons: string[] }>}
 */
export async function photosDuBien({ adresse, lat, lon, ville }, uploadDir) {
  const photos = [];
  const raisons = [];
  if (!CLE) return { photos, raisons: ['aucune clé Google Maps : pas de photos automatiques'] };

  // Street View accepte une adresse en clair ; les coordonnées servent de repli.
  const position = adresse ? encodeURIComponent(adresse) : lat != null && lon != null ? `${lat},${lon}` : null;
  if (position) {
    try {
      if (await couvertureStreetView(position)) {
        for (const angle of [{ fov: 75, pitch: 8 }, { fov: 100, pitch: 0 }, { fov: 45, pitch: 12 }]) {
          try {
            photos.push(await telecharger(
              `https://maps.googleapis.com/maps/api/streetview?size=1280x720&location=${position}` +
              `&fov=${angle.fov}&pitch=${angle.pitch}&source=outdoor&key=${CLE}`,
              uploadDir
            ));
          } catch { /* un angle manquant n'empêche pas les autres */ }
        }
      } else {
        raisons.push('pas de prise de vue Street View à cette adresse');
      }
    } catch (e) {
      raisons.push(`Street View injoignable : ${e?.message || e}`);
    }
  }

  // Le quartier vu du ciel, puis la ville en plan large. Google plafonne ces images à 640 px : on les demande
  // en 640 × 360 à double densité, soit un vrai 1280 × 720 (12 oct. 2026 ; « 1280x720 » revenait réduit).
  const centre = adresse ? encodeURIComponent(adresse) : lat != null && lon != null ? `${lat},${lon}` : null;
  if (centre) {
    try {
      photos.push(await telecharger(
        `https://maps.googleapis.com/maps/api/staticmap?center=${centre}&zoom=18&size=640x360&scale=2&maptype=satellite&key=${CLE}`,
        uploadDir
      ));
    } catch (e) { raisons.push(`vue aérienne indisponible : ${e?.message || e}`); }
  }
  if (ville) {
    try {
      photos.push(await telecharger(
        `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(ville)}&zoom=13&size=640x360&scale=2` +
        `&maptype=roadmap&markers=color:0x96c0b8%7C${centre || encodeURIComponent(ville)}&key=${CLE}`,
        uploadDir
      ));
    } catch (e) { raisons.push(`plan de la ville indisponible : ${e?.message || e}`); }
  }

  return { photos, raisons };
}

/**
 * L'image de la ville, la première du projet (30 oct. 2026, Jules : « l'IA va chercher une image de la ville et la met en
 * première image »). L'image de la page Wikipédia de la commune, rapatriée dans /uploads. Une page d'homonymie, une
 * page sans image ou une panne : rien, le projet se crée sans.
 */
// Un montage, un blason, une carte, un logo : pas une photo de la ville (26 nov. 2026, Jules : « des collages, c'est trop
// bizarre »).
export const PAS_UNE_PHOTO = /montage|collage|mosa[iï]que|blason|armoiries|coat[ _]of[ _]arms|logo|carte|\bmap\b|\bplan\b|drapeau|flag|localisation|location|\.svg$|\.gif$/i;

/** Pure : les fichiers de Commons d'une entité Wikidata, la photo de la ville (P18) puis son bandeau (P948), sans montage. */
export function fichiersDeLEntite(entite) {
  const c = entite?.claims || {};
  const de = (p) => (c[p] || []).map((x) => x?.mainsnak?.datavalue?.value).filter((v) => typeof v === 'string');
  return [...de('P18'), ...de('P948')].filter((f) => !PAS_UNE_PHOTO.test(f));
}

const UA_WIKI = { 'user-agent': 'KlockaBot/1.0 (https://klocka.immo)' };
// Une vue de la ville, pas un intérieur ni un détail : ni nef, vitrail, orgue, statue, tableau, tombe ni plaque.
const PAS_UNE_VUE = /int[ée]rieur|interior|nef\b|vitra|orgue|organ\b|retable|statue|sculpt|tableau|peintur|painting|tombe|cimeti|cemetery|plaque|monument aux morts|m[ée]morial|portrait|plafond|ceiling|d[ée]tail|cloche|\bbell\b|\bOSM\b|\.tiff?$/i;

async function entiteDeLaVille(ville, departement) {
  const entite = async (titre) => {
    const r = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&sites=frwiki&props=claims&normalize=1&format=json&titles=${encodeURIComponent(titre)}`, { headers: UA_WIKI, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const e = Object.values((await r.json())?.entities || {})[0];
    return e && !('missing' in e) ? e : null;
  };
  return (departement && await entite(`${ville} (${departement})`)) || entite(ville);
}

/**
 * Les photos d'une ville, au choix (26 nov. 2026, Jules : « c'est tout le temps la même photo pour une même ville ») :
 * sa photo Wikidata (P18), celles de ses monuments protégés (P1435, une photo P18 chacun), puis son bandeau (P948) ;
 * jamais un montage, un blason, une carte, un intérieur ni un détail. Des noms de fichiers de Commons, dans cet ordre.
 */
export async function photosDeLaVille(ville, { departement = null } = {}) {
  if (!ville) return [];
  const e = await entiteDeLaVille(ville, departement);
  if (!e?.id) return [];
  const propres = fichiersDeLEntite(e);
  let monuments = [];
  try {
    // Un monument placé sur la carte (P625) : un bâtiment, une place, un pont ; pas un objet classé (tableau, statue, cloche).
    const requete = `SELECT DISTINCT ?img WHERE { ?item wdt:P131 wd:${e.id}; wdt:P18 ?img; wdt:P1435 ?p; wdt:P625 ?c . } LIMIT 40`;
    const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(requete)}`, { headers: { ...UA_WIKI, accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(20000) });
    if (r.ok) monuments = ((await r.json())?.results?.bindings || []).map((b) => decodeURIComponent(String(b.img?.value || '').split('/').pop() || '')).filter(Boolean);
  } catch { /* les monuments manquent : la photo de la ville seule */ }
  const bonnes = (f) => f && !PAS_UNE_PHOTO.test(f) && !PAS_UNE_VUE.test(f) && /\.(jpe?g|png|webp|tiff?)$/i.test(f);
  return [...new Set([...propres.filter((f) => !/banner|bandeau/i.test(f)), ...monuments, ...propres.filter((f) => /banner|bandeau/i.test(f))])].filter(bonnes);
}

/** Un fichier de Commons rapatrié dans /uploads, 1 280 px de large au plus ; null s'il ne vient pas. */
export async function telechargerDeCommons(fichier, uploadDir) {
  if (!fichier || !uploadDir) return null;
  const r = await fetch(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fichier)}?width=1280`, { headers: UA_WIKI, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return null;
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 3000) return null;
  const ext = /png/i.test(r.headers.get('content-type') || '') ? 'png' : 'jpg';
  const nom = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, nom), buffer);
  return `/uploads/${nom}`;
}

/** La photo de la ville d'un projet : la première de photosDeLaVille (sa photo Wikidata), jamais un montage. */
async function photoWikidata(ville, uploadDir, departement) {
  for (const f of (await photosDeLaVille(ville, { departement })).slice(0, 2)) {
    const url = await telechargerDeCommons(f, uploadDir).catch(() => null);
    if (url) return url;
  }
  return null;
}

export async function imageDeLaVille(ville, uploadDir, { departement = null } = {}) {
  if (!ville || !uploadDir) return null;
  // Wikidata d'abord : la photo de la ville, jamais un montage ; Wikipédia ensuite, sans montage non plus.
  const parWikidata = await photoWikidata(ville, uploadDir, departement).catch(() => null);
  if (parWikidata) return parWikidata;
  const entetes = { 'user-agent': 'Klocka/1.0 (sourcing@klocka.immo)', accept: 'application/json' };
  const page = async (titre) => {
    const r = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titre.replace(/ /g, '_'))}`, { headers: entetes, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.type === 'standard' ? j : null;
  };
  try {
    const p = (departement && await page(`${ville} (${departement})`)) || await page(ville);
    const vignette = p?.thumbnail?.source || null;
    // La vignette, agrandie à 1280 px (une largeur que Wikimedia sert ; 1600 répond 400) : l'original pèse parfois des dizaines de mégaoctets.
    const source = vignette && /\/\d+px-/.test(vignette) && (p.originalimage?.width || 0) > 1280 ? vignette.replace(/\/\d+px-/, '/1280px-') : p?.originalimage?.source || vignette;
    if (!source || /\.svg/i.test(source) || PAS_UNE_PHOTO.test(decodeURIComponent(source.split('/').pop() || ''))) return null;
    const r = await fetch(source, { headers: { 'user-agent': entetes['user-agent'] }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (buffer.length < 3000) return null;
    const ext = /\.png/i.test(source) ? 'png' : 'jpg';
    const nom = `${randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(uploadDir, nom), buffer);
    return `/uploads/${nom}`;
  } catch { return null; }
}
