// Signaux de vacance : la base, l'ingestion par commune, la recherche.
//
// La spec prévoit toute la France en base, remplie chaque nuit. On n'a ni
// PostGIS ni le stock SIRENE national : on charge donc une COMMUNE la première
// fois qu'on y cherche (une à deux minutes, en tâche de fond, l'écran attend),
// et chaque nuit à 6 h on rafraîchit les communes déjà chargées. Une recherche
// ne lit que notre base : elle répond en moins d'une seconde.
//
// Les tables sont les trois de la spec (établissement, signal, correspondance
// NAF) plus le journal des exécutions et la liste des communes chargées. La
// clé unique du signal (source, identifiant source, SIRET) rend l'ingestion
// rejouable : deux passages ne font pas deux signaux.

import { randomUUID } from 'node:crypto';
import db from '../db.js';
import {
  PARAMETRES, NAF_CATEGORIE_DEFAUT, CATEGORIES, TYPES_SIGNAL,
  categorieDe, classerAnnonce, sirenDe, adresseAnnonce, rattacher, estDemenagement,
  boite, lireParametres, regrouper, enGeoJson,
} from './vacance-regles.js';
import { SOURCES } from './vacance-sources.js';

// Les sources réseau, remplaçables d'un bloc : un test en passe de fausses.
let sourcesCourantes = SOURCES;
export function utiliserSources(s) { sourcesCourantes = s || SOURCES; }

db.exec(`
  CREATE TABLE IF NOT EXISTS vacance_etablissement (
    siret          TEXT PRIMARY KEY,
    siren          TEXT NOT NULL,
    denomination   TEXT,
    enseigne       TEXT,
    adresse        TEXT,
    code_naf       TEXT,
    categorie_bien TEXT,
    etat           TEXT NOT NULL,
    date_fermeture TEXT,
    date_creation  TEXT,
    est_siege      INTEGER NOT NULL DEFAULT 0,
    lat            REAL,
    lon            REAL,
    geo_precision  TEXT,
    code_commune   TEXT,
    maj_le         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vac_etab_siren ON vacance_etablissement(siren);
  CREATE INDEX IF NOT EXISTS idx_vac_etab_commune ON vacance_etablissement(code_commune);

  CREATE TABLE IF NOT EXISTS vacance_signal (
    id             TEXT PRIMARY KEY,
    type_signal    TEXT NOT NULL,
    source         TEXT NOT NULL,
    source_id      TEXT NOT NULL,
    siret          TEXT NOT NULL DEFAULT '',
    siren          TEXT,
    date_signal    TEXT NOT NULL,
    categorie_bien TEXT NOT NULL,
    denomination   TEXT,
    enseigne       TEXT,
    adresse        TEXT,
    code_naf       TEXT,
    lat            REAL,
    lon            REAL,
    details        TEXT,
    url_source     TEXT,
    multi_sites    INTEGER NOT NULL DEFAULT 0,
    zone           TEXT,
    maj_le         TEXT NOT NULL,
    UNIQUE(source, source_id, siret)
  );
  CREATE INDEX IF NOT EXISTS idx_vac_signal_geo ON vacance_signal(lat, lon);
  CREATE INDEX IF NOT EXISTS idx_vac_signal_date ON vacance_signal(date_signal);
  CREATE INDEX IF NOT EXISTS idx_vac_signal_zone ON vacance_signal(zone);

  CREATE TABLE IF NOT EXISTS vacance_naf_categorie (
    prefixe   TEXT PRIMARY KEY,
    categorie TEXT NOT NULL,
    raison    TEXT
  );

  CREATE TABLE IF NOT EXISTS vacance_zone (
    code_commune  TEXT PRIMARY KEY,
    code_postal   TEXT,
    nom           TEXT,
    etat          TEXT NOT NULL,
    progression   TEXT,
    erreur        TEXT,
    chargee_le    TEXT,
    bodacc_depuis TEXT,
    demandee_le   TEXT,
    demandee_par  TEXT
  );

  CREATE TABLE IF NOT EXISTS vacance_ingestion (
    id        TEXT PRIMARY KEY,
    zone      TEXT,
    debut     TEXT NOT NULL,
    fin       TEXT,
    lues      INTEGER DEFAULT 0,
    inserees  INTEGER DEFAULT 0,
    rejetees  INTEGER DEFAULT 0,
    erreur    TEXT
  );

  CREATE TABLE IF NOT EXISTS vacance_suppression (
    source_id TEXT PRIMARY KEY,
    le        TEXT NOT NULL,
    par       TEXT,
    motif     TEXT
  );
`);

