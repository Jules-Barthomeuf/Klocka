// Off-market, le mode Simple (spec de Jules du 11 oct. 2026). On part des
// commerces, pas des murs : chaque établissement actif de la ville (SIRENE)
// est un point sur la carte, dès qu'on choisit la ville. En tâche de fond, on
// remonte pour chacun l'exploitant et ses dirigeants (registre des
// entreprises), le propriétaire des murs (cadastre des personnes morales),
// le lien entre les deux, et les drapeaux qui disent pourquoi il vendrait.
// Le mode Simple a ses propres données (CommerceSimple) et sa propre liste
// d'appels (AppelSimple) : rien n'en passe au mode Avancé.

import { Records } from '../db.js';
import { etablissementsAutour, refusRecent, societe } from '../alx/annuaire.js';
import { piedDImmeuble, cleRue, rueDe, etablissementDe } from '../alx/commerces.js';
import { proprietairesDe as proprietairesOuverts, choisirProprietaire } from '../alx/foncier-ouvert.js';
import { resoudreAdresse } from '../adresse-ban.js';
import { rueLisible, nomLisible, personneLisible, societeLisible } from './casse.js';
import { zoneDuPoint } from './zones.js';

export const COMMERCE = 'CommerceSimple';
export const APPEL = 'AppelSimple';
export const PRIX_RUE = 'PrixRueSimple';
// Les bornes d'une surface de local commercial : en deçà ou au-delà, la source s'est trompée.
export const SURFACE_MIN = 15;
export const SURFACE_MAX = 2000;
const VILLE = 'Ville';
const maintenant = () => new Date().toISOString();
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
/** Pure : numéro et rue d'une adresse, complète ou courte (« 12 Rue Carnot »). */
export function numeroRue(texte) {
  const r = rueDe(String(texte || ''));
  if (r?.rue) return { numero: r.numero || null, rue: r.rue };
  const m = String(texte || '').trim().match(/^(\d+\s?(?:bis|ter|quater)?)\s+(.+?)(?:,|\s+\d{5}\b|$)/i);
  return m ? { numero: m[1].replace(/\s/g, ''), rue: m[2] } : { numero: null, rue: null };
}
const MOTS_VIDES = new Set(['SCI', 'SARL', 'SAS', 'SASU', 'EURL', 'SA', 'SNC', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'SOCIETE', 'CIVILE', 'IMMOBILIERE', 'IMMO', 'GROUPE', 'HOLDING', 'FAMILLE', 'MADAME', 'MONSIEUR', 'MME', 'M']);

// ---------------------------------------------------------------------------
// Les règles pures : le lien exploitant / propriétaire, les drapeaux
// ---------------------------------------------------------------------------

/** Pure : le nom de famille d'un dirigeant (« DURAND Jean » ou « Jean DURAND » → DURAND). */
export const nomDeFamille = (g) => {
  if (g?.nom_famille) return norm(g.nom_famille);
  const mots = norm(g?.nom).split(' ').filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
  return mots.find((m) => m === m.toUpperCase() && m.length > 2) || mots[0] || '';
};
const personneCle = (g) => norm(g?.nom);

/**
 * Pure : le lien entre l'exploitant et le propriétaire des murs, dans l'ordre
 * de la spec : même SIREN ; même dirigeant ; même nom de famille, siège à
 * l'adresse ou dénomination qui contient l'enseigne ; sinon tiers ; sinon inconnu.
 */
export function lierProprietaire({ exploitant = null, proprietaire = null, enseigne = null, adresse = null } = {}) {
  if (!proprietaire?.nom) return { lien: 'inconnu', motif: 'propriétaire non trouvé' };
  if (exploitant?.siren && proprietaire.siren && exploitant.siren === proprietaire.siren) return { lien: 'exploitant_certain', motif: 'même SIREN' };
  const gE = (exploitant?.gerants || []).filter((g) => !g.personne_morale);
  const gP = (proprietaire.gerants || []).filter((g) => !g.personne_morale);
  const commun = gE.find((a) => gP.some((b) => personneCle(a) && personneCle(a) === personneCle(b)));
  if (commun) return { lien: 'exploitant_certain', motif: `même dirigeant : ${commun.nom}` };
  const famille = gE.map(nomDeFamille).filter((f) => f.length > 2).find((f) => gP.some((b) => nomDeFamille(b) === f) || norm(proprietaire.nom).split(' ').includes(f));
  if (famille) return { lien: 'exploitant_probable', motif: `même nom de famille : ${famille}` };
  const ici = numeroRue(adresse);
  const siege = proprietaire.siege?.adresse ? numeroRue(proprietaire.siege.adresse) : null;
  if (siege?.rue && ici.rue && cleRue(siege.rue) === cleRue(ici.rue) && String(siege.numero || '') === String(ici.numero || '') && ici.numero) return { lien: 'exploitant_probable', motif: 'le siège du propriétaire est à cette adresse' };
  const marque = [enseigne, exploitant?.nom].map(norm).filter((m) => m.length >= 4).find((m) => norm(proprietaire.nom).includes(m) || m.includes(norm(proprietaire.nom)));
  if (marque) return { lien: 'exploitant_probable', motif: 'la dénomination du propriétaire reprend l\'enseigne' };
  return { lien: 'tiers', motif: 'bailleur distinct de l\'exploitant' };
}

const annees = (date, maintenantMs) => (date ? (maintenantMs - Date.parse(date)) / (365.25 * 86400000) : null);

/**
 * Pure : le texte d'un signal en bon français (24 oct. 2026, Jules : « Propriétaire créé il y a 43 ans, c'est pas
 * français »). Les signaux déjà enregistrés avec l'ancienne tournure se relisent ainsi, sans réécrire la base.
 */
export const texteDrapeau = (t) => String(t || '').replace(/^Propriétaire créé il y a (\d+) ans?/, (_, n) => `Société propriétaire créée il y a ${n} ans`);

