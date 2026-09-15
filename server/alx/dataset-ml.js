// Le dataset d'apprentissage, version univers adresse : tous les commerces
// d'une ville, vendus ou pas, lus comme on les aurait vus un an avant.
//
// La première version tirait sa population de DVF : des locaux ayant déjà
// muté depuis 2021. Le modèle apprenait dans une chambre d'écho — les
// habitudes des propriétaires récents — et ne savait rien du bailleur
// historique, celui que la prospection cherche. La population de base est
// désormais le CADASTRE : chaque parcelle qui porte au moins une vitrine
// (OpenStreetMap), rattachée par point-dans-polygone (cadastre Etalab). DVF
// ne sert plus qu'à deux choses : l'étiquette (la parcelle s'est-elle vendue
// dans les douze mois suivants ?) et l'historique de mutations d'avant.
//
// La règle qui décide de tout reste LE GEL TEMPOREL : chaque variable est
// lue à la date de référence — le propriétaire au millésime DGFiP de
// l'année, ses ventes d'avant, les mutations antérieures seulement. Une
// variable qui voit le futur, et le modèle « prédit » la vente à partir de
// la vente.
//
// Les limites, écrites parce qu'elles décident de ce que le modèle peut dire :
//   - les vitrines OSM sont celles d'AUJOURD'HUI : un commerce disparu depuis
//     la date de référence n'est plus dans la population (biais de survie,
//     faible sur deux ans, réel) ;
//   - l'étiquette est à la PARCELLE : une vente commerciale sur la parcelle
//     peut concerner un autre lot que la vitrine ;
//   - le fichier DGFiP ne couvre que les personnes morales : « absent du
//     fichier » signifie très probablement un propriétaire personne physique,
//     et c'est une variable, pas un trou ;
//   - le loyer en place et les comptes du locataire ne s'observent pas en
//     masse à une date passée : ces colonnes n'existent pas, plutôt que
//     d'exister fausses.
//
// Usage :
//   node server/alx/dataset-ml.js 33063:Bordeaux 44109:Nantes 35238:Rennes 37261:Tours 49007:Angers 21231:Dijon
//   node server/alx/dataset-ml.js --annuaire 37261:Tours   (la passe qui date l'installation des commerçants)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lireCommune } from './mesure-dvf.js';
import { dejaLa, lire as lirePM, parParcelle, parSiren } from './personnes-morales.js';
import { cleRue } from './commerces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(__dirname, '..', '..');
const SORTIE = path.join(RACINE, 'ml', 'data');
const CACHE = path.join(SORTIE, 'cache');

const TYPE_COMMERCIAL = 'Local industriel. commercial ou assimilé';
/** En dessous, ce n'est pas une vente de murs : un euro symbolique, un garage. */
const PRIX_PLANCHER = 20000;
const JOUR_MS = 86400000;
export const HORIZON_MOIS = 12;
export const RECUL_JOURS = 365;

// --- Petits outils, purs ------------------------------------------------------

