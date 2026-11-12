// L'outil Rue (11 nov. 2026, Jules : « toutes les cellules de la rue, la part d'enseignes nationales, le flux piéton,
// et surtout la rotation à l'adresse exacte : combien d'exploitants dans ce local en dix ans »). Il répond à la
// première question de l'analyse hors documents : un commerce peut-il vivre ici, celui-là ou le suivant ?
//
// Ce qu'il lit, pour une adresse :
//   1. le local : les exploitants qui s'y sont succédé en dix ans (registre SIRENE, stock local ou API), le nombre de
//      cellules qu'on devine au même numéro (deux exploitants ouverts en même temps = deux cellules), la rotation ;
//   2. la rue : chaque cellule numéro par numéro, ouverte ou vide au registre, enseigne nationale ou indépendant ;
//   3. la position du local : son tronçon, la densité du tronçon face au reste de la rue, l'enseigne la plus proche ;
//   4. le passage : une note sur 10 avec son pourquoi, calculée (commerces, enseignes, transports, type de voie) et
//      corrigée par la lecture de deux photos Street View ; l'analyste peut la remplacer par la sienne ;
//   5. une conclusion en une phrase.
// Rien n'est inventé : une source muette laisse sa partie vide et le dit. Data-B n'y entre pas. Le passage est un
// indice, pas un comptage ; il le dit aussi.

import fs from 'fs';
import path from 'path';
import db, { Records } from '../db.js';
import { UPLOAD_DIR } from '../contexte.js';
import { cleLocal, voieDe, voieDuNom, horsMagasin, numeroDe, decouperEnTroncons, PARAMETRES_TAUX } from './vacance-taux.js';
import { lireEtablissementVacance } from './vacance-sources.js';
import { communeChargee, etablissementsDeCommune, versApi } from '../socle/imports/sirene-stock.js';
import { indexDesMarques, marqueDe } from '../enseignes-autour.js';

export const ENTITE = 'AnalyseRue';
export const VERSION = 'v1 du 11 nov. 2026';
const ANS = 10;
const CACHE_JOURS = 7;
const VITRINES = PARAMETRES_TAUX.vitrines;
const DOMICILIATION = PARAMETRES_TAUX.seuil_adresse_multiple;

const nomDe = (e) => e.enseigne || e.denomination || e.nom || '—';
// « DUPONT SAS » n'est pas l'enseigne SAS : la forme juridique sort du nom avant de chercher la marque.
const FORMES = /\b(SAS|SASU|SARL|EURL|SA|SNC|SCI|SELARL|SCP|SCOP|GIE|EI|EIRL)\b/gi;
export const sansForme = (nom) => String(nom || '').replace(FORMES, ' ').replace(/\s+/g, ' ').trim();
export const marqueDuNom = (nom, index) => { const propre = sansForme(nom); return propre.length >= 3 ? marqueDe(propre, index) : null; };
const estEI = (e) => String(e.categorie_juridique || '') === '1000';
const jourISO = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
const distanceM = (a, b) => Math.round(Math.hypot((b.lat - a.lat) * 111000, (b.lon - a.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180)));

// --- Le registre d'une commune, sur dix ans ---------------------------------------------------------------------------

/** Les établissements à vitrine de la commune, ouverts ou fermés depuis moins de dix ans : le stock local s'il a la commune, sinon l'API Sirene. */
export async function registreDeLaCommune(codeInsee, { forcer = false } = {}) {
  const depuis = jourISO(new Date(Date.now() - ANS * 365.25 * 86400000));
  if (communeChargee(codeInsee)) {
    const commence = (v) => { const c = String(v || '').replace(/\./g, ''); return VITRINES.some((p) => c.startsWith(String(p).replace(/\./g, ''))); };
    const lignes = etablissementsDeCommune(codeInsee).filter((x) => commence(x.naf) && (x.etat === 'A' || String(x.date_debut || '') >= depuis));
    const cat = new Map(lignes.map((x) => [x.siret, x.categorie_juridique || null]));
    const lus = lignes.map((x) => lireEtablissementVacance(versApi(x))).filter(Boolean).map((l) => ({ ...l, categorie_juridique: cat.get(l.siret) || null }));
    return { ok: true, etablissements: lus, source: 'Stock SIRENE géolocalisé (INSEE)' };
  }
  const { etablissementsDeLaCommune } = await import('../insee-sirene.js');
  const r = await etablissementsDeLaCommune(codeInsee, { prefixes: VITRINES, anneesFermeture: ANS, forcer });
  if (!r.ok) return r;
  const lus = r.etablissements.map((e) => ({
    siret: e.siret, siren: String(e.siret).slice(0, 9), denomination: e.nom, enseigne: e.enseigne, adresse: e.adresse, code_naf: e.activite,
    etat: e.etat === 'F' ? 'ferme' : 'actif', date_fermeture: e.fermeture, date_creation: e.ouverture, lat: e.lat, lon: e.lon, categorie_juridique: null,
  }));
  return { ok: true, etablissements: lus, source: 'API Sirene (INSEE)', garde_le: r.garde_le };
}