/** Pure : pourquoi il vendrait. Chaque drapeau porte sa source et sa date. */
export function drapeauxDe(c, { maintenantMs = Date.now() } = {}) {
  const out = [];
  const ex = c.exploitant || {};
  const pr = c.proprietaire || {};
  const gerants = (ex.gerants || []).filter((g) => !g.personne_morale);
  if (gerants.some((g) => g.tranche_age === '70+')) out.push({ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus (le registre ne donne que des tranches)', source: 'Registre des entreprises', date: ex.lu_le || null });
  const ev = c.evenements || [];
  const cession = ev.find((e) => /cession|vente/i.test(String(e.type || '')) && annees(e.date, maintenantMs) <= 2);
  if (cession) out.push({ cle: 'fonds_cede', texte: `Fonds cédé en ${String(cession.date).slice(0, 7)}${c.lien === 'tiers' ? ', les murs restent au bailleur' : ''}`, source: 'BODACC', date: cession.date });
  if (c.actif === false || ex.active === false) out.push({ cle: 'ferme', texte: 'Établissement fermé ou société radiée', source: 'Registre des entreprises', date: ex.fermee_le || c.lu_le || null });
  const transmission = ev.find((e) => /transmission|succession|d[ée]c[èe]s|dissolution/i.test(String(e.type || '')) && annees(e.date, maintenantMs) <= 2);
  if (transmission) out.push({ cle: 'transmission', texte: `${transmission.type} annoncée en ${String(transmission.date).slice(0, 7)}`, source: 'BODACC', date: transmission.date });
  // Une collectivité ou un bailleur social ne vend pas parce que sa SCI a 30 ans.
  const brute = /\b(COMMUNE|VILLE DE|DEPARTEMENT|REGION|ETAT|OPH|HABITAT|HLM|METROPOLE|COMMUNAUTE)\b/i.test(String(pr.nom || '')) ? null : annees(pr.creation, maintenantMs);
  // Au-delà de 90 ans, c'est une date de création par défaut (1900), pas une détention.
  const detention = brute != null && brute > 90 ? null : brute;
  if (detention != null && detention >= 30) out.push({ cle: 'detention_30', texte: `Société propriétaire créée il y a ${Math.floor(detention)} ans`, source: 'Registre des entreprises', date: pr.creation });
  else if (detention != null && detention >= 22) out.push({ cle: 'detention_22', texte: `Société propriétaire créée il y a ${Math.floor(detention)} ans`, source: 'Registre des entreprises', date: pr.creation });
  return out;
}

// ---------------------------------------------------------------------------
// La ville : tous les commerces, vite
// ---------------------------------------------------------------------------

// Les codes NAF du commerce en pied d'immeuble (les préfixes de commerces.js, en codes complets) :
// demandés à l'annuaire, pour ne pas recevoir les dix mille micro-entreprises du centre-ville.
export const NAF_COMMERCE = ['47.11A', '47.11B', '47.11C', '47.11D', '47.11E', '47.11F', '47.19A', '47.19B', '47.21Z', '47.22Z', '47.23Z', '47.24Z', '47.25Z', '47.26Z', '47.29Z', '47.30Z', '47.41Z', '47.42Z', '47.43Z', '47.51Z', '47.52A', '47.52B', '47.53Z', '47.54Z', '47.59A', '47.59B', '47.61Z', '47.62Z', '47.63Z', '47.64Z', '47.65Z', '47.71Z', '47.72A', '47.72B', '47.73Z', '47.74Z', '47.75Z', '47.76Z', '47.77Z', '47.78A', '47.78B', '47.78C', '47.79Z', '56.10A', '56.10B', '56.10C', '56.21Z', '56.30Z', '10.71A', '10.71B', '10.71C', '10.71D', '10.13B', '10.52Z', '10.85Z', '96.01B', '96.02A', '96.02B', '96.04Z', '95.21Z', '95.23Z', '95.25Z', '95.29Z', '64.19Z', '66.22Z', '68.31Z', '79.11Z', '85.53Z', '93.13Z', '74.20Z'];
// Les autres classes d'actif (26 oct. 2026, Jules : « on filtre la classe d'actif ») : les bureaux (les sociétés qui
// occupent un plateau : conseil, informatique, avocats, experts-comptables, architectes, finance, assurances, agences) et
// les entrepôts (logistique, messagerie, grossistes avec stock). Lus comme les commerces, par leurs codes NAF ; le
// propriétaire des murs (cadastre des personnes morales) et les signaux marchent pareil.
export const NAF_BUREAU = ['58.29A', '58.29B', '58.29C', '62.01Z', '62.02A', '62.02B', '62.03Z', '62.09Z', '63.11Z', '63.12Z', '64.19Z', '64.20Z', '64.30Z', '64.92Z', '64.99Z', '65.11Z', '65.12Z', '66.12Z', '66.19A', '66.19B', '66.21Z', '66.22Z', '66.29Z', '66.30Z', '68.31Z', '68.32A', '69.10Z', '69.20Z', '70.10Z', '70.21Z', '70.22Z', '71.11Z', '71.12A', '71.12B', '71.20A', '71.20B', '73.11Z', '73.12Z', '73.20Z', '74.10Z', '74.90A', '74.90B', '78.10Z', '78.20Z', '78.30Z', '82.11Z', '82.19Z', '82.20Z', '82.99Z'];
export const NAF_ENTREPOT = ['49.41A', '49.41B', '49.42Z', '52.10A', '52.10B', '52.29A', '52.29B', '53.20Z', '46.31Z', '46.32A', '46.32B', '46.32C', '46.33Z', '46.34Z', '46.36Z', '46.37Z', '46.38A', '46.38B', '46.39A', '46.39B', '46.41Z', '46.42Z', '46.43Z', '46.44Z', '46.45Z', '46.46Z', '46.47Z', '46.48Z', '46.49Z', '46.51Z', '46.52Z', '46.61Z', '46.62Z', '46.63Z', '46.64Z', '46.65Z', '46.66Z', '46.69A', '46.69B', '46.69C', '46.71Z', '46.72Z', '46.73A', '46.73B', '46.74A', '46.74B', '46.75Z', '46.76Z', '46.77Z', '46.90Z'];
export const CLASSES = { commerce: 'Commerce', bureau: 'Bureaux', entrepot: 'Entrepôt' };
const LIBELLES_HORS_COMMERCE = {
  '5829A': 'Éditeur de logiciels', '5829B': 'Éditeur de logiciels', '5829C': 'Éditeur de logiciels', '6201Z': 'Informatique', '6202A': 'Conseil informatique', '6202B': 'Conseil informatique', '6203Z': 'Informatique', '6209Z': 'Informatique',
  '6311Z': 'Hébergement informatique', '6312Z': 'Portail internet', '6419Z': 'Banque', '6420Z': 'Holding', '6430Z': 'Fonds de placement', '6492Z': 'Crédit', '6499Z': 'Finance', '6511Z': 'Assurance', '6512Z': 'Assurance',
  '6612Z': 'Courtage financier', '6619A': 'Services financiers', '6619B': 'Services financiers', '6621Z': 'Expertise en assurance', '6622Z': 'Courtage en assurance', '6629Z': 'Assurance', '6630Z': 'Gestion de fonds', '6831Z': 'Agence immobilière', '6832A': 'Administration de biens',
  '6910Z': "Cabinet d'avocats", '6920Z': 'Expert-comptable', '7010Z': 'Siège social', '7021Z': 'Relations publiques', '7022Z': 'Conseil en entreprise', '7111Z': "Cabinet d'architectes", '7112A': 'Géomètre', '7112B': "Bureau d'études", '7120A': 'Contrôle technique', '7120B': 'Laboratoire d\'analyses',
  '7311Z': 'Agence de publicité', '7312Z': 'Régie publicitaire', '7320Z': 'Études de marché', '7410Z': 'Design', '7490A': 'Conseil', '7490B': 'Conseil', '7810Z': 'Recrutement', '7820Z': 'Intérim', '7830Z': 'Ressources humaines', '8211Z': 'Services administratifs', '8219Z': 'Secrétariat', '8220Z': "Centre d'appels", '8299Z': 'Services aux entreprises',
  ...Object.fromEntries(NAF_ENTREPOT.filter((c) => c.startsWith('46')).map((c) => [c.replace('.', ''), 'Grossiste'])),
  '4941A': 'Transport routier', '4941B': 'Transport routier', '4942Z': 'Déménagement', '5210A': 'Entreposage frigorifique', '5210B': 'Entreposage', '5229A': 'Messagerie', '5229B': 'Affrètement', '5320Z': 'Messagerie',
};
const sansPoint = (code) => String(code || '').replace(/\./g, '').toUpperCase();
/** Pure : la classe d'actif d'un code NAF (commerce de pied d'immeuble, bureau, entrepôt), ou null. */
export function classeDeCode(code) {
  const c = sansPoint(code);
  if (!c) return null;
  if (piedDImmeuble(c).oui) return 'commerce';
  if (NAF_BUREAU.some((x) => sansPoint(x) === c)) return 'bureau';
  if (NAF_ENTREPOT.some((x) => sansPoint(x) === c)) return 'entrepot';
  return null;
}
const NEAR_POINT = 'https://recherche-entreprises.api.gouv.fr/near_point';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Les commerces actifs autour d'un point : near_point avec la liste des codes
 * NAF du commerce, pages lues quatre par quatre (l'annuaire tolère sept
 * appels par seconde). Rend les établissements à plat.
 */
async function lireCercle({ lat, lon, rayon_km, codes, lire, parallele, maxPages, decouper = false }) {
  const page = async (n) => {
    const params = new URLSearchParams({ lat: String(lat), long: String(lon), radius: String(rayon_km), activite_principale: codes.join(','), etat_administratif: 'A', per_page: '25', page: String(n) });
    // Trop d'appels (429), une erreur passagère (5xx) ou une page qui ne répond pas : trois essais, de plus en plus
    // espacés (24 oct. 2026 : un 503 de l'annuaire faisait tomber la lecture de toute une ville).
    let derniere = null;
    for (let essai = 0; essai < 3; essai += 1) {
      let r;
      try {
        r = await lire(`${NEAR_POINT}?${params}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      } catch (e) {
        derniere = /abort|timeout/i.test(`${e?.name} ${e?.message}`) ? "L'annuaire ne répond pas" : (e?.message || String(e));
        await attendre(2000 * (essai + 1));
        continue;
      }
      if (r.status === 429) { derniere = "L'annuaire limite les appels : réessayez dans une minute."; await attendre(1500); continue; }
      if (r.status >= 500) { derniere = `L'annuaire a répondu ${r.status}`; await attendre(2000 * (essai + 1)); continue; }
      if (!r.ok) throw new Error(`L'annuaire a répondu ${r.status}`);
      return r.json();
    }
    throw new Error(derniere || "L'annuaire limite les appels : réessayez dans une minute.");
  };
  const premiere = await page(1);
  // L'annuaire s'arrête à 10 000 résultats par recherche (26 oct. 2026 : Lyon les atteint pour chaque classe d'actif) :
  // un cercle saturé qu'on va découper ne se lit pas en entier.
  const sature = Number(premiere.total_results) >= 10000 || Number(premiere.total_pages) > maxPages;
  if (sature && decouper) return { out: [], sature };
  const total = Math.min(Number(premiere.total_pages) || 1, maxPages);
  const pages = [premiere];
  for (let n = 2; n <= total; n += parallele) {
    const lot = [];
    for (let k = n; k < n + parallele && k <= total; k += 1) lot.push(page(k));
    pages.push(...(await Promise.all(lot)));
    await attendre(80);
  }
  const out = [];
  const vus = new Set();
  for (const p of pages) for (const u of p.results || []) for (const e of u.matching_etablissements || []) {
    const x = etablissementDe(u, e);
    if (!x.siret || vus.has(x.siret) || !x.actif) continue;
    vus.add(x.siret);
    out.push(x);
  }
  return { out, sature };
}

/** Pure : quatre cercles de rayon r/√2 centrés à ±r/2 qui couvrent le cercle de rayon r. */
export function quartiers({ lat, lon, rayon_km }) {
  const dLat = rayon_km / 2 / 111.32;
  const dLon = rayon_km / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = Math.round((rayon_km / Math.SQRT2) * 1000) / 1000;
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ({ lat: lat + a * dLat, lon: lon + b * dLon, rayon_km: r }));
}

const distanceKm = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
};

/**
 * Les établissements actifs autour d'un point, pour une liste de codes NAF. Quand l'annuaire plafonne (10 000
 * résultats), le cercle se découpe en quatre, jusqu'à trois fois : rien n'est perdu dans une grande ville. Les
 * quartiers débordent du cercle de départ : ce qui tombe dehors est écarté.
 */
export async function etablissementsCommerce({ lat, lon, rayon_km = 2.5, codes = NAF_COMMERCE, lire = fetch, parallele = 6, maxPages = 400, profondeur = 3 } = {}) {
  const centre = { lat, lon };
  const vus = new Set();
  const out = [];
  const lireZone = async (zone, reste) => {
    const { out: lus, sature } = await lireCercle({ ...zone, codes, lire, parallele, maxPages, decouper: reste > 0 });
    if (sature && reste > 0) { for (const q of quartiers(zone)) await lireZone(q, reste - 1); return; }
    for (const e of lus) {
      if (vus.has(e.siret)) continue;
      if (e.lat != null && e.lon != null && distanceKm(centre, e) > rayon_km) continue;
      vus.add(e.siret);
      out.push(e);
    }
  };
  await lireZone({ lat, lon, rayon_km }, profondeur);
  return out;
}

const rayonDe = (ville) => (ville.locaux > 2000 || /^(lyon|marseille|paris|toulouse|nice|nantes|bordeaux|lille)$/i.test(ville.nom) ? 4 : 2.5);

/** Pure : un établissement SIRENE en commerce du mode Simple (sans les enrichissements). */
export const commerceDepuisEtablissement = (e, villeId) => ({
  ville_id: villeId, siret: e.siret, siren: e.siren, nom: e.nom, enseigne: e.enseigne || null, ape: e.ape, activite: e.activite, adresse: e.adresse, numero: e.numero, rue: e.rue, cle_rue: e.cle_rue,
  code_postal: e.code_postal, ville: e.ville, lat: e.lat, lon: e.lon, depuis: e.depuis, actif: e.actif !== false, chaine: !!e.chaine,
});

/** Lit (ou relit) tous les commerces actifs d'une ville. Rend vite : les points d'abord, le reste en fond. */
export async function lireVilleSimple(villeId, { journal = () => {}, forcer = false, lister = etablissementsCommerce } = {}) {
  const v = Records.get(VILLE, villeId);
  if (!v?.centre?.lat) return { ok: false, error: 'Ville sans centre.' };
  const deja = Records.filter(COMMERCE, { ville_id: villeId });
  if (deja.length && !forcer && v.simple?.lu_le && Date.now() - Date.parse(v.simple.lu_le) < 30 * 86400000) { lancerZonesPuisGoogle(villeId); return { ok: true, n: deja.length, deja: true }; }
  const t0 = Date.now();
  // Les commerces, puis les bureaux et les entrepôts (26 oct. 2026) : trois lectures, une par classe d'actif.
  const lu = [];
  for (const codes of [NAF_COMMERCE, NAF_BUREAU, NAF_ENTREPOT]) lu.push(...await lister({ lat: v.centre.lat, lon: v.centre.lon, rayon_km: rayonDe(v), codes }));
  const etabs = lu;
  const parSiret = new Map(deja.map((c) => [c.siret, c]));
  const vus = new Set();
  let n = 0;
  for (const e of etabs) {
    const classe = e.siret && e.lat ? classeDeCode(e.ape) : null;
    if (!classe || vus.has(e.siret)) continue;
    vus.add(e.siret);
    // Un bureau ou un entrepôt n'a pas de mot dans la liste des commerces : son activité se dit ici.
    const base = { ...commerceDepuisEtablissement(e, villeId), classe, ...(classe !== 'commerce' ? { activite: LIBELLES_HORS_COMMERCE[sansPoint(e.ape)] || e.activite } : {}) };
    const ancien = parSiret.get(e.siret);
    if (ancien) Records.update(COMMERCE, ancien.id, { ...base, etat_recherche: ancien.etat_recherche || 'a_faire' });
    else Records.create(COMMERCE, { ...base, etat_recherche: 'a_faire', cree_le: maintenant() });
    n += 1;
  }
  Records.update(VILLE, villeId, { simple: { ...(v.simple || {}), lu_le: maintenant(), n, ms: Date.now() - t0 } });
  journal(`${v.nom} : ${n} commerces en ${Date.now() - t0} ms.`);
  demarrerFond(villeId);
  lancerZonesPuisGoogle(villeId);
  return { ok: true, n, ms: Date.now() - t0 };
}

/** Les zones commerçantes d'abord (une question au modèle, une fois par ville), puis Google Maps dans ces zones. */
const zonesEnCours = new Set();
export function lancerZonesPuisGoogle(villeId) {
  if (process.env.NODE_TEST_CONTEXT || zonesEnCours.has(villeId)) return false;
  if (Records.get(VILLE, villeId)?.simple?.zones_le) return lancerGoogle(villeId);
  zonesEnCours.add(villeId);
  import('./zones.js').then(({ zonesDeLaVille }) => zonesDeLaVille(villeId, { journal: (t) => console.log(`[off-market] ${t}`) }))
    .catch((e) => console.log(`[off-market] zones : ${e?.message || e}`))
    .finally(() => { zonesEnCours.delete(villeId); lancerGoogle(villeId); });
  return true;
}

/**
 * Google Maps en plus du registre (places-ville.js), en tâche de fond : une
 * fois par mois et par ville, ou quand on le redemande. Les vitrines nouvelles
 * passent ensuite par la même recherche du propriétaire.
 */
const googleEnCours = new Set();
export function lancerGoogle(villeId, { forcer = false } = {}) {
  if (process.env.NODE_TEST_CONTEXT || googleEnCours.has(villeId)) return false;
  const g = Records.get(VILLE, villeId)?.simple?.google;
  if (!forcer && g && (g.etat === 'en_cours' ? Date.now() - Date.parse(g.depuis) < 30 * 60000 : g.fini_le && Date.now() - Date.parse(g.fini_le) < 90 * 86400000)) return false; // Google Maps : un passage tous les 90 jours (coûts, 11 oct. 2026).
  googleEnCours.add(villeId);
  import('./places-ville.js').then(({ balayerVille }) => balayerVille(villeId, { journal: (t) => console.log(`[off-market] ${t}`) }))
    .then((r) => { if (r?.ajoutes) demarrerFond(villeId); if (r && !r.ok) Records.update(VILLE, villeId, { simple: { ...(Records.get(VILLE, villeId)?.simple || {}), google: { etat: 'erreur', erreur: r.error, fini_le: maintenant() } } }); })
    .catch((e) => console.log(`[off-market] Google Maps : ${e?.message || e}`))
    .finally(() => googleEnCours.delete(villeId));
  return true;
}

// ---------------------------------------------------------------------------
// Le centre-ville (11 oct. 2026, Jules : « que les centres-villes, pas les
// quartiers pavillonnaires ») : un commerce est au centre quand il a beaucoup
// de commerces autour de lui (150 m), ou qu'il est sur une rue classée
// emplacement 1 ou 1 bis. Les chemins, routes, zones d'activité et galeries
// commerciales n'en sont pas, sauf densité très forte.
// ---------------------------------------------------------------------------

const RAYON_CENTRE_M = 150;
const HORS_CENTRE = /\b(chemin|chem|route|rte|impasse|imp|lotissement|lot|za|zi|zac|zae|zone|ccial|centre commercial|galerie marchande|rond point|parc d activites|rn|rd)\b/i;

/** Pure : le nombre de commerces à moins de 150 m de chacun (grille de 150 m, cellules voisines seulement). */
export function densites(liste) {
  const cellule = (c) => `${Math.floor(c.lat / 0.00135)}:${Math.floor(c.lon / (0.00135 / Math.cos((c.lat * Math.PI) / 180)))}`;
  const grille = new Map();
  for (const c of liste) { if (!Number.isFinite(c.lat)) continue; const k = cellule(c); if (!grille.has(k)) grille.set(k, []); grille.get(k).push(c); }
  const d = (a, b) => 6371000 * Math.hypot(((b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180) * Math.PI) / 180, ((b.lat - a.lat) * Math.PI) / 180);
  const n = new Map();
  for (const c of liste) {
    if (!Number.isFinite(c.lat)) { n.set(c.id, 0); continue; }
    const [i, j] = cellule(c).split(':').map(Number);
    let k = 0;
    for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) for (const o of grille.get(`${i + di}:${j + dj}`) || []) if (o !== c && d(c, o) <= RAYON_CENTRE_M) k += 1;
    n.set(c.id, k);
  }
  return n;
}

/** Pure : le seuil de densité d'une ville : la médiane de ses commerces, au moins 15. */
export const seuilCentre = (valeurs) => { const t = [...valeurs].sort((a, b) => a - b); return Math.max(15, t.length ? t[Math.floor(t.length * 0.45)] : 15); };

// Le centre-ville d'une ville, gardé tant qu'elle n'est ni relue ni redécoupée (26 oct. 2026 : 4,7 s pour les 58 000
// points de Lyon, à chaque ouverture de Mon secteur). Une douzaine de villes au plus.
const centres = new Map();
const cleCentre = (liste, ville) => `${liste.length}|${ville?.simple?.lu_le || ''}|${ville?.simple?.zones_le || ''}|${(ville?.simple?.zones || []).length}|${(ville?.rues || []).length}`;

/** Les commerces du centre-ville d'une liste (identifiants), avec leur densité ; gardé par ville. */
export function centreVille(liste, ville = null) {
  if (!ville?.id || process.env.NODE_TEST_CONTEXT) return calculerCentre(liste, ville);
  const cle = cleCentre(liste, ville);
  const deja = centres.get(ville.id);
  if (deja?.cle === cle) return deja.r;
  const r = calculerCentre(liste, ville);
  centres.delete(ville.id);
  centres.set(ville.id, { cle, r });
  if (centres.size > 12) centres.delete(centres.keys().next().value);
  return r;
}

/** Pure : les commerces du centre-ville d'une liste (identifiants), avec leur densité. */
export function calculerCentre(liste, ville = null) {
  const n = densites(liste);
  // Les zones commerçantes de la ville (zones.js) font foi quand on les a : un commerce y est, ou n'y est pas.
  const zones = ville?.simple?.zones || [];
  if (zones.length) {
    const centre = new Set();
    const zoneDe = new Map();
    for (const c of liste) { const z = zoneDuPoint(c, zones); if (z) { centre.add(c.id); zoneDe.set(c.id, z); } }
    return { centre, densite: n, seuil: null, zoneDe };
  }
  const seuil = seuilCentre([...n.values()]);
  const classes = new Map((ville?.rues || []).filter((r) => r?.nom).map((r) => [cleRue(r.nom), Number(r.classe)]));
  const centre = new Set();
  for (const c of liste) {
    const k = n.get(c.id) || 0;
    const rue = numeroRue(c.adresse).rue || c.rue;
    const classe = rue ? classes.get(cleRue(rue)) : null;
    const horsCentre = HORS_CENTRE.test(norm(c.adresse).toLowerCase());
    if (classe === 1 || classe === 1.5 || (k >= seuil && (!horsCentre || k >= seuil * 2))) centre.add(c.id);
  }
  return { centre, densite: n, seuil };
}

/** Pure : la forme compacte d'un commerce, pour la carte et la liste. */
export function compact(c, { centre = null, densite = null, zoneDe = null, moi = null } = {}) {
  return {
    id: c.id, ville_id: c.ville_id || null, siret: c.siret, classe: c.classe || classeDeCode(c.ape) || 'commerce', nom: nomLisible(c.exploitant?.nom || c.nom, { forme: c.exploitant?.forme }), enseigne: c.enseigne ? societeLisible(c.enseigne) : null, activite: c.activite, adresse: rueLisible(c.adresse), adresse_brute: c.adresse, lat: c.lat, lon: c.lon, actif: c.actif !== false,
    lien: c.lien || (c.etat_recherche === 'fait' ? 'inconnu' : null), etat: c.etat_recherche || 'a_faire',
    proprietaire: c.proprietaire?.nom ? nomLisible(c.proprietaire.nom, { forme: c.proprietaire.forme }) : null, drapeaux: (c.drapeaux || []).map((d) => d.cle), reponse: c.reponse?.choix || null,
    // La liste est celle de la personne connectée, dans son espace mandataire (12 oct. 2026).
    liste: moi && c.listes_mandataires?.[moi] ? { id: c.listes_mandataires[moi].id, nom: c.listes_mandataires[moi].nom } : null, appel_prospection: c.appel_prospection?.titre || null,
    chaine: !!c.chaine, depuis: c.depuis || null, nom_google: c.nom_google || null, prix: c.estimation?.prix || null, epingle: !!c.epingle, proprietaire_type: typeDeProprietaire(c.proprietaire), source: c.source || 'SIRENE', google: !!c.place_id, centre: c.epingle ? true : centre == null ? null : centre.has(c.id), densite: densite?.get(c.id) ?? null, zone: zoneDe?.get(c.id) || null,
  };
}

/** Pure : le genre du propriétaire des murs, pour les filtres : SCI, société, particulier, ou rien. */
export function typeDeProprietaire(pr) {
  if (!pr?.nom) return null;
  if (/^sci\b|soci[ée]t[ée] civile immobili/i.test(`${pr.forme || ''} ${pr.nom}`)) return 'sci';
  if (/^(madame|monsieur|mme|m\.)\s/i.test(pr.nom) || /entrepreneur individuel|personne physique/i.test(String(pr.forme || '')) || /t[ée]l[ée]phone/i.test(String(pr.source || ''))) return 'particulier';
  return 'societe';
}

const ORDRE_LIEN = { exploitant_certain: 0, exploitant_probable: 1, tiers: 2, inconnu: 3, null: 4 };
/** Les commerces d'une ville, exploitants propriétaires et signaux d'abord. */
export function commercesDe(villeId, { moi = null } = {}) {
  const liste = Records.filter(COMMERCE, { ville_id: villeId });
  const zone = centreVille(liste, Records.get(VILLE, villeId));
  return liste.map((c) => compact(c, { ...zone, moi })).sort((a, b) => (ORDRE_LIEN[a.lien] ?? 4) - (ORDRE_LIEN[b.lien] ?? 4) || b.drapeaux.length - a.drapeaux.length || String(a.enseigne || a.nom).localeCompare(String(b.enseigne || b.nom)));
}

// Un commerce interrompu (« en cours » depuis plus de dix minutes) compte comme à faire : le badge « Propriétaires :
// 3462 sur 3466 » ne tourne plus sans fin, et la recherche le reprend (24 oct. 2026).
export function etatDe(villeId) {
  const l = Records.filter(COMMERCE, { ville_id: villeId });
  const n = (f) => l.filter(f).length;
  return { total: l.length, faits: n((c) => c.etat_recherche === 'fait'), en_cours: n((c) => c.etat_recherche === 'en_cours' && !aChercher(c)), a_faire: n(aChercher), erreurs: n((c) => c.etat_recherche === 'erreur'), en_fond: enFond.has(villeId), google: Records.get(VILLE, villeId)?.simple?.google || null, depuis_google: n((c) => c.source === 'Google Maps'), zones: (Records.get(VILLE, villeId)?.simple?.zones || []).map((z) => ({ nom: z.nom, genre: z.genre, pourquoi: z.pourquoi, rues: z.rues })), zones_en_cours: !Records.get(VILLE, villeId)?.simple?.zones_le, prix_en_cours: prixEnFond.has(villeId), avec_prix: n((c) => !!c.estimation?.prix) };
}

// ---------------------------------------------------------------------------
// Un commerce : l'exploitant, le propriétaire, le lien
// ---------------------------------------------------------------------------

/** Les sociétés d'un dirigeant au registre, pour y trouver sa SCI. */
export async function societesDuDirigeant(g, { lire = fetch } = {}) {
  const nom = String(g?.nom_famille || nomDeFamille(g) || '').trim();
  if (!nom) return [];
  const prenoms = norm(g?.nom).split(' ').filter((m) => m !== norm(nom) && m.length > 1).join(' ');
  const params = new URLSearchParams({ nom_personne: nom, prenoms_personne: prenoms, type_personne: 'dirigeant', per_page: '25', minimal: 'true', include: 'siege' });
  const r = await lire(`${ANNUAIRE}?${params}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results || []).map((x) => ({ siren: x.siren, nom: x.nom_complet || x.nom_raison_sociale, nature: String(x.nature_juridique || ''), sci: /^65/.test(String(x.nature_juridique || '')), siege: x.siege ? { adresse: x.siege.adresse, code_postal: x.siege.code_postal, ville: x.siege.libelle_commune } : null, creation: x.date_creation || null }));
}

/**
 * Résout un commerce : exploitant, propriétaire des murs, lien, drapeaux.
 * `complet` ajoute Data-B (si configuré) et les SCI des dirigeants ; le fond
 * se contente du cadastre ouvert (gratuit). `surEtape` raconte.
 */
export async function resoudreCommerce(id, { complet = false, surEtape = () => {}, lireSociete = societe, proprietaires = null, lireEvenements = null, dirigeant = societesDuDirigeant, lireOccupants = null } = {}) {
  const c = Records.get(COMMERCE, id);
  if (!c) return null;
  Records.update(COMMERCE, id, { etat_recherche: 'en_cours' });
  const patch = { lu_le: maintenant() };
  try {
    let siren = c.siren || null;
    let ex = null;
    if (!siren) {
      // Une vitrine vue sur Google Maps : sa société se cherche par son nom, dans son code postal.
      surEtape(`Registre des entreprises : quelle société tient « ${c.enseigne || c.nom} » ?`);
      const trouve = await lireSociete({ nom: c.enseigne || c.nom, code_postal: c.code_postal }).catch(() => null);
      if (trouve?.siren && trouve.active !== false && !trouve.ville_non_recoupee) { ex = trouve; siren = trouve.siren; patch.siren = siren; }
    } else {
      surEtape(`Registre des entreprises : l'exploitant de « ${c.enseigne || c.nom} » (SIREN ${siren}).`);
      ex = await lireSociete({ siren }).catch(() => null);
    }
    if (ex) { patch.exploitant = ex; const g = (ex.gerants || []).filter((x) => !x.personne_morale); surEtape(g.length ? `Dirigeant${g.length > 1 ? 's' : ''} : ${g.map((x) => `${x.nom}${x.tranche_age ? ` (${x.tranche_age === '70+' ? '70 ans et plus' : x.tranche_age === '50-70' ? '50 à 70 ans' : 'moins de 50 ans'})` : ''}`).join(', ')}.` : 'Aucun dirigeant personne physique au registre.'); }
    else surEtape('Exploitant introuvable au registre.');

    surEtape(complet ? 'Cadastre et Data-B : qui possède la parcelle.' : 'Cadastre des personnes morales : qui possède la parcelle.');
    const occupant = { siren, nom: c.nom, enseigne: c.enseigne };
    const point = c.lat != null ? { lat: c.lat, lon: c.lon } : null;
    let foncier = null;
    try {
      if (proprietaires) foncier = await proprietaires(c.adresse, { occupant, point });
      else if (complet) { const { proprietairesDe } = await import('../alx/proprietaires.js'); foncier = await proprietairesDe(`${c.adresse}`, { occupant, point }); }
      else foncier = await proprietairesOuverts(c.adresse, { occupant, point });
    } catch (e) { surEtape(`Cadastre indisponible : ${e?.message || e}.`); }
    let prop = null;
    if (foncier?.proprietaires?.length) {
      const ch = foncier.choix;
      const choix = (ch && typeof ch === 'object' ? ch : Number.isInteger(ch) ? foncier.proprietaires[ch] : null) || choisirProprietaire(foncier.proprietaires, occupant)?.choix || foncier.proprietaires.find((p) => p.rez_de_chaussee) || (foncier.proprietaires.length === 1 ? foncier.proprietaires[0] : null);
      if (choix?.nom) {
        prop = { nom: choix.nom, siren: choix.siren || null, forme: choix.forme || null, parcelle: foncier.parcelle || null, surface_batiment: foncier.surface_batiment || null, source: foncier.source || 'Cadastre des personnes morales (DGFiP)', lu_le: maintenant(), gerants: choix.gerants || [], creation: choix.creation || null, siege: null };
        if (prop.siren) { const sp = await lireSociete({ siren: prop.siren }).catch(() => null); if (sp) Object.assign(prop, { gerants: sp.gerants || prop.gerants, creation: sp.creation || prop.creation, siege: sp.siege || null, forme: sp.forme || prop.forme }); }
        surEtape(`Propriétaire des murs : ${prop.nom}${prop.forme ? ` (${prop.forme})` : ''}${prop.siege?.ville ? `, siège à ${prop.siege.ville}` : ''}.`);
      }
    }
    if (!prop && foncier && foncier.proprietaires?.length === 0) surEtape('Aucune personne morale au cadastre sur cette parcelle : un particulier, probablement.');
    // Les SCI des dirigeants, quand le cadastre n'a pas suffi (mode complet).
    if (complet && ex && (!prop || lierProprietaire({ exploitant: ex, proprietaire: prop, enseigne: c.enseigne, adresse: c.adresse }).lien === 'tiers')) {
      for (const g of (ex.gerants || []).filter((x) => !x.personne_morale).slice(0, 3)) {
        const scis = (await dirigeant(g).catch(() => [])).filter((s) => s.sci);
        if (!scis.length) continue;
        surEtape(`${g.nom} dirige aussi ${scis.length} SCI : ${scis.map((s) => s.nom).slice(0, 3).join(', ')}.`);
        const ici = numeroRue(c.adresse);
        const auMemeEndroit = scis.find((s) => { const sa = s.siege?.adresse ? numeroRue(s.siege.adresse) : null; return sa?.rue && ici.rue && cleRue(sa.rue) === cleRue(ici.rue) && String(sa.numero || '') === String(ici.numero || ''); });
        const memeNom = prop ? scis.find((s) => norm(s.nom) === norm(prop.nom)) : null;
        if (memeNom || auMemeEndroit) {
          const s = memeNom || auMemeEndroit;
          prop = { ...(prop || {}), deduit_sci: true, nom: s.nom, siren: s.siren, forme: 'SCI', creation: s.creation, siege: s.siege, gerants: [...(prop?.gerants || []), g], source: prop ? `${prop.source} + registre des entreprises` : 'Registre des entreprises (SCI du dirigeant, siège à l\'adresse)', lu_le: maintenant() };
          surEtape(`La SCI ${s.nom} ${memeNom ? 'est le propriétaire au cadastre' : 'a son siège à cette adresse'} : l'exploitant possède probablement ses murs.`);
          break;
        }
      }
    }
    // Data-B, occupants de la parcelle (recherche complète seulement : chaque fiche coûte) : la SCI qui loue quand aucun
    // propriétaire n'est publié, et les commerces de la parcelle qu'on ne connaissait pas.
    if (complet && point && (lireOccupants || process.env.DATAB_EMAIL)) {
      try {
        const O = await import('./occupants.js');
        const par = await (lireOccupants || O.lireParcelleEtOccupants)(point);
        // Le bâtiment de la vitrine fait foi : un propriétaire lu sur la parcelle voisine est écarté.
        if (par?.parcelle && foncier?.parcelle && par.parcelle !== foncier.parcelle && prop?.deduit_sci) {
          // La SCI du dirigeant, au siège de cette adresse, vaut preuve à elle seule : on garde, sur la bonne parcelle.
          prop = { ...prop, parcelle: par.parcelle, surface_batiment: par.surface_batiment, source: 'Registre des entreprises (SCI du dirigeant, siège à l\'adresse)' };
          patch.foncier = { ...(patch.foncier || {}), parcelle: par.parcelle, surface_batiment: par.surface_batiment, n_proprietaires: (par.proprietaires || []).length, source: par.source };
        } else if (par?.parcelle && foncier?.parcelle && par.parcelle !== foncier.parcelle && prop?.source && /Data-B/.test(prop.source)) {
          surEtape(`Le propriétaire lu (${prop.nom}) est celui de la parcelle voisine ${foncier.parcelle} : écarté, la vitrine est sur ${par.parcelle}.`);
          prop = null;
          if (par.proprietaires?.length) {
            const ch = choisirProprietaire(par.proprietaires, occupant)?.choix || (par.proprietaires.length === 1 ? par.proprietaires[0] : null);
            if (ch?.nom) { prop = { nom: ch.nom, siren: ch.siren || null, forme: ch.forme || null, parcelle: par.parcelle, surface_batiment: par.surface_batiment, source: 'Data-B · Foncier', lu_le: maintenant(), gerants: ch.gerants || [], creation: ch.creation || null, siege: null }; surEtape(`Propriétaire des murs sur ${par.parcelle} : ${ch.nom}.`); }
          }
          patch.foncier = { ...(patch.foncier || {}), parcelle: par.parcelle, surface_batiment: par.surface_batiment, n_proprietaires: (par.proprietaires || []).length, source: par.source };
        }
        if (par?.occupants?.length) {
          surEtape(`Data-B, occupants de la parcelle ${par.parcelle} : ${par.occupants.map((o) => o.nom).join(', ')}.`);
          const bailleur = !prop ? par.occupants.find(O.estBailleurDesMurs) : null;
          if (bailleur) {
            prop = { nom: bailleur.nom, siren: bailleur.siren, forme: /^sci\b|civile immobili/i.test(bailleur.nom) ? 'SCI' : null, parcelle: par.parcelle, surface_batiment: par.surface_batiment, source: 'Data-B · occupant qui loue les murs (aucun propriétaire publié)', lu_le: maintenant(), gerants: bailleur.gerants.map((g) => ({ nom: g.nom, tranche_age: g.tranche_age, qualite: g.qualite })), creation: null, siege: null };
            if (prop.siren) { const sp = await lireSociete({ siren: prop.siren }).catch(() => null); if (sp) Object.assign(prop, { gerants: sp.gerants?.length ? sp.gerants : prop.gerants, creation: sp.creation || null, siege: sp.siege || null, forme: sp.forme || prop.forme }); }
            surEtape(`Aucun propriétaire publié ; ${bailleur.nom} (${bailleur.activite}) loue les murs : propriétaire probable.`);
          }
          const connus = Records.filter(COMMERCE, { ville_id: c.ville_id });
          const nouveaux = par.occupants.filter(O.estCommerceOccupant).filter((o) => !connus.some((k) => (o.siret && k.siret === o.siret) || (o.siren && k.siren === o.siren && norm(k.adresse).includes(norm(String(o.adresse || '').split(' ').slice(0, 3).join(' '))))));
          for (const o of nouveaux) {
            Records.create(COMMERCE, { ville_id: c.ville_id, source: 'Data-B occupants', siret: o.siret, siren: o.siren, nom: o.nom, enseigne: o.nom, activite: o.activite, adresse: o.adresse, code_postal: (String(o.adresse || '').match(/\b(\d{5})\b/) || [])[1] || c.code_postal, ville: c.ville, lat: par.lat || c.lat, lon: par.lon || c.lon, actif: true, chaine: false, depuis: null, epingle: !!c.epingle, etat_recherche: 'a_faire', cree_le: maintenant() });
          }
          if (nouveaux.length) surEtape(`${nouveaux.length} commerce${nouveaux.length > 1 ? 's' : ''} de la parcelle ajouté${nouveaux.length > 1 ? 's' : ''} : ${nouveaux.map((o) => o.nom).join(', ')}.`);
        }
      } catch (e) { surEtape(`Occupants Data-B indisponibles : ${e?.message || e}.`); }
    }
    patch.proprietaire = prop;
    if (!patch.foncier) patch.foncier = foncier ? { parcelle: foncier.parcelle || null, surface_batiment: foncier.surface_batiment || null, surface_parcelle: foncier.surface_parcelle || null, n_proprietaires: (foncier.proprietaires || []).length, source: foncier.source || null, repli: foncier.repli || null } : null;
    const lien = lierProprietaire({ exploitant: ex, proprietaire: prop, enseigne: c.enseigne, adresse: c.adresse });
    patch.lien = lien.lien; patch.lien_motif = lien.motif;
    surEtape(`Lien : ${{ exploitant_certain: 'l\'exploitant est propriétaire', exploitant_probable: 'l\'exploitant est probablement propriétaire', tiers: 'bailleur tiers', inconnu: 'propriétaire inconnu' }[lien.lien]} (${lien.motif}).`);
    if (siren) {
      try {
        const lire = lireEvenements || (await import('../bodacc.js')).evenementsSociete;
        patch.evenements = (await lire(siren, { mois: 24 })) || [];
      } catch { patch.evenements = c.evenements || []; }
    }
    patch.drapeaux = drapeauxDe({ ...c, ...patch });
    surEtape(patch.drapeaux.length ? `Pourquoi il vendrait : ${patch.drapeaux.map((d) => d.texte).join(' ; ')}.` : 'Aucun signal dans les registres.');
    patch.etat_recherche = 'fait';
    patch.complet = complet || c.complet || false;
    return Records.update(COMMERCE, id, patch);
  } catch (e) {
    return Records.update(COMMERCE, id, { ...patch, etat_recherche: 'erreur', erreur: String(e?.message || e).slice(0, 200) });
  }
}

