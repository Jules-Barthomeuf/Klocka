// Le taux de vacance commerciale d'une rue ou d'un rayon (14 oct. 2026, Jules :
// « qu'est-ce qui est vraiment synonyme de vacance… fait de façon rigoureuse,
// de la même manière à chaque fois »).
//
// Un taux, c'est un rapport : des locaux vides sur tous les locaux. Les signaux
// (BODACC, fermetures) ne donnent ni l'un ni l'autre ; on recense donc d'abord
// les locaux à vitrine, puis on donne un état à chacun, avec sa raison.
//
//   1. Le recensement : chaque adresse où un établissement à vitrine (commerce,
//      restauration, services en boutique) est ouvert aujourd'hui ou a fermé
//      depuis cinq ans (SIRENE), plus les commerces d'OpenStreetMap à une
//      adresse que le registre ne connaît pas. Une adresse = un local.
//   2. L'état de chaque local, par des règles écrites (PARAMETRES_TAUX, versionnées) :
//        occupé    un établissement à vitrine y est ouvert ;
//        vacant    plus aucun n'y est ouvert, le dernier a fermé il y a moins de
//                  cinq ans ; ou OpenStreetMap le dit vide ;
//        incertain les sources se contredisent (le registre le dit vide,
//                  OpenStreetMap y voit un commerce ouvert, ou l'inverse).
//   3. Le taux : vacants / (occupés + vacants), avec la fourchette que les
//      incertains ouvrent, et le détail par rue.
//
// Écartés, et dits : les ventes hors magasin (marchés, vente à distance), qui
// n'ont pas de local ; les adresses où trop d'entreprises se succèdent ou
// cohabitent (domiciliation, galerie), qu'un taux par local ne sait pas lire.
// Ce n'est pas un relevé de terrain : c'est une estimation reproductible, dont
// la précision se mesure en vérifiant un échantillon (Street View, visite).

import db from '../db.js';
import { distanceM } from './vacance-regles.js';

export const PARAMETRES_TAUX = {
  version: 'v1.3 du 14 oct. 2026',
  // Les activités de vitrine : le commerce de la table NAF de l'outil, et les services en boutique.
  vitrines: ['45', '47', '56', '952', '960', '64.19', '66.22', '68.31', '79.1', '77.2', '74.2', '95.1'],
  // Sans local : marchés, vente à distance, vente hors magasin.
  hors_magasin: ['47.81', '47.82', '47.89', '47.91', '47.99'],
  annees_historique: 5,
  // Au-delà, une adresse est une domiciliation ou une galerie : elle sort du taux.
  seuil_adresse_multiple: 8,
  // Une rue entre dans le détail à partir de ce nombre de locaux.
  locaux_min_rue: 4,
  // En deçà de ce nombre de locaux tranchés, un pourcentage ne veut rien dire (un local = 20 points sur 5) : il n'est pas affiché.
  locaux_min_taux: 10,
  rayon_min_m: 50,
  rayon_max_m: 1500,
  rayon_defaut_m: 300,
  recensement_jours: 7,
};

const P0 = PARAMETRES_TAUX;
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const ABREGES = { AV: 'AVENUE', BD: 'BOULEVARD', PL: 'PLACE', CRS: 'COURS', ALL: 'ALLEES', ALLEE: 'ALLEES', QU: 'QUAI', QUA: 'QUAI', IMP: 'IMPASSE', CHE: 'CHEMIN', RTE: 'ROUTE', PAS: 'PASSAGE', SQ: 'SQUARE', FG: 'FAUBOURG', ESP: 'ESPLANADE', PROM: 'PROMENADE', R: 'RUE', ST: 'SAINT', STE: 'SAINTE' };
const INDICES = { B: 'BIS', T: 'TER', Q: 'QUATER' };

/**
 * Pure : la clé d'un local, d'après son adresse : le numéro, son indice et la
 * voie, sans code postal ni commune, abréviations développées. « 23 PL JEAN
 * MOULIN 33500 LIBOURNE » et « 23 Place Jean-Moulin » donnent la même clé.
 * Sans numéro, null : on ne sait pas de quel local il s'agit.
 */