// --- Les cellules, pures ----------------------------------------------------------------------------------------------

/** Pure : les exploitants d'une adresse qui comptent comme occupants d'un local : commerce en boutique, dans la fenêtre. */
export function exploitantsDe(etablissements, { aujourdhui = new Date() } = {}) {
  const depuis = jourISO(new Date(aujourdhui.getTime() - ANS * 365.25 * 86400000));
  return etablissements
    .filter((e) => !horsMagasin(e.code_naf) && (e.etat === 'actif' || (e.date_fermeture && e.date_fermeture >= depuis)))
    .map((e) => ({
      siret: e.siret, siren: e.siren, nom: nomDe(e), enseigne: e.enseigne || null, naf: e.code_naf, ei: estEI(e),
      ouvert: e.date_creation || null, ferme: e.etat === 'actif' ? null : e.date_fermeture || null, actif: e.etat === 'actif',
      lat: e.lat, lon: e.lon,
    }))
    .sort((a, b) => String(a.ouvert || '').localeCompare(String(b.ouvert || '')));
}

// Le successeur s'immatricule souvent avant que la fermeture du prédécesseur soit enregistrée (KFC ouvert neuf mois
// avant la radiation d'EXKI au même numéro, Lyon) : un chevauchement de moins d'un an est une succession, pas deux cellules.
export const CHEVAUCHEMENT_MOIS = 12;

/** Pure : la fin effective de chaque exploitant, ramenée à l'ouverture de son successeur quand ils se chevauchent de peu. */
export function finsEffectives(exploitants, { aujourdhui = new Date() } = {}) {
  const fin = jourISO(aujourdhui);
  const tol = CHEVAUCHEMENT_MOIS * 30.44 * 86400000;
  return exploitants.map((x) => {
    const ferme = x.ferme ? new Date(x.ferme).getTime() : null;
    if (!ferme) return { ...x, fin_effective: fin };
    const successeur = exploitants
      .filter((y) => y !== x && y.siren !== x.siren && y.ouvert && new Date(y.ouvert).getTime() > new Date(x.ouvert || 0).getTime() && ferme - new Date(y.ouvert).getTime() >= 0 && ferme - new Date(y.ouvert).getTime() <= tol)
      .sort((a, b) => String(a.ouvert).localeCompare(String(b.ouvert)))[0];
    return { ...x, fin_effective: successeur ? successeur.ouvert : x.ferme };
  });
}

/**
 * Pure : combien de cellules au même numéro. Deux exploitants ouverts en même temps occupent deux locaux : le nombre
 * de cellules est le plus grand nombre d'exploitants simultanés, sur leurs fins effectives (finsEffectives).
 */
export function cellulesEstimees(exploitants, { aujourdhui = new Date() } = {}) {
  const evenements = [];
  for (const x of finsEffectives(exploitants, { aujourdhui })) {
    evenements.push([x.ouvert || '0000-00-00', 1]);
    evenements.push([x.fin_effective, -1]);
  }
  evenements.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let courant = 0; let max = 0;
  for (const [, d] of evenements) { courant += d; if (courant > max) max = courant; }
  return Math.max(1, max);
}

/** Pure : la rotation d'une adresse sur dix ans, et ce qu'elle veut dire. */
export function rotationDe(exploitants, { aujourdhui = new Date() } = {}) {
  const sirens = new Set(exploitants.map((x) => x.siren));
  const n = sirens.size;
  const cellules = cellulesEstimees(exploitants, { aujourdhui });
  const parCellule = Math.round((n / cellules) * 10) / 10;
  // La durée de chaque exploitant, dans la fenêtre de dix ans seulement : une banque ouverte depuis 1980 ne compte pas 46 ans.
  const debutFenetre = aujourdhui.getTime() - ANS * 365.25 * 86400000;
  const durees = exploitants.map((x) => {
    const a = x.ouvert ? Math.max(new Date(x.ouvert).getTime(), debutFenetre) : null;
    const b = x.ferme ? new Date(x.ferme).getTime() : aujourdhui.getTime();
    return a ? (b - a) / (365.25 * 86400000) : null;
  }).filter((d) => d != null && d >= 0);
  const dureeMoyenne = durees.length ? Math.round((durees.reduce((t, d) => t + d, 0) / durees.length) * 10) / 10 : null;
  const fermes = exploitants.filter((x) => x.ferme).length;
  let verdict; let statut;
  if (n >= DOMICILIATION) { verdict = `${n} entreprises en dix ans : adresse de domiciliation ou galerie, la rotation ne se lit pas`; statut = 'vide'; }
  else if (!n) { verdict = 'Aucun exploitant à vitrine connu à ce numéro en dix ans'; statut = 'vide'; }
  else if (parCellule <= 2) { verdict = `${n} exploitant${n > 1 ? 's' : ''} en dix ans${cellules > 1 ? ` pour ${cellules} cellules` : ''} : local stable`; statut = 'ok'; }
  else if (parCellule <= 3) { verdict = `${n} exploitants en dix ans${cellules > 1 ? ` pour ${cellules} cellules` : ''} : rotation à surveiller`; statut = 'a_voir'; }
  else { verdict = `${n} exploitants en dix ans${cellules > 1 ? ` pour ${cellules} cellules` : ''} : forte rotation, le local a du mal à garder un commerce`; statut = 'alerte'; }
  return { exploitants_10_ans: n, cellules_estimees: cellules, par_cellule: parCellule, fermetures: fermes, duree_moyenne_ans: dureeMoyenne, verdict, statut };
}