// La table de correspondance part de la spec, puis vit en base.
if (db.prepare('SELECT COUNT(*) AS n FROM vacance_naf_categorie').get().n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO vacance_naf_categorie (prefixe, categorie, raison) VALUES (?, ?, ?)');
  db.transaction(() => { for (const { prefixe, categorie } of NAF_CATEGORIE_DEFAUT) ins.run(prefixe, categorie, 'spec du 13 oct. 2026'); })();
}

const maintenant = () => new Date().toISOString();
const jour = (d = new Date()) => d.toISOString().slice(0, 10);
const ilYA = (joursAvant, depuis = new Date()) => jour(new Date(depuis.getTime() - joursAvant * 86400000));

/** La table NAF → catégorie, telle qu'elle est en base. */
export function tableNaf() {
  return db.prepare('SELECT prefixe, categorie, raison FROM vacance_naf_categorie ORDER BY prefixe').all();
}

// --- Écriture -----------------------------------------------------------------

const upsertEtab = db.prepare(`
  INSERT INTO vacance_etablissement (siret, siren, denomination, enseigne, adresse, code_naf, categorie_bien, etat, date_fermeture, date_creation, est_siege, lat, lon, geo_precision, code_commune, maj_le)
  VALUES (@siret, @siren, @denomination, @enseigne, @adresse, @code_naf, @categorie_bien, @etat, @date_fermeture, @date_creation, @est_siege, @lat, @lon, @geo_precision, @code_commune, @maj_le)
  ON CONFLICT(siret) DO UPDATE SET
    siren = excluded.siren, denomination = excluded.denomination, enseigne = excluded.enseigne, adresse = excluded.adresse,
    code_naf = excluded.code_naf, categorie_bien = excluded.categorie_bien, etat = excluded.etat, date_fermeture = excluded.date_fermeture,
    date_creation = excluded.date_creation, est_siege = excluded.est_siege,
    lat = COALESCE(excluded.lat, vacance_etablissement.lat), lon = COALESCE(excluded.lon, vacance_etablissement.lon),
    geo_precision = COALESCE(excluded.geo_precision, vacance_etablissement.geo_precision),
    code_commune = excluded.code_commune, maj_le = excluded.maj_le
`);

const upsertSignal = db.prepare(`
  INSERT INTO vacance_signal (id, type_signal, source, source_id, siret, siren, date_signal, categorie_bien, denomination, enseigne, adresse, code_naf, lat, lon, details, url_source, multi_sites, zone, maj_le)
  VALUES (@id, @type_signal, @source, @source_id, @siret, @siren, @date_signal, @categorie_bien, @denomination, @enseigne, @adresse, @code_naf, @lat, @lon, @details, @url_source, @multi_sites, @zone, @maj_le)
  ON CONFLICT(source, source_id, siret) DO UPDATE SET
    type_signal = excluded.type_signal, siren = excluded.siren, date_signal = excluded.date_signal, categorie_bien = excluded.categorie_bien,
    denomination = excluded.denomination, enseigne = excluded.enseigne, adresse = excluded.adresse, code_naf = excluded.code_naf,
    lat = excluded.lat, lon = excluded.lon, details = excluded.details, url_source = excluded.url_source,
    multi_sites = excluded.multi_sites, zone = excluded.zone, maj_le = excluded.maj_le
`);

const ecrireEtablissements = db.transaction((liste, table) => {
  const le = maintenant();
  for (const e of liste) {
    upsertEtab.run({
      siret: e.siret, siren: e.siren, denomination: e.denomination ?? null, enseigne: e.enseigne ?? null, adresse: e.adresse ?? null,
      code_naf: e.code_naf ?? null, categorie_bien: categorieDe(e.code_naf, table), etat: e.etat, date_fermeture: e.date_fermeture ?? null,
      date_creation: e.date_creation ?? null, est_siege: e.est_siege ? 1 : 0, lat: e.lat ?? null, lon: e.lon ?? null,
      geo_precision: e.geo_precision ?? null, code_commune: e.code_commune ?? null, maj_le: le,
    });
  }
});

