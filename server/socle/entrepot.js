// L'entrepôt de données (18 oct. 2026, lot 1 de la boîte à outils de Haka, fondation F3).
//
// Chaque jeu de données importé l'est avec sa source, son millésime, sa date d'import et sa licence, commune
// par commune, en commençant par les Alpes-Maritimes (décision du 18 oct.). Un import planifié tourne la
// nuit sur Render (ou BOITE_IMPORTS=1), derrière l'interrupteur de la boîte à outils ; un import raté le
// dit à l'équipe par une notification. Chaque jeu passe par l'interrupteur de sa source.
//
// Jeux importés ici : la liste des communes (API Géo), les ventes de locaux commerciaux (DVF), les
// contours IRIS (Géoplateforme), et les établissements et annonces SIRENE et BODACC (le chargeur des
// Signaux de vacance, tables vacance_*). Les autres jeux du plan (cadastre, personnes morales, carreaux
// Filosofi, équipements, horaires de transport, Géorisques) se lisent à la demande, par local, et sont
// inscrits au registre comme tels : leur import en masse vient avec l'outil qui en a besoin.

import db from '../db.js';
import { viaSource, sourceActive } from './registre-sources.js';
import { boiteOutilsActive } from './drapeaux.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS entrepot_jeu (
    cle TEXT NOT NULL, commune TEXT NOT NULL, millesime TEXT, importe_le TEXT, lignes INTEGER,
    statut TEXT NOT NULL, erreur TEXT, PRIMARY KEY (cle, commune)
  );
  CREATE TABLE IF NOT EXISTS entrepot_commune (
    code TEXT PRIMARY KEY, nom TEXT, departement TEXT, codes_postaux TEXT, population INTEGER, bbox TEXT
  );
  CREATE TABLE IF NOT EXISTS entrepot_dvf (
    id_mutation TEXT PRIMARY KEY, commune TEXT NOT NULL, date TEXT, prix REAL, surface REAL, prix_m2 REAL,
    parcelle TEXT, lots INTEGER, adresse TEXT, lat REAL, lon REAL, millesime TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entrepot_dvf_commune ON entrepot_dvf(commune);
  CREATE TABLE IF NOT EXISTS entrepot_iris (
    code_iris TEXT PRIMARY KEY, commune TEXT NOT NULL, nom TEXT, type TEXT, geometrie TEXT, millesime TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entrepot_iris_commune ON entrepot_iris(commune);
`);

const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const WFS = 'https://data.geopf.fr/wfs/ows';
export const DEPARTEMENTS = ['06'];

/**
 * Les jeux de données. `mode` : « import » (chargé la nuit, commune par commune) ou « demande » (lu au
 * moment où un local ou un outil en a besoin, puis gardé). `rythme_jours` : l'âge au-delà duquel on
 * réimporte.
 */
export const JEUX = [
  { cle: 'communes', nom: 'Communes du département', source: 'ban', licence: 'Licence ouverte', mode: 'import', portee: 'departement', rythme_jours: 90 },
  { cle: 'dvf', nom: 'Ventes de locaux commerciaux (DVF géolocalisées)', source: 'dvf', licence: 'Licence ouverte', mode: 'import', portee: 'commune', rythme_jours: 30 },
  { cle: 'iris', nom: 'Contours IRIS', source: 'iris_ign', licence: 'Licence ouverte', mode: 'import', portee: 'commune', rythme_jours: 180 },
  { cle: 'sirene_bodacc', nom: 'Établissements SIRENE et annonces BODACC', source: 'sirene', licence: 'Licence ouverte', mode: 'import', portee: 'commune', rythme_jours: 7 },
  { cle: 'cadastre', nom: 'Parcelles cadastrales', source: 'cadastre_ign', licence: 'Licence ouverte', mode: 'demande', portee: 'local' },
  { cle: 'troncons', nom: 'Tronçons de route (BD TOPO)', source: 'bdtopo', licence: 'Licence ouverte', mode: 'demande', portee: 'local' },
  { cle: 'carreaux', nom: 'Carreaux de 200 m (Filosofi)', source: 'insee_filosofi', licence: 'Licence ouverte', mode: 'demande', portee: 'local' },
  { cle: 'personnes_morales', nom: 'Locaux des personnes morales', source: 'majic', licence: 'Licence ouverte', mode: 'demande', portee: 'section' },
  { cle: 'ilc', nom: 'Indice des loyers commerciaux', source: 'ilc', licence: 'Licence ouverte', mode: 'demande', portee: 'national' },
];

const maintenant = () => new Date().toISOString();

function noter(cle, commune, { statut, millesime = null, lignes = null, erreur = null }) {
  db.prepare(`INSERT INTO entrepot_jeu (cle, commune, millesime, importe_le, lignes, statut, erreur) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cle, commune) DO UPDATE SET millesime = excluded.millesime, importe_le = excluded.importe_le, lignes = excluded.lignes, statut = excluded.statut, erreur = excluded.erreur`)
    .run(cle, commune, millesime, maintenant(), lignes, statut, erreur);
}

/** Pure : un import est-il à refaire ? */
export function aRefaire(etat, rythmeJours, now = Date.now()) {
  if (!etat || etat.statut !== 'ok' || !etat.importe_le) return true;
  return now - Date.parse(etat.importe_le) > rythmeJours * 86400000;
}

// --- Les importeurs ----------------------------------------------------------------------------

async function importerCommunes(departement) {
  const r = await fetch(`https://geo.api.gouv.fr/departements/${departement}/communes?fields=code,nom,codesPostaux,population,bbox`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`API Géo ${r.status}`);
  const communes = await r.json();
  const ins = db.prepare('INSERT OR REPLACE INTO entrepot_commune (code, nom, departement, codes_postaux, population, bbox) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => { for (const c of communes) ins.run(c.code, c.nom, departement, JSON.stringify(c.codesPostaux || []), c.population ?? null, JSON.stringify(c.bbox || null)); })();
  return { lignes: communes.length, millesime: maintenant().slice(0, 10) };
}

async function importerDvf(commune) {
  const { telechargerFichiers, lireCsv, ventesCommerciales, departementDe } = await import('../dvf.js');
  const millesimes = await telechargerFichiers(departementDe(commune.code), commune.code);
  if (!millesimes.length) return { lignes: 0, millesime: null };
  const { ventes } = ventesCommerciales(millesimes.flatMap((m) => lireCsv(m.texte)));
  const millesime = millesimes.map((m) => m.annee).sort().join(',');
  const ins = db.prepare(`INSERT OR REPLACE INTO entrepot_dvf (id_mutation, commune, date, prix, surface, prix_m2, parcelle, lots, adresse, lat, lon, millesime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.transaction(() => { for (const v of ventes) ins.run(v.id, commune.code, v.date, v.prix, v.surface, v.prix_m2, v.parcelle, v.lots, v.adresse, v.lat, v.lon, millesime); })();
  return { lignes: ventes.length, millesime };
}

async function importerIris(commune) {
  const bbox = JSON.parse(commune.bbox || 'null')?.coordinates?.[0];
  if (!bbox) throw new Error('Emprise de la commune inconnue.');
  const lons = bbox.map((p) => p[0]); const lats = bbox.map((p) => p[1]);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: 'STATISTICALUNITS.IRIS:contours_iris',
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '1000',
    BBOX: `${Math.min(...lons)},${Math.min(...lats)},${Math.max(...lons)},${Math.max(...lats)},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`Géoplateforme ${r.status}`);
  const iris = ((await r.json()).features || []).filter((f) => f.properties?.code_insee === commune.code);
  const ins = db.prepare('INSERT OR REPLACE INTO entrepot_iris (code_iris, commune, nom, type, geometrie, millesime) VALUES (?, ?, ?, ?, ?, ?)');
  const millesime = maintenant().slice(0, 10);
  db.transaction(() => { for (const f of iris) ins.run(f.properties.code_iris, commune.code, f.properties.nom_iris || null, f.properties.type_iris || null, JSON.stringify(f.geometry), millesime); })();
  return { lignes: iris.length, millesime };
}

async function importerSireneBodacc(commune) {
  const cp = JSON.parse(commune.codes_postaux || '[]')[0];
  if (!cp) throw new Error('Code postal inconnu.');
  const { chargerZone } = await import('../outils/vacance.js');
  const r = await chargerZone({ code_commune: commune.code, code_postal: cp, nom: commune.nom }, { delta: true });
  if (r && r.ok === false) throw new Error(r.error || 'chargement SIRENE/BODACC raté');
  const n = db.prepare('SELECT count(*) AS n FROM vacance_signal WHERE zone = ?').get(commune.code)?.n ?? null;
  return { lignes: n, millesime: maintenant().slice(0, 10) };
}

const IMPORTEURS = { dvf: importerDvf, iris: importerIris, sirene_bodacc: importerSireneBodacc };

/** Importe un jeu pour une commune (ou le département pour « communes »), à travers l'interrupteur de sa source. */
export async function importer(cleJeu, cibleCode) {
  const jeu = JEUX.find((j) => j.cle === cleJeu);
  if (!jeu || jeu.mode !== 'import') return { ok: false, error: `Jeu inconnu ou lu à la demande : ${cleJeu}` };
  if (!sourceActive(jeu.source)) { noter(cleJeu, cibleCode, { statut: 'coupee' }); return { ok: false, coupee: true }; }
  const appel = cleJeu === 'communes'
    ? () => importerCommunes(cibleCode)
    : () => {
      const commune = db.prepare('SELECT * FROM entrepot_commune WHERE code = ?').get(cibleCode);
      if (!commune) throw new Error(`Commune ${cibleCode} absente : importer d'abord les communes.`);
      return IMPORTEURS[cleJeu](commune);
    };
  const r = await viaSource(jeu.source, appel);
  if (r.ok && r.valeur) { noter(cleJeu, cibleCode, { statut: 'ok', ...r.valeur }); return { ok: true, ...r.valeur }; }
  noter(cleJeu, cibleCode, { statut: 'echec', erreur: r.panne || 'rien reçu' });
  return { ok: false, error: r.panne || 'rien reçu' };
}

/** L'état de l'entrepôt : par jeu, combien de communes à jour, en échec, à faire. */
export function etatEntrepot() {
  const lignes = db.prepare('SELECT * FROM entrepot_jeu').all();
  const communes = db.prepare('SELECT count(*) AS n FROM entrepot_commune').get().n;
  return JEUX.map((j) => {
    const l = lignes.filter((x) => x.cle === j.cle);
    return {
      ...j,
      a_jour: l.filter((x) => x.statut === 'ok' && !aRefaire(x, j.rythme_jours || 3650)).length,
      echecs: l.filter((x) => x.statut === 'echec').map((x) => ({ commune: x.commune, erreur: x.erreur, le: x.importe_le })),
      dernier_import: l.map((x) => x.importe_le).sort().pop() || null,
      lignes: l.reduce((s, x) => s + (x.lignes || 0), 0),
      attendu: j.mode !== 'import' ? null : j.portee === 'departement' ? DEPARTEMENTS.length : communes,
    };
  });
}

/**
 * Un passage d'import : les communes d'abord, puis, jeu par jeu, les communes à refaire, les plus
 * peuplées d'abord, `max` imports au plus. Un échec notifie l'équipe une fois par jour et par jeu.
 */
export async function passerImports({ max = 30 } = {}) {
  const bilan = { faits: 0, echecs: 0 };
  for (const dep of DEPARTEMENTS) {
    const etat = db.prepare('SELECT * FROM entrepot_jeu WHERE cle = ? AND commune = ?').get('communes', dep);
    if (aRefaire(etat, 90)) { const r = await importer('communes', dep); r.ok ? bilan.faits++ : bilan.echecs++; }
  }
  const communes = db.prepare('SELECT * FROM entrepot_commune ORDER BY population DESC').all().filter((c) => DEPARTEMENTS.includes(c.departement));
  for (const jeu of JEUX.filter((j) => j.mode === 'import' && j.portee === 'commune')) {
    for (const c of communes) {
      if (bilan.faits + bilan.echecs >= max) return bilan;
      const etat = db.prepare('SELECT * FROM entrepot_jeu WHERE cle = ? AND commune = ?').get(jeu.cle, c.code);
      if (!aRefaire(etat, jeu.rythme_jours)) continue;
      const r = await importer(jeu.cle, c.code);
      if (r.ok) bilan.faits++;
      else if (!r.coupee) {
        bilan.echecs++;
        const { notifier } = await import('../notifications.js');
        notifier({ titre: `Import raté : ${jeu.nom}`, texte: `${c.nom} (${c.code}) : ${r.error || 'erreur inconnue'}.`, genre: 'alerte', cle: `import:${jeu.cle}:${maintenant().slice(0, 10)}` });
      }
    }
  }
  return bilan;
}

/** La nuit, de 1 h à 6 h (Paris), toutes les quinze minutes : sur Render ou BOITE_IMPORTS=1, interrupteur allumé. */
export function planifierImports() {
  const permis = !!process.env.RENDER || ['1', 'true'].includes(String(process.env.BOITE_IMPORTS || '').toLowerCase());
  if (!permis || String(process.env.BOITE_IMPORTS || '') === '0') return null;
  let enCours = false;
  const tour = async () => {
    if (enCours || !boiteOutilsActive()) return;
    const heure = Number(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
    if (heure < 1 || heure >= 6) return;
    enCours = true;
    try { await passerImports(); } catch (e) { console.warn(`[entrepot] passage interrompu : ${e?.message || e}`); } finally { enCours = false; }
  };
  return setInterval(tour, 15 * 60 * 1000);
}