export function cleLocal(adresse) {
  const t = sansAccents(adresse).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const sansVille = t.replace(/\b\d{5}\b.*$/, '').trim();
  const m = sansVille.match(/^(\d+)\s*(BIS|TER|QUATER|[BTQ])?\s+(.*)$/);
  if (!m) return null;
  const indice = m[2] ? (INDICES[m[2]] || m[2]) : '';
  const voie = m[3].split(' ').map((x) => ABREGES[x] || x).join(' ').replace(/\b(DE LA|DU|DES|DE L|DE|D|LA|LE|LES|L)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!voie) return null;
  return `${m[1]}${indice ? ` ${indice}` : ''} ${voie}`;
}

/** Pure : la voie d'une clé de local (« 23 PLACE JEAN MOULIN » → « PLACE JEAN MOULIN »). */
export const voieDe = (cle) => String(cle || '').replace(/^\d+( (BIS|TER|QUATER))? /, '');

const commence = (naf, prefixes) => { const c = String(naf || '').replace(/\./g, ''); return prefixes.some((p) => c.startsWith(String(p).replace(/\./g, ''))); };
export const horsMagasin = (naf, P = P0) => commence(naf, P.hors_magasin);
const nomDe = (e) => e.enseigne || e.denomination || e.siret;
// Ce que Google Maps place à une adresse sans que ce soit le local du rez-de-chaussée.
const TYPES_ETAGE = new Set(['premise', 'subpremise', 'street_address', 'apartment_building', 'apartment_complex', 'lodging', 'parking', 'doctor', 'dentist', 'physiotherapist', 'lawyer', 'accounting', 'corporate_office', 'consultant', 'point_of_interest']);
const estEI = (e) => String(e.categorie_juridique || '') === '1000';
const MOTS_VIDES = new Set(['SARL', 'SAS', 'SASU', 'EURL', 'SA', 'SCI', 'SNC', 'ET', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'L', 'D', 'AU', 'AUX', 'EN', 'CHEZ']);
const motsDuNom = (s) => sansAccents(s).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((m) => m.length >= 3 && !MOTS_VIDES.has(m));
/** Pure : deux noms désignent le même commerce (un mot qui compte en commun). */
export const memeCommerce = (a, b) => { const x = new Set(motsDuNom(a)); return motsDuNom(b).some((m) => x.has(m)); };

/**
 * Pure : les locaux autour d'un point, et l'état de chacun.
 *
 * @param {Array} etablissements  le recensement SIRENE de la commune (vitrinesCommune), avec lat/lon
 * @param {Array} osm  les commerces d'OpenStreetMap autour : { nom, type, vacant, adresse, lat, lon }
 * @param {{lat:number, lon:number, rayon_m:number}} zone
 * @returns {{locaux: Array, exclus: Array, taux: object, rues: Array, parametres: object}}
 */