// La tâche de fond : une ville à la fois, trois commerces par tour, tant qu'il en reste.
const enFond = new Map();
// La recherche des propriétaires, toutes villes confondues (24 oct. 2026, Jules : « pourquoi ça prend autant de temps ») :
// trois commerces à la fois au lieu d'un ; un seul tant que l'annuaire a refusé un appel dans les cinq dernières minutes.
export const PARALLELE_PROPRIETAIRES = 3;
let actifs = 0;
const enAttente = [];
async function creneau(fn) {
  while (actifs >= (refusRecent() ? 1 : PARALLELE_PROPRIETAIRES)) await new Promise((r) => enAttente.push(r));
  actifs += 1;
  try { return await fn(); } finally { actifs -= 1; enAttente.shift()?.(); }
}

// Une ville à la fois, menée jusqu'au bout : le fichier DGFiP des propriétaires d'un département tient des centaines
// de mégaoctets et la mémoire n'en garde que deux (foncier-ouvert.js) ; deux villes de départements différents en
// parallèle les faisaient se recharger sans cesse (8 s chacun). Une autre ville attend son tour, et la ville qui a la
// main la garde tant qu'il lui reste des commerces.
let villeAyantLaMain = null;
/** Une ville qu'une personne ouvre passe devant : elle prend la main tout de suite. */
export const prioriser = (villeId) => { villeAyantLaMain = villeId; };
// Un commerce resté « en cours » plus de dix minutes a été interrompu (un redémarrage) : il se reprend.
const aChercher = (c) => !c.etat_recherche || c.etat_recherche === 'a_faire' || (c.etat_recherche === 'en_cours' && Date.now() - Date.parse(c.updated_date || 0) > 10 * 60_000);