/**
 * Pure : les cellules de la rue, une par numéro (et indice), avec leurs occupants, leur état au registre et leur
 * marque. `index` : l'index des marques (enseignes-autour.js). Les adresses de domiciliation sont mises à part.
 */
export function cellulesDeLaRue(etablissements, voie, { aujourdhui = new Date(), index = null } = {}) {
  const parCle = new Map();
  for (const e of etablissements) {
    const cle = cleLocal(e.adresse);
    if (!cle || voieDe(cle) !== voie) continue;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(e);
  }
  const cellules = []; const domiciliations = [];
  for (const [cle, es] of parCle) {
    const exploitants = exploitantsDe(es, { aujourdhui });
    if (!exploitants.length) continue;
    const rot = rotationDe(exploitants, { aujourdhui });
    const ouverts = exploitants.filter((x) => x.actif);
    const pts = exploitants.filter((x) => Number.isFinite(x.lat));
    const marques = ouverts.map((x) => (index ? marqueDuNom(x.enseigne || x.nom, index) : null)).filter(Boolean);
    const c = {
      cle, numero: numeroDe(cle), adresse: cle,
      lat: pts.length ? pts.reduce((t, x) => t + x.lat, 0) / pts.length : null, lon: pts.length ? pts.reduce((t, x) => t + x.lon, 0) / pts.length : null,
      etat: ouverts.length ? 'occupe' : 'vacant',
      occupants: ouverts.map((x) => ({ nom: x.nom, naf: x.naf, depuis: x.ouvert, ei: x.ei })),
      dernier: !ouverts.length ? (() => { const d = [...exploitants].sort((a, b) => String(b.ferme).localeCompare(String(a.ferme)))[0]; return { nom: d.nom, naf: d.naf, ferme_le: d.ferme }; })() : null,
      enseigne_nationale: marques.length ? marques[0].n : null,
      rotation: rot,
      historique: exploitants.map(({ nom, naf, ouvert, ferme, ei }) => ({ nom, naf, ouvert, ferme, ei })),
    };
    if (rot.exploitants_10_ans >= DOMICILIATION) domiciliations.push(c); else cellules.push(c);
  }
  cellules.sort((a, b) => a.numero - b.numero || a.cle.localeCompare(b.cle));
  return { cellules, domiciliations };
}

/** Pure : ce que la rue dit d'elle-même. */
export function resumeDeLaRue(cellules) {
  const ouvertes = cellules.filter((c) => c.etat === 'occupe');
  const vides = cellules.filter((c) => c.etat === 'vacant');
  const nationales = ouvertes.filter((c) => c.enseigne_nationale);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
  const rotations = cellules.map((c) => c.rotation.par_cellule).filter((x) => x > 0);
  const rotationMoyenne = rotations.length ? Math.round((rotations.reduce((t, x) => t + x, 0) / rotations.length) * 10) / 10 : null;
  return {
    cellules: cellules.length, ouvertes: ouvertes.length, vides: vides.length,
    vacance_registre_pct: pct(vides.length, cellules.length),
    enseignes_nationales: nationales.length, part_enseignes_pct: pct(nationales.length, ouvertes.length),
    noms_enseignes: [...new Set(nationales.map((c) => c.enseigne_nationale))].slice(0, 12),
    rotation_moyenne: rotationMoyenne,
    fiable: cellules.length >= PARAMETRES_TAUX.locaux_min_taux,
  };
}