const ecrireSignaux = db.transaction((liste) => {
  const le = maintenant();
  let n = 0;
  for (const s of liste) {
    upsertSignal.run({
      id: randomUUID(), type_signal: s.type_signal, source: s.source, source_id: String(s.source_id), siret: s.siret || '', siren: s.siren || null,
      date_signal: s.date_signal, categorie_bien: s.categorie_bien || 'autre', denomination: s.denomination ?? null, enseigne: s.enseigne ?? null,
      adresse: s.adresse ?? null, code_naf: s.code_naf ?? null, lat: s.lat ?? null, lon: s.lon ?? null,
      details: JSON.stringify(s.details || {}), url_source: s.url_source ?? null, multi_sites: s.multi_sites ? 1 : 0, zone: s.zone || null, maj_le: le,
    });
    n++;
  }
  return n;
});

const etablissementsDeSirens = (sirens) => {
  const out = new Map();
  const q = db.prepare('SELECT * FROM vacance_etablissement WHERE siren = ?');
  for (const s of sirens) out.set(s, q.all(s).map((e) => ({ ...e, est_siege: !!e.est_siege })));
  return out;
};

const supprimes = () => new Set(db.prepare('SELECT source_id FROM vacance_suppression').all().map((r) => r.source_id));

// --- Ingestion d'une commune ---------------------------------------------------

const poserZone = (z) => db.prepare(`
  INSERT INTO vacance_zone (code_commune, code_postal, nom, etat, progression, erreur, chargee_le, bodacc_depuis, demandee_le, demandee_par)
  VALUES (@code_commune, @code_postal, @nom, @etat, @progression, @erreur, @chargee_le, @bodacc_depuis, @demandee_le, @demandee_par)
  ON CONFLICT(code_commune) DO UPDATE SET
    code_postal = COALESCE(excluded.code_postal, vacance_zone.code_postal), nom = COALESCE(excluded.nom, vacance_zone.nom),
    etat = excluded.etat, progression = excluded.progression, erreur = excluded.erreur,
    chargee_le = COALESCE(excluded.chargee_le, vacance_zone.chargee_le), bodacc_depuis = COALESCE(excluded.bodacc_depuis, vacance_zone.bodacc_depuis),
    demandee_le = COALESCE(excluded.demandee_le, vacance_zone.demandee_le), demandee_par = COALESCE(excluded.demandee_par, vacance_zone.demandee_par)
`).run({ code_postal: null, nom: null, progression: null, erreur: null, chargee_le: null, bodacc_depuis: null, demandee_le: null, demandee_par: null, ...z });

export const zone = (codeCommune) => db.prepare('SELECT * FROM vacance_zone WHERE code_commune = ?').get(String(codeCommune || '')) || null;
export const zones = () => db.prepare('SELECT * FROM vacance_zone ORDER BY nom').all();

const avancer = (code, texte) => db.prepare('UPDATE vacance_zone SET progression = ? WHERE code_commune = ?').run(texte, code);

/**
 * Charge ou rafraîchit une commune : BODACC par code postal, SIRENE pour les
 * fermetures de la commune et les établissements des entreprises signalées,
 * Géoplateforme pour ce qui n'a pas de point, puis les signaux. Rejouable.
 *
 * @param {{code_commune: string, code_postal: string, nom?: string}} z
 * @param {{sources?: object, delta?: boolean}} [o]  `delta` : seulement ce qui a paru depuis le dernier passage
 */