export async function tourDeFond(villeId, { max = 3 * PARALLELE_PROPRIETAIRES, resoudre = resoudreCommerce } = {}) {
  if (villeAyantLaMain && villeAyantLaMain !== villeId && enFond.has(villeAyantLaMain)) {
    return Records.filter(COMMERCE, { ville_id: villeId }).filter(aChercher).length;
  }
  villeAyantLaMain = villeId;
  const liste = Records.filter(COMMERCE, { ville_id: villeId });
  const { centre, densite } = centreVille(liste, Records.get(VILLE, villeId));
  // Le centre-ville d'abord, les plus denses en tête : c'est là qu'on investit.
  const aFaire = liste.filter(aChercher).sort((a, b) => Number(centre.has(b.id)) - Number(centre.has(a.id)) || (densite.get(b.id) || 0) - (densite.get(a.id) || 0)).slice(0, max);
  // Les créneaux font la file, dans l'ordre (le centre d'abord).
  await Promise.all(aFaire.map((c) => creneau(() => resoudre(c.id))));
  const reste = Records.filter(COMMERCE, { ville_id: villeId }).filter(aChercher).length;
  if (!reste && villeAyantLaMain === villeId) villeAyantLaMain = null;
  return reste;
}
export function demarrerFond(villeId, { periode = 2500, tour = tourDeFond } = {}) {
  if (enFond.has(villeId) || process.env.NODE_TEST_CONTEXT) return false;
  let occupe = false;
  const t = setInterval(async () => {
    if (occupe) return;
    occupe = true;
    try { const reste = await tour(villeId); if (!reste) { clearInterval(t); enFond.delete(villeId); } } catch { /* on réessaie au tour suivant */ } finally { occupe = false; }
  }, periode);
  t.unref?.();
  enFond.set(villeId, t);
  return true;
}

