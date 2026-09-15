// Le dataset d'apprentissage : des ventes réelles, lues comme on les aurait
// vues un an avant.
//
// signaux.json est une liste de règles écrites à la main, calées sur
// quarante-trois vendeurs. Pour apprendre au lieu de décréter, il faut un
// tableau : une ligne par local commercial à une date, ses variables telles
// qu'elles étaient CE JOUR-LÀ, et ce qui est arrivé dans les douze mois
// suivants. C'est ce tableau que ce module construit, et rien d'autre : le
// modèle (XGBoost + SHAP) vit dans ml/train_explainer.py, l'écran dans
// ALXEntrainement.
//
// La règle qui décide de tout : LE GEL TEMPOREL. Pour une vente conclue le
// 15 mars 2024, chaque variable est lue au 15 mars 2023 — le propriétaire au
// millésime DGFiP de 2023, ses ventes d'avant cette date, les mutations
// antérieures seulement. Une seule variable qui voit le futur, et le modèle
// « prédit » la vente à partir de la vente : c'est là que meurent la plupart
// de ces projets.
//
// Les classes négatives : pour chaque vente, trois locaux commerciaux de la
// même commune, lus à la même date, qui ne se sont PAS vendus dans les douze
// mois suivants. Le tirage est seedé : le même appel refait le même dataset.
//
// Les limites, écrites parce qu'elles décident de ce que le modèle peut dire :
//   - l'univers est celui de DVF : des locaux qui ont muté au moins une fois
//     depuis 2021. Un local jamais vendu n'y est pas ; le taux de base du
//     dataset n'est donc PAS celui du marché.
//   - le fichier DGFiP ne couvre que les personnes morales : « absent du
//     fichier » vaut « probablement une personne physique », c'est une
//     variable, pas un trou.
//   - le loyer en place et la santé financière du locataire ne sont pas
//     observables en masse à une date passée : ces colonnes n'existent pas en
//     V1, plutôt que d'exister fausses.
//
// Usage :
//   node server/alx/dataset-ml.js 33063:Bordeaux 37261:Tours
//   → ml/data/dataset.csv, ml/data/dataset-meta.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lireCommune } from './mesure-dvf.js';
import { dejaLa, lire as lirePM, parParcelle, parSiren } from './personnes-morales.js';
import { cleRue } from './commerces.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(__dirname, '..', '..');
const SORTIE = path.join(RACINE, 'ml', 'data');

const TYPE_COMMERCIAL = 'Local industriel. commercial ou assimilé';
/** En dessous, ce n'est pas une vente de murs : un euro symbolique, un garage. */
const PRIX_PLANCHER = 20000;
const JOUR_MS = 86400000;
export const HORIZON_MOIS = 12;
export const RECUL_JOURS = 365;
export const NEGATIFS_PAR_VENTE = 3;

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
// mesure-dvf.js a le sien, sans adresse ni surface : ici les deux comptent —
// la rue rattache le local à ses vitrines OSM et au BODACC, la surface est
// une variable.

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
      if (!loc.mutations.some((m) => m.id === id)) loc.mutations.push({ id, date, prix, vente, en_bloc: enBloc });
      locaux.set(cle, loc);
    }
  }
  for (const loc of locaux.values()) loc.mutations.sort((a, b) => a.date.localeCompare(b.date));
  return locaux;
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
];

/**
 * Les variables d'un local à la date T. Tout ce qui est daté est lu STRICTEMENT
 * avant T ; le propriétaire vient du millésime DGFiP de l'année de T.
 *
 * @param {object} local - de indexerLocaux
 * @param {string} T - la date de référence, AAAA-MM-JJ
 * @param {{pm: Map, ventesParParcelle: Map, rues: Map, procedures: object[]}} ctx
 */
