// K-Prospective, savoir à qui l'on parle (18 oct. 2026, lot 9, plan § 7). Enrichit les commerces retenus :
//   - les coordonnées publiques du commerce (téléphone, site) et son statut (ouvert, fermé) : Google Places
//     (clé GOOGLE_MAPS_SERVEUR), seulement pour les retenus, quarante au plus ;
//   - les signaux de vacance déjà relevés (table vacance_signal du lot 7, par SIRET ou SIREN) ;
//   - l'historique avec Klocka : la société déjà dans les cibles d'ALX (pile, motif) ;
//   - un score d'intérêt calculé par le code.
// Chaque source passe par son interrupteur ; coupée, sa part est vide, rien n'échoue.

import db from '../db.js';
import { viaSource } from '../socle/registre-sources.js';

const TEXTE = 'https://places.googleapis.com/v1/places:searchText';
const cle = () => (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Les coordonnées publiques d'un commerce sur Google Places (nom, adresse, ville). */
export async function contactPlaces({ nom, adresse, ville }) {
  if (!cle() || !nom) return null;
  const r = await viaSource('google_places', async () => {
    const reponse = await fetch(TEXTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle(), 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.userRatingCount' },
      body: JSON.stringify({ textQuery: [nom, adresse, ville].filter(Boolean).join(', '), languageCode: 'fr', regionCode: 'FR', maxResultCount: 1 }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(`Places ${reponse.status}`);
    const l = (j.places || [])[0];
    return l ? { telephone: l.nationalPhoneNumber || null, site: l.websiteUri || null, statut: l.businessStatus || null, avis: l.userRatingCount ?? null, adresse_maps: l.formattedAddress || null } : null;
  });
  return r.valeur || null;
}

/** Les signaux de vacance déjà relevés pour une société (lecture seule de la table du lot 7). */
export function signauxDe({ siret = null, siren = null }) {
  if (!siret && !siren) return [];
  try {
    return db.prepare('SELECT type_signal, date_signal, source FROM vacance_signal WHERE (siret = ? OR siren = ?) ORDER BY date_signal DESC LIMIT 5').all(siret || '', siren || '');
  } catch { return []; }
}

/** L'historique avec Klocka : la société est-elle déjà une cible d'ALX ? */
export function historiqueDe({ siren = null }) {
  if (!siren) return null;
  try {
    const ligne = db.prepare("SELECT data FROM records WHERE entity = 'Cible' AND (json_extract(data, '$.societe.siren') = ? OR json_extract(data, '$.proprietaire.siren') = ?) LIMIT 1").get(siren, siren);
    if (!ligne) return null;
    const c = JSON.parse(ligne.data);
    return { deja_cible: true, pile: c.pile || null, motif: c.motif || null, adresse: c.adresse || null };
  } catch { return null; }
}

/**
 * Pure : le score d'intérêt d'un commerce, de 0 à 100, et ce qui le compose. Un signal de vacance, un
 * propriétaire des murs identifié et un contact joignable font monter ; un commerce fermé ou déjà écarté par
 * Klocka fait descendre.
 */
export function scoreInteret({ criteres_remplis = 0, criteres_total = 0, signaux = [], proprietaire_societe = false, contact = null, historique = null } = {}) {
  const parts = [];
  if (criteres_total) parts.push({ cle: 'criteres', libelle: 'Critères remplis', points: Math.round((criteres_remplis / criteres_total) * 40) });
  if (signaux.length) parts.push({ cle: 'signaux', libelle: `Signal de vacance (${signaux[0].type_signal})`, points: 25 });
  if (proprietaire_societe) parts.push({ cle: 'proprietaire', libelle: 'Murs détenus par une société identifiée', points: 15 });
  if (contact?.telephone || contact?.site) parts.push({ cle: 'contact', libelle: 'Joignable (téléphone ou site public)', points: 10 });
  if (contact?.statut === 'CLOSED_PERMANENTLY') parts.push({ cle: 'ferme', libelle: 'Fermé définitivement sur Maps', points: 10 });
  if (historique?.pile === 'ecartee' || historique?.pile === 'ecarte') parts.push({ cle: 'ecarte', libelle: 'Déjà écarté par Klocka', points: -30 });
  const total = Math.max(0, Math.min(100, parts.reduce((s, p) => s + p.points, 0)));
  return { total, parts };
}

/** Enrichit les commerces retenus d'une prospection (au plus `max`), un appel Places à la fois. */
export async function enrichirRetenus(commerces, { ville = null, max = 40, criteresTotal = 0 } = {}) {
  const sortie = [];
  for (const c of commerces.slice(0, max)) {
    const siren = c.societe?.siren || null;
    const siret = c.siret || c.societe?.siret || null;
    const contact = await contactPlaces({ nom: c.enseigne || c.nom || c.societe?.nom, adresse: c.adresse, ville }).catch(() => null);
    const signaux = signauxDe({ siret, siren });
    const historique = historiqueDe({ siren });
    const interet = scoreInteret({
      criteres_remplis: c.criteres_remplis ?? 0, criteres_total: criteresTotal,
      signaux, proprietaire_societe: !!c.foncier?.proprietaires?.some((x) => x.siren), contact, historique,
    });
    sortie.push({ ...c, contact, signaux, historique, interet });
    await pause(250);
  }
  return sortie.sort((a, b) => b.interet.total - a.interet.total);
}

/** L'emprise d'une commune de l'entrepôt (API Géo) : sa boîte et le rayon qui la couvre depuis son centre, 8 km au plus. */
export function empriseCommune(codeInsee) {
  if (!codeInsee) return null;
  try {
    const c = db.prepare('SELECT bbox FROM entrepot_commune WHERE code = ?').get(codeInsee);
    const pts = JSON.parse(c?.bbox || 'null')?.coordinates?.[0];
    if (!pts?.length) return null;
    const lons = pts.map((p) => p[0]); const lats = pts.map((p) => p[1]);
    const b = { ouest: Math.min(...lons), est: Math.max(...lons), sud: Math.min(...lats), nord: Math.max(...lats) };
    const dLat = (b.nord - b.sud) * 111320; const dLon = (b.est - b.ouest) * 111320 * Math.cos((((b.nord + b.sud) / 2) * Math.PI) / 180);
    return { ...b, rayon_m: Math.min(8000, Math.round(Math.hypot(dLat, dLon) / 2)) };
  } catch { return null; }
}

/** Une commune de l'entrepôt par son nom (sans accents ni casse) ou son code : code, nom, centre de son emprise. */
export function communeParNom(texte) {
  const norme = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  try {
    const t = norme(texte);
    const lignes = db.prepare('SELECT code, nom, bbox FROM entrepot_commune').all();
    const c = lignes.find((x) => x.code === String(texte).trim()) || lignes.find((x) => norme(x.nom) === t);
    if (!c) return null;
    const e = empriseCommune(c.code);
    return e ? { code: c.code, nom: c.nom, lat: (e.sud + e.nord) / 2, lon: (e.ouest + e.est) / 2, label: c.nom } : null;
  } catch { return null; }
}
