// La photo d'un commerce, celle de sa fiche Google (31 oct. 2026, Jules : « juste une image du commerce, pas
// l'intégration Google Maps, qui coûte cher »). Remplace le panorama Street View en tête des fiches.
//
// Trois appels à Places (API New), dont un seul se paie :
//  - Text Search en « IDs Only » (champ places.id) : le lieu, d'après le nom et l'adresse. Gratuit.
//  - Place Details en « IDs Only » (champ photos) : la liste des photos. Gratuit.
//  - Place Photo : l'image elle-même, 7 $ les 1 000 au-delà de 1 000 par mois.
// L'image est rapatriée une fois dans /uploads/commerces et gardée : la clé ne part pas au navigateur, et
// rouvrir la fiche ne coûte plus rien. Un commerce sans photo est retenu aussi, et se recherche après 30 jours.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Records, CHEMIN_UPLOADS } from './db.js';

const ENTITE = 'PhotoCommerce';
const TEXTE = 'https://places.googleapis.com/v1/places:searchText';
const LIEU = 'https://places.googleapis.com/v1/places/';
const RECHERCHER_APRES_MS = 30 * 24 * 3600 * 1000;
const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure : la clé du cache, l'identifiant Google s'il est connu, sinon le nom et l'adresse. */
export function cleDe({ placeId = null, nom = '', adresse = '' } = {}) {
  if (placeId) return `place:${placeId}`;
  const n = norm(nom);
  const a = norm(adresse);
  return n && a ? `texte:${n}|${a}` : null;
}

/** Pure : le lien qui ouvre le commerce dans Google Maps. */
export function lienMaps({ placeId = null, nom = '', adresse = '' } = {}) {
  const q = encodeURIComponent([nom, adresse].filter(Boolean).join(' '));
  return `https://www.google.com/maps/search/?api=1&query=${q}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ''}`;
}

async function trouverLieu(nom, adresse, pres) {
  const corps = { textQuery: `${nom} ${adresse}`, languageCode: 'fr', regionCode: 'FR', pageSize: 1 };
  if (pres) corps.locationBias = { circle: { center: { latitude: pres.lat, longitude: pres.lon }, radius: 150 } };
  const r = await fetch(TEXTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'places.id' },
    body: JSON.stringify(corps),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Places Text Search a répondu ${r.status}`);
  return (await r.json())?.places?.[0]?.id || null;
}

async function premierePhoto(placeId) {
  const r = await fetch(`${LIEU}${encodeURIComponent(placeId)}?languageCode=fr`, {
    headers: { 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'photos' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Places Details a répondu ${r.status}`);
  return (await r.json())?.photos?.[0] || null;
}

async function telecharger(nomPhoto, largeur = 900) {
  const r = await fetch(`https://places.googleapis.com/v1/${nomPhoto}/media?maxWidthPx=${largeur}&key=${cle()}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`Places Photo a répondu ${r.status}`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 3000) throw new Error('image vide');
  const dossier = path.join(CHEMIN_UPLOADS, 'commerces');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = `${randomUUID()}.jpg`;
  fs.writeFileSync(path.join(dossier, fichier), buffer);
  return `/uploads/commerces/${fichier}`;
}

const enCours = new Map();

/**
 * La photo d'un commerce : `{ url, auteur, auteur_lien, maps }`, url null sans photo trouvée.
 * Sans clé serveur, rien n'est cherché : seulement le lien Maps.
 */
export async function photoDuCommerce({ placeId = null, nom = '', adresse = '', pres = null } = {}) {
  const k = cleDe({ placeId, nom, adresse });
  const maps = lienMaps({ placeId, nom, adresse });
  if (!k || !cle()) return { url: null, auteur: null, auteur_lien: null, maps };
  const garde = Records.findBy(ENTITE, 'cle', k);
  if (garde && (garde.url || Date.now() - new Date(garde.le).getTime() < RECHERCHER_APRES_MS)) {
    return { url: garde.url, auteur: garde.auteur || null, auteur_lien: garde.auteur_lien || null, maps: lienMaps({ placeId: garde.place_id || placeId, nom, adresse }) };
  }
  if (enCours.has(k)) return enCours.get(k);
  const travail = (async () => {
    const id = placeId || (await trouverLieu(nom, adresse, pres));
    const photo = id ? await premierePhoto(id) : null;
    const url = photo?.name ? await telecharger(photo.name) : null;
    const attribution = photo?.authorAttributions?.[0] || null;
    const fiche = { cle: k, place_id: id, url, auteur: attribution?.displayName || null, auteur_lien: attribution?.uri || null, le: new Date().toISOString() };
    if (garde) Records.update(ENTITE, garde.id, fiche); else Records.create(ENTITE, fiche);
    console.log(`[photo-commerce] ${JSON.stringify(`${nom}, ${adresse}`)} → ${url ? 'photo gardée' : id ? 'lieu sans photo' : 'lieu introuvable'}`);
    return { url, auteur: fiche.auteur, auteur_lien: fiche.auteur_lien, maps: lienMaps({ placeId: id, nom, adresse }) };
  })().finally(() => enCours.delete(k));
  enCours.set(k, travail);
  return travail;
}

// --- La photo d'une ville (1er nov. 2026, Jules : « dès qu'on fait l'avis, ça va chercher une belle photo de la
// ville ») : la page « La ville » du deck. La ville sur Google (type locality), sa première photo en paysage assez
// grande pour une page, rapatriée et gardée comme celle d'un commerce.

/** Pure : la photo à garder d'une liste de Places : la première en paysage d'au moins 1 200 px, sinon la première. */
export function choisirPhotoDeVille(photos = []) {
  return photos.find((p) => p.widthPx >= 1200 && p.widthPx > p.heightPx) || photos[0] || null;
}

async function trouverVille(commune) {
  const r = await fetch(TEXTE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'places.id' },
    body: JSON.stringify({ textQuery: `${commune}, France`, includedType: 'locality', languageCode: 'fr', regionCode: 'FR', pageSize: 1 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Places Text Search a répondu ${r.status}`);
  return (await r.json())?.places?.[0]?.id || null;
}