export function etatsDesLocaux(etablissements, osm, zone, { maintenantD = new Date(), P = P0, google = null } = {}) {
  const limite = new Date(maintenantD.getTime() - P.annees_historique * 365.25 * 86400000).toISOString().slice(0, 10);
  const dans = (x) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && distanceM(zone.lat, zone.lon, x.lat, x.lon) <= zone.rayon_m;
  const exclus = [];
  const parCle = new Map();
  for (const e of etablissements || []) {
    if (!dans(e)) continue;
    if (e.etat !== 'actif' && !(e.date_fermeture && e.date_fermeture >= limite)) continue;
    if (horsMagasin(e.code_naf, P)) { exclus.push({ adresse: e.adresse, nom: nomDe(e), raison: 'vente hors magasin (marché, à distance) : pas de local' }); continue; }
    const cle = cleLocal(e.adresse);
    if (!cle) { exclus.push({ adresse: e.adresse, nom: nomDe(e), raison: 'adresse sans numéro : local inconnu' }); continue; }
    if (!parCle.has(cle)) parCle.set(cle, { cle, adresse: String(e.adresse).replace(/\s+\d{5}\s.*$/, ''), voie: voieDe(cle), etablissements: [], osm: [] });
    parCle.get(cle).etablissements.push(e);
  }
  // Une adresse où trop d'entreprises sont passées : domiciliation ou galerie.
  for (const [cle, l] of parCle) {
    const sirens = new Set(l.etablissements.map((e) => e.siren));
    if (sirens.size >= P.seuil_adresse_multiple) {
      exclus.push({ adresse: l.adresse, nom: `${sirens.size} entreprises`, raison: 'adresse de domiciliation ou galerie : trop d\'entreprises pour un seul local' });
      parCle.delete(cle);
    }
  }
  const locaux = [...parCle.values()];
  for (const l of locaux) {
    const pts = l.etablissements.filter((e) => Number.isFinite(e.lat));
    l.lat = pts.reduce((s, e) => s + e.lat, 0) / pts.length;
    l.lon = pts.reduce((s, e) => s + e.lon, 0) / pts.length;
  }
  // OpenStreetMap : rattaché au local de même adresse seulement (14 oct. 2026 : rattaché au plus proche,
  // un voisin passait pour le successeur). Sans adresse, il ne dit rien d'un local précis : il n'entre pas.
  for (const o of osm || []) {
    if (!dans(o)) continue;
    const cle = o.adresse ? cleLocal(o.adresse) : null;
    if (!cle) continue;
    const l = parCle.get(cle);
    if (l) l.osm.push(o);
    else if (cle) {
      const n = { cle, adresse: o.adresse, voie: voieDe(cle), etablissements: [], osm: [o], lat: o.lat, lon: o.lon };
      parCle.set(cle, n);
      locaux.push(n);
    }
  }

  for (const l of locaux) {
    const ouverts = l.etablissements.filter((e) => e.etat === 'actif');
    const fermes = l.etablissements.filter((e) => e.etat !== 'actif').sort((a, b) => String(b.date_fermeture).localeCompare(String(a.date_fermeture)));
    const osmOuverts = l.osm.filter((o) => !o.vacant);
    const osmVide = l.osm.some((o) => o.vacant);
    l.occupants = ouverts.map((e) => ({ nom: nomDe(e), naf: e.code_naf, depuis: e.date_creation, ei: estEI(e) }));
    l.dernier = fermes[0] ? { nom: nomDe(fermes[0]), naf: fermes[0].code_naf, ferme_le: fermes[0].date_fermeture } : null;
    l.osm_noms = l.osm.map((o) => (o.vacant ? 'local vide' : o.nom || o.type));
    if (ouverts.length) {
      if (osmVide && !osmOuverts.length) { l.etat = 'incertain'; l.raison = `Le registre y voit ${ouverts.map(nomDe).join(', ')} ouvert, OpenStreetMap le dit vide.`; }
      else {
        l.etat = 'occupe';
        l.confiance = ouverts.every(estEI) && !ouverts.some((e) => e.enseigne) && !osmOuverts.length ? 'moyenne' : 'forte';
        l.raison = `${ouverts.map(nomDe).join(', ')} ouvert${ouverts.length > 1 ? 's' : ''} (SIRENE${osmOuverts.length ? ', OpenStreetMap' : ''}).${l.confiance === 'moyenne' ? ' Entrepreneur individuel sans enseigne : peut-être une adresse personnelle.' : ''}`;
      }
    } else if (l.etablissements.length) {
      // OpenStreetMap y voit un commerce : si c'est le même que celui qui a fermé, la carte n'est pas à jour (vacant) ;
      // si c'en est un autre, un nouveau locataire que le registre range ailleurs (occupé) ; sans nom, on ne sait pas.
      const autres = osmOuverts.filter((o) => o.nom && !fermes.some((f) => memeCommerce(f.enseigne || f.denomination, o.nom)));
      const memes = osmOuverts.filter((o) => o.nom && fermes.some((f) => memeCommerce(f.enseigne || f.denomination, o.nom)));
      if (autres.length) { l.etat = 'occupe'; l.confiance = 'moyenne'; l.raison = `${autres.map((o) => o.nom).join(', ')} (OpenStreetMap) a pris la suite de ${l.dernier.nom}, fermé le ${l.dernier.ferme_le}.`; }
      else if (memes.length && memes.length === osmOuverts.length) { l.etat = 'vacant'; l.confiance = 'moyenne'; l.raison = `Le dernier occupant, ${l.dernier.nom}, a fermé le ${l.dernier.ferme_le} ; OpenStreetMap l'affiche encore, pas à jour.`; }
      else if (osmOuverts.length) { l.etat = 'incertain'; l.raison = `Le dernier occupant, ${l.dernier.nom}, a fermé le ${l.dernier.ferme_le} ; OpenStreetMap y voit un commerce sans nom (${osmOuverts.map((o) => o.type).join(', ')}).`; }
      else { l.etat = 'vacant'; l.confiance = osmVide ? 'forte' : 'moyenne'; l.raison = `Le dernier occupant, ${l.dernier.nom}, a fermé le ${l.dernier.ferme_le} ; aucun commerce n'y est ouvert depuis (SIRENE)${osmVide ? ', et OpenStreetMap le dit vide' : ''}.`; }
      // Google Maps tranche (v1.2) : ce qui est ouvert à cette adresse aujourd'hui.
      const g = google?.get(l.cle);
      if (g && l.etat !== 'occupe') {
        const ouvertsG = g.filter((x) => x.statut === 'OPERATIONAL' && !TYPES_ETAGE.has(x.type));
        const repreneurs = ouvertsG.filter((x) => !fermes.some((f) => memeCommerce(f.enseigne || f.denomination, x.nom)));
        const encore = ouvertsG.filter((x) => fermes.some((f) => memeCommerce(f.enseigne || f.denomination, x.nom)));
        l.google = ouvertsG.map((x) => x.nom);
        if (repreneurs.length) { l.etat = 'occupe'; l.confiance = 'forte'; l.raison = `${repreneurs.map((x) => x.nom).join(', ')} y est ouvert (Google Maps), après ${l.dernier.nom}, fermé le ${l.dernier.ferme_le}.`; }
        else if (encore.length) { l.etat = 'incertain'; l.raison = `${l.dernier.nom} a fermé au registre le ${l.dernier.ferme_le}, mais Google Maps l'affiche encore ouvert.`; }
        else { l.etat = 'vacant'; l.confiance = 'forte'; l.raison = `Le dernier occupant, ${l.dernier.nom}, a fermé le ${l.dernier.ferme_le} ; aucun commerce n'y est ouvert depuis, ni au registre ni sur Google Maps.`; }
      }
    } else if (osmVide && !osmOuverts.length) { l.etat = 'vacant'; l.confiance = 'moyenne'; l.raison = 'OpenStreetMap le dit vide ; le registre n\'y connaît aucun commerce.'; }
    else { l.etat = 'occupe'; l.confiance = 'moyenne'; l.raison = `${osmOuverts.map((o) => o.nom || o.type).join(', ')} (OpenStreetMap) ; le registre n'y connaît pas d'établissement.`; }
    l.distance_m = Math.round(distanceM(zone.lat, zone.lon, l.lat, l.lon));
    delete l.etablissements; delete l.osm;
  }

  const compter = (ls) => {
    const o = ls.filter((l) => l.etat === 'occupe').length;
    const v = ls.filter((l) => l.etat === 'vacant').length;
    const i = ls.filter((l) => l.etat === 'incertain').length;
    const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
    // Une seule règle, pour le total comme pour chaque rue : vacants / (vacants + occupés) ; les incertains
    // sont comptés à part, jamais au dénominateur. Plus de fourchette (14 oct. 2026) : celle des seuls
    // incertains passait pour une marge d'erreur, que la méthode n'a pas encore mesurée.
    const confirmes = ls.filter((l) => l.etat === 'vacant' && l.confiance === 'forte').length;
    return { locaux: ls.length, occupes: o, vacants: v, incertains: i, tranches: o + v, vacants_confirmes: confirmes, taux: pct(v, o + v), fiable: o + v >= P.locaux_min_taux };
  };
  const parVoie = new Map();
  for (const l of locaux) { if (!parVoie.has(l.voie)) parVoie.set(l.voie, []); parVoie.get(l.voie).push(l); }
  const rues = [...parVoie.entries()].filter(([, ls]) => ls.length >= P.locaux_min_rue).map(([voie, ls]) => ({ voie, ...compter(ls) })).sort((a, b) => b.locaux - a.locaux);
  locaux.sort((a, b) => ({ vacant: 0, incertain: 1, occupe: 2 }[a.etat] - { vacant: 0, incertain: 1, occupe: 2 }[b.etat]) || a.distance_m - b.distance_m);
  return { locaux, exclus, taux: compter(locaux), rues, parametres: { version: P.version, annees_historique: P.annees_historique, seuil_adresse_multiple: P.seuil_adresse_multiple } };
}