/** Un générateur aléatoire seedé : le même seed refait le même dataset. */
export function alea(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plusJours = (iso, jours) => new Date(Date.parse(`${iso}T00:00:00Z`) + jours * JOUR_MS).toISOString().slice(0, 10);
const moisEntre = (avant, apres) => (Date.parse(`${apres}T00:00:00Z`) - Date.parse(`${avant}T00:00:00Z`)) / (30.44 * JOUR_MS);
const nombre = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// --- L'inventaire DVF, avec l'adresse ------------------------------------------

/**
 * Les locaux commerciaux d'une commune et leurs mutations, datées.
 * @param {object[]} lignes - les lignes DVF brutes
 */
export function indexerLocaux(lignes) {
  const parMutation = new Map();
  for (const l of lignes) {
    if (!l.id_mutation) continue;
    if (!parMutation.has(l.id_mutation)) parMutation.set(l.id_mutation, []);
    parMutation.get(l.id_mutation).push(l);
  }
  const locaux = new Map();
  for (const [id, lot] of parMutation) {
    const date = String(lot[0].date_mutation || '').slice(0, 10);
    if (!date) continue;
    const prix = nombre(lot[0].valeur_fonciere);
    const types = [...new Set(lot.map((l) => l.type_local).filter(Boolean))];
    const enBloc = lot.filter((l) => l.type_local).length > 1 || types.length > 1;
    const vente = lot[0].nature_mutation === 'Vente' && (prix == null || prix >= PRIX_PLANCHER);
    for (const l of lot) {
      if (l.type_local !== TYPE_COMMERCIAL || !l.id_parcelle) continue;
      const cle = `${l.id_parcelle}|${l.lot1_numero ? `lot ${String(l.lot1_numero).replace(/^0+/, '')}` : `${l.adresse_numero || ''}|${l.surface_reelle_bati || ''}`}`;
      const loc = locaux.get(cle) || {
        cle,
        parcelle: l.id_parcelle,
        rue: l.adresse_nom_voie || null,
        numero: String(l.adresse_numero || '') || null,
        surface: nombre(l.surface_reelle_bati),
        mutations: [],
      };
      if (!loc.mutations.some((m) => m.id === id)) loc.mutations.push({ id, date, prix, vente, en_bloc: enBloc, surface: nombre(l.surface_reelle_bati) });
      locaux.set(cle, loc);
    }
  }
  for (const loc of locaux.values()) loc.mutations.sort((a, b) => a.date.localeCompare(b.date));
  return locaux;
}

/**
 * Les mutations COMMERCIALES d'une commune, agrégées par parcelle : c'est la
 * granularité de l'univers adresse, étiquettes et historique compris.
 */
export function mutationsParParcelle(locaux) {
  const out = new Map();
  for (const l of locaux.values()) {
    const liste = out.get(l.parcelle) || [];
    for (const m of l.mutations) if (!liste.some((x) => x.id === m.id)) liste.push({ ...m });
    out.set(l.parcelle, liste);
  }
  for (const liste of out.values()) liste.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// --- Les variables, gelées à une date -------------------------------------------

/**
 * Les colonnes du dataset, dans l'ordre du CSV. Une variable qui n'est pas
 * observable rend null — jamais une valeur inventée ; XGBoost sait lire un trou.
 */
export const COLONNES_FEATURES = [
  'surface_bati',
  'mois_depuis_mutation',
  'deja_mute',
  'dernier_prix',
  'achete_en_bloc',
  'est_personne_morale',
  'forme_sci',
  'taille_portefeuille',
  'nb_locaux_proprio_parcelle',
  'rez_de_chaussee_pm',
  'detention_min_annees',
  'detention_censuree',
  'nb_ventes_autres_24m',
  'a_vendu_ailleurs_24m',
  'vitrines_rue',
  'rang_rue_part',
  'procedures_rue_18m',
  'nb_vitrines_parcelle',
  'mois_depuis_installation',
  'proximite_echeance_369',
  'age_gerant',
];

/**
 * Les variables d'un sujet (une parcelle commerçante, ou un local DVF) à la
 * date T. Tout ce qui est daté est lu STRICTEMENT avant T ; le propriétaire
 * vient du millésime DGFiP de l'année de T.
 *
 * @param {{parcelle, rue, numero, surface, mutations, vitrines_parcelle?, installation?, }} sujet
 * @param {string} T - la date de référence, AAAA-MM-JJ
 * @param {{pm: Map, ventesParParcelle: Map, rues: Map, procedures: object[], gerants?: Map}} ctx
 */
export function featuresA(sujet, T, ctx) {
  const anterieures = (sujet.mutations || []).filter((m) => m.date < T);
  const derniere = anterieures[anterieures.length - 1] || null;

  const f = {
    surface_bati: sujet.surface ?? derniere?.surface ?? null,
    mois_depuis_mutation: derniere ? Math.round(moisEntre(derniere.date, T) * 10) / 10 : null,
    deja_mute: anterieures.length ? 1 : 0,
    dernier_prix: derniere?.prix ?? null,
    achete_en_bloc: derniere ? (derniere.en_bloc ? 1 : 0) : null,
    est_personne_morale: 0,
    forme_sci: null,
    taille_portefeuille: null,
    nb_locaux_proprio_parcelle: null,
    rez_de_chaussee_pm: null,
    detention_min_annees: null,
    detention_censuree: null,
    nb_ventes_autres_24m: null,
    a_vendu_ailleurs_24m: null,
    vitrines_rue: null,
    rang_rue_part: null,
    procedures_rue_18m: null,
    nb_vitrines_parcelle: sujet.vitrines_parcelle ?? null,
    mois_depuis_installation: null,
    proximite_echeance_369: null,
    age_gerant: null,
  };

  // Le propriétaire, au millésime de l'année de T (situation au 1er janvier).
  const annee = Number(T.slice(0, 4));
  const millesime = ctx.pm.get(annee) || null;
  let proprietaire = null;
  if (millesime) {
    const sur = (millesime.parcelles.get(sujet.parcelle) || []).filter((g) => !g.droit || g.droit === 'P');
    proprietaire = [...sur].sort((a, b) => (b.rez_de_chaussee ? 1 : 0) - (a.rez_de_chaussee ? 1 : 0) || b.locaux - a.locaux)[0] || null;
    if (proprietaire) {
      const p = proprietaire;
      f.est_personne_morale = 1;
      f.forme_sci = /^(SCI|SC )/i.test(p.forme || '') || /^SCI\b/i.test(p.nom || '') ? 1 : 0;
      const portefeuille = millesime.sirens.get(p.siren) || [];
      f.taille_portefeuille = portefeuille.length || 1;
      f.nb_locaux_proprio_parcelle = p.locaux || 1;
      f.rez_de_chaussee_pm = p.rez_de_chaussee ? 1 : 0;

      // La détention : depuis combien de millésimes ce SIREN tient la parcelle,
      // sans interruption jusqu'à l'année de T. Présent dès le plus vieux
      // millésime disponible : on ne sait pas depuis quand, on le dit.
      const annees = [...ctx.pm.keys()].filter((a) => a <= annee).sort((a, b) => a - b);
      let depuis = null;
      for (const a of annees) {
        const la = (ctx.pm.get(a).parcelles.get(sujet.parcelle) || []).some((g) => g.siren === p.siren);
        depuis = la ? (depuis ?? a) : null;
      }
      if (depuis != null) {
        f.detention_min_annees = annee - depuis;
        f.detention_censuree = depuis === annees[0] ? 1 : 0;
      }

      // La rotation : ses AUTRES parcelles vendues dans les 24 mois avant T.
      const debut = plusJours(T, -730);
      let ventesAilleurs = 0;
      for (const autre of portefeuille) {
        if (autre.parcelle === sujet.parcelle) continue;
        ventesAilleurs += (ctx.ventesParParcelle.get(autre.parcelle) || []).filter((d) => d >= debut && d < T).length;
      }
      f.nb_ventes_autres_24m = ventesAilleurs;
      f.a_vendu_ailleurs_24m = ventesAilleurs > 0 ? 1 : 0;

      // L'âge du gérant : la tranche lue dans l'annuaire, AUJOURD'HUI, ramenée
      // à T. Approximation dite : si la gérance a changé depuis, on se trompe.
      const tranche = ctx.gerants?.get(p.siren);
      if (tranche?.age_median != null) {
        f.age_gerant = Math.max(18, Math.round(tranche.age_median - (new Date().getFullYear() - annee)));
      }
    }
  }

  // La rue : ses vitrines OpenStreetMap et son rang dans la commune. Un relevé
  // d'aujourd'hui pour des dates passées — le tissu commerçant d'une rue bouge
  // lentement, le biais est faible et il est écrit.
  if (sujet.rue && ctx.rues) {
    const r = ctx.rues.get(cleRue(sujet.rue));
    if (r) { f.vitrines_rue = r.vitrines; f.rang_rue_part = r.rang_part; }
  }

  // Le BODACC de la rue : les procédures collectives dans les 18 mois avant T.
  if (sujet.rue && ctx.procedures) {
    const debut = plusJours(T, -548);
    const k = cleRue(sujet.rue);
    f.procedures_rue_18m = ctx.procedures.filter((e) => e.rue === k && e.date >= debut && e.date < T).length;
  }

  // Le cycle du bail : l'établissement du commerçant, daté par l'annuaire.
  // Installé avant T seulement — un commerce créé après n'existait pas.
  if (sujet.installation && sujet.installation < T) {
    const mois = Math.round(moisEntre(sujet.installation, T));
    f.mois_depuis_installation = mois;
    // La distance à l'échéance triennale la plus proche (3/6/9 : multiples de
    // 36 mois). Zéro = pile sur une échéance, dix-huit = au milieu du cycle.
    const reste = mois % 36;
    f.proximite_echeance_369 = Math.min(reste, 36 - reste);
  }

  return f;
}

/**
 * Le verrou locatif : une procédure collective à CETTE adresse (rue + numéro)
 * dans les 18 mois avant T écarte l'observation — la vente d'un local dont le
 * locataire tombe n'apprend rien sur les murs occupés stables.
 */
export function verrouLocatif(sujet, T, procedures) {
  if (!sujet.rue || !sujet.numero || !procedures) return false;
  const debut = plusJours(T, -548);
  const k = cleRue(sujet.rue);
  return procedures.some((e) => e.rue === k && String(e.numero || '') === String(sujet.numero) && e.date >= debut && e.date < T);
}

// --- L'univers adresse -----------------------------------------------------------

/**
 * Les parcelles commerçantes : chaque vitrine OSM rattachée à sa parcelle,
 * puis une entrée par parcelle — la granularité de l'étiquette.
 *
 * @param {{lat, lon, rue, numero, enseigne}[]} vitrines
 * @param {{parcelleProche: Function}} cadastre
 */
export function parcellesCommercantes(vitrines, cadastre) {
  const out = new Map();
  let sansParcelle = 0;
  for (const v of vitrines) {
    const parcelle = cadastre.parcelleProche(v.lat, v.lon);
    if (!parcelle) { sansParcelle += 1; continue; }
    const p = out.get(parcelle) || { parcelle, rue: v.rue || null, numero: v.numero || null, vitrines_parcelle: 0, enseignes: [], installation: null };
    p.vitrines_parcelle += 1;
    if (!p.rue && v.rue) p.rue = v.rue;
    if (!p.numero && v.numero) p.numero = v.numero;
    if (v.enseigne && p.enseignes.length < 6 && !p.enseignes.includes(v.enseigne)) p.enseignes.push(v.enseigne);
    // L'installation la plus ancienne des commerces de la parcelle : le bail
    // le plus mûr est celui dont l'échéance approche.
    if (v.installation && (!p.installation || v.installation < p.installation)) p.installation = v.installation;
    out.set(parcelle, p);
  }
  return { parcelles: out, sans_parcelle: sansParcelle };
}

/**
 * Les observations de l'univers adresse : chaque parcelle commerçante, à
 * chaque date de référence, avec son étiquette — vendue ou pas dans les
 * douze mois suivants. Pas d'échantillonnage : la prévalence est celle du
 * marché, et c'est le but.
 */
export function observationsAdresse(parcellesCom, mutations, { references, horizonMois = HORIZON_MOIS } = {}) {
  const out = [];
  for (const T of references) {
    const fin = plusJours(T, Math.round(horizonMois * 30.44));
    for (const p of parcellesCom.values()) {
      const liste = mutations.get(p.parcelle) || [];
      const venteDans = liste.find((m) => m.vente && m.date >= T && m.date < fin) || null;
      out.push({ y: venteDans ? 1 : 0, sujet: { ...p, surface: null, mutations: liste }, T, date_vente: venteDans?.date || null });
    }
  }
  return out.sort((a, b) => a.T.localeCompare(b.T));
}

// --- Les sources annexes ----------------------------------------------------------

/** Le relevé OSM d'une commune : rues agrégées ET vitrines en points. */
async function osmDeLaCommune(insee, journal) {
  fs.mkdirSync(CACHE, { recursive: true });
  const fichier = path.join(CACHE, `osm-${insee}.json`);
  if (fs.existsSync(fichier)) return JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  const { contourDe, interroger, grouperVoies, rattacherVitrines, vitrineDe, distanceAuTrace } = await import('./osm.js');
  const zone = await contourDe(insee);
  if (!zone) throw new Error(`${insee} : contour introuvable.`);
  const elements = await interroger(zone);
  const voies = grouperVoies(elements);
  const { rues } = rattacherVitrines(elements, voies);
  const commercantes = rues.filter((r) => r.vitrines > 0).sort((a, b) => b.vitrines - a.vitrines);
  const tableRues = {};
  commercantes.forEach((r, i) => { tableRues[r.cle] = { vitrines: r.vitrines, rang_part: Math.round(((i + 1) / commercantes.length) * 100) / 100 }; });

  // Les vitrines en points, avec leur rue : l'adresse OSM quand elle y est,
  // la voie la plus proche à moins de trente mètres sinon.
  const vitrines = [];
  for (const e of elements) {
    const v = vitrineDe(e);
    if (!v) continue;
    let rue = v.rue || null;
    if (!rue) {
      let min = 30;
      for (const r of voies) {
        const d = distanceAuTrace(v, r.trace);
        if (d < min) { min = d; rue = r.nom; }
      }
    }
    vitrines.push({ lat: v.lat, lon: v.lon, rue, numero: e.tags?.['addr:housenumber'] || null, enseigne: v.enseigne || null, type: v.type });
  }
  const releve = { rues: tableRues, vitrines };
  fs.writeFileSync(fichier, JSON.stringify(releve));
  journal(`${insee} : ${vitrines.length} vitrines, ${commercantes.length} rues commerçantes (OSM).`);
  return releve;
}

/** Les codes postaux d'une commune, pour interroger le BODACC. */
async function codesPostaux(insee) {
  const r = await fetch(`https://geo.api.gouv.fr/communes/${insee}?fields=codesPostaux`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) return [];
  return (await r.json()).codesPostaux || [];
}

/** Les procédures collectives de la commune (BODACC), datées, par rue et numéro. */
async function proceduresDeLaCommune(insee, depuis, journal) {
  fs.mkdirSync(CACHE, { recursive: true });
  const fichier = path.join(CACHE, `bodacc-${insee}.json`);
  if (fs.existsSync(fichier)) return JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  const cps = await codesPostaux(insee);
  if (!cps.length) { journal(`${insee} : pas de codes postaux, BODACC sauté.`); return []; }
  const { adresseDe } = await import('../bodacc.js');
  const API = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
  const where = `familleavis="collective" and dateparution>="${depuis}" and cp in (${cps.map((c) => `"${c}"`).join(', ')})`;
  const out = [];
  for (let page = 0; page < 100; page += 1) {
    const r = await fetch(`${API}?${new URLSearchParams({ where, limit: '100', offset: String(page * 100), order_by: 'dateparution desc' })}`, {
      headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`Le BODACC a répondu ${r.status}.`);
    const d = await r.json();
    for (const a of d.results || []) {
      const ad = adresseDe(a);
      if (!ad?.voie) continue;
      out.push({ date: String(a.dateparution || '').slice(0, 10), rue: cleRue(ad.voie), numero: ad.numero || null });
    }
    if ((page + 1) * 100 >= (d.total_count ?? 0)) break;
  }
  fs.writeFileSync(fichier, JSON.stringify(out));
  journal(`${insee} : ${out.length} procédures collectives BODACC depuis ${depuis}.`);
  return out;
}

// --- Les passes annuaire (optionnelles, mises en cache) ----------------------------

/**
 * Date l'installation des commerçants d'une commune : pour chaque rue à
 * vitrines, les établissements actifs de l'annuaire, gardés avec leur date de
 * création. La passe est lente (une requête par rue) et se met en cache ; le
 * dataset la lit si elle est passée, et laisse la colonne vide sinon.
 */
export async function passeInstallations(insee, { journal = console.log } = {}) {
  const fichier = path.join(CACHE, `annuaire-rues-${insee}.json`);
  if (fs.existsSync(fichier)) return JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  const releve = JSON.parse(fs.readFileSync(path.join(CACHE, `osm-${insee}.json`), 'utf-8'));
  const { etablissementsRue } = await import('./annuaire.js');
  const rues = [...new Set(releve.vitrines.map((v) => v.rue).filter(Boolean))];
  const table = {};
  let faites = 0;
  for (const rue of rues) {
    try {
      const etabs = await etablissementsRue({ rue, code_commune: insee });
      table[cleRue(rue)] = etabs.map((e) => ({ numero: e.numero || null, nom: e.enseigne || e.nom || null, creation: e.creation || null }));
    } catch {
      // Une rue qui échoue reste absente : la colonne sera vide pour elle.
    }
    faites += 1;
    if (faites % 50 === 0) journal(`${insee} : ${faites}/${rues.length} rues datées à l'annuaire.`);
  }
  fs.writeFileSync(fichier, JSON.stringify(table));
  journal(`${insee} : annuaire relevé sur ${Object.keys(table).length}/${rues.length} rues.`);
  return table;
}

const simple = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** La date d'installation d'une vitrine : son établissement dans l'annuaire de sa rue. */
export function installationDe(vitrine, annuaireRues) {
  if (!vitrine.rue || !annuaireRues) return null;
  const etabs = annuaireRues[cleRue(vitrine.rue)] || [];
  const nom = simple(vitrine.enseigne);
  const candidats = etabs.filter((e) => !vitrine.numero || !e.numero || String(e.numero) === String(vitrine.numero));
  if (!candidats.length) return null;
  if (nom) {
    const mots = nom.split(' ').filter((m) => m.length > 2);
    const score = (e) => {
      const cible = simple(e.nom);
      if (!cible) return 0;
      if (cible.includes(nom) || (nom && nom.includes(cible) && cible.length > 3)) return 3;
      return mots.filter((m) => cible.includes(m)).length;
    };
    const meilleur = candidats.map((e) => [score(e), e]).sort((a, b) => b[0] - a[0])[0];
    if (meilleur && meilleur[0] >= 1) return meilleur[1].creation || null;
  }
  // Sans enseigne : un seul établissement au même numéro, on le prend.
  return vitrine.numero && candidats.length === 1 ? candidats[0].creation || null : null;
}

/**
 * L'âge des gérants des propriétaires : une requête annuaire par SIREN, en
 * cache global. On ne garde que l'âge médian des tranches — jamais une date.
 */
export async function passeGerants(sirens, { journal = console.log } = {}) {
  const fichier = path.join(CACHE, 'annuaire-sirens.json');
  const table = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf-8')) : {};
  const manquants = [...sirens].filter((s) => table[s] === undefined);
  if (!manquants.length) return table;
  const { societe } = await import('./annuaire.js');
  let faits = 0;
  for (const siren of manquants) {
    try {
      const s = await societe({ siren });
      const ages = (s?.gerants || []).map((g) => {
        const m = String(g.tranche_age || '').match(/(\d+)\s*[-–]\s*(\d+)/);
        if (m) return (Number(m[1]) + Number(m[2])) / 2;
        return /70|80|\+/.test(String(g.tranche_age || '')) ? 75 : null;
      }).filter((a) => a != null);
      table[siren] = ages.length ? { age_median: Math.round(ages.sort((a, b) => a - b)[Math.floor(ages.length / 2)]) } : null;
    } catch {
      table[siren] = null;
    }
    faits += 1;
    if (faits % 200 === 0) { fs.writeFileSync(fichier, JSON.stringify(table)); journal(`annuaire : ${faits}/${manquants.length} SIREN lus.`); }
  }
  fs.writeFileSync(fichier, JSON.stringify(table));
  journal(`annuaire : ${faits} SIREN lus, cache ${Object.keys(table).length}.`);
  return table;
}

// --- L'assemblage ------------------------------------------------------------------

/**
 * Construit le dataset des villes demandées et l'écrit en CSV.
 * @param {{insee: string, nom: string}[]} villes
 */
export async function construireDataset(villes, { seed = 42, journal = console.log } = {}) {
  const { chargerParcelles, indexerParcelles } = await import('./cadastre.js');
  const lignes = [];
  const stats = { univers: 'adresse (cadastre + vitrines OSM)', villes: [], colonnes: COLONNES_FEATURES, seed, horizon_mois: HORIZON_MOIS, recul_jours: RECUL_JOURS, le: new Date().toISOString() };

  // Le cache des gérants, s'il a été rempli par la passe annuaire.
  const fichierGerants = path.join(CACHE, 'annuaire-sirens.json');
  const gerants = fs.existsSync(fichierGerants) ? new Map(Object.entries(JSON.parse(fs.readFileSync(fichierGerants, 'utf-8')))) : new Map();

  for (const ville of villes) {
    const dept = ville.insee.slice(0, 2);
    const { lignes: brutes, annees } = await lireCommune(ville.insee, { journal });
    const locaux = indexerLocaux(brutes);
    const mutations = mutationsParParcelle(locaux);
    journal(`${ville.nom} : ${locaux.size} locaux DVF sur ${mutations.size} parcelles, millésimes ${annees[0]}–${annees[annees.length - 1]}.`);

    const pm = new Map();
    for (let a = 2019; a <= new Date().getFullYear(); a += 1) {
      if (!dejaLa(a, dept)) continue;
      const groupes = (lirePM(a, dept) || []).filter((g) => g.commune === ville.insee);
      pm.set(a, { parcelles: parParcelle(groupes), sirens: parSiren(groupes) });
    }
    const anneesPm = [...pm.keys()].sort((a, b) => a - b);
    if (!anneesPm.length) { journal(`${ville.nom} : AUCUN millésime personnes morales (${dept}) — ville sautée.`); continue; }

    const releve = await osmDeLaCommune(ville.insee, journal);
    const rues = new Map(Object.entries(releve.rues));
    const cadastre = indexerParcelles(await chargerParcelles(ville.insee, { journal }));
    const procedures = await proceduresDeLaCommune(ville.insee, '2019-01-01', journal).catch((e) => { journal(`${ville.nom} : BODACC non lu (${e.message}).`); return null; });

    // La passe annuaire, si elle est passée : chaque vitrine reçoit sa date.
    const fichierAnnuaire = path.join(CACHE, `annuaire-rues-${ville.insee}.json`);
    const annuaireRues = fs.existsSync(fichierAnnuaire) ? JSON.parse(fs.readFileSync(fichierAnnuaire, 'utf-8')) : null;
    const vitrines = releve.vitrines.map((v) => ({ ...v, installation: annuaireRues ? installationDe(v, annuaireRues) : null }));
    const datees = vitrines.filter((v) => v.installation).length;
    if (annuaireRues) journal(`${ville.nom} : ${datees}/${vitrines.length} vitrines datées par l'annuaire.`);

    const { parcelles: parcellesCom, sans_parcelle } = parcellesCommercantes(vitrines, cadastre);
    journal(`${ville.nom} : ${parcellesCom.size} parcelles commerçantes (${sans_parcelle} vitrines sans parcelle).`);

    const ventesParParcelle = new Map();
    for (const [parcelle, liste] of mutations) ventesParParcelle.set(parcelle, liste.filter((m) => m.vente).map((m) => m.date));

    // Les dates de référence : le 1er janvier de chaque millésime à partir du
    // deuxième (le premier sert de fond à la détention), tant que DVF couvre
    // les douze mois suivants.
    const derniereVente = [...mutations.values()].flat().reduce((d, m) => (m.date > d ? m.date : d), '');
    const references = anneesPm.slice(1).map((a) => `${a}-01-01`).filter((T) => plusJours(T, 366) <= derniereVente);
    const observations = observationsAdresse(parcellesCom, mutations, { references });

    const ctx = { pm, ventesParParcelle, rues, procedures, gerants };
    let ecartees = 0;
    for (const o of observations) {
      if (verrouLocatif(o.sujet, o.T, procedures)) { ecartees += 1; continue; }
      lignes.push({
        ville: ville.nom, insee: ville.insee, cle_local: o.sujet.parcelle, parcelle: o.sujet.parcelle,
        rue: o.sujet.rue, enseignes: o.sujet.enseignes.join(' · ') || null,
        t_reference: o.T, date_vente: o.date_vente, y: o.y,
        ...featuresA(o.sujet, o.T, ctx),
      });
    }
    const posees = lignes.filter((l) => l.insee === ville.insee);
    const positifs = posees.filter((l) => l.y === 1).length;
    stats.villes.push({ ...ville, parcelles_commercantes: parcellesCom.size, vitrines: vitrines.length, vitrines_datees: datees, observations: posees.length, positifs, prevalence: posees.length ? Math.round((positifs / posees.length) * 1000) / 10 : null, ecartees_verrou: ecartees, references });
    journal(`${ville.nom} : ${posees.length} observations, ${positifs} ventes (${posees.length ? Math.round((positifs / posees.length) * 100) : 0} %), ${ecartees} écartées par le verrou.`);
  }

  const meta = ['ville', 'insee', 'cle_local', 'parcelle', 'rue', 'enseignes', 't_reference', 'date_vente', 'y'];
  const entetes = [...meta, ...COLONNES_FEATURES];
  const cellule = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [entetes.join(','), ...lignes.map((l) => entetes.map((c) => cellule(l[c])).join(','))].join('\n');
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'dataset.csv'), `${csv}\n`);
  stats.total = lignes.length;
  stats.positifs = lignes.filter((l) => l.y === 1).length;
  stats.prevalence = stats.total ? Math.round((stats.positifs / stats.total) * 1000) / 10 : null;
  fs.writeFileSync(path.join(SORTIE, 'dataset-meta.json'), JSON.stringify(stats, null, 2));
  journal(`Écrit : ml/data/dataset.csv (${lignes.length} lignes, ${stats.positifs} ventes, prévalence ${stats.prevalence} %).`);
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const villes = args.filter((a) => a.includes(':')).map((a) => { const [insee, nom] = a.split(':'); return { insee, nom }; });
  if (!villes.length) {
    console.log('Usage : node server/alx/dataset-ml.js 33063:Bordeaux 44109:Nantes …  [--annuaire]');
    process.exit(1);
  }
  if (args.includes('--annuaire')) {
    // La passe lente, en deux temps et dans cet ordre : les rues de TOUTES
    // les villes d'abord (le cycle du bail), les gérants ensuite. Si la
    // seconde s'interrompt, la première est complète partout — une colonne
    // remplie pour certaines villes seulement apprendrait la ville, pas le
    // signal.
    for (const v of villes) await passeInstallations(v.insee);
    const { chargerParcelles, indexerParcelles } = await import('./cadastre.js');
    const sirens = new Set();
    for (const v of villes) {
      const dept = v.insee.slice(0, 2);
      const releve = JSON.parse(fs.readFileSync(path.join(CACHE, `osm-${v.insee}.json`), 'utf-8'));
      const cadastre = indexerParcelles(await chargerParcelles(v.insee));
      const { parcelles } = parcellesCommercantes(releve.vitrines, cadastre);
      // Seuls les propriétaires des parcelles COMMERÇANTES comptent : dater
      // toute la ville multiplierait les appels par dix pour rien.
      for (let a = 2019; a <= new Date().getFullYear(); a += 1) {
        if (!dejaLa(a, dept)) continue;
        for (const g of lirePM(a, dept) || []) if (parcelles.has(g.parcelle)) sirens.add(g.siren);
      }
    }
    console.log(`${sirens.size} SIREN propriétaires de parcelles commerçantes à dater.`);
    await passeGerants(sirens);
  }
  await construireDataset(villes);
}