export function featuresA(local, T, ctx) {
  const anterieures = local.mutations.filter((m) => m.date < T);
  const derniere = anterieures[anterieures.length - 1] || null;

  const f = {
    surface_bati: local.surface ?? null,
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
  };

  // Le propriétaire, au millésime de l'année de T (situation au 1er janvier).
  const annee = Number(T.slice(0, 4));
  const millesime = ctx.pm.get(annee) || null;
  if (millesime) {
    const sur = (millesime.parcelles.get(local.parcelle) || []).filter((g) => !g.droit || g.droit === 'P');
    const p = [...sur].sort((a, b) => (b.rez_de_chaussee ? 1 : 0) - (a.rez_de_chaussee ? 1 : 0) || b.locaux - a.locaux)[0] || null;
    if (p) {
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
        const la = (ctx.pm.get(a).parcelles.get(local.parcelle) || []).some((g) => g.siren === p.siren);
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
        if (autre.parcelle === local.parcelle) continue;
        ventesAilleurs += (ctx.ventesParParcelle.get(autre.parcelle) || []).filter((d) => d >= debut && d < T).length;
      }
      f.nb_ventes_autres_24m = ventesAilleurs;
      f.a_vendu_ailleurs_24m = ventesAilleurs > 0 ? 1 : 0;
    }
  }

  // La rue : ses vitrines OpenStreetMap et son rang dans la commune. Un relevé
  // d'aujourd'hui pour des dates passées — le tissu commerçant d'une rue bouge
  // lentement, le biais est faible et il est écrit.
  if (local.rue && ctx.rues) {
    const r = ctx.rues.get(cleRue(local.rue));
    if (r) { f.vitrines_rue = r.vitrines; f.rang_rue_part = r.rang_part; }
  }

  // Le BODACC de la rue : les procédures collectives dans les 18 mois avant T.
  if (local.rue && ctx.procedures) {
    const debut = plusJours(T, -548);
    const k = cleRue(local.rue);
    f.procedures_rue_18m = ctx.procedures.filter((e) => e.rue === k && e.date >= debut && e.date < T).length;
  }

  return f;
}

/**
 * Le verrou locatif : une procédure collective à CETTE adresse (rue + numéro)
 * dans les 18 mois avant T écarte l'observation — la vente d'un local dont le
 * locataire tombe n'apprend rien sur les murs occupés stables.
 */
export function verrouLocatif(local, T, procedures) {
  if (!local.rue || !local.numero || !procedures) return false;
  const debut = plusJours(T, -548);
  const k = cleRue(local.rue);
  return procedures.some((e) => e.rue === k && String(e.numero || '') === String(local.numero) && e.date >= debut && e.date < T);
}

// --- L'échantillonnage -----------------------------------------------------------

/** Le local s'est-il vendu dans les `horizon` mois qui suivent T ? */
const venduApres = (local, T, fin) => local.mutations.some((m) => m.vente && m.date >= T && m.date < fin);

/**
 * Les observations d'une commune : chaque vente fait un positif lu un an
 * avant, et `parVente` locaux de la même commune, non vendus dans l'horizon,
 * lus à la même date, font les négatifs.
 *
 * @returns {{y: number, local: object, T: string, date_vente: string|null}[]}
 */
export function echantillonner(locaux, { debut, fin, parVente = NEGATIFS_PAR_VENTE, horizonMois = HORIZON_MOIS, seed = 42 } = {}) {
  const tirage = alea(seed);
  const tous = [...locaux.values()];
  const observations = [];

  for (const local of tous) {
    for (const m of local.mutations) {
      if (!m.vente || m.date < debut || m.date > fin) continue;
      const T = plusJours(m.date, -RECUL_JOURS);
      observations.push({ y: 1, local, T, date_vente: m.date });

      // Les témoins : mêmes murs de ville, même date, pas de vente ensuite.
      const finHorizon = plusJours(T, Math.round(horizonMois * 30.44));
      const candidats = tous.filter((c) => c.cle !== local.cle && !venduApres(c, T, finHorizon));
      for (let k = 0; k < parVente && candidats.length; k += 1) {
        const i = Math.floor(tirage() * candidats.length);
        observations.push({ y: 0, local: candidats[i], T, date_vente: null });
        candidats.splice(i, 1);
      }
    }
  }
  return observations.sort((a, b) => a.T.localeCompare(b.T));
}

