// L'API Sirene de l'INSEE : le registre des établissements, complet.
//
// L'annuaire des entreprises (recherche-entreprises.api.gouv.fr) suffit pour
// lire une société ; il ne suffit pas pour compter. Il rend 25 résultats par
// page, ne filtre ni par date de fermeture ni par zone pour les sociétés
// cessées, et l'ordre de ses pages est le sien : lire six pages d'une commune
// qui en a quatre cents, c'est tirer au sort. Sirene sait faire ce que
// K-Vacance demande : tous les commerces d'une commune, actifs et fermés,
// filtrés par date et par code d'activité, mille par page, avec leurs
// coordonnées Lambert 93.
//
// Une clé gratuite, à créer sur portail-api.insee.fr. La marche à suivre est
// précise et le mode d'emploi de l'INSEE insiste : l'application doit être
// créée en mode « simple », le mode « backend to backend » ne fonctionne en
// aucun cas pour cette API. On souscrit ensuite au plan « Public », le seul
// existant, qui délivre une clé sans date de fin. Elle se pose dans .env sous
// INSEE_SIRENE_CLE et voyage dans l'en-tête X-INSEE-Api-Key-Integration.
//
// Trente requêtes par minute et deux mille par heure : une commune se lit en
// une poignée d'appels, et le résultat se garde trente jours.

import { fileURLToPath } from 'node:url';
import { Records } from './db.js';
import { libelleActivite } from './naf.js';

const RACINE = 'https://api.insee.fr/api-sirene/3.11';
// Lue à chaque appel, et non une fois au chargement : le serveur charge .env
// dans son point d'entrée, mais un module importé avant lui, ou lancé seul en
// ligne de commande, lirait autrement une variable encore vide.
const cle = () => (process.env.INSEE_SIRENE_CLE || '').trim();
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 60000;
// Mille par page : c'est le plafond du format JSON, les deux cent mille
// annoncés ailleurs ne valent que pour le CSV.
const PAR_PAGE = 1000;
// Trente appels par minute : deux secondes entre deux pages tiennent la marge.
const PAUSE_MS = 2100;
const CACHE = 'CacheSireneKVacance';
const CACHE_JOURS = 30;

export const sireneConfigure = () => !!cle();
export const MESSAGE_SANS_CLE = "L'API Sirene de l'INSEE n'est pas configurée : INSEE_SIRENE_CLE manque dans .env (clé gratuite sur portail-api.insee.fr, application en mode « simple » souscrite au plan « Public »).";

// --- Lambert 93 -> WGS 84 ------------------------------------------------
//
// Sirene donne un point en Lambert 93, la projection légale de la France
// métropolitaine. Les constantes sont celles de l'IGN (ellipsoïde GRS 80,
// parallèles d'échelle conservée 44° et 49°, origine 3° E, 46,5° N).

const N = 0.7256077650532670;
const C = 11754255.426096;
const XS = 700000;
const YS = 12655612.049876;
const E = 0.08181919106;
const LON0 = 3 * Math.PI / 180;