export async function chargerZone(z, { sources = sourcesCourantes, delta = false, P = PARAMETRES } = {}) {
  const code = String(z.code_commune);
  const existante = zone(code);
  poserZone({ code_commune: code, code_postal: z.code_postal || null, nom: z.nom || null, etat: 'chargement', progression: 'Démarrage', erreur: null });
  const run = { id: randomUUID(), zone: code, debut: maintenant(), lues: 0, inserees: 0, rejetees: 0 };
  db.prepare('INSERT INTO vacance_ingestion (id, zone, debut) VALUES (?, ?, ?)').run(run.id, code, run.debut);
  const table = tableNaf();
  const progres = (t) => avancer(code, t);
  try {
    const cp = z.code_postal || existante?.code_postal;
    if (!cp) throw new Error('Code postal inconnu : le BODACC s\'interroge par code postal.');
    const horizon = ilYA(Math.round(P.mois_historique * 30.44));
    // En rafraîchissement, trois jours de recouvrement : une parution tardive n'est pas perdue, et la clé unique absorbe le doublon.
    const depuisBodacc = delta && existante?.bodacc_depuis ? ilYA(3, new Date(existante.bodacc_depuis)) : horizon;
    const depuisFermetures = delta && existante?.chargee_le ? ilYA(7, new Date(existante.chargee_le)) : horizon;

    // 1. BODACC, classé.
    progres('BODACC : lecture des annonces');
    const annonces = await sources.annoncesBodacc({ cp, depuis: depuisBodacc, surProgres: progres });
    run.lues += annonces.length;
    const exclus = supprimes();
    const bruts = [];
    for (const a of annonces) {
      if (exclus.has(a.id)) continue;
      const c = classerAnnonce(a);
      const siren = sirenDe(a);
      if (!c || !siren) { run.rejetees++; continue; }
      bruts.push({ a, c, siren });
    }

    // Ce qu'on connaît déjà et de frais : relu avant d'écrire quoi que ce soit, sinon tout paraîtrait connu.
    const connus = new Set(db.prepare(`SELECT DISTINCT siren FROM vacance_etablissement WHERE maj_le >= ?`).all(ilYA(30)).map((r) => r.siren));

    // 2. SIRENE : les fermetures de la commune.
    progres('SIRENE : fermetures de la commune');
    const fermes = await sources.fermeturesCommune(code, depuisFermetures, { surProgres: progres });
    run.lues += fermes.length;
    ecrireEtablissements(fermes, table);

    // 3. SIRENE : les établissements des entreprises signalées qu'on ne connaît pas encore.
    const sirens = [...new Set(bruts.map((b) => b.siren))];
    const manquants = sirens.filter((s) => !connus.has(s));
    const manquantsSet = new Set(manquants);
    progres(`SIRENE : ${manquants.length} entreprises à lire`);
    const lus = await sources.etablissementsParSirens(manquants, { surProgres: progres });
    run.lues += lus.length;
    ecrireEtablissements(lus, table);
    // Les frères des fermés de la commune : pour dire « déménagement » il faut connaître les ouvertures ailleurs.
    const sirensFermes = [...new Set(fermes.map((e) => e.siren))].filter((s) => !connus.has(s) && !manquantsSet.has(s));
    if (sirensFermes.length) {
      progres(`SIRENE : ${sirensFermes.length} entreprises des fermetures`);
      const freres = await sources.etablissementsParSirens(sirensFermes, { surProgres: progres });
      ecrireEtablissements(freres, table);
    }

    // 4. Géocodage de ce qui n'a pas de point et qu'un signal va porter.
    const parSiren = etablissementsDeSirens([...new Set([...sirens, ...fermes.map((e) => e.siren)])]);
    const sansPoint = [];
    for (const liste of parSiren.values()) for (const e of liste) if (e.lat == null && e.adresse && e.geo_precision !== 'commune') sansPoint.push(e);
    let geocodes = 0;
    for (const e of sansPoint.slice(0, 400)) {
      progres(`Géocodage : ${++geocodes} sur ${Math.min(400, sansPoint.length)}`);
      let g = null;
      try { g = await sources.geocoder(e.adresse); } catch { g = null; }
      if (g) { e.lat = g.lat; e.lon = g.lon; e.geo_precision = g.precision; }
      else e.geo_precision = 'commune';
      db.prepare('UPDATE vacance_etablissement SET lat = ?, lon = ?, geo_precision = ? WHERE siret = ?').run(e.lat ?? null, e.lon ?? null, e.geo_precision, e.siret);
    }

    // 5. Les signaux.
    progres('Rattachement des signaux aux locaux');
    const signaux = [];
    const sansLocal = [];
    for (const { a, c, siren } of bruts) {
      const etabs = parSiren.get(siren) || [];
      const { etablissements, multi_sites } = rattacher({ type: c.type, date: c.date }, etabs, P);
      if (!etabs.length) { sansLocal.push({ a, c, siren }); continue; }
      for (const e of etablissements) {
        if (e.lat == null) { run.rejetees++; continue; }
        signaux.push({
          type_signal: c.type, source: 'bodacc', source_id: a.id, siret: e.siret, siren, date_signal: c.date, categorie_bien: e.categorie_bien,
          denomination: e.denomination, enseigne: e.enseigne, adresse: e.adresse, code_naf: e.code_naf, lat: e.lat, lon: e.lon,
          details: { ...c.detail, commercant: a.commercant || null }, url_source: a.url_complete || null, multi_sites, zone: code,
        });
      }
    }
    // Une entreprise inconnue du registre (diffusion partielle, radiée de longue date) : l'adresse de l'annonce, géocodée, sans SIRET ni NAF.
    for (const { a, c, siren } of sansLocal) {
      if (c.type === 'transfert_siege') { run.rejetees++; continue; }
      const adresse = adresseAnnonce(a);
      let g = null;
      try { g = adresse ? await sources.geocoder(adresse) : null; } catch { g = null; }
      if (!g) { run.rejetees++; continue; }
      signaux.push({
        type_signal: c.type, source: 'bodacc', source_id: a.id, siret: '', siren, date_signal: c.date, categorie_bien: 'autre',
        denomination: a.commercant || null, adresse, lat: g.lat, lon: g.lon,
        details: { ...c.detail, commercant: a.commercant || null, sans_registre: true }, url_source: a.url_complete || null, multi_sites: false, zone: code,
      });
    }
    for (const e of fermes) {
      const ici = db.prepare('SELECT * FROM vacance_etablissement WHERE siret = ?').get(e.siret);
      if (!ici || ici.lat == null || !ici.date_fermeture) { run.rejetees++; continue; }
      const freres = (parSiren.get(e.siren) || []).filter((f) => f.siret !== e.siret);
      signaux.push({
        type_signal: 'fermeture', source: 'sirene', source_id: e.siret, siret: e.siret, siren: e.siren, date_signal: ici.date_fermeture, categorie_bien: ici.categorie_bien,
        denomination: ici.denomination, enseigne: ici.enseigne, adresse: ici.adresse, code_naf: ici.code_naf, lat: ici.lat, lon: ici.lon,
        details: { demenagement: estDemenagement(ici, freres, P), est_siege: !!ici.est_siege },
        url_source: `https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}`, multi_sites: false, zone: code,
      });
    }
    run.inserees = ecrireSignaux(signaux);

    poserZone({ code_commune: code, etat: 'prete', progression: null, erreur: null, chargee_le: maintenant(), bodacc_depuis: jour() });
    db.prepare('UPDATE vacance_ingestion SET fin = ?, lues = ?, inserees = ?, rejetees = ? WHERE id = ?').run(maintenant(), run.lues, run.inserees, run.rejetees, run.id);
    console.log(`[vacance] ${z.nom || code} : ${annonces.length} annonces, ${fermes.length} fermetures, ${run.inserees} signaux écrits, ${run.rejetees} écartés`);
    return { ok: true, ...run };
  } catch (e) {
    const message = e?.message || String(e);
    // Une commune déjà chargée garde ses données ; une première lecture ratée se redemande.
    poserZone({ code_commune: code, etat: existante?.chargee_le ? 'prete' : 'erreur', progression: null, erreur: message });
    db.prepare('UPDATE vacance_ingestion SET fin = ?, lues = ?, inserees = ?, rejetees = ?, erreur = ? WHERE id = ?').run(maintenant(), run.lues, run.inserees, run.rejetees, message, run.id);
    console.warn(`[vacance] ${z.nom || code} : ${message}`);
    return { ok: false, error: message, ...run };
  }
}