// --- Les sources, et leur cache -------------------------------------------------

db.exec(`CREATE TABLE IF NOT EXISTS vacance_recensement (
  code_commune TEXT PRIMARY KEY,
  donnees      TEXT,
  etat         TEXT,
  erreur       TEXT,
  charge_le    TEXT
)`);

const enCours = new Map();

/** Le recensement d'une commune : en base s'il a moins d'une semaine, sinon relu en tâche de fond. */
export function recensement(codeCommune, { forcer = false, P = P0 } = {}) {
  const code = String(codeCommune || '');
  const r = db.prepare('SELECT * FROM vacance_recensement WHERE code_commune = ?').get(code);
  const frais = r?.charge_le && Date.now() - Date.parse(r.charge_le) < P.recensement_jours * 86400000;
  if (r?.donnees && frais && !forcer) return { etat: 'pret', etablissements: JSON.parse(r.donnees), charge_le: r.charge_le };
  if (!enCours.has(code)) {
    db.prepare('INSERT INTO vacance_recensement (code_commune, etat, erreur) VALUES (?, ?, NULL) ON CONFLICT(code_commune) DO UPDATE SET etat = excluded.etat, erreur = NULL').run(code, 'chargement');
    enCours.set(code, chargerRecensement(code, P).finally(() => enCours.delete(code)));
  }
  // Un recensement plus ancien reste utilisable pendant qu'il se relit.
  if (r?.donnees) return { etat: 'pret', etablissements: JSON.parse(r.donnees), charge_le: r.charge_le, rafraichissement: true };
  return { etat: r?.etat === 'erreur' && r.erreur ? 'erreur' : 'chargement', erreur: r?.erreur || null };
}