// ---------------------------------------------------------------------------
// Une adresse précise
// ---------------------------------------------------------------------------

/** Cherche qui est qui à une adresse exacte, en racontant chaque pas. */
export async function chercherAdresse(texte, { surEtape = () => {}, lister = etablissementsAutour, resoudre = resoudreCommerce, geocoder = resoudreAdresse } = {}) {
  surEtape(`Je cherche « ${texte} » à la Base adresse nationale.`);
  const a = await geocoder(texte);
  if (!a?.lat) return { ok: false, error: 'Adresse introuvable à la BAN : précisez la rue et la ville.' };
  surEtape(`${a.label} (${a.code_insee}).`);
  const ville = Records.list(VILLE).find((v) => v.code_insee === a.code_insee) || null;
  surEtape('SIRENE : les établissements à cette adresse.');
  const etabs = await lister({ lat: a.lat, lon: a.lon, rayon_km: 0.06, sections: ['G', 'I', 'S', 'C', 'K', 'L', 'M', 'N', 'Q', 'J', 'H', 'P', 'R'] });
  const ici = cleRue(a.rue);
  const memes = etabs.filter((e) => e.cle_rue === ici && (!a.numero || String(e.numero || '') === String(a.numero)) && (piedDImmeuble(e.ape)?.oui || /^56|^47|^10\.7|^96\.0/.test(String(e.ape || '')))).slice(0, 6);
  if (!memes.length) { surEtape('Aucun établissement actif au registre à ce numéro.'); return { ok: true, adresse: a, commerces: [] }; }
  surEtape(`${memes.length} établissement${memes.length > 1 ? 's' : ''} : ${memes.map((e) => e.enseigne || e.nom).join(', ')}.`);
  const ids = [];
  for (const e of memes) {
    const base = { ...commerceDepuisEtablissement(e, ville?.id || null), adresse_exacte: true, lat: e.lat ?? a.lat, lon: e.lon ?? a.lon };
    // Cherché par la base, pas en chargeant les 80 000 commerces à chaque établissement (502 du 27 oct. 2026 : mémoire).
    const deja = e.siret ? Records.findBy(COMMERCE, 'siret', e.siret) : null;
    const c = deja ? Records.update(COMMERCE, deja.id, { ...base, etat_recherche: deja.etat_recherche }) : Records.create(COMMERCE, { ...base, etat_recherche: 'a_faire', cree_le: maintenant() });
    ids.push(c.id);
  }
  const commerces = [];
  for (const id of ids.slice(0, 3)) commerces.push(await resoudre(id, { complet: true, surEtape }));
  return { ok: true, adresse: a, commerces: commerces.filter(Boolean).map(fiche) };
}

// ---------------------------------------------------------------------------
// La fiche en six lignes, le téléphone, les appels
// ---------------------------------------------------------------------------

const adresseSiege = (s) => [rueLisible(s.adresse), s.code_postal, s.ville ? nomLisibleVille(s.ville) : null].filter(Boolean).join(' ');
const nomLisibleVille = (v) => String(v).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, l) => a + l.toUpperCase());