// Une seule ingestion à la fois : les quotas de SIRENE sont par clé, pas par commune.
let file = Promise.resolve();
const enCours = new Set();

/** Demande le chargement d'une commune, en tâche de fond. Rend tout de suite. */
export function demanderZone(z, { par = null, delta = false } = {}) {
  const code = String(z.code_commune);
  if (enCours.has(code)) return zone(code);
  enCours.add(code);
  poserZone({ code_commune: code, code_postal: z.code_postal || null, nom: z.nom || null, etat: 'chargement', progression: 'En attente', erreur: null, demandee_le: maintenant(), demandee_par: par });
  file = file.then(() => chargerZone(z, { delta })).catch(() => {}).finally(() => enCours.delete(code));
  return zone(code);
}

// --- Recherche --------------------------------------------------------------------

/**
 * Les signaux autour d'un point, dans notre base. Si la commune n'est pas
 * chargée, la demande part et la réponse dit d'attendre.
 *
 * @param {object} q  lon, lat, rayon_m, categories, types, date_min, date_max, commune, cp, nom
 * @param {{par?: string}} [o]
 */
export function rechercher(q, { par = null } = {}) {
  const p = lireParametres(q);
  if (!p.ok) return { ok: false, statut: 400, error: p.error };
  const code = String(q.commune || '').trim();
  if (!code) return { ok: false, statut: 400, error: 'Commune inconnue : choisissez l\'adresse dans les propositions.' };
  let z = zone(code);
  if (!z || (z.etat === 'erreur' && !z.chargee_le)) {
    if (z?.etat === 'erreur' && !q.relancer) return { ok: false, statut: 502, error: z.erreur || 'Le chargement de la commune a échoué.', zone: z };
    z = demanderZone({ code_commune: code, code_postal: q.cp, nom: q.nom }, { par });
  }
  if (z.etat === 'chargement' && !z.chargee_le) return { ok: true, statut: 202, etat: 'chargement', zone: z };

  const b = boite(p.lat, p.lon, p.rayon_m);
  const lignes = db.prepare(`
    SELECT * FROM vacance_signal
    WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
  `).all(b.lat_min, b.lat_max, b.lon_min, b.lon_max);
  const r = regrouper(lignes.map((l) => ({ ...l, siret: l.siret || null })), p);
  return { ok: true, statut: 200, ...enGeoJson(r, { code_commune: z.code_commune, nom: z.nom, code_postal: z.code_postal, chargee_le: z.chargee_le, etat: z.etat, erreur: z.erreur }), parametres: p };
}