/** Pure : où est le local dans sa rue : son tronçon, le poids du tronçon, l'enseigne nationale la plus proche. */
export function positionDuLocal(cellules, cleLocalCible, point) {
  const pour = cellules.map((c) => ({ cle: c.cle, lat: c.lat, lon: c.lon, etat: c.etat === 'occupe' ? 'occupe' : 'vacant' }));
  const troncons = decouperEnTroncons(pour).map((t) => ({ rang: t.rang, du: t.du, au: t.au, locaux: t.locaux, occupes: t.occupes, vacants: t.vacants, taux: t.taux, longueur_m: t.longueur_m, cles: t.cles }));
  const mien = troncons.find((t) => t.cles.includes(cleLocalCible)) || null;
  const densites = troncons.map((t) => t.occupes);
  const maxDensite = densites.length ? Math.max(...densites) : 0;
  let placeTroncon = null;
  if (mien && troncons.length > 1) {
    const rang = [...troncons].sort((a, b) => b.occupes - a.occupes).findIndex((t) => t.rang === mien.rang) + 1;
    placeTroncon = { rang_sur: troncons.length, rang, mot: rang === 1 ? 'le cœur commerçant de la rue' : rang <= Math.ceil(troncons.length / 2) ? 'dans la partie commerçante' : 'en retrait du cœur commerçant' };
  }
  let enseigneProche = null;
  if (point) {
    const nat = cellules.filter((c) => c.enseigne_nationale && Number.isFinite(c.lat) && c.cle !== cleLocalCible)
      .map((c) => ({ nom: c.enseigne_nationale, adresse: c.cle, distance_m: distanceM(point, c) })).sort((a, b) => a.distance_m - b.distance_m);
    enseigneProche = nat[0] || null;
  }
  return { troncon: mien ? { ...mien, cles: undefined } : null, troncons: troncons.map(({ cles, ...t }) => t), place: placeTroncon, max_densite: maxDensite, enseigne_proche: enseigneProche };
}

// --- Le passage : une note sur 10, et son pourquoi --------------------------------------------------------------------

/**
 * Pure : la note de passage. Pas un comptage : la densité de ce qui fait venir du monde, puis ce que montrent les
 * photos. `rue` : resumeDeLaRue ; `position` : positionDuLocal ; `transports` : { genres: [...], lourd } ;
 * `voie` : le type de voie (piétonne, principale…) ; `vues` : la lecture des photos Street View.
 */
export function notePassage({ rue = null, position = null, transports = null, voie = null, vues = null } = {}) {
  const pourquoi = []; const parts = {};
  // 1. Les commerces ouverts sur le tronçon du local, en absolu : quatorze ouverts font le plein (0 à 3,5). Une rue
  //    de moins de quatre cellules connues ne note pas : on ne sait rien de son passage.
  const t = position?.troncon;
  if (t && (rue?.cellules ?? 0) >= 4) {
    parts.troncon = Math.min(3.5, Math.round(t.occupes * 0.25 * 10) / 10);
    pourquoi.push(`${t.occupes} commerce${t.occupes > 1 ? 's' : ''} ouvert${t.occupes > 1 ? 's' : ''} sur le tronçon du ${t.du} au ${t.au}${position.place ? ` (${position.place.mot})` : ''}`);
  } else if ((rue?.cellules ?? 0) >= 4 && rue?.ouvertes != null) {
    parts.troncon = Math.min(3.5, rue.ouvertes * 0.25);
    pourquoi.push(`${rue.ouvertes} commerce${rue.ouvertes > 1 ? 's' : ''} ouvert${rue.ouvertes > 1 ? 's' : ''} dans la rue`);
  }
  // 2. Les enseignes nationales : elles choisissent les rues qui passent (0 à 2).
  if (rue?.enseignes_nationales != null && (rue?.cellules ?? 0) >= 4) {
    parts.enseignes = Math.min(2, rue.enseignes_nationales * 0.5);
    pourquoi.push(rue.enseignes_nationales ? `${rue.enseignes_nationales} enseigne${rue.enseignes_nationales > 1 ? 's' : ''} nationale${rue.enseignes_nationales > 1 ? 's' : ''} dans la rue (${rue.noms_enseignes.slice(0, 4).join(', ')})` : 'aucune enseigne nationale dans la rue');
  }
  // 3. Les transports à 300 m (0 à 1,5).
  if (transports) {
    const n = (transports.genres || []).length;
    parts.transports = Math.min(1.5, n * 0.5 + (transports.lourd ? 0.5 : 0));
    pourquoi.push(n ? `à 300 m : ${transports.genres.join(', ')}` : 'aucun transport en commun à 300 m');
  }
  // 4. Le type de voie (0 à 1).
  if (voie) {
    const v = String(voie).toLowerCase();
    parts.voie = /piéton|pieton/.test(v) ? 1 : /principale|primaire|secondaire|avenue|boulevard/.test(v) ? 0.6 : 0.3;
    pourquoi.push(`voie : ${voie}`);
  }
  // 5. Ce que montrent les photos (0 à 2), lues par le modèle : piétons, trottoirs, rideaux baissés.
  if (vues?.impression_passage != null) {
    parts.vues = Math.round((Math.max(0, Math.min(10, vues.impression_passage)) / 10) * 2 * 10) / 10;
    pourquoi.push(`Street View (${vues.date || 'date inconnue'}) : ${vues.pourquoi || `impression ${vues.impression_passage}/10`}`);
  }
  const lues = Object.keys(parts);
  if (!lues.length) return null;
  // Les parties absentes ne pénalisent pas : la note se rapporte à ce qui a pu être lu.
  const maxParts = { troncon: 3.5, enseignes: 2, transports: 1.5, voie: 1, vues: 2 };
  const total = lues.reduce((s, k) => s + parts[k], 0);
  const max = lues.reduce((s, k) => s + maxParts[k], 0);
  const note = Math.round((total / max) * 10 * 2) / 2;
  const manque = Object.keys(maxParts).filter((k) => !lues.includes(k));
  // Avec deux lectures sur cinq, la note est provisoire : elle le dit.
  const confiance = lues.length >= 5 ? 'haute' : lues.length >= 3 ? 'moyenne' : 'basse';
  return { note, parts, pourquoi, manque, confiance, statut: note >= 7 ? 'ok' : note >= 4.5 ? 'a_voir' : 'alerte' };
}