/** La fiche d'un commerce : les six lignes de la spec, chaque fait avec sa source et sa date. */
export function fiche(c, { moi = null } = {}) {
  const ex = c.exploitant || null;
  const pr = c.proprietaire || null;
  const gerants = (ex?.gerants || []).filter((g) => !g.personne_morale);
  const age = (g) => (g?.tranche_age === '70+' ? '70 ans et plus' : g?.tranche_age === '50-70' ? '50 à 70 ans' : g?.tranche_age === '-50' ? 'moins de 50 ans' : null);
  return {
    ...compact(c, { moi }),
    code_postal: c.code_postal, ville: c.ville, depuis: c.depuis, chaine: c.chaine, etat_recherche: c.etat_recherche || 'a_faire', erreur: c.erreur || null, complet: !!c.complet, lu_le: c.lu_le || null, adresse_exacte: !!c.adresse_exacte,
    exploitant: ex ? { nom: nomLisible(ex.nom, { forme: ex.forme }), forme: ex.forme, siren: ex.siren, creation: ex.creation, active: ex.active, gerants: gerants.map((g) => ({ nom: personneLisible(g.nom, { nom_famille: g.nom_famille }), qualite: g.qualite, age: age(g) })), source: 'Registre des entreprises', date: ex.lu_le || null } : { nom: nomLisible(c.nom), siren: c.siren, gerants: [], source: 'SIRENE', date: c.lu_le || null, non_lu: true },
    proprietaire: pr ? { nom: nomLisible(pr.nom, { forme: pr.forme }), forme: pr.forme, siren: pr.siren, siege: pr.siege ? adresseSiege(pr.siege) : null, gerants: (pr.gerants || []).filter((g) => !g.personne_morale).map((g) => ({ nom: personneLisible(g.nom, { nom_famille: g.nom_famille }), age: age(g) })), creation: pr.creation || null, parcelle: pr.parcelle || null, surface_batiment: pr.surface_batiment || c.foncier?.surface_batiment || null, source: pr.source, date: pr.lu_le || null } : null,
    lien: c.lien || (c.etat_recherche === 'fait' ? 'inconnu' : null), lien_motif: c.lien_motif || null,
    drapeaux: c.drapeaux || [],
    contact: { telephone: c.telephone || null, site: c.site || null, courrier: pr?.siege ? adresseSiege(pr.siege) : null, source: c.contact_source || null, date: c.contact_le || null },
    reponse: c.reponse || null, proprietaire_declare: c.proprietaire_declare || null, liste: (moi && c.listes_mandataires?.[moi]) || null, appel_prospection: c.appel_prospection || null, estimation: c.estimation || null,
    foncier: c.foncier || null,
  };
}

/** Le téléphone et le site du commerce (Google Places), lus une fois et gardés. */
export async function coordonnees(id, { lire = fetch } = {}) {
  const c = Records.get(COMMERCE, id);
  if (!c || c.contact_le) return c;
  const cle = (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
  if (!cle) return c;
  try {
    const r = await lire('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.websiteUri,places.location' },
      body: JSON.stringify({ textQuery: `${c.enseigne || c.nom} ${c.adresse} ${c.ville || ''}`, languageCode: 'fr', regionCode: 'FR', locationBias: c.lat != null ? { circle: { center: { latitude: c.lat, longitude: c.lon }, radius: 150 } } : undefined, pageSize: 1 }),
    });
    const j = r.ok ? await r.json() : {};
    const p = (j.places || [])[0];
    return Records.update(COMMERCE, id, { telephone: p?.nationalPhoneNumber || null, site: p?.websiteUri || null, contact_source: p ? 'Google Places' : null, contact_le: maintenant() });
  } catch { return Records.update(COMMERCE, id, { contact_le: maintenant() }); }
}

export const REPONSES = { proprietaire_ouvert: 'Propriétaire, et ouvert à en parler', proprietaire_non: 'Propriétaire, mais non', pas_proprietaire: 'Pas propriétaire', pas_joint: 'Pas joint' };

/** La réponse d'un appel, notée sur le commerce ; elle corrige le lien et le propriétaire si on vient d'apprendre qui possède. */
export function noterReponse(espace, id, { choix, qui = null, note = null, user = null }) {
  const c = Records.get(COMMERCE, id);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  if (!REPONSES[choix]) return { ok: false, error: 'Réponse inconnue.' };
  const le = maintenant();
  const patch = { reponse: { choix, qui: qui || null, note: note || null, le, par: user?.email || null } };
  if (choix.startsWith('proprietaire_')) { patch.lien = 'exploitant_certain'; patch.lien_motif = 'déclaré au téléphone'; if (!c.proprietaire?.nom) patch.proprietaire = { nom: c.exploitant?.nom || c.nom, siren: c.siren, forme: c.exploitant?.forme || null, gerants: c.exploitant?.gerants || [], source: 'Déclaré au téléphone', lu_le: le }; }
  if (choix === 'pas_proprietaire') { patch.lien = qui ? 'tiers' : c.lien === 'inconnu' || !c.lien ? 'inconnu' : 'tiers'; patch.lien_motif = 'déclaré au téléphone'; if (qui) patch.proprietaire_declare = { nom: qui, le, par: user?.email || null }; }
  const prochaine = choix === 'proprietaire_ouvert' ? { quoi: 'rappeler pour un rendez-vous', le: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10) } : choix === 'pas_joint' ? { quoi: 'rappeler', le: new Date(Date.now() + 86400000).toISOString().slice(0, 10) } : choix === 'pas_proprietaire' && qui ? { quoi: `joindre ${qui}`, le: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) } : null;
  Records.create(APPEL, { espace, commerce_id: id, enseigne: c.enseigne || c.nom, adresse: c.adresse, ville: c.ville, choix, qui: qui || null, note: note || null, le, par: user?.email || null, prochaine });
  return { ok: true, commerce: fiche(Records.update(COMMERCE, id, patch)) };
}

/** Mes appels : les commerces appelés, la réponse, la date, la prochaine action. Propre à l'espace. */
export const listerAppels = (espace) => Records.filter(APPEL, { espace }).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 200).map((a) => ({ ...a, libelle: REPONSES[a.choix] || a.choix }));

// ---------------------------------------------------------------------------
// Vers une liste de la Prospection (11 oct. 2026) : on coche des commerces, on
// choisit une liste (ou on la crée), ils deviennent des lignes à appeler en
// mode appel. Une liste de commerces ne touche ni Monday ni le carnet des
// agents. Un commerce ne va que dans une liste : la seconde fois, on le dit.
// ---------------------------------------------------------------------------

// Les listes (12 oct. 2026, Jules) : l'Off-market n'envoie que dans les listes
// de l'espace mandataire de la personne connectée (Prospection > Listes du
// mandataire), jamais dans les listes de la Prospection admin. Chaque commerce
// devient une fiche de propriétaire ; le propriétaire des murs est déjà connu,
// rien n'est relancé à sa recherche, et rien ne part vers Monday d'ici.
const LISTE_MANDATAIRE = 'ListeMandataire';
const moiDe = (user) => String(user?.email || '').trim().toLowerCase();

/** Les listes de la personne, dans son espace mandataire, avec leur effectif. */
export async function listesDeCommerces(user) {
  const { mesListes } = await import('../mandataire-lancement.js');
  return mesListes(user).map((l) => ({ id: l.id, nom: l.nom, n: l.total, lancee_le: l.cree_le || null }));
}

/** Envoie des commerces dans une liste du mandataire (existante, ou créée par son nom). */
export async function envoyerVersListe(ids = [], { liste_id = null, nom = null, user = null } = {}) {
  const moi = moiDe(user);
  if (!moi) return { ok: false, error: 'Connectez-vous pour faire une liste.' };
  let l = liste_id ? Records.get(LISTE_MANDATAIRE, liste_id) : null;
  if (liste_id && (!l || l.mandataire_email !== moi)) return { ok: false, error: 'Liste introuvable.' };
  if (!l) {
    const propre = String(nom || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!propre) return { ok: false, error: 'Donnez un nom à la liste.' };
    l = Records.list(LISTE_MANDATAIRE).find((x) => x.mandataire_email === moi && norm(x.nom) === norm(propre))
      || Records.create(LISTE_MANDATAIRE, { mandataire_email: moi, nom: propre, source: 'Off-market', cree_le: maintenant() });
  }
  const { creerProprietaire } = await import('../mandataire-espace.js');
  const ajoutes = [];
  const deja = [];
  const refuses = [];
  for (const id of [...new Set(ids)].slice(0, 500)) {
    const c = Records.get(COMMERCE, id);
    if (!c) continue;
    if (c.listes_mandataires?.[moi]) { deja.push({ id, enseigne: c.enseigne || c.nom, liste: c.listes_mandataires[moi].nom }); continue; }
    // Un commerce dont un autre mandataire a la fiche ne se prend pas (24 oct. 2026, la fiche appartient à qui a agi).
    if (Records.list('ProprietaireMandataire').some((p) => p.commerce_simple_id === id && p.mandataire_email !== moi)) { refuses.push(`${c.enseigne || c.nom} : déjà suivi par un autre mandataire.`); continue; }
    // Ma fiche existe déjà, hors liste (née d'un geste sur la carte) : elle entre dans la liste, sans doublon (25 oct. 2026).
    const mienne = Records.list('ProprietaireMandataire').find((p) => p.commerce_simple_id === id && p.mandataire_email === moi);
    if (mienne) {
      Records.update('ProprietaireMandataire', mienne.id, { liste_id: l.id });
      Records.update(COMMERCE, id, { listes_mandataires: { ...(c.listes_mandataires || {}), [moi]: { id: l.id, nom: l.nom, fiche_id: mienne.id, le: maintenant() } } });
      ajoutes.push(id);
      continue;
    }
    const ex = c.exploitant || {};
    const pr = c.proprietaire || null;
    // Le numéro du commerce n'est celui du propriétaire que si l'exploitant possède les murs.
    const telephone = String(c.lien || '').startsWith('exploitant') ? (c.contact?.telephone || c.telephone || null) : null;
    const r = creerProprietaire({
      nom: pr?.nom ? nomLisible(pr.nom, { forme: pr.forme }) : null,
      commerce: c.enseigne ? societeLisible(c.enseigne) : nomLisible(ex.nom || c.nom, { forme: ex.forme }),
      activite: c.activite || null, ville: c.ville || null, adresse: rueLisible(c.adresse), telephone, email: null,
    }, user);
    if (!r.ok) { refuses.push(`${c.enseigne || c.nom} : ${r.error}`); continue; }
    Records.update('ProprietaireMandataire', r.proprietaire.id, { liste_id: l.id, commerce_simple_id: c.id, source: 'Off-market' });
    Records.update(COMMERCE, id, { listes_mandataires: { ...(c.listes_mandataires || {}), [moi]: { id: l.id, nom: l.nom, fiche_id: r.proprietaire.id, le: maintenant() } } });
    ajoutes.push(id);
  }
  return { ok: true, liste: { id: l.id, nom: l.nom }, ajoutes: ajoutes.length, deja, refuses };
}

/**
 * Change la fiche de liste (25 oct. 2026, Jules : « Dans la liste « Lyon » · changer ») : une liste existante du
 * mandataire, ou une nouvelle par son nom. Le commerce suit.
 */
export function changerDeListe(ficheId, { liste_id = null, nom = null, user = null } = {}) {
  const moi = moiDe(user);
  const p = Records.get('ProprietaireMandataire', ficheId);
  if (!p || p.mandataire_email !== moi) return { ok: false, error: 'Fiche introuvable.' };
  let l = liste_id ? Records.get(LISTE_MANDATAIRE, liste_id) : null;
  if (liste_id && (!l || l.mandataire_email !== moi)) return { ok: false, error: 'Liste introuvable.' };
  if (!l) {
    const propre = String(nom || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!propre) return { ok: false, error: 'Donnez un nom à la liste.' };
    l = Records.list(LISTE_MANDATAIRE).find((x) => x.mandataire_email === moi && norm(x.nom) === norm(propre))
      || Records.create(LISTE_MANDATAIRE, { mandataire_email: moi, nom: propre, source: 'Off-market', cree_le: maintenant() });
  }
  Records.update('ProprietaireMandataire', p.id, { liste_id: l.id });
  const c = p.commerce_simple_id ? Records.get(COMMERCE, p.commerce_simple_id) : null;
  if (c) Records.update(COMMERCE, c.id, { listes_mandataires: { ...(c.listes_mandataires || {}), [moi]: { id: l.id, nom: l.nom, fiche_id: p.id, le: maintenant() } } });
  return { ok: true, liste: { id: l.id, nom: l.nom } };
}