// --- Les sources annexes ----------------------------------------------------------

const CACHE = path.join(SORTIE, 'cache');

/** Les rues d'une commune et leurs vitrines OSM : cleRue → { vitrines, rang_part }. */
async function ruesDeLaCommune(insee, journal) {
  fs.mkdirSync(CACHE, { recursive: true });
  const fichier = path.join(CACHE, `rues-${insee}.json`);
  if (fs.existsSync(fichier)) return new Map(Object.entries(JSON.parse(fs.readFileSync(fichier, 'utf-8'))));
  const { contourDe, interroger, grouperVoies, rattacherVitrines } = await import('./osm.js');
  const zone = await contourDe(insee);
  if (!zone) { journal(`${insee} : contour introuvable, pas de variables de rue.`); return null; }
  const elements = await interroger(zone);
  const { rues } = rattacherVitrines(elements, grouperVoies(elements));
  const commercantes = rues.filter((r) => r.vitrines > 0).sort((a, b) => b.vitrines - a.vitrines);
  const table = {};
  commercantes.forEach((r, i) => { table[r.cle] = { vitrines: r.vitrines, rang_part: Math.round(((i + 1) / commercantes.length) * 100) / 100 }; });
  fs.writeFileSync(fichier, JSON.stringify(table));
  journal(`${insee} : ${commercantes.length} rues à vitrines relevées sur OpenStreetMap.`);
  return new Map(Object.entries(table));
}