/** Pure : la conclusion de l'outil, en une phrase. */
export function conclusionRue({ rotation = null, rue = null, passage = null, local = null } = {}) {
  const raisons = [];
  let points = 0; let n = 0;
  if (passage?.note != null) { n += 1; points += passage.note >= 7 ? 1 : passage.note >= 4.5 ? 0.5 : 0; raisons.push(`passage ${String(passage.note).replace('.', ',')}/10`); }
  if (rotation && rotation.statut !== 'vide') { n += 1; points += rotation.statut === 'ok' ? 1 : rotation.statut === 'a_voir' ? 0.5 : 0; raisons.push(rotation.statut === 'ok' ? 'local stable' : rotation.statut === 'a_voir' ? 'rotation à surveiller' : 'forte rotation du local'); }
  if (rue?.fiable && rue.vacance_registre_pct != null) { n += 1; points += rue.vacance_registre_pct < 10 ? 1 : rue.vacance_registre_pct < 20 ? 0.5 : 0; raisons.push(`${rue.vacance_registre_pct} % de cellules vides au registre`); }
  if (local?.etat === 'vacant') raisons.push('le local est vide aujourd’hui');
  if (!n) return { statut: 'vide', phrase: 'Pas assez de données pour conclure.', raisons };
  // Un seul critère lu ne fait pas une conclusion : on le dit, et on le montre.
  if (n === 1) return { statut: 'a_voir', phrase: `Trop peu lu pour trancher : ${raisons[0]}. À constater à la visite.`, raisons };
  const part = points / n;
  const statut = part >= 0.75 ? 'ok' : part >= 0.4 ? 'a_voir' : 'alerte';
  const phrase = statut === 'ok' ? 'Oui : un commerce peut vivre ici, et le suivant aussi.' : statut === 'a_voir' ? 'Plutôt oui, avec des réserves : à constater à la visite.' : 'Difficile : la rue ou le local ne retiennent pas les commerces.';
  return { statut, phrase, raisons };
}

// --- Les lectures extérieures ---------------------------------------------------------------------------------------

const TRANSPORTS = { subway_station: 'métro', light_rail_station: 'tramway', train_station: 'gare', bus_station: 'gare routière', transit_station: 'arrêt', bus_stop: 'bus' };
async function transportsAutour(lat, lon) {
  const k = (process.env.GOOGLE_MAPS_SERVEUR || '').trim();
  if (!k) return null;
  const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'places.displayName,places.primaryType' },
    body: JSON.stringify({ includedTypes: Object.keys(TRANSPORTS), maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'fr', locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 300 } } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Google Places a répondu ${r.status}`);
  const genres = new Set();
  let lourd = false;
  for (const p of (await r.json()).places || []) { const g = TRANSPORTS[p.primaryType]; if (g) genres.add(g); if (['subway_station', 'light_rail_station', 'train_station'].includes(p.primaryType)) lourd = true; }
  return { genres: [...genres], lourd, source: 'Google Maps' };
}

async function typeDeVoie(lat, lon) {
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'user-agent': 'Klocka/1.0 (sourcing@klocka.immo)', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: `[out:json][timeout:10];way(around:25,${lat},${lon})[highway];out tags 10;` }).toString(),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Overpass a répondu ${r.status}`);
  const { voiesDe } = await import('../emplacement-auto.js');
  const voies = voiesDe((await r.json()).elements);
  const TYPES = { pedestrian: 'rue piétonne', living_street: 'zone de rencontre', primary: 'voie principale', secondary: 'voie secondaire', tertiary: 'voie tertiaire', residential: 'rue résidentielle', unclassified: 'voie locale', footway: 'passage piéton', trunk: 'voie rapide' };
  const noms = [...new Set(voies.map((v) => v.nom).filter(Boolean))];
  return { type: TYPES[voies[0]?.type] || voies[0]?.type || null, angle: noms.length >= 2, voies: noms.slice(0, 3) };
}

const CONSIGNE_RUE = `Tu regardes une photo Street View prise le long d'une rue en France. Tu dois dire si cette rue est passante.
Réponds en JSON strict, sans commentaire, avec ces clés :
- "pietons" : le nombre de piétons visibles, entier
- "trottoir" : "large", "moyen", "etroit" ou "absent"
- "pietonne" : true si la rue est réservée aux piétons
- "vitrines_actives" : le nombre de vitrines de commerces ouverts visibles, entier
- "rideaux_baisses" : le nombre de rideaux baissés ou vitrines vides visibles, entier
- "terrasses" : true si des terrasses de café ou de restaurant sont visibles
- "circulation" : "dense", "moyenne", "faible" ou "nulle"
- "impression_passage" : ta note de 1 à 10 sur le passage piéton probable de cette rue en journée, d'après ce que tu vois (largeur, vitrines, piétons, mobilier urbain, propreté), pas d'après le nom de la ville
- "pourquoi" : une phrase de vingt mots au plus qui dit ce qui t'a fait donner cette note
- "confiance" : "haute", "moyenne" ou "basse"
Ne devine pas ce que tu ne vois pas : null vaut mieux qu'une invention. Une photo ancienne ou prise la nuit baisse la confiance.`;