// ---------------------------------------------------------------------------
// Un commerce précis (11 oct. 2026, Jules : « je veux prospecter Uja, je sais
// qu'il est dans la rue ») : cherché d'abord parmi les commerces de la ville,
// puis sur Google Maps et au registre ; trouvé, il est épinglé (visible même
// hors des zones) et lu jusqu'au propriétaire.
// ---------------------------------------------------------------------------

export async function trouverCommerce(villeId, nom, { surEtape = () => {}, lire = fetch, resoudre = resoudreCommerce, lireSociete = societe } = {}) {
  const v = Records.get(VILLE, villeId);
  const cherche = norm(nom);
  if (!v || cherche.length < 2) return { ok: false, error: 'Donnez le nom du commerce.' };
  // Un nom se reconnaît mot pour mot, par son début, ou par ses initiales (« Uja » : Un Jour Ailleurs) ; jamais au milieu d'un mot (« Dujardin »).
  const noteNom = (x) => {
    const n = norm(x);
    if (!n) return 0;
    if (n === cherche) return 4;
    if (n.split(' ').filter(Boolean).map((m) => m[0]).join('') === cherche.replace(/ /g, '')) return 3;
    if (n.startsWith(`${cherche} `) || n.startsWith(cherche)) return 3;
    if (` ${n} `.includes(` ${cherche} `)) return 2;
    return 0;
  };
  const connus = Records.filter(COMMERCE, { ville_id: villeId })
    // L'enseigne et le nom Google comptent plus que la raison sociale ; à égalité, celui des zones commerçantes.
    .map((c) => ({ c, note: Math.max(noteNom(c.enseigne), noteNom(c.nom_google), noteNom(c.nom) - 0.5), zone: zoneDuPoint(c, v.simple?.zones || []) ? 1 : 0 }))
    .filter((x) => x.note > 0)
    .sort((a, b) => b.note - a.note || b.zone - a.zone || Number(!!b.c.lien) - Number(!!a.c.lien))
    .map((x) => x.c);
  if (connus.length) {
    surEtape(`${connus.length === 1 ? 'Déjà connu' : `${connus.length} commerces connus`} à ${v.nom} : ${connus.slice(0, 3).map((c) => c.enseigne || c.nom).join(', ')}.`);
    for (const c of connus.slice(0, 10)) Records.update(COMMERCE, c.id, { epingle: true });
    return { ok: true, commerces: connus.slice(0, 10).map((c) => fiche(Records.get(COMMERCE, c.id))) };
  }
  const crees = [];
  const cle = (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
  if (cle && v.centre?.lat) {
    surEtape(`Google Maps : « ${nom} » à ${v.nom}.`);
    try {
      const r = await lire('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.primaryTypeDisplayName,places.nationalPhoneNumber,places.websiteUri,places.businessStatus' },
        body: JSON.stringify({ textQuery: `${nom} ${v.nom}`, languageCode: 'fr', regionCode: 'FR', pageSize: 5, locationBias: { circle: { center: { latitude: v.centre.lat, longitude: v.centre.lon }, radius: 8000 } } }),
      });
      const j = r.ok ? await r.json() : {};
      for (const p of (j.places || []).filter((x) => x.location && (!x.businessStatus || x.businessStatus === 'OPERATIONAL') && norm(x.displayName?.text).includes(cherche.split(' ')[0])).slice(0, 3)) {
        const complete = String(p.formattedAddress || '');
        if (v.code_postal && !complete.includes(v.code_postal.slice(0, 2))) continue;
        const deja = Records.findBy(COMMERCE, 'place_id', p.id);
        if (deja) { Records.update(COMMERCE, deja.id, { epingle: true }); crees.push(deja.id); continue; }
        const c = Records.create(COMMERCE, {
          ville_id: villeId, source: 'Google Maps', place_id: p.id, siret: null, siren: null, nom: p.displayName.text, enseigne: p.displayName.text, nom_google: p.displayName.text,
          activite: p.primaryTypeDisplayName?.text || 'Commerce', adresse: String(p.shortFormattedAddress || complete).split(',')[0].trim(), code_postal: (complete.match(/\b(\d{5})\b/) || [])[1] || null, ville: v.nom,
          lat: p.location.latitude, lon: p.location.longitude, actif: true, chaine: false, depuis: null, epingle: true, etat_recherche: 'a_faire', cree_le: maintenant(),
          telephone: p.nationalPhoneNumber || null, site: p.websiteUri || null, contact_source: 'Google Maps', contact_le: maintenant(),
        });
        crees.push(c.id);
        surEtape(`Trouvé sur Google Maps : ${p.displayName.text}, ${complete}.`);
      }
    } catch (e) { surEtape(`Google Maps indisponible : ${e?.message || e}.`); }
  }
  if (!crees.length) {
    surEtape(`Registre des entreprises : « ${nom} » vers ${v.code_postal || v.nom}.`);
    const s2 = await lireSociete({ nom, code_postal: v.code_postal }).catch(() => null);
    if (s2?.siren && s2.siege?.lat) {
      const c = Records.create(COMMERCE, { ville_id: villeId, source: 'Registre', siren: s2.siren, siret: null, nom: s2.nom, enseigne: s2.nom, activite: s2.activite || 'Commerce', adresse: s2.siege.adresse, code_postal: s2.siege.code_postal, ville: v.nom, lat: s2.siege.lat, lon: s2.siege.lon, actif: s2.active !== false, epingle: true, etat_recherche: 'a_faire', cree_le: maintenant() });
      crees.push(c.id);
      surEtape(`Trouvé au registre : ${s2.nom}, ${s2.siege.adresse}.`);
    }
  }
  if (!crees.length) return { ok: true, commerces: [], introuvable: true };
  const out = [];
  for (const id of crees.slice(0, 3)) out.push(await resoudre(id, { complet: true, surEtape }));
  return { ok: true, commerces: out.filter(Boolean).map(fiche) };
}

// ---------------------------------------------------------------------------
// Le prix des murs (11 oct. 2026) : la surface (saisie, sinon le bâtiment
// OpenStreetMap et ses vitrines), le loyer de marché de la rue (Data-B), le
// taux de rendement de Data-B pour l'activité ; prix = loyer / taux, en
// fourchette. Sans l'un des trois, on le dit, on n'invente pas.
// ---------------------------------------------------------------------------

/**
 * Le taux de rendement des murs (11 oct. 2026, Jules : « pas Data-B pour le
 * rendement ; 6 % à Paris, 6 à 7 % dans les grandes villes, 7 % à Antibes ») :
 * un barème par ville, un demi-point de plus hors des zones commerçantes.
 */