async function photosDuLieu(placeId) {
  const r = await fetch(`${LIEU}${encodeURIComponent(placeId)}?languageCode=fr`, {
    headers: { 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'photos' },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Places Details a répondu ${r.status}`);
  return (await r.json())?.photos || [];
}

/** La photo d'une ville : `{ url, auteur, auteur_lien }`, url null sans photo (ou sans clé serveur). */
export async function photoDeLaVille(commune) {
  const n = norm(commune);
  if (!n || !cle()) return { url: null, auteur: null, auteur_lien: null };
  const k = `ville:${n}`;
  const garde = Records.findBy(ENTITE, 'cle', k);
  if (garde && (garde.url || Date.now() - new Date(garde.le).getTime() < RECHERCHER_APRES_MS)) return { url: garde.url, auteur: garde.auteur || null, auteur_lien: garde.auteur_lien || null };
  if (enCours.has(k)) return enCours.get(k);
  const travail = (async () => {
    const id = await trouverVille(commune);
    const photo = id ? choisirPhotoDeVille(await photosDuLieu(id)) : null;
    const url = photo?.name ? await telecharger(photo.name, 1600) : null;
    const attribution = photo?.authorAttributions?.[0] || null;
    const fiche = { cle: k, place_id: id, url, auteur: attribution?.displayName || null, auteur_lien: attribution?.uri || null, le: new Date().toISOString() };
    if (garde) Records.update(ENTITE, garde.id, fiche); else Records.create(ENTITE, fiche);
    console.log(`[photo-ville] ${JSON.stringify(commune)} → ${url ? 'photo gardée' : id ? 'ville sans photo' : 'ville introuvable'}`);
    return { url, auteur: fiche.auteur, auteur_lien: fiche.auteur_lien };
  })().finally(() => enCours.delete(k));
  enCours.set(k, travail);
  return travail;
}

/** Pure : les photos à proposer d'une liste de Places : d'abord les paysages d'au moins 1 200 px, puis le reste. */
export function choisirPhotosDeVille(photos = [], n = 4) {
  const belles = photos.filter((p) => p.widthPx >= 1200 && p.widthPx > p.heightPx);
  return [...belles, ...photos.filter((p) => !belles.includes(p))].slice(0, n);
}

/**
 * Plusieurs photos d'une ville, au choix du mandataire (1er nov. 2026, Jules : « que le chat laisse le choix entre
 * différentes images »). `[{ url, auteur }]`, gardées comme les autres. Depuis le 3 nov., seulement en repli de la
 * recherche d'images.
 */
export async function photosGoogleDeLaVille(commune, n = 4) {
  const v = norm(commune);
  if (!v || !cle()) return [];
  const k = `ville-choix:${v}`;
  const garde = Records.findBy(ENTITE, 'cle', k);
  if (garde && ((garde.photos || []).length || Date.now() - new Date(garde.le).getTime() < RECHERCHER_APRES_MS)) return garde.photos || [];
  if (enCours.has(k)) return enCours.get(k);
  const travail = (async () => {
    const id = await trouverVille(commune);
    const choisies = id ? choisirPhotosDeVille(await photosDuLieu(id), n) : [];
    const photos = [];
    for (const p of choisies) {
      try { photos.push({ url: await telecharger(p.name, 1600), auteur: p.authorAttributions?.[0]?.displayName || null }); } catch (err) { console.warn(`[photo-ville] ${err?.message || err}`); }
    }
    const fiche = { cle: k, place_id: id, photos, le: new Date().toISOString() };
    if (garde) Records.update(ENTITE, garde.id, fiche); else Records.create(ENTITE, fiche);
    console.log(`[photo-ville] ${JSON.stringify(commune)} → ${photos.length} photo(s) au choix`);
    return photos;
  })().finally(() => enCours.delete(k));
  enCours.set(k, travail);
  return travail;
}

/**
 * D'autres photos Google d'une ville (13 nov. 2026, Jules : « va chercher des photos » ne rendait que les trois
 * gardées, déjà dans le projet). Les suivantes de sa fiche, dans le même ordre que photosGoogleDeLaVille : les gardées
 * en sont le début, on prend après elles, on les rapatrie et on les ajoute à la fiche gardée. `[]` quand la fiche
 * Google n'en a plus (dix photos au plus par lieu).
 */
export async function autresPhotosGoogleDeLaVille(commune, n = 3) {
  const v = norm(commune);
  if (!v || !cle()) return [];
  const k = `ville-choix:${v}`;
  const garde = Records.findBy(ENTITE, 'cle', k);
  const deja = garde?.photos || [];
  const id = garde?.place_id || (await trouverVille(commune));
  if (!id) return [];
  const suivantes = choisirPhotosDeVille(await photosDuLieu(id), 10).slice(deja.length, deja.length + n);
  const nouvelles = [];
  for (const p of suivantes) {
    try { nouvelles.push({ url: await telecharger(p.name, 1600), auteur: p.authorAttributions?.[0]?.displayName || null }); } catch (err) { console.warn(`[photo-ville] ${err?.message || err}`); }
  }
  if (nouvelles.length) {
    const fiche = { cle: k, place_id: id, photos: [...deja, ...nouvelles], le: new Date().toISOString() };
    if (garde) Records.update(ENTITE, garde.id, fiche); else Records.create(ENTITE, fiche);
  }
  console.log(`[photo-ville] ${JSON.stringify(commune)} autres → ${nouvelles.length} photo(s)`);
  return nouvelles;
}

// --- Les photos d'une ville (3 nov. 2026, Jules : « qu'il prenne les tops images ; si on lui demande d'en chercher
// d'autres, il faut que ça le fasse »). La recherche d'images de Bing (« {ville} photo ») ne rendait plus la ville :
// le 6 nov. 2026, « Antibes photo » a donné une photo de presse de Tom Cruise (Jules : « WTF cette image »). Les photos
// viennent désormais de l'article Wikipédia de la commune, dans son ordre : vues de la ville, en paysage, assez grandes ;
// ni plan, ni carte, ni blason, ni plaque, ni tableau. La fiche Google de la ville en repli. Chaque image est rapatriée
// dans /uploads/commerces. « D'autres » : la page suivante des photos gardées.

const WIKIPEDIA = 'https://fr.wikipedia.org';
const AGENT = 'Klocka/1.0 (https://klocka.immo)';
const PAS_UNE_VUE = /plan|carte|map|blason|armoiries|logo|flag|drapeau|plaque|panneau|st[eè]le|table|tableau|peinture|gravure|par_|portrait|localisation|location|schema|sch[ée]ma|graph|courbe|diagram|r[ée]partition|population|meteo|climat|windrose|vote|elect/i;

/** Pure : les vues d'une ville parmi les images de son article (titre, largeur, hauteur, type), dans l'ordre donné. */
export function vuesDeLaVille(images = []) {
  return images.filter((i) => /^image\/jpeg$/.test(i.mime || '') && i.width >= 1200 && i.width >= i.height * 1.2 && !PAS_UNE_VUE.test(String(i.titre || '').replace(/^Fichier:/, '')) && i.url);
}

const wiki = async (chemin) => {
  const r = await fetch(`${WIKIPEDIA}${chemin}`, { headers: { 'User-Agent': AGENT, 'Api-User-Agent': AGENT }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Wikipédia a répondu ${r.status}`);
  return r.json();
};

/** Les adresses des vues de l'article Wikipédia d'une commune, à 1 600 px, dans l'ordre de l'article. */
async function imagesWikipedia(commune) {
  const liste = await wiki(`/api/rest_v1/page/media-list/${encodeURIComponent(String(commune).trim().replace(/ /g, '_'))}`);
  const titres = (liste.items || []).filter((i) => i.type === 'image' && i.title && !/\.svg$/i.test(i.title)).map((i) => i.title).slice(0, 50);
  if (!titres.length) return [];
  const q = new URLSearchParams({ action: 'query', titles: titres.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime', iiurlwidth: '1600', format: 'json', formatversion: '2' });
  const infos = new Map((((await wiki(`/w/api.php?${q}`)).query || {}).pages || []).map((p) => [p.title.replace(/ /g, '_'), p.imageinfo?.[0] || {}]));
  const images = titres.map((t) => { const i = infos.get(t.replace(/ /g, '_')) || {}; return { titre: t, width: i.width, height: i.height, mime: i.mime, url: i.thumburl || i.url }; });
  return vuesDeLaVille(images).map((i) => i.url);
}

async function rapatrier(url) {
  const r = await fetch(url, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) throw new Error(`image refusée (${r.status} ${type})`);
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length < 30000) throw new Error('image trop petite');
  const dossier = path.join(CHEMIN_UPLOADS, 'commerces');
  fs.mkdirSync(dossier, { recursive: true });
  const fichier = `${randomUUID()}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`;
  fs.writeFileSync(path.join(dossier, fichier), buffer);
  return `/uploads/commerces/${fichier}`;
}

/**
 * Les photos d'une ville, au choix du mandataire : `[{ url, auteur, source }]`, n par page. `page` 0 : les premières ;
 * 1, 2… : les suivantes (« d'autres »), qui reviennent au début une fois la liste parcourue. Les images rapatriées
 * sont gardées : revenir à une page ne retélécharge rien. La fiche Google de la ville en repli.
 */
export async function photosDeLaVille(commune, { n = 4, page = 0 } = {}) {
  const v = norm(commune);
  if (!v) return [];
  const k = `ville-vues:${v}`; // « ville-images » : les résultats de Bing, abandonnés le 6 nov. 2026.
  const cleTravail = `${k}#${page}`;
  if (enCours.has(cleTravail)) return enCours.get(cleTravail);
  const travail = (async () => {
    let garde = Records.findBy(ENTITE, 'cle', k);
    if (!garde?.candidats?.length || Date.now() - new Date(garde.le).getTime() > RECHERCHER_APRES_MS) {
      let candidats = [];
      try { candidats = await imagesWikipedia(commune); } catch (err) { console.warn(`[photo-ville] ${err?.message || err}`); }
      if (!candidats.length) return n === 4 && !page ? photosGoogleDeLaVille(commune, n) : [];
      const fiche = { cle: k, candidats, photos: [], ecartees: [], le: new Date().toISOString() };
      garde = garde ? Records.update(ENTITE, garde.id, fiche) : Records.create(ENTITE, fiche);
    }
    const photos = [...(garde.photos || [])];
    const ecartees = new Set(garde.ecartees || []);
    const restantes = garde.candidats.filter((u) => !ecartees.has(u) && !photos.some((p) => p.source === u)).length;
    const pages = Math.max(1, Math.ceil((photos.length + restantes) / n));
    const debut = (page % pages) * n;
    for (const u of garde.candidats) {
      if (photos.length >= debut + n) break;
      if (ecartees.has(u) || photos.some((p) => p.source === u)) continue;
      try { photos.push({ url: await rapatrier(u), auteur: null, source: u }); } catch (err) { ecartees.add(u); console.warn(`[photo-ville] ${u} : ${err?.message || err}`); }
    }
    Records.update(ENTITE, garde.id, { photos, ecartees: [...ecartees] });
    const rendues = photos.slice(debut, debut + n);
    console.log(`[photo-ville] ${JSON.stringify(commune)} page ${page} → ${rendues.length} photo(s)`);
    return rendues.length ? rendues : photos.slice(0, n);
  })().finally(() => enCours.delete(cleTravail));
  enCours.set(cleTravail, travail);
  return travail;
}

