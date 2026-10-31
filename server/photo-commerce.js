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

async function telecharger(nomPhoto) {
  const r = await fetch(`https://places.googleapis.com/v1/${nomPhoto}/media?maxWidthPx=900&key=${cle()}`, { signal: AbortSignal.timeout(20000) });
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