/** Les procédures collectives de la commune (BODACC), datées, par rue et numéro. */
async function proceduresDeLaCommune(codesPostaux, insee, depuis, journal) {
  fs.mkdirSync(CACHE, { recursive: true });
  const fichier = path.join(CACHE, `bodacc-${insee}.json`);
  if (fs.existsSync(fichier)) return JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  const { adresseDe } = await import('../bodacc.js');
  const API = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
  const where = `familleavis="collective" and dateparution>="${depuis}" and cp in (${codesPostaux.map((c) => `"${c}"`).join(', ')})`;
  const out = [];
  for (let page = 0; page < 60; page += 1) {
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

// --- L'assemblage ------------------------------------------------------------------

/**
 * Construit le dataset des villes demandées et l'écrit en CSV.
 * @param {{insee: string, nom: string, cps?: string[]}[]} villes
 */
export async function construireDataset(villes, { seed = 42, journal = console.log } = {}) {
  const lignes = [];
  const stats = { villes: [], colonnes: COLONNES_FEATURES, seed, horizon_mois: HORIZON_MOIS, recul_jours: RECUL_JOURS, le: new Date().toISOString() };

  for (const ville of villes) {
    const dept = ville.insee.slice(0, 2);
    const { lignes: brutes, annees } = await lireCommune(ville.insee, { journal });
    const locaux = indexerLocaux(brutes);
    journal(`${ville.nom} : ${locaux.size} locaux commerciaux DVF, millésimes ${annees[0]}–${annees[annees.length - 1]}.`);

    // Les millésimes DGFiP du département : année → index.
    const pm = new Map();
    for (let a = 2019; a <= new Date().getFullYear(); a += 1) {
      if (!dejaLa(a, dept)) continue;
      const groupes = (lirePM(a, dept) || []).filter((g) => g.commune === ville.insee);
      pm.set(a, { parcelles: parParcelle(groupes), sirens: parSiren(groupes) });
    }
    if (!pm.size) journal(`${ville.nom} : AUCUN millésime personnes morales pour le ${dept} — les variables propriétaire seront vides. node server/alx/personnes-morales.js 2021 2022 2023 2024 --dept ${dept}`);
    else journal(`${ville.nom} : millésimes propriétaires ${[...pm.keys()].sort().join(', ')}.`);

    const ventesParParcelle = new Map();
    for (const l of locaux.values()) {
      for (const m of l.mutations) {
        if (!m.vente) continue;
        const liste = ventesParParcelle.get(l.parcelle) || [];
        liste.push(m.date);
        ventesParParcelle.set(l.parcelle, liste);
      }
    }

    const rues = await ruesDeLaCommune(ville.insee, journal).catch((e) => { journal(`${ville.nom} : rues non relevées (${e.message}).`); return null; });
    const procedures = await proceduresDeLaCommune(ville.cps || [], ville.insee, '2019-01-01', journal).catch((e) => { journal(`${ville.nom} : BODACC non lu (${e.message}).`); return null; });

    // La fenêtre : seulement des ventes dont le T-12 tombe dans un millésime
    // qu'on possède. Une vente de 2025 sans millésime 2024 aurait toutes ses
    // variables propriétaire vides, et ce vide serait corrélé à la date : on
    // la laisse dehors plutôt que d'apprendre ce biais.
    const anneesPm = [...pm.keys()].sort((a, b) => a - b);
    const debut = anneesPm.length ? `${anneesPm[0] + 1}-01-01` : '2022-01-01';
    const fin = anneesPm.length ? `${anneesPm[anneesPm.length - 1] + 1}-12-31` : `${new Date().getFullYear()}-12-31`;
    const observations = echantillonner(locaux, { debut, fin, seed });

    const ctx = { pm, ventesParParcelle, rues, procedures };
    let ecartees = 0;
    let posees = 0;
    for (const o of observations) {
      if (verrouLocatif(o.local, o.T, procedures)) { ecartees += 1; continue; }
      lignes.push({
        ville: ville.nom, insee: ville.insee, cle_local: o.local.cle, parcelle: o.local.parcelle,
        rue: o.local.rue, t_reference: o.T, date_vente: o.date_vente, y: o.y,
        ...featuresA(o.local, o.T, ctx),
      });
      posees += 1;
    }
    const positifs = lignes.filter((l) => l.insee === ville.insee && l.y === 1).length;
    stats.villes.push({ ...ville, locaux: locaux.size, observations: posees, positifs, negatifs: posees - positifs, ecartees_verrou: ecartees, fenetre: [debut, fin] });
    journal(`${ville.nom} : ${posees} observations (${positifs} ventes, ${posees - positifs} témoins), ${ecartees} écartées par le verrou locatif.`);
  }

  // Le CSV, colonnes stables, trous vides.
  const meta = ['ville', 'insee', 'cle_local', 'parcelle', 'rue', 't_reference', 'date_vente', 'y'];
  const entetes = [...meta, ...COLONNES_FEATURES];
  const cellule = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [entetes.join(','), ...lignes.map((l) => entetes.map((c) => cellule(l[c])).join(','))].join('\n');
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'dataset.csv'), `${csv}\n`);
  stats.total = lignes.length;
  stats.positifs = lignes.filter((l) => l.y === 1).length;
  fs.writeFileSync(path.join(SORTIE, 'dataset-meta.json'), JSON.stringify(stats, null, 2));
  journal(`Écrit : ml/data/dataset.csv (${lignes.length} lignes, ${stats.positifs} ventes) et dataset-meta.json.`);
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const CPS = { 33063: ['33000', '33100', '33200', '33300', '33800'], 37261: ['37000', '37100', '37200'] };
  const villes = process.argv.slice(2).filter((a) => a.includes(':')).map((a) => {
    const [insee, nom] = a.split(':');
    return { insee, nom, cps: CPS[insee] || [] };
  });
  if (!villes.length) {
    console.log('Usage : node server/alx/dataset-ml.js 33063:Bordeaux 37261:Tours');
    process.exit(1);
  }
  await construireDataset(villes);
}