const CONSIGNE_LOCAL = `Tu regardes la photo Street View d'une devanture en France. Réponds en JSON strict, sans commentaire :
- "local_occupe" : true si la devanture paraît occupée par un commerce, false si elle paraît vide (rideau baissé, vitrine vide, « à louer »), null si on ne voit pas de devanture
- "enseigne_lue" : le nom lisible sur la façade, ou null
- "activite" : le type de commerce en deux ou trois mots, ou null
- "angle" : true si la devanture fait l'angle de deux rues
- "etat" : "soigne", "correct", "degrade" ou null
- "confiance" : "haute", "moyenne" ou "basse"
Ne devine pas ce que tu ne vois pas.`;

const lireJson = (brut) => {
  const texte = typeof brut === 'string' ? brut : brut?.text || brut?.texte || JSON.stringify(brut);
  return JSON.parse(texte.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
};

/** Les deux photos Street View (vers le local, le long de la rue), leur lecture par le modèle, et les fichiers gardés. */
async function lireStreetView(adresse, { dossier, cle, lireImage = null }) {
  const SV = await import('../alx/streetview.js');
  if (!SV.streetViewConfigure()) return { ok: false, error: "Street View n'est pas configuré sur ce serveur." };
  const pano = await SV.panoramaDeLaRue({ lat: adresse.lat, lon: adresse.lon, rue: adresse.rue }).catch(() => null)
    || await SV.priseProche(adresse.lat, adresse.lon, { rayon: 50 }).catch(() => null);
  if (!pano?.pano) return { ok: false, error: 'Aucune prise de vue Street View à cette adresse.' };
  const cap = pano.cap ?? 0;
  const [versLocal, leLong] = await Promise.all([SV.photo(null, { pano: pano.pano, cap, largeur: 800, hauteur: 500 }), SV.photo(null, { pano: pano.pano, cap: (cap + 90) % 360, largeur: 800, hauteur: 500 })]);
  fs.mkdirSync(dossier, { recursive: true });
  const fichiers = { local: `${cle}-local.jpg`, rue: `${cle}-rue.jpg` };
  fs.writeFileSync(path.join(dossier, fichiers.local), versLocal);
  fs.writeFileSync(path.join(dossier, fichiers.rue), leLong);
  // Deux lectures, une par photo (pas de bibliothèque d'image pour les coller) ; chacune est comptée dans les coûts.
  const lire = lireImage || (async (image, prompt, nom) => {
    const { generateFromDocument } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    const { resultat } = await mesurer({ operation: 'lire le passage sur Street View' }, () => generateFromDocument({ buffer: image, mimetype: 'image/jpeg', prompt, nom }));
    return resultat;
  });
  const erreurs = [];
  const [rue, local] = await Promise.all([
    lire(leLong, CONSIGNE_RUE, `rue-${cle}`).then(lireJson).catch((e) => { erreurs.push(`rue : ${e?.message || e}`); return null; }),
    lire(versLocal, CONSIGNE_LOCAL, `local-${cle}`).then(lireJson).catch((e) => { erreurs.push(`local : ${e?.message || e}`); return null; }),
  ]);
  const lecture = rue || local ? { ...(rue || {}), ...(local || {}) } : null;
  return { ok: true, date: pano.date || null, pano: pano.pano, cap, meme_rue: pano.meme_rue ?? null, fichiers, lecture, erreur: erreurs.join(' ; ') || null };
}

/**
 * Pure : la rue reconnue par la BAN est-elle une autre que celle écrite ? On compare le dernier mot significatif de
 * chacune (« Dumas » / « Aiguier ») ; une abréviation, un article ou un prénom omis ne comptent pas. Rend
 * { ecrite } quand elles diffèrent, null sinon ou quand le texte n'a pas de nom de rue lisible.
 */
export function rueDifferente(texte, rueReconnue) {
  const n = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const VIDES = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'pl', 'cours', 'crs', 'quai', 'chemin', 'allee', 'allees', 'impasse', 'route', 'rte', 'square', 'passage', 'du', 'de', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'bis', 'ter', 'saint', 'sainte', 'st', 'ste', 'general', 'gal', 'marechal', 'mal', 'docteur', 'dr', 'president', 'grand', 'grande', 'petit', 'petite']);
  const mots = (t) => n(t).split(' ').filter((m) => m && !/^\d/.test(m) && !VIDES.has(m));
  const partieRue = String(texte || '').split(',')[0].replace(/\b\d{5}\b.*$/, '');
  const e = mots(partieRue); const r = mots(rueReconnue);
  if (!e.length || !r.length) return null;
  const dernierE = e[e.length - 1]; const dernierR = r[r.length - 1];
  const proche = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
  if (proche(dernierE, dernierR) || r.some((m) => proche(m, dernierE)) || e.some((m) => proche(m, dernierR))) return null;
  return { ecrite: partieRue.replace(/^\s*\d+\s*(bis|ter)?\s*/i, '').trim() };
}