/** Ce que l'écran et le Suivi lisent : communes, dernières exécutions, table NAF, référentiel des filtres. */
export function etat() {
  return {
    zones: zones(),
    executions: db.prepare('SELECT * FROM vacance_ingestion ORDER BY debut DESC LIMIT 30').all(),
    signaux: db.prepare('SELECT COUNT(*) AS n FROM vacance_signal').get().n,
    etablissements: db.prepare('SELECT COUNT(*) AS n FROM vacance_etablissement').get().n,
    naf: tableNaf(),
    categories: CATEGORIES,
    types: TYPES_SIGNAL,
    parametres: PARAMETRES,
  };
}

/**
 * Une demande de suppression de la DILA : le signal part, et l'identifiant
 * reste dans un journal pour qu'il ne revienne pas à la prochaine ingestion.
 */
export function supprimerSignal(sourceId, { par = null, motif = null } = {}) {
  const id = String(sourceId || '').trim();
  if (!id) return { ok: false, error: 'Identifiant manquant.' };
  const n = db.prepare('DELETE FROM vacance_signal WHERE source_id = ?').run(id).changes;
  db.prepare('INSERT OR REPLACE INTO vacance_suppression (source_id, le, par, motif) VALUES (?, ?, ?, ?)').run(id, maintenant(), par, motif);
  return { ok: true, supprimes: n };
}

/**
 * Reclasse tout ce qui est en base d'après la table NAF du moment : la table
 * se corrige sans déploiement, et les signaux déjà écrits doivent suivre.
 */
export const reclasser = db.transaction(() => {
  const table = tableNaf();
  let changes = 0;
  for (const t of ['vacance_etablissement', 'vacance_signal']) {
    const maj = db.prepare(`UPDATE ${t} SET categorie_bien = ? WHERE rowid = ?`);
    for (const r of db.prepare(`SELECT rowid, code_naf, categorie_bien FROM ${t} WHERE code_naf IS NOT NULL`).all()) {
      const c = categorieDe(r.code_naf, table);
      if (c !== r.categorie_bien) { maj.run(c, r.rowid); changes++; }
    }
  }
  return changes;
});

/** La correspondance NAF, modifiable sans déploiement : un préfixe, une catégorie. Tout est reclassé aussitôt. */
export function poserNaf(prefixe, categorie, raison = null) {
  const p = String(prefixe || '').replace(/\./g, '').trim();
  if (!p || !CATEGORIES.some((c) => c.cle === categorie)) return { ok: false, error: 'Préfixe ou catégorie invalide.' };
  db.prepare('INSERT OR REPLACE INTO vacance_naf_categorie (prefixe, categorie, raison) VALUES (?, ?, ?)').run(p, categorie, raison);
  return { ok: true, reclasses: reclasser(), naf: tableNaf() };
}

/** Chaque nuit vers 6 h (Paris), sur Render ou si VACANCE_NUIT=true : les communes déjà chargées sont rafraîchies. */
export function planifier() {
  if (!process.env.RENDER && process.env.VACANCE_NUIT !== 'true') return null;
  let dernierJour = null;
  const tour = () => {
    const d = new Date();
    const heure = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(d)) % 24;
    const j = d.toISOString().slice(0, 10);
    if (heure < 6 || dernierJour === j) return;
    dernierJour = j;
    for (const z of zones().filter((x) => x.chargee_le)) demanderZone(z, { delta: true });
  };
  const t = setInterval(tour, 30 * 60_000);
  t.unref?.();
  return t;
}