async function chargerRecensement(code, P) {
  try {
    const S = await import('./vacance-sources.js');
    const limite = new Date(Date.now() - P.annees_historique * 365.25 * 86400000).toISOString().slice(0, 10);
    const tous = await S.vitrinesCommune(code, P.vitrines);
    const utiles = tous.filter((e) => e.etat === 'actif' || (e.date_fermeture && e.date_fermeture >= limite));
    // Le registre n'a pas toujours le point : la Géoplateforme le donne d'après l'adresse.
    for (const e of utiles.filter((x) => x.lat == null && x.adresse)) {
      try { const g = await S.geocoder(e.adresse); if (g?.precision === 'numero') { e.lat = g.lat; e.lon = g.lon; } } catch { /* sans point, il ne compte pas */ }
    }
    const garde = utiles.map(({ siret, siren, denomination, enseigne, adresse, code_naf, etat, date_fermeture, date_creation, lat, lon, categorie_juridique }) => ({ siret, siren, denomination, enseigne, adresse, code_naf, etat, date_fermeture, date_creation, lat, lon, categorie_juridique }));
    db.prepare('UPDATE vacance_recensement SET donnees = ?, etat = ?, erreur = NULL, charge_le = ? WHERE code_commune = ?').run(JSON.stringify(garde), 'pret', new Date().toISOString(), code);
    console.log(`[vacance-taux] ${code} : ${garde.length} établissements à vitrine recensés`);
  } catch (e) {
    db.prepare('UPDATE vacance_recensement SET etat = ?, erreur = ? WHERE code_commune = ?').run('erreur', String(e?.message || e).slice(0, 300), code);
    console.warn(`[vacance-taux] ${code} : ${e?.message || e}`);
  }
}