// --- L'analyse entière ------------------------------------------------------------------------------------------------

const cleDe = (label) => String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * L'analyse d'une adresse. Gardée sept jours ; `forcer` relit tout. `lireImage` sert aux tests.
 * @returns {Promise<{ok: true, id, resultat} | {ok: false, error}>}
 */
export async function analyserRue(texte, { forcer = false, user = null, lireImage = null, aujourdhui = new Date() } = {}) {
  const { resoudreAdresse } = await import('../adresse-ban.js');
  let adresse;
  try { adresse = await resoudreAdresse(texte); } catch (e) {
    // La BAN en panne (502, 504) : la dernière lecture de la même adresse écrite, si elle a moins d'une semaine.
    const norme = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const ecrite = norme(texte);
    const garde = !forcer && Records.filter(ENTITE, {}).filter((x) => x.version === VERSION && [x.resultat?.adresse?.ecrite, x.adresse].some((a) => a && norme(a) === ecrite) && Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (garde) return { ok: true, id: garde.id, resultat: { ...garde.resultat, note_analyste: garde.note_analyste || null, du_cache: true } };
    return { ok: false, error: e?.message || String(e) };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  if (!adresse.numero) return { ok: false, error: `Il faut un numéro dans la rue pour lire le local : « ${adresse.label} » n'en a pas.` };
  // La BAN remplace parfois la rue écrite par une voisine qui lui ressemble (« avenue Auguste Dumas » devenue « avenue
  // Auguste Aiguier », Toulon) : on lit quand même, mais on le dit en tête, et la conclusion ne tranche pas.
  const ecart = rueDifferente(texte, adresse.rue);
  const cle = cleDe(adresse.label);
  if (!forcer) {
    const recent = Records.filter(ENTITE, { cle }).filter((x) => x.version === VERSION && Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, id: recent.id, resultat: { ...recent.resultat, note_analyste: recent.note_analyste || null, du_cache: true } };
  }
  const manques = [];
  const registre = await registreDeLaCommune(adresse.code_insee, { forcer }).catch((e) => ({ ok: false, error: e?.message || String(e) }));
  if (!registre.ok) return { ok: false, error: `Le registre SIRENE de ${adresse.ville} ne se lit pas : ${registre.error}` };
  const voie = voieDuNom(adresse.rue);
  const index = indexDesMarques();
  const { cellules, domiciliations } = cellulesDeLaRue(registre.etablissements, voie, { aujourdhui, index });
  const cleCible = cleLocal(`${adresse.numero} ${adresse.rue}`);
  const local = cellules.find((c) => c.cle === cleCible) || domiciliations.find((c) => c.cle === cleCible) || null;
  // Sans point SIRENE, la BAN donne celui de l'adresse ; les cellules sans point ne pèsent pas dans les tronçons.
  const point = { lat: adresse.lat, lon: adresse.lon };
  const rue = resumeDeLaRue(cellules);
  const position = positionDuLocal(cellules, cleCible, point);
  const [transports, voieLue, vues] = await Promise.all([
    transportsAutour(adresse.lat, adresse.lon).then((t) => t || { absent: "Google Maps n'est pas configuré" }).catch((e) => ({ absent: e?.message || String(e) })).then((t) => { if (t?.absent) { manques.push(`transports : ${t.absent}`); return null; } return t; }),
    typeDeVoie(adresse.lat, adresse.lon).catch((e) => { manques.push(`type de voie : ${e?.message || e}`); return null; }),
    lireStreetView(adresse, { dossier: path.join(UPLOAD_DIR, 'rue'), cle, lireImage }).catch((e) => ({ ok: false, error: e?.message || String(e) })),
  ]);
  if (!vues.ok) manques.push(`Street View : ${vues.error}`);
  else if (vues.erreur) manques.push(`lecture des photos : ${vues.erreur}`);
  const lecture = vues.ok ? vues.lecture : null;
  const passage = notePassage({ rue, position, transports, voie: voieLue?.type || null, vues: lecture ? { ...lecture, date: vues.date } : null });
  const rotation = local ? local.rotation : rotationDe([], { aujourdhui });
  const conclusion = ecart
    ? { statut: 'vide', phrase: `Adresse à vérifier : vous avez écrit « ${ecart.ecrite} », la Base Adresse Nationale a reconnu « ${adresse.rue} ».`, raisons: conclusionRue({ rotation, rue, passage, local }).raisons }
    : conclusionRue({ rotation, rue, passage, local });
  if (ecart) manques.push(`adresse : rue écrite « ${ecart.ecrite} », rue reconnue « ${adresse.rue} »`);
  const resultat = {
    version: VERSION, adresse: { label: adresse.label, ecrite: String(texte || '').trim(), rue_differente: !!ecart, numero: adresse.numero, rue: adresse.rue, ville: adresse.ville, code_insee: adresse.code_insee, lat: adresse.lat, lon: adresse.lon }, voie,
    local: local ? { ...local, angle: voieLue?.angle || lecture?.angle || false, voies_angle: voieLue?.voies || [] } : { cle: cleCible, etat: 'inconnu', occupants: [], historique: [], rotation, angle: voieLue?.angle || false },
    rue: { ...rue, cellules: cellules.map(({ historique, ...c }) => ({ ...c, exploitants_10_ans: c.rotation.exploitants_10_ans, rotation: undefined })), domiciliations: domiciliations.map((d) => ({ cle: d.cle, entreprises: d.rotation.exploitants_10_ans })), source: registre.source },
    position, transports, voie_type: voieLue?.type || null,
    street_view: vues.ok ? { date: vues.date, photos: { local: `/uploads/rue/${vues.fichiers.local}`, rue: `/uploads/rue/${vues.fichiers.rue}` }, lecture, meme_rue: vues.meme_rue } : null,
    passage, conclusion, manques,
    le: new Date().toISOString(), par: user?.email || null,
  };
  const rec = Records.create(ENTITE, { cle, version: VERSION, adresse: adresse.label, resultat, le: resultat.le, par: resultat.par }, user?.email);
  return { ok: true, id: rec.id, resultat: { ...resultat, note_analyste: null } };
}

/**
 * Les établissements ouverts ou fermés depuis dix ans au numéro exact, d'après le registre seul (ni photo ni passage) :
 * l'outil Locataire y reconnaît le preneur, qui pour une franchise est la société du franchisé, pas l'enseigne.
 */
export async function occupantsDuLocal(texte, { aujourdhui = new Date() } = {}) {
  const { resoudreAdresse } = await import('../adresse-ban.js');
  const adresse = await resoudreAdresse(texte);
  if (!adresse?.numero) return { ok: false, error: 'Adresse sans numéro ou introuvable dans la Base Adresse Nationale.' };
  const cible = cleLocal(`${adresse.numero} ${adresse.rue}`);
  const depuis = jourISO(new Date(aujourdhui.getTime() - ANS * 365.25 * 86400000));
  // Le stock local se lit au seul numéro du local (une requête, quelques lignes) : charger toute la commune prenait 19 s
  // à Lyon 2e. Toutes les activités comptent ici : le preneur peut être une banque ou un bureau.
  let registre;
  if (communeChargee(adresse.code_insee)) {
    const lignes = db.prepare('SELECT * FROM entrepot_sirene WHERE commune = ? AND numero = ?').all(adresse.code_insee, String(adresse.numero).replace(/\D.*$/, ''))
      .filter((x) => x.etat === 'A' || String(x.date_debut || '') >= depuis);
    registre = { ok: true, source: 'Stock SIRENE géolocalisé (INSEE)', etablissements: lignes.map((x) => { const l = lireEtablissementVacance(versApi(x)); return l ? { ...l, categorie_juridique: x.categorie_juridique || null } : null; }).filter(Boolean) };
  } else registre = await registreDeLaCommune(adresse.code_insee);
  if (!registre.ok) return { ok: false, error: registre.error };
  const exploitants = registre.etablissements
    .filter((e) => cleLocal(e.adresse) === cible && (e.etat === 'actif' || (e.date_fermeture && e.date_fermeture >= depuis)))
    .map((e) => ({ siret: e.siret, siren: e.siren, nom: nomDe(e), enseigne: e.enseigne || null, denomination: e.denomination || null, naf: e.code_naf, actif: e.etat === 'actif', ouvert: e.date_creation || null }));
  return { ok: true, adresse: adresse.label, source: registre.source, exploitants };
}

/** La note de passage de l'analyste, qui remplace celle du calcul à l'écran ; vide, on revient au calcul. */
export function noterPassage(id, { note, commentaire = '' } = {}, user = null) {
  const r = Records.get(ENTITE, id);
  if (!r) return { ok: false, error: 'Analyse introuvable' };
  const n = note === null || note === '' ? null : Math.max(0, Math.min(10, Math.round(Number(note) * 2) / 2));
  const note_analyste = n == null && !commentaire ? null : { note: n, commentaire: String(commentaire || '').slice(0, 600), par: user?.email || null, le: new Date().toISOString() };
  Records.update(ENTITE, id, { note_analyste });
  return { ok: true, note_analyste };
}

export function lireAnalyse(id) {
  const r = Records.get(ENTITE, id);
  return r ? { ok: true, id: r.id, resultat: { ...r.resultat, note_analyste: r.note_analyste || null } } : { ok: false, error: 'Analyse introuvable' };
}