/** Le point WGS 84 d'un couple Lambert 93, en degrés. Pure : testée sans réseau. */
export function lambert93VersWgs84(x, y) {
  // `Number(null)` vaut zéro : un champ absent ne doit pas devenir un point.
  if (x == null || y == null || x === '' || y === '') return null;
  const X = Number(x); const Y = Number(y);
  if (!Number.isFinite(X) || !Number.isFinite(Y)) return null;
  const R = Math.hypot(X - XS, YS - Y);
  const gamma = Math.atan2(X - XS, YS - Y);
  const lon = LON0 + gamma / N;
  const latIso = -Math.log(R / C) / N;
  // La latitude isométrique se retourne par itération : quelques tours
  // suffisent pour descendre sous le millimètre.
  let phi = 2 * Math.atan(Math.exp(latIso)) - Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const s = E * Math.sin(phi);
    phi = 2 * Math.atan(((1 + s) / (1 - s)) ** (E / 2) * Math.exp(latIso)) - Math.PI / 2;
  }
  return { lat: phi * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

/** L'inverse, pour vérifier l'aller-retour. Pure. */
export function wgs84VersLambert93(lat, lon) {
  const phi = lat * Math.PI / 180;
  const s = E * Math.sin(phi);
  const latIso = Math.log(Math.tan(Math.PI / 4 + phi / 2)) - (E / 2) * Math.log((1 + s) / (1 - s));
  const R = C * Math.exp(-N * latIso);
  const gamma = N * (lon * Math.PI / 180 - LON0);
  return { x: XS + R * Math.sin(gamma), y: YS - R * Math.cos(gamma) };
}

// --- Lecture d'un établissement -----------------------------------------

/** La période en cours d'un établissement : celle qui n'a pas de fin. */
const periodeCourante = (e) => (e.periodesEtablissement || []).find((p) => !p.dateFin) || (e.periodesEtablissement || [])[0] || {};

/**
 * Un établissement tel que K-Vacance le garde. Pure : testée sans réseau.
 *
 * L'adresse se recompose depuis les champs du registre, dans l'ordre postal,
 * pour que `cleAdresse` la lise comme celles de l'annuaire. La fermeture est
 * le début de la période où l'état passe à F ; un établissement actif n'en a
 * pas.
 */
export function lireEtablissement(e) {
  if (!e?.siret) return null;
  const a = e.adresseEtablissement || {};
  const p = periodeCourante(e);
  const u = e.uniteLegale || {};
  const coord = lambert93VersWgs84(a.coordonneeLambertAbscisseEtablissement, a.coordonneeLambertOrdonneeEtablissement);
  const etat = p.etatAdministratifEtablissement === 'F' ? 'F' : 'A';
  const adresse = [a.numeroVoieEtablissement, a.indiceRepetitionEtablissement, a.typeVoieEtablissement, a.libelleVoieEtablissement, a.codePostalEtablissement, a.libelleCommuneEtablissement]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;
  const code = p.activitePrincipaleEtablissement || u.activitePrincipaleUniteLegale || null;
  const nom = u.denominationUniteLegale || [u.prenom1UniteLegale, u.nomUsageUniteLegale || u.nomUniteLegale].filter(Boolean).join(' ') || null;
  return {
    siret: e.siret,
    nom,
    enseigne: p.enseigne1Etablissement || p.denominationUsuelleEtablissement || null,
    activite: code,
    activite_libelle: libelleActivite(code),
    adresse,
    voie: a.libelleVoieEtablissement || null,
    code_commune: a.codeCommuneEtablissement || null,
    lat: coord ? Math.round(coord.lat * 1e6) / 1e6 : null,
    lon: coord ? Math.round(coord.lon * 1e6) / 1e6 : null,
    etat,
    ouverture: e.dateCreationEtablissement || null,
    fermeture: etat === 'F' ? p.dateDebut || null : null,
  };
}

// --- Interrogation --------------------------------------------------------

async function appeler(params) {
  if (!sireneConfigure()) throw new Error(MESSAGE_SANS_CLE);
  const r = await fetch(`${RACINE}/siret?${new URLSearchParams(params)}`, {
    headers: { 'X-INSEE-Api-Key-Integration': cle(), accept: 'application/json', 'user-agent': UA },
    signal: AbortSignal.timeout(DELAI_MS),
  });
  // 404 : aucun établissement ne répond à la question, ce n'est pas une panne.
  if (r.status === 404) return { header: { total: 0 }, etablissements: [] };
  if (r.status === 401) throw new Error("L'API Sirene refuse la clé INSEE_SIRENE_CLE : vérifiez-la dans « souscriptions » sur portail-api.insee.fr.");
  // 429 : le quota d'une minute est dépassé, on laisse passer la fenêtre.
  if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 15000)); return appeler(params); }
  // 400 : une variable mal orthographiée ou oubliée hors de `periode(...)`.
  // Le message du registre est plus utile que le code, on le garde.
  if (!r.ok) throw new Error(`L'API Sirene a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * Le morceau de requête qui cible des codes d'activité par préfixe :
 * « 47 » devient `activitePrincipaleEtablissement:47*`.
 */
export const clauseActivites = (prefixes) => `(${(prefixes || []).map((p) => `activitePrincipaleEtablissement:${String(p).replace('.', '')}*`).join(' OR ')})`;

/**
 * Toutes les pages d'une question, par curseur.
 *
 * Le premier appel porte `curseur=*`, chaque réponse donne le curseur suivant,
 * et l'on s'arrête quand les deux sont identiques : c'est la seule condition
 * d'arrêt que le registre garantit. Une page plus courte que demandé n'en est
 * pas une — la documentation montre une page de 84 résultats suivie d'une
 * autre requête — donc on ne s'arrête surtout pas là-dessus.
 */
async function toutesLesPages(q, champs, extra = {}) {
  const sortie = [];
  let curseur = '*';
  for (let page = 0; page < 60; page++) {
    const d = await appeler({ q, nombre: String(PAR_PAGE), curseur, champs, ...extra });
    for (const e of d.etablissements || []) sortie.push(e);
    const suivant = d.header?.curseurSuivant;
    if (!suivant || suivant === curseur) break;
    curseur = suivant;
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
  }
  return sortie;
}

const CHAMPS = [
  'siret', 'dateCreationEtablissement',
  'numeroVoieEtablissement', 'indiceRepetitionEtablissement', 'typeVoieEtablissement', 'libelleVoieEtablissement',
  'codePostalEtablissement', 'libelleCommuneEtablissement', 'codeCommuneEtablissement',
  'coordonneeLambertAbscisseEtablissement', 'coordonneeLambertOrdonneeEtablissement',
  'dateDebut', 'dateFin', 'etatAdministratifEtablissement', 'activitePrincipaleEtablissement', 'enseigne1Etablissement', 'denominationUsuelleEtablissement',
  'denominationUniteLegale', 'nomUniteLegale', 'nomUsageUniteLegale', 'prenom1UniteLegale', 'activitePrincipaleUniteLegale',
].join(',');

const frais = (iso) => iso && Date.now() - new Date(iso).getTime() < CACHE_JOURS * 86400000;

/**
 * Les établissements d'une commune dont l'activité commence par l'un des
 * préfixes : les actifs, et ceux fermés depuis `anneesFermeture` ans.
 *
 * @returns {Promise<{ok:true, etablissements:Array, garde_le:string, du_cache?:boolean} | {ok:false, error:string}>}
 */
export async function etablissementsDeLaCommune(codeInsee, { prefixes, anneesFermeture = 8, forcer = false } = {}) {
  if (!codeInsee) return { ok: false, error: 'Commune inconnue.' };
  if (!sireneConfigure()) return { ok: false, error: MESSAGE_SANS_CLE };
  const cle = `${codeInsee}|${anneesFermeture}|${(prefixes || []).join(',')}`;
  const garde = Records.findBy(CACHE, 'cle', cle);
  if (garde && frais(garde.garde_le) && !forcer) return { ok: true, etablissements: garde.etablissements || [], garde_le: garde.garde_le, du_cache: true };

  const depuis = new Date(); depuis.setFullYear(depuis.getFullYear() - anneesFermeture);
  const jour = depuis.toISOString().slice(0, 10);
  const activites = clauseActivites(prefixes);
  const brut = [];
  try {
    // 1. Les actifs. `date` au jour même restreint à la période en cours :
    //    sans lui, un établissement qui fut un commerce ouvert dans une vieille
    //    période remonterait aussi, et gonflerait le stock d'aujourd'hui.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    brut.push(...await toutesLesPages(`codeCommuneEtablissement:${codeInsee} AND periode(etatAdministratifEtablissement:A AND ${activites})`, CHAMPS, { date: aujourdhui }));
    await new Promise((ok) => setTimeout(ok, PAUSE_MS));
    // 2. Les fermés récents : la période à l'état F a commencé après la date.
    brut.push(...await toutesLesPages(`codeCommuneEtablissement:${codeInsee} AND periode(etatAdministratifEtablissement:F AND dateDebut:[${jour} TO *] AND ${activites})`, CHAMPS));
  } catch (e) {
    if (garde) return { ok: true, etablissements: garde.etablissements || [], garde_le: garde.garde_le, du_cache: true, perime: true };
    return { ok: false, error: e?.message || String(e) };
  }

  const vus = new Set();
  const etablissements = brut.map(lireEtablissement).filter((e) => e && !vus.has(e.siret) && vus.add(e.siret));
  const garde_le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { etablissements, garde_le });
  else Records.create(CACHE, { cle, etablissements, garde_le });
  return { ok: true, etablissements, garde_le };
}

// `node server/insee-sirene.js 06029` : lit une commune et dit ce qu'il trouve.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Lancé seul, le module n'a pas eu le .env que le serveur charge pour lui.
  // L'import reste ici : au chargement, il repeuplerait la variable que les
  // tests effacent pour vérifier le message d'absence de clé.
  await import('dotenv/config');
  const code = process.argv[2];
  const r = await etablissementsDeLaCommune(code, { prefixes: ['47', '56', '960', '952'], forcer: true });
  if (!r.ok) { console.error(r.error); process.exit(1); }
  const a = r.etablissements.filter((e) => e.etat === 'A').length;
  const sans = r.etablissements.filter((e) => e.lat == null).length;
  console.log(`${code} : ${r.etablissements.length} établissements, ${a} actifs, ${r.etablissements.length - a} fermés, ${sans} sans coordonnées`);
  console.log(r.etablissements.slice(0, 3));
}