// OpenStreetMap (Overpass) : les commerces et les locaux vides autour. Gardés une semaine en base,
// et lus sur trois serveurs à tour de rôle : un taux ne se calcule jamais sans eux (sans OpenStreetMap,
// il change de plusieurs points : ce ne serait plus la même méthode).
db.exec(`CREATE TABLE IF NOT EXISTS vacance_osm (cle TEXT PRIMARY KEY, donnees TEXT, lu_le TEXT)`);
const SERVEURS_OSM = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const AMENITES = 'restaurant|cafe|bar|pub|fast_food|ice_cream|pharmacy|bank|bureau_de_change';

/** Pure : un élément Overpass tel que le taux le lit. */
export function lireOsm(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat; const lon = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const vacant = t.shop === 'vacant' || t.vacant === 'yes' || !!t['disused:shop'] || !!t['disused:amenity'] || !!t['was:shop'];
  const type = t.shop || t.amenity || t['disused:shop'] || t['was:shop'] || 'commerce';
  const adresse = t['addr:housenumber'] && t['addr:street'] ? `${t['addr:housenumber']} ${t['addr:street']}` : null;
  return { nom: t.name || null, type, vacant, adresse, lat, lon };
}

export async function osmAutour(lat, lon, rayon) {
  const cle = `${lat.toFixed(4)}|${lon.toFixed(4)}|${rayon}`;
  const c = db.prepare('SELECT * FROM vacance_osm WHERE cle = ?').get(cle);
  if (c && Date.now() - Date.parse(c.lu_le) < 7 * 86400000) return JSON.parse(c.donnees);
  const a = `(around:${Math.round(rayon)},${lat},${lon})`;
  const q = `[out:json][timeout:25];(nwr["shop"]${a};nwr["amenity"~"^(${AMENITES})$"]${a};nwr["disused:shop"]${a};nwr["was:shop"]${a};nwr["vacant"="yes"]${a};);out center tags;`;
  let derniere = null;
  for (const url of SERVEURS_OSM) {
    try {
      const r = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'user-agent': 'Klocka/1.0 (sourcing@klocka.immo)' }, signal: AbortSignal.timeout(40000) });
      if (!r.ok) { derniere = `${new URL(url).host} a répondu ${r.status}`; continue; }
      const liste = ((await r.json()).elements || []).map(lireOsm).filter(Boolean);
      db.prepare('INSERT INTO vacance_osm (cle, donnees, lu_le) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET donnees = excluded.donnees, lu_le = excluded.lu_le').run(cle, JSON.stringify(liste), new Date().toISOString());
      return liste;
    } catch (e) { derniere = `${new URL(url).host} : ${e?.message || e}`; }
  }
  // Tous en panne : une lecture plus ancienne vaut mieux que rien, elle est dite.
  if (c) return JSON.parse(c.donnees);
  throw new Error(`OpenStreetMap ne répond pas (${derniere}).`);
}