export const TAUX_VILLE = { paris: 6, lyon: 6.5, marseille: 6.5, nice: 6.5, cannes: 6.5, bordeaux: 6.5, toulouse: 6.5, nantes: 6.5, lille: 6.5, montpellier: 6.5, strasbourg: 6.5, rennes: 6.5, 'aix-en-provence': 6.5, grenoble: 6.5, villeurbanne: 6.5, antibes: 7 };
export const TAUX_DEFAUT = 7;
export function tauxDesMurs(ville, { dansZone = true } = {}) {
  const nom = String(ville?.nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const base = /^75\d{3}$/.test(String(ville?.code_insee || '')) || nom.startsWith('paris') ? 6 : TAUX_VILLE[nom] ?? TAUX_DEFAUT;
  return { taux: dansZone ? base : base + 0.5, source: `Barème Klocka : ${String(base).replace('.', ',')} % ${base === 6 ? 'à Paris' : TAUX_VILLE[nom] ? `à ${ville.nom}` : 'par défaut'}${dansZone ? '' : ', + 0,5 point hors des zones commerçantes'}` };
}

export async function estimerPrix(id, { surface = null, user = null, surEtape = () => {}, batiment = null, loyer = null, rendement = null, dvf = null } = {}) {
  const c = Records.get(COMMERCE, id);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const adresse = [c.adresse, c.code_postal, c.ville].filter(Boolean).join(' ');
  // 1. La surface
  let s = null; let sSource = null;
  const saisie = Number(surface) > 0 ? Number(surface) : Number(c.estimation?.surface_saisie) > 0 ? Number(c.estimation.surface_saisie) : null;
  if (saisie) { s = [saisie, saisie]; sSource = 'saisie'; surEtape(`Surface : ${saisie} m², saisie.`); }
  // Une surface de moins de 15 m² n'est pas un local commercial (11 oct. 2026, Jules : « 5 m², ce n'est pas possible ;
  // mieux vaut ne rien dire que dire faux ») : elle est écartée, et l'on passe à la source suivante.
  const plausible = (x) => Array.isArray(x) && x[0] >= SURFACE_MIN && x[1] <= SURFACE_MAX;
  const ecarter = (x, d) => surEtape(`${d} : ${x[0] === x[1] ? x[0] : `${x[0]} à ${x[1]}`} m², trop petit pour un local commercial : écarté.`);
  const parcelle = c.foncier?.parcelle || c.proprietaire?.parcelle || null;
  if (!s && parcelle) {
    // Les ventes publiques (DVF) de la parcelle : la surface réelle d'un local commercial vendu.
    surEtape(`Surface : les ventes publiques de la parcelle ${parcelle} (DVF).`);
    try {
      const muta = dvf || (await import('../dvf.js')).mutationsDeLaParcelle;
      const toutes = (await muta(parcelle.slice(0, 5), parcelle)).filter((m) => m.surface_commerciale > 0);
      const ventes = toutes.filter((m) => plausible([m.surface_commerciale, m.surface_commerciale]));
      if (toutes.length > ventes.length) ecarter([Math.min(...toutes.map((m) => m.surface_commerciale)), Math.min(...toutes.map((m) => m.surface_commerciale))], 'DVF');
      const vente = ventes.find((m) => m.lots <= 2) || ventes[0];
      if (vente) { s = [vente.surface_commerciale, vente.surface_commerciale]; sSource = `DVF : local commercial vendu le ${String(vente.date).slice(0, 10)}${ventes.length > 1 ? `, ${ventes.length} ventes sur la parcelle` : ''}`; surEtape(`Surface : ${vente.surface_commerciale} m² (${sSource}).`); }
      else if (!toutes.length) surEtape('Aucun local commercial vendu sur la parcelle depuis 2014.');
    } catch (e) { surEtape(`DVF indisponible : ${e?.message || e}.`); }
  }
  let b = null;
  let parts = 1;
  if (!s && Number.isFinite(c.lat)) {
    surEtape('Surface : le bâtiment sur OpenStreetMap, ses façades et ses vitrines.');
    try {
      const mesure = batiment || (await import('../alx/batiment.js')).mesurerBatiment;
      b = await mesure({ lat: c.lat, lon: c.lon });
      // OpenStreetMap ne connaît pas toujours les vitrines : on partage entre les commerces que nous connaissons dans ce bâtiment (à 15 m).
      const voisins = Records.filter(COMMERCE, { ville_id: c.ville_id }).filter((x) => x.id !== c.id && Number.isFinite(x.lat) && 6371000 * Math.hypot(((x.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180) * Math.PI) / 180, ((x.lat - c.lat) * Math.PI) / 180) <= 15).length;
      parts = Math.max(b?.commerces_dans_le_batiment || 1, voisins + 1);
      if (Array.isArray(b?.surface_estimee) && b.surface_estimee[1] > 0) {
        const partage = parts > (b.commerces_dans_le_batiment || 1) ? parts / (b.commerces_dans_le_batiment || 1) : 1;
        const x = [Math.round(b.surface_estimee[0] / partage), Math.round(b.surface_estimee[1] / partage)];
        if (plausible(x)) { s = x; sSource = `OpenStreetMap : bâtiment de ${b.emprise_m2} m² au sol, ${parts} vitrine(s)`; surEtape(`Surface estimée : ${s[0]} à ${s[1]} m² (${parts} vitrine${parts > 1 ? 's' : ''} dans le bâtiment).`); }
        else ecarter(x, 'Vitrine OpenStreetMap');
      }
    } catch (e) { surEtape(`OpenStreetMap indisponible : ${e?.message || e}.`); }
  }
  if (!s) {
    // L'emprise au sol du bâtiment (cadastre ou OpenStreetMap), partagée entre ses vitrines : un local sur rue d'un petit immeuble en prend l'essentiel.
    const emprise = Number(c.foncier?.surface_batiment) || Number(b?.emprise_m2) || null;
    if (emprise && emprise <= 600) {
      const part = emprise / Math.max(1, parts);
      const x = [Math.round(part * 0.8), Math.round(part)];
      if (plausible(x)) { s = x; sSource = `emprise du bâtiment : ${emprise} m² au sol${parts > 1 ? `, partagés entre ${parts} vitrines` : ''}`; surEtape(`Surface estimée : ${s[0]} à ${s[1]} m² (${sSource}).`); }
      else ecarter(x, 'Emprise du bâtiment partagée');
    }
  }
  if (!s && Number.isFinite(c.lat)) {
    // La fiche du mode Avancé au même endroit, quand elle a mesuré la façade.
    const proche = Records.filter('Cible', { ville_id: c.ville_id }).filter((x) => Array.isArray(x.valorisation?.surface_estimee) && Number.isFinite(x.lat))
      .map((x) => ({ x, d: 6371000 * Math.hypot(((x.lon - c.lon) * Math.cos((c.lat * Math.PI) / 180) * Math.PI) / 180, ((x.lat - c.lat) * Math.PI) / 180) }))
      .filter((o) => o.d <= 25 && (o.x.place_id && o.x.place_id === c.place_id || norm(o.x.enseigne).split(' ').some((m) => m.length >= 4 && norm(`${c.enseigne} ${c.nom}`).includes(m))))
      .sort((a, bb) => a.d - bb.d)[0];
    if (proche && plausible(proche.x.valorisation.surface_estimee)) { s = proche.x.valorisation.surface_estimee; sSource = proche.x.valorisation.estimee_detail || 'façade mesurée'; surEtape(`Surface estimée : ${s[0]} à ${s[1]} m² (${sSource}).`); }
  }
  if (!s) surEtape('Surface inconnue : saisissez-la pour obtenir un prix.');
  // 2 et 3. Le loyer de marché et le taux, gardés par rue trente jours (PrixRue) : une rue, une lecture Data-B, pour tous ses commerces.
  const cleRuePrix = `${cleRue(numeroRue(c.adresse).rue || c.rue || '')}|${c.code_postal || c.ville_id}`;
  const enCache = (!loyer && cleRuePrix.length > 3) ? Records.filter(PRIX_RUE, { cle: cleRuePrix }).find((x) => Date.now() - Date.parse(x.le) < 30 * 86400000) : null;
  let m2 = enCache?.loyer_m2 || null;
  if (enCache) surEtape(`Loyer de la rue déjà lu le ${String(enCache.le).slice(0, 10)} : ${m2 ? `${Math.round(m2.basse)} à ${Math.round(m2.haute)} €/m²/an` : 'pas de loyer'}.`);
  if (!enCache) {
    surEtape('Loyer de marché de la rue (Data-B).');
    try {
      const lireLoyer = loyer || (await import('../data-b.js')).valeurLocative;
      const r = await lireLoyer(adresse, { user });
      const niveau = r?.ok ? (r.resultat.rue || r.resultat.quartier || r.resultat.ville) : null;
      if (niveau?.basse != null || niveau?.haute != null) {
        m2 = { basse: niveau.basse ?? niveau.haute, haute: niveau.haute ?? niveau.basse, niveau: r.resultat.rue ? 'rue' : r.resultat.quartier ? 'quartier' : 'ville', nom: niveau.nom || null, source: r.resultat.source || 'Data-B' };
        surEtape(`Loyer de marché (${m2.niveau}) : ${Math.round(m2.basse)} à ${Math.round(m2.haute)} €/m²/an.`);
      } else surEtape(`Data-B ne donne pas de loyer ici${r?.error ? ` : ${r.error}` : ''}.`);
    } catch (e) { surEtape(`Data-B indisponible : ${e?.message || e}.`); }
    if (!loyer && cleRuePrix.length > 3 && m2) Records.create(PRIX_RUE, { cle: cleRuePrix, loyer_m2: m2, le: maintenant() });
  }
  // 3. Le taux : le barème, sans Data-B.
  const v = Records.get(VILLE, c.ville_id);
  const dansZone = !(v?.simple?.zones?.length) || !!zoneDuPoint(c, v.simple.zones) || !!c.epingle;
  const { taux, source: tauxSource } = rendement ? await rendement(c) : tauxDesMurs(v, { dansZone });
  surEtape(`Taux de rendement : ${String(taux).replace('.', ',')} % (${tauxSource}).`);
  const mille = (n) => Math.round(n / 1000) * 1000;
  const prix = s && m2 && taux ? { basse: mille((m2.basse * s[0]) / (taux / 100)), moyenne: mille((((m2.basse + m2.haute) / 2) * ((s[0] + s[1]) / 2)) / (taux / 100)), haute: mille((m2.haute * s[1]) / (taux / 100)) } : null;
  const loyerAn = s && m2 ? { basse: mille(m2.basse * s[0]), haute: mille(m2.haute * s[1]) } : null;
  if (prix) surEtape(`Prix des murs : ${prix.basse.toLocaleString('fr-FR')} à ${prix.haute.toLocaleString('fr-FR')} €.`);
  const estimation = { surface: s, surface_source: sSource, surface_saisie: sSource === 'saisie' ? s[0] : null, loyer_m2: m2, loyer_an: loyerAn, taux, taux_source: tauxSource, prix, le: maintenant(), par: user?.email || null };
  return { ok: true, commerce: fiche(Records.update(COMMERCE, id, { estimation })) };
}

// Le prix en tâche de fond (11 oct. 2026, Jules : « voir le prix estimé direct ») : les commerces des zones
// commerçantes, le centre d'abord, un toutes les six secondes ; une rue neuve coûte une lecture Data-B,
// au plus 40 rues neuves par ville et par jour.
const prixEnFond = new Map();
export const PLAFOND_RUES_JOUR = 40;
export async function tourPrix(villeId, { estimer = estimerPrix } = {}) {
  const liste = Records.filter(COMMERCE, { ville_id: villeId });
  const { centre } = centreVille(liste, Records.get(VILLE, villeId));
  // Sans prix, ou avec une surface invraisemblable d'une version précédente (sauf saisie à la main).
  const aRefaire = (c) => !c.estimation || (Array.isArray(c.estimation.surface) && c.estimation.surface_source !== 'saisie' && c.estimation.surface[0] < SURFACE_MIN);
  // Les cibles d'abord (24 oct. 2026) : un signal de vente, un propriétaire et un exploitant connus. Ce sont elles que
  // « Pour mes clients » propose ; le plafond de rues neuves du jour ne change pas.
  const cible = (c) => (c.drapeaux || []).length > 0 && !!c.proprietaire?.nom && !!c.exploitant?.nom;
  const aFaire = liste.filter((c) => aRefaire(c) && (centre.has(c.id) || c.epingle) && c.etat_recherche === 'fait')
    .sort((a, b) => Number(cible(b)) - Number(cible(a)) || (b.drapeaux || []).length - (a.drapeaux || []).length);
  if (!aFaire.length) return 0;
  const jour = new Date().toISOString().slice(0, 10);
  const cle = `prix-rues:${villeId}:${jour}`;
  const { Meta } = await import('../db.js');
  const deja = Number(Meta.get(cle) || 0);
  const ruesConnues = new Set(Records.list(PRIX_RUE).filter((x) => Date.now() - Date.parse(x.le) < 30 * 86400000).map((x) => x.cle));
  const cleDe = (c) => `${cleRue(numeroRue(c.adresse).rue || c.rue || '')}|${c.code_postal || c.ville_id}`;
  // Une rue déjà lue d'abord, et jusqu'à cinq d'un coup (gratuit : ni Data-B ni plafond, 24 oct. 2026) ; puis une rue
  // neuve tant que le plafond du jour le permet.
  const connues = aFaire.filter((c) => ruesConnues.has(cleDe(c))).slice(0, 5);
  if (connues.length > 1) {
    for (const c of connues) await estimer(c.id).catch(() => Records.update(COMMERCE, c.id, { estimation: { prix: null, erreur: 'estimation impossible', le: maintenant() } }));
    return aFaire.length - connues.length;
  }
  const suivant = connues[0] || (deja < PLAFOND_RUES_JOUR ? aFaire[0] : null);
  if (!suivant) return 0;
  if (!ruesConnues.has(cleDe(suivant))) Meta.set(cle, String(deja + 1));
  await estimer(suivant.id).catch(() => Records.update(COMMERCE, suivant.id, { estimation: { prix: null, erreur: 'estimation impossible', le: maintenant() } }));
  return aFaire.length - 1;
}
export function demarrerPrix(villeId, { periode = 6000, tour = tourPrix } = {}) {
  if (prixEnFond.has(villeId) || process.env.NODE_TEST_CONTEXT) return false;
  let occupe = false;
  const t = setInterval(async () => {
    if (occupe) return;
    occupe = true;
    try { const reste = await tour(villeId); if (!reste) { clearInterval(t); prixEnFond.delete(villeId); } } catch { /* au tour suivant */ } finally { occupe = false; }
  }, periode);
  t.unref?.();
  prixEnFond.set(villeId, t);
  return true;
}