// Google Maps (Places, recherche autour) : les lieux à 25 m du local, gardés un mois par local.
db.exec(`CREATE TABLE IF NOT EXISTS vacance_google (cle TEXT PRIMARY KEY, donnees TEXT, lu_le TEXT)`);
export const COUT_GOOGLE_USD = 0.032;
async function googleAuLocal(cle, lat, lon) {
  const c = db.prepare('SELECT * FROM vacance_google WHERE cle = ?').get(cle);
  if (c && Date.now() - Date.parse(c.lu_le) < 30 * 86400000) return { places: JSON.parse(c.donnees), garde: true };
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': (process.env.GOOGLE_MAPS_SERVEUR || '').trim(), 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.businessStatus,places.primaryType' },
    body: JSON.stringify({ maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'fr', regionCode: 'FR', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 25 } } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Google Maps a répondu ${r.status}`);
  const tous = ((await r.json()).places || []).map((p) => ({ nom: p.displayName?.text || null, adresse: p.formattedAddress || null, statut: p.businessStatus || null, type: p.primaryType || null }));
  // Seuls ceux de cette adresse-là parlent de ce local.
  const ici = tous.filter((p) => p.adresse && cleLocal(p.adresse) === cle);
  db.prepare('INSERT INTO vacance_google (cle, donnees, lu_le) VALUES (?, ?, ?) ON CONFLICT(cle) DO UPDATE SET donnees = excluded.donnees, lu_le = excluded.lu_le').run(cle, JSON.stringify(ici), new Date().toISOString());
  return { places: ici, garde: false };
}

/**
 * Le taux de vacance autour d'un point. Rend { statut: 202, etat: 'chargement' }
 * tant que la commune se recense (une à deux minutes la première fois).
 */
export async function tauxDeVacance(q = {}, { P = P0 } = {}) {
  const lat = Number(q.lat); const lon = Number(q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, statut: 400, error: 'Choisissez une adresse dans les propositions.' };
  const rayon = Math.round(Number(q.rayon_m ?? P.rayon_defaut_m));
  if (!Number.isFinite(rayon) || rayon < P.rayon_min_m || rayon > P.rayon_max_m) return { ok: false, statut: 400, error: `Le rayon va de ${P.rayon_min_m} à ${P.rayon_max_m} m.` };
  const code = String(q.commune || '').trim();
  if (!code) return { ok: false, statut: 400, error: 'Commune inconnue : choisissez l\'adresse dans les propositions.' };
  const rec = recensement(code, { forcer: q.relire === '1' });
  if (rec.etat === 'erreur') return { ok: false, statut: 502, error: rec.erreur || 'Le recensement de la commune a échoué.' };
  if (rec.etat !== 'pret') return { ok: true, statut: 202, etat: 'chargement' };
  let osm;
  try { osm = await osmAutour(lat, lon, rayon); } catch (e) { return { ok: false, statut: 503, error: `${e?.message || e} Le taux ne se calcule pas sans OpenStreetMap : réessayez dans quelques minutes.` }; }
  const zoneQ = { lat, lon, rayon_m: rayon };
  const premier = etatsDesLocaux(rec.etablissements, osm, zoneQ, { P });
  // Chaque local que le registre dit vide, vérifié sur Google Maps (le premier passage seulement ; ensuite gardé un mois).
  const candidats = premier.locaux.filter((l) => l.etat !== 'occupe' && l.dernier).slice(0, 200);
  const google = new Map();
  let appels = 0; let echecs = 0;
  if ((process.env.GOOGLE_MAPS_SERVEUR || '').trim()) {
    for (let i = 0; i < candidats.length; i += 5) {
      await Promise.all(candidats.slice(i, i + 5).map(async (l) => {
        try { const g = await googleAuLocal(l.cle, l.lat, l.lon); google.set(l.cle, g.places); if (!g.garde) appels += 1; } catch { echecs += 1; }
      }));
    }
  }
  const r = etatsDesLocaux(rec.etablissements, osm, zoneQ, { P, google });
  return { ok: true, statut: 200, ...r, recense_le: rec.charge_le, osm: { commerces: osm.length }, google: { verifies: google.size, candidats: candidats.length, echecs, appels, cout_usd: Math.round(appels * COUT_GOOGLE_USD * 100) / 100 }, zone: { ...zoneQ, commune: code } };
}
